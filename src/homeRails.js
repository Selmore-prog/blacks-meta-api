/* =========================================================================
 * RIELES DEL HOME — el motor decide qué producto va en cada carrusel.
 *
 * EL PROBLEMA QUE RESUELVE
 * Hasta ago-2026 los carruseles "modernos" de la tienda (Invierno, Hot Blacks,
 * lookbook y los ocho layouts de home-modern-layouts.tpl) se cargaban pegando
 * a mano hasta 8 URLs de producto en el panel de diseño de Tiendanube. Después,
 * en cada visita, el navegador se bajaba la PÁGINA HTML COMPLETA de cada uno de
 * esos productos para robarle la foto y el precio con DOMParser: 12 pedidos y
 * 2.095 KB, el 83% del peso del home. Y como nada miraba el stock, un producto
 * agotado seguía ocupando el lugar hasta que alguien se acordaba de cambiarlo.
 *
 * Acá vive la otra mitad: una sola respuesta JSON (~10 KB) con los productos ya
 * elegidos, ya ordenados y ya filtrados por stock real y curva de talles. La
 * tienda no piensa: recibe y dibuja.
 *
 * QUÉ NO PUEDE HACER, para que quede claro
 * `products_cache` guarda precio y precio promocional, pero NO el precio con
 * transferencia ni las cuotas: eso lo calcula Tiendanube al renderizar y no
 * está en su API de productos. Por eso las tarjetas de los rieles dinámicos
 * muestran precio + oferta + descuento, y el precio con transferencia sólo si
 * se configura `transfer_discount_pct` (ver más abajo).
 * ========================================================================= */

const pool = require('./db');
const { eligibleSQL } = require('./productScore');
const { getSetting, setSetting } = require('./settings');
const { runReport, isEnabled: gaEnabled } = require('./analytics');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const CACHE_TTL_MS = 15 * 60 * 1000;

/* -------------------------------------------------------------------------
 * REGLAS
 * Cada una es un filtro + un orden sobre products_cache. Todas arrancan del
 * mismo piso de elegibilidad (`eligibleSQL`, el criterio que ya usaba el
 * generador de contenido): publicado, con foto, con precio, con stock mínimo
 * y con la curva de talles sana. Un producto con 35 unidades todas del mismo
 * talle no entra a ningún riel, por más que se venda.
 * ----------------------------------------------------------------------- */
const RULES = {
  mas_vendidos: {
    label: 'Los que más se venden',
    help: 'Unidades vendidas en los últimos 30 días, de mayor a menor.',
    where: 'COALESCE(sales_30d, 0) > 0',
    order: 'sales_30d DESC, stock DESC',
  },
  // NO viene activada de fábrica, y con razón: medido sobre el catálogo real
  // (ago-2026) NINGÚN producto tiene menos de 4 meses de cobertura al ritmo de
  // venta actual — los stocks son de cientos de unidades. Publicar "últimas
  // unidades" acá sería escasez inventada. Queda disponible por si en algún
  // momento hay una punta de temporada donde sí sea cierto.
  por_agotarse: {
    label: 'Últimas unidades',
    help: 'Menos de 2 meses de stock al ritmo de venta actual. Ojo: sólo sirve '
        + 'si de verdad hay poco stock; si no, es urgencia falsa.',
    where: 'COALESCE(sales_30d, 0) > 0 AND stock < sales_30d * 2',
    order: '(stock::numeric / NULLIF(sales_30d, 0)) ASC',
  },
  // Ojo con el título de cara al cliente: la regla es interna ("no se vendió
  // nada en 30 días"), pero en la tienda se muestra como una oportunidad.
  liquidacion: {
    label: 'Oportunidades',
    help: 'Diez o más unidades y ninguna venta en 30 días: stock parado que '
        + 'conviene mover. Nunca se cruza con "los que más se venden".',
    where: 'stock >= 10 AND COALESCE(sales_30d, 0) = 0',
    order: 'stock DESC',
  },
  ofertas: {
    label: 'En oferta',
    help: 'Con precio promocional cargado en Tiendanube, mayor descuento primero.',
    where: 'promo_price IS NOT NULL AND promo_price < price',
    order: '((price - promo_price) / NULLIF(price, 0)) DESC',
  },
  novedades: {
    label: 'Recién llegados',
    help: 'Los últimos que entraron al catálogo.',
    where: "raw->>'created_at' IS NOT NULL",
    order: "(raw->>'created_at')::timestamptz DESC",
  },
};

/** Reglas que no salen de una consulta SQL directa (ver resolveSpecialRule). */
const SPECIAL_RULES = {
  mirado_no_comprado: {
    label: 'Los más mirados',
    help: 'Mucha visita y poca venta, según el termómetro de interés. OJO: si no se '
        + 'venden NO suele ser por falta de vidriera —ya los están viendo— sino por precio, '
        + 'fotos o talles incompletos. Antes de ponerlos en el home, mirá la pestaña '
        + 'Productos y arreglá la ficha. Requiere GA4 configurado.',
  },
  fijos: {
    label: 'Elegidos a mano',
    help: 'La lista exacta de productos que cargues, en ese orden.',
  },
};

/* Config por defecto: lo que se sirve mientras nadie haya guardado otra cosa.
   Elegida contra el catálogo real: de 352 productos sólo 44 pasan el filtro de
   elegibilidad, así que cuatro rieles de 12 se pisarían entre sí — por eso el
   `dedupe` de abajo, que reparte y no repite. */
const DEFAULT_CONFIG = {
  transfer_discount_pct: null, // null = no mostrar precio con transferencia (ver nota arriba)
  dedupe: true,                // un producto aparece en UN solo riel del home
  rails: [
    { id: 'rail_1', rule: 'mas_vendidos', title: 'Los que más se venden', layout: 'carousel', limit: 12, url: '/productos' },
    { id: 'rail_2', rule: 'ofertas', title: 'Ofertas de la semana', layout: 'carousel', limit: 12, url: '/productos' },
    { id: 'rail_3', rule: 'liquidacion', title: 'Oportunidades', layout: 'carousel', limit: 10, url: null },
    { id: 'rail_4', rule: 'novedades', title: 'Recién llegados', layout: 'carousel', limit: 12, url: null },
  ],
};

/* ---------------------------- helpers ---------------------------- */

const clampLimit = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.round(v), MAX_LIMIT);
};

/**
 * URL relativa del producto en la tienda. `permalink` de Tiendanube suele ser
 * el handle pelado, pero en algunas cuentas viene la URL completa: cubrimos los
 * dos casos. Siempre CON barra final, que es la forma canónica (sin unificar,
 * el navegador cachea dos veces el mismo producto).
 */
function productPath(permalink) {
  if (!permalink) return null;
  let handle = String(permalink).trim();
  if (handle.includes('://')) {
    try { handle = new URL(handle).pathname; } catch (_) { /* se usa tal cual */ }
  }
  handle = handle.replace(/^\/+|\/+$/g, '').split('/').pop();
  return handle ? `/productos/${handle}/` : null;
}

const money = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

/** Fila de products_cache → tarjeta lista para dibujar. */
function toCard(row, { transferPct } = {}) {
  const url = productPath(row.permalink);
  const price = money(row.price);
  const promo = money(row.promo_price);
  const final = promo || price;
  const images = Array.isArray(row.images) ? row.images : [];
  const discount = promo && price ? Math.round(((price - promo) / price) * 100) : null;
  return {
    id: Number(row.id),
    name: row.name,
    brand: row.brand || null,
    url,
    image: row.image_url,
    // Segunda foto para el hover en desktop. Sin esto no se pierde nada.
    image_hover: images.find((src) => src && src !== row.image_url) || null,
    price,
    promo_price: promo,
    discount_pct: discount && discount > 0 ? discount : null,
    // Sólo si el dueño cargó el porcentaje: mostrar un precio inventado es peor
    // que no mostrarlo (ver la nota de arriba).
    transfer_price: transferPct ? money(final * (1 - transferPct / 100)) : null,
    stock: row.stock === null ? null : Number(row.stock),
    sizes_in_stock: row.sizes_in_stock === null ? null : Number(row.sizes_in_stock),
    // Bandera para que la tienda pueda pintar "últimas unidades" sin recalcular.
    low_stock: row.stock !== null && Number(row.stock) > 0 && Number(row.stock) <= 8,
  };
}

/* `permalink` está en NULL para todo el catálogo viejo: hasta ago-2026 el sync
   buscaba una clave que la API de Tiendanube no devuelve (ver normalizeProduct).
   Ya está corregido, pero la columna recién se llena al próximo `npm run sync`,
   así que acá se cae a los campos crudos para que los rieles anden desde hoy. */
const CARD_COLUMNS = `id, name, brand, price, promo_price, stock, sizes_in_stock,
                      image_url, images,
                      COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink`;

/* ---------------------------- resolución de reglas ---------------------------- */

async function runSqlRule(ruleId, limit, exclude = []) {
  const rule = RULES[ruleId];
  if (!rule) return [];
  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS}
       FROM products_cache
      WHERE ${eligibleSQL()}
        AND ${rule.where}
        AND id <> ALL($2::bigint[])
      ORDER BY ${rule.order}
      LIMIT $1`,
    [limit, exclude]
  );
  return rows;
}

/**
 * "Los más mirados": los productos del cuadrante `miran_no_compran` del
 * termómetro de interés (mucha visita, poca o ninguna venta).
 *
 * Delega en productInterest en vez de repetir la consulta a GA4 acá. Importa
 * porque ese módulo resuelve dos cosas que esta regla hacía mal cuando tenía su
 * propia consulta: agrupa las variantes que GA4 informa por separado
 * ("Zapatilla (Beige, 41)") y, sobre todo, evita contar dos veces las visitas de
 * los 22 productos que están cargados duplicados en el catálogo —la ficha
 * minorista y su gemela mayorista comparten nombre—.
 *
 * Sin GA4 configurado devuelve vacío y el riel simplemente no se publica.
 */
async function runViewedNotBoughtRule(limit, exclude = []) {
  if (!gaEnabled()) return [];
  const { buildInterest } = require('./productInterest');
  const interes = await buildInterest({ days: 28 }).catch(() => null);
  if (!interes) return [];

  const excluidos = new Set(exclude.map(Number));
  const ids = interes.productos
    .filter((p) => p.cuadrante === 'miran_no_compran' && p.elegible && !excluidos.has(p.id))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((p) => p.id);
  if (!ids.length) return [];

  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS} FROM products_cache WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  // Se respeta el orden por visitas que trajo el termómetro.
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** "Elegidos a mano": respeta el orden exacto de la lista de ids. */
async function runFixedRule(ids, limit) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(0, limit);
  if (!list.length) return [];
  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS} FROM products_cache
      WHERE id = ANY($1::bigint[]) AND published IS NOT FALSE AND image_url IS NOT NULL`,
    [list]
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return list.map((id) => byId.get(id)).filter(Boolean);
}

async function resolveRule(rail, exclude = []) {
  const limit = clampLimit(rail.limit);
  // Los elegidos a mano ganan siempre: si el dueño puso ese producto ahí, va,
  // aunque ya haya salido en otro riel.
  if (rail.rule === 'fijos') return runFixedRule(rail.product_ids, limit);
  if (rail.rule === 'mirado_no_comprado') return runViewedNotBoughtRule(limit, exclude);
  return runSqlRule(rail.rule, limit, exclude);
}

/* ---------------------------- configuración ---------------------------- */

async function getRailsConfig() {
  const raw = await getSetting('home_rails');
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rails)) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (_) {
    console.warn('[homeRails] La config guardada no es JSON válido. Se usa la de fábrica.');
    return DEFAULT_CONFIG;
  }
}

/* Los ids posibles NO son libres: el theme tiene exactamente cuatro huecos
   (rail_1..rail_4 en el orden de la página de inicio). Un riel con otro id se
   generaría en el JSON y no lo dibujaría nadie. */
const SLOT_IDS = ['rail_1', 'rail_2', 'rail_3', 'rail_4'];
const LAYOUTS = ['carousel', 'grid'];

function badRequest(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

/**
 * Valida y normaliza lo que manda el panel. Devuelve la config lista para
 * guardar; tira 400 con un mensaje en castellano si algo no cierra.
 */
function validateConfig(input) {
  if (!input || typeof input !== 'object') throw badRequest('Falta la configuración.');
  const rails = Array.isArray(input.rails) ? input.rails : null;
  if (!rails) throw badRequest('Falta la lista de rieles.');
  if (rails.length > SLOT_IDS.length) {
    throw badRequest(`El home tiene ${SLOT_IDS.length} huecos para rieles automáticos; mandaste ${rails.length}.`);
  }

  const vistos = new Set();
  const limpios = rails.map((r, i) => {
    const id = String(r.id || SLOT_IDS[i] || '');
    if (!SLOT_IDS.includes(id)) {
      throw badRequest(`"${id}" no es un hueco válido. Los disponibles son: ${SLOT_IDS.join(', ')}.`);
    }
    if (vistos.has(id)) throw badRequest(`El hueco ${id} está repetido.`);
    vistos.add(id);

    if (!RULES[r.rule] && !SPECIAL_RULES[r.rule]) {
      throw badRequest(`La regla "${r.rule}" no existe.`);
    }
    if (r.rule === 'fijos' && !(Array.isArray(r.product_ids) && r.product_ids.length)) {
      throw badRequest('El riel "Elegidos a mano" necesita al menos un producto.');
    }
    const layout = LAYOUTS.includes(r.layout) ? r.layout : 'carousel';
    const title = String(r.title || '').trim();
    if (!title) throw badRequest(`El riel ${id} necesita un título.`);

    return {
      id,
      rule: r.rule,
      title: title.slice(0, 80),
      subtitle: r.subtitle ? String(r.subtitle).trim().slice(0, 160) : null,
      layout,
      limit: clampLimit(r.limit),
      url: r.url ? String(r.url).trim().slice(0, 200) : null,
      allow_repeat: Boolean(r.allow_repeat),
      product_ids: Array.isArray(r.product_ids)
        ? r.product_ids.map(Number).filter(Number.isFinite).slice(0, MAX_LIMIT)
        : undefined,
    };
  });

  const pct = Number(input.transfer_discount_pct);
  return {
    transfer_discount_pct: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : null,
    dedupe: input.dedupe !== false,
    rails: limpios,
  };
}

async function saveRailsConfig(input) {
  const cfg = validateConfig(input);
  await setSetting('home_rails', JSON.stringify(cfg));
  invalidate(); // la tienda tiene que ver el cambio ya, no en 15 minutos
  return cfg;
}

/* ---------------------------- construcción ---------------------------- */

/** `override` permite armar la vista previa del panel SIN guardar la config. */
async function buildPayload(override = null) {
  const cfg = override || await getRailsConfig();
  const transferPct = Number(cfg.transfer_discount_pct) > 0 ? Number(cfg.transfer_discount_pct) : null;

  const rails = [];
  // Ids ya colocados: con 44 productos elegibles y rieles de 12, sin esto el
  // home mostraría el mismo pantalón cuatro veces.
  const usados = [];
  for (const rail of cfg.rails) {
    const known = RULES[rail.rule] || SPECIAL_RULES[rail.rule];
    if (!known) {
      console.warn(`[homeRails] Regla desconocida "${rail.rule}" en ${rail.id}: se saltea.`);
      continue;
    }
    let rows = [];
    try {
      rows = await resolveRule(rail, cfg.dedupe === false || rail.allow_repeat ? [] : usados);
    } catch (err) {
      // Un riel que falla no puede tirar abajo los otros tres.
      console.error(`[homeRails] Falló ${rail.id} (${rail.rule}): ${err.message}`);
      continue;
    }
    const products = rows.map((r) => toCard(r, { transferPct })).filter((c) => c.url && c.image);
    // Un carrusel con dos productos se ve peor que no tenerlo.
    if (products.length < 3) continue;
    for (const p of products) usados.push(p.id);
    rails.push({
      id: rail.id,
      rule: rail.rule,
      title: rail.title || known.label,
      subtitle: rail.subtitle || null,
      layout: rail.layout === 'grid' ? 'grid' : 'carousel',
      url: rail.url || null,
      products,
    });
  }

  // ttl = cuánto cachea el CLIENTE (sessionStorage del theme). Corto (30s) para que
  // un cambio publicado desde el panel se vea enseguida al recargar la tienda. No es
  // el caché interno del motor (ese es CACHE_TTL_MS y se invalida solo al guardar).
  return { generated_at: new Date().toISOString(), ttl: 30, rails };
}

/* ---------------------------- caché ----------------------------
 * Un objeto en memoria alcanza: el home es una sola página y el proceso es
 * único. Si está vencido se devuelve lo viejo AL INSTANTE y se recalcula
 * atrás — así ninguna visita paga el costo de la consulta.
 * -------------------------------------------------------------- */
let cache = { payload: null, builtAt: 0 };
let rebuilding = null;

function rebuild() {
  if (rebuilding) return rebuilding;
  rebuilding = buildPayload()
    .then((payload) => {
      cache = { payload, builtAt: Date.now() };
      return payload;
    })
    .finally(() => { rebuilding = null; });
  return rebuilding;
}

async function getRails({ force = false } = {}) {
  const age = Date.now() - cache.builtAt;
  if (force || !cache.payload) return rebuild();
  if (age > CACHE_TTL_MS) rebuild().catch((err) => console.error('[homeRails] Rebuild:', err.message));
  return cache.payload;
}

/** Para invalidar después de un sync de catálogo o de ventas. */
function invalidate() {
  cache = { payload: null, builtAt: 0 };
}

module.exports = {
  RULES, SPECIAL_RULES, DEFAULT_CONFIG, CACHE_TTL_MS, SLOT_IDS, LAYOUTS,
  getRails, getRailsConfig, saveRailsConfig, validateConfig,
  buildPayload, invalidate, productPath,
};
