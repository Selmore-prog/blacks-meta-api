const { accessToken, credentials } = require('./analytics');
const config = require('./config');

/* =========================================================================
 * GOOGLE SEARCH CONSOLE — cómo nos encuentra la gente en Google.
 *
 * Analytics cuenta lo que pasa DESPUÉS del clic; Search Console cuenta lo que
 * pasa ANTES: por qué búsquedas aparecemos, cuántas veces nos muestran
 * (impresiones), cuántos entran (clics) y en qué POSICIÓN quedamos.
 *
 * Sobre la competencia, para no vender humo: Google no publica quién sale
 * primero por cada búsqueda. Lo que sí se puede leer acá es nuestra posición
 * media por consulta: si una búsqueda mantiene impresiones pero la posición
 * empeora y los clics caen, alguien nos pasó. Eso es lo más cerca que se llega
 * con datos propios y gratis.
 *
 * Requiere que la cuenta de servicio de GA (la misma) esté agregada como
 * usuario en la propiedad de Search Console.
 * ========================================================================= */

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function isEnabled() {
  return Boolean(config.gsc.siteUrl && credentials());
}

async function query(body) {
  const token = await accessToken(SCOPE);
  if (!token) return null;
  const site = encodeURIComponent(config.gsc.siteUrl);
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
    const account = (credentials() || {}).client_email || 'la cuenta de servicio del JSON de GA';
    // Los dos "no" habituales son distintos y se arreglan en lugares distintos:
    // la API apagada se prende en Google Cloud; el permiso se da en Search Console.
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      const link = (msg.match(/https:\/\/console\.developers\.google\.com\S+/) || [])[0];
      throw new Error(`Falta habilitar la API de Search Console en el proyecto de Google Cloud${link ? `: ${link}` : ''}. Después de habilitarla esperá un par de minutos y volvé a probar.`);
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error(`Search Console no da acceso: agregá a ${account} como usuario (permiso de lectura) en la propiedad ${config.gsc.siteUrl}. Detalle: ${msg}`);
    }
    if (res.status === 404) {
      throw new Error(`Search Console no encuentra la propiedad ${config.gsc.siteUrl}. Tiene que escribirse EXACTAMENTE como figura en Search Console (con https:// y barra final), o como 'sc-domain:blacksindumentaria.com.ar' si es propiedad de dominio.`);
    }
    throw new Error(`Search Console: ${msg}`);
  }
  return data.rows || [];
}

const pathFilter = (prefix) => (prefix && prefix !== '/'
  ? [{ filters: [{ dimension: 'page', operator: 'contains', expression: prefix }] }]
  : undefined);

function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round((Number(v) || 0) * f) / f;
}

function deltaPct(cur, prev) {
  if (!prev) return cur ? null : 0;
  return round(((cur - prev) / prev) * 100);
}

/** Suma un set de filas de GSC en un total. */
function totalsOf(rows) {
  const clicks = rows.reduce((a, r) => a + (r.clicks || 0), 0);
  const impressions = rows.reduce((a, r) => a + (r.impressions || 0), 0);
  // La posición media se pondera por impresiones (el promedio simple miente:
  // una búsqueda con 3 impresiones pesaría igual que una con 3.000).
  const posWeighted = impressions
    ? rows.reduce((a, r) => a + (r.position || 0) * (r.impressions || 0), 0) / impressions
    : 0;
  return {
    clicks,
    impressions,
    ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
    position: round(posWeighted, 1),
  };
}

/** Junta dos períodos por clave (búsqueda o página). */
function mergePeriods(curRows, prevRows, keyOf) {
  const map = new Map();
  const put = (rows, side) => rows.forEach((r) => {
    const key = keyOf(r);
    if (!map.has(key)) map.set(key, { key, cur: null, prev: null });
    map.get(key)[side] = { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: (r.ctr || 0) * 100, position: r.position || 0 };
  });
  put(curRows, 'cur');
  put(prevRows, 'prev');
  const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return [...map.values()].map((v) => {
    const c = v.cur || empty;
    const p = v.prev || empty;
    return {
      key: v.key,
      clicks: c.clicks, clicksPrev: p.clicks, clicksDelta: deltaPct(c.clicks, p.clicks),
      impressions: c.impressions, impressionsPrev: p.impressions, impressionsDelta: deltaPct(c.impressions, p.impressions),
      ctr: round(c.ctr, 2), ctrPrev: round(p.ctr, 2),
      position: round(c.position, 1), positionPrev: round(p.position, 1),
      // En posición, MENOS es mejor: el signo se invierte para que "positivo = mejoró".
      positionDelta: v.prev && v.cur ? round(p.position - c.position, 1) : null,
      isNew: !v.prev, isLost: !v.cur,
    };
  });
}

/**
 * Informe de búsqueda para una sección, comparando dos períodos.
 * `current`/`previous` son { start, end } en AAAA-MM-DD.
 */
async function searchReport({ prefix = '/', current, previous } = {}) {
  if (!isEnabled()) return { enabled: false, reason: 'Falta GSC_SITE_URL o las credenciales de la cuenta de servicio.' };
  const filters = pathFilter(prefix);
  const ask = (range, dimensions, rowLimit = 100) => query({
    startDate: range.start, endDate: range.end, dimensions, rowLimit,
    dimensionFilterGroups: filters, type: 'web',
  });

  try {
    const [qCur, qPrev, pCur, pPrev, dCur, dPrev] = await Promise.all([
      ask(current, ['query'], 150), ask(previous, ['query'], 150),
      ask(current, ['page'], 40), ask(previous, ['page'], 40),
      ask(current, ['device'], 5), ask(previous, ['device'], 5),
    ]);

    const queries = mergePeriods(qCur || [], qPrev || [], (r) => r.keys[0]);
    const pages = mergePeriods(pCur || [], pPrev || [], (r) => r.keys[0]);
    const devices = mergePeriods(dCur || [], dPrev || [], (r) => r.keys[0]);

    const totals = { current: totalsOf(qCur || []), previous: totalsOf(qPrev || []) };
    const byImpressions = [...queries].sort((a, b) => b.impressions - a.impressions);

    // TERRENO PERDIDO: búsquedas donde nos siguen mostrando igual o más pero
    // bajamos de posición. Es la señal más honesta de "alguien nos pasó".
    const lostGround = queries
      .filter((q) => q.impressionsPrev >= 30 && q.positionDelta !== null && q.positionDelta <= -1.5)
      .sort((a, b) => a.positionDelta - b.positionDelta)
      .slice(0, 12);
    const gainedGround = queries
      .filter((q) => q.impressions >= 30 && q.positionDelta !== null && q.positionDelta >= 1.5)
      .sort((a, b) => b.positionDelta - a.positionDelta)
      .slice(0, 12);
    // Mucha gente nos ve y no nos elige: primera página pero casi sin clics.
    const lowCtr = queries
      .filter((q) => q.impressions >= 100 && q.position <= 12 && q.ctr < 2)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12);

    return {
      enabled: true,
      site: config.gsc.siteUrl,
      totals,
      deltas: {
        clicks: deltaPct(totals.current.clicks, totals.previous.clicks),
        impressions: deltaPct(totals.current.impressions, totals.previous.impressions),
        ctr: deltaPct(totals.current.ctr, totals.previous.ctr),
        position: round(totals.previous.position - totals.current.position, 1), // + = mejoramos
      },
      topQueries: byImpressions.slice(0, 20),
      lostGround, gainedGround, lowCtr,
      pages: [...pages].sort((a, b) => b.impressions - a.impressions).slice(0, 15),
      devices,
    };
  } catch (err) {
    return { enabled: false, reason: err.message };
  }
}

module.exports = { isEnabled, searchReport };
