#!/usr/bin/env node
/* =========================================================================
 * ¿LOS ANUNCIOS DE META TODAVÍA DICEN LA VERDAD? — oct-2026
 *
 * POR QUÉ EXISTE
 * El 28-sep-2026 entró la lista de precios nueva y los anuncios siguieron
 * diciendo lo viejo: el que más gastaba anunciaba el jean a $32.999 con 28%
 * OFF cuando la tienda ya cobraba $36.999 (24% OFF), y el del cargo ripstop
 * decía 30% OFF con el descuento real en 17%. Lo que dice un aviso obliga al
 * vendedor (Ley 24.240 art. 8) y además quema la conversión: el que hace clic
 * ve otro precio y se va. Nadie se enteró porque nada lo controlaba.
 *
 * QUÉ HACE
 * Lee anuncios/manifiesto-meta.json (qué promete cada anuncio: precio,
 * descuento, precio del combo, envío gratis) y lo compara con Tiendanube en
 * vivo. Sólo mira los anuncios que en Meta están entregando o por entregar.
 *
 *   ✗ ERROR  → el anuncio promete algo MEJOR que la tienda (precio más bajo,
 *              más descuento, envío gratis que ya no aplica) o el producto se
 *              quedó sin stock. Hay que rehacer la pieza o pausar.
 *   ! AVISO  → la tienda está mejor que el anuncio (bajó el precio, subió el
 *              descuento): no es engañoso, pero el anuncio vende menos de lo
 *              que podría.
 *
 * Uso:
 *   node scripts/verificar-precios-anuncios.js            → informe
 *   node scripts/verificar-precios-anuncios.js --pausar   → además pausa los ✗
 *   ... --manifiesto <otro.json>                          → probar con otro registro
 *
 * Sale con código 1 si hay algún ✗ (sirve para un cron).
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { tnRequest } = require('../src/tiendanube');

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const ARG_MAN = process.argv.indexOf('--manifiesto');
const MANIFIESTO = ARG_MAN > -1 ? path.resolve(process.argv[ARG_MAN + 1])
  : path.join(__dirname, '..', 'anuncios', 'manifiesto-meta.json');
const ENTREGANDO = ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED', 'WITH_ISSUES'];

const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;

/** Precio que cobra HOY la tienda y el descuento que muestra, por producto.
 *  Si las variantes tienen precios distintos se toma el más alto: un anuncio
 *  que promete un precio único tiene que valer para cualquier talle. */
async function estadoProducto(id) {
  const p = await tnRequest('GET', `/products/${id}`);
  let final = 0;
  let lista = 0;
  let stock = 0;
  let conStock = 0;
  for (const v of p.variants || []) {
    const cobra = Number(v.promotional_price) > 0 ? Number(v.promotional_price) : Number(v.price);
    const tachado = Number(v.compare_at_price) > 0 ? Number(v.compare_at_price) : Number(v.price);
    if (cobra > final) { final = cobra; lista = tachado; }
    const s = v.stock == null ? Infinity : Number(v.stock);
    stock += s;
    if (s > 0) conStock++;
  }
  const descuento = lista > final ? (1 - final / lista) * 100 : 0;
  // Talles agotados en TODOS los colores (el 28-sep: chomba sin L, remera sin M).
  // Un talle que falta en un color se compensa con otro; uno que falta en todos
  // no: el que usa ese talle hace clic y se va.
  const attrs = (p.attributes || []).map((a) => (a.es || Object.values(a)[0] || '').toLowerCase());
  const iTalle = attrs.findIndex((a) => a.includes('talle'));
  const porTalle = {};
  if (iTalle > -1) {
    for (const v of p.variants || []) {
      const t = v.values && v.values[iTalle] && (v.values[iTalle].es || Object.values(v.values[iTalle])[0]);
      if (!t) continue;
      porTalle[t] = (porTalle[t] || 0) + (v.stock == null ? Infinity : Number(v.stock));
    }
  }
  const tallesAgotados = Object.entries(porTalle).filter(([, n]) => n <= 0).map(([t]) => t);
  return {
    id,
    nombre: (p.name && (p.name.es || Object.values(p.name)[0])) || String(id),
    publicado: p.published !== false,
    final,
    descuento,
    stock,
    variantes: (p.variants || []).length,
    conStock,
    tallesAgotados,
  };
}

async function estadoEnMeta(adId) {
  if (!TOKEN) return null;
  const res = await fetch(`${GRAPH}/${API}/${adId}?fields=effective_status&access_token=${TOKEN}`);
  const d = await res.json();
  return d.error ? null : d.effective_status;
}

async function pausar(adId) {
  const body = new URLSearchParams({ status: 'PAUSED', access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${API}/${adId}`, { method: 'POST', body });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
}

(async () => {
  const man = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'));
  const umbral = Number(process.env.FREE_SHIPPING_MIN || man.envio_gratis_desde || 45000);
  const pausarErrores = process.argv.includes('--pausar');

  const ids = [...new Set(man.anuncios.flatMap((a) => [...a.productos, ...(a.tarjetas || []).map((t) => t.producto)]))];
  const productos = {};
  for (const id of ids) productos[id] = await estadoProducto(id);

  let errores = 0;
  let avisos = 0;
  for (const a of man.anuncios) {
    const estado = await estadoEnMeta(a.ad_id);
    if (estado && !ENTREGANDO.includes(estado)) continue; // pausado o archivado: no promete nada
    const ps = a.productos.map((id) => productos[id]);
    const problemas = [];
    const notas = [];

    for (const p of ps) {
      if (!p.publicado) problemas.push(`${p.nombre}: despublicado en la tienda`);
      else if (p.stock <= 0) problemas.push(`${p.nombre}: sin stock`);
      else if (p.conStock / p.variantes < 0.5) notas.push(`${p.nombre}: sólo ${p.conStock} de ${p.variantes} variantes con stock`);
      if (p.publicado && p.stock > 0 && p.tallesAgotados.length) notas.push(`${p.nombre}: sin talle ${p.tallesAgotados.join(', ')} en ningún color`);
    }
    if (a.precio != null) {
      const real = ps[0].final;
      if (real > a.precio) problemas.push(`dice ${pesos(a.precio)} y la tienda cobra ${pesos(real)}`);
      else if (real < a.precio) notas.push(`dice ${pesos(a.precio)} y la tienda bajó a ${pesos(real)}`);
    }
    if (a.descuento != null) {
      const real = ps[0].descuento;
      if (real + 1e-6 < a.descuento) problemas.push(`dice ${a.descuento}% OFF y el descuento real es ${real.toFixed(1)}%`);
      else if (Math.floor(real + 1e-6) > a.descuento) notas.push(`dice ${a.descuento}% OFF y la tienda ya da ${Math.floor(real + 1e-6)}%`);
    }
    if (a.precio_total != null) {
      const real = ps.reduce((s, p) => s + p.final, 0);
      if (real > a.precio_total) problemas.push(`el combo dice ${pesos(a.precio_total)} y hoy suma ${pesos(real)}`);
      else if (real < a.precio_total) notas.push(`el combo dice ${pesos(a.precio_total)} y hoy suma ${pesos(real)}`);
    }
    if (a.envio_gratis) {
      const total = ps.reduce((s, p) => s + p.final, 0);
      if (total < umbral) problemas.push(`promete envío gratis pero suma ${pesos(total)} (el mínimo es ${pesos(umbral)})`);
    }
    // Carrusel: cada tarjeta promete SU precio y SU descuento.
    for (const t of a.tarjetas || []) {
      const p = productos[t.producto];
      if (t.precio != null && p.final > t.precio) problemas.push(`tarjeta ${p.nombre}: dice ${pesos(t.precio)} y la tienda cobra ${pesos(p.final)}`);
      else if (t.precio != null && p.final < t.precio) notas.push(`tarjeta ${p.nombre}: dice ${pesos(t.precio)} y la tienda bajó a ${pesos(p.final)}`);
      if (t.descuento != null && p.descuento + 1e-6 < t.descuento) {
        problemas.push(`tarjeta ${p.nombre}: dice ${t.descuento}% OFF y el descuento real es ${p.descuento.toFixed(1)}%`);
      }
    }

    const etiqueta = estado ? ` [${estado}]` : '';
    if (problemas.length) {
      errores++;
      console.log(`✗ ${a.nombre}${etiqueta}\n    ${problemas.join('\n    ')}`);
      if (pausarErrores && TOKEN) {
        await pausar(a.ad_id);
        console.log('    → pausado');
      }
    } else if (notas.length) {
      avisos++;
      console.log(`! ${a.nombre}${etiqueta}\n    ${notas.join('\n    ')}`);
    } else {
      console.log(`✓ ${a.nombre}${etiqueta}`);
    }
  }
  console.log(`\n${errores} con error · ${avisos} con aviso · mínimo de envío gratis ${pesos(umbral)}`);
  if (errores) process.exit(1);
})().catch((e) => {
  console.error('Falló:', e.message);
  process.exit(2);
});
