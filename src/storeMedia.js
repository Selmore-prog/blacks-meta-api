/* =========================================================================
 * FOTOS Y VIDEOS QUE VE EL CLIENTE (bloques del home)
 *
 * QUÉ PROBLEMA RESUELVE
 * Hasta el 20-oct-2026 los bloques del home cargaban sus fotos y su video
 * directo de Supabase Storage y en el tamaño original: PNG de 2 a 2,7 MB por
 * foto y un MP4 de 6 MB, unos 20 MB para cada visita que bajaba hasta el
 * final. El plan gratis de Supabase trae 5 GB de tráfico por mes; con ~100
 * visitas por día al home se agotó y Supabase cortó TODO el proyecto con un
 * 402 (exceed_cached_egress_quota): fotos rotas en la tienda, el panel sin
 * imágenes y el globito de IA sin sus ajustes. En julio había pasado lo mismo
 * con el panel.
 *
 * QUÉ HACE
 * 1. Lo que se sube para la tienda se achica (1200 px de ancho, JPEG: una
 *    foto pasa de ~2,4 MB a ~250 KB) y va al Worker de Cloudflare
 *    (tiendanube-tpl/backend/lookbook-discounts/worker.js, rutas /media/),
 *    que no cobra ni corta por tráfico. Los videos van tal cual: recodificarlos
 *    con la CPU del plan gratis de Render tarda minutos.
 * 2. Las fotos viejas (direcciones de Supabase guardadas en los bloques) se
 *    mudan solas: cuando Supabase contesta, se bajan UNA vez, se achican, se
 *    suben al Worker y el reemplazo queda anotado en el ajuste `media_tienda`.
 *    Los bloques guardados no se tocan: la dirección se cambia al dibujar.
 * 3. Mientras Supabase esté cortado, lo que todavía no se mudó no se dibuja
 *    (mejor que un cuadro roto): la vidriera usa la foto de catálogo y los
 *    demás bloques que se quedan sin su foto o su video no salen.
 *
 * Sin DISCOUNTS_WORKER_KEY todo sigue como antes (Supabase).
 * ========================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const config = require('./config');
const { uploadAsset } = require('./storage');
const { resizeImage } = require('./imageUtils');
const { getSetting, setSetting } = require('./settings');

const ANCHO_MAX = 1200;
// Escala de ffmpeg (2 = casi sin pérdida, 31 = la peor). Con 4, una escena de
// 1200 px queda en ~200-250 KB y no se nota la diferencia en una tarjeta.
const CALIDAD_JPEG = 4;
const LIVIANA_BYTES = 350 * 1024; // ya está liviana: se sube tal cual
const MAX_WORKER_BYTES = 24 * 1024 * 1024; // un valor de KV aguanta 25 MB
const AJUSTE = 'media_tienda';
const SUPABASE_PUBLICO = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//i;
const REVISAR_SUPABASE_MS = 10 * 60 * 1000;

const EXTENSIONES = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v',
};
const TIPOS = Object.fromEntries(Object.entries(EXTENSIONES).map(([t, e]) => [e, t]));

function workerListo() {
  return Boolean(config.discountsWorker.url && config.discountsWorker.adminKey);
}

function errorClaro(mensaje, status = 400) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}

/* ----------------------------- achicar ----------------------------- */

// PNG con canal alfa (o con transparencia por paleta) y WebP con alfa: pasarlos
// a JPEG les pondría fondo negro donde eran transparentes.
function tieneTransparencia(buf) {
  if (buf.length > 26 && buf.readUInt32BE(0) === 0x89504e47) {
    const tipo = buf[25]; // IHDR: 4 = gris con alfa, 6 = RGBA
    if (tipo === 4 || tipo === 6) return true;
    const trns = buf.indexOf('tRNS');
    const idat = buf.indexOf('IDAT');
    return trns > 0 && (idat < 0 || trns < idat);
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const bloque = buf.toString('ascii', 12, 16);
    if (bloque === 'VP8X') return (buf[20] & 0x10) !== 0;
    if (bloque === 'VP8L') return ((buf.readUInt32LE(21) >>> 28) & 1) === 1;
  }
  return false;
}

// Orientación EXIF de un JPEG (1 = derecha). El ffmpeg del proyecto no
// endereza las fotos de celular giradas por EXIF: achicada, saldría acostada.
function orientacionExif(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  const i = buf.indexOf(Buffer.from('Exif\0\0', 'binary'), 2);
  if (i < 0 || i > 65536) return 1;
  const t = i + 6;
  try {
    const le = buf.toString('ascii', t, t + 2) === 'II';
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    const ifd = t + u32(t + 4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
  } catch (_) { /* EXIF roto: se trata como derecha */ }
  return 1;
}

// Como resizeImage, pero a PNG para no perder la transparencia.
function achicarPng(buffer) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `media-in-${id}`);
    const outPath = path.join(os.tmpdir(), `media-out-${id}.png`);
    fs.writeFileSync(inPath, buffer);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} try { fs.unlinkSync(outPath); } catch (_) {} };
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale='min(iw,${ANCHO_MAX})':-2`, '-compression_level', '9', outPath],
      (err) => {
        if (err) { clean(); return reject(err); }
        try { const out = fs.readFileSync(outPath); clean(); resolve(out); } catch (e) { clean(); reject(e); }
      }
    );
  });
}

/** La versión liviana para la tienda. Si algo falla, devuelve la original. */
async function optimizar({ buffer, contentType }) {
  const tipo = String(contentType || '').toLowerCase().split(';')[0].trim();
  const original = { buffer, contentType: tipo, ext: EXTENSIONES[tipo] || 'bin' };
  if (!tipo.startsWith('image/') || tipo === 'image/gif' || buffer.length <= LIVIANA_BYTES) return original;
  if (orientacionExif(buffer) !== 1) return original;
  try {
    const alfa = tieneTransparencia(buffer);
    const out = alfa ? await achicarPng(buffer) : await resizeImage(buffer, ANCHO_MAX, CALIDAD_JPEG);
    if (out && out.length && out.length < buffer.length) {
      return { buffer: out, contentType: alfa ? 'image/png' : 'image/jpeg', ext: alfa ? 'png' : 'jpg' };
    }
  } catch (err) {
    console.warn('[storeMedia] No se pudo achicar, va la original:', err.message);
  }
  return original;
}

/* ------------------------------ subir ------------------------------ */

async function subirAlWorker({ buffer, ruta, contentType }) {
  const base = String(config.discountsWorker.url).replace(/\/+$/, '');
  const r = await fetch(`${base}/media/${ruta}`, {
    method: 'PUT',
    headers: { 'X-Admin-Key': config.discountsWorker.adminKey, 'Content-Type': contentType },
    body: buffer,
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => ({}));
  // El Worker viejo contesta cualquier ruta desconocida con { ok, service }.
  if (r.ok && !j.url && j.service) throw new Error('el Worker de Cloudflare todavía no tiene la parte de fotos: hay que pegarle el worker.js nuevo');
  if (!r.ok || !j.url) throw new Error(`el Worker respondió ${r.status}${j.error ? `: ${j.error}` : ''}`);
  return j.url;
}

/**
 * Sube una foto o un video que va a ver el cliente. `nombre` sin extensión
 * (la pone el formato final). `soloWorker`: sin plan B en Supabase (la mudanza
 * no puede "mudar" un archivo de Supabase a Supabase).
 */
async function subirParaLaTienda({ buffer, contentType, nombre, soloWorker = false }) {
  const opt = await optimizar({ buffer, contentType });
  const ruta = `home-blocks/${nombre}.${opt.ext}`;
  if (workerListo()) {
    if (opt.buffer.length > MAX_WORKER_BYTES) {
      throw errorClaro(`Pesa ${(opt.buffer.length / 1048576).toFixed(1)} MB y el máximo es 24 MB. Achicalo (un video del home no necesita más de 10-15 s en 720p).`);
    }
    try {
      const url = await subirAlWorker({ buffer: opt.buffer, ruta, contentType: opt.contentType });
      return { url, bytes: opt.buffer.length, donde: 'cloudflare' };
    } catch (err) {
      if (soloWorker) throw err;
      console.error('[storeMedia] No se pudo subir al Worker, va a Supabase:', err.message);
    }
  } else if (soloWorker) {
    throw errorClaro('Falta DISCOUNTS_WORKER_KEY: sin la clave del Worker no hay a dónde mudar las fotos.', 500);
  }
  const url = await uploadAsset({ buffer: opt.buffer, filename: ruta, contentType: opt.contentType });
  return { url, bytes: opt.buffer.length, donde: 'supabase' };
}

/* --------------------- mudanza de las fotos viejas --------------------- */

let mapaMemo = { at: 0, valor: null };
async function leerMapa({ fresco = false } = {}) {
  if (!fresco && mapaMemo.valor && Date.now() - mapaMemo.at < 60_000) return mapaMemo.valor;
  let valor = {};
  try { valor = JSON.parse((await getSetting(AJUSTE)) || '{}') || {}; } catch (_) { valor = {}; }
  mapaMemo = { at: Date.now(), valor };
  return valor;
}
async function anotar(original, url) {
  const mapa = { ...(await leerMapa({ fresco: true })), [original]: url };
  await setSetting(AJUSTE, JSON.stringify(mapa));
  mapaMemo = { at: Date.now(), valor: mapa };
}

// Se pregunta a Supabase con una de las direcciones pendientes. 402 (cuota) o
// un 5xx/sin respuesta = cortado. Se recuerda 10 minutos.
let estado = { at: 0, bloqueado: false };
async function supabaseBloqueado(urlDePrueba) {
  if (Date.now() - estado.at < REVISAR_SUPABASE_MS) return estado.bloqueado;
  let bloqueado;
  try {
    const r = await fetch(urlDePrueba, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    bloqueado = r.status === 402 || r.status >= 500;
  } catch (_) {
    bloqueado = true;
  }
  estado = { at: Date.now(), bloqueado };
  return bloqueado;
}

function urlsDeSupabase(valor, out = new Set()) {
  if (typeof valor === 'string') { if (SUPABASE_PUBLICO.test(valor)) out.add(valor); }
  else if (Array.isArray(valor)) valor.forEach((v) => urlsDeSupabase(v, out));
  else if (valor && typeof valor === 'object') Object.values(valor).forEach((v) => urlsDeSupabase(v, out));
  return out;
}

function cambiarTextos(valor, fn) {
  if (typeof valor === 'string') return fn(valor);
  if (Array.isArray(valor)) return valor.map((v) => cambiarTextos(v, fn));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, cambiarTextos(v, fn)]));
  }
  return valor;
}

const nombreDe = (url) => path.basename(decodeURIComponent(new URL(url).pathname)).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80) || `m-${Date.now()}`;

/**
 * Cambia las direcciones de Supabase de los bloques por las del Worker. Con
 * Supabase cortado, las que todavía no se mudaron quedan vacías y el slot va en
 * `sinMedia` (el que dibuja decide qué hacer). Devuelve bloques nuevos: los
 * guardados no se tocan.
 */
async function aplicarMudanza(bloques) {
  const todas = [...urlsDeSupabase(bloques.map((b) => b.data))];
  if (!todas.length) return { bloques, sinMedia: new Set() };
  const mapa = await leerMapa();
  const pendientes = todas.filter((u) => !mapa[u]);
  const bloqueado = pendientes.length ? await supabaseBloqueado(pendientes[0]) : false;
  if (pendientes.length && !bloqueado) mudarEnSegundoPlano();

  const sinMedia = new Set();
  const nuevos = bloques.map((b) => {
    let perdio = false;
    const data = cambiarTextos(b.data, (s) => {
      if (!SUPABASE_PUBLICO.test(s)) return s;
      if (mapa[s]) return mapa[s];
      if (bloqueado) { perdio = true; return ''; }
      return s;
    });
    if (perdio) sinMedia.add(b.slot);
    return { ...b, data };
  });
  return { bloques: nuevos, sinMedia };
}

/** Baja de Supabase lo que falta mudar, lo achica y lo sube al Worker. */
async function mudarPendientes() {
  if (!workerListo()) throw errorClaro('Falta DISCOUNTS_WORKER_KEY: sin la clave del Worker no hay a dónde mudar las fotos.', 500);
  const { getBlocksConfig } = require('./homeBlocks'); // acá adentro: homeBlocks usa este módulo
  const cfg = await getBlocksConfig();
  const mapa = await leerMapa({ fresco: true });
  const pendientes = [...urlsDeSupabase(cfg.blocks.map((b) => b.data))].filter((u) => !mapa[u]);
  const hechas = [];
  const fallidas = [];
  for (const original of pendientes) {
    try {
      const r = await fetch(original, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`Supabase respondió ${r.status}`);
      const buffer = Buffer.from(await r.arrayBuffer());
      const ext = path.extname(new URL(original).pathname).slice(1).toLowerCase();
      const contentType = (r.headers.get('content-type') || '').split(';')[0] || TIPOS[ext] || 'application/octet-stream';
      const sub = await subirParaLaTienda({ buffer, contentType, nombre: nombreDe(original), soloWorker: true });
      await anotar(original, sub.url);
      hechas.push({ original, url: sub.url, antes: buffer.length, despues: sub.bytes });
    } catch (err) {
      fallidas.push({ original, error: err.message });
      // Con la cuota agotada fallan todas igual: no tiene sentido seguir pidiendo.
      if (/\b402\b/.test(err.message)) break;
    }
  }
  if (hechas.length) estado = { at: 0, bloqueado: false };
  return { hechas, fallidas, quedan: pendientes.length - hechas.length };
}

/** Muda UNA dirección de Supabase con el archivo original que se tiene a mano. */
async function mudarArchivo({ original, buffer, contentType }) {
  if (!SUPABASE_PUBLICO.test(String(original || ''))) throw errorClaro('`original` tiene que ser la dirección de Supabase que se quiere reemplazar.');
  const sub = await subirParaLaTienda({ buffer, contentType, nombre: nombreDe(original), soloWorker: true });
  await anotar(original, sub.url);
  return { original, url: sub.url, antes: buffer.length, despues: sub.bytes };
}

let mudando = null;
let ultimoIntento = 0;
function mudarEnSegundoPlano() {
  if (mudando || !workerListo() || Date.now() - ultimoIntento < REVISAR_SUPABASE_MS) return;
  ultimoIntento = Date.now();
  mudando = mudarPendientes()
    .then((r) => { if (r.hechas.length || r.fallidas.length) console.log(`[storeMedia] Mudanza: ${r.hechas.length} al Worker, ${r.fallidas.length} con error, quedan ${r.quedan}.`); })
    .catch((err) => console.error('[storeMedia] Mudanza:', err.message))
    .finally(() => { mudando = null; });
}

module.exports = {
  subirParaLaTienda,
  aplicarMudanza,
  mudarPendientes,
  mudarArchivo,
  optimizar,
  workerListo,
  _internos: { tieneTransparencia, orientacionExif, urlsDeSupabase, cambiarTextos, nombreDe },
};
