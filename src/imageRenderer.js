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
    return `<img class="logo" style="height:${heightPx}px; max-width:52%; object-fit:contain;
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
function heroPhotoHtml({ bgImageUrl, productImageUrl, box, shadow = 'rgba(0,0,0,.5)' }) {
  if (bgImageUrl) {
    return {
      fullBleed: true,
      html: `<img src="${esc(bgImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/>`,
    };
  }
  if (productImageUrl) {
    return {
      fullBleed: false,
      html: `<div style="position:absolute; top:${box.top}px; bottom:${box.bottom}px; left:${box.left}px; right:${box.right}px;
        display:flex; align-items:center; justify-content:center; z-index:1;">
        <img src="${esc(productImageUrl)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 30px 50px ${shadow});"/>
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
  // El wordmark siempre queda sobre un scrim oscuro (arriba de la pieza) -> logo de tinta clara.
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

/** MINIMAL: estudio claro, producto flotando grande, titular oscuro. Evergreen. */
function buildMinimalHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const { hasPromo, off, now } = priceParts(opts.price, opts.promoPrice);
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 300 : 190, bottom: g.isStory ? 620 : 420, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.22)',
  });
  const price = opts.price ? `
    <div style="display:flex; align-items:baseline; gap:18px; margin-top:18px;">
      ${hasPromo ? `<span style="font-family:'Anton',sans-serif; font-size:40px; color:${hero.fullBleed ? 'rgba(255,255,255,.7)' : '#8b8b90'}; text-decoration:line-through;">$${formatPrice(opts.price)}</span>
        <span style="background:${accent}; color:#fff; font-weight:800; font-size:22px; padding:4px 12px; border-radius:6px;">-${off}%</span>` : ''}
      <span style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 84 : 72}px; color:${hero.fullBleed ? '#fff' : '#111'};">$${formatPrice(now)}</span>
    </div>` : '';

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:${hero.fullBleed ? '#fff' : '#111'}; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f0f0f2 55%, #e0e0e4 100%);">
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}
      <div style="position:absolute; top:${g.wmTop}px; left:0; right:0; display:flex; justify-content:center; z-index:4;">
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: !hero.fullBleed, heightPx: g.isStory ? 74 : 60 }) : ''}
      </div>
      ${opts.badgeText ? `<div style="position:absolute; top:${g.wmTop - 6}px; right:${g.padX}px; background:${accent}; color:#fff; font-weight:800; font-size:22px; padding:11px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:2px; z-index:4;">${esc(opts.badgeText)}</div>` : ''}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 72 : 60}px; line-height:.98; text-transform:uppercase; color:${hero.fullBleed ? '#fff' : '#111'}; max-width:94%; ${hero.fullBleed ? 'text-shadow:0 2px 16px rgba(0,0,0,.6);' : ''}">${esc(opts.overlayTitle)}</div>` : ''}
        ${price}
      </div>
      ${domainHtml(g, { dark: !hero.fullBleed, accent })}
    </div>
  </body></html>`;
}

/** PROMO: oscura y agresiva, % OFF y precio gigantes. Ofertas / fechas comerciales. */
function buildPromoHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 320 : 200, bottom: g.isStory ? 700 : 470, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.65)',
  });
  const { hasPromo, off, now } = priceParts(opts.price, opts.promoPrice);
  const transfer = String(config.brand.transferNote || '').toUpperCase();

  const priceBlock = opts.price ? `
    ${hasPromo ? `<div style="display:flex; align-items:center; gap:16px; margin-bottom:10px;">
      <span style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 52 : 46}px; color:rgba(255,255,255,.75); text-decoration:line-through;">$${formatPrice(opts.price)}</span>
      <span style="background:${accent}; color:#fff; font-family:'Anton',sans-serif; font-size:${g.isStory ? 52 : 44}px; padding:6px 20px; border-radius:10px; transform:rotate(-2deg);">-${off}% OFF</span>
    </div>` : ''}
    <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 128 : 108}px; color:#fff; line-height:.9; text-shadow:0 4px 26px rgba(0,0,0,.6);">$${formatPrice(now)}</div>
    ${transfer ? `<div style="font-size:22px; font-weight:600; letter-spacing:1px; color:rgba(255,255,255,.92); margin-top:14px; max-width:560px;">${esc(transfer)}</div>` : ''}`
    : (opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 84 : 70}px; line-height:.96; text-transform:uppercase; color:#fff; text-shadow:0 3px 20px rgba(0,0,0,.7);">${esc(opts.overlayTitle)}</div>` : '');

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; background:#0b0b0d; color:#fff; overflow:hidden;">
      ${hero.html}
      ${hero.fullBleed
        ? scrimHtml({ dark: true, extra: 'radial-gradient(90% 60% at 78% 12%, rgba(232,93,27,.28) 0%, rgba(232,93,27,0) 55%)' })
        : `<div style="position:absolute; inset:0; background:
        radial-gradient(90% 60% at 78% 18%, rgba(232,93,27,.32) 0%, rgba(232,93,27,0) 60%),
        radial-gradient(120% 80% at 20% 100%, rgba(232,93,27,.14) 0%, rgba(0,0,0,0) 55%);"></div>`}
      <div style="position:absolute; top:0; left:0; right:0; height:14px; background:${accent}; z-index:4;"></div>
      <div style="position:absolute; top:${g.wmTop}px; left:0; right:0; display:flex; justify-content:center; z-index:4;">
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: false, heightPx: g.isStory ? 74 : 60 }) : ''}
      </div>
      <div style="position:absolute; top:${g.wmTop - 6}px; right:${g.padX}px; background:#fff; color:#111; font-weight:800; font-size:22px; padding:11px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:2px; z-index:4;">${esc(opts.badgeText || 'OFERTA')}</div>
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle && opts.price ? `<div style="font-size:${g.isStory ? 34 : 30}px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:rgba(255,255,255,.9); margin-bottom:14px;">${esc(opts.overlayTitle)}</div>` : ''}
        ${priceBlock}
      </div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** EDUCATIVO: tipográfica clara, titular primero, foto de apoyo abajo. Tips/carruseles. */
function buildEducativoHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const img = opts.bgImageUrl || opts.productImageUrl;

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#141416;
      background:linear-gradient(170deg, #fafafa 0%, #ededf0 70%, #e3e3e7 100%);">
      <div style="position:absolute; top:0; left:0; bottom:0; width:14px; background:${accent};"></div>
      <div style="position:absolute; top:${g.wmTop}px; left:${g.padX + 20}px; display:flex; align-items:center; gap:16px; z-index:4;">
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: true, heightPx: g.isStory ? 60 : 52 }) : ''}
      </div>
      ${opts.slideChip ? `<div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; background:#141416; color:#fff; font-weight:800; font-size:24px; padding:9px 18px; border-radius:100px; z-index:4;">${esc(opts.slideChip)}</div>` : ''}
      <div style="position:absolute; top:${g.isStory ? 340 : 220}px; left:${g.padX + 20}px; right:${g.padX}px; z-index:3;">
        <div style="display:inline-block; background:${accent}; color:#fff; font-weight:800; font-size:${g.isStory ? 26 : 24}px; letter-spacing:3px; text-transform:uppercase; padding:8px 18px; border-radius:6px; margin-bottom:26px;">${esc(opts.kicker || 'PARA SABER')}</div>
        <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 88 : 72}px; line-height:1; text-transform:uppercase; color:#141416; max-width:96%;">${esc(opts.overlayTitle || '')}</div>
        ${opts.bodyText ? `<div style="font-size:${g.isStory ? 34 : 30}px; font-weight:500; line-height:1.4; color:#3c3c42; margin-top:26px; max-width:88%;">${esc(opts.bodyText)}</div>` : ''}
      </div>
      ${img ? `<div style="position:absolute; bottom:${g.footBottom - 30}px; right:${g.padX}px; width:${Math.round(g.w * 0.42)}px; height:${Math.round(g.h * (g.isStory ? 0.26 : 0.3))}px; display:flex; align-items:flex-end; justify-content:flex-end; z-index:2;">
        <img src="${esc(img)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 24px 40px rgba(0,0,0,.25));"/>
      </div>` : ''}
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** MAYORISTA: corporativa oscura, badge + CTA de presupuesto, sin precio unitario. */
function buildMayoristaHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 320 : 200, bottom: g.isStory ? 660 : 440, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.6)',
  });

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden;
      background:linear-gradient(165deg, #101216 0%, #171a20 55%, #1d212a 100%);">
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}
      <div style="position:absolute; top:0; left:0; right:0; height:12px; background:${accent}; z-index:4;"></div>
      <div style="position:absolute; top:${g.wmTop}px; left:${g.padX}px; z-index:4;">
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: false, heightPx: g.isStory ? 68 : 56 }) : ''}
      </div>
      <div style="position:absolute; top:${g.wmTop - 4}px; right:${g.padX}px; border:2px solid ${accent}; color:${accent}; font-weight:800; font-size:24px; padding:10px 22px; border-radius:8px; text-transform:uppercase; letter-spacing:3px; z-index:4;">MAYORISTA</div>
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 74 : 62}px; line-height:.98; text-transform:uppercase; color:#fff; max-width:94%;">${esc(opts.overlayTitle)}</div>` : ''}
        <div style="display:inline-flex; align-items:center; gap:12px; background:${accent}; color:#fff; font-weight:800; font-size:${g.isStory ? 32 : 28}px; letter-spacing:1px; padding:16px 34px; border-radius:100px; margin-top:28px; text-transform:uppercase;">Pedí tu presupuesto</div>
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
      productImageUrl, productName: options.overlayTitle, theme: options.bgTheme, format,
    });
    if (scene) {
      bgImageUrl = `data:${scene.mimeType};base64,${scene.buffer.toString('base64')}`;
      productImageUrl = null;
      costUsd += scene.costUsd || 0;
    }
  }
  // 2) Si no hay producto (marca/lifestyle), generamos un fondo temático.
  if (!bgImageUrl && options.useAiBackground) {
    const bg = await generateBackground({ theme: options.bgTheme || options.overlayTitle, format });
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
