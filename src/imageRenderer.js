const puppeteer = require('puppeteer');
const config = require('./config');
const { uploadAsset } = require('./storage');
const { generateBackground, generateProductScene } = require('./ai');

const DIMS = {
  feed: { w: 1080, h: 1350 },   // 4:5
  story: { w: 1080, h: 1920 },  // 9:16
};

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  return Math.round(Number(price)).toLocaleString('es-AR');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Construye el HTML de la pieza estilo diseñador: foto a sangre (full-bleed) con
 * overlays — wordmark arriba, bloque de precio (ANTES tachado / % OFF / AHORA /
 * transferencia) abajo, y footer con el dominio. Respeta zonas seguras en historias.
 */
function buildHtml(opts) {
  const {
    format = 'feed',
    overlayTitle,
    price,
    promoPrice,
    badgeText,
    productImageUrl,
    bgImageUrl,
    logoUrl,
    interactionLabel,
  } = opts;

  const { w, h } = DIMS[format] || DIMS.feed;
  const isStory = format === 'story';
  const accent = opts.accent || config.brand.colors.darkOrange;
  const site = String(config.brand.site || '').toUpperCase();
  const transfer = String(config.brand.transferNote || '').toUpperCase();

  const cover = bgImageUrl || productImageUrl || null;
  const hasCover = Boolean(cover);
  // El logo/marca se muestra sólo cuando conviene (ej: no en slides internas del carrusel).
  const showBrand = opts.showBrand !== false;

  // Zonas seguras (la UI de IG tapa arriba/abajo en historias).
  const padX = isStory ? 72 : 60;
  const wmTop = isStory ? 150 : 56;
  const footBottom = isStory ? 250 : 150;
  const domainBottom = isStory ? 118 : 52;

  // Lógica de precio: ANTES / % OFF / AHORA.
  const hasPromo = price && promoPrice && Number(promoPrice) < Number(price);
  const off = hasPromo ? Math.round((1 - Number(promoPrice) / Number(price)) * 100) : 0;
  const now = hasPromo ? promoPrice : price;

  let priceBlock = '';
  if (price) {
    priceBlock = `<div class="pblock">
      ${hasPromo ? `<div class="lbl">ANTES</div><div class="antes">$${formatPrice(price)}</div>
        <div class="hr"></div><div class="off">-${off}% OFF</div>` : ''}
      <div class="lbl">${hasPromo ? 'AHORA' : 'PRECIO'}</div>
      <div class="now">$${formatPrice(now)}</div>
      ${transfer ? `<div class="transfer">${esc(transfer)}</div>` : ''}
    </div>`;
  } else if (overlayTitle) {
    priceBlock = `<div class="headline">${esc(overlayTitle)}</div>`;
  }

  const brandMark = logoUrl
    ? `<div class="logopill"><img class="logo" src="${esc(logoUrl)}" alt="BLACKS"/></div>`
    : `<div class="wordmark">BLACKS</div>`;
  const badgeHtml = badgeText ? `<div class="badge">${esc(badgeText)}</div>` : '';
  const interactionHtml = interactionLabel ? `<div class="interaction">${esc(interactionLabel)}</div>` : '';

  const bgFallback = 'radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #eeeef0 55%, #e2e2e6 100%)';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${w}px; height:${h}px; overflow:hidden; font-family:'Inter','Helvetica Neue',Arial,sans-serif; }
    .canvas { position:relative; width:${w}px; height:${h}px; background:${hasCover ? '#111' : bgFallback}; color:#fff; }
    .cover { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
    .scrim { position:absolute; inset:0; z-index:1; background:
      linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,.05) 26%, rgba(0,0,0,0) 52%, rgba(0,0,0,.78) 100%); }
    .layer { position:absolute; inset:0; z-index:2; }
    .wm { position:absolute; top:${wmTop}px; left:0; right:0; display:flex; justify-content:center; }
    .wordmark { font-family:'Anton',sans-serif; font-size:${isStory ? 46 : 42}px; letter-spacing:8px;
      color:#fff; text-shadow:0 2px 18px rgba(0,0,0,.7); }
    .logopill { display:inline-flex; align-items:center; padding:12px 22px; border-radius:16px;
      background:rgba(0,0,0,.32); backdrop-filter:blur(4px); }
    .logo { height:${isStory ? 84 : 70}px; max-width:56%; object-fit:contain; }
    .badge { position:absolute; top:${wmTop - 6}px; right:${padX}px; background:${accent}; color:#fff;
      font-weight:800; font-size:22px; padding:11px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:2px; }
    .foot { position:absolute; left:${padX}px; right:${padX}px; bottom:${footBottom}px; }
    .headline { font-family:'Anton',sans-serif; font-size:${isStory ? 78 : 66}px; line-height:.98; letter-spacing:.5px;
      text-transform:uppercase; color:#fff; max-width:88%; text-shadow:0 2px 16px rgba(0,0,0,.55); }
    .pblock { display:inline-block; }
    .lbl { font-size:22px; font-weight:700; letter-spacing:3px; color:rgba(255,255,255,.9); text-transform:uppercase; }
    .antes { font-family:'Anton',sans-serif; font-size:${isStory ? 54 : 48}px; color:#fff; opacity:.9;
      text-decoration:line-through; text-decoration-thickness:3px; line-height:1; }
    .hr { width:170px; height:3px; background:#fff; margin:12px 0; opacity:.85; }
    .off { display:inline-block; background:${accent}; color:#fff; font-weight:800; font-size:24px;
      padding:5px 14px; border-radius:6px; letter-spacing:1px; margin-bottom:14px; }
    .now { font-family:'Anton',sans-serif; font-size:${isStory ? 104 : 92}px; color:#fff; line-height:.9;
      text-shadow:0 3px 20px rgba(0,0,0,.5); }
    .transfer { font-size:22px; font-weight:600; letter-spacing:1px; color:rgba(255,255,255,.92); margin-top:12px; max-width:520px; }
    .interaction { position:absolute; left:50%; bottom:${footBottom + 40}px; transform:translateX(-50%);
      background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.5); backdrop-filter:blur(4px);
      padding:14px 28px; border-radius:100px; font-size:26px; font-weight:700; color:#fff; white-space:nowrap; }
    .domain { position:absolute; left:0; right:0; bottom:${domainBottom}px; display:flex; align-items:center;
      justify-content:center; gap:12px; }
    .tick { width:13px; height:13px; background:${accent}; border-radius:3px; }
    .site { font-size:${isStory ? 24 : 22}px; font-weight:700; letter-spacing:3px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
    <div class="canvas">
      ${hasCover ? `<img class="cover" src="${esc(cover)}" alt=""/><div class="scrim"></div>` : ''}
      <div class="layer"></div>
      ${showBrand ? `<div class="wm">${brandMark}</div>` : ''}
      ${badgeHtml}
      ${interactionHtml}
      <div class="foot">${priceBlock}</div>
      <div class="domain"><span class="tick"></span><span class="site">${esc(site)}</span></div>
    </div>
  </body></html>`;
}

/**
 * Renderiza una pieza y la sube a Supabase. Devuelve { url, buffer }.
 * Si config.ai.useAiImages y hay Gemini, intenta generar un fondo con IA (best-effort).
 */
async function renderPostBuffer(options) {
  const format = options.format === 'story' ? 'story' : 'feed';
  const { w, h } = DIMS[format];
  const outFile = options.filename || `${format}-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

  // Imagen con IA opcional (no rompe si falla).
  let bgImageUrl = options.bgImageUrl || null;
  let productImageUrl = options.productImageUrl || null;

  // 1) Si hay producto, intentamos meterlo en una escena profesional generada con IA.
  if (!bgImageUrl && options.useAiProductScene && productImageUrl) {
    const scene = await generateProductScene({
      productImageUrl, productName: options.overlayTitle, theme: options.bgTheme, format,
    });
    if (scene) { bgImageUrl = `data:${scene.mimeType};base64,${scene.buffer.toString('base64')}`; productImageUrl = null; }
  }
  // 2) Si no hay producto (marca/lifestyle), generamos un fondo temático.
  if (!bgImageUrl && options.useAiBackground) {
    const bg = await generateBackground({ theme: options.bgTheme || options.overlayTitle, format });
    if (bg) bgImageUrl = `data:${bg.mimeType};base64,${bg.buffer.toString('base64')}`;
  }

  const html = buildHtml({ ...options, format, bgImageUrl, productImageUrl });

  const launchArgs = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--single-process', '--no-zygote', '--disable-extensions', '--disable-background-networking',
    '--disable-default-apps', '--disable-sync', '--disable-translate', '--mute-audio',
    '--no-first-run', '--metrics-recording-only', '--js-flags=--max-old-space-size=128',
  ];
  const launchOptions = { headless: 'new', args: launchArgs };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);
  let buffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    // Timeout acotado: si una imagen remota tarda/404ea, igual sacamos la captura.
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    } catch (_) {
      await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
    }
    // Esperar a que las tipografías (Anton/Inter) estén listas antes de capturar.
    try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}
    buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
  } finally {
    await browser.close();
  }

  const url = await uploadAsset({ buffer, filename: outFile, contentType: 'image/jpeg' });
  return { url, buffer };
}

async function renderPostImage(options) {
  const { url } = await renderPostBuffer(options);
  return url;
}

module.exports = { renderPostImage, renderPostBuffer, buildHtml, DIMS };
