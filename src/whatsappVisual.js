const pool = require('./db');
const { getConfig: getBenefitsConfig } = require('./benefits');
const { getCompanyFacts } = require('./companyInfo');
const { verifiedBenefitsConfig, benefitsFromConfig, currentPrice, hasFreeShipping,
  completeMessage } = require('./channelCommerce');
const { editorialBody } = require('./channelEditorial');
const { extractSpecTags } = require('./imageRenderer');

function error(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function imageUrls(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  return [...new Set([product.image_url, ...images.map((item) => typeof item === 'string' ? item : item?.src)]
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && parsed.hostname === 'acdn-us.mitiendanube.com';
      } catch (_) { return false; }
    }))].slice(0, 8);
}

function specsFor(product) {
  const description = product.raw?.description;
  const html = typeof description === 'string' ? description : description?.es || '';
  const cleanHtml = html.replace(/&bull;?/gi, ' • ').replace(/&nbsp;?/gi, ' ');
  return extractSpecTags(cleanHtml, 8, { productName: product.name, maxLen: 52 })
    .map((spec) => spec.replace(/\s+/g, ' ').trim())
    .filter((spec) => !/^(?:consultar|pensad[oa]s?|adaptable|diseño funcional|en .* para mayor|buzo canguro .* buzo)/i.test(spec)
      && !/\b(?:uso diario|ideal para|mayor comodidad|&[a-z]+;)\b/i.test(spec))
    .slice(0, 3);
}

function offerFor(product) {
  const price = currentPrice(product);
  const regular = Number(product.price);
  const discounted = price && Number.isFinite(regular) && regular > price;
  return { price, regularPrice: discounted ? regular : null,
    discountPercent: discounted ? Math.round((1 - price / regular) * 100) : null };
}

function visualHeadline(products, post) {
  if (products.length === 1) return products[0].name;
  if (products.length) return products.slice(0, 2).map((product) => product.name).join(' + ');
  return post.topic;
}

function planVisualStyles(posts) {
  let previous = -1;
  const styles = new Map();
  for (const post of posts) {
    const key = `${post.post_date instanceof Date ? post.post_date.toISOString().slice(0, 10) : post.post_date}:${post.audience}:${post.topic}`;
    let hash = 2166136261;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    let style = (hash >>> 0) % 3;
    if (style === previous) style = (style + 1) % 3;
    styles.set(String(post.id), style);
    previous = style;
  }
  return styles;
}

function statedPrices(body) {
  return String(body || '').split('\n').filter((line) => /^\s*(?:💰|Precio:)/iu.test(line))
    .map((line) => line.match(/\$\s*([\d.]+(?:,\d{1,2})?)/))
    .filter(Boolean)
    .map((match) => Number(match[1].replace(/\./g, '').replace(',', '.')));
}

async function postAndProducts(id) {
  const { rows } = await pool.query('SELECT * FROM whatsapp_channel_posts WHERE id = $1', [id]);
  const post = rows[0];
  if (!post) throw error('No existe esa publicación.', 404);
  const ids = [...new Set((Array.isArray(post.product_ids) && post.product_ids.length
    ? post.product_ids : [post.product_id]).filter(Boolean).map(String))].slice(0, 4);
  const products = ids.length ? (await pool.query(`SELECT id, name, image_url, images, price, promo_price,
      COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink,
      stock, published, synced_at, raw FROM products_cache WHERE id = ANY($1::bigint[])`, [ids])).rows : [];
  const ordered = ids.map((id) => products.find((p) => String(p.id) === id));
  if (ordered.some((product) => !product)) throw error('Falta un producto del mensaje en el catálogo. Revisá la propuesta.', 409);
  return { post, products: ordered };
}

async function visualData(id) {
  const { post, products } = await postAndProducts(id);
  const neighbors = (await pool.query(`SELECT id, post_date, audience, topic FROM whatsapp_channel_posts
    WHERE post_date BETWEEN $1::date - 14 AND $1::date + 14
    ORDER BY post_date, id`, [post.post_date])).rows;
  const plannedStyle = planVisualStyles(neighbors).get(String(post.id)) ?? 0;
  if (products.some((product) => product.published === false || !product.synced_at ||
      Date.now() - new Date(product.synced_at).getTime() > 36 * 3600000 ||
      (product.stock != null && Number(product.stock) <= 0))) {
    throw error('El catálogo cambió o está desactualizado. Sincronizalo antes de poner precios o productos en una imagen.', 409);
  }
  const [configured, companyFacts] = post.audience === 'minorista' && products.length
    ? await Promise.all([getBenefitsConfig().catch(() => null), getCompanyFacts().catch(() => null)])
    : [null, null];
  const benefits = benefitsFromConfig(verifiedBenefitsConfig(configured, companyFacts));
  if (post.audience === 'minorista' && products.length) {
    const prices = statedPrices(post.body);
    const current = products.map(currentPrice).filter(Boolean);
    if (prices.length && (prices.length !== current.length ||
        prices.some((price, index) => price !== current[index]))) {
      throw error('El precio del texto ya no coincide con el catálogo. Actualizá el copy antes de crear la pieza.', 409);
    }
    const statedInstallments = String(post.body).match(/\b(\d+)\s*cuotas?\s*sin\s*inter[eé]s/i);
    if (statedInstallments && !String(benefits.installment || '').includes(statedInstallments[0])) {
      throw error('Las cuotas del texto ya no coinciden con las condiciones actuales. Actualizá el copy antes de crear la pieza.', 409);
    }
  }
  const visualProducts = products.map((product, index) => ({
    id: String(product.id), name: product.name,
    ...(post.audience === 'minorista' ? offerFor(product) : { price: null, regularPrice: null, discountPercent: null }),
    freeShipping: post.audience === 'minorista' && hasFreeShipping(product, benefits),
    specs: specsFor(product), photoCount: imageUrls(product).length,
    photoBase: `/api/whatsapp-channel/${id}/visual-photo/${index}`,
  }));
  if (products.length && visualProducts.every((product) => !product.photoCount)) {
    throw error('Estos productos no tienen fotos válidas del catálogo.', 409);
  }
  return {
    id: String(post.id), date: String(post.post_date instanceof Date ? post.post_date.toISOString() : post.post_date).slice(0, 10),
    checkedAt: new Date().toISOString(),
    kind: post.kind, audience: post.audience, topic: post.topic,
    headline: visualHeadline(products, post), body: editorialBody(post.body),
    plannedStyle,
    pollOptions: Array.isArray(post.poll_options) ? post.poll_options : [],
    products: visualProducts,
    installments: post.audience === 'minorista' && products.length ? benefits.installment : null,
    shippingThreshold: post.audience === 'minorista' && products.length ? benefits.shippingThreshold : null,
  };
}

async function visualPhoto(id, productIndex, photoIndex) {
  if (!Number.isInteger(productIndex) || productIndex < 0 || productIndex > 3 ||
      !Number.isInteger(photoIndex) || photoIndex < 0 || photoIndex > 7) throw error('Foto inválida.');
  const { products } = await postAndProducts(id);
  const product = products[productIndex];
  const url = product && imageUrls(product)[photoIndex];
  if (!url) throw error('No existe esa foto del producto.', 404);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    throw error('No se pudo cargar la foto del catálogo.', 502);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw error('La foto supera el tamaño permitido.', 502);
  return { bytes, contentType: response.headers.get('content-type') };
}

async function refreshCommerce(id) {
  const { post, products } = await postAndProducts(id);
  if (post.status === 'published_manual') throw error('Una publicación marcada como publicada no se puede actualizar automáticamente.', 409);
  if (post.kind !== 'texto' || post.audience !== 'minorista' || !products.length) {
    throw error('Esta publicación no tiene datos minoristas para actualizar.');
  }
  if (/\$\s*\d/.test(editorialBody(post.body))) {
    throw error('El texto editorial menciona un importe. Editalo manualmente antes de actualizar los datos comerciales.', 409);
  }
  if (products.some((product) => product.published === false || !product.synced_at ||
      Date.now() - new Date(product.synced_at).getTime() > 36 * 3600000 ||
      (product.stock != null && Number(product.stock) <= 0))) {
    throw error('El catálogo está desactualizado o el producto ya no está disponible. Sincronizalo primero.', 409);
  }
  const [configured, companyFacts] = await Promise.all([
    getBenefitsConfig().catch(() => null), getCompanyFacts().catch(() => null),
  ]);
  const benefits = verifiedBenefitsConfig(configured, companyFacts);
  const body = completeMessage(editorialBody(post.body), products, 'minorista', benefits, null, Number(post.id) % 3);
  const { rows } = await pool.query(`UPDATE whatsapp_channel_posts SET body = $2, updated_at = now()
    WHERE id = $1 AND status != 'published_manual' RETURNING id, body`, [id, body]);
  if (!rows[0]) throw error('La publicación ya no se puede actualizar.', 409);
  return rows[0];
}

module.exports = { imageUrls, specsFor, offerFor, visualHeadline, planVisualStyles,
  statedPrices, visualData, visualPhoto, refreshCommerce };
