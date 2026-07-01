const pool = require('../src/db');
const { fetchAllProducts } = require('../src/tiendanube');

async function syncProducts() {
  console.log('[sync] Trayendo catalogo de Tiendanube...');
  const products = await fetchAllProducts();
  console.log(`[sync] ${products.length} productos encontrados. Guardando...`);

  for (const p of products) {
    await pool.query(
      `INSERT INTO products_cache (id, name, brand, category, price, promo_price, stock, image_url, images, permalink, raw, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         promo_price = EXCLUDED.promo_price,
         stock = EXCLUDED.stock,
         image_url = EXCLUDED.image_url,
         images = EXCLUDED.images,
         permalink = EXCLUDED.permalink,
         raw = EXCLUDED.raw,
         synced_at = now()`,
      [p.id, p.name, p.brand, p.category, p.price, p.promo_price, p.stock, p.image_url, JSON.stringify(p.images || []), p.permalink, p.raw]
    );
  }

  console.log('[sync] Listo.');
  await pool.end();
}

syncProducts().catch((err) => {
  console.error('[sync] Error:', err);
  process.exit(1);
});
