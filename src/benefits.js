/* =========================================================================
 * FRANJA DE BENEFICIOS — la tira de "envío gratis / 6 cuotas / cambios"
 * que va arriba de todo en las páginas de categoría.
 *
 * QUÉ PROBLEMA RESUELVE
 * Las categorías no tenían NINGUNA: la franja de confianza del theme está sólo
 * en el home, así que quien entra directo a una categoría (que es lo que pasa
 * con casi todo el tráfico de ads) no ve ni el envío gratis, ni el descuento
 * por transferencia, ni que se puede cambiar. Son las cuatro objeciones que
 * frenan la compra y no estaban dichas en el lugar donde se decide.
 *
 * POR QUÉ CONFIGURABLE Y NO ESCRITO EN EL THEME
 * Porque los números cambian: el mínimo de envío gratis, el % por
 * transferencia, la cantidad de cuotas. Escrito en el theme, cada ajuste es
 * tocar código y volver a subir todo.
 *
 * DÓNDE APARECE
 * Por defecto en TODAS LAS MINORISTAS, y eso no se lista a mano: el catálogo
 * ya sabe cuáles lo son (storeCategories marca `minorista` según cuántos de sus
 * productos tienen precio cargado — donde casi ninguno lo tiene, es catálogo
 * mayorista y el precio se consulta). Se mandan las rutas RAÍZ y la tienda
 * matchea por prefijo, así queda cubierta toda la rama sin enumerar las 105.
 * ========================================================================= */

const { getSetting, setSetting } = require('./settings');
const storeCategories = require('./storeCategories');
// Los íconos son los mismos que los del menú: una sola librería para toda la
// tienda, y el path viaja YA RESUELTO para que el theme no tenga su copia.
const { getCatalog: catalogoDelMenu } = require('./navMenu');

const SETTING_KEY = 'nav_benefits';
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

const DONDE = [
  { value: 'minoristas', label: 'En todas las categorías minoristas (recomendado)' },
  { value: 'todas', label: 'En todas las categorías, también las mayoristas' },
  { value: 'elegidas', label: 'Sólo en las que yo elija' },
];

/* DÓNDE va dentro de la página. El default es "antes del buscador" y no
   "arriba de todo": en una categoría CON banner —que son casi todas las
   principales— la franja arriba queda por encima del banner, lejos del
   contenido y prácticamente escondida. Antes del buscador cae justo donde el
   ojo ya está leyendo. */
const POSICIONES = [
  { value: 'interior', label: 'Antes del buscador (recomendado)' },
  { value: 'arriba', label: 'Arriba de todo, antes del banner' },
];

/* Cómo se acomoda en el celular. Con cuatro mensajes no entran en una línea:
   o se deslizan de costado o se arman en dos filas de a dos. */
const MOBILE = [
  { value: 'desliza', label: 'En una línea, deslizando de costado' },
  { value: 'grilla', label: 'En dos columnas, una debajo de la otra' },
];

const ESTILOS = [
  { value: 'linea', label: 'Una línea fina, separada por puntos' },
  { value: 'tarjetas', label: 'Tarjetas con ícono, una al lado de la otra' },
];

/* Sugerencias listas para esta tienda. Son las cuatro objeciones que frenan la
   compra, en el orden en que aparecen en la cabeza del que está mirando. */
const SUGERENCIAS = [
  { icono: 'camion', text: 'Envío gratis a partir de $55.000' },
  { icono: 'porcentaje', text: '10% OFF pagando por transferencia' },
  { icono: 'etiqueta', text: 'Hasta 6 cuotas sin interés' },
  { icono: 'reloj', text: 'Cambios y devoluciones dentro de los 30 días' },
];

const CAMPOS = [
  {
    key: 'items', label: 'Mensajes', type: 'lista', max: 6, min: 1,
    item: [
      { key: 'text', label: 'Texto', type: 'texto', max: 60, placeholder: 'Envío gratis a partir de $55.000' },
      { key: 'icono', label: 'Ícono', type: 'icono' },
    ],
  },
  {
    key: 'donde', label: 'Dónde se muestra', type: 'opciones', default: 'minoristas', options: DONDE,
    help: 'Las minoristas son las que tienen precio cargado y carrito. En las mayoristas el precio se consulta, así que hablar de cuotas ahí confunde.',
  },
  {
    key: 'rutas', label: 'Categorías elegidas', type: 'categorias', when: { key: 'donde', is: 'elegidas' },
    help: 'Incluye también todo lo que cuelgue de cada una.',
  },
  { key: 'estilo', label: 'Cómo se ve', type: 'opciones', default: 'linea', options: ESTILOS },
  {
    key: 'posicion', label: 'En qué parte de la página', type: 'opciones', default: 'interior', options: POSICIONES,
    help: 'Si la categoría tiene banner, arriba de todo la franja queda por encima del banner y se pierde.',
  },
  { key: 'mobile', label: 'En el celular', type: 'opciones', default: 'desliza', options: MOBILE },
  { key: 'bg', label: 'Color de fondo', type: 'color' },
  { key: 'color', label: 'Color del texto', type: 'color' },
  { key: 'enabled', label: 'Mostrar la franja', type: 'switch', default: true },
];

const COLOR_OK = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const color = (v) => (COLOR_OK.test(String(v || '').trim()) ? String(v).trim() : '');

function normalizarUrl(u) {
  let s = String(u || '').trim().toLowerCase();
  if (!s) return '';
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/^https?:\/\/[^/]+/, '');
  return s.replace(/^\/+|\/+$/g, '');
}

/* ------------------------------------------------------------- validación */

function validateConfig(input, { lenient = false } = {}) {
  const d = input || {};
  const faltantes = [];

  const items = (Array.isArray(d.items) ? d.items : [])
    .map((x) => ({
      text: String((x && x.text) || '').trim().slice(0, 60),
      icono: String((x && x.icono) || '').trim().slice(0, 20),
    }))
    .filter((x) => x.text);

  if (!items.length) {
    const msg = 'La franja no tiene ningún mensaje: sin eso no se muestra nada.';
    if (!lenient) throw new Error(msg);
    faltantes.push(msg);
  }
  if (items.length > 6) throw new Error('Son demasiados mensajes (máximo 6).');

  const donde = DONDE.some((o) => o.value === d.donde) ? d.donde : 'minoristas';
  const rutas = (Array.isArray(d.rutas) ? d.rutas : []).map(normalizarUrl).filter(Boolean);

  if (donde === 'elegidas' && !rutas.length) {
    const msg = 'Elegiste "sólo en las que yo elija" pero no elegiste ninguna.';
    if (!lenient) throw new Error(msg);
    faltantes.push(msg);
  }

  const cfg = {
    items,
    donde,
    rutas,
    estilo: ESTILOS.some((o) => o.value === d.estilo) ? d.estilo : 'linea',
    posicion: POSICIONES.some((o) => o.value === d.posicion) ? d.posicion : 'interior',
    mobile: MOBILE.some((o) => o.value === d.mobile) ? d.mobile : 'desliza',
    bg: color(d.bg),
    color: color(d.color),
    enabled: d.enabled !== false,
  };
  return lenient ? { ...cfg, faltantes } : cfg;
}

/* ------------------------------------------------------------------ config */

async function getConfig() {
  const raw = await getSetting(SETTING_KEY);
  const vacio = { items: [], donde: 'minoristas', rutas: [], estilo: 'linea', posicion: 'interior', mobile: 'desliza', bg: '', color: '', enabled: false };
  if (!raw) return vacio;
  try {
    // Los defaults se rellenan por si la config se guardó antes de que
    // existieran estos campos.
    return { ...vacio, ...JSON.parse(raw) };
  } catch (e) {
    console.error('[benefits] La config guardada no es JSON válido:', e.message);
    return vacio;
  }
}

async function saveConfig(input) {
  const cfg = validateConfig(input);
  await setSetting(SETTING_KEY, JSON.stringify(cfg));
  cache = { at: 0, payload: null };
  return cfg;
}

/**
 * Las rutas RAÍZ donde tiene que aparecer. Raíz y no la lista completa a
 * propósito: la tienda matchea por prefijo, así una categoría nueva colgada de
 * una rama ya cubierta funciona sola, sin volver a publicar.
 */
async function rutasDe(cfg) {
  if (cfg.donde === 'elegidas') return cfg.rutas;

  const data = await storeCategories.categorias().catch(() => null);
  const lista = data && Array.isArray(data.lista) ? data.lista : [];
  if (!lista.length) return [];

  // Sólo las de primer nivel: sus hijas quedan cubiertas por prefijo.
  const raices = lista.filter((c) => !c.padre);
  const sirven = cfg.donde === 'todas'
    ? raices
    // ⚠️ Una raíz puede estar marcada como no minorista sólo porque ELLA no
    // tiene productos directos (es un contenedor). Se la toma si alguna de sus
    // hijas es minorista, o si no la franja no aparecería en media tienda.
    : raices.filter((r) => r.minorista || lista.some((h) => h.padre === r.id && h.minorista));

  return sirven.map((c) => normalizarUrl(c.url)).filter(Boolean);
}

async function buildPayload(cfg) {
  if (!cfg.enabled || !cfg.items.length) return null;
  const ICONOS = catalogoDelMenu().iconos || {};
  return {
    items: cfg.items.map((x) => ({
      text: x.text,
      icono: x.icono,
      icono_d: (ICONOS[x.icono] || {}).d || '',
    })),
    estilo: cfg.estilo,
    posicion: cfg.posicion,
    mobile: cfg.mobile,
    bg: cfg.bg,
    color: cfg.color,
    rutas: await rutasDe(cfg),
    // 'todas' se manda igual para que la tienda no tenga que adivinar cuando
    // la lista viene vacía (motor sin catálogo cargado, por ejemplo).
    todas: cfg.donde === 'todas',
  };
}

async function getBenefits({ force = false } = {}) {
  if (!force && cache.payload !== null && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = await buildPayload(await getConfig());
  cache = { at: Date.now(), payload };
  return payload;
}

function getCatalog() {
  return { fields: CAMPOS, donde: DONDE, estilos: ESTILOS, posiciones: POSICIONES, mobiles: MOBILE, sugerencias: SUGERENCIAS };
}

module.exports = {
  getCatalog, getConfig, saveConfig, validateConfig, buildPayload, getBenefits,
  rutasDe, normalizarUrl, SETTING_KEY,
};
