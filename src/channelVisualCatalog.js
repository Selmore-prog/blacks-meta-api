// Datos de variantes y fotos para piezas: nunca deducir un color mirando una foto.
const { createHash } = require('crypto');
function localized(value) {
  return typeof value === 'string' ? value : value?.es || '';
}

function catalogPhotos(product) {
  const raw = Array.isArray(product.raw?.images) ? product.raw.images : [];
  const cached = Array.isArray(product.images) ? product.images : [];
  const urls = [...new Set([product.image_url, ...cached.map((p) => typeof p === 'string' ? p : p?.src),
    ...raw.map((p) => p.src)].filter((url) => {
    try { const p = new URL(url); return p.protocol === 'https:' && p.hostname === 'acdn-us.mitiendanube.com'; }
    catch (_) { return false; }
  }))];
  return urls.map((url, index) => {
    const source = raw.find((p) => p.src === url);
    return { index, url, key: createHash('sha256').update(url).digest('hex').slice(0, 20),
      id: source?.id == null ? null : String(source.id),
      width: source?.width || null, height: source?.height || null };
  });
}

function visualCatalog(product) {
  const photos = catalogPhotos(product);
  const attributes = (product.raw?.attributes || []).map((a) => localized(a).trim().toLowerCase());
  const colorIndex = attributes.findIndex((a) => /^(color|colores|colour)$/.test(a));
  const sizeIndex = attributes.findIndex((a) => /^(talle|talla|tamaño|size)$/.test(a));
  const groups = new Map();
  const referenced = new Set();
  const available = new Set();
  const imageColors = new Map();
  for (const variant of product.raw?.variants || []) {
    const image = photos.find((p) => p.id !== null && p.id === String(variant.image_id));
    const name = colorIndex < 0 ? '' : localized(variant.values?.[colorIndex]).trim();
    if (image) referenced.add(image.index);
    if (image && name) {
      if (!imageColors.has(image.index)) imageColors.set(image.index, new Set());
      imageColors.get(image.index).add(name.toLocaleLowerCase('es-AR'));
    }
    const inStock = variant.stock != null && Number(variant.stock) > 0;
    const catalogOnly = variant.stock_management === false;
    if (variant.visible === false || (!inStock && !catalogOnly)) continue;
    if (image) available.add(image.index);
    if (!name) continue;
    const key = name.toLocaleLowerCase('es-AR');
    if (!groups.has(key)) groups.set(key, { name, inStock: false, catalogOnly: false,
      stockSizes: [], catalogSizes: [], photoIndices: [] });
    const color = groups.get(key);
    color.inStock ||= inStock && !catalogOnly;
    color.catalogOnly ||= catalogOnly;
    const size = sizeIndex < 0 ? '' : localized(variant.values?.[sizeIndex]).trim();
    const sizes = catalogOnly ? color.catalogSizes : color.stockSizes;
    if (size && !sizes.includes(size)) sizes.push(size);
    if (image && !color.photoIndices.includes(image.index)) color.photoIndices.push(image.index);
  }
  const colors = [...groups.values()];
  const gallery = photos.filter((photo) => !referenced.has(photo.index) || available.has(photo.index))
    .map(({ url, ...photo }) => ({ ...photo, colors: imageColors.get(photo.index)?.size === 1
      ? colors.filter((c) => c.photoIndices.includes(photo.index)).map((c) => c.name) : [] }));
  // Preferir una variante que se puede ofrecer, aunque la portada del catálogo esté agotada.
  const hasUnavailablePhotos = [...referenced].some((index) => !available.has(index));
  const heroPhotoIndices = gallery.filter((p) => !hasUnavailablePhotos || available.has(p.index)).map((p) => p.index);
  const primaryPhoto = gallery.find((p) => available.has(p.index))?.index ?? heroPhotoIndices[0] ?? null;
  return { colors, gallery, primaryPhoto, heroPhotoIndices };
}

function visualCampaign(post, products) {
  const requested = post.source === 'custom' ? String(post.topic_request || '') : '';
  if (/\b(reingreso|reposici[oó]n|volvi[oó]|otra vez disponible)\b/i.test(requested)) {
    return { type: 'restock', label: 'ESTÁ DE VUELTA' };
  }
  if (post.audience === 'minorista' && products.some((p) => p.discountPercent > 0)) {
    return { type: 'promotion', label: 'PRECIO ESPECIAL' };
  }
  if (/\b(novedad|nuevo ingreso|nueva colecci[oó]n)\b/i.test(requested)) {
    return { type: 'new', label: 'NUEVO INGRESO' };
  }
  return { type: 'notice', label: post.audience === 'mayorista' ? 'PEDIDOS MAYORISTAS' : 'EN EL CATÁLOGO' };
}

function complementaryCaption(post, products) {
  const additions = products.flatMap((product) => {
    if (!product.colors?.length) return [];
    const stock = product.colors.filter((c) => c.inStock).map((c) =>
      `${c.name}${c.stockSizes.length ? `: ${c.stockSizes.join(', ')}` : ''}`);
    const catalog = product.colors.filter((c) => c.catalogOnly).map((c) => c.name);
    return [products.length > 1 ? product.name : '',
      stock.length ? `Colores con stock${stock.some((c) => c.includes(':')) ? ' y talles' : ''}:\n${stock.join('\n')}` : '',
      catalog.length ? `Colores de catálogo: ${catalog.join(', ')}. Consultá disponibilidad y talles para tu pedido.` : '']
      .filter(Boolean).join('\n');
  });
  if (!additions.length) return String(post.body || '');
  const lines = String(post.body || '').split('\n');
  const commerceStart = lines.findIndex((line) => /^(?:💰|💳|🚚|🛒|🔗|🏢|Precio:)/u.test(line.trim()));
  const split = commerceStart < 0 ? lines.length : commerceStart;
  return [lines.slice(0, split).join('\n').trim(), additions.join('\n\n'), lines.slice(split).join('\n').trim()]
    .filter(Boolean).join('\n\n');
}

module.exports = { catalogPhotos, visualCatalog, visualCampaign, complementaryCaption };
