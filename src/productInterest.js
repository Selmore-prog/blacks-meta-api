/* =========================================================================
 * TERMÓMETRO DE INTERÉS POR PRODUCTO
 *
 * Contesta la pregunta que ni Tiendanube ni Analytics contestan solos:
 * "¿este producto no se vende porque nadie lo ve, o porque lo ven y no les
 * convence?". Son dos problemas distintos con soluciones opuestas — uno se
 * arregla con pauta y lugar en el home, el otro con precio, foto o descripción.
 *
 * DE DÓNDE SALE CADA NÚMERO (y por qué de ahí)
 *  · VISTAS y CARRITOS → Google Analytics 4. Es la única fuente: Tiendanube no
 *    guarda cuánta gente miró un producto sin comprarlo.
 *  · VENTAS → Tiendanube (`products_cache.sales_30d`, calculado de órdenes
 *    reales). GA4 también informa compras, pero pierde las de quien bloquea
 *    el tag; para plata mandan las órdenes, no la analítica.
 *  · GASTO EN PAUTA → Meta Ads, desglosado por producto. Se cruza POR NOMBRE
 *    porque los ids de Meta son del catálogo (variantes), no de Tiendanube:
 *    medido en ago-2026, el id no matchea NUNCA y el nombre matchea 200/200.
 *
 * LO QUE NO SE PUEDE MEDIR, dicho de frente
 *  · Gasto de GOOGLE por producto: no está. La API de Google Ads no está
 *    configurada en este proyecto, y aunque lo estuviera, `advertiserAdCost`
 *    de GA4 es por sesión y no se puede repartir entre los productos que esa
 *    sesión miró. O sea que el "gasto" de acá es SÓLO Meta, y así se muestra.
 *  · GA4 guarda el nombre CON la variante ("Zapatilla Trekking (Beige, 41)"):
 *    1198 nombres distintos para 352 productos. Se agrupa sacando el paréntesis
 *    final; sin eso, cada talle contaría como un producto aparte.
 * ========================================================================= */

const pool = require('./db');
const config = require('./config');
const { runReport, isEnabled: gaEnabled } = require('./analytics');
const { contentEligibility } = require('./productScore');

const DEFAULT_DAYS = 28;

/* ------------------------- normalización de nombres ------------------------- */

/** Saca acentos, mayúsculas y espacios de más para poder comparar nombres. */
const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Nombre del PRODUCTO a partir del nombre del item de GA4, que viene con la
 * variante al final entre paréntesis. Sólo se corta el último paréntesis y
 * sólo si parece una variante (colores/talles separados por coma), para no
 * mutilar un producto que legítimamente tenga paréntesis en el nombre.
 */
function baseName(itemName) {
  const s = String(itemName || '').trim();
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return s;
  return m[1] || s;
}

/* ------------------------------ Google Analytics ------------------------------ */

/** Vistas, carritos y compras por producto (agrupando variantes). */
async function fetchGaItems(days) {
  if (!gaEnabled()) return { ok: false, reason: 'GA4 no está configurado (falta GA_CREDENTIALS_B64).', map: new Map() };
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'itemName' }],
    metrics: [
      { name: 'itemsViewed' },
      { name: 'itemsAddedToCart' },
      { name: 'itemsPurchased' },
      { name: 'itemRevenue' },
    ],
    orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
    limit: 5000,
  }).catch((err) => ({ error: err }));

  if (!rep || rep.error) {
    const msg = rep && rep.error ? (rep.error.message || String(rep.error)) : 'sin respuesta';
    return { ok: false, reason: `Analytics no respondió: ${msg}`, map: new Map() };
  }

  const map = new Map();
  for (const row of rep.rows || []) {
    const key = norm(baseName(row.dimensionValues[0].value));
    if (!key) continue;
    const v = row.metricValues.map((m) => Number(m.value || 0));
    const acc = map.get(key) || { views: 0, carts: 0, ga_purchases: 0, ga_revenue: 0 };
    acc.views += v[0];
    acc.carts += v[1];
    acc.ga_purchases += v[2];
    acc.ga_revenue += v[3];
    map.set(key, acc);
  }
  return { ok: true, reason: null, map, itemsLeidos: (rep.rows || []).length };
}

/* --------------------------------- Meta Ads --------------------------------- */

/**
 * Gasto de pauta por producto. Meta devuelve `product_id` como
 * "1154559159, Chomba Pique Lisa Pampero": el id es de la VARIANTE del catálogo
 * y no sirve para cruzar, así que se usa el nombre. Varias variantes del mismo
 * producto se suman.
 */
async function fetchMetaSpend(days) {
  const token = config.meta.adsAccessToken || config.meta.pageAccessToken;
  const account = config.meta.adAccountId;
  if (!token || !account) {
    return { ok: false, reason: 'Meta Ads no está configurado (falta META_ADS_ACCESS_TOKEN o META_AD_ACCOUNT_ID).', map: new Map() };
  }

  const map = new Map();
  let url = `https://graph.facebook.com/${config.meta.apiVersion}/${account}/insights`
    + `?level=account&date_preset=last_30d&breakdowns=product_id`
    + `&fields=spend,impressions,clicks&limit=500&access_token=${encodeURIComponent(token)}`;

  // La respuesta viene paginada: sin recorrerla, el gasto queda subestimado.
  for (let page = 0; page < 10 && url; page += 1) {
    const res = await fetch(url).then((r) => r.json()).catch((e) => ({ error: { message: e.message } }));
    if (res.error) return { ok: false, reason: `Meta no respondió: ${res.error.message}`, map };
    for (const row of res.data || []) {
      const raw = String(row.product_id || '');
      const nombre = raw.split(',').slice(1).join(',').trim();
      if (!nombre) continue;
      const key = norm(nombre);
      const acc = map.get(key) || { spend: 0, impressions: 0, clicks: 0 };
      acc.spend += Number(row.spend || 0);
      acc.impressions += Number(row.impressions || 0);
      acc.clicks += Number(row.clicks || 0);
      map.set(key, acc);
    }
    url = res.paging && res.paging.next ? res.paging.next : null;
  }
  return { ok: true, reason: null, map };
}

/* -------------------------------- cuadrantes -------------------------------- */

/**
 * Los cortes son las MEDIANAS del propio catálogo, no números fijos. Un umbral
 * tipo "100 vistas" envejece mal: si sube el tráfico, de golpe todo es "mucho
 * interés". Con la mediana, los cuadrantes siempre parten la lista al medio.
 */
function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const CUADRANTES = {
  ganadores: {
    label: 'Se miran y se venden',
    accion: 'Subilos al home y sostené la pauta: ya está probado que funcionan.',
  },
  miran_no_compran: {
    label: 'Se miran y no se venden',
    accion: 'El tráfico ya está. El problema es la ficha: precio, fotos o talles disponibles.',
  },
  joyas: {
    label: 'Se venden sin que los vean',
    accion: 'Convierten bien con poquísima visita. Son los candidatos más rentables para pauta y home.',
  },
  sin_traccion: {
    label: 'Ni se miran ni se venden',
    accion: 'No merecen lugar en el home. Liquidación o revisar si vale la pena reponerlos.',
  },
};

function clasificar(p, cortes) {
  const muchoInteres = p.views >= cortes.views;
  // El corte de conversión es ESTRICTAMENTE mayor a la mediana, y no "mayor o
  // igual", por un motivo concreto: en este catálogo la mayoría de los productos
  // no vendió nada en el período, así que la mediana da 0% y un ">= 0" clasifica
  // a TODOS como que convierten (medido: 248 productos repartidos en sólo dos
  // cuadrantes, con los otros dos vacíos). Con "mayor estricto", cuando la
  // mediana es 0 la vara pasa a ser "vendió al menos una unidad", que es
  // justamente la división que interesa.
  const convierte = p.views > 0 ? p.conv_rate > cortes.conv : p.sales > 0;
  if (muchoInteres && convierte) return 'ganadores';
  if (muchoInteres && !convierte) return 'miran_no_compran';
  if (!muchoInteres && convierte) return 'joyas';
  return 'sin_traccion';
}

/* ------------------------------- construcción ------------------------------- */

const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 10000) / 10000 : 0);

async function buildInterest({ days = DEFAULT_DAYS } = {}) {
  const [ga, meta, catalogo] = await Promise.all([
    fetchGaItems(days),
    fetchMetaSpend(days),
    pool.query(`SELECT id, name, brand, price, promo_price, stock, sizes_total, sizes_in_stock,
                       size_coverage, published, image_url, sales_30d,
                       COALESCE(permalink, raw->'handle'->>'es') AS permalink
                  FROM products_cache`),
  ]);

  /* NOMBRES REPETIDOS EN EL CATÁLOGO — 22 casos, 44 productos (medido ago-2026).
     Cada par es el mismo artículo cargado dos veces: la ficha MINORISTA (con
     precio y stock) y su gemela MAYORISTA (precio nulo, stock infinito, "consultar
     precio"). Como el cruce con Analytics y con Meta es por nombre, sin esto las
     visitas y el gasto se sumaban ENTERAS a las dos fichas: el tráfico del
     catálogo aparecía inflado al doble en esos productos.
     Se elige una ficha dueña por nombre —la minorista, que es la que tiene página
     con `view_item`— y la gemela queda en cero. */
  const dueñoPorNombre = new Map();
  for (const row of catalogo.rows) {
    const key = norm(row.name);
    const actual = dueñoPorNombre.get(key);
    if (!actual) { dueñoPorNombre.set(key, row); continue; }
    const puntaje = (p) => (Number(p.price) > 0 ? 4 : 0)      // tiene precio = minorista
      + (p.stock !== null ? 2 : 0)                             // trackea stock
      + (Number(p.sales_30d || 0) > 0 ? 1 : 0);                // y encima vendió
    if (puntaje(row) > puntaje(actual)) dueñoPorNombre.set(key, row);
  }

  const productos = catalogo.rows.map((row) => {
    const key = norm(row.name);
    const esDueño = dueñoPorNombre.get(key) === row;
    const vacio = { views: 0, carts: 0, ga_purchases: 0, ga_revenue: 0 };
    const g = esDueño ? (ga.map.get(key) || vacio) : vacio;
    const m = esDueño ? (meta.map.get(key) || { spend: 0, impressions: 0, clicks: 0 })
      : { spend: 0, impressions: 0, clicks: 0 };
    const sales = Number(row.sales_30d || 0);
    const precio = Number(row.promo_price || row.price || 0);
    const eleg = contentEligibility(row);
    return {
      id: Number(row.id),
      name: row.name,
      brand: row.brand,
      image_url: row.image_url,
      permalink: row.permalink,
      stock: row.stock === null ? null : Number(row.stock),
      sizes_in_stock: row.sizes_in_stock,
      sizes_total: row.sizes_total,
      price: Number(row.price || 0),
      promo_price: row.promo_price ? Number(row.promo_price) : null,
      views: g.views,
      carts: g.carts,
      sales,
      // Ingreso estimado con el precio actual: es lo que se puede afirmar sin
      // guardar el precio histórico de cada orden.
      revenue: Math.round(sales * precio),
      ad_spend: Math.round(m.spend),
      ad_clicks: m.clicks,
      cart_rate: ratio(g.carts, g.views),
      conv_rate: ratio(sales, g.views),
      // Gasto de Meta dividido por TODAS las ventas del producto (vengan de donde
      // vengan). Es un PISO del costo real de adquisición, no una atribución:
      // parte de esas ventas son orgánicas o de Google.
      //
      // A propósito NO se calcula un ROAS por producto. Sería (ventas totales ×
      // precio) ÷ (gasto de Meta), que le acredita a Meta ventas que no trajo:
      // medido en ago-2026 daba 98,78 en un producto con $12.148 de pauta, un
      // número que invita a subir el presupuesto por una razón falsa. Mejor dos
      // columnas honestas —gasto y ventas— que un ratio inventado.
      cost_per_sale: m.spend > 0 && sales > 0 ? Math.round(m.spend / sales) : null,
      elegible: eleg.ok,
      motivo_no_elegible: eleg.reason,
    };
  });

  // Los cortes se calculan SÓLO sobre los que tienen alguna señal: incluir los
  // 300 productos sin una sola visita aplastaría la mediana a cero y todo
  // caería en "mucho interés".
  const conSenal = productos.filter((p) => p.views > 0 || p.sales > 0);
  const cortes = {
    views: median(conSenal.map((p) => p.views)),
    conv: median(conSenal.filter((p) => p.views > 0).map((p) => p.conv_rate)),
  };

  for (const p of productos) p.cuadrante = clasificar(p, cortes);

  /* PLATA DE PAUTA EN FICHAS QUE NO SE PUEDEN COMPRAR BIEN.
     Es el hallazgo más accionable del cruce y por eso se calcula acá y va
     arriba en el panel: hay productos con pauta activa cuya ficha tiene la
     curva de talles rota (3 de 22 talles con stock) o directamente no tiene
     precio porque es la versión mayorista. La visita se paga igual y no puede
     terminar en compra. Medido en ago-2026: 32,1% del gasto de Meta. */
  const conPauta = productos.filter((p) => p.ad_spend > 0);
  const noComprables = conPauta.filter((p) => !p.elegible);
  const gastoTotal = conPauta.reduce((a, p) => a + p.ad_spend, 0);
  const gastoPerdido = noComprables.reduce((a, p) => a + p.ad_spend, 0);
  const desperdicio = {
    productos: noComprables.length,
    con_pauta: conPauta.length,
    gasto: gastoPerdido,
    gasto_total: gastoTotal,
    porcentaje: gastoTotal > 0 ? Math.round((gastoPerdido / gastoTotal) * 1000) / 10 : 0,
    detalle: noComprables
      .sort((a, b) => b.ad_spend - a.ad_spend)
      .slice(0, 10)
      .map((p) => ({ id: p.id, name: p.name, ad_spend: p.ad_spend, views: p.views, motivo: p.motivo_no_elegible })),
  };

  const totales = {
    productos: productos.length,
    con_datos: conSenal.length,
    vistas: conSenal.reduce((a, p) => a + p.views, 0),
    carritos: conSenal.reduce((a, p) => a + p.carts, 0),
    ventas: productos.reduce((a, p) => a + p.sales, 0),
    gasto_meta: productos.reduce((a, p) => a + p.ad_spend, 0),
    ingreso: productos.reduce((a, p) => a + p.revenue, 0),
  };

  return {
    dias: days,
    generado: new Date().toISOString(),
    fuentes: {
      analytics: { ok: ga.ok, detalle: ga.reason, items_leidos: ga.itemsLeidos || 0 },
      meta_ads: { ok: meta.ok, detalle: meta.reason },
      google_ads: {
        ok: false,
        detalle: 'El gasto de Google por producto no se puede obtener: la API de Google Ads '
               + 'no está configurada y el costo que informa GA4 es por sesión, no por producto. '
               + 'Todo el "gasto" de esta pantalla es de Meta.',
      },
    },
    cortes,
    cuadrantes: CUADRANTES,
    totales,
    desperdicio,
    // Sólo interesa lo que tiene alguna señal; el resto es ruido de catálogo.
    productos: conSenal.sort((a, b) => b.views - a.views),
  };
}

module.exports = { buildInterest, baseName, norm, CUADRANTES, median };
