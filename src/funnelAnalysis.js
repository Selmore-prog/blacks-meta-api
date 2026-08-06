const { runReport, isEnabled } = require('./analytics');
const config = require('./config');

/* =========================================================================
 * EMBUDOS: cómo avanza (y dónde se cae) la gente adentro del sitio.
 *
 * El informe por sección contesta "qué pasó"; el embudo contesta "en qué PASO
 * se rompe". Son dos recorridos distintos porque el negocio es doble:
 *
 *   MAYORISTA  → no hay carrito: el final del camino es una consulta.
 *   MINORISTA  → hay carrito: el final del camino es una compra.
 *
 * TODOS los pasos se miden en SESIONES (no en cantidad de eventos). Es la única
 * forma de que los escalones sean comparables entre sí: si un paso contara
 * clics y el siguiente sesiones, los porcentajes de caída serían mentira.
 * ========================================================================= */

const fPath = (prefix) => ({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: prefix } } });
const fEvent = (name) => ({ filter: { fieldName: 'eventName', stringFilter: { value: name } } });
const fEvents = (names) => ({ orGroup: { expressions: names.map(fEvent) } });
const fLink = (value) => ({ filter: { fieldName: 'linkUrl', stringFilter: { matchType: 'CONTAINS', value } } });
const fAnd = (...xs) => ({ andGroup: { expressions: xs.filter(Boolean) } });

const CUR = 'cur';
const PREV = 'prev';

const rows = (rep) => (rep && rep.rows) || [];
const metAt = (r, i) => Number(((r.metricValues || [])[i] || {}).value || 0);
const rangeOf = (r) => (((r.dimensionValues || [])[(r.dimensionValues || []).length - 1]) || {}).value || '';

function deltaPct(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
const pctOf = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);

/**
 * Un paso del embudo = sesiones que cumplen una condición.
 * `fallback` se usa cuando el filtro principal todavía no tiene datos (los
 * eventos propios son nuevos: los meses viejos sólo tienen el clic saliente).
 */
async function stepSessions(dateRanges, filter) {
  const rep = await runReport({
    dateRanges,
    metrics: [{ name: 'sessions' }],
    ...(filter ? { dimensionFilter: filter } : {}),
  }).catch(() => null);
  const pick = (range) => {
    const r = rows(rep).find((x) => rangeOf(x) === range);
    return r ? metAt(r, 0) : 0;
  };
  return { cur: pick(CUR), prev: pick(PREV) };
}

/**
 * Arma el embudo con los pasos ya resueltos y calcula las caídas.
 * `pctOfPrev` es lo que realmente importa: de los que llegaron al paso
 * anterior, cuántos siguieron. Ahí se ve dónde se rompe el recorrido.
 */
function buildSteps(defs, results) {
  const top = results[0] ? results[0].cur : 0;
  // Un paso que depende de los eventos NUEVOS y que da cero en los dos períodos
  // no significa "no pasó nadie": significa que en esas fechas todavía no se
  // medía. Mostrarlo como una caída del 100% sería mentir con un gráfico.
  const noMedido = (def, r) => Boolean(def.nuevo) && r.cur === 0 && r.prev === 0;

  const out = [];
  let anchor = null; // último paso CON medición, contra el que se compara la caída
  defs.forEach((def, i) => {
    const r = results[i];
    const sinDatos = noMedido(def, r);
    const pctOfPrev = sinDatos || !anchor ? null : pctOf(r.cur, anchor.cur);
    // Un paso puede tener MÁS sesiones que el anterior: los caminos no son
    // obligatorios (se puede consultar desde una ficha sin pasar por la landing).
    // Se marca en vez de dibujar un "150%" que parece un error de cálculo.
    const noSecuencial = pctOfPrev !== null && pctOfPrev > 105;
    const step = {
      key: def.key,
      label: def.label,
      help: def.help,
      medida: def.medida,
      sinDatos,
      noSecuencial,
      impreciso: Boolean(def.impreciso),
      sessions: sinDatos ? null : r.cur,
      sessionsPrev: sinDatos ? null : r.prev,
      delta: sinDatos ? null : deltaPct(r.cur, r.prev),
      pctOfTop: sinDatos ? null : pctOf(r.cur, top),
      pctOfPrev: i === 0 ? 100 : pctOfPrev,
      lost: sinDatos || !anchor || noSecuencial ? 0 : Math.max(0, anchor.cur - r.cur),
      lostPct: pctOfPrev === null || noSecuencial ? null : Math.round((100 - pctOfPrev) * 10) / 10,
      // Cuánta gente llegó a este paso SIN pasar por el anterior.
      entranDirecto: noSecuencial && anchor ? r.cur - anchor.cur : 0,
      // Contra qué paso se está comparando (puede no ser el inmediato anterior
      // si hay escalones sin medir en el medio).
      comparaContra: anchor ? anchor.label : null,
    };
    out.push(step);
    if (!sinDatos) anchor = { cur: r.cur, prev: r.prev, label: def.label };
  });
  return out;
}

/**
 * El escalón donde se cae más gente, en PORCENTAJE (no en volumen).
 *
 * `desde` saltea los primeros pasos a propósito: que 8.000 sesiones del sitio no
 * entren a /mayorista no es una fuga del embudo, es simplemente el público
 * minorista. La fuga que importa empieza cuando ya están adentro del camino.
 * Se ordena por porcentaje porque en volumen siempre gana el escalón más ancho.
 */
function worstStep(steps, desde = 1) {
  const candidates = steps.slice(desde).filter((s) => !s.sinDatos && !s.noSecuencial && s.lostPct !== null && s.lost > 0);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b.lostPct > a.lostPct ? b : a));
}

/**
 * DESDE CUÁNDO existe cada evento propio.
 *
 * Sin esto el embudo miente sin darse cuenta: si el período elegido empieza
 * antes de que el tema con la medición estuviera publicado, los días viejos
 * suman sesiones en los pasos generales y cero en los pasos nuevos, y el
 * porcentaje de caída sale inventado (nos pasó: daba 3,7% cuando el número real
 * del único día medido era 20%).
 */
async function measurementStart(events) {
  const rep = await runReport({
    dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }, { name: 'date' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { orGroup: { expressions: events.map(fEvent) } },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: 500,
  }).catch(() => null);
  const first = {};
  for (const r of rows(rep)) {
    const ev = (r.dimensionValues[0] || {}).value;
    const d = (r.dimensionValues[1] || {}).value;
    if (ev && d && (!first[ev] || d < first[ev])) first[ev] = d;
  }
  const iso = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);
  const todas = Object.values(first).filter(Boolean).sort();
  return { porEvento: Object.fromEntries(Object.entries(first).map(([k, v]) => [k, iso(v)])), desde: iso(todas[0]) };
}

/**
 * Los dos embudos del sitio entre dos períodos.
 * `current`/`previous` = { start, end } en AAAA-MM-DD.
 */
async function siteFunnels({ current, previous, prefix = '/mayorista' } = {}) {
  if (!isEnabled()) throw new Error('Google Analytics no está configurado.');
  const dateRanges = [
    { startDate: previous.start, endDate: previous.end, name: PREV },
    { startDate: current.start, endDate: current.end, name: CUR },
  ];

  const waMay = config.ga.whatsappMayorista;
  const waMin = config.ga.whatsappMinorista;
  // Consulta mayorista: el evento propio si ya hay datos, y si no el clic
  // saliente al número mayorista (que existe desde siempre). Se piden los dos y
  // se elige el que tenga números: así el embudo funciona hoy y sigue andando
  // cuando los eventos nuevos tomen el relevo.
  const leadMayEvent = fAnd(fEvent('generate_lead'), { filter: { fieldName: 'customEvent:lead_type', stringFilter: { value: 'mayorista' } } });
  // Ficha de producto separada por tipo. El view_item de Tiendanube mezcla las
  // mayoristas (Consultar precio) con las minoristas: para el embudo minorista
  // eso es ruido puro, porque un producto sin carrito NUNCA puede avanzar al
  // paso siguiente y hace ver una caída que no es real.
  const fichaMin = fAnd(fEvent('product_view'), { filter: { fieldName: 'customEvent:product_mode', stringFilter: { value: 'minorista' } } });
  const fichaMay = fAnd(fEvent('product_view'), { filter: { fieldName: 'customEvent:product_mode', stringFilter: { value: 'mayorista' } } });
  const leadMayClick = fAnd(fEvent('click'), fLink(waMay));
  const leadMinClick = fAnd(fEvent('click'), fLink(waMin));

  const mayoristaDefs = [
    { key: 'sitio', label: 'Entraron al sitio', medida: 'Todas las sesiones', help: 'El total de visitas del período, de donde sale todo lo demás.' },
    { key: 'seccion', label: 'Entraron a la sección mayorista', medida: `Sesiones que vieron ${prefix}`, help: 'Vieron al menos una página de la sección.' },
    { key: 'propuesta', nuevo: true, label: 'Vieron la propuesta B2B', medida: 'Sesiones con view_b2b_landing', help: 'El bloque de descuentos y mínimos estuvo efectivamente en pantalla, no sólo cargado.' },
    { key: 'interes', nuevo: true, label: 'Se metieron a mirar en serio', medida: 'Sesiones con b2b_info_open, scroll_to_products o click_cotizador', help: 'Abrieron trabajos/preguntas, saltaron al catálogo o entraron al cotizador.' },
    { key: 'ficha_may', nuevo: true, label: 'Miraron una ficha mayorista', medida: 'Sesiones con product_view (mayorista)', help: 'Abrieron un producto de "Consultar precio". Es el paso donde aparece el botón de WhatsApp mayorista.' },
    { key: 'contacto', nuevo: true, label: 'Abrieron un canal de contacto', medida: 'Sesiones con whatsapp_modal_open', help: 'Tocaron el botón flotante y vieron el cartel de minorista/mayorista.' },
    { key: 'consulta', label: 'Consultaron', medida: 'Sesiones con consulta mayorista', help: 'Tocaron el WhatsApp mayorista. Es el final del recorrido B2B: no hay carrito.' },
  ];

  const minoristaDefs = [
    { key: 'sitio', label: 'Entraron al sitio', medida: 'Todas las sesiones', help: 'Mismo punto de partida que el embudo mayorista.' },
    { key: 'listado', label: 'Vieron un listado de productos', medida: 'Sesiones con view_item_list', help: 'Llegaron a una categoría o al buscador.' },
    { key: 'ficha', label: 'Abrieron una ficha minorista', medida: 'Sesiones con product_view (minorista)', help: 'Abrieron un producto CON precio. Las fichas mayoristas quedan afuera: no tienen carrito y ensuciaban la caída.' },
    { key: 'carrito', label: 'Agregaron al carrito', medida: 'Sesiones con add_to_cart', help: 'Primer compromiso real de compra.' },
    { key: 'checkout', label: 'Empezaron a comprar', medida: 'Sesiones con begin_checkout', help: 'Entraron al checkout.' },
    { key: 'compra', label: 'Compraron', medida: 'Sesiones con purchase', help: 'Compra terminada.' },
  ];

  const OWN = ['view_b2b_landing', 'b2b_info_open', 'scroll_to_products', 'click_cotizador', 'whatsapp_modal_open', 'generate_lead', 'product_view'];
  const [
    medicion,
    sitio, seccion, propuesta, interes, contactoAbierto, leadMayEv, leadMayCk,
    listado, ficha, fichaMinEv, fichaMayEv, carrito, checkout, compra, leadMinCk,
  ] = await Promise.all([
    measurementStart(OWN),
    stepSessions(dateRanges, null),
    stepSessions(dateRanges, fPath(prefix)),
    stepSessions(dateRanges, fEvent('view_b2b_landing')),
    stepSessions(dateRanges, fEvents(['b2b_info_open', 'scroll_to_products', 'click_cotizador'])),
    stepSessions(dateRanges, fEvent('whatsapp_modal_open')),
    stepSessions(dateRanges, leadMayEvent).catch(() => ({ cur: 0, prev: 0 })),
    stepSessions(dateRanges, leadMayClick),
    stepSessions(dateRanges, fEvent('view_item_list')),
    stepSessions(dateRanges, fEvent('view_item')),
    stepSessions(dateRanges, fichaMin).catch(() => ({ cur: 0, prev: 0 })),
    stepSessions(dateRanges, fichaMay).catch(() => ({ cur: 0, prev: 0 })),
    stepSessions(dateRanges, fEvent('add_to_cart')),
    stepSessions(dateRanges, fEvent('begin_checkout')),
    stepSessions(dateRanges, fEvent('purchase')),
    stepSessions(dateRanges, leadMinClick),
  ]);

  // El evento propio manda apenas tenga datos; mientras tanto, el clic saliente.
  const usaEventoPropio = leadMayEv.cur > 0;
  const consultaMay = usaEventoPropio ? leadMayEv : leadMayCk;

  // Mientras product_view no tenga datos, se cae al view_item de siempre pero se
  // avisa que mezcla los dos tipos: mejor un número impreciso y declarado que un
  // número limpio inventado.
  const usaFichaPropia = fichaMinEv.cur > 0 || fichaMayEv.cur > 0;
  const fichaMinorista = usaFichaPropia ? fichaMinEv : ficha;
  minoristaDefs[2] = usaFichaPropia ? minoristaDefs[2] : {
    ...minoristaDefs[2],
    label: 'Abrieron una ficha',
    medida: 'Sesiones con view_item (incluye mayoristas)',
    impreciso: true,
    help: 'Todavía cuenta las fichas mayoristas mezcladas: el evento que las separa (product_view) se instaló recién y no tiene datos consolidados.',
  };

  const mayoristaSteps = buildSteps(mayoristaDefs, [sitio, seccion, propuesta, interes, fichaMayEv, contactoAbierto, consultaMay]);
  const minoristaSteps = buildSteps(minoristaDefs, [sitio, listado, fichaMinorista, carrito, checkout, compra]);

  return {
    generatedAt: new Date().toISOString(),
    prefix,
    current, previous,
    mayorista: {
      titulo: 'Camino mayorista (B2B)',
      subtitulo: 'Termina en una consulta: los productos mayoristas no tienen carrito.',
      steps: mayoristaSteps,
      peor: worstStep(mayoristaSteps, 2),
      conversionFinal: pctOf(consultaMay.cur, sitio.cur),
      conversionFinalPrev: pctOf(consultaMay.prev, sitio.prev),
      fuenteConsulta: usaEventoPropio
        ? 'evento propio generate_lead (lead_type = mayorista)'
        : 'clic saliente al WhatsApp mayorista (los eventos propios todavía no tienen datos consolidados)',
    },
    minorista: {
      titulo: 'Camino minorista (tienda)',
      subtitulo: 'El recorrido clásico de e-commerce, hasta la compra.',
      steps: minoristaSteps,
      peor: worstStep(minoristaSteps, 2),
      conversionFinal: pctOf(compra.cur, sitio.cur),
      conversionFinalPrev: pctOf(compra.prev, sitio.prev),
      // Aparte del carrito, el minorista también consulta por WhatsApp.
      consultasWhatsapp: { sessions: leadMinCk.cur, sessionsPrev: leadMinCk.prev, delta: deltaPct(leadMinCk.cur, leadMinCk.prev) },
    },
    // Si el período elegido arranca antes de que existieran los eventos, los
    // pasos nuevos quedan diluidos por días sin medir: se avisa fuerte.
    medicion: {
      desde: medicion.desde,
      porEvento: medicion.porEvento,
      periodoIncompleto: Boolean(medicion.desde && current.start < medicion.desde),
      diasMedidos: medicion.desde && current.end >= medicion.desde
        ? Math.round((new Date(current.end) - new Date(Math.max(new Date(current.start), new Date(medicion.desde)))) / 864e5) + 1
        : 0,
    },
    avisos: [
      'Cada paso cuenta SESIONES que llegaron a ese punto, no personas ni clics: una misma persona que vuelve otro día cuenta dos veces.',
      'Los pasos no son estrictamente secuenciales: alguien puede consultar sin haber visto la propuesta B2B (por ejemplo entrando directo a una ficha de producto). Por eso un escalón puede tener más sesiones que el anterior.',
      usaFichaPropia ? null : 'El paso "Abrieron una ficha" del embudo minorista todavía incluye las fichas mayoristas: el evento que las separa se instaló recién.',
      usaEventoPropio ? null : 'La consulta mayorista se está midiendo con el clic saliente porque los eventos propios todavía no consolidaron en Analytics.',
      // Comparar contra un día que todavía está corriendo hace ver caídas que no
      // existen: a las 10 de la mañana el día va por un tercio de su tráfico.
      current.end >= new Date().toISOString().slice(0, 10)
        ? 'El período llega hasta HOY, que todavía no terminó: la comparación contra el período anterior va a mostrar una caída que en realidad es el día a medio andar.'
        : null,
      medicion.desde && current.start < medicion.desde
        ? `OJO: la medición de los pasos nuevos empezó el ${medicion.desde}. El período elegido incluye días anteriores, así que esos escalones aparecen más bajos de lo que son. Para leerlos bien, elegí un período que arranque el ${medicion.desde} o después.`
        : null,
    ].filter(Boolean),
  };
}

module.exports = { siteFunnels };
