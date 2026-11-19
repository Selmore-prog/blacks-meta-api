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
 *
 * EL PRECIO TAMBIÉN SE PUEDE CARGAR EN TIENDANUBE (19-nov-2026)
 * Pedido del dueño: a veces es más fácil cambiar precios desde Tiendanube. El
 * campo "Precio" de allá NO sirve (lo vuelve comprable), así que se usa un
 * CAMPO PERSONALIZADO de producto llamado "Precio a la vista" (Tiendanube →
 * producto → Campos personalizados; la tienda ya usa "Canal" y "Entrega").
 * Si un producto de una categoría tildada tiene ese campo cargado, vale ése;
 * si no, vale el de acá. El "Precio" de Tiendanube sigue vacío: nada lo puede
 * comprar. Los valores se leen con UN pedido (`/owners` devuelve todos los
 * productos con valor) cada minuto, sin hacer esperar a la tienda.
 * ========================================================================= */

const { getSetting, setSetting } = require('./settings');
const storeCategories = require('./storeCategories');
const { tnRequest } = require('./tiendanube');

const SETTING_KEY = 'precio_vista';
const IVA = ['incluido', 'mas'];
const PRECIO_MAX = 100000000;
const CACHE_PUBLICO_MS = 60 * 1000;
let cachePublico = { at: 0, data: null };

// Campo personalizado de Tiendanube (ver cabecera).
const CAMPO_NOMBRE = 'Precio a la vista';
const CAMPO_DESCRIPCION = 'Precio que se muestra en la tienda sin poder comprar (Precios a la vista del motor). Dejá vacío el Precio del producto.';
// Menos de esto no es un precio: es "50.000" leído como 50 con decimales.
const PRECIO_MIN_CAMPO = 100;
const TN_VALORES_MS = 60 * 1000;       // cada cuánto se releen los valores
const TN_CAMPO_MS = 10 * 60 * 1000;    // la definición del campo (si existe)
const TN_CATS_MS = 10 * 60 * 1000;     // en qué categorías está cada producto
const TN_ESPERA_MS = 3500;             // lo más que espera la tienda en frío
const tnCache = {
  at: 0, claveLeida: null, enCurso: null, error: null,
  campo: undefined, campoAt: 0,
  valores: {}, raros: {},
  cats: {}, catsClave: null, catsAt: 0,
};

const texto = (v) => (v && typeof v === 'object' ? (v.es || Object.values(v)[0] || '') : (v || ''));
// "289.999" (punto de miles, como se escribe acá) o un número ya armado.
const entero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : NaN;
  if (!/\d/.test(String(v == null ? '' : v))) return NaN;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/* El valor del campo de Tiendanube, como lo haya escrito la persona:
   "50.000", "50000", "$ 50.000,00", "50000.00" o un número. 0 = no hay precio. */
function precioDeCampo(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 && v <= PRECIO_MAX ? Math.round(v) : 0;
  const crudo = String(v).trim();
  if (/-\s*\d/.test(crudo)) return 0;
  let s = crudo.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');   // 50.000,50
  else if (/\.\d{1,2}$/.test(s)) s = s.replace(/\.(?=.*\.)/g, '');   // 50000.00
  else s = s.replace(/\./g, '');                                       // 50.000
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n > 0 && n <= PRECIO_MAX ? n : 0;
}

const nombreNormal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
const esCampoPrecio = (f) => !!f && f.owner_resource === 'product' && nombreNormal(f.name).startsWith(nombreNormal(CAMPO_NOMBRE));

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

/**
 * Lo que pide la tienda: { [productId]: { p, min, desc, iva } }.
 * `tn` (opcional) = lo leído del campo de Tiendanube: { valores: {pid: precio},
 * cats: {pid: [categorías]} }. Un valor de Tiendanube le gana al del motor.
 */
function mapaPublico(cfg, arbol, tn) {
  const cubiertas = categoriasCubiertas(cfg.categorias, arbol);
  const opciones = (cats) => (cats || []).map((c) => cubiertas.get(Number(c))).find(Boolean);
  const out = {};
  Object.entries(cfg.precios || {}).forEach(([pid, e]) => {
    if (!(e.precio > 0)) return;
    const cat = opciones(e.cats);
    if (!cat) return;
    out[pid] = { p: e.precio, min: cat.minimo, desc: cat.descuentos, iva: cat.iva };
  });
  const valores = (tn && tn.valores) || {};
  const catsTN = (tn && tn.cats) || {};
  Object.entries(valores).forEach(([pid, precio]) => {
    if (!(precio > 0)) return;
    const cat = opciones(catsTN[pid] || (cfg.precios[pid] && cfg.precios[pid].cats));
    if (!cat) return;
    out[pid] = { p: precio, min: cat.minimo, desc: cat.descuentos, iva: cat.iva };
  });
  return out;
}

/* ------------------- Campo "Precio a la vista" de Tiendanube ------------------- */

async function buscarCampo(force = false) {
  // Sin campo se vuelve a mirar al minuto (puede que lo estén creando).
  const vigencia = tnCache.campo ? TN_CAMPO_MS : TN_VALORES_MS;
  if (!force && tnCache.campo !== undefined && Date.now() - tnCache.campoAt < vigencia) return tnCache.campo;
  const lista = await tnRequest('GET', '/products/custom-fields');
  tnCache.campo = (Array.isArray(lista) ? lista : []).find(esCampoPrecio) || null;
  tnCache.campoAt = Date.now();
  return tnCache.campo;
}

/** { valores: {pid: precio}, raros: {pid: 'lo que escribieron'} } del campo. */
async function valoresDelCampo(campo) {
  let o;
  try {
    o = await tnRequest('GET', `/products/custom-fields/${encodeURIComponent(campo.id)}/owners`);
  } catch (err) {
    // Lo borraron en Tiendanube: se vuelve a buscar en la próxima vuelta.
    if (err.status === 404) { tnCache.campo = undefined; return { valores: {}, raros: {} }; }
    throw err;
  }
  const valores = {};
  const raros = {};
  (o && Array.isArray(o.products) ? o.products : []).forEach((x) => {
    if (!x || !x.id || x.value == null || x.value === '') return;
    const n = precioDeCampo(x.value);
    if (n >= PRECIO_MIN_CAMPO) valores[String(x.id)] = n;
    else raros[String(x.id)] = String(x.value).slice(0, 40);
  });
  return { valores, raros };
}

const claveDe = (categorias) => (categorias || []).map((c) => c.id).sort((a, b) => a - b).join(',');

/* Lee el campo y, si hay valores, en qué categorías está cada producto (eso
   cambia poco: cada 10 min, o al tildar/destildar una categoría). */
async function leerTiendanube(categorias, arbol, { forzarCampo = false } = {}) {
  const clave = claveDe(categorias);
  const campo = await buscarCampo(forzarCampo);
  const { valores, raros } = campo ? await valoresDelCampo(campo) : { valores: {}, raros: {} };
  const hay = Object.keys(valores).length > 0;
  if (hay && categorias.length && (tnCache.catsClave !== clave || Date.now() - tnCache.catsAt > TN_CATS_MS)) {
    const prods = await productosCubiertos(categorias, arbol);
    tnCache.cats = {};
    prods.forEach((p) => { tnCache.cats[p.id] = p.cats; });
    tnCache.catsClave = clave;
    tnCache.catsAt = Date.now();
  }
  Object.assign(tnCache, { at: Date.now(), claveLeida: clave, valores, raros, error: null });
  return tnCache;
}

/**
 * Lo leído de Tiendanube, sin hacer esperar: si hay algo leído para las mismas
 * categorías lo devuelve y, si pasó el minuto, relee por detrás. Espera sólo
 * la primera vez, al cambiar las categorías o con `force`. Si Tiendanube
 * falla, quedan los últimos valores buenos.
 */
async function datosTiendanube(categorias, arbol, { force = false, forzarCampo = false } = {}) {
  const misma = tnCache.at > 0 && tnCache.claveLeida === claveDe(categorias);
  if (!force && misma && Date.now() - tnCache.at < TN_VALORES_MS) return tnCache;
  if (!tnCache.enCurso) {
    tnCache.enCurso = leerTiendanube(categorias, arbol, { forzarCampo })
      .catch((err) => {
        console.warn('[precio-vista] campo de Tiendanube:', err.message);
        Object.assign(tnCache, { at: Date.now(), claveLeida: claveDe(categorias), error: err.message });
        return tnCache;
      })
      .finally(() => {
        tnCache.enCurso = null;
        // Lo nuevo de Tiendanube se ve en la próxima visita, no un minuto después.
        cachePublico = { at: 0, data: null };
      });
  }
  if (!force && misma) return tnCache;
  return tnCache.enCurso;
}

const conTope = (promesa, ms) => Promise.race([promesa, new Promise((listo) => setTimeout(() => listo(null), ms))]);

async function publico({ force = false } = {}) {
  if (!force && cachePublico.data && Date.now() - cachePublico.at < CACHE_PUBLICO_MS) return cachePublico.data;
  const [cfg, cats] = await Promise.all([getConfig(), storeCategories.categorias().catch(() => ({ lista: [] }))]);
  const arbol = cats.lista || [];
  // Sin categorías tildadas el campo no importa: no se le pide nada a Tiendanube.
  const tn = cfg.categorias.length
    ? (await conTope(datosTiendanube(cfg.categorias, arbol), TN_ESPERA_MS)) || tnCache
    : null;
  const data = { productos: mapaPublico(cfg, arbol, tn), leido: new Date().toISOString() };
  // Si Tiendanube no llegó a contestar en frío, la próxima visita vuelve a mirar.
  cachePublico = { at: tn && !tn.at ? 0 : Date.now(), data };
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
    // Ya están leídos: le sirven al campo de Tiendanube sin pedirlos otra vez.
    tnCache.cats = {};
    productos.forEach((p) => { tnCache.cats[p.id] = p.cats; });
    tnCache.catsClave = claveDe(cfg.categorias);
    tnCache.catsAt = Date.now();
  } catch (err) {
    error = `No se pudieron leer los productos de Tiendanube: ${err.message}`;
  }
  // El panel siempre lee el campo al momento (y su definición, con Refrescar).
  const tn = await datosTiendanube(cfg.categorias, cats.lista || [], { force: true, forzarCampo: force });
  const visibles = mapaPublico(cfg, cats.lista || [], tn);
  const enCategorias = new Set(productos.map((p) => p.id));
  return {
    config: { categorias: cfg.categorias },
    arbol,
    campo: tn.campo ? { id: tn.campo.id, nombre: tn.campo.name, tipo: tn.campo.value_type, creadoPor: tn.campo.created_by || '' } : null,
    campoNombre: CAMPO_NOMBRE,
    campoError: tn.error || null,
    productos: productos.map((p) => ({
      ...p,
      precio: cfg.precios[p.id] ? cfg.precios[p.id].precio : null,
      precioCampo: tn.valores[p.id] || null,
      campoRaro: tn.raros[p.id] || null,
      seVe: !!visibles[p.id] && !(p.precioTN > 0),
    })),
    // Precios guardados de productos que hoy no están en ninguna categoría tildada.
    guardadosFuera: Object.keys(cfg.precios).filter((pid) => !enCategorias.has(pid)).length,
    // Productos con el campo cargado en Tiendanube que no están en una categoría tildada.
    campoFuera: Object.keys(tn.valores).filter((pid) => !enCategorias.has(pid)).length,
    error,
  };
}

/** Crea el campo "Precio a la vista" en Tiendanube (botón del panel). */
async function crearCampo() {
  if (await buscarCampo(true)) return panel();
  // Texto y no número: así "50.000" no se guarda como 50 con decimales.
  await tnRequest('POST', '/products/custom-fields', {
    name: CAMPO_NOMBRE,
    description: CAMPO_DESCRIPCION,
    value_type: 'text',
    read_only: false,
    values: [],
  });
  tnCache.campo = undefined;
  return panel({ force: true });
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
  getConfig, publico, panel, guardar, crearCampo,
  // Para las pruebas.
  normalizarConfig, categoriasCubiertas, mapaPublico, precioEnTiendanube, entero, productosCubiertos,
  precioDeCampo, esCampoPrecio, CAMPO_NOMBRE,
};
