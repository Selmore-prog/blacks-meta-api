/* =========================================================================
 * PAUSA DE LO AUTOMÁTICO HACIA META — sep-2026
 *
 * Sebastián pidió PAUSAR (no eliminar) los dos procesos que el motor le
 * escribe solo a Meta:
 *   · `ad_set`  → el conjunto curado de anuncios (src/adCatalogSet.js)
 *   · `sync`    → el sincronizador de stock del catálogo (src/catalogSync.js)
 *
 * POR QUÉ UN INTERRUPTOR Y NO BORRAR EL CÓDIGO
 * Porque "ya no lo necesito más" hoy puede ser "volvamos a prenderlo" el mes
 * que viene, y las dos cosas existen para arreglar problemas medidos y
 * documentados (anuncios contra "All Products" con 1.944 items duplicados; el
 * feed nativo de Tiendanube que se atrasa con el stock). Borrarlas obligaría a
 * reconstruirlas. Con esto, volver a prenderlas es un clic.
 *
 * QUÉ PAUSA Y QUÉ NO
 * Pausa TODA ESCRITURA a Meta de esos dos módulos: el cron y también el botón
 * "aplicar" del panel. NO pausa las vistas previas (`apply: false`), que sólo
 * LEEN y sirven para ver qué haría si se prendiera. Y no toca para nada la
 * publicación de posts a Instagram y Facebook (src/metaPublisher.js), que es
 * otra cosa y sigue andando.
 *
 * Vive en app_settings para que prenderlo y apagarlo no necesite un deploy.
 * ========================================================================= */

const { getSetting, setSetting } = require('./settings');

const KEY = 'meta_auto_pausado';
const PROCESOS = {
  ad_set: 'Conjunto curado de anuncios',
  sync: 'Sincronizador de stock del catálogo',
};

/* ⚠️ ARRANCAN PAUSADOS, y es deliberado.
   Sebastián pidió (sep-2026) pausar los dos, así que mientras NO haya nada
   guardado en app_settings el estado por defecto es "pausado". De lo contrario
   habría que acordarse de entrar al panel a apagarlos justo después de
   deployar, y en el medio los cron habrían escrito en Meta igual.
   En cuanto se guarda algo desde el panel (aunque sea una lista vacía), manda
   lo guardado y este default no se usa nunca más. */
const PAUSADO_POR_DEFECTO = ['ad_set', 'sync'];

// Caché corto: lo consultan endpoints que pueden llamarse seguido, pero tiene
// que reaccionar rápido cuando se prende o se apaga desde el panel.
let cache = { at: 0, valor: null };
const TTL_MS = 20 * 1000;

async function estado({ force = false } = {}) {
  if (!force && cache.valor && Date.now() - cache.at < TTL_MS) return cache.valor;
  let pausados = PAUSADO_POR_DEFECTO;
  let guardado = false;
  try {
    const raw = await getSetting(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) { pausados = parsed; guardado = true; }
    }
  } catch (e) {
    // Config rota: se cae al default, que es PAUSADO. Ante la duda, no
    // escribirle a Meta es lo seguro — lo caro es lo contrario.
    console.error('[metaPausa] config inválida, quedan pausados por las dudas:', e.message);
    pausados = PAUSADO_POR_DEFECTO;
  }
  const valor = {
    pausados: pausados.filter((p) => Object.prototype.hasOwnProperty.call(PROCESOS, p)),
    procesos: PROCESOS,
    // Para que el panel pueda decir "nunca se configuró" y no confundirlo con
    // "alguien lo pausó a mano".
    guardado,
  };
  cache = { at: Date.now(), valor };
  return valor;
}

async function estaPausado(proceso) {
  const { pausados } = await estado();
  return pausados.includes(proceso);
}

async function guardar(pausados) {
  const limpios = (Array.isArray(pausados) ? pausados : [])
    .filter((p) => Object.prototype.hasOwnProperty.call(PROCESOS, p));
  await setSetting(KEY, JSON.stringify(limpios));
  cache = { at: 0, valor: null };
  return estado({ force: true });
}

/**
 * Respuesta uniforme para cuando algo está pausado. Devuelve `ok: true` a
 * propósito: para el cron NO es un error — hizo exactamente lo que se le pidió,
 * que es no tocar nada. Un 500 acá llenaría de alertas falsas.
 */
function respuestaPausada(proceso) {
  return {
    ok: true,
    pausado: true,
    proceso,
    mensaje: `"${PROCESOS[proceso]}" está pausado desde el panel: no se escribió nada en Meta.`,
  };
}

module.exports = { estado, estaPausado, guardar, respuestaPausada, PROCESOS, KEY };
