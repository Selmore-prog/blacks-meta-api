const pool = require('./db');
const { generateJson } = require('./ai');
const { analyzePerformance } = require('./insights');
const { getWholesaleSettings, wholesaleContext } = require('./wholesale');

/**
 * Planner mensual con IA: genera la rotación de contenido de un mes entero usando
 * fechas comerciales, ventas reales, stock e insights. Se guarda en rotation_plans
 * y seedCalendar la usa día a día; si un día no tiene plan, cae a la ROTATION fija.
 */

const PILLARS = ['producto', 'promo', 'educativo', 'marca', 'mayorista', 'ugc', 'engagement', 'repost'];
const POST_TYPES = ['feed', 'story', 'reel'];

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

  const [dates, topProducts, insights, wholesale] = await Promise.all([
    pool.query(
      `SELECT event_date, title, category, angle, priority FROM commercial_dates
       WHERE event_date BETWEEN $1 AND $2 ORDER BY priority DESC, event_date`,
      [from, to]
    ),
    pool.query(
      `SELECT name, brand, category, sales_30d, stock FROM products_cache
       WHERE stock > 0 AND price > 0 ORDER BY sales_30d DESC NULLS LAST LIMIT 8`
    ),
    analyzePerformance().catch(() => ({ pillars: [], recommendation: '' })),
    getWholesaleSettings().catch(() => null),
  ]);

  return {
    commercialDates: dates.rows.map((d) => ({
      date: (d.event_date instanceof Date ? d.event_date.toISOString() : String(d.event_date)).slice(0, 10),
      title: d.title, category: d.category, angle: d.angle, priority: d.priority,
    })),
    topProducts: topProducts.rows,
    insights,
    wholesale: wholesale ? wholesaleContext(wholesale) : null,
  };
}

function buildPlanPrompt(monthStr, ctx) {
  const nDays = daysInMonth(monthStr);
  const datesTxt = ctx.commercialDates.length
    ? ctx.commercialDates.map((d) => `- ${d.date}: ${d.title} (${d.category}, prioridad ${d.priority}). ${d.angle || ''}`).join('\n')
    : '(ninguna fecha especial este mes)';
  const productsTxt = ctx.topProducts.length
    ? ctx.topProducts.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${p.sales_30d || 0} ventas/30d, stock ${p.stock}`).join('\n')
    : '(sin datos de ventas todavía)';
  const insightsTxt = (ctx.insights.pillars || []).length
    ? ctx.insights.pillars.map((p) => `- ${p.pillar}: alcance prom. ${p.avg_reach || 0} en ${p.posts_count} post(s)`).join('\n')
      + (ctx.insights.recommendation ? `\nRecomendación: ${ctx.insights.recommendation}` : '')
    : '(sin métricas todavía: usá una mezcla equilibrada)';

  return `Sos el/la estratega de contenido de BLACKS Indumentaria (@blacks.indumentaria), marca argentina de ropa de trabajo y calzado de seguridad (minorista y mayorista/corporativo). Armá el PLAN DE CONTENIDO DE INSTAGRAM para el mes ${monthStr} (${nDays} días).

FECHAS COMERCIALES DEL MES:
${datesTxt}

PRODUCTOS QUE MÁS SE VENDEN (con stock real):
${productsTxt}

RENDIMIENTO HISTÓRICO POR PILAR:
${insightsTxt}
${ctx.wholesale ? `\nCONDICIONES MAYORISTAS: ${ctx.wholesale}` : ''}

REGLAS DEL PLAN (obligatorias):
- UN slot por día, TODOS los días del mes (del 1 al ${nDays}).
- pillar ∈ {${PILLARS.join(', ')}} · post_type ∈ {feed, story, reel} · format: 'feed' para post_type feed, 'story' para story/reel.
- Mezcla semanal aproximada: 2-3 feed, 1-2 reel, 2-3 story. Un día por semana puede ser 'repost' (descanso).
- Pilares por semana: 2 producto, 1 promo, 1 educativo, 1 de marca o ugc, 1 mayorista cada 2 semanas, 1 engagement como máximo.
- En los días de fechas comerciales de prioridad >= 8, poné 'promo' con pillar_detail referido a esa fecha. El día ANTERIOR a una fecha de prioridad 10, anticipala.
- automation_level: 'auto' siempre, salvo engagement con encuesta -> 'semi' (máximo 1 'semi' por semana, con interaction_hint explicando la encuesta).
- scheduled_time entre '11:00' y '18:00' (los horarios 17:00-18:00 son los que mejor rinden; los story pueden ir 11:00-13:00).
- carousel: true sólo en 1-2 feed educativos/mayoristas por mes.
- pillar_detail: concreto y accionable en español rioplatense (qué producto/tema/ángulo). theme_title: título corto del día.

Devolvé SOLO este JSON:
{"days":[{"date":"${monthStr}-01","post_type":"...","format":"...","pillar":"...","pillar_detail":"...","theme_title":"...","automation_level":"auto","interaction_hint":null,"scheduled_time":"HH:MM","carousel":false}, ...]}`;
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
async function generateMonthlyPlan({ month } = {}) {
  const monthStr = /^\d{4}-\d{2}$/.test(month || '') ? month : monthString();
  console.log(`[planner] Generando plan para ${monthStr}...`);

  const ctx = await gatherContext(monthStr);
  const result = await generateJson({
    system: 'Sos un estratega de contenido para redes sociales de una marca argentina. Respondés SOLO con JSON válido.',
    prompt: buildPlanPrompt(monthStr, ctx),
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
    [monthStr, JSON.stringify(days), `Generado con ${ctx.commercialDates.length} fecha(s) comercial(es) y ${ctx.topProducts.length} producto(s) top.`]
  );

  const byPillar = {};
  for (const d of days) byPillar[d.pillar] = (byPillar[d.pillar] || 0) + 1;
  console.log(`[planner] Plan ${monthStr} guardado: ${days.length} días.`);
  return { month: monthStr, days: days.length, byPillar };
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

module.exports = { generateMonthlyPlan, getPlan, getPlanMap, nextPlannableMonth, validatePlan, buildPlanPrompt };
