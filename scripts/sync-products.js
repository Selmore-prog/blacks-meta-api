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

  // Productos FANTASMA: Tiendanube sólo devuelve los publicados (published=true en el
  // fetch), así que todo lo que quedó en el cache y NO vino en esta corrida está
  // despublicado o eliminado en la tienda. Se marca published=false para que ningún
  // pool de selección lo ofrezca (no se borra: hay piezas viejas que lo referencian).
  // Guard: si el fetch vino sospechosamente corto (falla parcial de la API), no
  // despublicamos nada — mejor un cache viejo que despublicar el catálogo entero.
  let unpublished = 0;
  if (products.length >= 50) {
    const ids = products.map((p) => p.id);
    const res = await pool.query(
      `UPDATE products_cache SET published = false, synced_at = now()
       WHERE NOT (id = ANY($1)) AND published IS NOT FALSE`,
      [ids]
    );
    // Y los que reaparecen (se volvieron a publicar) vuelven a estar disponibles.
    await pool.query(`UPDATE products_cache SET published = true WHERE id = ANY($1) AND published IS FALSE`, [ids]);
    unpublished = res.rowCount || 0;
    if (unpublished) console.log(`[sync] ${unpublished} producto(s) ya no están en Tiendanube: marcados como no publicados.`);
  } else {
    console.warn(`[sync] Fetch corto (${products.length} productos): no marco fantasmas por seguridad.`);
  }

  console.log('[sync] Listo.');
  return { count: products.length, unpublished };
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
