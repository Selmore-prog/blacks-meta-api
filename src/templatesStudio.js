/* =========================================================================
 * ESTUDIO BLACKS — el sistema visual de las piezas del calendario.
 *
 * POR QUÉ UN SISTEMA Y NO MÁS PLANTILLAS (sep-2026)
 * El generador tenía ~35 plantillas con tipografías, márgenes y paletas propias.
 * Cada pieza salía distinta de la anterior, pero no por diseño: por azar. Visto en
 * el perfil, el feed no tenía una estética; visto de cerca, cada plantilla tenía su
 * falla (texto tapado por la prenda, la foto metida en una tarjeta blanca, pozos
 * negros cuando no había foto). Y cuando Gemini no generaba la escena, todas caían
 * al peor caso: la foto de catálogo chica, dentro de un rectángulo.
 *
 * Esto es UN sistema con pocas composiciones que comparten todo lo demás:
 *   - la foto REAL del catálogo usada como fotografía: el fondo del estudio se
 *     extiende al lienzo entero (src/photoStage.js lo mide), la prenda se agranda
 *     hasta llenar su zona y los lados por donde la foto viene cortada salen por el
 *     borde del cuadro. Sin tarjetas, sin rectángulos, sin vacíos;
 *   - una tipografía (Archivo condensada, titulares en mayúscula, bien acentuados)
 *     y el texto de apoyo en Inter, en oración: nunca todo en minúscula;
 *   - los mismos márgenes, el mismo naranja de marca, el mismo grano de foto.
 * La variedad sale de la COMPOSICIÓN (texto al costado, arriba, abajo, foto a
 * sangre, línea de productos, afiche) y no de cambiar de estética en cada pieza.
 *
 * Funciona igual con y sin IA: si hay una escena generada, va a sangre con el mismo
 * sistema tipográfico; si no hay crédito, la foto de estudio se pone en escena sola.
 * ========================================================================= */

const config = require('./config');
const { capitalizarOraciones, desdeMayusculas } = require('./textUtils');

const BRAND = config.brand.colors;
const INK = '#111112';
const PAPER = '#EEECE8'; // el gris cálido de las fotos del catálogo: el tono de la casa
const ACCENT = BRAND.darkOrange || '#C1440C';
const ACCENT_ON_DARK = '#FF7A3D';

const NAMES = [
  'estudio_lado',
  'estudio_arriba',
  'estudio_abajo',
  'estudio_escena',
  'estudio_linea',
  'estudio_titular',
];

const INFO = {
  estudio_lado: 'Estudio: la prenda real grande a un costado, sobre el fondo del estudio extendido a todo el cuadro, y el texto en columna del otro lado. La mejor para prendas altas (pantalones, conjuntos de cuerpo entero).',
  estudio_arriba: 'Estudio: titular arriba y la prenda real grande abajo, saliendo por el borde si viene cortada. Para calzado, accesorios y prendas anchas.',
  estudio_abajo: 'Estudio: la prenda real grande arriba (sale por el borde superior si la foto viene cortada) y el texto abajo. Para torsos y prendas de arriba.',
  estudio_escena: 'Foto a sangre (escena generada o foto de ambiente) con el texto encima. La más editorial.',
  estudio_linea: 'Línea de 2 a 4 fotos reales una al lado de la otra sobre el mismo fondo de estudio (colores de un modelo, un pack o un conjunto) y titular. Para mostrar variedad.',
  estudio_titular: 'Afiche tipográfico de marca: titular grande en mayúscula, datos y, si hay, una fila de productos reales abajo. Para preguntas, avisos, consejos y piezas sin un producto único.',
};

const REQUIREMENTS = {
  estudio_lado: { minImages: 1 },
  estudio_arriba: { minImages: 1 },
  estudio_abajo: { minImages: 1 },
  estudio_escena: { minImages: 1 },
  estudio_linea: { minImages: 2 },
};

const isStudio = (template) => NAMES.includes(template);

/* ----------------------------------------------------------- utilidades -- */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (value) => String(value || '').replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').trim();
const px = (n) => `${Math.round(n)}px`;

/* ACENTOS DE LOS NOMBRES DEL CATÁLOGO. Los productos se cargaron sin tildes
   ("Pantalon Cargo", "Algodon", "Clasico") y en mayúscula la falta se nota más:
   "PANTALON" parece un error de tipeo en una pieza de marca. Sólo palabras del
   rubro, con la forma exacta: nunca se toca una palabra que no está en la lista. */
const TILDES = {
  pantalon: 'pantalón', algodon: 'algodón', clasico: 'clásico', clasica: 'clásica', clasicos: 'clásicos',
  clasicas: 'clásicas', termica: 'térmica', termico: 'térmico', termicas: 'térmicas', termicos: 'térmicos',
  poliester: 'poliéster', nautico: 'náutico', tecnico: 'técnico', tecnica: 'técnica', electrico: 'eléctrico',
  dielectrico: 'dieléctrico', ignifugo: 'ignífugo', ignifuga: 'ignífuga', antiestatico: 'antiestático',
  antiestatica: 'antiestática', bebe: 'bebé', ninos: 'niños', ninas: 'niñas', camion: 'camión',
  proteccion: 'protección', edicion: 'edición', coleccion: 'colección', ultima: 'última', ultimas: 'últimas',
  ultimos: 'últimos', unica: 'única', unico: 'único', rapido: 'rápido', rapida: 'rápida', practico: 'práctico',
  practica: 'práctica', comodo: 'cómodo', comoda: 'cómoda', comodos: 'cómodos', comodas: 'cómodas',
  lenador: 'leñador', ombu: 'ombú', boton: 'botón', razon: 'razón', estacion: 'estación', otono: 'otoño',
  energia: 'energía', dia: 'día', dias: 'días', mas: 'más', tambien: 'también', ademas: 'además',
  facil: 'fácil', util: 'útil', utiles: 'útiles', maximo: 'máximo', maxima: 'máxima', minimo: 'mínimo',
  minima: 'mínima', calzon: 'calzón', cinturon: 'cinturón', sueter: 'suéter', pique: 'piqué',
  micropique: 'micropiqué', friza: 'frisa', jardin: 'jardín', telefono: 'teléfono', mecanico: 'mecánico',
  electrica: 'eléctrica', quimico: 'químico', quimica: 'química', acida: 'ácida', vision: 'visión',
  hercules: 'hércules', lenadores: 'leñadores', petroleo: 'petróleo', metalurgico: 'metalúrgico',
  botin: 'botín', botines: 'botines', borcegui: 'borceguí', borceguis: 'borceguíes', cafe: 'café',
  jean: 'jean', nautica: 'náutica', antidesgarro: 'antidesgarro', lampara: 'lámpara', linea: 'línea', lineas: 'líneas',
};

function conTildes(text) {
  return String(text || '').replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, (word) => {
    const fixed = TILDES[word.toLowerCase()];
    if (!fixed || fixed === word.toLowerCase()) return word;
    if (word === word.toUpperCase() && word.length > 1) return fixed.toUpperCase();
    if (word[0] === word[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
    return fixed;
  });
}

/** En oración: primera letra en mayúscula y el resto en minúscula, salvo marcas y
    siglas. Las fichas del catálogo vienen "Suela Antideslizante", "Calzado
    Dieléctrico": capitalizado como título en el medio de una lista se lee raro. */
function oracion(text) {
  const t = conTildes(clean(text)).replace(/[.;:,\s]+$/, '');
  if (!t) return '';
  // Las marcas de varias palabras cuentan por cada palabra ("Grafa 70" → "Grafa").
  const marcas = new Set([...MARCAS, 'BLACKS', 'Ripstop', 'IRAM', 'Cordura', 'Lycra', 'Kevlar', 'WhatsApp', 'Instagram', 'Buenos', 'Aires']
    .flatMap((m) => m.toLowerCase().split(/\s+/)));
  const base = t === t.toUpperCase() && t.length > 6 ? t.toLowerCase() : t;
  /* Sólo se baja a minúscula un texto ESCRITO COMO TÍTULO ("Suela Antideslizante",
     "Calzado Dieléctrico": así vienen las fichas del catálogo). Una oración normal con
     nombres propios queda como vino: el 29-sep "…las marcas Pampero, Ombú y Grafa 70"
     salía "grafa 70", y "la ciudad de Buenos Aires", "buenos aires". */
  const largas = base.split(/\s+/).filter((w) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(w));
  const esTitulo = largas.length >= 2 && largas.filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).length / largas.length >= 0.6;
  if (!esTitulo) return capitalizarOraciones(base);
  const out = base.split(/(\s+)/).map((w, i) => {
    if (i === 0 || /^\s+$/.test(w)) return w;
    if (w.length > 1 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)) return w; // sigla: IRAM, UV, EPP
    if (marcas.has(w.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, ''))) return w;
    if (/^[YOEUA]$/.test(w)) return w.toLowerCase(); // "Suela Antideslizante Y Resistente"
    if (/^.[^A-ZÁÉÍÓÚÑ]*[A-ZÁÉÍÓÚÑ]/.test(w)) return w; // mayúscula adentro: WhatsApp
    return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(w) ? w.toLowerCase() : w;
  }).join('');
  // Al final, mayúscula en el arranque de cada oración (incluido el de la frase).
  return capitalizarOraciones(out);
}

const MARCAS = ['Pampero', 'Ombú', 'Grafa 70', 'Gurre', 'Hawaianas', 'Libus', 'Rueda', 'Funcional'];
function marcaDe(text) {
  const s = conTildes(String(text || '')).toLowerCase();
  return MARCAS.find((m) => s.includes(m.toLowerCase())) || null;
}

const palabras = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

const CONECTORES = new Set(['de', 'del', 'con', 'sin', 'para', 'y', 'e', 'o', 'a', 'en', 'la', 'el', 'los', 'las']);
const RELLENO = /^(original|originales|importad[oa]s?|nuev[oa]s?|oferta|liquidaci[oó]n|unisex|hombre|mujer|dama|caballero)$/i;

/**
 * El nombre de la prenda, corto y bien escrito, para el titular: los nombres del
 * catálogo están pensados para el buscador ("Pantalon Cargo Ripstop Antidesgarro
 * Pampero", "Borceguí Leñador Pampero Art.5909"), no para una pieza. Se saca la
 * marca (va en la volanta), los códigos, el relleno y la cola descriptiva.
 */
function nombreCorto(nombre) {
  let s = conTildes(clean(nombre)).replace(/\(.*?\)/g, ' ').replace(/\bart\.?\s*\d+\b/gi, ' ');
  MARCAS.forEach((m) => { s = s.replace(new RegExp(`\\b${m.replace(/\s+/g, '\\s*')}\\b`, 'gi'), ' '); });
  s = s.replace(/\bblacks\b/gi, ' ');
  let w = s.split(/\s+/).filter(Boolean).filter((x) => !RELLENO.test(x) && !/^\d{3,}$/.test(x));
  if (/^pantalones?$/i.test(w[0] || '') && /^jeans?$/i.test(w[1] || '')) w = w.slice(1);
  if (/^zapatos?$/i.test(w[0] || '') && /^(bot[ií]n|botines|borcegu[ií]|zapatillas?)$/i.test(w[1] || '')) w = w.slice(1);
  // Se corta en la primera cola descriptiva ("con puntera…", "para trabajo…").
  const corte = w.findIndex((x, i) => i >= 2 && /^(con|para|ideal|tipo)$/i.test(x));
  if (corte > 0) w = w.slice(0, corte);
  const max = w.join(' ').length > 26 ? 3 : 4;
  w = w.slice(0, max);
  while (w.length > 1 && CONECTORES.has(w[w.length - 1].toLowerCase())) w.pop();
  return w.map((x, i) => {
    if (/^x\d$/i.test(x)) return x.toLowerCase();
    if (i > 0 && CONECTORES.has(x.toLowerCase())) return x.toLowerCase();
    if (x === x.toUpperCase() && x.length > 3) return x[0] + x.slice(1).toLowerCase();
    return x[0].toUpperCase() + x.slice(1);
  }).join(' ');
}

/**
 * EL TITULAR Y LA BAJADA. Con producto hay dos textos que compiten: el gancho del
 * copy ("Abrigo sin volumen") y el nombre corto de la prenda ("Campera Trucker
 * Térmica"). Si el gancho es corto, es el titular y el nombre va abajo, para que se
 * sepa QUÉ es; si el gancho es una frase larga, manda el nombre y la frase baja.
 * Un titular de más de ~6 palabras en mayúscula se lee como un grito.
 */
function titulares(opts) {
  const corto = conTildes(clean(opts.displayTitle));
  const gancho = conTildes(clean(opts.overlayTitle || opts.title)).replace(/[.]+$/, '');
  let titulo;
  let bajada = clean(opts.deck);
  if (opts.hasProduct && corto) {
    const ganchoCorto = gancho && palabras(gancho) <= 5 && gancho.length <= 34 && !/[?¿]/.test(gancho);
    if (ganchoCorto && gancho.toLowerCase() !== corto.toLowerCase()) {
      titulo = gancho;
      if (!bajada || bajada.toLowerCase() === gancho.toLowerCase()) bajada = corto;
    } else {
      titulo = corto;
      if (gancho && gancho.toLowerCase() !== corto.toLowerCase() && !bajada) bajada = gancho;
    }
  } else {
    titulo = gancho || corto;
  }
  if (bajada && titulo && bajada.toLowerCase() === titulo.toLowerCase()) bajada = '';
  // El nombre de la prenda se deja como nombre ("Campera Trucker Térmica"); una frase
  // va en oración.
  const esNombre = bajada && corto && bajada.toLowerCase() === corto.toLowerCase();
  return { titulo: desdeMayusculas(titulo.replace(/[.]+$/, '')), bajada: bajada ? (esNombre ? corto : oracion(bajada)) : '' };
}

function volanta(opts) {
  if (opts.badgeText) return clean(opts.badgeText);
  const k = clean(opts.kicker);
  // "DESTACADO" no dice nada: la marca de la prenda dice más.
  if (k && !/^destacado$/i.test(k)) return k;
  return marcaDe(opts.productName || opts.displayTitle || opts.overlayTitle) || '';
}

function precios(opts) {
  const regular = Number(opts.price);
  const promo = Number(opts.promoPrice);
  const ok = (v) => Number.isFinite(v) && v > 0;
  if (!ok(regular) && !ok(promo)) return null;
  const hay = ok(regular) && ok(promo) && promo < regular;
  const final = hay ? promo : ok(regular) ? regular : promo;
  const money = (v) => `$${Math.round(v).toLocaleString('es-AR')}`;
  return { final: money(final), antes: hay ? money(regular) : null, off: hay ? Math.round((1 - promo / regular) * 100) : null };
}

/* ------------------------------------------------------------- geometría -- */

function geometry(format) {
  const story = format === 'story';
  const W = 1080;
  const H = story ? 1920 : 1350;
  return {
    story, W, H,
    m: 72, // margen de texto
    // Zonas seguras de Instagram: en historias arriba va la barra y el usuario,
    // abajo el "Enviá mensaje". La FOTO puede pasar por ahí; el texto no.
    top: story ? 250 : 72,
    bottom: story ? 330 : 72,
  };
}

function llenaCuadro(analysis) {
  if (!analysis) return false;
  const t = analysis.touches || {};
  const ancho = analysis.bbox.x1 - analysis.bbox.x0;
  const lados = ['top', 'bottom', 'left', 'right'].filter((k) => t[k]).length;
  return Boolean((t.left && t.right) || lados >= 3 || (t.top && t.bottom && ancho > 0.62));
}

/**
 * Qué composiciones sostiene esta foto. Una foto cortada por arriba no puede ir
 * con el titular arriba (la línea del corte quedaría flotando a la vista); una que
 * llena el cuadro no tiene fondo de estudio que extender y va fundida a sangre.
 */
function composiciones(analysis, format) {
  if (!analysis || !analysis.studio || llenaCuadro(analysis)) return ['estudio_escena'];
  const t = analysis.touches || {};
  const b = analysis.bbox;
  const aspecto = ((b.x1 - b.x0) * analysis.aspect) / (b.y1 - b.y0); // ancho/alto real de la prenda
  const story = format === 'story';
  if (t.top && t.bottom) return ['estudio_lado'];
  const out = [];
  if (aspecto < 0.62 && !story) out.push('estudio_lado');
  if (!t.bottom) out.push('estudio_abajo');
  if (!t.top) out.push('estudio_arriba');
  if (!out.includes('estudio_lado') && aspecto <= 1.15 && !story) out.push('estudio_lado');
  return out.length ? out : ['estudio_escena'];
}

function resolverComposicion(template, analysis, format) {
  if (template === 'estudio_titular' || template === 'estudio_linea') return template;
  const validas = composiciones(analysis, format);
  return validas.includes(template) ? template : validas[0];
}

/**
 * Pone una foto de estudio "en escena": calcula el tamaño y la posición para que
 * la PRENDA (no la foto) llene la zona, apoyando en el borde del lienzo los lados
 * por donde viene cortada. Devuelve la caja de la foto y cuánto desvanecer cada
 * borde (sólo los que quedan adentro del cuadro, y sin comerse la prenda).
 * `lienzo` es el rectángulo que cuenta como "borde": el cuadro entero o una columna.
 */
function escenificar(analysis, zona, lienzo, { preferir = 'centro', anchoFoto = null, alinear = null, recorte = 0 } = {}) {
  const b = analysis.bbox;
  const t = analysis.touches || {};
  const asp = analysis.aspect;
  const aire = (n) => Math.round(n * 0.035);
  const pad = {
    l: t.left ? 0 : aire(zona.w),
    r: t.right ? 0 : aire(zona.w),
    t: t.top ? 0 : aire(zona.h),
    b: t.bottom ? 0 : aire(zona.h),
  };
  const sw = b.x1 - b.x0;
  const sh = b.y1 - b.y0;
  let fw = anchoFoto;
  if (!fw) {
    const porAncho = (zona.w - pad.l - pad.r) / sw;
    const porAlto = ((zona.h - pad.t - pad.b) * asp) / sh;
    fw = Math.min(porAncho, porAlto);
    /* Encuadre ajustado: una foto que YA viene cortada (un torso, unas piernas) admite
       perder un poco de los costados, como cualquier recorte de moda, antes que quedar
       chica con aire arriba. Una prenda entera (un botín) nunca se recorta. */
    if (recorte > 0 && (t.top || t.bottom) && porAlto > porAncho) fw = Math.min(porAlto, porAncho / (1 - recorte));
  }
  // Sin agrandar de más: la original de Tiendanube tiene 2000 px de ancho. El tope no
  // puede depender sólo del lienzo: en una celda de 360 px dejaba la prenda chica.
  fw = Math.min(fw, Math.max(lienzo.w * 2.6, 1800));
  const fh = fw / asp;
  const subW = sw * fw;
  const subH = sh * fh;
  let sy;
  if (t.top) sy = zona.y;
  else if (t.bottom || alinear === 'abajo') sy = zona.y + zona.h - pad.b - subH;
  else sy = zona.y + pad.t + (zona.h - pad.t - pad.b - subH) / 2;
  let sx;
  if (t.left) sx = zona.x;
  else if (t.right) sx = zona.x + zona.w - subW;
  else if (preferir === 'derecha') sx = zona.x + zona.w - pad.r - subW;
  else if (preferir === 'izquierda') sx = zona.x + pad.l;
  else sx = zona.x + pad.l + (zona.w - pad.l - pad.r - subW) / 2;
  const box = { x: sx - b.x0 * fw, y: sy - b.y0 * fh, w: fw, h: fh };
  // Si la prenda toca un borde de la foto, ese borde de la foto tiene que caer en el
  // borde del lienzo (o afuera): si no, la línea del corte queda flotando.
  if (t.top && box.y > lienzo.y + 0.5) box.y = lienzo.y - b.y0 * fh;
  if (t.bottom && box.y + box.h < lienzo.y + lienzo.h - 0.5) box.y = lienzo.y + lienzo.h - box.h;
  if (t.left && box.x > lienzo.x + 0.5) box.x = lienzo.x;
  if (t.right && box.x + box.w < lienzo.x + lienzo.w - 0.5) box.x = lienzo.x + lienzo.w - box.w;
  const margen = { l: b.x0 * fw, r: (1 - b.x1) * fw, t: b.y0 * fh, b: (1 - b.y1) * fh };
  const adentro = {
    l: box.x > lienzo.x + 1, r: box.x + box.w < lienzo.x + lienzo.w - 1,
    t: box.y > lienzo.y + 1, b: box.y + box.h < lienzo.y + lienzo.h - 1,
  };
  const feather = {
    l: adentro.l ? Math.max(0, Math.min(90, margen.l * 0.85)) : 0,
    r: adentro.r ? Math.max(0, Math.min(90, margen.r * 0.85)) : 0,
    t: adentro.t ? Math.max(0, Math.min(90, margen.t * 0.85)) : 0,
    b: adentro.b ? Math.max(0, Math.min(90, margen.b * 0.85)) : 0,
  };
  return { box, feather, sujeto: { x: box.x + b.x0 * fw, y: box.y + b.y0 * fh, w: subW, h: subH } };
}

/** El fondo del estudio extendido: el degradado de la foto fila por fila, llevado a
    las coordenadas del lienzo. Arriba de la foto sigue la pared, abajo el piso. */
function fondoExtendido(analysis, box, alto) {
  if (!analysis || analysis.bgLum >= 246) return PAPER; // blanco puro: se lleva al gris de la casa
  const rows = analysis.rows || [];
  if (!rows.length) return analysis.bg || PAPER;
  const pct = (y) => Math.max(0, Math.min(100, (y / alto) * 100)).toFixed(2);
  const stops = [`${rows[0].color} 0%`];
  rows.forEach((r) => {
    const y = box.y + r.at * box.h;
    if (y >= 0 && y <= alto) stops.push(`${r.color} ${pct(y)}%`);
  });
  stops.push(`${rows[rows.length - 1].color} 100%`);
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

function mascara(feather, box) {
  const capas = [];
  const lin = (dir, size, total) => {
    const p = Math.min(49, (size / total) * 100);
    return `linear-gradient(${dir}, transparent 0%, #000 ${p.toFixed(2)}%)`;
  };
  if (feather.l > 2) capas.push(lin('90deg', feather.l, box.w));
  if (feather.r > 2) capas.push(lin('270deg', feather.r, box.w));
  if (feather.t > 2) capas.push(lin('180deg', feather.t, box.h));
  if (feather.b > 2) capas.push(lin('0deg', feather.b, box.h));
  if (!capas.length) return '';
  const v = capas.join(', ');
  return `-webkit-mask-image:${v};mask-image:${v};-webkit-mask-composite:source-in;mask-composite:intersect;`;
}

function fotoHtml(url, analysis, st) {
  const tinte = analysis && analysis.bgLum >= 246; // blanco puro → gris de la casa
  const b = st.box;
  return `<div class="photo${tinte ? ' tint' : ''}" style="left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)};${mascara(st.feather, b)}"><img src="${esc(url)}" alt=""/></div>`;
}

/* ---------------------------------------------------------------- bloques -- */

function bloqueTexto(opts, { oscuro = false, maxDatos = 3, alinear = 'left' } = {}) {
  const { titulo, bajada } = titulares(opts);
  const k = volanta(opts);
  const facts = (Array.isArray(opts.specs) && opts.specs.length ? opts.specs : opts.storyPoints) || [];
  const datos = [...new Set(facts.map(oracion).filter(Boolean))].filter((d) => d.toLowerCase() !== (bajada || '').toLowerCase()).slice(0, maxDatos);
  const p = precios(opts);
  const cta = clean(opts.interactionLabel || opts.ctaLabel || '');
  const partes = [];
  if (k) partes.push(`<div class="k"><i></i><span>${esc(conTildes(k))}</span></div>`);
  if (opts.stepNumber) partes.push(`<div class="step">${esc(opts.stepNumber)}</div>`);
  partes.push(`<h1>${esc(titulo).replace(/(^|\s)(\p{L}{1,2})\s+/gu, '$1$2&nbsp;')}</h1>`);
  if (bajada) partes.push(`<p class="deck">${esc(bajada)}</p>`);
  if (datos.length) partes.push(`<ul class="facts">${datos.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`);
  const pie = [];
  if (p) pie.push(`<div class="price">${p.off ? `<span class="off">-${p.off}%</span>` : ''}<strong>${esc(p.final)}</strong>${p.antes ? `<s>${esc(p.antes)}</s>` : ''}</div>`);
  if (opts.couponCode) pie.push(`<div class="coupon">Código <b>${esc(clean(opts.couponCode))}</b></div>`);
  if (cta) pie.push(`<div class="cta">${esc(oracion(cta))}<svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg></div>`);
  pie.push('<div class="site">blacksindumentaria.com.ar</div>');
  partes.push(`<footer class="pie">${pie.join('')}</footer>`);
  return `<section class="copy${oscuro ? ' dark' : ''}" data-align="${alinear}">${partes.join('')}</section>`;
}

function zonaHtml(texto, copy, { band = false } = {}) {
  const justify = texto.valign === 'end' ? 'flex-end' : texto.valign === 'center' ? 'center' : 'flex-start';
  return `<div class="zone"${band ? ` data-band="${Math.round(texto.h)}"` : ''} style="left:${px(texto.x)};top:${px(texto.y)};width:${px(texto.w)};height:${px(texto.h)};justify-content:${justify};">${copy}</div>`;
}

function estilos(G, { oscuro = false } = {}) {
  const ink = oscuro ? '#F4F2EE' : INK;
  const sub = oscuro ? 'rgba(244,242,238,.80)' : 'rgba(17,17,18,.72)';
  const line = oscuro ? 'rgba(244,242,238,.24)' : 'rgba(17,17,18,.16)';
  const acc = oscuro ? ACCENT_ON_DARK : ACCENT;
  const s = G.story;
  return `
  .canvas{position:relative;width:${G.W}px;height:${G.H}px;overflow:hidden;background:${PAPER};}
  .photo{position:absolute;overflow:hidden;}
  .photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;}
  .photo.tint::after{content:'';position:absolute;inset:0;background:${PAPER};mix-blend-mode:multiply;}
  .col{position:absolute;overflow:hidden;}
  .tile{position:absolute;overflow:hidden;}
  .cover{position:absolute;inset:0;}
  .cover img{width:100%;height:100%;object-fit:cover;display:block;}
  .scrim{position:absolute;left:0;right:0;pointer-events:none;}
  .grain{position:absolute;inset:0;pointer-events:none;opacity:${oscuro ? '.10' : '.07'};mix-blend-mode:${oscuro ? 'screen' : 'multiply'};
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");}
  .zone{position:absolute;display:flex;flex-direction:column;}
  .copy{position:relative;width:100%;display:flex;flex-direction:column;gap:${s ? 24 : 18}px;color:${ink};}
  .copy[data-align=center]{align-items:center;text-align:center;}
  .copy>*{flex-shrink:0;}
  .k{display:flex;align-items:center;gap:14px;font:700 ${s ? 24 : 20}px/1 Inter,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:${acc};}
  .k i{display:block;width:38px;height:5px;background:currentColor;}
  h1{font-family:'Archivo',Inter,sans-serif;font-stretch:72%;font-weight:800;text-transform:uppercase;
    font-size:${s ? 132 : 108}px;line-height:.9;letter-spacing:-.5px;margin:0;text-wrap:balance;overflow-wrap:normal;hyphens:none;}
  .deck{font:500 ${s ? 34 : 28}px/1.28 Inter,Arial,sans-serif;color:${sub};margin:0;text-wrap:pretty;max-width:24em;}
  .facts{list-style:none;margin:0;padding:0;border-top:1.5px solid ${line};width:100%;}
  .facts li{font:600 ${s ? 28 : 23}px/1.25 Inter,Arial,sans-serif;padding:${s ? 15 : 12}px 0;border-bottom:1.5px solid ${line};display:flex;gap:14px;align-items:baseline;}
  .facts li::before{content:'';flex:0 0 auto;width:10px;height:10px;background:${acc};transform:translateY(-3px);}
  .pie{display:flex;flex-wrap:wrap;align-items:center;gap:${s ? 20 : 14}px 22px;margin-top:${s ? 6 : 2}px;}
  .price{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;width:100%;}
  .price strong{font-family:'Archivo',Inter,sans-serif;font-stretch:66%;font-weight:900;font-size:${s ? 110 : 84}px;line-height:.9;letter-spacing:-.5px;}
  .price s{font:500 ${s ? 32 : 26}px/1 Inter,Arial,sans-serif;color:${sub};}
  .price .off{align-self:center;font:800 ${s ? 28 : 23}px/1 Inter,Arial,sans-serif;color:#fff;background:${ACCENT};padding:9px 13px 8px;}
  .coupon{font:600 ${s ? 25 : 21}px/1 Inter,Arial,sans-serif;border:2px dashed currentColor;padding:12px 16px;}
  .coupon b{font-weight:800;letter-spacing:.06em;}
  .cta{display:inline-flex;align-items:center;gap:12px;font:700 ${s ? 29 : 23}px/1 Inter,Arial,sans-serif;background:${oscuro ? '#F4F2EE' : INK};color:${oscuro ? INK : '#fff'};padding:${s ? '22px 28px' : '17px 22px'};}
  .cta svg{width:${s ? 28 : 23}px;height:${s ? 28 : 23}px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;}
  .site{font:500 ${s ? 21 : 18}px/1 Inter,Arial,sans-serif;color:${sub};letter-spacing:.02em;}
  .step{font-family:'Archivo',Inter,sans-serif;font-stretch:66%;font-weight:900;font-size:${s ? 190 : 160}px;line-height:.78;color:${acc};}
  .num{position:absolute;z-index:3;display:grid;place-items:center;width:${s ? 74 : 62}px;height:${s ? 74 : 62}px;background:${ACCENT};color:#fff;
    font-family:'Archivo',Inter,sans-serif;font-stretch:66%;font-weight:900;font-size:${s ? 50 : 42}px;line-height:1;}
  `;
}

function head(G, css) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:${G.W}px;height:${G.H}px;overflow:hidden;background:${PAPER};}${css}</style></head>`;
}

function pagina(G, { css, fondo, comp, template, capas }) {
  return `${head(G, css)}<body><main class="canvas" data-comp="${comp}" data-template="${esc(template)}" style="background:${fondo}">${capas}<div class="grain"></div></main></body></html>`;
}

/* ------------------------------------------------------------ composiciones -- */

/* Alto de la banda de texto: el que midió la primera pasada (opts.textBand) o una
   estimación. Con límites: ni tan chica que el titular no respire, ni tan grande que
   la prenda quede chica. */
function banda(opts, G, def) {
  const util = G.H - G.top - G.bottom;
  const min = util * 0.2;
  const max = util * (G.story ? 0.5 : 0.48);
  const pedido = Number(opts.textBand) > 0 ? Number(opts.textBand) : util * def;
  return Math.round(Math.max(min, Math.min(max, pedido)));
}

function buildEstudio(opts, G, f) {
  const a = f.analysis;
  const comp = resolverComposicion(opts.template, a, opts.format);
  if (comp === 'estudio_escena') return buildEscena({ ...opts, template: opts.template }, G, f);
  const t = a.touches || {};
  const lienzo = { x: 0, y: 0, w: G.W, h: G.H };
  let zona; let texto; let preferir = 'centro';
  if (comp === 'estudio_lado') {
    // Texto del lado que la prenda NO toca; si no toca ninguno, alterna por variante.
    const textoIzq = t.left ? false : t.right ? true : !/derecha/.test(opts.variant || '');
    const colW = Math.round(G.W * 0.41);
    const top = t.top ? 0 : (G.story ? G.top - 40 : 36);
    zona = textoIzq
      ? { x: colW, y: top, w: G.W - colW - (t.right ? 0 : 30), h: 0 }
      : { x: t.left ? 0 : 30, y: top, w: G.W - colW - (t.left ? 0 : 30), h: 0 };
    zona.h = (t.bottom ? G.H : G.H - 30) - zona.y;
    texto = { x: textoIzq ? G.m : G.W - colW + 12, y: G.top, w: colW - G.m - 12, h: G.H - G.top - G.bottom, valign: 'end' };
    preferir = textoIzq ? 'derecha' : 'izquierda';
  } else if (comp === 'estudio_arriba') {
    const bh = banda(opts, G, 0.36);
    texto = { x: G.m, y: G.top, w: G.W - G.m * 2, h: bh, valign: 'start' };
    const y = G.top + bh + (G.story ? 36 : 24);
    zona = { x: t.left ? 0 : 24, y, w: G.W - (t.left ? 0 : 24) - (t.right ? 0 : 24), h: (t.bottom ? G.H : G.H - 28) - y };
  } else {
    const bh = banda(opts, G, 0.38);
    texto = { x: G.m, y: G.H - G.bottom - bh, w: G.W - G.m * 2, h: bh, valign: 'end' };
    const y = t.top ? 0 : (G.story ? G.top - 40 : 30);
    zona = { x: t.left ? 0 : 24, y, w: G.W - (t.left ? 0 : 24) - (t.right ? 0 : 24), h: texto.y - (G.story ? 40 : 28) - y };
  }
  const st = escenificar(a, zona, lienzo, { preferir, alinear: comp === 'estudio_abajo' ? 'abajo' : null });
  const copy = bloqueTexto(opts, { maxDatos: comp === 'estudio_lado' ? 3 : (G.story ? 2 : 3) });
  return pagina(G, {
    css: estilos(G),
    fondo: fondoExtendido(a, st.box, G.H),
    comp,
    template: opts.template,
    capas: fotoHtml(f.url, a, st) + zonaHtml(texto, copy, { band: comp !== 'estudio_lado' }),
  });
}

/* FOTO A SANGRE. Dos casos distintos:
   - foto de ambiente o escena generada: cubre el cuadro y lleva velo oscuro del
     lado del texto, con tipografía clara;
   - foto de estudio que llena el cuadro (el pecho con la chomba): no hay fondo que
     extender, así que va arriba a todo el ancho y se funde en el papel donde va el
     texto, con tipografía oscura. Un velo negro sobre una foto clara se ve sucio. */
function buildEscena(opts, G, f) {
  const a = f.analysis;
  const deEstudio = Boolean(a && a.studio) && !opts.bgIsScene;
  if (deEstudio) {
    const bh = banda(opts, G, 0.36);
    const texto = { x: G.m, y: G.H - G.bottom - bh, w: G.W - G.m * 2, h: bh, valign: 'end' };
    const asp = a.aspect;
    let w = G.W;
    let h = w / asp;
    // La foto tiene que llegar hasta cerca del texto: si es apaisada, se agranda.
    const minH = texto.y + 60;
    if (h < minH) { h = minH; w = h * asp; }
    const box = { x: (G.W - w) / 2, y: 0, w, h };
    const fundido = Math.min(h * 0.42, Math.max(220, h - texto.y + 120));
    const feather = { l: 0, r: 0, t: 0, b: fundido };
    const velo = `<div class="scrim" style="top:${px(texto.y - 90)};bottom:0;background:linear-gradient(180deg,rgba(238,236,232,0) 0%,${PAPER} 140px);"></div>`;
    return pagina(G, {
      css: estilos(G),
      fondo: PAPER,
      comp: 'estudio_escena',
      template: opts.template,
      capas: fotoHtml(f.url, a, { box, feather }) + velo + zonaHtml(texto, bloqueTexto(opts, { maxDatos: G.story ? 2 : 3 }), { band: true }),
    });
  }
  // Escena generada o foto de ambiente: el texto va donde hay menos sujeto (en una
  // escena generada, abajo: se la pidió con esa zona libre — ver sceneBrief).
  const b = a && a.bbox;
  const abajo = opts.bgIsScene || !b || (b.y0 + b.y1) / 2 <= 0.56;
  const bh = banda(opts, G, 0.40);
  const texto = abajo
    ? { x: G.m, y: G.H - G.bottom - bh, w: G.W - G.m * 2, h: bh, valign: 'end' }
    : { x: G.m, y: G.top, w: G.W - G.m * 2, h: bh, valign: 'start' };
  /* ¿Velo claro u oscuro? Lo decide la luz REAL de la foto donde va el texto: sobre
     una escena clara (la dirección de campaña pide luz natural y fondos claros) un
     velo negro se ve sucio; ahí el papel de la casa sube desde abajo y el texto va
     oscuro. Sobre una escena oscura, velo negro y texto claro. */
  const claro = luzEnBanda(a, abajo) > 150;
  const color = claro ? '238,236,232' : '10,10,11';
  const fuerte = claro ? '.94' : '.86';
  const scrim = abajo
    ? `top:${px(Math.max(0, texto.y - 320))};bottom:0;background:linear-gradient(180deg,rgba(${color},0) 0%,rgba(${color},.62) 38%,rgba(${color},${fuerte}) 100%);`
    : `top:0;bottom:${px(Math.max(0, G.H - texto.y - texto.h - 320))};background:linear-gradient(0deg,rgba(${color},0) 0%,rgba(${color},.62) 38%,rgba(${color},${fuerte}) 100%);`;
  const foco = b && !opts.bgIsScene ? `${Math.round(((b.x0 + b.x1) / 2) * 100)}% ${Math.round(((b.y0 + b.y1) / 2) * 100)}%` : 'center';
  return pagina(G, {
    css: estilos(G, { oscuro: !claro }),
    fondo: claro ? PAPER : '#0E0E0F',
    comp: 'estudio_escena',
    template: opts.template,
    capas: `<div class="cover"><img src="${esc(f.url)}" alt="" style="object-position:${foco}"/></div><div class="scrim" style="${scrim}"></div>`
      + zonaHtml(texto, bloqueTexto(opts, { oscuro: !claro, maxDatos: G.story ? 2 : 3 }), { band: true }),
  });
}

/** Luminancia media (0-255) del fondo en la franja del texto, según la medición. */
function luzEnBanda(analysis, abajo) {
  const rows = (analysis && analysis.rows) || [];
  const enBanda = rows.filter((r) => (abajo ? r.at >= 0.6 : r.at <= 0.4));
  if (!enBanda.length) return 90;
  const lum = (h) => { const n = parseInt(String(h).slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  return enBanda.reduce((sum, r) => sum + lum(r.color), 0) / enBanda.length;
}

/**
 * Dirección de composición para la escena generada con IA: que deje el tercio de
 * abajo calmo, que es donde el sistema pone el texto. Sin esto el modelo compone al
 * centro y el titular termina encima de la prenda.
 */
function sceneBrief(format) {
  const story = format === 'story';
  return `COMPOSICIÓN PARA LA PIEZA (${story ? 'vertical 9:16' : 'vertical 4:5'}): la fotografía ocupa TODO el cuadro, de borde a borde, sin marcos, paneles ni franjas. El producto completo, grande y nítido, en la parte de arriba (entre el ${story ? '14' : '6'}% y el ${story ? '58' : '60'}% del alto), centrado o apenas corrido. El ${story ? '40' : '38'}% de abajo del cuadro queda como fondo continuo y calmo del mismo lugar (piso o pared, sin objetos, personas ni texto): ahí va el titular después. Luz natural y pareja, colores fieles.`;
}

/**
 * VARIAS FOTOS JUNTAS (líneas de colores, rankings, comparaciones, la fila del afiche).
 *
 * Dos maneras de armarlas, y se elige midiendo, no por costumbre:
 *  - LÍNEA SIN COSTURAS: el mismo producto en colores o vistas, fotografiado igual
 *    (mismo corte, mismo tono de estudio). Van en una fila a la MISMA escala, pisando
 *    la misma línea de piso, sobre el fondo común: se lee como un lineup.
 *  - MOSAICO: prendas distintas, fotos de sesiones distintas o más fotos de las que
 *    entran en una fila. Cada foto es su propio cuadro de estudio (el fondo de ESA
 *    foto extendido a todo el cuadro y la prenda grande, saliendo por el borde si
 *    viene cortada), separados por una calle fina y pareja.
 *
 * Por qué dos: en septiembre la línea se usaba para todo y fallaba de dos formas.
 * Cuatro remeras fotografiadas distinto quedaban chiquitas, a distintas alturas y con
 * un pozo de 400 px arriba; y en la historia del ranking, un pantalón cortado en la
 * cintura en la segunda fila se desvanecía hacia arriba como una niebla (una prenda
 * oscura no se puede fundir en papel claro sin que se note).
 *
 * La distribución del mosaico (columnas, una grande y dos chicas, 2×2…) se elige
 * calculando cuánto de cada cuadro ocupa su prenda: la que deja menos fondo vacío.
 */
function aspectoPrenda(a) {
  const b = a.bbox;
  return ((b.x1 - b.x0) * a.aspect) / (b.y1 - b.y0);
}

/** Fotos que se pueden poner juntas: de estudio y que no llenan el cuadro. */
const aptaParaFila = (f) => Boolean(f && f.url && f.analysis && f.analysis.studio && !llenaCuadro(f.analysis));

const tonoDeEstudio = (a) => (a.bgLum >= 246 ? PAPER : a.bg);

function distanciaColor(h1, h2) {
  const c = (h, k) => parseInt(String(h).slice(1 + k * 2, 3 + k * 2), 16) || 0;
  return Math.hypot(c(h1, 0) - c(h2, 0), c(h1, 1) - c(h2, 1), c(h1, 2) - c(h2, 2));
}

// Cuánto del ancho de una prenda ya cortada se acepta perder en un cuadro del mosaico.
const RECORTE_MOSAICO = 0.2;

/* Cuánto llena la prenda su cuadro (0 a 1). El aire a los COSTADOS de una prenda se ve
   natural (un retrato con espacio); el aire ARRIBA se ve como una prenda caída al fondo
   del cuadro: cuatro remeras en columnas angostas quedaban con la mitad de arriba vacía
   y, medidas por área, "llenaban" igual que en 2×2. Por eso el alto pesa más. */
const puntajeDeLlenado = (anchoRel, altoRel) => Math.pow(Math.min(1, Math.max(0, altoRel)), 1.5) * Math.pow(Math.min(1, Math.max(0, anchoRel)), 0.5);

function llenado(a, cuadro) {
  const st = escenificar(a, cuadro, cuadro, { recorte: RECORTE_MOSAICO });
  // Sólo cuenta lo que se VE: lo que el encuadre ajustado deja afuera no llena nada.
  const ancho = Math.min(st.sujeto.x + st.sujeto.w, cuadro.x + cuadro.w) - Math.max(st.sujeto.x, cuadro.x);
  const alto = Math.min(st.sujeto.y + st.sujeto.h, cuadro.y + cuadro.h) - Math.max(st.sujeto.y, cuadro.y);
  return puntajeDeLlenado(ancho / cuadro.w, alto / cuadro.h);
}

/** Las distribuciones posibles de n fotos en la región, cada una en orden de lectura. */
function grillas(n, R, gap) {
  const enColumnas = (r, k) => {
    const w = (r.w - gap * (k - 1)) / k;
    return Array.from({ length: k }, (_, i) => ({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }));
  };
  const enFilas = (r, k) => {
    const h = (r.h - gap * (k - 1)) / k;
    return Array.from({ length: k }, (_, i) => ({ x: r.x, y: r.y + i * (h + gap), w: r.w, h }));
  };
  const cortarX = (r, f) => { const w = Math.round((r.w - gap) * f); return [{ ...r, w }, { ...r, x: r.x + w + gap, w: r.w - w - gap }]; };
  const cortarY = (r, f) => { const h = Math.round((r.h - gap) * f); return [{ ...r, h }, { ...r, y: r.y + h + gap, h: r.h - h - gap }]; };
  if (n === 1) return [[R]];
  if (n === 2) return [enColumnas(R, 2), enFilas(R, 2)];
  if (n === 3) {
    const [izq, der] = cortarX(R, 0.56);
    const [arr, aba] = cortarY(R, 0.5);
    return [
      enColumnas(R, 3),
      [izq, ...enFilas(der, 2)], // la primera grande y dos apiladas al lado
      [...enColumnas(arr, 2), aba],
      [arr, ...enColumnas(aba, 2)],
      enFilas(R, 3),
    ];
  }
  const [arr, aba] = cortarY(R, 0.5);
  const [izq, der] = cortarX(R, 0.5);
  return [[...enColumnas(arr, 2), ...enColumnas(aba, 2)], enColumnas(R, 4), [izq, ...enFilas(der, 3)]];
}

function permutaciones(lista) {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((p) => [x, ...p]));
}

/** El cuadrado naranja con el número (rankings, comparaciones, encuestas). */
function numeroHtml(k, x, y, G, yCelda) {
  const top = G.story && yCelda < G.top ? Math.max(y, G.top + 12) : y;
  return `<span class="num" style="left:${px(x)};top:${px(top)}">${k + 1}</span>`;
}

function filaDeFotos(fotos, region, G, { numerar = false } = {}) {
  const lista = fotos.filter(aptaParaFila).slice(0, 4);
  if (!lista.length) return null;
  const n = lista.length;
  const asps = lista.map((f) => aspectoPrenda(f.analysis));
  const tonos = lista.map((f) => tonoDeEstudio(f.analysis));
  const gap = G.story ? 14 : 12;

  /* Candidata 1: la línea sin costuras. Sólo si las fotos son "del mismo set": mismo
     corte, proporciones parecidas y el mismo tono de estudio (dos grises distintos
     lado a lado marcan la costura aunque se fundan). */
  let linea = null;
  const mismoCorte = lista.every((f) => Boolean(f.analysis.touches.top) === Boolean(lista[0].analysis.touches.top));
  const mismoTono = tonos.every((t) => distanciaColor(t, tonos[0]) <= 14);
  if (n >= 2 && mismoCorte && mismoTono && Math.max(...asps) / Math.min(...asps) < 1.7) {
    const cellW = region.w / n;
    const cortadas = lista[0].analysis.touches.top;
    let altoComun = region.h * (cortadas ? 1 : 0.9);
    lista.forEach((f, k) => { altoComun = Math.min(altoComun, (cellW * 0.9) / asps[k]); });
    const promedio = asps.reduce((s, asp) => s + puntajeDeLlenado((altoComun * asp) / cellW, altoComun / region.h), 0) / n;
    linea = { puntaje: promedio + 0.08, cellW, altoComun, cortadas }; // sin costuras se ve mejor: a igual llenado, gana
  }

  /* Candidata 2: el mosaico. Con números el orden es el del ranking (la 1 va primero y
     en el cuadro grande); sin números se prueba cada orden y gana el que llena más. */
  let mosaico = null;
  const ordenes = numerar ? [lista.map((_, i) => i)] : permutaciones(lista.map((_, i) => i));
  grillas(n, region, gap).forEach((celdas, g) => {
    ordenes.forEach((orden) => {
      const puntaje = celdas.reduce((s, c, k) => s + llenado(lista[orden[k]].analysis, c), 0) / n - g * 0.01;
      if (!mosaico || puntaje > mosaico.puntaje) mosaico = { puntaje, celdas, orden };
    });
  });

  if (linea && linea.puntaje >= mosaico.puntaje) {
    const { cellW, altoComun } = linea;
    const html = lista.map((f, i) => {
      const a = f.analysis;
      const b = a.bbox;
      const x = region.x + i * cellW;
      const fh = altoComun / (b.y1 - b.y0);
      const fw = fh * a.aspect;
      const sujetoX = cellW / 2 - ((b.x1 - b.x0) * fw) / 2;
      const sujetoY = a.touches.top ? 0 : region.h - (region.h - altoComun) / 2 - altoComun;
      const box = { x: sujetoX - b.x0 * fw, y: sujetoY - b.y0 * fh, w: fw, h: fh };
      const feather = {
        l: 0, r: 0,
        t: box.y > 1 ? Math.min(80, b.y0 * fh * 0.85) : 0,
        b: box.y + box.h < region.h - 1 ? Math.min(80, (1 - b.y1) * fh * 0.85) : 0,
      };
      const bordes = [];
      if (i > 0) bordes.push('linear-gradient(90deg,transparent 0,#000 34px)');
      if (i < n - 1) bordes.push('linear-gradient(270deg,transparent 0,#000 34px)');
      const m = bordes.length ? `-webkit-mask-image:${bordes.join(',')};mask-image:${bordes.join(',')};-webkit-mask-composite:source-in;mask-composite:intersect;` : '';
      // El número va pegado a la prenda, no al borde del cuadro: en la línea no se ven celdas.
      const num = numerar ? numeroHtml(i, x + Math.max(16, sujetoX - (G.story ? 74 : 62) - 14), region.y + Math.max(24, sujetoY + 24), G, region.y) : '';
      return `<div class="col" style="left:${px(x)};top:${px(region.y)};width:${px(cellW + 1)};height:${px(region.h + 1)};${m}">${fotoHtml(f.url, a, { box, feather })}</div>${num}`;
    });
    // El fondo común: el promedio de los estudios (son el mismo set, difieren en dos o tres tonos).
    const prom = [0, 1, 2].map((k) => Math.round(tonos.reduce((s, hx) => s + parseInt(hx.slice(1 + k * 2, 3 + k * 2), 16), 0) / n));
    return { html: html.join(''), fondo: `#${prom.map((v) => v.toString(16).padStart(2, '0')).join('')}`, modo: 'linea' };
  }

  const html = mosaico.celdas.map((c, k) => {
    const f = lista[mosaico.orden[k]];
    const a = f.analysis;
    const local = { x: 0, y: 0, w: c.w, h: c.h };
    const st = escenificar(a, local, local, { recorte: RECORTE_MOSAICO });
    const num = numerar ? numeroHtml(k, c.x + 24, c.y + 24, G, c.y) : '';
    return `<div class="tile" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)};background:${fondoExtendido(a, st.box, c.h)}">${fotoHtml(f.url, a, st)}</div>${num}`;
  });
  return { html: html.join(''), fondo: null, modo: 'mosaico' };
}

function buildLinea(opts, G, fotos) {
  const aptas = fotos.filter(aptaParaFila);
  if (aptas.length < 2) return buildEstudio({ ...opts, template: 'estudio_abajo' }, G, fotos[0]);
  const cortadasArriba = aptas.filter((f) => f.analysis.touches.top).length > aptas.length / 2;
  const bh = banda(opts, G, G.story ? 0.32 : 0.30);
  const texto = cortadasArriba
    ? { x: G.m, y: G.H - G.bottom - bh, w: G.W - G.m * 2, h: bh, valign: 'end' }
    : { x: G.m, y: G.top, w: G.W - G.m * 2, h: bh, valign: 'start' };
  const region = cortadasArriba
    ? { x: 0, y: 0, w: G.W, h: texto.y - (G.story ? 40 : 30) }
    : { x: 0, y: texto.y + bh + 24, w: G.W, h: G.H - (texto.y + bh + 24) };
  const fila = filaDeFotos(aptas, region, G, { numerar: Boolean(opts.numerar) });
  return pagina(G, {
    css: estilos(G),
    fondo: (fila && fila.fondo) || PAPER,
    comp: 'estudio_linea',
    template: opts.template,
    capas: (fila ? fila.html : '') + zonaHtml(texto, bloqueTexto({ ...opts, specs: [], storyPoints: [] }, { maxDatos: 0 }), { band: true }),
  });
}

/* AFICHE TIPOGRÁFICO. Nunca queda vacío: el titular manda y, si hay fotos de productos
   (los del tema o, si el tema no nombra ninguno, los más vendidos), van abajo en una
   franja de estudio. La franja se lleva TODO lo que el texto no usa (el texto se mide
   en la primera pasada): con una franja fija el titular quedaba abajo de un pozo de
   300 px en el feed y de 700 px en las historias. Oscuro por defecto: es la pieza que
   corta el ritmo claro del feed. */
function buildTitular(opts, G, fotos) {
  const oscuro = opts.variant !== 'claro';
  const aptas = fotos.filter(aptaParaFila);
  const gap = G.story ? 48 : 40;
  let region = null;
  let fila = null;
  if (aptas.length) {
    const util = G.H - G.top - G.bottom;
    const pedido = Number(opts.textBand) > 0 ? Number(opts.textBand) : util * 0.5;
    // La franja: entre el 30% y el 58% del alto.
    const y0 = Math.round(Math.max(G.H * 0.42, Math.min(G.H * 0.70, G.top + pedido + gap)));
    region = { x: 0, y: y0, w: G.W, h: G.H - y0 };
    fila = filaDeFotos(aptas, region, G);
  }
  const texto = fila
    ? { x: G.m, y: G.top, w: G.W - G.m * 2, h: region.y - gap - G.top, valign: 'end' }
    : { x: G.m, y: G.top, w: G.W - G.m * 2, h: G.H - G.top - G.bottom, valign: 'center' };
  const css = `${estilos(G, { oscuro })}
    .poster h1{font-size:${G.story ? 176 : 150}px;line-height:.86;}
    .poster .deck{font-size:${G.story ? 36 : 30}px;}
    .franja{position:absolute;left:0;right:0;top:${px(region ? region.y : 0)};height:${px(region ? region.h : 0)};background:${(fila && fila.fondo) || PAPER};}`;
  const copy = bloqueTexto({ ...opts, hasProduct: false }, { oscuro, maxDatos: 3 });
  return pagina(G, {
    css,
    fondo: oscuro ? '#0E0E0F' : PAPER,
    comp: 'estudio_titular',
    template: opts.template,
    capas: `<div class="poster" style="position:absolute;inset:0">${zonaHtml(texto, copy, { band: Boolean(fila) })}</div>${fila ? `${fila.fondo ? '<div class="franja"></div>' : ''}${fila.html}` : ''}`,
  });
}

/**
 * @param {object} opts  las opciones de siempre de las plantillas, más `photos`:
 *   [{ url, analysis }] ya medidas (ver renderPostBuffer) y, en la segunda pasada,
 *   `textBand` con el alto real que ocupó el texto.
 */
function buildHtml(opts) {
  const G = geometry(opts.format);
  const fotos = (opts.photos || []).filter((f) => f && f.url);
  const base = { ...opts, hasProduct: opts.hasProduct !== undefined ? Boolean(opts.hasProduct) : fotos.length > 0 };
  // Un fondo generado con IA para una pieza sin producto va a sangre, con el mismo texto.
  if (opts.bgIsScene && fotos.length) return buildEscena(base, G, fotos[0]);
  if (opts.template === 'estudio_titular' || !fotos.length) return buildTitular({ ...base, template: 'estudio_titular' }, G, fotos);
  if (opts.template === 'estudio_linea') return buildLinea(base, G, fotos);
  if (opts.bgIsScene || !fotos[0].analysis || !fotos[0].analysis.studio || opts.template === 'estudio_escena') {
    return buildEscena(base, G, fotos[0]);
  }
  return buildEstudio(base, G, fotos[0]);
}

/**
 * Ajusta el texto con la tipografía YA cargada. Orden: que la palabra más larga del
 * titular entre en el ancho; después, si el bloque no entra en su zona, se quitan
 * datos de la lista hasta dos, se achica la bajada, se achica el titular hasta un
 * piso legible y recién ahí se quitan los últimos datos. Nunca se corta una palabra
 * ni queda texto afuera del cuadro.
 */
async function fitText(page, { soloAncho = false } = {}) {
  return page.evaluate((soloAncho) => {
    const story = document.querySelector('.canvas').offsetHeight > 1500;
    for (const zone of document.querySelectorAll('.zone')) {
      const copy = zone.querySelector('.copy');
      if (!copy) continue;
      const h1 = copy.querySelector('h1');
      const deck = copy.querySelector('.deck');
      const size = (el) => parseFloat(getComputedStyle(el).fontSize);
      const over = () => copy.offsetHeight > zone.clientHeight + 1 || copy.scrollWidth > zone.clientWidth + 1;
      for (let i = 0; i < 90 && h1 && h1.scrollWidth > h1.clientWidth + 1 && size(h1) > 44; i += 1) h1.style.fontSize = `${size(h1) - 2}px`;
      if (soloAncho) continue;
      const piso = story ? 88 : 66;
      for (let i = 0; i < 160 && over(); i += 1) {
        const facts = copy.querySelectorAll('.facts li');
        if (facts.length > 2) { facts[facts.length - 1].remove(); continue; }
        if (deck && size(deck) > (story ? 28 : 23)) { deck.style.fontSize = `${size(deck) - 1}px`; continue; }
        if (h1 && size(h1) > piso) { h1.style.fontSize = `${size(h1) - 2}px`; continue; }
        if (facts.length) { facts[facts.length - 1].remove(); if (!copy.querySelectorAll('.facts li').length) copy.querySelector('.facts')?.remove(); continue; }
        if (h1 && size(h1) > 44) { h1.style.fontSize = `${size(h1) - 2}px`; continue; }
        if (deck) { deck.remove(); continue; }
        break;
      }
      /* Afiche SIN fotos: el titular crece hasta ocupar el cuadro. A 150 px una frase
         corta dejaba 300 px de papel arriba y abajo (los pasos de las guías). Crece
         mientras la palabra más larga entre en el ancho y el bloque no pase del 78%. */
      if (h1 && zone.closest('.poster') && !zone.dataset.band) {
        const tope = story ? 240 : 210;
        for (let i = 0; i < 80 && size(h1) < tope; i += 1) {
          const antes = size(h1);
          h1.style.fontSize = `${antes + 3}px`;
          if (over() || h1.scrollWidth > h1.clientWidth + 1 || copy.offsetHeight > zone.clientHeight * 0.78) {
            h1.style.fontSize = `${antes}px`;
            break;
          }
        }
      }
    }
    return [...document.querySelectorAll('.zone .copy')].map((c) => c.offsetHeight);
  }, soloAncho);
}

/**
 * Dibuja la pieza en la página en DOS pasadas: la primera mide cuánto ocupa el
 * texto con la tipografía real; la segunda le da a la foto todo el resto. Sin esto
 * la banda de texto era fija y quedaban pozos entre el titular y la prenda.
 * Devuelve la composición que quedó (para guardarla en la memoria de diseño).
 */
async function renderOnPage(page, opts, { waitUntil = 'networkidle0', timeout = 15000 } = {}) {
  const load = async (html) => {
    try { await page.setContent(html, { waitUntil, timeout }); } catch (_) { await page.setContent(html, { waitUntil: 'load' }).catch(() => {}); }
    try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}
  };
  await load(buildHtml(opts));
  /* Se mide DESPUÉS de achicar el titular a lo ancho: una palabra larga ("RENDIMIENTO")
     a 150 px no entra, se achica al final y el bloque medido de más dejaba un pozo
     arriba del texto en la versión final. */
  await fitText(page, { soloAncho: true }).catch(() => {});
  const medida = await page.evaluate(() => {
    const zone = document.querySelector('.zone[data-band]');
    const copy = zone && zone.querySelector('.copy');
    return copy ? { need: copy.offsetHeight, band: Number(zone.dataset.band) } : null;
  }).catch(() => null);
  let finalOpts = opts;
  if (medida && Math.abs(medida.need - medida.band) > 16) {
    finalOpts = { ...opts, textBand: medida.need + 4 };
    await load(buildHtml(finalOpts));
  }
  await fitText(page);
  const comp = await page.$eval('.canvas', (el) => el.dataset.comp).catch(() => null);
  return { comp, textBand: finalOpts.textBand || null };
}

module.exports = {
  NAMES, INFO, REQUIREMENTS, isStudio, buildHtml, fitText, renderOnPage, composiciones, resolverComposicion,
  llenaCuadro, escenificar, titulares, conTildes, oracion, marcaDe, nombreCorto, sceneBrief, luzEnBanda, geometry, PAPER, INK, ACCENT,
};
