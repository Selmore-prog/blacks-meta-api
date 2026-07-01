const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const { generateCopy } = require('../src/ai');
const { renderPostBuffer } = require('../src/imageRenderer');
const { fetchProduct } = require('../src/tiendanube');
const { getBrandProfile } = require('../src/brandProfile');
const config = require('../src/config');

const PRODUCT_PILLARS = ['producto', 'promo', 'mayorista'];

async function updateCacheFromLive(live) {
  await pool.query(
    `UPDATE products_cache SET price = $2, stock = $3, image_url = COALESCE($4, image_url), synced_at = now() WHERE id = $1`,
    [live.id, live.price, live.stock, live.image_url]
  );
}

/** Elige un producto con stock, y refresca precio/stock EN VIVO contra Tiendanube. */
async function pickProductForSlot(slot) {
  const mentionedBrand = config.brand.knownBrands.find((b) =>
    (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase())
  );

  let candidate = null;
  if (mentionedBrand) {
    const { rows } = await pool.query(
      `SELECT * FROM products_cache WHERE brand ILIKE $1 AND stock > 0 ORDER BY random() LIMIT 1`,
      [`%${mentionedBrand}%`]
    );
    candidate = rows[0] || null;
  }
  if (!candidate) {
    const { rows } = await pool.query(`SELECT * FROM products_cache WHERE stock > 0 ORDER BY random() LIMIT 1`);
    candidate = rows[0] || null;
  }
  if (!candidate) return null;

  // Precio/stock en tiempo real: si ya no hay stock, buscamos otro.
  const live = await fetchProduct(candidate.id);
  if (live) {
    await updateCacheFromLive(live).catch(() => {});
    if (live.stock !== null && live.stock <= 0) {
      const { rows } = await pool.query(
        `SELECT * FROM products_cache WHERE stock > 0 AND id <> $1 ORDER BY random() LIMIT 1`,
        [candidate.id]
      );
      if (rows[0]) {
        const live2 = await fetchProduct(rows[0].id);
        return live2 || rows[0];
      }
    }
    return live;
  }
  return candidate;
}

function interactionChip(slot) {
  if (slot.automation_level !== 'semi') return null;
  const hint = (slot.interaction_hint || '').toUpperCase();
  if (hint.includes('ENCUESTA')) return '👆 Votá en la encuesta';
  if (hint.includes('QUIZ')) return '🧠 ¿Cuál es la posta?';
  if (hint.includes('PREGUNTA')) return '💬 Contanos vos';
  return '👆 Respondé la historia';
}

async function generateForSlot(slot) {
  const brandProfile = await getBrandProfile();
  const product = PRODUCT_PILLARS.includes(slot.pillar) ? await pickProductForSlot(slot) : null;
  const format = slot.format === 'story' ? 'story' : 'feed';

  const copy = await generateCopy({
    pillar: slot.pillar,
    pillarDetail: slot.pillar_detail,
    postType: slot.post_type,
    format,
    product,
    brandProfile,
    interactionHint: slot.interaction_hint,
  });

  const badgeText = slot.pillar === 'promo' ? 'OFERTA' : slot.pillar === 'mayorista' ? 'MAYORISTA' : null;
  const overlayTitle = copy.overlay || (product ? product.name : slot.pillar_detail || slot.theme_title || slot.pillar);

  const { url: imagePath } = await renderPostBuffer({
    format,
    overlayTitle,
    price: product ? product.price : null,
    cta: copy.cta,
    badgeText,
    productImageUrl: product ? product.image_url : null,
    // Fondo con IA para piezas sin foto de producto (marca / educativo / ugc / engagement).
    useAiBackground: !product,
    bgTheme: slot.pillar_detail || slot.theme_title,
    interactionLabel: interactionChip(slot),
  });

  // El video del Reel NO se renderiza acá (ffmpeg es pesado). Lo completa
  // scripts/render-pending-reels.js corriendo en GitHub Actions.
  await pool.query(
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, format, status)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'draft')`,
    [slot.id, product ? product.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, format]
  );

  await pool.query(`UPDATE content_calendar SET status = 'draft' WHERE id = $1`, [slot.id]);

  console.log(`[generate-daily] Slot #${slot.id} (${slot.pillar}/${slot.post_type}/${format}) -> ${imagePath}`);
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
