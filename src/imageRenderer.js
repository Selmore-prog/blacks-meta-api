const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const config = require('./config');
const { uploadAsset } = require('./storage');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'post-template.html');

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  return Number(price).toLocaleString('es-AR');
}

function buildHtml({ title, price, ctaText, badgeText, imageUrl, theme = 'light' }) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const isDark = theme === 'dark';

  const replacements = {
    COLOR_BLACK: config.brand.colors.black,
    COLOR_WHITE: config.brand.colors.white,
    COLOR_ORANGE: config.brand.colors.darkOrange,
    BG_VAR: isDark ? 'black' : 'white',
    TEXT_VAR: isDark ? 'white' : 'black',
    TITLE: title || '',
    CTA_TEXT: ctaText || '',
    BADGE_HTML: badgeText ? `<div class="badge">${badgeText}</div>` : '<div></div>',
    PRICE_HTML: price ? `<div class="price">$${formatPrice(price)}</div>` : '<div></div>',
    PRODUCT_IMAGE_HTML: imageUrl
      ? `<img src="${imageUrl}" alt="producto" />`
      : `<div class="product-placeholder">FOTO PRODUCTO</div>`,
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

/**
 * Renderiza una pieza gráfica en memoria (buffer) y la sube a Supabase Storage (o disco local).
 * Devuelve un objeto { url, buffer }.
 */
async function renderPostBuffer({ title, price, ctaText, badgeText, imageUrl, theme = 'light', filename }) {
  const html = buildHtml({ title, price, ctaText, badgeText, imageUrl, theme });
  const outFile = filename || `post-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ];

  const launchOptions = {
    headless: 'new',
    args: launchArgs,
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  let buffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
  } finally {
    await browser.close();
  }

  const url = await uploadAsset({
    buffer,
    filename: outFile,
    contentType: 'image/jpeg',
  });

  return { url, buffer };
}

/**
 * Renderiza una pieza gráfica 1080x1350 y devuelve la URL pública.
 * Mantiene compatibilidad con las llamadas originales que esperan un string.
 */
async function renderPostImage(options) {
  const { url } = await renderPostBuffer(options);
  return url;
}

module.exports = { renderPostImage, renderPostBuffer, buildHtml };
