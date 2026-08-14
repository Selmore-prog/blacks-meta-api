const config = require('./config');

/* =========================================================================
 * GOOGLE ADS — cuánto cuesta cada consulta, y cuánta subasta perdemos.
 *
 * Con esto el informe deja de decir "esta campaña trae mucho tráfico que no
 * consulta" y pasa a decir "esta campaña te cuesta $X por consulta, contra $Y
 * de la otra": que es la decisión que realmente se toma con la plata.
 *
 * SOBRE LA COMPETENCIA (para no prometer de más): la pantalla "Análisis de
 * subasta" de Google Ads —la que lista competidores por nombre— NO está en la
 * API, es sólo de la interfaz. Lo que sí trae la API y sirve igual o más:
 *   · cuota de impresiones: de todas las veces que se podía mostrar tu aviso,
 *     en cuántas se mostró;
 *   · cuánto perdiste POR RANKING (te ganaron con mejor oferta/calidad) y
 *     cuánto POR PRESUPUESTO (te quedaste sin plata). Son dos problemas
 *     distintos con soluciones distintas, y la diferencia importa.
 *
 * AUTENTICACIÓN: Google Ads NO acepta cuentas de servicio (salvo con Workspace
 * y delegación de dominio), así que va con OAuth2 de usuario: client id, secret
 * y refresh token. El refresh token se genera UNA vez con
 * `node scripts/google-ads-token.js` y se guarda en .env.
 * ========================================================================= */

/* VERSIÓN DE LA API — ojo con esto, es la causa de error más tonta y más cara.
 * Google saca una versión nueva cada ~3 meses y da de baja las viejas al año y
 * pico. Una versión dada de baja NO devuelve un error entendible: devuelve 404,
 * como si la cuenta no existiera.
 * Comprobado el 13-ago-2026 pegándole a la API: v16, v17, v18 y v19 devuelven
 * 404 (dadas de baja) y v20 a v25 responden 401 (vivas, sólo falta autenticar).
 * Este archivo estaba fijo en v18, o sea que no habría funcionado ni con las
 * credenciales perfectas. Queda configurable para poder subirla sin tocar código.
 * Para saber cuál es la última: https://developers.google.com/google-ads/api/docs/release-notes
 */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v24';

function isEnabled() {
  const g = config.googleAds;
  return Boolean(g.developerToken && g.clientId && g.clientSecret && g.refreshToken && g.customerId);
}

/** Qué falta configurar, en castellano, para que el panel lo pueda mostrar. */
function missingConfig() {
  const g = config.googleAds;
  const faltan = [];
  if (!g.developerToken) faltan.push('GOOGLE_ADS_DEVELOPER_TOKEN (API Center de la cuenta administradora)');
  if (!g.clientId) faltan.push('GOOGLE_ADS_CLIENT_ID');
  if (!g.clientSecret) faltan.push('GOOGLE_ADS_CLIENT_SECRET');
  if (!g.refreshToken) faltan.push('GOOGLE_ADS_REFRESH_TOKEN (se genera con node scripts/google-ads-token.js)');
  if (!g.customerId) faltan.push('GOOGLE_ADS_CUSTOMER_ID (los 10 dígitos de la cuenta, sin guiones)');
  return faltan;
}

let tokenCache = { token: null, exp: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const g = config.googleAds;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: g.clientId,
      client_secret: g.clientSecret,
      refresh_token: g.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google Ads: no pude renovar el acceso (${data.error_description || data.error || res.status}). Si dice invalid_grant, el refresh token venció o se revocó: volvé a generarlo con node scripts/google-ads-token.js.`);
  }
  tokenCache = { token: data.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}

/** Corre una consulta GAQL y devuelve las filas (paginadas). */
async function gaql(query) {
  const g = config.googleAds;
  const token = await accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': g.developerToken,
    'Content-Type': 'application/json',
  };
  // Cuando la cuenta se administra desde una MCC hay que declarar cuál administra.
  if (g.loginCustomerId) headers['login-customer-id'] = g.loginCustomerId;

  const rows = [];
  let pageToken;
  do {
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${g.customerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query, pageToken, pageSize: 1000 }) }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data.error && data.error.message) || `HTTP ${res.status}`;
      const detail = data.error && data.error.details && JSON.stringify(data.error.details).slice(0, 300);
      if (/developer token/i.test(err)) {
        throw new Error(`Google Ads rechazó el developer token: ${err}. Si la cuenta todavía tiene acceso "de prueba", hay que pedir acceso básico en el API Center.`);
      }
      // Una versión dada de baja devuelve 404 sin explicar nada: sin este aviso
      // se pierden horas revisando permisos que estaban bien.
      if (res.status === 404) {
        throw new Error(`Google Ads devolvió 404 con la versión ${API_VERSION} de la API. `
          + 'Casi siempre significa que esa versión ya fue dada de baja (no que la cuenta no exista). '
          + 'Subí GOOGLE_ADS_API_VERSION a una más nueva y volvé a probar.');
      }
      if (res.status === 403 || res.status === 401) {
        throw new Error(`Google Ads no da acceso a la cuenta ${g.customerId}: ${err}. Revisá que el usuario que autorizó tenga permiso sobre esa cuenta y que GOOGLE_ADS_LOGIN_CUSTOMER_ID sea la administradora.`);
      }
      throw new Error(`Google Ads: ${err}${detail ? ` · ${detail}` : ''}`);
    }
    (data.results || []).forEach((r) => rows.push(r));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return rows;
}

// Los importes vienen en "micros": 1.000.000 de micros = 1 peso.
const money = (micros) => Math.round((Number(micros || 0) / 1e6) * 100) / 100;
const pct = (v) => Math.round((Number(v || 0) * 100) * 10) / 10;

/**
 * Gasto y rendimiento por campaña entre dos fechas (AAAA-MM-DD).
 * Incluye cuota de impresiones y pérdida por ranking/presupuesto.
 */
async function campaignSpend({ start, end } = {}) {
  const rows = await gaql(`
    SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
           metrics.search_impression_share, metrics.search_rank_lost_impression_share,
           metrics.search_budget_lost_impression_share, metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
  `);
  return rows.map((r) => ({
    id: r.campaign.id,
    name: r.campaign.name,
    channel: r.campaign.advertisingChannelType,
    status: r.campaign.status,
    cost: money(r.metrics.costMicros),
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    conversions: Math.round(Number(r.metrics.conversions || 0) * 10) / 10,
    avgCpc: money(r.metrics.averageCpc),
    // Cuota de impresiones: null cuando Google no la informa (típico en Pmax).
    impressionShare: r.metrics.searchImpressionShare != null ? pct(r.metrics.searchImpressionShare) : null,
    lostToRank: r.metrics.searchRankLostImpressionShare != null ? pct(r.metrics.searchRankLostImpressionShare) : null,
    lostToBudget: r.metrics.searchBudgetLostImpressionShare != null ? pct(r.metrics.searchBudgetLostImpressionShare) : null,
  }));
}

/** Términos de búsqueda REALES que activaron los avisos (lo que la gente tipeó). */
async function searchTerms({ start, end, limit = 60 } = {}) {
  const rows = await gaql(`
    SELECT search_term_view.search_term, campaign.name,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${Number(limit) || 60}
  `);
  return rows.map((r) => ({
    term: r.searchTermView.searchTerm,
    campaign: r.campaign.name,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    cost: money(r.metrics.costMicros),
    conversions: Math.round(Number(r.metrics.conversions || 0) * 10) / 10,
  }));
}

/**
 * GASTO POR PRODUCTO — Shopping y Performance Max.
 *
 * Es el equivalente al desglose `product_id` de Meta y sale de
 * `shopping_performance_view`, la única vista de Google Ads que reparte el
 * gasto por artículo del feed. Cubre las campañas de Shopping y las Performance
 * Max que tengan feed; una campaña de Búsqueda o Display NO aparece acá, porque
 * su gasto no es atribuible a un producto (se anuncia una palabra, no un ítem).
 *
 * `segments.product_item_id` es el id del feed de Merchant Center. Como puede
 * no coincidir con el id de Tiendanube, se devuelve también el título, que es
 * con lo que después se cruza por nombre (igual que con Meta).
 */
async function productSpend({ start, end } = {}) {
  const rows = await gaql(`
    SELECT segments.product_item_id, segments.product_title,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `);

  // Una misma fila puede venir partida por día o por campaña: se acumula por producto.
  const porProducto = new Map();
  for (const r of rows) {
    const seg = r.segments || {};
    const id = seg.productItemId || '';
    const title = seg.productTitle || '';
    const key = id || title;
    if (!key) continue;
    const acc = porProducto.get(key) || { itemId: id, title, cost: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
    acc.cost += Number(r.metrics.costMicros || 0) / 1e6;
    acc.impressions += Number(r.metrics.impressions || 0);
    acc.clicks += Number(r.metrics.clicks || 0);
    acc.conversions += Number(r.metrics.conversions || 0);
    acc.value += Number(r.metrics.conversionsValue || 0);
    porProducto.set(key, acc);
  }

  return [...porProducto.values()].map((p) => ({
    ...p,
    cost: Math.round(p.cost * 100) / 100,
    conversions: Math.round(p.conversions * 10) / 10,
    value: Math.round(p.value),
  })).sort((a, b) => b.cost - a.cost);
}

/**
 * Informe de pauta comparando dos períodos, listo para cruzar con Analytics.
 * Nunca tira error hacia arriba: si no está configurado o Google dice que no,
 * devuelve enabled:false con el motivo en castellano.
 */
async function adsReport({ current, previous } = {}) {
  if (!isEnabled()) {
    return { enabled: false, reason: `Falta configurar: ${missingConfig().join(' · ')}.`, missing: missingConfig() };
  }
  try {
    const [curCamp, prevCamp, terms] = await Promise.all([
      campaignSpend({ start: current.start, end: current.end }),
      campaignSpend({ start: previous.start, end: previous.end }),
      searchTerms({ start: current.start, end: current.end }).catch(() => []),
    ]);
    const prevByName = new Map(prevCamp.map((c) => [c.name, c]));
    const campaigns = curCamp.map((c) => {
      const p = prevByName.get(c.name);
      return {
        ...c,
        costPrev: p ? p.cost : 0,
        clicksPrev: p ? p.clicks : 0,
        conversionsPrev: p ? p.conversions : 0,
        impressionSharePrev: p ? p.impressionShare : null,
        lostToRankPrev: p ? p.lostToRank : null,
      };
    });
    const sum = (arr, k) => Math.round(arr.reduce((a, x) => a + (x[k] || 0), 0) * 100) / 100;
    return {
      enabled: true,
      currency: config.googleAds.currency,
      totals: {
        cost: sum(curCamp, 'cost'), costPrev: sum(prevCamp, 'cost'),
        clicks: sum(curCamp, 'clicks'), clicksPrev: sum(prevCamp, 'clicks'),
        conversions: sum(curCamp, 'conversions'), conversionsPrev: sum(prevCamp, 'conversions'),
      },
      campaigns,
      searchTerms: terms,
    };
  } catch (err) {
    return { enabled: false, reason: err.message };
  }
}

module.exports = {
  isEnabled, missingConfig, adsReport, campaignSpend, searchTerms, productSpend, gaql,
  API_VERSION,
};
