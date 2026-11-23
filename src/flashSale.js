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
  url: null,              // vacío = NO se muestra el botón "Ver todas"
  ends_at: null,          // ISO. null = sin contador (igual se puede usar, pero el timer no aparece)
  default_pct: 20,
  // Sobre qué precio se calcula el %:
  //   'current' (default) = sobre el precio que se muestra HOY (si ya tiene oferta,
  //             el flash se stackea sobre la oferta; si no, sobre el precio regular).
  //             Es el más seguro: nunca sube el precio visible.
  //   'regular' = siempre sobre el precio regular (sin descuento). Ojo: si el producto
  //             ya tenía una oferta mayor, esto podría SUBIR el precio mostrado.
  discount_base: 'current',
  accent: '#111111',      // color de las pastillas del contador en el theme
  // Presentación de un evento (Black Friday, nov-2026): 'black' = la sección
  // va en negro con el título grande (home-flash-sale.tpl). null = la de siempre.
  estilo: null,
  badge: null,            // texto del chip de arriba (null = "OFERTA RELÁMPAGO")
  despues: null,          // config de la oferta que vuelve sola cuando ésta termina (ver _end)
  items: [],              // [{ id, pct?, precio? }]  pct opcional: si falta, usa default_pct.
                          // precio = precio de oferta EXACTO (gana sobre el %): con % enteros
                          // no se llega a un número redondo ($43.999 → $39.999 es 9,09 %).
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
    if (!r) return { id: Number(i.id), missing: true, pct: i.pct || null, precio: precioFijo(i.precio) };
    return { id: Number(r.id), name: r.name, image: r.image_url, price: money(r.price), promo_now: money(r.promo_price), stock: r.stock === null ? null : Number(r.stock), pct: i.pct || null, precio: precioFijo(i.precio) };
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

/* Precio BASE sobre el que se aplica el %, según discount_base.
   'current' con una oferta vigente (promo < price) usa esa oferta; si no, el precio
   regular. 'regular' siempre el precio regular. */
function pickBase(price, promo, base) {
  const reg = Number(price);
  const pr = Number(promo);
  if (base === 'current' && Number.isFinite(pr) && pr > 0 && pr < reg) return pr;
  return reg;
}
/* Precio redondo hacia ABAJO, terminado en 99 (24.939,14 → 24.899), como los
   precios del resto de la tienda. Nunca sube: el cliente paga a lo sumo $99
   menos que el % exacto. Por debajo de $1.000 se deja con el redondeo a peso. */
function precioRedondo(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  if (x < 1000) return Math.floor(x);
  return Math.floor((x + 1) / 100) * 100 - 1;
}
const validHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v.trim());
const precioFijo = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 100 ? Math.round(n * 100) / 100 : null;
};
const ESTILOS = new Set(['black']);

/* Precio de oferta de UNA variante, o null si no hay que tocarla.
   - Con `precio` fijo en el ítem: ese número, salvo que la variante ya muestre
     uno MÁS BAJO (nunca sube el precio que el cliente ve).
   - Si no: el % sobre la base elegida, redondeado a ...99.
   Nunca devuelve un precio igual o mayor al regular. */
function promoDeVariante({ price, promotional_price }, item, cfg) {
  const reg = Number(price);
  if (!Number.isFinite(reg) || reg <= 0) return null;
  const fijo = precioFijo(item && item.precio);
  let promo;
  if (fijo) {
    const actual = Number(promotional_price);
    if (Number.isFinite(actual) && actual > 0 && actual < reg && actual <= fijo) return null;
    promo = fijo;
  } else {
    const pct = effectivePct(item || {}, cfg);
    promo = precioRedondo(pickBase(reg, promotional_price, cfg.discount_base) * (1 - pct / 100));
  }
  return promo > 0 && promo < reg ? promo : null;
}

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

  // El título es OPCIONAL. Si se deja el campo vacío a propósito, se guarda
  // vacío y la sección no dibuja encabezado (el theme oculta el <h2>).
  // Antes cualquier vacío se reemplazaba por DEFAULT.title, así que era
  // IMPOSIBLE sacarlo desde el panel: se guardaba, se recargaba y volvía a
  // aparecer "Ofertas flash". Distinguimos dos casos:
  //   · la clave no viene  → no se tocó el campo, se respeta lo que ya había
  //   · la clave viene ''  → se borró a propósito, se guarda vacío
  const title = input.title === undefined
    ? (current.title === undefined ? DEFAULT.title : current.title)
    : String(input.title).trim().slice(0, 80);
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
  const accentActive = validHex(input.accent) ? input.accent.trim() : (current.accent || DEFAULT.accent);
  // Estilo y chip: si la clave no viene (el panel no los manda) queda lo que había.
  const estilo = input.estilo === undefined ? (current.estilo || null) : (ESTILOS.has(input.estilo) ? input.estilo : null);
  const badge = input.badge === undefined ? (current.badge || null) : (input.badge ? String(input.badge).trim().slice(0, 40) : null);
  // La oferta que vuelve cuando ésta termina (ver _end). El panel no la manda: se conserva.
  const despues = input.despues === undefined ? (current.despues || null)
    : (input.despues && typeof input.despues === 'object' && Array.isArray(input.despues.items) ? input.despues : null);
  if (current.active) {
    // Con la oferta activa sólo cambian cosas de PRESENTACIÓN (no la base ni el %,
    // que ya están escritos en Tiendanube con su libreta de restauración).
    const next = { ...current, title, subtitle, url, ends_at, accent: accentActive, estilo, badge, despues };
    await putConfig(next);
    return next;
  }

  const default_pct = clampPct(input.default_pct) || DEFAULT.default_pct;
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length > MAX_ITEMS) throw badRequest(`La sección admite hasta ${MAX_ITEMS} productos.`);

  const seen = new Set();
  const wantIds = [];
  const pctById = new Map();
  const precioById = new Map();
  // El panel no conoce el precio fijo: si un ítem llega sin la clave `precio`,
  // se conserva el que ya tenía guardado (si no, guardar desde el panel lo borraba).
  const precioPrevio = new Map((current.items || []).filter((i) => precioFijo(i.precio)).map((i) => [Number(i.id), precioFijo(i.precio)]));
  for (const it of rawItems) {
    const id = Number(it && (it.id !== undefined ? it.id : it));
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    wantIds.push(id);
    const p = clampPct(it && it.pct);
    if (p) pctById.set(id, p);
    const fijo = it && typeof it === 'object' && 'precio' in it ? precioFijo(it.precio) : precioPrevio.get(id);
    if (fijo) precioById.set(id, fijo);
  }
  // Validación anti-mayorista: sólo dejamos guardar productos que son minoristas
  // (precio > 0 y stock > 0). Un mayorista no tiene precio del que sacar la oferta.
  const valid = await loadChosen(wantIds);
  const validIds = new Set(valid.map((r) => Number(r.id)));
  const rejected = wantIds.filter((id) => !validIds.has(id));
  const items = wantIds
    .filter((id) => validIds.has(id))
    .map((id) => ({
      id,
      ...(pctById.has(id) ? { pct: pctById.get(id) } : {}),
      ...(precioById.has(id) ? { precio: precioById.get(id) } : {}),
    }));

  const discount_base = input.discount_base === 'regular' ? 'regular' : 'current';
  const next = { ...current, title, subtitle, url, ends_at, default_pct, discount_base, accent: accentActive, estilo, badge, despues, items, active: false };
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
  const itemOf = new Map(cfg.items.map((i) => [Number(i.id), i]));

  const variantsBook = [];
  const productsBook = [];
  const errors = [];
  let writes = 0;

  for (const prod of chosen) {
    const item = itemOf.get(Number(prod.id)) || { id: prod.id };
    let raw = prod.raw;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }
    const variants = (raw && Array.isArray(raw.variants)) ? raw.variants : [];
    // Guardamos el promo a nivel producto del cache para restaurar el "display".
    productsBook.push({ id: Number(prod.id), prior_promo_price: money(prod.promo_price) });

    // La variante "de precio" (la que Tiendanube muestra) define el promo de display
    // que va al cache — así el resto del sitio ve el mismo número que la vidriera.
    const pricedVariant = variants.find((v) => Number(v.price) > 0);
    let displayPromo = null;

    for (const v of variants) {
      // Precio fijo del ítem o % sobre la BASE elegida (precio actual vs. regular).
      const promo = promoDeVariante(v, item, cfg);
      if (!promo) continue; // sin precio, o ya muestra uno igual o más bajo
      if (writes >= MAX_WRITES) { errors.push(`Tope de ${MAX_WRITES} escrituras alcanzado.`); break; }
      try {
        await setVariantPromotionalPrice(prod.id, v.id, promo);
        variantsBook.push({ product_id: Number(prod.id), variant_id: v.id, prior_promo: v.promotional_price ? money(v.promotional_price) : null });
        if (pricedVariant && v.id === pricedVariant.id) displayPromo = promo;
        writes += 1;
        await sleep(WRITE_DELAY_MS);
      } catch (err) {
        errors.push(`Producto ${prod.id} variante ${v.id}: ${err.message}`);
      }
    }

    // Reflejar el precio de display en el cache ya, sin esperar el próximo sync,
    // para que el resto del sitio (y el riel "ofertas") lo vea en el acto.
    if (displayPromo != null) {
      await pool.query('UPDATE products_cache SET promo_price = $2 WHERE id = $1', [Number(prod.id), displayPromo]).catch(() => {});
    }
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

  const resultado = { ok: true, active: false, restauradas: restored, errores: errors, auto };

  // OFERTA SIGUIENTE (nov-2026): el Black Friday tapa a la oferta de verano,
  // que sigue hasta el 7-dic. Hay una sola oferta a la vez, así que la de
  // Black Friday guarda en `despues` la que tiene que volver al terminar
  // (sola, al vencer el contador a la medianoche, o a mano). Si la siguiente
  // ya venció, queda guardada pero apagada.
  if (cfg.despues && typeof cfg.despues === 'object' && Array.isArray(cfg.despues.items)) {
    const sig = cfg.despues;
    await putConfig({ ...DEFAULT, ...sig, despues: null, active: false, applied_at: null, applied: { variants: [], products: [] } });
    const vence = sig.ends_at ? new Date(sig.ends_at).getTime() : null;
    if (!vence || vence > Date.now()) {
      resultado.siguiente = sig.title || 'oferta siguiente';
      // Atrás: son decenas de escrituras con pausa y esto puede venir de un pedido del home.
      activate()
        .then((r) => console.log(`[flashSale] Volvió "${resultado.siguiente}": ${r.variantes_escritas} variantes.`))
        .catch((e) => console.error('[flashSale] No se pudo prender la oferta siguiente:', e.message));
    }
  }
  return resultado;
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
  // El % de transferencia es el mismo que usan los rieles (panel › Rieles del
  // home). Sin esto las tarjetas de ofertas no mostraban "$X con Transferencia"
  // y los rieles sí: en el Black Friday es el precio más bajo que se puede decir.
  const rieles = await homeRails.getRailsConfig().catch(() => ({}));
  const transferPct = Number(rieles.transfer_discount_pct) > 0 ? Number(rieles.transfer_discount_pct) : null;

  const products = chosen.map((r) => {
    const price = money(r.price);
    // Con la oferta activa el cache ya tiene el promo de flash (lo escribió activate,
    // respetando la base elegida). Mostramos ESE número y derivamos el % del par
    // precio/promo, así el badge nunca miente sea cual sea la base.
    const promo = money(r.promo_price);
    const finalP = (promo && price && promo < price) ? promo : price;
    const disc = (price && finalP < price) ? Math.round(((price - finalP) / price) * 100) : null;
    const images = Array.isArray(r.images) ? r.images : [];
    return {
      id: Number(r.id),
      name: r.name,
      url: homeRails.productPath(r.permalink),
      image: r.image_url,
      image_hover: images.find((src) => src && src !== r.image_url) || null,
      price,
      promo_price: finalP,
      discount_pct: disc,
      transfer_price: transferPct && finalP ? money(finalP * (1 - transferPct / 100)) : null,
      free_shipping: r.raw?.free_shipping === true,
      stock: r.stock === null ? null : Number(r.stock),
      low_stock: r.stock !== null && Number(r.stock) > 0 && Number(r.stock) <= 8,
    };
  }).filter((c) => c.url && c.image && c.promo_price > 0 && c.promo_price < c.price);

  if (products.length < 1) return { active: false };

  return {
    active: true,
    title: cfg.title === undefined ? DEFAULT.title : cfg.title,  // '' = sin título, a propósito
    subtitle: cfg.subtitle || null,
    url: cfg.url || null,
    ends_at: cfg.ends_at || null,
    server_now: new Date().toISOString(), // ancla para el contador: no dependemos del reloj del cliente
    accent: cfg.accent || DEFAULT.accent,
    estilo: cfg.estilo || null,
    badge: cfg.badge || null,
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

module.exports = { precioRedondo, promoDeVariante, getConfig, getConfigDetailed, saveConfig, search, activate, end, maybeAutoEnd, getBlock, invalidate };
