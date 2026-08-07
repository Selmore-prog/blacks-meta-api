/* =========================================================================
 * PAUTA COMPARADA: Meta Ads vs Google Ads con la MISMA vara
 *
 * El problema que resuelve: cada plataforma se autoevalúa con su propia
 * atribución (Meta se cuelga compras que Google también se cuelga), así que
 * comparar "el ROAS que dice Meta" contra "el ROAS que dice Google" no sirve
 * para decidir a dónde mandar la plata.
 *
 * Acá se compara con UNA sola vara: Google Analytics 4, última interacción,
 * para los dos canales. De cada lado:
 *   · GASTO   → Meta: API de Meta. Google: `advertiserAdCost` de GA4 (existe
 *               porque la cuenta de Google Ads está vinculada a la propiedad).
 *   · INGRESOS/COMPRAS → GA4 para los dos (misma regla de atribución).
 *   · Además se muestra APARTE lo que cada plataforma dice de sí misma, para
 *     que se vea el tamaño de la diferencia en vez de esconderla.
 *
 * Con eso salen: ROAS y CAC comparables, rendimiento POR TIPO de campaña
 * (Performance Max/Shopping vs Búsqueda vs Display vs Meta ventas/mensajes),
 * el embudo de cada canal (dónde se cae la gente) y una propuesta de
 * reasignación de presupuesto calculada con números, no a ojo.
 * ========================================================================= */

const config = require('./config');
const { runReport, isEnabled: gaEnabled } = require('./analytics');
const { generateJson } = require('./ai');

const GRAPH = 'https://graph.facebook.com';

const num = (v) => Number(v || 0);
const round = (v, d = 2) => Math.round(num(v) * 10 ** d) / 10 ** d;
const div = (a, b) => (num(b) ? round(num(a) / num(b)) : null);

/* ----------------------------- Google Analytics ----------------------------- */

const rowsOf = (rep) => (rep && rep.rows) || [];
const mv = (r, i) => num(((r.metricValues || [])[i] || {}).value);
const dv = (r, i) => ((r.dimensionValues || [])[i] || {}).value || '';

// Métricas pedidas siempre en el mismo orden (los índices se usan abajo).
const GA_METRICS = [
  { name: 'advertiserAdCost' },     // 0 · gasto (sólo Google Ads: GA no ve el de Meta)
  { name: 'advertiserAdClicks' },   // 1
  { name: 'advertiserAdImpressions' }, // 2
  { name: 'sessions' },             // 3
  { name: 'addToCarts' },           // 4
  { name: 'checkouts' },            // 5
  { name: 'ecommercePurchases' },   // 6
  { name: 'purchaseRevenue' },      // 7
];

function gaRow(r) {
  return {
    gasto: round(mv(r, 0)),
    clicks: mv(r, 1),
    impresiones: mv(r, 2),
    sesiones: mv(r, 3),
    carritos: mv(r, 4),
    checkouts: mv(r, 5),
    compras: mv(r, 6),
    ingresos: round(mv(r, 7)),
  };
}

const emptyRow = () => ({ gasto: 0, clicks: 0, impresiones: 0, sesiones: 0, carritos: 0, checkouts: 0, compras: 0, ingresos: 0 });

function addRow(a, b) {
  const out = { ...a };
  for (const k of Object.keys(emptyRow())) out[k] = round(num(a[k]) + num(b[k]));
  return out;
}

/** Agrupación de GA4 por canal (Paid Search, Cross-network, Paid Social, Display...). */
async function gaByChannel(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: GA_METRICS,
    limit: 30,
  });
  const out = {};
  for (const r of rowsOf(rep)) out[dv(r, 0)] = gaRow(r);
  return out;
}

/** Campañas pagas de GA4 (nombre + canal), que es de donde sale el costo de Google. */
async function gaByCampaign(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionSourceMedium' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: GA_METRICS,
    orderBys: [{ metric: { metricName: 'advertiserAdCost' }, desc: true }],
    limit: 100,
  });
  return rowsOf(rep).map((r) => ({
    campana: dv(r, 0),
    sourceMedium: dv(r, 1),
    canalGa: dv(r, 2),
    ...gaRow(r),
  }));
}

/** Consultas (WhatsApp / cotizador) por canal: la conversión del negocio mayorista. */
async function gaLeadsByChannel(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      orGroup: {
        expressions: ['generate_lead', 'whatsapp_modal_open', 'click_cotizador'].map((e) => ({
          filter: { fieldName: 'eventName', stringFilter: { value: e } },
        })),
      },
    },
    limit: 30,
  }).catch(() => null);
  const out = {};
  for (const r of rowsOf(rep)) out[dv(r, 0)] = mv(r, 0);
  return out;
}

/* =========================================================================
 * MAYORISTA vs MINORISTA (la corrección importante)
 *
 * La tienda tiene DOS negocios en el mismo sitio: la sección /mayorista, donde
 * los productos dicen "Consultar precio" y NO tienen carrito, y la tienda
 * minorista, donde sí se compra. Varias campañas de Google mandan a /mayorista:
 * medirlas por ROAS es imposible — nunca va a haber una compra ahí. Se miden
 * por CONSULTAS (el clic real a WhatsApp / el cotizador), que es la conversión
 * de ese negocio, y por lo que cuesta cada una.
 * ========================================================================= */

const MAYORISTA_PATH = '/mayorista';

/** Sesiones por campaña separadas según si aterrizan en la sección mayorista. */
async function gaSegmentByCampaign(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'landingPage' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 300,
  }).catch(() => null);
  const out = {};
  for (const r of rowsOf(rep)) {
    const campana = dv(r, 0);
    const landing = dv(r, 1) || '';
    const s = mv(r, 0);
    const cur = out[campana] || { mayorista: 0, minorista: 0 };
    if (landing.indexOf(MAYORISTA_PATH) === 0) cur.mayorista += s;
    else cur.minorista += s;
    out[campana] = cur;
  }
  return out;
}

/** Consultas por campaña: WhatsApp, cotizador y formulario. */
async function gaLeadsByCampaign(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'eventName' }],
    metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
    dimensionFilter: {
      orGroup: {
        expressions: ['generate_lead', 'click_cotizador', 'whatsapp_modal_open', 'view_b2b_landing', 'phone_click'].map((e) => ({
          filter: { fieldName: 'eventName', stringFilter: { value: e } },
        })),
      },
    },
    limit: 200,
  }).catch(() => null);
  const out = {};
  for (const r of rowsOf(rep)) {
    const campana = dv(r, 0);
    const evento = dv(r, 1);
    const cur = out[campana] || { consultas: 0, cotizador: 0, abrieronContacto: 0, vieronPropuesta: 0, telefono: 0 };
    const eventos = mv(r, 1);
    if (evento === 'generate_lead') cur.consultas += eventos;
    else if (evento === 'click_cotizador') cur.cotizador += eventos;
    else if (evento === 'whatsapp_modal_open') cur.abrieronContacto += mv(r, 0);
    else if (evento === 'view_b2b_landing') cur.vieronPropuesta += mv(r, 0);
    else if (evento === 'phone_click') cur.telefono += eventos;
    out[campana] = cur;
  }
  return out;
}

/** Fichas de producto vistas por campaña, separando mayorista de minorista. */
async function gaProductViewsByCampaign(days) {
  const rep = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'customEvent:product_mode' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'product_view' } } },
    limit: 200,
  }).catch(() => null);
  const out = {};
  for (const r of rowsOf(rep)) {
    const campana = dv(r, 0);
    const modo = dv(r, 1);
    const cur = out[campana] || { mayorista: 0, minorista: 0 };
    if (modo === 'mayorista') cur.mayorista += mv(r, 0);
    else if (modo === 'minorista') cur.minorista += mv(r, 0);
    out[campana] = cur;
  }
  return out;
}

/**
 * Qué negocio persigue una campaña, según a dónde manda la gente de verdad.
 * >65% a /mayorista = mayorista; >65% a la tienda = minorista; el resto, mixta.
 */
function segmentOf(seg) {
  if (!seg) return { segmento: 'minorista', pctMayorista: 0 };
  const total = seg.mayorista + seg.minorista;
  if (!total) return { segmento: 'minorista', pctMayorista: 0 };
  const pct = round((seg.mayorista / total) * 100, 1);
  return { segmento: pct >= 65 ? 'mayorista' : (pct <= 35 ? 'minorista' : 'mixta'), pctMayorista: pct };
}

/* --------------------------------- Meta Ads --------------------------------- */

async function fbGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: config.meta.adsAccessToken });
  const res = await fetch(`${GRAPH}/${config.meta.apiVersion}/${path}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Meta ${path}: ${(data.error && data.error.message) || res.status}`);
  return data;
}

const actionOf = (arr, type) => {
  const f = (arr || []).find((a) => a.action_type === type);
  return f ? num(f.value) : 0;
};
const metaPurchases = (r) => actionOf(r.actions, 'omni_purchase') || actionOf(r.actions, 'offsite_conversion.fb_pixel_purchase');
const metaRevenue = (r) => actionOf(r.action_values, 'omni_purchase') || actionOf(r.action_values, 'offsite_conversion.fb_pixel_purchase');
const metaMessages = (r) => actionOf(r.actions, 'onsite_conversion.messaging_conversation_started_7d');

/**
 * Campañas de Meta con gasto real + lo que Meta se atribuye. Detecta si la
 * campaña usa CATÁLOGO (product_set_id en el conjunto) y si optimiza a mensajes
 * de WhatsApp en vez de compras — son negocios distintos y no se comparan igual.
 */
async function metaCampaigns(days) {
  if (!config.meta.adsAccessToken || !config.meta.adAccountId) {
    return { enabled: false, reason: 'Falta META_ADS_ACCESS_TOKEN o META_AD_ACCOUNT_ID.', campaigns: [] };
  }
  const act = config.meta.adAccountId;
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const until = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  try {
    const [insights, adsets] = await Promise.all([
      fbGet(`${act}/insights`, {
        level: 'campaign',
        fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,inline_link_clicks,ctr,cpc,frequency,actions,action_values',
        time_range: JSON.stringify({ since, until }),
        limit: 50,
      }),
      fbGet(`${act}/adsets`, { fields: 'campaign_id,promoted_object,optimization_goal', limit: 300 }).catch(() => ({ data: [] })),
    ]);

    const byCampaign = new Map();
    for (const s of adsets.data || []) {
      const cur = byCampaign.get(s.campaign_id) || { catalogo: false, goals: new Set() };
      if (s.promoted_object && s.promoted_object.product_set_id) cur.catalogo = true;
      if (s.optimization_goal) cur.goals.add(s.optimization_goal);
      byCampaign.set(s.campaign_id, cur);
    }

    const campaigns = (insights.data || []).map((r) => {
      const extra = byCampaign.get(r.campaign_id) || { catalogo: false, goals: new Set() };
      const goals = [...extra.goals];
      const esMensajes = goals.includes('CONVERSATIONS') || /conversation|messages/i.test(r.objective || '');
      const tipo = extra.catalogo
        ? 'Meta · Catálogo (Advantage+)'
        : esMensajes ? 'Meta · Mensajes (WhatsApp)' : 'Meta · Ventas web (píxel)';
      return {
        canal: 'meta',
        id: r.campaign_id,
        campana: r.campaign_name,
        tipo,
        objetivo: r.objective,
        gasto: round(r.spend),
        impresiones: num(r.impressions),
        clicks: num(r.inline_link_clicks || r.clicks),
        ctr: round(r.ctr),
        frecuencia: round(r.frequency),
        // Lo que Meta se atribuye a sí mismo (NO comparable con Google).
        propioCompras: metaPurchases(r),
        propioIngresos: round(metaRevenue(r), 0),
        mensajes: metaMessages(r),
      };
    });
    return { enabled: true, campaigns };
  } catch (err) {
    return { enabled: false, reason: err.message, campaigns: [] };
  }
}

/* ------------------------- Clasificación de campañas ------------------------- */

/** Tipo de campaña de Google a partir del nombre y del canal que informa GA4. */
function googleType(name, canalGa) {
  const n = String(name || '').toLowerCase();
  if (/pmax|performance ?max|maxperf|max ?perf/.test(n)) return 'Google · Performance Max';
  if (/shopping|compras/.test(n)) return 'Google · Shopping';
  if (/display|gdn|remarketing|rmk/.test(n) || canalGa === 'Display') return 'Google · Display';
  if (/video|youtube|yt/.test(n)) return 'Google · Video';
  if (/marca|brand/.test(n)) return 'Google · Búsqueda de marca';
  if (/search|busqueda|búsqueda/.test(n) || canalGa === 'Paid Search') return 'Google · Búsqueda';
  if (canalGa === 'Cross-network') return 'Google · Performance Max';
  return 'Google · Otra';
}

/**
 * Semáforo de cada campaña, SEGÚN SU NEGOCIO.
 * Una campaña mayorista no puede tener ROAS: en /mayorista no hay carrito. Se
 * juzga por lo que cuesta cada consulta. Juzgarla por ventas es el error que
 * hace apagar campañas que sí están trayendo clientes.
 */
function veredicto(c, gastoTotal, valorConsulta = 0) {
  const peso = gastoTotal ? c.gasto / gastoTotal : 0;

  if (c.segmento === 'mayorista' || (c.segmento === 'mixta' && !c.compras)) {
    if (!c.consultas) {
      return peso >= 0.1
        ? { nivel: 'apagar', texto: 'No trajo ni una consulta y se lleva una parte grande del presupuesto' }
        : { nivel: 'revisar', texto: 'No trajo ninguna consulta en el período' };
    }
    // Con un valor por consulta cargado se puede juzgar igual que una de venta.
    if (valorConsulta > 0) {
      const retorno = (c.consultas * valorConsulta) / c.gasto;
      if (retorno >= 3) return { nivel: 'escalar', texto: `Cada consulta sale ${Math.round(c.gasto / c.consultas).toLocaleString('es-AR')} y vale mucho más: candidata a más presupuesto` };
      if (retorno >= 1) return { nivel: 'mantener', texto: 'Las consultas que trae valen más de lo que cuestan' };
      return { nivel: 'revisar', texto: 'Cada consulta cuesta más de lo que vale: revisar' };
    }
    return { nivel: 'mantener', texto: `Trae consultas mayoristas (${c.consultas}). Cargá cuánto vale una consulta para saber si conviene` };
  }

  if (c.roas === null) return { nivel: 'sin-datos', texto: 'Sin ingresos atribuidos todavía' };
  if (c.roas >= 3) return { nivel: 'escalar', texto: 'Rinde muy bien: candidata a más presupuesto' };
  if (c.roas >= 1.5) return { nivel: 'mantener', texto: 'Rinde: mantener' };
  if (c.roas >= 1) return { nivel: 'ajustar', texto: 'Apenas se paga sola: revisar antes de escalar' };
  if (c.consultas) return { nivel: 'revisar', texto: `No vende por la web pero trajo ${c.consultas} consulta(s): revisar antes de tocarla` };
  if (peso >= 0.1) return { nivel: 'apagar', texto: 'Pierde plata y se lleva una parte grande del presupuesto' };
  return { nivel: 'revisar', texto: 'Pierde plata: revisar o pausar' };
}

/* ------------------------------ Armado del informe ------------------------------ */

const GOOGLE_CHANNELS = ['Paid Search', 'Cross-network', 'Display', 'Paid Shopping', 'Paid Video'];
const META_CHANNELS = ['Paid Social'];

function sumChannels(byChannel, keys) {
  return keys.reduce((acc, k) => (byChannel[k] ? addRow(acc, byChannel[k]) : acc), emptyRow());
}

function kpis(row, { gasto = null, compras = null, ingresos = null } = {}) {
  const g = gasto !== null ? gasto : row.gasto;
  const c = compras !== null ? compras : row.compras;
  const i = ingresos !== null ? ingresos : row.ingresos;
  return {
    gasto: round(g, 0),
    ingresos: round(i, 0),
    compras: c,
    sesiones: row.sesiones,
    clicks: row.clicks,
    impresiones: row.impresiones,
    carritos: row.carritos,
    checkouts: row.checkouts,
    roas: div(i, g),
    cac: c ? round(g / c, 0) : null,
    cpc: row.clicks ? round(g / row.clicks, 0) : null,
    cpa: c ? round(g / c, 0) : null,
    convPct: row.sesiones ? round((c / row.sesiones) * 100, 2) : null,
    ticket: c ? round(i / c, 0) : null,
  };
}

/**
 * Propuesta de reasignación: saca plata de lo que pierde y la manda a lo que
 * rinde. Deliberadamente conservador — mueve como mucho la MITAD de lo que
 * gastan las campañas en rojo y avisa que el rendimiento no escala lineal.
 */
function buildReassignment(campanas, totales) {
  const conRoas = campanas.filter((c) => c.gasto > 0);
  // Una campaña mayorista con consultas NO es perdedora aunque su ROAS sea 0:
  // su conversión no es una compra web. Sólo entra si no trajo NADA.
  const perdedoras = conRoas.filter((c) => c.roas !== null && c.roas < 1 && !c.consultas)
    .sort((a, b) => b.gasto - a.gasto);
  const ganadoras = conRoas.filter((c) => c.roas !== null && c.roas >= 2)
    .sort((a, b) => b.roas - a.roas);
  if (!perdedoras.length || !ganadoras.length) return null;

  const montoEnRojo = round(perdedoras.reduce((a, c) => a + c.gasto, 0), 0);
  const monto = round(montoEnRojo * 0.5, 0);
  const roasOrigen = div(perdedoras.reduce((a, c) => a + c.ingresos, 0), montoEnRojo) || 0;
  // Se proyecta con el ROAS de las ganadoras castigado un 30%: al subir el
  // presupuesto el rendimiento marginal SIEMPRE baja.
  const gastoGan = ganadoras.reduce((a, c) => a + c.gasto, 0);
  const roasDestino = div(ganadoras.reduce((a, c) => a + c.ingresos, 0), gastoGan) || 0;
  const roasProyectado = round(roasDestino * 0.7);
  // OJO con la palabra: esto son INGRESOS adicionales (facturación), no ganancia
  // neta — de ahí todavía hay que descontar el costo de la mercadería.
  const ingresosExtra = round(monto * (roasProyectado - roasOrigen), 0);

  return {
    monto,
    montoEnRojo,
    roasOrigen: round(roasOrigen),
    roasDestino: round(roasDestino),
    roasProyectado,
    ingresosExtra,
    desde: perdedoras.slice(0, 5).map((c) => ({ campana: c.campana, canal: c.canal, gasto: c.gasto, roas: c.roas, ingresos: c.ingresos })),
    hacia: ganadoras.slice(0, 4).map((c) => ({ campana: c.campana, canal: c.canal, gasto: c.gasto, roas: c.roas, ingresos: c.ingresos })),
    supuesto: 'Proyección con el ROAS de las ganadoras castigado 30%: al subir el presupuesto el rendimiento marginal baja siempre. Movelo de a poco (25% por semana) y volvé a mirar.',
    pctTotal: totales.gasto ? round((monto / totales.gasto) * 100, 1) : null,
  };
}

/** Embudo comparable de un canal, medido en sesiones de GA4. */
function funnelOf(row, label) {
  const pasos = [
    { key: 'clicks', label: 'Clics en el aviso', valor: row.clicks || null },
    { key: 'sesiones', label: 'Llegaron al sitio', valor: row.sesiones },
    { key: 'carritos', label: 'Agregaron al carrito', valor: row.carritos },
    { key: 'checkouts', label: 'Empezaron el checkout', valor: row.checkouts },
    { key: 'compras', label: 'Compraron', valor: row.compras },
  ].filter((p) => p.valor !== null);

  const top = pasos[0] ? pasos[0].valor : 0;
  let anterior = null;
  const steps = pasos.map((p) => {
    const pctDelTotal = top ? round((p.valor / top) * 100, 1) : 0;
    const pctDelAnterior = anterior ? round((p.valor / anterior) * 100, 1) : null;
    anterior = p.valor;
    return { ...p, pctDelTotal, pctDelAnterior };
  });
  // La peor fuga: el escalón donde se cae el mayor porcentaje de los que venían.
  let peor = null;
  for (const s of steps) {
    if (s.pctDelAnterior === null) continue;
    const caida = 100 - s.pctDelAnterior;
    if (!peor || caida > peor.caida) peor = { key: s.key, label: s.label, caida: round(caida, 1) };
  }
  return { label, steps, peor };
}

/**
 * Informe completo. Nunca tira error hacia arriba: si falta una fuente lo dice
 * en `avisos` y muestra lo que sí tiene.
 */
async function paidPerformance({ days = 30, valorConsulta = 0 } = {}) {
  const avisos = [];
  if (!gaEnabled()) {
    return {
      ok: false,
      error: 'Google Analytics no está configurado (GA_PROPERTY_ID + GA_CREDENTIALS_B64). Sin eso no hay una vara común para comparar los dos canales.',
    };
  }

  const [byChannel, campanasGa, leads, meta, segmentos, leadsCampana, fichas] = await Promise.all([
    gaByChannel(days),
    gaByCampaign(days),
    gaLeadsByChannel(days),
    metaCampaigns(days),
    gaSegmentByCampaign(days),
    gaLeadsByCampaign(days),
    gaProductViewsByCampaign(days),
  ]);

  const googleRow = sumChannels(byChannel, GOOGLE_CHANNELS);
  const metaRow = sumChannels(byChannel, META_CHANNELS);
  const metaGasto = round(meta.campaigns.reduce((a, c) => a + c.gasto, 0), 0);
  const metaClicks = meta.campaigns.reduce((a, c) => a + c.clicks, 0);
  const metaImpresiones = meta.campaigns.reduce((a, c) => a + c.impresiones, 0);

  if (!meta.enabled) avisos.push(`Meta Ads no se pudo leer: ${meta.reason} Se muestra sólo Google.`);
  if (!googleRow.gasto) {
    avisos.push('Analytics no informa gasto de Google Ads. Suele ser que la cuenta de Google Ads no está vinculada a la propiedad de GA4 (Admin → Vínculos de productos → Google Ads).');
  }

  // Meta: el gasto sale de Meta y las conversiones de GA4 (misma vara que Google).
  // Los clics del aviso también son de Meta (GA sólo ve las sesiones que llegaron).
  const canalMeta = {
    id: 'meta',
    nombre: 'Meta Ads',
    detalle: 'Instagram + Facebook',
    ...kpis({ ...metaRow, clicks: metaClicks, impresiones: metaImpresiones }, { gasto: metaGasto }),
    consultas: leads['Paid Social'] || 0,
    gastoFuente: 'API de Meta',
    propio: meta.enabled ? {
      compras: meta.campaigns.reduce((a, c) => a + c.propioCompras, 0),
      ingresos: round(meta.campaigns.reduce((a, c) => a + c.propioIngresos, 0), 0),
      mensajes: meta.campaigns.reduce((a, c) => a + c.mensajes, 0),
    } : null,
  };
  canalMeta.propio = canalMeta.propio
    ? { ...canalMeta.propio, roas: div(canalMeta.propio.ingresos, metaGasto) }
    : null;

  const canalGoogle = {
    id: 'google',
    nombre: 'Google Ads',
    detalle: 'Búsqueda + Performance Max + Display',
    ...kpis(googleRow),
    consultas: (leads['Paid Search'] || 0) + (leads['Cross-network'] || 0) + (leads.Display || 0),
    gastoFuente: 'Analytics (cuenta vinculada)',
    propio: null,
  };

  // Campañas de Google. Una misma campaña puede aparecer en más de una red
  // (una de Búsqueda que además sirve en Display): GA4 las devuelve separadas y
  // así se dejan, pero con la red aclarada para que no parezcan dos campañas.
  const nombresRepetidos = new Set();
  const vistos = new Set();
  for (const c of campanasGa) {
    if (vistos.has(c.campana)) nombresRepetidos.add(c.campana);
    vistos.add(c.campana);
  }
  const RED = { Display: 'red de Display', 'Cross-network': 'multi-red', 'Paid Search': 'búsqueda', 'Paid Shopping': 'Shopping', 'Paid Video': 'video' };
  const campanasGoogle = campanasGa
    .filter((c) => c.gasto > 0)
    .map((c) => {
      const seg = segmentOf(segmentos[c.campana]);
      const lead = leadsCampana[c.campana] || {};
      return {
        canal: 'google',
        campana: nombresRepetidos.has(c.campana) && RED[c.canalGa] ? `${c.campana} · ${RED[c.canalGa]}` : c.campana,
        tipo: googleType(c.campana, c.canalGa),
        gasto: round(c.gasto, 0),
        impresiones: c.impresiones,
        clicks: c.clicks,
        sesiones: c.sesiones,
        carritos: c.carritos,
        checkouts: c.checkouts,
        compras: c.compras,
        ingresos: round(c.ingresos, 0),
        roas: div(c.ingresos, c.gasto),
        cpc: c.clicks ? round(c.gasto / c.clicks, 0) : null,
        ...seg,
        consultas: lead.consultas || 0,
        cotizador: lead.cotizador || 0,
        vieronPropuesta: lead.vieronPropuesta || 0,
        abrieronContacto: lead.abrieronContacto || 0,
        fichasMayorista: (fichas[c.campana] || {}).mayorista || 0,
        fichasMinorista: (fichas[c.campana] || {}).minorista || 0,
      };
    });

  /* Meta por campaña: Analytics guarda el ID de la campaña de Meta en
   * sessionCampaignName, así que se puede cruzar EXACTO contra la API de Meta
   * (no hace falta repartir a ojo). Lo que no matchea se reparte por gasto y
   * queda marcado como estimado. */
  const gaPorId = new Map();
  for (const c of campanasGa) {
    if (!/paid|cpc/i.test(c.sourceMedium) || /^google/i.test(c.sourceMedium)) continue;
    const prev = gaPorId.get(c.campana) || emptyRow();
    gaPorId.set(c.campana, addRow(prev, c));
  }
  const matcheadas = meta.campaigns.filter((c) => gaPorId.has(String(c.id)));
  const sinMatch = meta.campaigns.filter((c) => !gaPorId.has(String(c.id)));
  const restante = matcheadas.reduce((acc, c) => {
    const g = gaPorId.get(String(c.id));
    return { sesiones: acc.sesiones - g.sesiones, carritos: acc.carritos - g.carritos, checkouts: acc.checkouts - g.checkouts, compras: acc.compras - g.compras, ingresos: acc.ingresos - g.ingresos };
  }, { sesiones: metaRow.sesiones, carritos: metaRow.carritos, checkouts: metaRow.checkouts, compras: metaRow.compras, ingresos: metaRow.ingresos });
  const gastoSinMatch = sinMatch.reduce((a, c) => a + c.gasto, 0);

  const campanasMeta = meta.campaigns.map((c) => {
    const g = gaPorId.get(String(c.id));
    const seg = segmentOf(segmentos[String(c.id)]);
    const lead = leadsCampana[String(c.id)] || {};
    const share = gastoSinMatch ? c.gasto / gastoSinMatch : 0;
    const medido = g
      ? { sesiones: g.sesiones, carritos: g.carritos, checkouts: g.checkouts, compras: g.compras, ingresos: round(g.ingresos, 0) }
      : {
        sesiones: round(Math.max(restante.sesiones, 0) * share, 0),
        carritos: round(Math.max(restante.carritos, 0) * share, 0),
        checkouts: round(Math.max(restante.checkouts, 0) * share, 0),
        compras: round(Math.max(restante.compras, 0) * share, 1),
        ingresos: round(Math.max(restante.ingresos, 0) * share, 0),
      };
    return {
      canal: 'meta',
      campana: c.campana,
      tipo: c.tipo,
      objetivo: c.objetivo,
      gasto: c.gasto,
      impresiones: c.impresiones,
      clicks: c.clicks,
      ctr: c.ctr,
      frecuencia: c.frecuencia,
      ...medido,
      ingresosEstimados: !g,
      roas: div(medido.ingresos, c.gasto),
      cpc: c.clicks ? round(c.gasto / c.clicks, 0) : null,
      ...seg,
      // Las conversaciones de WhatsApp que informa Meta cuentan como consulta:
      // en Meta el mayorista se atiende por mensajes, no por la web.
      consultas: (lead.consultas || 0) + (c.mensajes || 0),
      cotizador: lead.cotizador || 0,
      vieronPropuesta: lead.vieronPropuesta || 0,
      abrieronContacto: lead.abrieronContacto || 0,
      fichasMayorista: (fichas[String(c.id)] || {}).mayorista || 0,
      fichasMinorista: (fichas[String(c.id)] || {}).minorista || 0,
      propioCompras: c.propioCompras,
      propioIngresos: c.propioIngresos,
      propioRoas: div(c.propioIngresos, c.gasto),
      mensajes: c.mensajes,
    };
  });
  if (sinMatch.length && meta.campaigns.length > 1) {
    avisos.push(`${sinMatch.length} campaña(s) de Meta no aparecen identificadas en Analytics: sus ingresos se reparten según cuánto gastaron (el total del canal sí es exacto).`);
  }

  const campanas = [...campanasGoogle, ...campanasMeta].sort((a, b) => b.gasto - a.gasto);
  const gastoTotal = round(campanas.reduce((a, c) => a + c.gasto, 0), 0);
  campanas.forEach((c) => {
    c.cpl = c.consultas ? round(c.gasto / c.consultas, 0) : null;      // lo que cuesta cada consulta
    c.valorConsultas = valorConsulta > 0 ? round(c.consultas * valorConsulta, 0) : null;
    // "Retorno total": ventas web + valor estimado de las consultas. Es lo único
    // que permite poner en la misma escala una campaña mayorista y una minorista.
    c.retornoTotal = valorConsulta > 0 ? round(c.ingresos + (c.valorConsultas || 0), 0) : null;
    c.roasTotal = valorConsulta > 0 ? div(c.retornoTotal, c.gasto) : null;
    c.veredicto = veredicto(c, gastoTotal, valorConsulta);
  });

  // Rendimiento por TIPO de campaña (catálogo/Pmax vs búsqueda vs display...).
  const tiposMap = {};
  for (const c of campanas) {
    const t = tiposMap[c.tipo] || { tipo: c.tipo, canal: c.canal, gasto: 0, ingresos: 0, compras: 0, sesiones: 0, clicks: 0, consultas: 0, campanas: 0 };
    t.gasto = round(t.gasto + c.gasto, 0);
    t.ingresos = round(t.ingresos + c.ingresos, 0);
    t.compras = round(t.compras + c.compras, 1);
    t.sesiones += c.sesiones;
    t.clicks += c.clicks;
    t.consultas += c.consultas || 0;
    t.campanas += 1;
    tiposMap[c.tipo] = t;
  }
  const tipos = Object.values(tiposMap).map((t) => ({
    ...t,
    roas: div(t.ingresos, t.gasto),
    cac: t.compras ? round(t.gasto / t.compras, 0) : null,
    cpl: t.consultas ? round(t.gasto / t.consultas, 0) : null,
    pctGasto: gastoTotal ? round((t.gasto / gastoTotal) * 100, 1) : 0,
  })).sort((a, b) => b.gasto - a.gasto);

  /* Los DOS negocios por separado: es la lectura que faltaba. La sección
   * /mayorista no tiene carrito, así que su conversión es la consulta. */
  const porSegmento = ['minorista', 'mixta', 'mayorista'].map((seg) => {
    const cs = campanas.filter((c) => c.segmento === seg);
    if (!cs.length) return null;
    const gasto = round(cs.reduce((a, c) => a + c.gasto, 0), 0);
    const ingresos = round(cs.reduce((a, c) => a + c.ingresos, 0), 0);
    const compras = round(cs.reduce((a, c) => a + c.compras, 0), 1);
    const consultas = cs.reduce((a, c) => a + (c.consultas || 0), 0);
    return {
      segmento: seg,
      campanas: cs.length,
      gasto,
      pctGasto: gastoTotal ? round((gasto / gastoTotal) * 100, 1) : 0,
      sesiones: cs.reduce((a, c) => a + c.sesiones, 0),
      ingresos,
      compras,
      consultas,
      roas: div(ingresos, gasto),
      cac: compras ? round(gasto / compras, 0) : null,
      cpl: consultas ? round(gasto / consultas, 0) : null,
      canales: [...new Set(cs.map((c) => c.canal))],
    };
  }).filter(Boolean);

  const totales = {
    gasto: round(canalMeta.gasto + canalGoogle.gasto, 0),
    ingresos: round(canalMeta.ingresos + canalGoogle.ingresos, 0),
    compras: round(canalMeta.compras + canalGoogle.compras, 1),
    sesiones: canalMeta.sesiones + canalGoogle.sesiones,
  };
  totales.roas = div(totales.ingresos, totales.gasto);
  totales.cac = totales.compras ? round(totales.gasto / totales.compras, 0) : null;
  totales.resultado = round(totales.ingresos - totales.gasto, 0);

  const canales = [canalMeta, canalGoogle]
    .filter((c) => c.gasto > 0 || c.sesiones > 0)
    .map((c) => ({ ...c, pctGasto: totales.gasto ? round((c.gasto / totales.gasto) * 100, 1) : 0 }));

  const embudos = {
    meta: funnelOf({ ...metaRow, clicks: metaClicks }, 'Meta Ads'),
    google: funnelOf(googleRow, 'Google Ads'),
  };

  /* Embudo del negocio MAYORISTA: no termina en una compra sino en una consulta.
   * Sin esto, las campañas que mandan a /mayorista parecen no convertir nunca. */
  const mayoristas = campanas.filter((c) => c.segmento === 'mayorista' || c.segmento === 'mixta');
  const sum = (k) => mayoristas.reduce((a, c) => a + (c[k] || 0), 0);
  const embudoMayorista = mayoristas.length ? {
    label: 'Pauta que va a la sección mayorista',
    steps: [
      { key: 'clicks', label: 'Clics en el aviso', valor: sum('clicks') },
      { key: 'sesiones', label: 'Llegaron al sitio', valor: sum('sesiones') },
      { key: 'fichas', label: 'Abrieron una ficha mayorista', valor: sum('fichasMayorista') },
      { key: 'consultas', label: 'Consultaron (WhatsApp / cotizador)', valor: sum('consultas') + sum('cotizador') },
    ],
  } : null;
  if (embudoMayorista) {
    let anterior = null;
    let peor = null;
    embudoMayorista.steps = embudoMayorista.steps.map((s) => {
      const pctDelAnterior = anterior ? round((s.valor / anterior) * 100, 1) : null;
      anterior = s.valor;
      // Los caminos no son obligatorios: se puede consultar desde una categoría
      // sin abrir ninguna ficha. Un paso que da más de 100% no es una fuga, es
      // un atajo — se marca en vez de dibujar una caída que no existe.
      const noSecuencial = pctDelAnterior !== null && pctDelAnterior > 105;
      if (pctDelAnterior !== null && !noSecuencial && (!peor || 100 - pctDelAnterior > peor.caida)) {
        peor = { key: s.key, label: s.label, caida: round(100 - pctDelAnterior, 1) };
      }
      return { ...s, pctDelAnterior, noSecuencial };
    });
    embudoMayorista.peor = peor;
    embudoMayorista.gasto = round(sum('gasto'), 0);
    embudoMayorista.cpl = sum('consultas') ? round(sum('gasto') / sum('consultas'), 0) : null;
  }

  // Cuánto de lo que se vende NO viene de la pauta (contexto: sin esto el ROAS
  // se lee como si la tienda dependiera sólo de los anuncios).
  const totalSitio = Object.values(byChannel).reduce((a, r) => addRow(a, r), emptyRow());
  const organico = {
    ingresos: round(totalSitio.ingresos - totales.ingresos, 0),
    compras: round(totalSitio.compras - totales.compras, 1),
    pctIngresos: totalSitio.ingresos ? round(((totalSitio.ingresos - totales.ingresos) / totalSitio.ingresos) * 100, 1) : null,
  };

  return {
    ok: true,
    days,
    desde: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10),
    hasta: new Date(Date.now() - 864e5).toISOString().slice(0, 10),
    moneda: 'ARS',
    canales,
    totales,
    tipos,
    porSegmento,
    campanas,
    embudos,
    embudoMayorista,
    organico,
    valorConsulta,
    reasignacion: buildReassignment(campanas, totales),
    avisos,
    metodologia: 'Gasto de Meta: API de Meta. Gasto de Google: el que Analytics recibe de la cuenta vinculada. Compras e ingresos de los DOS canales: Google Analytics 4, última interacción (misma vara). Lo que cada plataforma se atribuye a sí misma se muestra aparte. Las campañas que van a /mayorista se miden por CONSULTAS, no por ventas: en esa sección no hay carrito.',
  };
}

/* --------------------------------- Diagnóstico IA --------------------------------- */

function digest(rep) {
  const money = (n) => (n === null || n === undefined ? 's/d' : `$${Math.round(n).toLocaleString('es-AR')}`);
  const roas = (n) => (n === null ? 's/d' : `${n}x`);
  const lineas = [];
  lineas.push(`PERÍODO: últimos ${rep.days} días (${rep.desde} a ${rep.hasta}). Moneda: pesos argentinos.`);
  lineas.push(`TOTAL PAUTA: gasto ${money(rep.totales.gasto)} · ingresos atribuidos ${money(rep.totales.ingresos)} · ROAS ${roas(rep.totales.roas)} · ${rep.totales.compras} compras · CAC ${money(rep.totales.cac)}.`);
  lineas.push(`VENTAS QUE NO VIENEN DE LA PAUTA: ${money(rep.organico.ingresos)} (${rep.organico.pctIngresos}% del total del sitio).`);
  lineas.push('\nPOR CANAL (misma vara: Analytics, última interacción):');
  for (const c of rep.canales) {
    lineas.push(`- ${c.nombre}: gasto ${money(c.gasto)} (${c.pctGasto}% del total) · ingresos ${money(c.ingresos)} · ROAS ${roas(c.roas)} · ${c.compras} compras · CAC ${money(c.cac)} · ${c.sesiones} sesiones · conversión ${c.convPct ?? 's/d'}% · CPC ${money(c.cpc)} · consultas ${c.consultas}` +
      (c.propio ? ` || lo que la plataforma se atribuye a sí misma: ${c.propio.compras} compras / ${money(c.propio.ingresos)} / ROAS ${roas(c.propio.roas)}${c.propio.mensajes ? ` + ${c.propio.mensajes} conversaciones de WhatsApp` : ''}` : ''));
  }
  lineas.push('\nLOS DOS NEGOCIOS POR SEPARADO (la tienda tiene una sección MAYORISTA con "Consultar precio" y SIN carrito, y una sección minorista donde sí se compra online):');
  for (const s of rep.porSegmento || []) {
    const nombre = s.segmento === 'mayorista' ? 'Campañas que van a la sección MAYORISTA (no pueden generar compras web: su conversión es la CONSULTA)'
      : s.segmento === 'mixta' ? 'Campañas MIXTAS (parte a mayorista, parte a la tienda)'
        : 'Campañas que van a la tienda MINORISTA (sí pueden vender online)';
    lineas.push(`- ${nombre}: ${s.campanas} campaña(s) · gasto ${money(s.gasto)} (${s.pctGasto}% del total) · ${s.sesiones} sesiones · ${s.compras} compras / ${money(s.ingresos)} · ${s.consultas} consultas · costo por consulta ${money(s.cpl)} · ROAS ${roas(s.roas)}`);
  }
  if (rep.valorConsulta > 0) {
    lineas.push(`VALOR QUE EL DUEÑO LE ASIGNA A UNA CONSULTA MAYORISTA: ${money(rep.valorConsulta)} (usalo para comparar campañas mayoristas contra minoristas en la misma escala).`);
  } else {
    lineas.push('El dueño todavía NO cargó cuánto vale una consulta mayorista, así que las campañas mayoristas no se pueden pasar a pesos: compará su costo por consulta contra el de las otras y recomendá que cargue ese valor.');
  }

  lineas.push('\nPOR TIPO DE CAMPAÑA:');
  for (const t of rep.tipos) {
    lineas.push(`- ${t.tipo}: ${t.campanas} campaña(s) · gasto ${money(t.gasto)} (${t.pctGasto}%) · ingresos ${money(t.ingresos)} · ROAS ${roas(t.roas)} · CAC ${money(t.cac)} · ${t.consultas} consultas (costo por consulta ${money(t.cpl)})`);
  }
  lineas.push('\nCAMPAÑAS (ordenadas por gasto). "destino" dice a qué negocio manda cada una:');
  for (const c of rep.campanas.slice(0, 18)) {
    lineas.push(`- [${c.canal}] ${c.campana} (${c.tipo}) destino=${c.segmento.toUpperCase()}${c.segmento === 'mixta' ? ` (${c.pctMayorista}% a mayorista)` : ''}: gasto ${money(c.gasto)} · ${c.sesiones} sesiones · ${c.compras} compras · ingresos ${money(c.ingresos)} · ROAS ${roas(c.roas)} · ${c.consultas} consultas · costo por consulta ${money(c.cpl)} · CPC ${money(c.cpc)}${c.frecuencia ? ` · frecuencia ${c.frecuencia}` : ''}${c.ingresosEstimados ? ' [ingresos repartidos por gasto: Meta sin UTM]' : ''}`);
  }
  lineas.push('\nEMBUDO POR CANAL (sesiones):');
  for (const key of ['meta', 'google']) {
    const e = rep.embudos[key];
    if (!e) continue;
    lineas.push(`- ${e.label}: ${e.steps.map((s) => `${s.label} ${s.valor}${s.pctDelAnterior !== null ? ` (${s.pctDelAnterior}% del paso anterior)` : ''}`).join(' → ')}${e.peor ? ` · peor fuga: ${e.peor.label} (se cae el ${e.peor.caida}%)` : ''}`);
  }
  if (rep.embudoMayorista) {
    const e = rep.embudoMayorista;
    lineas.push(`- EMBUDO MAYORISTA (termina en consulta, no en compra): ${e.steps.map((s) => `${s.label} ${s.valor}${s.pctDelAnterior !== null ? ` (${s.pctDelAnterior}%)` : ''}`).join(' → ')}${e.peor ? ` · peor fuga: ${e.peor.label} (se cae el ${e.peor.caida}%)` : ''} · costo por consulta ${money(e.cpl)}`);
  }
  if (rep.reasignacion) {
    const r = rep.reasignacion;
    lineas.push(`\nREASIGNACIÓN CALCULADA POR EL SISTEMA: mover ${money(r.monto)} desde campañas con ROAS<1 (gastan ${money(r.montoEnRojo)}, ROAS ${roas(r.roasOrigen)}) hacia las de ROAS>=2 (ROAS ${roas(r.roasDestino)}, proyectado ${roas(r.roasProyectado)} al escalar). Eso serían ${money(r.ingresosExtra)} de FACTURACIÓN adicional (no ganancia neta) con el mismo presupuesto total.`);
  }
  if (rep.avisos.length) lineas.push(`\nLIMITACIONES DE LA MEDICIÓN: ${rep.avisos.join(' | ')}`);
  return lineas.join('\n');
}

const AI_SYSTEM = `Sos el director de performance de BLACKS Indumentaria (indumentaria de trabajo y calzado de seguridad, Argentina). Analizás la inversión publicitaria de Meta Ads y Google Ads y decidís dónde conviene poner la plata.

DATO CENTRAL DEL NEGOCIO (si lo ignorás, tus recomendaciones van a estar mal):
La tienda tiene DOS negocios en el mismo sitio. La sección /mayorista muestra "Consultar precio" y NO TIENE CARRITO: ahí es IMPOSIBLE que haya una compra online, la conversión es la CONSULTA por WhatsApp o el cotizador. La sección minorista sí vende online. Varias campañas de Google mandan a /mayorista.
⇒ Una campaña con destino MAYORISTA y ROAS 0 NO está fallando: está midiéndose con la vara equivocada. La juzgás por consultas y por lo que cuesta cada consulta, NUNCA por ROAS. Decirlo explícitamente es parte de tu trabajo.

CÓMO TRABAJÁS:
- Hablás en español argentino, claro y directo, para un dueño que NO es especialista en pauta. Nada de jerga sin explicar.
- Todo lo que afirmás va con el NÚMERO REAL que te pasaron. Si un dato no está, decís que no está: NUNCA inventás cifras, ni proyecciones que no salgan de los datos.
- Sabés que Meta y Google se auto-atribuyen ventas y que la comparación válida es la que usa la misma vara (Analytics). Si la diferencia entre lo que dice la plataforma y lo que dice Analytics es grande, lo señalás y explicás qué significa.
- Pocas compras (menos de 10 en el período) = poca evidencia: lo decís en vez de recomendar un cambio drástico.
- Las recomendaciones son ACCIONABLES y con monto: qué campaña, qué hacer, cuánta plata, qué se espera. Ordenadas por impacto en pesos.
- No recomendás apagar algo sólo por ROAS bajo si su objetivo no es venta directa (ej. campañas de mensajes de WhatsApp para mayorista): esas se miden por consultas.
- Analytics NO ve las ventas que se cierran por WhatsApp o teléfono (el negocio mayorista se cierra así): antes de recomendar apagar una campaña con cero ventas, aclarás que primero hay que chequear si esa campaña trae consultas que terminan cerrando por fuera de la web.
- Para proyectar cuánto rendiría mover presupuesto usás la REASIGNACIÓN CALCULADA que te pasan (ya castiga el ROAS un 30% porque al escalar el rendimiento marginal SIEMPRE baja). NUNCA multiplicás el monto por el ROAS actual de la campaña ganadora: eso da un número inflado que después no se cumple.`;

async function analyzePaidPerformance(rep, { contexto = '' } = {}) {
  const schema = {
    type: 'OBJECT',
    properties: {
      titular: { type: 'STRING' },
      diagnostico: { type: 'STRING' },
      donde_esta_la_plata: { type: 'STRING' },
      hallazgos: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            titulo: { type: 'STRING' },
            detalle: { type: 'STRING' },
            gravedad: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
          },
          required: ['titulo', 'detalle', 'gravedad'],
        },
      },
      recomendaciones: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            accion: { type: 'STRING' },
            donde: { type: 'STRING' },
            monto: { type: 'STRING' },
            por_que: { type: 'STRING' },
            impacto_esperado: { type: 'STRING' },
            prioridad: { type: 'NUMBER' },
          },
          required: ['accion', 'donde', 'por_que', 'impacto_esperado', 'prioridad'],
        },
      },
      tipo_de_campana_que_mejor_rinde: { type: 'STRING' },
      riesgos: { type: 'ARRAY', items: { type: 'STRING' } },
      que_medir_mejor: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['titular', 'diagnostico', 'donde_esta_la_plata', 'hallazgos', 'recomendaciones', 'tipo_de_campana_que_mejor_rinde'],
  };

  const prompt = `Estos son los datos REALES de la pauta. Analizalos y decidí dónde conviene la plata.

${digest(rep)}
${contexto ? `\nCONTEXTO QUE APORTA EL DUEÑO (cosas que los números no saben):\n${contexto}` : ''}

Qué necesito:
1. "titular": una sola frase con la conclusión principal, con números.
2. "diagnostico": 3 a 5 oraciones: cómo viene la inversión en conjunto, qué canal rinde mejor CON LA MISMA VARA y por qué.
3. "donde_esta_la_plata": dónde se está yendo el presupuesto hoy y cuánto de eso no vuelve.
4. "hallazgos": lo concreto que encontraste (campañas que queman plata, diferencias de atribución, fugas del embudo, frecuencia alta, CPC caro). Con números.
5. "recomendaciones": acciones ordenadas por impacto, con monto en pesos cuando corresponda. Incluí explícitamente si conviene mover presupuesto de un canal al otro y cuánto.
6. "tipo_de_campana_que_mejor_rinde": qué TIPO (catálogo, Performance Max, búsqueda, display, ventas web de Meta, mensajes) rinde mejor y cuál peor, con el ROAS de cada uno — separando lo minorista de lo mayorista, que no se comparan igual.
7. "riesgos": qué puede salir mal si se hacen esos cambios.
8. "que_medir_mejor": qué falta medir para decidir mejor (ej. UTM en los anuncios de Meta).

Sé concreto y no te extiendas de más: cada campo, lo justo. Formato EXACTO del JSON:
{"titular":"...","diagnostico":"...","donde_esta_la_plata":"...",
 "hallazgos":[{"titulo":"...","detalle":"...","gravedad":"alta|media|baja"}],
 "recomendaciones":[{"accion":"...","donde":"...","monto":"...","por_que":"...","impacto_esperado":"...","prioridad":1}],
 "tipo_de_campana_que_mejor_rinde":"...","riesgos":["..."],"que_medir_mejor":["..."]}`;

  // maxTokens alto a propósito: con el análisis completo, 4000 cortaba el JSON a
  // la mitad y caía al modelo de respaldo (que no respeta el esquema).
  const out = await generateJson({ system: AI_SYSTEM, prompt, schema, temperature: 0.35, maxTokens: 8000, thinkingBudget: 1024 });
  return normalizeAnalysis(out);
}

/**
 * El modelo de respaldo (Groq) no respeta el esquema: si vuelve con otras
 * claves, se acomodan acá para que el panel nunca muestre "undefined".
 */
function normalizeAnalysis(a = {}) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    titular: a.titular || a.resumen || '',
    diagnostico: a.diagnostico || '',
    donde_esta_la_plata: a.donde_esta_la_plata || a.donde_esta_plata || '',
    tipo_de_campana_que_mejor_rinde: a.tipo_de_campana_que_mejor_rinde || a.mejor_tipo || '',
    hallazgos: arr(a.hallazgos).map((h) => ({
      titulo: h.titulo || h.title || '',
      detalle: h.detalle || h.detail || h.descripcion || '',
      gravedad: ['alta', 'media', 'baja'].includes(h.gravedad) ? h.gravedad : 'media',
    })).filter((h) => h.titulo || h.detalle),
    recomendaciones: arr(a.recomendaciones).map((r, i) => ({
      accion: r.accion || r.recomendacion || '',
      donde: r.donde || r.campana || r.canal || '',
      monto: r.monto || '',
      por_que: r.por_que || r.motivo || r.razon || '',
      impacto_esperado: r.impacto_esperado || r.impacto || '',
      prioridad: Number(r.prioridad) || i + 1,
    })).filter((r) => r.accion),
    riesgos: arr(a.riesgos).map(String),
    que_medir_mejor: arr(a.que_medir_mejor || a.que_medir).map(String),
  };
}

module.exports = { paidPerformance, analyzePaidPerformance, digest };
