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

/* =========================================================================
 * BUSCADOR PREDICTIVO DEL SITIO
 *
 * Reemplaza al scraping. Hasta sep-2026 el panel del buscador se bajaba la
 * PÁGINA DE RESULTADOS COMPLETA en cada tecla (medido: 2,28 MB para "grafa")
 * y le sacaba los productos con DOMParser. Además, de ese HTML no se puede
 * leer CUÁNTO stock hay —sólo si está agotado o no—, así que era imposible
 * poner arriba lo que más stock tiene.
 *
 * Acá se busca directo contra products_cache: una respuesta de unos pocos KB,
 * con el stock real, y el orden decidido por nosotros.
 *
 * EL ORDEN, que es lo que importa:
 *   1º relevancia contra lo que se tipeó (empieza con la frase > la contiene >
 *      están todas las palabras > alguna). Un producto con mucho stock pero que
 *      no tiene que ver NO puede ganarle a la coincidencia exacta.
 *   2º stock, de mayor a menor. Entre cosas igual de relevantes, primero lo que
 *      se puede vender sin quedarse corto.
 * ========================================================================= */
/* --- normalización y raíces ---------------------------------------------
 * El catálogo está escrito en singular y la gente busca en plural (y al revés):
 * "zapatos" tiene que encontrar "Zapato de Seguridad", y "botin" tiene que
 * encontrar "Botines". Comparar el texto crudo no alcanzaba.
 *
 * Y hay un caso que NO se puede resolver a lo bruto: "zapatos" NO puede traer
 * "Zapatillas". Por eso no se compara por prefijo corto (zapat…), que las
 * mezclaría, sino por RAÍZ COMPLETA de cada palabra.
 */
function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // saca acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Raíz aproximada para el castellano: alcanza para singular/plural. */
function raiz(p) {
  if (p.length > 5 && p.endsWith('es')) return p.slice(0, -2);   // botines → botin
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);    // zapatos → zapato
  return p;
}

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'por', 'y', 'a', 'en', 'un', 'una']);

function palabrasDe(t) {
  return normalizar(t).split(' ').filter((w) => w && !VACIAS.has(w)).map(raiz);
}

/* =========================================================================
 * BUSCADOR PREDICTIVO DEL SITIO
 *
 * Reemplaza al scraping. Hasta sep-2026 el panel se bajaba la PÁGINA DE
 * RESULTADOS COMPLETA en cada tecla (medido: 2,28 MB para "grafa") y le sacaba
 * los productos con DOMParser. De ese HTML tampoco se puede leer CUÁNTO stock
 * hay —sólo si está agotado—, así que era imposible ordenar por stock.
 *
 * Como el catálogo elegible son ~70 productos, se traen todos y se puntúan acá:
 * es más barato que pelear con SQL y permite un criterio mucho más fino.
 *
 * EL ORDEN:
 *   1º cuánto coincide con lo que se tipeó (ver puntaje)
 *   2º stock, de mayor a menor
 * La relevancia va primero a propósito: buscando "botines seguridad", los
 * botines tienen que ganarle a una faja lumbar aunque la faja tenga más stock.
 * ========================================================================= */
async function buscarProductos(q, limite = 8) {
  const consulta = palabrasDe(q);
  if (!consulta.length || normalizar(q).length < 2) return [];

  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, promo_price, stock, image_url,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache
      WHERE COALESCE(published, true) = true
        AND price > 0                 -- minorista: el mayorista va sin precio
        AND COALESCE(stock, 0) > 0`   // agotados fuera del predictivo
  ).catch((e) => { console.warn('[buscarProductos]', e.message); return { rows: [] }; });

  const { productPath } = require('./homeRails');

  /* Puntaje de UNA palabra buscada contra las palabras del producto.
     3 = es la misma palabra · 2 = el producto la empieza (segur→seguridad)
     1 = la contiene · 0 = nada. NO hay coincidencia por prefijo corto: es lo
     que haría que "zapato" trajera "zapatilla". */
  const puntoPalabra = (w, palabras) => {
    let mejor = 0;
    for (const p of palabras) {
      if (p === w) return 3;
      if (w.length >= 4 && p.startsWith(w)) mejor = Math.max(mejor, 2);
      else if (w.length >= 4 && p.includes(w)) mejor = Math.max(mejor, 1);
    }
    return mejor;
  };

  const puntaje = (fila) => {
    const enNombre = palabrasDe(fila.name);
    const enExtra = palabrasDe(`${fila.brand || ''} ${fila.category || ''}`);

    let total = 0;
    for (const w of consulta) {
      const nom = puntoPalabra(w, enNombre);
      const ext = nom ? 0 : puntoPalabra(w, enExtra);
      // TODAS las palabras buscadas tienen que aparecer en algún lado. Así
      // "zapatos seguridad" encuentra "Zapato de Seguridad 649" aunque las
      // palabras no estén pegadas, y no trae cualquier cosa que diga "zapato".
      if (!nom && !ext) return 0;
      total += nom ? nom * 2 : ext; // el nombre pesa el doble que marca/categoría
    }
    // Empieza con lo buscado: es la coincidencia más fuerte que hay.
    if (normalizar(fila.name).startsWith(normalizar(q))) total += 4;
    return total;
  };

  return rows
    .map((r) => ({ r, rel: puntaje(r) }))
    .filter((x) => x.rel > 0)
    .sort((a, b) => (b.rel - a.rel) || (Number(b.r.stock || 0) - Number(a.r.stock || 0)))
    .slice(0, limite)
    .map(({ r }) => {
      const price = r.price == null ? null : Number(r.price);
      const promo = r.promo_price == null ? null : Number(r.promo_price);
      const oferta = promo != null && price != null && promo > 0 && promo < price;
      return {
        name: r.name,
        url: productPath(r.permalink),
        image: r.image_url || '',
        price,
        promo_price: oferta ? promo : null,
        discount_pct: oferta ? Math.round(((price - promo) / price) * 100) : null,
        stock: Number(r.stock || 0),
      };
    })
    .filter((p) => p.url);
}

function invalidate() { cache = { at: 0, data: null }; }

module.exports = { buscadas, chips, terminoDe, buscarProductos, invalidate };
