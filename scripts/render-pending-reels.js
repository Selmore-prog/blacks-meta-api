const pool = require('../src/db');
const { renderReelVideo } = require('../src/videoRenderer');

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}): ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function renderPendingReels() {
  const { rows } = await pool.query(
    `SELECT a.id, a.image_path
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.post_type = 'reel' AND a.video_path IS NULL AND a.status != 'discarded'`
  );

  console.log(`[render-pending-reels] ${rows.length} Reel(s) pendiente(s) de video.`);

  let renderedCount = 0;
  for (const asset of rows) {
    try {
      console.log(`[render-pending-reels] Renderizando video para asset #${asset.id}...`);
      const imageBuffer = await fetchImageBuffer(asset.image_path);
      const videoUrl = await renderReelVideo({ imageBuffer, duration: 8 });
      await pool.query(`UPDATE generated_assets SET video_path = $1, updated_at = now() WHERE id = $2`, [videoUrl, asset.id]);
      console.log(`[render-pending-reels] Asset #${asset.id} -> ${videoUrl}`);
      renderedCount += 1;
    } catch (err) {
      console.error(`[render-pending-reels] Error en asset #${asset.id}:`, err.message);
    }
  }

  console.log(`[render-pending-reels] Listo. ${renderedCount}/${rows.length} video(s) renderizado(s).`);
  return { renderedCount, total: rows.length };
}

if (require.main === module) {
  renderPendingReels()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[render-pending-reels] Error general:', err);
      process.exit(1);
    });
}

module.exports = { renderPendingReels };
