const crypto = require('crypto');
const { promisify } = require('util');
const pool = require('./db');
const config = require('./config');
const legacy = require('./teamPortal');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'blacks_user';
const SESSION_DAYS = 7;
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const SECTIONS = {
  calendar: { label: 'Calendario', help: 'Ver la planificación, los borradores y los guiones. Sólo lectura.' },
  products: { label: 'Productos', help: 'Ver ventas y stock del catálogo. Sólo lectura.' },
  works: { label: 'Trabajos con bordado', help: 'Cargar, editar y borrar fotos de trabajos.' },
};
const ROUTES = {
  calendar: [['GET', /^\/api\/team\/calendar$/]],
  products: legacy.SECTIONS.products.rutas,
  works: legacy.SECTIONS.works.rutas,
};

let schemaReady;
function ensureSchema() {
  if (!schemaReady) schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS team_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      sections JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true,
      must_change_password BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS team_user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES team_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS team_user_sessions_user_id_idx ON team_user_sessions(user_id);
  `).catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Ingresá un mail válido.'); err.status = 400; throw err;
  }
  return email;
}

function normalizeSections(value) {
  return Object.fromEntries(Object.keys(SECTIONS).map((id) => [id, value?.[id] === true]));
}

function catalog() {
  return Object.entries(SECTIONS).map(([id, item]) => ({ id, ...item }));
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    const err = new Error('La contraseña debe tener entre 12 y 256 caracteres.'); err.status = 400; throw err;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, encoded] = parts;
  const expected = Buffer.from(encoded, 'hex');
  if (expected.length !== 32) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem };
  if (params.N !== SCRYPT.N || params.r !== SCRYPT.r || params.p !== SCRYPT.p) return false;
  const actual = await scrypt(String(password || ''), salt, 32, params);
  return crypto.timingSafeEqual(actual, expected);
}

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readToken(req) {
  const item = String(req.headers.cookie || '').split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE}=`));
  const value = item?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function sessionCookie(token) {
  const secure = String(config.publicBaseUrl || '').startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Strict${secure}`;
}

function clearCookie() {
  const secure = String(config.publicBaseUrl || '').startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

async function sessionFor(req) {
  const token = readToken(req);
  if (!token) return null;
  await ensureSchema();
  const hash = tokenHash(token);
  const { rows } = await pool.query(`SELECT u.id, u.email, u.sections, u.must_change_password
    FROM team_user_sessions s JOIN team_users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`, [hash]);
  if (!rows[0]) return null;
  return { ...rows[0], sections: normalizeSections(rows[0].sections), tokenHash: hash };
}

async function login(emailInput, password) {
  await ensureSchema();
  let email;
  try { email = normalizeEmail(emailInput); } catch (_) { return null; }
  const { rows } = await pool.query('SELECT * FROM team_users WHERE email = $1 AND active = true', [email]);
  const user = rows[0];
  if (!user) {
    await scrypt(String(password || ''), 'blacks-unknown-account', 32, SCRYPT);
    return null;
  }
  if (!await verifyPassword(password, user.password_hash)) return null;
  await pool.query('DELETE FROM team_user_sessions WHERE expires_at <= now()');
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO team_user_sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, now() + interval '7 days')`, [tokenHash(token), user.id]);
  return {
    cookie: sessionCookie(token),
    user: { email: user.email, sections: normalizeSections(user.sections), mustChangePassword: user.must_change_password },
  };
}

async function logout(req) {
  const token = readToken(req);
  if (token) await pool.query('DELETE FROM team_user_sessions WHERE token_hash = $1', [tokenHash(token)]);
  return clearCookie();
}

function allows(user, method, path) {
  if (!user || user.must_change_password) return false;
  return Object.entries(ROUTES).some(([id, routes]) => user.sections[id] &&
    routes.some(([allowedMethod, pattern]) => allowedMethod === String(method).toUpperCase() && pattern.test(path)));
}

async function listUsers() {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT id, email, sections, active, must_change_password, created_at, updated_at
    FROM team_users ORDER BY active DESC, email ASC`);
  return rows.map((row) => ({ ...row, sections: normalizeSections(row.sections) }));
}

function temporaryPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

async function createUser(emailInput, sectionsInput) {
  await ensureSchema();
  const email = normalizeEmail(emailInput);
  const sections = normalizeSections(sectionsInput);
  if (!Object.values(sections).some(Boolean)) {
    const err = new Error('Elegí al menos una sección.'); err.status = 400; throw err;
  }
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  let rows;
  try {
    ({ rows } = await pool.query(`INSERT INTO team_users (email, password_hash, sections)
      VALUES ($1, $2, $3::jsonb) RETURNING id, email, sections, active, must_change_password, created_at, updated_at`,
      [email, hash, JSON.stringify(sections)]));
  } catch (err) {
    if (err.code === '23505') { const duplicate = new Error('Ese mail ya tiene una cuenta.'); duplicate.status = 409; throw duplicate; }
    throw err;
  }
  return { user: { ...rows[0], sections }, temporaryPassword: password };
}

async function updateUser(id, { sections, active }) {
  await ensureSchema();
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) { const err = new Error('Usuario inválido.'); err.status = 400; throw err; }
  const set = [];
  const values = [userId];
  if (sections !== undefined) { values.push(JSON.stringify(normalizeSections(sections))); set.push(`sections = $${values.length}::jsonb`); }
  if (active !== undefined) { values.push(active === true); set.push(`active = $${values.length}`); }
  if (!set.length) { const err = new Error('No hay cambios para guardar.'); err.status = 400; throw err; }
  const { rows } = await pool.query(`UPDATE team_users SET ${set.join(', ')}, updated_at = now()
    WHERE id = $1 RETURNING id, email, sections, active, must_change_password, created_at, updated_at`, values);
  if (!rows[0]) { const err = new Error('No existe ese usuario.'); err.status = 404; throw err; }
  if (active === false) await pool.query('DELETE FROM team_user_sessions WHERE user_id = $1', [userId]);
  return { ...rows[0], sections: normalizeSections(rows[0].sections) };
}

async function resetPassword(id) {
  await ensureSchema();
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) { const err = new Error('Usuario inválido.'); err.status = 400; throw err; }
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const { rows } = await pool.query(`UPDATE team_users SET password_hash = $2, must_change_password = true,
    updated_at = now() WHERE id = $1 RETURNING id`, [userId, hash]);
  if (!rows[0]) { const err = new Error('No existe ese usuario.'); err.status = 404; throw err; }
  await pool.query('DELETE FROM team_user_sessions WHERE user_id = $1', [userId]);
  return { temporaryPassword: password };
}

async function changePassword(user, currentPassword, newPassword) {
  await ensureSchema();
  const { rows } = await pool.query('SELECT password_hash FROM team_users WHERE id = $1 AND active = true', [user.id]);
  if (!rows[0] || !await verifyPassword(currentPassword, rows[0].password_hash)) {
    const err = new Error('La contraseña actual no coincide.'); err.status = 400; throw err;
  }
  const hash = await hashPassword(newPassword);
  await pool.query(`UPDATE team_users SET password_hash = $2, must_change_password = false,
    updated_at = now() WHERE id = $1`, [user.id, hash]);
  await pool.query('DELETE FROM team_user_sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, user.tokenHash]);
  return { ok: true };
}

module.exports = {
  COOKIE, SECTIONS, catalog, normalizeEmail, normalizeSections, hashPassword, verifyPassword,
  ensureSchema, sessionFor, login, logout, allows, listUsers, createUser, updateUser,
  resetPassword, changePassword, clearCookie,
};
