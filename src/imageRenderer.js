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
 * Construye el HTML de la pieza. Diseño oscuro, industrial, premium.
 * Respeta zonas seguras en historias (la UI de IG tapa arriba y abajo).
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
    interactionLabel,
    poll, // { question, options: [a, b] }
  } = opts;

  const { w, h } = DIMS[format] || DIMS.feed;
  const isStory = format === 'story';
  const c = config.brand.colors;

  // Zonas seguras: en historias dejamos aire arriba/abajo para no quedar tapados por la UI de IG.
  const padTop = isStory ? 200 : 64;
  const padBottom = isStory ? 300 : 64;

  const hasBg = Boolean(bgImageUrl);
  const bgLayer = hasBg
    ? `<img class="bg" src="${esc(bgImageUrl)}" alt="" />
       <div class="scrim"></div>`
    : '';

  // Área de producto: si NO hay fondo con IA y sí hay foto de producto, la mostramos protagonista.
  const productArea = (!hasBg && productImageUrl)
    ? `<div class="product-area"><img src="${esc(productImageUrl)}" alt="producto" /></div>`
    : (!hasBg
        ? `<div class="product-area"><div class="placeholder">BLACKS</div></div>`
        : `<div class="product-spacer"></div>`);

  const badgeHtml = badgeText ? `<div class="badge">${esc(badgeText)}</div>` : '<div></div>';
  const priceHtml = price ? `<div class="price">$${formatPrice(price)}</div>` : '';
  const ctaHtml = cta ? `<div class="cta">${esc(cta)}</div>` : '';

  const pollHtml = poll && poll.options && poll.options.length === 2
    ? `<div class="poll">
         <div class="poll-q">${esc(poll.question || '¿Vos qué elegís?')}</div>
         <div class="poll-opts">
           <div class="poll-opt">${esc(poll.options[0])}</div>
           <div class="poll-opt">${esc(poll.options[1])}</div>
         </div>
       </div>`
    : '';

  const interactionHtml = interactionLabel
    ? `<div class="interaction">${esc(interactionLabel)}</div>`
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
    :root { --black:${c.black}; --white:${c.white}; --orange:${c.darkOrange}; }
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${w}px; height:${h}px; overflow:hidden;
      font-family:'Helvetica Neue',Arial,sans-serif; background:var(--black); color:var(--white); }
    .canvas { position:relative; width:${w}px; height:${h}px; display:flex; flex-direction:column;
      padding:${padTop}px 72px ${padBottom}px 72px; }
    .bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
    .scrim { position:absolute; inset:0; z-index:1;
      background:linear-gradient(to bottom, rgba(10,10,10,.55) 0%, rgba(10,10,10,.15) 30%, rgba(10,10,10,.35) 60%, rgba(10,10,10,.92) 100%); }
    .canvas > * { position:relative; z-index:2; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; }
    .brand { display:flex; flex-direction:column; gap:6px; }
    .wordmark { font-size:${isStory ? 40 : 38}px; font-weight:800; letter-spacing:4px; }
    .tagline { font-size:16px; letter-spacing:3px; opacity:.7; text-transform:uppercase; }
    .badge { background:var(--orange); color:var(--white); font-weight:800; font-size:22px;
      padding:12px 24px; border-radius:6px; text-transform:uppercase; letter-spacing:1px; }
    .product-area { flex:1; display:flex; align-items:center; justify-content:center; padding:36px 0; }
    .product-area img { max-width:100%; max-height:100%; object-fit:contain;
      filter:drop-shadow(0 30px 60px rgba(0,0,0,.55)); }
    .product-spacer { flex:1; }
    .placeholder { font-size:120px; font-weight:800; letter-spacing:10px; opacity:.08; }
    .footer { display:flex; flex-direction:column; gap:22px; }
    .title { font-size:${isStory ? 66 : 60}px; font-weight:800; line-height:1.05; letter-spacing:-1px;
      text-transform:uppercase; max-width:95%; }
    .row { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
    .price { font-size:${isStory ? 52 : 46}px; font-weight:800; color:var(--white);
      background:var(--orange); padding:8px 20px; border-radius:8px; }
    .cta { font-size:24px; font-weight:600; opacity:.9; }
    .interaction { align-self:flex-start; margin-top:6px; background:rgba(255,255,255,.14);
      border:1px solid rgba(255,255,255,.35); backdrop-filter:blur(4px);
      padding:14px 26px; border-radius:100px; font-size:26px; font-weight:700; }
    .poll { margin-top:8px; background:rgba(255,255,255,.12); border-radius:20px; padding:26px; }
    .poll-q { font-size:30px; font-weight:700; margin-bottom:18px; }
    .poll-opts { display:flex; gap:14px; }
    .poll-opt { flex:1; text-align:center; background:var(--white); color:var(--black);
      font-size:28px; font-weight:800; padding:18px; border-radius:14px; }
    .accent { position:absolute; left:0; bottom:0; width:100%; height:14px; background:var(--orange); z-index:3; }
  </style></head><body>
    <div class="canvas">
      ${bgLayer}
      <div class="header">
        <div class="brand"><div class="wordmark">BLACKS</div><div class="tagline">Indumentaria de trabajo</div></div>
        ${badgeHtml}
      </div>
      ${productArea}
      <div class="footer">
        ${overlayTitle ? `<div class="title">${esc(overlayTitle)}</div>` : ''}
        ${pollHtml}
        <div class="row">${priceHtml}${ctaHtml}</div>
        ${interactionHtml}
      </div>
      <div class="accent"></div>
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
