const pool = require('./db');
const crypto = require('crypto');
const { generateJson } = require('./ai');
const { getForecast, weatherForDate } = require('./weather');
const { eligibleSQL } = require('./productScore');
const { getConfig: getBenefitsConfig } = require('./benefits');
const { getCompanyFacts } = require('./companyInfo');
const { getWholesaleSettings, wholesaleContext } = require('./wholesale');
const { productUrl, completeMessage, normalizeChannelTone, verifiedBenefitsConfig } = require('./channelCommerce');
const { dateKey, editorialBody, catalogEvidence, reviewPosts } = require('./channelEditorial');

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS whatsapp_channel_posts (
  id BIGSERIAL PRIMARY KEY,
  post_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('texto', 'encuesta')),
  topic TEXT NOT NULL,
  body TEXT NOT NULL,
  poll_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_prompt TEXT,
  product_id BIGINT REFERENCES products_cache(id) ON DELETE SET NULL,
  product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'automatic',
  batch_id UUID,
  position INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  topic_request TEXT,
  audience TEXT NOT NULL DEFAULT 'minorista',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 1;
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS topic_request TEXT;
ALTER TABLE whatsapp_channel_posts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'minorista';
ALTER TABLE whatsapp_channel_posts DROP CONSTRAINT IF EXISTS whatsapp_channel_posts_post_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_channel_automatic_date
  ON whatsapp_channel_posts(post_date) WHERE source = 'automatic' AND position = 1;
CREATE INDEX IF NOT EXISTS idx_whatsapp_channel_posts_date ON whatsapp_channel_posts(post_date);`;

let schemaPromise;
async function ensureSchema() {
  if (!schemaPromise) schemaPromise = pool.query(SCHEMA_SQL).catch((err) => { schemaPromise = null; throw err; });
  await schemaPromise;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateRange(start, count) {
  const date = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

async function contextFor(dates) {
  const [catalog, wholesaleCatalog, commercial, recent, forecast, benefits, companyFacts, wholesale] = await Promise.all([
    pool.query(`WITH ranked AS (
        SELECT id, name, brand, category, stock, image_url,
          COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink,
          price, promo_price, raw, sales_30d,
          row_number() OVER (PARTITION BY COALESCE(category, '')
            ORDER BY sales_30d DESC NULLS LAST, stock DESC) AS category_rank
        FROM products_cache WHERE ${eligibleSQL()}
          AND synced_at >= now() - interval '36 hours'
      ) SELECT id, name, brand, category, stock, image_url, permalink, price, promo_price, raw, sales_30d
      FROM ranked WHERE category_rank <= 5
      ORDER BY category_rank, sales_30d DESC NULLS LAST LIMIT 30`),
    pool.query(`SELECT id, name, brand, category, stock, image_url,
      COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink,
      price, promo_price, raw FROM products_cache
      WHERE published IS NOT FALSE AND image_url IS NOT NULL
        AND (price IS NULL OR price <= 0) AND (stock IS NULL OR stock >= 5)
        AND synced_at >= now() - interval '36 hours'
      ORDER BY synced_at DESC, name LIMIT 16`),
    pool.query(`SELECT event_date, title, angle FROM commercial_dates
      WHERE event_date BETWEEN $1 AND $2 ORDER BY event_date`, [dates[0], dates.at(-1)]),
    pool.query(`SELECT w.post_date, w.topic, w.body, w.kind, w.audience, w.product_id, w.product_ids,
        w.source, w.status, w.scheduled_at, p.name AS product_name
      FROM whatsapp_channel_posts w LEFT JOIN products_cache p ON p.id = w.product_id
      WHERE w.post_date BETWEEN $1::date - 45 AND $2::date + 45
      ORDER BY w.post_date, w.scheduled_at NULLS LAST, w.id LIMIT 160`, [dates[0], dates.at(-1)]),
    getForecast(),
    getBenefitsConfig().catch(() => null),
    getCompanyFacts().catch(() => null),
    getWholesaleSettings().catch(() => null),
  ]);
  return { products: catalog.rows, wholesaleProducts: wholesaleCatalog.rows,
    dates: commercial.rows, recent: recent.rows, forecast,
    benefits: verifiedBenefitsConfig(benefits, companyFacts), wholesale };
}

function timelineText(posts, products) {
  const names = new Map(products.map((p) => [String(p.id), p.name]));
  return posts.map((p) => {
    const ids = Array.isArray(p.product_ids) && p.product_ids.length ? p.product_ids : [p.product_id].filter(Boolean);
    const used = ids.map((id) => names.get(String(id)) ||
      (String(p.product_id) === String(id) ? p.product_name : null) || `#${id}`).join(', ');
    return `${dateKey(p.post_date)} [${p.status}, ${p.source}, ${p.audience}, ${p.kind}] ${p.topic}; producto: ${used || 'ninguno'}; texto: ${editorialBody(p.body).slice(0, 500)}`;
  }).join('\n') || 'Sin publicaciones cercanas.';
}

function generationPrompt({ dates, ctx, forecastText, replaceTopic = '', feedback = '', draft = null }) {
  const available = (items) => items.filter(productUrl).map((p) =>
    `#${p.id} ${p.name} [${p.category || 'sin categoría'}]; rasgos comprobables: ${catalogEvidence(p).slice(0, 430)}`
  ).join('\n') || 'ninguno';
  const current = ctx.recent.filter((p) => dates.includes(dateKey(p.post_date)) && p.source === 'automatic');
  const surrounding = ctx.recent.filter((p) => !current.includes(p));
  return `Armá ${dates.length} publicación(es), una para cada fecha: ${dates.join(', ')}. Sos el editor humano del canal de WhatsApp de BLACKS Indumentaria. Antes de escribir, evaluá en privado para cada fecha: qué publicó antes y qué tiene planificado después, qué artículo y categoría ya aparecieron, si el tema aporta algo nuevo, qué necesidad real resuelve el producto, si el clima es pertinente, qué hecho del catálogo respalda cada afirmación, qué apertura y estructura usaste en otras recomendaciones y qué motivo tendría alguien para leerlo. Revisá la semana completa como una secuencia, no como piezas aisladas. No incluyas ese análisis en el JSON.

HISTORIAL Y PLANIFICACIÓN CERCANA (texto editorial sin pie comercial):
${timelineText(surrounding, [...ctx.products, ...ctx.wholesaleProducts])}
${current.length ? `\nPROPUESTAS EXISTENTES EN LOS DÍAS QUE SE REGENERAN (evitá copiarlas):\n${timelineText(current, [...ctx.products, ...ctx.wholesaleProducts])}` : ''}

PRODUCTOS MINORISTAS CON STOCK, PRECIO Y ENLACE: ${available(ctx.products)}
PRODUCTOS MAYORISTAS APTOS: ${available(ctx.wholesaleProducts)}
Condiciones mayoristas verificadas: ${wholesaleContext(ctx.wholesale) || 'sin datos configurados'}.
Clima previsto SÓLO en CABA: ${forecastText}. Fechas comerciales: ${ctx.dates.map((d) => `${dateKey(d.event_date)} ${d.title}: ${d.angle || ''}`).join('; ') || 'ninguna'}.

REGLAS EDITORIALES:
- El texto acompaña una pieza visual breve de aviso, promoción o producto: la imagen mostrará nombre, foto completa y precio verificado si corresponde. El copy debe aportar contexto de uso, un detalle útil o cómo pedirlo; no repetir un eslogan, transcribir una ficha técnica ni describir todo lo que se ve. No anuncies novedad o reposición sin evidencia. No enumeres colores ni talles a partir de la descripción: se agregan desde las variantes vigentes. Conservá variedad de estructura y tono natural.
- Alterná información útil, novedades concretas de producto y conversación; en una semana incluí 1-2 encuestas y 1-2 mensajes mayoristas si hay productos mayoristas aptos. No rellenes todos los días con ventas.
- No repitas producto en un lapso de 7 días, incluyendo publicaciones pasadas, futuras y los demás días de esta tanda. No repitas título, idea, gancho ni texto de los últimos 30 días. Diversificá categorías y marcas.
- Una recomendación debe tener una razón específica y comprobable. Si el catálogo sólo da el nombre, no atribuyas prestaciones, materiales, resistencia, comodidad o usos técnicos sin evidencia. Si no encontrás un producto coherente con el tema, elegí otro tema o dejá product_id en null.
- Mencioná lluvia sólo cuando el producto tenga un vínculo directo y comprobable con ella (por ejemplo impermeabilidad documentada). Un jean o pantalón común no resuelve la lluvia. No uses el pronóstico como excusa para recomendar cualquier prenda; tampoco extrapoles CABA al país ni cites temperaturas exactas.
- En recomendaciones variá de verdad la forma: una escena de uso creíble, una observación práctica, una pregunta útil, un detalle de producto verificado o una comparación. Alterná aperturas, longitud, cantidad de párrafos, ritmo, cierre y ubicación del producto. Que algunas sean de una sola frase y otras tengan dos párrafos breves; si hay tres o más recomendaciones, al menos una debe tener dos párrafos. Apuntá a 25-60 palabras de texto editorial por publicación. Evitá títulos comodín como "Novedad de producto" y frases vacías como "día a día", "uso diario", "excelente opción", "es ideal para", "comodidad y estilo", "te acompaña", "un clásico que siempre suma" o "aliado para tu día a día". Elegí un rasgo distintivo del catálogo para cada artículo y no repitas el mismo beneficio en varios posts.
- Español argentino natural y profesional, sin lenguaje inclusivo, "Atención", "Che" o "volvió a ingresar". Emojis sólo cuando aporten, máximo dos. Sin hashtags. No inventes precios, envíos, cuotas, descuentos, testimonios ni disponibilidad. Esos datos y enlaces se adjuntan después: NO los escribas en body.
- En mayorista hablá de consulta o pedido, nunca de precio minorista ni carrito. Si no hay producto apto, hacé contenido útil sin artículo específico.
- En encuesta, body es la pregunta exacta, poll_options tiene 2 a 4 respuestas cortas y product_id debe ser null. En texto, poll_options es []. image_prompt puede ser null; si existe, fiel al producto real y sin logos ni texto inventados.
${replaceTopic ? `- Reemplazá esta idea: ${replaceTopic}.` : ''}
${feedback ? `\nERRORES DETECTADOS EN EL BORRADOR ANTERIOR; corregilos todos: ${feedback}` : ''}
${draft ? `\nREFERENCIA BREVE DEL BORRADOR ANTERIOR, sólo para entender los errores: ${JSON.stringify(draft.map((p) => ({ date: p.date, topic: p.topic, product_id: p.product_id, opening: String(p.body || '').slice(0, 100) })))}` : ''}

Devolvé SÓLO {"posts":[{"date":"YYYY-MM-DD","kind":"texto|encuesta","audience":"minorista|mayorista","topic":"...","body":"...","poll_options":[],"image_prompt":null,"product_id":123 o null}]}.`;
}

async function critiquePosts(posts, ctx, surrounding) {
  const evidence = [...ctx.products, ...ctx.wholesaleProducts].filter((p) =>
    posts.some((post) => String(post.product_id) === String(p.id))
  ).map((p) => `#${p.id} ${catalogEvidence(p).slice(0, 800)}`).join('\n');
  const result = await generateJson({
    system: 'Sos un editor exigente que audita copys comerciales. Respondé sólo JSON válido.',
    prompt: `Auditá estas publicaciones para el canal de BLACKS. Marcá SÓLO problemas concretos, indicando fecha: ideas o estructuras repetidas entre sí o con la planificación, producto que no resuelve el tema, afirmaciones sin sustento en el catálogo, frases genéricas o estilo de plantilla, introducciones demasiado parecidas y recomendaciones sin un dato específico. Una encuesta no necesita producto ni dato de catálogo: alcanza con una pregunta concreta y pertinente para gente que compra ropa de trabajo o calzado. No juzgues el pie comercial que se agregará después. No propongas productos fuera del catálogo. Si está bien, issues debe ser [].
CATÁLOGO VERIFICADO:\n${evidence || 'sin productos'}
PUBLICACIONES YA HECHAS O PLANIFICADAS:\n${timelineText(surrounding, [...ctx.products, ...ctx.wholesaleProducts])}
BORRADOR:\n${JSON.stringify(posts)}
Devolvé SOLO {"issues":[{"date":"YYYY-MM-DD","reason":"problema concreto y cómo corregirlo"}]}.`,
    maxTokens: 1400,
    temperature: 0.2,
    thinkingBudget: 1000,
  });
  if (!Array.isArray(result?.issues)) throw new Error('La revisión editorial no devolvió un resultado válido.');
  return result.issues.slice(0, 8).map((issue) => `${dateKey(issue.date)}: ${String(issue.reason || '').slice(0, 350)}`)
    .filter((issue) => issue.length > 14);
}

async function repairStyleIssues(posts, issues, ctx) {
  const byDate = new Map();
  for (const issue of issues) {
    const date = issue.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) byDate.set(date, [...(byDate.get(date) || []), issue]);
  }
  if (issues.some((issue) => issue.includes('un solo bloque'))) {
    const post = posts.find((p) => p.kind === 'texto' && p.product_id);
    if (post) byDate.set(post.date, [...(byDate.get(post.date) || []),
      'Reescribí en dos párrafos breves con un salto de línea real; hacé que la segunda parte agregue un dato concreto.']);
  }
  const catalog = [...ctx.products, ...ctx.wholesaleProducts];
  const revised = await Promise.all(posts.map(async (post) => {
    const problems = byDate.get(post.date);
    if (!problems?.length) return post;
    const product = catalog.find((p) => String(p.id) === String(post.product_id));
    const result = await generateJson({
      system: 'Sos editor de estilo de un canal comercial argentino. Respondé sólo JSON válido.',
      prompt: `Reescribí una sola publicación. Conservá fecha, público, tipo y product_id. Corregí específicamente: ${problems.join(' ')}\nProducto y datos verificables: ${product ? catalogEvidence(product).slice(0, 800) : 'sin producto específico'}.\nOtras piezas de la tanda, para no parecerte: ${JSON.stringify(posts.filter((p) => p.date !== post.date).map((p) => ({ topic: p.topic, body: p.body })))}.\nTexto actual: ${JSON.stringify({ topic: post.topic, body: post.body, poll_options: post.poll_options })}.\n${post.kind === 'encuesta' ? 'La pregunta debe ser breve, específica para compradores de indumentaria de trabajo o calzado, y tener 2-4 opciones concretas. No agregues producto_id.' : 'Usá español argentino natural, 25-60 palabras, sin frases genéricas ni prestaciones inventadas.'} Devolvé sólo {"topic":"...","body":"...","poll_options":[]}.`,
      maxTokens: 650,
      temperature: 0.7,
    });
    if (!String(result?.topic || '').trim() || !String(result?.body || '').trim()) return post;
    const options = post.kind === 'encuesta' && Array.isArray(result.poll_options)
      ? result.poll_options.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 4) : [];
    return { ...post, topic: String(result.topic).trim().slice(0, 120), body: String(result.body).trim().slice(0, 1800),
      poll_options: options.length >= 2 ? options : post.poll_options };
  }));
  return revised;
}

function normalizePosts(raw, dates, products, wholesaleProducts = []) {
  if (!Array.isArray(raw)) throw new Error('La IA no devolvió publicaciones.');
  const byDate = new Map(raw.map((p) => [String(p?.date || '').slice(0, 10), p]));
  const retailEligible = new Map(products.map((p) => [String(p.id), p]));
  const wholesaleEligible = new Map(wholesaleProducts.map((p) => [String(p.id), p]));
  return dates.map((date) => {
    const item = byDate.get(date);
    if (!item || !String(item.body || '').trim() || !String(item.topic || '').trim()) {
      throw new Error(`Falta una propuesta válida para ${date}. No se guardó la tanda.`);
    }
    const kind = item.kind === 'encuesta' ? 'encuesta' : 'texto';
    const audience = item.audience === 'mayorista' ? 'mayorista' : 'minorista';
    const options = kind === 'encuesta' && Array.isArray(item.poll_options)
      ? item.poll_options.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 4) : [];
    if (kind === 'encuesta' && options.length < 2) throw new Error(`La encuesta del ${date} no tiene opciones completas.`);
    const product = (audience === 'mayorista' ? wholesaleEligible : retailEligible).get(String(item.product_id || '')) || null;
    if (item.product_id && !product) throw new Error(`La propuesta del ${date} eligió un producto sin stock apto. No se guardó la tanda.`);
    return {
      date, kind, audience, topic: String(item.topic).trim().slice(0, 120), body: String(item.body).trim().slice(0, 1800),
      poll_options: options, image_prompt: item.image_prompt ? String(item.image_prompt).trim().slice(0, 1000) : null,
      product_id: product?.id || null,
    };
  });
}

async function generatePosts({ start, count = 7, replaceTopic = '' }) {
  if (!validDate(start) || ![1, 7].includes(count)) {
    const err = new Error('Elegí una fecha válida y un día o una semana.'); err.status = 400; throw err;
  }
  await ensureSchema();
  const dates = dateRange(start, count);
  const ctx = await contextFor(dates);
  const forecastText = dates.map((date) => {
    const w = weatherForDate(ctx.forecast, date);
    return `${date}: ${w ? `${w.min}-${w.max} °C, lluvia hasta ${w.rainMm ?? 'sin dato'} mm/6h` : 'sin pronóstico'}`;
  }).join('; ');
  const surrounding = ctx.recent.filter((p) => !(dates.includes(dateKey(p.post_date)) && p.source === 'automatic'));
  const retailEligible = ctx.products.filter(productUrl);
  const wholesaleEligible = ctx.wholesaleProducts.filter(productUrl);
  let posts;
  let feedback = '';
  let draft = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await generateJson({
      system: 'Sos editor del canal de WhatsApp de BLACKS Indumentaria en Argentina. Respondé sólo JSON válido.',
      prompt: generationPrompt({ dates, ctx, forecastText, replaceTopic, feedback, draft }),
      maxTokens: count === 7 ? 6000 : 1200,
      temperature: attempt === 0 ? 0.85 : 0.65,
      thinkingBudget: count === 7 ? 700 : 400,
    });
    try {
      let candidate = normalizePosts(result?.posts, dates, retailEligible, wholesaleEligible);
      let issues = reviewPosts(candidate, surrounding, [...retailEligible, ...wholesaleEligible]);
      if (issues.length && issues.every((issue) => /frase genérica|demasiado largo|un solo bloque|repite (?:la|una) apertura|texto se parece/.test(issue))) {
        candidate = await repairStyleIssues(candidate, issues, ctx);
        issues = reviewPosts(candidate, surrounding, [...retailEligible, ...wholesaleEligible]);
      }
      if (issues.length) {
        feedback = issues.join(' ');
        draft = candidate;
        continue;
      }
      let editorialIssues = await critiquePosts(candidate, ctx, surrounding);
      if (editorialIssues.length) {
        candidate = await repairStyleIssues(candidate, editorialIssues, ctx);
        issues = reviewPosts(candidate, surrounding, [...retailEligible, ...wholesaleEligible]);
        if (!issues.length) editorialIssues = await critiquePosts(candidate, ctx, surrounding);
        else editorialIssues = issues;
      }
      if (editorialIssues.length) {
        feedback = editorialIssues.join(' ');
        draft = candidate;
        continue;
      }
      posts = candidate;
      break;
    } catch (err) {
      feedback = `${err.message}${result && !Array.isArray(result.posts) ? ` (campos recibidos: ${Object.keys(result).join(', ')})` : ''}`;
      draft = Array.isArray(result?.posts) ? result.posts : null;
    }
  }
  if (!posts) throw new Error(`La tanda no superó la revisión editorial: ${feedback}. No se guardó nada.`);
  const retail = new Map(ctx.products.map((p) => [String(p.id), p]));
  const wholesale = new Map(ctx.wholesaleProducts.map((p) => [String(p.id), p]));
  let recommendationIndex = 0;
  for (const post of posts) {
    const product = (post.audience === 'mayorista' ? wholesale : retail).get(String(post.product_id));
    const presentation = product && post.kind === 'texto' ? recommendationIndex++ % 3 : 0;
    post.body = post.kind === 'encuesta' ? normalizeChannelTone(post.body)
      : completeMessage(post.body, product ? [product] : [], post.audience, ctx.benefits, ctx.wholesale,
        presentation);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const post of posts) {
      await client.query(`INSERT INTO whatsapp_channel_posts
        (post_date, kind, topic, body, poll_options, image_prompt, product_id, product_ids, audience, source, position)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, 'automatic', 1)
        ON CONFLICT (post_date) WHERE source = 'automatic' AND position = 1
        DO UPDATE SET kind = EXCLUDED.kind, topic = EXCLUDED.topic,
          body = EXCLUDED.body, poll_options = EXCLUDED.poll_options, image_prompt = EXCLUDED.image_prompt,
          product_id = EXCLUDED.product_id, product_ids = EXCLUDED.product_ids, audience = EXCLUDED.audience,
          status = 'draft', generated_at = now(), updated_at = now()`,
        [post.date, post.kind, post.topic, post.body, JSON.stringify(post.poll_options), post.image_prompt,
          post.product_id, JSON.stringify(post.product_id ? [post.product_id] : []), post.audience]);
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
  return (await listPosts(dates[0], dates.at(-1))).filter((p) => p.source === 'automatic');
}

async function listPosts(from, to) {
  await ensureSchema();
  if (!validDate(from) || !validDate(to) || to < from) {
    const err = new Error('Rango de fechas inválido.'); err.status = 400; throw err;
  }
  const { rows } = await pool.query(`SELECT w.*, p.name AS product_name, p.image_url AS product_image_url,
    p.permalink AS product_permalink, p.stock AS product_stock, p.published AS product_published,
    p.synced_at AS product_synced_at, COALESCE(selected.items, '[]'::json) AS selected_products
    FROM whatsapp_channel_posts w LEFT JOIN products_cache p ON p.id = w.product_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', pc.id, 'name', pc.name, 'stock', pc.stock,
        'image_url', pc.image_url, 'published', pc.published, 'synced_at', pc.synced_at)
        ORDER BY ids.ord) AS items
      FROM jsonb_array_elements_text(w.product_ids) WITH ORDINALITY AS ids(pid, ord)
      JOIN products_cache pc ON pc.id = ids.pid::bigint
    ) selected ON true
    WHERE w.post_date BETWEEN $1 AND $2 ORDER BY w.post_date, w.scheduled_at NULLS LAST, w.position, w.id`, [from, to]);
  return rows;
}

async function getSummary() {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE kind = 'encuesta')::int AS polls,
    count(*) FILTER (WHERE status = 'planned')::int AS planned,
    count(*) FILTER (WHERE status = 'planned' AND scheduled_at <= now())::int AS due,
    min(scheduled_at) FILTER (WHERE status = 'planned' AND scheduled_at > now()) AS next_scheduled_at,
    max(generated_at) AS last_generated_at FROM whatsapp_channel_posts`);
  return rows[0];
}

function localDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Un brief libre crea uno o dos mensajes con productos elegidos por el dueño. */
async function generateFromIdea({ idea, productIds = [], count = 1, scheduledAt = null, audience = 'minorista' }) {
  await ensureSchema();
  const topic = String(idea || '').trim().slice(0, 500);
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(Number))];
  if (topic.length < 5 || ![1, 2].includes(count) || !['minorista', 'mayorista'].includes(audience) || ids.length > 4 ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    const err = new Error('Escribí el tema, elegí 1 o 2 mensajes y hasta 4 productos válidos.'); err.status = 400; throw err;
  }
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 120000 ||
      when.getTime() > Date.now() + 366 * 86400000) {
    const err = new Error('Elegí una fecha y hora de publicación válida, hasta un año en adelante.'); err.status = 400; throw err;
  }
  const date = localDate(when);
  const [chosen, forecast, benefitsConfig, companyFacts, wholesale] = await Promise.all([
    ids.length ? pool.query(`SELECT id, name, brand, category, stock, image_url, price, promo_price, raw,
        COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
      FROM products_cache WHERE id = ANY($1::bigint[]) AND ${audience === 'mayorista'
    ? 'published IS NOT FALSE AND (stock IS NULL OR stock > 0)'
    : eligibleSQL()}
        AND synced_at >= now() - interval '36 hours'`, [ids]) : { rows: [] },
    getForecast(),
    getBenefitsConfig().catch(() => null),
    getCompanyFacts().catch(() => null),
    getWholesaleSettings().catch(() => null),
  ]);
  if (chosen.rows.length !== ids.length) {
    const err = new Error('Uno de los productos ya no tiene stock/talles aptos o el catálogo está desactualizado. Sincronizá y volvé a elegirlo.');
    err.status = 409; throw err;
  }
  const products = ids.map((id) => chosen.rows.find((p) => Number(p.id) === id));
  const benefits = verifiedBenefitsConfig(benefitsConfig, companyFacts);
  if (products.some((p) => !productUrl(p))) {
    const err = new Error('Un producto no tiene enlace de compra en Tiendanube. Elegí otro o sincronizá el catálogo.');
    err.status = 409; throw err;
  }
  const weather = weatherForDate(forecast, date);
  const result = await generateJson({
    system: 'Sos editor del canal de WhatsApp de BLACKS Indumentaria. Devolvé sólo JSON válido.',
    prompt: `El dueño quiere publicar ${count} mensaje(s) para público ${audience} sobre: "${topic}". Fecha prevista: ${date}. Productos que ELIGIÓ y están disponibles en catálogo: ${products.map((p) => `#${p.id} ${p.name}${p.brand ? ` (${p.brand})` : ''}, categoría ${p.category || 'sin dato'}`).join('; ') || 'ninguno'}. Usá esos productos si se eligieron; no sustituyas ni agregues otros. ${audience === 'mayorista' ? `Enfoque mayorista: invitá a consultar o pedir presupuesto, sin hablar de compra minorista ni precios. Condiciones verificadas: ${wholesaleContext(wholesale) || 'ninguna configurada'}.` : 'Enfoque minorista: invitá a comprar cuando corresponda.'} Si el tema es un reingreso, decilo de forma natural, por ejemplo "Ya está disponible otra vez", sin afirmar cantidades, fecha de reposición o talles específicos. Si pidió dos mensajes, que sean complementarios y con distinto enfoque. Español argentino claro y profesional, como escrito por una persona; sin lenguaje inclusivo, sin "Atención", "Che" ni "volvió a ingresar". Usá uno o dos emojis pertinentes, sin exceso. Sin hashtags. No escribas precios, cuotas, envío gratis, descuentos ni enlaces: los datos verificables se agregan después desde el catálogo. No inventes testimonios ni beneficios. ${weather ? `Clima previsto en CABA: ${weather.min}-${weather.max}°C, lluvia hasta ${weather.rainMm ?? 'sin dato'} mm/6h. Usalo sólo si aporta al tema, sin extrapolarlo a todo el país.` : 'Sin pronóstico para esa fecha.'} El copy acompañará una imagen breve de aviso con el producto completo: agregá contexto y un detalle útil, sin transcribir la ficha ni repetir el título. Los colores y talles se agregan desde las variantes vigentes; no los inventes ni los saques de una descripción general. Datos comprobables de los productos: ${products.map((p) => catalogEvidence(p).slice(0, 650)).join("; ") || "sin productos"}. Agregá image_prompt opcional, fiel a la foto real de los productos elegidos; sin logos ni texto inventados. Devolvé {"messages":[{"body":"...","image_prompt":null}]}.`,
    maxTokens: count === 2 ? 1200 : 750,
    temperature: 0.7,
  });
  const messages = result?.messages;
  if (!Array.isArray(messages) || messages.length !== count ||
      messages.some((m) => !String(m?.body || '').trim())) {
    throw new Error('La IA no devolvió los mensajes pedidos. No se guardó nada.');
  }
  const batchId = crypto.randomUUID();
  const status = when.getTime() > Date.now() + 60000 ? 'planned' : 'draft';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let index = 0; index < messages.length; index += 1) {
      const item = messages[index];
      await client.query(`INSERT INTO whatsapp_channel_posts
        (post_date, kind, topic, body, poll_options, image_prompt, product_id, product_ids,
         source, batch_id, position, scheduled_at, status, topic_request, audience)
        VALUES ($1, 'texto', $2, $3, '[]'::jsonb, $4, $5, $6::jsonb,
          'custom', $7::uuid, $8, $9, $10, $11, $12)`,
        [date, topic.slice(0, 120), completeMessage(String(item.body).trim().slice(0, 900), products, audience, benefits, wholesale),
          item.image_prompt ? String(item.image_prompt).trim().slice(0, 1000) : null,
          ids[0] || null, JSON.stringify(ids), batchId, index + 1, when.toISOString(), status, topic, audience]);
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
  return (await listPosts(date, date)).filter((p) => p.batch_id === batchId);
}

async function setPostStatus(id, status) {
  await ensureSchema();
  if (!['draft', 'planned', 'published_manual'].includes(status)) {
    const err = new Error('Estado inválido.'); err.status = 400; throw err;
  }
  const { rows } = await pool.query(`UPDATE whatsapp_channel_posts SET status = $2, updated_at = now()
    WHERE id = $1 RETURNING *`, [id, status]);
  if (!rows[0]) { const err = new Error('No existe esa publicación.'); err.status = 404; throw err; }
  return rows[0];
}

async function updatePost(id, body) {
  await ensureSchema();
  const kind = body.kind === 'encuesta' ? 'encuesta' : 'texto';
  const options = kind === 'encuesta' && Array.isArray(body.poll_options)
    ? body.poll_options.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 4) : [];
  if (!String(body.body || '').trim() || (kind === 'encuesta' && options.length < 2)) {
    const err = new Error('Completá el texto y, para una encuesta, al menos dos opciones.'); err.status = 400; throw err;
  }
  const { rows } = await pool.query(`UPDATE whatsapp_channel_posts SET kind = $2, topic = $3,
    body = $4, poll_options = $5::jsonb, image_prompt = $6, updated_at = now()
    WHERE id = $1 RETURNING *`, [id, kind, String(body.topic || '').trim().slice(0, 120) || 'Publicación',
    String(body.body).trim().slice(0, 1800), JSON.stringify(options), String(body.image_prompt || '').trim().slice(0, 1000) || null]);
  if (!rows[0]) { const err = new Error('No existe esa publicación.'); err.status = 404; throw err; }
  return rows[0];
}

async function deletePost(id) {
  await ensureSchema();
  const { rows } = await pool.query(`DELETE FROM whatsapp_channel_posts WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) { const err = new Error('No existe esa publicación.'); err.status = 404; throw err; }
  return rows[0];
}

module.exports = { SCHEMA_SQL, ensureSchema, validDate, dateRange, normalizePosts,
  generatePosts, generateFromIdea, listPosts, getSummary, updatePost, setPostStatus, deletePost };
