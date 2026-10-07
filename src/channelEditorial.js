const WEATHER_HOOK = /\b(lluvia|lluvioso|lluviosa|llueve|mojad[oa]s?|clima inestable|cualquier clima|d[ií]as? grises?)\b/i;
const WEATHER_PRODUCT = /impermeable|repelente al agua|resistente al agua|piloto|paraguas|bota(?:s)? de lluvia|rompeviento/i;
const GENERIC_COPY = /\b(?:sin[oó]nimo de|d[ií]a a d[ií]a|uso diario|excelente opci[oó]n|ideal(?:es)? para (?:el d[ií]a a d[ií]a|cualquier)|comodidad y estilo|resistencia y comodidad|acompa[ñn]arte|te acompa[ñn]a|siempre suma|(?:es )?tu aliad[oa]|aliad[oa] para tu d[ií]a a d[ií]a|compa[ñn]er[oa] perfect[oa]|tradici[oó]n con calidad|se adapta al ritmo|vers[aá]til es clave|no (?:puede|pueden) faltar|para cualquier (?:momento|actividad|ocasi[oó]n|jornada)|durabilidad excepcional|una opci[oó]n vers[aá]til|prenda infaltable|cualquier outfit|confort es prioridad)\b/i;
const COMMERCE_LINE = /^(?:💰|💳|🚚|🛒|🔗|🏢|Precio:|Comprá acá:|Ver producto:|Consultas mayoristas:|Cotizaciones para empresas:)/iu;

function dateKey(value) {
  return String(value instanceof Date ? value.toISOString() : value || '').slice(0, 10);
}

function editorialBody(body) {
  return String(body || '').split('\n').filter((line) => !COMMERCE_LINE.test(line.trim())).join(' ').trim();
}

function normalized(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const words = (text) => new Set(normalized(text).split(' ').filter((w) => w.length > 3));
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((w) => right.has(w)).length;
  return intersection / (left.size + right.size - intersection);
}

function productIds(post) {
  const ids = Array.isArray(post.product_ids) ? post.product_ids : [];
  return [...new Set([post.product_id, ...ids].filter(Boolean).map(String))];
}

function daysBetween(a, b) {
  return Math.abs((Date.parse(`${dateKey(a)}T12:00:00Z`) - Date.parse(`${dateKey(b)}T12:00:00Z`)) / 86400000);
}

function catalogEvidence(product) {
  const description = product?.raw?.description;
  const detail = typeof description === 'string' ? description
    : description?.es || '';
  const decoded = String(detail).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde);/gi,
      (_, name) => ({ aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ' })[name.toLowerCase()])
    .replace(/\s+/g, ' ').trim();
  const features = decoded.match(/\bCaracter[ií]sticas\b/i);
  const specifications = features ? decoded.slice(features.index + features[0].length).trim() : decoded;
  return `${product?.name || ''} ${product?.category || ''}. ${specifications}`;
}

function reviewPosts(posts, surrounding, catalog) {
  const issues = [];
  const products = new Map(catalog.map((p) => [String(p.id), p]));
  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const prior = [...surrounding, ...posts.slice(0, index)];
    const body = editorialBody(post.body);
    const postIds = productIds(post);
    if (post.kind === 'texto' && postIds.length && GENERIC_COPY.test(body)) {
      issues.push(`${post.date}: contiene una frase genérica de recomendación (${body.match(GENERIC_COPY)[0]}). Usá un detalle verificable y una construcción propia.`);
    }
    if (post.kind === 'texto' && body.split(/\s+/).length > 75) {
      issues.push(`${post.date}: el texto es demasiado largo para el canal; recortalo sin perder el dato concreto.`);
    }
    if (post.kind === 'texto' && postIds.length && WEATHER_HOOK.test(`${post.topic} ${body}`) &&
        postIds.some((id) => !WEATHER_PRODUCT.test(catalogEvidence(products.get(id))))) {
      issues.push(`${post.date}: el gancho de lluvia/clima no está respaldado por el producto elegido.`);
    }
    for (const other of prior) {
      const gap = daysBetween(post.date, other.date || other.post_date);
      if (!Number.isFinite(gap)) continue;
      const otherIds = productIds(other);
      if (gap <= 7 && postIds.some((id) => otherIds.includes(id))) {
        issues.push(`${post.date}: repite un producto de ${dateKey(other.date || other.post_date)} dentro de 7 días.`);
      }
      if (gap <= 30 && normalized(post.topic) && normalized(post.topic) === normalized(other.topic)) {
        issues.push(`${post.date}: repite el tema/título de ${dateKey(other.date || other.post_date)}.`);
      }
      const otherBody = editorialBody(other.body);
      if (gap <= 30 && similarity(body, otherBody) >= 0.62) {
        issues.push(`${post.date}: el texto se parece demasiado al de ${dateKey(other.date || other.post_date)}.`);
      }
      const opening = (text) => normalized(text).split(' ').slice(0, 6).join(' ');
      if (gap <= 14 && postIds.length && otherIds.length && opening(body).split(' ').length >= 6 &&
          opening(body) === opening(otherBody)) {
        issues.push(`${post.date}: repite la apertura de una recomendación del ${dateKey(other.date || other.post_date)}.`);
      }
    }
  }
  const recommendations = posts.filter((p) => p.kind === 'texto' && productIds(p).length >= 1);
  if (recommendations.length >= 3 && recommendations.every((p) => !/\n\s*\n/.test(p.body))) {
    issues.push('La tanda usa un solo bloque de texto en todas las recomendaciones; variá también la estructura entre piezas.');
  }
  const formulaOpenings = recommendations.filter((p) => /^(?:nuestr[oa]s?\b|para\b)/i.test(editorialBody(p.body)));
  if (formulaOpenings.length >= 3 && formulaOpenings.length >= Math.ceil(recommendations.length / 2)) {
    for (const post of formulaOpenings.slice(1)) {
      issues.push(`${post.date}: repite una apertura formularia ("Nuestro/a" o "Para..."); empezá con un dato, una pregunta o una observación concreta.`);
    }
  }
  return [...new Set(issues)];
}

module.exports = { dateKey, editorialBody, catalogEvidence, reviewPosts };
