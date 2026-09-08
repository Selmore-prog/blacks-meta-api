/* =========================================================================
 * BLOQUES DEL HOME — secciones de contenido armadas desde el panel.
 *
 * QUÉ PROBLEMA RESUELVE
 * El theme traía ocho "layouts modernos" (hero_split, magazine, parallax…)
 * que sólo sabían mostrar productos: se configuraban pegando la URL de cada
 * producto en el panel de diseño de Tiendanube y, en cada visita, el navegador
 * se bajaba la PÁGINA HTML COMPLETA de cada uno para robarle la foto y el
 * precio con DOMParser. Además no había forma de poner una foto propia, un
 * video, un texto informativo ni de ver cómo iba a quedar antes de publicar.
 *
 * Acá vive el reemplazo: un catálogo de bloques con campos declarados, que se
 * completan desde el panel del motor (con vista previa real, en mobile y en
 * desktop) y que la tienda recibe YA RENDERIZADOS EN HTML dentro del mismo
 * JSON que ya pide para los rieles. Un solo fetch para todo el home.
 *
 * POR QUÉ EL HTML SE ARMA ACÁ Y NO EN EL THEME
 * Para que la vista previa del panel y lo que ve el cliente sean el MISMO
 * HTML, salido de la misma función. Si el theme lo armara por su cuenta habría
 * dos implementaciones para mantener en sincronía y la previa mentiría.
 * El CSS y el comportamiento (video, acordeón) viven en homeBlocksAssets.js y
 * se copian al theme con `npm run export:theme` — así la tienda no depende de
 * bajar CSS de Render para pintar.
 * ========================================================================= */

const pool = require('./db');
const { getSetting, setSetting } = require('./settings');
const { renderBlock } = require('./homeBlocksRender');
const { productPath } = require('./homeRails');

/* Los huecos NO son libres: el theme declara exactamente seis posiciones
   (block_1..block_6 en el orden de la página de inicio). Un bloque con otro
   id se guardaría y no lo dibujaría nadie. */
const SLOT_IDS = ['block_1', 'block_2', 'block_3', 'block_4', 'block_5', 'block_6'];

const THEMES = ['claro', 'oscuro', 'arena', 'acento'];
const WIDTHS = ['contenido', 'completo'];
const SPACINGS = ['compacto', 'normal', 'amplio'];
const DEVICES = ['todos', 'mobile', 'desktop'];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

/* -------------------------------------------------------------------------
 * TIPOS DE BLOQUE
 *
 * Cada tipo declara sus campos y el panel arma el formulario solo: no hay HTML
 * de formulario escrito a mano por tipo. `sketch` es el esquema (wireframe) que
 * se muestra en el selector para que se entienda la estructura antes de elegir.
 * `sugerencias` son textos ya escritos para ESTA tienda (ropa de trabajo,
 * seguridad e industria) que se cargan con un clic.
 *
 * Tipos de campo que entiende el panel:
 *   texto | textarea | url | imagen | video | opciones | switch | numero |
 *   color | lista (subcampos repetibles) | productos (buscador del catálogo)
 * `when` oculta el campo si otro campo no tiene cierto valor.
 * ----------------------------------------------------------------------- */

const CTA_FIELDS = (prefijo, etiqueta) => ([
  { key: `${prefijo}_text`, label: `${etiqueta}: texto`, type: 'texto', max: 40, placeholder: 'Ver la línea' },
  { key: `${prefijo}_url`, label: `${etiqueta}: link`, type: 'url', placeholder: '/ropa-de-trabajo' },
]);

const MEDIA_FIELDS = [
  { key: 'image', label: 'Imagen (desktop)', type: 'imagen', help: 'Se usa en computadoras y, si no cargás una mobile, también en celulares. Ideal 1600 px de ancho.' },
  { key: 'image_mobile', label: 'Imagen (celular)', type: 'imagen', help: 'Opcional pero recomendado: una foto vertical pesa menos y encuadra mejor. El 80% de las visitas son de celular.' },
  { key: 'image_alt', label: 'Descripción de la imagen', type: 'texto', max: 120, help: 'Lo que lee Google y quien no puede ver la foto. Ej: "Operario con campera ignífuga en planta".' },
];

/* VIDEO.
   Ya no se pregunta "de dónde sale el video": se deduce de la URL
   (ver origenDelVideo en homeBlocksRender.js). El desplegable era una trampa —
   el tipo "video" venía con YouTube elegido de fábrica, así que quien subía un
   MP4 propio y no lo tocaba terminaba con su archivo metido en un iframe, sin
   autoplay y sin loop. */
const VIDEO_FIELDS = [
  {
    key: 'video_url', label: 'Video', type: 'video',
    help: 'Subí un MP4 propio, o pegá el link de YouTube, Vimeo o Cloudflare Stream. Me doy cuenta solo de cuál es.',
  },
  {
    key: 'video_loop', label: 'Repetir sin parar (como un GIF)', type: 'switch', default: true,
    when: { key: 'video_url', lleno: true },
    help: 'Arranca solo al entrar en pantalla, se repite y lo único que se puede tocar es pausa. Sin barra de avance: para un clip corto de ambiente es lo que corresponde.',
  },
  {
    key: 'video_muted', label: 'Sin sonido', type: 'switch', default: true,
    when: { key: 'video_url', lleno: true },
    help: 'Recomendado. Un video que suena solo espanta. Además, ningún navegador deja que un video arranque solo CON sonido: si lo desactivás y el video arranca solo, igual empieza en silencio.',
  },
  {
    key: 'video_speed', label: 'Velocidad', type: 'opciones', default: '1',
    when: { key: 'video_url', lleno: true },
    options: [
      { value: '0.5', label: 'Mitad de velocidad (0,5x)' },
      { value: '0.75', label: 'Un poco más lento (0,75x)' },
      { value: '1', label: 'Normal' },
      { value: '1.25', label: 'Un poco más rápido (1,25x)' },
      { value: '1.5', label: 'Rápido (1,5x)' },
      { value: '2', label: 'Doble (2x)' },
    ],
    help: 'Para un clip de ambiente, bajarlo a 0,75x suele quedar mejor. Ojo: si el video tiene sonido, cambiar la velocidad también cambia el tono.',
  },
  {
    key: 'video_autoplay', label: 'Arrancar solo', type: 'switch', default: true,
    when: { key: 'video_url', lleno: true },
    help: 'Sólo para MP4 propio. Arranca al entrar en pantalla y se pausa al salir, para no gastar datos ni batería de fondo. Si el visitante tiene datos limitados o pidió "reducir movimiento", no arranca: ve la foto con el botón de play.',
  },
  {
    key: 'video_controls', label: 'Mostrar controles', type: 'switch', default: false,
    when: { key: 'video_url', lleno: true },
    help: 'Barra de avance, volumen y pantalla completa. Para un video explicativo. No aplica si está en modo "repetir sin parar".',
  },
  {
    key: 'video_sound_toggle', label: 'Botón para activar el sonido', type: 'switch', default: false,
    when: { key: 'video_muted', is: false },
    help: 'Sólo si desactivaste "Sin sonido" y el archivo tiene audio.',
  },
];

const BLOCK_TYPES = {
  /* ------------------------------------------------------------------ */
  portada: {
    label: 'Portada',
    resumen: 'Foto o video a todo lo ancho, con título grande y botones encima.',
    para: 'Abrir el home o cortar la página con una imagen fuerte. Es el bloque con más impacto.',
    sketch: 'portada',
    fields: [
      { key: 'kicker', label: 'Volanta', type: 'texto', max: 40, placeholder: 'Línea industrial', help: 'El textito chico de arriba del título.' },
      { key: 'title', label: 'Título', type: 'texto', max: 70, placeholder: 'Trabajo pesado, terminación urbana' },
      { key: 'text', label: 'Bajada', type: 'textarea', max: 220 },
      ...MEDIA_FIELDS,
      ...VIDEO_FIELDS,
      ...CTA_FIELDS('cta1', 'Botón principal'),
      ...CTA_FIELDS('cta2', 'Botón secundario'),
      {
        key: 'height', label: 'Alto', type: 'opciones', default: 'media',
        options: [
          { value: 'compacta', label: 'Compacta (tira)' },
          { value: 'media', label: 'Media' },
          { value: 'alta', label: 'Alta' },
          { value: 'pantalla', label: 'Pantalla completa' },
        ],
      },
      {
        key: 'align', label: 'Posición del texto', type: 'opciones', default: 'izquierda',
        options: [
          { value: 'izquierda', label: 'Abajo a la izquierda' },
          { value: 'centro', label: 'Centrado' },
          { value: 'derecha', label: 'Abajo a la derecha' },
        ],
      },
      {
        key: 'overlay', label: 'Oscurecer la foto', type: 'numero', default: 45, min: 0, max: 85,
        help: 'Cuánto se oscurece la imagen para que el texto se lea. 0 = sin velo, 85 = muy oscuro.',
      },
      {
        key: 'text_below_mobile', label: 'En celular, texto debajo de la foto', type: 'switch', default: false,
        help: 'Recomendado cuando el título es largo: en pantallas chicas el texto encima tapa la foto.',
      },
    ],
    sugerencias: [
      { kicker: 'Línea industrial', title: 'Trabajo pesado, terminación urbana', text: 'Indumentaria que aguanta la jornada y no parece uniforme.', cta1_text: 'Ver la línea', cta1_url: '/ropa-de-trabajo' },
      { kicker: 'Seguridad certificada', title: 'Lo que te protege no se improvisa', text: 'Calzado y ropa con norma IRAM, stock permanente y talles reales.', cta1_text: 'Ver seguridad', cta1_url: '/seguridad' },
      { kicker: 'Mayorista', title: 'Equipá a todo tu equipo', text: 'Precios por cantidad, factura A y entrega en 48 hs.', cta1_text: 'Pedir lista mayorista', cta1_url: '/mayorista' },
    ],
  },

  /* ------------------------------------------------------------------ */
  media_texto: {
    label: 'Imagen y texto',
    resumen: 'Foto o video de un lado, texto con viñetas y botón del otro.',
    para: 'Explicar algo: una norma, un material, por qué conviene una línea. El bloque informativo por defecto.',
    sketch: 'media_texto',
    fields: [
      { key: 'kicker', label: 'Volanta', type: 'texto', max: 40 },
      { key: 'title', label: 'Título', type: 'texto', max: 70, placeholder: '¿Qué significa que un calzado sea IRAM 3610?' },
      { key: 'text', label: 'Texto', type: 'textarea', max: 500 },
      {
        key: 'bullets', label: 'Viñetas', type: 'lista', max: 6,
        item: [
          { key: 'text', label: 'Punto', type: 'texto', max: 90, placeholder: 'Puntera de acero: resiste 200 joules' },
        ],
      },
      ...MEDIA_FIELDS,
      ...VIDEO_FIELDS,
      ...CTA_FIELDS('cta1', 'Botón'),
      {
        key: 'media_side', label: 'La imagen va', type: 'opciones', default: 'izquierda',
        options: [{ value: 'izquierda', label: 'A la izquierda' }, { value: 'derecha', label: 'A la derecha' }],
        help: 'En celular siempre queda arriba del texto.',
      },
      {
        key: 'ratio', label: 'Forma de la imagen', type: 'opciones', default: '3-2',
        options: [
          { value: '1-1', label: 'Cuadrada' },
          { value: '3-2', label: 'Apaisada 3:2 (recomendada)' },
          { value: '4-3', label: 'Apaisada 4:3' },
          { value: '3-4', label: 'Vertical 3:4' },
          { value: '16-9', label: 'Panorámica 16:9' },
        ],
      },
      {
        key: 'media_style', label: 'Cómo se une la foto con el texto', type: 'opciones', default: 'superpuesto',
        options: [
          { value: 'superpuesto', label: 'El texto monta sobre la foto (recomendado)' },
          { value: 'simple', label: 'Uno al lado del otro' },
          { value: 'marco', label: 'Con marco de color detrás de la foto' },
        ],
        help: 'Sólo cambia en computadora: en celular la foto siempre va arriba del texto. "Superpuesto" es lo que hace que la sección no parezca dos cajas sueltas.',
      },
    ],
    sugerencias: [
      {
        kicker: 'Cómo elegir', title: '¿Qué significa que un calzado sea IRAM 3610?',
        text: 'Es la norma argentina que certifica el calzado de seguridad. No es un sello decorativo: define cuánto impacto aguanta la puntera y cómo se comporta la suela.',
        bullets: [{ text: 'Puntera que resiste 200 joules de impacto' }, { text: 'Suela antideslizante medida en piso mojado' }, { text: 'Resistencia a la perforación de la planta' }, { text: 'Certificado por lote, no por modelo' }],
        cta1_text: 'Ver calzado certificado', cta1_url: '/calzado-de-seguridad',
      },
      {
        kicker: 'Materiales', title: 'Grafa, gabardina y ripstop: cuál te sirve',
        text: 'La tela decide si la prenda dura una temporada o tres. Esta es la diferencia real en la mano y en el uso.',
        bullets: [{ text: 'Grafa 70: la más resistente, para obra y taller' }, { text: 'Gabardina: más liviana, para atención y logística' }, { text: 'Ripstop: no propaga el desgarro, ideal para campo' }],
        cta1_text: 'Ver por material', cta1_url: '/ropa-de-trabajo',
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  atributos: {
    label: 'Tira de atributos',
    resumen: 'Tres a seis ítems cortos con ícono, título y una línea de texto.',
    para: 'Las razones para comprar acá: envío, factura A, talles, garantía. Va bien arriba de todo o justo antes del pie.',
    sketch: 'atributos',
    fields: [
      { key: 'title', label: 'Título (opcional)', type: 'texto', max: 70 },
      {
        key: 'items', label: 'Ítems', type: 'lista', max: 6, min: 2,
        item: [
          {
            key: 'icon', label: 'Ícono', type: 'opciones', default: 'escudo',
            options: [
              { value: 'escudo', label: 'Escudo (seguridad)' }, { value: 'casco', label: 'Casco' },
              { value: 'camion', label: 'Camión (envío)' }, { value: 'factura', label: 'Factura' },
              { value: 'regla', label: 'Regla (talles)' }, { value: 'costura', label: 'Costura' },
              { value: 'reloj', label: 'Reloj' }, { value: 'chat', label: 'Chat' },
              { value: 'estrella', label: 'Estrella' }, { value: 'caja', label: 'Caja (stock)' },
            ],
          },
          { key: 'title', label: 'Título', type: 'texto', max: 40, placeholder: 'Factura A' },
          { key: 'text', label: 'Texto', type: 'texto', max: 110, placeholder: 'Comprás como empresa y descargás el IVA.' },
          { key: 'url', label: 'Link (opcional)', type: 'url' },
        ],
      },
      {
        key: 'style', label: 'Estilo', type: 'opciones', default: 'tarjetas',
        options: [
          { value: 'tarjetas', label: 'Tarjetas' },
          { value: 'linea', label: 'En línea, sin caja' },
          { value: 'separadores', label: 'Con separadores' },
        ],
      },
      {
        key: 'mobile_layout', label: 'En celular', type: 'opciones', default: 'scroll',
        options: [
          { value: 'scroll', label: 'Una fila que se desliza' },
          { value: 'dos', label: 'Grilla de a dos' },
          { value: 'lista', label: 'Uno abajo del otro' },
        ],
      },
    ],
    sugerencias: [
      {
        items: [
          { icon: 'factura', title: 'Factura A', text: 'Comprás como empresa y descargás el IVA.' },
          { icon: 'escudo', title: 'Certificado IRAM', text: 'El calzado de seguridad viene con su norma declarada.' },
          { icon: 'regla', title: 'Talles reales', text: 'Tabla por marca, medida en centímetros.' },
          { icon: 'camion', title: 'Envío a todo el país', text: 'Despachamos el mismo día hasta las 15 hs.' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  editorial: {
    label: 'Editorial',
    resumen: 'Una foto grande y dos chicas, cada una con su título y su link.',
    para: 'Presentar tres mundos de la tienda (obra, industria, urbano) con aire de revista en vez de un banner cuadrado.',
    sketch: 'editorial',
    fields: [
      { key: 'title', label: 'Título de la sección (opcional)', type: 'texto', max: 70 },
      { key: 'text', label: 'Bajada (opcional)', type: 'textarea', max: 200 },
      {
        key: 'tiles', label: 'Placas', type: 'lista', max: 3, min: 2,
        item: [
          { key: 'kicker', label: 'Volanta', type: 'texto', max: 30 },
          { key: 'title', label: 'Título', type: 'texto', max: 50 },
          { key: 'text', label: 'Texto corto', type: 'texto', max: 110 },
          { key: 'image', label: 'Imagen', type: 'imagen' },
          { key: 'image_alt', label: 'Descripción de la imagen', type: 'texto', max: 120 },
          { key: 'url', label: 'Link', type: 'url' },
          { key: 'cta_text', label: 'Texto del link', type: 'texto', max: 30, placeholder: 'Ver todo' },
        ],
      },
      {
        key: 'mobile_layout', label: 'En celular', type: 'opciones', default: 'apiladas',
        options: [
          { value: 'apiladas', label: 'Una abajo de la otra' },
          { value: 'scroll', label: 'Carrusel que se desliza' },
        ],
      },
    ],
    sugerencias: [
      {
        title: 'Tres formas de trabajar',
        tiles: [
          { kicker: 'Obra', title: 'Lo que aguanta el andamio', text: 'Grafa, reflectivos y calzado con puntera.', cta_text: 'Ver obra', url: '/obra' },
          { kicker: 'Industria', title: 'Planta y taller', text: 'Ignífugos, antiestáticos y ropa de línea.', cta_text: 'Ver industria', url: '/industria' },
          { kicker: 'Urbano', title: 'Sale del trabajo y sigue', text: 'Cargo, camperas y borcegos para todos los días.', cta_text: 'Ver urbano', url: '/urbano' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  video: {
    label: 'Video',
    resumen: 'Un video grande, solo o con texto al costado.',
    para: 'Mostrar la prenda en uso, un proceso o el taller. Carga liviana: primero la foto, el video recién cuando hace falta.',
    sketch: 'video',
    fields: [
      { key: 'kicker', label: 'Volanta', type: 'texto', max: 40 },
      { key: 'title', label: 'Título', type: 'texto', max: 70 },
      { key: 'text', label: 'Texto', type: 'textarea', max: 320 },
      { key: 'image', label: 'Foto de portada del video', type: 'imagen', help: 'Es lo primero que se ve y lo que se muestra si el video no puede arrancar solo. Si no la cargás, YouTube y Vimeo ponen la suya.' },
      { key: 'image_alt', label: 'Descripción de la portada', type: 'texto', max: 120 },
      ...VIDEO_FIELDS,
      ...CTA_FIELDS('cta1', 'Botón'),
      {
        key: 'layout', label: 'Disposición', type: 'opciones', default: 'solo',
        options: [
          { value: 'solo', label: 'Video solo, a todo lo ancho' },
          { value: 'texto_derecha', label: 'Video a la izquierda, texto a la derecha' },
          { value: 'texto_izquierda', label: 'Video a la derecha, texto a la izquierda' },
        ],
      },
      {
        key: 'media_style', label: 'Cómo se une el video con el texto', type: 'opciones', default: 'superpuesto',
        options: [
          { value: 'superpuesto', label: 'El texto monta sobre el video (recomendado)' },
          { value: 'simple', label: 'Uno al lado del otro' },
          { value: 'marco', label: 'Con marco de color detrás del video' },
        ],
        when: { key: 'layout', not: 'solo' },
        help: 'Sólo cambia en computadora. En celular el video siempre va arriba del texto.',
      },
      {
        key: 'ratio', label: 'Forma del video', type: 'opciones', default: '16-9',
        options: [
          { value: '16-9', label: 'Apaisado 16:9' },
          { value: '4-3', label: 'Apaisado 4:3' },
          { value: '1-1', label: 'Cuadrado' },
          { value: '9-16', label: 'Vertical 9:16 (reel)' },
        ],
      },
    ],
    sugerencias: [
      { kicker: 'En uso', title: 'Así se comporta la Grafa 70 después de 40 lavados', text: 'Lo filmamos en el taller, sin retoques.', cta1_text: 'Ver la línea', cta1_url: '/ropa-de-trabajo' },
    ],
  },

  /* ------------------------------------------------------------------ */
  productos: {
    label: 'Productos elegidos',
    resumen: 'Hasta seis productos con foto, nombre y precio reales del catálogo.',
    para: 'Destacar a mano un combo, una marca o una novedad. El precio y el stock salen del catálogo sincronizado: si se agota, deja de aparecer.',
    sketch: 'productos',
    fields: [
      { key: 'kicker', label: 'Volanta', type: 'texto', max: 40 },
      { key: 'title', label: 'Título', type: 'texto', max: 70 },
      { key: 'text', label: 'Bajada', type: 'textarea', max: 200 },
      { key: 'product_ids', label: 'Productos', type: 'productos', max: 6, min: 1 },
      ...CTA_FIELDS('cta1', 'Botón "ver todo"'),
      {
        key: 'layout', label: 'Disposición', type: 'opciones', default: 'grilla',
        options: [
          { value: 'grilla', label: 'Grilla' },
          { value: 'destacado', label: 'Uno grande + el resto al costado' },
          { value: 'scroll', label: 'Carrusel que se desliza' },
        ],
      },
      { key: 'image', label: 'Foto de ambiente (opcional)', type: 'imagen', help: 'Sólo en "Uno grande + el resto": reemplaza la foto del producto principal por una foto de uso.', when: { key: 'layout', is: 'destacado' } },
      { key: 'show_price', label: 'Mostrar precios', type: 'switch', default: true },
      { key: 'hide_out_of_stock', label: 'Ocultar los agotados', type: 'switch', default: true },
    ],
    sugerencias: [
      { kicker: 'Recomendado', title: 'El equipo completo para arrancar', text: 'Lo que más se lleva quien equipa a su gente por primera vez.', cta1_text: 'Ver todo', cta1_url: '/ropa-de-trabajo' },
    ],
  },

  /* ------------------------------------------------------------------ */
  cinta: {
    label: 'Cinta de texto',
    resumen: 'Una franja con frases cortas que se desplazan.',
    para: 'Cortar entre dos secciones pesadas y dejar un mensaje. Pesa nada y da movimiento.',
    sketch: 'cinta',
    fields: [
      {
        key: 'items', label: 'Frases', type: 'lista', max: 8, min: 1,
        item: [{ key: 'text', label: 'Frase', type: 'texto', max: 60, placeholder: 'Envío a todo el país' }],
      },
      { key: 'url', label: 'Link (opcional)', type: 'url' },
      {
        key: 'speed', label: 'Velocidad', type: 'opciones', default: 'normal',
        options: [{ value: 'lenta', label: 'Lenta' }, { value: 'normal', label: 'Normal' }, { value: 'rapida', label: 'Rápida' }],
        help: 'Si el visitante tiene activado "reducir movimiento" en su teléfono, la cinta se queda quieta.',
      },
    ],
    sugerencias: [
      { items: [{ text: 'Factura A' }, { text: 'Envío a todo el país' }, { text: 'Talles del 36 al 60' }, { text: 'Precios mayoristas' }, { text: 'Calzado certificado IRAM' }] },
    ],
  },

  /* ------------------------------------------------------------------ */
  preguntas: {
    label: 'Preguntas frecuentes',
    resumen: 'Lista de preguntas que se abren al tocarlas.',
    para: 'Sacarse de encima las dudas que hoy llegan por WhatsApp: talles, facturación, envíos, mayorista.',
    sketch: 'preguntas',
    fields: [
      { key: 'title', label: 'Título', type: 'texto', max: 70, placeholder: 'Antes de comprar' },
      { key: 'text', label: 'Bajada (opcional)', type: 'textarea', max: 200 },
      {
        key: 'items', label: 'Preguntas', type: 'lista', max: 8, min: 1,
        item: [
          { key: 'q', label: 'Pregunta', type: 'texto', max: 120 },
          { key: 'a', label: 'Respuesta', type: 'textarea', max: 600 },
        ],
      },
      ...CTA_FIELDS('cta1', 'Botón'),
      { key: 'open_first', label: 'Abrir la primera', type: 'switch', default: true },
    ],
    sugerencias: [
      {
        title: 'Antes de comprar',
        items: [
          { q: '¿Hacen factura A?', a: 'Sí. Cargá tu CUIT en el checkout y la factura A sale automática. Si comprás como empresa, descargás el IVA.' },
          { q: '¿Cómo sé qué talle pedir?', a: 'Cada producto tiene la tabla de talles de su marca, medida en centímetros. Los talles de ropa de trabajo no coinciden entre marcas: siempre mirá la tabla del producto, no el talle que usás en otra.' },
          { q: '¿Cuánto tarda el envío?', a: 'Despachamos el mismo día si comprás antes de las 15 hs. A CABA y GBA llega en 24 a 48 hs; al interior, entre 3 y 5 días hábiles.' },
          { q: '¿Tienen precios mayoristas?', a: 'Sí, desde 10 unidades. Escribinos por WhatsApp con lo que necesitás y te pasamos la lista con el descuento por cantidad.' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  rubros: {
    label: '¿Qué necesitás?',
    resumen: 'Tarjetas por rubro o uso, cada una a su categoría.',
    para: 'El atajo más directo del home: quien entra sabe a qué se dedica, no qué producto busca.',
    sketch: 'rubros',
    fields: [
      { key: 'title', label: 'Título', type: 'texto', max: 70, placeholder: '¿A qué te dedicás?' },
      { key: 'text', label: 'Bajada (opcional)', type: 'textarea', max: 200 },
      {
        key: 'items', label: 'Rubros', type: 'lista', max: 8, min: 2,
        item: [
          { key: 'title', label: 'Rubro', type: 'texto', max: 40, placeholder: 'Construcción' },
          { key: 'text', label: 'Texto corto', type: 'texto', max: 90 },
          { key: 'image', label: 'Imagen', type: 'imagen' },
          {
            key: 'image_2', label: 'Segunda imagen (opcional)', type: 'imagen',
            help: 'Si cargás una segunda foto, la placa las va alternando: se muestra sola al entrar en pantalla en el celular, y al pasar el mouse en la computadora. Sirve para mostrar el mismo look con y sin abrigo, o dos prendas de la misma categoría. Conviene que las dos estén encuadradas parecido.',
          },
          { key: 'url', label: 'Link', type: 'url' },
        ],
      },
      {
        key: 'style', label: 'Estilo', type: 'opciones', default: 'foto',
        options: [
          { value: 'foto', label: 'Con foto de fondo' },
          { value: 'texto', label: 'Sólo texto, con borde' },
        ],
      },
    ],
    sugerencias: [
      {
        title: '¿A qué te dedicás?',
        items: [
          { title: 'Construcción', text: 'Obra, altura y reflectivos', url: '/obra' },
          { title: 'Industria', text: 'Planta, taller y metalúrgica', url: '/industria' },
          { title: 'Gastronomía', text: 'Cocina, salón y antideslizante', url: '/gastronomia' },
          { title: 'Logística', text: 'Depósito, frío y reparto', url: '/logistica' },
        ],
      },
    ],
  },
};

const TYPE_IDS = Object.keys(BLOCK_TYPES);

/* -------------------------------------------------------------------------
 * CONFIGURACIÓN GUARDADA
 * ----------------------------------------------------------------------- */

const DEFAULT_CONFIG = { blocks: [] };

async function getBlocksConfig() {
  const raw = await getSetting('home_blocks');
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.blocks)) return DEFAULT_CONFIG;
    return { blocks: parsed.blocks };
  } catch (_) {
    console.warn('[homeBlocks] La config guardada no es JSON válido. Se usa la de fábrica.');
    return DEFAULT_CONFIG;
  }
}

function badRequest(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

/* Devuelve la lista plana de campos de un tipo, incluyendo los de las listas
   anidadas cuando hace falta recorrerlos. */
function fieldsOf(type) {
  const t = BLOCK_TYPES[type];
  return t ? t.fields : [];
}

const MAX_TEXT = 2000;

function limpiarTexto(valor, max) {
  const s = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return s.slice(0, Math.min(max || 200, MAX_TEXT));
}

function limpiarTextarea(valor, max) {
  // En textarea se respetan los saltos de línea, pero no más de dos seguidos.
  const s = String(valor == null ? '' : valor).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.slice(0, Math.min(max || 600, MAX_TEXT));
}

/* Sólo http(s) y rutas internas. Corta javascript: y data: — el HTML del bloque
   se inyecta con innerHTML en la tienda y un href de esos sería ejecutable. */
function limpiarUrl(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s)) return s.slice(0, 500);
  if (s.startsWith('/')) return s.slice(0, 500);
  if (/^(mailto:|tel:|#)/i.test(s)) return s.slice(0, 500);
  throw badRequest(`El link "${s.slice(0, 40)}" no es válido. Poné una dirección que empiece con / (dentro de la tienda) o con https://`);
}

function limpiarCampo(campo, valor) {
  switch (campo.type) {
    case 'texto':
      return limpiarTexto(valor, campo.max);
    case 'textarea':
      return limpiarTextarea(valor, campo.max);
    case 'url':
    case 'imagen':
    case 'video':
      return limpiarUrl(valor);
    case 'switch':
      return valor === true || valor === 'true' || valor === 1 || valor === '1';
    case 'numero': {
      const n = Number(valor);
      if (!Number.isFinite(n)) return campo.default != null ? campo.default : 0;
      const min = campo.min != null ? campo.min : -Infinity;
      const max = campo.max != null ? campo.max : Infinity;
      return Math.min(max, Math.max(min, Math.round(n)));
    }
    case 'color': {
      const s = String(valor || '').trim();
      return /^#[0-9a-f]{6}$/i.test(s) ? s : (campo.default || '');
    }
    case 'opciones': {
      const validos = (campo.options || []).map((o) => o.value);
      return validos.includes(valor) ? valor : (campo.default != null ? campo.default : validos[0]);
    }
    case 'productos': {
      const ids = Array.isArray(valor) ? valor : [];
      const limpios = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
      return [...new Set(limpios)].slice(0, campo.max || 6);
    }
    case 'lista': {
      const items = Array.isArray(valor) ? valor : [];
      const max = campo.max || 6;
      return items.slice(0, max).map((it) => {
        const limpio = {};
        (campo.item || []).forEach((sub) => { limpio[sub.key] = limpiarCampo(sub, it ? it[sub.key] : undefined); });
        return limpio;
      });
    }
    default:
      return limpiarTexto(valor, 200);
  }
}

/**
 * Valida y normaliza lo que manda el panel. Devuelve la config lista para
 * guardar; tira 400 con un mensaje en castellano si algo no cierra.
 *
 * `lenient` es para la VISTA PREVIA: ahí un bloque a medio completar no puede
 * tumbar la previa de los otros cinco, así que en vez de tirar el error se
 * anota en `faltantes` y el bloque se dibuja igual, con el hueco a la vista.
 * Al publicar se valida en serio: un bloque incompleto en la tienda es peor
 * que no tenerlo.
 */
function validateConfig(input, { lenient = false } = {}) {
  const faltantes = [];
  if (!input || typeof input !== 'object') throw badRequest('Falta la configuración.');
  const blocks = Array.isArray(input.blocks) ? input.blocks : null;
  if (!blocks) throw badRequest('Falta la lista de bloques.');
  if (blocks.length > SLOT_IDS.length) {
    throw badRequest(`El home tiene ${SLOT_IDS.length} huecos para bloques; mandaste ${blocks.length}.`);
  }

  const vistos = new Set();
  const limpios = blocks.map((b, i) => {
    const slot = String((b && b.slot) || SLOT_IDS[i] || '');
    if (!SLOT_IDS.includes(slot)) {
      throw badRequest(`"${slot}" no es un hueco válido. Los disponibles son: ${SLOT_IDS.join(', ')}.`);
    }
    if (vistos.has(slot)) throw badRequest(`El hueco ${slot} está repetido.`);
    vistos.add(slot);

    const type = String((b && b.type) || '');
    if (!BLOCK_TYPES[type]) throw badRequest(`El tipo de bloque "${type}" no existe.`);

    const data = {};
    fieldsOf(type).forEach((campo) => {
      data[campo.key] = limpiarCampo(campo, b.data ? b.data[campo.key] : undefined);
    });

    /* Reglas de contenido mínimo: un bloque vacío en producción es peor que
       ninguno, así que se avisa acá y no cuando ya está publicado.
       Un bloque APAGADO queda exento: es un borrador — así el plan del home
       puede dejar bloques escritos por IA esperando que les carguen la foto,
       sin trabar la publicación de los que sí están listos. */
    const encendido = b.enabled !== false;
    try {
      if (encendido) validarMinimos(type, data, slot);
    } catch (err) {
      if (!lenient) throw err;
      faltantes.push({ slot, mensaje: err.message });
    }

    return {
      slot,
      type,
      enabled: b.enabled !== false,
      theme: THEMES.includes(b.theme) ? b.theme : 'claro',
      width: WIDTHS.includes(b.width) ? b.width : 'contenido',
      spacing: SPACINGS.includes(b.spacing) ? b.spacing : 'normal',
      device: DEVICES.includes(b.device) ? b.device : 'todos',
      // Color de acento propio del bloque (volanta, viñetas, badge de oferta).
      // Vacío = hereda el de la tienda. Se valida acá porque va a parar a un
      // atributo style= del HTML.
      accent: /^#[0-9a-fA-F]{6}$/.test(String(b.accent || '')) ? String(b.accent) : '',
      // Bordes fundidos: sólo hace algo en los temas oscuro y acento, que son
      // los que contrastan contra el fondo de la página.
      borde_suave: b.borde_suave !== false,
      /* Indicaciones de foto/video que dejó el plan del home: qué mostrar, en
         qué formato y qué evitar. NO se renderizan en la tienda — son para el
         que después tiene que sacar o buscar la imagen, y se muestran al lado
         del campo correspondiente en el panel. Ver src/homeCopy.js. */
      notas: Array.isArray(b.notas) ? b.notas.slice(0, 6).map((n) => ({
        campo: limpiarTexto(n && n.campo, 40),
        que: limpiarTexto(n && n.que, 300),
        formato: limpiarTexto(n && n.formato, 80),
        encuadre: limpiarTexto(n && n.encuadre, 300),
        evitar: limpiarTexto(n && n.evitar, 300),
      })) : [],
      data,
    };
  });

  return lenient ? { blocks: limpios, faltantes } : { blocks: limpios };
}

function validarMinimos(type, data, slot) {
  const donde = `El bloque "${BLOCK_TYPES[type].label}" (${slot})`;
  const hayMedia = data.image || data.image_mobile || data.video_url;

  if (type === 'portada') {
    if (!hayMedia) throw badRequest(`${donde} necesita una imagen o un video de fondo.`);
    if (!data.title && !data.kicker) throw badRequest(`${donde} necesita al menos un título.`);
  }
  if (type === 'media_texto') {
    if (!hayMedia) throw badRequest(`${donde} necesita una imagen o un video.`);
    if (!data.title) throw badRequest(`${donde} necesita un título.`);
  }
  if (type === 'video') {
    if (!data.video_url) throw badRequest(`${donde} necesita el video.`);
  }
  // Un MP4 propio con "arrancar solo" y sonido activado no puede sonar solo:
  // lo bloquean todos los navegadores. Se avisa acá en vez de dejar que el
  // dueño crea que configuró algo que nunca va a pasar.
  if (data.video_url && data.video_autoplay && data.video_muted === false) {
    data.video_muted = true;
  }
  if (type === 'productos') {
    if (!data.product_ids.length) throw badRequest(`${donde} necesita al menos un producto elegido.`);
  }
  ['atributos', 'cinta', 'preguntas', 'rubros', 'editorial'].forEach((t) => {
    if (type !== t) return;
    const lista = type === 'editorial' ? data.tiles : data.items;
    const campo = fieldsOf(type).find((f) => f.type === 'lista');
    const min = (campo && campo.min) || 1;
    if (!lista || lista.length < min) throw badRequest(`${donde} necesita al menos ${min} ${min === 1 ? 'ítem' : 'ítems'}.`);
  });
  if (type === 'editorial') {
    data.tiles.forEach((t, i) => {
      if (!t.title && !t.image) throw badRequest(`${donde}: la placa ${i + 1} está vacía (necesita al menos título o imagen).`);
    });
  }
}

async function saveBlocksConfig(input) {
  const cfg = validateConfig(input); // estricto: no se publica algo incompleto
  await setSetting('home_blocks', JSON.stringify({ blocks: cfg.blocks }));
  cache = { at: 0, payload: null };
  return cfg;
}

/* -------------------------------------------------------------------------
 * PRODUCTOS
 * Los bloques que muestran productos NO scrapean la tienda: leen el catálogo
 * ya sincronizado. Precio, foto y stock salen de products_cache.
 * ----------------------------------------------------------------------- */

async function fetchProducts(ids) {
  if (!ids.length) return [];
  // El mismo COALESCE que usan los rieles: `permalink` está en NULL para el
  // catálogo viejo y ahí el handle hay que sacarlo del JSON crudo.
  const { rows } = await pool.query(
    `SELECT id, name, price, stock, image_url, images, promo_price,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache
      WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  const porId = new Map(rows.map((r) => [Number(r.id), r]));
  // Se respeta el orden en que los eligió el dueño, no el que devuelve la base.
  return ids.map((id) => porId.get(Number(id))).filter(Boolean).map((r) => {
    const price = r.price == null ? null : Number(r.price);
    const promo = r.promo_price == null ? null : Number(r.promo_price);
    const conOferta = promo != null && price != null && promo > 0 && promo < price;
    // Segunda foto del producto, la misma que ya usan los rieles y las ofertas
    // flash: en la tienda se muestra al pasar el mouse y, en celular, sola al
    // entrar la ficha en pantalla. Si el producto tiene una sola foto, queda
    // en null y la ficha no la anuncia — no se rompe nada.
    const fotos = Array.isArray(r.images) ? r.images : [];
    return {
      id: Number(r.id),
      name: r.name,
      url: productPath(r.permalink) || '',
      image: r.image_url || '',
      image_hover: fotos.find((src) => src && src !== r.image_url) || null,
      stock: r.stock == null ? null : Number(r.stock),
      price,
      promo_price: conOferta ? promo : null,
      discount_pct: conOferta ? Math.round(((price - promo) / price) * 100) : null,
    };
  });
}

/**
 * Buscador para elegir productos a mano desde el panel. Devuelve TODO el
 * catálogo (no sólo minorista): un bloque puede querer destacar una línea
 * mayorista. El agotado se devuelve igual, con el stock a la vista, para que
 * quede claro por qué después no aparece en la tienda.
 */
async function searchProducts(q) {
  const texto = String(q || '').trim();
  const patron = texto ? `%${texto}%` : '%';
  const { rows } = await pool.query(
    `SELECT id, name, brand, price, promo_price, stock, image_url
       FROM products_cache
      WHERE name ILIKE $1
      ORDER BY COALESCE(sales_30d, 0) DESC, name ASC
      LIMIT 20`,
    [patron]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    brand: r.brand || null,
    price: r.price == null ? null : Number(r.price),
    stock: r.stock == null ? null : Number(r.stock),
    image: r.image_url,
  }));
}

/* -------------------------------------------------------------------------
 * PRODUCTOS POR HANDLE (para los layouts viejos del theme)
 *
 * Los ocho "layouts modernos" que quedaron en el theme se configuran pegando la
 * URL del producto en el panel de diseño de Tiendanube, y hasta ago-2026 sacaban
 * la foto y el precio bajándose la PÁGINA HTML COMPLETA de cada producto
 * (~175 KB cada una). Esto les da lo mismo en un JSON de 2 KB.
 * No se puede resolver por SQL directo: `permalink` a veces guarda el handle
 * pelado y a veces la URL entera, así que se arma el índice en memoria (son ~350
 * productos) y se cachea.
 * ----------------------------------------------------------------------- */

let indiceHandles = { at: 0, mapa: null };

async function handleIndex() {
  if (indiceHandles.mapa && Date.now() - indiceHandles.at < CACHE_TTL_MS) return indiceHandles.mapa;
  const { rows } = await pool.query(
    `SELECT id, name, price, promo_price, stock, image_url,
            COALESCE(raw->'description'->>'es', raw->>'description') AS description,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache
      WHERE COALESCE(published, true) = true`
  );
  const mapa = new Map();
  rows.forEach((r) => {
    const ruta = productPath(r.permalink);
    if (!ruta) return;
    mapa.set(ruta.replace(/^\/productos\/|\/$/g, ''), r);
  });
  indiceHandles = { at: Date.now(), mapa };
  return mapa;
}

/** handle → tarjeta mínima (link, foto, nombre, precio). Sólo lectura. */
async function productsByHandle(handles) {
  const mapa = await handleIndex();
  const salida = {};
  handles.slice(0, 24).forEach((h) => {
    const clave = String(h || '').trim().replace(/^https?:\/\/[^/]+/, '').replace(/^\/productos\/|\/+$/g, '').split('?')[0];
    const r = mapa.get(clave);
    if (!r) return;
    const price = r.price == null ? null : Number(r.price);
    const promo = r.promo_price == null ? null : Number(r.promo_price);
    const conOferta = promo != null && price != null && promo > 0 && promo < price;
    salida[h] = {
      link: `/productos/${clave}/`,
      image: r.image_url || '',
      title: r.name,
      price,
      promo_price: conOferta ? promo : null,
      discount_pct: conOferta ? Math.round(((price - promo) / price) * 100) : null,
      stock: r.stock == null ? null : Number(r.stock),
      // La usa la vista rápida del lookbook. Se limpia acá y no en la tienda
      // porque la descripción de Tiendanube viene con HTML adentro.
      description: resumenTexto(r.description, 150),
    };
  });
  return salida;
}

/** HTML de una descripción → texto plano recortado. */
function resumenTexto(html, largo) {
  if (!html) return '';
  const txt = String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return txt.length > largo ? `${txt.slice(0, largo).trim()}…` : txt;
}

/* -------------------------------------------------------------------------
 * ARMADO DEL PAYLOAD
 * ----------------------------------------------------------------------- */

/**
 * @param {object} cfg
 * @param {boolean} incluirApagados  La VISTA PREVIA del panel sí los quiere: un
 *   borrador que no se ve no se puede terminar de escribir. La tienda no.
 */
async function buildPayload(cfg, { incluirApagados = false } = {}) {
  const activos = cfg.blocks.filter((b) => incluirApagados || b.enabled);

  // Un solo viaje a la base para todos los productos de todos los bloques.
  const idsNecesarios = [...new Set(activos.flatMap((b) => (b.data.product_ids || [])))];
  const productos = await fetchProducts(idsNecesarios);
  const porId = new Map(productos.map((p) => [p.id, p]));

  const blocks = {};
  const avisos = [];

  activos.forEach((b) => {
    const ctx = { products: (b.data.product_ids || []).map((id) => porId.get(Number(id))).filter(Boolean) };
    if (b.type === 'productos') {
      if (b.data.hide_out_of_stock) ctx.products = ctx.products.filter((p) => p.stock == null || p.stock > 0);
      if (!ctx.products.length) {
        avisos.push(`El bloque "${BLOCK_TYPES[b.type].label}" (${b.slot}) no tiene ningún producto con stock: no se va a mostrar.`);
        return; // no se publica un bloque de productos vacío
      }
    }
    blocks[b.slot] = { type: b.type, borrador: b.enabled === false, html: renderBlock(b, ctx) };
  });

  // Ficha mínima de los productos usados. La tienda NO la recibe (el server sólo
  // le pasa `blocks`): es para que el panel pueda poner el nombre y la foto en
  // las pastillas de "Productos elegidos" al abrir una config ya guardada.
  const fichas = {};
  productos.forEach((p) => { fichas[p.id] = { id: p.id, name: p.name, image: p.image, stock: p.stock }; });

  return { blocks, avisos, productos: fichas, generado: new Date().toISOString() };
}

/** Lo que consume la tienda. Cacheado en memoria: el home lo pide en cada visita. */
async function getBlocks({ force = false } = {}) {
  if (!force && cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const cfg = await getBlocksConfig();
  const payload = await buildPayload(cfg);
  cache = { at: Date.now(), payload };
  return payload;
}

/** Catálogo para el panel: tipos, campos, huecos y la config actual. */
async function getCatalog() {
  return {
    types: TYPE_IDS.map((id) => ({
      id,
      label: BLOCK_TYPES[id].label,
      resumen: BLOCK_TYPES[id].resumen,
      para: BLOCK_TYPES[id].para,
      sketch: BLOCK_TYPES[id].sketch,
      fields: BLOCK_TYPES[id].fields,
      sugerencias: BLOCK_TYPES[id].sugerencias || [],
    })),
    slots: SLOT_IDS,
    themes: THEMES,
    widths: WIDTHS,
    spacings: SPACINGS,
    devices: DEVICES,
    config: await getBlocksConfig(),
  };
}

module.exports = {
  BLOCK_TYPES,
  SLOT_IDS,
  THEMES,
  WIDTHS,
  SPACINGS,
  DEVICES,
  getBlocksConfig,
  saveBlocksConfig,
  validateConfig,
  buildPayload,
  getBlocks,
  getCatalog,
  fetchProducts,
  searchProducts,
  productsByHandle,
};
