const pool = require('./db');
const { generateJson } = require('./ai');
const { analyzePerformance } = require('./insights');
const { getWholesaleSettings, wholesaleContext } = require('./wholesale');
const { getForecast } = require('./weather');

/**
 * Planner mensual con IA: genera la rotación de contenido de un mes entero usando
 * fechas comerciales, ventas reales, stock e insights. Se guarda en rotation_plans
 * y seedCalendar la usa día a día; si un día no tiene plan, cae a la ROTATION fija.
 */

const PILLARS = ['producto', 'promo', 'educativo', 'marca', 'mayorista', 'ugc', 'engagement', 'repost'];
const POST_TYPES = ['feed', 'story', 'reel'];
const OBJECTIVES = ['venta', 'trafico', 'confianza', 'comunidad'];

/** Objetivo por defecto según pilar (para planes viejos y la rotación fija). */
function defaultObjective(pillar) {
  if (['producto', 'promo', 'mayorista'].includes(pillar)) return 'venta';
  if (pillar === 'engagement') return 'comunidad';
  if (pillar === 'repost') return null;
  return 'confianza'; // educativo / marca / ugc
}

function monthString(date = new Date()) {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

async function gatherContext(monthStr) {
  const from = `${monthStr}-01`;
  const to = `${monthStr}-${String(daysInMonth(monthStr)).padStart(2, '0')}`;

  const { analyzeAccountPerformance } = require('./accountAnalyzer');
  const [dates, topProducts, insights, wholesale, account, store, recent, forecast] = await Promise.all([
    pool.query(
      `SELECT event_date, title, category, angle, priority FROM commercial_dates
       WHERE event_date BETWEEN $1 AND $2 ORDER BY priority DESC, event_date`,
      [from, to]
    ),
    // Sólo productos "publicables" (curva de talles sana, stock razonable): el plan
    // no debe proponer productos que después el generador va a descartar.
    pool.query(
      `WITH ranked AS (
         SELECT id, name, brand, category, sales_30d, stock,
           row_number() OVER (PARTITION BY COALESCE(category, '')
             ORDER BY sales_30d DESC NULLS LAST, stock DESC) AS category_rank
         FROM products_cache WHERE ${require('./productScore').eligibleSQL()}
           AND synced_at >= now() - interval '36 hours'
       )
       SELECT id, name, brand, category, sales_30d, stock FROM ranked
       WHERE category_rank <= 5 ORDER BY category_rank, sales_30d DESC NULLS LAST LIMIT 30`
    ),
    analyzePerformance().catch(() => ({ pillars: [], recommendation: '' })),
    getWholesaleSettings().catch(() => null),
    // Mejores horarios REALES de la cuenta de IG (best-effort: sin token no rompe).
    analyzeAccountPerformance().catch(() => null),
    // Google Analytics de la tienda cruzado con ventas REALES de Tiendanube
    // (best-effort). GA dice qué mira la gente; Tiendanube dice qué se vendió.
    require('./analytics').topViewedWithRealSales(pool).catch(() => null),
    // Anti-repetición: temas ya usados en los últimos 2 meses (planificados o
    // publicados) para que el plan nuevo no recicle los mismos ángulos.
    pool.query(
      `SELECT scheduled_date, pillar, COALESCE(theme_title, pillar_detail) AS topic
       FROM content_calendar
       WHERE scheduled_date >= CURRENT_DATE - 60 AND scheduled_date <= CURRENT_DATE
         AND COALESCE(theme_title, pillar_detail) IS NOT NULL AND pillar != 'repost'
       ORDER BY scheduled_date DESC LIMIT 40`
    ).catch(() => ({ rows: [] })),
    getForecast(),
  ]);

  return {
    store,
    recentTopics: recent.rows.map((r) => `[${r.pillar}] ${r.topic}`),
    bestHours: account && Array.isArray(account.bestHours)
      ? account.bestHours.map((h) => `${h.hour}:00 (${h.avgEngagement} eng)`) : [],
    commercialDates: dates.rows.map((d) => ({
      date: (d.event_date instanceof Date ? d.event_date.toISOString() : String(d.event_date)).slice(0, 10),
      title: d.title, category: d.category, angle: d.angle, priority: d.priority,
    })),
    topProducts: topProducts.rows,
    insights,
    wholesale: wholesale ? wholesaleContext(wholesale) : null,
    weatherDays: forecast.days.filter((d) => d.date.startsWith(monthStr)),
  };
}

function buildPlanPrompt(monthStr, ctx, { reelsPerWeek = 2 } = {}) {
  const nDays = daysInMonth(monthStr);
  const datesTxt = ctx.commercialDates.length
    ? ctx.commercialDates.map((d) => `- ${d.date}: ${d.title} (${d.category}, prioridad ${d.priority}). ${d.angle || ''}`).join('\n')
    : '(ninguna fecha especial este mes)';
  const productsTxt = ctx.topProducts.length
    ? ctx.topProducts.map((p) => `- #${p.id} ${p.name}${p.brand ? ` (${p.brand})` : ''} [${p.category || 'sin categoría'}]: ${p.sales_30d || 0} ventas/30d, stock ${p.stock}`).join('\n')
    : '(no hay productos elegibles con stock actualizado; no propongas artículos específicos)';
  const insightsTxt = (ctx.insights.pillars || []).length
    ? ctx.insights.pillars.map((p) => `- ${p.pillar}: alcance prom. ${p.avg_reach || 0} en ${p.posts_count} post(s)`).join('\n')
      + (ctx.insights.recommendation ? `\nRecomendación: ${ctx.insights.recommendation}` : '')
    : '(sin métricas todavía: usá una mezcla equilibrada)';

  return `Sos el/la estratega de contenido de BLACKS Indumentaria (@blacks.indumentaria), marca argentina de ropa de trabajo y calzado de seguridad (minorista y mayorista/corporativo). Armá el PLAN DE CONTENIDO DE INSTAGRAM para el mes ${monthStr} (${nDays} días).

FECHAS COMERCIALES DEL MES:
${datesTxt}

PRODUCTOS QUE MÁS SE VENDEN (con stock real):
${productsTxt}

${ctx.store && ctx.store.topViewedProducts && ctx.store.topViewedProducts.length ? `LO QUE LA GENTE MÁS MIRA EN LA TIENDA (Google Analytics, ${ctx.store.days} días) CRUZADO CON VENTAS REALES (Tiendanube):
${ctx.store.topViewedProducts.map((p) => `- ${p.name}: ${p.views} vistas, ${p.realSales30d === null ? 'sin datos de venta' : `${p.realSales30d} vendidos (30d real)`}${p.realSales30d === 0 && p.views > 100 ? ' (MUCHO interés y CERO venta: hacé contenido que empuje a comprarlo, puede ser objeción de precio/talle/confianza)' : ''}`).join('\n')}
Tráfico pago: Meta Ads ${ctx.store.paidTraffic.metaAds.pct}% · Google Ads ${ctx.store.paidTraffic.googleAds.pct}% de las sesiones. Tráfico de Instagram (orgánico+pago): ${ctx.store.igSessions} de ${ctx.store.sessions} sesiones. El contenido orgánico debe llevar más gente a la tienda sin depender de la pauta.

` : ''}RENDIMIENTO HISTÓRICO POR PILAR:
${insightsTxt}
${ctx.wholesale ? `\nCONDICIONES MAYORISTAS: ${ctx.wholesale}` : ''}
${ctx.weatherDays?.length ? `\nPRONÓSTICO DE CABA (MET Norway; sólo estas fechas, temperaturas aproximadas calculadas de intervalos; el resto del mes aún no tiene pronóstico): ${ctx.weatherDays.map((d) => `${d.date} ${d.min}-${d.max}°C${d.rainMm == null ? '' : `, lluvia hasta ${d.rainMm} mm/6h`}`).join('; ')}. No vendas abrigo térmico como necesidad inmediata de CABA en días cálidos. Un producto de frío puede apuntar al sur del país si se explicita ese público. No extrapoles el clima de CABA a toda Argentina. No cites cifras exactas del pronóstico en títulos públicos.\n` : ''}
${ctx.recentTopics && ctx.recentTopics.length ? `\nTEMAS YA USADOS EN LOS ÚLTIMOS 2 MESES (NO los repitas; si un producto vuelve, tiene que ser con un ángulo claramente distinto):\n${ctx.recentTopics.map((t) => `- ${t}`).join('\n')}\n` : ''}
REGLAS DEL PLAN (obligatorias):
- Asigná TODOS los días del mes (del 1 al ${nDays}), pero NO todos llevan publicación: cuando un día no tenga nada valioso que decir, usá pillar 'repost' (descanso). CALIDAD SOBRE CANTIDAD: mejor 4-5 piezas fuertes por semana que 7 de relleno. Mínimo 1 descanso por semana; hasta 2-3 si el material del mes es flojo.
- Cada pieza tiene que justificar su lugar: preguntate "¿por qué alguien pararía a mirar esto?". Si la respuesta es débil, ese día es descanso.
- objective ∈ {${OBJECTIVES.join(', ')}}: qué busca la pieza. venta = empujar compra ahora; trafico = llevar gente a la tienda; confianza = valor/prueba social sin vender; comunidad = conversación. Distribuí: ni todo venta (cansa) ni todo confianza (no convierte).
- pillar ∈ {${PILLARS.join(', ')}} · post_type ∈ {feed, story, reel} · format: 'feed' para post_type feed, 'story' para story/reel.
- Programá aproximadamente ${reelsPerWeek} reels por semana (pedido del usuario). Completá con feed e historias sin rellenar días por obligación. Un día de descanso sigue siendo válido.
- Pilares por semana: 2 producto, 1 promo, 1 educativo, 1 de marca o ugc, 1 mayorista cada 2 semanas, 1 engagement como máximo.
- En piezas de 'producto'/'promo', nombrá SOLO productos de la lista de arriba (son los que tienen stock y curva de talles reales). No inventes productos. Distribuí marcas y categorías; no concentres la semana en un mismo artículo.
- Los Reels deben alternar productos elegibles, demostración de uso, detalles de materiales, educación, comparación, preparación de pedidos y contenido mayorista/minorista cuando tenga sentido. No repitas el mismo producto ni el mismo recurso narrativo en reels cercanos. No inventes tomas de clientes, testimonios o escenas que requieran material inexistente. pillar_detail tiene que indicar qué mostrar o grabar. El guion con tomas y duración se produce por separado al acercarse la fecha, con clima actualizado.
- En los días de fechas comerciales de prioridad >= 8, poné 'promo' con pillar_detail referido a esa fecha. El día ANTERIOR a una fecha de prioridad 10, anticipala.
- automation_level: 'auto' siempre, salvo engagement con encuesta/quiz -> 'semi' (máximo 1 'semi' por semana). En los 'semi', interaction_hint tiene que ser la instrucción EXACTA del sticker, lista para copiar: tipo (ENCUESTA/QUIZ/PREGUNTA), la pregunta textual, las opciones textuales (2-4, cortas) y, si es quiz, cuál es la correcta. Ej: 'ENCUESTA: "¿Qué priorizás en un botín?" Opciones: "Comodidad" / "Resistencia"'. Nada vago tipo "agregá una encuesta sobre el tema".
- scheduled_time entre '11:00' y '18:00'.${ctx.bestHours && ctx.bestHours.length
    ? ` HORARIOS QUE MEJOR RINDIERON EN ESTA CUENTA (usalos como preferencia): ${ctx.bestHours.join(', ')}.`
    : ' Sin datos de la cuenta todavía: 17:00-18:00 suele rendir mejor; los story pueden ir 11:00-13:00.'}
- carousel: decidilo por el CONTENIDO, no por una cuota. Va carrusel cuando el tema necesita más de una imagen para entenderse: una guía con pasos, una comparación entre dos productos u opciones, una ficha con varias características que merecen su propia toma, un "antes y después", o un producto con varios colores/variantes. NO va carrusel cuando el mensaje se agota en una sola imagen (una promo con un precio, un anuncio suelto, una foto de marca). Apuntá a 4-8 feed con carrusel por mes; si el mes no da para tantos, poné menos — el criterio manda sobre el número.
- pillar_detail: concreto y accionable en español argentino profesional, sin lunfardo (qué producto/tema/ángulo). theme_title: título corto del día.
- PROHIBIDO INVENTAR DATOS en pillar_detail/theme_title: nada de años de fundación ("desde 1993"), años de trayectoria, cantidad de clientes, premios ni cifras que no tengas confirmadas. Los ángulos de marca van por el valor/beneficio real, no por datos falsos.
- NO propongas ángulos que DEPENDEN de datos institucionales que no están en este contexto ("nuestra historia", "evolución en el mercado", "hitos de la empresa"): el generador no tiene ese material y la pieza saldría vacía/genérica. Para el pilar 'marca' usá ángulos concretos y ejecutables: cómo se trabaja el rubro, qué ofrece la empresa (personalización, uniformes, envíos), detrás de escena del trabajo, casos de uso reales por oficio.

Devolvé SOLO este JSON:
{"days":[{"date":"${monthStr}-01","post_type":"...","format":"...","pillar":"...","pillar_detail":"...","theme_title":"...","objective":"venta","automation_level":"auto","interaction_hint":null,"scheduled_time":"HH:MM","carousel":false}, ...]}`;
}

/** Valida y normaliza lo que devolvió la IA. Descarta días inválidos. */
function validatePlan(days, monthStr) {
  if (!Array.isArray(days)) return [];
  const nDays = daysInMonth(monthStr);
  const seen = new Set();
  const valid = [];

  for (const d of days) {
    if (!d || typeof d !== 'object') continue;
    const date = String(d.date || '').slice(0, 10);
    if (!date.startsWith(monthStr)) continue;
    const dayNum = Number(date.slice(8, 10));
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > nDays) continue;
    if (seen.has(date)) continue;

    const postType = POST_TYPES.includes(d.post_type) ? d.post_type : 'feed';
    const pillar = PILLARS.includes(d.pillar) ? d.pillar : 'producto';
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(d.scheduled_time || '') ? d.scheduled_time : '17:00';

    seen.add(date);
    valid.push({
      date,
      post_type: postType,
      format: postType === 'feed' ? 'feed' : 'story',
      pillar,
      pillar_detail: d.pillar_detail ? String(d.pillar_detail).slice(0, 300) : null,
      theme_title: d.theme_title ? String(d.theme_title).slice(0, 120) : null,
      objective: OBJECTIVES.includes(d.objective) ? d.objective : defaultObjective(pillar),
      automation_level: d.automation_level === 'semi' ? 'semi' : 'auto',
      interaction_hint: d.interaction_hint ? String(d.interaction_hint).slice(0, 300) : null,
      scheduled_time: time,
      carousel: Boolean(d.carousel) && postType === 'feed',
    });
  }
  return valid.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Genera (o regenera) el plan de un mes y lo guarda. Devuelve un resumen.
 * Si la IA falla o devuelve muy pocos días válidos, NO guarda nada (queda la
 * ROTATION fija como respaldo) y lanza el error para que se vea.
 */
async function generateMonthlyPlan({ month, reelsPerWeek = 2 } = {}) {
  const monthStr = /^\d{4}-\d{2}$/.test(month || '') ? month : monthString();
  console.log(`[planner] Generando plan para ${monthStr}...`);

  const ctx = await gatherContext(monthStr);
  const result = await generateJson({
    system: 'Sos un estratega de contenido para redes sociales de una marca argentina. Respondés SOLO con JSON válido.',
    prompt: buildPlanPrompt(monthStr, ctx, { reelsPerWeek }),
    maxTokens: 8000,
    temperature: 0.5,
  });

  const days = validatePlan(result && result.days, monthStr);
  const minDays = Math.min(20, daysInMonth(monthStr));
  if (days.length < minDays) {
    throw new Error(`El plan generado sólo tiene ${days.length} día(s) válidos (mínimo ${minDays}). No se guardó; el calendario sigue con la rotación fija.`);
  }

  await pool.query(
    `INSERT INTO rotation_plans (month, plan, source, notes)
     VALUES ($1, $2, 'ai', $3)
     ON CONFLICT (month) DO UPDATE SET plan = EXCLUDED.plan, source = EXCLUDED.source, notes = EXCLUDED.notes, updated_at = now()`,
    [monthStr, JSON.stringify(days), `Generado con ${ctx.commercialDates.length} fecha(s) comercial(es), ${ctx.topProducts.length} producto(s) elegibles y ${reelsPerWeek} reels/semana solicitados.`]
  );

  const byPillar = {};
  for (const d of days) byPillar[d.pillar] = (byPillar[d.pillar] || 0) + 1;
  console.log(`[planner] Plan ${monthStr} guardado: ${days.length} días.`);
  return { month: monthStr, days: days.length, byPillar, reels: days.filter((d) => d.post_type === 'reel' && d.pillar !== 'repost').length };
}

async function getPlan(monthStr) {
  const { rows } = await pool.query(`SELECT * FROM rotation_plans WHERE month = $1`, [monthStr]);
  return rows[0] || null;
}

/**
 * Mapa {YYYY-MM-DD: slot} para un rango de días, leyendo los planes de los meses
 * involucrados de una sola vez (lo usa seedCalendar).
 */
async function getPlanMap(startDate = new Date(), daysAhead = 14) {
  const months = new Set();
  for (let i = 0; i < daysAhead; i += 1) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    months.add(d.toISOString().slice(0, 7));
  }
  const { rows } = await pool.query(
    `SELECT month, plan FROM rotation_plans WHERE month = ANY($1)`,
    [[...months]]
  );
  const map = {};
  for (const row of rows) {
    const plan = Array.isArray(row.plan) ? row.plan : [];
    for (const slot of plan) map[slot.date] = slot;
  }
  return map;
}

/** Mes que conviene planificar ahora: el actual si todavía no tiene plan, si no el siguiente. */
async function nextPlannableMonth(now = new Date()) {
  const current = monthString(now);
  if (!(await getPlan(current))) return current;
  const next = new Date(now);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return monthString(next);
}

/** Cambia sólo la propuesta editorial de un slot pendiente. No genera ninguna pieza. */
async function regenerateSlotTopic(id) {
  const { rows } = await pool.query(
    `SELECT c.* FROM content_calendar c WHERE c.id = $1`, [id]
  );
  const slot = rows[0];
  if (!slot) { const err = new Error('No existe ese día del calendario.'); err.status = 404; throw err; }
  if (!['pending', 'draft'].includes(slot.status) && !(slot.status === 'skipped' && slot.pillar === 'repost')) {
    const err = new Error('Sólo se puede cambiar el tema antes de generar o aprobar la pieza.'); err.status = 409; throw err;
  }
  const day = slot.scheduled_date instanceof Date
    ? slot.scheduled_date.toISOString().slice(0, 10) : String(slot.scheduled_date).slice(0, 10);
  const [ctx, neighbors] = await Promise.all([
    gatherContext(day.slice(0, 7)),
    pool.query(`SELECT scheduled_date, post_type, COALESCE(theme_title, pillar_detail) AS topic
      FROM content_calendar WHERE id <> $1 AND scheduled_date BETWEEN $2::date - 7 AND $2::date + 7
        AND pillar <> 'repost' ORDER BY scheduled_date`, [id, day]),
  ]);
  const weather = ctx.weatherDays.find((d) => d.date === day);
  const products = ctx.topProducts;
  const result = await generateJson({
    system: 'Sos estratega editorial de BLACKS Indumentaria. Respondé sólo JSON válido, sin inventar datos.',
    prompt: `Proponé un TEMA NUEVO para el ${day}, formato ${slot.post_type}, de BLACKS Indumentaria. Cambiá el enfoque actual: "${slot.pillar_detail || slot.theme_title || 'descanso'}". No generes copy, imagen ni guion.\nProductos publicables (id, nombre, categoría, stock): ${products.map((p) => `#${p.id} ${p.name} [${p.category || ''}], ${p.stock} u.`).join('; ') || 'ninguno'}.\nTemas recientes a evitar: ${ctx.recentTopics.slice(0, 25).join('; ') || 'sin datos'}.\nPiezas cercanas en el calendario (evitá repetir enfoque o producto, sobre todo entre reels): ${neighbors.rows.map((n) => `${String(n.scheduled_date instanceof Date ? n.scheduled_date.toISOString() : n.scheduled_date).slice(0, 10)} ${n.post_type}: ${n.topic}`).join('; ') || 'ninguna'}.\n${weather ? `Pronóstico para CABA: ${weather.min}-${weather.max}°C, lluvia hasta ${weather.rainMm ?? 'sin dato'} mm/6h.` : 'No hay pronóstico para ese día; usá la temporada con prudencia.'} No extrapoles el clima de CABA a todo el país. Variá ángulo, rubro, categoría y tipo de relato. Si es reel, indicá qué grabar con material sencillo y real, distinto a los reels recientes. Nunca inventes descuentos, testimonios, características ni stock. Para pilar producto o promo, elegí product_id de la lista; si la lista está vacía, elegí educativo, marca o mayorista sin producto. No propongas encuestas ni stickers en esta acción.\nDevolvé {"pillar":"producto|promo|educativo|marca|mayorista|ugc","theme_title":"título corto","pillar_detail":"idea concreta y ejecutable","objective":"venta|trafico|confianza|comunidad","product_id":123 o null}.`,
    maxTokens: 700,
    temperature: 0.8,
  });
  if (!result || !result.theme_title || !result.pillar_detail) throw new Error('La IA no devolvió un tema utilizable.');
  const pillar = ['producto', 'promo', 'educativo', 'marca', 'mayorista', 'ugc'].includes(result.pillar) ? result.pillar : 'educativo';
  const matched = products.find((p) => String(p.id) === String(result.product_id));
  if (['producto', 'promo'].includes(pillar) && !matched) throw new Error('La IA propuso un producto fuera del catálogo disponible. Probá de nuevo.');
  const productId = matched ? matched.id : null;
  const detail = String(result.pillar_detail).trim().slice(0, 300);
  const title = String(result.theme_title).trim().slice(0, 120);
  const objective = OBJECTIVES.includes(result.objective) ? result.objective : defaultObjective(pillar);
  const { rows: updated } = await pool.query(
    `UPDATE content_calendar c SET pillar = $2, theme_title = $3, pillar_detail = $4,
       objective = $5, forced_product_id = $6, forced_product_ids = $7::jsonb,
       origin = 'manual', status = 'pending', automation_level = 'auto', interaction_hint = NULL,
       reel_brief = NULL, reel_brief_updated_at = NULL
     WHERE c.id = $1 AND c.status IN ('pending', 'draft', 'skipped')
       AND NOT EXISTS (SELECT 1 FROM generated_assets a WHERE a.calendar_id = c.id AND a.status <> 'discarded')
     RETURNING *`,
    [id, pillar, title, detail, objective, productId, JSON.stringify(productId ? [productId] : [])]
  );
  if (!updated[0]) { const err = new Error('El día cambió mientras se generaba el tema. Actualizá el calendario.'); err.status = 409; throw err; }
  return updated[0];
}

module.exports = { generateMonthlyPlan, regenerateSlotTopic, getPlan, getPlanMap, nextPlannableMonth, validatePlan, buildPlanPrompt, defaultObjective };
