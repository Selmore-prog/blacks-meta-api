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
  const firstVariant = product.variants && product.variants[0] ? product.variants[0] : {};
  return {
    id: product.id,
    name,
    brand: product.brand || detectBrand(name),
    category: product.categories && product.categories[0] ? pickText(product.categories[0].name) : null,
    price: firstVariant.price ? Number(firstVariant.price) : null,
    stock: typeof firstVariant.stock === 'number' ? firstVariant.stock : null,
    image_url: mainImage,
    permalink: product.permalink || null,
    raw: product,
  };
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

module.exports = { fetchAllProducts, fetchProduct, normalizeProduct, detectBrand, pickText };
