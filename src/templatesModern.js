const config = require('./config');

/**
 * PLANTILLAS MODERNAS (recorte / ficha / editorial).
 *
 * Nacen del pedido de ago-2026: las piezas salían "básicas y sobrecargadas". El
 * diagnóstico sobre piezas reales publicadas fue concreto:
 *   - la foto del catálogo se pegaba tal cual y quedaba el modelo cortado por el torso
 *     y los pies fuera de cuadro (el "formato raro"),
 *   - encima se apilaban logo + eyebrow + titular + barra de acento + chips + botón CTA
 *     + barra de dominio: seis elementos de marca compitiendo en la misma pieza,
 *   - los chips de beneficios eran píldoras con un tilde en círculo naranja (dated),
 *   - las educativas salían con fondo blanco casi vacío.
 *
 * Estas tres plantillas parten del RECORTE de la prenda (ver productCutout.js), que es
 * lo que habilita composiciones que antes no se podían hacer:
 *   recorte   -> el titular pasa POR DETRÁS de la prenda,
 *   ficha     -> líneas finas que salen de puntos reales del producto hacia cada spec,
 *   editorial -> tarjeta didáctica oscura con jerarquía, sin el campo blanco vacío.
 *
 * Regla de aire compartida: como MUCHO dos elementos de marca por pieza. El logo va
 * chico o no va (si el titular ya dice BLACKS), y la barra de dominio no convive con
 * un botón de CTA.
 */

const ACCENT = config.brand.colors.darkOrange; // #C1440C
const INK = '#0A0A0A';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Grano de película: rompe el degradado plano y da terminación de imprenta. */
function grain(opacity = 0.22) {
  return `<div style="position:absolute; inset:0; z-index:9; pointer-events:none; opacity:${opacity};
    background-image:url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'160\\'><filter id=\\'n\\'><feTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.85\\' numOctaves=\\'3\\'/></filter><rect width=\\'160\\' height=\\'160\\' filter=\\'url(%23n)\\' opacity=\\'0.5\\'/></svg>');
    mix-blend-mode:overlay;"></div>`;
}

/**
 * La prenda recortada, con desvanecido inferior.
 *
 * El fundido de abajo no es sólo estética: el recorte por color se come las partes
 * BLANCAS del sujeto que se conectan con el piso del estudio (zapatillas blancas,
 * el ruedo de una remera clara), y ahí es justo donde se ven los artefactos. El
 * desvanecido los disuelve y de paso ancla la prenda al fondo en vez de dejarla
 * flotando recortada como una calcomanía.
 */
function cutoutLayer(cutUrl, { top, height, fade = true, z = 3, cortadaArriba = false } = {}) {
  /*
   * Desvanecido ARRIBA cuando la foto de catálogo viene cortada por el borde superior
   * (el clásico encuadre de torso). Sin esto, la remera clara del modelo terminaba en
   * una línea recta contra el fondo oscuro y se leía como un bloque blanco pegado —
   * el mismo "torso cortado" del que ya se había quejado el dueño. Con el fundido, el
   * corte se disuelve y la prenda parece emerger de la penumbra.
   */
  const arriba = cortadaArriba
    ? 'transparent 0%, rgba(0,0,0,.45) 7%, #000 18%, '
    : '#000 0%, ';
  const g = `linear-gradient(to bottom, ${arriba}#000 72%, rgba(0,0,0,.5) 88%, transparent 99%)`;
  const mask = fade ? `mask-image:${g}; -webkit-mask-image:${g};` : '';
  return `<img src="${esc(cutUrl)}" style="position:absolute; left:50%; transform:translateX(-50%);
    top:${top}px; height:${height}px; z-index:${z}; object-fit:contain;
    filter:drop-shadow(0 30px 60px rgba(0,0,0,.55)); ${mask}"/>`;
}

/** Marca chica (una sola, arriba a la izquierda). */
function markSmall(logoUrl, { top, left, height = 46, dark = true }) {
  if (!logoUrl) {
    return `<div style="position:absolute; top:${top}px; left:${left}px; z-index:8;
      font-family:'Inter',sans-serif; font-weight:800; font-size:${Math.round(height * 0.46)}px;
      letter-spacing:${Math.round(height * 0.17)}px; color:${dark ? 'rgba(255,255,255,.92)' : INK};">BLACKS</div>`;
  }
  return `<img src="${esc(logoUrl)}" style="position:absolute; top:${top}px; left:${left}px; z-index:8;
    height:${height}px; object-fit:contain; opacity:.95;"/>`;
}

/** Precio: número grande + tachado chico. Sin píldoras ni círculos con tilde. */
function priceBlock(price, promoPrice, { size = 74, dark = true } = {}) {
  if (!price) return '';
  const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const hasPromo = promoPrice && Number(promoPrice) > 0 && Number(promoPrice) < Number(price);
  const shown = hasPromo ? promoPrice : price;
  const off = hasPromo ? Math.round((1 - Number(promoPrice) / Number(price)) * 100) : 0;
  return `<div style="display:flex; align-items:baseline; gap:14px;">
    <span style="font-family:'Anton',sans-serif; font-size:${size}px; line-height:.9; color:${dark ? '#fff' : INK};">$${fmt(shown)}</span>
    ${hasPromo ? `<span style="font-family:'Inter',sans-serif; font-weight:600; font-size:${Math.round(size * 0.32)}px; color:${dark ? 'rgba(255,255,255,.45)' : '#8a8a90'}; text-decoration:line-through;">$${fmt(price)}</span>
    <span style="font-family:'Inter',sans-serif; font-weight:800; font-size:${Math.round(size * 0.3)}px; color:${ACCENT}; letter-spacing:.5px;">${off}% OFF</span>` : ''}
  </div>`;
}

/* ========================================================================== *
 * 1) RECORTE — el titular pasa POR DETRÁS de la prenda.                       *
 * ========================================================================== */
/**
 * Parte un titular en DOS líneas cortas y calcula el cuerpo que entra a lo ancho.
 *
 * Hace falta porque la primera versión imprimía el titular entero a 150px: con
 * "Bombacha de campo Pampero: resistencia clásica" salían cuatro renglones pisados
 * contra la prenda, ilegibles. Acá el texto se recorta a las palabras que de verdad
 * comunican y el cuerpo se deduce del renglón más largo (Anton avanza ~0,42em por
 * carácter), así que nunca desborda ni hay que adivinar un tamaño fijo.
 */
function fitTwoLines(title, { maxWidth, maxSize, minSize = 64, maxWords = 5 }) {
  const limpio = String(title || '')
    .replace(/[:;–—]\s*/g, ' ')          // los subtítulos con dos puntos no aportan acá
    .replace(/\s+/g, ' ')
    .trim();
  const words = limpio.split(' ').filter(Boolean).slice(0, maxWords);
  if (!words.length) return null;

  /*
   * Corte por longitud, no por cantidad: dos renglones de ancho parecido. Pero NUNCA
   * cortando después de una preposición o artículo: "Botines De Seguridad Grafa" se
   * partía en "BOTINES DE" / "SEGURIDAD GRAFA" y el primer renglón terminaba colgado en
   * un "DE" suelto (se vio en la pieza real del slot #869). Se penaliza ese corte tan
   * fuerte que sólo se elige si no hay ninguna otra opción.
   */
  const COLGANTE = /^(de|del|la|el|los|las|un|una|y|e|o|u|con|sin|para|por|en|a|al|que|su|sus|tu|tus)$/i;
  const total = words.join(' ').length;
  let best = 1; let bestDiff = Infinity;
  for (let i = 1; i < Math.max(2, words.length); i += 1) {
    const a = words.slice(0, i).join(' ').length;
    let diff = Math.abs(a - (total - a));
    if (COLGANTE.test(words[i - 1])) diff += 1000;
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  const l1 = words.slice(0, best).join(' ');
  const l2 = words.slice(best).join(' ');
  const largest = Math.max(l1.length, l2.length || 1);
  const size = Math.max(minSize, Math.min(maxSize, Math.floor(maxWidth / (largest * 0.42))));
  return { l1, l2, size };
}

function buildRecorteHtml(opts, g, head) {
  const { w, h, isStory } = g;
  const kicker = opts.kicker || null;
  const cut = opts.cutoutUrl;

  /*
   * El titular se parte en dos renglones que se anclan ARRIBA y ABAJO de la prenda, no
   * centrados: si van al medio quedan íntegramente tapados y el efecto no se entiende.
   * Con este reparto, cada renglón asoma por los costados y se cruza con la prenda —
   * que es exactamente el "texto que pasa por atrás del pantalón" que se pidió.
   */
  const fitted = fitTwoLines(opts.displayTitle || opts.title || opts.overlayTitle, {
    maxWidth: w - g.padX * 2,
    maxSize: isStory ? 168 : 150,
  });
  /*
   * LA COMPOSICIÓN SE ADAPTA A LA FORMA DEL PRODUCTO.
   *
   * El layout estaba pensado para una prenda VERTICAL (un pantalón ocupa una columna
   * alta y angosta, y los renglones asoman por los costados). Con un producto ANCHO
   * —un botín de perfil, una faja, una gorra— la silueta se extiende de lado a lado y
   * tapaba el segundo renglón entero: la pieza real del slot #869 se leía "BOTINES DE"
   * y abajo dos letras sueltas. Con la caja del recorte se sabe la proporción real del
   * sujeto, así que la pieza se arma distinto según el caso:
   *   - alto y angosto  -> prenda grande, renglones cruzándola por los costados;
   *   - ancho           -> prenda en una franja central más chica, y los renglones
   *                        ARRIBA y ABAJO de esa franja, despejados.
   */
  const box = opts.cutoutBox || null;
  const propSujeto = box
    ? ((box.x1 - box.x0) * w) / Math.max(1, (box.y1 - box.y0) * h)
    : 0.4;
  const anchoDeMas = propSujeto >= 0.75;

  const cutHeight = anchoDeMas
    ? Math.round(h * (isStory ? 0.40 : 0.42))
    : Math.round(h * (isStory ? 0.68 : 0.72));
  const cutTop = anchoDeMas
    ? Math.round(h * (isStory ? 0.32 : 0.30))
    : Math.round(h * (isStory ? 0.20 : 0.16));
  const l1Top = anchoDeMas
    ? Math.round(h * (isStory ? 0.215 : 0.180))
    : Math.round(h * (isStory ? 0.255 : 0.215));
  /*
   * El segundo renglón se ancla al BORDE REAL de la silueta, no a una fracción fija del
   * lienzo: se monta sobre el último tercio del producto para conservar el cruce entre
   * texto y prenda (que es la firma de esta plantilla) sin taparlo. Con una fracción fija
   * el renglón caía en el aire y la pieza quedaba partida en dos mitades sueltas.
   */
  const l2Top = anchoDeMas
    ? Math.round(cutTop + cutHeight * 0.80)
    : Math.round(h * (isStory ? 0.605 : 0.590));

  return `${head}
  <body style="position:relative; width:${w}px; height:${h}px; background:#0B0B0D; overflow:hidden;">
    <!-- fondo: carbón con halo cálido detrás de la prenda -->
    <div style="position:absolute; inset:0; background:
      radial-gradient(120% 80% at 50% 30%, #2A2018 0%, #141416 45%, #0B0B0D 100%);"></div>
    <div style="position:absolute; left:50%; top:${Math.round(h * 0.30)}px; transform:translate(-50%,-50%);
      width:${Math.round(w * 1.1)}px; height:${Math.round(w * 1.1)}px; border-radius:50%;
      background:radial-gradient(circle, ${ACCENT}44 0%, transparent 62%); z-index:1;"></div>

    ${kicker ? `<div style="position:absolute; top:${Math.round(h * (isStory ? 0.155 : 0.105))}px; left:0; right:0;
      z-index:2; text-align:center; font-family:'Inter',sans-serif; font-weight:700;
      font-size:${isStory ? 26 : 23}px; letter-spacing:${isStory ? 7 : 6}px; color:${ACCENT};">${esc(String(kicker).toUpperCase())}</div>` : ''}

    <!-- TITULAR (z-index 2): queda DEBAJO de la prenda (z-index 3) -->
    <!--
      Los renglones NO van centrados: el primero se apoya a la IZQUIERDA y el segundo a la
      DERECHA. Centrados, la prenda (que también está al centro) les tapaba justo el medio
      y el titular quedaba "PANTAL___CAZADOR". Apoyados en los costados, cada uno cruza la
      silueta por un borde: se conserva el efecto de pasar por detrás y la palabra se sigue
      leyendo. Es además una composición más editorial que el bloque centrado.
    -->
    ${fitted ? `
    <div style="position:absolute; top:${l1Top}px; left:${g.padX}px; right:${g.padX}px; z-index:2; text-align:left;
      font-family:'Anton',sans-serif; font-size:${fitted.size}px; line-height:.86; color:#fff;
      text-transform:uppercase; letter-spacing:-1px; white-space:nowrap;
      text-shadow:0 8px 40px rgba(0,0,0,.55);">${esc(fitted.l1)}</div>
    ${fitted.l2 ? `<div style="position:absolute; top:${l2Top}px; left:${g.padX}px; right:${g.padX}px; z-index:2; text-align:right;
      font-family:'Anton',sans-serif; font-size:${fitted.size}px; line-height:.86; color:transparent;
      -webkit-text-stroke:2px rgba(255,255,255,.62); text-transform:uppercase; letter-spacing:-1px;
      white-space:nowrap;">${esc(fitted.l2)}</div>` : ''}` : ''}

    <!-- LA PRENDA, por encima del titular -->
    ${cut ? cutoutLayer(cut, { top: cutTop, height: cutHeight, z: 3, cortadaArriba: Boolean(box && box.y0 <= 0.02) }) : ''}

    <!-- pie: precio a la izquierda, dominio a la derecha. Nada más. -->
    <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${isStory ? g.safeBottom + 60 : 62}px;
      z-index:6; display:flex; ${isStory
        ? 'flex-direction:column; align-items:flex-start; gap:16px;'
        : 'align-items:flex-end; justify-content:space-between; gap:20px;'}">
      ${priceBlock(opts.price, opts.promoPrice, { size: isStory ? 84 : 74 })}
      <div style="font-family:'Inter',sans-serif; font-weight:700; font-size:${isStory ? 22 : 19}px;
        letter-spacing:2.5px; color:rgba(255,255,255,.5); ${isStory ? '' : 'padding-bottom:8px;'}">BLACKSINDUMENTARIA.COM.AR</div>
    </div>

    ${markSmall(opts.logos && opts.logos.light, { top: isStory ? g.safeTop + 10 : 52, left: g.padX, height: isStory ? 52 : 44 })}
    ${grain(0.18)}
  </body></html>`;
}

/* ========================================================================== *
 * 2) FICHA — ficha técnica con líneas que salen de la prenda.                  *
 * ========================================================================== */
/**
 * Los anclajes salen de la CAJA REAL del recorte (productCutout devuelve el bounding box
 * del sujeto), no de posiciones fijas: si la prenda está más a la izquierda o es más
 * corta, las líneas la siguen. Sin eso, las guías apuntaban al aire.
 */
function buildFichaHtml(opts, g, head) {
  const { w, h, isStory } = g;
  const cut = opts.cutoutUrl;
  const box = opts.cutoutBox || { x0: 0.3, y0: 0.05, x1: 0.7, y1: 0.95 };
  const specs = (opts.specs || opts.points || []).slice(0, 4);
  const title = String(opts.title || opts.overlayTitle || '').trim();

  const cutHeight = Math.round(h * (isStory ? 0.70 : 0.68));
  const cutTop = Math.round(h * (isStory ? 0.19 : 0.17));
  // Dónde cae la prenda dentro del lienzo, en píxeles, según su caja real.
  const cutW = cutHeight * ((box.x1 - box.x0) / Math.max(0.01, box.y1 - box.y0)) * 0.62;
  const leftEdge = w / 2 - cutW / 2;
  const rightEdge = w / 2 + cutW / 2;

  /*
   * ALTURA DE CADA GUÍA SEGÚN LO QUE DICE EL SPEC. Con alturas repartidas a ciegas, la
   * línea de "refuerzo en rodilla" terminaba apuntando al bolsillo y la de "bolsillos
   * cargo" a la pantorrilla: la pieza se contradecía sola. Estas fracciones son sobre el
   * alto de la prenda (0 = arriba). Lo que no matchea ningún término se reparte en el
   * espacio que queda libre.
   */
  const ALTURA_POR_TERMINO = [
    [/cintur|pretin|tiro|cierre|bot[oó]n|elastizad/i, 0.10],
    [/bolsill|cargo|pasador|presill/i, 0.34],
    [/rodill|refuerz|costur/i, 0.52],
    [/tela|ripstop|algod[oó]n|poli[eé]ster|gabardina|grafa|elastano|spandex|denim|tejid|g\/m|onzas?\b/i, 0.66],
    [/botamang|ruedo|puño|tobill|bajo/i, 0.80],
    [/suela|puntera|planta|calzad/i, 0.90],
  ];
  const alturaDe = (s, i, total) => {
    for (const [re, t] of ALTURA_POR_TERMINO) if (re.test(s)) return t;
    return total === 1 ? 0.45 : 0.16 + (i / Math.max(1, total - 1)) * 0.62;
  };

  // Se alternan lados; la altura la manda el contenido del spec.
  const callouts = specs.map((s, i) => {
    const isLeft = i % 2 === 0;
    const t = alturaDe(s, i, specs.length);
    const y = Math.round(cutTop + cutHeight * t);
    const anchorX = Math.round(isLeft ? leftEdge + 14 : rightEdge - 14);
    const labelX = isLeft ? g.padX : null;
    const lineLen = Math.abs(anchorX - (isLeft ? g.padX + 8 : w - g.padX - 8));
    return `
      <div style="position:absolute; top:${y - 5}px; left:${anchorX - 5}px; z-index:6;
        width:10px; height:10px; border-radius:50%; background:${ACCENT}; box-shadow:0 0 0 5px ${ACCENT}33;"></div>
      <div style="position:absolute; top:${y}px; ${isLeft ? `left:${g.padX + 8}px` : `right:${g.padX + 8}px`};
        width:${lineLen}px; height:1px; background:linear-gradient(${isLeft ? 'to right' : 'to left'},
        rgba(255,255,255,.15), rgba(255,255,255,.5)); z-index:5;"></div>
      <div style="position:absolute; top:${y - (isStory ? 54 : 48)}px;
        ${isLeft ? `left:${g.padX + 8}px` : `right:${g.padX + 8}px; text-align:right;`}
        max-width:${Math.round(w * 0.33)}px; z-index:7;">
        <div style="font-family:'Inter',sans-serif; font-weight:800; font-size:${isStory ? 25 : 22}px;
          color:#fff; line-height:1.2;">${esc(s)}</div>
      </div>`;
  }).join('');

  return `${head}
  <body style="position:relative; width:${w}px; height:${h}px; background:#0C0C0F; overflow:hidden;">
    <div style="position:absolute; inset:0; background:
      radial-gradient(90% 60% at 50% 42%, #1C1C21 0%, #0C0C0F 70%);"></div>
    <!-- retícula técnica muy sutil: da lenguaje de plano sin el look de planilla -->
    <div style="position:absolute; inset:0; opacity:.16;
      background-image:linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px),
                       linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px);
      background-size:${isStory ? 90 : 78}px ${isStory ? 90 : 78}px;"></div>

    <div style="position:absolute; top:${isStory ? g.safeTop + 4 : 50}px; left:${g.padX}px; right:${g.padX}px; z-index:7;
      display:flex; align-items:baseline; justify-content:space-between; gap:20px;">
      <div style="font-family:'Anton',sans-serif; font-size:${isStory ? 62 : 54}px; line-height:1;
        color:#fff; text-transform:uppercase; letter-spacing:-.5px; max-width:${Math.round(w * 0.72)}px;">${esc(title)}</div>
      <div style="font-family:'Inter',sans-serif; font-weight:700; font-size:${isStory ? 20 : 17}px;
        letter-spacing:4px; color:${ACCENT}; white-space:nowrap;">FICHA</div>
    </div>

    ${cut ? cutoutLayer(cut, { top: cutTop, height: cutHeight, z: 4, cortadaArriba: Boolean(box && box.y0 <= 0.02) }) : ''}
    ${callouts}

    <div style="position:absolute; left:${g.padX}px; right:${g.padX}px; bottom:${isStory ? g.safeBottom + 54 : 56}px;
      z-index:7; display:flex; ${isStory
        ? 'flex-direction:column; align-items:flex-start; gap:14px;'
        : 'align-items:flex-end; justify-content:space-between; gap:20px;'}">
      ${priceBlock(opts.price, opts.promoPrice, { size: isStory ? 78 : 68 })}
      <div style="font-family:'Inter',sans-serif; font-weight:700; font-size:${isStory ? 21 : 18}px;
        letter-spacing:2.5px; color:rgba(255,255,255,.45); padding-bottom:6px;">BLACKSINDUMENTARIA.COM.AR</div>
    </div>
    ${grain(0.16)}
  </body></html>`;
}

/* ========================================================================== *
 * 3) EDITORIAL — la educativa, sin el campo blanco vacío.                     *
 * ========================================================================== */
/**
 * Reemplaza el 'educativo' viejo, que dejaba dos tercios de la pieza en blanco liso
 * (pieza real revisada: titular arriba, bajada de dos renglones y 900 px de nada).
 * Acá el contenido ocupa la pieza: número gigante de fondo, bloques con jerarquía y
 * una franja de acento. Funciona con o sin foto.
 */
function buildEditorialHtml(opts, g, head) {
  const { w, h, isStory } = g;
  const title = String(opts.title || opts.overlayTitle || '').trim();
  const kicker = opts.kicker || 'PARA SABER';
  const bullets = (opts.points || opts.specs || []).slice(0, 3);
  const stepNumber = opts.stepNumber || null;
  const cut = opts.cutoutUrl;
  // Bajada bajo el titular. Sin ella quedaba un pozo vacío de ~200px entre el titular
  // y la franja de acento (se veía en la pieza real "Guía para elegir tu campera").
  const deck = opts.deck || opts.subtitle || null;

  return `${head}
  <body style="position:relative; width:${w}px; height:${h}px; background:#101014; overflow:hidden;">
    <div style="position:absolute; inset:0; background:
      linear-gradient(155deg, #1A1A20 0%, #101014 52%, #0A0A0C 100%);"></div>
    <!-- número gigante de fondo: llena el vacío y da ritmo editorial -->
    ${stepNumber ? `<div style="position:absolute; right:${-Math.round(w * 0.06)}px; bottom:${-Math.round(h * 0.10)}px;
      font-family:'Anton',sans-serif; font-size:${Math.round(h * 0.52)}px; line-height:.8; z-index:1;
      color:transparent; -webkit-text-stroke:3px rgba(255,255,255,.07);">${esc(stepNumber)}</div>` : ''}
    <!-- franja de acento diagonal -->
    <div style="position:absolute; left:0; top:${Math.round(h * (isStory ? 0.52 : 0.50))}px; width:${w}px; height:${isStory ? 10 : 8}px;
      background:linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT}00 78%); z-index:2;"></div>

    ${cut ? `<img src="${esc(cut)}" style="position:absolute; right:${-Math.round(w * 0.10)}px;
      bottom:${isStory ? g.safeBottom : 0}px; height:${Math.round(h * (isStory ? 0.52 : 0.50))}px; z-index:3;
      object-fit:contain; opacity:.92;
      mask-image:linear-gradient(to bottom, #000 72%, transparent 100%);
      -webkit-mask-image:linear-gradient(to bottom, #000 72%, transparent 100%);"/>` : ''}

    <div style="position:absolute; ${(!bullets.length && !cut)
      ? 'top:50%; transform:translateY(-50%);'
      : `top:${isStory ? g.safeTop + 30 : 84}px;`} left:${g.padX}px;
      width:${Math.round(w * (cut ? 0.66 : 0.86))}px; z-index:5;">
      <div style="display:inline-block; font-family:'Inter',sans-serif; font-weight:800;
        font-size:${isStory ? 24 : 21}px; letter-spacing:5px; color:${ACCENT}; margin-bottom:${isStory ? 26 : 22}px;">
        ${esc(String(kicker).toUpperCase())}</div>
      <div style="font-family:'Anton',sans-serif; font-size:${isStory ? 104 : 92}px; line-height:.92;
        color:#fff; text-transform:uppercase; letter-spacing:-1px;">${esc(title)}</div>
      ${deck ? `<div style="margin-top:${isStory ? 26 : 22}px; font-family:'Inter',sans-serif; font-weight:500;
        font-size:${isStory ? 32 : 28}px; line-height:1.42; color:rgba(255,255,255,.62);
        max-width:${Math.round(w * (cut ? 0.60 : 0.78))}px;">${esc(deck)}</div>` : ''}
    </div>

    ${bullets.length ? `<div style="position:absolute; left:${g.padX}px; top:${Math.round(h * (isStory ? 0.52 : 0.50)) + (isStory ? 76 : 64)}px;
      width:${Math.round(w * (cut ? 0.60 : 0.82))}px; z-index:5; display:flex; flex-direction:column; gap:${isStory ? 26 : 22}px;">
      ${bullets.map((b, i) => `<div style="display:flex; gap:${isStory ? 20 : 17}px; align-items:flex-start;">
        <span style="font-family:'Anton',sans-serif; font-size:${isStory ? 34 : 30}px; line-height:1;
          color:${ACCENT}; min-width:${isStory ? 44 : 38}px;">${String(i + 1).padStart(2, '0')}</span>
        <span style="font-family:'Inter',sans-serif; font-weight:600; font-size:${isStory ? 30 : 26}px;
          line-height:1.32; color:rgba(255,255,255,.88);">${esc(b)}</span>
      </div>`).join('')}
    </div>` : ''}

    <div style="position:absolute; left:${g.padX}px; bottom:${isStory ? g.safeBottom + 50 : 58}px; z-index:6;
      font-family:'Inter',sans-serif; font-weight:700; font-size:${isStory ? 21 : 18}px;
      letter-spacing:2.5px; color:rgba(255,255,255,.42);">BLACKSINDUMENTARIA.COM.AR</div>
    ${grain(0.15)}
  </body></html>`;
}

module.exports = { buildRecorteHtml, buildFichaHtml, buildEditorialHtml, cutoutLayer, priceBlock, fitTwoLines, ACCENT };

/* ========================================================================== *
 * 4) BANNER — para el home de la tienda (carrusel ancho y grilla cuadrada).   *
 * ========================================================================== */
/**
 * Un banner NO es una pieza de Instagram estirada: tiene ~2 segundos de atención y se
 * ve recortado al centro en mobile. Por eso acá la regla es UNA promesa (kicker +
 * titular + a lo sumo una bajada + un botón) y nada más — el banner real de la tienda
 * apilaba dos descuentos distintos, una franja de envíos y una flecha decorativa.
 *
 * `safeCenter` es la fracción central que sobrevive al recorte de mobile: en el carrusel
 * (1920x724) es 0,62, así que todo el texto vive ahí adentro y el producto se apoya
 * contra el borde, donde puede recortarse sin perder nada.
 */
function buildBannerHtml(opts) {
  const w = opts.width || 1920;
  const h = opts.height || 724;
  const ancho = w / h > 1.6;                 // carrusel vs. grilla cuadrada
  const cut = opts.cutoutUrl;

  const pad = Math.round(w * (ancho ? 0.055 : 0.085));
  /*
   * Ancho del bloque de texto. En el carrusel manda `safeCenter` (la franja que
   * sobrevive al recorte de mobile). En el cuadrado NO puede ser el ancho completo:
   * el producto vive apoyado a la derecha y el titular se le montaba encima
   * ("PANTALONES Y" cruzando la pierna). Con producto, el texto se queda en el 58%.
   */
  const safe = ancho
    ? Math.round(w * (opts.safeCenter || 0.62))
    : Math.round(w * (cut ? 0.58 : 0.86));

  /*
   * El cuerpo del titular SE CALCULA, no se fija. Con un tamaño fijo, "Pantalones y
   * cargos" en el cuadrado partía en tres renglones y dejaba la "Y" colgada sola. La
   * palabra más larga tiene que entrar completa en el ancho disponible (Anton avanza
   * ~0,42em por carácter); el resto del cuerpo se deriva de ahí.
   */
  const anchoTexto = safe - pad;
  const palabraLarga = String(opts.titular || '').split(/\s+/)
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  const titTope = ancho ? Math.round(h * 0.235) : Math.round(h * 0.135);
  const titSize = Math.max(
    Math.round(titTope * 0.55),
    Math.min(titTope, Math.floor(anchoTexto / Math.max(4, palabraLarga.length * 0.42)))
  );
  const kickSize = ancho ? Math.round(h * 0.048) : Math.round(h * 0.032);
  const bajSize = ancho ? Math.round(h * 0.058) : Math.round(h * 0.042);

  return `${headHtmlLocal(w, h)}
  <body style="position:relative; width:${w}px; height:${h}px; background:#0B0B0D; overflow:hidden;">
    <div style="position:absolute; inset:0; background:
      linear-gradient(${ancho ? '100deg' : '160deg'}, #16161A 0%, #101013 46%, #0A0A0C 100%);"></div>
    <div style="position:absolute; ${ancho ? 'right:14%; top:50%;' : 'right:-4%; bottom:6%;'}
      transform:translate(0,${ancho ? '-50%' : '0'}); width:${Math.round(h * 1.15)}px; height:${Math.round(h * 1.15)}px;
      border-radius:50%; background:radial-gradient(circle, ${ACCENT}3A 0%, transparent 62%); z-index:1;"></div>

    ${cut ? `<img src="${esc(cut)}" style="position:absolute; z-index:2; object-fit:contain;
      ${ancho
        ? `right:${Math.round(w * 0.015)}px; top:50%; transform:translateY(-50%); height:${Math.round(h * 1.12)}px;`
        : `right:${Math.round(w * -0.06)}px; bottom:0; height:${Math.round(h * 0.62)}px;`}
      filter:drop-shadow(0 24px 48px rgba(0,0,0,.6));
      mask-image:linear-gradient(to bottom, #000 74%, transparent 100%);
      -webkit-mask-image:linear-gradient(to bottom, #000 74%, transparent 100%);"/>` : ''}

    <div style="position:absolute; left:${pad}px; top:50%; transform:translateY(-50%); z-index:5;
      max-width:${safe - pad * 2}px; display:flex; flex-direction:column; gap:${Math.round(h * 0.035)}px;">
      ${opts.kicker ? `<div style="font-family:'Inter',sans-serif; font-weight:800; font-size:${kickSize}px;
        letter-spacing:${Math.round(kickSize * 0.22)}px; color:${ACCENT}; white-space:nowrap;
        overflow:hidden; text-overflow:clip;">${esc(String(opts.kicker).toUpperCase())}</div>` : ''}
      <div style="font-family:'Anton',sans-serif; font-size:${titSize}px; line-height:.92; color:#fff;
        text-transform:uppercase; letter-spacing:-1px;">${esc(opts.titular || '')}</div>
      ${opts.bajada ? `<div style="font-family:'Inter',sans-serif; font-weight:500; font-size:${bajSize}px;
        line-height:1.35; color:rgba(255,255,255,.66);">${esc(opts.bajada)}</div>` : ''}
      ${opts.cta ? `<div style="margin-top:${Math.round(h * 0.03)}px; display:inline-flex; align-items:center; gap:12px;
        align-self:flex-start; background:${ACCENT}; color:#fff; font-family:'Inter',sans-serif; font-weight:800;
        font-size:${bajSize}px; padding:${Math.round(h * 0.035)}px ${Math.round(h * 0.062)}px; border-radius:100px;">
        ${esc(opts.cta)} <span style="font-size:${Math.round(bajSize * 1.1)}px;">&rarr;</span></div>` : ''}
    </div>
    ${grain(0.14)}
  </body></html>`;
}

/** <head> propio: los banners no usan las medidas de Instagram de sharedGeometry. */
function headHtmlLocal(w, h) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>*{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:'Inter',Arial,sans-serif;}</style>`;
}

module.exports.buildBannerHtml = buildBannerHtml;
