const pool = require('./db');
const { generateJson } = require('./ai');
const { getForecast, weatherForDate, weatherBand } = require('./weather');

const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const trim = (value) => String(value || '').trim();
const BRIEF_VERSION = 2;
const speechWords = (value) => (trim(value).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
const spokenLimit = (seconds) => Math.floor(seconds * 2.5);
const fieldLimits = { concept: 130, duration_reason: 180, preparation: 260, hook: 85, cover: 120, caption: 300, cta: 100 };
const unnatural = /\b(presentador(?:a)?|la persona|guardado estrat[eé]gico|seleccionar (?:una? |\d+ )?prendas?|asegurar buena iluminaci[oó]n|tu inversi[oó]n|tips?|vida [uú]til|cuidadosamente|enfatizando|logo de BLACKS|durar mucho m[aá]s|siempre impecable)\b/i;
const unsupportedCare = /(?:lav[aá]|lavar|lavado).{0,35}(?:en fr[ií]o|agua fr[ií]a|del rev[eé]s)|detergente suave|secadora.{0,30}baja temperatura/i;

function briefIssues(raw, { products = [], chosen = [] } = {}) {
  const issues = [];
  if (!raw || !Array.isArray(raw.shots) || raw.shots.length < 2 || raw.shots.length > 6) {
    return ['Devolvé entre 2 y 6 tomas grabables.'];
  }
  for (const [field, limit] of Object.entries(fieldLimits)) {
    if (trim(raw[field]).length > limit) issues.push(`${field}: máximo ${limit} caracteres, sin cortar la idea.`);
  }
  if (!trim(raw.preparation)) issues.push('preparation: indicá sólo los objetos y el lugar necesarios para grabar.');
  let cursor = 0;
  raw.shots.forEach((shot, index) => {
    const range = trim(shot?.seconds).match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (!range || Number(range[1]) !== cursor || Number(range[2]) <= cursor) {
      issues.push(`Toma ${index + 1}: los tiempos deben ser consecutivos y crecientes.`);
      return;
    }
    const seconds = Number(range[2]) - cursor;
    cursor = Number(range[2]);
    if (!trim(shot.record)) issues.push(`Toma ${index + 1}: falta indicar qué grabar.`);
    if (trim(shot.record).length > 190) issues.push(`Toma ${index + 1}: acortá la indicación visual a 190 caracteres.`);
    if (trim(shot.on_screen).length > 65) issues.push(`Toma ${index + 1}: texto en pantalla de hasta 65 caracteres.`);
    const words = speechWords(shot.say);
    if (words > spokenLimit(seconds)) issues.push(`Toma ${index + 1} (${seconds} s): ${words} palabras habladas no entran; máximo ${spokenLimit(seconds)}. Acortá el parlamento o dale más segundos.`);
  });
  if (cursor < 10 || cursor > 45) issues.push('La duración total debe estar entre 10 y 45 segundos.');
  const publicText = [raw.concept, raw.preparation, raw.hook, raw.cover, raw.caption, raw.cta,
    ...raw.shots.flatMap((shot) => [shot?.record, shot?.say, shot?.on_screen])].map(trim).join(' ');
  if (unnatural.test(publicText)) issues.push('Reescribí las expresiones acartonadas en español argentino natural, sin jerga ni vulgaridad.');
  const productId = Number(raw.product_id);
  if (chosen.length && !chosen.some((p) => Number(p.id) === productId)) issues.push('Usá el ID de un producto ya asociado al slot.');
  if (productId && ![...chosen, ...products].some((p) => Number(p.id) === productId)) issues.push('product_id debe ser un ID real disponible.');
  if (!productId && !chosen.length && products.some((p) => p.name && publicText.toLocaleLowerCase('es-AR').includes(String(p.name).toLocaleLowerCase('es-AR')))) {
    issues.push('Si product_id es null, no nombres modelos concretos del catálogo; mostrá prendas genéricas o elegí un producto real y su ID.');
  }
  const claims = [raw.hook, raw.caption, ...raw.shots.flatMap((shot) => [shot?.say, shot?.on_screen])].map(trim);
  if (claims.some((claim) => unsupportedCare.test(claim))) {
    issues.push('No indiques lavado, temperatura o detergente para una prenda sin datos de su etiqueta; aconsejá revisar la etiqueta primero.');
  }
  return issues;
}

async function polishBriefFields(raw, products, chosen) {
  const draft = { ...raw, shots: raw.shots.map((shot) => ({ ...shot })) };
  const names = Number(draft.product_id) || chosen.length ? [] : products.map((p) => String(p.name || '').toLocaleLowerCase('es-AR')).filter(Boolean);
  const refs = [];
  const add = (key, value, limit, set, wordLimit) => {
    const phrase = trim(value);
    if (phrase.length > limit || unnatural.test(phrase) || unsupportedCare.test(phrase) ||
        names.some((name) => phrase.toLocaleLowerCase('es-AR').includes(name)) ||
        (wordLimit && speechWords(phrase) > wordLimit)) {
      refs.push({ key, original: phrase, maxChars: limit, ...(wordLimit ? { maxWords: wordLimit } : {}), set });
    }
  };
  for (const [field, limit] of Object.entries(fieldLimits)) add(field, draft[field], limit, (value) => { draft[field] = value; });
  draft.shots.forEach((shot, index) => {
    const range = trim(shot.seconds).match(/^(\d+)\s*[-–]\s*(\d+)$/);
    const maxWords = range ? spokenLimit(Number(range[2]) - Number(range[1])) : 0;
    add(`shot_${index + 1}_record`, shot.record, 190, (value) => { shot.record = value; });
    add(`shot_${index + 1}_say`, shot.say, 180, (value) => { shot.say = value; }, maxWords);
    add(`shot_${index + 1}_on_screen`, shot.on_screen, 65, (value) => { shot.on_screen = value; });
  });
  if (!refs.length) return draft;
  const edits = await generateJson({
    system: 'Sos editor de guiones argentinos. Devolvés sólo un objeto JSON con las claves solicitadas y frases completas.',
    prompt: `Reescribí SOLO estas frases de un guion de Reel. Devolvé un objeto JSON con cada clave indicada y el nuevo texto, sin otras claves. Respetá maxWords para la voz y maxChars para los demás campos; podés dejar say vacío si la toma funciona mejor sin voz. Español argentino natural y profesional, indicaciones directas con voseo; sin nombres de modelos de catálogo cuando el Reel es genérico, sin consejos de cuidado que no figuran en la etiqueta.\n${JSON.stringify(refs.map(({ key, original, maxChars, maxWords }) => ({ key, original, maxChars, maxWords })))}`,
    maxTokens: 1200,
    temperature: 0.15,
  });
  for (const ref of refs) if (typeof edits[ref.key] === 'string') ref.set(edits[ref.key].trim());
  return draft;
}

function shortenAtBoundary(value, limit) {
  const original = trim(value);
  if (original.length <= limit) return original;
  const clipped = original.slice(0, limit);
  const sentence = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  if (sentence >= limit * 0.55) return clipped.slice(0, sentence + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : limit - 1).replace(/[,:;\s-]+$/, '')}.`;
}

function fitBriefTiming(raw, products, chosen) {
  const draft = { ...raw, shots: raw.shots.map((shot) => ({ ...shot })) };
  const careSafe = (value) => trim(value).split(/(?<=[.!?])\s+/)
    .map((sentence) => unsupportedCare.test(sentence) ? 'Revisá la etiqueta de cuidado de cada prenda.' : sentence).join(' ');
  for (const field of ['hook', 'caption']) draft[field] = careSafe(draft[field]);
  draft.shots.forEach((shot) => {
    shot.say = careSafe(shot.say);
    shot.on_screen = careSafe(shot.on_screen);
  });
  for (const [field, limit] of Object.entries(fieldLimits)) draft[field] = shortenAtBoundary(draft[field], limit);
  for (const shot of draft.shots) {
    shot.record = shortenAtBoundary(shot.record, 190);
    shot.on_screen = shortenAtBoundary(shot.on_screen, 65);
  }
  if (!Number(draft.product_id) && !chosen.length) {
    const names = products.map((p) => trim(p.name)).filter(Boolean);
    const clean = (value) => {
      let out = trim(value).replace(/\s*\((?:por ejemplo|ej\.)\s*:[^)]*\)/gi, '');
      for (const name of names) out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'la prenda');
      return out.replace(/\b(?:una|un|el|la) la prenda\b/gi, 'la prenda');
    };
    for (const field of Object.keys(fieldLimits)) draft[field] = clean(draft[field]);
    draft.shots.forEach((shot) => {
      shot.record = clean(shot.record);
      shot.say = clean(shot.say);
      shot.on_screen = clean(shot.on_screen);
    });
  }
  const ranges = draft.shots.map((shot) => trim(shot.seconds).match(/^(\d+)\s*[-–]\s*(\d+)$/));
  if (ranges.every(Boolean)) {
    const durations = ranges.map((range) => Number(range[2]) - Number(range[1]));
    let total = 0;
    for (let i = 0; i < durations.length; i += 1) {
      durations[i] = Math.max(durations[i], Math.ceil(speechWords(draft.shots[i].say) / 2.5));
      total += durations[i];
    }
    if (total <= 45) {
      let cursor = 0;
      draft.shots.forEach((shot, i) => { shot.seconds = `${cursor}-${cursor + durations[i]}`; cursor += durations[i]; });
      if (cursor !== Number(raw.duration_sec)) draft.duration_reason = `Dura ${cursor} segundos para decir cada frase con claridad y mostrar bien las tomas.`;
      draft.duration_sec = cursor;
    }
  }
  return draft;
}
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
    seconds: trim(shot.seconds),
    record: trim(shot.record),
    say: trim(shot.say),
    on_screen: trim(shot.on_screen),
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
    version: BRIEF_VERSION,
    product_id: allowedProductIds.includes(Number(raw.product_id)) ? Number(raw.product_id) : null,
    concept: trim(raw.concept),
    duration_sec: cursor,
    duration_reason: trim(raw.duration_reason),
    preparation: trim(raw.preparation),
    hook: trim(raw.hook),
    shots,
    cover: trim(raw.cover),
    caption: trim(raw.caption),
    cta: trim(raw.cta),
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
  if (!force && previous && Number(previous.version) >= BRIEF_VERSION && (previous.weather?.band || null) === weatherBand(day) &&
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
Producto(s) ya asociado(s) al slot o a su pieza (si hay, usá estos y no sustitutos): ${JSON.stringify(chosen.map((p) => ({ id: Number(p.id), name: p.name, category: p.category, description: trim(p.description).slice(0, 250), stock: p.stock })))}.
Productos reales disponibles para proponer (si el contenido necesita uno): ${JSON.stringify(products.map((p) => ({ id: Number(p.id), name: p.name, category: p.category, stock: p.stock, sales_30d: p.sales_30d })))}.
Ángulos recientes que NO hay que repetir: ${recent.map((r) => r.topic).filter(Boolean).join(' | ') || 'ninguno'}.
Elegí la idea más útil entre demostración de producto, consejo educativo, armado de pedidos, preparación y despacho, compra minorista, consulta mayorista, merchandising o detrás de escena. No fuerces una venta si el tema pide enseñar o generar confianza. Para despacho, no prometas plazos no verificados. Para mayorista, no inventes mínimos, descuentos ni condiciones. Sin testimonios ficticios.
Si hace calor en CABA, no vendas una campera térmica como necesidad local inmediata; si sirve para el sur del país, aclará ese público. Si llueve y el producto realmente lo resiste, podés usar ese ángulo, sin afirmar impermeabilidad sin ficha. Si no hay pronóstico, evitá afirmaciones meteorológicas.
Elegí 10 a 45 segundos según las escenas y el valor de la idea. El gancho debe aparecer en los primeros 2 segundos. Cada toma tiene que decir QUÉ grabar, QUÉ decir literalmente (si no lleva voz, cadena vacía) y QUÉ texto poner en pantalla. Contá las palabras habladas: máximo 2,5 palabras por segundo de esa toma, también en el gancho. Si hace falta explicar más, alargá esa toma o sacá palabras; no amontones voz. Usá cortes realizables con celular, producto real y personal propio, sin requerir modelos, locaciones ni clientes. La suma de rangos seconds debe coincidir con duration_sec. Cerrá con un CTA específico al objetivo.
Voz argentina natural, profesional y cercana, con voseo: “mostrá”, “mirá”, “fijate”, “armá el pedido”, “escribinos”. El tema y el brief indican QUÉ contar, no tenés que copiar sus palabras. Escribí indicaciones directas para quien graba: “Mostrá la etiqueta”, no “El presentador muestra la etiqueta” ni “La persona muestra la etiqueta”. Usá “3 cosas” o “3 consejos”, no “3 tips”. Evitá “seleccionar prendas”, “guardado estratégico”, “vida útil”, “tu inversión”, “cuidadosamente”, frases de catálogo y solemnidad. No prometas que la prenda durará más ni exijas mostrar un logo que no esté confirmado. Tampoco uses lunfardo, vulgaridades ni signos de apertura innecesarios. preparation: 2 o 3 frases concretas, máximo 260 caracteres; nombrá sólo objetos que realmente se usan en las tomas. Cada indicación visual máximo 190 caracteres; texto en pantalla máximo 65. Gancho máximo 85; caption máximo 300.
Si das consejos sobre cuidado de prendas, no supongas instrucciones de lavado, temperatura, detergente o secado de un modelo sin datos verificados de su etiqueta. Podés decir “mirá la etiqueta de cuidado” y mostrar qué información buscar.
Si nombrás un producto concreto, product_id debe ser su id real de la lista. Si ya hay un producto asociado, product_id DEBE ser ese id. Para educativo/engagement/marca sin producto fijado, product_id=null y enseñá o mostrá el proceso sin vender un modelo. Si no se necesita producto concreto, product_id=null y no nombres modelos específicos en las tomas.
Devolvé: {"product_id":123,"concept":"...","duration_sec":20,"duration_reason":"...","preparation":"...","hook":"...","shots":[{"seconds":"0-2","record":"...","say":"...","on_screen":"..."}],"cover":"...","caption":"...","cta":"..."}.`,
    maxTokens: 2600,
    temperature: 0.65,
  });
  let draft = result;
  let issues = briefIssues(draft, { products, chosen });
  for (let attempt = 0; issues.length && attempt < 2; attempt += 1) {
    draft = await generateJson({
      system: 'Sos editor de guiones de BLACKS Indumentaria. Corregís el JSON sin cambiar el objetivo ni inventar datos. Devolvés sólo JSON válido.',
      prompt: `Corregí este guion de Reel para que sea grabable y suene argentino, profesional y natural. Conservá la idea y las claves JSON originales. Problemas concretos:\n- ${issues.join('\n- ')}\n\nGuion: ${JSON.stringify(draft)}\n\nNo nombres productos si product_id es null. Las tomas deben cubrir 10 a 45 segundos consecutivos, con máximo 2,5 palabras habladas por segundo de cada toma. preparation completo y breve. Evitá consejos de cuidado no verificados.`,
      maxTokens: 3200,
      temperature: 0.25,
    });
    issues = briefIssues(draft, { products, chosen });
  }
  for (let attempt = 0; issues.length && attempt < 2; attempt += 1) {
    const before = JSON.stringify(draft);
    draft = await polishBriefFields(draft, products, chosen);
    issues = briefIssues(draft, { products, chosen });
    if (JSON.stringify(draft) === before) break;
  }
  if (issues.length) {
    draft = fitBriefTiming(draft, products, chosen);
    issues = briefIssues(draft, { products, chosen });
  }
  if (issues.length) throw new Error(`El guion necesita una corrección adicional: ${issues.slice(0, 3).join(' ')}`);
  const allowed = chosen.length ? chosen.map((p) => Number(p.id)) : products.map((p) => Number(p.id));
  const brief = normalizeBrief(draft, day, allowed);
  if (chosen.length && !brief.product_id) brief.product_id = Number(chosen[0].id);
  brief.product_name = [...chosen, ...products].find((p) => Number(p.id) === brief.product_id)?.name || null;
  await pool.query(`UPDATE content_calendar SET reel_brief = $2::jsonb, reel_brief_updated_at = now()
    WHERE id = $1 AND post_type = 'reel' AND status <> 'published'`, [id, JSON.stringify(brief)]);
  return brief;
}

async function refreshUpcomingReels({ startOffset = 0, endOffset = 7 } = {}) {
  await ensureSchema();
  const today = localDate();
  const { rows } = await pool.query(`SELECT id, scheduled_date, reel_brief FROM content_calendar
    WHERE post_type = 'reel' AND pillar <> 'repost' AND status IN ('pending', 'draft')
      AND scheduled_date BETWEEN $1::date + $2::int AND $1::date + $3::int
    ORDER BY scheduled_date`, [today, startOffset, endOffset]);
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
    if (old && Number(old.version) >= BRIEF_VERSION && fresh && productFresh && (old.weather?.band || null) === weatherBand(day) && old.weather?.date === (day?.date || undefined)) continue;
    try { await generateReelBrief(slot.id, { force: true }); refreshed += 1; }
    catch (err) { console.warn(`[reelBrief] Slot #${slot.id}: ${err.message}`); }
  }
  return refreshed;
}

module.exports = { generateReelBrief, refreshUpcomingReels, normalizeBrief, briefIssues, fitBriefTiming, ensureSchema };
