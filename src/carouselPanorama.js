const config = require('./config');
const { stripEmoji } = require('./textUtils');

/**
 * CARRUSEL CONTINUO ("la tira").
 *
 * Por qué existe (pedido del dueño, ago-2026): "que los carruseles tengan el efecto de
 * imágenes continuas, para que la gente quiera deslizar… algo que parezca realmente
 * editado y no cortado y pegado sobre la foto".
 *
 * Hasta ahora cada slide del carrusel se renderizaba SOLO: cuatro lienzos de 1080x1350
 * independientes, cada uno con su foto, su titular y su logo. Aunque cada pieza estuviera
 * bien, al deslizar no pasaba nada: eran cuatro posteos pegados. El que mira el primero
 * no tiene ningún motivo visual para ir al segundo.
 *
 * Acá el carrusel deja de ser N piezas y pasa a ser UNA sola pieza ancha —la tira— que
 * después se corta en N cuadros de 1080x1350:
 *
 *   ┌──────────── 1 sola tira de 3240 o 4320 px de ancho ────────────┐
 *   │  fondo continuo · barrido cálido de acento · palabra corrida    │
 *   │   [prenda]        [prenda que CRUZA la costura]      [prenda]   │
 *   │ ─────── riel continuo con marcas y flecha que cruza ─────────── │
 *   │  titular 1        │  titular 2        │  titular 3              │
 *   └───── corte 1 ─────┴───── corte 2 ─────┴────────────────────────┘
 *
 * La continuidad NO se simula: es real. Todo lo que cruza las costuras (el fondo, el
 * barrido de acento, la palabra gigante, el riel, la prenda que queda a caballo del corte) está
 * dibujado UNA vez sobre el lienzo ancho, así que al deslizar la imagen sigue exactamente
 * donde estaba. Eso es lo que hace que se lea como una pieza editada y no como un collage.
 *
 * REGLAS DE COMPOSICIÓN (son las que evitan que parezca hecho a las apuradas):
 *
 *  1. Nada IMPORTANTE cae justo en la costura. Los titulares viven enteros dentro de su
 *     cuadro, con margen de sobra. Lo único que cruza es lo que gana con cruzar.
 *  2. Lo que cruza, cruza en grande. Un elemento chiquito partido al medio se lee como
 *     error; una prenda de 700px partida se lee como una decisión.
 *  3. La prenda va RECORTADA (productCutout), nunca como foto rectangular con su fondo
 *     de estudio: un rectángulo blanco con borde sobre fondo negro es justo el "pegado
 *     sobre la foto" que no se quiere. Cuando el recorte no sale, la foto va como bloque
 *     con los cuatro bordes desvanecidos, que se integra en vez de apoyarse encima.
 *  4. El primer cuadro tiene que funcionar SOLO: es el que se ve en el feed. Ahí la
 *     prenda va entera, con la marca y el titular. El premio por deslizar viene después.
 *  5. Los titulares comparten una línea de base continua a lo largo de toda la tira. Ese
 *     riel horizontal es el que más "cose" la pieza visualmente.
 */

const ACCENT = config.brand.colors.darkOrange; // #C1440C
const INK_BG = '#0A0A0A';

// El continuo es de FEED. En historias no existe el deslizamiento horizontal continuo
// (cada historia es una pantalla aparte), así que ahí no tiene sentido.
const PANEL = { w: 1080, h: 1350 };
const MIN_PANELS = 3;
const MAX_PANELS = 4;

function esc(s) {
  return stripEmoji(String(s == null ? '' : s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const r1 = (n) => Math.round(n * 10) / 10;

/** Medidas de la tira para N cuadros. `panelCount` se recorta a [3, 4]. */
function panoramaDims(panelCount) {
  const n = Math.max(MIN_PANELS, Math.min(MAX_PANELS, Number(panelCount) || MIN_PANELS));
  return { n, panelW: PANEL.w, panelH: PANEL.h, w: PANEL.w * n, h: PANEL.h };
}

/* =========================================================================
 * RITMO DE LAS PRENDAS
 *
 * Dónde se para cada prenda a lo largo de la tira. Las posiciones están en "cuadros"
 * (1.0 = un ancho de 1080px), medidas al CENTRO DE LA TINTA del recorte — no al centro
 * de la caja de la imagen, que con un PNG de catálogo puede tener 200px de aire al
 * costado y deja la prenda corrida respecto de donde uno la puso.
 *
 * Hay dos ritmos para que dos carruseles seguidos no salgan calcados (los elige el seed
 * de la pieza, igual que las variantes de artDirection): 'tira' apoya todas las prendas
 * sobre una misma línea de piso, 'ola' las alterna en altura.
 *
 * Cuál de las prendas queda a caballo de una costura NO se decide acá: se decide con las
 * fotos a la vista dentro de buildPanoramaHtml, porque depende de cuán ANCHA es la prenda
 * una vez recortada (una figura de cuerpo entero es angosta y no da para partirla).
 * ========================================================================= */
const RHYTHMS = {
  tira: {
    3: [
      { cx: 0.60, inkH: 0.60, bottom: 0.660 },
      { cx: 1.52, inkH: 0.54, bottom: 0.655 },
      { cx: 2.58, inkH: 0.46, bottom: 0.650 },
    ],
    4: [
      { cx: 0.58, inkH: 0.60, bottom: 0.660 },
      { cx: 1.54, inkH: 0.54, bottom: 0.655 },
      { cx: 2.56, inkH: 0.46, bottom: 0.650 },
      { cx: 3.58, inkH: 0.50, bottom: 0.655 },
    ],
  },
  ola: {
    3: [
      { cx: 0.54, inkH: 0.62, bottom: 0.665 },
      { cx: 1.58, inkH: 0.48, bottom: 0.590 },
      { cx: 2.60, inkH: 0.52, bottom: 0.655 },
    ],
    4: [
      { cx: 0.56, inkH: 0.62, bottom: 0.665 },
      { cx: 1.56, inkH: 0.46, bottom: 0.580 },
      { cx: 2.60, inkH: 0.54, bottom: 0.660 },
      { cx: 3.56, inkH: 0.44, bottom: 0.585 },
    ],
  },
};

function rhythmFor(panelCount, seed = 0) {
  const nombres = Object.keys(RHYTHMS);
  const nombre = nombres[Math.abs(Number(seed) || 0) % nombres.length];
  const filas = RHYTHMS[nombre][panelCount] || RHYTHMS[nombre][MIN_PANELS];
  return { nombre, filas };
}

/* =========================================================================
 * ESCALA DE LAS PRENDAS
 *
 * `inkRatio` = ancho / alto de la TINTA (la prenda sola, sin el aire del PNG). Es lo que
 * distingue una foto de cuerpo entero (~0.33: alta y flaca) de un zoom al bolsillo
 * (~1.10: apaisado). Sin esta corrección, pedir "esta prenda mide 0,50 del alto" dejaba a
 * la figura entera diminuta al lado de un zoom del mismo alto — se vio en la primera
 * prueba: el modelo de cuerpo entero parecía un muñeco perdido en el medio del cuadro.
 * ========================================================================= */
const TOPE_ARRIBA = 0.052; // ninguna prenda puede subir más que esto (se le corta la cabeza)

function inkRatioOf(cutout) {
  if (!cutout || !cutout.box) return 0.8; // tarjeta de foto (4:5)
  const { x0 = 0.15, x1 = 0.85, y0 = 0.05, y1 = 0.95 } = cutout.box;
  const aspect = Number.isFinite(cutout.aspect) && cutout.aspect > 0 ? cutout.aspect : 0.75;
  return (aspect * Math.max(0.02, x1 - x0)) / Math.max(0.05, y1 - y0);
}

/** Alto de tinta corregido por tipo de toma, sin pasarse del techo del cuadro. */
function fitInk(wantH, inkRatio, bottom) {
  let h = wantH;
  if (inkRatio < 0.42) h *= 1.42;        // cuerpo entero: la prenda es un tercio de la figura
  else if (inkRatio < 0.62) h *= 1.16;   // medio cuerpo / piernas
  else if (inkRatio > 1.05) h *= 0.92;   // zoom apaisado: ya entra grande
  return Math.min(h, bottom - TOPE_ARRIBA);
}

/* =========================================================================
 * CAPAS
 * ========================================================================= */

/**
 * Recorte de la prenda ubicado por su TINTA, no por su caja.
 *
 * productCutout devuelve `box` = el rectángulo real que ocupa la prenda dentro del PNG,
 * normalizado. Con eso se puede pedir "esta prenda mide 700px de alto y su centro cae
 * exactamente sobre la costura" y que sea cierto. Sin la caja (recorte viejo o foto sin
 * medición) se cae a centrar la imagen entera, que es lo que se hacía antes.
 *
 * El desvanecido de abajo cumple la misma función que en templatesModern: el recorte por
 * color se come las partes claras que tocan el piso del estudio y ahí es donde se ven los
 * artefactos; además ancla la prenda al fondo en vez de dejarla flotando como calcomanía.
 */
function cutoutInk(url, { box, aspect, cx, inkH, bottom, z = 3 }) {
  const H = PANEL.h;
  const inkHeightPx = inkH * H;
  const bottomPx = bottom * H;
  const bx0 = box && Number.isFinite(box.x0) ? box.x0 : 0.15;
  const bx1 = box && Number.isFinite(box.x1) ? box.x1 : 0.85;
  const by0 = box && Number.isFinite(box.y0) ? box.y0 : 0.05;
  const by1 = box && Number.isFinite(box.y1) ? box.y1 : 0.95;
  const inkFracH = Math.max(0.05, by1 - by0);
  const imgH = inkHeightPx / inkFracH;                 // alto de la imagen COMPLETA
  const imgW = imgH * (Number.isFinite(aspect) && aspect > 0 ? aspect : 0.75);
  const inkCenterX = ((bx0 + bx1) / 2) * imgW;          // dónde cae el centro de la prenda
  const left = cx - inkCenterX;
  const top = bottomPx - by1 * imgH;

  // Fundido de arriba cuando la foto viene cortada por el borde superior (el clásico
  // encuadre de torso): sin esto la prenda termina en una línea recta contra el fondo.
  // Acá el fundido baja más que en templatesModern a propósito: en la tira las prendas
  // van más grandes, y con el corte al 8-20% quedaba a la vista el mentón y el cuello de
  // un modelo sin cabeza. Disolviendo hasta el 30% lo que se ve es la prenda saliendo de
  // la penumbra, que es una decisión de foto y no un recorte fallido.
  const arriba = by0 <= 0.02
    ? 'transparent 0%, rgba(0,0,0,.28) 13%, #000 30%, '
    : '#000 0%, ';
  const g = `linear-gradient(to bottom, ${arriba}#000 76%, rgba(0,0,0,.5) 92%, transparent 100%)`;

  return `<img src="${esc(url)}" style="position:absolute; left:${r1(left)}px; top:${r1(top)}px;
    width:${r1(imgW)}px; height:${r1(imgH)}px; object-fit:contain; z-index:${z};
    filter:drop-shadow(0 34px 66px rgba(0,0,0,.6));
    mask-image:${g}; -webkit-mask-image:${g};"/>`;
}

/* Aspectos del bloque de foto: retrato cuando se para en su cuadro, apaisado cuando cruza
 * la costura (una foto que cruza tiene que ser ANCHA o el asomo es un hilito). */
const FOTO_RETRATO = 0.8;
const FOTO_APAISADA = 1.5;

/**
 * Plan B cuando la foto no se puede recortar (no es de estudio o el recorte salió roto):
 * la foto va como BLOQUE con los cuatro bordes desvanecidos.
 *
 * La primera versión era una tarjeta con marco fino y esquina redondeada. Con fotos de
 * catálogo sobre ciclorama blanco, ese marco era exactamente el "cortado y pegado sobre
 * la foto" que la tira viene a evitar: un rectángulo blanco con borde, apoyado sobre un
 * fondo casi negro. Sin marco, apagada un punto y con los bordes disueltos, la foto se
 * integra al fondo como una imagen sangrada de revista — y puede cruzar la costura sin
 * que el corte se lea como un error.
 */
function photoCard(url, { cx, inkH, bottom, aspect = FOTO_RETRATO, z = 3 }) {
  const H = PANEL.h;
  const h = inkH * H;
  const w = h * aspect;
  const left = cx - w / 2;
  const top = bottom * H - h;
  // Un SOLO degradado elíptico como máscara. Con dos máscaras lineales (una horizontal y
  // otra vertical) haría falta componerlas, y `mask-composite` / `-webkit-mask-composite`
  // no usan los mismos valores: en Chromium la mezcla salía como un rectángulo negro
  // opaco tapando medio cuadro. Una elipse sola desvanece los cuatro bordes de una.
  const fade = 'radial-gradient(118% 115% at 50% 48%, #000 44%, rgba(0,0,0,.45) 78%, transparent 100%)';
  return `<div style="position:absolute; left:${r1(left)}px; top:${r1(top)}px; width:${r1(w)}px; height:${r1(h)}px;
    z-index:${z}; overflow:hidden;
    mask-image:${fade}; -webkit-mask-image:${fade};">
    <img src="${esc(url)}" style="width:100%; height:100%; object-fit:cover; object-position:center 38%;
      filter:brightness(.74) contrast(1.1) saturate(.94);"/>
    <div style="position:absolute; inset:0; background:
      radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 34%, rgba(10,10,12,.5) 100%);"></div>
  </div>`;
}

/**
 * TIRA GENERATIVA: la foto ES la pieza, no el fondo.
 *
 * Diferencia con `groundLayer` (que también recibe una imagen): ahí la foto es AMBIENTE y
 * se la manda al fondo a propósito —brillo al 62%, una cortina oscura encima— porque lo
 * que importa son los recortes que van arriba. Acá no hay nada arriba: la prenda ya está
 * fotografiada DENTRO de la escena, con la luz de la escena. Bajarla como si fuera fondo
 * sería apagar justamente lo que se quiere mostrar.
 *
 * Entonces la imagen va casi limpia (un punto de contraste, nada más) y la legibilidad del
 * texto se resuelve donde hace falta y sólo ahí:
 *   · una cortina que baja desde el riel hasta el pie, que es donde viven los titulares;
 *   · una cortina corta arriba, para el logo y la cápsula del descuento;
 *   · las dos con el MISMO perfil a lo largo de toda la tira, así ningún corte muestra un
 *     degradado distinto del de al lado (eso delataría que son cuatro imágenes).
 *
 * @param railY fracción de alto donde corre el riel: la cortina de abajo arranca ahí.
 */
function sceneLayer(W, H, sceneUrl, { railY = 0.702 } = {}) {
  return `<img src="${esc(sceneUrl)}" style="position:absolute; left:0; top:0; width:${W}px; height:${H}px;
      object-fit:cover; z-index:0; filter:brightness(1.1) contrast(1.05) saturate(.98);"/>
    <div data-deco style="position:absolute; left:0; top:0; width:${W}px; height:${r1(H * 0.2)}px; z-index:1;
      background:linear-gradient(to bottom, rgba(8,8,10,.55) 0%, rgba(8,8,10,.22) 50%, rgba(8,8,10,0) 100%);"></div>
    <div data-deco style="position:absolute; left:0; top:${r1(H * (railY - 0.12))}px; width:${W}px; height:${r1(H * (1.12 - railY))}px; z-index:1;
      background:linear-gradient(to bottom, rgba(8,8,10,0) 0%, rgba(8,8,10,.52) 26%, rgba(8,8,10,.88) 62%, rgba(8,8,10,.97) 100%);"></div>`;
}

/**
 * Fondo continuo. Si hay foto ambiental generada (una sola, ancha, para TODA la tira) va
 * ésa; si no, un campo diseñado con pozos de luz desplazados.
 *
 * Los pozos de luz están corridos A PROPÓSITO respecto de las costuras: si el degradado
 * cambiara justo en el corte, cada cuadro saldría de un color plano distinto y la tira se
 * leería como cuatro fondos pegados. Cayendo en el medio de cada cuadro, en cambio, cada
 * corte se lleva medio degradado y la continuidad se nota al deslizar.
 */
function groundLayer(W, H, backdropUrl, n) {
  if (backdropUrl) {
    return `<img src="${esc(backdropUrl)}" style="position:absolute; left:0; top:0; width:${W}px; height:${H}px;
      object-fit:cover; z-index:0; filter:saturate(.82) contrast(1.06) brightness(.62);"/>
    <div style="position:absolute; inset:0; z-index:1; background:
      linear-gradient(to bottom, rgba(10,10,10,.72) 0%, rgba(10,10,10,.24) 34%, rgba(10,10,10,.55) 72%, rgba(10,10,10,.94) 100%);"></div>`;
  }
  const pozos = [];
  for (let i = 0; i < n; i += 1) {
    const cx = (i + 0.5) * PANEL.w;
    const fuerza = i % 2 === 0 ? 0.16 : 0.10;
    pozos.push(`radial-gradient(1200px 900px at ${r1(cx)}px ${i % 2 === 0 ? 34 : 44}%, rgba(255,255,255,${fuerza}) 0%, rgba(255,255,255,0) 62%)`);
  }
  return `<div style="position:absolute; inset:0; z-index:0; background:
    ${pozos.join(', ')},
    linear-gradient(100deg, #08080a 0%, #16171c 28%, #0e0f13 58%, #191a20 82%, #0a0a0c 100%);"></div>`;
}

/**
 * Barrido cálido: una sola atmósfera naranja que recorre la tira de punta a punta y se
 * acumula hacia el centro. Reemplaza a la primera versión, que era una BANDA de acento en
 * diagonal: quedaba una línea naranja de 10px atravesando al modelo por el pecho y se leía
 * como un cable delante de la foto, no como diseño. Un barrido de luz cruza igual todas
 * las costuras (la continuidad se mantiene) pero pasa por detrás de la prenda sin cortarla.
 */
function warmSweep(W, H, { flip = false } = {}) {
  const centro = flip ? 0.62 : 0.42;
  return `<div data-deco style="position:absolute; inset:0; z-index:2; background:
    radial-gradient(${Math.round(W * 0.40)}px ${Math.round(H * 0.85)}px at ${Math.round(W * centro)}px ${flip ? 62 : 40}%, rgba(193,68,12,.10) 0%, rgba(193,68,12,.035) 46%, rgba(193,68,12,0) 78%),
    linear-gradient(${flip ? 260 : 100}deg, rgba(193,68,12,0) 0%, rgba(193,68,12,.02) 34%, rgba(193,68,12,.05) 58%, rgba(193,68,12,0) 96%);"></div>`;
}

/**
 * Pozo de luz detrás de cada prenda + sombra de piso.
 *
 * No es decoración: el recorte por color deja un halo claro en los bordes donde el fondo
 * de estudio se pega al sujeto (se vio en la primera prueba: una aureola blanca al costado
 * del modelo y un manchón bajo los botines). Sobre un fondo casi negro ese halo canta.
 * Con un pozo de luz detrás, el halo pasa a leerse como el borde iluminado de un foco de
 * estudio, que es exactamente lo que un retocador haría; y la sombra elíptica apoya la
 * prenda en el piso en vez de dejarla flotando recortada.
 */
function productLight(cx, bottomPx, inkW, inkH) {
  const rx = Math.max(inkW * 0.95, inkH * 0.55);
  const ry = inkH * 0.62;
  const cy = bottomPx - inkH * 0.52;
  return `<div data-deco style="position:absolute; left:${r1(cx - rx)}px; top:${r1(cy - ry)}px;
      width:${r1(rx * 2)}px; height:${r1(ry * 2)}px; z-index:2;
      background:radial-gradient(closest-side, rgba(255,255,255,.16) 0%, rgba(255,255,255,.06) 48%, rgba(255,255,255,0) 100%);"></div>
    <div data-deco style="position:absolute; left:${r1(cx - inkW * 0.62)}px; top:${r1(bottomPx - inkH * 0.045)}px;
      width:${r1(inkW * 1.24)}px; height:${r1(inkH * 0.1)}px; z-index:2;
      background:radial-gradient(closest-side, rgba(0,0,0,.62) 0%, rgba(0,0,0,.22) 58%, rgba(0,0,0,0) 100%);"></div>`;
}

/**
 * Palabra corrida: el nombre del producto (o de la marca) en Anton, gigante y a muy baja
 * opacidad, escrito UNA vez a lo largo de toda la tira. Nunca se lee entero en un cuadro —
 * se lee al deslizar, que es exactamente el efecto buscado.
 *
 * Va marcada como `data-deco` para que la medición de texto recortado no la denuncie: se
 * sale del lienzo a propósito.
 */
function runningWord(W, H, word, { top = 0.075 } = {}) {
  const limpio = String(word || '').trim();
  if (!limpio) return '';
  // Tamaño atado al largo de la palabra: la idea es que entren DOS repeticiones en toda
  // la tira, no siete. Repetida muchas veces se lee como relleno de plantilla; escrita
  // enorme y cortada por los bordes se lee como tipografía de tapa.
  const size = Math.round(Math.min(H * 0.30, Math.max(H * 0.16, (W * 0.62) / Math.max(4, limpio.length))));
  const veces = Math.max(2, Math.ceil(W / Math.max(300, limpio.length * size * 0.56)) + 1);
  const texto = Array.from({ length: veces }, () => limpio.toUpperCase()).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  return `<div data-deco style="position:absolute; left:${-Math.round(PANEL.w * 0.16)}px; top:${r1(H * top)}px;
    z-index:2; white-space:nowrap; font-family:'Anton',sans-serif; font-size:${size}px;
    line-height:1; letter-spacing:${Math.round(H * 0.004)}px; color:rgba(255,255,255,.05);">${texto}</div>`;
}

/**
 * Riel continuo: la línea horizontal sobre la que se apoyan todos los titulares. Lleva una
 * marca por cuadro (las que ya se ven en Instagram como puntitos, pero acá impresas y
 * llenándose) y una FLECHA que arranca en el primer cuadro y termina dentro del segundo:
 * cruza la costura, así que en el cuadro 1 se ve una flecha que apunta a algo que todavía
 * no está. Es la invitación a deslizar, dibujada.
 */
function railLayer(W, H, n, { y = 0.702 } = {}) {
  const yPx = Math.round(H * y);
  const marcas = [];
  for (let i = 0; i < n; i += 1) {
    const x = Math.round((i + 0.5) * PANEL.w);
    const activa = i === 0;
    marcas.push(`<div style="position:absolute; left:${x - 26}px; top:${yPx - 5}px; width:52px; height:10px;
      background:${activa ? ACCENT : 'rgba(255,255,255,.30)'}; border-radius:6px;"></div>`);
  }
  const flechaX0 = Math.round(PANEL.w * 0.72);
  const flechaX1 = Math.round(PANEL.w * 1.14); // cruza la costura del primer corte
  return `<div style="position:absolute; left:0; top:${yPx}px; width:${W}px; height:2px; z-index:4;
    background:linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.22) 4%, rgba(255,255,255,.22) 96%, rgba(255,255,255,0) 100%);"></div>
  <div style="position:absolute; left:${flechaX0}px; top:${yPx - 1}px; width:${flechaX1 - flechaX0}px; height:4px; z-index:5;
    background:linear-gradient(90deg, rgba(193,68,12,0) 0%, ${ACCENT} 40%, ${ACCENT} 100%); border-radius:3px;"></div>
  <div style="position:absolute; left:${flechaX1 - 16}px; top:${yPx - 12}px; width:0; height:0; z-index:5;
    border-top:12px solid transparent; border-bottom:12px solid transparent; border-left:20px solid ${ACCENT};"></div>
  <div style="position:absolute; z-index:5; left:0; top:${yPx}px; width:${W}px; height:0;">
    ${marcas.join('')}
  </div>`;
}

/** Grano de imprenta, continuo sobre toda la tira (rompe el degradado plano). */
function grainLayer(opacity = 0.2) {
  return `<div data-deco style="position:absolute; inset:0; z-index:9; pointer-events:none; opacity:${opacity};
    background-image:url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'180\\' height=\\'180\\'><filter id=\\'n\\'><feTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.8\\' numOctaves=\\'3\\'/></filter><rect width=\\'180\\' height=\\'180\\' filter=\\'url(%23n)\\' opacity=\\'0.5\\'/></svg>');
    background-repeat:repeat; mix-blend-mode:overlay;"></div>`;
}

/* =========================================================================
 * CONTENIDO DE CADA CUADRO
 * ========================================================================= */

/** Cuerpo tipográfico de un cuadro: número, titular y bajada, sobre la línea de base. */
function panelText(panel, i, n, { railY }) {
  const H = PANEL.h;
  const padX = 78;
  const top = Math.round(railY * H) + 46;
  const largo = String(panel.headline || '').length;
  // El titular achica con el largo: sin esto, un titular de 5 palabras se comía la bajada.
  const size = largo > 46 ? 62 : largo > 30 ? 72 : largo > 18 ? 84 : 96;
  const numero = String(i + 1).padStart(2, '0');
  const total = String(n).padStart(2, '0');
  return `<div style="position:absolute; left:${padX}px; right:${padX}px; top:${top}px; z-index:6;
      display:flex; flex-direction:column; gap:16px;">
    <div style="display:flex; align-items:center; gap:14px;">
      <span style="font-family:'Inter',sans-serif; font-weight:800; font-size:20px; letter-spacing:4px; color:${ACCENT};">${numero}</span>
      <span style="width:26px; height:2px; background:rgba(255,255,255,.28);"></span>
      <span style="font-family:'Inter',sans-serif; font-weight:600; font-size:19px; letter-spacing:4px; color:rgba(255,255,255,.5);">${esc(panel.kicker || total)}</span>
    </div>
    ${panel.headline ? `<div style="font-family:'Anton',sans-serif; font-size:${size}px; line-height:.98;
      letter-spacing:.5px; color:#fff; text-transform:uppercase; text-shadow:0 6px 26px rgba(0,0,0,.5);">${esc(panel.headline)}</div>` : ''}
    ${panel.deck ? `<div style="font-family:'Inter',sans-serif; font-weight:500; font-size:29px; line-height:1.36;
      color:rgba(255,255,255,.7); max-width:${PANEL.w - padX * 2 - 40}px;">${esc(panel.deck)}</div>` : ''}
  </div>`;
}

/** Botón de cierre del último cuadro (llamado a la acción + beneficios reales). */
function ctaBlock(panel, { railY }) {
  const H = PANEL.h;
  const padX = 78;
  const beneficios = (panel.benefits || []).filter(Boolean).slice(0, 2);
  const top = Math.round(railY * H) + 46;
  return `<div style="position:absolute; left:${padX}px; right:${padX}px; top:${top}px; z-index:6;
      display:flex; flex-direction:column; gap:20px;">
    ${panel.headline ? `<div style="font-family:'Anton',sans-serif; font-size:${String(panel.headline).length > 24 ? 74 : 88}px;
      line-height:.98; color:#fff; text-transform:uppercase; text-shadow:0 6px 26px rgba(0,0,0,.5);">${esc(panel.headline)}</div>` : ''}
    ${beneficios.length ? `<div style="display:flex; flex-direction:column; gap:10px;">
      ${beneficios.map((b) => `<div style="display:flex; align-items:center; gap:12px;">
        <span style="width:9px; height:9px; background:${ACCENT}; border-radius:2px; flex:0 0 auto;"></span>
        <span style="font-family:'Inter',sans-serif; font-weight:600; font-size:27px; color:rgba(255,255,255,.78);">${esc(b)}</span>
      </div>`).join('')}
    </div>` : ''}
    <div style="margin-top:6px; align-self:flex-start; display:inline-flex; align-items:center; gap:14px;
      background:${ACCENT}; color:#fff; font-family:'Inter',sans-serif; font-weight:800; font-size:28px;
      letter-spacing:.5px; padding:22px 44px; border-radius:100px;">
      ${esc(panel.ctaLabel || 'Comprá online')} <span style="font-size:30px; line-height:1;">&rarr;</span>
    </div>
  </div>`;
}

/* =========================================================================
 * ETIQUETA CON FLECHA ("esto es el pantalón cargo")
 *
 * Pedido del dueño (sep-2026): una pieza con VARIOS productos donde cada prenda tenga
 * su nombre señalado. Sin la flecha, dos prendas y dos nombres sueltos no dicen cuál
 * es cuál — y ahí la pieza deja de informar y pasa a decorar.
 *
 * La etiqueta se apoya en la geometría que ya calculó la tira (centro y alto de la
 * tinta de cada prenda), así que apunta a la prenda REAL y no a una posición fija.
 * Va SIEMPRE adentro de su cuadro: es información, y lo que cruza la costura queda
 * ilegible en el feed (regla 1 de la composición).
 * ========================================================================= */
function labelCallout(g, texto, { indice, panelW, H }) {
  const nombre = String(texto || '').trim();
  if (!nombre) return '';
  const corto = nombre.length > 26 ? `${nombre.slice(0, 25)}…` : nombre;

  const cxPx = g.cx * panelW;
  const inkHpx = g.inkH * H;
  const anchoPx = inkHpx * g.inkRatio;
  const y = Math.round(g.fila.bottom * H - inkHpx * 0.62);

  const RAYA = 84;                          // largo de la línea que va del nombre a la prenda
  const pill = corto.length * 16 + 56;      // ancho aproximado de la cápsula (fuente de 29px)
  const largo = RAYA + pill;
  const izq = indice * panelW + 56;         // la etiqueta NUNCA cruza la costura: es información
  const der = (indice + 1) * panelW - 56;

  // Lado preferido: donde hay aire. Si de ese lado no entra entera, se prueba el otro;
  // si no entra de ninguno (prenda enorme), se acomoda contra el borde del cuadro.
  const enElCuadro = cxPx - indice * panelW;
  let derecha = enElCuadro < panelW * 0.52;
  const punta = (haciaDerecha) => Math.round(cxPx + (haciaDerecha ? anchoPx * 0.30 : -anchoPx * 0.30));
  const entra = (haciaDerecha) => (haciaDerecha
    ? punta(true) + largo <= der && punta(true) >= izq
    : punta(false) - largo >= izq && punta(false) <= der);
  if (!entra(derecha) && entra(!derecha)) derecha = !derecha;

  let x = punta(derecha);
  if (derecha) x = Math.min(Math.max(x, izq), der - largo);
  else x = Math.max(Math.min(x, der), izq + largo);

  /* Triángulo CSS: con los bordes de arriba y abajo transparentes, el borde macizo
     apunta al lado contrario. border-right = punta hacia la IZQUIERDA (etiqueta a la
     derecha de la prenda) y border-left = punta hacia la derecha. */
  const flecha = `<span style="width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;
    border-${derecha ? 'right' : 'left'}:12px solid ${ACCENT};"></span>`;
  const raya = `<span style="width:${RAYA - 12}px; height:3px; background:${ACCENT};"></span>`;
  // 29px sobre un cuadro de 1080: en el feed de un celular se lee sin acercar la pantalla.
  const capsula = `<span style="font-family:'Inter',sans-serif; font-weight:800; font-size:29px; letter-spacing:.4px;
      text-transform:uppercase; color:#fff; background:rgba(10,10,10,.86); border:2px solid ${ACCENT};
      border-radius:100px; padding:13px 26px; white-space:nowrap;">${esc(corto)}</span>`;

  // Con la etiqueta a la DERECHA el orden visual arranca en la flecha (row-reverse) y el
  // bloque crece hacia la derecha desde la punta; a la izquierda es al revés y el bloque
  // termina justo en la punta (por eso el translateX(-100%)).
  return `<div style="position:absolute; left:${x}px; top:${y}px; z-index:8;
      transform:translateY(-50%)${derecha ? '' : ' translateX(-100%)'};
      display:flex; align-items:center; ${derecha ? 'flex-direction:row-reverse;' : ''}">
    ${capsula}${raya}${flecha}
  </div>`;
}

/** "Deslizá" del primer cuadro: la única instrucción explícita de toda la tira. */
function swipeHint() {
  const H = PANEL.h;
  return `<div style="position:absolute; right:78px; top:${Math.round(H * 0.702) - 62}px; z-index:6;
    display:flex; align-items:center; gap:12px; font-family:'Inter',sans-serif; font-weight:700;
    font-size:21px; letter-spacing:4px; color:rgba(255,255,255,.62);">
    <span>DESLIZÁ</span>
    <span style="font-size:26px; line-height:1; color:${ACCENT};">&rarr;</span>
  </div>`;
}

/* =========================================================================
 * LA TIRA
 * ========================================================================= */

/**
 * Arma el HTML de la tira completa. `panels` trae el contenido de cada cuadro y el módulo
 * resuelve TODA la geometría: el llamador no ubica nada a mano.
 *
 * panels[i] = {
 *   kind: 'hero' | 'detalle' | 'variantes' | 'cta',
 *   kicker, headline, deck, badge,
 *   cutout: { url, box, aspect } | null,   // recorte de la prenda (preferido)
 *   photoUrl: string | null,               // plan B si no hay recorte
 *   benefits: [], ctaLabel                 // sólo el cuadro de cierre
 * }
 *
 * `helpers` = { headHtml(w, h), logoHtml } — se inyectan desde imageRenderer para no
 * duplicar el encuadre del logo (que compensa el margen transparente del PNG) ni el <head>
 * con las tipografías. Mismo patrón que templatesModern.
 */
function buildPanoramaHtml(opts, helpers = {}) {
  const { n, w: W, h: H, panelW } = panoramaDims((opts.panels || []).length);
  const panels = (opts.panels || []).slice(0, n);
  const seed = Math.abs(Number(opts.seed) || 0);
  const { nombre: ritmo, filas } = rhythmFor(n, seed);
  const flip = seed % 2 === 1;
  const railY = 0.702;
  /*
   * MODO ESCENA: la tira es UNA fotografía generada con la prenda ya adentro (ver
   * generatePanoramaScene en src/ai.js). No hay recortes que colocar, así que todo el
   * aparato de ritmos, cruces y pozos de luz —que existe para que un PNG pegado no se
   * lea como calcomanía— no corre. Lo que sí queda es la tipografía: el riel, la palabra
   * corrida y los titulares son los que siguen cosiendo un cuadro con el siguiente.
   */
  const modoEscena = Boolean(opts.sceneUrl);

  const headHtml = helpers.headHtml || ((w, h) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>*{margin:0;padding:0;box-sizing:border-box;} html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:'Inter',Arial,sans-serif;}</style>`);

  /* ------------------------------------------------------------------
   * PRENDAS: escala corregida por tipo de toma y UNA que cruza la costura.
   *
   * Cuál cruza se decide acá y no en la tabla de ritmos porque depende de la foto: una
   * prenda ANGOSTA (cuerpo entero) puesta sobre la costura asoma 60px del otro lado y eso
   * no se lee como continuidad, se lee como un error de encuadre. Cruza la más ANCHA de
   * todas menos la portada —que tiene que funcionar sola en el feed—, y sólo si al cruzar
   * le queda cuerpo suficiente de los dos lados.
   *
   * Si la elegida es la del CIERRE, cruza al revés: el grueso queda en el último cuadro y
   * lo que asoma es su comienzo, en el cuadro anterior. Da lo mismo para la continuidad y
   * suma un motivo más para deslizar (aparece algo entrando por el costado); hizo falta
   * porque en un carrusel de 3 cuadros el único candidato del medio suele ser una foto de
   * cuerpo entero, que es angosta, y entonces la tira se quedaba sin ningún cruce.
   * ------------------------------------------------------------------ */
  const geoms = panels.map((panel, i) => {
    const fila = filas[i] || filas[filas.length - 1];
    const cutout = (panel.cutout && panel.cutout.url) ? panel.cutout : null;
    const tieneFoto = Boolean(cutout || panel.photoUrl);
    const inkRatio = cutout ? inkRatioOf(cutout) : FOTO_RETRATO;
    const inkH = fitInk(fila.inkH, inkRatio, fila.bottom);
    return { fila, cutout, tieneFoto, inkRatio, inkH, cx: fila.cx };
  });

  // El ancho de tinta se compara en cuadros (1.0 = 1080px) para poder decir "que ocupe al
  // menos medio cuadro de cada lado".
  const anchoEnCuadros = (g) => (g.inkH * H * g.inkRatio) / panelW;
  const ANCHO_MINIMO_PARA_CRUZAR = 0.40;
  let cruce = -1;
  for (let i = 1; i < n; i += 1) {
    if (!geoms[i].tieneFoto) continue;
    if (anchoEnCuadros(geoms[i]) < ANCHO_MINIMO_PARA_CRUZAR) continue;
    if (cruce < 0 || anchoEnCuadros(geoms[i]) > anchoEnCuadros(geoms[cruce])) cruce = i;
  }
  if (cruce >= 0) {
    const g = geoms[cruce];
    // Lo que cruza, cruza en grande (regla 2). Con recorte se agranda la prenda; sin
    // recorte, el bloque de foto pasa de retrato a apaisado — un rectángulo angosto
    // partido por la costura asoma un hilito y se lee como error de encuadre.
    if (g.cutout) g.inkH = Math.min(g.inkH * 1.18, g.fila.bottom - TOPE_ARRIBA);
    else g.inkRatio = FOTO_APAISADA;
    /*
     * CUÁNTO ASOMA DEL OTRO LADO. El grueso de la prenda queda en su propio cuadro (que
     * es donde está su titular) y por la costura asoma una punta. Esa punta se calcula
     * con tres condiciones a la vez:
     *   · mínimo absoluto (0,16 de cuadro ≈ 170px): menos que eso parece un error de
     *     encuadre, no una imagen que sigue;
     *   · proporcional (28%) cuando la prenda es ancha, para que el cuadro siguiente
     *     reciba una porción de verdad;
     *   · tope del 36% del ancho, que es la condición que protege lo importante: con
     *     más, la costura se acerca al eje de la prenda y en una foto de cuerpo entero
     *     terminaría partiendo la CARA del modelo al medio.
     */
    const anchoC = anchoEnCuadros(g);
    const punta = Math.min(Math.max(0.16, anchoC * 0.28), anchoC * 0.36);
    g.cx = cruce === n - 1
      ? cruce + anchoC / 2 - punta   // el cierre: asoma su comienzo en el cuadro anterior
      : (cruce + 1) + punta - anchoC / 2;
    g.cruza = true;
  }

  const etiquetas = modoEscena ? '' : panels.map((panel, i) => (
    (panel.label && geoms[i].tieneFoto && panel.kind !== 'cta')
      ? labelCallout(geoms[i], panel.label, { indice: i, panelW, H })
      : ''
  )).join('');

  const medias = modoEscena ? '' : panels.map((panel, i) => {
    const g = geoms[i];
    if (!g.tieneFoto) return '';
    const cx = g.cx * panelW;
    const bottomPx = g.fila.bottom * H;
    const inkHpx = g.inkH * H;
    const luz = productLight(cx, bottomPx, inkHpx * g.inkRatio, inkHpx);
    const capa = g.cutout
      ? cutoutInk(g.cutout.url, {
        box: g.cutout.box, aspect: g.cutout.aspect,
        cx, inkH: g.inkH, bottom: g.fila.bottom, z: 3,
      })
      : photoCard(panel.photoUrl, { cx, inkH: g.inkH, bottom: g.fila.bottom, aspect: g.inkRatio, z: 3 });
    return luz + capa;
  }).join('');

  /* --- cuadros: contenido tipográfico, cada uno encerrado en sus 1080px --- */
  const cuadros = panels.map((panel, i) => {
    const esCierre = panel.kind === 'cta';
    const contenido = esCierre ? ctaBlock(panel, { railY }) : panelText(panel, i, n, { railY });
    const marca = i === 0 && helpers.logoHtml
      ? `<div style="position:absolute; left:78px; top:64px; z-index:7;">${helpers.logoHtml}</div>` : '';
    const badge = i === 0 && panel.badge
      ? `<div style="position:absolute; right:78px; top:70px; z-index:7; background:${ACCENT}; color:#fff;
          font-family:'Inter',sans-serif; font-weight:800; font-size:19px; letter-spacing:3px; text-transform:uppercase;
          padding:10px 18px; border-radius:5px;">${esc(panel.badge)}</div>` : '';
    const hint = i === 0 ? swipeHint() : '';
    const dominio = i === n - 1
      ? `<div style="position:absolute; left:78px; bottom:56px; z-index:7; display:flex; align-items:center; gap:12px;">
          <span style="width:12px; height:12px; background:${ACCENT}; border-radius:3px;"></span>
          <span style="font-family:'Inter',sans-serif; font-size:22px; font-weight:700; letter-spacing:3px; color:rgba(255,255,255,.82);">${esc(String(config.brand.site || '').toUpperCase())}</span>
        </div>` : '';
    return `<div style="position:absolute; left:${i * panelW}px; top:0; width:${panelW}px; height:${H}px; z-index:6;">
      ${marca}${badge}${contenido}${hint}${dominio}
    </div>`;
  }).join('');

  return `${headHtml(W, H)}
  <body style="width:${W}px; height:${H}px; position:relative; background:${INK_BG}; overflow:hidden;">
    ${modoEscena ? sceneLayer(W, H, opts.sceneUrl, { railY }) : groundLayer(W, H, opts.backdropUrl, n)}
    ${modoEscena ? '' : runningWord(W, H, opts.runningWord, { top: flip ? 0.115 : 0.085 })}
    ${modoEscena ? '' : warmSweep(W, H, { flip })}
    ${medias}
    ${railLayer(W, H, n, { y: railY })}
    ${etiquetas}
    ${cuadros}
    ${grainLayer(modoEscena ? 0.09 : (opts.backdropUrl ? 0.14 : 0.2))}
    <!-- ritmo: ${ritmo} -->
  </body></html>`;
}

module.exports = {
  buildPanoramaHtml,
  panoramaDims,
  rhythmFor,
  PANEL,
  MIN_PANELS,
  MAX_PANELS,
};
