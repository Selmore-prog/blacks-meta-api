const pool = require('./db');
const config = require('./config');
const { getPublicUrl } = require('./storage');
const { utmLink, storeUtmLink } = require('./utm');
const { publishToInstagram, publishToFacebook, publishCarouselToInstagram } = require('./metaPublisher');

async function loadAsset(assetId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.platform, c.post_type, c.pillar, c.format, c.scheduled_date,
            c.automation_level, c.interaction_hint, c.status AS calendar_status,
            p.permalink AS product_permalink,
            (SELECT MAX(id) FROM generated_assets ga
             WHERE ga.calendar_id = a.calendar_id AND ga.status <> 'discarded') AS latest_asset_id
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     LEFT JOIN products_cache p ON p.id = a.product_id
     WHERE a.id = $1`,
    [assetId]
  );
  return rows[0];
}

/**
 * Saca de la cola las entradas pendientes de un asset (cuando se descarta, se pausa
 * su slot o se regenera). Evita el bug de "lo eliminé y se publicó igual".
 */
async function cancelQueuedForAsset(assetId) {
  const { rowCount } = await pool.query(
    `DELETE FROM publish_queue WHERE asset_id = $1 AND status IN ('queued', 'processing')`,
    [assetId]
  );
  if (rowCount) console.log(`[publishService] ${rowCount} entrada(s) de cola canceladas para el asset #${assetId}.`);
  return rowCount;
}

/** Cancela la cola de TODOS los assets de un slot (cuando el slot se pausa/skipped). */
async function cancelQueuedForCalendar(calendarId) {
  const { rowCount } = await pool.query(
    `DELETE FROM publish_queue q USING generated_assets a
     WHERE q.asset_id = a.id AND a.calendar_id = $1 AND q.status IN ('queued', 'processing')`,
    [calendarId]
  );
  if (rowCount) console.log(`[publishService] ${rowCount} entrada(s) de cola canceladas para el slot #${calendarId}.`);
  return rowCount;
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

  // El slot fue pausado/eliminado (skipped) DESPUÉS de aprobar la pieza: no se publica.
  if (asset.calendar_status === 'skipped' && !force) {
    await cancelQueuedForAsset(assetId).catch(() => {});
    throw new Error(`El slot de esta pieza está pausado (skipped): no se publica. Si la querés publicar igual, reactivá el slot desde "Planificar".`);
  }

  // Hay una versión MÁS NUEVA de esta pieza (se regeneró): la vieja no se publica,
  // aunque haya quedado aprobada. Evita publicar contenido reemplazado/eliminado.
  if (asset.latest_asset_id && Number(asset.latest_asset_id) !== Number(assetId) && !force) {
    await cancelQueuedForAsset(assetId).catch(() => {});
    throw new Error(`La pieza #${assetId} fue reemplazada por una versión más nueva (#${asset.latest_asset_id}): no se publica la versión vieja.`);
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
      // Especificación exacta del sticker (encuesta/quiz/pregunta) generada junto
      // con el copy: tipo, pregunta, opciones y respuesta correcta.
      sticker: asset.sticker || null,
      // Link con UTMs para el sticker de link de la historia: al usarlo, Google
      // Analytics registra la campaña engine_<calendarId> y la pieza queda atribuida.
      link_url: asset.product_permalink
        ? utmLink(asset.product_permalink, { calendarId: asset.calendar_id, pillar: asset.pillar })
        : storeUtmLink({ calendarId: asset.calendar_id, pillar: asset.pillar }),
    };
  }

  const imageUrl = getPublicUrl(asset.image_path);
  // Si hay una versión editada (subtítulos/voz), se publica esa.
  const videoUrl = getPublicUrl(asset.edited_video_path || asset.video_path);

  let mediaType = 'FEED';
  if (asset.post_type === 'story') mediaType = 'STORIES';
  if (asset.post_type === 'reel') mediaType = 'REELS';

  if (mediaType === 'REELS' && !videoUrl) {
    throw new Error('Este Reel no tiene video: generalo en Gemini/Veo con el botón "Prompt video IA" y subilo con "Subir video". (Ya no se auto-genera el video estático de la imagen.)');
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

  // Historia de refuerzo DESACTIVADA: la API de Instagram no permite LINKEAR una
  // historia al post del feed (el sticker "Ver publicación" es sólo de la app), y una
  // historia suelta con la misma imagen no aporta como refuerzo. Si en algún momento
  // se quiere levantar el post en historias, se hace a mano desde el celular (compartir
  // el post a tu historia). Por eso acá no se publica ninguna historia automática.

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
 * Encola los assets aprobados de hoy que sean AUTOMÁTICOS. Cada uno queda agendado
 * para SU horario (scheduled_time, hora argentina): la cola corre cada hora y publica
 * lo que ya venció. Sin horario, sale en la próxima pasada.
 * Idempotente: si ya están en la cola no los duplica. Nunca toca semiautomatizados.
 *
 * NOTA: ya NO se filtra por pilar. Si marcaste la pieza como 'auto' y la aprobaste,
 * se publica sola — sin importar si es promo, educativo, marca, etc. Lo que se revisa
 * y publica a mano es sólo lo 'semi' (que necesita sticker/encuesta agregada a mano).
 */
async function enqueueDailyAuto() {
  const { rows } = await pool.query(
    `INSERT INTO publish_queue (asset_id, next_attempt_at)
     SELECT a.id,
            CASE WHEN c.scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                 THEN ((c.scheduled_date::text || ' ' || c.scheduled_time)::timestamp AT TIME ZONE $1)
                 ELSE now() END
     FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.scheduled_date = CURRENT_DATE
       AND a.status = 'approved'
       AND c.automation_level = 'auto'
       AND c.pillar != 'repost'
       -- Slots pausados/eliminados desde el panel NO se publican.
       AND c.status <> 'skipped'
       -- Sólo la ÚLTIMA versión de la pieza: si se regeneró, la vieja (aunque haya
       -- quedado aprobada) no se encola — era el bug de "publicó algo que eliminé".
       AND a.id = (SELECT MAX(ga.id) FROM generated_assets ga
                   WHERE ga.calendar_id = c.id AND ga.status <> 'discarded')
     ON CONFLICT (asset_id) DO NOTHING
     RETURNING asset_id`,
    [config.timezone]
  );
  console.log(`[publishService] ${rows.length} asset(s) nuevos encolados para publicar en su horario.`);
  return rows.map((r) => r.asset_id);
}

/**
 * Aprobación automática (opt-in con AUTO_APPROVE=true): aprueba sola las piezas de HOY
 * que salieron LIMPIAS del control de calidad. Condiciones duras para no publicar nada
 * dudoso sin revisión: slot automático y no pausado, copy sin problemas de QA
 * (qa_notes null) y generado con el modelo principal (no el de respaldo), no reels sin
 * video, no semi, y sólo la última versión de cada slot. Con AUTO_APPROVE apagado
 * (default) no hace nada: seguís aprobando a mano.
 */
async function autoApproveCleanDrafts() {
  if (!config.meta.autoApprove) return 0;
  const { rows } = await pool.query(
    `UPDATE generated_assets a SET status = 'approved', updated_at = now()
     FROM content_calendar c
     WHERE c.id = a.calendar_id
       AND c.scheduled_date = CURRENT_DATE
       AND a.status = 'draft'
       AND c.status = 'draft'
       AND c.automation_level = 'auto'
       AND c.pillar != 'repost'
       AND a.qa_notes IS NULL
       AND COALESCE(a.gen_model, '') = 'gemini'
       AND NOT (c.post_type = 'reel' AND a.video_path IS NULL)
       AND a.id = (SELECT MAX(ga.id) FROM generated_assets ga
                   WHERE ga.calendar_id = c.id AND ga.status <> 'discarded')
     RETURNING a.id, a.calendar_id`
  );
  if (rows.length) {
    await pool.query(
      `UPDATE content_calendar SET status = 'approved' WHERE id = ANY($1)`,
      [rows.map((r) => r.calendar_id)]
    );
    console.log(`[publishService] AUTO_APPROVE: ${rows.length} pieza(s) limpias de hoy aprobadas solas (${rows.map((r) => '#' + r.id).join(', ')}).`);
  }
  return rows.length;
}

/**
 * Instante EXACTO de publicación de una pieza (hora ARG = GMT-3, sin horario de verano).
 * Devuelve null si no hay un horario válido (esas piezas no tienen ventana: salen cuando toca).
 */
function scheduledInstant(scheduledDate, scheduledTime) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime || '')) return null;
  const day = (scheduledDate instanceof Date ? scheduledDate.toISOString() : String(scheduledDate)).slice(0, 10);
  const t = new Date(`${day}T${scheduledTime}:00-03:00`);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * Procesa la cola: publica lo que esté 'queued' y vencido (next_attempt_at <= now).
 * Si Meta falla, agenda un reintento con backoff (30 min * 2^intentos) hasta max_attempts;
 * después queda 'failed' con el último error a la vista.
 *
 * VENTANA HORARIA: si una pieza quedó atrasada más de config.meta.maxPublishDelayMin
 * respecto de su horario (por un error o un cron que se demoró), NO se publica tarde
 * (no sirve postear a las 21hs una pieza de las 17:30): queda 'failed' para republicar
 * a mano. La publicación MANUAL desde el panel no pasa por acá, así que no tiene ese límite.
 */
async function processPublishQueue() {
  const { rows } = await pool.query(
    `SELECT q.id AS queue_id, q.asset_id, q.attempts, q.max_attempts,
            c.scheduled_date, c.scheduled_time
     FROM publish_queue q
     JOIN generated_assets a ON a.id = q.asset_id
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE q.status = 'queued' AND q.next_attempt_at <= now()
     ORDER BY q.id`
  );

  console.log(`[publishService] ${rows.length} item(s) en cola listos para publicar.`);
  let publishedCount = 0;
  const errors = [];
  const maxDelayMs = config.meta.maxPublishDelayMin * 60 * 1000;

  for (const item of rows) {
    // Guard de ventana: si ya pasó la ventana horaria, no publicar tarde.
    const inst = scheduledInstant(item.scheduled_date, item.scheduled_time);
    if (inst && Date.now() - inst.getTime() > maxDelayMs) {
      const msg = `No se publicó: pasó la ventana horaria (más de ${config.meta.maxPublishDelayMin} min del horario ${item.scheduled_time}). Republicá a mano si todavía sirve.`;
      await pool.query(
        `UPDATE publish_queue SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`,
        [item.queue_id, msg]
      );
      console.warn(`[publishService] Asset #${item.asset_id} fuera de ventana (horario ${item.scheduled_time}): no se publica tarde.`);
      errors.push({ assetId: item.asset_id, error: msg, willRetry: false });
      continue;
    }
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
  const autoApproved = await autoApproveCleanDrafts().catch((err) => {
    console.warn(`[publishService] AUTO_APPROVE falló (sigo sin aprobar nada): ${err.message}`);
    return 0;
  });
  await enqueueDailyAuto();
  const result = await processPublishQueue();
  return { ...result, autoApproved };
}

module.exports = {
  publishAssetById,
  publishDailyAuto,
  enqueueDailyAuto,
  processPublishQueue,
  getPublishQueueStatus,
  autoApproveCleanDrafts,
  cancelQueuedForAsset,
  cancelQueuedForCalendar,
};
