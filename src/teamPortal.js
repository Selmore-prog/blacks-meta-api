const crypto = require('crypto');
const config = require('./config');
const { getSetting, setSetting } = require('./settings');

/**
 * PORTAL DEL EQUIPO · una entrada aparte, con su propia contraseña, para que
 * alguien cargue contenido sin tener acceso al panel entero.
 *
 * Por qué existe (pedido de ago-2026): el panel tiene UNA sola contraseña y todo
 * `/api/` detrás de la misma sesión. Darle esa clave a alguien para que suba
 * fotos de bordados le daba también el botón de Ofertas Flash, que **escribe
 * precios reales en Tiendanube**. Esto separa las dos cosas.
 *
 * Cómo funciona:
 *  · El dueño lo activa desde el panel, le pone una contraseña y tilda qué
 *    secciones habilita. Todo eso vive en `app_settings` (no en variables de
 *    entorno) para que cambiarlo no necesite un deploy.
 *  · La contraseña se guarda hasheada con scrypt + salt. Nunca en claro, y el
 *    panel nunca la recibe de vuelta: sólo sabe si hay una puesta o no.
 *  · El token de sesión se deriva del hash: cambiar la contraseña invalida
 *    automáticamente las sesiones que estaban abiertas.
 *  · El permiso es **denegar por defecto**: una sesión de equipo sólo pasa si el
 *    método+ruta matchean explícitamente una sección HABILITADA. Cualquier cosa
 *    que no esté en esta lista queda afuera, incluida toda la parte de pauta,
 *    métricas, calendario y —sobre todo— las ofertas flash.
 */

const KEY = 'team_portal';
const COOKIE = 'blacks_team';

/**
 * Catálogo de secciones delegables. Para sumar una nueva alcanza con agregarla
 * acá (con sus rutas) y renderizarla en public/equipo.js.
 *
 * ⚠ A propósito NO existe una sección para Ofertas Flash ni para nada que
 * escriba precios: eso no se delega desde acá.
 */
const SECTIONS = {
  works: {
    label: 'Trabajos con bordado',
    help: 'Subir fotos de prendas ya bordadas, elegir en qué productos se muestran y borrarlas.',
    escribe: 'Sólo la biblioteca de trabajos. No toca la tienda.',
    rutas: [
      ['GET', /^\/api\/works$/],
      ['GET', /^\/api\/works\/search$/],
      ['POST', /^\/api\/works$/],
      ['POST', /^\/api\/works\/reorder$/],
      ['PATCH', /^\/api\/works\/\d+$/],
      ['DELETE', /^\/api\/works\/\d+$/],
    ],
  },
  products: {
    label: 'Listado de productos',
    help: 'Ver el catálogo con ventas y stock, para saber de qué producto sacar fotos. Sólo lectura.',
    escribe: 'No modifica nada.',
    rutas: [
      ['GET', /^\/api\/products\/analytics$/],
      ['GET', /^\/api\/products\/interest$/],
    ],
  },
};

const SECTION_IDS = Object.keys(SECTIONS);

const DEFAULT = { enabled: false, hash: null, sections: { works: true, products: false } };

/* --------------------------- contraseña (scrypt) -------------------------- */

function hashPassword(plano) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(plano), salt, 32).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(plano, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, salt, key] = partes;
  let esperado;
  try { esperado = Buffer.from(key, 'hex'); } catch (_) { return false; }
  const calculado = crypto.scryptSync(String(plano), salt, 32);
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

/* ------------------------------- config ---------------------------------- */

// La lee el middleware en CADA request: sin caché sería una consulta por pedido.
let cache = null;
let cacheAt = 0;
const CACHE_MS = 30_000;

async function getRaw({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  let cfg = { ...DEFAULT };
  try {
    const raw = await getSetting(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      cfg = {
        enabled: !!j.enabled,
        hash: typeof j.hash === 'string' ? j.hash : null,
        sections: normalizeSections(j.sections),
      };
    }
  } catch (_) { /* config rota o tabla sin migrar: queda el default (apagado) */ }
  cache = cfg;
  cacheAt = Date.now();
  return cfg;
}

function normalizeSections(s) {
  const out = {};
  for (const id of SECTION_IDS) out[id] = !!(s && s[id]);
  return out;
}

/** Lo que ve el panel: nunca el hash. */
async function getConfig() {
  const cfg = await getRaw({ force: true });
  return {
    enabled: cfg.enabled,
    tieneClave: !!cfg.hash,
    sections: cfg.sections,
    catalogo: SECTION_IDS.map((id) => ({
      id, label: SECTIONS[id].label, help: SECTIONS[id].help, escribe: SECTIONS[id].escribe,
    })),
  };
}

/**
 * Guarda. `password` sólo se toca si viene con contenido: mandar el campo vacío
 * significa "dejá la que estaba", no "borrala".
 */
async function saveConfig({ enabled, sections, password } = {}) {
  const actual = await getRaw({ force: true });
  const nuevo = {
    enabled: enabled === undefined ? actual.enabled : !!enabled,
    hash: actual.hash,
    sections: sections === undefined ? actual.sections : normalizeSections(sections),
  };

  const pw = typeof password === 'string' ? password.trim() : '';
  if (pw) {
    if (pw.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
    nuevo.hash = hashPassword(pw);
  }
  if (nuevo.enabled && !nuevo.hash) {
    throw new Error('Poné una contraseña antes de activar el acceso.');
  }

  await setSetting(KEY, JSON.stringify(nuevo));
  cache = nuevo;
  cacheAt = Date.now();
  return getConfig();
}

/* ------------------------------- sesión ---------------------------------- */

function tokenPara(hash) {
  return crypto
    .createHmac('sha256', `${config.dashboardPassword || ''}::${config.cronSecret || ''}::${hash}`)
    .update('blacks-team-v1')
    .digest('hex');
}

function leerCookie(req) {
  const cookies = req.headers.cookie || '';
  const m = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : null;
}

/** ¿Trae una sesión de equipo válida? Devuelve la config si sí, null si no. */
async function sessionFor(req) {
  const cfg = await getRaw();
  if (!cfg.enabled || !cfg.hash) return null;
  const valor = leerCookie(req);
  if (!valor) return null;
  const esperado = tokenPara(cfg.hash);
  if (valor.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(valor), Buffer.from(esperado))) return null;
  return cfg;
}

/** Cabecera Set-Cookie para iniciar sesión. */
function cookieDeSesion(hash) {
  const maxAge = 7 * 24 * 60 * 60; // 7 días: más corto que la del dueño
  const secure = String(config.publicBaseUrl || '').startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=${tokenPara(hash)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function cookieDeSalida() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

async function login(password) {
  const cfg = await getRaw({ force: true });
  if (!cfg.enabled || !cfg.hash) return { ok: false, error: 'El acceso del equipo está desactivado.' };
  if (!password || !verifyPassword(password, cfg.hash)) {
    return { ok: false, error: 'Contraseña incorrecta.' };
  }
  return { ok: true, cookie: cookieDeSesion(cfg.hash), sections: cfg.sections };
}

/* ------------------------------- permisos -------------------------------- */

/**
 * ¿Esta sesión de equipo puede tocar este método+ruta? Denegar por defecto:
 * sólo pasa lo que está explícitamente en una sección habilitada.
 */
function permite(cfg, method, path) {
  if (!cfg || !cfg.enabled) return false;
  const m = String(method || '').toUpperCase();
  for (const id of SECTION_IDS) {
    if (!cfg.sections[id]) continue;
    for (const [metodo, re] of SECTIONS[id].rutas) {
      if (metodo === m && re.test(path)) return true;
    }
  }
  return false;
}

module.exports = {
  COOKIE, SECTIONS, SECTION_IDS,
  getConfig, saveConfig, sessionFor, login, permite,
  cookieDeSalida,
  // exportados para poder testearlos sin base de datos
  hashPassword, verifyPassword,
};
