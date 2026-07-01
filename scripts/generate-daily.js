const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const { generateCopy } = require('../src/ai');
const { renderPostBuffer } = require('../src/imageRenderer');
const { fetchProduct } = require('../src/tiendanube');
const { getBrandProfile } = require('../src/brandProfile');
const { getActiveLogo } = require('../src/styleService');
const { getWholesaleSettings, wholesaleContext } = require('../src/wholesale');
const config = require('../src/config');

// Retail (con precio y stock finito). 'mayorista' se maneja aparte con pickMayoristaProduct.
const PRODUCT_PILLARS = ['producto', 'promo'];

/** Producto mayorista: stock infinito (null) o sin precio ("Consultar precio"). */
async function pickMayoristaProduct(slot) {
  const brand = config.brand.knownBrands.find((b) => (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase()));
  const cond = `image_url IS NOT NULL AND (stock IS NULL OR price IS NULL OR price <= 0)`;
  if (brand) {
    const { rows } = await pool.query(
      `SELECT * FROM products_cache WHERE ${cond} AND brand ILIKE $1 ORDER BY random() LIMIT 1`, [`%${brand}%`]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await pool.query(`SELECT * FROM products_cache WHERE ${cond} ORDER BY random() LIMIT 1`);
  return rows[0] || null;
}

async function updateCacheFromLive(live) {
  await pool.query(
    `UPDATE products_cache SET price = $2, stock = $3, image_url = COALESCE($4, image_url), synced_at = now() WHERE id = $1`,
    [live.id, live.price, live.stock, live.image_url]
  );
}

// Palabras clave de producto según la temporada (hemisferio sur / Argentina).
function seasonKeywords(date = new Date()) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return ['%remera%', '%chomba%', '%short%', '%gorra%', '%manga corta%']; // verano
  if (m <= 4) return ['%buzo%', '%campera%', '%rompeviento%', '%canguro%']; // otoño
  if (m <= 7) return ['%campera%', '%buzo%', '%polar%', '%softshell%', '%term%', '%abrigo%', '%canguro%', '%sweater%']; // invierno
  return ['%buzo%', '%campera%', '%rompeviento%', '%remera%']; // primavera
}

/**
 * Trae un producto entre los 10 más vendidos que tengan STOCK y PRECIO real
 * (se excluye "Consultar precio" = sin precio). Filtros opcionales: marca y temporada.
 */
async function topInStock({ brand, seasonal } = {}) {
  const conds = ['stock > 0', 'price IS NOT NULL', 'price > 0'];
  const params = [];
  if (brand) { params.push(`%${brand}%`); conds.push(`brand ILIKE $${params.length}`); }
  if (seasonal && seasonal.length) {
    params.push(seasonal);
    conds.push(`(name ILIKE ANY($${params.length}) OR category ILIKE ANY($${params.length}))`);
  }
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM products_cache WHERE ${conds.join(' AND ')}
       ORDER BY sales_30d DESC NULLS LAST, stock DESC LIMIT 10
     ) t ORDER BY random() LIMIT 1`,
    params
  );
  return rows[0] || null;
}

/** Elige un producto (marca > temporada > más vendido) y refresca precio/stock EN VIVO. */
async function pickProductForSlot(slot) {
  const mentionedBrand = config.brand.knownBrands.find((b) =>
    (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase())
  );
  const kw = seasonKeywords();

  let candidate =
    (mentionedBrand && await topInStock({ brand: mentionedBrand, seasonal: kw })) ||
    (mentionedBrand && await topInStock({ brand: mentionedBrand })) ||
    await topInStock({ seasonal: kw }) ||
    await topInStock({});
  if (!candidate) return null;

  // Precio/stock en tiempo real: si se quedó sin stock o pasó a "Consultar precio", buscamos otro.
  const live = await fetchProduct(candidate.id);
  if (live) {
    await updateCacheFromLive(live).catch(() => {});
    const invalid = (live.stock !== null && live.stock <= 0) || !live.price || Number(live.price) <= 0;
    if (invalid) {
      const alt = (await topInStock({ seasonal: kw })) || (await topInStock({}));
      if (alt && alt.id !== candidate.id) {
        const liveAlt = await fetchProduct(alt.id);
        return liveAlt && liveAlt.price > 0 ? liveAlt : alt;
      }
    }
    return live;
  }
  return candidate;
}

const STOPWORDS = new Set(['para', 'con', 'sin', 'los', 'las', 'del', 'una', 'uno', 'que', 'por', 'cuando',
  'como', 'este', 'esta', 'mas', 'más', 'cada', 'entre', 'elegi', 'elegí', 'vos', 'the', 'and']);

function keywordsFromText(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-záéíóúñ0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 6)
    .map((w) => `%${w}%`);
}

/**
 * Para pilares SIN producto (educativo/marca/ugc/engagement), busca en el catálogo
 * una FOTO real relacionada al tema para que la pieza nunca quede vacía.
 * Ej: "puntera de acero" -> un botín de seguridad. Siempre devuelve algo con imagen.
 */
async function pickRelevantProductImage(slot) {
  const words = [...keywordsFromText(slot.pillar_detail), ...keywordsFromText(slot.theme_title)];
  const patterns = words.length ? words : seasonKeywords();

  let { rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM products_cache
       WHERE image_url IS NOT NULL AND (name ILIKE ANY($1) OR category ILIKE ANY($1))
       ORDER BY (stock > 0) DESC, sales_30d DESC NULLS LAST LIMIT 12
     ) t ORDER BY random() LIMIT 1`,
    [patterns]
  );
  if (rows[0]) return rows[0];

  ({ rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM products_cache WHERE image_url IS NOT NULL AND (name ILIKE ANY($1) OR category ILIKE ANY($1))
       ORDER BY (stock > 0) DESC LIMIT 12
     ) t ORDER BY random() LIMIT 1`,
    [seasonKeywords()]
  ));
  if (rows[0]) return rows[0];

  ({ rows } = await pool.query(`SELECT * FROM products_cache WHERE image_url IS NOT NULL AND stock > 0 ORDER BY random() LIMIT 1`));
  return rows[0] || null;
}

function interactionChip(slot) {
  if (slot.automation_level !== 'semi') return null;
  const hint = (slot.interaction_hint || '').toUpperCase();
  if (hint.includes('ENCUESTA')) return '👆 Votá en la encuesta';
  if (hint.includes('QUIZ')) return '🧠 ¿Cuál es la posta?';
  if (hint.includes('PREGUNTA')) return '💬 Contanos vos';
  return '👆 Respondé la historia';
}

async function generateForSlot(slot, overrides = {}) {
  const brandProfile = await getBrandProfile();
  // Permite regenerar cambiando el tema/ángulo del contenido sin cambiar el pilar.
  const pillarDetail = overrides.pillarDetail || slot.pillar_detail;
  const effectiveSlot = { ...slot, pillar_detail: pillarDetail };

  const isMayorista = slot.pillar === 'mayorista';
  const product = isMayorista
    ? await pickMayoristaProduct(effectiveSlot)
    : (PRODUCT_PILLARS.includes(slot.pillar) ? await pickProductForSlot(effectiveSlot) : null);
  const wholesale = isMayorista ? wholesaleContext(await getWholesaleSettings()) : null;
  const format = slot.format === 'story' ? 'story' : 'feed';

  // Foto REAL siempre: la del producto o, si el pilar no es de producto, una foto del
  // catálogo relacionada al tema (así la pieza nunca queda vacía).
  let visualImageUrl = product ? product.image_url : null;
  if (!visualImageUrl) {
    const rel = await pickRelevantProductImage(effectiveSlot);
    if (rel) visualImageUrl = rel.image_url;
  }

  const logoUrl = await getActiveLogo().catch(() => null);

  const isCarousel = Boolean(slot.carousel) && format === 'feed'; // los carruseles de la API de Meta son de feed
  const copy = await generateCopy({
    pillar: slot.pillar,
    pillarDetail,
    postType: slot.post_type,
    format,
    product,
    brandProfile,
    interactionHint: slot.interaction_hint,
    wholesale,
    carousel: isCarousel,
  });

  const badgeText = slot.pillar === 'mayorista' ? 'MAYORISTA' : null;
  const overlayTitle = copy.overlay || (product ? product.name : pillarDetail || slot.theme_title || slot.pillar);
  // REGLA: el precio va sólo en HISTORIAS (efímeras). El feed queda evergreen (sin precio
  // que envejezca). Reels tampoco llevan precio en el copy visual.
  const showPrice = format === 'story' && slot.post_type !== 'reel';

  let imagePath;
  let slidesJson = null;

  const slides = isCarousel && Array.isArray(copy.slides) && copy.slides.length >= 2 ? copy.slides.slice(0, 4) : null;
  if (slides) {
    // Carrusel: una slide por punto, usando distintas fotos del producto si hay.
    const imgs = (product && Array.isArray(product.images) && product.images.length)
      ? product.images : (visualImageUrl ? [visualImageUrl] : []);
    const urls = [];
    for (let i = 0; i < slides.length; i += 1) {
      const img = imgs.length ? imgs[i % imgs.length] : visualImageUrl;
      const { url } = await renderPostBuffer({
        format,
        overlayTitle: slides[i].title || overlayTitle,
        badgeText: i === 0 ? badgeText : null,
        productImageUrl: img,
        logoUrl,
        showBrand: i === 0, // el logo sólo en la portada
        layoutSeed: Number(slot.id) + i,
        bgTheme: pillarDetail || slot.theme_title,
      });
      urls.push(url);
    }
    imagePath = urls[0];
    slidesJson = JSON.stringify(urls);
  } else {
    const { url } = await renderPostBuffer({
      format,
      overlayTitle,
      price: showPrice && product ? product.price : null,
      promoPrice: showPrice && product ? product.promo_price : null,
      cta: copy.cta,
      badgeText,
      productImageUrl: visualImageUrl,
      logoUrl,
      useAiProductScene: Boolean(product),
      useAiBackground: !visualImageUrl,
      bgTheme: pillarDetail || slot.theme_title,
      interactionLabel: interactionChip(slot),
    });
    imagePath = url;
  }

  // El video del Reel NO se renderiza acá (ffmpeg es pesado). Lo completa
  // scripts/render-pending-reels.js corriendo en GitHub Actions.
  await pool.query(
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, format, slides, status)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'draft')`,
    [slot.id, product ? product.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, format, slidesJson]
  );

  await pool.query(`UPDATE content_calendar SET status = 'draft' WHERE id = $1`, [slot.id]);

  console.log(`[generate-daily] Slot #${slot.id} (${slot.pillar}/${slot.post_type}/${format}${slides ? '/carrusel' : ''}) -> ${imagePath}`);
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
