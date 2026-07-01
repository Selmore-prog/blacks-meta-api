const pool = require('./db');
const { uploadAsset } = require('./storage');
const { analyzeStyle } = require('./ai');
const { saveBrandProfile } = require('./brandProfile');
const { fetchRecentCaptions } = require('./accountAnalyzer');

/** Convierte un link de Google Drive a una URL de descarga directa del archivo. */
function normalizeDriveLink(url) {
  if (!url) return url;
  let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  m = url.match(/[?&]id=([^&]+)/);
  if (m && url.includes('drive.google.com')) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return url;
}

async function addUpload({ buffer, mimetype, originalname }) {
  const ext = (mimetype && mimetype.split('/')[1]) || 'jpg';
  const safe = String(originalname || 'pieza').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const filename = `references/${Date.now()}-${safe}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  const url = await uploadAsset({ buffer, filename, contentType: mimetype || 'image/jpeg' });
  const { rows } = await pool.query(
    `INSERT INTO style_references (kind, source, url, storage_path) VALUES ('image', 'upload', $1, $2) RETURNING *`,
    [url, filename]
  );
  return rows[0];
}

async function addLink({ url, caption }) {
  const isDrive = /drive\.google\.com/.test(url || '');
  const normalized = isDrive ? normalizeDriveLink(url) : url;
  const { rows } = await pool.query(
    `INSERT INTO style_references (kind, source, url, caption) VALUES ('image', $1, $2, $3) RETURNING *`,
    [isDrive ? 'drive' : 'url', normalized, caption || null]
  );
  return rows[0];
}

async function listReferences() {
  const { rows } = await pool.query(`SELECT * FROM style_references ORDER BY id DESC LIMIT 100`);
  return rows;
}

async function deleteReference(id) {
  await pool.query(`DELETE FROM style_references WHERE id = $1`, [id]);
}

/** Descarga una URL y la devuelve como { data(base64), mimeType } si es imagen. */
async function urlToInlineImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null; // no mandamos imágenes enormes a Gemini
    return { data: buf.toString('base64'), mimeType: ct.split(';')[0] };
  } catch (_) {
    return null;
  }
}

/**
 * Corre el análisis de estilo: junta las piezas de referencia + (opcional) fotos y
 * captions reales de la cuenta de IG, se los pasa a Gemini y guarda el brand_profile.
 */
async function runStyleAnalysis({ includeAccount = true } = {}) {
  const refs = await listReferences();
  const images = [];
  for (const r of refs.slice(0, 10)) {
    const img = await urlToInlineImage(r.url);
    if (img) images.push(img);
  }

  let captions = [];
  if (includeAccount) {
    try {
      const acc = await fetchRecentCaptions(25);
      captions = acc.captions;
      // Sumamos algunas fotos reales de la cuenta como referencia visual extra.
      for (const m of acc.media.slice(0, 6)) {
        if (m.image_url && images.length < 12) {
          const img = await urlToInlineImage(m.image_url);
          if (img) images.push(img);
        }
      }
    } catch (err) {
      console.warn(`[styleService] No pude leer la cuenta de IG: ${err.message}`);
    }
  }

  if (!images.length && !captions.length) {
    throw new Error('No hay material para analizar: subí piezas o conectá la cuenta de IG.');
  }

  const result = await analyzeStyle({ images, captions });
  await saveBrandProfile({
    style_guide: result.style_guide,
    voice_guide: result.voice_guide,
    sample_captions: captions.slice(0, 15),
  });

  return { analyzedImages: images.length, analyzedCaptions: captions.length, ...result };
}

module.exports = {
  addUpload,
  addLink,
  listReferences,
  deleteReference,
  runStyleAnalysis,
  normalizeDriveLink,
};
