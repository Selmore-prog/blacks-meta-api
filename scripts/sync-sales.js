const pool = require('../src/db');
const { fetchSalesSince } = require('../src/tiendanube');

/**
 * Calcula las unidades vendidas por producto en los últimos 30 días (Tiendanube)
 * y las guarda en products_cache.sales_30d para priorizar los más vendidos.
 */
async function syncSales() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  console.log(`[sync-sales] Leyendo ventas desde ${since.slice(0, 10)}...`);

  const sales = await fetchSalesSince(since);
  console.log(`[sync-sales] ${sales.size} producto(s) con ventas en el período.`);

  // Reseteamos y volvemos a cargar (así los que dejaron de venderse bajan a 0).
  await pool.query(`UPDATE products_cache SET sales_30d = 0`);
  let updated = 0;
  for (const [pid, units] of sales.entries()) {
    const r = await pool.query(`UPDATE products_cache SET sales_30d = $2 WHERE id = $1`, [pid, units]);
    updated += r.rowCount;
  }

  const { rows } = await pool.query(
    `SELECT name, brand, sales_30d, stock FROM products_cache WHERE sales_30d > 0 ORDER BY sales_30d DESC LIMIT 5`
  );
  console.log('[sync-sales] Top 5 más vendidos:');
  for (const r of rows) console.log(`  · ${r.sales_30d}u — ${r.name}${r.brand ? ` (${r.brand})` : ''} [stock ${r.stock}]`);
  console.log(`[sync-sales] Listo. ${updated} producto(s) actualizados.`);
  return { withSales: sales.size, updated };
}

if (require.main === module) {
  syncSales().then(() => pool.end()).catch((err) => {
    console.error('[sync-sales] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { syncSales };
