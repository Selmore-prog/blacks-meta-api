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

/** Mapa id de variante Tiendanube -> { producto, stockVariante, stockProducto }. */
async function tiendanubeVariantMap() {
  const { rows } = await pool.query('SELECT id, name, stock, raw FROM products_cache');
  const byVariant = new Map();
  for (const p of rows) {
    let raw = p.raw;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { continue; } }
    for (const v of (raw && raw.variants) || []) {
      byVariant.set(String(v.id), {
        producto: p.name,
        stockVariante: v.stock === null || v.stock === undefined ? null : Number(v.stock),
        stockProducto: p.stock === null ? null : Number(p.stock),
      });
    }
  }
  return byVariant;
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
 */
async function syncCatalogAvailability({ apply = false } = {}) {
  const catalogId = config.meta.catalogId;
  if (!catalogId) throw new Error('Falta META_CATALOG_ID (el ID del catálogo de Meta a sincronizar).');
  if (!config.meta.adsAccessToken) throw new Error('Falta el token de Meta con permiso catalog_management.');

  const [items, byVariant] = await Promise.all([fetchAllCatalogItems(catalogId), tiendanubeVariantMap()]);

  const fixes = [];
  let matched = 0;
  for (const item of items) {
    const tn = byVariant.get(String(item.retailer_id));
    if (!tn) continue; // items que ya no existen en Tiendanube: no los tocamos
    matched += 1;
    // stock null = sin tracking en Tiendanube (se vende siempre) -> disponible.
    const tnInStock = tn.stockVariante === null || tn.stockVariante > 0;
    const metaInStock = item.availability === 'in stock';
    if (tnInStock !== metaInStock) {
      fixes.push({
        retailer_id: String(item.retailer_id),
        producto: item.name,
        en_meta: item.availability,
        stock_real: tn.stockVariante === null ? 'sin tracking' : tn.stockVariante,
        corregir_a: tnInStock ? 'in stock' : 'out of stock',
      });
    }
  }

  const toInStock = fixes.filter((f) => f.corregir_a === 'in stock');
  const summary = {
    catalogId,
    items_revisados: items.length,
    matchean_con_tiendanube: matched,
    correcciones_necesarias: fixes.length,
    // Talles con stock real que Meta esconde (el caso "chino azul 38"): lo grave.
    a_poner_en_stock: toInStock.length,
    a_poner_sin_stock: fixes.length - toInStock.length,
    ejemplos: fixes.slice(0, 15),
    applied: false,
  };

  if (apply && fixes.length) {
    // items_batch: hasta 5000 updates por llamada; identifica cada item por
    // data.id = retailer_id. UPDATE sólo pisa los campos enviados (availability).
    const handles = [];
    for (let i = 0; i < fixes.length; i += 4500) {
      const batch = fixes.slice(i, i + 4500).map((f) => ({
        method: 'UPDATE',
        data: { id: f.retailer_id, availability: f.corregir_a },
      }));
      const r = await fbPost(`${catalogId}/items_batch`, { item_type: 'PRODUCT_ITEM', requests: batch });
      handles.push(...(r.handles || []));
    }
    summary.applied = true;
    summary.handles = handles;
    console.log(`[catalogSync] ${fixes.length} correcciones enviadas a Meta (${toInStock.length} a "in stock").`);
  }

  return summary;
}

module.exports = { syncCatalogAvailability, tiendanubeVariantMap, fbGet, fetchAllCatalogItems };
