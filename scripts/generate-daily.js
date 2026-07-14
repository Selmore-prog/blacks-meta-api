const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const { generateCopy } = require('../src/ai');
const { renderPostBuffer } = require('../src/imageRenderer');
const { fetchProduct } = require('../src/tiendanube');
const { getBrandProfile } = require('../src/brandProfile');
const { getLogos } = require('../src/styleService');
const { getWholesaleSettings, wholesaleContext } = require('../src/wholesale');
const { getCompanyFacts, companyFactsContext } = require('../src/companyInfo');
const { getCommercialContextForDate } = require('../src/commercialDates');
const { eligibleSQL, recentlyFeaturedIds } = require('../src/productScore');
const config = require('../src/config');

// Retail (con precio y stock finito). 'mayorista' se maneja aparte con pickMayoristaProduct.
const PRODUCT_PILLARS = ['producto', 'promo'];

/**
 * Producto FIJADO a mano desde el panel (content_calendar.forced_product_id):
 * ignora toda la lógica de selección automática y usa exactamente este producto,
 * refrescando precio/stock en vivo. Si Tiendanube no lo devuelve (borrado, etc.),
 * cae a la fila cacheada.
 */
async function pickForcedProduct(productId) {
  const live = await fetchProduct(productId).catch(() => null);
  if (live) { await updateCacheFromLive(live).catch(() => {}); return live; }
  const { rows } = await pool.query('SELECT * FROM products_cache WHERE id = $1', [productId]);
  return rows[0] || null;
}

/**
 * Producto mayorista: SOLO si el ángulo del slot nombra un producto/categoría puntual
 * (ej. "Uniformes cargo para tu equipo"), igual de exigente que productFromDetail para
 * producto/promo. Si el ángulo es institucional/genérico ("condiciones mayoristas",
 * "pedí tu presupuesto", "personalización y descuentos"), NO forzamos ningún producto:
 * mejor una pieza institucional que una elegida al azar sin relación con el copy.
 * (Bug real, jul-2026: una pieza de "condiciones mayoristas" eligió al azar un
 * respirador que la marca ni siquiera vende, y el copy terminó siendo sobre eso.)
 */
async function pickMayoristaProduct(slot, excludeIds = []) {
  // Ángulo institucional (condiciones/descuentos/personalización sin prenda nombrada):
  // sin producto — la pieza es sobre el SERVICIO, no sobre una prenda puntual.
  if (isInstitutionalTopic(slot)) return null;

  const cond = `published IS NOT FALSE AND image_url IS NOT NULL AND (stock IS NULL OR price IS NULL OR price <= 0)`;
  const patterns = keywordsFromText(slot.pillar_detail);
  const mentionedBrand = mentionedBrandIn(slot.pillar_detail);
  if (patterns.length < 2 && !mentionedBrand) return null;

  const norm = (col) => `translate(lower(${col}), 'áéíóúñü', 'aeiounu')`;
  // Primero sin repetir productos recientes; si el catálogo mayorista es chico, se permite repetir.
  for (const exc of [excludeIds, []]) {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT *,
           ((CASE WHEN ${norm('name')} LIKE ANY($1) THEN 4 ELSE 0 END) +
            (CASE WHEN ${norm(`COALESCE(category, '')`)} LIKE ANY($1) THEN 2 ELSE 0 END)) AS match_score
         FROM products_cache
         WHERE ${cond} AND NOT (id = ANY($2))
       ) t
       WHERE match_score >= 4
       ORDER BY match_score DESC, sales_30d DESC NULLS LAST
       LIMIT 15`,
      [patterns.length ? patterns : ['%__never_match__%'], exc]
    );
    const picked = rankByRelevance(rows, { patterns, mentionedBrand });
    if (picked) return picked;
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
  const conds = relaxed ? ['published IS NOT FALSE', 'stock > 0', 'price IS NOT NULL', 'price > 0'] : [eligibleSQL()];
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
     LIMIT 15`,
    [patterns]
  );
  // Re-rankeo en JS: si el texto nombra una marca puntual (ej. "Gurre"), esa marca en
  // el nombre del producto pesa mucho más que las ventas (ver rankByRelevance).
  return rankByRelevance(rows, { patterns, mentionedBrand: mentionedBrandIn(slot.pillar_detail) });
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

/** Marca conocida mencionada expl\u00edcitamente en el texto (ej. "Gurre" en "Pantal\u00f3n Cargo Gurre"). */
function mentionedBrandIn(text) {
  return config.brand.knownBrands.find((b) => stripAccents(String(text || '')).toLowerCase().includes(stripAccents(b).toLowerCase()));
}

/**
 * Re-rankea candidatos de producto por relevancia REAL. El bug real que esto arregla
 * (detectado 2026-07-11): la SQL s\u00f3lo chequeaba "\u00bfmatchea ALG\u00daN patr\u00f3n?" (booleano) y
 * empataba por ventas \u2014 entonces "Pantal\u00f3n Cargo Gurre" terminaba eligiendo un Pantal\u00f3n
 * Cargo PAMPERO porque ese vend\u00eda m\u00e1s y "pantalon" solo ya alcanzaba para el mismo
 * puntaje. Ac\u00e1 se cuenta CU\u00c1NTAS palabras matchean en el nombre, y si el texto nombra
 * una marca conocida, esa marca en el nombre pesa much\u00edsimo m\u00e1s que las ventas.
 */
function rankByRelevance(rows, { patterns = [], mentionedBrand = null } = {}) {
  if (!rows.length) return null;
  const words = patterns.map((p) => stripAccents(String(p).replace(/%/g, '')).toLowerCase()).filter(Boolean);
  const brandNorm = mentionedBrand ? stripAccents(mentionedBrand).toLowerCase() : null;
  const scored = rows.map((row) => {
    const nameNorm = stripAccents(String(row.name || '')).toLowerCase();
    const wordHits = words.filter((w) => nameNorm.includes(w)).length;
    const brandHit = brandNorm && nameNorm.includes(brandNorm) ? 1 : 0;
    // El acierto de marca pesa 1000x: nunca lo tapan las ventas. Despu\u00e9s, m\u00e1s
    // palabras clave en el nombre = m\u00e1s espec\u00edfico. Ventas s\u00f3lo desempata entre iguales.
    return { row, score: brandHit * 1000 + wordHits * 10 + Math.min(Number(row.sales_30d) || 0, 50) * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].row;
}

function keywordsFromText(text) {
  return stripAccents(String(text || '').toLowerCase())
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 6)
    .map((w) => `%${w}%`);
}

function topicVisualRules(slot, rawWords = []) {
  const text = `${slot.pillar_detail || ''} ${slot.theme_title || ''}`.toLowerCase();
  const include = [];
  const exclude = [];
  const rawStems = rawWords.map((w) => stripAccents(String(w).replace(/%/g, '')));

  const add = (...words) => {
    for (const word of words) include.push(`%${word}%`);
  };
  // No baneamos una categoría si el tema la nombra explícitamente (bug real, jul-2026:
  // una pieza sobre cuidado de manos/guantes térmicos baneaba "guante" por la regla de
  // frío/invierno de más abajo, y terminó mostrando la foto de un calzado).
  const ban = (...words) => {
    for (const word of words) {
      const stem = stripAccents(word);
      const namedExplicitly = rawStems.some((rw) => rw.includes(stem) || stem.includes(rw));
      if (!namedExplicitly) exclude.push(`%${word}%`);
    }
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
  // SOLO si el tema nombra "uniformes" explícitamente. Antes bastaba "empresa" o
  // "mayorista" para inyectar prendas genéricas como candidatas — así una pieza
  // institucional de "condiciones mayoristas" terminó con la foto de un pantalón
  // suelto sin relación (bug real, jul-2026).
  if (/uniform/i.test(text)) {
    add('camisa', 'chomba', 'mameluco', 'conjunto');
  }

  return { include, exclude };
}

/**
 * Tema INSTITUCIONAL: la pieza habla del servicio/las condiciones de la empresa
 * (descuentos, presupuesto, personalización, envíos, quiénes somos), no de una
 * prenda. Ahí NO va foto de producto elegida por keywords: la tarjeta institucional
 * limpia de la marca comunica mejor que una prenda suelta sin relación.
 */
function isInstitutionalTopic(slot) {
  const text = `${slot.pillar_detail || ''} ${slot.theme_title || ''}`;
  const institutional = /(condicion|descuento|beneficio|presupuesto|personalizaci|bordado|estampado|factura|env[ií]o|cuota|financiaci|quienes somos|qui[eé]nes somos|trayectoria|devoluci|cambio)/i.test(text);
  // Si además nombra una prenda/calzado puntual, el producto SÍ es parte del mensaje.
  const namesGarment = /(camper|buzo|remera|chomba|camisa|pantal|mameluco|chaleco|botin|bot[ií]n|zapato|calzado|alpargata|guante|uniform)/i.test(text);
  return institutional && !namesGarment;
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
  // Piezas institucionales (condiciones/beneficios/servicio) sin prenda nombrada:
  // sin foto. Mejor la tarjeta limpia que un producto random matcheado por keywords.
  if (isInstitutionalTopic(slot)) return null;

  const rawWords = [...keywordsFromText(slot.pillar_detail), ...keywordsFromText(slot.theme_title)];
  const rules = topicVisualRules(slot, rawWords);
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
       WHERE published IS NOT FALSE
         AND image_url IS NOT NULL
         AND ${poolFilter}
         AND NOT (${norm('name')} LIKE ANY($2) OR ${norm(`COALESCE(category, '')`)} LIKE ANY($2))
     ) t
     WHERE relevance_score >= 3
     ORDER BY relevance_score DESC, sales_30d DESC NULLS LAST, stock DESC NULLS LAST
     LIMIT 20`,
    params
  );
  // Re-rankeo en JS: si el texto nombra una marca puntual, esa marca en el nombre
  // pesa mucho más que las ventas — evita mostrar la foto de OTRA marca (bug real:
  // "Pantalón Cargo Gurre" mostrando un Pampero porque ese vendía más).
  return rankByRelevance(rows, { patterns: include, mentionedBrand: mentionedBrandIn(`${slot.pillar_detail || ''} ${slot.theme_title || ''}`) });
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

const { TEMPLATES: VALID_TEMPLATES, TEMPLATE_INFO } = require('../src/imageRenderer');

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

// Eyebrow (kicker) por pilar: la etiqueta chica en mayúscula que va ARRIBA del titular
// en las plantillas editoriales (magazine/stackedcards/blueprint). Sin esto, 'magazine'
// caía al default 'NOTA DE TAPA', que en una pieza de marca/ugc/mayorista queda fuera de
// lugar (feedback real, jul-2026). Son etiquetas de CATEGORÍA, nunca afirmaciones (no
// dicen "líderes" ni cifras). educativo se omite a propósito: sus plantillas ya traen
// un default contextual bueno ('PARA SABER' / 'GUÍA TÉCNICA').
const PILLAR_KICKER = {
  producto: 'DESTACADO',
  promo: 'APROVECHÁ',
  marca: 'BLACKS INDUMENTARIA',
  ugc: 'BLACKS EN ACCIÓN',
  engagement: 'PARTICIPÁ',
  mayorista: 'PARA EMPRESAS',
};

/**
 * Plantillas CANDIDATAS para el slot: el pool del pilar filtrado por lo que el producto
 * puede sostener (fotos/descripción reales disponibles). Lo usa tanto la rotación por
 * seed como el cerebro (IA de copy), que elige entre estas la que mejor le queda.
 * Devuelve [] para reels (tienen tratamiento propio en chooseTemplate).
 */
function templateCandidates(slot, { visualProduct } = {}) {
  if (slot.post_type === 'reel') return [];
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
  return pool.length ? pool : ['fullbleed'];
}

/**
 * Plantilla visual: override manual > elección del cerebro (aiPick, si es una candidata
 * válida) > rotación por seed del slot > fullbleed. La rotación garantiza que, sin
 * elección de IA, la misma combinación pilar+producto no repita siempre el mismo diseño.
 */
function chooseTemplate(slot, { override, visualProduct, aiPick } = {}) {
  if (VALID_TEMPLATES.includes(override)) return override;
  // La plantilla 'educativo' es una tarjeta tipográfica CON MUCHO texto y una foto
  // chica de apoyo: pensada para feed/carrusel estático. En un Reel (post_type='reel')
  // se ve casi vacía (el video ocupa toda la pantalla, no una tarjeta) — ahí conviene
  // una plantilla de foto a pantalla completa, sin importar el pilar.
  if (slot.post_type === 'reel') {
    return slot.pillar === 'mayorista' ? 'mayorista' : (Number(slot.id) % 2 === 0 ? 'fullbleed' : 'promo');
  }

  const candidates = templateCandidates(slot, { visualProduct });
  // El cerebro eligió una plantilla entre las candidatas válidas: la respetamos.
  if (aiPick && candidates.includes(aiPick)) return aiPick;
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

/**
 * Renderiza UNA toma del carrusel según su tipo. Es reutilizable: lo usa la generación
 * completa (generateForSlot) y la regeneración de un solo slide (endpoint del panel).
 * `ctx` trae todo lo compartido de la pieza (fotos reales, tema, logos, formato, etc.).
 * Devuelve { url, costUsd, cleanImageUrl } (como renderPostBuffer).
 */
async function renderCarouselShot(shot, i, ctx) {
  const { refImgs, visualImageUrl, sceneTheme, format, logos, occasion, couponCode, overlayTitle, badgeText, imageBrief, pillar, slotId, product } = ctx;
  const refUrl = refImgs.length ? (refImgs[shot.photoIndex] || refImgs[i % refImgs.length]) : visualImageUrl;

  // BENTO de variantes de color: collage (grid) con foto real de cada color, sin IA.
  if (shot.shotType === 'variantes') {
    const bento = [shot.photoIndex, ...(shot.extraPhotos || [])].map((idx) => refImgs[idx]).filter(Boolean).slice(0, 4);
    return renderPostBuffer({
      format, template: 'grid',
      overlayTitle: shot.overlay || 'También en otros colores',
      productImageUrls: bento.length ? bento : [refUrl],
      productImageUrl: bento[0] || refUrl,
      logos, showBrand: i === 0, layoutSeed: Number(slotId) + i * 13,
    });
  }

  // CIERRE CTA (feed): foto linda full-bleed + llamado a la acción y beneficios, SIN precio.
  if (shot.shotType === 'cta') {
    return renderPostBuffer({
      format, template: 'fullbleed',
      overlayTitle: shot.overlay || config.brand.ctaHeadline,
      ctaHeadline: config.brand.ctaHeadline,
      ctaBenefits: config.brand.ctaBenefits,
      productImageUrl: refUrl, coverImage: true,
      logos, showBrand: false, layoutSeed: Number(slotId) + i * 13,
    });
  }

  // PRECIO (sólo historias): foto real full-bleed + bloque de precio.
  if (shot.shotType === 'price') {
    return renderPostBuffer({
      format, template: 'fullbleed', overlayTitle: shot.overlay || null,
      price: product && product.price, promoPrice: product && product.promo_price,
      productImageUrl: refUrl, coverImage: true,
      logos, showBrand: false, couponCode,
    });
  }

  // Hero/contexto → escena IA de estudio (full-bleed). Detalle/flatlay → FOTO REAL directa
  // full-bleed (imposible que la IA invente algo en el producto). Overlay atado a la foto.
  const detailRealPhoto = ['detalle', 'flatlay'].includes(shot.shotType);
  const overlay = shot.overlay || (i === 0 ? overlayTitle : null);
  const slideBrief = [imageBrief, shot.focus].filter(Boolean).join(' — ').slice(0, 500);
  const slideBadge = badgeText || shot.badge || null;
  return renderPostBuffer({
    format, template: 'fullbleed',
    overlayTitle: overlay,
    badgeText: i === 0 ? slideBadge : null,
    productImageUrl: refUrl,
    productImageUrls: refImgs.filter((u) => u !== refUrl).slice(0, 3),
    logos, showBrand: i === 0, layoutSeed: Number(slotId) + i * 13,
    useAiProductScene: !detailRealPhoto && Boolean(refUrl) && pillar !== 'repost',
    coverImage: detailRealPhoto,
    shotSpec: { shotType: shot.shotType, focus: shot.focus, background: shot.background },
    bgTheme: sceneTheme, bgBrief: slideBrief, bgOccasion: occasion,
  });
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
  const wholesale = isMayorista ? wholesaleContext(await getWholesaleSettings()) : null;
  // Datos verificados de la web oficial: entran a TODOS los pilares como fuente de verdad
  // (envíos, cuotas, plazos, mínimos). Best-effort: si aún no se sincronizó, va vacío y
  // la regla anti-invención del prompt igual evita que se inventen datos.
  const companyFacts = companyFactsContext(await getCompanyFacts().catch(() => null));
  const format = slot.format === 'story' ? 'story' : 'feed';
  const commercialContext = await getCommercialContextForDate(slot.scheduled_date).catch(() => null);
  // Ocasión = fechas comerciales de ESE día puntual (ej: Día de la Independencia),
  // para que la imagen refleje el festivo (bandera, colores) — no todo el rango.
  const occasion = await getCommercialContextForDate(slot.scheduled_date, { daysAhead: 0 }).catch(() => null);
  const recentIds = await recentlyFeaturedIds().catch(() => []);
  const recentPieces = await recentPieceSummaries().catch(() => []);
  const isCarousel = Boolean(slot.carousel) && format === 'feed'; // los carruseles de la API de Meta son de feed

  // ============ DIRECTOR CREATIVO (análisis previo de la pieza) ============
  // Antes de elegir producto/foto/plantilla con heurísticas, una IA analiza QUÉ ES la
  // pieza (producto / institucional / tema), decide si lleva producto y CUÁL exacto
  // (validado contra el catálogo real), el tratamiento visual y la plantilla. Es una
  // llamada de texto (gratis). Best-effort: si falla, plan = null y sigue la lógica
  // clásica de siempre. Ver el flujo completo en src/creativeDirector.js.
  let directorPlan = null;
  if (!noProductBrief && !slot.forced_product_id) {
    try {
      const { planPiece } = require('../src/creativeDirector');
      const planTemplateOptions = (!isCarousel && slot.post_type !== 'reel' && !overrides.template)
        ? (PILLAR_TEMPLATE_POOL[slot.pillar] || ['fullbleed', 'minimal']).map((t) => ({ name: t, desc: TEMPLATE_INFO[t] || '' }))
        : [];
      directorPlan = await planPiece({
        slot: effectiveSlot, wholesale, companyFacts, recentPieces,
        templateOptions: planTemplateOptions, occasion, excludeIds: recentIds,
      });
      if (directorPlan) {
        console.log(`[generate-daily] Director creativo · slot #${slot.id}: focus=${directorPlan.focus} visual=${directorPlan.visual} producto=${directorPlan.product ? `#${directorPlan.product.id} "${directorPlan.product.name}"` : 'ninguno'} plantilla=${directorPlan.template || '(rota)'}${directorPlan.reason ? ` · ${directorPlan.reason}` : ''}`);
      }
    } catch (err) {
      console.warn(`[generate-daily] Director creativo no disponible (sigo con heurísticas): ${err.message}`);
    }
  }

  // Producto protagonista:
  //  - fijado a mano desde el panel: manda sobre todo.
  //  - director: su elección validada, refrescada EN VIVO de Tiendanube.
  //  - REGLA DE ORO: si el director ANALIZÓ el slot y decidió "ningún candidato coincide"
  //    (product null), se respeta A RAJATABLA — en TODOS los pilares. Prohibido caer a la
  //    heurística ciega (ventas/keywords): elegiría justo el producto sin relación que el
  //    director descartó (el bug del pantalón). La pieza sale institucional/limpia.
  //  - la heurística clásica queda SOLO para cuando el director en sí falló (red/API).
  let product = null;
  if (!noProductBrief) {
    if (slot.forced_product_id) {
      product = await pickForcedProduct(slot.forced_product_id);
    } else if (directorPlan && directorPlan.product && (isMayorista || PRODUCT_PILLARS.includes(slot.pillar))) {
      product = await pickForcedProduct(directorPlan.product.id); // refresca precio/stock en vivo
    } else if (directorPlan && !directorPlan.product) {
      product = null; // decisión del director: mejor sin producto que con el equivocado
    } else if (!directorPlan) {
      product = isMayorista
        ? await pickMayoristaProduct(effectiveSlot, recentIds)
        : (PRODUCT_PILLARS.includes(slot.pillar) ? await pickProductForSlot(effectiveSlot) : null);
    }
  }

  // Ancla visual: qué foto acompaña la pieza.
  //  - director 'tarjeta_sin_foto' / 'ilustracion': SIN foto de producto (una tarjeta
  //    institucional limpia comunica mejor que una prenda sin relación — bug real).
  //  - director con producto para pilares de tema: esa foto como ilustración.
  //  - sin director: heurística clásica (match fuerte o nada).
  let visualProduct = null;
  if (!noProductBrief) {
    if (directorPlan && ['tarjeta_sin_foto', 'ilustracion'].includes(directorPlan.visual)) {
      visualProduct = null;
    } else if (product) {
      visualProduct = product;
    } else if (directorPlan && directorPlan.product) {
      // Pilar de tema (educativo/marca/ugc/engagement): el producto del director es
      // sólo ancla visual. Fila completa de la DB (el plan trae la versión liviana).
      const { rows } = await pool.query('SELECT * FROM products_cache WHERE id = $1', [directorPlan.product.id]);
      visualProduct = rows[0] || null;
    } else if (!directorPlan) {
      visualProduct = await pickRelevantVisualProduct(effectiveSlot);
    }
  }

  // Foto REAL y coherente: producto principal o producto visual con match fuerte.
  // No usamos fallback estacional/random porque puede contradecir el copy.
  const visualImageUrl = visualProduct ? visualProduct.image_url : null;

  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));

  // Plantillas candidatas para que el cerebro elija la que mejor le queda a ESTA pieza
  // (formato de imagen según el mensaje). Sólo aplica a piezas simples (no carrusel, no
  // reel: esos tienen tratamiento propio) y sin override manual. Es gratis: viaja en la
  // misma llamada del copy. Si el director YA eligió plantilla, no se vuelve a pedir.
  const canPickTemplate = !isCarousel && slot.post_type !== 'reel' && !overrides.template && !(directorPlan && directorPlan.template);
  const templateOptions = canPickTemplate
    ? templateCandidates(effectiveSlot, { visualProduct }).map((t) => ({ name: t, desc: TEMPLATE_INFO[t] || '' }))
    : null;

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
    companyFacts,
    // El cerebro elige la plantilla entre estas candidatas (o null = rota por seed).
    templateOptions,
    // Ángulo decidido por el director creativo: el copy lo desarrolla.
    directorNotes: directorPlan ? directorPlan.copyAngle : null,
    carousel: isCarousel,
    // Educativo/mayorista: el carrusel es una guía paso a paso (más slides).
    slideCount: isCarousel && ['educativo', 'mayorista'].includes(slot.pillar) ? 5 : 3,
    commercialContext,
    topCaptions: await topPerformingCaptions().catch(() => []),
    recentPieces,
  });

  // ============ AUDITORÍA FACTUAL (fase QA del director) ============
  // El lint atrapa frases de IA; esto atrapa DATOS inventados (materiales, cuotas,
  // plazos, montos) comparando el copy contra el producto/condiciones/web reales.
  // Corrige el texto en el momento y lo deja registrado en qa_notes. Best-effort.
  try {
    const { reviewCopyFacts } = require('../src/creativeDirector');
    const audit = await reviewCopyFacts({
      copy,
      // El ancla visual también cuenta: su descripción real es la fuente contra la
      // que se chequea cualquier característica que el copy le atribuya.
      product: product || visualProduct,
      wholesale,
      companyFacts,
    });
    if (!audit.ok && audit.fixed) {
      if (audit.fixed.caption) copy.caption = audit.fixed.caption;
      if (audit.fixed.overlay) copy.overlay = audit.fixed.overlay;
      if (audit.fixed.story_points) copy.story_points = audit.fixed.story_points;
      const note = `auditoría factual corrigió: ${(audit.issues || []).join(' · ') || 'afirmaciones sin respaldo'}`;
      copy.qa_notes = copy.qa_notes ? `${copy.qa_notes} · ${note}` : note;
      console.warn(`[generate-daily] ${note} (slot #${slot.id})`);
    }
  } catch (err) {
    console.warn(`[generate-daily] Auditoría factual falló (sigo): ${err.message}`);
  }

  const badgeText = slot.pillar === 'mayorista' ? 'MAYORISTA' : null;
  const overlayTitle = copy.overlay || (product ? product.name : pillarDetail || slot.theme_title || slot.pillar);
  // Cupón detectado en el brief o el copy (ej: ARGENTINA10) -> va como texto en la plantilla.
  const couponCode = extractCoupon(`${pillarDetail || ''} \n ${copy.caption || ''} \n ${copy.cta || ''}`);
  // Brief para la imagen IA: indicaciones del plan + nota visual del director + gancho
  // del copy, para que la escena tenga sentido con el mensaje (no una foto genérica).
  const imageBrief = [pillarDetail, directorPlan && directorPlan.imageNote, copy.overlay].filter(Boolean).join(' — ').slice(0, 500);
  // REGLA: el precio va sólo en HISTORIAS (efímeras). El feed queda evergreen (sin precio
  // que envejezca). Reels tampoco llevan precio en el copy visual.
  const showPrice = format === 'story' && slot.post_type !== 'reel';

  // Plantilla visual: override manual > elección del director creativo > elección del
  // cerebro del copy > pool del pilar filtrado por fotos reales > variedad por seed.
  const template = chooseTemplate(effectiveSlot, { override: overrides.template, visualProduct, aiPick: (directorPlan && directorPlan.template) || copy.template });

  let imagePath;
  let slidesJson = null;
  let slidesMetaJson = null; // receta de cada slide del carrusel (para regenerar uno solo)
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
  if (slides && isStepCarousel) {
    // Carrusel GUÍA (educativo/mayorista): pasos tipográficos SIN foto de producto
    // (una guía no necesita mostrar el producto en cada slide), y si el tema es de
    // talles/medidas y el producto tiene su guía real en Tiendanube, va como slide extra.
    const topicText = `${pillarDetail || ''} ${slot.theme_title || ''} ${slides.map((s) => s.title).join(' ')}`;
    const sizeChart = /talle|medida|calce|guia|guía/i.test(topicText)
      ? descriptionImages(visualProduct)[0] || null : null;

    const urls = [];
    for (let i = 0; i < slides.length; i += 1) {
      const { url, costUsd } = await renderPostBuffer({
        format,
        template: 'educativo',
        overlayTitle: slides[i].title || overlayTitle,
        bodyText: slides[i].text || null,
        // Sin contador N/total en la imagen: Instagram ya muestra los puntitos del carrusel.
        kicker: slot.pillar === 'mayorista' ? 'PARA EMPRESAS' : 'PARA SABER',
        badgeText: i === 0 ? badgeText : null,
        productImageUrl: i === 0 ? visualImageUrl : null, // pasos limpios, foto sólo en la portada
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
  } else if (slides) {
    // Carrusel FOTOGRÁFICO (producto/promo/marca/ugc/engagement): un DIRECTOR DE ARTE
    // con IA (planCarouselShots) diseña primero qué muestra cada slide — tipo de toma
    // (hero/detalle/contexto), qué característica REAL enfatizar, qué foto real usar y
    // cuánto fondo — y recién después se genera cada imagen según ese plan. Así cada
    // pieza sale pensada para SU producto, con foco en el producto (no tanto fondo) y
    // usando todas las fotos reales, en vez de repetir la misma escena.
    const refImgs = (visualProduct && Array.isArray(visualProduct.images) && visualProduct.images.length)
      ? visualProduct.images : (visualImageUrl ? [visualImageUrl] : []);
    const sceneTheme = product
      ? `${product.name}${product.category ? ` (${product.category})` : ''}`
      : [pillarDetail || slot.theme_title, copy.overlay].filter(Boolean).join(' — ');

    // Marca del producto (para aclararla SIEMPRE en la hero): la que aparezca en el nombre.
    const brandName = mentionedBrandIn(product ? product.name : (visualProduct && visualProduct.name) || '');

    // El cerebro planifica las tomas viendo las fotos reales. Best-effort: si falla,
    // caemos a un plan simple derivado de los slides del copy.
    let shotPlan = null;
    try {
      const { planCarouselShots, describeProductPhotos } = require('../src/ai');
      // Visión: el cerebro VE qué muestra cada foto real (ángulo, detalle, COLOR) antes de
      // planificar — elige la foto correcta para cada slide, mantiene el color consistente
      // y arma el bento de variantes con los otros colores.
      const photoDescriptions = await describeProductPhotos(refImgs.slice(0, 10)).catch(() => []);
      // Cuántas tomas: hero + 2 detalle + cierre CTA, +1 si hay 2+ colores (slide bento).
      const distinctColors = new Set(photoDescriptions.map((d) => d.color).filter(Boolean)).size;
      const targetShots = Math.min(6, 4 + (distinctColors >= 2 ? 1 : 0));
      shotPlan = await planCarouselShots({
        productName: product ? product.name : sceneTheme,
        productDescription: (product && product.description) || (visualProduct && visualProduct.description),
        brief: imageBrief,
        pillar: slot.pillar,
        occasion,
        slideCount: targetShots,
        photoCount: Math.max(refImgs.length, 1),
        objective,
        photoDescriptions,
        format,
        brandName,
      });
    } catch (err) {
      console.warn(`[generate-daily] Director de arte no disponible (uso plan simple): ${err.message}`);
    }

    let plan = (shotPlan && shotPlan.length)
      ? shotPlan
      : slides.map((_, i) => ({ shotType: i === 0 ? 'hero' : 'detalle', focus: '', photoIndex: refImgs.length ? i % refImgs.length : 0, extraPhotos: [], background: 'sutil', overlay: null, badge: null }));

    // Feed evergreen: garantizamos un slide de CIERRE con CTA (sin precio). Si el cerebro
    // no lo puso, lo agregamos con una foto real no usada todavía (nunca repetir foto).
    const isFeedFmt = format !== 'story';
    if (isFeedFmt && !plan.some((s) => s.shotType === 'cta')) {
      const usedIdx = new Set(plan.flatMap((s) => [s.photoIndex, ...(s.extraPhotos || [])]));
      let freeIdx = 0; while (freeIdx < refImgs.length && usedIdx.has(freeIdx)) freeIdx += 1;
      plan = [...plan, { shotType: 'cta', focus: '', photoIndex: freeIdx < refImgs.length ? freeIdx : 0, extraPhotos: [], background: 'limpio', overlay: null, badge: null }];
    }

    // STORY (efímero): el precio SÍ puede ir como slide de cierre, con una foto real no usada.
    if (!isFeedFmt && product && ['producto', 'promo'].includes(slot.pillar) && Number(product.price) > 0) {
      const usedIdx = new Set(plan.flatMap((s) => [s.photoIndex, ...(s.extraPhotos || [])]));
      let freeIdx = 0; while (freeIdx < refImgs.length && usedIdx.has(freeIdx)) freeIdx += 1;
      plan = [...plan, { shotType: 'price', focus: '', photoIndex: freeIdx < refImgs.length ? freeIdx : 0, extraPhotos: [], background: 'limpio', overlay: null, badge: null }];
    }

    // Contexto compartido de la pieza: lo usa renderCarouselShot (y la regeneración de 1 slide).
    const ctx = { refImgs, visualImageUrl, sceneTheme, format, logos, occasion, couponCode, overlayTitle, badgeText, imageBrief, pillar: slot.pillar, slotId: slot.id, product };

    // En paralelo (memoria acotada por el navegador compartido + semáforo de imageRenderer).
    const slideResults = await Promise.all(plan.map((shot, i) => renderCarouselShot(shot, i, ctx)));
    const urls = slideResults.map((r) => r.url);
    pieceCostUsd += slideResults.reduce((sum, r) => sum + (r.costUsd || 0), 0);

    imagePath = urls[0];
    slidesJson = JSON.stringify(urls);
    slidesMetaJson = JSON.stringify(plan); // receta de cada slide, para regenerar UNO solo
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
      // Eyebrow por pilar (magazine/stackedcards): evita el 'NOTA DE TAPA' fuera de lugar.
      kicker: PILLAR_KICKER[slot.pillar],
      // Historias: puntos cortos con datos reales impresos SOBRE la imagen (el caption
      // de una historia casi no se ve — la info tiene que estar en la pieza).
      storyPoints: format === 'story' && !isReel && Array.isArray(copy.story_points) ? copy.story_points.slice(0, 3) : null,
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
      // Ilustración didáctica: educativo sin guía real ni foto, o cuando el director
      // creativo decidió que el tema se explica mejor dibujado que fotografiado.
      useAiDiagram: (isEducativo || (directorPlan && directorPlan.visual === 'ilustracion')) && !realSizeChart && !visualImageUrl,
      diagramTopic: pillarDetail || slot.theme_title,
      // Piezas SIN foto de catálogo: fondo original generado con IA (marca, engagement...).
      // Si el director pidió TARJETA limpia, NO se gasta en fondo IA: la tarjeta
      // tipográfica de la marca ya comunica (nada se genera "porque sí").
      useAiBackground: !isReel && !visualImageUrl && !isEducativo && slot.pillar !== 'repost'
        && !(directorPlan && directorPlan.visual === 'tarjeta_sin_foto'),
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
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, format, slides, status, template, story_teaser_path, est_cost_usd, gen_model, qa_notes, sticker, slides_meta)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'draft', $9, $10, $11, $12, $13, $14, $15)`,
    [slot.id, visualProduct ? visualProduct.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, format, slidesJson, slides ? 'educativo' : template, storyTeaserPath, pieceCostUsd, copy.gen_model || null, copy.qa_notes || null, copy.sticker ? JSON.stringify(copy.sticker) : null, slidesMetaJson]
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

/**
 * Regenera UN SOLO slide de un carrusel (sin rehacer los demás), con correcciones
 * opcionales: `overlay` (texto exacto a poner) e `instructions` (indicación libre que
 * ajusta la imagen). Reconstruye el contexto desde el asset + producto + slot guardados.
 * Devuelve { slides, image_path } actualizado. El panel llama a esto por slide.
 */
async function regenerateSlide({ assetId, index, overlay, instructions }) {
  const { rows } = await pool.query(
    `SELECT a.*, c.pillar, c.pillar_detail, c.theme_title, c.scheduled_date, c.format AS slot_format
     FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [assetId]
  );
  const asset = rows[0];
  if (!asset) throw new Error('No existe el asset.');
  const urls = Array.isArray(asset.slides) ? [...asset.slides] : (asset.slides ? JSON.parse(asset.slides) : []);
  if (!urls.length) throw new Error('Esta pieza no es un carrusel (no tiene slides).');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= urls.length) throw new Error('Índice de slide inválido.');

  const meta = Array.isArray(asset.slides_meta) ? asset.slides_meta : (asset.slides_meta ? JSON.parse(asset.slides_meta) : null);
  // Receta de ESE slide (o una por defecto si la pieza es vieja y no tiene slides_meta).
  const shot = (meta && meta[i]) ? { ...meta[i] } : { shotType: i === 0 ? 'hero' : 'detalle', photoIndex: i, extraPhotos: [], background: 'limpio', focus: '', overlay: null, badge: null };

  // Correcciones del usuario: texto exacto del overlay y/o indicación para la imagen.
  if (typeof overlay === 'string') shot.overlay = overlay.trim() || null;
  if (instructions && String(instructions).trim()) shot.focus = `${shot.focus || ''} ${String(instructions).trim()}`.trim().slice(0, 200);
  // Variar la escena IA para que salga distinta al regenerar (fotos reales no cambian).
  shot.photoIndex = Number.isInteger(shot.photoIndex) ? shot.photoIndex : i;

  const product = asset.product_id
    ? (await pool.query('SELECT * FROM products_cache WHERE id = $1', [asset.product_id])).rows[0]
    : null;
  const refImgs = (product && Array.isArray(product.images) && product.images.length)
    ? product.images : (product && product.image_url ? [product.image_url] : []);
  const format = asset.slot_format === 'story' || asset.format === 'story' ? 'story' : 'feed';
  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));
  const occasion = await getCommercialContextForDate(asset.scheduled_date, { daysAhead: 0 }).catch(() => null);
  const sceneTheme = product ? `${product.name}${product.category ? ` (${product.category})` : ''}` : (asset.pillar_detail || asset.theme_title || '');

  const ctx = {
    refImgs,
    visualImageUrl: product ? product.image_url : (refImgs[0] || null),
    sceneTheme, format, logos, occasion,
    couponCode: extractCoupon(`${asset.pillar_detail || ''} \n ${asset.caption || ''}`),
    overlayTitle: (product && product.name) || asset.theme_title || asset.pillar_detail || '',
    badgeText: asset.pillar === 'mayorista' ? 'MAYORISTA' : null,
    imageBrief: [asset.pillar_detail, asset.theme_title].filter(Boolean).join(' — ').slice(0, 300),
    pillar: asset.pillar, slotId: asset.calendar_id, product,
  };

  const { url } = await renderCarouselShot(shot, i, ctx);
  urls[i] = url;
  if (meta) meta[i] = shot;

  await pool.query(
    `UPDATE generated_assets SET slides = $2, image_path = $3, slides_meta = $4, updated_at = now() WHERE id = $1`,
    [assetId, JSON.stringify(urls), urls[0], meta ? JSON.stringify(meta) : asset.slides_meta]
  );
  return { slides: urls, image_path: urls[0] };
}

module.exports = { generateDaily, generateForSlot, pickRelevantVisualProduct, VALID_TEMPLATES, regenerateSlide };
