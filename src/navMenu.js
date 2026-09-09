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

const ESTILOS_BADGE = [
  { value: 'sale', label: 'Naranja (oferta)' },
  { value: 'rojo', label: 'Rojo (urgencia)' },
  { value: 'verde', label: 'Verde (novedad)' },
  { value: 'negro', label: 'Negro (neutro)' },
];

/* -------------------------------------------------------------------------
 * CAMPOS DE UNA REGLA
 * El panel arma el formulario solo desde esto, igual que los bloques del home
 * (ver homeBlocks.js). `when` esconde el campo si otro no está puesto.
 * ----------------------------------------------------------------------- */
const REGLA_FIELDS = [
  {
    key: 'match', label: 'Ítem del menú', type: 'categoria',
    help: 'Elegí la categoría de tu tienda. La regla se ata a la URL, así que si después le cambiás el nombre en el admin, el estilo la sigue.',
  },
  {
    key: 'match_text', label: 'O el texto del ítem', type: 'texto', max: 40,
    help: 'Sólo si el ítem NO es una categoría (una página, un link suelto). Se compara sin distinguir mayúsculas.',
  },
  {
    key: 'device', label: 'Dónde se aplica', type: 'opciones', default: 'todos',
    options: [
      { value: 'todos', label: 'Celular y computadora' },
      { value: 'mobile', label: 'Sólo celular' },
      { value: 'desktop', label: 'Sólo computadora' },
    ],
  },
  { key: 'badge_text', label: 'Globito', type: 'texto', max: 24, placeholder: 'hasta 45% off' },
  {
    key: 'badge_style', label: 'Color del globito', type: 'opciones', default: 'sale',
    options: ESTILOS_BADGE, when: { key: 'badge_text', lleno: true },
  },
  { key: 'color', label: 'Color del texto', type: 'color' },
  { key: 'bg', label: 'Fondo del ítem', type: 'color', help: 'Pinta el ítem entero. Para una "SUPERLIQUIDACIÓN" que tiene que saltar a la vista.' },
  {
    key: 'font', label: 'Tipografía', type: 'opciones', default: '', options: FUENTES,
    help: 'La fuente se baja SÓLO si algún ítem la usa.',
  },
  {
    key: 'image', label: 'Imagen o GIF en lugar del texto', type: 'imagen',
    help: 'La palabra hecha imagen. Subí un PNG con fondo transparente o un GIF. El nombre del ítem se sigue leyendo por los lectores de pantalla y por Google, así que no se pierde nada.',
  },
  {
    key: 'image_h', label: 'Alto de la imagen (px)', type: 'numero', default: 22, min: 12, max: 60,
    when: { key: 'image', lleno: true },
    help: 'En el menú de celular entra más alto que en el de la computadora. 22 px es lo que mide el texto normal.',
  },
  { key: 'hide', label: 'Esconder este ítem', type: 'switch', default: false },
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
  const out = {
    match,
    match_text: matchText,
    device: ['todos', 'mobile', 'desktop'].includes(d.device) ? d.device : 'todos',
    badge_text: String(d.badge_text || '').trim().slice(0, 24),
    badge_style: ESTILOS_BADGE.some((e) => e.value === d.badge_style) ? d.badge_style : 'sale',
    color: color(d.color),
    bg: color(d.bg),
    font: FUENTES.some((f) => f.value === d.font) ? d.font : '',
    image: urlDeImagen(d.image),
    image_h: Number.isFinite(alto) ? Math.min(60, Math.max(12, Math.round(alto))) : 22,
    hide: d.hide === true,
    enabled: d.enabled !== false,
  };

  // Una regla que no hace NADA es casi siempre un olvido, no una intención.
  const hacéAlgo = out.badge_text || out.color || out.bg || out.font || out.image || out.hide;
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
  // Ojo: la función se llama `categorias` y los campos vienen en español
  // (`nombre`, `url`), no en inglés. Devuelve las 105 categorías anidadas de la
  // API de Tiendanube, con cuántos productos y ventas tiene cada una — eso se
  // muestra al lado del nombre para no mandar un ítem destacado a una vacía.
  const cats = await storeCategories.categorias().catch(() => []);
  return (cats || [])
    .map((c) => ({
      value: normalizarUrl(c.url),
      label: c.nombre,
      productos: Number(c.productos) || 0,
      stock: Number(c.stock) || 0,
    }))
    .filter((o) => o.value && o.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

function getCatalog() {
  return { fields: REGLA_FIELDS, fuentes: FUENTES, badges: ESTILOS_BADGE };
}

module.exports = {
  getCatalog, getConfig, saveConfig, validateConfig, buildPayload, getStyle,
  opcionesDeItem, normalizarUrl, normalizarTexto, SETTING_KEY,
};
