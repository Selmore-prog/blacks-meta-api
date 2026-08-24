const pool = require('./db');
const config = require('./config');

/**
 * Sincronizador del catálogo de Meta con el stock REAL de Tiendanube.
 *
 * El problema que corrige: la integración nativa Tiendanube→Meta se atrasa y deja
 * variantes (talles) marcadas "sin stock" en Meta aunque tienen stock real — y al
 * revés. Resultado: productos con stock que no aparecen en los anuncios de catálogo
 * (o talles agotados que sí aparecen). Acá se compara variante por variante
 * (retailer_id del catálogo = id de variante de Tiendanube) y se corrige por API.
 *
 * IMPORTANTE — QUÉ SE TOCA Y QUÉ NO (la duda del dueño, ago-2026):
 * en el catálogo de Meta cada TALLE es un item aparte (retailer_id = id de variante,
 * la url termina en ?variant=NNN). Corregir un talle a "out of stock" saca de los
 * anuncios ESE TALLE, no el producto: los otros talles del mismo producto siguen
 * saliendo. El producto entero sólo deja de mostrarse si TODOS sus talles quedan
 * sin stock — y eso ya no es un problema del sincronizador sino de la realidad
 * (no hay nada para vender). Por eso el resumen viaja agrupado por PRODUCTO, con
 * cuántos talles quedan visibles después de aplicar: el panel lo muestra y marca
 * en rojo el único caso que importa (el producto se queda sin ningún talle).
 *
 * La fuente de verdad es products_cache (que el cron refresca de Tiendanube todos
 * los días a las 06:45 ARG); el cron llama a esto justo después, así el catálogo
 * de Meta queda alineado con el stock del día.
 */

const GRAPH = 'https://graph.facebook.com';

async function fbGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: config.meta.adsAccessToken });
  const res = await fetch(`${GRAPH}/${config.meta.apiVersion}/${path}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Meta ${path}: ${(data.error && data.error.message) || res.status}`);
  }
  return data;
}

async function fbPost(path, body) {
  const res = await fetch(`${GRAPH}/${config.meta.apiVersion}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: config.meta.adsAccessToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Meta POST ${path}: ${(data.error && data.error.message) || res.status}`);
  }
  return data;
}

/** Texto de un campo multi-idioma de Tiendanube ({es:'…'}) o string suelto. */
function pickText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.es || field.pt || Object.values(field)[0] || '';
}

/**
 * Etiqueta legible del talle/variante: los `values` de Tiendanube (ej. ["PAMPERO","1"]
 * -> "PAMPERO / 1"). Sin values cae al SKU, y sin SKU al id (para que la fila del panel
 * nunca quede en blanco).
 */
function variantLabel(v) {
  const vals = (v.values || []).map(pickText).map((s) => String(s).trim()).filter(Boolean);
  if (vals.length) return vals.join(' / ');
  return v.sku ? String(v.sku) : `#${v.id}`;
}

/** Una variante cuenta como disponible si tiene stock o no trackea stock (null). */
function variantHasStock(v) {
  return v.stock === null || v.stock === undefined || Number(v.stock) > 0;
}

/**
 * Mapas del catálogo real de Tiendanube:
 *  - byVariant: id de variante -> { producto, productoId, talle, stockVariante, stockProducto }
 *  - byProduct: id de producto -> { nombre, talles, tallesConStockReal, publicado }
 */
async function tiendanubeCatalogMaps() {
  const { rows } = await pool.query('SELECT id, name, stock, published, permalink, raw FROM products_cache');
  const byVariant = new Map();
  const byProduct = new Map();
  for (const p of rows) {
    let raw = p.raw;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { continue; } }
    const variants = (raw && raw.variants) || [];
    const stockProducto = p.stock === null ? null : Number(p.stock);
    byProduct.set(String(p.id), {
      id: String(p.id),
      nombre: p.name,
      publicado: p.published !== false,
      permalink: p.permalink || null,
      talles: variants.length,
      tallesConStockReal: variants.filter(variantHasStock).length,
    });
    for (const v of variants) {
      byVariant.set(String(v.id), {
        producto: p.name,
        productoId: String(p.id),
        talle: variantLabel(v),
        stockVariante: v.stock === null || v.stock === undefined ? null : Number(v.stock),
        stockProducto,
      });
    }
  }
  return { byVariant, byProduct };
}

/** Mapa id de variante Tiendanube -> { producto, stockVariante, stockProducto }. */
async function tiendanubeVariantMap() {
  return (await tiendanubeCatalogMaps()).byVariant;
}

/** Trae TODOS los items del catálogo (paginado, hasta ~5000). */
async function fetchAllCatalogItems(catalogId, fields = 'retailer_id,name,availability') {
  let items = [];
  let page = await fbGet(`${catalogId}/products`, { fields, limit: 500 });
  for (let i = 0; i < 10; i += 1) {
    items = items.concat(page.data || []);
    const next = page.paging && page.paging.next;
    if (!next) break;
    page = await fetch(next).then((r) => r.json()).catch(() => null);
    if (!page || page.error) break;
  }
  return items;
}

/**
 * Compara el catálogo contra Tiendanube y (opcional) corrige por API.
 * apply=false: sólo informa qué corregiría (dry-run, no toca nada).
 * apply=true: manda las correcciones en lote (items_batch). Meta las procesa
 * asincrónicamente (tarda unos minutos en verse).
 * only: lista de retailer_id a corregir. Sin `only` se corrige TODO lo desalineado
 *   (es lo que hace el cron); con `only` se aplica sólo lo que el dueño tildó en el
 *   panel — el resto del catálogo queda exactamente como está.
 */
async function syncCatalogAvailability({ apply = false, only = null } = {}) {
  const catalogId = config.meta.catalogId;
  if (!catalogId) throw new Error('Falta META_CATALOG_ID (el ID del catálogo de Meta a sincronizar).');
  if (!config.meta.adsAccessToken) throw new Error('Falta el token de Meta con permiso catalog_management.');

  const [items, maps] = await Promise.all([fetchAllCatalogItems(catalogId), tiendanubeCatalogMaps()]);
  const { byVariant, byProduct } = maps;

  // Estado del catálogo agrupado por PRODUCTO de Tiendanube: cuántos items (talles)
  // tiene en Meta y cuántos están hoy visibles. Es lo que permite decir, para cada
  // corrección, si el producto sigue apareciendo en los anuncios o se queda sin nada.
  const productos = new Map();
  const fixes = [];
  let matched = 0;
  for (const item of items) {
    const tn = byVariant.get(String(item.retailer_id));
    if (!tn) continue; // items que ya no existen en Tiendanube: no los tocamos
    matched += 1;

    let prod = productos.get(tn.productoId);
    if (!prod) {
      const info = byProduct.get(tn.productoId) || {};
      prod = {
        producto_id: tn.productoId,
        producto: tn.producto,
        permalink: info.permalink || null,
        talles_en_catalogo: 0,
        visibles_ahora: 0,
        talles_con_stock_real: info.tallesConStockReal === undefined ? null : info.tallesConStockReal,
        talles_en_tiendanube: info.talles === undefined ? null : info.talles,
        cambios: [],
      };
      productos.set(tn.productoId, prod);
    }
    prod.talles_en_catalogo += 1;
    const metaInStock = item.availability === 'in stock';
    if (metaInStock) prod.visibles_ahora += 1;

    // stock null = sin tracking en Tiendanube (se vende siempre) -> disponible.
    const tnInStock = tn.stockVariante === null || tn.stockVariante > 0;
    if (tnInStock !== metaInStock) {
      const fix = {
        retailer_id: String(item.retailer_id),
        producto: item.name,
        producto_id: tn.productoId,
        talle: tn.talle,
        en_meta: item.availability,
        stock_real: tn.stockVariante === null ? 'sin tracking' : tn.stockVariante,
        corregir_a: tnInStock ? 'in stock' : 'out of stock',
      };
      fixes.push(fix);
      prod.cambios.push(fix);
    }
  }

  // Sólo los productos que tienen algo para corregir, y con el saldo del producto:
  // cuántos talles quedarían visibles si se aplican TODAS sus correcciones. El panel
  // recalcula esto en vivo según lo que el dueño tilda, pero el número base viaja acá
  // para que el cron y cualquier otro consumidor puedan avisar igual.
  const afectados = [...productos.values()].filter((p) => p.cambios.length).map((p) => {
    const delta = p.cambios.reduce((acc, c) => acc + (c.corregir_a === 'in stock' ? 1 : -1), 0);
    const visiblesDespues = p.visibles_ahora + delta;
    return {
      ...p,
      visibles_despues: visiblesDespues,
      // El ÚNICO caso en que el producto deja de mostrarse entero en los anuncios.
      queda_sin_talles: visiblesDespues <= 0,
    };
  }).sort((a, b) => Number(b.queda_sin_talles) - Number(a.queda_sin_talles) || b.cambios.length - a.cambios.length);

  const toInStock = fixes.filter((f) => f.corregir_a === 'in stock');
  const summary = {
    catalogId,
    items_revisados: items.length,
    matchean_con_tiendanube: matched,
    correcciones_necesarias: fixes.length,
    // Talles con stock real que Meta esconde (el caso "chino azul 38"): lo grave.
    a_poner_en_stock: toInStock.length,
    a_poner_sin_stock: fixes.length - toInStock.length,
    productos_afectados: afectados.length,
    // Productos que, si se aplica TODO, se quedan sin ningún talle visible. Es la
    // única consecuencia a nivel producto — el resto pierde talles, no visibilidad.
    productos_que_desaparecen: afectados.filter((p) => p.queda_sin_talles).length,
    // Lista COMPLETA (antes se mandaban sólo 15 "ejemplos" pero se aplicaban todas:
    // el panel mostraba menos de lo que el botón corregía).
    correcciones: fixes,
    productos: afectados,
    ejemplos: fixes.slice(0, 15), // compat con consumidores viejos
    applied: false,
    aplicadas: 0,
  };

  if (apply) {
    // `only` = selección del panel. Se filtra contra las correcciones REALES: un id
    // que ya no está desalineado (porque el stock cambió entre el chequeo y el
    // "Corregir") simplemente no se manda.
    const wanted = Array.isArray(only) && only.length ? new Set(only.map(String)) : null;
    const toApply = wanted ? fixes.filter((f) => wanted.has(f.retailer_id)) : fixes;

    if (toApply.length) {
      // items_batch: hasta 5000 updates por llamada; identifica cada item por
      // data.id = retailer_id. UPDATE sólo pisa los campos enviados (availability).
      const handles = [];
      for (let i = 0; i < toApply.length; i += 4500) {
        const batch = toApply.slice(i, i + 4500).map((f) => ({
          method: 'UPDATE',
          data: { id: f.retailer_id, availability: f.corregir_a },
        }));
        const r = await fbPost(`${catalogId}/items_batch`, { item_type: 'PRODUCT_ITEM', requests: batch });
        handles.push(...(r.handles || []));
      }
      summary.handles = handles;
      const enStock = toApply.filter((f) => f.corregir_a === 'in stock').length;
      console.log(`[catalogSync] ${toApply.length} correcciones enviadas a Meta (${enStock} a "in stock")${wanted ? ' [selección manual]' : ''}.`);
    }
    summary.applied = true;
    summary.aplicadas = toApply.length;
    summary.ignoradas = fixes.length - toApply.length;
  }

  return summary;
}

module.exports = {
  syncCatalogAvailability,
  tiendanubeVariantMap,
  tiendanubeCatalogMaps,
  fbGet,
  fbPost,
  fetchAllCatalogItems,
};
