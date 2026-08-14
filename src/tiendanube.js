const config = require('./config');

function buildAuthHeader() {
  const token = config.tiendanube.accessToken;
  if (config.tiendanube.authHeaderStyle === 'authentication') {
    // Estilo clasico de la API v1 (ver docs: header debe llamarse "Authentication", no "Authorization")
    return { Authentication: `bearer ${token}` };
  }
  // Estilo nuevo (API 2025-03 en adelante)
  return { Authorization: `Bearer ${token}` };
}

function pickText(field) {
  // Tiendanube devuelve varios campos como objeto multi-idioma { es: '...', pt: '...' }
  // o directamente como string segun el endpoint/version. Cubrimos ambos casos.
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.es || field.pt || Object.values(field)[0] || '';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&uuml;/g, 'ü')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function detectBrand(name) {
  const lower = name.toLowerCase();
  for (const brand of config.brand.knownBrands) {
    if (lower.includes(brand.toLowerCase())) return brand;
  }
  return null;
}

function normalizeProduct(product) {
  const name = pickText(product.name);
  const mainImage = product.images && product.images[0] ? product.images[0].src : null;
  const variants = product.variants || [];
  const firstVariant = variants[0] || {};
  // Stock TOTAL: suma de todas las variantes (talles). Si ninguna trackea stock
  // (todas null) => infinito/null (mayorista). Antes tomábamos sólo la 1a variante (bug).
  const stockNums = variants.map((v) => v.stock).filter((s) => typeof s === 'number');
  const totalStock = stockNums.length ? stockNums.reduce((a, b) => a + b, 0) : null;
  // Curva de talles: cuántas variantes (talles) tienen stock sobre el total.
  // Un producto con 35 unidades pero todas en UN talle no sirve para mostrar:
  // el stock total engaña, la cobertura de talles no. stock null = sin tracking (cuenta como disponible).
  const sizesTotal = variants.length || 1;
  const sizesInStock = variants.length
    ? variants.filter((v) => v.stock === null || v.stock === undefined || Number(v.stock) > 0).length
    : (totalStock === null || totalStock > 0 ? 1 : 0);
  const sizeCoverage = Math.round((sizesInStock / sizesTotal) * 100) / 100;
  // Precio: el de la variante principal (lo que muestra Tiendanube); si no tiene, la 1a con precio.
  const pricedVariant = firstVariant.price ? firstVariant : (variants.find((v) => v.price) || firstVariant);
  const regular = pricedVariant.price ? Number(pricedVariant.price) : null;
  const promo = pricedVariant.promotional_price ? Number(pricedVariant.promotional_price) : null;
  const images = (product.images || []).map((i) => i.src).filter(Boolean);
  // Descripción: viene como HTML multi-idioma. Sacamos tags, decodificamos entidades y acotamos.
  const description = decodeEntities(pickText(product.description).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim().slice(0, 600);
  return {
    id: product.id,
    name,
    brand: product.brand || detectBrand(name),
    category: product.categories && product.categories[0] ? pickText(product.categories[0].name) : null,
    price: regular,
    // promo válido sólo si es menor al precio regular.
    promo_price: promo && regular && promo < regular ? promo : null,
    // stock total (null = infinito / mayorista / a pedido).
    stock: totalStock,
    sizes_total: sizesTotal,
    sizes_in_stock: sizesInStock,
    size_coverage: sizeCoverage,
    image_url: mainImage,
    images: images.length ? images : (mainImage ? [mainImage] : []),
    description,
    // OJO: la API NO devuelve `permalink`. Devuelve `handle` (objeto multi-idioma,
    // ej. {es: "cofias-descartables"}) y `canonical_url` (URL completa). Por
    // buscar una clave inexistente, esta columna quedó en NULL en los 352
    // productos del catálogo desde el primer sync (bug detectado ago-2026 al
    // armar los rieles del home, que sí necesitan la URL).
    permalink: pickText(product.handle)
      || (product.canonical_url ? String(product.canonical_url).replace(/\/+$/, '').split('/').pop() : null)
      || null,
    raw: product,
  };
}

/**
 * COLORES REALES del producto, leídos de las variantes de Tiendanube.
 *
 * Es la VERDAD EXACTA y gratis: Tiendanube guarda el atributo "Color" en cada variante
 * y le asocia la foto de ESE color (variant.image_id). Antes los colores se adivinaban
 * mirando las fotos con visión, que además sólo mira las 8 primeras: el cargo Pampero
 * tiene 6 colores repartidos en 29 fotos (beige #0, verde #5, negro #10, azul #14,
 * tiza #19, gris #24) y el sistema "veía" dos (bug real, ago-2026).
 *
 * Se descartan los colores SIN STOCK (no se anuncia un color que no se puede comprar) y
 * los que no tienen foto propia. `index` es la posición de esa foto en product.images
 * (-1 si no está en la galería guardada).
 * Devuelve [{ color, url, index, stock }] en el orden del catálogo.
 */
function productColors(product) {
  const raw = product && product.raw ? product.raw : product;
  if (!raw || !Array.isArray(raw.variants) || !raw.variants.length) return [];
  const attrPos = (raw.attributes || []).findIndex((a) => /color/i.test(pickText(a)));
  if (attrPos < 0) return []; // este producto no se vende por color (sólo talles)
  const srcById = new Map((raw.images || []).map((im) => [im.id, im.src]));
  const gallery = Array.isArray(product && product.images) && product.images.length
    ? product.images
    : (raw.images || []).map((im) => im.src);
  const byColor = new Map();
  for (const v of raw.variants) {
    const color = pickText(v.values && v.values[attrPos]).trim();
    if (!color) continue;
    const key = color.toLowerCase();
    const entry = byColor.get(key) || { color, url: null, stock: 0, tracked: false };
    if (typeof v.stock === 'number') { entry.stock += v.stock; entry.tracked = true; }
    if (!entry.url && v.image_id && srcById.has(v.image_id)) entry.url = srcById.get(v.image_id);
    byColor.set(key, entry);
  }
  return [...byColor.values()]
    .filter((c) => c.url && (!c.tracked || c.stock > 0))
    .map((c) => ({ color: c.color, url: c.url, stock: c.tracked ? c.stock : null, index: gallery.indexOf(c.url) }));
}

/**
 * Trae UN producto puntual con su precio/stock actual (para refrescar justo antes de generar/publicar).
 * Devuelve el producto normalizado o null si no existe / falla.
 */
async function fetchProduct(id) {
  try {
    const url = `${config.tiendanube.apiBase}/${config.tiendanube.storeId}/products/${id}`;
    const res = await fetch(url, {
      headers: { ...buildAuthHeader(), 'User-Agent': config.tiendanube.userAgent, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return normalizeProduct(await res.json());
  } catch (err) {
    console.warn(`[tiendanube] No pude refrescar el producto ${id}: ${err.message}`);
    return null;
  }
}

async function fetchProductsPage(page, perPage = 200) {
  const url = `${config.tiendanube.apiBase}/${config.tiendanube.storeId}/products?page=${page}&per_page=${perPage}&published=true`;
  const res = await fetch(url, {
    headers: {
      ...buildAuthHeader(),
      'User-Agent': config.tiendanube.userAgent,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Tiendanube API ${res.status} en page=${page}: ${body}`);
  }

  return res.json();
}

/**
 * Trae TODOS los productos publicados del catalogo, paginando.
 * Devuelve una lista normalizada lista para guardar en products_cache.
 */
async function fetchAllProducts() {
  const all = [];
  let page = 1;
  // Tiendanube pagina hasta que una pagina vuelve vacia
  while (true) {
    const batch = await fetchProductsPage(page);
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const product of batch) {
      all.push(normalizeProduct(product));
    }

    if (batch.length < 200) break; // ultima pagina
    page += 1;
  }

  return all;
}

/**
 * Suma unidades vendidas por producto desde `sinceISO` (para ranking de más vendidos).
 * Devuelve un Map productId -> unidades. Ignora pedidos cancelados.
 */
async function fetchSalesSince(sinceISO) {
  const sales = new Map();
  let page = 1;
  while (true) {
    const url = `${config.tiendanube.apiBase}/${config.tiendanube.storeId}/orders?created_at_min=${encodeURIComponent(sinceISO)}&per_page=200&page=${page}&fields=id,status,products`;
    const res = await fetch(url, {
      headers: { ...buildAuthHeader(), 'User-Agent': config.tiendanube.userAgent, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      if (page === 1) throw new Error(`Tiendanube orders ${res.status}: ${(await res.text()).slice(0, 160)}`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const order of batch) {
      if (order.status === 'cancelled') continue;
      for (const p of order.products || []) {
        const pid = Number(p.product_id);
        if (!pid) continue;
        sales.set(pid, (sales.get(pid) || 0) + Number(p.quantity || 1));
      }
    }
    if (batch.length < 200) break;
    page += 1;
  }
  return sales;
}

module.exports = { fetchAllProducts, fetchProduct, fetchSalesSince, normalizeProduct, detectBrand, pickText, productColors };
