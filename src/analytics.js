const crypto = require('crypto');
const config = require('./config');

/**
 * Google Analytics 4 (Data API) sin dependencias: firma el JWT de la cuenta de
 * servicio con el crypto nativo de Node y consulta runReport.
 * Config: GA_PROPERTY_ID + GA_CREDENTIALS_B64 (el JSON de la cuenta en base64).
 * Todo es best-effort: sin credenciales, cada función devuelve null y nada rompe.
 */

function credentials() {
  if (!config.ga.credentialsB64) return null;
  try {
    return JSON.parse(Buffer.from(config.ga.credentialsB64, 'base64').toString('utf8'));
  } catch (_) {
    console.warn('[analytics] GA_CREDENTIALS_B64 inválido (no es base64 de un JSON).');
    return null;
  }
}

function isEnabled() {
  return Boolean(config.ga.propertyId && credentials());
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let tokenCache = { token: null, exp: 0 };

/** Access token OAuth2 con JWT firmado (cache ~55 min). */
async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const creds = credentials();
  if (!creds) return null;

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: creds.token_uri,
    iat,
    exp: iat + 3600,
  }));
  const input = `${header}.${claims}`;
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(creds.private_key);
  const jwt = `${input}.${b64url(signature)}`;

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`GA auth falló: ${JSON.stringify(data).slice(0, 200)}`);
  }
  tokenCache = { token: data.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

async function runReport(body) {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${config.ga.propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`GA runReport: ${(data.error && data.error.message) || res.status}`);
  }
  return data;
}

function rowsOf(report) {
  return (report && report.rows) || [];
}

// Clasificación de sessionSourceMedium a "quién trajo la visita", para separar
// tráfico PAGO (pauta) de orgánico. GA a veces manda variantes (fb/paid, an/paid,
// facebook.com/paid) así que matcheamos por patrón, no por string exacto.
function classifyMedium(sourceMedium) {
  const s = sourceMedium.toLowerCase();
  if (/^(ig|instagram|fb|facebook|an|messenger)\s*\/\s*(paid|cpc)/.test(s)) return 'meta_ads';
  if (/^google\s*\/\s*(cpc|paid)/.test(s)) return 'google_ads';
  if (/^(ig|instagram)\b/.test(s) || s.includes('l.instagram')) return 'instagram_organic';
  if (/^(fb|facebook)\b/.test(s)) return 'facebook_organic';
  return null;
}

/**
 * Resumen de la tienda (últimos N días). Todo lo que es "visitas/tráfico" sale de
 * Google Analytics; todo lo que es "ventas" reales se cruza después (en el server)
 * con products_cache.sales_30d de Tiendanube, porque el conteo de compras de GA
 * por producto SUBCUENTA (no todas las compras completan el evento de e-commerce).
 */
async function storeSummary({ days = 28 } = {}) {
  if (!isEnabled()) return null;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  const [totals, sourceMedium, products] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 25,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsViewed' }],
      orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
      limit: 15,
    }).catch(() => null), // si Tiendanube no manda items, no rompe
  ]);

  const t = rowsOf(totals)[0];
  const num = (row, i) => (row ? Number(row.metricValues[i].value) : 0);
  const totalSessions = num(t, 0);

  const bySourceMedium = rowsOf(sourceMedium).map((r) => ({
    sourceMedium: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
  }));

  // Tráfico pago desglosado (lo que pediste: % Meta Ads vs Google Ads vs orgánico).
  const sumBy = (kind) => bySourceMedium.filter((s) => classifyMedium(s.sourceMedium) === kind)
    .reduce((acc, s) => acc + s.sessions, 0);
  const metaAdsSessions = sumBy('meta_ads');
  const googleAdsSessions = sumBy('google_ads');
  const igSessions = metaAdsSessions + sumBy('instagram_organic'); // IG total (pago + orgánico)
  const paidTraffic = {
    metaAds: { sessions: metaAdsSessions, pct: totalSessions ? Math.round((metaAdsSessions / totalSessions) * 100) : 0 },
    googleAds: { sessions: googleAdsSessions, pct: totalSessions ? Math.round((googleAdsSessions / totalSessions) * 100) : 0 },
  };

  const trafficSources = [...bySourceMedium].sort((a, b) => b.sessions - a.sessions).slice(0, 8)
    .map((s) => ({ source: s.sourceMedium, sessions: s.sessions }));

  // Tiendanube manda cada variante como item distinto ("... (Negro, 39 AR)"):
  // agrupamos por producto base sumando vistas.
  const byProduct = {};
  for (const r of rowsOf(products)) {
    const base = r.dimensionValues[0].value.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!byProduct[base]) byProduct[base] = { name: base, views: 0 };
    byProduct[base].views += Number(r.metricValues[0].value);
  }

  return {
    days,
    source: 'google_analytics',
    sessions: totalSessions,
    users: num(t, 1),
    gaPurchases: num(t, 2), // OJO: agregado de GA, no cruzado con Tiendanube (ver server.js)
    gaRevenue: num(t, 3),   // ídem — ingresos según Analytics, puede diferir de Tiendanube
    igSessions,
    paidTraffic,
    trafficSources,
    topViewedProducts: Object.values(byProduct).sort((a, b) => b.views - a.views).slice(0, 10),
  };
}

/**
 * Cruza los productos más VISTOS (Google Analytics) con las ventas REALES de
 * Tiendanube (products_cache.sales_30d) por nombre normalizado.
 * Por qué hace falta: el evento de compra de e-commerce de GA no siempre se
 * completa (checkout en otro dominio, WhatsApp, etc.) y subcuenta ventas reales
 * — confirmado con un producto que vendió 3u en Tiendanube y GA marcaba 0.
 * Tiendanube es la fuente de verdad para "se vendió"; GA para "lo miran".
 */
async function topViewedWithRealSales(pool, { days = 28 } = {}) {
  const summary = await storeSummary({ days });
  if (!summary) return null;

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const { rows: catalog } = await pool.query(`SELECT name, sales_30d, price FROM products_cache WHERE sales_30d IS NOT NULL`);
  const byName = new Map(catalog.map((p) => [norm(p.name), p]));

  const merged = summary.topViewedProducts.map((p) => {
    const match = byName.get(norm(p.name));
    return {
      name: p.name,
      views: p.views,
      realSales30d: match ? Number(match.sales_30d) || 0 : null, // null = no lo encontramos en el catálogo actual
      realRevenue30d: match && match.sales_30d ? Number(match.sales_30d) * Number(match.price || 0) : 0,
    };
  });

  return { ...summary, topViewedProducts: merged };
}

module.exports = { isEnabled, storeSummary, topViewedWithRealSales, runReport };
