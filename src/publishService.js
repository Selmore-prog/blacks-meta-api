const pool = require('./db');
const config = require('./config');
const { getPublicUrl } = require('./storage');
const { publishToInstagram, publishToFacebook, publishCarouselToInstagram } = require('./metaPublisher');

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
  // Si hay una versión editada (subtítulos/voz), se publica esa.
  const videoUrl = getPublicUrl(asset.edited_video_path || asset.video_path);

  let mediaType = 'FEED';
  if (asset.post_type === 'story') mediaType = 'STORIES';
  if (asset.post_type === 'reel') mediaType = 'REELS';

  if (mediaType === 'REELS' && !videoUrl) {
    throw new Error('El video del Reel todavía no se renderizó. Esperá al proceso de render (corre cada 30 min en GitHub Actions) e intentá de nuevo.');
  }

  const fullCaption = [asset.caption, asset.hashtags].filter(Boolean).join('\n\n');

  // Carrusel: varias slides (sólo feed).
  const slides = Array.isArray(asset.slides) ? asset.slides
    : (asset.slides ? (() => { try { return JSON.parse(asset.slides); } catch (_) { return null; } })() : null);
  const isCarousel = slides && slides.length >= 2 && asset.post_type === 'feed' && asset.platform !== 'facebook';

  console.log(`[publishService] Publicando asset #${assetId} (${isCarousel ? 'CARRUSEL' : mediaType})...`);

  let metaPostId = null;
  if (isCarousel) {
    metaPostId = await publishCarouselToInstagram({ imageUrls: slides.map(getPublicUrl), caption: fullCaption });
  } else if (asset.platform === 'facebook') {
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
  // Si estaba encolado (p. ej. lo publicaste a mano desde el panel antes del cron), cerrarlo.
  await pool.query(`UPDATE publish_queue SET status = 'done', updated_at = now() WHERE asset_id = $1 AND status IN ('queued', 'processing')`, [assetId]);

  console.log(`[publishService] Asset #${assetId} publicado.`);
  return { ok: true, meta_post_id: metaPostId };
}

/**
 * Encola los assets aprobados de hoy que sean AUTOMÁTICOS y de pilares habilitados.
 * Idempotente: si ya están en la cola no los duplica. Nunca toca semiautomatizados.
 */
async function enqueueDailyAuto() {
  const pillars = config.meta.autoPublishPillars;
  const { rows } = await pool.query(
    `INSERT INTO publish_queue (asset_id)
     SELECT a.id
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.scheduled_date = CURRENT_DATE
       AND a.status = 'approved'
       AND c.automation_level = 'auto'
       AND c.pillar = ANY($1)
     ON CONFLICT (asset_id) DO NOTHING
     RETURNING asset_id`,
    [pillars]
  );
  console.log(`[publishService] ${rows.length} asset(s) nuevos encolados para publicar.`);
  return rows.map((r) => r.asset_id);
}

/**
 * Procesa la cola: publica lo que esté 'queued' y vencido (next_attempt_at <= now).
 * Si Meta falla, agenda un reintento con backoff (30 min * 2^intentos) hasta max_attempts;
 * después queda 'failed' con el último error a la vista.
 */
async function processPublishQueue() {
  const { rows } = await pool.query(
    `SELECT q.id AS queue_id, q.asset_id, q.attempts, q.max_attempts
     FROM publish_queue q
     JOIN generated_assets a ON a.id = q.asset_id
     WHERE q.status = 'queued' AND q.next_attempt_at <= now()
     ORDER BY q.id`
  );

  console.log(`[publishService] ${rows.length} item(s) en cola listos para publicar.`);
  let publishedCount = 0;
  const errors = [];

  for (const item of rows) {
    await pool.query(`UPDATE publish_queue SET status = 'processing', updated_at = now() WHERE id = $1`, [item.queue_id]);
    try {
      const result = await publishAssetById(item.asset_id);
      // Piezas que quedaron 'semi' después de encolarse: se sacan de la cola sin error.
      const finalStatus = result.ok ? 'done' : 'failed';
      await pool.query(
        `UPDATE publish_queue SET status = $2, attempts = attempts + 1, last_error = $3, updated_at = now() WHERE id = $1`,
        [item.queue_id, finalStatus, result.ok ? null : (result.message || 'Publicación manual requerida.')]
      );
      if (result.ok) publishedCount += 1;
    } catch (err) {
      const attempts = item.attempts + 1;
      const exhausted = attempts >= item.max_attempts;
      // Si el asset ya no está aprobado (lo descartaron/editaron), no reintentar.
      const { rows: assetRows } = await pool.query(`SELECT status FROM generated_assets WHERE id = $1`, [item.asset_id]);
      const stillApproved = assetRows[0] && assetRows[0].status === 'approved';
      const backoffMinutes = 30 * Math.pow(2, item.attempts); // 30m, 1h, 2h, 4h...
      await pool.query(
        `UPDATE publish_queue
         SET status = $2, attempts = $3, last_error = $4,
             next_attempt_at = now() + ($5 || ' minutes')::interval, updated_at = now()
         WHERE id = $1`,
        [item.queue_id, exhausted || !stillApproved ? 'failed' : 'queued', attempts, err.message, String(backoffMinutes)]
      );
      console.error(`[publishService] Error publicando #${item.asset_id} (intento ${attempts}/${item.max_attempts}): ${err.message}`);
      errors.push({ assetId: item.asset_id, error: err.message, willRetry: !exhausted && stillApproved });
    }
  }

  return { publishedCount, errors };
}

async function getPublishQueueStatus({ limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const { rows } = await pool.query(
    `SELECT q.id, q.asset_id, q.status, q.attempts, q.max_attempts,
            q.next_attempt_at, q.last_error, q.created_at, q.updated_at,
            c.scheduled_date, c.scheduled_time, c.post_type, c.pillar, c.theme_title,
            a.status AS asset_status
     FROM publish_queue q
     JOIN generated_assets a ON a.id = q.asset_id
     JOIN content_calendar c ON c.id = a.calendar_id
     ORDER BY
       CASE q.status WHEN 'failed' THEN 0 WHEN 'processing' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,
       q.next_attempt_at ASC,
       q.id DESC
     LIMIT $1`,
    [safeLimit]
  );
  const { rows: summaryRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM publish_queue
     GROUP BY status
     ORDER BY status`
  );
  return {
    summary: Object.fromEntries(summaryRows.map((r) => [r.status, r.count])),
    items: rows,
  };
}

/**
 * Pasada diaria completa: encola lo de hoy y procesa toda la cola
 * (incluye reintentos pendientes de pasadas anteriores).
 */
async function publishDailyAuto() {
  console.log(`[publishService] Auto-publish para pilares: ${config.meta.autoPublishPillars.join(', ')}`);
  await enqueueDailyAuto();
  return processPublishQueue();
}

module.exports = {
  publishAssetById,
  publishDailyAuto,
  enqueueDailyAuto,
  processPublishQueue,
  getPublishQueueStatus,
};
