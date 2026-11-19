/* =========================================================================
 * EQUIVALENTE MINORISTA DE UN PRODUCTO MAYORISTA (nov-2026)
 *
 * Pedido del dueño: en la ficha mayorista (sin precio) de la CHOMBA PAMPERO
 * decía "Producto únicamente mayorista" aunque la tienda vende la chomba por
 * unidad. El link a la minorista salía sólo si estaba vinculada a mano como
 * "producto complementario" en Tiendanube, y casi ninguna lo está.
 *
 * Esto busca la minorista POR LAS PALABRAS DEL NOMBRE, con reglas
 * conservadoras (mejor no mostrar nada que mandar a otra cosa):
 *   - Todas las palabras del mayorista tienen que estar en el minorista
 *     ("CHOMBA PAMPERO" → "Chomba Micropique Pampero" sí; "Chomba Pique Lisa
 *     Pampero" también, pero ésa está agotada).
 *   - Lo que distingue un producto de otro tiene que coincidir de los dos
 *     lados: dama / hombre / niño, manga larga / corta, pack / kit / x2,
 *     cargo, oversize, slim fit.
 *   - Como mucho 2 palabras de más en el minorista; gana el que tiene menos.
 *     Si empatan dos distintos, gana el de más stock.
 *   - Sólo minoristas publicados, con precio y con stock (products_cache).
 * El vínculo a mano en Tiendanube ("complementario") sigue ganando: lo usa la
 * ficha antes de preguntar acá.
 * ========================================================================= */

const pool = require('./db');

const CACHE_MS = 10 * 60 * 1000;
const MAX_EXTRA = 2;
let cacheCandidatos = { at: 0, filas: null };
const cacheRespuestas = new Map();

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function raiz(p) {
  if (p.length > 5 && p.endsWith('es')) return p.slice(0, -2);   // botines → botin
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);    // zapatos → zapato
  return p;
}

// No cuentan ni para sumar ni para restar.
const NEUTRAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'por', 'y', 'a', 'en', 'un', 'una', 'al',
  'logo', 'lisa', 'liso', 'mayorista', 'minorista', 'mayor', 'menor', 'unidad', 'unisex',
  'nuevo', 'nueva', 'oferta', 'promo',
  // La marca de la casa: los mayoristas genéricos la tienen de marca por defecto.
  'blacks',
]);

// Si está de un lado tiene que estar del otro (cambian el producto).
const DISTINTIVAS = [
  ['dama', 'mujer', 'femenino', 'femenina'],
  ['hombre', 'caballero', 'masculino'],
  ['nino', 'nina', 'nene', 'nena', 'kid', 'infantil', 'junior'],
  ['larga'],
  ['corta'],
  // Otro modelo, aunque el resto del nombre sea igual.
  ['cargo'],
  ['oversize'],
  ['fit', 'slim', 'chupin'],
  ['pack', 'kit', 'combo', 'set', 'x2', 'x3', 'x4', 'x5', 'x6', 'x10', 'x12'],
];
const grupoDe = new Map();
DISTINTIVAS.forEach((g, i) => g.forEach((w) => grupoDe.set(w, i)));

function palabras(t) {
  return [...new Set(normalizar(t).split(' ').filter((w) => w && !NEUTRAS.has(w)).map(raiz))];
}

const grupos = (lista) => new Set(lista.map((w) => grupoDe.get(w)).filter((g) => g !== undefined));
const mismosGrupos = (a, b) => a.size === b.size && [...a].every((g) => b.has(g));

/**
 * Elige el minorista para un nombre mayorista entre `candidatos` (filas con
 * name, stock…). Devuelve { fila, extra } o null. Puro: lo usan las pruebas.
 */
function elegir(nombre, candidatos) {
  const w = palabras(nombre);
  if (w.length < 2) return null; // "Gorro" solo no alcanza para saber cuál es
  const gw = grupos(w);
  let mejor = null;
  for (const fila of candidatos || []) {
    const r = palabras(fila.name);
    if (!w.every((x) => r.includes(x))) continue;
    if (!mismosGrupos(gw, grupos(r))) continue;
    const extra = r.filter((x) => !w.includes(x));
    if (extra.length > MAX_EXTRA) continue;
    const stock = Number(fila.stock || 0);
    if (!mejor || extra.length < mejor.extra.length
      || (extra.length === mejor.extra.length && stock > Number(mejor.fila.stock || 0))) {
      mejor = { fila, extra };
    }
  }
  return mejor;
}

async function candidatos() {
  if (cacheCandidatos.filas && Date.now() - cacheCandidatos.at < CACHE_MS) return cacheCandidatos.filas;
  const { rows } = await pool.query(
    `SELECT id, name, price, promo_price, stock, image_url,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache
      WHERE COALESCE(published, true) = true
        AND price > 0
        AND COALESCE(stock, 0) > 0`
  );
  cacheCandidatos = { at: Date.now(), filas: rows };
  cacheRespuestas.clear();
  return rows;
}

/** Lo que pide la ficha: { producto: { name, url, image, price, promo_price } | null }. */
async function buscar(nombre) {
  const clave = normalizar(nombre).slice(0, 120);
  if (!clave) return { producto: null };
  const filas = await candidatos();
  if (cacheRespuestas.has(clave)) return cacheRespuestas.get(clave);
  const r = elegir(clave, filas);
  let producto = null;
  if (r) {
    const { productPath } = require('./homeRails'); // como searchAnalytics: sin cargarlo al arrancar
    const price = r.fila.price == null ? null : Number(r.fila.price);
    const promo = r.fila.promo_price == null ? null : Number(r.fila.promo_price);
    producto = {
      name: r.fila.name,
      url: productPath(r.fila.permalink),
      image: r.fila.image_url || '',
      price,
      promo_price: promo != null && price != null && promo > 0 && promo < price ? promo : null,
    };
  }
  const out = { producto };
  if (cacheRespuestas.size > 2000) cacheRespuestas.clear();
  cacheRespuestas.set(clave, out);
  return out;
}

module.exports = { buscar, elegir, palabras };
