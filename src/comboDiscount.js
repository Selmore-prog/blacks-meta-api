/* =========================================================================
 * % DEL "COMBO FRECUENTE"
 *
 * El descuento que se aplica solo cuando el cliente lleva dos productos que se
 * compran juntos. No lo calcula el motor: lo aplica el Worker de Cloudflare
 * (repo del theme, backend/lookbook-discounts/worker.js) en cada cambio de
 * carrito, y el modal de la ficha lo lee del mismo Worker.
 *
 * Antes el % se cargaba en el admin del tema y el Worker lo copiaba del HTML
 * del home con el cron de cada 6 hs: cambiarlo tardaba horas y había que
 * acordarse en qué pantalla estaba. Ahora el panel se lo manda directo al
 * Worker y gana sobre el del tema (que queda de respaldo).
 *
 * El motor no guarda nada: la fuente de verdad es el KV del Worker, así que
 * lo que muestra el panel es siempre lo que está aplicando el checkout.
 * ========================================================================= */

const config = require('./config');

const TIMEOUT_MS = 10000;

function sinConfigurar() {
  const err = new Error('Falta DISCOUNTS_WORKER_KEY en las variables del motor (Render y .env). '
    + 'Es la misma ADMIN_KEY que tiene cargada el Worker de descuentos en Cloudflare.');
  err.status = 503;
  return err;
}

async function llamarWorker(method, body) {
  const { url, adminKey } = config.discountsWorker;
  if (!adminKey) throw sinConfigurar();

  let res;
  try {
    res = await fetch(`${url.replace(/\/+$/, '')}/crosssell-config`, {
      method,
      headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const err = new Error(`No pude hablar con el Worker de descuentos (${e.name === 'TimeoutError' ? 'tardó más de 10 s' : e.message}).`);
    err.status = 502;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (res.status === 401) {
    const err = new Error('El Worker rechazó la clave: DISCOUNTS_WORKER_KEY no coincide con la ADMIN_KEY de Cloudflare.');
    err.status = 502;
    throw err;
  }
  /* 404 o una respuesta sin `crosssell` = el Worker publicado es anterior a esta
     ruta (responde {ok, service} a cualquier path desconocido). Pasa si se
     actualizó el motor y todavía no se pegó el worker.js nuevo en Cloudflare. */
  if (res.ok && (!data || !data.crosssell)) {
    const err = new Error('El Worker de Cloudflare todavía no tiene esta función: '
      + 'hay que pegar el worker.js actualizado (repo del theme, backend/lookbook-discounts) y desplegarlo.');
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `El Worker respondió ${res.status}.`);
    err.status = res.status === 400 ? 400 : 502;
    throw err;
  }
  return data;
}

async function getState() {
  return llamarWorker('GET');
}

async function setPercent(value) {
  const pct = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isInteger(pct) || pct < 0 || pct > 40) {
    const err = new Error('El % tiene que ser un número entero entre 0 y 40.');
    err.status = 400;
    throw err;
  }
  await llamarWorker('POST', { percent: pct });
  // Se devuelve el estado completo (con los looks) para que el panel redibuje
  // con lo que quedó guardado de verdad, no con lo que se mandó.
  return getState();
}

module.exports = { getState, setPercent };
