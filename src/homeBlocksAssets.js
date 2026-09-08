/* =========================================================================
 * BLOQUES DEL HOME — estilo y comportamiento.
 *
 * Estas dos cadenas viajan a DOS lugares y tienen que ser las mismas:
 *   1. Al theme, copiadas dentro de snipplets/home/home-content-blocks.tpl por
 *      `npm run export:theme`. Van embebidas y no como CSS externo a propósito:
 *      si la tienda tuviera que bajar el CSS desde Render, un arranque en frío
 *      del servidor dejaría el home sin estilo unos segundos.
 *   2. A la vista previa del panel, que las inyecta en un iframe. Por eso la
 *      previa es fiel: es el mismo CSS y el mismo JS, no una maqueta.
 *
 * CRITERIOS DE DISEÑO
 * La ropa de trabajo en Argentina se vende con estética de catálogo: fondo
 * blanco, foto de la prenda colgada, tipografía chica. Acá se va al revés —
 * foto grande, títulos con peso, volanta en mayúscula fina, ángulos rectos
 * (radio 4px, no 16) y una regla de acento corta. Industrial, no "friendly".
 *
 * Todo arranca en mobile y sube con min-width: el 80% de las visitas de la
 * tienda son de celular, así que la versión chica es la real y la de escritorio
 * es la excepción.
 * ========================================================================= */

const CSS = `
/* ===== BLOQUES DEL HOME (generado por blacks-content-engine) ============= */

/* Marca de que esta hoja SÍ se cargó. El inyector la consulta antes de pintar:
   si el include del CSS no llegó (por ejemplo si el theme se subió a medias),
   prefiere no mostrar nada antes que mostrar los bloques sin estilo. */
.hb-host { --hb-css: 1; }
.hb {
  --hb-radio: 4px;
  --hb-max: 1240px;
  --hb-gap: 14px;
  --hb-accent: var(--accent-color, #E2571F);
  --hb-bg: #ffffff;
  --hb-fg: #111214;
  --hb-muted: #5b6069;
  --hb-line: rgba(0,0,0,.12);
  --hb-btn-bg: #111214;
  --hb-btn-fg: #ffffff;
  --hb-pad: 40px;
  /* Aire lateral del bloque. Es una variable porque los carruseles se salen del
     contenedor con un margen negativo del mismo tamaño: si estuviera fijo en
     16px, un bloque a ancho completo (sin aire) se comería 16px de cada lado. */
  --hb-borde: 16px;
  position: relative;
  display: block;
  box-sizing: border-box;
  background: var(--hb-bg);
  color: var(--hb-fg);
  padding: var(--hb-pad) 0;
  /* Los dos, en este orden: Safari 15 y anteriores no entienden clip y se
     quedan con hidden, que para esto hace lo mismo (nada se posiciona sticky
     adentro). Sin ninguno, la cinta de texto haría scrollear la página entera
     hacia el costado. */
  overflow: hidden;
  overflow: clip;
}
.hb *, .hb *::before, .hb *::after { box-sizing: border-box; }

/* --- temas ------------------------------------------------------------- */
.hb-t-oscuro {
  --hb-bg: #0E0F11; --hb-fg: #F6F6F5; --hb-muted: #A7ABB2;
  --hb-line: rgba(255,255,255,.16); --hb-btn-bg: #ffffff; --hb-btn-fg: #0E0F11;
}
.hb-t-arena {
  --hb-bg: #F3F0EA; --hb-fg: #16161A; --hb-muted: #5C5A55; --hb-line: rgba(0,0,0,.10);
}
.hb-t-acento {
  --hb-bg: var(--hb-accent); --hb-fg: #ffffff; --hb-muted: rgba(255,255,255,.82);
  --hb-line: rgba(255,255,255,.28); --hb-btn-bg: #ffffff; --hb-btn-fg: #111214;
}

/* --- espaciado y ancho -------------------------------------------------- */
.hb-sp-compacto { --hb-pad: 24px; }
.hb-sp-normal   { --hb-pad: 40px; }
.hb-sp-amplio   { --hb-pad: 56px; }
.hb-wrap { width: 100%; margin: 0 auto; padding: 0 var(--hb-borde); max-width: var(--hb-max); }
.hb-w-completo > .hb-wrap { max-width: none; }
.hb-w-completo { --hb-borde: 0px; }

/* A ANCHO COMPLETO, LA FOTO LLEGA AL BORDE PERO EL TEXTO NO.
   La variable --hb-borde en 0 es lo que hace que la imagen y el video sangren hasta el
   canto de la pantalla, que es el punto de esta opción. El problema es que se
   llevaba puesto también al texto: en celular el título y la volanta quedaban
   pegados al borde, sin un milímetro de aire, y así no se lee.
   Se le devuelve el margen lateral SÓLO a lo que es texto. */
.hb-w-completo > .hb-wrap > .hb-head,
.hb-w-completo > .hb-wrap > .hb-ctas,
.hb-w-completo .hb-split-body,
.hb-w-completo .hb-faq,
.hb-w-completo .hb-attrs:not(.hb-m-scroll),
.hb-w-completo .hb-rubros,
.hb-w-completo .hb-editorial:not(.hb-m-scroll),
.hb-w-completo .hb-prods:not(.hb-prods--scroll) {
  padding-left: 16px;
  padding-right: 16px;
}
/* Las pistas que se deslizan ya usan margen negativo contra un borde de 16px.
   Sin borde, ese margen las empujaba fuera de la pantalla: se neutraliza. */
.hb-w-completo .hb-attrs.hb-m-scroll,
.hb-w-completo .hb-editorial.hb-m-scroll,
.hb-w-completo .hb-prods--scroll {
  margin-left: 0;
  margin-right: 0;
}
.hb-solo-mobile { display: block; }
.hb-solo-desktop { display: none; }

/* --- tipografía --------------------------------------------------------- */
.hb-head { margin: 0 0 20px; max-width: 62ch; }
.hb-head--centro { margin-left: auto; margin-right: auto; text-align: center; }
.hb-kicker {
  margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: var(--hb-accent); display: flex; align-items: center; gap: 8px;
}
.hb-t-acento .hb-kicker, .hb-t-oscuro .hb-portada-body .hb-kicker { color: currentColor; opacity: .9; }
.hb-kicker::before { content: ""; width: 18px; height: 2px; background: currentColor; flex: none; }
.hb-head--centro .hb-kicker { justify-content: center; }
.hb-title {
  margin: 0; font-size: clamp(24px, 6.2vw, 40px); line-height: 1.06;
  letter-spacing: -.02em; font-weight: 700; color: inherit; text-transform: none;
}
.hb-text { margin: 14px 0 0; color: var(--hb-muted); font-size: 15px; line-height: 1.6; }
.hb-text p { margin: 0 0 10px; }
.hb-text p:last-child { margin-bottom: 0; }

/* --- botones ------------------------------------------------------------ */
.hb-ctas { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.hb-head--centro + .hb-ctas, .hb-ctas.hb-ctas--centro { justify-content: center; }
.hb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 46px; padding: 12px 22px; border-radius: var(--hb-radio);
  font-size: 14px; font-weight: 600; letter-spacing: .01em; text-decoration: none;
  border: 1px solid transparent; transition: transform .15s ease, opacity .15s ease;
}
.hb-btn--1 { background: var(--hb-btn-bg); color: var(--hb-btn-fg); }
.hb-btn--2 { background: transparent; color: inherit; border-color: currentColor; }
.hb-btn:hover { transform: translateY(-1px); opacity: .92; }
.hb-btn:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 3px; }

/* --- media -------------------------------------------------------------- */
.hb-media { position: relative; width: 100%; aspect-ratio: var(--hb-ratio, 4 / 3); overflow: hidden; border-radius: var(--hb-radio); background: rgba(127,127,127,.10); }
/* LA FOTO RESERVA SU CAJA.
   El HTML declara la proporción en --hb-ratio, pero hasta sep-2026 nadie la
   aplicaba acá: la placa terminaba midiendo lo que midiera la foto que subió el
   dueño. Si cargaba una apaisada en un hueco cuadrado, quedaba un hueco debajo
   y el texto blanco (anclado abajo de la PLACA, no de la foto) caía sobre el
   fondo del bloque y se volvía invisible. Además, sin caja reservada la página
   salta cuando la foto carga, y ese salto lo paga el Core Web Vital de CLS. */
.hb-pic { display: block; width: 100%; height: 100%; aspect-ratio: var(--hb-ratio, auto); }
.hb-pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
.hb-media > .hb-pic { position: absolute; inset: 0; }
.hb-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
.hb-poster-vacio { position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(127,127,127,.10) 0 10px, rgba(127,127,127,.16) 10px 20px); }
.hb-media iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

.hb-play {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 62px; height: 62px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(17,18,20,.62); backdrop-filter: blur(2px);
  display: grid; place-items: center; transition: transform .18s ease, background .18s ease;
}
.hb-play span { width: 0; height: 0; margin-left: 4px; border-left: 16px solid #fff; border-top: 10px solid transparent; border-bottom: 10px solid transparent; }
.hb-play:hover { transform: translate(-50%, -50%) scale(1.06); background: rgba(17,18,20,.82); }
/* MODO CINTA: el botón de pausa vive discreto abajo a la derecha y sólo se
   nota al pasar por encima. La idea es que el clip se lea como un GIF, no como
   un reproductor. Igual queda siempre alcanzable con el teclado: es la única
   forma de frenar algo que arrancó solo. */
.hb-cinta-btn {
  position: absolute; right: 12px; bottom: 12px; z-index: 2; cursor: pointer;
  width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,.35); background: rgba(17,18,20,.45);
  color: #fff; opacity: 0; transition: opacity .2s ease, background .2s ease;
  padding: 0;
}
.hb-cinta-btn svg { width: 15px; height: 15px; fill: currentColor; grid-area: 1 / 1; }
/* Un ícono por vez. El estado lo marca la clase del botón, no el atributo
   hidden (que sobre SVG no hace nada). */
.hb-cinta-btn .hb-ic-play { display: none; }
.hb-cinta-btn.is-pausado .hb-ic-pausa { display: none; }
.hb-cinta-btn.is-pausado .hb-ic-play { display: block; }
/* Pausado se ve siempre: si no, no hay forma de darle play de nuevo. */
.hb-cinta-btn.is-pausado { opacity: 1; }
.hb-media--cinta:hover .hb-cinta-btn,
.hb-cinta-btn:focus-visible { opacity: 1; }
.hb-cinta-btn:hover { background: rgba(17,18,20,.75); }
/* En celular no hay hover: se muestra siempre, atenuado. */
@media (hover: none) {
  .hb-cinta-btn { opacity: .75; }
}

.hb-sound {
  position: absolute; right: 12px; bottom: 12px; z-index: 2; cursor: pointer;
  border: 1px solid rgba(255,255,255,.5); background: rgba(17,18,20,.55); color: #fff;
  font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 7px 12px; border-radius: 999px;
}
/* Con los dos botones, el de sonido se corre a la izquierda del de pausa. */
.hb-media--cinta .hb-sound { right: 56px; }

/* ===== PORTADA ========================================================== */
.hb--portada { padding: 0; }
.hb--portada.hb-w-completo > .hb-wrap { padding: 0; max-width: none; }
.hb--portada.hb-w-contenido { padding: var(--hb-pad) 0; }
.hb--portada.hb-w-contenido .hb-portada { border-radius: var(--hb-radio); overflow: hidden; }
.hb-portada { position: relative; display: flex; align-items: flex-end; min-height: 420px; isolation: isolate; }
.hb-portada--compacta { min-height: 300px; }
.hb-portada--alta { min-height: 540px; }
.hb-portada--pantalla { min-height: calc(100svh - 110px); }
.hb-portada-fondo { position: absolute; inset: 0; z-index: 0; }
.hb-portada-fondo .hb-media { position: absolute; inset: 0; aspect-ratio: auto; height: 100%; border-radius: 0; }
.hb-portada-fondo .hb-pic { position: absolute; inset: 0; }
.hb-portada-fondo::after {
  content: ""; position: absolute; inset: 0; z-index: 1;
  background:
    linear-gradient(to top, rgba(0,0,0,calc(var(--hb-velo,.45) * .55)) 0%, rgba(0,0,0,0) 62%),
    rgba(0,0,0,calc(var(--hb-velo,.45) * .72));
}
.hb-portada-body {
  position: relative; z-index: 2; width: 100%; max-width: var(--hb-max);
  margin: 0 auto; padding: 28px max(16px, var(--hb-borde)) 32px; color: #fff;
}
.hb-portada-body .hb-head { margin-bottom: 0; max-width: 20ch; }
.hb-portada-body .hb-text { color: rgba(255,255,255,.9); max-width: 46ch; }
.hb-portada--centro { align-items: center; text-align: center; }
.hb-portada--centro .hb-portada-body .hb-head { margin-left: auto; margin-right: auto; }
.hb-portada--centro .hb-kicker { justify-content: center; }
.hb-portada--centro .hb-ctas { justify-content: center; }
.hb-portada--centro .hb-text { margin-left: auto; margin-right: auto; }
/* En celular el texto encima de la foto tapa la imagen cuando el título es
   largo: con esta opción la foto queda arriba y el texto abajo, sobre el fondo
   del bloque. En escritorio vuelve a ir encima. */
.hb-portada--texto-abajo { display: block; min-height: 0; }
.hb-portada--texto-abajo .hb-portada-fondo { position: relative; aspect-ratio: 4 / 3; }
.hb-portada--texto-abajo .hb-portada-fondo::after { background: none; }
.hb-portada--texto-abajo .hb-portada-body { color: var(--hb-fg); padding: 22px max(16px, var(--hb-borde)) 8px; }
.hb-portada--texto-abajo .hb-portada-body .hb-text { color: var(--hb-muted); }

/* ===== IMAGEN Y TEXTO / VIDEO CON TEXTO ================================= */
.hb-split { display: grid; gap: 22px; }
.hb-split-body { align-self: center; }

/* EN CELULAR, LA TARJETA TAMBIÉN MONTA (versión chica de lo que hace en
   escritorio). Apilados sin más, el video y el texto se leían como dos cajas
   sueltas y la sección quedaba "básica": foto, y abajo un párrafo. Con la
   tarjeta subida 22px sobre el borde del video, y el video con las esquinas de
   abajo rectas, los dos se leen como UNA pieza. Es el mismo recurso editorial
   del escritorio, adaptado al ancho de un teléfono. */
@media (max-width: 767px) {
  .hb-split.hb-u-superpuesto { gap: 0; }
  .hb-split.hb-u-superpuesto .hb-split-media .hb-media {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .hb-split.hb-u-superpuesto .hb-split-body {
    position: relative;
    z-index: 1;
    margin: -22px 14px 0;
    padding: 20px 18px 22px;
    background: var(--hb-bg);
    border: 1px solid var(--hb-line);
    border-radius: var(--hb-radio);
    box-shadow: 0 -6px 22px rgba(0,0,0,.10);
  }
  /* Con la tarjeta más angosta, el título necesita un punto menos para no
     partirse en cinco renglones. */
  .hb-split.hb-u-superpuesto .hb-title { font-size: clamp(21px, 5.4vw, 30px); }
  .hb-split.hb-u-superpuesto .hb-kicker { margin-bottom: 8px; }
  .hb-split.hb-u-superpuesto .hb-ctas { margin-top: 16px; }
  .hb-split.hb-u-superpuesto .hb-btn { width: 100%; }
}
.hb-bullets { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 10px; }
.hb-bullets li { position: relative; padding-left: 26px; font-size: 15px; line-height: 1.45; }
.hb-bullets li::before {
  content: ""; position: absolute; left: 0; top: .45em; width: 12px; height: 7px;
  border-left: 2px solid var(--hb-accent); border-bottom: 2px solid var(--hb-accent);
  transform: rotate(-45deg);
}
.hb-t-acento .hb-bullets li::before { border-color: currentColor; }

/* ===== TIRA DE ATRIBUTOS ================================================ */
.hb-attrs { display: grid; gap: var(--hb-gap); }
.hb-attr {
  display: flex; gap: 12px; align-items: flex-start; text-decoration: none; color: inherit;
  padding: 16px; border-radius: var(--hb-radio); background: transparent;
}
.hb-attrs--tarjetas .hb-attr { border: 1px solid var(--hb-line); background: rgba(127,127,127,.05); }
.hb-attrs--separadores .hb-attr { border-bottom: 1px solid var(--hb-line); border-radius: 0; padding-left: 0; padding-right: 0; }
.hb-attrs--linea .hb-attr { padding: 8px 0; }
a.hb-attr:hover { border-color: currentColor; }
.hb-ico { width: 26px; height: 26px; flex: none; color: var(--hb-accent); }
.hb-t-acento .hb-ico, .hb-t-oscuro .hb-ico { color: currentColor; }
.hb-attr h3 { margin: 0 0 3px; font-size: 15px; font-weight: 700; letter-spacing: -.01em; color: inherit; }
.hb-attr p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--hb-muted); }
/* En celular: una fila que se desliza, con las tarjetas asomando para que se
   note que hay más a la derecha. */
.hb-attrs.hb-m-scroll {
  grid-auto-flow: column; grid-auto-columns: 74%; overflow-x: auto; scroll-snap-type: x mandatory;
  margin: 0 calc(-1 * var(--hb-borde)); padding: 0 var(--hb-borde) 4px; scrollbar-width: none;
}
.hb-attrs.hb-m-scroll::-webkit-scrollbar { display: none; }
.hb-attrs.hb-m-scroll > * { scroll-snap-align: start; }
.hb-attrs.hb-m-dos { grid-template-columns: 1fr 1fr; }

/* ===== EDITORIAL ======================================================== */
.hb-editorial { display: grid; gap: var(--hb-gap); }
/* La foto llena la placa entera, en todos los casos. Antes se estiraba sólo en
   dos combinaciones especiales y en el resto quedaba en flujo: cualquier
   diferencia entre el alto de la placa (que lo fija la grilla) y el de la foto
   dejaba el texto colgando abajo, fuera de la imagen. */
.hb-tile { position: relative; display: block; text-decoration: none; color: inherit;
  border-radius: var(--hb-radio); overflow: hidden; aspect-ratio: 4 / 3; }
.hb-tile--chica { aspect-ratio: 3 / 2; }
.hb-tile-media { position: absolute; inset: 0; }
.hb-tile-media .hb-pic { position: absolute; inset: 0; display: block; aspect-ratio: auto; }
.hb-tile-media img, .hb-tile-media .hb-poster-vacio { transition: transform .5s cubic-bezier(.2,.6,.2,1); }
a.hb-tile:hover .hb-tile-media img { transform: scale(1.04); }
.hb-tile-media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.12) 55%, transparent); }
.hb-tile-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 16px; color: #fff; }
.hb-tile-body .hb-kicker { color: rgba(255,255,255,.85); }
.hb-tile-title { margin: 0; font-size: clamp(18px, 4.6vw, 24px); line-height: 1.12; font-weight: 700; letter-spacing: -.015em; }
.hb-tile-text { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.86); }
.hb-tile-cta { display: inline-block; margin-top: 10px; font-size: 13px; font-weight: 600; border-bottom: 2px solid var(--hb-accent); padding-bottom: 2px; }
.hb-editorial.hb-m-scroll {
  grid-auto-flow: column; grid-auto-columns: 82%; overflow-x: auto; scroll-snap-type: x mandatory;
  margin: 0 calc(-1 * var(--hb-borde)); padding: 0 var(--hb-borde) 4px; scrollbar-width: none;
}
.hb-editorial.hb-m-scroll::-webkit-scrollbar { display: none; }
.hb-editorial.hb-m-scroll > * { scroll-snap-align: start; }

/* ===== VIDEO ============================================================ */
.hb-video-solo .hb-media { border-radius: var(--hb-radio); }
.hb-w-completo .hb-video-solo .hb-media { border-radius: 0; }
/* Un 16:9 a 1176 px de ancho mide 662 px de alto: con el título y el aire, la
   sección se iba a 995 px y ocupaba una pantalla entera para un clip de seis
   segundos. Se topea el alto y el video recorta a los costados en vez de
   estirar la página. */
@media (min-width: 768px) {
  .hb-video-solo .hb-media { max-height: 56vh; }
}

/* ===== PRODUCTOS ======================================================== */
.hb-prods { display: grid; gap: var(--hb-gap); grid-template-columns: 1fr 1fr; }
.hb-p { display: block; text-decoration: none; color: inherit; }
.hb-p-foto { position: relative; border-radius: var(--hb-radio); overflow: hidden; background: rgba(127,127,127,.08); aspect-ratio: 1 / 1; }
.hb-p--grande .hb-p-foto { aspect-ratio: 4 / 3; }
.hb-p-foto .hb-pic { position: absolute; inset: 0; }
.hb-p-foto img { transition: transform .5s cubic-bezier(.2,.6,.2,1); }
.hb-p:hover .hb-p-foto img { transform: scale(1.04); }
.hb-p-off {
  position: absolute; left: 10px; top: 10px; z-index: 2; background: var(--hb-accent); color: #fff;
  font-size: 11px; font-weight: 700; letter-spacing: .04em; padding: 4px 8px; border-radius: 3px;
}
.hb-p-body { padding: 10px 2px 0; }
.hb-p-nombre { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.3; color: inherit;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hb-p--grande .hb-p-nombre { font-size: clamp(17px, 3.4vw, 22px); -webkit-line-clamp: 3; }
.hb-p-precio { margin-top: 6px; font-size: 15px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.hb-p-final { font-weight: 700; }
.hb-p-tachado { text-decoration: line-through; color: var(--hb-muted); font-size: 13px; }
.hb-prods--scroll {
  grid-auto-flow: column; grid-auto-columns: 46%; grid-template-columns: none; overflow-x: auto;
  scroll-snap-type: x mandatory; margin: 0 calc(-1 * var(--hb-borde)); padding: 0 var(--hb-borde) 4px; scrollbar-width: none;
}
.hb-prods--scroll::-webkit-scrollbar { display: none; }
.hb-prods--scroll > * { scroll-snap-align: start; }
.hb-prods--destacado { grid-template-columns: 1fr; }
.hb-prods-resto { display: grid; grid-template-columns: 1fr 1fr; gap: var(--hb-gap); }

/* ===== CINTA DE TEXTO =================================================== */
.hb--cinta { padding: 0; }
.hb--cinta.hb-w-completo > .hb-wrap { padding: 0; max-width: none; }
.hb--cinta.hb-w-contenido { padding: var(--hb-pad) 0; }
.hb-cinta {
  display: block; overflow: hidden; text-decoration: none; color: inherit;
  border-top: 1px solid var(--hb-line); border-bottom: 1px solid var(--hb-line);
  padding: 14px 0; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
}
.hb-cinta-pista { display: flex; width: max-content; animation: hb-desliz 26s linear infinite; }
.hb-cinta--lenta { animation-duration: 44s; }
.hb-cinta--rapida { animation-duration: 16s; }
.hb-cinta-grupo { display: flex; }
.hb-cinta-item {
  display: inline-flex; align-items: center; padding: 0 22px; white-space: nowrap;
  font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
}
.hb-cinta-item::after { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--hb-accent); margin-left: 22px; }
.hb-t-acento .hb-cinta-item::after { background: currentColor; }
@keyframes hb-desliz { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ===== PREGUNTAS FRECUENTES ============================================= */
.hb-faq { border-top: 1px solid var(--hb-line); max-width: 820px; }
.hb-faq-item { border-bottom: 1px solid var(--hb-line); }
.hb-faq-q {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 16px 0; cursor: pointer; list-style: none; font-size: 16px; font-weight: 600; line-height: 1.35;
}
.hb-faq-q::-webkit-details-marker { display: none; }
.hb-faq-mas { position: relative; flex: none; width: 16px; height: 16px; margin-top: 3px; }
.hb-faq-mas::before, .hb-faq-mas::after {
  content: ""; position: absolute; background: currentColor; transition: transform .2s ease, opacity .2s ease;
}
.hb-faq-mas::before { left: 0; top: 7px; width: 16px; height: 2px; }
.hb-faq-mas::after { left: 7px; top: 0; width: 2px; height: 16px; }
.hb-faq-item[open] .hb-faq-mas::after { transform: rotate(90deg); opacity: 0; }
.hb-faq-a { padding: 0 0 18px; color: var(--hb-muted); font-size: 15px; line-height: 1.6; max-width: 68ch; }
.hb-faq-a p { margin: 0 0 10px; }
.hb-faq-a p:last-child { margin-bottom: 0; }

/* ===== RUBROS =========================================================== */
.hb-rubros { display: grid; gap: var(--hb-gap); grid-template-columns: 1fr 1fr; }
.hb-rubro {
  position: relative; display: block; text-decoration: none; color: inherit; overflow: hidden;
  border-radius: var(--hb-radio);
}
.hb-rubros--foto .hb-rubro { min-height: 0; }
.hb-rubro-media { position: relative; }
.hb-rubro-media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.15) 60%, rgba(0,0,0,.05)); }
.hb-rubro-media img { transition: transform .5s cubic-bezier(.2,.6,.2,1); }
a.hb-rubro:hover .hb-rubro-media img { transform: scale(1.05); }
.hb-rubros--foto .hb-rubro-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px; color: #fff; }
.hb-rubros--texto .hb-rubro { border: 1px solid var(--hb-line); }
.hb-rubros--texto .hb-rubro-body { padding: 18px 16px; min-height: 108px; display: flex; flex-direction: column; justify-content: flex-end; }
.hb-rubro-body h3 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -.01em; color: inherit; }
.hb-rubro-body p { margin: 4px 0 0; font-size: 13px; line-height: 1.4; opacity: .82; }
.hb-rubros--texto .hb-rubro-body p { color: var(--hb-muted); opacity: 1; }
.hb-rubros--texto a.hb-rubro:hover { border-color: var(--hb-accent); }

/* ===== ESCRITORIO ======================================================= */
@media (min-width: 768px) {
  .hb { --hb-gap: 20px; }
  .hb-sp-compacto { --hb-pad: 36px; }
  .hb-sp-normal   { --hb-pad: 64px; }
  .hb-sp-amplio   { --hb-pad: 96px; }
  .hb { --hb-borde: 32px; }
  .hb-w-completo { --hb-borde: 0px; }
  .hb-w-completo > .hb-wrap > .hb-head,
  .hb-w-completo > .hb-wrap > .hb-ctas,
  .hb-w-completo .hb-faq,
  .hb-w-completo .hb-attrs:not(.hb-m-scroll),
  .hb-w-completo .hb-rubros,
  .hb-w-completo .hb-editorial:not(.hb-m-scroll),
  .hb-w-completo .hb-prods:not(.hb-prods--scroll) { padding-left: 32px; padding-right: 32px; }
  /* La columna de texto de un split ya tiene su propio aire por el gap y, si
     está superpuesta, su propio padding: se le da sólo el borde exterior. */
  .hb-w-completo .hb-split--izquierda .hb-split-body { padding-left: 0; padding-right: 32px; }
  .hb-w-completo .hb-split--derecha .hb-split-body { padding-left: 32px; padding-right: 0; }
  .hb-w-completo .hb-split--izquierda .hb-media { border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .hb-w-completo .hb-split--derecha .hb-media { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .hb-solo-mobile { display: none; }
  .hb-solo-desktop { display: block; }

  .hb-title { font-size: clamp(30px, 3.4vw, 46px); }
  .hb-head { margin-bottom: 28px; }
  /* Un título de sección no se lee mejor por medir 1240 px de ancho. */
  .hb-head:not(.hb-head--centro) { max-width: 46ch; }

  .hb-portada { min-height: 460px; }
  .hb-portada--compacta { min-height: 320px; }
  .hb-portada--alta { min-height: 640px; }
  .hb-portada--pantalla { min-height: calc(100svh - 140px); }
  .hb-portada-body { padding: 48px max(32px, var(--hb-borde)) 52px; }
  .hb-portada-body .hb-head { max-width: 16ch; }
  .hb-portada--derecha { justify-content: flex-end; }
  .hb-portada--derecha .hb-portada-body { text-align: right; }
  .hb-portada--derecha .hb-kicker { justify-content: flex-end; }
  .hb-portada--derecha .hb-ctas { justify-content: flex-end; }
  .hb-portada--derecha .hb-portada-body .hb-head,
  .hb-portada--derecha .hb-portada-body .hb-text { margin-left: auto; }
  /* En escritorio el texto vuelve arriba de la foto aunque en celular vaya abajo. */
  .hb-portada--texto-abajo { display: flex; min-height: 460px; }
  .hb-portada--texto-abajo .hb-portada-fondo { position: absolute; aspect-ratio: auto; }
  .hb-portada--texto-abajo .hb-portada-fondo::after {
    background:
      linear-gradient(to top, rgba(0,0,0,calc(var(--hb-velo,.45) * .55)) 0%, rgba(0,0,0,0) 62%),
      rgba(0,0,0,calc(var(--hb-velo,.45) * .72));
  }
  .hb-portada--texto-abajo .hb-portada-body { color: #fff; padding: 48px max(32px, var(--hb-borde)) 52px; }
  .hb-portada--texto-abajo .hb-portada-body .hb-text { color: rgba(255,255,255,.9); }

  .hb-split { grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
  .hb-split--derecha .hb-split-media { order: 2; }
  .hb-split-body { padding: 8px 0; }

  /* CÓMO SE UNE LA FOTO CON EL TEXTO (sólo en escritorio).
     "Uno al lado del otro" con 48 px de aire en el medio se lee como dos cajas
     que no se conocen: la foto por un lado, un párrafo por el otro. Las otras
     dos opciones las atan.

     SUPERPUESTO (por defecto): la tarjeta de texto monta sobre el borde de la
     foto. Es el recurso editorial de toda la vida y, a diferencia de sangrar la
     imagen hasta el borde de la pantalla, no depende de calcular anchos de
     ventana — así que no se rompe con el scrollbar ni en pantallas raras.
     La columna del texto se angosta a 1fr/1.15fr para que la foto gane peso. */
  .hb-split.hb-u-superpuesto { grid-template-columns: 1.15fr 1fr; gap: 0; align-items: center; }
  .hb-split.hb-u-superpuesto .hb-split-body {
    position: relative; z-index: 1;
    background: var(--hb-bg);
    border-radius: var(--hb-radio);
    padding: 34px 36px;
    margin-left: -64px;
    /* Sobre tema claro la tarjeta es blanca sobre blanco: del lado que NO monta
       sobre el video se desdibujaba y parecía texto suelto flotando. El filete
       la cierra como objeto; la sombra sola no alcanza. */
    border: 1px solid var(--hb-line);
    box-shadow: 0 18px 50px rgba(0,0,0,.13);
    /* Con textos cortos la tarjeta no tiene por qué llegar al borde: se centra
       verticalmente y deja aire, en vez de estirarse. */
    align-self: center;
  }
  /* Con la foto a la derecha, la tarjeta monta desde el otro lado. */
  .hb-split.hb-u-superpuesto.hb-split--derecha { grid-template-columns: 1fr 1.15fr; }
  .hb-split.hb-u-superpuesto.hb-split--derecha .hb-split-body {
    margin-left: 0; margin-right: -64px;
  }
  /* En tema oscuro la sombra no se ve: se marca con un filete de acento. */
  .hb-t-oscuro .hb-split.hb-u-superpuesto .hb-split-body,
  .hb-t-acento .hb-split.hb-u-superpuesto .hb-split-body {
    box-shadow: none; border: 1px solid var(--hb-line); border-left: 3px solid var(--hb-accent);
  }
  .hb-t-acento .hb-split.hb-u-superpuesto .hb-split-body { border-left-color: currentColor; }

  /* MARCO: un bloque de color corrido detrás de la foto. Más sobrio que la
     superposición y sirve cuando la foto ya tiene mucho contraste propio. */
  .hb-split.hb-u-marco { gap: 56px; }
  .hb-split.hb-u-marco .hb-split-media { position: relative; }
  .hb-split.hb-u-marco .hb-split-media::before {
    content: ""; position: absolute; z-index: 0;
    inset: 22px -22px -22px 22px;
    border: 2px solid var(--hb-accent); border-radius: var(--hb-radio);
  }
  .hb-split.hb-u-marco.hb-split--derecha .hb-split-media::before { inset: 22px 22px -22px -22px; }
  .hb-split.hb-u-marco .hb-media { position: relative; z-index: 1; }

  .hb-attrs, .hb-attrs.hb-m-scroll, .hb-attrs.hb-m-dos {
    grid-auto-flow: row; grid-auto-columns: auto; overflow: visible; margin: 0; padding: 0;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }
  .hb-attrs[data-hb-cols="4"] { grid-template-columns: repeat(4, 1fr); }
  /* Dos o tres atributos no tienen que ocupar media pantalla cada uno: es un
     ícono y dos renglones. */
  .hb-attrs[data-hb-cols="3"] { grid-template-columns: repeat(3, minmax(0, 340px)); }
  .hb-attrs[data-hb-cols="2"] { grid-template-columns: repeat(2, minmax(0, 340px)); }

  .hb-editorial, .hb-editorial.hb-m-scroll {
    grid-auto-flow: row; overflow: visible; margin: 0; padding: 0;
    grid-template-columns: 1.35fr 1fr;
  }
  /* ALTO TOPEADO.
     Antes las filas eran 1fr 1fr sin alto declarado: lo marcaba la foto de las
     placas chicas (1:1 sobre una columna de ~490 px = 490 px cada una), así que
     el editorial medía 1.004 px de grilla y 1.211 px de sección — más de una
     pantalla de notebook para tres fotos. Con el alto fijo la composición es la
     misma pero entra en pantalla, y como la foto ahora llena la placa (no al
     revés) recorta en vez de estirar. */
  .hb-editorial[data-hb-tiles="3"] {
    grid-template-rows: repeat(2, minmax(0, 1fr));
    height: clamp(400px, 36vw, 520px);
  }
  .hb-editorial[data-hb-tiles="3"] .hb-tile--grande { grid-row: span 2; }
  .hb-editorial[data-hb-tiles="2"] {
    grid-template-rows: minmax(0, 1fr);
    height: clamp(320px, 30vw, 440px);
  }
  /* La grilla manda el alto: las placas dejan de tener proporción propia. */
  .hb-editorial .hb-tile { aspect-ratio: auto; height: 100%; }
  .hb-editorial .hb-tile-body { padding: 24px; }
  /* En una placa chica y baja, tres renglones de texto no entran: se recorta a
     dos y el título a dos líneas, en vez de desbordar sobre la foto. */
  .hb-editorial .hb-tile--chica .hb-tile-title {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .hb-editorial .hb-tile--chica .hb-tile-text {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .hb-prods { grid-template-columns: repeat(4, 1fr); justify-content: start; }
  .hb-prods[data-hb-cols="3"] { grid-template-columns: repeat(3, minmax(0, 320px)); }
  .hb-prods[data-hb-cols="2"] { grid-template-columns: repeat(2, minmax(0, 320px)); }
  .hb-prods[data-hb-cols="1"] { grid-template-columns: minmax(0, 360px); }
  .hb-prods--scroll { grid-auto-flow: row; overflow: visible; margin: 0; padding: 0; }
  .hb-prods--destacado { grid-template-columns: 1.15fr 1fr; align-items: start; }
  .hb-prods-resto { grid-template-columns: 1fr 1fr; }

  .hb-rubros { grid-template-columns: repeat(4, 1fr); }
  /* Mismo problema que los productos: la foto de un rubro es 3:4, así que dos
     columnas estiradas daban placas de 600 x 800. */
  .hb-rubros { justify-content: start; }
  .hb-rubros[data-hb-cols="3"] { grid-template-columns: repeat(3, minmax(0, 300px)); }
  .hb-rubros[data-hb-cols="2"] { grid-template-columns: repeat(2, minmax(0, 300px)); }
  .hb-rubros--texto .hb-rubro-body { min-height: 132px; }

  .hb-faq-q { font-size: 17px; padding: 20px 0; }
  .hb-cinta-item { font-size: 14px; padding: 0 28px; }
}

/* Quien pidió menos movimiento en su sistema no ve la cinta desplazarse ni los
   zooms de las fotos. No es un detalle de accesibilidad: en algunos celulares
   el movimiento constante también gasta batería. */
@media (prefers-reduced-motion: reduce) {
  .hb-cinta-pista { animation: none; transform: none; }
  .hb-cinta { -webkit-mask-image: none; mask-image: none; }
  .hb-cinta-pista { width: 100%; overflow-x: auto; justify-content: center; flex-wrap: wrap; }
  .hb-cinta-grupo[aria-hidden="true"] { display: none; }
  .hb *, .hb *::before, .hb *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

/* -------------------------------------------------------------------------
 * COMPORTAMIENTO
 * Lo mínimo que no se puede hacer con CSS. Se ejecuta una sola vez por página,
 * es delegado (sirve para bloques que se inyectan después) y no depende de
 * jQuery ni de nada del theme.
 * ----------------------------------------------------------------------- */

const JS = `
(function () {
  'use strict';
  if (window.__blacksBlocks) return;
  window.__blacksBlocks = true;

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Datos limitados o red lenta declarada por el navegador: no se autoreproduce
  // nada. Un MP4 de ambiente no vale el megabyte de quien está con 3G.
  function redeAhorro() {
    var c = navigator.connection;
    if (!c) return false;
    if (c.saveData) return true;
    return ['slow-2g', '2g'].indexOf(c.effectiveType) !== -1;
  }
  var ahorro = redeAhorro();

  /* --- videos MP4: cargar y reproducir sólo cuando están a la vista ------ */
  function activarVideo(v) {
    if (v.dataset.hbListo) return;
    v.dataset.hbListo = '1';
    var s = v.querySelector('source[data-src]');
    if (s) {
      s.src = s.dataset.src;
      /* preload pasa de "none" a "auto" ACÁ, no en el HTML.
         En el HTML sigue en "none" para no bajar el video en visitas que nunca
         scrollean hasta el bloque. Pero una vez que el bloque entró en pantalla
         conviene bajarlo ENTERO: con "none" el clip llegaba al final todavía
         descargando y el loop se quedaba esperando datos — es el tironeo al
         volver a empezar. Con el archivo completo en el buffer, la vuelta es
         instantánea. */
      v.preload = 'auto';
      v.load();
    }
    aplicarVelocidad(v);
  }

  /* Velocidad de reproducción configurable desde el panel. Se reaplica después
     de cada load(): el navegador la resetea a 1 al cambiar de fuente. */
  function aplicarVelocidad(v) {
    var r = parseFloat(v.dataset.hbSpeed || '1');
    if (r > 0 && r !== 1) {
      v.playbackRate = r;
      v.addEventListener('loadeddata', function () { v.playbackRate = r; }, { once: true });
    }
  }

  /* play() pedido justo después de load() se ABORTA: el navegador todavía está
     buscando el archivo y tira "The play() request was interrupted by a new
     load request". Como el .catch se lo tragaba, el video quedaba quieto sin
     que nada lo dijera. Acá se reintenta una vez, cuando ya hay datos. */
  function reproducir(v) {
    var intento = v.play();
    if (!intento || !intento.catch) return;
    intento.catch(function () {
      if (v.dataset.hbReintento) return;
      v.dataset.hbReintento = '1';
      v.addEventListener('loadeddata', function () {
        v.play().catch(function () { /* el navegador dijo que no: queda el poster */ });
      }, { once: true });
    });
  }

  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) {
        activarVideo(v);
        if (v.dataset.hbAutoplay && !reduce && !ahorro && !v.dataset.hbPausadoAMano) {
          reproducir(v);
        }
      } else if (!v.paused) {
        // Fuera de pantalla se pausa siempre: un video corriendo que nadie ve
        // gasta datos y batería. Al volver a entrar sigue solo.
        v.pause();
      }
      var b = v.parentElement && v.parentElement.querySelector('[data-hb-toggle]');
      if (b) pintarToggle(b, v.paused && !!v.dataset.hbPausadoAMano);
    });
  }, { rootMargin: '200px 0px', threshold: 0.25 }) : null;

  function registrar(raiz) {
    (raiz || document).querySelectorAll('.hb-video').forEach(function (v) {
      if (v.dataset.hbObs) return;
      v.dataset.hbObs = '1';
      if (io) io.observe(v); else activarVideo(v);
    });
  }

  function pintarToggle(btn, pausado) {
    // Una clase en el botón y el CSS decide cuál de los dos íconos se ve.
    // (El atributo hidden no funciona sobre SVG: no es un HTMLElement.)
    btn.classList.toggle('is-pausado', !!pausado);
    btn.setAttribute('aria-label', pausado ? 'Reproducir video' : 'Pausar video');
  }

  /* --- clics: play de fachada, pausa de cinta, botón de sonido ---------- */
  document.addEventListener('click', function (ev) {
    var play = ev.target.closest ? ev.target.closest('.hb-play') : null;
    if (play) {
      var caja = play.closest('.hb-media');
      if (!caja) return;
      ev.preventDefault();
      if (caja.dataset.hbVideo === 'embed') {
        var url = caja.dataset.hbEmbed;
        if (!url) return;
        var f = document.createElement('iframe');
        f.src = url;
        f.title = 'Video';
        f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
        f.setAttribute('allowfullscreen', '');
        f.setAttribute('loading', 'lazy');
        caja.innerHTML = '';
        caja.appendChild(f);
        caja.classList.remove('hb-facade');
      } else {
        var v = caja.querySelector('video');
        if (!v) return;
        activarVideo(v);
        reproducir(v);
        v.setAttribute('controls', '');
        play.remove();
      }
      return;
    }

    // Modo cinta (loop): pausa y reanudar, nada más. No hay barra de avance.
    var tog = ev.target.closest ? ev.target.closest('[data-hb-toggle]') : null;
    if (tog) {
      var cajaT = tog.closest('.hb-media');
      var vt = cajaT && cajaT.querySelector('video');
      if (!vt) return;
      ev.preventDefault();
      if (vt.paused) {
        activarVideo(vt);
        reproducir(vt);
      } else {
        vt.pause();
      }
      pintarToggle(tog, vt.paused);
      // Pausado a mano = pausado en serio: el observador no lo vuelve a arrancar
      // al salir y entrar de pantalla.
      vt.dataset.hbPausadoAMano = vt.paused ? '1' : '';
      return;
    }

    var son = ev.target.closest ? ev.target.closest('.hb-sound') : null;
    if (son) {
      var vid = son.closest('.hb-media') && son.closest('.hb-media').querySelector('video');
      if (!vid) return;
      ev.preventDefault();
      vid.muted = !vid.muted;
      son.setAttribute('aria-pressed', String(!vid.muted));
      var on = son.querySelector('.hb-sound-on'); var off = son.querySelector('.hb-sound-off');
      if (on) on.hidden = vid.muted;
      if (off) off.hidden = !vid.muted;
      if (vid.paused) vid.play().catch(function () {});
    }
  }, false);

  // Un <details> abierto por vez dentro del mismo bloque de preguntas.
  document.addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (!d.classList || !d.classList.contains('hb-faq-item') || !d.open) return;
    var cont = d.parentElement;
    if (!cont) return;
    cont.querySelectorAll('.hb-faq-item[open]').forEach(function (o) { if (o !== d) o.open = false; });
  }, true);

  /* VOLVER A LA PESTAÑA.
     Chrome pausa el video sin audio cuando la pestaña se va a segundo plano
     ("video-only background media was paused to save power") y al volver NO lo
     reanuda. Como el observador sólo reacciona cuando cambia la intersección, y
     al volver no cambia nada, el clip quedaba congelado hasta scrollear. Se
     reanuda a mano lo que esté en pantalla y no haya pausado el visitante. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    document.querySelectorAll('.hb-video[data-hb-autoplay]').forEach(function (v) {
      if (!v.paused || v.dataset.hbPausadoAMano || reduce || ahorro) return;
      var r = v.getBoundingClientRect();
      var visible = r.bottom > 0 && r.top < (window.innerHeight || 0);
      if (visible) reproducir(v);
    });
  });

  window.blacksBlocksInit = registrar;
  registrar(document);
})();
`;

module.exports = { CSS, JS };
