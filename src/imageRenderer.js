const puppeteer = require('puppeteer');
const config = require('./config');
const { uploadAsset } = require('./storage');
const { generateBackground, generateProductScene, generateDiagram } = require('./ai');

const DIMS = {
  feed: { w: 1080, h: 1350 },   // 4:5
  story: { w: 1080, h: 1920 },  // 9:16
};

/* =========================================================================
 * NAVEGADOR COMPARTIDO + LÍMITE DE CONCURRENCIA (memoria)
 * Antes cada render lanzaba su propio Chromium. Con los slides del carrusel en
 * paralelo eran 4-5 navegadores a la vez (~1GB) y Render (512MB) crasheaba
 * ("Ran out of memory"). Ahora: UN navegador reutilizado + como mucho 2 páginas
 * renderizando al mismo tiempo (las demás esperan en cola). Baja el pico de RAM
 * de ~1GB a ~300MB sin perder el paralelismo de la generación IA (que es red).
 * ========================================================================= */
const LAUNCH_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--single-process', '--no-zygote', '--disable-extensions', '--disable-background-networking',
  '--disable-default-apps', '--disable-sync', '--disable-translate', '--mute-audio',
  '--no-first-run', '--metrics-recording-only', '--js-flags=--max-old-space-size=128',
];

let sharedBrowser = null;
let browserLaunching = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;
  if (browserLaunching) return browserLaunching;
  browserLaunching = (async () => {
    const launchOptions = { headless: 'new', args: LAUNCH_ARGS };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const b = await puppeteer.launch(launchOptions);
    b.on('disconnected', () => { if (sharedBrowser === b) sharedBrowser = null; });
    sharedBrowser = b;
    browserLaunching = null;
    return b;
  })();
  return browserLaunching;
}

// Semáforo: máximo N capturas de Puppeteer en simultáneo (la generación IA previa
// sí corre en paralelo; sólo el renderizado, que abre páginas, se limita).
let activeRenders = 0;
const renderWaiters = [];
const MAX_CONCURRENT_RENDERS = Number(process.env.RENDER_CONCURRENCY) || 2;

async function acquireRenderSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) { activeRenders += 1; return; }
  await new Promise((resolve) => renderWaiters.push(resolve));
  activeRenders += 1;
}
function releaseRenderSlot() {
  activeRenders -= 1;
  const next = renderWaiters.shift();
  if (next) next();
}

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

const TEMPLATES = ['fullbleed', 'minimal', 'promo', 'educativo', 'mayorista',
  'grid', 'overlap', 'specsheet', 'splitscreen', 'blueprint', 'magazine', 'stackedcards', 'polaroidstrip'];

// Descripción CORTA de cada plantilla, para que el cerebro (IA de copy) elija la que
// mejor le queda a la pieza según su mensaje/objetivo. Sólo texto informativo — la
// disponibilidad real la filtra generate-daily (fotos/descripción que hay).
const TEMPLATE_INFO = {
  fullbleed: 'Foto del producto a pantalla completa con el texto encima. Impactante, la foto es la protagonista.',
  minimal: 'Mucho aire, producto flotando sobre fondo claro, titular sobrio. Elegante y prolijo; bueno para marca/producto premium.',
  promo: 'Oscura y vendedora, con % OFF / precio gigante. Para ofertas y promos con descuento real.',
  educativo: 'Tarjeta tipográfica: kicker + titular + texto explicativo y foto chica de apoyo. Para enseñar/dar un consejo.',
  mayorista: 'Corporativa oscura con CTA "Pedí tu presupuesto". Para empresas / venta mayorista.',
  grid: 'Collage bento de 3-4 fotos reales (ángulos o variantes de color). Necesita varias fotos.',
  overlap: 'Dos fotos superpuestas con profundidad, editorial y moderno. Necesita 2+ fotos.',
  specsheet: 'Ficha técnica: specs reales pinneados sobre la foto. Para destacar características/materiales concretos.',
  splitscreen: 'Pantalla dividida (foto + bloque de color con titular). Dinámico; bueno para promo/engagement.',
  blueprint: 'Estilo plano técnico/infográfico (líneas, medidas). Para educativo técnico (cómo elegir, guía de talles).',
  magazine: 'Portada editorial: eyebrow + titular gigante + foto chica. Aspiracional; para marca / historias de clientes (ugc).',
  stackedcards: 'Bento de tarjetas (foto + highlight + dato de marca). Moderno; bueno para mayorista/marca.',
  polaroidstrip: 'Tira de polaroids, cercano y genuino. Sólo historias. Para contenido tipo cliente real (ugc).',
};

// Requisitos mínimos de cada plantilla (cuántas fotos reales del producto necesita,
// si necesita descripción real de Tiendanube para specs, si es sólo para historias).
// ÚNICA fuente de verdad: la usan generate-daily (filtrado de candidatas) y el
// director creativo (validación dura de su elección) — antes vivía duplicada en
// generate-daily y el director podía elegir una plantilla que el producto no
// sostenía. Los clásicos sin zona de foto obligatoria no figuran: siempre valen.
const TEMPLATE_REQUIREMENTS = {
  grid: { minImages: 3 },
  overlap: { minImages: 2 },
  specsheet: { minImages: 1, needsDescription: true },
  polaroidstrip: { minImages: 2, storyOnly: true },
  // Plantillas con zona de foto que NO saben quedar vacías: sin foto real quedan con
  // un hueco/watermark muerto (bug real: pieza de marca 'minimal' sin foto = tarjeta
  // vacía). Sin foto, el pool cae a las que sí se adaptan (fullbleed/mayorista/
  // magazine/educativo/stackedcards/blueprint re-arman su layout).
  minimal: { minImages: 1 },
  promo: { minImages: 1 },
  splitscreen: { minImages: 1 },
};

/**
 * Extrae 2-3 frases técnicas CORTAS de la descripción real de Tiendanube (nunca
 * inventa nada) para pinearlas como specs en la plantilla 'specsheet'. Prioriza
 * frases con palabras de material/feature/certificación; si no encuentra, usa
 * las primeras frases cortas del texto.
 */
function extractSpecTags(description, max = 3) {
  if (!description) return [];
  const plain = String(description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = plain.split(/[.;•\n]+/).map((s) => s.trim()).filter((s) => s.length >= 6 && s.length <= 70);
  const featureWords = /(cuero|acero|algod[oó]n|poli[eé]ster|impermeable|transpirable|reforzad|resistente|antideslizante|certificad|t[eé]rmic|softshell|grafa|ripstop|cordura|costura|puntera|antiest[aá]tic|diel[eé]ctric)/i;
  const featured = parts.filter((p) => featureWords.test(p));
  const rest = parts.filter((p) => !featureWords.test(p));
  return [...featured, ...rest].slice(0, max);
}

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

/** Cápsula de precio compacta reutilizada por las plantillas nuevas (grid/overlap/specsheet/etc.). */
function compactPriceHtml(g, accent, price, promoPrice, { dark = false } = {}) {
  if (!price) return '';
  const { hasPromo, off, now } = priceParts(price, promoPrice);
  const fg = dark ? '#fff' : '#111113';
  const bg = dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.85)';
  return `<div style="display:inline-flex; align-items:baseline; gap:16px; margin-top:18px; background:${bg}; padding:14px 24px; border-radius:20px; box-shadow:0 12px 30px rgba(0,0,0,.14); ${dark ? 'backdrop-filter:blur(16px);' : ''}">
    ${hasPromo ? `<span style="font-family:'Anton',sans-serif; font-size:30px; color:${dark ? 'rgba(255,255,255,.55)' : '#9a9aa0'}; text-decoration:line-through;">$${formatPrice(price)}</span><span style="background:${accent}; color:#fff; font-weight:800; font-size:17px; padding:5px 12px; border-radius:100px;">-${off}%</span>` : ''}
    <span style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 60 : 50}px; color:${fg};">$${formatPrice(now)}</span>
  </div>`;
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

  // Slide de cierre (CTA): llamado a la acción + beneficios, SIN precio (feed evergreen).
  const ctaBenefits = Array.isArray(opts.ctaBenefits) ? opts.ctaBenefits.filter(Boolean) : [];
  const ctaHtml = opts.ctaHeadline
    ? `<div class="pblock">
        <div class="cta-head">${esc(opts.ctaHeadline)}</div>
        ${ctaBenefits.map((b) => `<div class="cta-benefit"><span class="cta-check">✓</span> ${esc(b)}</div>`).join('')}
      </div>`
    : '';

  // Puntos con datos reales (storyPoints): en piezas SIN foto llenan el centro como
  // checklist; con foto van como línea compacta arriba del titular (sin saturar).
  const points = Array.isArray(opts.storyPoints) ? opts.storyPoints.filter(Boolean).slice(0, 3) : [];
  const g = sharedGeometry(format);
  const pointsBlock = points.length && !hasCover ? pointsChecklistHtml(points, g, accent) : '';
  const pointsLine = points.length && hasCover
    ? `<div style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:10px 18px; margin-bottom:22px; background:rgba(10,11,14,.55); border:1px solid rgba(255,255,255,.14); border-radius:100px; padding:12px 26px; font-size:${isStory ? 26 : 22}px; font-weight:700; color:rgba(255,255,255,.92);">
        ${points.map((p) => `<span style="display:inline-flex; align-items:center; gap:8px;"><span style="color:#FF6B1A; font-weight:800;">✓</span>${esc(p)}</span>`).join('')}
      </div>`
    : '';

  let content = '';
  if (opts.ctaHeadline) {
    content = ctaHtml;
  } else if (price) {
    // Los puntos con datos reales (story_points) también van cuando hay precio — antes
    // se perdían en las historias de producto/promo (bug real: la info clave que el
    // caption no muestra desaparecía justo en las piezas de venta). Y sin foto de
    // fondo, el titular y el checklist llenan la pieza en vez de dejar un hueco.
    content = `${pointsLine}${!hasCover && overlayTitle ? `<div class="headline" style="font-size:${isStory ? 62 : 52}px;">${esc(overlayTitle)}</div>` : ''}<div class="pblock">
      ${hasPromo ? `<div class="pheader"><span class="antes">$${formatPrice(price)}</span><span class="off">-${off}% OFF</span></div>` : ''}
      <div class="lbl">${hasPromo ? 'AHORA' : 'PRECIO'}</div>
      <div class="now">$${formatPrice(now)}</div>
      ${transfer ? `<div class="transfer"><span class="lightning">⚡</span> ${esc(transfer)}</div>` : ''}
    </div>${!hasCover ? pointsBlock : ''}${couponHtml}`;
  } else if (overlayTitle) {
    content = `${pointsLine}<div class="headline">${esc(overlayTitle)}</div>${pointsBlock}${couponHtml}`;
  }

  const fullbleedLogoUrl = (logos && typeof logos === 'object') ? (logos.onDark || logos.fallback) : logos;
  const brandMark = fullbleedLogoUrl
    ? `<img class="logo" src="${esc(fullbleedLogoUrl)}" alt="BLACKS"/>`
    : `<div class="wordmark">BLACKS</div>`;
  const badgeHtml = badgeText ? `<div class="badge">${esc(badgeText)}</div>` : '';
  const interactionHtml = interactionLabel ? `<div class="interaction">${esc(interactionLabel)}</div>` : '';
  // CTA impreso (historias): el caption de una historia casi nadie lo ve, así que el
  // llamado a la acción va como botón SOBRE la pieza, en el hueco entre el bloque de
  // contenido y el dominio. Si hay chip de interacción (pieza semi), ese lugar es suyo.
  const ctaPillHtml = !interactionLabel && opts.ctaLabel
    ? `<div class="ctapill">${esc(opts.ctaLabel)}</div>` : '';

  // Sin foto: fondo OSCURO de marca (el texto de esta plantilla es blanco — el viejo
  // fondo claro dejaba la pieza ilegible cuando no había cover) y contenido CENTRADO
  // verticalmente para que no quede un hueco muerto en el medio.
  const bgFallback = 'linear-gradient(165deg, #0a0b0e 0%, #13161c 55%, #1c2029 100%)';

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
    .foot { position:absolute; left:${padX}px; right:${padX}px; ${hasCover
      ? `${footPos}; text-align:${L.a};`
      : `top:${isStory ? 420 : 230}px; bottom:${footBottom + (isStory ? 40 : 20)}px; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; gap:${isStory ? 48 : 34}px; text-align:left;`} z-index:4; }
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
    .cta-head { font-family:'Anton',sans-serif; font-size:${isStory ? 68 : 58}px; color:#fff; line-height:.95; letter-spacing:-.5px; text-shadow:0 4px 20px rgba(0,0,0,.5); margin-bottom:14px; }
    .cta-benefit { font-size:${isStory ? 26 : 23}px; font-weight:600; color:rgba(255,255,255,.95); display:flex; align-items:center; gap:10px; margin-top:8px; }
    .cta-check { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:${accent}; color:#fff; font-size:16px; font-weight:800; flex-shrink:0; }
    .interaction { position:absolute; left:50%; bottom:${(isStory ? 360 : 140) + 30}px; transform:translateX(-50%);
      background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.5); backdrop-filter:blur(8px);
      padding:16px 32px; border-radius:100px; font-size:26px; font-weight:700; color:#fff; white-space:nowrap; box-shadow:0 12px 30px rgba(0,0,0,.4); z-index:4; }
    .ctapill { position:absolute; left:50%; bottom:${isStory ? 288 : 82}px; transform:translateX(-50%);
      background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); border:1px solid rgba(255,255,255,.3);
      padding:${isStory ? '16px 34px' : '12px 26px'}; border-radius:100px; font-size:${isStory ? 26 : 21}px; font-weight:800;
      color:#fff; white-space:nowrap; box-shadow:0 12px 30px rgba(232,93,27,.45); z-index:4; }
    .domain { position:absolute; left:0; right:0; bottom:${domainBottom}px; display:flex; align-items:center;
      justify-content:center; gap:12px; z-index:4; }
    .tick { width:13px; height:13px; background:${accent}; border-radius:3px; box-shadow:0 0 12px ${accent}; }
    .site { font-size:${isStory ? 24 : 22}px; font-weight:700; letter-spacing:3px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
    <div class="canvas">
      ${hasCover ? (
        // Escena IA (bgImageUrl) → SIEMPRE full-bleed (llena el 4:5, producto grande y cerca).
        // Foto real con coverImage → también full-bleed (para tomas de detalle: se ve completa).
        // Foto real sin coverImage → tarjeta hero clásica (recorte de catálogo sobre fondo).
        bgImageUrl
          ? `<img src="${esc(bgImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/><div class="scrim"></div>`
          : (opts.coverImage
            ? `<img src="${esc(productImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/><div class="scrim"></div>`
            : `<img class="bg" src="${esc(productImageUrl)}" alt=""/>${heroPhotoHtml({ bgImageUrl: null, productImageUrl, box: { top: heroTop, bottom: heroBottom, left: padX, right: padX }, shadow: 'rgba(0,0,0,.6)', darkBg: true }).html}`)
      ) : '<div class="glow"></div>'}
      ${showBrand ? `<div class="wm">${brandMark}</div>` : ''}
      ${badgeHtml}
      ${interactionHtml}
      ${ctaPillHtml}
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
      ${opts.ctaLabel ? `<div style="position:absolute; left:50%; bottom:${g.isStory ? 288 : 82}px; transform:translateX(-50%); background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); border:1px solid rgba(255,255,255,.35); padding:${g.isStory ? '16px 34px' : '12px 26px'}; border-radius:100px; font-size:${g.isStory ? 26 : 21}px; font-weight:800; color:#fff; white-space:nowrap; box-shadow:0 12px 30px rgba(232,93,27,.4); z-index:4;">${esc(opts.ctaLabel)}</div>` : ''}
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

/**
 * Checklist de puntos con datos REALES (storyPoints del copy) para piezas sin foto:
 * tarjetas apiladas con check naranja. Llena el centro con información útil en vez
 * de dejar un hueco (feedback real, jul-2026).
 */
function pointsChecklistHtml(points, g, accent) {
  if (!points.length) return '';
  return `<div style="display:flex; flex-direction:column; gap:${g.isStory ? 22 : 16}px;">
    ${points.map((p) => `<div style="display:flex; align-items:center; gap:${g.isStory ? 24 : 18}px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.13); border-radius:${g.isStory ? 24 : 20}px; padding:${g.isStory ? '26px 34px' : '20px 26px'};">
      <span style="flex:0 0 auto; width:${g.isStory ? 52 : 42}px; height:${g.isStory ? 52 : 42}px; border-radius:50%; background:linear-gradient(135deg, #FF6B1A 0%, ${accent} 100%); display:flex; align-items:center; justify-content:center; font-size:${g.isStory ? 28 : 23}px; font-weight:800; color:#fff; box-shadow:0 8px 20px rgba(232,93,27,.4);">✓</span>
      <span style="font-size:${g.isStory ? 36 : 29}px; font-weight:700; color:rgba(255,255,255,.94); letter-spacing:.3px;">${esc(p)}</span>
    </div>`).join('')}
  </div>`;
}

/** MAYORISTA: corporativa oscura con detalles dorados/naranjas, cápsulas de prestigio y CTA de presupuesto. */
function buildMayoristaHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const hasPhoto = Boolean(opts.bgImageUrl || opts.productImageUrl);
  const points = Array.isArray(opts.storyPoints) ? opts.storyPoints.filter(Boolean).slice(0, 3) : [];

  const shellOpen = `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden;
      background:linear-gradient(165deg, #0a0b0e 0%, #13161c 55%, #1c2029 100%);">
      <div style="position:absolute; top:350px; left:50%; transform:translateX(-50%); width:650px; height:650px; background:radial-gradient(circle, rgba(232,93,27,.18) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:0;"></div>`;
  const chrome = `
      <div style="position:absolute; top:0; left:0; right:0; height:16px; background:linear-gradient(90deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 0 25px rgba(232,93,27,.6); z-index:4;"></div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; background:rgba(232,93,27,.15); border:1.5px solid ${accent}; color:${accent}; font-weight:800; font-size:18px; padding:10px 22px; border-radius:100px; text-transform:uppercase; letter-spacing:3px; box-shadow:0 8px 24px rgba(232,93,27,.3); z-index:4;">MAYORISTA</div>`;
  const ctaBtn = `<div style="display:inline-flex; align-items:center; gap:14px; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff; font-weight:800; font-size:${g.isStory ? 32 : 28}px; letter-spacing:2px; padding:18px 38px; border-radius:100px; text-transform:uppercase; box-shadow:0 15px 35px rgba(232,93,27,.5); border:1px solid rgba(255,255,255,.28);">PEDÍ TU PRESUPUESTO <span style="font-size:26px;">→</span></div>`;

  // SIN FOTO (pieza institucional): nada de hueco en el medio — el título va arriba y
  // el centro se llena con el checklist de condiciones/beneficios REALES (storyPoints).
  if (!hasPhoto) {
    return `${shellOpen}${chrome}
      <div style="position:absolute; top:${g.isStory ? 400 : 230}px; bottom:${g.footBottom + (g.isStory ? 160 : 130)}px; left:${g.padX}px; right:${g.padX}px; display:flex; flex-direction:column; justify-content:center; gap:${g.isStory ? 56 : 40}px; z-index:3;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 92 : 72}px; line-height:.98; text-transform:uppercase; color:#fff; text-shadow:0 4px 25px rgba(0,0,0,.8); letter-spacing:.5px;">${esc(opts.overlayTitle)}</div>` : ''}
        ${pointsChecklistHtml(points, g, accent)}
      </div>
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">${ctaBtn}</div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
  }

  // CON FOTO: layout clásico (hero al centro, título+CTA abajo) + línea compacta de
  // puntos reales arriba del título (sólo si hay — no satura la foto).
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 350 : 230, bottom: g.isStory ? 660 : 440, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.65)',
    darkBg: true,
  });
  const pointsLine = points.length
    ? `<div style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:10px 18px; margin-bottom:22px; background:rgba(10,11,14,.55); border:1px solid rgba(255,255,255,.14); border-radius:100px; padding:12px 26px; font-size:${g.isStory ? 26 : 22}px; font-weight:700; color:rgba(255,255,255,.92);">
        ${points.map((p) => `<span style="display:inline-flex; align-items:center; gap:8px;"><span style="color:#FF6B1A; font-weight:800;">✓</span>${esc(p)}</span>`).join('')}
      </div>`
    : '';

  return `${shellOpen}
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}${chrome}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${pointsLine}
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 78 : 64}px; line-height:.96; text-transform:uppercase; color:#fff; max-width:94%; text-shadow:0 4px 25px rgba(0,0,0,.8); letter-spacing:.5px;">${esc(opts.overlayTitle)}</div>` : ''}
        <div style="margin-top:30px;">${ctaBtn}</div>
      </div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** GRID: bento de 3-4 fotos reales del producto (ángulos/tomas distintas) en collage editorial. */
function buildGridHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const urls = (opts.productImageUrls && opts.productImageUrls.length ? opts.productImageUrls : [opts.productImageUrl]).filter(Boolean).slice(0, 4);
  // El titular va DEBAJO del logo (no a la misma altura) para que nunca se pisen.
  const headTop = g.wmTop + (g.isStory ? 120 : 95);
  const top = headTop + (g.isStory ? 220 : 170);
  const bottom = g.footBottom + (g.isStory ? 40 : 30);
  const gap = 14;
  const cell = (url, radius, shadow) => `<div style="border-radius:${radius}px; overflow:hidden; background:#f4f4f6; box-shadow:0 ${shadow}px ${shadow * 2}px rgba(0,0,0,.24);"><img src="${esc(url)}" style="width:100%; height:100%; object-fit:cover;"/></div>`;
  const cellsHtml = urls.length >= 3
    ? `<div style="position:absolute; top:${top}px; bottom:${bottom}px; left:${g.padX}px; right:${g.padX}px; display:grid; grid-template-columns: 1.4fr 1fr; grid-template-rows: 1fr 1fr; gap:${gap}px; z-index:1;">
        <div style="grid-row: 1 / 3;">${cell(urls[0], 28, 20)}</div>
        ${cell(urls[1], 22, 14)}
        ${cell(urls[3] || urls[2], 22, 14)}
      </div>`
    : heroPhotoHtml({ productImageUrl: urls[0], box: { top, bottom, left: g.padX, right: g.padX } }).html;

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f0f0f4 55%, #e2e2e8 100%);">
      ${cellsHtml}
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      ${opts.badgeText ? badgeTag(opts.badgeText, { accent, top: g.wmTop, right: g.padX }) : ''}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; top:${headTop}px; z-index:4;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 60 : 48}px; line-height:.98; text-transform:uppercase; color:#111113; max-width:90%; letter-spacing:.5px;">${esc(opts.overlayTitle)}</div>` : ''}
        ${compactPriceHtml(g, accent, opts.price, opts.promoPrice)}
      </div>
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** OVERLAP: 2-3 fotos reales superpuestas y rotadas, estilo mesa de fotógrafo/moodboard. */
function buildOverlapHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const urls = (opts.productImageUrls && opts.productImageUrls.length ? opts.productImageUrls : [opts.productImageUrl]).filter(Boolean).slice(0, 3);
  const cx = g.w / 2;
  const areaTop = g.isStory ? 420 : 300;
  const areaH = g.isStory ? 780 : 560;
  const cardW = Math.round(g.w * (g.isStory ? 0.62 : 0.56));
  const cardH = Math.round(cardW * 1.12);
  const offsets = [{ x: -0.24, y: -0.06, rot: -7 }, { x: 0.1, y: 0.08, rot: 5 }, { x: -0.05, y: -0.14, rot: -2 }];
  const cards = urls.map((u, i) => {
    const o = offsets[i % offsets.length];
    const left = Math.round(cx - cardW / 2 + o.x * g.w);
    const top = Math.round(areaTop + areaH / 2 - cardH / 2 + o.y * areaH);
    return `<div style="position:absolute; top:${top}px; left:${left}px; width:${cardW}px; height:${cardH}px; background:#fff; padding:16px 16px 46px; border-radius:8px; box-shadow:0 30px 60px rgba(0,0,0,.35); transform:rotate(${o.rot}deg); z-index:${2 + i};">
      <img src="${esc(u)}" style="width:100%; height:calc(100% - 30px); object-fit:cover; border-radius:2px;"/>
    </div>`;
  }).join('');

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #eeeef1 55%, #dfdfe6 100%);">
      <div style="position:absolute; top:38%; left:-8%; width:116%; text-align:center; font-family:'Anton',sans-serif; font-size:${g.isStory ? 200 : 160}px; color:rgba(0,0,0,.03); letter-spacing:16px; transform:rotate(-9deg); pointer-events:none; z-index:0;">BLACKS</div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      ${opts.badgeText ? badgeTag(opts.badgeText, { accent, top: g.wmTop, right: g.padX }) : ''}
      ${cards}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:5;">
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 70 : 58}px; line-height:.98; text-transform:uppercase; color:#111113; max-width:92%;">${esc(opts.overlayTitle)}</div>` : ''}
        ${compactPriceHtml(g, accent, opts.price, opts.promoPrice)}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** SPECSHEET: foto del producto con specs técnicos REALES (de la descripción de Tiendanube) pineados alrededor, estilo ficha técnica editorial. */
function buildSpecsheetHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const tags = extractSpecTags(opts.productDescription, 3);
  const headTop = g.wmTop + (g.isStory ? 120 : 95);
  const boxTop = headTop + (g.isStory ? 250 : 195);
  const boxBottom = g.footBottom + (g.isStory ? 210 : 160);
  const hero = heroPhotoHtml({ productImageUrl: opts.productImageUrl, box: { top: boxTop, bottom: boxBottom, left: g.padX + 70, right: g.padX + 70 } });

  const tagSlots = [
    { top: boxTop + 10, left: g.padX - 10 },
    { top: Math.round((boxTop + (g.h - boxBottom)) / 2), right: g.padX - 30 },
    { top: g.h - boxBottom - 40, left: g.padX + 10 },
  ];
  const pins = tags.map((t, i) => {
    const pos = tagSlots[i] || tagSlots[0];
    const side = pos.left !== undefined ? `left:${pos.left}px;` : `right:${pos.right}px;`;
    return `<div style="position:absolute; top:${pos.top}px; ${side} max-width:${g.isStory ? 300 : 250}px; z-index:4;
      background:rgba(255,255,255,.95); border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:10px 16px; box-shadow:0 14px 30px rgba(0,0,0,.16);
      font-size:${g.isStory ? 19 : 16}px; font-weight:700; color:#1c1c1e; line-height:1.25;">
      <span style="color:${accent};">●</span> ${esc(t)}
    </div>`;
  }).join('');

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f2f2f6 55%, #e5e5eb 100%);">
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: g.isStory ? 92 : 76, top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${headTop}px; left:${g.padX}px; right:${g.padX}px; z-index:3;">
        <div style="display:inline-flex; align-items:center; gap:10px; background:#111113; color:#fff; font-weight:800; font-size:${g.isStory ? 20 : 18}px; letter-spacing:3px; text-transform:uppercase; padding:9px 20px; border-radius:100px; margin-bottom:20px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${accent};"></span> FICHA TÉCNICA
        </div>
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 60 : 48}px; line-height:.98; text-transform:uppercase; color:#111113; max-width:90%;">${esc(opts.overlayTitle)}</div>` : ''}
      </div>
      ${hero.html}
      ${pins}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${compactPriceHtml(g, accent, opts.price, opts.promoPrice)}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** SPLITSCREEN: canvas partido en dos (bloque de color + foto), alto contraste para promos/comparativas. */
function buildSplitscreenHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const isVertical = !g.isStory; // feed: split izquierda/derecha; historia: split arriba/abajo
  const splitAt = isVertical ? Math.round(g.w * 0.44) : Math.round(g.h * 0.4);

  const photoAreaStyle = isVertical
    ? `position:absolute; top:0; bottom:0; right:0; width:${g.w - splitAt}px;`
    : `position:absolute; left:0; right:0; bottom:0; height:${g.h - splitAt}px;`;
  const colorAreaStyle = isVertical
    ? `position:absolute; top:0; bottom:0; left:0; width:${splitAt}px;`
    : `position:absolute; left:0; right:0; top:0; height:${splitAt}px;`;

  const { hasPromo, off, now } = priceParts(opts.price, opts.promoPrice);

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden; background:#0a0a0c;">
      <div style="${photoAreaStyle} background:#111; overflow:hidden; z-index:0;">
        ${opts.bgImageUrl ? `<img src="${esc(opts.bgImageUrl)}" style="width:100%; height:100%; object-fit:cover;"/>`
          : (opts.productImageUrl ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:radial-gradient(circle at 50% 30%, #1c1c1e 0%, #0a0a0c 100%);"><img src="${esc(opts.productImageUrl)}" style="max-width:82%; max-height:82%; object-fit:contain; filter:drop-shadow(0 30px 50px rgba(0,0,0,.6));"/></div>` : '')}
      </div>
      <div style="${colorAreaStyle} background:linear-gradient(160deg, #111113 0%, #1c1c1e 100%); z-index:2; display:flex; flex-direction:column; justify-content:center; padding:${g.padX}px;">
        <div style="width:64px; height:6px; background:${accent}; margin-bottom:24px; border-radius:3px;"></div>
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 58 : 50}px; line-height:1.0; text-transform:uppercase; color:#fff;">${esc(opts.overlayTitle)}</div>` : ''}
        ${opts.price ? `<div style="margin-top:22px;">
          ${hasPromo ? `<div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;"><span style="font-family:'Anton',sans-serif; font-size:28px; color:rgba(255,255,255,.5); text-decoration:line-through;">$${formatPrice(opts.price)}</span><span style="background:${accent}; color:#fff; font-weight:800; font-size:15px; padding:5px 12px; border-radius:100px;">-${off}%</span></div>` : ''}
          <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 68 : 58}px; color:#fff;">$${formatPrice(now)}</div>
        </div>` : ''}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: g.isStory ? 84 : 68, top: g.wmTop, left: g.padX })}
      ${opts.badgeText ? badgeTag(opts.badgeText, { accent, top: g.wmTop, right: g.padX }) : ''}
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** BLUEPRINT: estética de plano técnico/manual de ingeniería — segunda cara para educativo. */
function buildBlueprintHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const img = opts.bgImageUrl || opts.productImageUrl;
  const gridLine = 'rgba(28,28,30,.06)';
  const gridBg = `repeating-linear-gradient(0deg, ${gridLine} 0px, ${gridLine} 1px, transparent 1px, transparent 44px),
    repeating-linear-gradient(90deg, ${gridLine} 0px, ${gridLine} 1px, transparent 1px, transparent 44px)`;
  const bracket = (styleProps) => `<div style="position:absolute; width:34px; height:34px; z-index:4; opacity:.8; ${styleProps}"></div>`;
  const corners = `
    ${bracket(`top:${g.wmTop - 24}px; left:${g.padX - 24}px; border-top:3px solid ${accent}; border-left:3px solid ${accent};`)}
    ${bracket(`top:${g.wmTop - 24}px; right:${g.padX - 24}px; border-top:3px solid ${accent}; border-right:3px solid ${accent};`)}
    ${bracket(`bottom:${g.footBottom - 24}px; left:${g.padX - 24}px; border-bottom:3px solid ${accent}; border-left:3px solid ${accent};`)}
    ${bracket(`bottom:${g.footBottom - 24}px; right:${g.padX - 24}px; border-bottom:3px solid ${accent}; border-right:3px solid ${accent};`)}
  `;

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden; background:#fafafa;">
      <div style="position:absolute; inset:0; background:${gridBg}; z-index:0;"></div>
      ${corners}
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: g.isStory ? 86 : 70, top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; font-family:'Inter',monospace; font-size:${g.isStory ? 18 : 16}px; font-weight:700; letter-spacing:2px; color:#9a9aa0; z-index:4;">FIG. ${String((Number(opts.layoutSeed) || 1) % 20 + 1).padStart(2, '0')}</div>
      <div style="position:absolute; top:${g.isStory ? 260 : 180}px; left:${g.padX + 20}px; right:${g.padX + 20}px; z-index:3;">
        <div style="display:inline-flex; align-items:center; gap:10px; border:1.5px solid #111113; color:#111113; font-weight:800; font-size:${g.isStory ? 20 : 18}px; letter-spacing:3px; text-transform:uppercase; padding:8px 20px; margin-bottom:22px;">${esc(opts.kicker || 'GUÍA TÉCNICA')}</div>
        <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 78 : 64}px; line-height:1.0; letter-spacing:.5px; text-transform:uppercase; color:#111113; max-width:94%;">${esc(opts.overlayTitle || '')}</div>
        ${opts.bodyText ? `<div style="font-size:${g.isStory ? 30 : 26}px; font-weight:500; line-height:1.4; color:#3c3c42; margin-top:22px; max-width:88%;">${esc(opts.bodyText)}</div>` : ''}
      </div>
      ${img ? `<div style="position:absolute; top:${g.isStory ? 720 : 480}px; bottom:${g.footBottom + 30}px; left:${g.padX + 40}px; right:${g.padX + 40}px; background:rgba(255,255,255,.7); border:1.5px dashed rgba(28,28,30,.25); display:flex; align-items:center; justify-content:center; padding:36px; z-index:2;">
        <img src="${esc(img)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 20px 35px rgba(0,0,0,.15));"/>
      </div>` : ''}
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** MAGAZINE: portada editorial — kicker + titular gigante, foto chica de apoyo (o ninguna). */
function buildMagazineHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const img = opts.bgImageUrl || opts.productImageUrl;
  // Sin foto y con puntos reales (storyPoints): checklist debajo del titular — la
  // portada editorial queda con contenido útil en vez de aire muerto.
  const points = Array.isArray(opts.storyPoints) ? opts.storyPoints.filter(Boolean).slice(0, 3) : [];
  const pointsHtml = !img && points.length
    ? `<div style="margin-top:${g.isStory ? 48 : 34}px; max-width:${g.isStory ? '92%' : '80%'};">${pointsChecklistHtml(points, g, accent)}</div>`
    : '';

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden; background:#0d0d0f;">
      <div style="position:absolute; top:-10%; left:-10%; width:120%; height:60%; background:radial-gradient(ellipse at 30% 20%, rgba(232,93,27,.16) 0%, rgba(0,0,0,0) 65%); z-index:0;"></div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: g.isStory ? 86 : 70, top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; font-size:${g.isStory ? 20 : 18}px; font-weight:700; letter-spacing:3px; color:rgba(255,255,255,.55); z-index:4;">${esc((config.brand.instagram || '').toUpperCase())}</div>
      <div style="position:absolute; top:${g.isStory ? 300 : 200}px; left:${g.padX}px; right:${g.padX}px; z-index:3;">
        <div style="font-size:${g.isStory ? 22 : 20}px; font-weight:800; letter-spacing:4px; color:${accent}; text-transform:uppercase; margin-bottom:18px;">${esc(opts.kicker || 'BLACKS INDUMENTARIA')}</div>
        <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 108 : 88}px; line-height:.92; letter-spacing:-.5px; text-transform:uppercase; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,.6);">${esc(opts.overlayTitle || '')}</div>
        ${opts.bodyText ? `<div style="font-size:${g.isStory ? 30 : 26}px; font-weight:500; line-height:1.4; color:rgba(255,255,255,.8); margin-top:26px; max-width:80%;">${esc(opts.bodyText)}</div>` : ''}
        ${pointsHtml}
      </div>
      ${img ? `<div style="position:absolute; bottom:${g.footBottom}px; right:${g.padX}px; width:${g.isStory ? 300 : 260}px; height:${g.isStory ? 380 : 320}px; border-radius:18px; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,.5); border:2px solid rgba(255,255,255,.15); z-index:2;">
        <img src="${esc(img)}" style="width:100%; height:100%; object-fit:cover;"/>
      </div>` : ''}
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** STACKEDCARDS: bento de 3 tarjetas (foto/headline + highlight + dato de marca) — moderno, bueno para mayorista. */
function buildStackedcardsHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  const top = g.wmTop + (g.isStory ? 110 : 90);
  const bottom = g.footBottom;
  const gap = 16;
  const bigH = Math.round((g.h - top - bottom - gap) * 0.62);
  const smallH = g.h - top - bottom - gap * 2 - bigH;
  const halfW = Math.round((g.w - g.padX * 2 - gap) / 2);

  const bigCard = opts.productImageUrl
    ? `<div style="position:absolute; top:${top}px; left:${g.padX}px; right:${g.padX}px; height:${bigH}px; border-radius:28px; overflow:hidden; background:#f4f4f6; box-shadow:0 20px 45px rgba(0,0,0,.25); z-index:1;">
        <img src="${esc(opts.productImageUrl)}" style="width:100%; height:100%; object-fit:cover;"/>
      </div>`
    : `<div style="position:absolute; top:${top}px; left:${g.padX}px; right:${g.padX}px; height:${bigH}px; border-radius:28px; background:linear-gradient(160deg, #111113 0%, #1c1c1e 100%); box-shadow:0 20px 45px rgba(0,0,0,.25); z-index:1; display:flex; align-items:center; padding:36px;">
        <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 60 : 48}px; line-height:1.0; text-transform:uppercase; color:#fff;">${esc(opts.overlayTitle || '')}</div>
      </div>`;

  const cardTop2 = top + bigH + gap;
  const card2 = `<div style="position:absolute; top:${cardTop2}px; left:${g.padX}px; width:${halfW}px; height:${smallH}px; border-radius:22px; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); box-shadow:0 14px 32px rgba(232,93,27,.35); z-index:1; display:flex; flex-direction:column; justify-content:center; padding:24px;">
    <div style="font-size:${g.isStory ? 17 : 15}px; font-weight:800; letter-spacing:2px; color:rgba(255,255,255,.8); text-transform:uppercase; margin-bottom:6px;">${esc(opts.kicker || 'BLACKS')}</div>
    <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 28 : 23}px; line-height:1.1; color:#fff;">${esc(opts.cta || opts.badgeText || 'Para tu empresa')}</div>
  </div>`;
  const card3 = `<div style="position:absolute; top:${cardTop2}px; right:${g.padX}px; width:${halfW}px; height:${smallH}px; border-radius:22px; background:#fff; box-shadow:0 14px 32px rgba(0,0,0,.14); z-index:1; display:flex; flex-direction:column; justify-content:center; padding:24px;">
    <div style="font-size:${g.isStory ? 17 : 15}px; font-weight:800; letter-spacing:2px; color:#9a9aa0; text-transform:uppercase; margin-bottom:6px;">ENVÍOS</div>
    <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 24 : 20}px; line-height:1.1; color:#111113;">A TODO EL PAÍS</div>
  </div>`;

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #f4f4f6 0%, #e8e8ee 100%);">
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: g.isStory ? 84 : 68, top: g.wmTop, left: g.padX })}
      ${opts.overlayTitle && opts.productImageUrl ? `<div style="position:absolute; top:${g.wmTop + 12}px; left:${g.padX + 200}px; right:${g.padX}px; text-align:right; font-family:'Anton',sans-serif; font-size:${g.isStory ? 36 : 30}px; text-transform:uppercase; color:#111113; z-index:2;">${esc(opts.overlayTitle)}</div>` : ''}
      ${bigCard}
      ${card2}
      ${card3}
      ${domainHtml(g, { dark: true, accent })}
    </div>
  </body></html>`;
}

/** POLAROIDSTRIP: 2-3 fotos reales en formato instantánea, apiladas verticalmente (sólo historias) — estética UGC/backstage. */
function buildPolaroidStripHtml(opts) {
  const g = sharedGeometry('story');
  const accent = opts.accent || config.brand.colors.darkOrange;
  const urls = (opts.productImageUrls && opts.productImageUrls.length ? opts.productImageUrls : [opts.productImageUrl]).filter(Boolean).slice(0, 3);
  const areaTop = g.wmTop + 140;
  const areaBottom = g.footBottom + 40;
  const areaH = g.h - areaTop - areaBottom;
  const frameH = Math.round(areaH / urls.length) - 20;
  const frameW = Math.round(g.w * 0.62);
  const rotations = [-4, 3, -2];

  const frames = urls.map((u, i) => {
    const top = areaTop + i * (frameH + 26);
    const left = Math.round((g.w - frameW) / 2 + (i % 2 === 0 ? -30 : 30));
    return `<div style="position:absolute; top:${top}px; left:${left}px; width:${frameW}px; background:#fff; padding:14px 14px 34px; border-radius:6px; box-shadow:0 24px 45px rgba(0,0,0,.4); transform:rotate(${rotations[i % rotations.length]}deg); z-index:${2 + i};">
      <img src="${esc(u)}" style="width:100%; height:${frameH - 40}px; object-fit:cover;"/>
    </div>`;
  }).join('');

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#111113; overflow:hidden;
      background:radial-gradient(130% 100% at 50% 0%, #f4f4f6 0%, #e2e2e8 100%);">
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: 88, top: g.wmTop, left: g.padX })}
      ${opts.overlayTitle ? `<div style="position:absolute; top:${g.wmTop + 6}px; left:${g.padX + 200}px; right:${g.padX}px; text-align:right; font-family:'Anton',sans-serif; font-size:30px; text-transform:uppercase; color:#111113; z-index:4;">${esc(opts.overlayTitle)}</div>` : ''}
      ${frames}
      ${domainHtml(g, { dark: true, accent })}
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
    case 'grid': return buildGridHtml(opts);
    case 'overlap': return buildOverlapHtml(opts);
    case 'specsheet': return buildSpecsheetHtml(opts);
    case 'splitscreen': return buildSplitscreenHtml(opts);
    case 'blueprint': return buildBlueprintHtml(opts);
    case 'magazine': return buildMagazineHtml(opts);
    case 'stackedcards': return buildStackedcardsHtml(opts);
    case 'polaroidstrip': return buildPolaroidStripHtml(opts);
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

  // Plantillas que muestran FOTOS REALES del catálogo (varias tomas o specs reales):
  // ahí no conviene reemplazar la foto por una escena compuesta con IA.
  const skipAiScene = ['grid', 'overlap', 'specsheet', 'polaroidstrip'].includes(options.template);

  // 1) Si hay producto, intentamos meterlo en una escena profesional generada con IA.
  if (!bgImageUrl && options.useAiProductScene && productImageUrl && !skipAiScene) {
    const scene = await generateProductScene({
      productImageUrl, productImageUrls: options.productImageUrls || [],
      productName: options.overlayTitle, theme: options.bgTheme,
      brief: options.bgBrief, occasion: options.bgOccasion, format,
      seed: options.layoutSeed, // variedad de escenario/luz/cámara por pieza
      shotSpec: options.shotSpec || null, // director de arte: tipo de toma, foco, fondo
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
      seed: options.layoutSeed,
    });
    if (bg) {
      bgImageUrl = `data:${bg.mimeType};base64,${bg.buffer.toString('base64')}`;
      costUsd += bg.costUsd || 0;
    }
  }

  const html = buildHtml({ ...options, format, bgImageUrl, productImageUrl });

  // Navegador compartido + a lo sumo 2 páginas a la vez (memoria de Render).
  await acquireRenderSlot();
  let buffer;
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
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
    if (page) await page.close().catch(() => {}); // cerramos la PÁGINA, no el navegador (se reusa)
    releaseRenderSlot();
  }

  const url = await uploadAsset({ buffer, filename: outFile, contentType: 'image/jpeg' });
  // La foto LIMPIA usada (escena IA o foto de catálogo), antes de estampar texto/precio
  // encima. Sirve para reusarla en otro slide (ej. el de precio) sin duplicar texto
  // "quemado" — reusar directamente `url` (que ya tiene chrome) genera doble cuadro/texto fantasma.
  const cleanImageUrl = bgImageUrl || productImageUrl || null;
  return { url, buffer, costUsd, cleanImageUrl };
}

async function renderPostImage(options) {
  const { url } = await renderPostBuffer(options);
  return url;
}

module.exports = { renderPostImage, renderPostBuffer, buildHtml, DIMS, TEMPLATES, TEMPLATE_INFO, TEMPLATE_REQUIREMENTS };
