const pool = require('./db');
const crypto = require('crypto');
const { generateJson } = require('./ai');
const { getForecast, weatherForDate } = require('./weather');
const { eligibleSQL } = require('./productScore');
const { getConfig: getBenefitsConfig } = require('./benefits');
const { getCompanyFacts } = require('./companyInfo');
const { getWholesaleSettings, wholesaleContext } = require('./wholesale');
const { productUrl, completeMessage, normalizeChannelTone, verifiedBenefitsConfig } = require('./channelCommerce');

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
    pool.query(`SELECT post_date, topic, kind FROM whatsapp_channel_posts
      WHERE post_date >= $1::date - 30 ORDER BY post_date DESC LIMIT 24`, [dates[0]]),
    getForecast(),
    getBenefitsConfig().catch(() => null),
    getCompanyFacts().catch(() => null),
    getWholesaleSettings().catch(() => null),
  ]);
  return { products: catalog.rows, wholesaleProducts: wholesaleCatalog.rows,
    dates: commercial.rows, recent: recent.rows, forecast,
    benefits: verifiedBenefitsConfig(benefits, companyFacts), wholesale };
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
  const result = await generateJson({
    system: 'Sos editor del canal de WhatsApp de BLACKS Indumentaria en Argentina. Respondé sólo JSON válido.',
    prompt: `Armá ${count} publicación(es), una para cada fecha: ${dates.join(', ')}. Mensajes breves para el canal de WhatsApp de BLACKS. Alterná información útil, novedades de producto y conversación; en una semana incluí 1-2 encuestas y 1-2 mensajes mayoristas si hay productos mayoristas disponibles. Cada día debe tener otro ángulo. Español argentino natural y profesional, como escrito por una persona: sin lenguaje inclusivo, sin aperturas forzadas como "Atención", "Che" o "volvió a ingresar", sin exceso de confianza. Usá uno o dos emojis pertinentes por mensaje. Sin hashtags. No inventes precios, envíos, cuotas, descuentos, testimonios ni disponibilidad. Esos datos y los enlaces se adjuntan después desde el catálogo: NO los escribas en body.\nProductos MINORISTAS aptos (usá el ID exacto y audience=minorista): ${ctx.products.filter(productUrl).map((p) => `#${p.id} ${p.name} [${p.category || 'sin categoría'}]`).join('; ') || 'ninguno'}. Productos MAYORISTAS aptos (ID exacto y audience=mayorista): ${ctx.wholesaleProducts.filter(productUrl).map((p) => `#${p.id} ${p.name} [${p.category || 'sin categoría'}]`).join('; ') || 'ninguno'}. En mayorista hablá de consulta o pedido, nunca de precio minorista ni carrito. Condiciones mayoristas verificadas: ${wholesaleContext(ctx.wholesale) || 'sin datos configurados'}. Si no hay productos aptos, hacé contenido útil sin artículos específicos. Variá marcas, categorías y productos.\nClima previsto en CABA: ${forecastText}. Mencionalo sólo si aporta al tema; no extrapoles CABA a todo el país ni cites temperaturas exactas. Fechas comerciales: ${ctx.dates.map((d) => `${String(d.event_date instanceof Date ? d.event_date.toISOString() : d.event_date).slice(0, 10)} ${d.title}: ${d.angle || ''}`).join('; ') || 'ninguna'}. Temas recientes a evitar: ${ctx.recent.map((p) => `${String(p.post_date instanceof Date ? p.post_date.toISOString() : p.post_date).slice(0, 10)} ${p.topic}`).join('; ') || 'ninguno'}. ${replaceTopic ? `Reemplazá esta idea: ${replaceTopic}.` : ''}\nEn encuesta, body es la pregunta exacta, poll_options tiene de 2 a 4 respuestas cortas y product_id debe ser null. En texto, body es sólo el texto editorial y poll_options es []. image_prompt describe una imagen fiel al producto real, sin logos ni texto inventados; puede ser null. Devolvé {"posts":[{"date":"YYYY-MM-DD","kind":"texto|encuesta","audience":"minorista|mayorista","topic":"...","body":"...","poll_options":[],"image_prompt":null,"product_id":123 o null}]}.`,
    maxTokens: count === 7 ? 4000 : 900,
    temperature: 0.75,
  });
  const posts = normalizePosts(result?.posts, dates, ctx.products.filter(productUrl), ctx.wholesaleProducts.filter(productUrl));
  const retail = new Map(ctx.products.map((p) => [String(p.id), p]));
  const wholesale = new Map(ctx.wholesaleProducts.map((p) => [String(p.id), p]));
  for (const post of posts) {
    const product = (post.audience === 'mayorista' ? wholesale : retail).get(String(post.product_id));
    post.body = post.kind === 'encuesta' ? normalizeChannelTone(post.body)
      : completeMessage(post.body, product ? [product] : [], post.audience, ctx.benefits, ctx.wholesale);
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
    prompt: `El dueño quiere publicar ${count} mensaje(s) para público ${audience} sobre: "${topic}". Fecha prevista: ${date}. Productos que ELIGIÓ y están disponibles en catálogo: ${products.map((p) => `#${p.id} ${p.name}${p.brand ? ` (${p.brand})` : ''}, categoría ${p.category || 'sin dato'}`).join('; ') || 'ninguno'}. Usá esos productos si se eligieron; no sustituyas ni agregues otros. ${audience === 'mayorista' ? `Enfoque mayorista: invitá a consultar o pedir presupuesto, sin hablar de compra minorista ni precios. Condiciones verificadas: ${wholesaleContext(wholesale) || 'ninguna configurada'}.` : 'Enfoque minorista: invitá a comprar cuando corresponda.'} Si el tema es un reingreso, decilo de forma natural, por ejemplo "Ya está disponible otra vez", sin afirmar cantidades, fecha de reposición o talles específicos. Si pidió dos mensajes, que sean complementarios y con distinto enfoque. Español argentino claro y profesional, como escrito por una persona; sin lenguaje inclusivo, sin "Atención", "Che" ni "volvió a ingresar". Usá uno o dos emojis pertinentes, sin exceso. Sin hashtags. No escribas precios, cuotas, envío gratis, descuentos ni enlaces: los datos verificables se agregan después desde el catálogo. No inventes testimonios ni beneficios. ${weather ? `Clima previsto en CABA: ${weather.min}-${weather.max}°C, lluvia hasta ${weather.rainMm ?? 'sin dato'} mm/6h. Usalo sólo si aporta al tema, sin extrapolarlo a todo el país.` : 'Sin pronóstico para esa fecha.'} Agregá image_prompt opcional, fiel a la foto real de los productos elegidos; sin logos ni texto inventados. Devolvé {"messages":[{"body":"...","image_prompt":null}]}.`,
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
