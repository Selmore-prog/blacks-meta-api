/* =========================================================================
 * CATEGORÍAS REALES DE LA TIENDA
 *
 * `products_cache.category` guarda UNA sola categoría por producto (la primera),
 * y por eso vista desde ahí la tienda parece tener tres: Mayorista, Shop Online
 * e Invierno 26. La realidad son ~50 categorías anidadas — por prenda, por
 * marca, por rubro — y están todas en la API de Tiendanube.
 *
 * Importa para dos cosas:
 *   1. Los botones de los bloques tienen que apuntar a URLs que EXISTEN. Sin
 *      esto, la IA escribe "/obra" porque suena bien y el cliente cae en un 404.
 *   2. Para recomendar qué empujar hay que ver ventas y stock por categoría de
 *      verdad, no por la etiqueta suelta que quedó en el cache.
 * ========================================================================= */

const pool = require('./db');
const { tnRequest } = require('./tiendanube');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache = { at: 0, data: null };

const texto = (v) => (v && typeof v === 'object' ? (v.es || Object.values(v)[0] || '') : (v || ''));

/**
 * Árbol de categorías + el dato de negocio de cada una. Nunca tira: si la API
 * de Tiendanube no contesta (token vencido, caída), devuelve lista vacía y el
 * resto del plan sigue andando con lo que hay en el cache.
 */
async function categorias({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  let crudas = [];
  let error = null;
  try {
    crudas = await tnRequest('GET', '/categories?per_page=200');
  } catch (err) {
    error = err.message;
  }

  // Ventas, stock y cantidad por categoría, sacados de la lista completa que
  // cada producto guarda en `raw` (un producto está en varias categorías).
  const { rows } = await pool.query(`
    SELECT (c->>'id')::bigint AS id,
           count(*)::int AS productos,
           sum(COALESCE(p.stock, 0))::int AS stock,
           sum(COALESCE(p.sales_30d, 0))::int AS ventas_30d,
           count(*) FILTER (WHERE p.price IS NOT NULL AND p.price > 0)::int AS con_precio
      FROM products_cache p, jsonb_array_elements(COALESCE(p.raw->'categories', '[]'::jsonb)) c
     GROUP BY 1
  `).catch(() => ({ rows: [] }));
  const datos = new Map(rows.map((r) => [Number(r.id), r]));

  const lista = crudas.map((c) => {
    const d = datos.get(Number(c.id)) || { productos: 0, stock: 0, ventas_30d: 0, con_precio: 0 };
    return {
      id: Number(c.id),
      nombre: texto(c.name),
      url: `/${texto(c.handle)}`,
      padre: c.parent ? Number(c.parent) : null,
      subcategorias: (c.subcategories || []).length,
      productos: d.productos,
      stock: d.stock,
      ventas_30d: d.ventas_30d,
      // Una categoría donde casi nada tiene precio es catálogo mayorista: el
      // precio se consulta, no se compra en línea.
      minorista: d.productos > 0 && d.con_precio >= d.productos / 2,
    };
  });

  // Nombre completo con el padre adelante, para que "Pantalones" no se confunda
  // con "Pantalones" de otra rama.
  const porId = new Map(lista.map((c) => [c.id, c]));
  lista.forEach((c) => {
    const p = c.padre ? porId.get(c.padre) : null;
    c.ruta = p ? `${p.nombre} › ${c.nombre}` : c.nombre;
  });

  const data = {
    disponible: !error,
    error,
    total: lista.length,
    lista,
    // Las que sirven para mandar tráfico: con productos y con precio.
    vendibles: lista.filter((c) => c.minorista && c.productos >= 3)
      .sort((a, b) => b.ventas_30d - a.ventas_30d || b.productos - a.productos),
    mayoristas: lista.filter((c) => !c.minorista && c.productos >= 3)
      .sort((a, b) => b.productos - a.productos),
    leido: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Lista corta y limpia para pasarle a la IA como URLs permitidas. */
async function urlsPermitidas() {
  const c = await categorias();
  const fijas = [
    { url: '/mayorista', nombre: 'Catálogo mayorista' },
    { url: '/eshop', nombre: 'Toda la tienda' },
    { url: '/quienes-somos', nombre: 'Quiénes somos' },
    { url: '/contacto', nombre: 'Contacto' },
  ];
  const cats = c.vendibles.slice(0, 24).map((x) => ({ url: x.url, nombre: x.ruta, productos: x.productos, ventas_30d: x.ventas_30d }));
  return [...fijas, ...cats];
}

function invalidate() { cache = { at: 0, data: null }; }

module.exports = { categorias, urlsPermitidas, invalidate };
