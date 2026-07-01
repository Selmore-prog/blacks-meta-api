const pool = require('./db');
const { uploadAsset } = require('./storage');
const { resizeImage } = require('./imageUtils');

const IMG_RE = /\.(jpe?g|png|webp)$/i;

function parseFolderId(url) {
  if (!url) return null;
  let m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Lista el contenido de una carpeta PÚBLICA de Drive usando la vista embebida
 * (no necesita API key). Devuelve [{ id, name, isFolder }].
 */
async function fetchFolderEntries(folderId) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Drive ${res.status} listando carpeta ${folderId}`);
  const html = await res.text();

  const entries = [];
  const re = /<div class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?href="([^"]+)"[\s\S]*?flip-entry-title[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const href = m[2];
    const name = decodeEntities(m[3]);
    entries.push({ id, name, isFolder: href.includes('/folders/') });
  }
  return entries;
}

/** Descarga un archivo público de Drive. Devuelve { buffer, contentType }. */
async function downloadDriveFile(id) {
  const url = `https://drive.google.com/uc?export=download&id=${id}`;
  let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  let ct = res.headers.get('content-type') || '';
  // Archivos grandes muestran una interstitial con token de confirmación.
  if (ct.startsWith('text/html')) {
    const html = await res.text();
    const t = html.match(/confirm=([0-9A-Za-z_-]+)/);
    if (t) {
      res = await fetch(`${url}&confirm=${t[1]}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      ct = res.headers.get('content-type') || '';
    } else {
      return { buffer: null, contentType: ct };
    }
  }
  if (!res.ok) return { buffer: null, contentType: ct };
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: ct };
}

/**
 * Recorre recursivamente una carpeta juntando rutas de imágenes.
 * Devuelve [{ id, name, path }] (path = "JUNIO / FEED").
 */
async function walkFolder(folderId, pathPrefix, out, opts, depth = 0) {
  if (out.length >= opts.maxImages || depth > opts.maxDepth) return;
  let entries;
  try { entries = await fetchFolderEntries(folderId); } catch (_) { return; }

  const images = entries.filter((e) => !e.isFolder && IMG_RE.test(e.name));
  const folders = entries.filter((e) => e.isFolder);

  let takenHere = 0;
  for (const img of images) {
    if (out.length >= opts.maxImages || takenHere >= opts.perFolderCap) break;
    out.push({ id: img.id, name: img.name, path: pathPrefix });
    takenHere += 1;
  }
  for (const f of folders) {
    if (out.length >= opts.maxImages) break;
    await walkFolder(f.id, pathPrefix ? `${pathPrefix} / ${f.name}` : f.name, out, opts, depth + 1);
  }
}

/**
 * Importa imágenes de una carpeta pública de Drive como piezas de referencia de estilo.
 * Idempotente: no reimporta archivos ya traídos (dedupe por id de Drive).
 */
async function importDriveFolder(url, { maxImages = 40, perFolderCap = 6, maxDepth = 5 } = {}) {
  const rootId = parseFolderId(url);
  if (!rootId) throw new Error('No pude leer el ID de la carpeta de Drive. Pegá el link completo de la carpeta.');

  const rootEntries = await fetchFolderEntries(rootId).catch(() => []);
  const rootName = 'INSTAGRAM';

  const found = [];
  await walkFolder(rootId, '', found, { maxImages, perFolderCap, maxDepth });

  if (!found.length) {
    throw new Error('No encontré imágenes. Revisá que la carpeta esté compartida como "Cualquiera con el enlace".');
  }

  // Dedupe: ids ya importados.
  const { rows: existing } = await pool.query(
    `SELECT storage_path FROM style_references WHERE source = 'drive' AND storage_path IS NOT NULL`
  );
  const have = new Set(existing.map((r) => (r.storage_path.match(/drive\/([a-zA-Z0-9_-]+)\./) || [])[1]).filter(Boolean));

  let imported = 0, skipped = 0, failed = 0;
  const preview = [];
  for (const f of found) {
    if (have.has(f.id)) { skipped += 1; continue; }
    try {
      const { buffer, contentType } = await downloadDriveFile(f.id);
      if (!buffer || !contentType.startsWith('image/')) { failed += 1; continue; }
      const small = await resizeImage(buffer, 1200).catch(() => buffer);
      const storagePath = `references/drive/${f.id}.jpg`;
      const publicUrl = await uploadAsset({ buffer: small, filename: storagePath, contentType: 'image/jpeg' });
      await pool.query(
        `INSERT INTO style_references (kind, source, url, storage_path, caption)
         VALUES ('image', 'drive', $1, $2, $3)`,
        [publicUrl, storagePath, f.path || rootName]
      );
      imported += 1;
      if (preview.length < 6) preview.push({ url: publicUrl, path: f.path });
    } catch (_) { failed += 1; }
  }

  return {
    rootName,
    subfolders: rootEntries.filter((e) => e.isFolder).map((e) => e.name),
    totalFound: found.length,
    imported, skipped, failed, preview,
  };
}

module.exports = { importDriveFolder, parseFolderId, fetchFolderEntries };
