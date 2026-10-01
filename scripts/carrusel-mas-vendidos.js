#!/usr/bin/env node
/* =========================================================================
 * CARRUSEL "LOS MÁS VENDIDOS" PARA META — oct-2026
 *
 * Arma un carrusel con los productos que MÁS se vendieron de verdad (pedidos
 * pagos de Tiendanube, orders_cache) y que hoy se pueden comprar sin chocar
 * con un talle agotado. Deja todo listo para los otros scripts:
 *   · tarjetas.json  → python3 scripts/carrusel-tarjetas.py (las imágenes)
 *   · anuncio.json   → node scripts/subir-anuncios.js (el anuncio en Meta)
 *   · y muestra la entrada para anuncios/manifiesto-meta.json
 *
 *   node scripts/carrusel-mas-vendidos.js                    → 7 tarjetas, 60 días
 *   node scripts/carrusel-mas-vendidos.js --dias 30 --tarjetas 8
 *   node scripts/carrusel-mas-vendidos.js --ids 298859922,74186959   → lista forzada, en ese orden
 *   ... --carpeta anuncios/2026-11/carrusel --adset 1202...
 *
 * REGLAS (y por qué):
 *  · Sólo productos que el conjunto curado del motor deja entrar
 *    (ad_set_members.in_set: temporada, curva, publicado, sin mayorista):
 *    no se anuncia un polar en octubre.
 *  · Afuera si falta un talle CENTRAL en todos los colores (40 a 48, M a XL,
 *    7 a 10 US): el que usa ese talle hace clic, no encuentra el suyo y se va.
 *    El 1-oct-2026 quedaron afuera así el ripstop (sin 42 ni 50) y la chomba
 *    (sin L). Cuando entre el talle, vuelven solos.
 *  · El precio de la tarjeta es el MAYOR que cobra la tienda entre las
 *    variantes: lo que dice el anuncio tiene que valer para cualquier talle
 *    (Ley 24.240 art. 8). El % OFF se muestra sólo desde 15%: un "7% OFF"
 *    no suma y ocupa lugar.
 *  · "MÁS VENDIDO" en cada tarjeta es literal: sale del ranking de pedidos.
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');
const { tnRequest } = require('../src/tiendanube');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const DIAS = Number(arg('dias', 60));
const N = Number(arg('tarjetas', 7));
const IDS = arg('ids', '') ? arg('ids').split(',').map(Number) : null;
const CARPETA = path.resolve(arg('carpeta', 'anuncios/2026-10/carrusel-mas-vendidos'));
const ADSET = arg('adset', '120250621817500783'); // 01 · Prospecting amplio · Iniciar pago

// Talles centrales: si uno de estos falta en TODOS los colores, el producto no
// entra al carrusel. Los extremos (38, 54, XXXL) pueden faltar.
const CENTRALES = new Set(['40', '42', '44', '46', '48', 'M', 'L', 'XL', '7 US', '8 US', '9 US', '10 US']);

// Nombre corto para la tarjeta. Los nombres de la tienda están escritos para el
// buscador ("Pantalones Jean Vaquero Clásico Recto Original") y no entran en
// una tarjeta. Los conocidos van a mano; el resto se limpia con la regla de abajo.
const CORTOS = {
  298859922: 'Jean Clásico Recto',
  74186959: 'Cargo Slim Fit|Elastizado',
  74186334: 'Cargo Ripstop|Antidesgarro',
  136305274: 'Remera Lisa Pampero',
  203561925: 'Chomba Micropique',
  354993720: 'Alpargatas Rueda',
  353824358: 'Pack x2|Remeras Pampero',
  353824886: 'Pack x2|Chombas Pampero',
  100696539: 'Pantalón de Trabajo|Clásico Pampero',
  260499993: 'Bermuda Cargo|Cazador',
  65473048: 'Cargo Reforzado|Pampero',
  100289127: 'Bombacha de Campo|Pampero',
};
const RELLENO = /\b(pantalon(es)?|original|argentina|clasica|algod[oó]n|yute)\b/gi;
const corto = (id, nombre) => CORTOS[id]
  || nombre.replace(RELLENO, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');

const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;

async function ranking() {
  const r = await pool.query(
    `WITH o AS (SELECT * FROM orders_cache
                 WHERE created_at >= now() - ($1 || ' days')::interval
                   AND payment_status = 'paid' AND cancelled_at IS NULL)
     SELECT (x->>'product_id')::bigint AS id, count(DISTINCT o.id) AS pedidos,
            sum((x->>'quantity')::int) AS unidades
       FROM o, jsonb_array_elements(o.products) x
      GROUP BY 1 ORDER BY pedidos DESC, unidades DESC LIMIT 40`, [String(DIAS)]);
  const curados = await pool.query('SELECT product_id, in_set, season, reason FROM ad_set_members');
  const porId = new Map(curados.rows.map((c) => [Number(c.product_id), c]));
  return r.rows.map((x) => ({ id: Number(x.id), pedidos: Number(x.pedidos), unidades: Number(x.unidades), curado: porId.get(Number(x.id)) }));
}

/** Precio que cobra hoy (el mayor entre variantes), descuento y talles. */
async function ficha(id) {
  const p = await tnRequest('GET', `/products/${id}`);
  const attrs = (p.attributes || []).map((a) => (a.es || Object.values(a)[0] || '').toLowerCase());
  const iT = attrs.findIndex((a) => a.includes('talle'));
  let final = 0;
  let lista = 0;
  const porTalle = {};
  for (const v of p.variants || []) {
    const cobra = Number(v.promotional_price) > 0 ? Number(v.promotional_price) : Number(v.price);
    const tachado = Number(v.compare_at_price) > 0 ? Number(v.compare_at_price) : Number(v.price);
    if (cobra > final) { final = cobra; lista = tachado; }
    const t = iT > -1 && v.values[iT] ? (v.values[iT].es || Object.values(v.values[iT])[0]) : null;
    if (t) porTalle[t] = (porTalle[t] || 0) + (v.stock == null ? 99 : Number(v.stock));
  }
  const conStock = Object.entries(porTalle).filter(([, n]) => n > 0).map(([t]) => t);
  const agotados = Object.entries(porTalle).filter(([, n]) => n <= 0).map(([t]) => t);
  return {
    id,
    nombre: p.name.es || Object.values(p.name)[0],
    url: p.canonical_url,
    publicado: p.published !== false,
    final,
    off: lista > final ? Math.floor((1 - final / lista) * 100 + 1e-6) : 0,
    tallesConStock: conStock,
    centralesAgotados: agotados.filter((t) => CENTRALES.has(String(t).toUpperCase())),
    // La foto que muestra la tienda primero: es "el producto tal como está en la página".
    foto: ((p.images || [])[0] || {}).src,
  };
}

// "del 40 al 54" · "del S al XXXL" · calzado: "del 4 al 12 US" (no "del 4 US al 12 US").
function rango(talles) {
  if (talles.length < 2) return talles.join('');
  const us = talles.every((t) => / US$/i.test(t));
  const limpio = (t) => (us ? t.replace(/ US$/i, '') : t);
  return `del ${limpio(talles[0])} al ${limpio(talles[talles.length - 1])}${us ? ' US' : ''}`;
}

(async () => {
  const lista = await ranking();
  const elegidos = [];
  console.log(`\nMás vendidos (pedidos pagos, últimos ${DIAS} días):\n`);
  const candidatos = IDS ? IDS.map((id) => lista.find((x) => x.id === id) || { id, pedidos: 0, unidades: 0 }) : lista;
  for (const c of candidatos) {
    if (elegidos.length >= N) break;
    let motivo = null;
    if (!IDS && (!c.curado || !c.curado.in_set)) motivo = c.curado ? (c.curado.reason || 'fuera del conjunto curado') : 'no está en el conjunto curado (mayorista o sin sincronizar)';
    let f = null;
    if (!motivo) {
      f = await ficha(c.id);
      if (!f.publicado) motivo = 'despublicado';
      else if (!f.final) motivo = 'sin precio (ficha mayorista)';
      else if (f.centralesAgotados.length) motivo = `sin talle ${f.centralesAgotados.join(', ')} en ningún color`;
    }
    const linea = `${String(c.pedidos).padStart(3)} pedidos · ${String(c.unidades).padStart(3)} u · ${c.id}`;
    if (motivo) { console.log(`  ✗ ${linea} — ${motivo}`); continue; }
    console.log(`  ✓ ${linea} — ${f.nombre} · ${pesos(f.final)}${f.off ? ` (${f.off}% OFF)` : ''}`);
    elegidos.push({ ...f, pedidos: c.pedidos });
  }
  if (elegidos.length < 3) throw new Error('Menos de 3 productos en condiciones: no alcanza para un carrusel.');

  fs.mkdirSync(CARPETA, { recursive: true });
  const tarjetas = elegidos.map((f, i) => ({
    clave: `${String(i + 1).padStart(2, '0')}-${f.id}`,
    foto: f.foto.startsWith('//') ? `https:${f.foto}` : f.foto,
    titular: corto(f.id, f.nombre),
    precio: f.final,
    ...(f.off >= 15 ? { off: f.off } : {}),
    etiqueta: 'MÁS VENDIDO',
  }));
  fs.writeFileSync(path.join(CARPETA, 'tarjetas.json'), JSON.stringify({ salida: 'tarjetas', tarjetas }, null, 2));

  const anuncio = {
    adset: ADSET,
    piezas: [{
      nombre: `Carrusel · Los más vendidos · ${new Date().toISOString().slice(0, 7)}`,
      tipo: 'carrusel',
      url: 'https://blacksindumentaria.com.ar/eshop/', // "Shop Online": el catálogo minorista entero
      texto_feed: 'Lo que más se llevan en Blacks este mes, con las fotos reales de la tienda. '
        + 'Envío gratis a todo el país desde $45.000 y hasta 6 cuotas sin interés. Deslizá y elegí el tuyo 👉',
      tarjetas: elegidos.map((f, i) => ({
        imagen: `tarjetas/${tarjetas[i].clave}.jpg`,
        titulo: `${corto(f.id, f.nombre).replace('|', ' ')} — ${pesos(f.final)}`,
        descripcion: [f.off >= 15 ? `${f.off}% OFF` : null, f.tallesConStock.length ? `Talles ${rango(f.tallesConStock)}` : null].filter(Boolean).join(' · '),
        url: f.url,
      })),
    }],
  };
  fs.writeFileSync(path.join(CARPETA, 'anuncio.json'), JSON.stringify(anuncio, null, 2));

  const manifiesto = {
    ad_id: '<ID que devuelva subir-anuncios.js>',
    nombre: anuncio.piezas[0].nombre,
    productos: elegidos.map((f) => f.id),
    tarjetas: elegidos.map((f) => ({ producto: f.id, precio: f.final, ...(f.off >= 15 ? { descuento: f.off } : {}) })),
  };
  console.log(`\nListo en ${path.relative(process.cwd(), CARPETA)}/`);
  console.log('  1) python3 scripts/carrusel-tarjetas.py', path.relative(process.cwd(), path.join(CARPETA, 'tarjetas.json')));
  console.log('  2) node scripts/subir-anuncios.js', path.relative(process.cwd(), path.join(CARPETA, 'anuncio.json')), '--aplicar');
  console.log('  3) sumar al manifiesto de precios:\n', JSON.stringify(manifiesto, null, 2));
  await pool.end();
})().catch(async (e) => {
  console.error('\nFalló:', e.message);
  await pool.end();
  process.exit(1);
});
