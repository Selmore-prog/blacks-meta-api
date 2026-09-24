const { test } = require('node:test');
const assert = require('node:assert/strict');
const users = require('../src/teamUsers');
const legacy = require('../src/teamPortal');
const owner = require('../src/ownerSession');

test('la sesión administradora está firmada y vence', () => {
  const now = Date.now();
  const token = owner.createToken(now);
  assert.equal(owner.verifyToken(token, now + 1000), true);
  assert.equal(owner.verifyToken(`${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`, now + 1000), false);
  assert.equal(owner.verifyToken(token, now + 31 * 86400 * 1000), false);
});

test('las cuentas usan mail normalizado y claves con hash verificable', async () => {
  assert.equal(users.normalizeEmail('  Persona@Empresa.COM  '), 'persona@empresa.com');
  assert.throws(() => users.normalizeEmail('correo-invalido'));
  const hash = await users.hashPassword('una-clave-de-prueba-2026');
  assert.match(hash, /^scrypt\$32768\$8\$3\$/);
  assert.equal(await users.verifyPassword('una-clave-de-prueba-2026', hash), true);
  assert.equal(await users.verifyPassword('otra-clave-de-prueba-2026', hash), false);
  assert.ok(!hash.includes('una-clave-de-prueba-2026'));
});

test('los permisos individuales niegan por defecto rutas y operaciones no concedidas', () => {
  const account = { sections: users.normalizeSections({ calendar: true, works: false, products: false }), must_change_password: false };
  assert.equal(users.allows(account, 'GET', '/api/team/calendar'), true);
  assert.equal(users.allows(account, 'POST', '/api/calendar'), false);
  assert.equal(users.allows(account, 'POST', '/api/flash/activate'), false);
  assert.equal(users.allows(account, 'GET', '/api/products/analytics'), false);
  assert.equal(users.allows({ ...account, must_change_password: true }, 'GET', '/api/team/calendar'), false);
  assert.equal(users.allows({ ...account, sections: { ...account.sections, works: true } }, 'POST', '/api/works'), true);
  assert.equal(legacy.permite({ enabled: true, sections: { works: true, products: true } }, 'GET', '/api/team/calendar'), false);
});
