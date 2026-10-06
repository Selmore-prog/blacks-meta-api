/* =========================================================================
 * RECUPERACIÓN DE CARRITOS ABANDONADOS (pestaña "Carritos" del panel)
 *
 * Los avisos los manda el Worker de Cloudflare (repo del theme,
 * backend/lookbook-discounts/worker.js): cada hora toma los carritos
 * abandonados de Tiendanube, crea el lead en Kommo (etapa CARRITO ABANDONADO
 * TN) y manda el WhatsApp desde el número de la empresa con la plantilla
 * `carrito_abandonado_v2`. Reemplazó al aviso de Nuby, que salía de un número
 * genérico y la respuesta del cliente no llegaba a nadie.
 *
 * El motor no guarda nada: el registro de envíos vive en el KV del Worker y las
 * estadísticas las arma el Worker (tiene los tokens de Tiendanube, Kommo y
 * WhatsApp). Acá sólo se pasan, igual que el % del combo (src/comboDiscount.js),
 * con la misma DISCOUNTS_WORKER_KEY.
 * ========================================================================= */

const config = require('./config');

const TIMEOUT_MS = 20000; // las estadísticas consultan Tiendanube y Meta: más lento que el combo

function errorCon(status, mensaje) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}

async function llamarWorker(ruta) {
  const { url, adminKey } = config.discountsWorker;
  if (!adminKey) {
    throw errorCon(503, 'Falta DISCOUNTS_WORKER_KEY en las variables del motor (Render y .env). '
      + 'Es la misma ADMIN_KEY que tiene cargada el Worker de descuentos en Cloudflare.');
  }

  let res;
  try {
    res = await fetch(`${url.replace(/\/+$/, '')}${ruta}`, {
      headers: { 'X-Admin-Key': adminKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw errorCon(502, `No pude hablar con el Worker de Cloudflare (${e.name === 'TimeoutError' ? 'tardó más de 20 s' : e.message}).`);
  }

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (res.status === 401) {
    throw errorCon(502, 'El Worker rechazó la clave: DISCOUNTS_WORKER_KEY no coincide con la ADMIN_KEY de Cloudflare.');
  }
  if (!res.ok) throw errorCon(502, (data && data.error) || `El Worker respondió ${res.status}.`);
  return data;
}

function fecha(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
}

async function getStats({ desde, hasta } = {}) {
  const qs = new URLSearchParams();
  if (fecha(desde)) qs.set('desde', fecha(desde));
  if (fecha(hasta)) qs.set('hasta', fecha(hasta));
  const data = await llamarWorker(`/carritos-stats?${qs.toString()}`);
  /* Un Worker publicado antes de esta función responde {ok, service} a
     cualquier ruta desconocida. Pasa si se actualizó el motor y todavía no se
     pegó el worker.js nuevo en Cloudflare. */
  if (!data || !data.carritos) {
    throw errorCon(502, 'El Worker de Cloudflare todavía no tiene las estadísticas de carritos: '
      + 'hay que pegar el worker.js actualizado (repo del theme, backend/lookbook-discounts) y desplegarlo.');
  }
  return data;
}

async function setModo(modo) {
  if (modo !== 'activo' && modo !== 'apagado') throw errorCon(400, 'El modo tiene que ser "activo" o "apagado".');
  const data = await llamarWorker(`/carritos?modo=${modo}`);
  if (!data || data.modo !== modo) {
    throw errorCon(502, 'El Worker no confirmó el cambio. ¿Está publicado el worker.js nuevo?');
  }
  return data;
}

module.exports = { getStats, setModo };
