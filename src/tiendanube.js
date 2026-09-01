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
 * Request genérico a la API de Tiendanube (para escrituras: PUT/POST/DELETE).
 * Reusa el mismo estilo de auth y User-Agent que las lecturas. Tira Error con
 * .status en cualquier respuesta no-2xx, con el cuerpo recortado para poder
 * diagnosticar sin volcar toda la respuesta al log.
 */
async function tnRequest(method, path, body) {
  const url = `${config.tiendanube.apiBase}/${config.tiendanube.storeId}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...buildAuthHeader(), 'User-Agent': config.tiendanube.userAgent, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* respuesta no-JSON */ }
  if (!res.ok) {
    const err = new Error(`Tiendanube ${method} ${path} -> ${res.status}: ${String(text).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Fija (o limpia) el PRECIO DE OFERTA nativo de una variante.
 *   value = número  -> pone ese promotional_price (lo que Tiendanube muestra tachado).
 *   value = null    -> limpia la oferta (vuelve al precio regular).
 * Es el mecanismo del "descuento REAL" de la sección de ofertas flash: al ser
 * el precio de oferta nativo, el tachado aparece solo en toda la tienda y aplica
 * en el checkout, sin callbacks ni scripts. El precio REGULAR nunca se toca.
 */
async function setVariantPromotionalPrice(productId, variantId, value) {
  const promotional_price = value === null || value === undefined ? null : String(value);
  return tnRequest('PUT', `/products/${productId}/variants/${variantId}`, { promotional_price });
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

/* =========================================================================
 * PEDIDOS COMPLETOS (para la sección de Estadísticas)
 *
 * `fetchSalesSince` de arriba sólo cuenta unidades por producto: alcanza para el
 * ranking de más vendidos, pero no para contestar "cuánto facturé del 1 al 15",
 * "cuánto salió el ticket promedio" o "qué porcentaje de las visitas terminó
 * comprando". Para eso hace falta el pedido entero, y guardado: la API de
 * Tiendanube pagina de a 200 y consultarla en vivo en cada carga del panel sería
 * lento y frágil. Por eso esto alimenta `orders_cache` (ver scripts/sync-orders.js)
 * y todos los informes se calculan contra la base.
 * ========================================================================= */

/** Fecha de Tiendanube -> ISO. Viene como string o como objeto {date, timezone}. */
function orderDate(field) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (field.date) return String(field.date).replace(' ', 'T') + 'Z';
  return null;
}

/**
 * Pedido crudo -> fila lista para guardar. Se queda con lo que se usa en los
 * informes y deja el resto en `raw` (mismo criterio que products_cache).
 *
 * `status` es el estado del pedido (open/closed/cancelled) y `payment_status` el
 * del pago (paid/pending/abandoned...). Los dos importan: para facturación real
 * se cuentan los PAGADOS y no cancelados; para "pedidos hechos", todos los no
 * cancelados. Guardamos ambos y la decisión se toma al consultar.
 */
function normalizeOrder(o) {
  const money = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const dir = o.shipping_address || {};
  return {
    id: Number(o.id),
    number: Number(o.number) || null,
    created_at: orderDate(o.created_at),
    paid_at: orderDate(o.paid_at),
    cancelled_at: orderDate(o.cancelled_at),
    status: o.status || null,
    payment_status: o.payment_status || null,
    shipping_status: o.shipping_status || null,
    total: money(o.total),
    subtotal: money(o.subtotal),
    discount: money(o.discount),
    shipping_cost: money(o.shipping_cost_customer),
    currency: o.currency || 'ARS',
    gateway: o.gateway_name || o.gateway || null,
    shipping_option: o.shipping_option || null,
    coupon: Array.isArray(o.coupon) && o.coupon.length ? (o.coupon[0].code || null) : null,
    customer_id: o.customer && o.customer.id ? Number(o.customer.id) : null,
    customer_name: (o.customer && o.customer.name) || o.contact_name || null,
    customer_email: (o.customer && o.customer.email) || o.contact_email || null,
    province: dir.province || o.billing_province || null,
    city: dir.city || o.billing_city || null,
    landing_url: o.landing_url || null,
    order_origin: o.order_origin || null,
    // Sólo lo necesario por línea: el resto ya está en raw.
    products: (o.products || []).map((p) => ({
      product_id: Number(p.product_id) || null,
      variant_id: Number(p.variant_id) || null,
      name: p.name_without_variants || p.name || null,
      variant: p.variant_values || null,
      quantity: Number(p.quantity) || 0,
      price: money(p.price),
      total: money(p.price) === null ? null : money(p.price) * (Number(p.quantity) || 0),
    })),
    raw: o,
  };
}

/**
 * Trae pedidos paginando hasta el final. `since`/`until` son ISO.
 * `by`: 'created_at' para un backfill por fecha de pedido, 'updated_at' para el
 * sync incremental — un pedido que se cancela o se paga DESPUÉS cambia su
 * updated_at pero no su created_at, así que con created_at nunca nos
 * enteraríamos del cambio.
 */
async function fetchOrders({ since, until = null, by = 'created_at', maxPages = 60 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ per_page: '200', page: String(page) });
    if (since) params.set(`${by}_min`, since);
    if (until) params.set(`${by}_max`, until);
    const batch = await tnRequest('GET', `/orders?${params.toString()}`);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const o of batch) out.push(normalizeOrder(o));
    if (batch.length < 200) break;
  }
  return out;
}

module.exports = { fetchAllProducts, fetchProduct, fetchSalesSince, fetchOrders, normalizeOrder, normalizeProduct, detectBrand, pickText, productColors, tnRequest, setVariantPromotionalPrice };
