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

/** AAAA-MM-DD de hace `n` días en hora argentina (la de la tienda y la de Analytics). */
const fechaAR = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

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
    // Las filas de Meta tienen costo 0 (GA no ve ese gasto) y quedan al final:
    // con un límite chico se cortaban justo ésas y el cruce por ID fallaba.
    limit: 2000,
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

/** Igual que fbGet pero siguiendo `paging.next` hasta el final (con tope). */
async function fbGetAll(path, params = {}) {
  const out = [];
  let page = await fbGet(path, params);
  for (let i = 0; i < 20; i += 1) {
    out.push(...(page.data || []));
    const next = page.paging && page.paging.next;
    if (!next) break;
    const res = await fetch(next);
    page = await res.json().catch(() => ({}));
    if (!res.ok || page.error) throw new Error(`Meta ${path}: ${(page.error && page.error.message) || res.status}`);
  }
  return out;
}

/**
 * Varios objetos de Meta por ID en pocas llamadas (`?ids=`, de a 50). Si un
 * lote falla porque el token no ve alguno, se reintenta de a uno para no
 * perder los demás. Devuelve { id: objeto } sólo con los que se pudieron leer.
 */
async function fbByIds(ids, fields) {
  const out = {};
  const list = [...new Set(ids.map(String))];
  for (let i = 0; i < list.length; i += 50) {
    const lote = list.slice(i, i + 50);
    try {
      Object.assign(out, await fbGet('', { ids: lote.join(','), fields }));
    } catch {
      const sueltos = await Promise.all(lote.map((id) => fbGet(id, { fields }).catch(() => null)));
      sueltos.forEach((o, j) => { if (o) out[lote[j]] = o; });
    }
  }
  return out;
}

/* ESTADO DE CADA CAMPAÑA, en las mismas palabras para las dos plataformas.
 * "vigente" = sigue corriendo hoy. Sólo las vigentes entran en la comparación:
 * una campaña eliminada (las de Milbrands, por ejemplo) puede seguir apareciendo
 * en el período por los días que gastó antes de que la borraran, o por gente
 * que vuelve meses después con el link viejo — y eso no dice nada de cómo rinde
 * hoy cada canal. Se muestran aparte, marcadas, para que no se escondan. */
const ESTADO_META = {
  ACTIVE: 'activa', IN_PROCESS: 'activa', WITH_ISSUES: 'activa',
  PAUSED: 'pausada', ARCHIVED: 'archivada', DELETED: 'eliminada',
};
const estadoMeta = (effectiveStatus) => {
  const estado = ESTADO_META[effectiveStatus] || null;
  return { estado, vigente: !estado || estado === 'activa' };
};
const esIdMeta = (s) => /^\d{9,20}$/.test(String(s || ''));

/** Último día con gasto de una campaña de Meta (para decir "gastó hasta el 30-sep"). */
async function ultimoGastoMeta(campaignId, since, until) {
  const dias = await fbGetAll(`${campaignId}/insights`, {
    fields: 'spend', time_increment: 1, time_range: JSON.stringify({ since, until }), limit: 100,
  }).catch(() => []);
  const conGasto = dias.filter((d) => num(d.spend) > 0).map((d) => d.date_start).sort();
  return conGasto.length ? conGasto[conGasto.length - 1] : null;
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
 *
 * DE QUÉ CUENTAS SE LEE EL GASTO (acá estaba el ROAS de 79x): la pauta de Blacks
 * pasó por tres cuentas publicitarias (la de Red Hook Data, la que usaba
 * Milbrands y la propia desde sep-2026). Leer sólo META_AD_ACCOUNT_ID dejaba el
 * gasto cortado cada vez que se cambiaba de cuenta, mientras Analytics seguía
 * contando TODAS las ventas de Meta: con la cuenta vieja configurada, 30 días
 * daban $24k de gasto contra $1,9M de ventas. Ahora se lee la configurada MÁS
 * las cuentas dueñas de cada campaña que Analytics ve (el utm_campaign de Meta
 * es el ID de la campaña, y Meta dice de qué cuenta es), así el gasto y las
 * ventas salen siempre del mismo universo de campañas.
 */
async function metaCampaigns({ since, until, gaIds = [] }) {
  if (!config.meta.adsAccessToken) {
    return { enabled: false, reason: 'Falta META_ADS_ACCESS_TOKEN.', campaigns: [], cuentas: [], estados: {}, idsSinLeer: [] };
  }
  try {
    // 1. Las campañas que Analytics ve, con su cuenta y su estado de hoy.
    const vistas = await fbByIds(gaIds, 'account_id,name,effective_status');
    const configurada = config.meta.adAccountId || null;
    const detectadas = Object.values(vistas).map((c) => c.account_id && `act_${c.account_id}`).filter(Boolean);
    const actIds = [...new Set([configurada, ...detectadas].filter(Boolean))];
    if (!actIds.length) {
      return { enabled: false, reason: 'Falta META_AD_ACCOUNT_ID y Analytics no ve campañas de Meta para deducir la cuenta.', campaigns: [], cuentas: [], estados: {}, idsSinLeer: [] };
    }

    // 2. Gasto por campaña de cada cuenta. Una cuenta que falla no tumba a las otras.
    const cuentas = await Promise.all(actIds.map(async (act) => {
      try {
        const [info, insights, adsets] = await Promise.all([
          fbGet(act, { fields: 'name' }).catch(() => ({})),
          fbGetAll(`${act}/insights`, {
            level: 'campaign',
            fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,inline_link_clicks,ctr,cpc,frequency,actions,action_values',
            time_range: JSON.stringify({ since, until }),
            limit: 200,
          }),
          fbGetAll(`${act}/adsets`, { fields: 'campaign_id,promoted_object,optimization_goal', limit: 200 }).catch(() => []),
        ]);
        return { id: act, nombre: info.name || act, configurada: act === configurada, insights, adsets };
      } catch (err) {
        return { id: act, nombre: act, configurada: act === configurada, insights: [], adsets: [], error: err.message };
      }
    }));

    // 3. Estado de las campañas con gasto que Analytics no vio (las de WhatsApp no dejan visitas).
    const conGasto = cuentas.flatMap((c) => c.insights.map((r) => String(r.campaign_id)));
    const faltan = conGasto.filter((id) => !vistas[id]);
    const estadosExtra = faltan.length ? await fbByIds(faltan, 'effective_status') : {};
    const estados = {};
    for (const [id, o] of Object.entries({ ...vistas, ...estadosExtra })) {
      estados[id] = { ...estadoMeta(o.effective_status), nombre: o.name || null, cuentaId: o.account_id ? `act_${o.account_id}` : null };
    }

    const byCampaign = new Map();
    for (const s of cuentas.flatMap((c) => c.adsets)) {
      const cur = byCampaign.get(s.campaign_id) || { catalogo: false, goals: new Set() };
      if (s.promoted_object && s.promoted_object.product_set_id) cur.catalogo = true;
      if (s.optimization_goal) cur.goals.add(s.optimization_goal);
      byCampaign.set(s.campaign_id, cur);
    }

    const campaigns = cuentas.flatMap((cuenta) => cuenta.insights.map((r) => {
      const extra = byCampaign.get(r.campaign_id) || { catalogo: false, goals: new Set() };
      const goals = [...extra.goals];
      const esMensajes = goals.includes('CONVERSATIONS') || /conversation|messages/i.test(r.objective || '');
      const tipo = extra.catalogo
        ? 'Meta · Catálogo (Advantage+)'
        : esMensajes ? 'Meta · Mensajes (WhatsApp)' : 'Meta · Ventas web (píxel)';
      const est = estados[String(r.campaign_id)] || { estado: null, vigente: true };
      return {
        canal: 'meta',
        id: r.campaign_id,
        campana: r.campaign_name,
        cuenta: cuenta.nombre,
        cuentaId: cuenta.id,
        estado: est.estado,
        vigente: est.vigente,
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
    }));

    // Las que ya no corren: hasta qué día gastaron (son pocas, una llamada cada una).
    await Promise.all(campaigns.filter((c) => !c.vigente && c.gasto > 0).map(async (c) => {
      c.ultimoGasto = await ultimoGastoMeta(c.id, since, until);
    }));

    return {
      enabled: true,
      campaigns,
      estados,
      // IDs que Analytics ve pero que este token no puede leer: su gasto puede faltar.
      idsSinLeer: gaIds.filter((id) => !vistas[String(id)]),
      cuentas: cuentas.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        configurada: c.configurada,
        gasto: round(c.insights.reduce((a, r) => a + num(r.spend), 0), 0),
        campanas: c.insights.length,
        campanasVigentes: campaigns.filter((x) => x.cuentaId === c.id && x.vigente).length,
        error: c.error || null,
      })),
    };
  } catch (err) {
    return { enabled: false, reason: err.message, campaigns: [], cuentas: [], estados: {}, idsSinLeer: [] };
  }
}

/**
 * Consultas que Meta trae SIN pasar por la web: conversaciones de los anuncios
 * que abren WhatsApp directo y formularios de Facebook/Instagram. El sitio no
 * las puede registrar (nadie toca un botón de la tienda), así que en el detalle
 * de consultas Meta parecía traer casi nada: 8 contra las ~244 reales de
 * oct-2026. `idsVistos` son IDs de campaña de Meta que el sitio sí registró:
 * sirven para encontrar la cuenta aunque META_AD_ACCOUNT_ID apunte a otra.
 */
async function metaConsultasDirectas({ since, until, idsVistos = [] }) {
  if (!config.meta.adsAccessToken) return { enabled: false, reason: 'Falta META_ADS_ACCESS_TOKEN.', campanas: [] };
  try {
    const vistas = await fbByIds(idsVistos.filter(esIdMeta), 'account_id');
    const actIds = [...new Set([config.meta.adAccountId, ...Object.values(vistas).map((c) => c.account_id && `act_${c.account_id}`)].filter(Boolean))];
    const filas = (await Promise.all(actIds.map((act) => fbGetAll(`${act}/insights`, {
      level: 'campaign',
      fields: 'campaign_id,campaign_name,actions',
      time_range: JSON.stringify({ since, until }),
      limit: 200,
    }).catch(() => [])))).flat();
    const campanas = filas.map((r) => ({
      id: r.campaign_id,
      nombre: r.campaign_name,
      conversaciones: metaMessages(r),
      // Sólo los formularios de Facebook/Instagram: `lead` a secas también suma el
      // evento Lead del píxel, que es el mismo clic que el sitio ya registró.
      formularios: actionOf(r.actions, 'onsite_conversion.lead_grouped'),
    })).filter((c) => c.conversaciones || c.formularios);
    return { enabled: true, campanas };
  } catch (err) {
    return { enabled: false, reason: err.message, campanas: [] };
  }
}

/* ------------------------------- Google Ads (API) ------------------------------- */

/**
 * Estado de cada campaña de Google. GA4 da el gasto por nombre de campaña pero
 * no sabe si la campaña sigue viva: eso sólo lo dice la API de Google Ads. Sin
 * esto, las campañas que Milbrands borró el 30-sep aparecían como cualquier otra
 * (y hasta con veredicto de "apagar"). También trae el gasto de la API para
 * controlar que el de Analytics no se haya cortado.
 */
async function googleCampaignStates({ since, until }) {
  const gads = require('./googleAds');
  if (!gads.isEnabled()) return { enabled: false, reason: 'La API de Google Ads no está configurada.', porNombre: {} };
  try {
    const [todas, diario, presupuestos] = await Promise.all([
      gads.gaql('SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.serving_status FROM campaign'),
      gads.gaql(`SELECT campaign.name, segments.date, metrics.cost_micros FROM campaign
                 WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.cost_micros > 0`),
      gads.gaql(`SELECT account_budget.approved_spending_limit_micros, account_budget.amount_served_micros,
                        account_budget.approved_end_date_time FROM account_budget`).catch(() => []),
    ]);
    const porNombre = {};
    for (const r of todas) {
      const c = r.campaign;
      const estado = c.status === 'REMOVED' ? 'eliminada'
        : c.status === 'PAUSED' ? 'pausada'
          : c.primaryStatus === 'ENDED' ? 'finalizada' : 'activa';
      const prev = porNombre[c.name];
      // Dos campañas con el mismo nombre (una borrada y otra viva): manda la viva.
      if (prev && prev.vigente) continue;
      porNombre[c.name] = { id: c.id, estado, vigente: estado === 'activa', gastoApi: 0, ultimoGasto: null };
    }
    let gastoApi = 0;
    for (const r of diario) {
      const g = num(r.metrics.costMicros) / 1e6;
      gastoApi += g;
      const c = porNombre[r.campaign.name];
      if (!c) continue;
      c.gastoApi += g;
      if (!c.ultimoGasto || r.segments.date > c.ultimoGasto) c.ultimoGasto = r.segments.date;
    }

    /* Campañas activas que Google tiene SUSPENDIDAS: siguen "vigentes" (vuelven
     * solas cuando se resuelve), pero hoy no sale ningún anuncio. Lo típico es el
     * tope de gasto de la cuenta (presupuesto de cuenta en Facturación). */
    const activas = todas.filter((r) => r.campaign.status === 'ENABLED' && r.campaign.primaryStatus !== 'ENDED');
    let detenida = null;
    if (activas.length && activas.every((r) => r.campaign.servingStatus === 'SUSPENDED')) {
      const vigente = presupuestos.map((r) => r.accountBudget).find((b) => !b.approvedEndDateTime) || null;
      const tope = vigente && vigente.approvedSpendingLimitMicros ? num(vigente.approvedSpendingLimitMicros) / 1e6 : null;
      const consumido = vigente ? num(vigente.amountServedMicros) / 1e6 : null;
      const ultimo = Object.values(porNombre).filter((c) => c.vigente && c.ultimoGasto).map((c) => c.ultimoGasto).sort().pop() || null;
      detenida = { tope: round(tope, 0), consumido: round(consumido, 0), agotado: Boolean(tope && consumido >= tope), ultimoGasto: ultimo };
    }
    return { enabled: true, porNombre, gastoApi: round(gastoApi, 0), detenida };
  } catch (err) {
    return { enabled: false, reason: err.message, porNombre: {} };
  }
}

/* ---------------------------- Ventas reales (Tiendanube) ---------------------------- */

/**
 * Pedidos PAGOS de Tiendanube que entraron por un anuncio, por canal. Es el
 * control contra la realidad: Analytics pierde compras (navegador de Instagram,
 * cookies rechazadas) y cada plataforma se cuelga de más. Tiendanube guarda la
 * visita que terminó en el pedido (`customer_visit`): el utm_campaign de Meta es
 * el ID de la campaña, así que en Meta se puede separar por campaña; en Google
 * sólo queda el gclid, que no dice de qué campaña vino.
 */
async function ventasTiendanube(desde, hasta) {
  try {
    const pool = require('./db');
    const { rows } = await pool.query(`
      WITH v AS (
        SELECT o.total,
               lower(o.raw->'customer_visit'->'utm_parameters'->>'utm_source') AS src,
               lower(o.raw->'customer_visit'->'utm_parameters'->>'utm_medium') AS med,
               o.raw->'customer_visit'->'utm_parameters'->>'utm_campaign'      AS campana,
               COALESCE(o.raw->'customer_visit'->>'landing_page', '') || ' ' || COALESCE(o.landing_url, '') AS landing
          FROM orders_cache o
         WHERE (o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN $1::date AND $2::date
           AND o.status <> 'cancelled' AND o.payment_status = 'paid'
      )
      SELECT CASE
               WHEN src IN ('ig', 'fb', 'th', 'an', 'facebook', 'instagram') AND med ~ 'paid|cpc|social' THEN 'meta'
               WHEN landing ~ 'fbclid=' THEN 'meta'
               WHEN src = 'google' AND med ~ 'cpc|paid' THEN 'google'
               WHEN landing ~ '(gclid|gbraid|wbraid)=' THEN 'google'
               ELSE 'otro'
             END AS canal,
             campana, count(*)::int AS pedidos, COALESCE(sum(total), 0)::float AS ingresos
        FROM v GROUP BY 1, 2`, [desde, hasta]);
    return { enabled: true, rows };
  } catch (err) {
    return { enabled: false, reason: err.message, rows: [] };
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
  if (!c.vigente) {
    const hasta = c.ultimoGasto ? ` (gastó hasta el ${c.ultimoGasto.split('-').reverse().slice(0, 2).join('/')})` : '';
    return { nivel: 'no-corre', texto: `Ya no corre: está ${c.estado}${hasta}. No entra en la comparación` };
  }
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
  const alertas = []; // lo urgente, que va arriba de todo en el panel
  if (!gaEnabled()) {
    return {
      ok: false,
      error: 'Google Analytics no está configurado (GA_PROPERTY_ID + GA_CREDENTIALS_B64). Sin eso no hay una vara común para comparar los dos canales.',
    };
  }

  // Fechas en hora argentina: las mismas que Analytics (`${days}daysAgo` → ayer).
  const desde = fechaAR(days);
  const hasta = fechaAR(1);

  const [byChannel, campanasGa, leads, segmentos, leadsCampana, fichas, google, tn] = await Promise.all([
    gaByChannel(days),
    gaByCampaign(days),
    gaLeadsByChannel(days),
    gaSegmentByCampaign(days),
    gaLeadsByCampaign(days),
    gaProductViewsByCampaign(days),
    googleCampaignStates({ since: desde, until: hasta }),
    ventasTiendanube(desde, hasta),
  ]);

  // Filas de Meta en Analytics. Su utm_campaign es el ID de la campaña, y con
  // esos IDs Meta dice de qué cuenta es cada una: de ahí salen las cuentas a leer.
  const esMetaGa = (c) => /paid|cpc/i.test(c.sourceMedium) && !/^google/i.test(c.sourceMedium);
  const gaIdsMeta = [...new Set(campanasGa.filter((c) => esMetaGa(c) && esIdMeta(c.campana)).map((c) => c.campana))];
  const meta = await metaCampaigns({ since: desde, until: hasta, gaIds: gaIdsMeta });

  const estadoGoogle = (nombre) => google.porNombre[nombre] || { estado: null, vigente: true };
  const estadoMetaId = (id) => (meta.estados || {})[String(id)] || { estado: null, vigente: true };

  /* Lo que ya no corre sale de la comparación: sus filas de Analytics se restan
   * del canal (gasto, visitas y ventas juntos, para no desbalancear el ROAS) y se
   * informan aparte en `fuera`. */
  const noVigenteGa = (c) => (GOOGLE_CHANNELS.includes(c.canalGa) && !estadoGoogle(c.campana).vigente)
    || (META_CHANNELS.includes(c.canalGa) && esIdMeta(c.campana) && !estadoMetaId(c.campana).vigente);
  const fueraGa = campanasGa.filter(noVigenteGa);
  const sumarFilas = (rows) => rows.reduce((acc, r) => addRow(acc, r), emptyRow());
  const restar = (a, b) => {
    const out = { ...a };
    for (const k of Object.keys(emptyRow())) out[k] = round(num(a[k]) - num(b[k]));
    return out;
  };
  const googleRowTodo = sumChannels(byChannel, GOOGLE_CHANNELS);
  const googleFuera = sumarFilas(fueraGa.filter((c) => GOOGLE_CHANNELS.includes(c.canalGa)));
  const metaFuera = sumarFilas(fueraGa.filter((c) => META_CHANNELS.includes(c.canalGa)));
  const googleRow = restar(googleRowTodo, googleFuera);
  const metaRow = restar(sumChannels(byChannel, META_CHANNELS), metaFuera);

  const metaVigentes = meta.campaigns.filter((c) => c.vigente);
  const metaGasto = round(metaVigentes.reduce((a, c) => a + c.gasto, 0), 0);
  const metaClicks = metaVigentes.reduce((a, c) => a + c.clicks, 0);
  const metaImpresiones = metaVigentes.reduce((a, c) => a + c.impresiones, 0);

  if (!meta.enabled) avisos.push(`Meta Ads no se pudo leer: ${meta.reason} Se muestra sólo Google.`);
  if (!googleRowTodo.gasto) {
    avisos.push('Analytics no informa gasto de Google Ads. Suele ser que la cuenta de Google Ads no está vinculada a la propiedad de GA4 (Admin → Vínculos de productos → Google Ads).');
  }
  const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;
  if (meta.enabled) {
    const conf = meta.cuentas.find((c) => c.configurada);
    const otras = meta.cuentas.filter((c) => !c.configurada && c.campanasVigentes > 0).sort((a, b) => b.gasto - a.gasto);
    if (conf && !conf.campanasVigentes && otras.length) {
      avisos.push(`META_AD_ACCOUNT_ID apunta a «${conf.nombre}» (${conf.id}), que ya no tiene campañas corriendo${conf.gasto ? ` (en el período gastó ${pesos(conf.gasto)} antes de cortarse)` : ''}. El gasto de Meta se leyó también de las cuentas dueñas de las campañas que ve Analytics: ${otras.map((c) => `«${c.nombre}» (${c.id}, ${pesos(c.gasto)})`).join(', ')}. Conviene cambiar META_AD_ACCOUNT_ID a ${otras[0].id}: otras secciones del panel siguen leyendo sólo esa variable.`);
    }
    for (const c of meta.cuentas.filter((x) => x.error)) avisos.push(`No se pudo leer el gasto de la cuenta de Meta «${c.nombre}»: ${c.error}`);
    if (meta.idsSinLeer.length) {
      const filas = sumarFilas(campanasGa.filter((c) => esMetaGa(c) && meta.idsSinLeer.includes(c.campana)));
      avisos.push(`${meta.idsSinLeer.length} campaña(s) de Meta que Analytics ve no se pueden leer con el token de Meta (${filas.sesiones} visitas, ${pesos(filas.ingresos)} en ventas): si gastaron en el período, ese gasto falta y el ROAS de Meta da de más.`);
    }
  }
  if (!google.enabled) {
    avisos.push(`No se pudo leer el estado de las campañas de Google (${google.reason}): las pausadas o eliminadas no se pueden separar.`);
  } else {
    if (google.gastoApi && Math.abs(google.gastoApi - googleRowTodo.gasto) / google.gastoApi > 0.03) {
      avisos.push(`El gasto de Google que informa Analytics (${pesos(googleRowTodo.gasto)}) no coincide con el de la API de Google Ads (${pesos(google.gastoApi)}): el ROAS de Google puede estar corrido.`);
    }
    const d = google.detenida;
    if (d) {
      const fecha = d.ultimoGasto ? ` El último día con gasto fue el ${d.ultimoGasto.split('-').reverse().slice(0, 2).join('/')}.` : '';
      alertas.push(d.agotado
        ? `Google Ads NO está mostrando anuncios: la cuenta llegó a su tope de gasto (${pesos(d.tope)}, consumido ${pesos(d.consumido)}) y Google suspendió todas las campañas activas.${fecha} Se reactiva subiendo el tope en Facturación de Google Ads.`
        : `Google Ads NO está mostrando anuncios: Google tiene suspendidas todas las campañas activas.${fecha} Revisá Facturación en Google Ads.`);
    }
  }

  /* Control contra las ventas REALES de Tiendanube. En Meta se separa por
   * campaña (el utm_campaign es el ID) y quedan sólo las vigentes; en Google el
   * pedido trae el gclid sin campaña, así que se compara contra TODO su gasto. */
  const tnCanal = (canal, pred = () => true) => {
    const rows = tn.rows.filter((r) => r.canal === canal && pred(r));
    return { pedidos: rows.reduce((a, r) => a + r.pedidos, 0), ingresos: round(rows.reduce((a, r) => a + r.ingresos, 0), 0) };
  };
  const tnMetaPorCampana = {};
  for (const r of tn.rows.filter((x) => x.canal === 'meta' && x.campana)) {
    const cur = tnMetaPorCampana[r.campana] || { pedidos: 0, ingresos: 0 };
    tnMetaPorCampana[r.campana] = { pedidos: cur.pedidos + r.pedidos, ingresos: round(cur.ingresos + r.ingresos, 0) };
  }
  if (!tn.enabled) avisos.push(`No se pudieron leer los pedidos de Tiendanube (${tn.reason}): falta el control contra las ventas reales.`);

  // Meta: el gasto sale de Meta y las conversiones de GA4 (misma vara que Google).
  // Los clics del aviso también son de Meta (GA sólo ve las sesiones que llegaron).
  const canalMeta = {
    id: 'meta',
    nombre: 'Meta Ads',
    detalle: 'Instagram + Facebook',
    ...kpis({ ...metaRow, clicks: metaClicks, impresiones: metaImpresiones }, { gasto: metaGasto }),
    consultas: leads['Paid Social'] || 0,
    gastoFuente: 'API de Meta',
    cuentas: meta.cuentas || [],
    propio: meta.enabled ? {
      compras: metaVigentes.reduce((a, c) => a + c.propioCompras, 0),
      ingresos: round(metaVigentes.reduce((a, c) => a + c.propioIngresos, 0), 0),
      mensajes: metaVigentes.reduce((a, c) => a + c.mensajes, 0),
    } : null,
    reales: tn.enabled ? tnCanal('meta', (r) => !esIdMeta(r.campana) || estadoMetaId(r.campana).vigente) : null,
  };
  canalMeta.propio = canalMeta.propio
    ? { ...canalMeta.propio, roas: div(canalMeta.propio.ingresos, metaGasto) }
    : null;
  if (canalMeta.reales) canalMeta.reales.roas = div(canalMeta.reales.ingresos, metaGasto);

  const canalGoogle = {
    id: 'google',
    nombre: 'Google Ads',
    detalle: 'Búsqueda + Performance Max + Display',
    ...kpis(googleRow),
    consultas: (leads['Paid Search'] || 0) + (leads['Cross-network'] || 0) + (leads.Display || 0),
    gastoFuente: google.enabled ? 'Analytics (cuenta vinculada), controlado con la API de Google Ads' : 'Analytics (cuenta vinculada)',
    propio: null,
    reales: tn.enabled ? { ...tnCanal('google'), incluyeNoVigentes: googleFuera.gasto > 0 } : null,
  };
  if (canalGoogle.reales) canalGoogle.reales.roas = div(canalGoogle.reales.ingresos, googleRowTodo.gasto);

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
    // Las que ya no corren se listan también si dejaron ventas sin gastar (links viejos).
    .filter((c) => c.gasto > 0
      || (GOOGLE_CHANNELS.includes(c.canalGa) && !estadoGoogle(c.campana).vigente && c.ingresos > 0))
    .map((c) => {
      const seg = segmentOf(segmentos[c.campana]);
      const lead = leadsCampana[c.campana] || {};
      const est = estadoGoogle(c.campana);
      return {
        canal: 'google',
        campana: nombresRepetidos.has(c.campana) && RED[c.canalGa] ? `${c.campana} · ${RED[c.canalGa]}` : c.campana,
        estado: est.estado,
        vigente: est.vigente,
        ultimoGasto: est.ultimoGasto || null,
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
  // Lo que Analytics no puede asignar a una campaña se reparte sólo entre las
  // vigentes que mandan a la web: una de mensajes de WhatsApp no deja visitas.
  const esMensajes = (c) => c.tipo === 'Meta · Mensajes (WhatsApp)';
  const matcheadas = metaVigentes.filter((c) => gaPorId.has(String(c.id)));
  const sinMatch = metaVigentes.filter((c) => !gaPorId.has(String(c.id)) && !esMensajes(c));
  const restante = matcheadas.reduce((acc, c) => {
    const g = gaPorId.get(String(c.id));
    return { sesiones: acc.sesiones - g.sesiones, carritos: acc.carritos - g.carritos, checkouts: acc.checkouts - g.checkouts, compras: acc.compras - g.compras, ingresos: acc.ingresos - g.ingresos };
  }, { sesiones: metaRow.sesiones, carritos: metaRow.carritos, checkouts: metaRow.checkouts, compras: metaRow.compras, ingresos: metaRow.ingresos });
  const gastoSinMatch = sinMatch.reduce((a, c) => a + c.gasto, 0);

  // Campañas viejas que no gastaron en el período pero a las que Analytics les
  // sigue anotando ventas (gente que vuelve con el link de un anuncio de hace
  // meses): se listan para que se vea de dónde salen esas ventas.
  const conGastoMeta = new Set(meta.campaigns.map((c) => String(c.id)));
  const viejasSinGasto = [...gaPorId.entries()]
    .filter(([id, g]) => esIdMeta(id) && !conGastoMeta.has(id) && !estadoMetaId(id).vigente && g.ingresos > 0)
    .map(([id]) => {
      const est = estadoMetaId(id);
      const cuenta = (meta.cuentas || []).find((x) => x.id === est.cuentaId);
      return {
        canal: 'meta', id, campana: est.nombre || id, cuenta: cuenta ? cuenta.nombre : est.cuentaId,
        estado: est.estado, vigente: false, tipo: 'Meta · Ventas web (píxel)', gasto: 0,
        impresiones: 0, clicks: 0, ctr: 0, frecuencia: 0, propioCompras: 0, propioIngresos: 0, mensajes: 0,
      };
    });

  const campanasMeta = [...meta.campaigns, ...viejasSinGasto].map((c) => {
    const g = gaPorId.get(String(c.id));
    // Una campaña de mensajes que no manda a la web se juzga por conversaciones,
    // igual que las mayoristas (sin esto caía como "tienda" con ROAS 0).
    const seg = !g && esMensajes(c) ? { segmento: 'mayorista', pctMayorista: null } : segmentOf(segmentos[String(c.id)]);
    const lead = leadsCampana[String(c.id)] || {};
    const share = sinMatch.includes(c) && gastoSinMatch ? c.gasto / gastoSinMatch : 0;
    const medido = g
      ? { sesiones: g.sesiones, carritos: g.carritos, checkouts: g.checkouts, compras: g.compras, ingresos: round(g.ingresos, 0) }
      : {
        sesiones: round(Math.max(restante.sesiones, 0) * share, 0),
        carritos: round(Math.max(restante.carritos, 0) * share, 0),
        checkouts: round(Math.max(restante.checkouts, 0) * share, 0),
        compras: round(Math.max(restante.compras, 0) * share, 1),
        ingresos: round(Math.max(restante.ingresos, 0) * share, 0),
      };
    const real = tnMetaPorCampana[String(c.id)] || { pedidos: 0, ingresos: 0 };
    return {
      canal: 'meta',
      campana: c.campana,
      cuenta: c.cuenta,
      estado: c.estado,
      vigente: c.vigente,
      ultimoGasto: c.ultimoGasto || null,
      tipo: c.tipo,
      objetivo: c.objetivo,
      gasto: c.gasto,
      impresiones: c.impresiones,
      clicks: c.clicks,
      ctr: c.ctr,
      frecuencia: c.frecuencia,
      ...medido,
      ingresosEstimados: sinMatch.includes(c),
      roas: div(medido.ingresos, c.gasto),
      // Pedidos pagos de Tiendanube que entraron por esta campaña.
      realesPedidos: tn.enabled ? real.pedidos : null,
      realesIngresos: tn.enabled ? real.ingresos : null,
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
  if (sinMatch.length && metaVigentes.length > 1) {
    avisos.push(`${sinMatch.length} campaña(s) de Meta no aparecen identificadas en Analytics: sus ingresos se reparten según cuánto gastaron (el total del canal sí es exacto).`);
  }

  // Primero las que corren (ordenadas por gasto); las que ya no, al final.
  const campanas = [...campanasGoogle, ...campanasMeta]
    .sort((a, b) => (Number(b.vigente) - Number(a.vigente)) || (b.gasto - a.gasto));
  const vigentes = campanas.filter((c) => c.vigente);
  const gastoTotal = round(vigentes.reduce((a, c) => a + c.gasto, 0), 0);
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
  for (const c of vigentes) {
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
    const cs = vigentes.filter((c) => c.segmento === seg);
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

  // Lo que quedó afuera de la comparación por no correr más: plata gastada de
  // verdad en el período, informada aparte (nunca escondida).
  const noVigentes = campanas.filter((c) => !c.vigente);
  const fueraRow = addRow(googleFuera, metaFuera);
  const fuera = {
    campanas: noVigentes.length,
    gasto: round(googleFuera.gasto + meta.campaigns.filter((c) => !c.vigente).reduce((a, c) => a + c.gasto, 0), 0),
    ingresos: round(fueraRow.ingresos, 0),
    compras: round(fueraRow.compras, 1),
    sesiones: fueraRow.sesiones,
    detalle: noVigentes.map((c) => ({ canal: c.canal, campana: c.campana, estado: c.estado, gasto: c.gasto, ingresos: c.ingresos, ultimoGasto: c.ultimoGasto })),
  };

  const canales = [canalMeta, canalGoogle]
    .filter((c) => c.gasto > 0 || c.sesiones > 0)
    .map((c) => ({ ...c, pctGasto: totales.gasto ? round((c.gasto / totales.gasto) * 100, 1) : 0 }));

  const embudos = {
    meta: funnelOf({ ...metaRow, clicks: metaClicks }, 'Meta Ads'),
    google: funnelOf(googleRow, 'Google Ads'),
  };

  /* Embudo del negocio MAYORISTA: no termina en una compra sino en una consulta.
   * Sin esto, las campañas que mandan a /mayorista parecen no convertir nunca. */
  const mayoristas = vigentes.filter((c) => c.segmento === 'mayorista' || c.segmento === 'mixta');
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
  // Las ventas de campañas que ya no corren siguen siendo de pauta, no orgánicas.
  const totalSitio = Object.values(byChannel).reduce((a, r) => addRow(a, r), emptyRow());
  const pautaIngresos = totales.ingresos + fuera.ingresos;
  const organico = {
    ingresos: round(totalSitio.ingresos - pautaIngresos, 0),
    compras: round(totalSitio.compras - totales.compras - fuera.compras, 1),
    pctIngresos: totalSitio.ingresos ? round(((totalSitio.ingresos - pautaIngresos) / totalSitio.ingresos) * 100, 1) : null,
  };

  return {
    ok: true,
    days,
    desde,
    hasta,
    moneda: 'ARS',
    canales,
    totales,
    fuera,
    tipos,
    porSegmento,
    campanas,
    embudos,
    embudoMayorista,
    organico,
    valorConsulta,
    reasignacion: buildReassignment(vigentes, totales),
    avisos,
    alertas,
    metodologia: 'Gasto de Meta: API de Meta, de todas las cuentas por las que pasaron las campañas que ve Analytics. Gasto de Google: el que Analytics recibe de la cuenta vinculada (controlado contra la API de Google Ads). Compras e ingresos de los DOS canales: Google Analytics 4, última interacción (misma vara). Sólo entran en la comparación las campañas que siguen corriendo: las pausadas o eliminadas se informan aparte. Lo que cada plataforma se atribuye a sí misma y las ventas reales de Tiendanube se muestran como control. Las campañas que van a /mayorista se miden por CONSULTAS, no por ventas: en esa sección no hay carrito.',
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
  if (rep.fuera && rep.fuera.campanas) {
    lineas.push(`CAMPAÑAS QUE YA NO CORREN (pausadas o eliminadas; NO entran en la comparación ni se recomienda nada sobre ellas): ${rep.fuera.campanas} · gastaron ${money(rep.fuera.gasto)} en el período antes de cortarse · Analytics les anota ${money(rep.fuera.ingresos)}.`);
  }
  lineas.push('\nPOR CANAL (misma vara: Analytics, última interacción; sólo campañas que siguen corriendo):');
  for (const c of rep.canales) {
    lineas.push(`- ${c.nombre}: gasto ${money(c.gasto)} (${c.pctGasto}% del total) · ingresos ${money(c.ingresos)} · ROAS ${roas(c.roas)} · ${c.compras} compras · CAC ${money(c.cac)} · ${c.sesiones} sesiones · conversión ${c.convPct ?? 's/d'}% · CPC ${money(c.cpc)} · consultas ${c.consultas}` +
      (c.propio ? ` || lo que la plataforma se atribuye a sí misma: ${c.propio.compras} compras / ${money(c.propio.ingresos)} / ROAS ${roas(c.propio.roas)}${c.propio.mensajes ? ` + ${c.propio.mensajes} conversaciones de WhatsApp` : ''}` : '') +
      (c.reales ? ` || VENTAS REALES en Tiendanube (pedidos pagos que entraron por un anuncio de este canal): ${c.reales.pedidos} pedidos / ${money(c.reales.ingresos)} / ROAS ${roas(c.reales.roas)}` : ''));
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
  for (const c of rep.campanas.filter((x) => x.vigente).slice(0, 18)) {
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
  if ((rep.alertas || []).length) lineas.push(`\nALERTA (tenela en cuenta en todo el análisis): ${rep.alertas.join(' | ')}`);
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

module.exports = { paidPerformance, analyzePaidPerformance, digest, metaConsultasDirectas };
