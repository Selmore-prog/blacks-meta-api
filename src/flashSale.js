/* =========================================================================
 * OFERTAS FLASH — la sección de ofertas con contador del home.
 *
 * QUÉ HACE, EN UNA LÍNEA
 * El dueño elige a mano productos MINORISTAS con un buscador, les pone un % de
 * descuento y una fecha de fin; al "Activar", este módulo escribe el PRECIO DE
 * OFERTA NATIVO (promotional_price) en cada variante de esos productos vía la
 * API de Tiendanube. A partir de ahí el tachado y el precio nuevo aparecen solos
 * en toda la tienda (home, categoría, ficha, checkout) — es un descuento REAL,
 * no un cartel. Cuando el contador llega a 0 (o el dueño aprieta "Terminar") se
 * restaura el precio anterior de cada variante.
 *
 * POR QUÉ ESTE MECANISMO Y NO UN CALLBACK DE /discounts
 * El callback de la Discounts API sólo aplica en el CARRITO: la tarjeta del home
 * seguiría mostrando el precio lleno y el cliente recién vería el descuento en el
 * checkout — rompe toda la estética de "oferta flash". El promotional_price
 * nativo se ve en la vidriera, que es donde tiene que verse.
 *
 * SEGURIDAD DEL PRECIO
 * - El precio REGULAR (price) NUNCA se toca; sólo promotional_price.
 * - Antes de escribir, se guarda el promotional_price ANTERIOR de cada variante
 *   (y el promo a nivel producto del cache), así "Terminar" restaura exactamente
 *   lo que había — incluso si un producto ya tenía una oferta nativa propia.
 * - Las escrituras van de a una con una pausa, para no chocar el rate limit.
 * ========================================================================= */

const pool = require('./db');
const { getSetting, setSetting } = require('./settings');
const { setVariantPromotionalPrice } = require('./tiendanube');
const homeRails = require('./homeRails');

const KEY = 'flash_sale';
const MAX_ITEMS = 12;      // una sección de ofertas con más de 12 se vuelve un catálogo
const MAX_WRITES = 400;    // tope duro de PUTs por activación (freno ante un error de datos)
const WRITE_DELAY_MS = 300;

const DEFAULT = {
  title: 'Ofertas flash',
  subtitle: null,
  url: '/productos',
  ends_at: null,          // ISO. null = sin contador (igual se puede usar, pero el timer no aparece)
  default_pct: 20,
  items: [],              // [{ id, pct? }]  pct opcional: si falta, usa default_pct
  active: false,
  applied_at: null,
  // Libreta para restaurar (se llena al activar):
  applied: { variants: [], products: [] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);
const clampPct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.round(n) : null;
};

function badRequest(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

/* ---------------------------- estado ---------------------------- */

async function getConfig() {
  const raw = await getSetting(KEY);
  if (!raw) return { ...DEFAULT };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed, applied: parsed.applied || { variants: [], products: [] } };
  } catch (_) {
    console.warn('[flashSale] Config guardada inválida; se usa la de fábrica.');
    return { ...DEFAULT };
  }
}

async function getConfigDetailed() {
  const cfg = await getConfig();
  const chosen = await loadChosen(cfg.items.map((i) => i.id));
  const byId = new Map(chosen.map((r) => [Number(r.id), r]));
  const items_detail = cfg.items.map((i) => {
    const r = byId.get(Number(i.id));
    if (!r) return { id: Number(i.id), missing: true, pct: i.pct || null };
    return { id: Number(r.id), name: r.name, image: r.image_url, price: money(r.price), stock: r.stock === null ? null : Number(r.stock), pct: i.pct || null };
  });
  return { ...cfg, items_detail };
}

async function putConfig(cfg) {
  await setSetting(KEY, JSON.stringify(cfg));
  homeRails.invalidate(); // el home tiene que ver el cambio ya, no en 15 min
  invalidate();
}

/* Efectivo por producto: override del ítem o el default de la campaña. */
const effectivePct = (item, cfg) => clampPct(item.pct) || clampPct(cfg.default_pct) || 20;

/* ---------------------------- buscador (sólo minoristas) ---------------------------- */

const RETAIL_WHERE = 'published IS NOT FALSE AND image_url IS NOT NULL AND price > 0 AND stock > 0';

async function search(q) {
  const term = q ? `%${String(q).trim()}%` : '%';
  const { rows } = await pool.query(
    `SELECT id, name, brand, price, promo_price, stock, image_url
       FROM products_cache
      WHERE ${RETAIL_WHERE} AND name ILIKE $1
      ORDER BY COALESCE(sales_30d,0) DESC, name ASC
      LIMIT 20`,
    [term]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    brand: r.brand || null,
    price: money(r.price),
    promo_price: money(r.promo_price),
    stock: r.stock === null ? null : Number(r.stock),
    image: r.image_url,
  }));
}

/** Trae los productos elegidos (respetando el orden) con sus variantes crudas. */
async function loadChosen(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
  if (!list.length) return [];
  const { rows } = await pool.query(
    `SELECT id, name, price, promo_price, stock, image_url, images, raw,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache
      WHERE id = ANY($1::bigint[]) AND ${RETAIL_WHERE}`,
    [list]
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return list.map((id) => byId.get(id)).filter(Boolean);
}

/* ---------------------------- guardar (sin aplicar) ---------------------------- */

async function saveConfig(input) {
  if (!input || typeof input !== 'object') throw badRequest('Falta la configuración.');
  const current = await getConfig();

  const title = String(input.title || '').trim().slice(0, 80) || DEFAULT.title;
  const subtitle = input.subtitle ? String(input.subtitle).trim().slice(0, 160) : null;
  const url = input.url ? String(input.url).trim().slice(0, 200) : null;
  let ends_at = null;
  if (input.ends_at) {
    const t = new Date(input.ends_at);
    if (Number.isNaN(t.getTime())) throw badRequest('La fecha de fin no es válida.');
    ends_at = t.toISOString();
  }

  // Con la oferta ACTIVA no se cambian productos ni %: hay que terminarla primero
  // (si no, quedarían precios escritos en Tiendanube sin su libreta de restauración).
  if (current.active) {
    const next = { ...current, title, subtitle, url, ends_at };
    await putConfig(next);
    return next;
  }

  const default_pct = clampPct(input.default_pct) || DEFAULT.default_pct;
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length > MAX_ITEMS) throw badRequest(`La sección admite hasta ${MAX_ITEMS} productos.`);

  const seen = new Set();
  const wantIds = [];
  const pctById = new Map();
  for (const it of rawItems) {
    const id = Number(it && (it.id !== undefined ? it.id : it));
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    wantIds.push(id);
    const p = clampPct(it && it.pct);
    if (p) pctById.set(id, p);
  }
  // Validación anti-mayorista: sólo dejamos guardar productos que son minoristas
  // (precio > 0 y stock > 0). Un mayorista no tiene precio del que sacar la oferta.
  const valid = await loadChosen(wantIds);
  const validIds = new Set(valid.map((r) => Number(r.id)));
  const rejected = wantIds.filter((id) => !validIds.has(id));
  const items = wantIds
    .filter((id) => validIds.has(id))
    .map((id) => (pctById.has(id) ? { id, pct: pctById.get(id) } : { id }));

  const next = { ...current, title, subtitle, url, ends_at, default_pct, items, active: false };
  await putConfig(next);
  return { ...next, rejected };
}

/* ---------------------------- activar / terminar ---------------------------- */

let activating = null;
let ending = null;

async function activate() {
  if (activating) return activating;
  activating = _activate();
  try { return await activating; } finally { activating = null; }
}

async function _activate() {
  const cfg = await getConfig();
  if (cfg.active) throw badRequest('La oferta ya está activa. Terminala antes de volver a activarla.');
  if (!cfg.items.length) throw badRequest('Elegí al menos un producto antes de activar.');
  if (cfg.ends_at && new Date(cfg.ends_at).getTime() <= Date.now()) {
    throw badRequest('La fecha de fin ya pasó: elegí una futura.');
  }

  const chosen = await loadChosen(cfg.items.map((i) => i.id));
  const pctOf = new Map(cfg.items.map((i) => [Number(i.id), effectivePct(i, cfg)]));

  const variantsBook = [];
  const productsBook = [];
  const errors = [];
  let writes = 0;

  for (const prod of chosen) {
    const pct = pctOf.get(Number(prod.id)) || cfg.default_pct;
    let raw = prod.raw;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }
    const variants = (raw && Array.isArray(raw.variants)) ? raw.variants : [];
    // Guardamos el promo a nivel producto del cache para restaurar el "display".
    productsBook.push({ id: Number(prod.id), prior_promo_price: money(prod.promo_price) });

    for (const v of variants) {
      const price = Number(v.price);
      if (!Number.isFinite(price) || price <= 0) continue; // variante sin precio: se saltea
      const promo = money(price * (1 - pct / 100));
      if (!(promo > 0) || promo >= price) continue;
      if (writes >= MAX_WRITES) { errors.push(`Tope de ${MAX_WRITES} escrituras alcanzado.`); break; }
      try {
        await setVariantPromotionalPrice(prod.id, v.id, promo);
        variantsBook.push({ product_id: Number(prod.id), variant_id: v.id, prior_promo: v.promotional_price ? money(v.promotional_price) : null });
        writes += 1;
        await sleep(WRITE_DELAY_MS);
      } catch (err) {
        errors.push(`Producto ${prod.id} variante ${v.id}: ${err.message}`);
      }
    }
  }

  // Reflejar el precio nuevo en el cache local ya, sin esperar el próximo sync:
  // así el resto del sitio (y el riel "ofertas") lo ve en el acto.
  for (const prod of chosen) {
    const pct = pctOf.get(Number(prod.id)) || cfg.default_pct;
    await pool.query(
      'UPDATE products_cache SET promo_price = ROUND((price * (1 - $2::numeric/100))::numeric, 2) WHERE id = $1 AND price > 0',
      [Number(prod.id), pct]
    ).catch(() => {});
  }

  const next = {
    ...cfg,
    active: true,
    applied_at: new Date().toISOString(),
    applied: { variants: variantsBook, products: productsBook },
  };
  await putConfig(next);

  return {
    ok: true,
    active: true,
    productos: chosen.length,
    variantes_escritas: writes,
    errores: errors,
  };
}

async function end(opts = {}) {
  if (ending) return ending;
  ending = _end(opts);
  try { return await ending; } finally { ending = null; }
}

async function _end({ auto = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.active) return { ok: true, active: false, restauradas: 0 };

  const book = cfg.applied || { variants: [], products: [] };
  const errors = [];
  let restored = 0;

  for (const v of book.variants || []) {
    try {
      await setVariantPromotionalPrice(v.product_id, v.variant_id, v.prior_promo != null ? v.prior_promo : null);
      restored += 1;
      await sleep(WRITE_DELAY_MS);
    } catch (err) {
      errors.push(`Variante ${v.variant_id}: ${err.message}`);
    }
  }

  // Restaurar el promo del cache al valor que tenía antes de la campaña.
  for (const p of book.products || []) {
    await pool.query('UPDATE products_cache SET promo_price = $2 WHERE id = $1', [p.id, p.prior_promo_price])
      .catch(() => {});
  }

  const next = { ...cfg, active: false, applied_at: null, applied: { variants: [], products: [] } };
  await putConfig(next);

  return { ok: true, active: false, restauradas: restored, errores: errors, auto };
}

/* Si venció el contador y quedó activa, la termina sola. Se llama al leer el
   payload del home (self-healing) y también desde el cron diario, por las dudas. */
async function maybeAutoEnd() {
  const cfg = await getConfig();
  if (cfg.active && cfg.ends_at && new Date(cfg.ends_at).getTime() <= Date.now()) {
    console.log('[flashSale] Contador vencido: restaurando precios.');
    return end({ auto: true });
  }
  return null;
}

/* ---------------------------- payload para el theme ---------------------------- */

async function computeBlock() {
  const cfg = await getConfig();
  if (!cfg.active) return { active: false };
  // Vencida pero todavía activa: se dispara la restauración atrás y se sirve
  // como inactiva para que la sección no muestre "quedan 0".
  if (cfg.ends_at && new Date(cfg.ends_at).getTime() <= Date.now()) {
    end({ auto: true }).catch((e) => console.error('[flashSale] auto-end:', e.message));
    return { active: false };
  }

  const chosen = await loadChosen(cfg.items.map((i) => i.id));
  const pctOf = new Map(cfg.items.map((i) => [Number(i.id), effectivePct(i, cfg)]));

  const products = chosen.map((r) => {
    const price = money(r.price);
    const pct = pctOf.get(Number(r.id)) || cfg.default_pct;
    const promo = money(price * (1 - pct / 100));
    const images = Array.isArray(r.images) ? r.images : [];
    return {
      id: Number(r.id),
      name: r.name,
      url: homeRails.productPath(r.permalink),
      image: r.image_url,
      image_hover: images.find((src) => src && src !== r.image_url) || null,
      price,
      promo_price: promo,
      discount_pct: pct,
      stock: r.stock === null ? null : Number(r.stock),
      low_stock: r.stock !== null && Number(r.stock) > 0 && Number(r.stock) <= 8,
    };
  }).filter((c) => c.url && c.image && c.promo_price > 0);

  if (products.length < 1) return { active: false };

  return {
    active: true,
    title: cfg.title || DEFAULT.title,
    subtitle: cfg.subtitle || null,
    url: cfg.url || null,
    ends_at: cfg.ends_at || null,
    server_now: new Date().toISOString(), // ancla para el contador: no dependemos del reloj del cliente
    products,
  };
}

/* Caché en memoria del bloque (mismo criterio que los rieles). */
let cache = { block: null, at: 0 };
const TTL_MS = 60 * 1000;

async function getBlock() {
  const age = Date.now() - cache.at;
  if (cache.block && age < TTL_MS) return cache.block;
  const block = await computeBlock();
  cache = { block, at: Date.now() };
  return block;
}

function invalidate() { cache = { block: null, at: 0 }; }

module.exports = { getConfig, getConfigDetailed, saveConfig, search, activate, end, maybeAutoEnd, getBlock, invalidate };
