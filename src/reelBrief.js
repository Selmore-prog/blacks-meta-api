const pool = require('./db');
const { generateJson } = require('./ai');
const { capitalizarOraciones, fixSpelling } = require('./textUtils');
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

/* Último recurso para las expresiones acartonadas: si después de las correcciones de la IA
   sigue alguna (pasa con los modelos de respaldo de Groq), se cambia por la forma natural
   en vez de cortar el guion con un error. El 29-sep "un video de riptop" fallaba así. */
const NATURALES = [
  [/\bpresentador(a)?\b/gi, 'quien habla'],
  [/\bla persona\b/gi, 'quien graba'],
  [/\bguardado estrat[eé]gico\b/gi, 'guardado'],
  [/\bseleccionar (?:una? |\d+ )?prendas?\b/gi, 'elegir la prenda'],
  [/\basegurar buena iluminaci[oó]n\b/gi, 'buscar buena luz'],
  [/\btu inversi[oó]n\b/gi, 'tu ropa'],
  [/\btips\b/gi, 'consejos'],
  [/\btip\b/gi, 'consejo'],
  [/\bvida [uú]til\b/gi, 'duración'],
  [/\bcuidadosamente\b/gi, 'con cuidado'],
  [/\benfatizando\b/gi, 'mostrando'],
  [/\blogo de BLACKS\b/gi, 'logo'],
  [/\bdurar mucho m[aá]s\b/gi, 'durar más'],
  [/\bsiempre impecable\b/gi, 'prolija'],
];
const sinAcartonar = (value) => NATURALES.reduce((out, [re, to]) => out.replace(re, (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to)), trim(value));

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
  for (const field of ['concept', 'preparation', 'hook', 'cover', 'caption', 'cta']) draft[field] = sinAcartonar(draft[field]);
  draft.shots.forEach((shot) => {
    shot.record = sinAcartonar(shot.record);
    shot.say = sinAcartonar(shot.say);
    shot.on_screen = sinAcartonar(shot.on_screen);
  });
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

/* El texto del guion pasa por las mismas reglas que las piezas: mayúscula al empezar cada
   oración, voseo ("Desliza" → "Deslizá") y nada de las frases de IA prohibidas en la voz
   de la marca ("Descubrí…" salió en el primer guion por Groq, 29-sep-2026). */
// Los nombres del catálogo vienen sin tildes ("Pantalon Cargo"): se acentúan como en las piezas.
const limpio = (t) => capitalizarOraciones(fixSpelling(require('./templatesStudio').conTildes(trim(t))))
  .replace(/\b(D|d)escubr[ií]\b/g, (m, d) => (d === 'D' ? 'Conocé' : 'conocé'));

function normalizeBrief(raw, day, allowedProductIds = []) {
  if (!raw || !Array.isArray(raw.shots) || raw.shots.length < 2) throw new Error('La IA no devolvió escenas suficientes.');
  const shots = raw.shots.filter((shot) => shot && typeof shot === 'object').slice(0, 6).map((shot) => ({
    seconds: trim(shot.seconds),
    record: limpio(shot.record),
    say: limpio(shot.say),
    on_screen: limpio(shot.on_screen),
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
    concept: limpio(raw.concept),
    duration_sec: cursor,
    duration_reason: limpio(raw.duration_reason),
    preparation: limpio(raw.preparation),
    hook: limpio(raw.hook),
    shots,
    cover: limpio(raw.cover),
    caption: limpio(raw.caption),
    cta: limpio(raw.cta),
    // Sólo los guiones que salen de una idea escrita traen estos tres (ver briefFromIdea).
    ...(trim(raw.title) ? { title: trim(raw.title).slice(0, 70) } : {}),
    ...(trim(raw.pillar) ? { pillar: trim(raw.pillar) } : {}),
    ...(trim(raw.music) ? { music: trim(raw.music).slice(0, 160) } : {}),
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
  const brief = await finishBrief(result, { products, chosen, day });
  await pool.query(`UPDATE content_calendar SET reel_brief = $2::jsonb, reel_brief_updated_at = now()
    WHERE id = $1 AND post_type = 'reel' AND status <> 'published'`, [id, JSON.stringify(brief)]);
  return brief;
}

/**
 * Valida y corrige un guion hasta que sea grabable: tiempos consecutivos, palabras que
 * entran en cada toma, español argentino natural y ningún dato inventado. Lo comparten
 * el guion de un slot del calendario y el guion a partir de una idea escrita.
 */
async function finishBrief(result, { products, chosen, day }) {
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
  // Sólo para mostrar: el nombre del catálogo viene sin tildes ("Pantalon").
  const nombre = [...chosen, ...products].find((p) => Number(p.id) === brief.product_id)?.name || null;
  brief.product_name = nombre ? require('./templatesStudio').conTildes(nombre) : null;
  return brief;
}

/* ========================================================================
 * GUION A PARTIR DE UNA IDEA ESCRITA
 *
 * Pedido del dueño (sep-2026): "quiero hacer un video de Ripstop y que la aplicación me
 * dé todo el guion y la idea". Igual que "Publicación con un texto", pero para Reels:
 * una frase entra y sale el guion grabable completo — idea, gancho, qué grabar en cada
 * toma, qué decir, qué texto va en pantalla, portada, texto de la publicación y cierre.
 *
 * El producto lo elige el CATÁLOGO, no la IA: se buscan las palabras de la idea en los
 * nombres reales y gana el que más se parece a lo que se escribió (las ventas sólo
 * desempatan). Si la idea no nombra ninguna prenda, el Reel sale sin producto puntual.
 * No se guarda nada hasta que el dueño lo manda al calendario (createReelFromIdea).
 * ===================================================================== */

const RUIDO_IDEA = new Set(['video', 'videos', 'reel', 'reels', 'quiero', 'hacer', 'armar', 'crear', 'grabar', 'mostrar',
  'muestre', 'donde', 'como', 'para', 'sobre', 'tipo', 'estilo', 'algo', 'uno', 'una', 'unos', 'unas', 'del', 'los', 'las',
  'con', 'que', 'sea', 'nuestro', 'nuestra', 'nuestros', 'blacks', 'instagram', 'historia', 'idea', 'corto', 'cortito']);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Distancia de edición entre dos palabras (cuántas letras hay que cambiar). */
function distanciaEdicion(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = arriba;
    }
  }
  return fila[b.length];
}

/* La idea se escribe rápido y con errores: "un video de riptop" no encontraba el
   "Ripstop" del catálogo (la raíz "ripto" no está en "ripstop") y el guion salía sin
   producto elegido ni alternativas. Una palabra que no aparece en ningún nombre se
   cambia por la palabra real del catálogo más parecida (a una o dos letras de distancia). */
async function corregirContraCatalogo(palabras) {
  const { rows } = await pool.query(`SELECT name FROM products_cache WHERE ${require('./productScore').eligibleSQL()}`).catch(() => ({ rows: [] }));
  const vocabulario = [...new Set(rows.flatMap((r) => norm(r.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4)))];
  if (!vocabulario.length) return palabras;
  return palabras.map((w) => {
    if (vocabulario.some((v) => v.includes(w.slice(0, 5)))) return w;
    let mejor = null;
    let tope = w.length >= 7 ? 3 : 2; // 1 letra en palabras cortas, 2 en las largas
    for (const v of vocabulario) {
      if (Math.abs(v.length - w.length) >= tope) continue;
      const d = distanciaEdicion(w, v);
      if (d < tope) { tope = d; mejor = v; }
    }
    return mejor || w;
  });
}

async function productosDeLaIdea(idea) {
  const escritas = [...new Set(norm(idea).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !RUIDO_IDEA.has(w)))];
  if (!escritas.length) return [];
  const palabras = await corregirContraCatalogo(escritas);
  // Raíz de 5 letras: "camperas" encuentra "Campera", "chombas" encuentra "Chomba".
  const raices = palabras.map((w) => (w.length > 5 ? w.slice(0, 5) : w));
  const { rows } = await pool.query(
    `SELECT id, name, category, description, stock, price, image_url, COALESCE(sales_30d, 0) AS sales_30d
       FROM products_cache
      WHERE ${require('./productScore').eligibleSQL()} AND image_url IS NOT NULL
        AND translate(lower(name), 'áéíóúñü', 'aeiounu') LIKE ANY($1)
      ORDER BY COALESCE(sales_30d, 0) DESC LIMIT 30`,
    [raices.map((r) => `%${r}%`)]
  );
  const puntaje = (nombre) => raices.reduce((acc, r) => acc + (norm(nombre).includes(r) ? 1 : 0), 0);
  return rows
    .map((r, i) => ({ r, score: puntaje(r.name), i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((x) => x.r);
}

/** El primer día desde mañana sin otro Reel programado (la fecha la propone el calendario). */
async function fechaLibreParaReel() {
  const { rows } = await pool.query(
    `SELECT to_char(scheduled_date, 'YYYY-MM-DD') AS d FROM content_calendar
      WHERE scheduled_date >= current_date AND post_type = 'reel' AND status <> 'skipped'`
  );
  const tomados = new Set(rows.map((r) => r.d));
  const dia = new Date(`${localDate()}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  for (let i = 0; i < 30 && tomados.has(dia.toISOString().slice(0, 10)); i += 1) dia.setUTCDate(dia.getUTCDate() + 1);
  return dia.toISOString().slice(0, 10);
}

const PILARES = ['producto', 'promo', 'educativo', 'marca', 'mayorista', 'ugc', 'engagement'];

async function briefFromIdea({ idea, productIds = [], fecha = null } = {}) {
  await ensureSchema();
  const texto = trim(idea).slice(0, 800);
  if (texto.length < 6) { const e = new Error('Contame en una frase de qué querés que sea el video.'); e.status = 400; throw e; }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? fecha : await fechaLibreParaReel();

  // Productos: los elegidos a mano mandan; si no, los que nombra la idea.
  let chosen = [];
  let alternativas = [];
  const ids = (Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => n > 0).slice(0, 3);
  if (ids.length) {
    const found = await pool.query('SELECT id, name, category, description, stock, price, image_url FROM products_cache WHERE id = ANY($1::bigint[])', [ids]);
    chosen = ids.map((pid) => found.rows.find((p) => Number(p.id) === pid)).filter(Boolean);
  } else {
    const candidatos = await productosDeLaIdea(texto);
    if (candidatos.length) {
      chosen = [candidatos[0]];
      alternativas = candidatos.slice(1, 6).map((p) => ({ id: Number(p.id), name: p.name, image_url: p.image_url }));
    }
  }

  const [{ rows: products }, { rows: recent }] = await Promise.all([
    pool.query(`SELECT id, name, category, description, stock, sales_30d
      FROM products_cache WHERE ${require('./productScore').eligibleSQL()}
      ORDER BY COALESCE(sales_30d, 0) DESC, stock DESC LIMIT 10`),
    pool.query(`SELECT COALESCE(theme_title, pillar_detail) AS topic FROM content_calendar
      WHERE post_type = 'reel' AND scheduled_date BETWEEN $1::date - 35 AND $1::date + 14
      ORDER BY scheduled_date DESC LIMIT 8`, [date]),
  ]);
  const forecast = await getForecast();
  const day = weatherForDate(forecast, date);
  const weatherLine = day
    ? `Pronóstico CABA para ${date}: mínima aproximada ${day.min}°C, máxima aproximada ${day.max}°C${day.rainMm == null ? '' : `, lluvia hasta ${day.rainMm} mm en 6 horas`}. Es pronóstico: no cites cifras en el texto público; usalo sólo para el ángulo.`
    : `Sin pronóstico confiable para ${date}: usá la temporada, sin afirmar temperatura ni lluvia.`;

  const result = await generateJson({
    system: 'Sos director creativo y de producción de reels de BLACKS Indumentaria, Argentina. Convertís una idea del dueño en un guion grabable concreto. Respondés sólo JSON válido.',
    prompt: `El dueño escribió esta idea para un Reel de Instagram 9:16: «${texto}».
Esa es la idea central y hay que respetarla: tu trabajo es convertirla en un GUION GRABABLE completo, no cambiarla por otra.
Fecha prevista: ${date}. ${weatherLine}
Producto(s) de la idea, del catálogo real (si hay, el Reel es sobre éste; no lo cambies por otro): ${JSON.stringify(chosen.map((p) => ({ id: Number(p.id), name: p.name, category: p.category, description: trim(p.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 320), stock: p.stock })))}.
Otros productos reales (sólo si la idea necesita uno y no hay ninguno arriba): ${JSON.stringify(products.map((p) => ({ id: Number(p.id), name: p.name, category: p.category })))}.
Reels recientes o próximos, para no repetir el ángulo: ${recent.map((r) => r.topic).filter(Boolean).join(' | ') || 'ninguno'}.

Cómo tiene que ser:
- 10 a 45 segundos según lo que pida la idea. El gancho, en los primeros 2 segundos.
- Cada toma dice QUÉ grabar (orden directa a quien graba: "Mostrá…", "Acercá…"), QUÉ decir literalmente (si no lleva voz, cadena vacía) y QUÉ texto va en pantalla. Máximo 2,5 palabras habladas por segundo de cada toma.
- Grabable con celular, con el producto real y personal propio: sin modelos contratados, locaciones ni clientes. Si la idea pide mostrar la tela, la costura o la resistencia, pensá tomas cercanas y pruebas simples que se puedan hacer de verdad sin romper nada.
- No inventes datos: materiales, normas, cuotas, envíos, descuentos o plazos sólo si figuran en la descripción del producto. Sin testimonios ficticios. Sin consejos de lavado que no estén en la etiqueta.
- Voz argentina natural, profesional y cercana, con voseo. Sin lunfardo, sin "tips", sin frases de catálogo.
- preparation: 2 o 3 frases concretas (máx. 260 caracteres) con lo que hay que tener a mano. Cada indicación visual máx. 190 caracteres; texto en pantalla máx. 65; gancho máx. 85; caption máx. 300.
- title: un título corto para el calendario (máx. 60 caracteres).
- pillar: uno de ${PILARES.join(', ')}.
- music: qué música o ritmo le va (género y tempo, sin nombrar temas con derechos).
- Si nombrás un producto, product_id tiene que ser su id real de la lista; si hay uno arriba, es ése.

Devolvé: {"title":"...","pillar":"producto","product_id":123,"concept":"...","duration_sec":20,"duration_reason":"...","preparation":"...","hook":"...","shots":[{"seconds":"0-2","record":"...","say":"...","on_screen":"..."}],"cover":"...","caption":"...","cta":"...","music":"..."}.`,
    maxTokens: 2800,
    temperature: 0.7,
  });
  const brief = await finishBrief(result, { products, chosen, day });
  if (!PILARES.includes(brief.pillar)) brief.pillar = chosen.length ? 'producto' : 'marca';
  if (!brief.title) brief.title = trim(texto).slice(0, 60);
  brief.idea = texto;
  return {
    brief,
    fecha: date,
    hora: '18:00',
    productos: chosen.map((p) => ({ id: Number(p.id), name: p.name, image_url: p.image_url, stock: p.stock, alternativas })),
  };
}

/**
 * Manda al calendario el Reel de una idea: crea el slot (formato 9:16, producto fijado)
 * con el guion ya aprobado adentro. No vuelve a llamar a la IA: se guarda lo que el
 * dueño vio y aceptó.
 */
async function createReelFromIdea({ brief, fecha, hora = '18:00', productIds = [], idea = '' } = {}) {
  await ensureSchema();
  if (!brief || !Array.isArray(brief.shots)) { const e = new Error('Falta el guion.'); e.status = 400; throw e; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) { const e = new Error('Fecha inválida (usá AAAA-MM-DD).'); e.status = 400; throw e; }
  if (!/^\d{1,2}:\d{2}$/.test(String(hora || ''))) { const e = new Error('Hora inválida (usá HH:MM).'); e.status = 400; throw e; }
  const ids = (Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => n > 0).slice(0, 4);
  // Se vuelve a validar lo que llega del navegador: el guion tiene que seguir siendo grabable.
  const issues = briefIssues(brief, { products: [], chosen: ids.map((id) => ({ id })) })
    .filter((i) => !/product_id/.test(i));
  if (issues.length) { const e = new Error(`El guion no es válido: ${issues.slice(0, 2).join(' ')}`); e.status = 400; throw e; }
  const day = weatherForDate(await getForecast(), fecha);
  const guardado = normalizeBrief(brief, day, ids);
  if (ids.length && !guardado.product_id) guardado.product_id = ids[0];
  guardado.product_name = brief.product_name || null;
  guardado.idea = trim(idea || brief.idea).slice(0, 800) || null;
  const pillar = PILARES.includes(brief.pillar) ? brief.pillar : (ids.length ? 'producto' : 'marca');
  const { rows } = await pool.query(
    `INSERT INTO content_calendar
       (scheduled_date, platform, post_type, format, pillar, pillar_detail, automation_level, scheduled_time,
        theme_title, carousel, status, origin, forced_product_id, forced_product_ids, reel_brief, reel_brief_updated_at)
     VALUES ($1, 'instagram', 'reel', 'story', $2, $3, 'auto', $4, $5, false, 'pending', 'manual', $6, $7, $8::jsonb, now())
     RETURNING *`,
    [fecha, pillar, trim(idea || brief.idea || brief.concept).slice(0, 600), hora, trim(brief.title || brief.concept).slice(0, 80),
      ids[0] || null, JSON.stringify(ids), JSON.stringify(guardado)]
  );
  return rows[0];
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
    // Un guion que salió de una idea del dueño y él mismo mandó al calendario no se
    // rehace solo: sólo se actualiza si lo pide con "Actualizar guion".
    if (old && old.idea) continue;
    const fresh = old?.generated_at && Date.now() - Date.parse(old.generated_at) < 72 * 60 * 60 * 1000;
    const productFresh = !old?.product_id || eligibleIds.has(Number(old.product_id));
    if (old && Number(old.version) >= BRIEF_VERSION && fresh && productFresh && (old.weather?.band || null) === weatherBand(day) && old.weather?.date === (day?.date || undefined)) continue;
    try { await generateReelBrief(slot.id, { force: true }); refreshed += 1; }
    catch (err) { console.warn(`[reelBrief] Slot #${slot.id}: ${err.message}`); }
  }
  return refreshed;
}

module.exports = { generateReelBrief, refreshUpcomingReels, normalizeBrief, briefIssues, fitBriefTiming, ensureSchema, briefFromIdea, createReelFromIdea, productosDeLaIdea };
