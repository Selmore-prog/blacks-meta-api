/* =========================================================================
 * CONJUNTO CURADO DE ANUNCIOS (product set de Meta) — ago-2026
 *
 * EL PROBLEMA
 * Los anuncios de catálogo salen contra "All Products": 1944 items que en
 * realidad son 113 productos (17 items por producto, porque cada talle/color
 * es un item suelto y Tiendanube NO manda item_group_id). Resultado medido:
 *   · el mismo pantalón puede ocupar 60 tarjetas del carrusel,
 *   · entran fichas mayoristas que no se pueden comprar,
 *   · entran productos con UN solo talle con stock (136 de 353 están así),
 *   · y entra ropa fuera de temporada porque "tiene stock".
 *
 * LA SOLUCIÓN, Y LO QUE *NO* HACE
 * NO se crea un catálogo nuevo ni un feed paralelo: el catálogo de Tiendanube
 * sigue siendo la única fuente de precio, foto, link y stock, y no se le toca
 * ni un campo. Lo único que se escribe en Meta es un PRODUCT SET: una lista
 * blanca de retailer_id que dice "de todo esto, anunciá esto". Si mañana se
 * apaga este módulo, el catálogo queda exactamente como estaba.
 *
 * POR QUÉ LISTA BLANCA DE retailer_id Y NO custom_labels
 * custom_label_0 ya lo usa Tiendanube (guarda un hash de cambios), o sea que
 * el feed SÍ pisa labels. Una lista de ~50 ids no depende de que el feed
 * respete nada nuestro: es a prueba de balas y se reescribe entera cada vez.
 *
 * TRES CONJUNTOS, PORQUE SIRVEN PARA COSAS DISTINTAS
 *  1. CURADO      → 1 item por producto (el talle con más stock). Prospecting:
 *                   sin duplicados, sin mayorista, en temporada, curva sana.
 *  2. CURADO TOP  → sólo los tier A. Para el ad set con más presupuesto.
 *  3. REMARKETING → filtro amplio (in stock + no mayorista), SIN deduplicar.
 *                   Acá el duplicado es deseable: si alguien miró el cargo
 *                   azul talle 42, ese item exacto tiene que existir o el
 *                   anuncio de recuperación no lo puede mostrar.
 *  Y desde oct-2026 dos más con los MÁS VENDIDOS (pedidos pagos de 60 días)
 *  que hoy tienen stock y ningún talle del medio agotado, con todos sus talles:
 *  REMARKETING CURADO (los anuncios de catálogo del remarketing) y MÁS
 *  VENDIDOS · PROSPECTING (lo mismo sin los que ya tienen anuncio propio).
 *
 * HISTÉRESIS
 * Un producto no entra y sale del conjunto todos los días: para salir por un
 * motivo "blando" (temporada, curva, score) tiene que fallar 2 corridas
 * seguidas. Por un motivo duro (se agotó, se despublicó, no tiene precio)
 * sale en el acto — no se puede anunciar lo que no se puede comprar.
 * ========================================================================= */

const pool = require('./db');
const config = require('./config');
const { fbGet, fbPost, fetchAllCatalogItems } = require('./catalogSync');
const { getSetting, setSetting } = require('./settings');

/* ------------------------------- umbrales -------------------------------- */

// Más exigente que productScore (que decide si un producto protagoniza una
// PIEZA): acá se está pagando por cada impresión, no regalando alcance.
const MIN_STOCK = 6;          // unidades totales
const MIN_SIZES_IN_STOCK = 3; // talles con stock...
const MIN_COVERAGE = 0.5;     // ...o la mitad de la curva viva
const MIN_SEASON_FIT = 0.25;  // por debajo de esto es ropa fuera de estación
const TIER_A_TOP = 0.30;      // el 30% de mayor score
const TIER_B_TOP = 0.70;
const STRIKES_PARA_SALIR = 2; // corridas seguidas fallando (motivos blandos)
const MINIMO_SEGURIDAD = 10;  // si el conjunto quedaría más chico, no se aplica

const NOMBRE_CURADO = 'Motor · Curado';
const NOMBRE_TOP = 'Motor · Curado TOP';
const NOMBRE_REMARKETING = 'Motor · Remarketing';
// El conjunto del remarketing de catálogo ("Remarketing 90d · Talles OK ·
// Compra"). Historia: el 2-oct-2026 pasó de "todo lo que tenga stock" a "los
// curados con curva", pero los de talle único pasaban siempre y el 6-oct
// tenía 34 productos con 7 guantes, tops deportivos, ojotas de bebé, casco y
// anteojos. Sebastián pidió que muestre sólo los más vendidos con stock: hoy
// son los MAS_VENDIDOS_N primeros del ranking (ver masVendidos). Conserva el
// nombre porque Meta no deja cambiarle el conjunto de productos a un conjunto
// de anuncios publicado: lo que cambia es el contenido, no el conjunto.
const NOMBRE_REMARKETING_CURADO = 'Motor · Remarketing curado';
// Los mismos más vendidos para gente que todavía no visitó la tienda, menos
// los que ya tienen anuncio propio (CON_ANUNCIO_PROPIO).
const NOMBRE_MAS_VENDIDOS = 'Motor · Más vendidos · Prospecting';

/* ---------------------------- los más vendidos ---------------------------- */

const MAS_VENDIDOS_N = 10;     // cuántos productos entran
const MAS_VENDIDOS_DIAS = 60;  // ventana del ranking: pedidos pagos de la tienda
const MAS_VENDIDOS_MINIMO = 5; // con menos, se deja la lista que había
// El jean clásico tiene sus propios anuncios en el prospecting y se llevó el
// 80% del gasto del 3 al 6-oct-2026. En el catálogo para gente nueva sobra:
// ese conjunto existe para que vendan los otros.
const CON_ANUNCIO_PROPIO = new Set([298859922]);

/* ------------------------------- temporada ------------------------------- */

/**
 * Afinidad 0..1 de cada temporada con cada mes (hemisferio sur, Argentina).
 * No es binario a propósito: el 21 de agosto todavía se vende abrigo (0,90)
 * pero en septiembre baja a 0,45 y en octubre a 0,15, así el conjunto se va
 * dando vuelta solo en vez de pegar un volantazo el primer día de primavera.
 * Media estación queda alta en marzo-abril y agosto-noviembre.
 */
const SEASON_FIT = {
  //         ene   feb   mar   abr   may   jun   jul   ago   sep   oct   nov   dic
  verano:   [1.00, 1.00, 0.85, 0.45, 0.10, 0.00, 0.00, 0.10, 0.50, 0.85, 1.00, 1.00],
  invierno: [0.00, 0.05, 0.20, 0.60, 0.90, 1.00, 1.00, 0.90, 0.45, 0.15, 0.00, 0.00],
  media:    [0.60, 0.65, 0.90, 1.00, 0.85, 0.65, 0.65, 0.90, 1.00, 1.00, 0.85, 0.65],
  todo:     [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
};

// La clasificación mira PRIMERO la prenda y sólo después la colección. Es a
// propósito: la tienda usa "Invierno 26" como nombre de drop, no como "esto
// sólo se usa con frío" — ahí adentro hay pantalones cargo y camisas que se
// venden los 12 meses. Si mandáramos la colección entera a 'invierno', en
// noviembre el conjunto se quedaría con cuatro productos.
const KW_PRENDA_INVIERNO = ['campera', 'buzo', 'canguro', 'sweater', 'pullover', 'parka',
  'gorro', 'bufanda', 'sobretodo', 'chomba manga larga'];
const KW_TELA_INVIERNO = ['polar', 'frisa', 'softshell', 'termic', 'térmic', 'abrigo', 'corderoy'];
const KW_PRENDA_VERANO = ['remera', 'chomba', 'short', 'bermuda', 'musculosa', 'ojota',
  'sandalia', 'malla', 'manga corta', 'gorra', 'top'];
// Prendas que en ropa de trabajo NO tienen estación: el cargo, la camisa y el
// calzado de seguridad se venden en enero y en julio por igual.
const KW_TODO_EL_ANO = ['pantalon', 'jean', 'camisa', 'zapato', 'bota', 'borcego', 'calzado',
  'zapatilla', 'faja', 'alpargata', 'mameluco', 'delantal', 'guardapolvo', 'cinto', 'media',
  'casco', 'antiparra', 'arnes', 'guante', 'chaleco', 'rompeviento', 'bombacha',
  'cinturon', 'campera de lluvia', 'piloto'];

const sinAcentos = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ------------------------- talles del medio agotados ------------------------ */

// Talles "del medio": los que m\u00e1s se piden. Pantal\u00f3n 40-48, calzado 39-43 o
// 7-10 US (la alpargata), M a XL.
function esTalleCentral(talle) {
  const t = String(talle || '').trim().toUpperCase();
  if (['M', 'L', 'XL'].includes(t)) return true;
  const us = t.match(/^(\d{1,2})\s*US$/);
  if (us) return Number(us[1]) >= 7 && Number(us[1]) <= 10;
  const m = t.match(/^(\d{2})/);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 39 && n <= 48;
}

/**
 * Talles del medio que no tienen stock en NING\u00daN color. Si el 44 est\u00e1 agotado
 * en todos, el que usa 44 hace clic, no encuentra su talle y se va: es un clic
 * pagado que no puede terminar en compra. Pas\u00f3 con el cargo slim fit el
 * 6-oct-2026 (sin 44 ni 48), el segundo m\u00e1s vendido de los 60 d\u00edas anteriores.
 * Cuando entra el talle, el producto vuelve solo en la corrida siguiente.
 */
function tallesCentralesAgotados(raw) {
  const attrs = ((raw && raw.attributes) || []).map((a) => sinAcentos(a && typeof a === 'object' ? a.es : a));
  const iTalle = attrs.findIndex((a) => a.startsWith('talle') || a.startsWith('numero'));
  if (iTalle < 0) return [];
  const stockPorTalle = new Map();
  for (const v of (raw && raw.variants) || []) {
    const valores = (v.values || []).map((x) => (x && typeof x === 'object' ? x.es : x));
    const talle = valores[iTalle];
    // stock null = sin control de stock: cuenta como disponible.
    const stock = v.stock === null || v.stock === undefined ? 1 : Math.max(0, Number(v.stock) || 0);
    stockPorTalle.set(talle, (stockPorTalle.get(talle) || 0) + stock);
  }
  return [...stockPorTalle].filter(([t, n]) => n === 0 && esTalleCentral(t)).map(([t]) => t);
}

/**
 * Pedidos, unidades y facturaci\u00f3n por producto en los \u00faltimos `dias`, de los
 * pedidos PAGOS de la tienda (orders_cache), entren por el canal que entren.
 * Si la tabla falla devuelve null y los conjuntos de m\u00e1s vendidos no se tocan.
 */
async function ventasPorProducto(dias) {
  try {
    const { rows } = await pool.query(
      `SELECT (x->>'product_id')::bigint AS id, count(DISTINCT o.id) AS pedidos,
              sum((x->>'quantity')::int) AS unidades,
              sum((x->>'price')::numeric * (x->>'quantity')::int) AS facturado
         FROM orders_cache o, jsonb_array_elements(o.products) x
        WHERE o.created_at >= now() - ($1 || ' days')::interval
          AND o.payment_status = 'paid' AND o.cancelled_at IS NULL
        GROUP BY 1`, [String(dias)]);
    return new Map(rows.map((r) => [Number(r.id), {
      pedidos: Number(r.pedidos), unidades: Number(r.unidades), facturado: Math.round(Number(r.facturado)),
    }]));
  } catch (err) {
    console.warn(`[adSet] Sin ranking de ventas (orders_cache): ${err.message}. No toco los m\u00e1s vendidos.`);
    return null;
  }
}

/**
 * Clasifica el producto en verano / invierno / media / todo.
 * Por defecto 'todo': suponerle estación a una prenda neutra la sacaría del
 * aire medio año sin razón, que es un error más caro que el contrario.
 */
function clasificarTemporada({ name, category, productType }) {
  const nombre = sinAcentos(name);
  const coleccion = sinAcentos(`${productType || ''} ${category || ''}`);
  // Match por PRINCIPIO de palabra, no por substring: con includes(), "top"
  // matcheaba dentro de "Ripstop" y mandaba el cargo antidesgarro a verano
  // (bug real, agosto 2026). Sin cierre de palabra, así "termic" sigue
  // agarrando "térmica" y "bota" agarra "botas".
  const tiene = (kws, texto) => kws.some((k) => new RegExp(`\\b${sinAcentos(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(texto));

  // 1. Media estación explícita: un rompeviento es de primavera/otoño aunque
  //    la palabra "campera" lo mandaría a invierno.
  if (tiene(['rompeviento'], nombre)) return 'media';
  // 2. La prenda o la tela mandan: una campera de polar es de invierno esté en
  //    la colección que esté.
  if (tiene(KW_PRENDA_INVIERNO, nombre) || tiene(KW_TELA_INVIERNO, nombre)) return 'invierno';
  if (tiene(KW_PRENDA_VERANO, nombre)) return 'verano';
  // 3. Prenda sin estación (pantalón, camisa, calzado): se anuncia todo el año.
  if (tiene(KW_TODO_EL_ANO, nombre)) return 'todo';
  // 4. Recién acá vale la colección, para lo que no supimos clasificar.
  if (coleccion.includes('invierno')) return 'invierno';
  if (coleccion.includes('verano')) return 'verano';
  return 'todo';
}

function seasonFit(temporada, date = new Date()) {
  const fila = SEASON_FIT[temporada] || SEASON_FIT.todo;
  return fila[date.getMonth()];
}

/* ------------------------------ elegibilidad ----------------------------- */

// Motivos DUROS: sacan al producto en el acto, sin esperar la segunda falla.
const MOTIVOS_DUROS = new Set(['despublicado', 'sin_foto', 'mayorista', 'sin_stock', 'stock_bajo', 'no_esta_en_meta']);

/**
 * ¿Este producto merece que le pongamos plata? Devuelve { ok, motivo, detalle }.
 * `detalle` es el texto que se muestra en el panel, en castellano.
 */
function evaluar(p, { variantesEnMeta, fecha }) {
  if (p.published === false) return { motivo: 'despublicado', detalle: 'ya no está publicado en Tiendanube' };
  if (!p.image_url) return { motivo: 'sin_foto', detalle: 'sin foto' };
  // Ficha mayorista: sin precio de venta (o precio 0) no hay nada que comprar.
  // Son 240 de 353 productos — el grueso del catálogo, y la fuente principal
  // de "anuncios con precio cero" que se veían en la pauta.
  if (p.price === null || Number(p.price) <= 0) {
    return { motivo: 'mayorista', detalle: 'ficha mayorista (sin precio de venta)' };
  }
  if (String(p.category || '').toLowerCase().startsWith('mayorista')) {
    return { motivo: 'mayorista', detalle: 'está en la categoría Mayorista' };
  }
  // stock null = sin control de stock (mayorista / a pedido): no se anuncia.
  if (p.stock === null) return { motivo: 'sin_stock', detalle: 'sin control de stock' };
  const stock = Number(p.stock);
  if (stock <= 0) return { motivo: 'sin_stock', detalle: 'sin stock' };
  if (stock < MIN_STOCK) return { motivo: 'stock_bajo', detalle: `stock bajo (${stock} u.)` };

  const total = Number(p.sizes_total || 0);
  const vivos = Number(p.sizes_in_stock || 0);
  const cobertura = p.size_coverage === null || p.size_coverage === undefined ? null : Number(p.size_coverage);
  if (total > 1 && vivos < MIN_SIZES_IN_STOCK && (cobertura === null || cobertura < MIN_COVERAGE)) {
    return { motivo: 'curva_rota', detalle: `curva rota (${vivos} de ${total} talles con stock)` };
  }

  const fit = seasonFit(p.temporada, fecha);
  if (fit < MIN_SEASON_FIT) {
    return { motivo: 'fuera_de_temporada', detalle: `fuera de temporada (${p.temporada})` };
  }

  if (!variantesEnMeta.length) {
    return { motivo: 'no_esta_en_meta', detalle: 'no está en el catálogo de Meta' };
  }
  if (!variantesEnMeta.some((v) => v.availability === 'in stock')) {
    return { motivo: 'agotado_en_meta', detalle: 'en Meta figura agotado (corré "Revisar catálogo vs stock")' };
  }
  return { ok: true, motivo: null, detalle: null };
}

/* --------------------------------- score --------------------------------- */

// Compresión logarítmica: sin esto, un producto que vendió 40 unidades deja a
// todos los demás en cero y el ranking se vuelve una lista de un solo ítem.
const normLog = (x, max) => (max > 0 ? Math.log1p(Math.max(0, x)) / Math.log1p(max) : 0);

function calcularScore(p, maximos) {
  const curva = Math.min(1, 0.5 * Number(p.size_coverage || 0)
    + 0.5 * Math.min(1, Number(p.sizes_in_stock || 0) / 6));
  const profundidad = Math.min(1, normLog(Number(p.stock || 0), 60));
  const ventas = normLog(Number(p.sales_30d || 0), maximos.ventas);
  const interes = normLog(Number(p.views || 0) + 3 * Number(p.carts || 0), maximos.interes);
  const fit = seasonFit(p.temporada);
  const promo = p.promo_price && Number(p.promo_price) < Number(p.price) ? 1 : 0;

  const score = 100 * (
    0.30 * ventas       // lo que ya se vende solo, se vende mejor con pauta
    + 0.20 * interes    // vistas y carritos de GA4 (si Analytics está enchufado)
    + 0.20 * curva      // curva de talles: el corazón del pedido
    + 0.15 * profundidad
    + 0.15 * fit
  ) + 4 * promo;

  return {
    score: Math.round(score * 10) / 10,
    partes: {
      ventas: Math.round(ventas * 100),
      interes: Math.round(interes * 100),
      curva: Math.round(curva * 100),
      profundidad: Math.round(profundidad * 100),
      temporada: Math.round(fit * 100),
      promo: Boolean(promo),
    },
  };
}

/* ------------------------- interés (GA4, opcional) ------------------------ */

/**
 * Vistas y carritos por producto. Es lo que separa "no se vende porque nadie
 * lo ve" de "lo ven y no convence". Best-effort a propósito: si Analytics no
 * está configurado o la API falla, el conjunto se arma igual sólo con ventas,
 * stock, curva y temporada. Nunca se cae por esto.
 */
async function interesPorProducto(days) {
  try {
    const { buildInterest } = require('./productInterest');
    const r = await buildInterest({ days });
    const map = new Map();
    for (const p of r.productos || []) map.set(Number(p.id), { views: p.views || 0, carts: p.carts || 0 });
    return { map, ok: true };
  } catch (err) {
    console.warn(`[adSet] Sin datos de interés (GA4): ${err.message}. Sigo con ventas y stock.`);
    return { map: new Map(), ok: false };
  }
}

/* ----------------------------- product sets ------------------------------ */

/** Busca un product set por nombre; si no existe, lo crea. Devuelve su id. */
async function upsertProductSet(catalogId, nombre, filtro) {
  const guardado = await getSetting(`meta_set_${sinAcentos(nombre).replace(/[^a-z0-9]+/g, '_')}`);
  let id = guardado || null;

  if (!id) {
    const lista = await fbGet(`${catalogId}/product_sets`, { fields: 'id,name', limit: 200 });
    const found = (lista.data || []).find((s) => s.name === nombre);
    id = found ? found.id : null;
  }

  if (id) {
    await fbPost(id, { name: nombre, filter: JSON.stringify(filtro) });
  } else {
    const creado = await fbPost(`${catalogId}/product_sets`, { name: nombre, filter: JSON.stringify(filtro) });
    id = creado.id;
  }
  await setSetting(`meta_set_${sinAcentos(nombre).replace(/[^a-z0-9]+/g, '_')}`, String(id));
  return id;
}

/* ------------------------------- histéresis ------------------------------ */

async function estadoAnterior() {
  try {
    const { rows } = await pool.query('SELECT product_id, in_set, fail_streak, entered_at FROM ad_set_members');
    const map = new Map();
    for (const r of rows) map.set(Number(r.product_id), r);
    return map;
  } catch (err) {
    // Tabla todavía sin migrar: primera corrida, arranca de cero.
    return new Map();
  }
}

async function guardarEstado(filas) {
  for (const f of filas) {
    await pool.query(
      `INSERT INTO ad_set_members (product_id, retailer_id, in_set, score, tier, season, reason, fail_streak, entered_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (product_id) DO UPDATE SET
         retailer_id = EXCLUDED.retailer_id, in_set = EXCLUDED.in_set, score = EXCLUDED.score,
         tier = EXCLUDED.tier, season = EXCLUDED.season, reason = EXCLUDED.reason,
         fail_streak = EXCLUDED.fail_streak, entered_at = EXCLUDED.entered_at, updated_at = now()`,
      [f.id, f.retailer_id, f.in_set, f.score, f.tier, f.temporada, f.detalle, f.fail_streak, f.entered_at]
    );
  }
}

/* ================================ principal =============================== */

/**
 * Arma el conjunto y (si apply) lo escribe en Meta.
 * apply=false es un dry-run completo: calcula todo y no toca nada.
 */
async function buildAdSet({ apply = false, days = 28, fecha = new Date() } = {}) {
  const catalogId = config.meta.catalogId;
  if (!catalogId) throw new Error('Falta META_CATALOG_ID.');
  if (!config.meta.adsAccessToken) throw new Error('Falta el token de Meta con permiso catalog_management.');

  const [items, productos, interes, previo, ventas] = await Promise.all([
    fetchAllCatalogItems(catalogId, 'retailer_id,name,availability,price,product_type'),
    pool.query(`SELECT id, name, brand, category, price, promo_price, stock, sizes_total, sizes_in_stock,
                       size_coverage, image_url, published, sales_30d, raw
                  FROM products_cache WHERE published IS NOT FALSE`),
    interesPorProducto(days),
    estadoAnterior(),
    ventasPorProducto(MAS_VENDIDOS_DIAS),
  ]);

  // retailer_id -> item del catálogo de Meta.
  const enMeta = new Map();
  for (const it of items) enMeta.set(String(it.retailer_id), it);

  // Producto -> sus variantes que EXISTEN en el catálogo de Meta. Es el cruce
  // clave: de nada sirve meter en el conjunto un id que Meta no conoce.
  const candidatos = [];
  const rawPorId = new Map();
  for (const row of productos.rows) {
    let raw = row.raw;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }
    rawPorId.set(Number(row.id), raw);
    const variantes = ((raw && raw.variants) || [])
      .map((v) => {
        const item = enMeta.get(String(v.id));
        return item ? { id: String(v.id), stock: Number(v.stock || 0), availability: item.availability, productType: item.product_type } : null;
      })
      .filter(Boolean);
    const g = interes.map.get(Number(row.id)) || { views: 0, carts: 0 };
    candidatos.push({
      ...row,
      id: Number(row.id),
      views: g.views,
      carts: g.carts,
      variantesEnMeta: variantes,
      temporada: clasificarTemporada({
        name: row.name,
        category: row.category,
        productType: variantes[0] ? variantes[0].productType : null,
      }),
    });
  }

  // Máximos para normalizar (sólo entre los que tienen precio: el resto es
  // mayorista y distorsionaría la escala).
  const conPrecio = candidatos.filter((p) => Number(p.price) > 0);
  const maximos = {
    ventas: Math.max(1, ...conPrecio.map((p) => Number(p.sales_30d || 0))),
    interes: Math.max(1, ...conPrecio.map((p) => Number(p.views || 0) + 3 * Number(p.carts || 0))),
  };

  const dentro = [];
  const fuera = [];
  const filasEstado = [];

  for (const p of candidatos) {
    const ev = evaluar(p, { variantesEnMeta: p.variantesEnMeta, fecha });
    const anterior = previo.get(p.id) || { in_set: false, fail_streak: 0, entered_at: null };

    if (ev.ok) {
      const { score, partes } = calcularScore(p, maximos);
      // Variante representativa: el talle/color con más stock que Meta tenga
      // como disponible. Una sola por producto = una sola tarjeta en el
      // carrusel, que es todo el punto de deduplicar.
      const rep = p.variantesEnMeta
        .filter((v) => v.availability === 'in stock')
        .sort((a, b) => b.stock - a.stock)[0] || p.variantesEnMeta[0];
      dentro.push({
        id: p.id, name: p.name, brand: p.brand, image_url: p.image_url,
        retailer_id: rep.id, score, partes, temporada: p.temporada,
        stock: Number(p.stock), sizes_in_stock: p.sizes_in_stock, sizes_total: p.sizes_total,
        sales_30d: Number(p.sales_30d || 0), views: p.views, carts: p.carts,
        price: Number(p.price), promo_price: p.promo_price ? Number(p.promo_price) : null,
        todas_las_variantes: p.variantesEnMeta.filter((v) => v.availability === 'in stock').map((v) => v.id),
        entered_at: anterior.entered_at || new Date(),
        nuevo: !anterior.in_set,
      });
      continue;
    }

    // No elegible. Los motivos duros sacan ya; los blandos necesitan 2 strikes.
    const duro = MOTIVOS_DUROS.has(ev.motivo);
    const strikes = (anterior.fail_streak || 0) + 1;
    const sigueAdentro = !duro && anterior.in_set && strikes < STRIKES_PARA_SALIR;

    if (sigueAdentro) {
      const { score, partes } = calcularScore(p, maximos);
      const rep = p.variantesEnMeta.filter((v) => v.availability === 'in stock').sort((a, b) => b.stock - a.stock)[0]
        || p.variantesEnMeta[0];
      if (rep) {
        dentro.push({
          id: p.id, name: p.name, brand: p.brand, image_url: p.image_url,
          retailer_id: rep.id, score, partes, temporada: p.temporada,
          stock: Number(p.stock || 0), sizes_in_stock: p.sizes_in_stock, sizes_total: p.sizes_total,
          sales_30d: Number(p.sales_30d || 0), views: p.views, carts: p.carts,
          price: Number(p.price), promo_price: p.promo_price ? Number(p.promo_price) : null,
          todas_las_variantes: p.variantesEnMeta.filter((v) => v.availability === 'in stock').map((v) => v.id),
          entered_at: anterior.entered_at,
          nuevo: false,
          en_gracia: `${ev.detalle} — sale en la próxima corrida si sigue así`,
        });
        filasEstado.push({ id: p.id, retailer_id: rep.id, in_set: true, score, tier: null,
          temporada: p.temporada, detalle: ev.detalle, fail_streak: strikes, entered_at: anterior.entered_at });
        continue;
      }
    }

    fuera.push({ id: p.id, name: p.name, motivo: ev.motivo, detalle: ev.detalle, temporada: p.temporada });
    filasEstado.push({ id: p.id, retailer_id: null, in_set: false, score: null, tier: null,
      temporada: p.temporada, detalle: ev.detalle, fail_streak: duro ? 0 : strikes, entered_at: null });
  }

  // Tiers por percentil del score, no por corte fijo: con 40 productos un corte
  // absoluto dejaría el tier A vacío la mitad del año.
  dentro.sort((a, b) => b.score - a.score);
  const cortA = Math.max(1, Math.ceil(dentro.length * TIER_A_TOP));
  const cortB = Math.ceil(dentro.length * TIER_B_TOP);
  dentro.forEach((d, i) => { d.tier = i < cortA ? 'A' : (i < cortB ? 'B' : 'C'); });

  for (const d of dentro) {
    if (!filasEstado.some((f) => f.id === d.id)) {
      filasEstado.push({ id: d.id, retailer_id: d.retailer_id, in_set: true, score: d.score,
        tier: d.tier, temporada: d.temporada, detalle: null, fail_streak: 0, entered_at: d.entered_at });
    } else {
      const f = filasEstado.find((x) => x.id === d.id);
      f.tier = d.tier;
    }
  }

  const porMotivo = {};
  for (const f of fuera) porMotivo[f.detalle.replace(/\s*\(.*/, '')] = (porMotivo[f.detalle.replace(/\s*\(.*/, '')] || 0) + 1;

  // Los más vendidos: de los curados (publicados, con precio, stock, curva y
  // en temporada), los que más pedidos pagos tuvieron, sin talles del medio
  // agotados. Entran con TODOS sus talles con stock: en el remarketing tiene
  // que existir el item exacto que la persona miró. Los que están "en gracia"
  // fallaron esta corrida: al catálogo no entran.
  const sinVentas = { pedidos: 0, unidades: 0, facturado: 0 };
  for (const d of dentro) {
    d.ventas_ranking = (ventas && ventas.get(d.id)) || sinVentas;
    d.centrales_agotados = tallesCentralesAgotados(rawPorId.get(d.id));
  }
  const masVendidos = ventas ? dentro
    .filter((d) => !d.en_gracia && !d.centrales_agotados.length && d.todas_las_variantes.length)
    .sort((a, b) => b.ventas_ranking.pedidos - a.ventas_ranking.pedidos
      || b.ventas_ranking.unidades - a.ventas_ranking.unidades
      || b.ventas_ranking.facturado - a.ventas_ranking.facturado
      || b.score - a.score)
    .slice(0, MAS_VENDIDOS_N) : [];
  const masVendidosProspecting = masVendidos.filter((d) => !CON_ANUNCIO_PROPIO.has(d.id));
  const resumenProducto = (d) => ({
    id: d.id, name: d.name, pedidos: d.ventas_ranking.pedidos, unidades: d.ventas_ranking.unidades,
    talles: `${d.sizes_in_stock}/${d.sizes_total}`, variantes: d.todas_las_variantes.length,
    con_anuncio_propio: CON_ANUNCIO_PROPIO.has(d.id),
  });

  const resumen = {
    catalogId,
    fecha: fecha.toISOString().slice(0, 10),
    items_en_catalogo: items.length,
    productos_en_catalogo: new Set(items.map((i) => i.name)).size,
    productos_evaluados: candidatos.length,
    en_el_conjunto: dentro.length,
    duplicados_evitados: dentro.reduce((a, d) => a + Math.max(0, d.todas_las_variantes.length - 1), 0),
    tier_a: dentro.filter((d) => d.tier === 'A').length,
    tier_b: dentro.filter((d) => d.tier === 'B').length,
    tier_c: dentro.filter((d) => d.tier === 'C').length,
    nuevos: dentro.filter((d) => d.nuevo).length,
    en_gracia: dentro.filter((d) => d.en_gracia).length,
    excluidos: fuera.length,
    excluidos_por_motivo: Object.fromEntries(Object.entries(porMotivo).sort((a, b) => b[1] - a[1])),
    mas_vendidos: {
      dias: MAS_VENDIDOS_DIAS,
      ranking_ok: Boolean(ventas),
      productos: masVendidos.map(resumenProducto),
      variantes: masVendidos.reduce((a, d) => a + d.todas_las_variantes.length, 0),
      // Venden pero hoy no entran porque falta un talle del medio en todos los colores.
      afuera_por_talle: dentro
        .filter((d) => d.centrales_agotados.length && d.ventas_ranking.pedidos > 0)
        .sort((a, b) => b.ventas_ranking.pedidos - a.ventas_ranking.pedidos)
        .map((d) => ({ id: d.id, name: d.name, pedidos: d.ventas_ranking.pedidos, sin_talles: d.centrales_agotados })),
    },
    interes_ga4: interes.ok,
    productos: dentro,
    fuera: fuera.sort((a, b) => a.motivo.localeCompare(b.motivo)),
    applied: false,
  };

  if (!apply) return resumen;

  if (dentro.length < MINIMO_SEGURIDAD) {
    resumen.aviso = `El conjunto quedaría con ${dentro.length} productos (mínimo de seguridad: ${MINIMO_SEGURIDAD}). No lo apliqué para no dejar los anuncios sin nada que mostrar.`;
    return resumen;
  }

  // 1) Curado: un item por producto. 2) TOP: sólo tier A.
  // Se agrega availability=in stock al filtro: si el talle representativo se
  // agota entre corridas, Meta lo saca solo sin esperar a la próxima pasada.
  const idsCurado = dentro.map((d) => String(d.retailer_id));
  const idsTop = dentro.filter((d) => d.tier === 'A').map((d) => String(d.retailer_id));

  const filtroCurado = { and: [{ availability: { eq: 'in stock' } }, { retailer_id: { is_any: idsCurado } }] };
  const filtroTop = { and: [{ availability: { eq: 'in stock' } }, { retailer_id: { is_any: idsTop } }] };
  // Remarketing: filtro amplio, SIN lista blanca. Tiene que contener el item
  // exacto que la persona miró, así que acá los talles NO se deduplican.
  const filtroRemarketing = { and: [
    { availability: { eq: 'in stock' } },
    { product_type: { i_not_contains: 'mayorista' } },
  ] };

  resumen.sets = {
    curado: { id: await upsertProductSet(catalogId, NOMBRE_CURADO, filtroCurado), items: idsCurado.length },
    top: { id: await upsertProductSet(catalogId, NOMBRE_TOP, filtroTop), items: idsTop.length },
    remarketing: { id: await upsertProductSet(catalogId, NOMBRE_REMARKETING, filtroRemarketing), items: null },
  };

  // Más vendidos: el remarketing de catálogo (con el jean) y el de gente nueva
  // (sin los que tienen anuncio propio). Repiten las dos condiciones del
  // remarketing amplio, así Meta los reconoce como SUBCONJUNTOS de aquel.
  if (masVendidos.length >= MAS_VENDIDOS_MINIMO) {
    const filtroMasVendidos = (lista) => ({ and: [
      ...filtroRemarketing.and,
      { retailer_id: { is_any: lista.flatMap((d) => d.todas_las_variantes.map(String)) } },
    ] });
    resumen.sets.remarketing_curado = {
      id: await upsertProductSet(catalogId, NOMBRE_REMARKETING_CURADO, filtroMasVendidos(masVendidos)),
      productos: masVendidos.length,
      items: resumen.mas_vendidos.variantes,
    };
    resumen.sets.mas_vendidos = {
      id: await upsertProductSet(catalogId, NOMBRE_MAS_VENDIDOS, filtroMasVendidos(masVendidosProspecting)),
      productos: masVendidosProspecting.length,
      items: masVendidosProspecting.reduce((a, d) => a + d.todas_las_variantes.length, 0),
    };
  } else {
    resumen.aviso = `Sólo ${masVendidos.length} productos califican como más vendidos con stock (mínimo ${MAS_VENDIDOS_MINIMO}): dejé los conjuntos de catálogo como estaban.`;
  }
  resumen.applied = true;

  await guardarEstado(filasEstado);
  console.log(`[adSet] Conjunto actualizado: ${idsCurado.length} productos (TOP: ${idsTop.length}), ${resumen.excluidos} excluidos.`);
  return resumen;
}

module.exports = {
  buildAdSet, clasificarTemporada, seasonFit, evaluar, calcularScore, tallesCentralesAgotados,
  MIN_STOCK, MIN_SIZES_IN_STOCK, MIN_COVERAGE, MIN_SEASON_FIT,
  NOMBRE_CURADO, NOMBRE_TOP, NOMBRE_REMARKETING, NOMBRE_REMARKETING_CURADO, NOMBRE_MAS_VENDIDOS,
};
