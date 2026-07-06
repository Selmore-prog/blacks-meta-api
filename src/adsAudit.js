const config = require('./config');
const { generateJson } = require('./ai');
const { tiendanubeVariantMap: tnVariantMap } = require('./catalogSync');

/**
 * Auditoría de Meta Ads: junta datos duros de la cuenta publicitaria (campañas,
 * anuncios, plataformas, estados con problemas) y la salud de los catálogos
 * (cruzada contra el stock REAL de Tiendanube), y se los da a Gemini para un
 * diagnóstico accionable: qué funciona, qué no, y qué decirle a la agencia.
 *
 * Todo con permisos de LECTURA (ads_read / catalog_management): acá no se toca
 * ninguna campaña, sólo se mira.
 */

const GRAPH = 'https://graph.facebook.com';

async function fbGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: config.meta.adsAccessToken });
  const res = await fetch(`${GRAPH}/${config.meta.apiVersion}/${path}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Meta ${path}: ${(data.error && data.error.message) || res.status}`);
  }
  return data;
}

function actionValue(arr, type) {
  const f = (arr || []).find((a) => a.action_type === type);
  return f ? Number(f.value) : 0;
}

function purchases(row) {
  return actionValue(row.actions, 'omni_purchase') || actionValue(row.actions, 'offsite_conversion.fb_pixel_purchase');
}

function revenue(row) {
  return actionValue(row.action_values, 'omni_purchase') || actionValue(row.action_values, 'offsite_conversion.fb_pixel_purchase');
}

/* ------------------------- Rendimiento de la pauta ------------------------- */

async function gatherPerformance() {
  const act = config.meta.adAccountId;

  const [campaigns, topAds, platforms, ads] = await Promise.all([
    fbGet(`${act}/insights`, {
      level: 'campaign',
      fields: 'campaign_name,objective,spend,impressions,clicks,ctr,cpm,frequency,actions,action_values',
      date_preset: 'last_30d',
      limit: 30,
    }),
    fbGet(`${act}/insights`, {
      level: 'ad',
      fields: 'ad_name,campaign_name,spend,ctr,inline_link_clicks,actions,action_values',
      date_preset: 'last_30d',
      sort: 'spend_descending',
      limit: 15,
    }),
    fbGet(`${act}/insights`, {
      level: 'account',
      fields: 'spend,actions,action_values',
      breakdowns: 'publisher_platform',
      date_preset: 'last_30d',
    }),
    fbGet(`${act}/ads`, { fields: 'name,effective_status,issues_info', limit: 200 }),
  ]);

  const mapRow = (r) => ({
    nombre: r.campaign_name || r.ad_name,
    ...(r.ad_name ? { campania: r.campaign_name } : {}),
    ...(r.objective ? { objetivo: r.objective } : {}),
    gasto: Math.round(Number(r.spend || 0)),
    ...(r.impressions ? { impresiones: Number(r.impressions) } : {}),
    clicks_al_sitio: Number(r.inline_link_clicks || r.clicks || 0),
    ctr: Number(Number(r.ctr || 0).toFixed(2)),
    ...(r.frequency ? { frecuencia: Number(Number(r.frequency).toFixed(2)) } : {}),
    compras: purchases(r),
    ingresos: Math.round(revenue(r)),
    roas: Number(r.spend) > 0 && revenue(r) > 0 ? Number((revenue(r) / Number(r.spend)).toFixed(2)) : 0,
  });

  const statusCount = {};
  const issues = [];
  for (const ad of ads.data || []) {
    statusCount[ad.effective_status] = (statusCount[ad.effective_status] || 0) + 1;
    if (ad.issues_info && ad.issues_info.length) {
      issues.push({ anuncio: ad.name, problema: ad.issues_info[0].error_summary || ad.issues_info[0].error_message });
    }
  }

  return {
    campanias: (campaigns.data || []).map(mapRow),
    top_anuncios_por_gasto: (topAds.data || []).map(mapRow),
    por_plataforma: (platforms.data || []).map((r) => ({
      plataforma: r.publisher_platform,
      gasto: Math.round(Number(r.spend || 0)),
      compras: purchases(r),
      ingresos: Math.round(revenue(r)),
    })),
    estados_de_anuncios: statusCount,
    anuncios_con_problemas: issues.slice(0, 15),
  };
}

/* --------------------- Salud de catálogos vs Tiendanube --------------------- */

// El mapa variante Tiendanube -> stock vive en catalogSync (es el mismo cruce
// que usa el sincronizador de disponibilidad).
const tiendanubeVariantMap = tnVariantMap;

/** Analiza UN catálogo: disponibilidad, cruce con stock TN y productos invisibles. */
async function analyzeCatalog(cat, byVariant) {
  // Muestra de hasta 1000 items (2 páginas): suficiente para diagnóstico.
  let items = [];
  let page = await fbGet(`${cat.id}/products`, {
    fields: 'retailer_id,name,availability,visibility',
    limit: 500,
  }).catch(() => null);
  for (let i = 0; page && i < 2; i += 1) {
    items = items.concat(page.data || []);
    const next = page.paging && page.paging.next;
    if (!next || items.length >= 1000) break;
    page = await fetch(next).then((r) => r.json()).catch(() => null);
  }

  const inStock = items.filter((i) => i.availability === 'in stock').length;
  const hidden = items.filter((i) => i.visibility && i.visibility !== 'published').length;

  // Cruce variante x variante: Meta dice "sin stock" pero Tiendanube TIENE stock.
  const desync = [];
  let matched = 0;
  // Agrupación por producto (los items del feed de TN comparten el nombre del producto).
  const groups = new Map();
  for (const item of items) {
    const tn = byVariant.get(String(item.retailer_id));
    if (tn) matched += 1;
    const g = groups.get(item.name) || { total: 0, enStockMeta: 0, tn: null };
    g.total += 1;
    if (item.availability === 'in stock') g.enStockMeta += 1;
    if (tn) g.tn = tn;
    groups.set(item.name, g);

    if (tn && item.availability !== 'in stock' && (tn.stockVariante === null || tn.stockVariante > 0)) {
      desync.push({ item: item.name, stock_tiendanube: tn.stockVariante === null ? 'sin tracking' : tn.stockVariante });
    }
  }

  // Productos COMPLETOS invisibles en ads (ningún talle "in stock" en Meta) aunque
  // Tiendanube tiene stock del producto: esto es lo que la agencia no suele mirar.
  const invisibles = [...groups.entries()]
    .filter(([, g]) => g.enStockMeta === 0 && g.tn && g.tn.stockProducto !== null && g.tn.stockProducto > 0)
    .map(([name, g]) => ({ producto: name, talles_en_catalogo: g.total, stock_real_tiendanube: g.tn.stockProducto }));

  return {
    id: cat.id,
    nombre: cat.name,
    items_totales: cat.product_count,
    muestra_analizada: items.length,
    items_en_stock: inStock,
    items_sin_stock: items.length - inStock,
    items_ocultos: hidden,
    matchean_con_tiendanube_actual: matched,
    variantes_desincronizadas: desync.slice(0, 12),
    variantes_desincronizadas_total: desync.length,
    productos_invisibles_con_stock: invisibles.slice(0, 12),
    productos_invisibles_total: invisibles.length,
  };
}

async function gatherCatalogHealth() {
  const byVariant = await tiendanubeVariantMap();

  // Catálogos de los negocios del usuario + los que aparezcan enganchados a creatives.
  const catalogs = new Map();
  const businesses = await fbGet('me/businesses', { fields: 'name,owned_product_catalogs{id,name,product_count}' }).catch(() => ({ data: [] }));
  for (const b of businesses.data || []) {
    for (const c of (b.owned_product_catalogs && b.owned_product_catalogs.data) || []) {
      catalogs.set(c.id, c);
    }
  }

  // Qué product sets usan los anuncios HOY (por acá suele estar el problema real:
  // creatives apuntando a conjuntos viejos o vacíos).
  const usedSets = [];
  const creatives = await fbGet(`${config.meta.adAccountId}/adcreatives`, { fields: 'product_set_id', limit: 100 }).catch(() => ({ data: [] }));
  const setIds = [...new Set((creatives.data || []).map((c) => c.product_set_id).filter(Boolean))];
  for (const id of setIds.slice(0, 10)) {
    const set = await fbGet(`${id}`, { fields: 'name,product_count,product_catalog{id,name,product_count}' }).catch(() => null);
    if (!set) continue;
    usedSets.push({
      conjunto: set.name,
      productos_en_conjunto: set.product_count,
      catalogo: set.product_catalog ? set.product_catalog.name : null,
    });
    if (set.product_catalog && !catalogs.has(set.product_catalog.id)) {
      catalogs.set(set.product_catalog.id, set.product_catalog);
    }
  }

  const analyzed = [];
  for (const cat of catalogs.values()) {
    analyzed.push(await analyzeCatalog(cat, byVariant));
  }
  return { catalogos: analyzed, conjuntos_usados_por_anuncios: usedSets };
}

/* ------------------------------ Auditoría IA ------------------------------ */

const AUDIT_SYSTEM = `Sos un AUDITOR SENIOR de paid media especializado en e-commerce argentino (Meta Ads). Auditás la cuenta de BLACKS Indumentaria (ropa de trabajo y calzado de seguridad, Tiendanube) que maneja una agencia externa. Tu trabajo es detectar lo que la agencia NO está viendo: plata desperdiciada, problemas técnicos de catálogo, fatiga de anuncios, campañas que no convierten. Hablás claro y directo, en español argentino profesional, sin tecnicismos innecesarios (el dueño no es experto en ads). Cada afirmación tiene que estar respaldada por los números que te doy — no inventes datos.`;

function buildAuditPrompt(data) {
  return `Auditá esta cuenta de Meta Ads con los datos de los últimos 30 días. La preocupación del dueño: ROAS bajo, y sospecha que el catálogo no muestra los productos correctos (por ejemplo productos con stock que no aparecen).

DATOS REALES DE LA CUENTA (30 días):
${JSON.stringify(data, null, 1)}

Notas para interpretar:
- "variantes_desincronizadas": el catálogo de Meta dice "sin stock" pero Tiendanube (fuente de verdad) TIENE stock — esos talles no se muestran en los anuncios por error de sincronización.
- "productos_invisibles_con_stock": productos donde NINGÚN talle figura disponible en Meta pero el producto tiene stock real — invisibles en los anuncios de catálogo.
- "conjuntos_usados_por_anuncios" con productos_en_conjunto=0: el anuncio apunta a un conjunto VACÍO (no muestra nada).
- "matchean_con_tiendanube_actual" bajo respecto de la muestra = catálogo viejo/desactualizado que referencia productos que ya no existen.
- frecuencia > 3 = la misma gente ve el anuncio demasiadas veces (fatiga).
- Referencia del rubro: un ROAS sano para e-commerce de indumentaria suele ser 4x o más; CTR sano 1.5-3%.

Escribí TEXTO PLANO en todos los campos (nada de markdown, ni **negritas** ni viñetas dentro de los strings). Devolvé SOLO este JSON:
{
 "diagnostico": "2-4 frases: el porqué del ROAS bajo, con los números concretos",
 "funciona": ["qué está funcionando bien y conviene escalar (con números)"],
 "no_funciona": ["qué está rindiendo mal y por qué (con números)"],
 "problemas": [{"titulo": "corto", "detalle": "qué pasa exactamente y cómo afecta", "impacto": "alto|medio|bajo"}],
 "acciones": ["acciones CONCRETAS y priorizadas para pasarle a la agencia, la más importante primero"],
 "preguntas_agencia": ["preguntas incómodas pero justas para hacerle a la agencia"]
}`;
}

/**
 * Corre la auditoría completa. Tarda ~30-60 s (varias llamadas a Meta + Gemini).
 * Devuelve { generatedAt, dias, datos, analisis }.
 */
async function runAdsAudit() {
  if (!config.meta.adAccountId || !config.meta.adsAccessToken) {
    throw new Error('Falta configurar META_AD_ACCOUNT_ID / token de ads para auditar.');
  }
  console.log('[adsAudit] Juntando datos de la cuenta publicitaria...');
  const [performance, catalog] = await Promise.all([gatherPerformance(), gatherCatalogHealth()]);
  const datos = { ...performance, ...catalog };

  console.log('[adsAudit] Analizando con IA...');
  const analisis = await generateJson({
    system: AUDIT_SYSTEM,
    prompt: buildAuditPrompt(datos),
    maxTokens: 4000,
    temperature: 0.4,
  });

  return { generatedAt: new Date().toISOString(), dias: 30, datos, analisis };
}

/* ------------------- Auditoría de CONVERSIÓN (embudo) ------------------- */

/**
 * Junta el embudo completo (Google Analytics: visitas → carrito → checkout →
 * compra, por dispositivo y por fuente) + el embudo de la pauta de Meta
 * (click → llegó a la página → carrito → checkout → compra) + ventas reales de
 * Tiendanube, y Gemini diagnostica DÓNDE está la fricción que frena las compras.
 */
async function gatherFunnelData() {
  const { runReport, isEnabled } = require('./analytics');
  const pool = require('./db');

  let ga = null;
  if (isEnabled()) {
    const dateRanges = [{ startDate: '28daysAgo', endDate: 'today' }];
    const metrics = [
      { name: 'sessions' }, { name: 'itemsViewed' }, { name: 'addToCarts' },
      { name: 'checkouts' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' },
    ];
    const [totals, byDevice, bySource] = await Promise.all([
      runReport({ dateRanges, metrics }),
      runReport({ dateRanges, metrics, dimensions: [{ name: 'deviceCategory' }] }),
      runReport({
        dateRanges,
        metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
    ]);
    const nums = (row) => (row ? row.metricValues.map((m) => Number(m.value)) : []);
    const toFunnel = (row) => {
      const [sessions, itemViews, carts, checkouts, purchases2, revenue2] = nums(row);
      return { sesiones: sessions, vistas_de_producto: itemViews, agregados_al_carrito: carts, checkouts_iniciados: checkouts, compras: purchases2, ingresos: Math.round(revenue2 || 0) };
    };
    ga = {
      dias: 28,
      total: toFunnel((totals.rows || [])[0]),
      por_dispositivo: (byDevice.rows || []).map((r) => ({ dispositivo: r.dimensionValues[0].value, ...toFunnel(r) })),
      por_fuente: (bySource.rows || []).map((r) => ({
        fuente: r.dimensionValues[0].value,
        sesiones: Number(r.metricValues[0].value),
        compras: Number(r.metricValues[1].value),
      })),
      nota: 'El conteo de compras de GA SUBESTIMA (no todas las compras disparan el evento); las ventas reales son las de Tiendanube.',
    };
  }

  // Embudo de la PAUTA (Meta, 30d): dónde se caen los que vienen de anuncios.
  let meta = null;
  if (config.meta.adAccountId && config.meta.adsAccessToken) {
    const r = await fbGet(`${config.meta.adAccountId}/insights`, {
      level: 'account',
      fields: 'spend,inline_link_clicks,actions',
      date_preset: 'last_30d',
    }).catch(() => null);
    const row = r && r.data && r.data[0];
    if (row) {
      meta = {
        dias: 30,
        gasto: Math.round(Number(row.spend || 0)),
        clicks_en_anuncios: Number(row.inline_link_clicks || 0),
        llegaron_a_la_pagina: actionValue(row.actions, 'landing_page_view'),
        agregados_al_carrito: actionValue(row.actions, 'omni_add_to_cart') || actionValue(row.actions, 'add_to_cart'),
        checkouts_iniciados: actionValue(row.actions, 'omni_initiated_checkout') || actionValue(row.actions, 'initiate_checkout'),
        compras: purchases(row),
      };
    }
  }

  const { rows: tn } = await pool.query(
    `SELECT COALESCE(SUM(sales_30d), 0)::int AS unidades,
            COUNT(*) FILTER (WHERE sales_30d > 0)::int AS productos_vendidos
     FROM products_cache`
  );

  return { google_analytics: ga, pauta_meta: meta, tiendanube_real_30d: tn[0] };
}

const FUNNEL_SYSTEM = `Sos un CONSULTOR SENIOR de CRO (optimización de conversión) para e-commerce argentino en Tiendanube. Analizás el embudo de BLACKS Indumentaria (ropa de trabajo, venta minorista y mayorista) para encontrar DÓNDE y POR QUÉ la gente no termina de comprar. Hablás claro, en español argentino profesional, sin jerga innecesaria. Cada hipótesis tiene que estar anclada en los números que te doy; distinguí entre lo que los datos PRUEBAN y lo que es hipótesis a verificar.`;

function buildFunnelPrompt(data) {
  return `Analizá el embudo de conversión de la tienda con estos datos reales:

${JSON.stringify(data, null, 1)}

Referencias del rubro (e-commerce indumentaria AR): conversión sana 1-2% de las sesiones; carrito→compra sano ~30-40%; si mobile convierte MUCHO peor que desktop suele haber fricción de checkout móvil; si "llegaron_a_la_pagina" es bastante menor que "clicks_en_anuncios" hay problema de velocidad de carga.

Tené en cuenta lo típico de Tiendanube/indumentaria laboral: costo de envío que aparece tarde, dudas de talle (falta guía clara), stock por talle, pago (cuotas/transferencia), desconfianza (reseñas/fotos), checkout con muchos pasos.

Escribí TEXTO PLANO (sin markdown). Devolvé SOLO este JSON:
{
 "diagnostico": "2-4 frases: dónde está la fuga principal del embudo, con números",
 "embudo": [{"etapa": "nombre", "dato": "número o tasa calculada", "estado": "bien|regular|mal"}],
 "fricciones": [{"titulo": "corto", "evidencia": "el número que lo muestra", "hipotesis": "por qué pasa y cómo frena la compra", "impacto": "alto|medio|bajo"}],
 "acciones": ["acciones CONCRETAS priorizadas para destrabar compras (qué tocar en la tienda/checkout/fichas)"],
 "quick_wins": ["cambios de menos de 1 hora que se pueden hacer YA"]
}`;
}

async function runConversionAudit() {
  console.log('[adsAudit] Armando embudo de conversión (GA + Meta + Tiendanube)...');
  const datos = await gatherFunnelData();
  if (!datos.google_analytics && !datos.pauta_meta) {
    throw new Error('No hay Google Analytics ni Meta Ads configurados para analizar el embudo.');
  }
  const analisis = await generateJson({
    system: FUNNEL_SYSTEM,
    prompt: buildFunnelPrompt(datos),
    maxTokens: 4000,
    temperature: 0.4,
  });
  return { generatedAt: new Date().toISOString(), datos, analisis };
}

module.exports = { runAdsAudit, runConversionAudit };
