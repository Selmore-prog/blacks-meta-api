const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const { generateCopy } = require('../src/ai');
const { renderPostBuffer } = require('../src/imageRenderer');
const { fetchProduct } = require('../src/tiendanube');
const { getBrandProfile } = require('../src/brandProfile');
const { getLogos } = require('../src/styleService');
const { getWholesaleSettings, wholesaleContext } = require('../src/wholesale');
const { getCommercialContextForDate } = require('../src/commercialDates');
const { eligibleSQL, recentlyFeaturedIds } = require('../src/productScore');
const config = require('../src/config');

// Retail (con precio y stock finito). 'mayorista' se maneja aparte con pickMayoristaProduct.
const PRODUCT_PILLARS = ['producto', 'promo'];

/** Producto mayorista: stock infinito (null) o sin precio ("Consultar precio"). */
async function pickMayoristaProduct(slot, excludeIds = []) {
  const brand = config.brand.knownBrands.find((b) => (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase()));
  const cond = `image_url IS NOT NULL AND (stock IS NULL OR price IS NULL OR price <= 0)`;
  const notRecent = `AND NOT (id = ANY($EXC))`;
  // Primero sin repetir productos recientes; si el catálogo mayorista es chico, se permite repetir.
  for (const exc of [excludeIds, []]) {
    if (brand) {
      const { rows } = await pool.query(
        `SELECT * FROM products_cache WHERE ${cond} AND brand ILIKE $1 ${notRecent.replace('$EXC', '$2')} ORDER BY random() LIMIT 1`,
        [`%${brand}%`, exc]);
      if (rows[0]) return rows[0];
    }
    const { rows } = await pool.query(
      `SELECT * FROM products_cache WHERE ${cond} ${notRecent.replace('$EXC', '$1')} ORDER BY random() LIMIT 1`, [exc]);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function updateCacheFromLive(live) {
  await pool.query(
    `UPDATE products_cache SET price = $2, stock = $3, sizes_total = $4, sizes_in_stock = $5, size_coverage = $6,
       image_url = COALESCE($7, image_url), synced_at = now() WHERE id = $1`,
    [live.id, live.price, live.stock, live.sizes_total, live.sizes_in_stock, live.size_coverage, live.image_url]
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
 * Trae un producto entre los 10 más vendidos que valga la pena mostrar:
 * stock y precio reales Y curva de talles sana (ver src/productScore.js) — un
 * producto con mucho stock pero un solo talle no protagoniza piezas.
 * `relaxed: true` afloja a la regla vieja (stock>0) como último recurso.
 * `excludeIds`: productos que ya protagonizaron piezas hace poco (anti-repetición).
 */
async function topInStock({ brand, seasonal, excludeIds = [], relaxed = false } = {}) {
  const conds = relaxed ? ['stock > 0', 'price IS NOT NULL', 'price > 0'] : [eligibleSQL()];
  const params = [];
  if (brand) { params.push(`%${brand}%`); conds.push(`brand ILIKE $${params.length}`); }
  if (seasonal && seasonal.length) {
    params.push(seasonal);
    conds.push(`(name ILIKE ANY($${params.length}) OR category ILIKE ANY($${params.length}))`);
  }
  if (excludeIds.length) {
    params.push(excludeIds);
    conds.push(`NOT (id = ANY($${params.length}))`);
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

/**
 * Si el slot nombra un producto/tipo puntual ("Remera Lisa Algodón Pampero"),
 * lo buscamos PRIMERO por esas palabras: el plan manda sobre temporada/ventas.
 */
async function productFromDetail(slot) {
  const patterns = keywordsFromText(slot.pillar_detail);
  if (patterns.length < 2) return null; // muy poco texto para confiar en el match
  const norm = (col) => `translate(lower(${col}), 'áéíóúñü', 'aeiounu')`;
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT *,
         ((CASE WHEN ${norm('name')} LIKE ANY($1) THEN 4 ELSE 0 END) +
          (CASE WHEN ${norm(`COALESCE(category, '')`)} LIKE ANY($1) THEN 2 ELSE 0 END)) AS match_score
       FROM products_cache
       WHERE ${eligibleSQL()}
     ) t
     WHERE match_score >= 4
     ORDER BY match_score DESC, sales_30d DESC NULLS LAST
     LIMIT 1`,
    [patterns]
  );
  return rows[0] || null;
}

/**
 * Elige un producto (detalle del slot > marca > temporada > más vendido) y refresca
 * precio/stock EN VIVO. Evita repetir protagonistas de los últimos días y exige
 * curva de talles sana; si el catálogo elegible se queda corto, afloja antes que fallar.
 */
async function pickProductForSlot(slot) {
  const mentionedBrand = config.brand.knownBrands.find((b) =>
    (slot.pillar_detail || '').toLowerCase().includes(b.toLowerCase())
  );
  const kw = seasonKeywords();
  const recent = await recentlyFeaturedIds().catch(() => []);

  let candidate =
    await productFromDetail(slot) ||
    (mentionedBrand && await topInStock({ brand: mentionedBrand, seasonal: kw, excludeIds: recent })) ||
    (mentionedBrand && await topInStock({ brand: mentionedBrand, excludeIds: recent })) ||
    await topInStock({ seasonal: kw, excludeIds: recent }) ||
    await topInStock({ excludeIds: recent }) ||
    // Último recurso: repetir alguno reciente o aceptar curva floja antes que no generar.
    await topInStock({}) ||
    await topInStock({ relaxed: true });
  if (!candidate) return null;

  // Precio/stock en tiempo real: si se quedó sin stock o pasó a "Consultar precio", buscamos otro.
  const live = await fetchProduct(candidate.id);
  if (live) {
    await updateCacheFromLive(live).catch(() => {});
    const invalid = (live.stock !== null && live.stock <= 0) || !live.price || Number(live.price) <= 0;
    if (invalid) {
      const alt = (await topInStock({ seasonal: kw, excludeIds: recent })) || (await topInStock({}));
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
  'como', 'este', 'esta', 'mas', 'cada', 'entre', 'elegi', 'vos', 'the', 'and', 'correcto',
  'correcta', 'justo', 'justa', 'mejor', 'laburo',
  // Verbos/palabras genéricas que matchean cualquier descripción y arruinan la relevancia:
  'cambiar', 'conviene', 'cuanto', 'trivia', 'sabes', 'saber', 'hora', 'tiene', 'tener',
  'usar', 'usas', 'poner', 'lleva', 'llevar', 'hace', 'hacer', 'todo', 'todos', 'semana', 'destacado']);

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function keywordsFromText(text) {
  return stripAccents(String(text || '').toLowerCase())
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 6)
    .map((w) => `%${w}%`);
}

function topicVisualRules(slot) {
  const text = `${slot.pillar_detail || ''} ${slot.theme_title || ''}`.toLowerCase();
  const include = [];
  const exclude = [];

  const add = (...words) => {
    for (const word of words) include.push(`%${word}%`);
  };
  const ban = (...words) => {
    for (const word of words) exclude.push(`%${word}%`);
  };

  // Los patrones van SIN acentos: la comparación en SQL también se hace sin acentos.
  if (/(talle|calce|medida|medidas|queda|quede)/i.test(text)) {
    add('campera', 'buzo', 'pantalon', 'remera', 'chomba', 'camisa', 'botin', 'zapato', 'mameluco');
    ban('pasamont', 'balaclava', 'gorro', 'guante', 'cuello', 'bufanda', 'media', 'plantilla');
  }
  if (/(puntera|acero|calzado|botin|botín|zapato|suela)/i.test(text)) {
    // OJO: sin 'seguridad' a secas — matchea fajas/cascos/anteojos que no son calzado.
    add('botin', 'zapato', 'calzado', 'puntera', 'borcego', 'borcegui');
    ban('remera', 'chomba', 'campera', 'buzo', 'gorro', 'guante', 'pasamont', 'faja', 'casco', 'anteojo', 'media', 'plantilla');
  }
  if (/(frio|frío|invierno|abrigo|abrigad)/i.test(text)) {
    add('campera', 'buzo', 'polar', 'softshell', 'termica', 'chaleco');
    ban('pasamont', 'balaclava', 'gorro', 'guante', 'cuello', 'bufanda');
  }
  if (/(uniform|empresa|corporativ|mayorista)/i.test(text)) {
    add('camisa', 'pantalon', 'chomba', 'remera', 'mameluco', 'campera');
  }

  return { include, exclude };
}

function uniquePatterns(patterns) {
  return [...new Set((patterns || []).filter(Boolean))];
}

/**
 * Para pilares SIN producto (educativo/marca/ugc/engagement), busca en el catálogo
 * una FOTO real relacionada al tema.
 * Regla importante: si no hay match fuerte, devuelve null. Es mejor una pieza textual
 * de marca que mostrar un producto cualquiera que contradiga el copy.
 */
async function pickRelevantVisualProduct(slot) {
  const rawWords = [...keywordsFromText(slot.pillar_detail), ...keywordsFromText(slot.theme_title)];
  const rules = topicVisualRules(slot);
  const include = uniquePatterns([...rawWords, ...rules.include]);
  if (!include.length) return null;

  // La foto tiene que salir del catálogo correcto: piezas mayoristas/corporativas usan
  // productos mayoristas (stock infinito o "Consultar precio"); el resto, productos
  // minoristas reales (con precio y stock, para no mostrar algo que no se puede comprar).
  const isMayoristaSlot = slot.pillar === 'mayorista'
    || /(mayorista|empresa|corporativ|uniform)/i.test(`${slot.pillar_detail || ''} ${slot.theme_title || ''}`);
  const poolFilter = isMayoristaSlot
    ? `(stock IS NULL OR price IS NULL OR price <= 0)`
    : `(stock > 0 AND price > 0)`;

  // Comparación sin acentos ('%botin%' tiene que matchear "Botín" y "Botines").
  const norm = (col) => `translate(lower(${col}), 'áéíóúñü', 'aeiounu')`;
  const params = [include, rules.exclude.length ? rules.exclude : ['%__never_match__%']];
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT *,
         -- Calidad del match: SOLO nombre/categoría califican (la descripción menciona
         -- de todo y hacía elegir productos que no tenían nada que ver con el tema).
         ((CASE WHEN ${norm('name')} LIKE ANY($1) THEN 4 ELSE 0 END) +
          (CASE WHEN ${norm(`COALESCE(category, '')`)} LIKE ANY($1) THEN 3 ELSE 0 END)) AS relevance_score
       FROM products_cache
       WHERE image_url IS NOT NULL
         AND ${poolFilter}
         AND NOT (${norm('name')} LIKE ANY($2) OR ${norm(`COALESCE(category, '')`)} LIKE ANY($2))
     ) t
     WHERE relevance_score >= 3
     ORDER BY relevance_score DESC, sales_30d DESC NULLS LAST, stock DESC NULLS LAST
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

/**
 * Anti-repetición: resumen de las últimas piezas generadas/publicadas (tema + primera
 * línea del caption). Entra al prompt del copy para que la pieza nueva NO repita
 * temas, ganchos ni frases de lo que ya salió.
 */
async function recentPieceSummaries(limit = 12) {
  const { rows } = await pool.query(
    `SELECT c.pillar, c.theme_title, c.pillar_detail, a.caption
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE a.status != 'discarded'
     ORDER BY a.id DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => {
    const theme = r.theme_title || r.pillar_detail || '';
    const cap = String(r.caption || '').split('\n')[0].trim().slice(0, 110);
    return `[${r.pillar}] ${theme}${cap ? ` — "${cap}"` : ''}`.trim();
  }).filter(Boolean);
}

/**
 * Feedback loop: captions de los posts publicados con mejor rendimiento real
 * (alcance + engagement ponderado). Vacío hasta que haya métricas — no molesta.
 */
async function topPerformingCaptions(limit = 3) {
  const { rows } = await pool.query(
    `SELECT a.caption
     FROM post_insights i
     JOIN generated_assets a ON a.id = i.asset_id
     WHERE a.caption IS NOT NULL AND length(a.caption) > 30
     ORDER BY (COALESCE(i.reach, 0) + COALESCE(i.likes, 0) * 5 + COALESCE(i.comments, 0) * 10 + COALESCE(i.saved, 0) * 10) DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.caption);
}

/**
 * Imágenes que el vendedor subió DENTRO de la descripción de Tiendanube (guías de
 * talle, tablas de medidas, fichas). Salen del JSON crudo cacheado en products_cache.raw.
 */
function descriptionImages(product) {
  if (!product || !product.raw) return [];
  let raw = product.raw;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { return []; } }
  const html = raw && raw.description ? (raw.description.es || raw.description) : null;
  if (!html || typeof html !== 'string') return [];
  return [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((u) => /^https?:\/\//i.test(u));
}

const { TEMPLATES: VALID_TEMPLATES } = require('../src/imageRenderer');

// Requisitos mínimos de cada estilo nuevo (cuántas fotos reales del producto
// necesita, si necesita descripción real de Tiendanube para specs, si es sólo
// para historias). Los 5 clásicos (fullbleed/minimal/promo/educativo/mayorista)
// no tienen requisitos: siempre están disponibles.
const TEMPLATE_REQUIREMENTS = {
  grid: { minImages: 3 },
  overlap: { minImages: 2 },
  specsheet: { minImages: 1, needsDescription: true },
  polaroidstrip: { minImages: 2, storyOnly: true },
};

// Qué estilos tienen sentido para cada pilar — variedad real por pilar, filtrada
// después por lo que el producto puede sostener (fotos/descripción disponibles).
// Antes sólo alternaba 2 diseños por pilar; ahora rota entre +10 estilos (bento
// grid, fotos superpuestas, ficha técnica con specs reales, splitscreen, blueprint,
// portada editorial, bento de tarjetas, tira de polaroids) para que el feed no
// se sienta repetitivo/plantillero.
const PILLAR_TEMPLATE_POOL = {
  producto: ['fullbleed', 'minimal', 'grid', 'overlap', 'specsheet'],
  promo: ['promo', 'splitscreen', 'fullbleed'],
  educativo: ['educativo', 'blueprint'],
  mayorista: ['mayorista', 'stackedcards', 'magazine'],
  marca: ['minimal', 'magazine', 'overlap', 'fullbleed'],
  ugc: ['magazine', 'polaroidstrip', 'overlap', 'minimal'],
  engagement: ['fullbleed', 'splitscreen', 'minimal'],
};

/**
 * Plantilla visual: override manual > pool del pilar (filtrado por lo que el
 * producto puede sostener) > fullbleed. Rota entre el catálogo de estilos por
 * seed del slot, así la misma combinación pilar+producto no repite diseño.
 */
function chooseTemplate(slot, { override, visualProduct } = {}) {
  if (VALID_TEMPLATES.includes(override)) return override;
  // La plantilla 'educativo' es una tarjeta tipográfica CON MUCHO texto y una foto
  // chica de apoyo: pensada para feed/carrusel estático. En un Reel (post_type='reel')
  // se ve casi vacía (el video ocupa toda la pantalla, no una tarjeta) — ahí conviene
  // una plantilla de foto a pantalla completa, sin importar el pilar.
  if (slot.post_type === 'reel') {
    return slot.pillar === 'mayorista' ? 'mayorista' : (Number(slot.id) % 2 === 0 ? 'fullbleed' : 'promo');
  }

  const images = (visualProduct && Array.isArray(visualProduct.images) && visualProduct.images.length)
    ? visualProduct.images
    : (visualProduct && visualProduct.image_url ? [visualProduct.image_url] : []);
  const hasDescription = Boolean(visualProduct && visualProduct.description);
  const isStory = slot.format === 'story';

  const pool = (PILLAR_TEMPLATE_POOL[slot.pillar] || ['fullbleed', 'minimal']).filter((t) => {
    const req = TEMPLATE_REQUIREMENTS[t];
    if (!req) return true;
    if (req.minImages && images.length < req.minImages) return false;
    if (req.needsDescription && !hasDescription) return false;
    if (req.storyOnly && !isStory) return false;
    return true;
  });
  const candidates = pool.length ? pool : ['fullbleed'];
  return candidates[Number(slot.id) % candidates.length];
}

function interactionChip(slot, sticker = null) {
  if (slot.automation_level !== 'semi') return null;
  // Con la especificación del sticker generada junto al copy, el chip refleja el
  // tipo REAL de interacción; si no hay, se infiere del hint del plan.
  const type = sticker && sticker.type;
  if (type === 'encuesta') return '👆 Votá en la encuesta';
  if (type === 'quiz') return '🧠 ¿Sabías la respuesta?';
  if (type === 'pregunta') return '💬 Contanos vos';
  if (type === 'slider') return '👆 Deslizá y opiná';
  const hint = (slot.interaction_hint || '').toUpperCase();
  if (hint.includes('ENCUESTA')) return '👆 Votá en la encuesta';
  if (hint.includes('QUIZ')) return '🧠 ¿Sabías la respuesta?';
  if (hint.includes('PREGUNTA')) return '💬 Contanos vos';
  return '👆 Respondé la historia';
}

/**
 * Extrae un código de cupón del texto (brief o copy): ej "cupón ARGENTINA10".
 * Se renderiza como TEXTO en la plantilla (la IA de imagen no escribe texto).
 * Conservador para no confundir marcas (Grafa 70) con cupones.
 */
function extractCoupon(text) {
  if (!text) return null;
  const s = String(text);
  const labelled = s.match(/(?:cup[oó]n|c[oó]digo|promo\s*code|voucher)\s*[:.]?\s*["']?([A-Z0-9]{4,20})["']?/i);
  if (labelled) {
    const c = labelled[1].toUpperCase();
    if (/[A-Z]/.test(c) && /\d/.test(c)) return c;
  }
  // Fallback: token MAYÚSCULAS+dígitos, sólo si el texto habla de cupón/código.
  if (/cup[oó]n|c[oó]digo/i.test(s)) {
    const token = s.match(/\b([A-ZÁÉÍÓÚÑ]{3,}\d{1,3})\b/);
    if (token) return token[1].toUpperCase();
  }
  return null;
}

async function generateForSlot(slot, overrides = {}) {
  const brandProfile = await getBrandProfile();
  // Permite regenerar cambiando el tema/ángulo del contenido sin cambiar el pilar.
  const pillarDetail = overrides.pillarDetail || slot.pillar_detail;
  const effectiveSlot = { ...slot, pillar_detail: pillarDetail };

  // Objetivo de la pieza: si el slot no lo tiene (slots viejos, previos al planner
  // con objetivos), usamos el que corresponde al pilar para que el copy igual salga
  // orientado (venta/tráfico/confianza/comunidad).
  const { defaultObjective } = require('../src/planner');
  const objective = slot.objective || defaultObjective(slot.pillar);

  // El brief puede pedir EXPLÍCITAMENTE no mostrar un producto (ej: promo de cupón
  // para toda la tienda). En ese caso no elegimos producto y la imagen sale como
  // fondo temático generado con IA, no como escena de un producto puntual.
  const noProductBrief = /\b(no mostrar|sin)\s+produc|toda la (tienda|web|p[aá]gina|compra)|todo el (catalogo|catálogo|sitio)|cat[aá]logo general|general de la (tienda|marca)/i
    .test(pillarDetail || '');

  const isMayorista = slot.pillar === 'mayorista';
  const product = noProductBrief ? null
    : isMayorista
      ? await pickMayoristaProduct(effectiveSlot, await recentlyFeaturedIds().catch(() => []))
      : (PRODUCT_PILLARS.includes(slot.pillar) ? await pickProductForSlot(effectiveSlot) : null);
  const visualProduct = noProductBrief ? null : (product || await pickRelevantVisualProduct(effectiveSlot));
  const wholesale = isMayorista ? wholesaleContext(await getWholesaleSettings()) : null;
  const format = slot.format === 'story' ? 'story' : 'feed';
  const commercialContext = await getCommercialContextForDate(slot.scheduled_date).catch(() => null);
  // Ocasión = fechas comerciales de ESE día puntual (ej: Día de la Independencia),
  // para que la imagen refleje el festivo (bandera, colores) — no todo el rango.
  const occasion = await getCommercialContextForDate(slot.scheduled_date, { daysAhead: 0 }).catch(() => null);

  // Foto REAL y coherente: producto principal o producto visual con match fuerte.
  // No usamos fallback estacional/random porque puede contradecir el copy.
  const visualImageUrl = visualProduct ? visualProduct.image_url : null;

  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));

  const isCarousel = Boolean(slot.carousel) && format === 'feed'; // los carruseles de la API de Meta son de feed
  const copy = await generateCopy({
    pillar: slot.pillar,
    pillarDetail,
    postType: slot.post_type,
    format,
    objective,
    product,
    visualProduct: product ? null : visualProduct,
    brandProfile,
    interactionHint: slot.interaction_hint,
    // Piezas semi: la IA especifica el sticker EXACTO (tipo, pregunta, opciones,
    // respuesta correcta) para copiarlo tal cual al publicar desde la app.
    wantSticker: slot.automation_level === 'semi',
    wholesale,
    carousel: isCarousel,
    // Educativo/mayorista: el carrusel es una guía paso a paso (más slides).
    slideCount: isCarousel && ['educativo', 'mayorista'].includes(slot.pillar) ? 5 : 3,
    commercialContext,
    topCaptions: await topPerformingCaptions().catch(() => []),
    recentPieces: await recentPieceSummaries().catch(() => []),
  });

  const badgeText = slot.pillar === 'mayorista' ? 'MAYORISTA' : null;
  const overlayTitle = copy.overlay || (product ? product.name : pillarDetail || slot.theme_title || slot.pillar);
  // Cupón detectado en el brief o el copy (ej: ARGENTINA10) -> va como texto en la plantilla.
  const couponCode = extractCoupon(`${pillarDetail || ''} \n ${copy.caption || ''} \n ${copy.cta || ''}`);
  // Brief para la imagen IA: indicaciones del plan + gancho del copy, para que la
  // escena tenga sentido con el mensaje (y no sea una foto genérica).
  const imageBrief = [pillarDetail, copy.overlay].filter(Boolean).join(' — ').slice(0, 500);
  // REGLA: el precio va sólo en HISTORIAS (efímeras). El feed queda evergreen (sin precio
  // que envejezca). Reels tampoco llevan precio en el copy visual.
  const showPrice = format === 'story' && slot.post_type !== 'reel';

  // Plantilla visual: override manual > pool del pilar (filtrado por fotos/descripción
  // reales disponibles) > variedad por seed.
  const template = chooseTemplate(effectiveSlot, { override: overrides.template, visualProduct });

  let imagePath;
  let slidesJson = null;
  let pieceCostUsd = 0; // lo que costó ESTA pieza en imágenes IA (0 = gratis)

  // Piezas educativas: la imagen tiene que ENSEÑAR el tema, no decorar.
  // 1º la guía de talles real de Tiendanube (gratis y exacta), 2º ilustración
  // didáctica generada con IA (si AI_IMAGES está activo), 3º foto de catálogo.
  const isEducativo = slot.pillar === 'educativo';
  const topicAll = `${pillarDetail || ''} ${slot.theme_title || ''}`;
  const isSizeTopic = /talle|medida|calce|medir/i.test(topicAll);
  const realSizeChart = isEducativo && isSizeTopic ? (descriptionImages(visualProduct)[0] || null) : null;

  const isStepCarousel = isCarousel && ['educativo', 'mayorista'].includes(slot.pillar);
  const slides = isCarousel && Array.isArray(copy.slides) && copy.slides.length >= 2
    ? copy.slides.slice(0, isStepCarousel ? 5 : 4) : null;
  if (slides) {
    // Carrusel: portada con foto (si hay), pasos tipográficos SIN foto de producto
    // (una guía no necesita mostrar el producto en cada slide), y si el tema es de
    // talles/medidas y el producto tiene su guía real en Tiendanube, va como slide extra.
    const imgs = (visualProduct && Array.isArray(visualProduct.images) && visualProduct.images.length)
      ? visualProduct.images : (visualImageUrl ? [visualImageUrl] : []);
    const topicText = `${pillarDetail || ''} ${slot.theme_title || ''} ${slides.map((s) => s.title).join(' ')}`;
    const sizeChart = isStepCarousel && /talle|medida|calce|guia|guía/i.test(topicText)
      ? descriptionImages(visualProduct)[0] || null : null;

    const urls = [];
    for (let i = 0; i < slides.length; i += 1) {
      const img = isStepCarousel
        ? (i === 0 ? visualImageUrl : null) // pasos limpios, foto sólo en la portada
        : (imgs.length ? imgs[i % imgs.length] : visualImageUrl);
      const { url, costUsd } = await renderPostBuffer({
        format,
        template: 'educativo',
        overlayTitle: slides[i].title || overlayTitle,
        bodyText: slides[i].text || null,
        // Sin contador N/total en la imagen: Instagram ya muestra los puntitos del carrusel.
        kicker: slot.pillar === 'mayorista' ? 'PARA EMPRESAS' : 'PARA SABER',
        badgeText: i === 0 ? badgeText : null,
        productImageUrl: img,
        logos,
        showBrand: i === 0, // el logo sólo en la portada
        layoutSeed: Number(slot.id) + i,
        bgTheme: pillarDetail || slot.theme_title,
      });
      urls.push(url);
      pieceCostUsd += costUsd || 0;
    }

    // Slide final: la guía de talles REAL del producto (ya viene diseñada con la marca).
    if (sizeChart) {
      const { url, costUsd } = await renderPostBuffer({
        format,
        template: 'fullbleed',
        overlayTitle: null,
        productImageUrl: sizeChart,
        logos,
        showBrand: false,
        bgTheme: 'guía de talles',
      });
      urls.push(url);
      pieceCostUsd += costUsd || 0;
    }

    imagePath = urls[0];
    slidesJson = JSON.stringify(urls);
  } else {
    // Reels: NO se gasta en imagen IA automática. La imagen es sólo la base/portada;
    // el video real conviene generarlo a mano en Gemini/Veo con el botón
    // "Prompt video IA" (o subir filmación propia), así la imagen IA no se tira.
    const isReel = slot.post_type === 'reel';
    const { url, costUsd } = await renderPostBuffer({
      format,
      template,
      overlayTitle,
      price: showPrice && product ? product.price : null,
      promoPrice: showPrice && product ? product.promo_price : null,
      cta: copy.cta,
      badgeText,
      productImageUrl: realSizeChart || visualImageUrl,
      // Fotos extra del mismo producto (otros ángulos) para anclar la fidelidad
      // de la escena IA: menos chance de que el modelo reinvente el producto.
      productImageUrls: (visualProduct && Array.isArray(visualProduct.images))
        ? visualProduct.images.slice(0, 4) : [],
      // Descripción REAL de Tiendanube: la plantilla 'specsheet' pinea specs
      // técnicos reales (material, feature) tomados de acá, nunca inventados.
      productDescription: (product && product.description) || (visualProduct && visualProduct.description) || null,
      logos,
      layoutSeed: Number(slot.id),
      useAiProductScene: !isReel && Boolean(visualImageUrl) && slot.pillar !== 'repost',
      // Educativo sin guía real ni foto visual: ilustración didáctica en vez de foto de catálogo.
      useAiDiagram: isEducativo && !realSizeChart && !visualImageUrl,
      diagramTopic: pillarDetail || slot.theme_title,
      // Piezas SIN foto de catálogo: fondo original generado con IA (para marca, engagement, confianza, etc.).
      useAiBackground: !isReel && !visualImageUrl && !isEducativo && slot.pillar !== 'repost',
      // Para escenas de producto el tema es EL PRODUCTO (nunca el texto de venta del slot:
      // el modelo lo "hornea" en la imagen y puede contradecir la foto). Para fondos, el concepto.
      bgTheme: product
        ? `${product.name}${product.category ? ` (${product.category})` : ''}`
        : [pillarDetail || slot.theme_title, copy.overlay].filter(Boolean).join(' — '),
      // Brief + ocasión festiva para que la imagen IA sea coherente con el mensaje y la fecha.
      bgBrief: imageBrief,
      bgOccasion: occasion,
      couponCode,
      interactionLabel: interactionChip(slot, copy.sticker),
    });
    imagePath = url;
    pieceCostUsd += costUsd || 0;
  }

  // Historia de refuerzo (9:16) para posts de FEED: se pre-renderiza acá (donde hay
  // Puppeteer) y se publica sola cuando el post sale, para levantarlo en historias.
  let storyTeaserPath = null;
  if (config.meta.storyBoost && slot.post_type === 'feed' && slot.pillar !== 'repost') {
    try {
      const { url, costUsd } = await renderPostBuffer({
        format: 'story',
        template: slides ? 'educativo' : template,
        overlayTitle,
        bodyText: slides ? 'Deslizá el nuevo post del feed' : null,
        badgeText: 'NUEVO EN EL FEED',
        kicker: 'NUEVO EN EL FEED', // la plantilla educativa muestra esto en vez del badge
        productImageUrl: visualImageUrl,
        logos,
        layoutSeed: Number(slot.id) + 7,
        bgTheme: pillarDetail || slot.theme_title,
        bgBrief: imageBrief,
        bgOccasion: occasion,
      });
      storyTeaserPath = url;
      pieceCostUsd += costUsd || 0;
    } catch (err) {
      console.warn(`[generate-daily] No pude renderizar la historia de refuerzo (sigo sin ella): ${err.message}`);
    }
  }

  // El video del Reel NO se renderiza acá (ffmpeg es pesado). Lo completa
  // scripts/render-pending-reels.js corriendo en GitHub Actions.
  await pool.query(
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, format, slides, status, template, story_teaser_path, est_cost_usd, gen_model, qa_notes, sticker)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'draft', $9, $10, $11, $12, $13, $14)`,
    [slot.id, visualProduct ? visualProduct.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, format, slidesJson, slides ? 'educativo' : template, storyTeaserPath, pieceCostUsd, copy.gen_model || null, copy.qa_notes || null, copy.sticker ? JSON.stringify(copy.sticker) : null]
  );

  // Si el slot ya tenía versiones encoladas para publicar (se está regenerando una
  // pieza aprobada), esas entradas quedan obsoletas: la versión nueva es la vigente.
  const { cancelQueuedForCalendar } = require('../src/publishService');
  await cancelQueuedForCalendar(slot.id).catch(() => {});

  // Marca el slot como generado y, si no tenía objetivo (slot viejo), lo fija ahora
  // para que el panel muestre el chip coherente con el copy recién generado.
  await pool.query(
    `UPDATE content_calendar SET status = 'draft', objective = COALESCE(objective, $2) WHERE id = $1`,
    [slot.id, objective]
  );

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
  if (generatedCount > 0) {
    const { notifyPendingApproval } = require('../src/notifier');
    await notifyPendingApproval(generatedCount).catch(() => {});
  }
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

module.exports = { generateDaily, generateForSlot, pickRelevantVisualProduct, VALID_TEMPLATES };
