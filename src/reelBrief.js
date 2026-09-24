const pool = require('./db');
const { generateJson } = require('./ai');
const { getForecast, weatherForDate, weatherBand } = require('./weather');

const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const trim = (value, limit = 300) => String(value || '').trim().slice(0, limit);
let schemaReady;
function ensureSchema() {
  if (!schemaReady) schemaReady = pool.query(`ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS reel_brief JSONB;
    ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS reel_brief_updated_at TIMESTAMPTZ;`)
    .catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

function normalizeBrief(raw, day, allowedProductIds = []) {
  if (!raw || !Array.isArray(raw.shots) || raw.shots.length < 2) throw new Error('La IA no devolvió escenas suficientes.');
  const shots = raw.shots.filter((shot) => shot && typeof shot === 'object').slice(0, 6).map((shot) => ({
    seconds: trim(shot.seconds, 15),
    record: trim(shot.record, 280),
    say: trim(shot.say, 300),
    on_screen: trim(shot.on_screen, 90),
  })).filter((shot) => shot.record && shot.seconds);
  if (shots.length < 2) throw new Error('El guion no tiene tomas grabables.');
  let cursor = 0;
  for (const shot of shots) {
    const range = shot.seconds.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (!range || Number(range[1]) !== cursor || Number(range[2]) <= cursor) {
      throw new Error('Los tiempos de las tomas no son consecutivos.');
    }
    cursor = Number(range[2]);
  }
  if (cursor < 10 || cursor > 45) throw new Error('La duración del guion está fuera del rango grabable.');
  return {
    product_id: allowedProductIds.includes(Number(raw.product_id)) ? Number(raw.product_id) : null,
    concept: trim(raw.concept, 140),
    duration_sec: cursor,
    duration_reason: trim(raw.duration_reason, 220),
    preparation: trim(raw.preparation, 350),
    hook: trim(raw.hook, 140),
    shots,
    cover: trim(raw.cover, 150),
    caption: trim(raw.caption, 350),
    cta: trim(raw.cta, 120),
    weather: day ? { date: day.date, max: day.max, min: day.min, rainMm: day.rainMm, band: weatherBand(day), source: 'MET Norway' } : null,
    generated_at: new Date().toISOString(),
  };
}

async function generateReelBrief(id, { force = false } = {}) {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM content_calendar WHERE id = $1', [id]);
  const slot = rows[0];
  if (!slot || slot.post_type !== 'reel') { const e = new Error('No existe ese slot de Reel.'); e.status = 404; throw e; }
  if (slot.status === 'published') { const e = new Error('Un Reel publicado conserva su guion original.'); e.status = 400; throw e; }
  const date = dateOnly(slot.scheduled_date);
  const forecast = await getForecast();
  const day = weatherForDate(forecast, date);
  const previous = slot.reel_brief;
  const fresh = previous?.generated_at && Date.now() - Date.parse(previous.generated_at) < 72 * 60 * 60 * 1000;
  if (!force && previous && (previous.weather?.band || null) === weatherBand(day) &&
      previous.weather?.date === (day?.date || undefined) && fresh) return previous;

  const [{ rows: products }, { rows: recent }, { rows: assets }] = await Promise.all([
    pool.query(`SELECT id, name, category, description, stock, sales_30d
      FROM products_cache WHERE ${require('./productScore').eligibleSQL()}
      ORDER BY COALESCE(sales_30d, 0) DESC, stock DESC LIMIT 10`),
    pool.query(`SELECT COALESCE(theme_title, pillar_detail) AS topic FROM content_calendar
      WHERE post_type = 'reel' AND id <> $1 AND scheduled_date BETWEEN $2::date - 35 AND $2::date
      ORDER BY scheduled_date DESC LIMIT 8`, [id, date]),
    pool.query(`SELECT product_id FROM generated_assets WHERE calendar_id = $1
      AND status <> 'discarded' ORDER BY id DESC LIMIT 1`, [id]),
  ]);
  let chosen = [];
  const ids = Array.isArray(slot.forced_product_ids) ? slot.forced_product_ids.map(Number) : [];
  if (slot.forced_product_id && !ids.includes(Number(slot.forced_product_id))) ids.unshift(Number(slot.forced_product_id));
  if (!ids.length && assets[0]?.product_id) ids.push(Number(assets[0].product_id));
  if (ids.length) {
    const found = await pool.query('SELECT id, name, category, description, stock FROM products_cache WHERE id = ANY($1::bigint[])', [ids]);
    chosen = ids.map((pid) => found.rows.find((p) => Number(p.id) === pid)).filter(Boolean);
  }
  const weatherLine = day
    ? `Pronóstico CABA para ${date}: mínima aproximada ${day.min}°C, máxima aproximada ${day.max}°C${day.rainMm == null ? '' : `, lluvia prevista hasta ${day.rainMm} mm en un intervalo de 6 horas`}. Fuente: MET Norway (datos horarios agrupados por día). Es PRONÓSTICO, no clima nacional. No cites cifras meteorológicas exactas en el texto público del Reel; usalas para elegir el ángulo.`
    : `No hay pronóstico confiable para ${date}. Usá temporada, sin afirmar temperatura ni lluvia.`;
  const result = await generateJson({
    system: 'Sos director creativo y de producción de reels de BLACKS Indumentaria, Argentina. Das órdenes de grabación concretas y viables. Respondés sólo JSON válido.',
    prompt: `Armá el GUION GRABABLE de un Reel de Instagram 9:16 para ${date}.
Pilar: ${slot.pillar}. Objetivo: ${slot.objective || 'confianza'}. Tema: ${slot.theme_title || ''}. Brief: ${slot.pillar_detail || ''}.
${weatherLine}
Producto(s) ya asociado(s) al slot o a su pieza (si hay, usá estos y no sustitutos): ${JSON.stringify(chosen.map((p) => ({ id: Number(p.id), name: p.name, category: p.category, description: trim(p.description, 250), stock: p.stock })))}.
Productos reales disponibles para proponer (si el contenido necesita uno): ${JSON.stringify(products.map((p) => ({ id: Number(p.id), name: p.name, category: p.category, stock: p.stock, sales_30d: p.sales_30d })))}.
Ángulos recientes que NO hay que repetir: ${recent.map((r) => r.topic).filter(Boolean).join(' | ') || 'ninguno'}.
Elegí la idea más útil entre demostración de producto, consejo educativo, armado de pedidos, empaque/despacho, compra minorista, consulta mayorista, merchandising o detrás de escena. No fuerces una venta si el tema pide enseñar o generar confianza. Para despacho, no prometas plazos no verificados. Para mayorista, no inventes mínimos, descuentos ni condiciones. Sin testimonios ficticios.
Si hace calor en CABA, no vendas una campera térmica como necesidad local inmediata; si sirve para el sur del país, aclará ese público. Si llueve y el producto realmente lo resiste, podés usar ese ángulo, sin afirmar impermeabilidad sin ficha. Si no hay pronóstico, evitá afirmaciones meteorológicas.
Elegí 10 a 45 segundos según las escenas y el valor de la idea. El gancho debe aparecer en los primeros 2 segundos. Cada toma tiene que decir QUÉ grabar, QUÉ decir literalmente (si no lleva voz, cadena vacía) y QUÉ texto poner en pantalla. Usá cortes realizables con celular, producto real y personal propio, sin requerir modelos, locaciones ni clientes. La suma de rangos seconds debe coincidir con duration_sec. Cerrá con un CTA específico al objetivo. Español argentino profesional, voseo.
Si nombrás un producto concreto, product_id debe ser su id real de la lista. Si ya hay un producto asociado, product_id DEBE ser ese id. Para educativo/engagement/marca sin producto fijado, product_id=null y enseñá o mostrá el proceso sin vender un modelo. Si no se necesita producto concreto, product_id=null y no nombres modelos específicos en las tomas.
Devolvé: {"product_id":123,"concept":"...","duration_sec":20,"duration_reason":"...","preparation":"...","hook":"...","shots":[{"seconds":"0-2","record":"...","say":"...","on_screen":"..."}],"cover":"...","caption":"...","cta":"..."}.`,
    maxTokens: 2600,
    temperature: 0.65,
  });
  const allowed = chosen.length ? chosen.map((p) => Number(p.id)) : products.map((p) => Number(p.id));
  const brief = normalizeBrief(result, day, allowed);
  if (chosen.length && !brief.product_id) brief.product_id = Number(chosen[0].id);
  brief.product_name = [...chosen, ...products].find((p) => Number(p.id) === brief.product_id)?.name || null;
  await pool.query(`UPDATE content_calendar SET reel_brief = $2::jsonb, reel_brief_updated_at = now()
    WHERE id = $1 AND post_type = 'reel' AND status <> 'published'`, [id, JSON.stringify(brief)]);
  return brief;
}

async function refreshUpcomingReels() {
  await ensureSchema();
  const today = localDate();
  const { rows } = await pool.query(`SELECT id, scheduled_date, reel_brief FROM content_calendar
    WHERE post_type = 'reel' AND pillar <> 'repost' AND status IN ('pending', 'draft')
      AND scheduled_date BETWEEN $1::date AND $1::date + 7
    ORDER BY scheduled_date LIMIT 8`, [today]);
  const briefIds = rows.map((r) => Number(r.reel_brief?.product_id)).filter(Boolean);
  const { rows: eligible } = briefIds.length
    ? await pool.query(`SELECT id FROM products_cache WHERE id = ANY($1::bigint[])
        AND ${require('./productScore').eligibleSQL()}`, [briefIds])
    : { rows: [] };
  const eligibleIds = new Set(eligible.map((p) => Number(p.id)));
  const forecast = await getForecast();
  let refreshed = 0;
  for (const slot of rows) {
    const day = weatherForDate(forecast, dateOnly(slot.scheduled_date));
    const old = slot.reel_brief;
    const fresh = old?.generated_at && Date.now() - Date.parse(old.generated_at) < 72 * 60 * 60 * 1000;
    const productFresh = !old?.product_id || eligibleIds.has(Number(old.product_id));
    if (old && fresh && productFresh && (old.weather?.band || null) === weatherBand(day) && old.weather?.date === (day?.date || undefined)) continue;
    try { await generateReelBrief(slot.id, { force: true }); refreshed += 1; }
    catch (err) { console.warn(`[reelBrief] Slot #${slot.id}: ${err.message}`); }
  }
  return refreshed;
}

module.exports = { generateReelBrief, refreshUpcomingReels, normalizeBrief, ensureSchema };
