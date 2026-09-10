/* =========================================================================
 * PERSONALIZADOR DEL MENÚ — la capa estética de los ítems de navegación.
 *
 * QUÉ PROBLEMA RESUELVE
 * Hasta acá, cada ítem especial del menú estaba ESCRITO A MANO en el theme
 * (snipplets/navigation/navigation-nav-list.tpl): un `if` por "Looks", otro por
 * "Combos", otro por el ítem de temporada, y un mega menú clavado en cuatro
 * categorías cuyas fotos son archivos del theme. Consecuencias: para poner una
 * "SUPERLIQUIDACIÓN" había que tocar Twig, y para cambiar una foto había que
 * volver a subir el theme entero. O sea: el dueño no podía tocar su propio menú.
 *
 * QUÉ HACE
 * Guarda una lista de REGLAS. Cada regla dice a qué ítem del menú apunta y qué
 * le hace: badge, color, fondo destacado, una imagen o GIF en lugar del texto,
 * una tipografía distinta, u ocultarlo. La tienda las aplica por JS.
 *
 * TRES DECISIONES QUE IMPORTAN
 * 1. EL MENÚ SIGUE SIENDO EL DE TIENDANUBE. Acá no se inventan ítems: las
 *    categorías se crean en el admin, con sus productos y su URL, y esto sólo
 *    les pone una capa encima. Es lo que pidió Sebastián y además es lo correcto
 *    para el SEO: el HTML que ve Google es el mismo de siempre.
 * 2. SE MATCHEA POR URL, no por nombre. El sistema viejo comparaba el TEXTO del
 *    ítem ("looks", "combos"), así que renombrar la categoría en el admin
 *    rompía el estilo en silencio. La URL es la que no cambia. El texto queda
 *    como respaldo para los ítems que no son categorías (páginas, links sueltos).
 * 3. SI ESTO NO CONTESTA, EL MENÚ SE VE NORMAL. El menú está en TODAS las
 *    páginas: no puede depender de que Render esté despierto. La tienda pide
 *    esto una vez por sesión, lo guarda en sessionStorage y, si falla, no pasa
 *    nada — no hay ningún estilo que dependa de la respuesta para verse bien.
 * ========================================================================= */

const { getSetting, setSetting } = require('./settings');
const config = require('./config');
const storeCategories = require('./storeCategories');

const SETTING_KEY = 'nav_menu_style';
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

/* Tipografías para el ítem destacado. Son pocas a propósito: cada una que se usa
   es una webfont más que baja el visitante, y en un menú entran dos o tres
   palabras. Todas existen en Google Fonts y son de las que aguantan mayúsculas
   grandes y cortas, que es para lo que se usan acá. */
const FUENTES = [
  { value: '', label: 'La del sitio (Inter)' },
  { value: 'Bebas Neue', label: 'Bebas Neue — alta y condensada' },
  { value: 'Anton', label: 'Anton — gruesa de impacto' },
  { value: 'Archivo Black', label: 'Archivo Black — pesada y ancha' },
  { value: 'Racing Sans One', label: 'Racing Sans One — inclinada, deportiva' },
  { value: 'Rubik Mono One', label: 'Rubik Mono One — bloque, muy llamativa' },
];

/* ICONOS. SVG de línea, NO emoji: el emoji lo dibuja cada sistema operativo a
   su manera (en Android el fuego es otro dibujo que en iPhone), no toma el
   color del ítem y en un menú serio queda infantil. Estos son paths sueltos que
   se pintan con `currentColor`, así heredan el color que tenga el ítem.
   El motor manda el path YA RESUELTO dentro de la regla, así el theme no
   necesita tener la librería duplicada. */
const ICONOS = {
  '': { label: 'Sin ícono', d: '' },
  fuego: { label: 'Fuego (oferta caliente)', d: 'M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-2.5C9 9 9 11 9 11S8 6 12 2z M6.5 13a5.5 5.5 0 0 0 11 0c0 4-2.5 9-5.5 9s-5.5-5-5.5-9z' },
  rayo: { label: 'Rayo (flash)', d: 'M13 2L4.5 13.5H11l-1 8.5L19.5 10.5H13z' },
  estrella: { label: 'Estrella (nuevo)', d: 'M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9z' },
  etiqueta: { label: 'Etiqueta (precio)', d: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01' },
  porcentaje: { label: 'Porcentaje', d: 'M19 5L5 19M7.5 7.5a2 2 0 1 0 0-.01M16.5 16.5a2 2 0 1 0 0-.01' },
  reloj: { label: 'Reloj (por poco tiempo)', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2' },
  copo: { label: 'Copo (invierno)', d: 'M12 2v20M4 6l16 12M20 6L4 18M12 6l-2.5-2M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2' },
  sol: { label: 'Sol (verano)', d: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1' },
  casco: { label: 'Casco (industria)', d: 'M4 15a8 8 0 0 1 16 0M9 15V8a3 3 0 0 1 6 0v7M2 15h20v3H2z' },
  camion: { label: 'Camión (envío)', d: 'M2 6h11v10H2zM13 9h4l4 3v4h-8zM7 18a2 2 0 1 0 0-.01M17 18a2 2 0 1 0 0-.01' },
  corona: { label: 'Corona (premium)', d: 'M3 18h18M4 8l4 4 4-7 4 7 4-4-2 10H6z' },
  fleche: { label: 'Flecha (ir)', d: 'M5 12h14M12 5l7 7-7 7' },
};

const ESTILOS_BADGE = [
  { value: 'sale', label: 'Naranja (oferta)' },
  { value: 'rojo', label: 'Rojo (urgencia)' },
  { value: 'verde', label: 'Verde (novedad)' },
  { value: 'negro', label: 'Negro (neutro)' },
  { value: 'degradado', label: 'Degradado naranja → rojo' },
  { value: 'contorno', label: 'Sólo contorno (discreto)' },
];

const FORMAS_BADGE = [
  { value: 'pastilla', label: 'Pastilla (redondeada)' },
  { value: 'recto', label: 'Recto (esquinas vivas)' },
];

const ANIMACIONES = [
  { value: '', label: 'Quieto' },
  { value: 'pulso', label: 'Latido suave' },
  { value: 'brillo', label: 'Destello que pasa' },
];

/* -------------------------------------------------------------------------
 * CAMPOS DE UNA REGLA
 * El panel arma el formulario solo desde esto, igual que los bloques del home
 * (ver homeBlocks.js). `when` esconde el campo si otro no está puesto.
 * ----------------------------------------------------------------------- */
const REGLA_FIELDS = [
  {
    grupo: 'item', key: 'match', label: 'Ítem del menú', type: 'categoria',
    help: 'Elegí la categoría de tu tienda. La regla se ata a la URL, así que si después le cambiás el nombre en el admin, el estilo la sigue.',
  },
  {
    grupo: 'item', key: 'match_text', label: 'O el texto del ítem', type: 'texto', max: 40,
    help: 'Sólo si el ítem NO es una categoría (una página, un link suelto). Se compara sin distinguir mayúsculas.',
  },
  {
    grupo: 'item', key: 'device', label: 'Dónde se aplica', type: 'opciones', default: 'todos',
    options: [
      { value: 'todos', label: 'Celular y computadora' },
      { value: 'mobile', label: 'Sólo celular' },
      { value: 'desktop', label: 'Sólo computadora' },
    ],
  },
  { grupo: 'aspecto', key: 'badge_text', label: 'Globito', type: 'texto', max: 24, placeholder: 'hasta 45% off' },
  {
    grupo: 'aspecto', key: 'badge_style', label: 'Color del globito', type: 'opciones', default: 'sale',
    options: ESTILOS_BADGE, when: { key: 'badge_text', lleno: true },
  },
  { grupo: 'aspecto', key: 'badge_forma', label: 'Forma del globito', type: 'opciones', default: 'pastilla', options: FORMAS_BADGE, when: { key: 'badge_text', lleno: true } },
  /* Con "A elección" el globito deja de usar la paleta fija y toma estos tres
     colores. Es lo que pidió Sebastián: poder poner CUALQUIER degradado, no
     elegir entre cuatro. */
  { grupo: 'aspecto', key: 'badge_c1', label: 'Globito: color 1', type: 'color', when: { key: 'badge_text', lleno: true } },
  { grupo: 'aspecto', key: 'badge_c2', label: 'Globito: color 2 (degradado)', type: 'color', when: { key: 'badge_c1', lleno: true } },
  { grupo: 'aspecto', key: 'badge_tinta', label: 'Globito: color de la letra', type: 'color', when: { key: 'badge_c1', lleno: true } },
  {
    grupo: 'aspecto', key: 'icono', label: 'Ícono', type: 'opciones', default: '',
    options: Object.entries(ICONOS).map(([value, o]) => ({ value, label: o.label })),
    help: 'Un dibujo de línea antes del nombre. No son emojis a propósito: el emoji lo dibuja cada teléfono a su manera y no toma el color del ítem.',
  },
  { grupo: 'aspecto', key: 'color', label: 'Color del texto', type: 'color' },
  { grupo: 'aspecto', key: 'bg', label: 'Fondo del ítem', type: 'color', help: 'Pinta el ítem entero. Para una "SUPERLIQUIDACIÓN" que tiene que saltar a la vista.' },
  {
    grupo: 'aspecto', key: 'bg2', label: 'Segundo color (degradado)', type: 'color',
    when: { key: 'bg', lleno: true },
    help: 'Con dos colores el fondo va en degradado en vez de plano.',
  },
  {
    grupo: 'aspecto', key: 'bg_ang', label: 'Hacia dónde va el degradado', type: 'opciones', default: '100',
    options: [
      { value: '90', label: 'De izquierda a derecha →' },
      { value: '100', label: 'Apenas inclinado ↘' },
      { value: '135', label: 'En diagonal ↘↘' },
      { value: '180', label: 'De arriba abajo ↓' },
      { value: '45', label: 'Hacia arriba ↗' },
    ],
    when: { key: 'bg2', lleno: true },
  },
  { grupo: 'aspecto', key: 'mayus', label: 'TODO EN MAYÚSCULAS', type: 'switch', default: false },
  {
    grupo: 'aspecto', key: 'animacion', label: 'Movimiento', type: 'opciones', default: '', options: ANIMACIONES,
    help: 'Se apaga solo si el visitante pidió menos movimiento en su teléfono. Usalo en UNO, no en cinco.',
  },
  {
    grupo: 'aspecto', key: 'font', label: 'Tipografía', type: 'opciones', default: '', options: FUENTES,
    help: 'La fuente se baja SÓLO si algún ítem la usa.',
  },
  {
    grupo: 'aspecto', key: 'image', label: 'Imagen o GIF en lugar del texto', type: 'imagen',
    help: 'La palabra hecha imagen. Subí un PNG con fondo transparente o un GIF. El nombre del ítem se sigue leyendo por los lectores de pantalla y por Google, así que no se pierde nada.',
  },
  {
    grupo: 'aspecto', key: 'image_h', label: 'Alto de la imagen (px)', type: 'numero', default: 22, min: 12, max: 60,
    when: { grupo: 'aspecto', key: 'image', lleno: true },
    help: 'En el menú de celular entra más alto que en el de la computadora. 22 px es lo que mide el texto normal.',
  },
  { grupo: 'aspecto', key: 'hide', label: 'Esconder este ítem', type: 'switch', default: false },

  /* ----------------------------------------------------------------------
     MINIATURA DEL SUBÍTEM (reemplaza a subcat_visual_1..8 del theme).
     Lo viejo: ocho huecos en el panel de diseño, matcheados por NOMBRE, con la
     foto como archivo del theme (subcat_visual_3_img.jpg) — o sea, cambiar una
     miniatura era volver a subir el theme. Y con ocho se acababa.
     -------------------------------------------------------------------- */
  {
    grupo: 'fotos', key: 'thumb', label: 'Miniatura (si es un subítem)', type: 'imagen',
    help: 'La fotito redonda que va al lado del nombre cuando el ítem cuelga de otro. Cuadrada queda mejor.',
  },
  {
    grupo: 'fotos', key: 'thumb_size', label: 'Tamaño de miniatura (px)', type: 'numero', default: 34, min: 20, max: 120,
    help: 'Ajusta el tamaño (por defecto 34).',
    when: { key: 'thumb', lleno: true }
  },

  /* ----------------------------------------------------------------------
     PLACA DEL MEGA MENÚ (reemplaza a mega_menu_cat_1..4 del theme).
     Lo viejo: cuatro huecos, por NOMBRE, foto como archivo del theme y un
     único párrafo de texto. Ahora: las que quieras, foto subida desde acá,
     con volanta, título, bajada y botón.
     -------------------------------------------------------------------- */
  {
    grupo: 'fotos', key: 'mega_image', label: 'Foto del desplegable', type: 'imagen',
    help: 'Aparece al costado del desplegable en la computadora, cuando este ítem tiene subcategorías. Vertical (3:4) es lo que mejor entra.',
  },
  { grupo: 'fotos', key: 'mega_kicker', label: 'Volanta de la foto', type: 'texto', max: 30, placeholder: 'Nuevo', when: { grupo: 'fotos', key: 'mega_image', lleno: true } },
  { grupo: 'fotos', key: 'mega_title', label: 'Título de la foto', type: 'texto', max: 60, placeholder: 'Línea invierno', when: { key: 'mega_image', lleno: true } },
  { grupo: 'fotos', key: 'mega_text', label: 'Bajada de la foto', type: 'texto', max: 120, when: { key: 'mega_image', lleno: true } },
  { grupo: 'fotos', key: 'mega_cta', label: 'Texto del botón', type: 'texto', max: 28, placeholder: 'Ver la línea', when: { key: 'mega_image', lleno: true } },
  { grupo: 'fotos', key: 'mega_url', label: 'Link de la foto', type: 'url', placeholder: '/otono-invierno', when: { key: 'mega_image', lleno: true } },
];

/* ------------------------------------------------------------------ helpers */

/**
 * Deja una URL en su camino comparable: sin dominio, sin barras de los bordes,
 * sin querystring y en minúsculas. Es lo que hace que la misma regla matchee
 * tanto `https://tienda.com.ar/otono-invierno/` como `/otono-invierno`.
 */
function normalizarUrl(u) {
  let s = String(u || '').trim().toLowerCase();
  if (!s) return '';
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/^https?:\/\/[^/]+/, '');
  return s.replace(/^\/+|\/+$/g, '');
}

function normalizarTexto(t) {
  return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const COLOR_OK = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const color = (v) => (COLOR_OK.test(String(v || '').trim()) ? String(v).trim() : '');

/* La imagen del ítem termina como `src` de un <img> en la tienda. Un <img> no
   ejecuta `javascript:`, pero igual se acepta SÓLO http(s) — que algo no sea
   explotable hoy no es razón para dejarlo pasar, y de paso descarta las URLs
   mal pegadas antes de que el dueño se pregunte por qué no se ve nada. */
function urlDeImagen(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : '';
}

/* ------------------------------------------------------------- validación */

function validarRegla(r, i, { lenient = false, faltantes = [] } = {}) {
  const d = r || {};
  const match = normalizarUrl(d.match);
  const matchText = normalizarTexto(d.match_text);

  if (!match && !matchText) {
    const msg = `La regla ${i + 1} no dice a qué ítem del menú se aplica.`;
    if (!lenient) throw new Error(msg);
    faltantes.push(msg);
  }

  const alto = Number(d.image_h);
  const t_size = Number(d.thumb_size);
  const out = {
    match,
    match_text: matchText,
    device: ['todos', 'mobile', 'desktop'].includes(d.device) ? d.device : 'todos',
    badge_text: String(d.badge_text || '').trim().slice(0, 24),
    badge_style: ESTILOS_BADGE.some((e) => e.value === d.badge_style) ? d.badge_style : 'sale',
    color: color(d.color),
    bg: color(d.bg),
    font: FUENTES.some((f) => f.value === d.font) ? d.font : '',
    badge_forma: FORMAS_BADGE.some((f) => f.value === d.badge_forma) ? d.badge_forma : 'pastilla',
    icono: Object.prototype.hasOwnProperty.call(ICONOS, d.icono || '') ? (d.icono || '') : '',
    // El path va resuelto en el payload: así el theme no necesita su propia
    // copia de la librería de íconos.
    icono_d: (ICONOS[d.icono || ''] || ICONOS['']).d,
    bg2: color(d.bg2),
    bg_ang: /^(45|90|100|135|180)$/.test(String(d.bg_ang || '')) ? String(d.bg_ang) : '100',
    badge_c1: color(d.badge_c1),
    badge_c2: color(d.badge_c2),
    badge_tinta: color(d.badge_tinta),
    mayus: d.mayus === true,
    animacion: ANIMACIONES.some((a) => a.value === d.animacion) ? (d.animacion || '') : '',
    image: urlDeImagen(d.image),
    image_h: Number.isFinite(alto) ? Math.min(60, Math.max(12, Math.round(alto))) : 22,
    hide: d.hide === true,
    thumb: urlDeImagen(d.thumb),
    thumb_size: Number.isFinite(t_size) ? Math.min(120, Math.max(20, Math.round(t_size))) : 34,
    mega_image: urlDeImagen(d.mega_image),
    mega_kicker: String(d.mega_kicker || '').trim().slice(0, 30),
    mega_title: String(d.mega_title || '').trim().slice(0, 60),
    mega_text: String(d.mega_text || '').trim().slice(0, 120),
    mega_cta: String(d.mega_cta || '').trim().slice(0, 28),
    mega_url: String(d.mega_url || '').trim().slice(0, 300),
    enabled: d.enabled !== false,
  };

  // Una regla que no hace NADA es casi siempre un olvido, no una intención.
  const hacéAlgo = out.badge_text || out.color || out.bg || out.font || out.image
    || out.hide || out.thumb || out.mega_image || out.icono || out.mayus || out.animacion;
  if (!hacéAlgo) {
    const msg = `La regla ${i + 1} no le cambia nada al ítem: ponele al menos un globito, un color o una imagen.`;
    if (!lenient) throw new Error(msg);
    faltantes.push(msg);
  }
  return out;
}

function validateConfig(input, { lenient = false } = {}) {
  const body = input || {};
  const lista = Array.isArray(body.reglas) ? body.reglas : [];
  if (lista.length > 20) throw new Error('Son demasiadas reglas (máximo 20).');
  const faltantes = [];
  const reglas = lista.map((r, i) => validarRegla(r, i, { lenient, faltantes }));
  return lenient ? { reglas, faltantes } : { reglas };
}

/* ------------------------------------------------------------------ config */

async function getConfig() {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return { reglas: [] };
  try {
    const parsed = JSON.parse(raw);
    return { reglas: Array.isArray(parsed.reglas) ? parsed.reglas : [] };
  } catch (e) {
    console.error('[navMenu] La config guardada no es JSON válido:', e.message);
    return { reglas: [] };
  }
}

async function saveConfig(input) {
  const cfg = validateConfig(input);
  await setSetting(SETTING_KEY, JSON.stringify(cfg));
  cache = { at: 0, payload: null };
  return cfg;
}

/**
 * Lo que consume la tienda. Chico a propósito: sólo las reglas activas y las
 * fuentes que hay que bajar. Sin nada que el theme no vaya a usar.
 */
function buildPayload(cfg) {
  const reglas = (cfg.reglas || [])
    .map((r, i) => validarRegla(r, i, { lenient: true, faltantes: [] }))
    .filter((r) => r.enabled && (r.match || r.match_text));

  const fuentes = [...new Set(reglas.map((r) => r.font).filter(Boolean))];
  return { reglas, fuentes, v: 1 };
}

async function getStyle({ force = false } = {}) {
  if (!force && cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = buildPayload(await getConfig());
  cache = { at: Date.now(), payload };
  return payload;
}

/**
 * Las categorías reales para el desplegable del panel, para que el dueño elija
 * de una lista en vez de escribir una URL a mano (y equivocarse). Salen del
 * mismo módulo que ya usa el esquema ideal del home.
 */
async function opcionesDeItem() {
  /* ⚠️ `categorias()` NO devuelve un array: devuelve
     { disponible, error, total, lista, vendibles, mayoristas, leido }.
     Las categorías están en `.lista`. (Suponer que era un array fue un bug real:
     "(cats || []).map is not a function" al abrir la pestaña.)
     Y los campos vienen en español: `nombre`, `url`, `ruta`, `productos`. */
  const data = await storeCategories.categorias().catch(() => null);
  const lista = data && Array.isArray(data.lista) ? data.lista : [];

  /* ⚠️ RECONSTRUIR LA RUTA COMPLETA, no usar `c.url`.
     storeCategories arma la url como "/" + handle, SIN la rama del padre, pero
     Tiendanube sirve las subcategorías con la ruta entera. Guardando sólo el
     handle, una regla para "SALE INVIERNO › Pantalones" quedaba como
     "pantalones2" y el link del menú es "/otono-invierno/pantalones2/": no
     matcheaban, y toda regla sobre una subcategoría no hacía nada.
     (El theme además tolera las dos formas, para no romper lo ya guardado.) */
  const porId = new Map(lista.map((c) => [c.id, c]));
  const rutaDe = (c) => {
    const partes = [];
    let cur = c;
    const vistos = new Set();
    while (cur && !vistos.has(cur.id)) {
      vistos.add(cur.id);   // por si el árbol viniera con un ciclo
      partes.unshift(normalizarUrl(cur.url));
      cur = cur.padre ? porId.get(cur.padre) : null;
    }
    return partes.filter(Boolean).join('/');
  };

  return lista
    .map((c) => ({
      value: rutaDe(c),
      // `ruta` trae el padre adelante ("Pantalones › Cargo"). Importa: hay
      // nombres repetidos en ramas distintas y con el nombre pelado no se sabe
      // cuál se está eligiendo.
      label: c.ruta || c.nombre,
      productos: Number(c.productos) || 0,
      stock: Number(c.stock) || 0,
      ventas: Number(c.ventas_30d) || 0,
    }))
    .filter((o) => o.value && o.label)
    // Primero las que tienen productos: son las que sirven para destacar. El
    // resto va al final pero no se esconde (puede ser una categoría recién
    // creada, justo la que se quiere estrenar con un cartel).
    .sort((a, b) => (b.productos > 0) - (a.productos > 0)
      || b.ventas - a.ventas
      || a.label.localeCompare(b.label, 'es'));
}

/* Los tres grupos en los que el panel parte el formulario. Con 18 controles
   en una lista corrida no se encuentra nada; partido, cada grupo contesta una
   pregunta: a qué ítem, cómo se ve, y qué fotos lleva. */
const GRUPOS = [
  { id: 'item', label: 'A qué ítem' },
  { id: 'aspecto', label: 'Cómo se ve' },
  { id: 'fotos', label: 'Fotos (miniatura y desplegable)' },
];

/* =========================================================================
 * IMPORTADOR — pasa a reglas lo que YA está configurado en el theme.
 *
 * Sin esto, apagar los sistemas viejos (mega_menu_cat_1..4 y subcat_visual_1..8)
 * le borraría al dueño fotos y miniaturas que cargó a mano, y tendría que
 * rehacerlas de memoria. Acá se leen del HTML de la tienda EN VIVO — el mismo
 * truco que usa storeHome.js para leer el orden del home, porque el panel de
 * diseño de Tiendanube no tiene API — y se arman las reglas equivalentes.
 *
 * Las fotos NO se re-suben: se apunta a la URL que ya sirve el theme, que sigue
 * andando. O sea, importar no cuesta ni una subida.
 * ========================================================================= */

function atributo(tag, nombre) {
  const m = new RegExp(`${nombre}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag || '');
  return m ? m[1] : '';
}

/* El theme sirve sus imágenes con protocolo relativo (//acdn-us.mitiendanube…).
   Rechazarlas por no empezar con http fue un bug real: el importador encontraba
   los badges y CERO miniaturas, teniendo 83 en la página. */
function absolutizar(src) {
  const u = String(src || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  return /^https?:\/\//i.test(u) ? u : '';
}

function textoPlano(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Lee el menú de la tienda y devuelve las reglas que reproducirían lo que hoy
 * se ve. No guarda nada: el dueño revisa y recién ahí publica.
 */
async function importarDelTheme() {
  const url = config.storeUrl;
  let html = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': config.tiendanube.userAgent, 'Accept-Language': 'es-AR,es' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    return { ok: false, error: `No se pudo leer la tienda: ${err.message}`, reglas: [] };
  }

  /* ⚠️ FUERA EL CSS Y EL JS ANTES DE BUSCAR NADA.
     El theme trae sus estilos en <style> dentro de la misma página, y ahí
     aparecen literales `.nav-mega-visual`, `.nav-list-link`, `.nav-subitem-img`…
     Buscándolos sobre el HTML crudo, lo primero que se encuentra son REGLAS,
     no elementos: por eso el importador daba 38 placas donde hay 1, y no
     encontraba a qué ítem pertenecía (el "link más cercano hacia atrás" era un
     selector CSS). Sacarlos de entrada arregla las tres búsquedas de una. */
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');

  const porItem = new Map();   // url normalizada -> regla en armado
  const toma = (u, nombre) => {
    const k = normalizarUrl(u);
    if (!k) return null;
    if (!porItem.has(k)) {
      porItem.set(k, { match: k, _nombre: nombre || k, device: 'todos', badge_style: 'sale', image_h: 22, enabled: true });
    }
    return porItem.get(k);
  };

  /* --- 1) Los <li> del menú, uno por uno ------------------------------- */
  const items = html.split(/<li\b/i).slice(1);
  for (const trozo of items) {
    const linkTag = /<a\b[^>]*class=["'][^"']*nav-list-link[^"']*["'][^>]*>/i.exec(trozo);
    if (!linkTag) continue;
    const href = atributo(linkTag[0], 'href');
    if (!href) continue;

    // Nombre del ítem: lo que hay entre el <a> y su cierre, sin etiquetas.
    const cuerpo = trozo.slice(linkTag.index + linkTag[0].length);
    const nombre = textoPlano(cuerpo.split('</a>')[0]).replace(/\s*(-?\d+%|hasta .*)$/i, '').trim();

    // 1.a Badge que hoy pinta el theme por nombre (looks / combos / temporada).
    const badge = /<span[^>]*class=["'][^"']*nav-savings-badge([^"']*)["'][^>]*>([^<]+)</i.exec(cuerpo.split('</a>')[0]);
    if (badge) {
      const r = toma(href, nombre);
      if (r) {
        r.badge_text = textoPlano(badge[2]).slice(0, 24);
        r.badge_style = /--sale/.test(badge[1]) ? 'sale' : 'negro';
      }
    }

    // 1.b Miniatura del subítem (subcat_visual_1..8).
    const thumb = /<img[^>]*class=["'][^"']*nav-subitem-img[^"']*["'][^>]*>/i.exec(cuerpo.split('</a>')[0]);
    if (thumb) {
      const r = toma(href, nombre);
      const src = absolutizar(atributo(thumb[0], 'src'));
      if (r && src) r.thumb = src;
    }
  }

  /* --- 2) Las placas del mega menú (mega_menu_cat_1..4) ----------------- */
  // Cada .nav-mega-visual vive dentro del <li> de su categoría, así que se
  // busca hacia atrás el link de nivel 1 al que pertenece.
  /* ⚠️ Se busca el ATRIBUTO class de un tag, no el texto "nav-mega-visual"
     suelto: el theme trae sus estilos en un <style> dentro de la misma página,
     así que un indexOf() plano encontraba primero las REGLAS CSS y salía con
     las manos vacías. */
  const marcas = [...html.matchAll(/<div[^>]*class=["'][^"']*nav-mega-visual[^"']*["'][^>]*>/gi)];
  for (const marca of marcas) {
    const i = marca.index;
    const bloque = html.slice(i, i + 2600);
    const img = /<img[^>]*>/i.exec(bloque);
    const src = img ? absolutizar(atributo(img[0], 'src')) : '';
    if (!src) continue;

    /* ⚠️ La placa pertenece al ítem de NIVEL 1, y el link más cercano hacia
       atrás NO es ese: es el último SUBÍTEM de la lista que la placa tiene al
       lado (daba /mayorista/merchandising/insumos en vez de /mayorista).
       El corte está en `js-desktop-dropdown`, que abre el desplegable: el link
       de nivel 1 es el último que hay ANTES de esa apertura. */
    /* Sin ventana fija: medido en la tienda real, el desplegable abre 40.583
       caracteres antes que la placa (la lista de subcategorías es enorme).
       Con una ventana de 12 k la placa terminaba colgada del último subítem,
       /mayorista/merchandising/insumos en vez de /mayorista. */
    const antes = html.slice(0, i);
    const corte = antes.lastIndexOf('js-desktop-dropdown');
    const zona = corte > 0 ? antes.slice(0, corte) : antes;
    const links = [...zona.matchAll(/<a\b[^>]*class=["'][^"']*nav-list-link[^"']*["'][^>]*>/gi)];
    const ultimo = links.length ? links[links.length - 1][0] : null;
    const href = ultimo ? atributo(ultimo, 'href') : '';
    const r = toma(href, '');
    if (!r) continue;

    r.mega_image = src;
    r.mega_title = atributo(img[0], 'alt') || r._nombre || '';
    const promo = /<p[^>]*class=["'][^"']*mega-promo-text[^"']*["'][^>]*>([^<]*)</i.exec(bloque);
    if (promo) r.mega_text = textoPlano(promo[1]).slice(0, 120);
    const enlace = /<a[^>]*class=["'][^"']*mega-visual-link[^"']*["'][^>]*>/i.exec(bloque);
    // El href viene escapado en el HTML (&amp;): sin desescapar, un link de
    // WhatsApp con varios parámetros queda roto al volver a publicarlo.
    if (enlace) r.mega_url = atributo(enlace[0], 'href').replace(/&amp;/g, '&');
  }

  const reglas = [...porItem.values()]
    .filter((r) => r.badge_text || r.thumb || r.mega_image)
    .map(({ _nombre, ...r }) => r);

  return {
    ok: true,
    reglas,
    resumen: {
      total: reglas.length,
      badges: reglas.filter((r) => r.badge_text).length,
      miniaturas: reglas.filter((r) => r.thumb).length,
      placas: reglas.filter((r) => r.mega_image).length,
    },
  };
}

/* La vieja `estructuraDelMenu()` se eliminó (sep-2026): la previa dejó de
   dibujar un árbol propio y pasa a usar `menuDeLaTienda()`, que trae el header
   real. Quedaba llamándose desde /api/nav/menu, así que cada vez que se abría
   el panel se bajaba un mega de HTML PARA NADA — el panel ya ni lo leía. Y de
   paso compartía la variable `cacheMenu` con menuDeLaTienda: una le borraba el
   caché a la otra. */

/* =========================================================================
 * PROMPT PARA GENERAR LA "PALABRA HECHA IMAGEN".
 *
 * Cuando el dueño quiere poner SUPERLIQUIDACIÓN como imagen en vez de texto,
 * el problema no es subirla: es CONSEGUIRLA. Esto arma el pedido para pegarle
 * a Gemini o ChatGPT, con las restricciones que hacen que sirva de verdad en
 * un menú y que un prompt escrito a mano casi siempre olvida:
 *
 *   · fondo TRANSPARENTE (si viene con fondo blanco, en el menú negro se ve
 *     un recuadro y no sirve);
 *   · alto chico — se ve a ~22 px: sin peso alto y trazo grueso, a ese tamaño
 *     no se lee nada;
 *   · el texto EXACTO, y la instrucción de no agregar ni una palabra más
 *     (los modelos meten "SALE" o "50% OFF" de su cosecha);
 *   · lectura horizontal, sin marco ni sombra, con aire mínimo al costado.
 *
 * Se devuelve en inglés porque es como mejor responden los modelos de imagen,
 * igual que los prompts del home (ver homeCopy.js).
 * ========================================================================= */
function promptDeImagen({ texto = '', colores = [], sobreFondo = 'oscuro', estilo = 'condensada' } = {}) {
  const palabra = String(texto || '').trim() || 'OFERTA';
  const paleta = (colores || []).filter((c) => COLOR_OK.test(String(c || '')));

  const ESTILOS = {
    condensada: 'a tall condensed grotesque sans-serif, very heavy weight, tight letter spacing, like industrial signage',
    bloque: 'a chunky geometric block sans-serif, extra bold, slightly rounded corners',
    manuscrita: 'a confident brush-script lettering with thick strokes and a slight upward slant',
    stencil: 'a stencil-cut industrial typeface, heavy, with visible bridges, like painted on a crate',
  };
  const tipo = ESTILOS[estilo] || ESTILOS.condensada;
  const tinta = paleta.length
    ? `Colors: ${paleta.join(' to ')}${paleta.length > 1 ? ', as a smooth left-to-right gradient across the letters' : ''}.`
    : 'Colors: warm orange #FF6B00 fading to deep red #E02B00 across the letters.';

  const contraste = sobreFondo === 'claro'
    ? 'It will sit on a WHITE background, so keep the letters dark enough to read on white.'
    : 'It will sit on a BLACK background, so keep the letters bright enough to read on black.';

  return [
    `Create a transparent PNG of the single word "${palabra}" as custom lettering — a logotype, not a poster.`,
    `Typography: ${tipo}. All caps.`,
    tinta,
    contraste,
    'Hard requirements:',
    '- Transparent background (alpha), no card, no box, no frame, no drop shadow, no glow.',
    `- The image must contain ONLY the word "${palabra}". Do not add any other word, number, percentage, star, sparkle, price or decoration.`,
    '- Single horizontal line, letters tightly packed, tiny even margin around the word.',
    '- Crop tight to the lettering: no empty space above or below.',
    '- Wide aspect ratio, roughly 8:1 to 5:1. Render large (at least 1200 px wide) so it stays sharp when shown small.',
    '- It will be displayed only ~22 px tall in a navigation menu: strokes must be thick and the shapes simple, so it survives at that size. No thin serifs, no hairlines, no fine texture.',
    '- Flat vector look, crisp edges, no photo, no 3D, no bevel, no mockup, no hand holding it.',
  ].join('\n');
}

/* =========================================================================
 * EL MENÚ REAL DE LA TIENDA, para la vista previa.
 *
 * Antes el panel dibujaba un menú inventado ("Inicio · Urbano · Industria")
 * con su propio HTML. Por eso Sebastián vio que el ítem "Tienda" no se parecía
 * en nada al de su tienda: la previa no probaba nada.
 *
 * Esto baja la página real y devuelve el marcado del menú tal cual, con sus
 * clases, su jerarquía y sus desplegables. El panel lo mete en un iframe junto
 * con el CSS y el JS de src/navAssets.js — los MISMOS que corren en la tienda.
 * ========================================================================= */
let cacheMenu = { at: 0, data: null };

async function menuDeLaTienda({ force = false } = {}) {
  if (!force && cacheMenu.data && Date.now() - cacheMenu.at < 10 * 60 * 1000) return cacheMenu.data;

  let html = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(config.storeUrl, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': config.tiendanube.userAgent, 'Accept-Language': 'es-AR,es' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    return { ok: false, error: err.message, desktop: '', mobile: '', css: '' };
  }

  /* El CSS del menú viaja en los <style> de la propia página (el theme los
     inserta inline). Se conservan ENTEROS: filtrar "sólo lo del menú" es lo
     que haría que la previa vuelva a mentir. Lo que sí se saca son los
     <script>, que no tienen nada que hacer en una previa. */
  const estilos = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1]).join('\n');

  /* ⚠️ LAS HOJAS EXTERNAS TAMBIÉN, o la previa se ve en Times.
     Los <style> inline son sólo el CSS propio del theme: la base (grillas,
     tipografías, el header entero) y la fuente Inter vienen en cuatro
     <link rel="stylesheet">. Sin ellos el menú perdía la tipografía y el
     layout, y se veía desordenado — que es exactamente lo que se reportó.
     Se absolutizan porque el theme las sirve con protocolo relativo. */
  const hojas = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => (/href\s*=\s*["']([^"']+)["']/i.exec(m[0]) || [])[1])
    .filter(Boolean)
    .map((u) => (u.startsWith('//') ? 'https:' + u : u))
    .filter((u) => /^https?:\/\//i.test(u));

  const sinScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');

  /* Los dos árboles del menú, con los nombres REALES que usa este theme
     (verificados sobre el HTML en vivo, no adivinados):
       · escritorio → <ul class="js-nav-desktop-list nav-desktop-list">
       · hamburguesa → <ul class="nav-list" data-component="menu">
     ⚠️ NO se pueden recortar con una regex no-greedy hasta el primer </ul>:
     las dos listas tienen sublistas anidadas (.list-subitems) y el recorte
     cortaba en el primer cierre, devolviendo medio menú. Hay que BALANCEAR. */
  const balanceado = (reAbre, nombreTag) => {
    const m = reAbre.exec(sinScripts);
    if (!m) return '';
    const desde = m.index;
    let nivel = 0;
    const tag = new RegExp('<(\\/?)' + nombreTag + '\\b', 'gi');
    tag.lastIndex = desde;
    let t;
    while ((t = tag.exec(sinScripts))) {
      nivel += t[1] ? -1 : 1;
      if (nivel === 0) {
        const cierre = sinScripts.indexOf('>', tag.lastIndex);
        return sinScripts.slice(desde, cierre + 1);
      }
    }
    return sinScripts.slice(desde);
  };

  /* ESCRITORIO: el <header> ENTERO, no sólo el <ul>.
     Con la lista sola, el menú perdía el contexto que le da su aspecto — el
     header es negro con texto blanco, y suelto quedaba en gris sobre negro,
     casi ilegible. La previa tiene que mostrar lo mismo que ve el cliente, así
     que se trae el header completo (logo, buscador y menú). */
  const header = balanceado(/<header\b[^>]*id=["']main-header["'][^>]*>/i, 'header');
  const desktop = header
    || balanceado(/<ul[^>]*class=["'][^"']*nav-desktop-list[^"']*["'][^>]*>/i, 'ul');

  /* CELULAR: el árbol del hamburguesa, que en el theme vive fuera del header
     (es el contenido de un modal) y va sobre fondo blanco. */
  const mobile = balanceado(
    /<ul[^>]*class=["'][^"']*\bnav-list\b[^"']*["'][^>]*data-component=["']menu["'][^>]*>/i, 'ul');

  const data = {
    ok: true,
    desktop,
    mobile,
    css: estilos,
    hojas: [...new Set(hojas)],
    /* La previa lo usa como <base> del iframe: el CSS del theme trae @font-face
       con rutas relativas y un iframe hecho con srcdoc no tiene URL propia
       contra la cual resolverlas — sin esto el menú se ve en Times. */
    url: config.storeUrl,
    // Para poder decir en el panel de cuándo es la foto que se está mirando.
    leido: new Date().toISOString(),
  };
  cacheMenu = { at: Date.now(), data };
  return data;
}

function getCatalog() {
  return { fields: REGLA_FIELDS, fuentes: FUENTES, badges: ESTILOS_BADGE, grupos: GRUPOS, iconos: ICONOS };
}

module.exports = {
  getCatalog, getConfig, saveConfig, validateConfig, buildPayload, getStyle, importarDelTheme,
  opcionesDeItem, normalizarUrl, normalizarTexto, promptDeImagen, menuDeLaTienda, SETTING_KEY,
};
