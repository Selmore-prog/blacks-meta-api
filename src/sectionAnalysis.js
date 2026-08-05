const { runReport, isEnabled } = require('./analytics');
const config = require('./config');

/* =========================================================================
 * ANÁLISIS PROFUNDO DE UNA SECCIÓN DEL SITIO (por ruta), comparando dos períodos.
 *
 * Nació de una pregunta concreta del dueño: en julio /mayorista tuvo MUCHÍSIMAS más
 * visitas que en mayo y MENOS consultas. El panel mostraba totales del sitio, así que
 * no había forma de ver qué pasaba adentro de una sección: de dónde venía esa gente,
 * a qué páginas entraba, hasta dónde llegaba y cuántos terminaban tocando el WhatsApp.
 *
 * Todo sale de Google Analytics 4 (Data API). Dos aclaraciones importantes sobre qué
 * se puede y qué no se puede medir, porque de eso depende leer bien el informe:
 *  - CONSULTA = clic saliente al link de WhatsApp (evento `click` de la medición
 *    mejorada de GA4). Es un clic, no una conversación: si alguien abre WhatsApp y no
 *    escribe, igual cuenta. El NÚMERO del link es lo único que separa una consulta
 *    mayorista (WA_MAYORISTA) de una minorista (WA_MINORISTA).
 *  - La sesión se atribuye a la sección si vio AL MENOS UNA página de esa ruta; los
 *    clics se cuentan sólo cuando ocurren ESTANDO en una página de la sección (y
 *    aparte, a nivel sitio, para poder comparar).
 * ========================================================================= */

const rows = (rep) => (rep && rep.rows) || [];
const dimAt = (r, i) => ((r.dimensionValues || [])[i] || {}).value || '';
const metAt = (r, i) => Number(((r.metricValues || [])[i] || {}).value || 0);
// El nombre del rango viaja SIEMPRE como última dimensión cuando se piden dos.
const rangeOf = (r) => dimAt(r, (r.dimensionValues || []).length - 1);

const CUR = 'cur';
const PREV = 'prev';

/** Variación porcentual, redondeada; null cuando no hay base con qué comparar. */
function deltaPct(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function pctOf(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

/* ---------------- filtros GA4 ---------------- */
const fPath = (prefix) => ({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: prefix } } });
const fEvent = (name) => ({ filter: { fieldName: 'eventName', stringFilter: { value: name } } });
const fLink = (value) => ({ filter: { fieldName: 'linkUrl', stringFilter: { matchType: 'CONTAINS', value } } });
const fAnd = (...xs) => ({ andGroup: { expressions: xs.filter(Boolean) } });

/**
 * Un clic de contacto = clic saliente a un link de WhatsApp. `who`:
 *  'mayorista' | 'minorista' | 'todos' (cualquier link de wa).
 */
function fContact(who = 'todos') {
  const may = config.ga.whatsappMayorista;
  const min = config.ga.whatsappMinorista;
  if (who === 'mayorista') return fAnd(fEvent('click'), fLink(may));
  if (who === 'minorista') return fAnd(fEvent('click'), fLink(min));
  return fAnd(fEvent('click'), { orGroup: { expressions: [fLink('wa.me'), fLink('whatsapp.com')] } });
}

/** Junta filas de un reporte de 2 períodos en un mapa por clave. */
function mergeByKey(rep, { key, metrics = 1 }) {
  const out = new Map();
  for (const r of rows(rep)) {
    const k = key(r);
    if (!out.has(k)) {
      out.set(k, { key: k, cur: new Array(metrics).fill(0), prev: new Array(metrics).fill(0) });
    }
    const slot = out.get(k);
    const bucket = rangeOf(r) === CUR ? slot.cur : slot.prev;
    for (let i = 0; i < metrics; i += 1) bucket[i] += metAt(r, i);
  }
  return out;
}

/**
 * Arma filas listas para la UI: valor actual, anterior y variación por campo.
 * `rates` son los índices que GA devuelve como fracción (0-1) y se muestran como %.
 */
function toRows(map, { fields, sortBy = 0, limit = 15, rates = [] }) {
  const asPct = (v) => Math.round(v * 1000) / 10;
  return [...map.values()]
    .map((v) => {
      const row = { key: v.key };
      fields.forEach((name, i) => {
        const cur = rates.includes(i) ? asPct(v.cur[i]) : v.cur[i];
        const prev = rates.includes(i) ? asPct(v.prev[i]) : v.prev[i];
        row[name] = cur;
        row[`${name}Prev`] = prev;
        row[`${name}Delta`] = deltaPct(cur, prev);
      });
      return row;
    })
    .sort((a, b) => (b[fields[sortBy]] + b[`${fields[sortBy]}Prev`]) - (a[fields[sortBy]] + a[`${fields[sortBy]}Prev`]))
    .slice(0, limit);
}

function ranges(current, previous) {
  return [
    { startDate: previous.start, endDate: previous.end, name: PREV },
    { startDate: current.start, endDate: current.end, name: CUR },
  ];
}

/**
 * Informe completo de la sección. `prefix` es la ruta ('/mayorista'), `current` y
 * `previous` son { start, end } en formato YYYY-MM-DD.
 */
async function sectionReport({ prefix = '/mayorista', current, previous } = {}) {
  if (!isEnabled()) throw new Error('Google Analytics no está configurado (falta GA_PROPERTY_ID o GA_CREDENTIALS_B64).');
  if (!current || !previous) throw new Error('Faltan los períodos a comparar.');
  const dateRanges = ranges(current, previous);
  const inSection = fPath(prefix);

  const [
    totalsRep, siteTotalsRep, pagesRep, sourcesRep, landingRep, referrersRep,
    destinationsRep, devicesRep, regionsRep, contactPagesRep, contactSourceRep,
    contactSiteRep, contactMinoristaRep, dailyRep, dailyContactRep, formsRep, eventsRep,
  ] = await Promise.all([
    // Totales de la sección
    runReport({
      dateRanges, dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' },
        { name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'userEngagementDuration' }],
    }),
    // Totales del sitio (para saber cuánto pesa la sección)
    runReport({ dateRanges, metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }] }),
    // Páginas de la sección
    runReport({
      dateRanges, dimensions: [{ name: 'pagePath' }], dimensionFilter: inSection,
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'engagementRate' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 40,
    }),
    // De dónde viene la gente (fuente/medio + campaña)
    runReport({
      dateRanges, dimensions: [{ name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }],
      dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'engagementRate' }, { name: 'bounceRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 30,
    }),
    // Por dónde ENTRAN (landing de la sesión)
    runReport({
      dateRanges, dimensions: [{ name: 'landingPage' }], dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'bounceRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 20,
    }),
    // Referrer de las vistas de la sección (buscador, app de Google, página interna…)
    runReport({
      dateRanges, dimensions: [{ name: 'pageReferrer' }], dimensionFilter: inSection,
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 20,
    }).catch(() => null),
    // A DÓNDE VAN: páginas cuyo referrer es una página de la sección
    runReport({
      dateRanges, dimensions: [{ name: 'pagePath' }],
      dimensionFilter: fAnd(
        { filter: { fieldName: 'pageReferrer', stringFilter: { matchType: 'CONTAINS', value: prefix } } },
        { notExpression: fPath(prefix) },
      ),
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 20,
    }).catch(() => null),
    // Dispositivo
    runReport({
      dateRanges, dimensions: [{ name: 'deviceCategory' }], dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 5,
    }),
    // Geografía
    runReport({
      dateRanges, dimensions: [{ name: 'region' }], dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12,
    }),
    // Consultas (clic a WhatsApp mayorista) hechas DESDE una página de la sección
    runReport({
      dateRanges, dimensions: [{ name: 'pagePath' }],
      dimensionFilter: fAnd(fContact('mayorista'), inSection),
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 20,
    }),
    // Consultas dentro de la sección, por fuente de la sesión (¿qué tráfico consulta?)
    runReport({
      dateRanges, dimensions: [{ name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }],
      dimensionFilter: fAnd(fContact('mayorista'), inSection),
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 20,
    }),
    // Consultas mayoristas de TODO el sitio (la sección no es el único lugar donde se consulta)
    runReport({ dateRanges, dimensionFilter: fContact('mayorista'), metrics: [{ name: 'eventCount' }] }),
    // Consultas minoristas del sitio (control: ¿cayó todo o sólo mayorista?)
    runReport({ dateRanges, dimensionFilter: fContact('minorista'), metrics: [{ name: 'eventCount' }] }),
    // Serie diaria de sesiones de la sección
    runReport({
      dateRanges, dimensions: [{ name: 'date' }], dimensionFilter: inSection,
      metrics: [{ name: 'sessions' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 200,
    }),
    // Serie diaria de consultas mayoristas (sitio completo)
    runReport({
      dateRanges, dimensions: [{ name: 'date' }], dimensionFilter: fContact('mayorista'),
      metrics: [{ name: 'eventCount' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 200,
    }),
    // Formulario de contacto (el otro canal de consulta)
    runReport({
      dateRanges, dimensions: [{ name: 'eventName' }],
      dimensionFilter: { orGroup: { expressions: [fEvent('form_start'), fEvent('form_submit'), fEvent('WhatsApp')] } },
      metrics: [{ name: 'eventCount' }], limit: 10,
    }),
    // Todos los eventos del sitio: sirve para saber QUÉ hay medido (y qué no)
    runReport({
      dateRanges, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 40,
    }),
  ]);

  /* ---------------- totales y embudo ---------------- */
  const pick = (rep, range) => rows(rep).find((r) => rangeOf(r) === range);
  const totalsCur = pick(totalsRep, CUR);
  const totalsPrev = pick(totalsRep, PREV);
  const siteCur = pick(siteTotalsRep, CUR);
  const sitePrev = pick(siteTotalsRep, PREV);
  const contactCur = pick(contactSiteRep, CUR);
  const contactPrev = pick(contactSiteRep, PREV);
  const minoristaCur = pick(contactMinoristaRep, CUR);
  const minoristaPrev = pick(contactMinoristaRep, PREV);

  const sumRows = (rep, range, idx = 0) => rows(rep).filter((r) => rangeOf(r) === range)
    .reduce((acc, r) => acc + metAt(r, idx), 0);

  const period = (totals, site, contacts, inSectionContacts, minorista) => {
    const sessions = totals ? metAt(totals, 0) : 0;
    return {
      sessions,
      views: totals ? metAt(totals, 1) : 0,
      users: totals ? metAt(totals, 2) : 0,
      engagementRate: totals ? Math.round(metAt(totals, 3) * 1000) / 10 : 0,
      bounceRate: totals ? Math.round(metAt(totals, 4) * 1000) / 10 : 0,
      avgEngagementSec: sessions ? Math.round(metAt(totals, 5) / sessions) : 0,
      viewsPerSession: sessions ? Math.round((metAt(totals, 1) / sessions) * 100) / 100 : 0,
      siteSessions: site ? metAt(site, 0) : 0,
      shareOfSite: site ? pctOf(sessions, metAt(site, 0)) : 0,
      contactsSite: contacts ? metAt(contacts, 0) : 0,
      contactsInSection: inSectionContacts,
      // Dónde ocurre la consulta importa: la sección puede sostenerse y la caída venir
      // de las fichas de producto (o al revés). Sin este corte se mezclan dos historias.
      contactsOutside: Math.max(0, (contacts ? metAt(contacts, 0) : 0) - inSectionContacts),
      contactRate: pctOf(inSectionContacts, sessions), // consultas por cada 100 sesiones de la sección
      contactsMinoristaSite: minorista ? metAt(minorista, 0) : 0,
    };
  };

  const funnel = {
    current: period(totalsCur, siteCur, contactCur, sumRows(contactPagesRep, CUR), minoristaCur),
    previous: period(totalsPrev, sitePrev, contactPrev, sumRows(contactPagesRep, PREV), minoristaPrev),
  };

  const kpi = (label, key, unit = '', help = '') => ({
    label, key, unit, help,
    cur: funnel.current[key], prev: funnel.previous[key],
    delta: deltaPct(funnel.current[key], funnel.previous[key]),
  });

  const kpis = [
    kpi('Sesiones en la sección', 'sessions', '', 'Visitas que vieron al menos una página de la sección.'),
    kpi('Páginas vistas', 'views'),
    kpi('Páginas por sesión', 'viewsPerSession', '', 'Cuánto navegan adentro de la sección.'),
    kpi('Tiempo medio', 'avgEngagementSec', 's', 'Segundos de atención por sesión.'),
    kpi('Interacción', 'engagementRate', '%', 'Sesiones que no rebotaron.'),
    kpi('Consultas desde la sección', 'contactsInSection', '', 'Clics al WhatsApp mayorista estando en una página de la sección.'),
    kpi('Consultas mayoristas (sitio)', 'contactsSite', '', 'Clics al WhatsApp mayorista en cualquier página.'),
    kpi('Consultas fuera de la sección', 'contactsOutside', '', 'Las mismas consultas pero desde home, contacto o fichas de producto.'),
    kpi('Consultas cada 100 sesiones', 'contactRate', '%', 'La tasa de conversión de la sección.'),
    kpi('Consultas minoristas (sitio)', 'contactsMinoristaSite', '', 'Control: sirve para ver si la caída es sólo de mayorista.'),
  ];

  /* ---------------- tablas ---------------- */
  const pages = toRows(mergeByKey(pagesRep, { key: (r) => dimAt(r, 0), metrics: 3 }),
    { fields: ['views', 'sessions', 'engagement'], limit: 25, rates: [2] });
  const sources = toRows(mergeByKey(sourcesRep, { key: (r) => `${dimAt(r, 0)}||${dimAt(r, 1)}`, metrics: 4 }),
    { fields: ['sessions', 'views', 'engagement', 'bounce'], limit: 20, rates: [2, 3] })
    .map((r) => ({ ...r, sourceMedium: r.key.split('||')[0], campaign: r.key.split('||')[1] }));
  const landings = toRows(mergeByKey(landingRep, { key: (r) => dimAt(r, 0), metrics: 3 }),
    { fields: ['sessions', 'engagement', 'bounce'], limit: 15, rates: [1, 2] });
  const entries = referrersRep ? toRows(mergeByKey(referrersRep, { key: (r) => dimAt(r, 0) || '(directo / sin referrer)', metrics: 1 }),
    { fields: ['views'], limit: 15 }) : [];
  const destinations = destinationsRep ? toRows(mergeByKey(destinationsRep, { key: (r) => dimAt(r, 0), metrics: 1 }),
    { fields: ['views'], limit: 15 }) : [];
  const devices = toRows(mergeByKey(devicesRep, { key: (r) => dimAt(r, 0), metrics: 2 }),
    { fields: ['sessions', 'engagement'], limit: 5, rates: [1] });
  const regions = toRows(mergeByKey(regionsRep, { key: (r) => dimAt(r, 0), metrics: 2 }),
    { fields: ['sessions', 'engagement'], limit: 10, rates: [1] });
  const contactPages = toRows(mergeByKey(contactPagesRep, { key: (r) => dimAt(r, 0), metrics: 1 }),
    { fields: ['contacts'], limit: 15 });
  const contactSources = toRows(mergeByKey(contactSourceRep, { key: (r) => `${dimAt(r, 0)}||${dimAt(r, 1)}`, metrics: 1 }),
    { fields: ['contacts'], limit: 15 })
    .map((r) => ({ ...r, sourceMedium: r.key.split('||')[0], campaign: r.key.split('||')[1] }));

  // Consultas por fuente cruzadas con sus sesiones: la tasa REAL de cada canal.
  const sourceQuality = sources.map((s) => {
    const c = contactSources.find((x) => x.key === s.key);
    return {
      sourceMedium: s.sourceMedium, campaign: s.campaign,
      sessions: s.sessions, sessionsPrev: s.sessionsPrev, sessionsDelta: s.sessionsDelta,
      contacts: c ? c.contacts : 0, contactsPrev: c ? c.contactsPrev : 0,
      rate: pctOf(c ? c.contacts : 0, s.sessions),
      ratePrev: pctOf(c ? c.contactsPrev : 0, s.sessionsPrev),
      engagement: s.engagement, engagementPrev: s.engagementPrev,
      bounce: s.bounce, bouncePrev: s.bouncePrev,
    };
  }).sort((a, b) => b.sessions - a.sessions);

  /* ---------------- series diarias ----------------
   * OJO con GA4: pidiendo dos rangos + dimensión `date`, cada rango devuelve TODAS las
   * fechas del reporte (las de afuera con 0). Si no se recorta por período, la serie
   * arranca con un mes entero de ceros. */
  const iso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const seriesFor = (range, from, to) => {
    const inRange = (d) => d >= from && d <= to;
    const sessions = new Map();
    for (const r of rows(dailyRep)) {
      if (rangeOf(r) !== range) continue;
      const d = iso(dimAt(r, 0));
      if (inRange(d)) sessions.set(d, metAt(r, 0));
    }
    const contacts = new Map();
    for (const r of rows(dailyContactRep)) {
      if (rangeOf(r) !== range) continue;
      const d = iso(dimAt(r, 0));
      if (inRange(d)) contacts.set(d, metAt(r, 0));
    }
    return [...new Set([...sessions.keys(), ...contacts.keys()])].sort()
      .map((d) => ({ date: d, sessions: sessions.get(d) || 0, contacts: contacts.get(d) || 0 }));
  };
  const daily = seriesFor(CUR, current.start, current.end);
  const dailyPrev = seriesFor(PREV, previous.start, previous.end);

  /* ---------------- qué está medido y qué no ---------------- */
  const eventTotals = mergeByKey(eventsRep, { key: (r) => dimAt(r, 0), metrics: 1 });
  const events = toRows(eventTotals, { fields: ['count'], limit: 40 });
  const forms = toRows(mergeByKey(formsRep, { key: (r) => dimAt(r, 0), metrics: 1 }), { fields: ['count'], limit: 5 });
  const has = (name) => events.some((e) => e.key === name && (e.count || e.countPrev));
  const tracking = {
    contactMetric: 'clic saliente al link de WhatsApp (evento click de la medición mejorada)',
    whatsappNumbers: { mayorista: config.ga.whatsappMayorista, minorista: config.ga.whatsappMinorista },
    forms,
    events: events.slice(0, 25),
    warnings: [
      !has('click') ? 'No hay eventos "click" salientes: sin eso no se puede medir ninguna consulta por WhatsApp.' : null,
      has('generate_lead') ? null : 'No hay un evento propio de "consulta mayorista" (generate_lead): lo único que se mide es el clic al link, que no confirma que la persona haya escrito.',
      'Un clic al WhatsApp no es una conversación: la comparación contra las consultas REALES recibidas hay que hacerla a mano.',
    ].filter(Boolean),
  };

  return {
    prefix,
    current: { ...current, label: current.label || `${current.start} a ${current.end}` },
    previous: { ...previous, label: previous.label || `${previous.start} a ${previous.end}` },
    generatedAt: new Date().toISOString(),
    funnel, kpis, pages, sources: sourceQuality, landings, entries, destinations,
    devices, regions, contactPages, contactSources, daily, dailyPrev, tracking,
  };
}

module.exports = { sectionReport };
