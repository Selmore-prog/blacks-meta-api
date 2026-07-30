const puppeteer = require('puppeteer');
const config = require('./config');
const { uploadAsset } = require('./storage');
const { generateBackground, generateProductScene, generateDiagram } = require('./ai');
const { stripEmoji, fixSpelling } = require('./textUtils');

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
  return stripEmoji(String(s || ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Ícono de rayo vectorial (reemplaza el emoji ⚡, que salía como cuadradito). */
function boltSvg(color = '#FF8B4D', size = 26) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" style="display:inline-block; vertical-align:middle; flex:0 0 auto;"><path d="M13 2L4.5 13.2c-.4.5 0 1.3.7 1.3H11l-1.2 7.2c-.1.8.9 1.2 1.4.6L20 11.1c.4-.5 0-1.3-.7-1.3H14l1.1-6.9c.1-.8-.9-1.2-1.4-.6z"/></svg>`;
}

/** Tilde vectorial. Va en SVG y no como carácter ✓ (U+2713): en el contenedor de
 *  producción no hay fuente que lo dibuje garantizado y salía como cuadradito. */
function checkSvg(color = '#fff', size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" style="display:block; flex:0 0 auto;"><path d="M20 6L9 17l-5-5"/></svg>`;
}

/** Flecha vectorial para los botones de CTA (mismo motivo que checkSvg). */
function arrowSvg(color = '#fff', size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block; flex:0 0 auto;"><path d="M5 12h13M12 5l7 7-7 7"/></svg>`;
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

/* Entidades HTML que llegan literales en las descripciones de Tiendanube (los textos
 * se pegaron desde Word/otro editor). Sin decodificarlas, la ficha técnica mostraba
 * cosas como "Pantalón clásico BLACK&acute" impreso en la pieza. */
const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', acute: '´',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª', deg: '°', hellip: '…', mdash: '—', ndash: '–',
};
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);?/g, (m, name) => (HTML_ENTITIES[name] !== undefined ? HTML_ENTITIES[name] : m));
}

// Palabras que indican una CARACTERÍSTICA CONCRETA (material, protección, construcción):
// lo que sirve como dato en una pieza.
const FEATURE_WORDS = /(cuero|acero|algod[oó]n|poli[eé]ster|elastano|spandex|lycra|canvas|gabardina|grafa|ripstop|cordura|denim|jean|poplin|trucker|guata|frisa|polar|softshell|impermeable|hidr[oó]fug|transpirable|t[eé]rmic|abrigo|forrad|reforzad|costura|puntera|suela|plantilla|antideslizante|antiest[aá]tic|diel[eé]ctric|certificad|norma|iram|bolsillo|cierre|capucha|cuello|puño|presilla|ajustable|elastizad|botamanga|cintura|talle|unisex|dama|caballero|oz\b|onzas|%)/i;

// Habla de BENEFICIO/marketing, no de una característica: "diseñada especialmente para
// ofrecer comodidad", "ideal para soportar el desgaste diario". Como dato en la pieza no
// dicen nada y quedaban impresos igual.
const FILLER_WORDS = /(descubr[ií]|conoc[eé]|ideal para|pensad[oa] |diseñad[oa] |perfect[oa] |garantiz|brinda|ofrec[ei]|te permite|permiten|para que|adem[aá]s de|experiencia|sensaci[oó]n|elegancia|versatilidad|apuesta|comodidad|durabilidad|calidad superior|m[aá]xima calidad|estilo [uú]nico|desgaste diario)/i;

// Termina colgado (fragmento cortado a mitad de frase): "…en Cintura y Botamanga : Permiten".
const DANGLING_END = /\b(y|e|o|u|de|del|con|sin|para|por|en|a|al|que|como|su|sus|la|el|los|las|un|una|más|muy|tus|te|se)$/i;

// Títulos de sección de la ficha, no datos: "Características principales:", "Composición:".
// El dato es lo que viene DESPUÉS (y eso ya sale solo al partir por ':').
const HEADING_RE = /^(caracter[ií]sticas?( principales| destacadas| t[eé]cnicas)?|descripci[oó]n( del producto)?|detalles?|especificaciones|informaci[oó]n( adicional)?|beneficios?|ventajas?|medidas?|talles?( disponibles)?|composici[oó]n|materiales?|cuidados?|instrucciones|colores?( disponibles)?|usos?|aplicaciones)$/i;

// Siglas, unidades y normas que SÍ van en mayúscula aunque la spec se pase a caja de
// oración. Todo lo demás se baja (si no, quedaban preposiciones gritadas: "Media DE
// poliester", "Confeccionado EN tela polar").
const KEEP_UPPER = new Set(['OZ', 'UV', 'PVC', 'RIB', 'DTG', 'EVA', 'TPU', 'PU', 'IRAM', 'ISO', 'ASTM',
  'LED', 'ABS', 'SRC', 'SB', 'S1', 'S2', 'S3', 'P1', 'P2', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  'CM', 'MM', 'KG', 'GR', 'ML', 'AR', 'US', 'EU', 'ANSI', 'EPI']);
// Marcas propias y de proveedores: conservan su forma correcta.
const PROPER_NOUNS = ['BLACKS', ...(config.brand.knownBrands || [])];

/**
 * Pasa una spec ALL CAPS a caja de oración ("CIERRE DE BRONCE" -> "Cierre de bronce"),
 * respetando siglas/unidades ("PVC inyectado", "tela RIB", "8 OZ") y marcas ("Pampero").
 * Las descripciones viejas del catálogo están escritas enteras en mayúscula y como chip
 * quedaban gritadas.
 */
function sentenceCase(s) {
  if (s !== s.toUpperCase()) return s; // ya viene en caja mixta: no lo tocamos
  const lowered = s.split(/(\s+)/).map((tok) => {
    if (!tok.trim()) return tok;
    const bare = tok.replace(/[^A-Z0-9%°/]/gi, '');
    if (KEEP_UPPER.has(bare) || /\d/.test(tok)) return tok;
    return tok.toLowerCase();
  }).join('');
  let out = lowered.charAt(0).toUpperCase() + lowered.slice(1);
  for (const noun of PROPER_NOUNS) {
    out = out.replace(new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), noun);
  }
  return out;
}

/**
 * Extrae 2-3 datos técnicos CORTOS y con SENTIDO de la descripción real de Tiendanube
 * (nunca inventa nada) para imprimirlos como chips/specs en las piezas.
 *
 * Rediseñado en jul-2026 porque los items salían mal (queja real: "que tengan sentido los
 * items de la ficha técnica"). Los defectos concretos que corrige:
 *  - entidades HTML crudas impresas en la pieza ("Pantalón clásico BLACK&acute");
 *  - fragmentos cortados a mitad de frase ("impacto de partículas", "…Botamanga : Permiten");
 *  - relleno de marketing sin dato ("diseñada especialmente para ofrecer comodidad");
 *  - el nombre del producto repetido como si fuera una característica;
 *  - frases largas de dos renglones donde alcanzaba la etiqueta ("Puntera de acero:
 *    protege tus pies frente a impactos" -> "Puntera de acero");
 *  - texto GRITADO en mayúsculas ("CIERRE DE BRONCE" -> "Cierre de bronce").
 */
function extractSpecTags(description, max = 3, { productName = '', maxLen = 42 } = {}) {
  if (!description) return [];
  const plain = decodeEntities(String(description).replace(/<[^>]+>/g, ' '))
    .replace(/[-–—_=*]{3,}/g, ' ')   // separadores decorativos de las fichas viejas
    .replace(/\s+/g, ' ')
    .trim();
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameKey = norm(productName);

  // 1) Cortes FUERTES: punto, punto y coma, DOS PUNTOS, viñeta, salto, guion de lista.
  //    Los dos puntos importan porque casi todas las fichas de Tiendanube se escriben
  //    "Etiqueta : explicación larga" — al cortar ahí, la etiqueta (que ES la spec:
  //    "Tela Grafa y Gabardina", "Costuras Reforzadas") queda suelta y la explicación
  //    se descarta sola por larga. A diferencia de antes NO se corta por coma acá:
  //    cortar por coma partía las frases al medio y de ahí salían los fragmentos
  //    sin sentido ("impacto de partículas").
  const strong = plain.split(/[.;:•|\n]+|\s[-–—]\s/).map((s) => s.trim()).filter(Boolean);

  // 2) Tramo corto = candidato tal cual. Tramo largo = recién ahí lo abro por comas
  //    (marcado como fragmento, que se filtra más duro).
  const candidates = [];
  for (const seg of strong) {
    if (seg.length <= 52) { candidates.push({ text: seg, fromFragment: false }); continue; }
    for (const piece of seg.split(/,\s*/)) candidates.push({ text: piece.trim(), fromFragment: true });
  }

  const clean = (raw) => {
    let t = String(raw).replace(/^[\s\-–—•*:·>]+/, '').replace(/[\s:,;·]+$/, '').trim();
    t = t.replace(/\s{2,}/g, ' ');
    return t;
  };

  // 3) Filtro. `strict` exige además que el candidato arranque en mayúscula cuando salió
  //    de partir una frase por comas: una spec de verdad empieza con mayúscula en la
  //    ficha; lo que empieza en minúscula es texto arrancado del medio de la oración.
  const pick = (strict) => {
    const out = [];
    const seen = new Set();
    const accept = (list) => {
      for (const c of list) {
        const t = clean(c.text);
        if (t.length < 5 || t.length > maxLen) continue;
        if (!/[a-záéíóúñ]{3,}/i.test(t)) continue;              // puro número/símbolo
        if (DANGLING_END.test(t)) continue;                      // fragmento colgado
        if (HEADING_RE.test(t)) continue;                        // título de sección
        const hasFeature = FEATURE_WORDS.test(t);
        if (FILLER_WORDS.test(t) && !hasFeature) continue;        // relleno sin dato
        if (strict && c.fromFragment && !/^[A-ZÁÉÍÓÚÑ0-9]/.test(t)) continue;
        const key = norm(t);
        if (!key || seen.has(key.slice(0, 12))) continue;
        // Eco del nombre del producto: no es una característica.
        if (nameKey && key.length >= 8 && (nameKey.includes(key.slice(0, 14)) || key.includes(nameKey.slice(0, 14)))) continue;
        seen.add(key.slice(0, 12));
        out.push({ text: fixSpelling(sentenceCase(t)), hasFeature });
      }
    };
    // Primero las que nombran una característica concreta, después el resto.
    accept(candidates.filter((c) => FEATURE_WORDS.test(clean(c.text))));
    accept(candidates.filter((c) => !FEATURE_WORDS.test(clean(c.text))));
    return out;
  };

  // Pasada estricta; si la ficha está escrita toda en minúscula y quedó corta, se relaja.
  let picked = pick(true);
  if (picked.length < Math.min(2, max)) {
    const relaxed = pick(false);
    if (relaxed.length > picked.length) picked = relaxed;
  }
  return picked.slice(0, max).map((p) => p.text);
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
    // ZONAS SEGURAS de Instagram para el layout en columna (ver buildFullbleedHtml):
    // en historias, arriba va la barra de progreso + @usuario y abajo el "Enviá un
    // mensaje" + la flecha de compartir. Nada de la pieza puede entrar ahí.
    safeTop: isStory ? 196 : 54,
    safeBottom: isStory ? 236 : 54,
    stackPadX: isStory ? 76 : 62,
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
 * Encuadra un logo mostrando SOLO su tinta al alto pedido. Los PNG de logo vienen con
 * un margen transparente enorme: con un `height` a secas el navegador escala también
 * ese margen y la marca visible queda ~40% más chica de lo pedido (el "logo muy chico"
 * que no se arreglaba subiendo el número). Con la caja de tinta medida (measureInkBox)
 * recortamos el margen: el alto pedido es el alto REAL de la marca.
 * Sin medición disponible cae al comportamiento viejo (imagen completa).
 */
function logoFrameHtml(logoUrl, ink, { heightPx, maxWidthPx, shadow }) {
  const filter = `filter:drop-shadow(0 2px 3px ${shadow.near}) drop-shadow(0 6px 18px ${shadow.far});`;
  if (!ink || !ink.aspect) {
    return `<img class="logo" style="height:${heightPx}px; max-width:${maxWidthPx}px; object-fit:contain; ${filter}" src="${esc(logoUrl)}" alt="BLACKS"/>`;
  }
  const inkW = ink.x1 - ink.x0;
  const inkH = ink.y1 - ink.y0;
  let imgH = heightPx / inkH;          // alto que tendría la imagen COMPLETA
  let imgW = imgH * ink.aspect;        // ancho de la imagen completa
  let boxW = imgW * inkW;              // ancho visible de la marca
  let boxH = heightPx;
  if (boxW > maxWidthPx) {             // marca muy ancha (lockup horizontal): la limitamos
    const k = maxWidthPx / boxW;
    imgH *= k; imgW *= k; boxW *= k; boxH *= k;
  }
  const r = (n) => Math.round(n * 10) / 10;
  return `<div class="logo" style="position:relative; flex:0 0 auto; width:${r(boxW)}px; height:${r(boxH)}px; overflow:hidden; ${filter}">
    <img src="${esc(logoUrl)}" alt="BLACKS" style="position:absolute; left:${r(-ink.x0 * imgW)}px; top:${r(-ink.y0 * imgH)}px; width:${r(imgW)}px; height:${r(imgH)}px;"/>
  </div>`;
}

/**
 * Marca de BLACKS. `dark` = el FONDO donde va a ir es oscuro -> necesita el logo de
 * tinta CLARA (logoOnDark); fondo claro -> logo de tinta OSCURA (logoOnLight).
 * Acepta el par {logoOnLight, logoOnDark} (selección automática) o un logoUrl único
 * (compat vieja, sin distinción de fondo).
 */
function brandMarkHtml(logos, { dark = false, heightPx = 104, maxWidthPx = null } = {}) {
  const logoUrl = typeof logos === 'string' ? logos : (dark ? logos?.onLight : logos?.onDark) || logos?.fallback;
  if (logoUrl) {
    const ink = (logos && typeof logos === 'object' && logos.ink) ? logos.ink[logoUrl] : null;
    return logoFrameHtml(logoUrl, ink, {
      heightPx,
      maxWidthPx: maxWidthPx || logoMaxWidthPx(heightPx),
      shadow: dark
        ? { near: 'rgba(0,0,0,.18)', far: 'rgba(255,255,255,.16)' }
        : { near: 'rgba(255,255,255,.22)', far: 'rgba(0,0,0,.5)' },
    });
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

// Alto del logo esquinado. IMPORTANTE: desde jul-2026 es el alto de la MARCA VISIBLE
// (la tinta), no el del PNG: brandMarkHtml recorta el margen transparente. Antes 150/120
// era el alto del archivo y la marca se veía a ~85/68px real — de ahí que el dueño lo
// siguiera viendo chico después de agrandarlo. Fuente única para todas las plantillas.
function logoHeightPx(isStory) { return isStory ? 132 : 104; }

// Tope de ANCHO de la marca. Hace falta porque los dos logos de la marca son lockups muy
// distintos: el de fondo oscuro es apilado (casi cuadrado, 152px de ancho a 132 de alto)
// y el de fondo claro es horizontal (3:1 — a 132 de alto mediría 561px, más de la mitad
// del lienzo, y se comía el titular de varias plantillas). Con el tope, el horizontal
// baja de alto y ocupa un ancho razonable; el apilado ni se entera.
function logoMaxWidthPx(heightPx) { return Math.round(heightPx * 2.9); }

/** Logo/wordmark esquinado arriba-izquierda (posición común entre plantillas). */
function cornerBrand(logos, { showBrand, dark, heightPx, top, left }) {
  if (showBrand === false) return '';
  return `<div style="position:absolute; top:${top}px; left:${left}px; display:flex; align-items:center; z-index:4;">
    ${brandMarkHtml(logos, { dark, heightPx, maxWidthPx: logoMaxWidthPx(heightPx) })}</div>`;
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
function heroPhotoHtml({ bgImageUrl, productImageUrl, box, shadow = 'rgba(0,0,0,.5)', darkBg = false, fill = false, softTop = false }) {
  // `fill`: la tarjeta ocupa TODO su contenedor (que el llamador posiciona) en vez de
  // una caja absoluta con top/bottom fijos. Lo usa el layout en columna de fullbleed,
  // donde la zona de foto es un flex que se encoge según cuánto texto haya.
  // `fill`: el llamador (zona flex centrada) define el espacio; la tarjeta se acomoda
  // dentro con su propia forma. `box`: posición absoluta clásica del resto de plantillas.
  const place = fill
    ? 'position:relative;'
    : `position:absolute; top:${box.top}px; bottom:${box.bottom}px; left:${box.left}px; right:${box.right}px;`;
  // `softTop`: la foto real recorta al modelo (torso cortado). Un corte duro en el aire
  // dentro de la tarjeta se lee como error de diseño; un desvanecido lo vuelve un
  // encuadre editorial intencional.
  const fadeMask = softTop
    ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.35) 5%, #000 16%, #000 100%)'
    : null;
  if (bgImageUrl) {
    return {
      fullBleed: true,
      html: `<img src="${esc(bgImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/>`,
    };
  }
  if (productImageUrl) {
    if (darkBg) {
      // SET DE ESTUDIO (fallback sin escena IA): ciclorama con degradado direccional
      // (sin "caja blanca" plana), luz cenital, sombra de contacto en el piso y el
      // producto GRANDE. Rediseñado por feedback real del dueño (jul-2026): la
      // tarjeta anterior parecía "un cuadrado con el pantalón ahí".
      const mask = fadeMask || 'radial-gradient(circle at center, black 68%, transparent 99%)';
      // En modo `fill` la zona de foto es elástica y puede quedar apaisada: sin este
      // clamp la tarjeta se estiraba a lo ancho y el producto (vertical) nadaba en un
      // letterbox blanco. Con aspect-ratio + margin:auto la tarjeta siempre tiene forma
      // de ficha de producto y queda centrada en el aire que le toque.
      const shape = fill ? 'aspect-ratio:1/1; max-width:100%; max-height:100%;' : '';
      return {
        fullBleed: false,
        html: `<div style="${place}${shape}
          display:flex; align-items:center; justify-content:center; z-index:1;
          background:
            radial-gradient(140% 100% at 50% -20%, #ffffff 0%, #f2f4f7 40%, #e2e6ec 75%, #d3d8e0 100%);
          border-radius:44px;
          box-shadow:0 50px 100px rgba(0,0,0,.72), inset 0 2px 10px rgba(255,255,255,.95), inset 0 -24px 50px rgba(20,25,35,.10);
          padding:${softTop ? '0 30px 40px' : '38px 34px 54px'}; overflow:hidden;">
          <!-- Haz de luz cenital de estudio -->
          <div style="position:absolute; top:-12%; left:22%; right:22%; height:55%; background:radial-gradient(50% 60% at 50% 0%, rgba(255,255,255,.9) 0%, rgba(255,255,255,0) 100%); pointer-events:none;"></div>
          <!-- Sombra de contacto en el piso del ciclorama -->
          <div style="position:absolute; left:16%; right:16%; bottom:30px; height:34px; background:radial-gradient(50% 100% at 50% 100%, rgba(15,20,30,.22) 0%, rgba(15,20,30,0) 72%); filter:blur(7px); pointer-events:none;"></div>
          <img src="${esc(productImageUrl)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 30px 48px rgba(10,15,25,.24)) saturate(1.04) contrast(1.02); mix-blend-mode:multiply; -webkit-mask-image:${mask}; mask-image:${mask};"/>
        </div>`,
      };
    }
    const mask = fadeMask || 'radial-gradient(circle at center, black 65%, transparent 98%)';
    return {
      fullBleed: false,
      html: `<div style="${place}
        display:flex; align-items:center; justify-content:center; z-index:1;">
        <img src="${esc(productImageUrl)}" style="max-width:100%; max-height:100%; object-fit:contain; filter:drop-shadow(0 30px 50px ${shadow}); mix-blend-mode:multiply; -webkit-mask-image:${mask}; mask-image:${mask};"/>
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
 * FULLBLEED — la plantilla caballo de batalla (y el fallback del self-healing).
 *
 * LAYOUT EN COLUMNA (rediseño jul-2026). Antes cada bloque estaba posicionado en
 * absoluto con offsets calculados a mano (`bottom:360`, `bottom:288`, `bottom:250`...).
 * Como esos números no sabían cuánto medía el contenido, en cuanto la pieza traía
 * precio + 3 datos + botón, todo terminaba a 8px de distancia: la línea de datos
 * pegada a la tarjeta de la foto, el botón pegado al precio y el dominio pegado al
 * botón (queja real del dueño: "pareciera que está todo muy amontonado").
 *
 * Ahora la pieza es UNA COLUMNA FLEX dentro de las zonas seguras de Instagram:
 *
 *   ┌─ safeTop ────────────────────────┐
 *   │ marca                     badge  │  zona-top   (alto del logo)
 *   │                                  │
 *   │        FOTO / TARJETA            │  zona-hero  (elástica: se encoge)
 *   │                                  │
 *   │ chips de datos reales            │  zona-body  (contenido)
 *   │ tarjeta de precio                │
 *   │        [ botón CTA ]             │  zona-cta
 *   │        www.dominio               │  zona-foot
 *   └─ safeBottom ─────────────────────┘
 *
 * Los `gap` del flex garantizan la separación SIEMPRE, sin importar cuánto texto
 * genere la IA: si el contenido crece, lo que cede es la foto (zona elástica), nunca
 * el aire entre bloques. Y como la tarjeta de la foto vive DENTRO de la columna, ya
 * no puede quedar pisada por el texto.
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

  const g = sharedGeometry(format);
  const { w, h, isStory } = g;
  const accent = opts.accent || config.brand.colors.darkOrange;
  const site = String(config.brand.site || '').toUpperCase();
  const transfer = String(config.brand.transferNote || '').toUpperCase();

  const hasCover = Boolean(bgImageUrl || productImageUrl);
  const showBrand = opts.showBrand !== false;
  const padX = g.stackPadX;

  // Foto A SANGRE (escena IA, o foto real marcada como cover) vs. tarjeta de estudio
  // contenida (recorte de catálogo con fondo plano).
  const fullBleedCover = Boolean(bgImageUrl || (productImageUrl && opts.coverImage));
  // La foto real recorta al modelo (torso cortado): el corte duro contra el blanco de
  // la tarjeta se lee como error. Lo desvanecemos. Ver planHeroShot/photoFraming.
  const softTop = !fullBleedCover && opts.photoFraming === 'recorte_cuerpo';

  const { hasPromo, off, now } = priceParts(price, promoPrice);

  /* ---------------- piezas de contenido ---------------- */

  // Datos reales del producto/oferta (story_points del copy). Chips independientes: uno
  // por dato, con tilde vectorial. Antes iban los tres dentro de una sola cápsula larga
  // que cruzaba la pieza de lado a lado como una "cinta" pegada a la foto.
  const points = Array.isArray(opts.storyPoints) ? opts.storyPoints.filter(Boolean).slice(0, 3) : [];
  const chipsHtml = specChipsHtml(points, g);

  const couponHtml = opts.couponCode
    ? `<div class="coupon"><span class="cpn-lbl">CUPÓN</span><span class="cpn-code">${esc(opts.couponCode)}</span></div>`
    : '';

  // TARJETA DE PRECIO. Rediseñada como ficha de producto: el nombre del producto entra
  // como etiqueta arriba (antes la pieza mostraba un precio sin decir de QUÉ era, y el
  // renglón "AHORA" gastaba una línea en no informar nada). Jerarquía: qué → antes/off
  // → cuánto → beneficio.
  const priceLabel = overlayTitle ? `<div class="pname">${esc(overlayTitle)}</div>` : '';
  const priceCardHtml = price
    ? `<div class="pcard">
        ${priceLabel}
        ${hasPromo
    ? `<div class="prow"><span class="antes">$${formatPrice(price)}</span><span class="off">-${off}% OFF</span></div>`
    : '<div class="plbl">PRECIO</div>'}
        <div class="now">$${formatPrice(now)}</div>
        ${transfer ? `<div class="transfer">${boltSvg('#FF8B4D', isStory ? 26 : 23)}<span>${esc(transfer)}</span></div>` : ''}
      </div>`
    : '';

  // Slide de cierre (CTA) de los carruseles de feed: llamado a la acción + beneficios,
  // sin precio.
  const ctaBenefits = Array.isArray(opts.ctaBenefits) ? opts.ctaBenefits.filter(Boolean) : [];
  const ctaCardHtml = opts.ctaHeadline
    ? `<div class="pcard">
        <div class="cta-head">${esc(opts.ctaHeadline)}</div>
        ${ctaBenefits.map((b) => `<div class="cta-benefit">${checkSvg('#fff', 17)}<span>${esc(b)}</span></div>`).join('')}
      </div>`
    : '';

  // Sin foto la pieza se sostiene con tipografía: titular grande + los datos reales
  // como checklist apilado (llena el centro en vez de dejar un hueco muerto).
  const headlineHtml = overlayTitle && !price && !opts.ctaHeadline
    ? `<div class="headline">${esc(overlayTitle)}</div>`
    : '';
  const checklistHtml = !hasCover && points.length ? pointsChecklistHtml(points, g, accent) : '';

  // DÓNDE VAN LOS CHIPS DE DATOS:
  //  - Foto contenida en tarjeta: ARRIBA, debajo de la marca. Llenan el aire muerto del
  //    tercio superior, equilibran la composición y le devuelven alto a la tarjeta.
  //  - Foto A SANGRE: ABAJO, arriba del precio. En una foto a pantalla completa el tercio
  //    superior es donde está la CARA del modelo y los chips se la tapaban.
  //  - Sin foto: van como checklist en el centro (son el contenido de la pieza).
  const chipsAtTop = hasCover && !fullBleedCover && !opts.ctaHeadline;
  const chipsAtBody = hasCover && fullBleedCover && !opts.ctaHeadline;
  const topChipsHtml = chipsAtTop ? chipsHtml : '';
  const bodyChipsHtml = chipsAtBody ? chipsHtml : '';

  let bodyHtml = '';
  if (opts.ctaHeadline) {
    bodyHtml = ctaCardHtml;
  } else if (price) {
    bodyHtml = `${bodyChipsHtml}${headlineHtml}${priceCardHtml}${checklistHtml}${couponHtml}`;
  } else {
    bodyHtml = `${bodyChipsHtml}${headlineHtml}${checklistHtml}${couponHtml}`;
  }

  // CTA impreso: el caption de una historia casi nadie lo lee, así que el llamado a la
  // acción va como botón SOBRE la pieza. Si la pieza es "semi", ese lugar lo ocupa el
  // chip de interacción (no se duplican botones).
  const ctaZoneHtml = interactionLabel
    ? `<div class="interaction">${esc(interactionLabel)}</div>`
    : (opts.ctaLabel ? `<div class="ctapill"><span>${esc(opts.ctaLabel)}</span>${arrowSvg('#fff', isStory ? 24 : 21)}</div>` : '');

  const brandHtml = showBrand ? brandMarkHtml(logos, { dark: false, heightPx: logoHeightPx(isStory), maxWidthPx: logoMaxWidthPx(logoHeightPx(isStory)) }) : '';
  const badgeHtml = badgeText ? `<div class="badge">${esc(badgeText)}</div>` : '';

  // La zona elástica es la de la FOTO cuando hay foto; si no hay, es la del contenido
  // (así el texto queda centrado vertical y no colgado abajo con un hueco arriba).
  const heroFlex = hasCover ? '1 1 auto' : '0 0 auto';
  const bodyFlex = hasCover ? '0 0 auto' : '1 1 auto';

  const heroZoneHtml = (hasCover && !fullBleedCover)
    ? heroPhotoHtml({
      bgImageUrl: null, productImageUrl, box: null, fill: true, softTop,
      shadow: 'rgba(0,0,0,.6)', darkBg: true,
    }).html
    : '';

  // Sin foto: fondo OSCURO de marca (el texto de esta plantilla es blanco).
  const bgFallback = 'linear-gradient(165deg, #0a0b0e 0%, #13161c 55%, #1c2029 100%)';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${w}px; height:${h}px; overflow:hidden; font-family:'Inter','Helvetica Neue',Arial,sans-serif; }
    .canvas { position:relative; width:${w}px; height:${h}px; background:${hasCover ? '#0a0a0c' : bgFallback}; color:#fff; overflow:hidden; }
    /* Glow volumétrico ambiental de estudio (piezas sin foto) */
    .glow { position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); width:850px; height:850px;
      background:radial-gradient(circle, rgba(232,93,27,.22) 0%, rgba(0,0,0,0) 65%); pointer-events:none; z-index:1; }
    .bg { position:absolute; inset:-40px; width:calc(100% + 80px); height:calc(100% + 80px);
      object-fit:cover; filter:blur(28px) brightness(.5) saturate(.85); z-index:0; }
    /* Scrim editorial multicapa: viñeta oscura en bordes + sombra de legibilidad abajo */
    .scrim { position:absolute; inset:0; z-index:2; background:
      radial-gradient(circle at 50% 38%, rgba(0,0,0,0) 38%, rgba(0,0,0,.48) 100%),
      linear-gradient(to bottom, rgba(0,0,0,.62) 0%, rgba(0,0,0,0) 24%, rgba(0,0,0,0) 46%, rgba(8,9,11,.92) 100%); }

    /* ===== COLUMNA PRINCIPAL: el aire entre bloques lo garantiza el flex ===== */
    .stack { position:absolute; top:${g.safeTop}px; bottom:${g.safeBottom}px; left:${padX}px; right:${padX}px;
      display:flex; flex-direction:column; align-items:stretch; z-index:4; }
    .zone-top { flex:0 0 auto; display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
    .zone-chips { flex:0 0 auto; margin-top:${isStory ? 30 : 22}px; }
    .zone-chips:empty { display:none; }
    .zone-hero { flex:${heroFlex}; position:relative; min-height:0; display:flex; align-items:center; justify-content:center;
      margin:${isStory ? 34 : 24}px 0 ${isStory ? 46 : 32}px; }
    .zone-hero:empty { margin:0; }
    .zone-body { flex:${bodyFlex}; min-height:0; display:flex; flex-direction:column; align-items:flex-start;
      justify-content:${hasCover ? 'flex-end' : 'center'}; gap:${isStory ? 26 : 20}px; }
    .zone-cta { flex:0 0 auto; display:flex; justify-content:center; margin-top:${isStory ? 40 : 26}px; }
    .zone-cta:empty { display:none; }
    .zone-foot { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:12px; margin-top:${isStory ? 30 : 20}px; }

    .wordmark { font-family:'Anton',sans-serif; font-size:${isStory ? 64 : 54}px; letter-spacing:8px;
      color:#fff; text-shadow:0 4px 20px rgba(0,0,0,.8); }
    /* Badge editorial metálico/naranja */
    .badge { flex:0 0 auto; background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); color:#fff;
      font-weight:800; font-size:${isStory ? 21 : 18}px; padding:11px 24px; border-radius:100px; text-transform:uppercase;
      letter-spacing:3px; box-shadow:0 10px 25px rgba(232,93,27,.45); border:1px solid rgba(255,255,255,.25); }

    .headline { font-family:'Anton',sans-serif; font-size:${isStory ? 80 : 66}px; line-height:.96;
      letter-spacing:.5px; text-transform:uppercase; color:#fff; max-width:100%; text-shadow:0 6px 30px rgba(0,0,0,.7); }

    /* ===== Tarjeta de precio / ficha de producto ===== */
    .pcard { align-self:flex-start; max-width:100%; text-align:left;
      background:linear-gradient(158deg, rgba(24,25,31,.82) 0%, rgba(10,11,14,.74) 100%);
      backdrop-filter:blur(26px); -webkit-backdrop-filter:blur(26px);
      border:1px solid rgba(255,255,255,.16); border-radius:${isStory ? 32 : 26}px;
      padding:${isStory ? '28px 38px 30px' : '22px 30px 24px'};
      box-shadow:0 28px 70px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.16); }
    /* El ancho deja aire a la derecha a propósito: con el texto llegando justo al borde
       de la tarjeta, la última palabra "se lee" cortada (y el QA visual la reportaba
       como texto mutilado sin estarlo). */
    .pname { font-size:${isStory ? 24 : 20}px; font-weight:700; letter-spacing:2.6px; text-transform:uppercase;
      color:rgba(255,255,255,.66); margin-bottom:${isStory ? 16 : 12}px; max-width:${isStory ? 580 : 470}px;
      line-height:1.28; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .prow { display:flex; align-items:center; gap:16px; margin-bottom:${isStory ? 8 : 6}px; }
    .plbl { font-size:${isStory ? 20 : 18}px; font-weight:800; letter-spacing:4px; color:#FF8B4D;
      text-transform:uppercase; margin-bottom:${isStory ? 8 : 6}px; }
    .antes { font-family:'Anton',sans-serif; font-size:${isStory ? 46 : 40}px; color:rgba(255,255,255,.6);
      text-decoration:line-through; text-decoration-thickness:3px; line-height:1; }
    .off { background:linear-gradient(135deg, #FF6B1A 0%, ${accent} 100%); color:#fff; font-weight:800;
      font-size:${isStory ? 23 : 20}px; padding:7px 17px; border-radius:100px; letter-spacing:1px;
      box-shadow:0 6px 18px rgba(232,93,27,.45); }
    .now { font-family:'Anton',sans-serif; font-size:${isStory ? 112 : 96}px; color:#fff; line-height:.9;
      letter-spacing:-1px; text-shadow:0 4px 24px rgba(0,0,0,.45); }
    .transfer { display:flex; align-items:center; gap:10px; margin-top:${isStory ? 20 : 15}px;
      padding-top:${isStory ? 18 : 14}px; border-top:1px solid rgba(255,255,255,.15);
      font-size:${isStory ? 22 : 19}px; font-weight:600; letter-spacing:.6px; color:rgba(255,255,255,.9); }

    .cta-head { font-family:'Anton',sans-serif; font-size:${isStory ? 68 : 58}px; color:#fff; line-height:.95;
      letter-spacing:-.5px; margin-bottom:${isStory ? 18 : 14}px; }
    .cta-benefit { display:flex; align-items:center; gap:12px; font-size:${isStory ? 26 : 23}px; font-weight:600;
      color:rgba(255,255,255,.95); margin-top:9px; }

    .coupon { display:inline-flex; align-items:center; gap:14px; padding:14px 24px;
      background:rgba(255,255,255,.96); border-radius:14px; box-shadow:0 12px 35px rgba(0,0,0,.5); border:1px solid rgba(0,0,0,.08); }
    .cpn-lbl { font-size:${isStory ? 22 : 19}px; font-weight:800; letter-spacing:3px; color:#6b6b70;
      text-transform:uppercase; padding-right:14px; border-right:2px dashed #c9c9cf; }
    .cpn-code { font-family:'Anton',sans-serif; font-size:${isStory ? 48 : 42}px; letter-spacing:2px; color:#141416; }

    .interaction { background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.5);
      backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
      padding:${isStory ? '17px 34px' : '13px 27px'}; border-radius:100px; font-size:${isStory ? 27 : 22}px;
      font-weight:700; color:#fff; white-space:nowrap; box-shadow:0 12px 30px rgba(0,0,0,.4); }
    .ctapill { display:inline-flex; align-items:center; gap:${isStory ? 14 : 11}px;
      background:linear-gradient(135deg, #FF6B1A 0%, #C1440C 100%); border:1px solid rgba(255,255,255,.3);
      padding:${isStory ? '19px 38px' : '14px 29px'}; border-radius:100px; font-size:${isStory ? 28 : 22}px;
      font-weight:800; letter-spacing:.4px; color:#fff; white-space:nowrap;
      box-shadow:0 16px 36px rgba(232,93,27,.5), inset 0 1px 0 rgba(255,255,255,.3); }

    .tick { width:13px; height:13px; background:${accent}; border-radius:3px; box-shadow:0 0 12px ${accent}; flex:0 0 auto; }
    .site { font-size:${isStory ? 25 : 22}px; font-weight:700; letter-spacing:3px; color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
    <div class="canvas">
      ${hasCover ? (
    // Escena IA (bgImageUrl) o foto real marcada cover → a sangre + scrim.
    // Foto real de catálogo → fondo desenfocado + tarjeta de estudio DENTRO de la columna.
    fullBleedCover
      ? `<img src="${esc(bgImageUrl || productImageUrl)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;"/><div class="scrim"></div>`
      : `<img class="bg" src="${esc(productImageUrl)}" alt=""/><div class="scrim"></div>`
  ) : '<div class="glow"></div>'}
      <div class="stack">
        <div class="zone-top">${brandHtml}${badgeHtml}</div>
        <div class="zone-chips">${topChipsHtml}</div>
        <div class="zone-hero">${heroZoneHtml}</div>
        <div class="zone-body">${bodyHtml}</div>
        <div class="zone-cta">${ctaZoneHtml}</div>
        <div class="zone-foot"><span class="tick"></span><span class="site">${esc(site)}</span></div>
      </div>
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: !hero.fullBleed, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
  // El aire que necesita el bloque de abajo depende de lo que lleve: con precio son
  // ~400px (kicker + tachado/% + precio gigante + nota de transferencia); sin precio,
  // sólo el titular. Antes el hueco era fijo y el texto terminaba MONTADO sobre la
  // tarjeta de la foto (defecto real: el titular naranja ilegible sobre el pantalón).
  const heroBottom = opts.price
    ? (g.isStory ? 830 : 570)
    : (g.isStory ? 630 : 400);
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 350 : 230, bottom: heroBottom, left: g.padX, right: g.padX },
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
    ${transfer ? `<div style="font-size:${g.isStory ? 22 : 19}px; font-weight:600; letter-spacing:.6px; color:rgba(255,255,255,.92); margin-top:18px; max-width:${g.w - g.padX * 2}px; display:flex; align-items:center; gap:10px;">${boltSvg('#FF8B4D', g.isStory ? 26 : 23)}<span>${esc(transfer)}</span></div>` : ''}`
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
          ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: false, heightPx: logoHeightPx(g.isStory), maxWidthPx: logoMaxWidthPx(logoHeightPx(g.isStory)) }) : ''}
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
        ${opts.showBrand !== false ? brandMarkHtml(opts.logos, { dark: true, heightPx: logoHeightPx(g.isStory), maxWidthPx: logoMaxWidthPx(logoHeightPx(g.isStory)) }) : ''}
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
 * Fila de CHIPS con los datos reales del producto (ficha técnica). Un chip por dato,
 * con tilde vectorial y vidrio oscuro (legible sobre cualquier foto, incluido un fondo
 * de estudio blanco). Reemplaza a la "cinta" anterior —los tres datos metidos en una
 * sola cápsula que cruzaba la pieza de lado a lado y quedaba pegada a la foto—, que era
 * parte del "está todo muy amontonado". Fuente única para todas las plantillas.
 */
function specChipsHtml(points, g, { marginBottom = 0 } = {}) {
  const list = (points || []).filter(Boolean).slice(0, 3);
  if (!list.length) return '';
  const chip = (p) => `<span style="display:inline-flex; align-items:center; gap:${g.isStory ? 11 : 9}px;
    background:rgba(10,11,14,.5); border:1px solid rgba(255,255,255,.2);
    backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    /* El padding derecho es más generoso que el izquierdo a propósito: la cápsula cierra
       en curva y, con el texto justo contra el borde, la última letra se lee cortada. */
    border-radius:100px; padding:${g.isStory ? '13px 34px 13px 22px' : '10px 27px 10px 18px'};
    font-size:${g.isStory ? 26 : 22}px; font-weight:600; letter-spacing:.2px; color:#fff;
    box-shadow:0 8px 22px rgba(0,0,0,.35);">${checkSvg('#FF8B4D', g.isStory ? 22 : 19)}${esc(p)}</span>`;
  return `<div style="display:flex; flex-wrap:wrap; gap:${g.isStory ? 14 : 11}px; margin-bottom:${marginBottom}px;">${list.map(chip).join('')}</div>`;
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
  // Igual que en promo: el hueco de abajo se calcula según lo que lleva el bloque
  // (chips + titular de hasta 2 líneas + botón), si no la fila de datos terminaba
  // pegada al borde inferior de la tarjeta de la foto.
  const mayoBottom = (points.length ? (g.isStory ? 120 : 90) : 0) + (g.isStory ? 700 : 480);
  const hero = heroPhotoHtml({
    bgImageUrl: opts.bgImageUrl,
    productImageUrl: opts.productImageUrl,
    box: { top: g.isStory ? 350 : 230, bottom: mayoBottom, left: g.padX, right: g.padX },
    shadow: 'rgba(0,0,0,.65)',
    darkBg: true,
  });
  const pointsLine = specChipsHtml(points, g, { marginBottom: g.isStory ? 26 : 20 });

  return `${shellOpen}
      ${hero.html}
      ${hero.fullBleed ? scrimHtml({ dark: true }) : ''}${chrome}
      <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${g.footBottom}px; z-index:4;">
        ${pointsLine}
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 78 : 64}px; line-height:.96; text-transform:uppercase; color:#fff; max-width:94%; text-shadow:0 4px 25px rgba(0,0,0,.8); letter-spacing:.5px;">${esc(opts.overlayTitle)}</div>` : ''}
        <div style="margin-top:${g.isStory ? 40 : 30}px;">${ctaBtn}</div>
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
  const tags = extractSpecTags(opts.productDescription, 3, { productName: opts.overlayTitle });
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
    // Historia: la foto va de la mitad hasta ARRIBA del dominio (antes llegaba al borde
    // inferior y el dominio quedaba encima de la foto, ilegible — bug jul-2026).
    : `position:absolute; left:0; right:0; top:${splitAt}px; bottom:${g.footBottom}px;`;
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
      <div style="${colorAreaStyle} background:linear-gradient(160deg, #111113 0%, #1c1c1e 100%); z-index:2; display:flex; flex-direction:column; justify-content:center;
        padding:${g.isStory ? `${g.wmTop + logoHeightPx(true) + 34}px ${g.padX}px ${g.padX}px` : `${g.padX}px`};">
        <div style="width:64px; height:6px; background:${accent}; margin-bottom:24px; border-radius:3px;"></div>
        ${opts.overlayTitle ? `<div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 58 : 50}px; line-height:1.0; text-transform:uppercase; color:#fff;">${esc(opts.overlayTitle)}</div>` : ''}
        ${opts.price ? `<div style="margin-top:22px;">
          ${hasPromo ? `<div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;"><span style="font-family:'Anton',sans-serif; font-size:28px; color:rgba(255,255,255,.5); text-decoration:line-through;">$${formatPrice(opts.price)}</span><span style="background:${accent}; color:#fff; font-weight:800; font-size:15px; padding:5px 12px; border-radius:100px;">-${off}%</span></div>` : ''}
          <div style="font-family:'Anton',sans-serif; font-size:${g.isStory ? 68 : 58}px; color:#fff;">$${formatPrice(now)}</div>
        </div>` : ''}
        ${couponTag(opts.couponCode, { isStory: g.isStory })}
      </div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
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
  const hasImg = Boolean(img);
  const points = Array.isArray(opts.storyPoints) ? opts.storyPoints.filter(Boolean).slice(0, 3) : [];
  // Sin foto: checklist con datos reales debajo del titular (portada editorial con
  // contenido útil en vez de aire muerto). Con foto, la foto llena el espacio.
  const pointsHtml = !hasImg && points.length
    ? `<div style="margin-top:${g.isStory ? 48 : 34}px; max-width:${g.isStory ? '92%' : '80%'};">${pointsChecklistHtml(points, g, accent)}</div>`
    : '';

  // CON foto: layout editorial PARTIDO — texto a la izquierda, foto GRANDE a la derecha
  // que llena de arriba a abajo (antes la foto iba chiquita abajo-derecha y dejaba un
  // hueco negro enorme en el medio — el "mucho vacío" que reportó el dueño, jul-2026).
  const imgW = Math.round(g.w * (g.isStory ? 0.48 : 0.44));
  const imgLeft = g.w - g.padX - imgW;
  const textW = hasImg ? (imgLeft - g.padX - 40) : (g.w - g.padX * 2);
  const titleFont = hasImg ? (g.isStory ? 72 : 56) : (g.isStory ? 108 : 88);
  const imgBlock = hasImg
    ? `<div style="position:absolute; top:${g.wmTop + (g.isStory ? 170 : 130)}px; bottom:${g.footBottom}px; right:${g.padX}px; width:${imgW}px; border-radius:22px; overflow:hidden; box-shadow:0 30px 70px rgba(0,0,0,.55); border:2px solid rgba(255,255,255,.14); z-index:2;">
        <img src="${esc(img)}" style="width:100%; height:100%; object-fit:cover;"/>
      </div>`
    : '';

  return `${headHtml(g.w, g.h)}</head><body>
    <div style="position:relative; width:${g.w}px; height:${g.h}px; color:#fff; overflow:hidden; background:#0d0d0f;">
      <div style="position:absolute; top:-10%; left:-10%; width:120%; height:60%; background:radial-gradient(ellipse at 30% 20%, rgba(232,93,27,.16) 0%, rgba(0,0,0,0) 65%); z-index:0;"></div>
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: false, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
      <div style="position:absolute; top:${g.wmTop}px; right:${g.padX}px; font-size:${g.isStory ? 20 : 18}px; font-weight:700; letter-spacing:3px; color:rgba(255,255,255,.55); z-index:4;">${esc((config.brand.instagram || '').toUpperCase())}</div>
      ${imgBlock}
      <div style="position:absolute; top:${g.isStory ? 300 : 200}px; left:${g.padX}px; width:${textW}px; z-index:3;">
        <div style="font-size:${g.isStory ? 22 : 20}px; font-weight:800; letter-spacing:4px; color:${accent}; text-transform:uppercase; margin-bottom:18px;">${esc(opts.kicker || 'BLACKS INDUMENTARIA')}</div>
        <div style="font-family:'Anton',sans-serif; font-size:${titleFont}px; line-height:.94; letter-spacing:-.5px; text-transform:uppercase; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,.6);">${esc(opts.overlayTitle || '')}</div>
        ${opts.bodyText ? `<div style="font-size:${g.isStory ? 30 : 26}px; font-weight:500; line-height:1.4; color:rgba(255,255,255,.8); margin-top:26px; max-width:100%;">${esc(opts.bodyText)}</div>` : ''}
        ${pointsHtml}
      </div>
      ${domainHtml(g, { accent })}
    </div>
  </body></html>`;
}

/** STACKEDCARDS: bento de 3 tarjetas (foto/headline + highlight + dato de marca) — moderno, bueno para mayorista. */
function buildStackedcardsHtml(opts) {
  const g = sharedGeometry(opts.format);
  const accent = opts.accent || config.brand.colors.darkOrange;
  // Debajo de la marca + el titular (que ahora va en su propia línea, no al lado del logo).
  const top = g.wmTop + logoHeightPx(g.isStory) + (opts.overlayTitle && opts.productImageUrl ? (g.isStory ? 130 : 110) : 40);
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(g.isStory), top: g.wmTop, left: g.padX })}
      <!-- El titular va DEBAJO de la marca, no a su derecha: el logo horizontal ocupa
           casi 400px y el título se le montaba encima (defecto real, jul-2026). -->
      ${opts.overlayTitle && opts.productImageUrl ? `<div style="position:absolute; top:${g.wmTop + logoHeightPx(g.isStory) + 22}px; left:${g.padX}px; right:${g.padX}px; font-family:'Anton',sans-serif; font-size:${g.isStory ? 36 : 30}px; line-height:1.02; text-transform:uppercase; color:#111113; z-index:2;">${esc(opts.overlayTitle)}</div>` : ''}
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
  const areaTop = g.wmTop + logoHeightPx(true) + (opts.overlayTitle ? 110 : 40);
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
      ${cornerBrand(opts.logos, { showBrand: opts.showBrand, dark: true, heightPx: logoHeightPx(true), top: g.wmTop, left: g.padX })}
      <!-- Titular DEBAJO de la marca (el logo horizontal es ancho y se lo comía). -->
      ${opts.overlayTitle ? `<div style="position:absolute; top:${g.wmTop + logoHeightPx(true) + 20}px; left:${g.padX}px; right:${g.padX}px; font-family:'Anton',sans-serif; font-size:34px; line-height:1.02; text-transform:uppercase; color:#111113; z-index:4;">${esc(opts.overlayTitle)}</div>` : ''}
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

module.exports = { renderPostImage, renderPostBuffer, buildHtml, DIMS, TEMPLATES, TEMPLATE_INFO, TEMPLATE_REQUIREMENTS, extractSpecTags, stripEmoji, fixSpelling };
