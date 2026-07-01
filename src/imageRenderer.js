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
  return Number(price).toLocaleString('es-AR');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Construye el HTML de la pieza. Estética estudio-minimalista (fondo claro, producto
 * con sombra suave, tipografía fuerte, footer con dominio). Si hay una escena generada
 * con IA (bgImageUrl) usa tratamiento oscuro a sangre. Respeta zonas seguras en historias.
 */
function buildHtml(opts) {
  const {
    format = 'feed',
    overlayTitle,
    price,
    cta,
    badgeText,
    productImageUrl,
    bgImageUrl,
    logoUrl,
    interactionLabel,
    poll,
  } = opts;

  const { w, h } = DIMS[format] || DIMS.feed;
  const isStory = format === 'story';
  const accent = opts.accent || config.brand.colors.darkOrange;
  const site = String(config.brand.site || '').toUpperCase();
  const dark = Boolean(bgImageUrl); // escena IA => texto claro sobre foto

  const padX = isStory ? 96 : 88;
  const padTop = isStory ? 210 : 88;
  const padBottom = isStory ? 300 : 88;

  const ink = dark ? '#ffffff' : '#151517';
  const sub = dark ? 'rgba(255,255,255,.82)' : '#6c6c72';
  const pageBg = dark
    ? '#0a0a0a'
    : 'radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f0f0f2 55%, #e3e3e7 100%)';
  const prodShadow = dark ? 'drop-shadow(0 30px 60px rgba(0,0,0,.55))' : 'drop-shadow(0 44px 55px rgba(20,20,20,.20))';

  const bgLayer = dark ? `<img class="bg" src="${esc(bgImageUrl)}" alt=""/><div class="scrim"></div>` : '';
  const stage = (productImageUrl && !dark)
    ? `<div class="stage"><img class="prod" src="${esc(productImageUrl)}" alt=""/></div>`
    : `<div class="stage"></div>`;

  const brandMark = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="BLACKS"/>`
    : `<div class="wordmark">BLACKS</div>`;
  const badgeHtml = badgeText ? `<div class="badge">${esc(badgeText)}</div>` : '<span></span>';
  const priceHtml = price ? `<div class="price">$${formatPrice(price)}</div>` : '';
  const ctaHtml = cta ? `<div class="cta">${esc(cta)}</div>` : '';
  const interactionHtml = interactionLabel ? `<div class="interaction">${esc(interactionLabel)}</div>` : '';
  const pollHtml = poll && poll.options && poll.options.length === 2
    ? `<div class="poll"><div class="poll-q">${esc(poll.question || '¿Vos qué elegís?')}</div>
        <div class="poll-opts"><div class="poll-opt">${esc(poll.options[0])}</div><div class="poll-opt">${esc(poll.options[1])}</div></div></div>`
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${w}px; height:${h}px; overflow:hidden; background:${pageBg};
      font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:${ink}; }
    .canvas { position:relative; width:${w}px; height:${h}px; display:flex; flex-direction:column;
      padding:${padTop}px ${padX}px ${padBottom}px ${padX}px; }
    .bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
    .scrim { position:absolute; inset:0; z-index:1;
      background:linear-gradient(to bottom, rgba(10,10,10,.45) 0%, rgba(10,10,10,.05) 32%, rgba(10,10,10,.35) 62%, rgba(10,10,10,.9) 100%); }
    .canvas > * { position:relative; z-index:2; }
    .top { display:flex; justify-content:space-between; align-items:center; }
    .wordmark { font-family:'Anton',sans-serif; font-size:${isStory ? 44 : 40}px; letter-spacing:6px; color:${ink}; }
    .logo { height:${isStory ? 92 : 78}px; max-width:55%; object-fit:contain;
      ${dark ? 'filter:drop-shadow(0 4px 12px rgba(0,0,0,.5));' : ''} }
    .badge { font-family:'Inter'; background:${accent}; color:#fff; font-weight:800; font-size:22px;
      padding:11px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:2px; }
    .stage { flex:1; display:flex; align-items:center; justify-content:center; padding:${isStory ? 40 : 28}px 0; min-height:0; }
    .prod { max-width:92%; max-height:100%; object-fit:contain; filter:${prodShadow}; }
    .foot { display:flex; flex-direction:column; gap:${isStory ? 26 : 20}px; }
    .title { font-family:'Anton',sans-serif; font-weight:400; font-size:${isStory ? 82 : 72}px; line-height:.96;
      letter-spacing:.5px; text-transform:uppercase; color:${ink}; max-width:96%; }
    .row { display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
    .price { font-family:'Anton',sans-serif; font-size:${isStory ? 70 : 62}px; color:${accent}; letter-spacing:1px; }
    .cta { font-size:26px; font-weight:600; color:${sub}; }
    .interaction { align-self:flex-start; background:${dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.05)'};
      border:1px solid ${dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.12)'};
      padding:14px 26px; border-radius:100px; font-size:26px; font-weight:700; color:${ink}; }
    .poll { background:${dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.04)'}; border-radius:22px; padding:26px; }
    .poll-q { font-size:32px; font-weight:800; margin-bottom:18px; color:${ink}; }
    .poll-opts { display:flex; gap:14px; }
    .poll-opt { flex:1; text-align:center; background:${accent}; color:#fff; font-weight:800; font-size:28px; padding:18px; border-radius:14px; }
    .brandline { display:flex; align-items:center; gap:14px; margin-top:6px; padding-top:22px;
      border-top:1px solid ${dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.1)'}; }
    .tick { width:14px; height:14px; background:${accent}; border-radius:3px; flex:none; }
    .site { font-size:24px; font-weight:700; letter-spacing:3px; color:${sub}; }
  </style></head><body>
    <div class="canvas">
      ${bgLayer}
      <div class="top">${brandMark}${badgeHtml}</div>
      ${stage}
      <div class="foot">
        ${overlayTitle ? `<div class="title">${esc(overlayTitle)}</div>` : ''}
        ${pollHtml}
        ${(priceHtml || ctaHtml) ? `<div class="row">${priceHtml}${ctaHtml}</div>` : ''}
        ${interactionHtml}
        <div class="brandline"><span class="tick"></span><span class="site">${esc(site)}</span></div>
      </div>
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
