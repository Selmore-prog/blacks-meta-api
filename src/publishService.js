const pool = require('./db');
const config = require('./config');
const { getPublicUrl } = require('./storage');
const { publishToInstagram, publishToFacebook } = require('./metaPublisher');

/**
 * Publica un asset en redes sociales por ID. Requiere que esté en estado 'approved'.
 */
async function publishAssetById(assetId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.platform, c.post_type, c.pillar, c.scheduled_date
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE a.id = $1`,
    [assetId]
  );

  const asset = rows[0];
  if (!asset) {
    throw new Error('No se encontró el asset especificado.');
  }

  if (asset.status !== 'approved') {
    throw new Error(`El asset #${assetId} está en estado "${asset.status}". Solo se pueden publicar piezas aprobadas ("approved").`);
  }

  const imageUrl = getPublicUrl(asset.image_path);
  const videoUrl = getPublicUrl(asset.video_path);

  let mediaType = 'FEED';
  if (asset.post_type === 'story') mediaType = 'STORIES';
  if (asset.post_type === 'reel') mediaType = 'REELS';

  const fullCaption = [asset.caption, asset.hashtags].filter(Boolean).join('\n\n');

  console.log(`[publishService] Publicando asset #${assetId} (${mediaType})...`);

  let metaPostId = null;
  if (asset.platform === 'facebook') {
    metaPostId = await publishToFacebook({ imageUrl, videoUrl, caption: fullCaption });
  } else {
    // Por defecto Instagram
    metaPostId = await publishToInstagram({ imageUrl, videoUrl, caption: fullCaption, mediaType });
    // Si queremos publicar también en FB opcionalmente si hay pageId:
    if (config.meta.pageId) {
      try {
        await publishToFacebook({ imageUrl, videoUrl, caption: fullCaption });
      } catch (fbErr) {
        console.warn(`[publishService] Aviso: publicación cruzada en FB falló para asset #${assetId}:`, fbErr.message);
      }
    }
  }

  // Actualizar estado en DB
  await pool.query(
    `UPDATE generated_assets SET status = 'published', meta_post_id = $2, updated_at = now() WHERE id = $1`,
    [assetId, String(metaPostId || 'pub_' + Date.now())]
  );

  await pool.query(`UPDATE content_calendar SET status = 'published' WHERE id = $1`, [asset.calendar_id]);

  console.log(`[publishService] Asset #${assetId} publicado y marcado en DB.`);
  return { ok: true, meta_post_id: metaPostId };
}

/**
 * Recorre los assets aprobados programados para hoy que pertenecen a los pilares
 * habilitados en AUTO_PUBLISH_PILLARS y los publica automáticamente.
 */
async function publishDailyAuto() {
  const pillars = config.meta.autoPublishPillars;
  console.log(`[publishService] Buscando publicaciones automáticas para hoy en pilares: ${pillars.join(', ')}`);

  const { rows } = await pool.query(
    `SELECT a.id, c.pillar
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.scheduled_date = CURRENT_DATE
       AND a.status = 'approved'
       AND c.pillar = ANY($1)`,
    [pillars]
  );

  console.log(`[publishService] Encontrados ${rows.length} asset(s) para publicar automáticamente.`);

  let publishedCount = 0;
  const errors = [];

  for (const row of rows) {
    try {
      await publishAssetById(row.id);
      publishedCount += 1;
    } catch (err) {
      console.error(`[publishService] Error publicando asset #${row.id}:`, err.message);
      errors.push({ assetId: row.id, error: err.message });
    }
  }

  return { publishedCount, errors };
}

module.exports = {
  publishAssetById,
  publishDailyAuto,
};
