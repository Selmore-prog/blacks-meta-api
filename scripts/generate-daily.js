const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const { generateCopy } = require('../src/copywriter');
const { renderPostBuffer } = require('../src/imageRenderer');
const { renderReelVideo } = require('../src/videoRenderer');
const config = require('../src/config');

async function pickProductForSlot(slot) {
  const mentionedBrand = config.brand.knownBrands.find((b) =>
    (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase())
  );

  if (mentionedBrand) {
    const { rows } = await pool.query(
      `SELECT * FROM products_cache WHERE brand ILIKE $1 AND stock > 0 ORDER BY random() LIMIT 1`,
      [`%${mentionedBrand}%`]
    );
    if (rows[0]) return rows[0];
  }

  const { rows } = await pool.query(`SELECT * FROM products_cache WHERE stock > 0 ORDER BY random() LIMIT 1`);
  return rows[0] || null;
}

async function generateForSlot(slot) {
  const product = ['producto', 'promo', 'mayorista'].includes(slot.pillar) ? await pickProductForSlot(slot) : null;

  const copy = await generateCopy({
    pillar: slot.pillar,
    pillarDetail: slot.pillar_detail,
    postType: slot.post_type,
    product,
  });

  const { url: imagePath, buffer: imageBuffer } = await renderPostBuffer({
    title: product ? product.name : slot.pillar_detail || slot.pillar,
    price: product ? product.price : null,
    ctaText: copy.cta,
    badgeText: slot.pillar === 'promo' ? 'OFERTA' : slot.pillar === 'mayorista' ? 'MAYORISTA' : null,
    imageUrl: product ? product.image_url : null,
    theme: slot.id % 2 === 0 ? 'light' : 'dark',
  });

  let videoPath = null;
  if (slot.post_type === 'reel') {
    console.log(`[generate-daily] Generando Reel para slot #${slot.id}...`);
    try {
      videoPath = await renderReelVideo({ imageBuffer, duration: 8 });
    } catch (err) {
      console.error(`[generate-daily] Advertencia: falló renderizado de Reel video:`, err.message);
    }
  }

  await pool.query(
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
    [slot.id, product ? product.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, videoPath]
  );

  await pool.query(`UPDATE content_calendar SET status = 'draft' WHERE id = $1`, [slot.id]);

  console.log(`[generate-daily] Generado slot #${slot.id} (${slot.pillar}/${slot.post_type}) -> Img: ${imagePath}${videoPath ? ` | Vid: ${videoPath}` : ''}`);
}

async function generateDaily() {
  console.log('[generate-daily] Sembrando calendario (próximos 14 días si faltan)...');
  await seedCalendar(14);

  const pending = await getPendingForDate(new Date());
  console.log(`[generate-daily] ${pending.length} slot(s) pendientes para hoy.`);

  let generatedCount = 0;
  for (const slot of pending) {
    try {
      await generateForSlot(slot);
      generatedCount += 1;
    } catch (err) {
      console.error(`[generate-daily] Error generando slot #${slot.id}:`, err.message);
    }
  }

  console.log(`[generate-daily] Listo. Generados ${generatedCount} slots.`);
  return { generatedCount };
}

if (require.main === module) {
  generateDaily()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[generate-daily] Error general:', err);
      process.exit(1);
    });
}

module.exports = { generateDaily, generateForSlot };
