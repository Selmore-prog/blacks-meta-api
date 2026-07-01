const pool = require('../src/db');
const { getPublicUrl } = require('../src/storage');
const { renderEditedVideo } = require('../src/videoEditor');

/**
 * Procesa los videos encolados para editar (subtítulos + voz en off).
 * Corre en GitHub Actions (ffmpeg es pesado), no en Render.
 */
async function renderVideoEdits() {
  const { rows } = await pool.query(
    `SELECT id, video_path, subtitles, overlays, voiceover_path, edit_style
     FROM generated_assets WHERE edit_status = 'queued' AND video_path IS NOT NULL`
  );
  console.log(`[render-video-edits] ${rows.length} video(s) en cola.`);

  let done = 0;
  for (const a of rows) {
    try {
      await pool.query(`UPDATE generated_assets SET edit_status = 'processing' WHERE id = $1`, [a.id]);
      const url = await renderEditedVideo({
        videoUrl: getPublicUrl(a.video_path),
        words: Array.isArray(a.subtitles) ? a.subtitles : [],
        overlays: Array.isArray(a.overlays) ? a.overlays : [],
        voiceoverUrl: a.voiceover_path ? getPublicUrl(a.voiceover_path) : null,
        style: a.edit_style || {},
      });
      await pool.query(`UPDATE generated_assets SET edited_video_path = $2, edit_status = 'done', updated_at = now() WHERE id = $1`, [a.id, url]);
      console.log(`[render-video-edits] #${a.id} -> ${url}`);
      done += 1;
    } catch (err) {
      console.error(`[render-video-edits] Error en #${a.id}:`, err.message);
      await pool.query(`UPDATE generated_assets SET edit_status = 'error' WHERE id = $1`, [a.id]).catch(() => {});
    }
  }
  console.log(`[render-video-edits] Listo. ${done}/${rows.length}.`);
  return { done, total: rows.length };
}

if (require.main === module) {
  renderVideoEdits().then(() => pool.end()).catch((err) => {
    console.error('[render-video-edits] Error general:', err.message);
    process.exit(1);
  });
}

module.exports = { renderVideoEdits };
