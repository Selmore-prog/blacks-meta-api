/* =========================================================================
 * PRECIOS A LA VISTA, SIN COMPRA (nov-2026)
 *
 * Pedido del dueño: en algunas categorías mayoristas (la primera, Herramientas
 * con la marca Lusqtoff) mostrar el precio en la tienda para que la empresa
 * consulte por WhatsApp o mail YA SABIENDO cuánto sale, pero sin poder
 * comprarlo online.
 *
 * POR QUÉ EL PRECIO VIVE ACÁ Y NO EN TIENDANUBE
 * En Tiendanube, cargarle precio a un producto lo vuelve comprable (y los
 * mayoristas no controlan stock: quedaba con stock infinito). Un producto SIN
 * precio, en cambio, la plataforma no lo deja comprar por ningún camino (ficha,
 * grilla, buscador, asistente IA, Google Shopping, catálogo de Meta). Así que
 * en Tiendanube el producto sigue sin precio y el precio que se MUESTRA se
 * carga acá; el tema lo pide con GET /api/precio-vista y lo dibuja en la ficha
 * y en las tarjetas (snipplets/precio-vista.tpl del tema).
 *
 * QUÉ SE GUARDA (app_settings, clave `precio_vista`)
 *   categorias: [{ id, minimo, descuentos, iva }]   ← las que el dueño tildó
 *   precios:    { [productId]: { precio, cats, nombre, at } }
 * Una categoría tildada cubre también sus subcategorías. Los precios quedan
 * guardados aunque se destilde la categoría: al volver a tildarla, vuelven.
 * `cats` es la lista de categorías del producto al guardar; sirve para saber
 * si el producto sigue cubierto sin pedirle nada a Tiendanube en cada visita.
 * ========================================================================= */

const { getSetting, setSetting } = require('./settings');
const storeCategories = require('./storeCategories');
const { tnRequest } = require('./tiendanube');

const SETTING_KEY = 'precio_vista';
const IVA = ['incluido', 'mas'];
const PRECIO_MAX = 100000000;
const CACHE_PUBLICO_MS = 60 * 1000;
let cachePublico = { at: 0, data: null };

const texto = (v) => (v && typeof v === 'object' ? (v.es || Object.values(v)[0] || '') : (v || ''));
// "289.999" (punto de miles, como se escribe acá) o un número ya armado.
const entero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : NaN;
  if (!/\d/.test(String(v == null ? '' : v))) return NaN;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Una categoría tildada, con sus opciones. Defaults = la ficha mayorista de siempre. */
function normalizarCategoria(c) {
  const id = Number(c && c.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const minimo = Math.round(Number(c.minimo));
  return {
    id,
    minimo: Number.isFinite(minimo) && minimo >= 1 ? Math.min(minimo, 9999) : 10,
    descuentos: c.descuentos === undefined ? true : !!c.descuentos,
    iva: IVA.includes(c.iva) ? c.iva : 'incluido',
  };
}

function normalizarConfig(raw) {
  const cfg = { categorias: [], precios: {} };
  if (!raw || typeof raw !== 'object') return cfg;
  const vistas = new Set();
  (Array.isArray(raw.categorias) ? raw.categorias : []).forEach((c) => {
    const n = normalizarCategoria(c);
    if (n && !vistas.has(n.id)) { vistas.add(n.id); cfg.categorias.push(n); }
  });
  Object.entries(raw.precios && typeof raw.precios === 'object' ? raw.precios : {}).forEach(([pid, e]) => {
    const precio = Math.round(Number(e && e.precio));
    if (!/^\d+$/.test(pid) || !(precio > 0) || precio > PRECIO_MAX) return;
    cfg.precios[pid] = {
      precio,
      cats: (Array.isArray(e.cats) ? e.cats : []).map(Number).filter((x) => Number.isInteger(x) && x > 0),
      nombre: String(e.nombre || '').slice(0, 200),
      at: String(e.at || '').slice(0, 30),
    };
  });
  return cfg;
}

async function getConfig() {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return normalizarConfig(null);
  try { return normalizarConfig(JSON.parse(raw)); } catch (_) { return normalizarConfig(null); }
}

/**
 * Qué categorías quedan cubiertas: las tildadas y todas sus subcategorías.
 * Devuelve Map<idCategoría, opcionesDeLaTildada>. Si una subcategoría queda
 * debajo de dos tildadas, manda la más cercana (la propia o el padre directo
 * antes que el abuelo), que es la que el dueño configuró pensando en ella.
 */
function categoriasCubiertas(categorias, arbol) {
  const hijos = new Map();
  (arbol || []).forEach((c) => {
    if (!c || !c.padre) return;
    if (!hijos.has(c.padre)) hijos.set(c.padre, []);
    hijos.get(c.padre).push(c.id);
  });
  const cubiertas = new Map();
  const distancia = new Map();
  (categorias || []).forEach((cat) => {
    const cola = [[cat.id, 0]];
    const vistas = new Set();
    while (cola.length) {
      const [id, d] = cola.shift();
      if (vistas.has(id)) continue;
      vistas.add(id);
      if (!distancia.has(id) || d < distancia.get(id)) { distancia.set(id, d); cubiertas.set(id, cat); }
      (hijos.get(id) || []).forEach((h) => cola.push([h, d + 1]));
    }
  });
  return cubiertas;
}

/** Lo que pide la tienda: { [productId]: { p, min, desc, iva } }. */
function mapaPublico(cfg, arbol) {
  const cubiertas = categoriasCubiertas(cfg.categorias, arbol);
  const out = {};
  Object.entries(cfg.precios || {}).forEach(([pid, e]) => {
    if (!(e.precio > 0)) return;
    const cat = (e.cats || []).map((c) => cubiertas.get(c)).find(Boolean);
    if (!cat) return;
    out[pid] = { p: e.precio, min: cat.minimo, desc: cat.descuentos, iva: cat.iva };
  });
  return out;
}

async function publico({ force = false } = {}) {
  if (!force && cachePublico.data && Date.now() - cachePublico.at < CACHE_PUBLICO_MS) return cachePublico.data;
  const [cfg, cats] = await Promise.all([getConfig(), storeCategories.categorias().catch(() => ({ lista: [] }))]);
  const data = { productos: mapaPublico(cfg, cats.lista || []), leido: new Date().toISOString() };
  cachePublico = { at: Date.now(), data };
  return data;
}

/* Precio de lista que tiene el producto EN TIENDANUBE. Mayor a 0 = se compra
   online: el tema lo dibuja con su botón de compra y el precio de acá no
   aplica. Se avisa en el panel. */
function precioEnTiendanube(p) {
  const v = (p.variants || []).map((x) => Number(x.promotional_price) > 0 ? Number(x.promotional_price) : Number(x.price))
    .filter((n) => n > 0);
  return v.length ? Math.min(...v) : 0;
}

/** Los productos de una categoría (sólo los asignados a ella), en vivo. */
async function productosDeCategoria(cid) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    let lote;
    try {
      lote = await tnRequest('GET', `/products?category_id=${cid}&per_page=200&page=${page}`);
    } catch (err) {
      // 404 = página vacía en la API de Tiendanube.
      if (err.status === 404) break;
      throw err;
    }
    if (!Array.isArray(lote) || !lote.length) break;
    out.push(...lote);
    if (lote.length < 200) break;
  }
  return out;
}

/**
 * Los productos de las categorías cubiertas, leídos en vivo de Tiendanube. De a
 * 4 categorías a la vez: una por una, EPP con sus 6 subcategorías tardaba 3,4 s
 * y la rama Mayorista entera pasaba los 20. Cuatro entran holgadas en el límite
 * de la API (ráfaga de 40 pedidos).
 */
async function productosCubiertos(categorias, arbol) {
  const ids = [...categoriasCubiertas(categorias, arbol).keys()];
  const porId = new Map();
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < ids.length) {
      const lote = await productosDeCategoria(ids[siguiente++]);
      lote.forEach((p) => {
        if (porId.has(String(p.id))) return;
        porId.set(String(p.id), {
          id: String(p.id),
          nombre: texto(p.name),
          url: p.canonical_url || '',
          imagen: (p.images && p.images[0] && p.images[0].src) || '',
          cats: (p.categories || []).map((c) => Number(c.id)).filter(Boolean),
          publicado: !!p.published,
          precioTN: precioEnTiendanube(p),
        });
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, trabajador));
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Todo lo que necesita la pestaña del panel. */
async function panel({ force = false } = {}) {
  if (force) storeCategories.invalidate();
  const [cfg, cats] = await Promise.all([getConfig(), storeCategories.categorias({ force })]);
  const arbol = (cats.lista || []).map((c) => ({ id: c.id, nombre: c.nombre, ruta: c.ruta, padre: c.padre, productos: c.productos, minorista: c.minorista }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));
  let productos = [];
  let error = cats.error || null;
  try {
    productos = await productosCubiertos(cfg.categorias, cats.lista || []);
  } catch (err) {
    error = `No se pudieron leer los productos de Tiendanube: ${err.message}`;
  }
  const visibles = mapaPublico(cfg, cats.lista || []);
  return {
    config: { categorias: cfg.categorias },
    arbol,
    productos: productos.map((p) => ({
      ...p,
      precio: cfg.precios[p.id] ? cfg.precios[p.id].precio : null,
      seVe: !!visibles[p.id] && !(p.precioTN > 0),
    })),
    // Precios guardados de productos que hoy no están en ninguna categoría tildada.
    guardadosFuera: Object.keys(cfg.precios).filter((pid) => !productos.some((p) => p.id === pid)).length,
    error,
  };
}

/**
 * Guarda categorías + precios. Los precios sólo se aceptan para productos que
 * hoy están en una categoría tildada (se vuelven a leer de Tiendanube, no se
 * confía en lo que manda el navegador). Un precio vacío borra el guardado.
 */
async function guardar(input) {
  const actual = await getConfig();
  const categorias = normalizarConfig({ categorias: input && input.categorias }).categorias;
  const cats = await storeCategories.categorias();
  const productos = await productosCubiertos(categorias, cats.lista || []);
  const enviados = (input && input.precios && typeof input.precios === 'object') ? input.precios : {};
  const precios = { ...actual.precios };
  const hoy = new Date().toISOString().slice(0, 10);
  const errores = [];
  productos.forEach((p) => {
    if (!Object.prototype.hasOwnProperty.call(enviados, p.id)) {
      // No vino en el formulario: se conserva, pero con las categorías al día.
      if (precios[p.id]) precios[p.id] = { ...precios[p.id], cats: p.cats, nombre: p.nombre };
      return;
    }
    const v = enviados[p.id];
    if (v === null || v === '' || v === undefined) { delete precios[p.id]; return; }
    const n = entero(v);
    if (!(n > 0) || n > PRECIO_MAX) { errores.push(p.nombre); return; }
    precios[p.id] = { precio: n, cats: p.cats, nombre: p.nombre, at: hoy };
  });
  if (errores.length) {
    const err = new Error(`Precio inválido en: ${errores.slice(0, 5).join(', ')}`);
    err.status = 400;
    throw err;
  }
  await setSetting(SETTING_KEY, JSON.stringify({ categorias, precios }));
  cachePublico = { at: 0, data: null };
  return panel();
}

module.exports = {
  getConfig, publico, panel, guardar,
  // Para las pruebas.
  normalizarConfig, categoriasCubiertas, mapaPublico, precioEnTiendanube, entero, productosCubiertos,
};
