const pool = require('./db');

// El tema Tiendanube usa settings.free_shipping_min y hoy cae a $45.000.
// Configurar FREE_SHIPPING_MIN junto con el tema si cambia la promoción.
const min = Number(process.env.FREE_SHIPPING_MIN || 45000);

function qualifies(product) {
  if (product.raw?.free_shipping === true) return true;
  const visible = Number(product.promo_price) > 0 && Number(product.promo_price) < Number(product.price)
    ? Number(product.promo_price) : Number(product.price);
  return Number.isFinite(min) && min > 0 && Number.isFinite(visible) && visible >= min;
}

async function forAsset(assetId) {
  const { rows } = await pool.query(`SELECT a.product_id, c.post_type, c.forced_product_ids
    FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [assetId]);
  const asset = rows[0];
  if (!asset || asset.post_type !== 'reel') return false;
  const ids = Array.isArray(asset.forced_product_ids) && asset.forced_product_ids.length
    ? asset.forced_product_ids.map(Number) : [Number(asset.product_id)].filter(Boolean);
  if (!ids.length) return false;
  const found = await pool.query('SELECT id, price, promo_price, raw FROM products_cache WHERE id = ANY($1::bigint[])', [ids]);
  return ids.every((id) => found.rows.some((p) => Number(p.id) === id && qualifies(p)));
}

async function queueForAsset(assetId) {
  const badge = await forAsset(assetId);
  await pool.query(`UPDATE generated_assets SET edited_video_path = NULL,
    edit_status = $2, updated_at = now() WHERE id = $1`, [assetId, badge ? 'queued' : 'none']);
  return badge;
}

async function queueExistingReels() {
  const { rows } = await pool.query(`SELECT a.id FROM generated_assets a
    JOIN content_calendar c ON c.id = a.calendar_id
    WHERE c.post_type = 'reel' AND c.status IN ('draft', 'approved')
      AND c.scheduled_date >= CURRENT_DATE - 7
      AND a.video_path IS NOT NULL AND a.edited_video_path IS NULL
      AND COALESCE(a.edit_status, 'none') = 'none'
    ORDER BY a.id DESC LIMIT 30`);
  let queued = 0;
  for (const row of rows) if (await forAsset(row.id)) {
    await pool.query(`UPDATE generated_assets SET edit_status = 'queued' WHERE id = $1`, [row.id]);
    queued += 1;
  }
  return queued;
}

module.exports = { qualifies, forAsset, queueForAsset, queueExistingReels };
