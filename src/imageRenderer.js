const puppeteer = require('puppeteer');
const config = require('./config');
const { uploadAsset } = require('./storage');
const { generateBackground, generateProductScene, generateDiagram } = require('./ai');

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

/* =========================================================================
 * SISTEMA DE PLANTILLAS
 *  - fullbleed : foto a sangre + bloque de precio (la clásica). Producto/promo con precio.
 *  - minimal   : estudio claro, producto flotando, titular oscuro. Feed evergreen/marca.
 *  - promo     : oscura y agresiva, % OFF gigante. Ofertas y fechas comerciales.
 *  - educativo : tipográfica clara, titular primero, foto de apoyo. Tips/carruseles.
 *  - mayorista : corporativa oscura, badge MAYORISTA + CTA presupuesto. B2B.
 * Todas comparten dims, zonas seguras de IG y footer con dominio.
 * ========================================================================= */

const TEMPLATES = ['fullbleed', 'minimal', 'promo', 'educativo', 'mayorista'];

function sharedGeometry(format) {
  const { w, h } = DIMS[format] || DIMS.feed;
  const isStory = format === 'story';
  return {
    w, h, isStory,
    padX: isStory ? 84 : 60,
    wmTop: isStory ? 170 : 54,
    footBottom: isStory ? 360 : 140,
    domainBottom: isStory ? 250 : 54,
  };
}

function headHtml(w, h) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${w}px; height:${h}px; overflow:hidden; font-family:'Inter','Helvetica Neue',Arial,sans-serif; }
  </style>`;
}

/**
 * Marca de BLACKS. `dark` = el FONDO donde va a ir es oscuro -> necesita el logo de
 * tinta CLARA (logoOnDark); fondo claro -> logo de tinta OSCURA (logoOnLight).
 * Acepta el par {logoOnLight, logoOnDark} (selección automática) o un logoUrl único
 * (compat vieja, sin distinción de fondo).
 */
function brandMarkHtml(logos, { dark = false, heightPx = 64 } = {}) {
  const logoUrl = typeof logos === 'string' ? logos : (dark ? logos?.onLight : logos?.onDark) || logos?.fallback;
  if (logoUrl) {
    return `<img class="logo" style="height:${heightPx}px; max-width:68%; object-fit:contain;
      filter:drop-shadow(0 1px 2px ${dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.35)'}) drop-shadow(0 4px 12px ${dark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.55)'});" src="${esc(logoUrl)}" alt="BLACKS"/>`;
  }
  return `<div style="font-family:'Anton',sans-serif; font-size:${Math.round(heightPx * 0.62)}px; letter-spacing:8px; color:${dark ? '#111' : '#fff'};">BLACKS</div>`;
}

function domainHtml(g, { dark = false, accent }) {
  const site = String(config.brand.site || '').toUpperCase();
  return `<div style="position:absolute; left:0; right:0; bottom:${g.domainBottom}px; display:flex; align-items:center; justify-content:center; gap:12px; z-index:4;">
    <span style="width:13px; height:13px; background:${accent}; border-radius:3px;"></span>
    <span style="font-size:${g.isStory ? 24 : 22}px; font-weight:700; letter-spacing:3px; color:${dark ? '#1c1c1e' : '#fff'}; ${dark ? '' : 'text-shadow:0 1px 6px rgba(0,0,0,.6);'}">${esc(site)}</span>
  </div>`;
}

/** Badge tipo "sello" (esquina recta + acento sólido, bien espaciado). */
function badgeTag(text, { accent, top, right }) {
  return `<div style="position:absolute; top:${top}px; right:${right}px; background:${accent}; color:#fff;
    font-weight:800; font-size:19px; padding:9px 17px; border-radius:5px; text-transform:uppercase;
    letter-spacing:3px; box-shadow:0 6px 18px rgba(0,0,0,.4); z-index:4;">${esc(text)}</div>`;
}

/** Cupón como ticket claro con el código destacado (la IA no escribe texto). */
function couponTag(code, { isStory, marginTop = 22 } = {}) {
  if (!code) return '';
  return `<div style="display:inline-flex; align-items:center; gap:12px; margin-top:${marginTop}px; padding:12px 20px;
    background:rgba(255,255,255,.95); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.4);">
    <span style="font-size:${isStory ? 22 : 19}px; font-weight:800; letter-spacing:3px; color:#6b6b70; text-transform:uppercase; padding-right:12px; border-right:2px dashed #c9c9cf;">CUPÓN</span>
    <span style="font-family:'Anton',sans-serif; font-size:${isStory ? 46 : 40}px; letter-spacing:2px; color:#141416;">${esc(code)}</span>
  </div>`;
}

/** Logo/wordmark esquinado arriba-izquierda (posición común entre plantillas). */
function cornerBrand(logos, { showBrand, dark, heightPx, top, left }) {
  if (showBrand === false) return '';
  return `<div style="position:absolute; top:${top}px; left:${left}px; display:flex; align-items:center; z-index:4;">
    ${brandMarkHtml(logos, { dark, heightPx })}</div>`;
}

function priceParts(price, promoPrice) {
  const hasPromo = price && promoPrice && Number(promoPrice) < Number(price);
  return {
    hasPromo,
    off: hasPromo ? Math.round((1 - Number(promoPrice) / Number(price)) * 100) : 0,
    now: hasPromo ? promoPrice : price,
  };
}

/**
 * Capa de foto para plantillas que NO son full-bleed por diseño (minimal/promo/mayorista).
 *  - bgImageUrl (escena generada con IA, con fondo propio): sangra TODO el canvas
 *    (cover) para que se vea como una foto real, no como un recorte pegado.
 *  - productImageUrl (recorte de catálogo, fondo blanco/plano): se contiene en una
 *    caja del layout — ahí sí queda bien porque el fondo del recorte ya es liso.
 * Devuelve { html, fullBleed } para que el template sepa si necesita un scrim.
 */
function heroPhotoHtml({ bgImageUrl, productImageUrl, box, shadow = 'rgba(0,0,0,.5)', darkBg = false }) {
  if (bgImageUrl) {
    return {
      fullBleed: true,
      html: `<img src="${esc(bgImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/>`,
    };
  }
  if (productImageUrl) {
    if (darkBg) {
      return {
        fullBleed: false,
        html: `<div style="position:absolute; top:${box.top}px; bottom:${box.bottom}px; left:${box.left}px; right:${box.right}px;
          display:flex; align-items:center; justify-content:center; z-index:1;
          background:radial-gradient(circle at 50% 0%, #ffffff 0%, #f4f4f7 100%);
          border:1px solid rgba(255,255,255,.35); border-radius:36px;
          box-shadow:0 35px 80px rgba(0,0,0,.65), inset 0 2px 6px rgba(255,255,255,.9); padding:32px; overflow:hidden;">
          <div style="position:absolute; top:0; left:15%; right:15%; height:4px; background:linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.8) 50%, rgba(255,255,255,0) 100%);"></div>
          <img src="${esc(productImageUrl)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 25px 40px rgba(0,0,0,.18)); mix-blend-mode:multiply; -webkit-mask-image:radial-gradient(circle at center, black 65%, transparent 98%); mask-image:radial-gradient(circle at center, black 65%, transparent 98%);"/>
        </div>`,
      };
    }
    return {
      fullBleed: false,
      html: `<div style="position:absolute; top:${box.top}px; bottom:${box.bottom}px; left:${box.left}px; right:${box.right}px;
        display:flex; align-items:center; justify-content:center; z-index:1;">
        <img src="${esc(productImageUrl)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 30px 50px ${shadow}); mix-blend-mode:multiply; -webkit-mask-image:radial-gradient(circle at center, black 65%, transparent 98%); mask-image:radial-gradient(circle at center, black 65%, transparent 98%);"/>
      </div>`,
    };
  }
  return { fullBleed: false, html: '' };
}

/** Degradé de legibilidad sobre una foto full-bleed (arriba/abajo oscuro, centro despejado). */
function scrimHtml({ dark = true, extra = '' } = {}) {
  const a = dark ? '.6' : '.75';
  const b = dark ? '.85' : '.9';
  const base = dark ? '0,0,0' : '255,255,255';
  return `<div style="position:absolute; inset:0; z-index:2; background:
    linear-gradient(to bottom, rgba(${base},${a}) 0%, rgba(${base},.12) 26%, rgba(${base},.12) 56%, rgba(${base},${b}) 100%)${extra ? `, ${extra}` : ''};"></div>`;
}

/**
 * Construye el HTML de la pieza estilo diseñador: foto a sangre (full-bleed) con
 * overlays — wordmark arriba, bloque de precio (ANTES tachado / % OFF / AHORA /
 * transferencia) abajo, y footer con el dominio. Respeta zonas seguras en historias.
 */
function buildFullbleedHtml(opts) {
  const {
    format = 'feed',
    overlayTitle,
    price,
    promoPrice,
    badgeText,
    productImageUrl,
    bgImageUrl,
    logos,
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

  const padX = isStory ? 84 : 60;
  const wmTop = isStory ? 170 : 54;
  const footBottom = isStory ? 360 : 140;
  const footTop = isStory ? 330 : 175;
  const domainBottom = isStory ? 250 : 54;
  const heroTop = isStory ? 270 : 165;
  const heroBottom = isStory ? 480 : 300;

  const LAYOUTS = [{ a: 'left', v: 'bottom' }, { a: 'center', v: 'bottom' }, { a: 'left', v: 'top' }];
  const L = price ? { a: 'left', v: 'bottom' } : LAYOUTS[(Number(opts.layoutSeed) || 0) % LAYOUTS.length];
  const footPos = L.v === 'top' ? `top:${footTop}px` : `bottom:${footBottom}px`;

  const hasPromo = price && promoPrice && Number(promoPrice) < Number(price);
  const off = hasPromo ? Math.round((1 - Number(promoPrice) / Number(price)) * 100) : 0;
  const now = hasPromo ? promoPrice : price;

  const couponHtml = opts.couponCode
    ? `<div class="coupon"><span class="cpn-lbl">CUPÓN</span><span class="cpn-code">${esc(opts.couponCode)}</span></div>`
    : '';

  let content = '';
  if (price) {
    content = `<div class="pblock">
      ${hasPromo ? `<div class="pheader"><span class="antes">$${formatPrice(price)}</span><span class="off">-${off}% OFF</span></div>` : ''}
      <div class="lbl">${hasPromo ? 'AHORA' : 'PRECIO'}</div>
      <div class="now">$${formatPrice(now)}</div>
      ${transfer ? `<div class="transfer"><span class="lightning">⚡</span> ${esc(transfer)}</div>` : ''}
    </div>${couponHtml}`;
  } else if (overlayTitle) {
    content = `<div class="headline">${esc(overlayTitle)}</div>${couponHtml}`;
  }

  const fullbleedLogoUrl = (logos && typeof logos === 'object') ? (logos.onDark || logos.fallback) : logos;
  const brandMark = fullbleedLogoUrl
    ? `<img class="logo" src="${esc(fullbleedLogoUrl)}" alt="BLACKS"/>`
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
    .canvas { position:relative; width:${w}px; height:${h}px; background:${hasCover ? '#0a0a0c' : bgFallback}; color:#fff; overflow:hidden; }
    /* Glow volumétrico ambiental de estudio */
    .glow { position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); width:850px; height:850px;
      background:radial-gradient(circle, rgba(232,93,27,.22) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:1; }
    .bg { position:absolute; inset:-40px; width:calc(100% + 80px); height:calc(100% + 80px);
      object-fit:cover; filter:blur(28px) brightness(.55); z-index:0; }
    .hero { position:absolute; top:${heroTop}px; bottom:${heroBottom}px; left:${padX}px; right:${padX}px;
      display:flex; align-items:center; justify-content:center; z-index:1; }
    .hero img { max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 30px 60px rgba(0,0,0,.55)); }
    /* Scrim editorial multicapa: viñeta oscura en bordes + sombra de legibilidad en texto */
    .scrim { position:absolute; inset:0; z-index:2; background:
      radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,.45) 100%),
      linear-gradient(to bottom, rgba(0,0,0,.65) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 55%, rgba(10,10,12,.88) 100%); }
    .wm { position:absolute; top:${wmTop}px; left:${padX}px; display:flex; justify-content:flex-start; z-index:4; }
    .wordmark { font-family:'Anton',sans-serif; font-size:${isStory ? 48 : 42}px; letter-spacing:8px;
      color:#fff; text-shadow:0 4px 20px rgba(0,0,0,.8); }
    .logo { height:${isStory ? 92 : 76}px; max-width:56%; object-fit:contain;
      filter:drop-shadow(0 1px 2px rgba(255,255,255,.3)) drop-shadow(0 4px 16px rgba(0,0,0,.7)); }
    /* Badge editorial metálico/naranja */
    .badge { position:absolute; top:${wmTop}px; right:${padX}px; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff;
      font-weight:800; font-size:18px; padding:10px 22px; border-radius:100px; text-transform:uppercase;
      letter-spacing:3px; box-shadow:0 10px 25px rgba(232,93,27,.45); border:1px solid rgba(255,255,255,.25); z-index:4; }
    .coupon { display:inline-flex; align-items:center; gap:14px; margin-top:24px; padding:14px 24px;
      background:rgba(255,255,255,.96); border-radius:14px; box-shadow:0 12px 35px rgba(0,0,0,.5); border:1px solid rgba(0,0,0,.08); }
    .cpn-lbl { font-size:${isStory ? 22 : 19}px; font-weight:800; letter-spacing:3px; color:#6b6b70;
      text-transform:uppercase; padding-right:14px; border-right:2px dashed #c9c9cf; }
    .cpn-code { font-family:'Anton',sans-serif; font-size:${isStory ? 48 : 42}px; letter-spacing:2px; color:#141416; }
    .foot { position:absolute; left:${padX}px; right:${padX}px; ${footPos}; text-align:${L.a}; z-index:4; }
    .headline { display:inline-block; font-family:'Anton',sans-serif; font-size:${isStory ? 80 : 66}px; line-height:.96;
      letter-spacing:.5px; text-transform:uppercase; color:#fff; max-width:94%; text-shadow:0 6px 30px rgba(0,0,0,.7); }
    /* Cápsula de precio Glassmorphic editorial Apple/SaaS */
    .pblock { display:inline-block; text-align:left; background:rgba(18,18,22,.65); backdrop-filter:blur(24px);
      -webkit-backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,.14); border-radius:28px; padding:28px 36px; box-shadow:0 24px 60px rgba(0,0,0,.55); }
    .pheader { display:flex; align-items:center; gap:16px; margin-bottom:12px; }
    .lbl { font-size:19px; font-weight:800; letter-spacing:4px; color:#FF8B4D; text-transform:uppercase; margin-bottom:4px; }
    .antes { font-family:'Anton',sans-serif; font-size:${isStory ? 46 : 40}px; color:rgba(255,255,255,.65); text-decoration:line-through; text-decoration-thickness:3px; line-height:1; }
    .off { background:linear-gradient(135deg, ${accent} 0%, #b83804 100%); color:#fff; font-weight:800; font-size:22px; padding:6px 16px; border-radius:100px; letter-spacing:1px; box-shadow:0 4px 15px rgba(232,93,27,.4); }
    .now { font-family:'Anton',sans-serif; font-size:${isStory ? 108 : 96}px; color:#fff; line-height:.88; letter-spacing:-1px; text-shadow:0 4px 20px rgba(0,0,0,.5); }
    .transfer { font-size:22px; font-weight:600; letter-spacing:1px; color:rgba(255,255,255,.92); margin-top:16px; max-width:540px; display:flex; align-items:center; gap:8px; }
    .lightning { color:#FF8B4D; font-size:26px; }
    .interaction { position:absolute; left:50%; bottom:${(isStory ? 360 : 140) + 30}px; transform:translateX(-50%);
      background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.5); backdrop-filter:blur(8px);
      padding:16px 32px; border-radius:100px; font-size:26px; font-weight:700; color:#fff; white-space:nowrap; box-shadow:0 12px 30px rgba(0,0,0,.4); z-index:4; }
    .domain { position:absolute; left:0; right:0; bottom:${domainBottom}px; display:flex; align-items:center;
      justify-content:center; gap:12px; z-index:4; }
    .tick { width:13px; height:13px; background:${accent}; border-radius:3px; box-shadow:0 0 12px ${accent}; }
    .site { font-size:${isStory ? 24 : 22}px; font-weight:700; letter-spacing:3px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
    <div class="canvas">
      ${hasCover ? (bgImageUrl ? `<div class="glow"></div><img class="bg" src="${esc(bgImageUrl)}" alt=""/><div class="hero"><img src="${esc(bgImageUrl)}" alt=""/></div><div class="scrim"></div>` : `<img class="bg" src="${esc(productImageUrl)}" alt=""/>${heroPhotoHtml({ bgImageUrl: null, productImageUrl, box: { top: heroTop, bottom: heroBottom, left: padX, right: padX }, shadow: 'rgba(0,0,0,.6)', darkBg: true }).html}`) : ''}
      ${showBrand ? `<div class="wm">${brandMark}</div>` : ''}
      ${badgeHtml}
      ${interactionHtml}
      <div class="foot">${content}</div>
      <div class="domain"><span class="tick"></span><span class="site">${esc(site)}</span></div>
    </div>
  </body></html>`;
}

/** MINIMAL: estudio editorial claro con marca arquitectónica de agua, producto flotando en pedestal de luz y titular oscuro. */
function buildMinimalHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const { hasPromo, off, now } = priceParts(opts.price, opts.promoPrice);
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 330 : 220, bottom: g.isStory ? 610 : 410, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.26)',
  });
  const price = opts.price ? `
    <div style="display:flex; align-items:baseline; gap:18px; margin-top:22px; background:rgba(255,255,255,.8); padding:18px 28px; border-radius:24px; border:1px solid rgba(0,0,0,.06); box-shadow:0 15px 35px rgba(0,0,0,.06); display:inline-flex;">
      ${hasPromo ? `<span style="font-family:'Anton',sans-serif; font-size:40px; color:${hero.fullBleed ? 'rgba(255,255,255,.7)' : '#8b8b90'}; text-decoration:line-through;">$${formatPrice(opts.price)}</span>
        <span style="background:${accent}; color:#fff; font-weight:800; font-size:20px; padding:6px 14px; border-radius:100px;">-${off}% OFF</span>` : ''}
      <span style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 84 : 72}px; color:${hero.fullBleed ? '#fff' : '#111113'}; letter-spacing:-1px;">$${formatPrice(now)}</span>
    </div>` : '';

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:${hero.fullBleed ? '#fff' : '#111113'}; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f2f2f6 55%, #e2e2e8 100%);">
      <!-- Watermark arquitectónico de fondo -->
      ${!hero.fullBleed ? `<div style="position:absolute; top:36%; left:-10%; width:120%; text-align:center; font-family:'Anton',sans-serif; font-size:${g.isStory ? 260 : 210}px; color:rgba(0,0,0,.032); letter-spacing:22px; transform:rotate(-12deg); pointer-events:none; z-index:0;">BLACKS</div>` : ''}
      <!-- Volumetric top light -->
      ${!hero.fullBleed ? `<div style="position:absolute; top:280px; left:50%; transform:translateX(-50%); width:650px; height:650px; background:radial-gradient(circle, rgba(232,93,27,.11) 0%, rgba(255,255,255,0) 65%); pointer-events:none; z-index:0;"></div>` : ''}
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: !hero.fullBleed, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      ${opts.badgeText ? badgeTag(opts.badgeText, { accent, top: g.wmTop, right: g.padX }) : ''}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 76 : 64}px; line-height:.96; text-transform:uppercase; color:${hero.fullBleed ? '#fff' : '#111113'}; max-width:94%; letter-spacing:.5px; ${hero.fullBleed ? 'text-shadow:0 4px 20px rgba(0,0,0,.7);' : 'text-shadow:0 2px 10px rgba(0,0,0,.04);'}">${esc(opts.overlayTitle)}</div>` : ''}
        ${price}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${domainHtml(g, { dark: !hero.fullBleed, accent })}
    </div>
  </body></html>`;
}

/** PROMO: oscura, cibernética y agresiva con cortes de luz neón/naranja y % OFF gigante en cápsula flotante. */
function buildPromoHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 350 : 230, bottom: g.isStory ? 690 : 460, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.7)',
  });
  const { hasPromo, off, now } = priceParts(opts.price, opts.promoPrice);
  const transfer = String(config.brand.transferNote || '').toUpperCase();

  const priceBlock = opts.price ? `
    ${hasPromo ? `<div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
      <span style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 52 : 46}px; color:rgba(255,255,255,.6); text-decoration:line-through;">$${formatPrice(opts.price)}</span>
      <span style="background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff; font-family:'Anton',sans-serif; font-size:${g.isStory ? 54 : 46}px; padding:6px 24px; border-radius:14px; box-shadow:0 12px 30px rgba(232,93,27,.5); border:1px solid rgba(255,255,255,.3); transform:rotate(-2deg);">-${off}% OFF</span>
    </div>` : ''}
    <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 132 : 112}px; color:#fff; line-height:.86; letter-spacing:-2px; text-shadow:0 6px 35px rgba(0,0,0,.8);">$${formatPrice(now)}</div>
    ${transfer ? `<div style="font-size:22px; font-weight:600; letter-spacing:1px; color:rgba(255,255,255,.92); margin-top:16px; max-width:560px; display:flex; align-items:center; gap:8px;"><span style="color:#FF8B4D;">⚡</span> ${esc(transfer)}</div>` : ''}`
    : (opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 88 : 74}px; line-height:.94; text-transform:uppercase; color:#fff; text-shadow:0 4px 26px rgba(0,0,0,.8);">${esc(opts.overlayTitle)}</div>` : '');

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; background:#08080a; color:#fff; overflow:hidden;">
      <!-- Destellos de luz diagonal naranja / ciber comercial -->
      <div style="position:absolute; top:-250px; right:-250px; width:750px; height:750px; background:radial-gradient(circle, rgba(232,93,27,.34) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:0;"></div>
      <div style="position:absolute; bottom:-150px; left:-150px; width:600px; height:600px; background:radial-gradient(circle, rgba(232,93,27,.18) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:0;"></div>
      <!-- Watermark agresivo OFERTA -->
      <div style="position:absolute; top:42%; left:-5%; width:110%; text-align:center; font-family:'Anton',sans-serif; font-size:${g.isStory ? 280 : 230}px; color:rgba(255,255,255,.025); letter-spacing:18px; transform:rotate(-14deg); pointer-events:none; z-index:0;">OFERTA</div>
      ${hero.html}
      ${hero.fullBleed
        ? scrimHtml({ dark: true, extra: 'radial-gradient(90% 60% at 78% 12%, rgba(232,93,27,.35) 0%, rgba(232,93,27,0) 55%)' })
        : `<div style="position:absolute; inset:0; z-index:1; background:
        radial-gradient(90% 60% at 78% 18%, rgba(232,93,27,.35) 0%, rgba(232,93,27,0) 60%),
        radial-gradient(120% 80% at 20% 100%, rgba(232,93,27,.16) 0%, rgba(0,0,0,0) 55%); pointer-events:none;"></div>`}
      <div style="position:absolute; top:0; left:0; right:0; height:16px; background:linear-gradient(90deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 0 25px rgba(232,93,27,.6); z-index:4;"></div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      ${badgeTag(opts.badgeText || 'OFERTA', { accent, top: g.wmTop, right: g.padX })}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle && opts.price ? `<div style="font-size:${g.isStory ? 34 : 30}px; font-weight:800; letter-spacing:3px; text-transform:uppercase; color:#FF8B4D; margin-bottom:14px; text-shadow:0 2px 10px rgba(0,0,0,.6);">${esc(opts.overlayTitle)}</div>` : ''}
        ${priceBlock}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** EDUCATIVO: diseño editorial high-end de revista técnica/SaaS. Modo A (IA a sangre). Modo B (Showcase Card Apple Pedestal 3D + tap quiz indicator). */
function buildEducativoHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hasBg = Boolean(opts.bgImageUrl);
  const img = opts.bgImageUrl || opts.productImageUrl;

  if (hasBg) {
    return `${headHtml(g.w, g.h)}</head><body>
      <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden; background:#0a0a0c;">
        <img src="${esc(opts.bgImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; filter:brightness(.85);"/>
        <div style="position:absolute; inset:0; z-index:1; background:
          radial-gradient(circle at 50% 35%, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 100%),
          linear-gradient(180deg, rgba(10,10,12,.88) 0%, rgba(10,10,12,.38) 45%, rgba(10,10,12,.94) 100%);"></div>
        <div style="position:absolute; top:0; left:0; bottom:0; width:16px; background:linear-gradient(180deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 0 25px rgba(232,93,27,.6); z-index:4;"></div>
        <div style="position:absolute; top:${g.wmTop}px; left:${g.padX + 24}px; display:flex; align-items:center; gap:16px; z-index:4;">
          ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: false, heightPx: g.isStory ? 92 : 76 }) : ''}
        </div>
        <div style="position:absolute; top:${g.isStory ? 340 : 220}px; left:${g.padX + 24}px; right:${g.padX}px; z-index:3;">
          <div style="display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff; font-weight:800; font-size:${g.isStory ? 22 : 20}px; letter-spacing:3px; text-transform:uppercase; padding:10px 24px; border-radius:100px; box-shadow:0 8px 24px rgba(232,93,27,.45); margin-bottom:26px;"><span style="width:8px;height:8px;border-radius:50%;background:#fff;"></span> ${esc(opts.kicker || 'PARA SABER')}</div>
          <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 88 : 72}px; line-height:.96; letter-spacing:.5px; text-transform:uppercase; color:#fff; text-shadow:0 6px 30px rgba(0,0,0,.8); max-width:96%;">${esc(opts.overlayTitle || '')}</div>
          ${opts.bodyText ? `<div style="font-size:${g.isStory ? 34 : 30}px; font-weight:500; line-height:1.4; color:rgba(255,255,255,.92); margin-top:26px; max-width:88%; text-shadow:0 2px 14px rgba(0,0,0,.7);">${esc(opts.bodyText)}</div>` : ''}
        </div>
        ${domainHtml(g, { dark: false, accent })}
      </div>
    </body></html>`;
  }

  // Modo B (Catalog Showcase Pedestal Card)
  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f0f0f4 55%, #e0e0e6 100%);">
      <!-- Faded grid watermark -->
      <div style="position:absolute; top:42%; left:-5%; width:110%; text-align:center; font-family:'Anton',sans-serif; font-size:${g.isStory ? 240 : 190}px; color:rgba(0,0,0,.03); letter-spacing:24px; transform:rotate(-12deg); pointer-events:none; z-index:0;">SAFETY</div>
      <div style="position:absolute; top:350px; left:50%; transform:translateX(-50%); width:650px; height:650px; background:radial-gradient(circle, rgba(232,93,27,.12) 0%, rgba(255,255,255,0) 65%); pointer-events:none; z-index:0;"></div>
      <div style="position:absolute; top:0; left:0; bottom:0; width:16px; background:linear-gradient(180deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 0 25px rgba(232,93,27,.4); z-index:4;"></div>
      <div style="position:absolute; top:${g.wmTop}px; left:${g.padX + 24}px; display:flex; align-items:center; gap:16px; z-index:4;">
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: true, heightPx: g.isStory ? 92 : 76 }) : ''}
      </div>
      <div style="position:absolute; top:${g.isStory ? 280 : 180}px; left:${g.padX + 24}px; right:${g.padX}px; z-index:3;">
        <div style="display:inline-flex; align-items:center; gap:10px; background:#111113; color:#fff; font-weight:800; font-size:${g.isStory ? 22 : 20}px; letter-spacing:3px; text-transform:uppercase; padding:10px 24px; border-radius:100px; box-shadow:0 12px 28px rgba(0,0,0,.15); margin-bottom:24px;"><span style="width:8px;height:8px;border-radius:50%;background:${accent}; box-shadow:0 0 10px ${accent};"></span> ${esc(opts.kicker || 'PARA SABER')}</div>
        <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 82 : 68}px; line-height:1.02; letter-spacing:.5px; text-transform:uppercase; color:#111113; max-width:96%;">${esc(opts.overlayTitle || '')}</div>
        ${opts.bodyText ? `<div style="font-size:${g.isStory ? 32 : 28}px; font-weight:500; line-height:1.4; color:#3c3c42; margin-top:20px; max-width:88%;">${esc(opts.bodyText)}</div>` : ''}
      </div>
      ${img ? `<div style="position:absolute; top:${g.isStory ? 730 : 500}px; bottom:${g.footBottom + 35}px; left:${g.padX + 24}px; right:${g.padX + 24}px; background:linear-gradient(180deg, #ffffff 0%, #f7f7fc 100%); border-radius:36px; border:1px solid rgba(0,0,0,.07); box-shadow:0 40px 80px -15px rgba(0,0,0,.16), 0 12px 25px -5px rgba(0,0,0,.05); display:flex; align-items:center; justify-content:center; padding:44px; z-index:2;">
        <img src="${esc(img)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 25px 45px rgba(0,0,0,.22)); mix-blend-mode:multiply; -webkit-mask-image:radial-gradient(circle at center, black 65%, transparent 98%); mask-image:radial-gradient(circle at center, black 65%, transparent 98%);"/>
      </div>` : ''}
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** MAYORISTA: corporativa oscura con detalles dorados/naranjas, cápsulas de prestigio y CTA de presupuesto. */
function buildMayoristaHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 350 : 230, bottom: g.isStory ? 660 : 440, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.65)',
    darkBg: true,
  });

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden;
      background:linear-gradient(165deg, #0a0b0e 0%, #13161c 55%, #1c2029 100%);">
      <div style="position:absolute; top:38%; left:-5%; width:110%; text-align:center; font-family:'Anton',sans-serif; font-size:${g.isStory ? 240 : 190}px; color:rgba(255,255,255,.025); letter-spacing:22px; transform:rotate(-12deg); pointer-events:none; z-index:0;">MAYORISTA</div>
      <div style="position:absolute; top:350px; left:50%; transform:translateX(-50%); width:650px; height:650px; background:radial-gradient(circle, rgba(232,93,27,.18) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:0;"></div>
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}
      <div style="position:absolute; top:0; left:0; right:0; height:16px; background:linear-gradient(90deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 0 25px rgba(232,93,27,.6); z-index:4;"></div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; background:rgba(232,93,27,.15); border:1.5px solid ${accent}; color:${accent}; font-weight:800; font-size:18px; padding:10px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:3px; box-shadow:0 8px 24px rgba(232,93,27,.3); z-index:4;">MAYORISTA</div>
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 78 : 64}px; line-height:.96; text-transform:uppercase; color:#fff; max-width:94%; text-shadow:0 4px 25px rgba(0,0,0,.8); letter-spacing:.5px;">${esc(opts.overlayTitle)}</div>` : ''}
        <div style="display:inline-flex; align-items:center; gap:14px; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff; font-weight:800; font-size:${g.isStory ? 32 : 28}px; letter-spacing:2px; padding:18px 38px; border-radius:100px; margin-top:30px; text-transform:uppercase; box-shadow:0 15px 35px rgba(232,93,27,.5); border:1px solid rgba(255,255,255,.28);">PEDÍ TU PRESUPUESTO <span style="font-size:26px;">→</span></div>
      </div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** Despachador: elige el builder según opts.template (default: fullbleed, la clásica). */
function buildHtml(opts) {
  switch (opts.template) {
    case 'minimal': return buildMinimalHtml(opts);
    case 'promo': return buildPromoHtml(opts);
    case 'educativo': return buildEducativoHtml(opts);
    case 'mayorista': return buildMayoristaHtml(opts);
    default: return buildFullbleedHtml(opts);
  }
}

/**
 * Renderiza una pieza y la sube a Supabase. Devuelve { url, buffer }.
 * Si config.ai.useAiImages y hay Gemini, intenta generar un fondo con IA (best-effort).
 */
async function renderPostBuffer(options) {
  const format = options.format === 'story' ? 'story' : 'feed';
  const { w, h } = DIMS[format];
  const outFile = options.filename || `${format}-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

  // Imagen con IA opcional (no rompe si falla). costUsd acumula lo gastado en esta pieza.
  let bgImageUrl = options.bgImageUrl || null;
  let productImageUrl = options.productImageUrl || null;
  let costUsd = 0;

  // 1) Si hay producto, intentamos meterlo en una escena profesional generada con IA.
  if (!bgImageUrl && options.useAiProductScene && productImageUrl) {
    const scene = await generateProductScene({
      productImageUrl, productName: options.overlayTitle, theme: options.bgTheme,
      brief: options.bgBrief, occasion: options.bgOccasion, format,
    });
    if (scene) {
      bgImageUrl = `data:${scene.mimeType};base64,${scene.buffer.toString('base64')}`;
      productImageUrl = null;
      costUsd += scene.costUsd || 0;
    }
  }
  // 1.5) Piezas educativas: ilustración didáctica (dibujo que ENSEÑA el tema,
  // ej. dónde medirse la prenda) en vez de una foto decorativa. Va contenida en
  // la caja de la plantilla (no full-bleed). Si falla, queda la foto/plantilla.
  if (!bgImageUrl && options.useAiDiagram) {
    const diagram = await generateDiagram({ topic: options.diagramTopic || options.bgTheme || options.overlayTitle, format });
    if (diagram) {
      productImageUrl = `data:${diagram.mimeType};base64,${diagram.buffer.toString('base64')}`;
      costUsd += diagram.costUsd || 0;
    }
  }
  // 2) Si no hay producto (marca/lifestyle), generamos un fondo temático.
  if (!bgImageUrl && options.useAiBackground) {
    const bg = await generateBackground({
      theme: options.bgTheme || options.overlayTitle,
      brief: options.bgBrief, occasion: options.bgOccasion, format,
    });
    if (bg) {
      bgImageUrl = `data:${bg.mimeType};base64,${bg.buffer.toString('base64')}`;
      costUsd += bg.costUsd || 0;
    }
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
  return { url, buffer, costUsd };
}

async function renderPostImage(options) {
  const { url } = await renderPostBuffer(options);
  return url;
}

module.exports = { renderPostImage, renderPostBuffer, buildHtml, DIMS, TEMPLATES };
