const pool = require('../src/db');
const { fetchAllProducts } = require('../src/tiendanube');

/**
 * Trae TODO el catálogo de Tiendanube y lo guarda en products_cache (upsert).
 * La ejecuta el cron diario (GitHub Actions, 06:45 ARG) y también el botón
 * "Sincronizar con Tiendanube" del panel (server.js, para productos nuevos que
 * no quieras esperar hasta la próxima corrida del cron).
 */
async function syncProducts() {
  console.log('[sync] Trayendo catalogo de Tiendanube...');
  const products = await fetchAllProducts();
  console.log(`[sync] ${products.length} productos encontrados. Guardando...`);

  for (const p of products) {
    await pool.query(
      `INSERT INTO products_cache (id, name, brand, category, price, promo_price, stock, sizes_total, sizes_in_stock, size_coverage, image_url, images, description, permalink, raw, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         promo_price = EXCLUDED.promo_price,
         stock = EXCLUDED.stock,
         sizes_total = EXCLUDED.sizes_total,
         sizes_in_stock = EXCLUDED.sizes_in_stock,
         size_coverage = EXCLUDED.size_coverage,
         image_url = EXCLUDED.image_url,
         images = EXCLUDED.images,
         description = EXCLUDED.description,
         permalink = EXCLUDED.permalink,
         raw = EXCLUDED.raw,
         synced_at = now()`,
      [p.id, p.name, p.brand, p.category, p.price, p.promo_price, p.stock, p.sizes_total, p.sizes_in_stock, p.size_coverage, p.image_url, JSON.stringify(p.images || []), p.description || null, p.permalink, p.raw]
    );
  }

  console.log('[sync] Listo.');
  return { count: products.length };
}

if (require.main === module) {
  syncProducts()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[sync] Error:', err);
      process.exit(1);
    });
}

module.exports = { syncProducts };
