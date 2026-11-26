/* =========================================================================
 * PÁGINA DE LA OFERTA FLASH — una categoría de Tiendanube con sus productos
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 26-nov-2026, Black Friday)
 * La sección de ofertas del home muestra los productos en una pista que se
 * desliza; faltaba una página con TODOS los de la oferta para mandar gente
 * desde un banner o el botón "Ver todas".
 *
 * POR QUÉ UNA CATEGORÍA Y NO UNA PÁGINA ARMADA POR EL MOTOR
 * Es una página nativa de la tienda: grilla, filtros, orden y el precio de
 * oferta tachado de cada producto los dibuja Tiendanube, igual que en el resto
 * del sitio. El motor sólo decide qué productos van.
 *
 * CÓMO
 *  · La categoría va VISIBLE mientras dura la oferta: oculta, Tiendanube
 *    contesta "no encontrada" en su dirección (probado el 26-nov; con el modo
 *    "oculta del menú" del administrador pasa lo mismo, y la API no deja
 *    ponerlo). El menú de la tienda es propio y no la suma; sí aparece como
 *    una categoría más en la lista de /productos/. Al terminar se oculta.
 *  · Cada cambio a la categoría manda el NOMBRE: un PUT sin nombre lo deja
 *    vacío (pasó el 26-nov al cambiarle la dirección).
 *  · Se reusa la misma mientras siga existiendo (queda anotada en la oferta).
 *  · sincronizar(): los productos de la oferta adentro y nada más.
 *  · vaciar(): saca todos y la oculta (al terminar la oferta). Queda para la
 *    próxima.
 *  · A un producto se le SUMA o SACA esta categoría y se le dejan las suyas.
 * ========================================================================= */

const { tnRequest } = require('./tiendanube');

const POR_PAGINA = 200;

/** "BLACK FRIDAY" → "Black Friday". Lo escrito a mano en el panel gana. */
function nombreDe(cfg) {
  const elegido = String(cfg.pagina_nombre || '').trim();
  if (elegido) return elegido.slice(0, 60);
  const t = String(cfg.title || '').trim() || 'Ofertas';
  return (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, l) => a + l.toUpperCase()) : t).slice(0, 60);
}

const handleDe = (c) => (c && c.handle && (c.handle.es || Object.values(c.handle)[0])) || null;
const idsDe = (p) => (Array.isArray(p.categories) ? p.categories.map((c) => Number(c.id || c)) : []);

const nombreCat = (c, respaldo) => (c && c.name && String(c.name.es || '').trim()) || respaldo;
const cambiarCategoria = (id, nombre, cambios) => tnRequest('PUT', `/categories/${id}`, { name: { es: nombre }, ...cambios });

async function asegurar(cfg) {
  const info = cfg.pagina_info || {};
  const nombre = nombreDe(cfg);
  let c = null;
  if (info.category_id) {
    try {
      c = await tnRequest('GET', `/categories/${info.category_id}`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  let nueva = false;
  if (!c || !c.id) {
    const todas = await tnRequest('GET', `/categories?per_page=${POR_PAGINA}&fields=id,name,handle,parent,visibility`) || [];
    c = todas.find((x) => !Number(x.parent) && String((x.name && x.name.es) || '').trim().toLowerCase() === nombre.toLowerCase()) || null;
    if (!c) { c = await tnRequest('POST', '/categories', { name: { es: nombre }, visibility: 'visible' }); nueva = true; }
  }
  const suNombre = nombreCat(c, info.nombre || nombre);
  // Tiendanube le agrega un sufijo al azar a la dirección de una categoría nueva
  // (black-friday-2icfq, visto el 26-nov) aunque la limpia esté libre: se le
  // pide la limpia y, si no se puede, queda la que dio.
  const limpia = suNombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const arreglos = {};
  if (c.visibility !== 'visible') arreglos.visibility = 'visible';
  if (nueva && limpia && handleDe(c) !== limpia) arreglos.handle = { es: limpia };
  if (!nombreCat(c, '')) arreglos.name = { es: suNombre };
  if (Object.keys(arreglos).length) {
    const otra = await cambiarCategoria(c.id, suNombre, arreglos).catch(() => null);
    if (otra && otra.id) c = otra;
  }
  return { category_id: Number(c.id), handle: handleDe(c), nombre: nombreCat(c, suNombre) };
}

/** Productos que hoy están en la categoría. Tiendanube contesta 404 cuando no hay ninguno. */
async function productosEn(categoryId) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    let lote;
    try {
      lote = await tnRequest('GET', `/products?category_id=${categoryId}&per_page=${POR_PAGINA}&page=${page}&fields=id,categories`);
    } catch (err) {
      if (err.status === 404) break;
      throw err;
    }
    if (!Array.isArray(lote) || !lote.length) break;
    out.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }
  return out;
}

const ponerCategorias = (productId, ids) => tnRequest('PUT', `/products/${productId}`, { categories: [...new Set(ids)] });

/** Deja en la categoría exactamente los productos de la oferta. */
async function sincronizar(cfg) {
  const info = await asegurar(cfg);
  const quiero = new Set((cfg.items || []).map((i) => Number(i.id)));
  const actuales = await productosEn(info.category_id);
  const yaEstan = new Set(actuales.map((p) => Number(p.id)));
  const errores = [];
  let sumados = 0;
  let sacados = 0;

  for (const p of actuales) {
    if (quiero.has(Number(p.id))) continue;
    try {
      await ponerCategorias(p.id, idsDe(p).filter((id) => id !== info.category_id));
      sacados += 1;
    } catch (err) { errores.push(`Sacar ${p.id}: ${err.message}`); }
  }
  for (const id of quiero) {
    if (yaEstan.has(id)) continue;
    try {
      const p = await tnRequest('GET', `/products/${id}?fields=id,categories`);
      const ids = idsDe(p);
      if (!ids.includes(info.category_id)) {
        await ponerCategorias(id, [...ids, info.category_id]);
        sumados += 1;
      }
    } catch (err) { errores.push(`Sumar ${id}: ${err.message}`); }
  }
  return { ...info, url: info.handle ? `/${info.handle}/` : null, sumados, sacados, errores };
}

/** Saca todos los productos (al terminar la oferta). */
async function vaciar(info) {
  if (!info || !info.category_id) return { sacados: 0, errores: [] };
  const errores = [];
  let sacados = 0;
  for (const p of await productosEn(info.category_id)) {
    try {
      await ponerCategorias(p.id, idsDe(p).filter((id) => id !== Number(info.category_id)));
      sacados += 1;
    } catch (err) { errores.push(`Sacar ${p.id}: ${err.message}`); }
  }
  // Vacía no tiene que quedar en la lista de categorías de /productos/.
  try { await cambiarCategoria(info.category_id, info.nombre || 'Ofertas', { visibility: 'hidden' }); }
  catch (err) { if (err.status !== 404) errores.push(`Ocultar la página: ${err.message}`); }
  return { sacados, errores };
}

module.exports = { nombreDe, sincronizar, vaciar };
