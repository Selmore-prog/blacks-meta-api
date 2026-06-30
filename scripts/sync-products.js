const pool = require('../src/db');
const { fetchAllProducts } = require('../src/tiendanube');

async function syncProducts() {
  console.log('[sync] Trayendo catalogo de Tiendanube...');
  const products = await fetchAllProducts();
  console.log(`[sync] ${products.length} productos encontrados. Guardando...`);

  for (const p of products) {
    await pool.query(
      `INSERT INTO products_cache (id, name, brand, category, price, stock, image_url, permalink, raw, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         stock = EXCLUDED.stock,
         image_url = EXCLUDED.image_url,
         permalink = EXCLUDED.permalink,
         raw = EXCLUDED.raw,
         synced_at = now()`,
      [p.id, p.name, p.brand, p.category, p.price, p.stock, p.image_url, p.permalink, p.raw]
    );
  }

  console.log('[sync] Listo.');
  await pool.end();
}

syncProducts().catch((err) => {
  console.error('[sync] Error:', err);
  process.exit(1);
});
