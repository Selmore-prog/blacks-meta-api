const pool = require('./db');

/**
 * Criterio único de "publicabilidad" de un producto minorista: si no lo cumple,
 * no protagoniza piezas de producto/promo (puede seguir apareciendo como foto
 * ilustrativa). La idea es no empujar productos que no conviene vender:
 *  - stock total bajo (se agota con 2 ventas y el post queda mintiendo), o
 *  - curva de talles rota (35 unidades pero todas talle 60: mucho stock, venta imposible).
 */
const MIN_STOCK = 5;          // unidades totales mínimas
const MIN_COVERAGE = 0.5;     // al menos la mitad de los talles con stock...
const MIN_SIZES_IN_STOCK = 4; // ...o 4+ talles disponibles (curvas largas)
const REPEAT_WINDOW_DAYS = 14; // no repetir el mismo producto como protagonista en este lapso

/**
 * Condición SQL de elegibilidad retail (misma regla que contentEligibility).
 * size_coverage NULL = catálogo todavía sin backfill: no lo excluimos por eso.
 */
function eligibleSQL(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}image_url IS NOT NULL AND ${p}price > 0 AND ${p}stock >= ${MIN_STOCK}
    AND (${p}size_coverage IS NULL OR ${p}size_coverage >= ${MIN_COVERAGE} OR ${p}sizes_in_stock >= ${MIN_SIZES_IN_STOCK})`;
}

/**
 * Evalúa un producto (fila de products_cache) y devuelve { ok, reason }.
 * reason: por qué NO se muestra como protagonista (en español, para el panel).
 */
function contentEligibility(p) {
  if (!p) return { ok: false, reason: 'no encontrado' };
  if (!p.image_url) return { ok: false, reason: 'sin foto' };
  if (p.stock === null || p.price === null || Number(p.price) <= 0) {
    return { ok: false, reason: 'catálogo mayorista (sin precio o stock infinito)' };
  }
  const stock = Number(p.stock);
  if (stock <= 0) return { ok: false, reason: 'sin stock' };
  if (stock < MIN_STOCK) return { ok: false, reason: `stock bajo (${stock} u.)` };
  const coverage = p.size_coverage === null || p.size_coverage === undefined ? null : Number(p.size_coverage);
  const inStock = Number(p.sizes_in_stock || 0);
  const total = Number(p.sizes_total || 0);
  if (coverage !== null && total > 1 && coverage < MIN_COVERAGE && inStock < MIN_SIZES_IN_STOCK) {
    return { ok: false, reason: `talles incompletos (${inStock} de ${total} con stock)` };
  }
  return { ok: true, reason: null };
}

/**
 * Productos que YA protagonizaron una pieza hace poco (para no repetir).
 * Cuenta borradores/aprobados/publicados; los descartados no bloquean.
 */
async function recentlyFeaturedIds(days = REPEAT_WINDOW_DAYS) {
  const { rows } = await pool.query(
    `SELECT DISTINCT product_id FROM generated_assets
     WHERE product_id IS NOT NULL AND status != 'discarded'
       AND created_at > now() - ($1 || ' days')::interval`,
    [days]
  );
  return rows.map((r) => Number(r.product_id));
}

module.exports = {
  MIN_STOCK,
  MIN_COVERAGE,
  MIN_SIZES_IN_STOCK,
  REPEAT_WINDOW_DAYS,
  eligibleSQL,
  contentEligibility,
  recentlyFeaturedIds,
};
