const pool = require('../src/db');
const { seedCalendar, getPendingForDate } = require('../src/calendar');
const artDirection = require('../src/artDirection');
const { generateCopy } = require('../src/ai');
const { renderPostBuffer, renderPanoramaSlides } = require('../src/imageRenderer');
const { fetchProduct, productColors } = require('../src/tiendanube');
const { getBrandProfile } = require('../src/brandProfile');
const { getLogos } = require('../src/styleService');
const { getWholesaleSettings, wholesaleContext } = require('../src/wholesale');
const { getCompanyFacts, companyFactsContext } = require('../src/companyInfo');
const { getCommercialContextForDate } = require('../src/commercialDates');
const { eligibleSQL, recentlyFeaturedIds } = require('../src/productScore');
const config = require('../src/config');
const { stripEmoji, fixSpelling, shortLabel, agreeWithProduct } = require('../src/textUtils');
const { uploadAsset } = require('../src/storage');

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

/* =========================================================================
 * PIEZA A PEDIDO (sep-2026)
 *
 * Hasta ahora un slot podía fijar UN producto y un brief de texto. El pedido del dueño
 * fue poder escribir la pieza entera: "quiero un carrusel con la remera y el jean, con
 * flechas indicando el nombre de cada uno, moderno". Eso son tres cosas nuevas:
 *   forced_product_ids → varios productos elegidos a mano, en orden;
 *   visual_brief       → cómo tiene que verse la imagen, con las palabras del dueño;
 *   show_labels        → el nombre de cada prenda señalado con una flecha.
 * Todo lo demás del motor sigue igual: si no se usan, la pieza se genera como siempre.
 * ========================================================================= */

/** Ids elegidos a mano en el panel. Cae al forced_product_id viejo (una sola ficha). */
function idsPedidos(slot) {
  let lista = slot.forced_product_ids;
  if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (_) { lista = null; } }
  const ids = (Array.isArray(lista) ? lista : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length) return ids.slice(0, 4);
  const uno = Number(slot.forced_product_id);
  return Number.isFinite(uno) && uno > 0 ? [uno] : [];
}

/** Las fichas completas de esos productos, con precio y stock refrescados en vivo. */
async function pickForcedProducts(ids) {
  const out = [];
  for (const id of ids) {
    const p = await pickForcedProduct(id).catch(() => null);
    if (p) out.push(p);
  }
  return out;
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

// TEMPLATE_REQUIREMENTS vive en imageRenderer (única fuente de verdad): lo usan
// este filtro de candidatas Y la validación dura del director creativo.
const { TEMPLATES: VALID_TEMPLATES, TEMPLATE_INFO, TEMPLATE_REQUIREMENTS, extractSpecTags, extractBriefChips } = require('../src/imageRenderer');
const { reviewPiece } = require('../src/pieceBrief');

// Qué estilos tienen sentido para cada pilar — variedad real por pilar, filtrada
// después por lo que el producto puede sostener (fotos/descripción disponibles).
// Antes sólo alternaba 2 diseños por pilar; ahora rota entre +10 estilos (bento
// grid, fotos superpuestas, ficha técnica con specs reales, splitscreen, blueprint,
// portada editorial, bento de tarjetas, tira de polaroids) para que el feed no
// se sienta repetitivo/plantillero.
// 'poster' entra en los pilares donde puede NO haber un producto que mostrar (promo de
// toda la tienda, fecha comercial, anuncio de marca). Faltaba en todos los pools, así que
// el director creativo no podía elegirlo nunca: sólo se llegaba al afiche por el fallback
// de fullbleed-sin-foto, y por eso "automático" daba siempre la versión pobre.
const PILLAR_TEMPLATE_POOL = {
  // 'recorte' y 'ficha' van primeras en producto/promo a propósito: son las que sacan
  // a la prenda del rectángulo de catálogo. 'editorial' reemplaza de hecho a
  // 'educativo' (que dejaba dos tercios de la pieza en blanco liso).
  producto: ['recorte', 'ficha', 'fullbleed', 'minimal', 'grid', 'overlap', 'specsheet'],
  promo: ['recorte', 'promo', 'splitscreen', 'fullbleed', 'poster'],
  educativo: ['editorial', 'blueprint', 'educativo'],
  mayorista: ['mayorista', 'stackedcards', 'magazine', 'editorial'],
  marca: ['recorte', 'minimal', 'magazine', 'overlap', 'fullbleed', 'poster'],
  ugc: ['magazine', 'polaroidstrip', 'overlap', 'minimal'],
  engagement: ['recorte', 'fullbleed', 'splitscreen', 'minimal', 'poster'],
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
function templateCandidates(slot, { visualProduct, cutoutOk = null } = {}) {
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
    // 'recorte' y 'ficha' se apoyan ENTERAS en la silueta de la prenda: el titular pasa
    // por detrás, las guías se anclan al contorno. Si la foto no se puede recortar (foto
    // ambientada, fondo con textura, prenda blanca sobre fondo blanco) la pieza sale como
    // un rectángulo oscuro casi vacío — peor que la fullbleed que venía saliendo. Por eso
    // se descartan salvo que el recorte esté PROBADO (cutoutOk), no sólo supuesto.
    if (req.requiresCutout && cutoutOk !== true) return false;
    return true;
  });
  return pool.length ? pool : ['fullbleed'];
}

/**
 * ¿La foto principal de este producto se puede recortar? Se prueba de verdad (una vez
 * por pieza) en vez de suponerlo: el recorte es local y gratis (~150 ms), y elegir una
 * plantilla que después no puede dibujar la silueta arruina la pieza entera.
 */
async function probeCutout(visualProduct) {
  if (!visualProduct) return null;
  const url = (Array.isArray(visualProduct.images) && visualProduct.images[0])
    || visualProduct.image_url || null;
  if (!url) return null;
  try {
    const { cutoutFromUrl } = require('../src/productCutout');
    const cut = await cutoutFromUrl(url);
    // Se devuelve la CAJA además del sí/no: el brief la necesita para calcular cuánto
    // taparía la prenda al titular y decidir si el efecto es legible.
    return cut ? { ok: true, box: cut.box } : null;
  } catch (_) {
    return null;
  }
}

/**
 * Plantilla visual: override manual > elección del cerebro (aiPick, si es una candidata
 * válida) > rotación sobre las candidatas que NO se usaron hace poco > fullbleed.
 * En los tres caminos el menú viene ya filtrado por la memoria de diseño, así que
 * ninguno puede devolver la plantilla de la pieza anterior si hay alternativa.
 */
function chooseTemplate(slot, { override, visualProduct, aiPick, recientes = [], cutoutOk = null } = {}) {
  if (VALID_TEMPLATES.includes(override)) return override;
  // La plantilla 'educativo' es una tarjeta tipográfica CON MUCHO texto y una foto
  // chica de apoyo: pensada para feed/carrusel estático. En un Reel (post_type='reel')
  // se ve casi vacía (el video ocupa toda la pantalla, no una tarjeta) — ahí conviene
  // una plantilla de foto a pantalla completa, sin importar el pilar.
  if (slot.post_type === 'reel') {
    return slot.pillar === 'mayorista' ? 'mayorista' : (Number(slot.id) % 2 === 0 ? 'fullbleed' : 'promo');
  }

  const candidates = templateCandidates(slot, { visualProduct, cutoutOk });
  // El cerebro eligió una plantilla entre las candidatas válidas: la respetamos.
  if (aiPick && candidates.includes(aiPick)) return aiPick;
  // Rotación de respaldo. `slot.id % n` no garantizaba variedad: los ids no son
  // consecutivos dentro de un mismo pilar, así que salían tres fullbleed seguidas.
  // Ahora primero se descartan las plantillas de las últimas piezas.
  const frescas = artDirection.withoutRecent(candidates, recientes);
  return frescas[Number(slot.id) % frescas.length];
}

/*
 * PIEZAS DE RANKING ("lo más vendido del mes", "los favoritos", "top 5").
 *
 * Falla real: una pieza titulada "Lo más elegido de agosto" salió con la foto de UN solo
 * producto (un poncho de lluvia). El dato era cierto —es uno de los más vendidos— pero
 * una pieza que promete un ranking y muestra un producto no cumple lo que anuncia: el
 * que la ve espera una lista. Cuando el tema es un ranking, la pieza tiene que mostrar
 * VARIOS productos reales, ordenados por ventas.
 */
const TEMA_DE_RANKING = /(lo m[aá]s (vendido|elegido|buscado|pedido)|los? m[aá]s (vendidos?|elegidos?|buscados?)|favoritos?|top\s*\d|ranking|los \d+ m[aá]s|m[aá]s vendidos del mes|best\s*sellers?)/i;

function esPiezaDeRanking(slot) {
  return TEMA_DE_RANKING.test(`${slot.theme_title || ''} ${slot.pillar_detail || ''}`);
}

/** Los N productos más vendidos con foto, para armar la grilla del ranking. */
async function productosDelRanking(limite = 4) {
  const { rows } = await pool.query(
    `SELECT id, name, price, promo_price, image_url, sales_30d
       FROM products_cache
      WHERE ${eligibleSQL()} AND image_url IS NOT NULL
      ORDER BY sales_30d DESC NULLS LAST, id
      LIMIT $1`, [limite]
  );
  return rows;
}

/**
 * Saca la numeración con la que la IA prefija los títulos de slide ("1. Resistencia al
 * desgarro"). La plantilla 'editorial' ya imprime su propio número de paso, así que sin
 * esto la pieza salía numerada dos veces: el índice de la portada decía "01 · 2. Comodidad".
 */
function sinNumeroDeSlide(titulo) {
  return String(titulo || '').replace(/^\s*\d{1,2}\s*[.)\-–:]\s*/, '').trim();
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
  const { refImgs, visualImageUrl, sceneTheme, format, logos, occasion, couponCode, overlayTitle, badgeText, imageBrief, pillar, slotId, product, artMode } = ctx;
  const refUrl = refImgs.length ? (refImgs[shot.photoIndex] || refImgs[i % refImgs.length]) : visualImageUrl;

  /*
   * CADA CUADRO ES UNA ESCENA GENERADA A PARTIR DE SU PROPIA FOTO DE TIENDANUBE.
   *
   * Pedido del dueño (11-sep): "que cada imagen del carrusel, sea continuo o no, sea
   * generativa basándose en cada una de las fotos de Tiendanube: generativo de una pose,
   * generativo de otra y así".
   *
   * Antes sólo se generaban los cuadros 'hero' y 'contexto'; 'detalle', 'flatlay' y el
   * cierre iban con la foto de catálogo tal cual, a sangre. Eso dejaba el carrusel mitad
   * campaña y mitad e-commerce, y los cuadros de foto cruda son los que se leen como
   * "pegados". Ahora genera todos, y cada uno se ancla a la foto que el director de arte
   * le asignó (shot.photoIndex): la pose sale del catálogo real, no de la imaginación.
   *
   * La excepción es 'variantes', que es un collage con UNA FOTO REAL POR COLOR: ahí las
   * fotos reales son el contenido (mostrar los colores que hay), no el fondo.
   *
   * Con arte "sólo fotos reales" no se genera nada, que es justamente para lo que está.
   * Cada cuadro cuesta ~US$0,04; el tope diario de gasto sigue cortando por lo sano y,
   * cuando corta, el cuadro sale con la foto real (que es lo que hacía siempre).
   */
  const generarEscena = artMode !== 'foto' && artMode !== 'tipografica' && pillar !== 'repost' && Boolean(refUrl);
  // Las demás fotos del producto viajan como referencia de detalle: bajan la chance de que
  // el modelo reinvente costuras o etiquetas, y NO tocan la pose (ver generateProductScene).
  const otrasFotos = refImgs.filter((u) => u !== refUrl).slice(0, 3);

  // BENTO de variantes de color: collage (grid) con foto real de cada color, sin IA.
  // `extraUrls` son fotos que NO están en las del producto (otros colores que en
  // Tiendanube son productos hermanos: "…Beige" / "…Verde"); las agrega la corrección
  // cuando el dueño pide ver TODOS los colores y las fotos propias no alcanzan.
  if (shot.shotType === 'variantes') {
    const byIndex = [shot.photoIndex, ...(shot.extraPhotos || [])].map((idx) => refImgs[idx]).filter(Boolean);
    const bento = [...new Set([...byIndex, ...(shot.extraUrls || []).filter(Boolean)])].slice(0, MAX_BENTO);
    return renderPostBuffer({
      format, template: 'grid',
      overlayTitle: shot.overlay || 'También en otros colores',
      productImageUrls: bento.length ? bento : [refUrl],
      productImageUrl: bento[0] || refUrl,
      logos, showBrand: i === 0, layoutSeed: Number(slotId) + i * 13,
    });
  }

  // CIERRE CTA (feed): foto linda full-bleed + llamado a la acción y beneficios, SIN precio.
  // El titular sale del texto de marca, PERO concordado con el producto de la pieza: el
  // "Conseguilas en la web" fijo quedaba en femenino sobre un pantalón (bug real,
  // ago-2026). Si el dueño escribió el texto a mano (overlayByUser), se respeta tal cual.
  if (shot.shotType === 'cta') {
    // Un titular de cierre es corto. Si el overlay guardado es una frase larga (una pieza
    // vieja donde el dueño escribió el PEDIDO en el campo de texto), se usa el de marca.
    const overlayHead = shot.overlay && String(shot.overlay).length <= 45 ? shot.overlay : null;
    // Texto escrito por el dueño: se imprime tal cual. Cualquier otro (el de marca o el
    // que puso la IA) se concuerda con el producto de la pieza.
    const head = (shot.overlayByUser && overlayHead)
      ? overlayHead
      : agreeWithProduct(overlayHead || config.brand.ctaHeadline, (product && product.name) || sceneTheme);
    return renderPostBuffer({
      format, template: 'fullbleed',
      overlayTitle: head,
      ctaHeadline: head,
      ctaBenefits: config.brand.ctaBenefits,
      productImageUrl: refUrl,
      productImageUrls: otrasFotos,
      coverImage: true,
      logos, showBrand: false, layoutSeed: Number(slotId) + i * 13,
      useAiProductScene: generarEscena,
      // El cierre es una toma en contexto: la prenda en uso, con aire abajo para el botón.
      shotSpec: { shotType: 'contexto', focus: 'la prenda en uso, en una escena de trabajo real', background: 'contexto' },
      bgTheme: sceneTheme, bgBrief: imageBrief, bgOccasion: occasion,
    });
  }

  // PRECIO (sólo historias): foto real full-bleed + bloque de precio.
  if (shot.shotType === 'price') {
    return renderPostBuffer({
      format, template: 'fullbleed', overlayTitle: shot.overlay || null,
      price: product && product.price, promoPrice: product && product.promo_price,
      productImageUrl: refUrl,
      productImageUrls: otrasFotos,
      coverImage: true,
      logos, showBrand: false, couponCode,
      useAiProductScene: generarEscena,
      shotSpec: { shotType: 'hero', focus: 'el producto entero, listo para el bloque de precio', background: 'sutil' },
      bgTheme: sceneTheme, bgBrief: imageBrief, bgOccasion: occasion,
      layoutSeed: Number(slotId) + i * 13,
    });
  }

  /*
   * Hero, contexto, detalle y flatlay: los cuatro salen como escena generada a partir de SU
   * foto. Cuando la generación SÍ sale, la escena va a sangre sola (es el fondo del
   * lienzo), así que `coverImage` sólo decide cómo se encuadra la FOTO REAL en el caso en
   * que no salga —tope de gasto, modo "sólo fotos reales"—. Ahí se conserva el criterio de
   * siempre: los detalles y los flat-lay a sangre (son primeros planos, llenan bien el
   * cuadro) y el resto contenido, porque una foto de estudio sobre fondo blanco estirada a
   * sangre deja medio lienzo en blanco.
   */
  const detailRealPhoto = ['detalle', 'flatlay'].includes(shot.shotType);
  const overlay = shot.overlay || (i === 0 ? overlayTitle : null);
  const slideBrief = [imageBrief, shot.focus].filter(Boolean).join(' — ').slice(0, 500);
  const slideBadge = badgeText || shot.badge || null;
  return renderPostBuffer({
    format, template: 'fullbleed',
    overlayTitle: overlay,
    badgeText: i === 0 ? slideBadge : null,
    productImageUrl: refUrl,
    productImageUrls: otrasFotos,
    logos, showBrand: i === 0, layoutSeed: Number(slotId) + i * 13,
    useAiProductScene: generarEscena,
    coverImage: detailRealPhoto,
    shotSpec: { shotType: shot.shotType, focus: shot.focus, background: shot.background },
    bgTheme: sceneTheme, bgBrief: slideBrief, bgOccasion: occasion,
  });
}

/* ============ CARRUSEL CONTINUO (la tira) ============ */

/** Antetítulo de cada cuadro según el tipo de toma. Corto, en mayúsculas, sin adornos. */
const KICKER_POR_TOMA = {
  hero: 'EL MODELO',
  detalle: 'EL DETALLE',
  contexto: 'EN USO',
  flatlay: 'LA PRENDA',
  variantes: 'LOS COLORES',
  price: 'EL PRECIO',
  cta: 'LLEVATELA',
};

/*
 * ANTETÍTULOS EN MODO ESCENA. Los de arriba nombran lo que se ve en ESE cuadro ("EL
 * DETALLE", "LOS COLORES") porque en la tira de recortes cada cuadro tiene su propia foto.
 * En la tira generativa no: la foto es una sola y hacia la derecha el espacio se vacía a
 * propósito, para dejar lugar al texto. Ahí un "EL DETALLE" encima de un taller vacío
 * promete algo que no está — se vio en la primera pieza real (un titular "COSTURAS
 * REFORZADAS" con el antetítulo "EL DETALLE" sobre un plano sin prenda).
 *
 * Entonces en modo escena el antetítulo deja de describir la foto y pasa a ordenar la
 * lectura: el titular sigue siendo la afirmación que era, pero ya no se lee como un
 * epígrafe de algo que no se ve.
 */
const KICKER_ESCENA = ['EL MODELO', 'POR QUÉ', 'Y ADEMÁS'];

/** Titular corto para la portada cuando el director de arte no dejó overlay. */
function tituloCorto(texto, palabras = 4) {
  return String(texto || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, palabras).join(' ');
}

/**
 * QUÉ TRES FOTOS LE MANDAMOS A LA TIRA.
 *
 * En la tira hay tres personas y cada una saca su pose y su color de UNA referencia
 * distinta (ver generatePanoramaScene). Si le pasamos las cuatro primeras fotos del
 * catálogo tal como vienen, lo más probable es que sean cuatro tomas del MISMO color —
 * las fichas de Tiendanube arrancan siempre con el color principal— y la tira sale con
 * tres personas vestidas igual, que es lo que se venía tratando de evitar.
 *
 * Entonces se eligen a mano, con lo que ya vio la visión al catalogar las fotos
 * (describeProductPhotos): primero una por cada COLOR distinto, y después se completa con
 * las que queden. Se descartan los primeros planos: un zoom de una costura no sirve para
 * saber cómo le queda puesta a una persona.
 *
 * Sin descripciones (la visión no corrió o falló) devuelve las primeras, que es
 * exactamente lo que hacía antes: nunca empeora, a lo sumo no mejora.
 */
function fotosParaLaTira(refImgs, photoDescriptions = [], cuantas = 3) {
  const fotos = (refImgs || []).filter(Boolean);
  if (fotos.length <= cuantas) return fotos;
  const desc = Array.isArray(photoDescriptions) ? photoDescriptions : [];
  if (!desc.length) return fotos.slice(0, cuantas);

  const info = (i) => desc.find((d) => Number(d.index) === i) || {};
  const enteras = fotos.map((_, i) => i).filter((i) => !info(i).isDetail);
  const candidatas = enteras.length >= cuantas ? enteras : fotos.map((_, i) => i);

  const elegidas = [];
  const coloresVistos = new Set();
  for (const i of candidatas) {
    const c = (info(i).color || '').trim();
    if (c && coloresVistos.has(c)) continue;
    if (c) coloresVistos.add(c);
    elegidas.push(i);
    if (elegidas.length === cuantas) break;
  }
  for (const i of candidatas) {
    if (elegidas.length === cuantas) break;
    if (!elegidas.includes(i)) elegidas.push(i);
  }
  return elegidas.slice(0, cuantas).map((i) => fotos[i]);
}

/**
 * Renderiza el carrusel COMO UNA TIRA: una sola pieza ancha que se corta en los N cuadros.
 * Ver src/carouselPanorama.js para el porqué del diseño.
 *
 * Devuelve { urls, stripUrl, sceneUrl, costUsd, buffer, clippedText } o lanza. Los dos
 * motivos de caída al carrusel clásico vienen con código propio, y en los dos casos el
 * llamador sigue sin ruido:
 *   · 'PANORAMA_SIN_ESCENA'   — no se pudo generar la foto de la tira (lo normal desde
 *                               sep-2026, porque la tira ES una foto generada);
 *   · 'PANORAMA_SIN_RECORTES' — modo "sólo fotos reales" y las fotos no se dejan recortar.
 */
async function renderCarouselPanorama(plan, ctx, { artMode = null, sceneUrl = null, sceneAspectIn = null } = {}) {
  const { refImgs, visualImageUrl, sceneTheme, logos, overlayTitle, badgeText, imageBrief, occasion, slotId, product } = ctx;

  /*
   * LA TIRA ES UNA FOTO GENERADA, NO UN COLLAGE DE RECORTES.
   *
   * Hasta sep-2026 la tira pegaba los recortes del catálogo sobre un fondo (diseñado o
   * generado) y la escena generativa era un extra que había que pedir a mano. El dueño lo
   * resumió mirando dos piezas seguidas: "las piezas tienen el error de que parecen cosas
   * recortadas y pegadas ahí, habría que solucionar para que nunca pase eso". Por más
   * sombra de piso y pozo de luz que se le ponga, un recorte de estudio sobre una escena
   * con otra luz se lee como calcomanía.
   *
   * Así que ahora la escena es EL modo de la tira, no una opción:
   *   · se intenta SIEMPRE que haya fotos del producto, sin que haya que pedir nada;
   *   · si no sale (cuota, tope de gasto, la rechaza el control de calidad), la tira NO se
   *     dibuja con recortes: se lanza `PANORAMA_SIN_ESCENA` y la pieza sale como carrusel
   *     clásico, que usa las fotos reales a sangre y nunca parece pegado.
   *
   * Las dos excepciones son elecciones explícitas del dueño en el panel: "sólo fotos
   * reales" (artMode 'foto', gratis, ahí sí vale la tira de recortes) y "afiche de diseño"
   * (artMode 'tipografica', que no lleva foto).
   *
   * Cuesta ~US$0,04 por carrusel entero, una sola generación para los tres cuadros. El
   * carrusel clásico con arte generativa paga UNA POR SLIDE, así que esto sale más barato
   * que la alternativa que ya se usaba.
   *
   * Va ANTES de armar los cuadros porque cambia cuántos entran: la escena llega en 21:9 y
   * sólo cubre bien una tira de 3 cuadros (con 4, el recorte se come el 28% del alto).
   */
  let backdrop = null;
  let scene = sceneUrl || null;          // escena ya guardada (redibujar sale $0)
  let sceneAspect = sceneAspectIn || null;
  let costUsd = 0;
  const soloFotoReal = artMode === 'foto';
  const quiereEscena = !scene && !soloFotoReal && artMode !== 'tipografica';

  if (quiereEscena) {
    const { generatePanoramaScene, generatePanoramaBackdrop } = require('../src/ai');
    // Tres fotos, una por persona, con colores distintos si el producto los tiene.
    const fotos = fotosParaLaTira(refImgs, ctx.photoDescriptions, 3);
    if (fotos.length) {
      const esc = await generatePanoramaScene({
        products: [{ name: (product && product.name) || sceneTheme, imageUrls: fotos }],
        productName: (product && product.name) || null,
        theme: sceneTheme, brief: imageBrief, occasion,
        seed: Number(slotId) || 0,
      }).catch(() => null);
      if (esc) {
        scene = `data:${esc.mimeType};base64,${esc.buffer.toString('base64')}`;
        sceneAspect = esc.aspect || null;
        costUsd += esc.costUsd || 0;
      }
    }
    /*
     * Sin producto del que sacar referencias no hay escena posible (promos de toda la
     * tienda, fechas comerciales). Ahí el fondo generado + recortes sigue siendo lo mejor
     * disponible, pero sólo si el dueño pidió arte generativa: no se gasta de oficio.
     */
    if (!scene && !fotos.length && artMode === 'generativa') {
      const amb = await generatePanoramaBackdrop({
        theme: sceneTheme, brief: imageBrief, occasion, seed: Number(slotId) || 0,
      }).catch(() => null);
      if (amb) {
        backdrop = `data:${amb.mimeType};base64,${amb.buffer.toString('base64')}`;
        costUsd += amb.costUsd || 0;
      }
    }
    if (!scene && !backdrop) {
      const err = new Error('No se pudo generar la foto de la tira: la hago carrusel clásico antes que pegar recortes.');
      err.code = 'PANORAMA_SIN_ESCENA';
      throw err;
    }
  }

  /*
   * Como mucho 4 cuadros: la tira se dibuja de una y 5 cuadros son 5400px de lienzo, que
   * en Render (512MB) es pedir problemas. Además, del cuarto slide en adelante casi nadie
   * desliza — es plata de diseño puesta donde no se ve.
   *
   * El cierre (CTA, o precio en historias) se preserva SIEMPRE como último cuadro. El
   * director de arte puede devolver 5 o 6 tomas y el cierre se agrega al final, así que
   * cortar por los primeros 4 a secas dejaba el carrusel sin llamado a la acción.
   */
  const maxCuadros = scene ? 3 : 4;
  const cierre = plan.find((s) => s.shotType === 'cta') || plan.find((s) => s.shotType === 'price') || null;
  const usados = cierre
    ? [...plan.filter((s) => s !== cierre).slice(0, maxCuadros - 1), cierre]
    : plan.slice(0, maxCuadros);

  const panels = usados.map((shot, i) => {
    const esCierre = shot.shotType === 'cta';
    const foto = refImgs.length ? (refImgs[shot.photoIndex] || refImgs[i % refImgs.length]) : visualImageUrl;
    if (esCierre) {
      const head = (shot.overlayByUser && shot.overlay)
        ? shot.overlay
        : agreeWithProduct(config.brand.ctaHeadline, (product && product.name) || sceneTheme);
      return {
        kind: 'cta',
        headline: head,
        benefits: config.brand.ctaBenefits,
        ctaLabel: 'Comprá online',
        photoUrl: foto,
      };
    }
    return {
      kind: i === 0 ? 'hero' : 'detalle',
      kicker: scene
        ? (KICKER_ESCENA[i] || KICKER_ESCENA[KICKER_ESCENA.length - 1])
        : (KICKER_POR_TOMA[shot.shotType] || 'EL DETALLE'),
      headline: shot.overlay || (i === 0 ? tituloCorto(overlayTitle) : null),
      deck: shot.deck || null,
      badge: i === 0 ? (badgeText || shot.badge || null) : null,
      photoUrl: foto,
    };
  });

  // Palabra corrida de fondo: la marca del producto si la hay, si no la primera palabra
  // del nombre. Es tipografía de tapa, no un dato: nunca inventa nada.
  const marca = mentionedBrandIn((product && product.name) || overlayTitle || '');
  const palabra = marca || tituloCorto(overlayTitle || sceneTheme, 1) || config.brand.name;

  const res = await renderPanoramaSlides({
    panels,
    backdropUrl: backdrop,
    sceneUrl: scene,
    sceneAspect,
    runningWord: palabra,
    logos,
    seed: Number(slotId) || 0,
  });
  return {
    ...res,
    costUsd: res.costUsd + costUsd,
    buffer: res.buffers[0] || null,
    scene: Boolean(scene),
    sceneUrl: res.sceneStoredUrl || null,
    sceneAspect,
  };
}

/**
 * TIRA DE VARIOS PRODUCTOS: un producto por cuadro, en el orden en que el dueño los
 * eligió, y el cierre con el llamado a la acción. Es la versión "combo" del carrusel
 * continuo — la de siempre muestra CUATRO TOMAS DE UN MISMO producto, y para
 * "remera + jean" eso no sirve: hay que ver las dos prendas.
 *
 * Con `etiquetas`, cada prenda lleva su nombre a la vista: sin eso, dos prendas y dos
 * nombres sueltos no dicen cuál es cuál. Sobre la foto generada va como cápsula anclada al
 * cuadro (labelChip) y sobre la tira de recortes, con flecha a la prenda (labelCallout);
 * las dos viven en src/carouselPanorama.js.
 */
async function renderComboPanorama(productos, ctx, { etiquetas = false, slides = [], artMode = null, sceneUrl = null, sceneAspectIn = null } = {}) {
  const { logos, overlayTitle, badgeText, slotId, sceneTheme, imageBrief, occasion } = ctx;

  /*
   * Tira generativa del combo: UNA foto con las prendas elegidas puestas en la misma
   * escena. Es lo que pide un "pack por 2": con recortes, dos prendas pegadas sobre el
   * mismo fondo se leen como dos fotos de catálogo al lado; en una sola toma se leen como
   * un conjunto. Se decide ANTES de armar los cuadros porque cambia cuántos entran: la
   * escena viene en 21:9 y sólo cubre bien una tira de 3 (ver generatePanoramaScene).
   *
   * Igual que en la tira de un producto: la escena es el modo por defecto y si no sale, la
   * pieza cae al carrusel clásico en vez de pegar recortes. `etiquetas` ya NO la
   * desactiva: sobre la foto generada el nombre va como cápsula anclada al cuadro (ver
   * labelChip en carouselPanorama.js) en vez de una flecha que apunte al recorte.
   */
  const soloFotoReal = artMode === 'foto';
  let scene = sceneUrl || null;
  let sceneAspect = sceneAspectIn || null;
  const quiereEscena = !scene && !soloFotoReal && artMode !== 'tipografica';
  // Con escena: 2 productos + cierre. Sin escena: 3 productos + cierre (el máximo).
  const elegidos = productos.slice(0, (scene || quiereEscena) ? 2 : 3);

  let costUsd = 0;
  if (quiereEscena) {
    const { generatePanoramaScene } = require('../src/ai');
    const esc = await generatePanoramaScene({
      products: elegidos.map((p) => ({
        name: p.name,
        imageUrl: p.image_url,
        imageUrls: Array.isArray(p.images) ? p.images : [],
      })),
      theme: sceneTheme || elegidos.map((p) => p.name).join(' + '),
      brief: imageBrief, occasion, seed: Number(slotId) || 0,
    }).catch(() => null);
    if (esc) {
      scene = `data:${esc.mimeType};base64,${esc.buffer.toString('base64')}`;
      sceneAspect = esc.aspect || null;
      costUsd += esc.costUsd || 0;
    }
    if (!scene) {
      const err = new Error('No se pudo generar la foto de la tira combinada: la hago carrusel clásico antes que pegar recortes.');
      err.code = 'PANORAMA_SIN_ESCENA';
      throw err;
    }
  }

  // Los slides del copy vienen como {title, body}; puede no haber ninguno.
  const titulos = (Array.isArray(slides) ? slides : []).map((x) => (x && x.title) || x || '');

  const panels = elegidos.map((p, i) => ({
    kind: i === 0 ? 'hero' : 'detalle',
    kicker: mentionedBrandIn(p.name) || (i === 0 ? 'EL CONJUNTO' : 'Y ADEMÁS'),
    // El titular sale del copy si la IA escribió slides; si no, del nombre del producto.
    headline: tituloCorto(titulos[i] || p.name, 4),
    deck: null,
    badge: i === 0 ? badgeText : null,
    photoUrl: p.image_url,
    // El nombre completo de Tiendanube no entra en una cápsula ("Pantalon Cargo De
    // Trabajo Ombu Reforzado"): con las primeras palabras alcanza para saber cuál es.
    label: etiquetas ? tituloCorto(p.name, 4) : null,
  }));

  const primera = elegidos[0] || {};
  const otraFoto = (Array.isArray(primera.images) ? primera.images : []).find((u) => u && u !== primera.image_url);
  panels.push({
    kind: 'cta',
    headline: agreeWithProduct(config.brand.ctaHeadline, primera.name || ''),
    benefits: config.brand.ctaBenefits,
    ctaLabel: 'Comprá online',
    photoUrl: otraFoto || primera.image_url || null,
  });

  const marca = mentionedBrandIn(primera.name || '') || tituloCorto(overlayTitle || config.brand.name, 1);
  const res = await renderPanoramaSlides({
    panels,
    backdropUrl: null,
    sceneUrl: scene,
    sceneAspect,
    runningWord: marca,
    logos,
    seed: Number(slotId) || 0,
  });
  return {
    ...res,
    costUsd: (res.costUsd || 0) + costUsd,
    buffer: res.buffers[0] || null,
    scene: Boolean(scene),
    sceneUrl: res.sceneStoredUrl || null,
    sceneAspect,
  };
}

/**
 * MODOS DE ARTE (los elige el dueño al regenerar desde el panel). Existen porque el
 * sistema decidía solo si una pieza llevaba imagen IA o no, y no había forma de pedirle
 * "esta hacela con imagen generativa" — que es justo lo que hace falta en promos de toda
 * la tienda o fechas comerciales, donde no hay UN producto que fotografiar.
 *   auto        : el director creativo decide (comportamiento de siempre).
 *   generativa  : SÍ o SÍ imagen IA — escena del producto si hay producto, arte de fondo
 *                 si no. El texto NUNCA lo escribe la IA: se estampa después con el
 *                 sistema de diseño (la IA escribiendo texto es lo que sacaba titulares
 *                 mal escritos horneados en la foto).
 *   foto        : sólo fotos reales del catálogo, cero gasto de IA.
 *   tipografica : sin foto — afiche de diseño (plantilla poster).
 */
const ART_MODES = ['auto', 'generativa', 'foto', 'tipografica'];
function normalizeArtMode(v) {
  const m = String(v || '').trim().toLowerCase();
  return ART_MODES.includes(m) && m !== 'auto' ? m : null;
}

/**
 * Lee la intención sobre la IMAGEN en una corrección escrita en lenguaje natural.
 *
 * Hacía falta porque "corregir" sólo tocaba textos: el dueño escribió "poné un producto
 * de fondo" y el sistema le contestó que la foto se mantiene igual — "no me respetó
 * nada". El cerebro ya detectaba que el pedido era sobre la foto (targets_photo) pero no
 * había forma de actuar. Ahora ese pedido se traduce al modo de arte correspondiente.
 * Es deterministico a propósito: sobre una acción que cuesta plata (generativa) conviene
 * una regla legible y no la interpretación libre de un modelo.
 */
function artIntentFromInstruction(instr) {
  const s = String(instr || '').toLowerCase();
  if (/\b(sin foto|sin imagen|saca\w* la foto|quit\w* la foto|s[oó]lo texto|solo texto|tipogr[aá]fic)/.test(s)) return 'tipografica';
  if (/\b(generativ|imagen (con )?ia|inteligencia artificial|escena generada|gener[aá]\w* la imagen)/.test(s)) return 'generativa';
  if (/\b(foto de fondo|producto de fondo|imagen de fondo|con una foto|pon[eé]\w* una foto|pon[eé]\w* un producto|agreg\w* una foto|mostr[aá]\w* el producto|que se vea el producto)/.test(s)) return 'foto';
  return null;
}

/**
 * Descarta del veredicto del QA visual las quejas de "texto cortado" que el navegador
 * desmiente. El modelo de visión confunde un titular repartido en dos renglones con un
 * texto mutilado — se midió el DOM en 9 piezas que había rechazado y ninguna desbordaba.
 * Si la medición exacta (renderPostBuffer.clippedText) dice que no hay nada recortado, la
 * queja se cae; el resto de los problemas que ve la visión (contraste, superposición,
 * fotos rotas) se respetan tal cual, porque ahí sí es mejor que cualquier medición.
 */
const CUT_CLAIM_RE = /cortad|truncad|mutilad|se sale|falta(n)? (parte|caracteres|letras)|incompleto/i;
function dropUnfoundedCutClaims(check, clippedText, slotId) {
  if (!check || check.ok) return check;
  if (Array.isArray(clippedText) && clippedText.length) return check; // hay recorte real
  const kept = (check.issues || []).filter((i) => !CUT_CLAIM_RE.test(String(i)));
  if (kept.length === (check.issues || []).length) return check;
  const dropped = (check.issues || []).length - kept.length;
  console.log(`[generate-daily] QA visual · slot #${slotId}: ignoro ${dropped} queja(s) de "texto cortado" — la medición del DOM confirma que ningún texto está recortado.`);
  return { ok: kept.length === 0, issues: kept };
}

async function generateForSlot(slot, overrides = {}) {
  const brandProfile = await getBrandProfile();
  // Permite regenerar cambiando el tema/ángulo del contenido sin cambiar el pilar.
  const pillarDetail = overrides.pillarDetail || slot.pillar_detail;
  const effectiveSlot = { ...slot, pillar_detail: pillarDetail };
  // Dirección de arte pedida a mano desde el panel (ver ART_MODES).
  const artMode = normalizeArtMode(overrides.artMode) || normalizeArtMode(slot.art_mode);
  const artBrief = String(overrides.artBrief || '').trim().slice(0, 400) || null;
  // Estructura del carrusel pedida a mano desde el panel: 'continuo' = la tira de una
  // pieza cortada en cuadros, 'clasico' = una imagen independiente por slide. Sin pedido,
  // lo decide la generación (por defecto continuo en los carruseles fotográficos de feed).
  /*
   * La forma del carrusel y el modo de arte pueden venir de dos lados: del modal de
   * regenerar (overrides, para esta corrida) o fijados en el slot (el dueño ya decidió
   * que ESA pieza es continua y generativa). Gana el override, porque es lo que acaba de
   * pedir; si no hay, manda lo guardado en el slot.
   */
  const carouselStyle = ['continuo', 'clasico'].includes(String(overrides.carouselStyle || '').toLowerCase())
    ? String(overrides.carouselStyle).toLowerCase()
    : (['continuo', 'clasico'].includes(String(slot.carousel_style || '').toLowerCase())
      ? String(slot.carousel_style).toLowerCase() : null);

  /* PIEZA A PEDIDO: lo que el dueño eligió y escribió en el panel para ESTE slot.
     Manda sobre todo lo automático — si pidió estos dos productos y esta escena, la
     pieza es esa. Ver el bloque "PIEZA A PEDIDO" arriba. */
  const idsElegidos = idsPedidos(slot);
  const productosPedidos = idsElegidos.length ? await pickForcedProducts(idsElegidos) : [];
  const visualBrief = String(overrides.visualBrief || slot.visual_brief || '').trim().slice(0, 600) || null;
  const quiereEtiquetas = Boolean(slot.show_labels);
  if (productosPedidos.length > 1 || visualBrief) {
    console.log(`[generate-daily] Slot #${slot.id} a pedido: ${productosPedidos.length} producto(s) elegido(s)${productosPedidos.length ? ` (${productosPedidos.map((x) => x.name.slice(0, 24)).join(' + ')})` : ''}${visualBrief ? ` · indicación visual: "${visualBrief.slice(0, 90)}"` : ''}${quiereEtiquetas ? ' · con nombres señalados' : ''}`);
  }

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
  // MEMORIA DE DISEÑO: con qué plantilla y variante salieron las últimas piezas, y con
  // qué palabras vienen arrancando los copys. Se usa para que el feed no se repita.
  const design = await artDirection.directionFor().catch(() => ({ recientes: [], arranquesUsados: [] }));
  const isCarousel = Boolean(slot.carousel) && format === 'feed'; // los carruseles de la API de Meta son de feed

  // ============ DIRECTOR CREATIVO (análisis previo de la pieza) ============
  // Antes de elegir producto/foto/plantilla con heurísticas, una IA analiza QUÉ ES la
  // pieza (producto / institucional / tema), decide si lleva producto y CUÁL exacto
  // (validado contra el catálogo real), el tratamiento visual y la plantilla. Es una
  // llamada de texto (gratis). Best-effort: si falla, plan = null y sigue la lógica
  // clásica de siempre. Ver el flujo completo en src/creativeDirector.js.
  let directorPlan = null;
  if (!noProductBrief && !idsElegidos.length) {
    try {
      const { planPiece } = require('../src/creativeDirector');
      // El menú que ve el director YA viene sin las plantillas de las últimas piezas:
      // elegía siempre la más "segura" y el feed salía clonado (29 de 72 piezas con
      // fullbleed en 45 días). Ver src/artDirection.js.
      const planTemplateOptions = (!isCarousel && slot.post_type !== 'reel' && !overrides.template)
        ? artDirection.withoutRecent(PILLAR_TEMPLATE_POOL[slot.pillar] || ['fullbleed', 'minimal'], design.recientes)
          .map((t) => ({ name: t, desc: TEMPLATE_INFO[t] || '' }))
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
    if (productosPedidos.length) {
      // El primero de la lista es el protagonista (precio, ficha, copy); los demás
      // acompañan en la imagen. Ya vienen refrescados en vivo de Tiendanube.
      [product] = productosPedidos;
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
  //  - director 'tarjeta_sin_foto' / 'ilustracion' / 'fondo_ambiental': SIN foto de
  //    producto (tarjeta limpia, dibujo didáctico o escena ambiental — nunca una
  //    prenda sin relación con el mensaje).
  //  - director con producto para pilares de tema: esa foto como ilustración.
  //  - sin director: heurística clásica (match fuerte o nada).
  let visualProduct = null;
  if (!noProductBrief) {
    // Pilar de VENTA (producto/promo) con un producto concreto: SIEMPRE se muestra el
    // producto, aunque el director haya dicho tarjeta_sin_foto (defensa por si el plan
    // viene viejo o el director falla). Una historia/post de producto sin la prenda es
    // el "extremo" que reportó el dueño (jul-2026).
    if (PRODUCT_PILLARS.includes(slot.pillar) && product) {
      visualProduct = product;
    } else if (directorPlan && ['tarjeta_sin_foto', 'ilustracion', 'fondo_ambiental'].includes(directorPlan.visual)) {
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

  // ============ DIRECTOR DE FOTOGRAFÍA (mira TODAS las fotos reales) ============
  // Antes de escribir el copy, el sistema VE qué muestra cada foto del producto en
  // Tiendanube (visión) y decide LA foto y LA toma para esta pieza según el ángulo
  // del director y la ficha real: si el ángulo habla de la suela y hay una foto de
  // la suela, la pieza ES sobre la suela. Hasta ahora sólo los carruseles miraban
  // las fotos; las piezas simples usaban a ciegas la primera foto de Tiendanube y
  // el copy iba por otro camino (bug real, jul-2026). Best-effort: si falla, la
  // pieza sale como siempre.
  const refImgsAll = (visualProduct && Array.isArray(visualProduct.images) && visualProduct.images.length)
    ? visualProduct.images
    : (visualImageUrl ? [visualImageUrl] : []);
  let photoDescriptions = [];
  let heroShot = null;
  if (refImgsAll.length && slot.post_type !== 'reel') {
    try {
      const { describeProductPhotos, planHeroShot } = require('../src/ai');
      photoDescriptions = await describeProductPhotos(refImgsAll.slice(0, 10)).catch(() => []);
      if (!isCarousel) {
        heroShot = await planHeroShot({
          productName: (visualProduct && visualProduct.name) || null,
          productDescription: visualProduct && visualProduct.description,
          brief: [directorPlan && directorPlan.copyAngle, pillarDetail || slot.theme_title].filter(Boolean).join(' — ').slice(0, 400),
          pillar: slot.pillar,
          objective,
          occasion,
          photoDescriptions,
          photoCount: refImgsAll.length,
          format,
          brandName: mentionedBrandIn(visualProduct && visualProduct.name),
        });
        if (heroShot) {
          console.log(`[generate-daily] Director de fotografía · slot #${slot.id}: toma=${heroShot.shotType} foto=#${heroShot.photoIndex}${heroShot.photoShows ? ` ("${heroShot.photoShows}")` : ''} encuadre=${heroShot.photoFraming || '?'} foco="${heroShot.focus}"${heroShot.reason ? ` · ${heroShot.reason}` : ''}`);
        }
      }
    } catch (err) {
      console.warn(`[generate-daily] Director de fotografía no disponible (sigo con la foto principal): ${err.message}`);
    }
  }
  // Qué va a mostrar la imagen (para que el copy hable de ESO y no de otra cosa).
  const heroImageContext = heroShot
    ? [
        heroShot.shotType === 'detalle' ? 'primer plano/detalle' : `toma ${heroShot.shotType}`,
        heroShot.photoShows ? `la foto muestra: ${heroShot.photoShows}` : null,
        heroShot.focus ? `énfasis en: ${heroShot.focus}` : null,
      ].filter(Boolean).join(' — ')
    : null;

  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));

  // Plantillas candidatas para que el cerebro elija la que mejor le queda a ESTA pieza
  // (formato de imagen según el mensaje). Sólo aplica a piezas simples (no carrusel, no
  // reel: esos tienen tratamiento propio) y sin override manual. Es gratis: viaja en la
  // misma llamada del copy. Si el director YA eligió plantilla, no se vuelve a pedir.
  const canPickTemplate = !isCarousel && slot.post_type !== 'reel' && !overrides.template && !(directorPlan && directorPlan.template);
  // Se prueba UNA vez por pieza y se reusa en las dos decisiones de plantilla.
  const sonda = await probeCutout(visualProduct);
  const cutoutOk = Boolean(sonda && sonda.ok);
  const cutoutBox = sonda ? sonda.box : null;
  const templateOptions = canPickTemplate
    ? artDirection.withoutRecent(templateCandidates(effectiveSlot, { visualProduct, cutoutOk }), design.recientes)
      .map((t) => ({ name: t, desc: TEMPLATE_INFO[t] || '' }))
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
    // Ángulo decidido por el director creativo: el copy lo desarrolla. Cuando la pieza
    // es A PEDIDO, el director no corre y las notas son las del dueño: qué productos
    // van juntos y qué pidió que se vea.
    directorNotes: [
      productosPedidos.length > 1
        ? `La pieza muestra JUNTOS estos productos reales: ${productosPedidos.map((x) => x.name).join(' + ')}. El texto tiene que hablar del conjunto, no de uno solo.`
        : null,
      visualBrief ? `Pedido del dueño para esta pieza: "${visualBrief}".` : null,
      directorPlan ? directorPlan.copyAngle : null,
    ].filter(Boolean).join(' ') || null,
    // Qué muestra la imagen ya elegida (director de fotografía): el copy habla de ESO.
    imageContext: heroImageContext,
    carousel: isCarousel,
    // Educativo/mayorista: el carrusel es una guía paso a paso (más slides).
    slideCount: isCarousel && ['educativo', 'mayorista'].includes(slot.pillar) ? 5 : 3,
    commercialContext,
    topCaptions: await topPerformingCaptions().catch(() => []),
    recentPieces,
    // Las primeras palabras de los últimos captions: prohibidas como arranque.
    usedOpeners: design.arranquesUsados,
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
      // El brief del slot es fuente de verdad: las promos que carga el dueño (descuentos,
      // condiciones) son decisiones suyas, no invenciones del modelo.
      brief: [pillarDetail, slot.theme_title].filter(Boolean).join(' — ') || null,
    });
    if (!audit.ok && audit.fixed) {
      if (audit.fixed.caption) copy.caption = audit.fixed.caption;
      if (audit.fixed.overlay) copy.overlay = audit.fixed.overlay;
      if (audit.fixed.story_points) copy.story_points = audit.fixed.story_points;
      const note = `auditoría factual corrigió: ${(audit.issues || []).join(' · ') || 'afirmaciones sin respaldo'}`;
      copy.qa_notes = copy.qa_notes ? `${copy.qa_notes} · ${note}` : note;
      console.warn(`[generate-daily] ${note} (slot #${slot.id})`);
      // MEMORIA DE ERRORES: cada dato inventado queda como lección para que las
      // próximas piezas del pilar no vuelvan a afirmarlo sin respaldo.
      try {
        const { recordLesson } = require('../src/learning');
        for (const issue of audit.issues || []) {
          recordLesson({ source: 'factual', scope: slot.pillar, lesson: `Dato inventado detectado antes: ${issue}. Afirmá SOLO lo que figura en el contexto.` });
        }
      } catch (_) { /* el aprendizaje nunca rompe la generación */ }
    }
  } catch (err) {
    console.warn(`[generate-daily] Auditoría factual falló (sigo): ${err.message}`);
  }

  const badgeText = slot.pillar === 'mayorista' ? 'MAYORISTA' : null;
  // El título puede salir del nombre crudo del producto (ej. "Buzo de friza") — lo
  // pasamos por la corrección de ortografía + limpieza de emoji igual que el copy.
  const overlayTitle = stripEmoji(fixSpelling(copy.overlay || (product ? product.name : pillarDetail || slot.theme_title || slot.pillar)));
  // Cupón detectado en el brief o el copy (ej: ARGENTINA10) -> va como texto en la plantilla.
  const couponCode = extractCoupon(`${pillarDetail || ''} \n ${copy.caption || ''} \n ${copy.cta || ''}`);
  // Brief para la imagen IA: indicaciones del plan + nota visual del director + gancho
  // del copy, para que la escena tenga sentido con el mensaje (no una foto genérica).
  // El pedido textual del dueño va PRIMERO: es la indicación más específica que existe
  // sobre cómo tiene que verse la pieza, y si queda al final se lo come el recorte.
  const imageBrief = [visualBrief, pillarDetail, directorPlan && directorPlan.imageNote, copy.overlay]
    .filter(Boolean).join(' — ').slice(0, 600);
  // REGLA: el precio va sólo en HISTORIAS (efímeras). El feed queda evergreen (sin precio
  // que envejezca). Reels tampoco llevan precio en el copy visual.
  const showPrice = format === 'story' && slot.post_type !== 'reel';

  // Plantilla visual: override manual > elección del director creativo > elección del
  // cerebro del copy > pool del pilar filtrado por fotos reales > variedad por seed.
  // artMode 'tipografica' manda sobre todo: la pieza va sin foto, como afiche de diseño.
  let template = artMode === 'tipografica'
    ? 'poster'
    : chooseTemplate(effectiveSlot, { override: overrides.template, visualProduct, aiPick: (directorPlan && directorPlan.template) || copy.template, recientes: design.recientes, cutoutOk });

  // 'fullbleed' SIN NINGUNA FOTO ya se renderizaba como afiche por dentro (el propio
  // buildFullbleedHtml delega en buildPosterHtml: sin foto quedaba un degradado con el
  // titular flotando). Pero afuera seguía llamándose 'fullbleed', y eso tenía dos
  // consecuencias: no se buscaba la foto de ambiente del afiche —la pieza salía con el
  // tercio superior vacío— y la memoria de diseño anotaba una plantilla que no era la
  // que se vio. Se resuelve el nombre acá, antes de todo lo que depende de él.
  if (template === 'fullbleed' && !visualImageUrl && !overrides.template) {
    template = 'poster';
    console.log(`[generate-daily] Slot #${slot.id}: la pieza quedó sin foto — la plantilla pasa de 'fullbleed' a 'poster' (que es como se renderiza igual, pero así consigue fondo de ambiente).`);
  }

  // VARIANTE DE COMPOSICIÓN dentro de la plantilla: dos piezas con la misma plantilla
  // no tienen por qué verse iguales. Se elige la que hace más que no se usa con ESTA
  // plantilla, así el feed alterna solo (ver src/artDirection.js).
  let variant = artDirection.pickVariant(template, design.recientes, Number(slot.id) || 0);
  // Diseño EFECTIVO que se va a guardar ("plantilla:variante"). Es la memoria que lee
  // la próxima pieza para no repetirse, así que tiene que reflejar lo que realmente se
  // renderizó — si el self-healing cambia de plantilla, se actualiza más abajo.
  let designTag = artDirection.encodeDesign(template, variant);

  // FOTO DE AMBIENTE PARA EL AFICHE. Cuando el director decide "tarjeta sin foto",
  // visualProduct queda en null y la pieza se renderiza sin NINGUNA imagen: el afiche
  // salía como puro texto sobre negro (queja real: "ni el texto ni el fondo están bien").
  // Pero en el afiche la foto no dice "este producto está en oferta" — va al 50% detrás
  // de la tipografía, como atmósfera. Así que si la pieza terminó siendo un afiche y no
  // tiene foto, se busca una del catálogo sólo para el fondo. Nunca se paga IA por esto.
  // Con artMode 'tipografica' el dueño pidió explícitamente sin foto: se respeta.
  let posterBackdrop = null;
  if (template === 'poster' && artMode !== 'tipografica' && !visualImageUrl) {
    try {
      const anchor = await pickRelevantVisualProduct(effectiveSlot)
        || (await pool.query(`SELECT image_url FROM products_cache WHERE image_url IS NOT NULL AND ${eligibleSQL()} ORDER BY sales_30d DESC NULLS LAST LIMIT 1`)).rows[0];
      posterBackdrop = (anchor && (anchor.image_url || anchor.imageUrl)) || null;
      if (posterBackdrop) console.log(`[generate-daily] Afiche del slot #${slot.id}: uso una foto real del catálogo como fondo de ambiente.`);
    } catch (err) {
      console.warn(`[generate-daily] No pude buscar foto de fondo para el afiche (sigue sin ella): ${err.message}`);
    }
  }

  let imagePath;
  let slidesJson = null;
  let slidesMetaJson = null; // receta de cada slide del carrusel (para regenerar uno solo)
  // Etiqueta de diseño del carrusel fotográfico: 'fullbleed' (una imagen por slide) o
  // 'panorama' (la tira continua). Va a generated_assets.template, que es lo que lee el
  // panel y la memoria de dirección de arte.
  let carouselDesign = 'fullbleed';
  let pieceCostUsd = 0; // lo que costó ESTA pieza en imágenes IA (0 = gratis)
  let coverBuffer = null; // portada del carrusel, para el QA visual final
  let coverClipped = []; // textos realmente recortados en la portada (medición del DOM)
  let coverOverlay = null; // texto esperado en esa portada (para detectar truncados)

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
      const { url, costUsd, buffer } = await renderPostBuffer({
        format,
        // 'editorial' en vez de 'educativo': la vieja dejaba el slide con fondo blanco y
        // dos tercios vacíos (se vio en la pieza real "Guía para elegir tu campera").
        // Acá el número del paso llena el fondo y el texto tiene jerarquía de verdad.
        template: 'editorial',
        overlayTitle: sinNumeroDeSlide(slides[i].title) || overlayTitle,
        title: sinNumeroDeSlide(slides[i].title) || overlayTitle,
        // La bajada del slide es su propio texto: sin esto 'editorial' queda sólo con
        // el titular y vuelve el hueco que se quiso eliminar.
        deck: slides[i].text || null,
        bodyText: slides[i].text || null,
        // El número gigante de fondo ES el contador del paso. No hace falta el "N/total"
        // impreso: Instagram ya muestra los puntitos del carrusel.
        stepNumber: String(i + 1).padStart(2, '0'),
        /*
         * PORTADA: los títulos de los otros slides como índice de lo que viene.
         * Sin esto la portada quedaba con el titular arriba y la mitad de abajo vacía
         * (el mismo pozo que tenía la plantilla 'educativo' vieja, ahora en oscuro).
         * Además funciona como gancho: el que ve la tapa sabe qué va a encontrar si
         * desliza. En los slides siguientes no van: cada uno desarrolla SU paso.
         */
        points: i === 0 ? slides.slice(1).map((sl) => sinNumeroDeSlide(sl.title)).filter(Boolean).slice(0, 3) : null,
        kicker: slot.pillar === 'mayorista' ? 'PARA EMPRESAS' : 'PARA SABER',
        badgeText: i === 0 ? badgeText : null,
        productImageUrl: i === 0 ? visualImageUrl : null, // pasos limpios, foto sólo en la portada
        productImageUrls: i === 0 && visualImageUrl ? [visualImageUrl] : [],
        logos,
        showBrand: i === 0, // el logo sólo en la portada
        layoutSeed: Number(slot.id) + i,
        bgTheme: pillarDetail || slot.theme_title,
      });
      urls.push(url);
      pieceCostUsd += costUsd || 0;
      if (i === 0) { coverBuffer = buffer; coverOverlay = slides[0].title || overlayTitle; }
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
      // y arma el bento de variantes con los otros colores. Si la fase de análisis
      // fotográfico ya corrió (arriba), se reutiliza sin llamar a la visión de nuevo.
      if (!photoDescriptions.length) {
        photoDescriptions = await describeProductPhotos(refImgs.slice(0, 10)).catch(() => []);
      }
      // Cuántas tomas: hero + 2 detalle + cierre CTA, +1 si hay 2+ colores (slide bento).
      // Los colores salen de la FICHA de Tiendanube (exactos, con stock); la visión es el
      // plan B y sólo mira las primeras fotos, así que subcontaba los colores.
      const realColors = productColors(visualProduct || product).length;
      const distinctColors = Math.max(realColors, new Set(photoDescriptions.map((d) => d.color).filter(Boolean)).size);
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

    /*
     * UNA FOTO DISTINTA POR CUADRO. Desde que cada cuadro es una escena GENERADA a partir
     * de su propia foto (ver renderCarouselShot), la foto asignada dejó de ser un detalle
     * interno: es lo que define la pose de ese cuadro. Dos cuadros con la misma foto son
     * dos generaciones casi iguales — plata pagada dos veces por la misma imagen.
     *
     * El director de arte a veces repite índice (le pide dos detalles a la misma foto).
     * Acá se reparte: el primero que pidió cada foto se la queda y a los repetidos se les
     * da la primera libre. Si hay menos fotos que cuadros, se permite repetir al final —
     * es preferible repetir una pose a quedarse sin cuadro.
     */
    if (refImgs.length > 1) {
      const tomadas = new Set();
      plan = plan.map((shot) => {
        const idx = Number(shot.photoIndex) || 0;
        if (!tomadas.has(idx) && idx < refImgs.length) { tomadas.add(idx); return shot; }
        let libre = 0;
        while (libre < refImgs.length && tomadas.has(libre)) libre += 1;
        if (libre >= refImgs.length) return shot; // más cuadros que fotos: se repite
        tomadas.add(libre);
        return { ...shot, photoIndex: libre };
      });
    }

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

    // BENTO DE COLORES: el slide de variantes tiene que mostrar UN color por foto. El
    // director de arte elegía dos fotos del mismo color y el collage quedaba mostrando
    // un solo color (bug real, ago-2026). Acá se corrige con lo que VIO la visión; si
    // el producto tiene un solo color, el slide pasa a ser un detalle (no se miente).
    plan = await Promise.all(plan.map(async (shot) => {
      if (shot.shotType !== 'variantes') return shot;
      const fixed = { ...shot };
      const { note, total } = await fillColorBento(fixed, { product: visualProduct || product, refImgs, photoDescriptions });
      if (total < 2) {
        console.log(`[generate-daily] Slot #${slot.id}: el producto tiene un solo color — el slide de variantes pasa a detalle.`);
        return { ...shot, shotType: 'detalle', extraPhotos: [], extraUrls: [], overlay: null };
      }
      console.log(`[generate-daily] Slot #${slot.id} · bento de colores: ${note}`);
      return fixed;
    }));

    // Contexto compartido de la pieza: lo usa renderCarouselShot (y la regeneración de 1 slide).
    const ctx = { refImgs, visualImageUrl, sceneTheme, format, logos, occasion, couponCode, overlayTitle, badgeText, imageBrief, pillar: slot.pillar, slotId: slot.id, product, artMode, photoDescriptions };

    /*
     * ¿TIRA CONTINUA O CARRUSEL CLÁSICO?
     *
     * La tira (src/carouselPanorama.js) es una sola pieza ancha cortada en cuadros: la
     * foto y la tipografía siguen de un cuadro al otro. Es lo que le da al que mira un
     * motivo para deslizar, en vez de tres posteos pegados.
     *
     * Es el modo por defecto del carrusel de feed. No aplica cuando:
     *   - es historia (ahí no hay deslizamiento horizontal continuo),
     *   - el dueño pidió otra cosa a mano (carouselStyle / arte tipográfica),
     *   - no hay NINGUNA foto del producto de la cual partir.
     *
     * Desde sep-2026 la tira se dibuja sobre una foto GENERADA con la prenda adentro, así
     * que ya no hace falta juntar 3 fotos distintas de estudio para poblar los cuadros:
     * con una sola alcanza como referencia. Y si esa foto no sale, renderCarouselPanorama
     * lanza PANORAMA_SIN_ESCENA y la pieza cae al carrusel clásico — nunca a una tira de
     * recortes pegados, que es el defecto que se vino a sacar de raíz.
     */
    const fotosDistintas = new Set(plan.map((s) => s.photoIndex)).size;
    const puedeEscena = artMode !== 'foto' && artMode !== 'tipografica' && refImgs.length >= 1;
    const quiereContinuo = carouselStyle === 'continuo'
      || (carouselStyle !== 'clasico' && isFeedFmt && artMode !== 'tipografica'
        && (puedeEscena || (fotosDistintas >= 3 && refImgs.length >= 3)));

    let tira = null;
    if (quiereContinuo) {
      try {
        // Pieza a pedido con VARIOS productos: un producto por cuadro (remera, jean,
        // botín) en vez de cuatro tomas del mismo. Es la única forma de que el carrusel
        // muestre lo que el dueño eligió.
        tira = productosPedidos.length > 1
          ? await renderComboPanorama(productosPedidos, ctx, { etiquetas: quiereEtiquetas, slides, artMode })
          : await renderCarouselPanorama(plan, ctx, { artMode });
      } catch (err) {
        const suave = err.code === 'PANORAMA_SIN_RECORTES' || err.code === 'PANORAMA_SIN_ESCENA';
        console[suave ? 'log' : 'warn'](`[generate-daily] Slot #${slot.id}: ${err.message} Sigo con el carrusel clásico.`);
      }
    }

    if (tira) {
      pieceCostUsd += tira.costUsd || 0;
      coverBuffer = tira.buffer;
      coverClipped = tira.clippedText || [];
      coverOverlay = plan[0] ? (plan[0].overlay || overlayTitle) : null;
      imagePath = tira.urls[0];
      slidesJson = JSON.stringify(tira.urls);
      // Receta de la tira. Es un OBJETO (no el array de tomas del carrusel clásico) para
      // que quien la lea sepa que estos cuadros no son piezas sueltas: corregir uno exige
      // volver a dibujar la tira entera o se rompe la continuidad.
      slidesMetaJson = JSON.stringify(productosPedidos.length > 1
        ? { mode: 'panorama', combo: true, scene: Boolean(tira.scene), sceneUrl: tira.sceneUrl || null, sceneAspect: tira.sceneAspect || null, stripUrl: tira.stripUrl || null, productIds: productosPedidos.map((x) => x.id), labels: quiereEtiquetas }
        : { mode: 'panorama', scene: Boolean(tira.scene), sceneUrl: tira.sceneUrl || null, sceneAspect: tira.sceneAspect || null, stripUrl: tira.stripUrl || null, shots: plan.slice(0, tira.urls.length) });
      carouselDesign = 'panorama';
      console.log(`[generate-daily] Slot #${slot.id}: carrusel CONTINUO de ${tira.urls.length} cuadros (tira de ${tira.urls.length * 1080}px)${tira.scene ? ' · escena generada con la prenda adentro (sin recortes)' : ''}.`);
    } else {
      // En paralelo (memoria acotada por el navegador compartido + semáforo de imageRenderer).
      const slideResults = await Promise.all(plan.map((shot, i) => renderCarouselShot(shot, i, ctx)));
      const urls = slideResults.map((r) => r.url);
      pieceCostUsd += slideResults.reduce((sum, r) => sum + (r.costUsd || 0), 0);
      coverBuffer = slideResults[0] ? slideResults[0].buffer : null;
      coverClipped = slideResults[0] ? (slideResults[0].clippedText || []) : [];
      coverOverlay = plan[0] ? (plan[0].overlay || overlayTitle) : null;

      imagePath = urls[0];
      slidesJson = JSON.stringify(urls);
      slidesMetaJson = JSON.stringify(plan); // receta de cada slide, para regenerar UNO solo
    }
  } else {
    // Reels: NO se gasta en imagen IA automática. La imagen es sólo la base/portada;
    // el video real conviene generarlo a mano en Gemini/Veo con el botón
    // "Prompt video IA" (o subir filmación propia), así la imagen IA no se tira.
    const isReel = slot.post_type === 'reel';
    // Toma decidida por el director de fotografía: 'detalle'/'flatlay' = FOTO REAL a
    // pantalla completa (gratis y sin riesgo de alucinación IA); 'hero'/'contexto' =
    // escena IA dirigida por la spec de la toma (si AI_IMAGES está activo).
    const heroIsRealDetail = Boolean(heroShot && ['detalle', 'flatlay'].includes(heroShot.shotType)) && !realSizeChart;
    const heroImageUrl = heroShot ? (refImgsAll[heroShot.photoIndex] || visualImageUrl) : visualImageUrl;
    const interactionLabel = interactionChip(slot, copy.sticker);

    // ENCUADRE DE LA FOTO REAL: ¿a sangre o dentro de la tarjeta de estudio?
    // La tarjeta contenida existe para los recortes de catálogo chicos sobre fondo
    // blanco (ahí queda prolija). Pero cuando la foto ES una toma fotográfica de verdad
    // —modelo con la prenda puesta, o el producto llenando el cuadro— meterla en una
    // tarjeta la achica y deja ver el recorte del encuadre: es lo que hacía que la
    // historia se viera "amontonada y con el torso cortado". Esas van A SANGRE, que es
    // como se ve una historia editorial de verdad. Decide la visión, no una heurística
    // ciega (ver describeProductPhotos: has_person / fills_frame / framing).
    const photoIsScene = Boolean(heroShot && (heroShot.photoHasPerson || heroShot.photoFillsFrame));
    const heroCoverImage = !realSizeChart && (heroIsRealDetail || photoIsScene);

    // DATOS IMPRESOS EN LA PIEZA (chips de ficha técnica). Van en las HISTORIAS (donde el
    // caption casi no se ve) y también en las piezas SIN PRODUCTO de cualquier formato:
    // ahí no hay foto que llene el cuadro, así que los datos SON el diseño. Sin esto la
    // promo de liquidación llegó al render con story_points en null y salió con tres
    // elementos sueltos ("muy simplona"). Primero los del copy; si el cerebro no los
    // devolvió, se sacan de la descripción REAL de Tiendanube (nunca se inventa nada).
    const wantsChips = !isReel && (format === 'story' || !product);
    const storyDesc = (product && product.description) || (visualProduct && visualProduct.description) || null;
    let storyPoints = wantsChips && Array.isArray(copy.story_points)
      ? copy.story_points.filter(Boolean).slice(0, 3) : null;
    if (wantsChips && (!storyPoints || !storyPoints.length) && storyDesc) {
      const fromSheet = extractSpecTags(storyDesc, 3, { productName: (product && product.name) || (visualProduct && visualProduct.name) || '' });
      if (fromSheet.length) {
        storyPoints = fromSheet;
        console.log(`[generate-daily] Pieza sin story_points del copy · slot #${slot.id}: uso datos de la ficha real → ${fromSheet.join(' · ')}`);
      }
    }
    // Última red: promos SIN producto (no hay ficha de dónde sacar datos). Las condiciones
    // están en el brief que escribió el dueño — es texto propio, no inventado.
    if (wantsChips && (!storyPoints || !storyPoints.length)) {
      const fromBrief = extractBriefChips(`${pillarDetail || ''} ${slot.theme_title || ''}`, 2, { exclude: overlayTitle || '' });
      if (fromBrief.length) {
        storyPoints = fromBrief;
        console.log(`[generate-daily] Pieza sin datos · slot #${slot.id}: uso las condiciones del brief → ${fromBrief.join(' · ')}`);
      }
    }
    /*
     * REVISIÓN DE COHERENCIA ANTES DE RENDERIZAR (ver src/pieceBrief.js).
     * El QA visual mira la pieza YA hecha y sólo encuentra roturas; esto revisa que la
     * COMBINACIÓN plantilla + producto + datos tenga sentido antes de gastar el render:
     * descarta características que no pueden ser ciertas para ese tipo de prenda, exige
     * material real para la ficha y acorta el titular del 'recorte'. Si el contenido no
     * sostiene la plantilla elegida, la degrada a una que sí.
     */
    const brief = reviewPiece({
      template,
      product: product || visualProduct,
      displayTitle: (product && product.name) || overlayTitle,
      title: overlayTitle,
      specs: template === 'ficha' && storyDesc
        ? extractSpecTags(storyDesc, 5, { productName: (product && product.name) || '' })
        : null,
      deck: copy.deck || copy.subtitle || null,
      cutoutOk,
      cutoutBox,
      format,
    });
    for (const nota of brief.notas) console.log(`[generate-daily] Brief · slot #${slot.id}: ${nota}`);
    if (brief.degradado) {
      template = brief.template;
      variant = artDirection.pickVariant(template, design.recientes, Number(slot.id) || 0);
      designTag = artDirection.encodeDesign(template, variant);
      console.log(`[generate-daily] Brief · slot #${slot.id}: la plantilla queda en '${template}' (el contenido no sostenía la elegida).`);
    }

    /*
     * RANKING: si el tema promete una lista ("lo más vendido del mes"), la pieza muestra
     * VARIOS productos, no uno. Se arma con la grilla y las fotos reales de los más
     * vendidos, ordenadas por ventas. Si no hay al menos 3, no es un ranking creíble y
     * la pieza sigue como estaba.
     */
    let rankingUrls = null;
    if (!isCarousel && !isReel && esPiezaDeRanking(slot) && !overrides.template) {
      const top = await productosDelRanking(4).catch(() => []);
      if (top.length >= 3) {
        rankingUrls = top.map((p) => p.image_url).filter(Boolean);
        template = 'grid';
        variant = 'clasico';
        designTag = artDirection.encodeDesign(template, variant);
        console.log(`[generate-daily] Slot #${slot.id}: el tema es un ranking — la pieza pasa a una grilla con ${rankingUrls.length} productos reales (${top.map((p) => p.name.slice(0, 22)).join(', ')}).`);
      } else {
        console.warn(`[generate-daily] Slot #${slot.id}: el tema promete un ranking pero sólo hay ${top.length} producto(s) elegible(s) con foto — no alcanza para una lista creíble.`);
      }
    }

    /*
     * PIEZA SIMPLE (no carrusel) CON VARIOS PRODUCTOS. La escena la arma la IA con las
     * fotos reales de los dos o tres productos como referencia, igual que el Estudio:
     * es la única forma de que se vean JUNTOS y bien puestos. Si la IA no está
     * disponible (cuota, sin API key) o el dueño pidió sólo fotos reales, cae a la
     * grilla del catálogo, que es gratis y muestra los productos igual.
     */
    let comboSceneUrl = null;
    let comboGridUrls = null;
    if (!isReel && productosPedidos.length > 1) {
      if (artMode !== 'foto' && artMode !== 'tipografica') {
        try {
          const { generateStudioScene } = require('../src/ai');
          const escena = await generateStudioScene({
            products: productosPedidos.map((x) => ({
              id: x.id, name: x.name, description: x.description, imageUrl: x.image_url,
            })),
            theme: [visualBrief, pillarDetail, slot.theme_title].filter(Boolean).join(' — ').slice(0, 400),
            format,
          });
          if (escena) {
            comboSceneUrl = `data:${escena.mimeType};base64,${escena.buffer.toString('base64')}`;
            pieceCostUsd += escena.costUsd || 0;
            console.log(`[generate-daily] Slot #${slot.id}: escena combo con ${productosPedidos.length} productos (US$${(escena.costUsd || 0).toFixed(3)}).`);
          }
        } catch (err) {
          console.warn(`[generate-daily] Escena combo falló (sigo con la grilla real): ${err.message}`);
        }
      }
      if (!comboSceneUrl) {
        comboGridUrls = productosPedidos.map((x) => x.image_url).filter(Boolean);
        if (comboGridUrls.length >= 2) {
          template = 'grid';
          variant = 'clasico';
          designTag = artDirection.encodeDesign(template, variant);
          console.log(`[generate-daily] Slot #${slot.id}: pieza combo en grilla con ${comboGridUrls.length} fotos reales.`);
        } else {
          comboGridUrls = null;
        }
      }
    }

    const renderOpts = {
      format,
      template,
      // Variante de composición dentro de la plantilla (ver src/artDirection.js).
      variant,
      overlayTitle,
      price: showPrice && product ? product.price : null,
      promoPrice: showPrice && product ? product.promo_price : null,
      cta: copy.cta,
      badgeText: badgeText || (heroShot && heroShot.badge) || null,
      // CTA IMPRESO como botón: en HISTORIAS (el caption casi nadie lo ve) y en las
      // piezas SIN PRODUCTO de cualquier formato — en un afiche el botón no es sólo un
      // llamado a la acción, es la pieza de diseño que cierra la composición; sin él la
      // promo de liquidación quedaba con el pie vacío. Si la pieza es semi, el chip de
      // interacción ocupa ese lugar y manda (no se duplican pills).
      ctaLabel: !isReel && !interactionLabel && copy.cta && (format === 'story' || !product)
        ? shortLabel(copy.cta, 34) : null,
      // Eyebrow por pilar (magazine/stackedcards): evita el 'NOTA DE TAPA' fuera de lugar.
      kicker: PILLAR_KICKER[slot.pillar],
      /* --- Datos que consumen las plantillas modernas (ver templatesModern.js) --- */
      // recorte: titular CORTO. El overlay del copy suele ser una frase entera y esta
      // plantilla lo imprime a 150px partido en dos renglones; con el nombre del producto
      // (2-4 palabras) el efecto de "texto por detrás de la prenda" se lee de una.
      // Los tres salen del brief, ya verificados (titular acortado, specs que de verdad
      // pueden ser ciertas para este producto).
      displayTitle: brief.displayTitle,
      specs: brief.specs,
      deck: brief.deck,
      // Historias: puntos cortos con datos reales impresos SOBRE la imagen (el caption
      // de una historia casi no se ve — la info tiene que estar en la pieza).
      storyPoints,
      // LA foto elegida por el director de fotografía (no la primera a ciegas).
      productImageUrl: realSizeChart || heroImageUrl || posterBackdrop,
      // Fotos extra del mismo producto (otros ángulos) para anclar la fidelidad
      // de la escena IA: menos chance de que el modelo reinvente el producto.
      productImageUrls: refImgsAll.filter((u) => u !== heroImageUrl).slice(0, 4),
      // Spec de la toma (tipo/foco/fondo): dirige la escena IA como en los carruseles.
      shotSpec: heroShot || null,
      // Detalle/flatlay o foto fotográfica (modelo / producto que llena el cuadro):
      // la foto real va a pantalla completa en vez de contenida en la tarjeta.
      coverImage: heroCoverImage,
      // Encuadre detectado por la visión: si la foto recorta al modelo y aun así termina
      // dentro de la tarjeta, el renderer desvanece el corte para que se lea intencional.
      photoFraming: heroShot ? heroShot.photoFraming : null,
      // Descripción REAL de Tiendanube: la plantilla 'specsheet' pinea specs
      // técnicos reales (material, feature) tomados de acá, nunca inventados.
      productDescription: (product && product.description) || (visualProduct && visualProduct.description) || null,
      logos,
      layoutSeed: Number(slot.id),
      // Detalle real: NO se gasta en escena IA — la foto macro real ya es la pieza.
      // 'poster' tampoco: es un afiche tipográfico y la foto entra como fondo al 42% de
      // opacidad — pagar una escena generada para verla así sería tirar la plata.
      useAiProductScene: !isReel && Boolean(heroImageUrl) && slot.pillar !== 'repost'
        && !heroIsRealDetail && template !== 'poster',
      // Ilustración didáctica: educativo sin guía real ni foto, o cuando el director
      // creativo decidió que el tema se explica mejor dibujado que fotografiado.
      useAiDiagram: (isEducativo || (directorPlan && directorPlan.visual === 'ilustracion')) && !realSizeChart && !visualImageUrl,
      diagramTopic: pillarDetail || slot.theme_title,
      // FONDO IA sólo por decisión EXPLÍCITA del cerebro: visual 'fondo_ambiental'
      // + nota visual concreta. Antes, si el director fallaba o no pedía nada, igual
      // se generaba una escena genérica — de ahí salían las "imágenes de cualquier
      // cosa" sin relación con el mensaje (bug real, jul-2026). Director caído o sin
      // dirección visual = tarjeta tipográfica de marca (gratis y coherente).
      useAiBackground: !isReel && !visualImageUrl && !isEducativo && slot.pillar !== 'repost'
        && Boolean(directorPlan && directorPlan.visual === 'fondo_ambiental' && directorPlan.imageNote),
      // Para escenas de producto el tema es EL PRODUCTO (nunca el texto de venta del slot:
      // el modelo lo "hornea" en la imagen y puede contradecir la foto). Para fondos, el concepto.
      bgTheme: product
        ? `${product.name}${product.category ? ` (${product.category})` : ''}`
        : [pillarDetail || slot.theme_title, copy.overlay].filter(Boolean).join(' — '),
      // Brief + ocasión festiva para que la imagen IA sea coherente con el mensaje y la fecha.
      bgBrief: imageBrief,
      bgOccasion: occasion,
      couponCode,
      interactionLabel,
    };

    // ============ DIRECCIÓN DE ARTE PEDIDA A MANO ============
    /*
     * RANKING: se aplica DESPUÉS de armar renderOpts, no adentro del literal — ahí lo
     * pisaba la clave `productImageUrls` que viene más abajo y la grilla salía con cuatro
     * tomas del MISMO pantalón en vez de los cuatro productos más vendidos.
     * El titular también cambia: en una pieza de ranking tiene que anunciar la lista, no
     * nombrar un producto (decía "Pantalón Cargo Slim Fit" sobre una grilla de cuatro).
     */
    /* Combo a pedido: la escena generada va a sangre; la grilla, con las fotos reales.
       Va acá y no adentro del literal por lo mismo que el ranking: `productImageUrls`
       se define más abajo y pisaría las fotos de los otros productos. */
    if (comboSceneUrl) {
      renderOpts.bgImageUrl = comboSceneUrl;      // escena ya pagada: no se genera otra
      renderOpts.useAiProductScene = false;
      renderOpts.useAiBackground = false;
    } else if (comboGridUrls) {
      renderOpts.productImageUrls = comboGridUrls;
      renderOpts.productImageUrl = comboGridUrls[0];
      renderOpts.useAiProductScene = false;
      renderOpts.useAiBackground = false;
    }

    if (rankingUrls) {
      renderOpts.productImageUrls = rankingUrls;
      renderOpts.productImageUrl = rankingUrls[0];
      renderOpts.overlayTitle = stripEmoji(fixSpelling(slot.theme_title || overlayTitle));
      renderOpts.useAiProductScene = false; // la grilla muestra fotos REALES del catálogo
      renderOpts.useAiBackground = false;
    }

    // El dueño eligió el modo desde el panel: pisa lo que decidió el director creativo.
    // 'generativa' es el caso clave de las promos/fechas comerciales sin producto: sin
    // esto no había forma de pedir una imagen generada y la pieza salía tipográfica.
    if (artMode === 'foto' || artMode === 'tipografica') {
      renderOpts.useAiProductScene = false;
      renderOpts.useAiBackground = false;
      renderOpts.useAiDiagram = false;
    }
    if (artMode === 'tipografica') {
      renderOpts.productImageUrl = null;
      renderOpts.productImageUrls = [];
      renderOpts.coverImage = false;
    }
    if (artMode === 'generativa' && !isReel) {
      renderOpts.useAiDiagram = false;
      if (renderOpts.productImageUrl) {
        // Hay foto real del producto: se usa como referencia para que la escena generada
        // sea ESE producto y no uno inventado.
        renderOpts.useAiProductScene = true;
        renderOpts.useAiBackground = false;
      } else {
        renderOpts.useAiProductScene = false;
        renderOpts.useAiBackground = true;
      }
      // Arte de afiche: composición dramática con espacio libre reservado para el texto,
      // que se estampa después (ver artStyle en generateBackground/generateProductScene).
      renderOpts.artStyle = 'poster';
    }
    if (artBrief) {
      renderOpts.bgBrief = [renderOpts.bgBrief, artBrief].filter(Boolean).join(' — ').slice(0, 600);
      renderOpts.artBrief = artBrief;
    }

    // Se registra la plantilla/seed EFECTIVOS (el self-healing puede cambiarlos) para
    // guardar una "receta" fiel a la imagen final y poder corregirla después sin tocar
    // la escena (foto IA ya pagada). Ver correctPiece + POST /api/assets/:id/correct.
    let finalTemplate = template;
    let finalVariant = variant;
    let finalSeed = Number(slot.id);
    let render = await renderPostBuffer(renderOpts);
    pieceCostUsd += render.costUsd || 0;

    // ============ QA VISUAL POST-RENDER + SELF-HEALING (fase final) ============
    // Hasta acá nadie miraba la pieza TERMINADA: si la plantilla truncó el título o
    // el logo pisó un texto, se descubría publicada. Ahora un director de arte IA
    // (visión, gratis) revisa el render final; si está roto, se re-renderiza UNA vez
    // con la plantilla más robusta (fullbleed) REUSANDO la escena IA ya pagada — cero
    // gasto extra. Si ni así queda bien, la pieza guarda el problema en qa_notes
    // (el badge del panel + AUTO_APPROVE la frenan hasta revisión manual).
    if (!isReel) {
      try {
        const { reviewRenderedPiece } = require('../src/ai');
        // DOBLE MIRADA antes de dar una pieza por rota. El revisor es un modelo de visión
        // y a veces marca "texto cortado" en textos que están enteros (se comprobó midiendo
        // el DOM: el elemento no desbordaba nada). Un rechazo falso re-renderiza al pedo,
        // ensucia qa_notes y —peor— graba una "lección" falsa que después tuerce las piezas
        // siguientes. Con dos miradas sobre LA MISMA imagen, el ruido de una sola muestra
        // desaparece y sólo pasan los defectos que el revisor ve las dos veces. Es gratis.
        let check = await reviewRenderedPiece({ buffer: render.buffer, overlayText: overlayTitle });
        check = dropUnfoundedCutClaims(check, render.clippedText, slot.id);
        if (!check.ok) {
          const second = await reviewRenderedPiece({ buffer: render.buffer, overlayText: overlayTitle });
          if (dropUnfoundedCutClaims(second, render.clippedText, slot.id).ok) {
            console.log(`[generate-daily] QA visual: el rechazo del slot #${slot.id} no se confirmó en la segunda mirada (${check.issues.join(' · ')}) — la pieza queda como está.`);
            check = { ok: true, issues: [] };
          }
        }
        if (!check.ok) {
          console.warn(`[generate-daily] QA visual rechazó el render del slot #${slot.id} (plantilla ${template}): ${check.issues.join(' · ')}. Re-renderizo con plantilla segura...`);

          // La escena IA ya generada (data URI) se reusa tal cual; nunca se paga dos veces.
          const aiScene = render.cleanImageUrl && String(render.cleanImageUrl).startsWith('data:') ? render.cleanImageUrl : null;
          const healed = await renderPostBuffer({
            ...renderOpts,
            template: 'fullbleed', // la plantilla más robusta: se adapta con y sin foto
            variant: 'clasico',    // y su composición más probada (el curado no experimenta)
            layoutSeed: Number(slot.id) + 31, // otro layout, por si el problema era de posición
            ...(aiScene ? { bgImageUrl: aiScene } : {}),
            useAiProductScene: false, useAiDiagram: false, useAiBackground: false, // cero gasto nuevo
          });
          pieceCostUsd += healed.costUsd || 0;
          const recheck = dropUnfoundedCutClaims(
            await reviewRenderedPiece({ buffer: healed.buffer, overlayText: overlayTitle }),
            healed.clippedText, slot.id
          );
          const keepHealed = recheck.ok || recheck.issues.length <= check.issues.length;
          if (keepHealed) {
            render = healed; finalTemplate = 'fullbleed'; finalVariant = 'clasico'; finalSeed = Number(slot.id) + 31;
            designTag = artDirection.encodeDesign(finalTemplate, finalVariant);
          }
          if (!recheck.ok) {
            // La nota refleja los problemas del render que QUEDÓ (curado u original).
            const worst = (keepHealed ? recheck.issues : check.issues).join(' · ');
            const note = `QA visual: ${worst}`;
            copy.qa_notes = copy.qa_notes ? `${copy.qa_notes} · ${note}` : note;
            console.warn(`[generate-daily] QA visual: la pieza del slot #${slot.id} queda para revisión manual (${worst}).`);
            // La lección se graba SÓLO acá: cuando el defecto sobrevivió al re-render. Si se
            // arregla solo cambiando de plantilla, no fue un problema de esa plantilla y
            // grabarlo envenenaba la memoria de errores con falsos positivos.
            const { recordLesson } = require('../src/learning');
            recordLesson({ source: 'render', scope: slot.pillar, lesson: `La plantilla '${template}' salió rota (${String(check.issues[0] || 'defecto visual').replace(/\d+/g, 'N')}) — revisar esa combinación de plantilla/contenido`, detail: worst });
          } else {
            console.log(`[generate-daily] QA visual: pieza del slot #${slot.id} auto-corregida con plantilla fullbleed.`);
          }
        }
      } catch (err) {
        console.warn(`[generate-daily] QA visual no disponible (sigo con el render original): ${err.message}`);
      }
    }

    imagePath = render.url;

    // ============ RECETA DE CORRECCIÓN (piezas simples) ============
    // Guardamos la "receta" de la pieza + la ESCENA LIMPIA (la foto IA ya pagada o la
    // foto real usada) para que "Corregir la historia" pueda re-renderizar aplicando
    // sólo el cambio pedido, SIN volver a generar/pagar la imagen ni tocar el resto.
    try {
      const cleanUrl = render.cleanImageUrl || null;
      const isData = cleanUrl && String(cleanUrl).startsWith('data:');
      // La escena entra como PRODUCTO (dentro de tarjeta) sólo si fue un diagrama IA o
      // una foto real que NO va a sangre; el resto (escena IA, fondo IA, foto cover) va
      // como FONDO a pantalla completa.
      const usedDiagramProduct = Boolean(renderOpts.useAiDiagram) && !renderOpts.useAiProductScene && !renderOpts.useAiBackground;
      const sceneAsProduct = cleanUrl ? (usedDiagramProduct || (!isData && !renderOpts.coverImage)) : false;
      let sceneUrl = cleanUrl;
      if (isData) {
        const m = String(cleanUrl).match(/^data:([^;]+);base64,(.*)$/);
        if (m) {
          sceneUrl = await uploadAsset({
            buffer: Buffer.from(m[2], 'base64'),
            filename: `scene-${format}-${slot.id}-${Date.now()}.jpg`,
            contentType: m[1] || 'image/jpeg',
          }).catch(() => null);
        }
      }
      const recipe = {
        format: renderOpts.format,
        template: finalTemplate,
        // La variante también viaja en la receta: si no, "Corregir el texto" volvía a
        // renderizar la pieza con la composición clásica y el diseño cambiaba solo.
        variant: finalVariant,
        overlayTitle: renderOpts.overlayTitle,
        price: renderOpts.price,
        promoPrice: renderOpts.promoPrice,
        cta: renderOpts.cta,
        ctaLabel: renderOpts.ctaLabel,
        badgeText: renderOpts.badgeText,
        storyPoints: renderOpts.storyPoints,
        kicker: renderOpts.kicker,
        couponCode: renderOpts.couponCode,
        interactionLabel: renderOpts.interactionLabel,
        coverImage: renderOpts.coverImage,
        photoFraming: renderOpts.photoFraming,
        productDescription: renderOpts.productDescription,
        layoutSeed: finalSeed,
        showBrand: renderOpts.showBrand !== false,
      };
      // artMode/artBrief quedan guardados para que "Corregir" mantenga la misma dirección
      // de arte y para poder mostrarla preseleccionada la próxima vez en el panel.
      slidesMetaJson = JSON.stringify({
        single: true, recipe, sceneUrl: sceneUrl || null, sceneAsProduct,
        artMode: artMode || 'auto', artBrief: artBrief || null,
      });
    } catch (err) {
      console.warn(`[generate-daily] No pude guardar la receta de corrección (sigo): ${err.message}`);
    }
  }

  // ============ QA VISUAL DE LA PORTADA DEL CARRUSEL ============
  // La portada es lo que se ve en el feed. Acá no hay self-healing automático (cada
  // slide se corrige puntual desde el panel con "regenerar slide"): si está rota,
  // queda en qa_notes — el panel la marca para revisar y AUTO_APPROVE no la publica.
  if (slides && coverBuffer) {
    try {
      const { reviewRenderedPiece } = require('../src/ai');
      let check = dropUnfoundedCutClaims(await reviewRenderedPiece({ buffer: coverBuffer, overlayText: coverOverlay }), coverClipped, slot.id);
      // Doble mirada, igual que en las piezas simples: un rechazo de una sola muestra
      // manda a revisión manual una portada sana y graba una lección falsa.
      if (!check.ok) {
        const second = dropUnfoundedCutClaims(await reviewRenderedPiece({ buffer: coverBuffer, overlayText: coverOverlay }), coverClipped, slot.id);
        if (second.ok) {
          console.log(`[generate-daily] QA visual de portada: el rechazo del slot #${slot.id} no se confirmó en la segunda mirada — la dejo pasar.`);
          check = second;
        }
      }
      if (!check.ok) {
        const note = `QA visual (portada del carrusel): ${check.issues.join(' · ')}`;
        copy.qa_notes = copy.qa_notes ? `${copy.qa_notes} · ${note}` : note;
        console.warn(`[generate-daily] ${note} (slot #${slot.id}) — corregila con "regenerar slide" desde el panel.`);
        const { recordLesson } = require('../src/learning');
        recordLesson({ source: 'render', scope: slot.pillar, lesson: `Portada de carrusel rota: ${String(check.issues[0] || 'defecto visual').replace(/\d+/g, 'N')}`, detail: check.issues.join(' · ') });
      }
    } catch (err) {
      console.warn(`[generate-daily] QA visual de portada no disponible (sigo): ${err.message}`);
    }
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
    // BUG REAL (jul-2026): TODO carrusel quedaba etiquetado 'educativo', aunque los
    // carruseles fotográficos renderizan slides fullbleed/grid — el panel mostraba una
    // plantilla que no era. La etiqueta ahora refleja lo que se renderizó de verdad.
    // Se guarda el diseño EFECTIVO ("plantilla:variante"): antes se guardaba la
    // plantilla elegida aunque el self-healing la hubiera cambiado, y esa columna es
    // justo la memoria que usa artDirection para no repetir el diseño de la próxima.
    [slot.id, visualProduct ? visualProduct.id : null, copy.caption, copy.hashtags, copy.cta, imagePath, format, slidesJson, slides ? (isStepCarousel ? 'editorial' : carouselDesign) : designTag, storyTeaserPath, pieceCostUsd, copy.gen_model || null, copy.qa_notes || null, copy.sticker ? JSON.stringify(copy.sticker) : null, slidesMetaJson]
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
  // El cron corre en un proceso aparte: hay que traer los ajustes del panel
  // (ej. qué modelo de imagen eligió el dueño) antes de generar nada.
  await require('../src/settings').loadSettings().catch(() => {});
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

  let metaRaw = asset.slides_meta;
  if (typeof metaRaw === 'string') { try { metaRaw = JSON.parse(metaRaw); } catch (_) { metaRaw = null; } }
  // Recetas de los slides. Si la pieza es vieja y no tiene ninguna, se arma una por
  // defecto para TODOS los slides: así la corrección también queda guardada en piezas
  // viejas (antes se aplicaba a la imagen pero se perdía en la próxima corrección).
  const defaultShot = (n) => ({ shotType: n === 0 ? 'hero' : 'detalle', photoIndex: n, extraPhotos: [], background: 'limpio', focus: '', overlay: null, badge: null });
  // Carrusel CONTINUO: la receta viene como objeto { mode:'panorama', shots:[...] }. Sus
  // cuadros no son piezas sueltas —son recortes de una misma tira—, así que corregir uno
  // obliga a volver a dibujar la tira entera; si se re-renderizara sólo ese cuadro, el
  // fondo, la palabra corrida y la prenda partida dejarían de coincidir con los vecinos.
  const esTira = Boolean(metaRaw && !Array.isArray(metaRaw) && metaRaw.mode === 'panorama');
  const meta = Array.isArray(metaRaw)
    ? metaRaw
    : (esTira && Array.isArray(metaRaw.shots) ? metaRaw.shots : urls.map((_, n) => defaultShot(n)));
  const shot = meta[i] ? { ...meta[i] } : defaultShot(i);

  shot.photoIndex = Number.isInteger(shot.photoIndex) ? shot.photoIndex : i;

  const product = asset.product_id
    ? (await pool.query('SELECT * FROM products_cache WHERE id = $1', [asset.product_id])).rows[0]
    : null;
  const refImgs = (product && Array.isArray(product.images) && product.images.length)
    ? product.images : (product && product.image_url ? [product.image_url] : []);

  // ============ EL PEDIDO ESCRITO CAMBIA LA TOMA, NO SÓLO EL "FOCO" ============
  // Antes la indicación libre se pegaba al campo `focus`, que las tomas 'variantes',
  // 'cta' y 'price' ni miran: "poné más colores" no cambiaba nada. Ahora el cerebro lee
  // el pedido con las fotos reales a la vista y devuelve la receta corregida.
  const instr = String(instructions || '').trim();
  const notes = [];
  let photoDescriptions = [];
  if (instr) {
    const { describeProductPhotos, parseSlideCorrection } = require('../src/ai');
    photoDescriptions = refImgs.length ? await describeProductPhotos(refImgs.slice(0, 10)).catch(() => []) : [];
    try {
      const corr = await parseSlideCorrection({
        instruction: instr,
        current: shot,
        index: i,
        slideCount: urls.length,
        productName: (product && product.name) || asset.theme_title || '',
        photoDescriptions,
        photoCount: Math.max(refImgs.length, 1),
        format: asset.slot_format === 'story' || asset.format === 'story' ? 'story' : 'feed',
        ctaHeadline: config.brand.ctaHeadline,
      });
      if (corr.shotType) shot.shotType = corr.shotType;
      if (corr.overlay !== undefined) {
        shot.overlay = corr.overlay ? stripEmoji(fixSpelling(corr.overlay)) : null;
        shot.overlayByUser = true; // texto pedido por el dueño: no se le toca el género
      }
      if (corr.focus !== undefined) shot.focus = String(corr.focus || '').slice(0, 200);
      if (corr.photoIndex !== undefined) shot.photoIndex = corr.photoIndex;
      if (corr.extraPhotos) shot.extraPhotos = corr.extraPhotos.filter((n) => n !== shot.photoIndex);
      if (corr.note) notes.push(corr.note);
    } catch (err) {
      console.warn(`[generate-daily] Corrección de slide sin cerebro (uso el pedido como indicación de foto): ${err.message}`);
      shot.focus = `${shot.focus || ''} ${instr}`.trim().slice(0, 200);
    }
    // COLORES: si la toma quedó como bento de variantes, se completa con TODAS las
    // fotos de colores distintos que existan de verdad (las del producto y, si no
    // alcanzan, las de sus hermanos de color en Tiendanube). Nunca se inventa un color.
    if (shot.shotType === 'variantes') {
      const filled = await fillColorBento(shot, { product, refImgs, photoDescriptions });
      if (filled.note) notes.push(filled.note);
    }
  }
  // El texto exacto tipeado en el panel gana sobre lo que haya decidido el cerebro.
  // El panel sólo manda `overlay` si el dueño EDITÓ el campo (viene precargado con el
  // texto actual): así, dejarlo como está no pisa la corrección escrita, y vaciarlo a
  // propósito sí saca el texto.
  if (typeof overlay === 'string') { shot.overlay = overlay.trim() || null; shot.overlayByUser = true; }

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
    // Sin artMode: corregir un cuadro lo vuelve a generar, igual que antes hacía con los
    // cuadros 'hero' y 'contexto'. La corrección suele ser justamente sobre la imagen.
  };

  meta[i] = shot;

  /* TIRA COMBO (varios productos, uno por cuadro). Su receta no son "tomas" de un
     producto sino la lista de productos elegidos, así que un cuadro no se puede rehacer
     solo: se vuelve a dibujar la tira entera con los mismos productos. Se avisa, porque
     el pedido escrito (que sí cambia una toma en las tiras normales) acá no aplica. */
  if (esTira && metaRaw.combo && Array.isArray(metaRaw.productIds) && metaRaw.productIds.length > 1) {
    const productos = await pickForcedProducts(metaRaw.productIds.map(Number));
    if (productos.length > 1) {
      const tira = await renderComboPanorama(productos, ctx, {
        etiquetas: Boolean(metaRaw.labels), slides: [],
        // La foto de la tira ya está paga y aprobada: se reusa tal cual (US$0) y así,
        // además, la corrección de un texto no devuelve una escena distinta.
        sceneUrl: metaRaw.sceneUrl || null, sceneAspectIn: metaRaw.sceneAspect || null,
        artMode: metaRaw.sceneUrl ? null : 'foto',
      });
      await pool.query(
        `UPDATE generated_assets SET slides = $2, image_path = $3, slides_meta = $4, updated_at = now() WHERE id = $1`,
        [assetId, JSON.stringify(tira.urls), tira.urls[0],
          JSON.stringify({ ...metaRaw, stripUrl: tira.stripUrl || null })]
      );
      return {
        slides: tira.urls,
        image_path: tira.urls[0],
        note: 'Esta pieza es una tira con VARIOS productos: se volvió a dibujar entera con los mismos. '
          + 'Para cambiar qué productos salen o cómo se ven, editá el slot y regenerá la pieza.',
      };
    }
  }

  if (esTira) {
    const tira = await renderCarouselPanorama(meta, ctx, {
      // Ídem: con la escena guardada se redibuja gratis; sin ella (piezas viejas, hechas
      // con recortes) se respeta cómo estaba hecha en vez de cobrarle una generación.
      sceneUrl: metaRaw.sceneUrl || null, sceneAspectIn: metaRaw.sceneAspect || null,
      artMode: metaRaw.sceneUrl ? null : 'foto',
    });
    const nuevos = tira.urls;
    await pool.query(
      `UPDATE generated_assets SET slides = $2, image_path = $3, slides_meta = $4, updated_at = now() WHERE id = $1`,
      [assetId, JSON.stringify(nuevos), nuevos[0], JSON.stringify({ ...metaRaw, mode: 'panorama', stripUrl: tira.stripUrl || null, sceneUrl: tira.sceneUrl || metaRaw.sceneUrl || null, shots: meta.slice(0, nuevos.length) })]
    );
    notes.push('Como es un carrusel continuo, se volvió a dibujar la tira entera para que los cuadros sigan enganchando.');
    return { slides: nuevos, image_path: nuevos[0], note: notes.join(' ').trim() };
  }

  const { url } = await renderCarouselShot(shot, i, ctx);
  urls[i] = url;

  await pool.query(
    `UPDATE generated_assets SET slides = $2, image_path = $3, slides_meta = $4, updated_at = now() WHERE id = $1`,
    [assetId, JSON.stringify(urls), urls[0], JSON.stringify(meta)]
  );
  return { slides: urls, image_path: urls[0], note: notes.join(' ').trim() || 'Slide regenerado.' };
}

/* ============ COLORES REALES DE UN MODELO ============ */
// Palabras de color que aparecen en los nombres de Tiendanube: se sacan del nombre para
// encontrar los "hermanos" del mismo modelo en otro color.
const COLOR_WORDS = ['negro', 'negra', 'negros', 'negras', 'beige', 'arena', 'verde', 'verdes', 'azul', 'azules',
  'marino', 'gris', 'grises', 'blanco', 'blanca', 'crudo', 'kaki', 'caqui', 'marron', 'bordo', 'rojo', 'roja',
  'amarillo', 'amarilla', 'naranja', 'celeste', 'oliva', 'topo', 'tiza', 'petroleo', 'camel', 'tostado', 'militar',
  'tabaco', 'chocolate', 'plomo', 'acero', 'natural', 'color', 'colores'];

/**
 * Fotos de OTROS colores del mismo modelo. En Tiendanube cada color suele ser un producto
 * aparte ("Pantalón Cargo Pampero Beige" / "… Verde"), así que las fotos del producto de
 * la pieza sólo alcanzan para 1-2 colores: sin esto, pedir "mostrá todos los colores" no
 * podía dar más de lo que ya había. Se exige que el nombre comparta TODAS las palabras
 * del modelo (sin las de color) para no colar un producto distinto.
 */
async function siblingColorPhotos(product, limit = 3) {
  if (!product || !product.name) return [];
  const tokens = stripAccents(String(product.name).toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !COLOR_WORDS.includes(w));
  if (tokens.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT id, name, image_url FROM products_cache
      WHERE id <> $1 AND image_url IS NOT NULL AND ${eligibleSQL()}
        AND translate(lower(name), 'áéíóúñü', 'aeiounu') LIKE ALL($2::text[])
      ORDER BY sales_30d DESC NULLS LAST, id
      LIMIT $3`,
    [product.id, tokens.slice(0, 6).map((w) => `%${w}%`), limit]
  );
  return rows.map((r) => ({ url: r.image_url, name: r.name }));
}

/**
 * UNA foto por COLOR distinto para el bento de variantes. El collage tenía dos fotos del
 * MISMO color (el director de arte eligió 5 y 6, las dos verdes) y encima la plantilla
 * las colapsaba en una sola: el slide "también en otros colores" mostraba un solo color
 * (bug real, ago-2026). Se prioriza lo que eligió el cerebro y se descartan las repes.
 */
function distinctColorExtras(photoIndex, refImgs, photoDescriptions = [], preferred = []) {
  const colorOf = (idx) => {
    const d = photoDescriptions.find((p) => p.index === idx);
    return d && d.color ? stripAccents(String(d.color).toLowerCase()).split(/\s+/)[0] : null;
  };
  const seen = new Set([colorOf(photoIndex)].filter(Boolean));
  const extras = [];
  const order = [...preferred, ...refImgs.map((_, n) => n)];
  for (const idx of order) {
    if (extras.length >= 3 || idx === photoIndex || extras.includes(idx) || idx >= refImgs.length) continue;
    const c = colorOf(idx);
    if (c) { if (seen.has(c)) continue; seen.add(c); }
    else if (photoDescriptions.length) continue; // hay visión y esta foto no aporta color nuevo
    extras.push(idx);
  }
  return { extras, colors: photoDescriptions.length ? seen.size : extras.length + 1 };
}

// Cuántas fotos entran en el collage de colores (la plantilla arma 2, 3, 4 o 6 celdas).
const MAX_BENTO = 6;

/**
 * Completa el bento de variantes con TODOS los colores que existen de verdad.
 *
 * Orden de verdad, de mejor a peor:
 *  1. Las VARIANTES de Tiendanube (exacto y gratis: el atributo "Color" y la foto que la
 *     tienda le asigna a cada color, con su stock). Es lo que ve el cliente en la web.
 *  2. La visión sobre las fotos del producto (sólo mira las primeras 8: por eso el cargo
 *     Pampero, con 6 colores en 29 fotos, "tenía" dos).
 *  3. Los productos hermanos del mismo modelo (cuando cada color es un producto aparte).
 * Devuelve una nota honesta con qué colores entraron y cuáles no.
 */
async function fillColorBento(shot, { product, refImgs, photoDescriptions = [] }) {
  // 1) COLORES REALES DE LA FICHA (la fuente de verdad).
  const colors = productColors(product);
  if (colors.length >= 2) {
    const hero = colors.find((c) => c.index === shot.photoIndex);
    const rest = colors.filter((c) => c !== hero).sort((a, b) => (b.stock == null ? Infinity : b.stock) - (a.stock == null ? Infinity : a.stock));
    const pick = [...(hero ? [hero] : []), ...rest].slice(0, MAX_BENTO);
    if (pick[0].index >= 0) shot.photoIndex = pick[0].index;
    shot.extraPhotos = pick.slice(1).filter((c) => c.index >= 0).map((c) => c.index);
    // Un color cuya foto no esté en la galería guardada entra por URL directa.
    shot.extraUrls = pick.slice(1).filter((c) => c.index < 0).map((c) => c.url);
    const left = colors.slice(MAX_BENTO).map((c) => c.color);
    const note = `El collage muestra los ${pick.length} colores con stock en Tiendanube: ${pick.map((c) => c.color).join(', ')}.`
      + (left.length ? ` (No entraron ${left.join(' y ')}: el collage llega hasta ${MAX_BENTO}.)` : '');
    return { note, total: pick.length };
  }

  // 2) Sin variantes de color en la ficha: una foto por color según la visión.
  const { extras } = distinctColorExtras(shot.photoIndex, refImgs, photoDescriptions, shot.extraPhotos || []);
  shot.extraPhotos = extras;

  // 3) Hermanos de color del catálogo (otros productos del mismo modelo).
  const missing = 4 - (1 + shot.extraPhotos.length);
  const siblings = missing > 0 ? await siblingColorPhotos(product, missing).catch(() => []) : [];
  shot.extraUrls = siblings.map((s) => s.url);

  const total = Math.min(4, 1 + shot.extraPhotos.length + shot.extraUrls.length);
  const kind = photoDescriptions.length ? 'colores' : 'fotos';
  const note = total <= 1
    ? 'No encontré otra foto de otro color en Tiendanube: el slide quedó con la única que hay.'
    : `El collage muestra ${total} ${kind}${siblings.length ? ` (${siblings.length} de otros productos del mismo modelo)` : ''} — son todos los que hay en Tiendanube.`;
  return { note, total };
}

/**
 * "Corregir la historia" (piezas simples, no carrusel): el usuario escribe QUÉ corregir
 * y el cerebro aplica SÓLO ese cambio sobre los textos que se imprimen, re-renderizando
 * con la MISMA escena ya generada (foto IA ya pagada o foto real) — cero gasto de IA y
 * sin tocar nada más de la imagen. Requiere que la pieza tenga su "receta" guardada
 * (slides_meta.single); las piezas viejas hay que regenerarlas una vez para habilitarlo.
 */
async function correctPiece({ assetId, instruction, artMode: artModeIn, artBrief: artBriefIn } = {}) {
  const instr = String(instruction || '').trim();
  // El selector del panel manda; si el dueño no eligió nada pero lo pidió escribiéndolo
  // ("poné un producto de fondo"), se toma de la instrucción.
  const artMode = normalizeArtMode(artModeIn) || artIntentFromInstruction(instr);
  const artBrief = String(artBriefIn || '').trim().slice(0, 400) || null;
  // Se puede corregir SÓLO la imagen (cambiar el arte sin tocar los textos): en ese caso
  // no hace falta escribir una instrucción de texto.
  if (!instr && !artMode) throw new Error('Escribí qué hay que corregir (o elegí una imagen distinta).');

  const { rows } = await pool.query(
    `SELECT a.*, c.pillar FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [assetId]
  );
  const asset = rows[0];
  if (!asset) throw new Error('No existe el asset.');
  const slides = Array.isArray(asset.slides) ? asset.slides : (asset.slides ? JSON.parse(asset.slides) : []);
  if (slides && slides.length > 1) throw new Error('Esta pieza es un carrusel: corregí cada slide con "Corregir esta imagen".');

  let meta = asset.slides_meta;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = null; } }
  if (!meta || meta.single !== true || !meta.recipe) {
    throw new Error('Esta pieza se generó antes de la función de corrección. Regenerala una vez (botón Regenerar) para habilitar "Corregir la historia".');
  }
  const recipe = { ...meta.recipe };

  // Sin instrucción de texto (sólo se pidió cambiar la imagen) no se llama al cerebro:
  // los textos quedan exactamente como están.
  const corr = instr
    ? await require('../src/ai').parseCorrection({
      instruction: instr,
      current: {
        overlayTitle: recipe.overlayTitle || '',
        storyPoints: Array.isArray(recipe.storyPoints) ? recipe.storyPoints : [],
        cta: recipe.ctaLabel || recipe.cta || '',
        badge: recipe.badgeText || '',
        hasPrice: Boolean(recipe.price),
      },
      caption: asset.caption || '',
      pillar: asset.pillar,
    })
    : {};

  // Aplicar SÓLO los campos que devolvió el cerebro (limpios de emoji + ortografía).
  const cleanBurn = (s) => stripEmoji(fixSpelling(String(s == null ? '' : s)));
  if (corr.overlayTitle !== undefined) recipe.overlayTitle = corr.overlayTitle ? cleanBurn(corr.overlayTitle) : null;
  if (Array.isArray(corr.storyPoints)) {
    // Guard anti-deriva: por índice, si el punto quedó IGUAL (comparación normalizada:
    // sin acentos/mayúsculas/signos) conservamos el ORIGINAL tal cual — así la IA no
    // reformatea ($ / paréntesis) un punto que el usuario no pidió tocar. Sólo se toma
    // el texto nuevo cuando el punto REALMENTE cambió.
    const orig = Array.isArray(recipe.storyPoints) ? recipe.storyPoints : [];
    const norm = (s) => stripAccents(String(s || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
    const merged = corr.storyPoints.map((u, i) => (orig[i] != null && norm(u) === norm(orig[i])) ? orig[i] : cleanBurn(u));
    recipe.storyPoints = merged.filter(Boolean).slice(0, 3);
  }
  if (corr.cta !== undefined) recipe.ctaLabel = corr.cta ? shortLabel(cleanBurn(corr.cta), 34) : null;
  if (corr.badge !== undefined) recipe.badgeText = corr.badge ? cleanBurn(corr.badge) : null;
  if (corr.hidePrice === true) { recipe.price = null; recipe.promoPrice = null; }

  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));

  // ============ IMAGEN: reusar la de siempre, o rehacer el arte ============
  // Por defecto la corrección es GRATIS: se re-renderiza con la MISMA escena ya generada
  // (useAi*:false), así el texto cambia y la foto queda idéntica.
  // Con artMode se puede pedir explícitamente otro arte — el caso que faltaba: "esta
  // pieza rehacela con imagen generativa" sin tener que regenerar el copy entero.
  let renderInput;
  if (artMode) {
    const base = { ...recipe, logos, useAiProductScene: false, useAiBackground: false, useAiDiagram: false };
    if (artBrief) base.bgBrief = [base.bgBrief, artBrief].filter(Boolean).join(' — ').slice(0, 600);
    if (artMode === 'tipografica') {
      // Afiche de diseño: se suelta la foto por completo.
      renderInput = { ...base, template: 'poster', productImageUrl: null, productImageUrls: [], bgImageUrl: null, coverImage: false };
    } else if (artMode === 'foto') {
      // Volver a la foto real del catálogo (descarta la escena IA que hubiera).
      const productPhoto = await originalProductPhoto(asset);
      renderInput = { ...base, bgImageUrl: null, productImageUrl: productPhoto || meta.sceneUrl || null };
    } else {
      // generativa: se REGENERA la imagen (esto sí cuesta). El producto real, si lo hay,
      // entra como referencia para que la escena sea ESE producto y no uno inventado.
      const productPhoto = await originalProductPhoto(asset);
      renderInput = {
        ...base,
        bgTheme: recipe.bgTheme || recipe.overlayTitle || asset.theme_title || '',
        artStyle: 'poster',
        artBrief,
        ...(productPhoto
          ? { productImageUrl: productPhoto, useAiProductScene: true }
          : { productImageUrl: null, bgImageUrl: null, useAiBackground: true }),
      };
    }
  } else {
    const sceneAttach = meta.sceneUrl
      ? (meta.sceneAsProduct
        ? { productImageUrl: meta.sceneUrl, coverImage: Boolean(recipe.coverImage) }
        : { bgImageUrl: meta.sceneUrl })
      : {};
    renderInput = { ...recipe, logos, ...sceneAttach, useAiProductScene: false, useAiBackground: false, useAiDiagram: false };
  }

  const render = await renderPostBuffer(renderInput);

  // Si se generó arte nuevo, la escena limpia pasa a ser la de la receta (así la próxima
  // corrección de texto reusa ESTA imagen y no vuelve a pagar).
  let newSceneUrl = meta.sceneUrl;
  let newSceneAsProduct = meta.sceneAsProduct;
  if (artMode) {
    const clean = render.cleanImageUrl || null;
    newSceneAsProduct = Boolean(clean && !String(clean).startsWith('data:') && !renderInput.coverImage);
    newSceneUrl = clean && String(clean).startsWith('data:')
      ? await uploadAsset({
        buffer: Buffer.from(String(clean).split(',')[1] || '', 'base64'),
        filename: `scene-corr-${assetId}-${Date.now()}.jpg`,
        contentType: (String(clean).match(/^data:([^;]+);/) || [])[1] || 'image/jpeg',
      }).catch(() => null)
      : clean;
    if (artMode === 'tipografica') { newSceneUrl = null; newSceneAsProduct = false; }
    recipe.template = renderInput.template || recipe.template;
    recipe.coverImage = Boolean(renderInput.coverImage);
  }

  const newMeta = {
    ...meta, recipe,
    sceneUrl: newSceneUrl || null,
    sceneAsProduct: Boolean(newSceneAsProduct),
    ...(artMode ? { artMode, artBrief: artBrief || null } : {}),
  };
  // La ortografía de marca también se propaga al caption de IG (texto secundario).
  const newCaption = fixSpelling(asset.caption || '');
  await pool.query(
    `UPDATE generated_assets SET image_path = $2, caption = $3, slides_meta = $4, est_cost_usd = COALESCE(est_cost_usd, 0) + $5, updated_at = now() WHERE id = $1`,
    [assetId, render.url, newCaption, JSON.stringify(newMeta), render.costUsd || 0]
  );

  let note = corr.note || (artMode ? 'Imagen actualizada.' : 'Corrección aplicada.');
  if (artMode === 'generativa') {
    note += render.costUsd ? ` (Imagen generada con IA: US$${Number(render.costUsd).toFixed(3)}.)` : ' (No se pudo generar la imagen con IA —revisá AI_IMAGES y el tope diario—; quedó el diseño sin foto generada.)';
  } else if (corr.targetsPhoto) {
    note += ' (La foto se mantiene igual; para cambiar la imagen elegí una opción de "Imagen" acá mismo o usá "Regenerar".)';
  }
  return { image_path: render.url, note };
}

/**
 * Foto REAL para la pieza: la del producto que protagoniza, y si la pieza no tiene
 * producto (una promo de toda la tienda), una foto del catálogo para usar de ambiente.
 * Sin este fallback, pedir "poné un producto de fondo" en un afiche no hacía nada.
 */
async function originalProductPhoto(asset) {
  if (asset.product_id) {
    const { rows } = await pool.query('SELECT images, image_url FROM products_cache WHERE id = $1', [asset.product_id]);
    const p = rows[0];
    const own = p && ((Array.isArray(p.images) && p.images[0]) || p.image_url);
    if (own) return own;
  }
  const { rows } = await pool.query(
    `SELECT image_url FROM products_cache WHERE image_url IS NOT NULL AND ${eligibleSQL()} ORDER BY sales_30d DESC NULLS LAST LIMIT 1`
  );
  return (rows[0] && rows[0].image_url) || null;
}

module.exports = { generateDaily, generateForSlot, pickRelevantVisualProduct, VALID_TEMPLATES, regenerateSlide, correctPiece, renderCarouselPanorama };
