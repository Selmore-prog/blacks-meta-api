/* =========================================================================
 * BLOQUES DEL HOME — armado del HTML.
 *
 * Este archivo es la ÚNICA fuente del HTML de los bloques: lo usa la tienda
 * (vía /api/home/rails) y lo usa la vista previa del panel. Si se tocara sólo
 * uno de los dos lados, la previa mentiría, así que no hay "otro" renderer.
 *
 * REGLAS QUE NO SE NEGOCIAN ACÁ
 * 1. Todo texto del dueño pasa por esc(). El HTML se inyecta con innerHTML en
 *    la tienda: una comilla suelta rompería el bloque y un <script> sería peor.
 * 2. Toda imagen y todo video llevan medidas o proporción declarada. Sin eso la
 *    página salta cuando cargan y el salto lo paga el Core Web Vital de CLS.
 * 3. Nada carga hasta que hace falta: imágenes con loading="lazy", MP4 con
 *    preload="none" y YouTube/Vimeo detrás de una foto (el iframe recién se
 *    crea al tocar play). Un embed de YouTube pesa ~800 KB; la foto, 40.
 * 4. Mobile primero: cada bloque declara qué hace en pantalla chica, porque es
 *    de donde viene la mayoría de las visitas.
 * ========================================================================= */

/* ---------------------------------------------------------------- utilidades */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texto con saltos de línea → párrafos. */
function parrafos(txt, clase) {
  if (!txt) return '';
  return String(txt)
    .split(/\n{2,}/)
    .map((p) => `<p${clase ? ` class="${clase}"` : ''}>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const RATIOS = {
  '1-1': '1 / 1', '4-3': '4 / 3', '3-4': '3 / 4', '16-9': '16 / 9', '9-16': '9 / 16', '3-2': '3 / 2',
};

function ratioStyle(r, fallback) {
  return `--hb-ratio:${RATIOS[r] || fallback || '4 / 3'}`;
}

/* ------------------------------------------------------------------ imágenes */

/**
 * <picture> con fuente aparte para celular. El atributo `sizes` le dice al
 * navegador cuánto va a ocupar la imagen ANTES de bajarla; sin eso baja la más
 * grande siempre (es el error que hoy tiene el slider del home: sirve una de
 * 1024 px en un hueco de 375).
 */
function imagen({ src, srcMobile, alt, ratio, eager = false, sizes = '100vw', clase = '' }) {
  if (!src && !srcMobile) return '';
  const principal = src || srcMobile;
  const carga = eager
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy" decoding="async"';
  const fuenteMobile = srcMobile && src
    ? `<source media="(max-width: 767px)" srcset="${esc(srcMobile)}">`
    : '';
  return `<picture class="hb-pic ${clase}" style="${ratioStyle(ratio)}">`
    + fuenteMobile
    + `<img src="${esc(principal)}" alt="${esc(alt || '')}" ${carga} sizes="${esc(sizes)}">`
    + '</picture>';
}

/* -------------------------------------------------------------------- videos */

function youtubeId(url) {
  const s = String(url || '');
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{6,20})/);
  return m ? m[1] : null;
}

function vimeoId(url) {
  const m = String(url || '').match(/vimeo\.com\/(?:video\/)?(\d{6,12})/);
  return m ? m[1] : null;
}

/**
 * De dónde sale el video, MIRANDO LA URL y no el desplegable.
 *
 * El desplegable era una trampa: el tipo "video" venía con YouTube elegido de
 * fábrica, así que quien subía un MP4 propio y no tocaba ese campo terminaba con
 * su archivo tratado como un embed — una fachada con botón de play que al
 * clickear metía el .mp4 dentro de un <iframe>. Sin autoplay, sin loop y con el
 * reproductor del navegador con barra de avance. Exactamente lo que pasó.
 *
 * La URL ya dice lo que es. Esto manda sobre lo que diga la configuración.
 */
function origenDelVideo(url) {
  const s = String(url || '').trim();
  if (!s) return 'ninguno';
  if (youtubeId(s)) return 'youtube';
  if (vimeoId(s)) return 'vimeo';
  // Archivo servido directo: por extensión, o por el patrón de Supabase Storage.
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(s)) return 'archivo';
  return 'iframe';
}

/**
 * Devuelve el nodo de video listo para el DOM.
 *
 * - archivo (MP4 propio): <video> con preload="none" y poster. Si el dueño pidió
 *   "arrancar solo", NO se pone autoplay en el HTML: lo decide el navegador del
 *   visitante cuando el bloque entra en pantalla (y no lo hace si el visitante
 *   está con datos limitados o pidió reducir el movimiento). Ver el JS de
 *   comportamiento en homeBlocksAssets.js.
 * - youtube / vimeo / iframe: NO se crea el iframe. Se dibuja la foto con un
 *   botón de play y el iframe aparece recién al tocarlo.
 */
function video(d, { ratio, alt, posterSizes = '100vw' } = {}) {
  // El ORIGEN sale de la URL, no del desplegable (ver origenDelVideo).
  const kind = origenDelVideo(d.video_url);
  if (kind === 'ninguno') return '';

  const estilo = ratioStyle(ratio, '16 / 9');
  const loop = d.video_loop !== false;
  const sinSonido = d.video_muted !== false;

  /* MODO CINTA (loop): el video se comporta como un GIF — arranca solo, se
     repite y lo único que se puede hacer es pausarlo. Sin barra de avance:
     dejar navegar un clip de ambiente de seis segundos no aporta nada y
     ensucia la sección. Los controles nativos sólo aparecen cuando NO hay
     loop, que es el caso del video explicativo. */
  const modoCinta = kind === 'archivo' && loop;
  const controles = !modoCinta && d.video_controls === true;

  if (kind === 'archivo') {
    const poster = d.image || d.image_mobile || '';
    const auto = d.video_autoplay !== false;
    const attrs = [
      'class="hb-video"',
      'playsinline',
      // Sin `muted` en el HTML el navegador no deja arrancar solo. Si el dueño
      // pidió sonido, se le saca recién al tocar el botón (gesto del usuario).
      (sinSonido || auto) ? 'muted' : '',
      'preload="none"',
      poster ? `poster="${esc(poster)}"` : '',
      loop ? 'loop' : '',
      controles ? 'controls' : '',
      auto ? 'data-hb-autoplay="1"' : '',
      d.video_speed && d.video_speed !== '1' ? `data-hb-speed="${esc(d.video_speed)}"` : '',
      `aria-label="${esc(alt || 'Video')}"`,
    ].filter(Boolean).join(' ');

    const botones = [];
    if (modoCinta) {
      // Pausa/reanudar, y nada más. Se dibuja siempre: es la única forma de
      // frenar un video que arranca solo, y eso hay que poder hacerlo.
      /* Los dos íconos van siempre en el HTML y el CSS muestra UNO según la
         clase del botón. No se usa el atributo `hidden`: `hidden` es de
         HTMLElement y NO aplica a elementos SVG, así que los dos se veían
         encimados (el bug de "se ven dos iconos"). */
      botones.push('<button type="button" class="hb-cinta-btn" data-hb-toggle aria-label="Pausar video">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true" class="hb-ic-pausa"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        + '<svg viewBox="0 0 24 24" aria-hidden="true" class="hb-ic-play"><path d="M8 5l11 7-11 7z"/></svg>'
        + '</button>');
    } else if (!controles && !auto) {
      botones.push('<button type="button" class="hb-play" aria-label="Reproducir video"><span></span></button>');
    }
    // El botón de sonido sólo tiene sentido si el dueño NO pidió silencio.
    if (!sinSonido && d.video_sound_toggle) {
      botones.push('<button type="button" class="hb-sound" aria-label="Activar sonido" aria-pressed="false">'
        + '<span class="hb-sound-on" hidden>Sonido</span><span class="hb-sound-off">Sin sonido</span></button>');
    }

    return `<div class="hb-media hb-media--video${modoCinta ? ' hb-media--cinta' : ''}" style="${estilo}" data-hb-video="archivo">`
      + `<video ${attrs}><source data-src="${esc(d.video_url)}" type="${esc(tipoMime(d.video_url))}"></video>`
      + botones.join('')
      + '</div>';
  }

  // Embeds: fachada con foto + play. El iframe lo crea el JS al primer clic.
  const yt = kind === 'youtube' ? youtubeId(d.video_url) : null;
  const vm = kind === 'vimeo' ? vimeoId(d.video_url) : null;

  let embed = '';
  if (yt) {
    const params = ['autoplay=1', 'rel=0', 'modestbranding=1', 'playsinline=1'];
    if (loop) params.push('loop=1', `playlist=${yt}`);
    if (sinSonido) params.push('mute=1');
    if (!controles) params.push('controls=0');
    embed = `https://www.youtube-nocookie.com/embed/${yt}?${params.join('&amp;')}`;
  } else if (vm) {
    const params = ['autoplay=1', 'dnt=1'];
    if (loop) params.push('loop=1');
    if (sinSonido) params.push('muted=1');
    embed = `https://player.vimeo.com/video/${vm}?${params.join('&amp;')}`;
  } else {
    embed = String(d.video_url).replace(/&/g, '&amp;');
  }

  const poster = d.image || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '');
  const fondo = poster
    ? imagen({ src: poster, srcMobile: d.image_mobile, alt: alt || '', ratio, sizes: posterSizes })
    : '<div class="hb-poster-vacio" aria-hidden="true"></div>';

  return `<div class="hb-media hb-media--video hb-facade" style="${estilo}" data-hb-video="embed" data-hb-embed="${esc(embed)}">`
    + fondo
    + '<button type="button" class="hb-play" aria-label="Reproducir video"><span></span></button>'
    + '</div>';
}

/** El type del <source>: si miente, Safari se niega a cargar el archivo. */
function tipoMime(url) {
  const ext = (String(url || '').match(/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i) || [])[1];
  const mapa = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg' };
  return mapa[(ext || 'mp4').toLowerCase()] || 'video/mp4';
}

/** Imagen o video, lo que haya. El video manda. */
function media(d, opciones = {}) {
  const v = video(d, opciones);
  if (v) return v;
  const img = imagen({
    src: d.image,
    srcMobile: d.image_mobile,
    alt: d.image_alt,
    ratio: opciones.ratio,
    eager: opciones.eager,
    sizes: opciones.posterSizes || '100vw',
  });
  return img ? `<div class="hb-media" style="${ratioStyle(opciones.ratio)}">${img}</div>` : '';
}

/* --------------------------------------------------------------------- texto */

function encabezado(d, { nivel = 2, clase = '' } = {}) {
  const partes = [];
  if (d.kicker) partes.push(`<p class="hb-kicker">${esc(d.kicker)}</p>`);
  if (d.title) partes.push(`<h${nivel} class="hb-title">${esc(d.title)}</h${nivel}>`);
  if (d.text) partes.push(`<div class="hb-text">${parrafos(d.text)}</div>`);
  if (!partes.length) return '';
  return `<div class="hb-head ${clase}">${partes.join('')}</div>`;
}

function botones(d) {
  const bs = [];
  if (d.cta1_text && d.cta1_url) bs.push(`<a class="hb-btn hb-btn--1" href="${esc(d.cta1_url)}">${esc(d.cta1_text)}</a>`);
  if (d.cta2_text && d.cta2_url) bs.push(`<a class="hb-btn hb-btn--2" href="${esc(d.cta2_url)}">${esc(d.cta2_text)}</a>`);
  return bs.length ? `<div class="hb-ctas">${bs.join('')}</div>` : '';
}

const money = (n) => (n == null ? '' : '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }));

/* --------------------------------------------------------------------- íconos */

const ICONOS = {
  escudo: '<path d="M12 3l7 3v6c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6z"/>',
  casco: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M9 15V8a3 3 0 0 1 6 0v7"/><path d="M2 15h20v3H2z"/>',
  camion: '<path d="M2 6h11v10H2z"/><path d="M13 9h4l4 3v4h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  factura: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  regla: '<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  costura: '<path d="M3 12h18"/><path d="M5 12l2-3 2 3 2-3 2 3 2-3 2 3"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.2-5.4-3-5.4 3 1-6.2L3.2 9.5l6.1-.9z"/>',
  caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
};

function icono(nombre) {
  const d = ICONOS[nombre] || ICONOS.escudo;
  return `<svg class="hb-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

/* ===================================================================== BLOQUES */

function portada(b) {
  const d = b.data;
  const textoAbajoMobile = d.text_below_mobile ? ' hb-portada--texto-abajo' : '';
  const cuerpo = `<div class="hb-portada-body">${encabezado(d, { nivel: 2 })}${botones(d)}</div>`;
  // El primer bloque del home puede ser lo primero que se ve: ahí la imagen se
  // pide con prioridad en vez de diferida (si no, es el LCP y llega tarde).
  // Sin foto todavía (pasa mientras se está armando el bloque): se dibuja el
  // hueco rayado para que se entienda la estructura en la vista previa.
  const fondo = media(d, { ratio: null, eager: b.slot === 'block_1', posterSizes: '100vw' })
    || '<div class="hb-media"><div class="hb-poster-vacio" aria-hidden="true"></div></div>';
  const velo = Math.max(0, Math.min(85, Number(d.overlay) || 0));

  return `<div class="hb-portada hb-portada--${esc(d.height || 'media')} hb-portada--${esc(d.align || 'izquierda')}${textoAbajoMobile}" style="--hb-velo:${velo / 100}">`
    + `<div class="hb-portada-fondo">${fondo}</div>`
    + cuerpo
    + '</div>';
}

function mediaTexto(b) {
  const d = b.data;
  const lista = (d.bullets || []).filter((x) => x.text);
  const bullets = lista.length
    ? `<ul class="hb-bullets">${lista.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`
    : '';
  const col = media(d, { ratio: d.ratio || '4-3', posterSizes: '(min-width: 768px) 50vw, 100vw' });

  const union = ['superpuesto', 'simple', 'marco'].includes(d.media_style) ? d.media_style : 'superpuesto';

  return `<div class="hb-split hb-split--${esc(d.media_side === 'derecha' ? 'derecha' : 'izquierda')} hb-u-${union}">`
    + `<div class="hb-split-media">${col}</div>`
    + `<div class="hb-split-body">${encabezado(d)}${bullets}${botones(d)}</div>`
    + '</div>';
}

function atributos(b) {
  const d = b.data;
  const items = (d.items || []).filter((x) => x.title || x.text);
  const cuerpo = items.map((x) => {
    const dentro = `${icono(x.icon)}<div class="hb-attr-txt">`
      + (x.title ? `<h3>${esc(x.title)}</h3>` : '')
      + (x.text ? `<p>${esc(x.text)}</p>` : '')
      + '</div>';
    return x.url
      ? `<a class="hb-attr" href="${esc(x.url)}">${dentro}</a>`
      : `<div class="hb-attr">${dentro}</div>`;
  }).join('');

  return (d.title ? `<div class="hb-head hb-head--centro"><h2 class="hb-title">${esc(d.title)}</h2></div>` : '')
    + `<div class="hb-attrs hb-attrs--${esc(d.style || 'tarjetas')} hb-m-${esc(d.mobile_layout || 'scroll')}" data-hb-cols="${items.length}">${cuerpo}</div>`;
}

function editorial(b) {
  const d = b.data;
  const tiles = (d.tiles || []).filter((t) => t.title || t.image);
  const placas = tiles.map((t, i) => {
    const foto = t.image
      ? imagen({
        src: t.image, alt: t.image_alt || t.title, ratio: i === 0 ? '4-3' : '1-1',
        sizes: i === 0 ? '(min-width: 768px) 60vw, 100vw' : '(min-width: 768px) 30vw, 80vw',
      })
      : '<div class="hb-poster-vacio" aria-hidden="true"></div>';
    const txt = '<div class="hb-tile-body">'
      + (t.kicker ? `<p class="hb-kicker">${esc(t.kicker)}</p>` : '')
      + (t.title ? `<h3 class="hb-tile-title">${esc(t.title)}</h3>` : '')
      + (t.text ? `<p class="hb-tile-text">${esc(t.text)}</p>` : '')
      + (t.url && t.cta_text ? `<span class="hb-tile-cta">${esc(t.cta_text)}</span>` : '')
      + '</div>';
    const dentro = `<div class="hb-tile-media">${foto}</div>${txt}`;
    return t.url
      ? `<a class="hb-tile hb-tile--${i === 0 ? 'grande' : 'chica'}" href="${esc(t.url)}">${dentro}</a>`
      : `<div class="hb-tile hb-tile--${i === 0 ? 'grande' : 'chica'}">${dentro}</div>`;
  }).join('');

  return encabezado(d, { clase: 'hb-head--centro' })
    + `<div class="hb-editorial hb-m-${esc(d.mobile_layout || 'apiladas')}" data-hb-tiles="${tiles.length}">${placas}</div>`;
}

function videoBloque(b) {
  const d = b.data;
  const solo = (d.layout || 'solo') === 'solo';
  const ratio = d.ratio || '16-9';
  const nodo = video(d, {
    ratio,
    alt: d.image_alt || d.title,
    posterSizes: solo ? '100vw' : '(min-width: 768px) 55vw, 100vw',
  });
  /* La clase tiene que ser hb-split-body: TODAS las reglas de unión (superpuesto,
     marco) y el centrado vertical cuelgan de ahí. Con hb-video-body el bloque de
     video se quedaba afuera de todas y la opción "el texto monta sobre el video"
     no hacía absolutamente nada — se veía igual que "uno al lado del otro". */
  const texto = `<div class="hb-split-body hb-video-body">${encabezado(d)}${botones(d)}</div>`;

  if (solo) {
    return encabezado(d, { clase: 'hb-head--centro' })
      + `<div class="hb-video-solo">${nodo}</div>`
      + botones(d);
  }
  const orden = d.layout === 'texto_izquierda' ? 'derecha' : 'izquierda';
  const union = ['superpuesto', 'simple', 'marco'].includes(d.media_style) ? d.media_style : 'superpuesto';
  return `<div class="hb-split hb-split--${orden} hb-u-${union}">`
    + `<div class="hb-split-media">${nodo}</div>`
    + texto
    + '</div>';
}

function fichaProducto(p, { mostrarPrecio, grande = false }) {
  const precio = mostrarPrecio && p.price != null
    ? '<div class="hb-p-precio">'
      + (p.promo_price
        ? `<span class="hb-p-tachado">${money(p.price)}</span> <span class="hb-p-final">${money(p.promo_price)}</span>`
        : `<span class="hb-p-final">${money(p.price)}</span>`)
      + '</div>'
    : '';
  const badge = p.discount_pct ? `<span class="hb-p-off">-${p.discount_pct}%</span>` : '';
  const foto = p.image
    ? imagen({
      src: p.image, alt: p.name, ratio: '1-1',
      sizes: grande ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 45vw',
    })
    : '<div class="hb-poster-vacio" aria-hidden="true"></div>';

  return `<a class="hb-p${grande ? ' hb-p--grande' : ''}" href="${esc(p.url)}">`
    + `<div class="hb-p-foto">${foto}${badge}</div>`
    + `<div class="hb-p-body"><h3 class="hb-p-nombre">${esc(p.name)}</h3>${precio}</div>`
    + '</a>';
}

function productos(b, ctx) {
  const d = b.data;
  const lista = ctx.products || [];
  const mostrarPrecio = d.show_price !== false;
  const layout = d.layout || 'grilla';

  let cuerpo;
  if (layout === 'destacado' && lista.length) {
    const [primero, ...resto] = lista;
    const heroe = d.image
      ? `<a class="hb-p hb-p--grande" href="${esc(primero.url)}">`
        + `<div class="hb-p-foto">${imagen({ src: d.image, srcMobile: d.image_mobile, alt: d.image_alt || primero.name, ratio: '4-3', sizes: '(min-width: 768px) 55vw, 100vw' })}</div>`
        + `<div class="hb-p-body"><h3 class="hb-p-nombre">${esc(primero.name)}</h3>${mostrarPrecio && primero.price != null ? `<div class="hb-p-precio"><span class="hb-p-final">${money(primero.promo_price || primero.price)}</span></div>` : ''}</div>`
        + '</a>'
      : fichaProducto(primero, { mostrarPrecio, grande: true });
    cuerpo = `<div class="hb-prods hb-prods--destacado">${heroe}`
      + `<div class="hb-prods-resto">${resto.map((p) => fichaProducto(p, { mostrarPrecio })).join('')}</div></div>`;
  } else {
    cuerpo = `<div class="hb-prods hb-prods--${esc(layout)}" data-hb-cols="${lista.length}">`
      + lista.map((p) => fichaProducto(p, { mostrarPrecio })).join('')
      + '</div>';
  }

  return encabezado(d) + cuerpo + botones(d);
}

function cinta(b) {
  const d = b.data;
  const items = (d.items || []).filter((x) => x.text);
  if (!items.length) return '';
  const uno = items.map((x) => `<span class="hb-cinta-item">${esc(x.text)}</span>`).join('');
  // La tira se repite para que el loop no tenga costura. La copia va con
  // aria-hidden para que el lector de pantalla no lea todo dos veces.
  const cuerpo = `<div class="hb-cinta-pista hb-cinta--${esc(d.speed || 'normal')}">`
    + `<div class="hb-cinta-grupo">${uno}</div>`
    + `<div class="hb-cinta-grupo" aria-hidden="true">${uno}</div>`
    + '</div>';
  return d.url ? `<a class="hb-cinta" href="${esc(d.url)}">${cuerpo}</a>` : `<div class="hb-cinta">${cuerpo}</div>`;
}

function preguntas(b) {
  const d = b.data;
  const items = (d.items || []).filter((x) => x.q && x.a);
  const cuerpo = items.map((x, i) => {
    const abierta = d.open_first !== false && i === 0;
    return `<details class="hb-faq-item"${abierta ? ' open' : ''}>`
      + `<summary class="hb-faq-q">${esc(x.q)}<span class="hb-faq-mas" aria-hidden="true"></span></summary>`
      + `<div class="hb-faq-a">${parrafos(x.a)}</div>`
      + '</details>';
  }).join('');
  return encabezado(d) + `<div class="hb-faq">${cuerpo}</div>` + botones(d);
}

function rubros(b) {
  const d = b.data;
  const items = (d.items || []).filter((x) => x.title);
  const conFoto = (d.style || 'foto') === 'foto';
  const cuerpo = items.map((x) => {
    const foto = conFoto && x.image
      ? imagen({ src: x.image, alt: x.title, ratio: '3-4', sizes: '(min-width: 768px) 25vw, 45vw' })
      : '';
    const dentro = (foto ? `<div class="hb-rubro-media">${foto}</div>` : '')
      + `<div class="hb-rubro-body"><h3>${esc(x.title)}</h3>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div>`;
    return x.url
      ? `<a class="hb-rubro" href="${esc(x.url)}">${dentro}</a>`
      : `<div class="hb-rubro">${dentro}</div>`;
  }).join('');
  return encabezado(d, { clase: 'hb-head--centro' })
    + `<div class="hb-rubros hb-rubros--${conFoto ? 'foto' : 'texto'}" data-hb-cols="${items.length}">${cuerpo}</div>`;
}

const RENDERERS = {
  portada,
  media_texto: mediaTexto,
  atributos,
  editorial,
  video: videoBloque,
  productos,
  cinta,
  preguntas,
  rubros,
};

/**
 * Bloque completo: envoltorio con tema, ancho y espaciado + el interior según
 * el tipo. `data-hb-slot` es lo que usa la tienda para saber en qué hueco va.
 */
function renderBlock(b, ctx = {}) {
  const fn = RENDERERS[b.type];
  if (!fn) return '';
  const interior = fn(b, ctx);
  if (!interior) return '';

  const clases = [
    'hb',
    `hb--${b.type}`,
    `hb-t-${b.theme || 'claro'}`,
    `hb-w-${b.width || 'contenido'}`,
    `hb-sp-${b.spacing || 'normal'}`,
    b.device && b.device !== 'todos' ? `hb-solo-${b.device}` : '',
    b.borde_suave !== false ? 'hb-borde-suave' : '',
  ].filter(Boolean).join(' ');

  const estilo = b.accent ? ` style="--hb-accent:${esc(b.accent)}"` : '';

  return `<section class="${clases}" data-hb-slot="${esc(b.slot)}" data-hb-type="${esc(b.type)}"${estilo}>`
    + `<div class="hb-wrap">${interior}</div>`
    + '</section>';
}

module.exports = { renderBlock, esc, imagen, video, youtubeId, vimeoId, origenDelVideo };
