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

/**
 * Resumen de la tienda (últimos 28 días):
 *  - totales (sesiones, usuarios, compras, ingresos)
 *  - fuentes de tráfico (con Instagram destacado)
 *  - productos más vistos (items de e-commerce que manda Tiendanube)
 */
async function storeSummary({ days = 28 } = {}) {
  if (!isEnabled()) return null;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  const [totals, sources, products] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsViewed' }, { name: 'itemsPurchased' }],
      orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
      limit: 12,
    }).catch(() => null), // si Tiendanube no manda items, no rompe
  ]);

  const t = rowsOf(totals)[0];
  const num = (row, i) => (row ? Number(row.metricValues[i].value) : 0);

  const trafficSources = rowsOf(sources).map((r) => ({
    source: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
  }));
  const igSessions = trafficSources
    .filter((s) => /instagram|ig\b|l\.instagram/i.test(s.source))
    .reduce((acc, s) => acc + s.sessions, 0);

  // Tiendanube manda cada variante como item distinto ("... (Negro, 39 AR)"):
  // agrupamos por producto base sumando vistas/compras.
  const byProduct = {};
  for (const r of rowsOf(products)) {
    const base = r.dimensionValues[0].value.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!byProduct[base]) byProduct[base] = { name: base, views: 0, purchased: 0 };
    byProduct[base].views += Number(r.metricValues[0].value);
    byProduct[base].purchased += Number(r.metricValues[1].value);
  }

  return {
    days,
    sessions: num(t, 0),
    users: num(t, 1),
    purchases: num(t, 2),
    revenue: num(t, 3),
    igSessions,
    trafficSources: trafficSources.slice(0, 6),
    topViewedProducts: Object.values(byProduct).sort((a, b) => b.views - a.views).slice(0, 8),
  };
}

module.exports = { isEnabled, storeSummary, runReport };
