const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'blacks_session';
const MAX_AGE = 30 * 24 * 60 * 60;
const secret = () => `${config.dashboardPassword}::${config.cronSecret}`;

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function createToken(now = Date.now()) {
  const payload = `v2.${now + MAX_AGE * 1000}.${crypto.randomBytes(16).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(value, now = Date.now()) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v2' || !/^\d{13}$/.test(parts[1]) ||
      !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const expires = Number(parts[1]);
  if (expires <= now || expires > now + MAX_AGE * 1000) return false;
  const expected = sign(parts.slice(0, 3).join('.'));
  return crypto.timingSafeEqual(Buffer.from(parts[3], 'hex'), Buffer.from(expected, 'hex'));
}

function readToken(req) {
  const item = String(req.headers.cookie || '').split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE}=`));
  return item ? item.slice(COOKIE.length + 1) : null;
}

const secure = () => String(config.publicBaseUrl || '').startsWith('https') ? '; Secure' : '';
const cookie = (token) => `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure()}`;
const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure()}`;

module.exports = { createToken, verifyToken, readToken, cookie, clearCookie };
