const config = require('./config');
const { productPath } = require('./homeRails');

function productUrl(product) {
  const path = productPath(product?.permalink);
  return path ? new URL(path, `${config.storeUrl.replace(/\/+$/, '')}/`).toString() : null;
}

function currentPrice(product) {
  const regular = Number(product?.price);
  const promo = Number(product?.promo_price);
  if (!Number.isFinite(regular) || regular <= 0) return null;
  return promo > 0 && promo < regular ? promo : regular;
}

function money(value) {
  return `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

function benefitsFromConfig(cfg) {
  const items = cfg?.enabled && Array.isArray(cfg.items) ? cfg.items.map((x) => String(x.text || '')) : [];
  const installment = items.find((x) => /\d+\s*cuotas?\s*sin\s*inter[eé]s/i.test(x)) || null;
  const shipping = items.find((x) => /env[ií]o\s+gratis/i.test(x)) || '';
  const thresholdMatch = shipping.match(/(?:desde|a partir de|superando)\s*\$\s*([\d.]+)/i);
  const threshold = thresholdMatch ? Number(thresholdMatch[1].replace(/\./g, '')) : null;
  return { installment, shippingThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null };
}

function verifiedBenefitsConfig(configured, companyFacts) {
  const items = configured?.enabled && Array.isArray(configured.items) ? [...configured.items] : [];
  const updated = new Date(companyFacts?.updated_at).getTime();
  if (Number.isFinite(updated) && Date.now() - updated <= 14 * 86400000) {
    for (const line of String(companyFacts.facts_summary || '').split('\n')) {
      if (/cuotas?\s+sin\s+inter[eé]s|env[ií]o\s+gratis/i.test(line)) {
        items.push({ text: line.replace(/^\s*[-•]\s*/, '').trim() });
      }
    }
  }
  return { enabled: items.length > 0, items };
}

function hasFreeShipping(product, benefits) {
  if (product?.raw?.free_shipping === true) return true;
  const price = currentPrice(product);
  return Boolean(price && benefits?.shippingThreshold && price >= benefits.shippingThreshold);
}

function normalizeChannelTone(text) {
  let normalized = String(text || '').trim();
  const forcedOpening = /^\s*[📢📣¡!\s]*(?:atenci[oó]n|che|gran noticia|novedades?)\s*[:!¡,.—-]*\s*/iu;
  while (forcedOpening.test(normalized)) normalized = normalized.replace(forcedOpening, '');
  normalized = normalized
    .replace(/volvi[oó] a ingresar/gi, 'ya está disponible otra vez')
    .replace(/reingres[oó]/gi, 'volvió a estar disponible')
    .replace(/\bdescubr[ií]\b/gi, 'mirá')
    .trim();
  return normalized ? normalized[0].toLocaleUpperCase('es-AR') + normalized.slice(1) : '';
}

/** Adjunta hechos verificados y links fuera de la parte libre que redacta la IA. */
function completeMessage(body, products, audience, benefitsConfig, wholesale, presentation = 0) {
  const text = normalizeChannelTone(body);
  const facts = benefitsFromConfig(benefitsConfig);
  if (!products.length) return text;
  const lines = [];
  if (audience === 'mayorista') {
    const contact = String(wholesale?.contact || '').trim();
    lines.push(contact ? `🏢 Consultas mayoristas: ${contact}` : '🏢 Consultanos por disponibilidad y condiciones mayoristas');
    for (const product of products) {
      const url = productUrl(product);
      if (url) lines.push(`🔗 ${products.length > 1 ? `${product.name}: ` : 'Ver producto: '}${url}`);
    }
  } else {
    if (products.length === 1) {
      const price = currentPrice(products[0]);
      if (price) lines.push(presentation === 1 ? `💰 ${money(price)}` :
        presentation === 2 ? `Precio: ${money(price)}` : `💰 Precio: ${money(price)}`);
      if (presentation === 1 && facts.installment) lines.push(`💳 ${facts.installment.replace(/[.!]+$/, '')}`);
      if (hasFreeShipping(products[0], facts)) lines.push('🚚 Envío gratis');
    } else {
      for (const product of products) {
        const price = currentPrice(product);
        if (price) lines.push(`💰 ${product.name}: ${money(price)}${hasFreeShipping(product, facts) ? ' · envío gratis' : ''}`);
      }
    }
    if (facts.installment && (presentation !== 1 || products.length > 1)) {
      lines.push(`💳 ${facts.installment.replace(/[.!]+$/, '')}`);
    }
    for (const product of products) {
      const url = productUrl(product);
      if (url) lines.push(presentation === 1 && products.length === 1 ? `🔗 Ver producto: ${url}` :
        `🛒 ${products.length > 1 ? `${product.name}: ` : presentation === 2 ? 'En la tienda: ' : 'Comprá acá: '}${url}`);
    }
  }
  return [text, lines.join('\n')].filter(Boolean).join('\n\n');
}

module.exports = { productUrl, currentPrice, benefitsFromConfig, verifiedBenefitsConfig,
  hasFreeShipping, normalizeChannelTone, completeMessage };
