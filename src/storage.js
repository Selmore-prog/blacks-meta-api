const fs = require('fs');
const path = require('path');

// @supabase/supabase-js (realtime-js) requiere WebSocket global; en Node <22
// no existe nativo, así que lo completamos con 'ws' para evitar el error
// "Node.js detected but native WebSocket not found".
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const { AwsClient } = require('aws4fetch');
const config = require('./config');

/* ---------------------------------------------------------------------------
 * DÓNDE SE GUARDAN LOS ARCHIVOS
 *
 * 1. Cloudflare R2, si están las cinco variables R2_* (ver src/config.js). Es
 *    el destino desde oct-2026: el plan gratis de Supabase cortó Storage y su
 *    API dos veces por pasar los 5 GB de tráfico del mes (jul y 20-oct-2026);
 *    R2 no cobra la salida y el plan gratis trae 10 GB guardados. Las lecturas
 *    van directo a la dirección pública del bucket (R2_PUBLIC_URL), NO por el
 *    Worker de Cloudflare: ese ya sirve descuentos, cross-sell y las fotos del
 *    home y no se le quiere sumar carga.
 * 2. Supabase Storage, como antes, si R2 no está configurado.
 * 3. Disco local (public/generated), para desarrollo sin ninguno de los dos.
 *
 * Lo que ya estaba en Supabase se muda con scripts/mudar-a-r2.js.
 * ------------------------------------------------------------------------- */

// Los archivos son inmutables (nombre con timestamp): un año de caché en el
// navegador del panel, igual que se hacía con Supabase.
const CACHE_UN_ANIO = 'public, max-age=31536000';

const R2_VARIABLES = {
  R2_ACCOUNT_ID: config.r2.accountId,
  R2_ACCESS_KEY_ID: config.r2.accessKeyId,
  R2_SECRET_ACCESS_KEY: config.r2.secretAccessKey,
  R2_BUCKET: config.r2.bucket,
  R2_PUBLIC_URL: config.r2.publicUrl,
};
const r2Faltan = Object.keys(R2_VARIABLES).filter((k) => !R2_VARIABLES[k]);

// Error típico al copiar del panel de Cloudflare: la dirección "S3 API" (privada,
// pide firma) está justo al lado de la pública. Con esa, Meta no puede bajar nada.
const r2ProblemaUrl = /\.r2\.cloudflarestorage\.com/i.test(config.r2.publicUrl)
  ? 'R2_PUBLIC_URL tiene la dirección "S3 API" del bucket, que es privada: Meta y el panel no pueden leer de ahí. Va la "Public R2.dev Bucket URL" (https://pub-....r2.dev).'
  : null;

let r2 = null;
if (r2Faltan.length === 0) {
  r2 = new AwsClient({
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries: 3, // reintenta sólo los 5xx y 429 de R2
  });
  if (r2ProblemaUrl) console.error(`[storage] ${r2ProblemaUrl}`);
  else console.log(`[storage] Archivos nuevos → Cloudflare R2 (bucket ${config.r2.bucket}, ${config.r2.publicUrl}).`);
} else if (r2Faltan.length < Object.keys(R2_VARIABLES).length) {
  console.warn(`[storage] R2 a medio configurar (falta ${r2Faltan.join(', ')}): los archivos siguen yendo a Supabase.`);
}

let supabase = null;
if (!r2) {
  if (config.supabase.url && config.supabase.key) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(config.supabase.url, config.supabase.key);
  } else {
    console.warn('[storage] Ni R2 ni Supabase configurados. Se usará almacenamiento local de fallback en public/generated.');
  }
}

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'generated');

/** 'r2' | 'supabase' | 'local': a dónde va lo que se sube ahora. */
function storageTarget() {
  if (r2) return 'r2';
  return supabase ? 'supabase' : 'local';
}

// Cada tramo de la ruta codificado como lo espera la firma de S3 (RFC 3986).
function r2Key(filename) {
  return String(filename).replace(/^\/+/, '').split('/')
    .map((tramo) => encodeURIComponent(tramo).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function r2ObjectUrl(filename) {
  const endpoint = config.r2.endpoint || `https://${config.r2.accountId}.r2.cloudflarestorage.com`;
  return `${endpoint}/${encodeURIComponent(config.r2.bucket)}/${r2Key(filename)}`;
}

/** Dirección pública (la que se guarda y la que baja Meta) de un archivo en R2. */
function r2PublicUrl(filename) {
  return `${config.r2.publicUrl}/${r2Key(filename)}`;
}

async function r2Error(res, accion) {
  const cuerpo = await res.text().catch(() => '');
  const codigo = (cuerpo.match(/<Code>([^<]+)<\/Code>/) || [])[1];
  const err = new Error(`R2 respondió ${res.status}${codigo ? ` (${codigo})` : ''} al ${accion}`);
  err.status = res.status;
  return err;
}

async function putR2Object({ buffer, filename, contentType, cacheControl = CACHE_UN_ANIO }) {
  if (!r2) throw new Error(`R2 no está configurado (falta ${r2Faltan.join(', ')}).`);
  if (r2ProblemaUrl) throw new Error(r2ProblemaUrl);
  const res = await r2.fetch(r2ObjectUrl(filename), {
    method: 'PUT',
    headers: { 'Content-Type': contentType || 'application/octet-stream', 'Cache-Control': cacheControl },
    body: buffer,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await r2Error(res, `subir ${filename}`);
  return r2PublicUrl(filename);
}

/** true si el archivo ya está en R2 (no lo baja: pregunta por la cabecera). */
async function r2ObjectExists(filename) {
  if (!r2) throw new Error(`R2 no está configurado (falta ${r2Faltan.join(', ')}).`);
  const res = await r2.fetch(r2ObjectUrl(filename), { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return false;
  if (!res.ok) throw await r2Error(res, `consultar ${filename}`);
  return true;
}

/**
 * Sube un buffer (imagen de Puppeteer, video de ffmpeg, foto subida desde el
 * panel) y devuelve su URL pública permanente: en R2 si está configurado, si
 * no en Supabase Storage, y sin ninguno de los dos en disco local.
 */
async function uploadAsset({ buffer, filename, contentType }) {
  if (r2) {
    try {
      return await putR2Object({ buffer, filename, contentType });
    } catch (err) {
      console.error(`[storage] Error subiendo a Cloudflare R2 (${config.r2.bucket}/${filename}):`, err.message);
      throw err;
    }
  }
  if (supabase) {
    const bucket = config.supabase.bucket || 'blacks-assets';
    const { data, error } = await supabase.storage
      .from(bucket)
      // cacheControl 1 año: los archivos son inmutables (nombre con timestamp), así el
      // navegador/CDN no los re-descarga en cada carga del panel — menos egress de
      // Supabase (la cuota de egress fue lo que dejó al proyecto en 402 en jul-2026).
      .upload(filename, buffer, { contentType, upsert: true, cacheControl: '31536000' });

    if (error) {
      console.error(`[storage] Error subiendo a Supabase Storage (${bucket}/${filename}):`, error.message);
      throw error;
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filename);
    return publicData.publicUrl;
  } else {
    // Fallback local para desarrollo sin R2 ni Supabase Storage
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    return `/generated/${filename}`;
  }
}

/**
 * Devuelve una URL pública absoluta apta para Meta Graph API si recibimos
 * una ruta local o relativa de desarrollo. Si ya es una URL HTTP/HTTPS (ej. R2
 * o Supabase), la devuelve intacta.
 */
function getPublicUrl(assetPath) {
  if (!assetPath) return null;
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
    return assetPath;
  }
  return `${config.publicBaseUrl}${assetPath.startsWith('/') ? '' : '/'}${assetPath}`;
}

module.exports = {
  uploadAsset,
  getPublicUrl,
  storageTarget,
  r2PublicUrl,
  putR2Object,
  r2ObjectExists,
  CACHE_UN_ANIO,
};
