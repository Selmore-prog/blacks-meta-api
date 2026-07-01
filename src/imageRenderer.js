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
  const showBrand = opts.showBrand !== false;

  // Zonas seguras GENEROSAS: en historias IG tapa arriba (usuario/hora) y abajo
  // (barra "Enviá un mensaje" + reacciones). Dejamos todo el texto adentro del área visible.
  const padX = isStory ? 84 : 60;
  const wmTop = isStory ? 170 : 54;
  const footBottom = isStory ? 360 : 140; // el texto abajo queda por ENCIMA de la barra de mensaje
  const footTop = isStory ? 330 : 175;    // para el layout con texto arriba
  const domainBottom = isStory ? 250 : 54;
  const heroTop = isStory ? 250 : 150;
  const heroBottom = isStory ? 480 : 300;

  // Posiciones dinámicas del texto (varía entre piezas). Con precio: siempre abajo-izquierda.
  const LAYOUTS = [{ a: 'left', v: 'bottom' }, { a: 'center', v: 'bottom' }, { a: 'left', v: 'top' }];
  const L = price ? { a: 'left', v: 'bottom' } : LAYOUTS[(Number(opts.layoutSeed) || 0) % LAYOUTS.length];
  const footPos = L.v === 'top' ? `top:${footTop}px` : `bottom:${footBottom}px`;

  const hasPromo = price && promoPrice && Number(promoPrice) < Number(price);
  const off = hasPromo ? Math.round((1 - Number(promoPrice) / Number(price)) * 100) : 0;
  const now = hasPromo ? promoPrice : price;

  let content = '';
  if (price) {
    content = `<div class="pblock">
      ${hasPromo ? `<div class="lbl">ANTES</div><div class="antes">$${formatPrice(price)}</div>
        <div class="hr"></div><div class="off">-${off}% OFF</div>` : ''}
      <div class="lbl">${hasPromo ? 'AHORA' : 'PRECIO'}</div>
      <div class="now">$${formatPrice(now)}</div>
      ${transfer ? `<div class="transfer">${esc(transfer)}</div>` : ''}
    </div>`;
  } else if (overlayTitle) {
    content = `<div class="headline">${esc(overlayTitle)}</div>`;
  }

  // El logo va SIN fondo (PNG transparente), sólo con una sombra sutil para legibilidad.
  const brandMark = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="BLACKS"/>`
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
    .canvas { position:relative; width:${w}px; height:${h}px; background:${hasCover ? '#0e0e10' : bgFallback}; color:#fff; }
    /* Fondo: la misma foto difuminada para rellenar sin recortar el producto. */
    .bg { position:absolute; inset:-60px; width:calc(100% + 120px); height:calc(100% + 120px);
      object-fit:cover; filter:blur(34px) brightness(.66); z-index:0; }
    /* Producto: CONTAIN (se ve entero, sin zoom excesivo). */
    .hero { position:absolute; top:${heroTop}px; bottom:${heroBottom}px; left:${padX}px; right:${padX}px;
      display:flex; align-items:center; justify-content:center; z-index:1; }
    .hero img { max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 26px 44px rgba(0,0,0,.45)); }
    .scrim { position:absolute; inset:0; z-index:2; background:
      linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,.72) 100%); }
    .wm { position:absolute; top:${wmTop}px; left:0; right:0; display:flex; justify-content:center; z-index:4; }
    .wordmark { font-family:'Anton',sans-serif; font-size:${isStory ? 46 : 42}px; letter-spacing:8px;
      color:#fff; text-shadow:0 2px 18px rgba(0,0,0,.7); }
    .logo { height:${isStory ? 78 : 64}px; max-width:52%; object-fit:contain;
      filter:drop-shadow(0 1px 2px rgba(255,255,255,.35)) drop-shadow(0 4px 12px rgba(0,0,0,.55)); }
    .badge { position:absolute; top:${wmTop - 6}px; right:${padX}px; background:${accent}; color:#fff;
      font-weight:800; font-size:22px; padding:11px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:2px; z-index:4; }
    .foot { position:absolute; left:${padX}px; right:${padX}px; ${footPos}; text-align:${L.a}; z-index:4; }
    .headline { display:inline-block; font-family:'Anton',sans-serif; font-size:${isStory ? 76 : 64}px; line-height:.98;
      letter-spacing:.5px; text-transform:uppercase; color:#fff; max-width:92%; text-shadow:0 2px 16px rgba(0,0,0,.6); }
    .pblock { display:inline-block; text-align:left; }
    .lbl { font-size:22px; font-weight:700; letter-spacing:3px; color:rgba(255,255,255,.9); text-transform:uppercase; }
    .antes { font-family:'Anton',sans-serif; font-size:${isStory ? 54 : 48}px; color:#fff; opacity:.9;
      text-decoration:line-through; text-decoration-thickness:3px; line-height:1; }
    .hr { width:170px; height:3px; background:#fff; margin:12px 0; opacity:.85; }
    .off { display:inline-block; background:${accent}; color:#fff; font-weight:800; font-size:24px;
      padding:5px 14px; border-radius:6px; letter-spacing:1px; margin-bottom:14px; }
    .now { font-family:'Anton',sans-serif; font-size:${isStory ? 100 : 92}px; color:#fff; line-height:.9;
      text-shadow:0 3px 20px rgba(0,0,0,.5); }
    .transfer { font-size:22px; font-weight:600; letter-spacing:1px; color:rgba(255,255,255,.92); margin-top:12px; max-width:520px; }
    .interaction { position:absolute; left:50%; bottom:${(isStory ? 360 : 140) + 30}px; transform:translateX(-50%);
      background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.5); backdrop-filter:blur(4px);
      padding:14px 28px; border-radius:100px; font-size:26px; font-weight:700; color:#fff; white-space:nowrap; z-index:4; }
    .domain { position:absolute; left:0; right:0; bottom:${domainBottom}px; display:flex; align-items:center;
      justify-content:center; gap:12px; z-index:4; }
    .tick { width:13px; height:13px; background:${accent}; border-radius:3px; }
    .site { font-size:${isStory ? 24 : 22}px; font-weight:700; letter-spacing:3px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
    <div class="canvas">
      ${hasCover ? `<img class="bg" src="${esc(cover)}" alt=""/><div class="hero"><img src="${esc(cover)}" alt=""/></div><div class="scrim"></div>` : ''}
      ${showBrand ? `<div class="wm">${brandMark}</div>` : ''}
      ${badgeHtml}
      ${interactionHtml}
      <div class="foot">${content}</div>
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
