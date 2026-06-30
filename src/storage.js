const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;
if (config.supabase.url && config.supabase.key) {
  supabase = createClient(config.supabase.url, config.supabase.key);
} else {
  console.warn('[storage] SUPABASE_URL o SUPABASE_KEY no configurados. Se usará almacenamiento local de fallback en public/generated.');
}

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'generated');

/**
 * Sube un buffer (imagen de Puppeteer o video de ffmpeg) a Supabase Storage
 * y devuelve la URL pública permanente. Si Supabase no está configurado,
 * guarda en disco local y devuelve la ruta / URL pública local.
 */
async function uploadAsset({ buffer, filename, contentType }) {
  if (supabase) {
    const bucket = config.supabase.bucket || 'blacks-assets';
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`[storage] Error subiendo a Supabase Storage (${bucket}/${filename}):`, error.message);
      throw error;
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filename);
    return publicData.publicUrl;
  } else {
    // Fallback local para desarrollo sin Supabase Storage
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
 * una ruta local o relativa de desarrollo. Si ya es una URL HTTP/HTTPS (ej. Supabase),
 * la devuelve intacta.
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
};
