const pool = require('./db');
const config = require('./config');
const { getPublicUrl } = require('./storage');
const { publishToInstagram, publishToFacebook } = require('./metaPublisher');

async function loadAsset(assetId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.platform, c.post_type, c.pillar, c.format, c.scheduled_date,
            c.automation_level, c.interaction_hint
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE a.id = $1`,
    [assetId]
  );
  return rows[0];
}

/**
 * Publica un asset en redes por ID. Requiere estado 'approved'.
 * Las historias semiautomatizadas NO se publican por API (no se pueden sumar stickers
 * después de publicar): se avisa para subirlas a mano. Se puede forzar con { force:true }.
 */
async function publishAssetById(assetId, { force = false } = {}) {
  const asset = await loadAsset(assetId);
  if (!asset) throw new Error('No se encontró el asset especificado.');

  if (asset.status !== 'approved') {
    throw new Error(`El asset #${assetId} está en estado "${asset.status}". Solo se publican piezas aprobadas.`);
  }

  // Semiautomatizada: la publicás vos desde la app para poder agregar el sticker/encuesta.
  if (asset.automation_level === 'semi' && !force) {
    return {
      ok: false,
      manual: true,
      message: 'Esta pieza es SEMIAUTOMATIZADA. Publicala desde la app de Instagram para poder sumar el sticker/encuesta (Meta no deja agregarlo por API después de publicar).',
      interaction_hint: asset.interaction_hint,
      image_url: getPublicUrl(asset.image_path),
      video_url: getPublicUrl(asset.video_path),
      caption: [asset.caption, asset.hashtags].filter(Boolean).join('\n\n'),
    };
  }

  const imageUrl = getPublicUrl(asset.image_path);
  const videoUrl = getPublicUrl(asset.video_path);

  let mediaType = 'FEED';
  if (asset.post_type === 'story') mediaType = 'STORIES';
  if (asset.post_type === 'reel') mediaType = 'REELS';

  if (mediaType === 'REELS' && !videoUrl) {
    throw new Error('El video del Reel todavía no se renderizó. Esperá al proceso de render (corre cada 30 min en GitHub Actions) e intentá de nuevo.');
  }

  const fullCaption = [asset.caption, asset.hashtags].filter(Boolean).join('\n\n');
  console.log(`[publishService] Publicando asset #${assetId} (${mediaType})...`);

  let metaPostId = null;
  if (asset.platform === 'facebook') {
    metaPostId = await publishToFacebook({ imageUrl, videoUrl, caption: fullCaption });
  } else {
    metaPostId = await publishToInstagram({ imageUrl, videoUrl, caption: fullCaption, mediaType });
    if (config.meta.pageId && asset.post_type !== 'story') {
      try {
        await publishToFacebook({ imageUrl, videoUrl, caption: fullCaption });
      } catch (fbErr) {
        console.warn(`[publishService] Cross-post a FB falló para #${assetId}: ${fbErr.message}`);
      }
    }
  }

  await pool.query(
    `UPDATE generated_assets SET status = 'published', meta_post_id = $2, updated_at = now() WHERE id = $1`,
    [assetId, String(metaPostId || 'pub_' + Date.now())]
  );
  await pool.query(`UPDATE content_calendar SET status = 'published' WHERE id = $1`, [asset.calendar_id]);

  console.log(`[publishService] Asset #${assetId} publicado.`);
  return { ok: true, meta_post_id: metaPostId };
}

/**
 * Auto-publica los assets aprobados de hoy que sean AUTOMÁTICOS y de pilares habilitados.
 * Nunca toca semiautomatizados.
 */
async function publishDailyAuto() {
  const pillars = config.meta.autoPublishPillars;
  console.log(`[publishService] Auto-publish para pilares: ${pillars.join(', ')}`);

  const { rows } = await pool.query(
    `SELECT a.id, c.pillar
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.scheduled_date = CURRENT_DATE
       AND a.status = 'approved'
       AND c.automation_level = 'auto'
       AND c.pillar = ANY($1)`,
    [pillars]
  );

  console.log(`[publishService] ${rows.length} asset(s) para auto-publicar.`);
  let publishedCount = 0;
  const errors = [];
  for (const row of rows) {
    try {
      await publishAssetById(row.id);
      publishedCount += 1;
    } catch (err) {
      console.error(`[publishService] Error publicando #${row.id}: ${err.message}`);
      errors.push({ assetId: row.id, error: err.message });
    }
  }
  return { publishedCount, errors };
}

module.exports = { publishAssetById, publishDailyAuto };
