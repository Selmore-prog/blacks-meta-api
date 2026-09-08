/* =========================================================================
 * QUÉ BUSCA LA GENTE EN LA TIENDA
 *
 * SÍ SE PUEDE MEDIR, y sin tocar el theme: cada búsqueda es una navegación a
 * `/search/?q=…`, así que GA4 ya la tiene guardada. La dimensión `pagePath`
 * recorta la query (por eso en los informes se ve un solo `/search/` con todas
 * las visitas juntas), pero `pagePathPlusQueryString` la conserva entera.
 * Medido sobre los últimos 60 días: 448 búsquedas.
 *
 * Lo que hace este módulo es leer esas rutas, sacarles el término, juntar las
 * variantes que son la misma palabra ("Cargo", "cargo", "Cargo" en la página 2)
 * y cruzarlas contra el catálogo. Eso último es lo que más sirve: una búsqueda
 * muy repetida que NO devuelve productos es plata que entra a la tienda, no
 * encuentra y se va.
 * ========================================================================= */

const pool = require('./db');
const { runReport, isEnabled } = require('./analytics');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache = { at: 0, data: null };

/* Parámetros que agrega la tienda y no son parte de lo que tipeó la persona. */
const RUIDO = new Set(['min_price', 'max_price', 'mpage', 'page', 'sort_by', 'utm_source', 'utm_medium', 'utm_campaign']);

/** `/search/?q=Grafa+70&min_price=1` → `grafa 70` */
function terminoDe(ruta) {
  const i = String(ruta || '').indexOf('?');
  if (i === -1) return null;
  const params = new URLSearchParams(ruta.slice(i + 1));
  for (const k of [...params.keys()]) if (RUIDO.has(k)) params.delete(k);
  const q = params.get('q');
  if (!q) return null;
  return String(q)
    .replace(/\+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || null;
}

/**
 * Cuántos productos publicados devolvería cada término. Es una aproximación del
 * buscador de la tienda (nombre o categoría contienen el texto), suficiente para
 * detectar el caso que importa: búsquedas frecuentes sin resultados.
 */
async function resultadosPorTermino(terminos) {
  if (!terminos.length) return new Map();
  const { rows } = await pool.query(
    `SELECT t.termino,
            count(p.id) FILTER (WHERE COALESCE(p.stock,0) > 0)::int AS con_stock,
            count(p.id)::int AS total
       FROM unnest($1::text[]) AS t(termino)
       LEFT JOIN products_cache p
         ON (p.name ILIKE '%' || t.termino || '%' OR COALESCE(p.category,'') ILIKE '%' || t.termino || '%')
        AND COALESCE(p.published, true) = true
      GROUP BY t.termino`,
    [terminos]
  ).catch((e) => { console.warn('[searchAnalytics] cruce con catálogo:', e.message); return { rows: [] }; });
  return new Map(rows.map((r) => [r.termino, { con_stock: r.con_stock, total: r.total }]));
}

/**
 * @param {number} dias  ventana a mirar
 * @returns {{disponible:boolean, terminos:Array, total:number, sinResultado:Array}}
 */
async function buscadas({ dias = 60, force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  if (!isEnabled()) {
    const data = { disponible: false, motivo: 'GA4 no está configurado en el motor.', terminos: [], total: 0, sinResultado: [] };
    cache = { at: Date.now(), data };
    return data;
  }

  let filas = [];
  try {
    const r = await runReport({
      dateRanges: [{ startDate: `${dias}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'pagePathPlusQueryString' }],
      metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: { filter: { fieldName: 'pagePathPlusQueryString', stringFilter: { matchType: 'CONTAINS', value: '/search' } } },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 400,
    });
    filas = r.rows || [];
  } catch (err) {
    const data = { disponible: false, motivo: `No pude leer GA4: ${err.message}`, terminos: [], total: 0, sinResultado: [] };
    cache = { at: Date.now(), data };
    return data;
  }

  // Se juntan las variantes de la misma palabra (mayúsculas, página 2, filtros).
  const conteo = new Map();
  let total = 0;
  filas.forEach((f) => {
    const t = terminoDe(f.dimensionValues[0].value);
    if (!t) return;
    const n = Number(f.metricValues[0].value) || 0;
    total += n;
    conteo.set(t, (conteo.get(t) || 0) + n);
  });

  const ordenados = [...conteo.entries()]
    .map(([termino, busquedas]) => ({ termino, busquedas }))
    .sort((a, b) => b.busquedas - a.busquedas);

  const catalogo = await resultadosPorTermino(ordenados.slice(0, 80).map((x) => x.termino));
  ordenados.forEach((x) => {
    const c = catalogo.get(x.termino);
    x.productos = c ? c.total : null;
    x.con_stock = c ? c.con_stock : null;
  });

  const data = {
    disponible: true,
    dias,
    total,
    distintas: ordenados.length,
    terminos: ordenados,
    // Lo que más duele: la gente lo busca y no encuentra nada.
    sinResultado: ordenados.filter((x) => x.productos === 0 && x.busquedas >= 2),
    // Lo busca, hay producto, pero está agotado.
    sinStock: ordenados.filter((x) => x.productos > 0 && x.con_stock === 0 && x.busquedas >= 2),
    generado: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

/**
 * Las que van como chips en el buscador del theme. Se piden desde la tienda, así
 * que sólo salen las que DEVUELVEN productos con stock: un chip que lleva a una
 * página vacía es peor que no tener chip.
 */
async function chips(limite = 8) {
  const d = await buscadas();
  if (!d.disponible) return [];
  return d.terminos
    .filter((x) => x.con_stock > 0 && x.termino.length >= 3)
    .slice(0, limite)
    .map((x) => ({
      termino: x.termino,
      // Se muestra con la primera en mayúscula, como estaban los chips a mano.
      label: x.termino.charAt(0).toUpperCase() + x.termino.slice(1),
      busquedas: x.busquedas,
    }));
}

function invalidate() { cache = { at: 0, data: null }; }

module.exports = { buscadas, chips, terminoDe, invalidate };
