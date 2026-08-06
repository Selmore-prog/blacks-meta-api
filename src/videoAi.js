/* =========================================================================
 * VIDEO CON IA DE VERDAD (Veo 3.1 por la API de Gemini)
 *
 * Hasta ahora el video era manual: el panel te daba un prompt, lo pegabas en
 * Gemini/Veo a mano, bajabas el .mp4 y lo volvías a subir. Acá el mismo motor
 * genera el video solo:
 *
 *   1. arma un prompt CORTO en inglés (Veo acepta 480 tokens de entrada, no más
 *      — los prompts largos del modal son para pegar en la app, no para la API),
 *   2. manda la FOTO REAL del producto como primer fotograma (image-to-video):
 *      es lo que más fija el producto y evita que el modelo lo re-invente,
 *   3. arranca la operación (predictLongRunning), la sigue hasta que termina
 *      (1-4 min), baja el mp4 y lo sube a Supabase.
 *
 * PLATA: se cobra por segundo de video. Cada calidad muestra su costo ANTES de
 * generar, queda registrado en ai_usage (kind='video') y hay tope diario propio
 * (AI_VIDEO_DAILY_BUDGET_USD, default US$5) para que nunca se dispare solo.
 * ========================================================================= */

const config = require('./config');
const pool = require('./db');
const { uploadAsset } = require('./storage');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Calidades ofrecidas en el panel. Precios por segundo de la tarifa pública de
 * Google (ago-2026): lite 720p US$0.05/s, fast 720p US$0.10/s, Veo 3.1 1080p
 * US$0.40/s. Si Google los cambia, se ajustan acá (sólo sirven para MOSTRAR y
 * para el tope de gasto: la factura real la hace Google).
 */
const VEO_QUALITIES = {
  lite: {
    id: 'lite',
    model: 'veo-3.1-lite-generate-preview',
    label: 'Rápido',
    desc: 'El más barato. Ideal para probar ideas y para historias.',
    resolution: '720p',
    usdPerSec: 0.05,
  },
  fast: {
    id: 'fast',
    model: 'veo-3.1-fast-generate-preview',
    label: 'Equilibrado',
    desc: 'Mejor movimiento y detalle por poca diferencia de precio. Recomendado.',
    resolution: '720p',
    usdPerSec: 0.10,
  },
  calidad: {
    id: 'calidad',
    model: 'veo-3.1-generate-preview',
    label: 'Máxima calidad',
    desc: '1080p, el mejor resultado de Veo. Para piezas importantes.',
    resolution: '1080p',
    usdPerSec: 0.40,
  },
};
const QUALITY_ORDER = ['lite', 'fast', 'calidad'];
const DEFAULT_QUALITY = 'fast';
const VALID_DURATIONS = [4, 6, 8];

function hasVeo() {
  return Boolean(config.gemini.apiKey);
}

function normalizeQuality(q) {
  return VEO_QUALITIES[q] ? q : DEFAULT_QUALITY;
}

function normalizeDuration(d) {
  const n = Number(d);
  return VALID_DURATIONS.includes(n) ? n : 8;
}

function estimateVideoCost(quality, duration) {
  const q = VEO_QUALITIES[normalizeQuality(quality)];
  return Number((q.usdPerSec * normalizeDuration(duration)).toFixed(2));
}

/** Calidades + costo estimado, para pintar el selector del panel. */
function listVideoQualities(duration = 8) {
  return QUALITY_ORDER.map((id) => ({
    ...VEO_QUALITIES[id],
    usd: estimateVideoCost(id, duration),
  }));
}

/* ----------------------- tope de gasto diario ----------------------- */

/** Gasto de HOY (día calendario ARG) en videos IA, en USD. Best-effort: 0 si falla. */
async function videoSpendTodayUsd() {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(est_cost_usd), 0)::float AS spent
       FROM ai_usage
       WHERE kind = 'video' AND (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date`,
      [config.timezone]
    );
    return Number(rows[0].spent) || 0;
  } catch (err) {
    console.warn(`[video] No pude leer el gasto de video del día (asumo 0): ${err.message}`);
    return 0;
  }
}

/**
 * Chequea el tope ANTES de arrancar. A diferencia de las imágenes (que caen a
 * plantilla gratis), acá no hay alternativa: si no entra en el presupuesto se
 * corta con un mensaje claro en vez de gastar de más.
 */
async function assertVideoBudget(costUsd) {
  const budget = Number(config.ai.videoDailyBudgetUsd) || 0;
  if (budget <= 0) return; // sin tope configurado
  const spent = await videoSpendTodayUsd();
  if (spent + costUsd > budget) {
    const err = new Error(
      `Tope de gasto diario de video alcanzado: hoy ya se gastaron US$${spent.toFixed(2)} de US$${budget.toFixed(2)}. ` +
      `Probá con una calidad más barata, esperá a mañana o subí AI_VIDEO_DAILY_BUDGET_USD.`
    );
    err.status = 429;
    throw err;
  }
}

async function logVideoUsage({ model, purpose, costUsd }) {
  try {
    await pool.query(
      `INSERT INTO ai_usage (kind, model, purpose, est_cost_usd) VALUES ('video', $1, $2, $3)`,
      [model, purpose, costUsd]
    );
  } catch (err) {
    console.warn('[video] No pude registrar el consumo de video:', err.message);
  }
}

/* ----------------------- prompt corto para la API ----------------------- */

const WORKWEAR_RE = /(bot[ií]n|borceg|puntera|casco|arn[eé]s|mameluco|antiflama|reflectiv|seguridad|grafa|mamelu|delantal|guante)/i;

const API_SCENE = {
  industrial: 'a real workshop / worksite: concrete floor, steel bench, honest wear, no clutter',
  urban: 'a calm urban setting: concrete wall, defocused street, editorial lookbook tone',
};

const API_STYLE = {
  secuencia: {
    label: 'Secuencia (filmmaker)',
    subject: 'the product is revealed in one choreographed continuous move: start on a close detail, then reveal the whole product',
    camera: 'one continuous oner: slow rack focus in, then a gentle crane/tilt up, ending on a clean hero frame',
  },
  lookbook: {
    label: 'Lookbook (con persona)',
    subject: 'a person wears the garment and stays essentially STILL (only fabric and breathing move). The person never works, never uses tools, and the face is never sharp or frontal (frame from the neck down or from behind)',
    camera: 'a slow continuous push-in toward the product, camera on a gimbal, constant speed',
  },
  producto_solo: {
    label: 'Solo el producto',
    subject: 'ONLY the product, no person, no hands, presented with its natural drape',
    camera: 'a slow continuous push-in, or a gentle 20°-max arc around the product',
  },
  macro: {
    label: 'Detalle macro',
    subject: 'an extreme close-up of one REAL detail of the product (weave, seam, zipper, cuff or label) filling the frame. No person',
    camera: 'a macro rack focus gliding across the detail in a single slow pass',
  },
  percha: {
    label: 'En percha',
    subject: 'the garment hanging on a hanger against a clean wall, swaying almost imperceptibly. No person',
    camera: 'a slow vertical tilt-reveal from the hem up to the collar',
  },
  ambiente: {
    label: 'Ambiente (marca)',
    subject: 'the product is the hero of its environment, still and with presence — brand b-roll, more atmosphere than sell. No person in focus',
    camera: 'a locked-off shot with subtle breathing, or a very slow lateral tracking move',
  },
};
const API_STYLE_ORDER = ['secuencia', 'lookbook', 'producto_solo', 'macro', 'percha', 'ambiente'];

function listApiVideoStyles() {
  return API_STYLE_ORDER.map((id) => ({ id, label: API_STYLE[id].label }));
}

/**
 * Prompt CORTO en inglés para la API de Veo (límite real: 480 tokens de entrada).
 * Los prompts largos del modal "Prompt video IA" son para pegar a mano en la app
 * de Gemini; acá se manda lo esencial: producto, fidelidad, escena, cámara, luz,
 * audio. Con foto de primer fotograma la fidelidad se apoya en ESA imagen.
 */
function buildVeoApiPrompt({ productName, productDescription, style = 'secuencia', theme, hasStartImage = true, pillar = 'producto' } = {}) {
  const st = API_STYLE[style] || API_STYLE.secuencia;
  const scene = WORKWEAR_RE.test(productName || '') ? API_SCENE.industrial : API_SCENE.urban;
  const name = productName || 'an Argentine workwear garment';
  const desc = productDescription
    ? String(productDescription).replace(/\s+/g, ' ').slice(0, 140)
    : '';
  const anchor = hasStartImage
    ? `The product is EXACTLY the one in the first frame: identical color, cut, silhouette, stitching and labels for the whole clip. Never add or change seams, zippers, pockets, prints or textures. Zero morphing.`
    : `The product is ${name}${desc ? ` (${desc})` : ''}. Keep it identical for the whole clip, never invent details.`;

  const tone = pillar === 'promo'
    ? 'Commercial tone with contained energy.'
    : pillar === 'marca'
      ? 'Brand tone: atmospheric, a real work moment, not an ad.'
      : 'Premium catalog tone: calm, confident, focused on quality.';

  return [
    `Cinematic product film for BLACKS, an Argentine workwear and safety brand. ONE SINGLE CONTINUOUS TAKE, no edit cuts. ${tone}`,
    `PRODUCT: ${name}${desc ? ` — ${desc}` : ''}. ${anchor}`,
    `SUBJECT: ${st.subject}.`,
    `SCENE: ${theme ? `${String(theme).slice(0, 70)} — ` : ''}${scene}.`,
    `CAMERA: ${st.camera}. No 360 orbits, no whip pans, no jerks.`,
    `LIGHT: soft directional natural light, long shadows, Kodak Portra grade, restrained saturation, subtle film grain.`,
    `AUDIO: soft diegetic ambience only — no music, no voice-over, no hammering or tool hits.`,
    // Cara: una cara reconstruida por IA en primer plano delata el video y no es
    // una persona real de la marca. Siempre de espaldas, de cuello para abajo o
    // fuera de foco. Y nada de texto/marcas inventadas sobre la prenda.
    `FACE: if a person appears, NEVER show a sharp frontal face — frame from the neck down, from behind, turned away or clearly out of focus.`,
    `NO on-screen text, no captions, and NO brand name, lettering, patch or logo on the garment that is not already visible in the first frame.`,
  ].join('\n');
}

const VEO_NEGATIVE = 'on-screen text, captions, subtitles, watermark, invented logo, extra products, morphing, warped hands, cartoon, plastic render look, fast cuts';

/* ----------------------- llamadas a la API ----------------------- */

async function fetchImageAsInline(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//.test(mimeType)) throw new Error(`no es imagen (${mimeType})`);
    return { data: buf.toString('base64'), mimeType: mimeType.split(';')[0] };
  } catch (err) {
    console.warn(`[video] No pude bajar la foto de referencia (${url}): ${err.message}`);
    return null;
  }
}

/**
 * Arranca la generación. Devuelve el nombre de la operación (hay que seguirla).
 * Reintenta sin los campos opcionales si la API los rechaza: los modelos de Veo
 * están en preview y cambian de forma seguido — mejor un video sin
 * negativePrompt que ningún video.
 */
async function startVeoVideo({ prompt, image = null, quality = DEFAULT_QUALITY, duration = 8, aspectRatio = '9:16' }) {
  if (!hasVeo()) {
    const err = new Error('Falta GEMINI_API_KEY: sin ella no se puede generar video con IA.');
    err.status = 400;
    throw err;
  }
  const q = VEO_QUALITIES[normalizeQuality(quality)];
  const dur = normalizeDuration(duration);

  const instance = { prompt };
  if (image) instance.image = { inlineData: { mimeType: image.mimeType, data: image.data } };
  const parameters = {
    aspectRatio,
    resolution: q.resolution,
    durationSeconds: dur,
    negativePrompt: VEO_NEGATIVE,
  };

  const attempts = [
    { instances: [instance], parameters },
    // 2º intento: sin negativePrompt/resolution (los que más cambian entre revisiones).
    { instances: [instance], parameters: { aspectRatio, durationSeconds: dur } },
    // 3º intento: sólo texto (por si la imagen de referencia es la rechazada).
    { instances: [{ prompt }], parameters: { aspectRatio } },
  ];

  let lastError = '';
  for (const [i, body] of attempts.entries()) {
    const res = await fetch(`${GEMINI_BASE}/models/${q.model}:predictLongRunning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.name) {
        if (i > 0) console.warn(`[video] Veo aceptó recién en el intento ${i + 1} (se cayeron parámetros opcionales).`);
        return { operation: data.name, model: q.model, quality: q.id, duration: dur, costUsd: estimateVideoCost(q.id, dur) };
      }
      lastError = `respuesta sin operación: ${JSON.stringify(data).slice(0, 200)}`;
      continue;
    }
    lastError = `${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
    // 400 = forma del pedido; vale reintentar más simple. Otros códigos (401/403/429) no.
    if (res.status !== 400) break;
  }
  const err = new Error(`Veo no aceptó el pedido (${lastError})`);
  err.status = 502;
  throw err;
}

/** Consulta el estado de la operación. { done, uri, error } */
async function pollVeoOperation(operation) {
  const res = await fetch(`${GEMINI_BASE}/${operation.replace(/^\/+/, '')}`, {
    headers: { 'x-goog-api-key': config.gemini.apiKey },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`No pude consultar la operación (${res.status}: ${t.slice(0, 200)})`);
  }
  const data = await res.json();
  if (!data.done) return { done: false };
  if (data.error) return { done: true, error: data.error.message || 'Veo devolvió un error' };

  // La forma exacta cambió entre revisiones del preview: se buscan las variantes conocidas.
  const r = data.response || {};
  const sample =
    (r.generateVideoResponse && r.generateVideoResponse.generatedSamples && r.generateVideoResponse.generatedSamples[0]) ||
    (r.generatedSamples && r.generatedSamples[0]) ||
    (r.generateVideoResponse && r.generateVideoResponse.generatedVideos && r.generateVideoResponse.generatedVideos[0]) ||
    (r.generatedVideos && r.generatedVideos[0]) || null;
  const uri = sample && (
    (sample.video && (sample.video.uri || sample.video.url)) ||
    sample.uri || sample.url || null
  );
  const inline = sample && sample.video && (sample.video.bytesBase64Encoded || sample.video.encodedVideo);
  if (!uri && !inline) {
    const filtered = r.generateVideoResponse && r.generateVideoResponse.raiMediaFilteredReasons;
    return {
      done: true,
      error: filtered && filtered.length
        ? `Veo filtró el video por sus políticas: ${String(filtered[0]).slice(0, 200)}`
        : `Veo terminó pero no devolvió el video (${JSON.stringify(r).slice(0, 200)})`,
    };
  }
  return { done: true, uri, inline };
}

/** Baja el mp4 generado (la URL de Veo pide la API key por header). */
async function downloadVeoVideo(uri) {
  const res = await fetch(uri, { headers: { 'x-goog-api-key': config.gemini.apiKey }, redirect: 'follow' });
  if (!res.ok) throw new Error(`No pude bajar el video (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('El video descargado vino vacío');
  return buf;
}

/* ----------------------- cola de trabajos ----------------------- */
/**
 * Un video tarda 1-4 minutos: la petición HTTP del panel no puede esperar eso.
 * El trabajo queda en la tabla video_jobs (sobrevive a un reinicio de Render) y
 * un loop lo sigue hasta que termina. El panel pregunta por el estado.
 */

const POLL_EVERY_MS = 15 * 1000;
const MAX_POLL_MIN = 12;
const running = new Set();

async function createVideoJob({ assetId = null, studioProductIds = null, prompt, imageUrl, quality, duration, aspectRatio, format = 'story', productNames = null, style = 'secuencia' }) {
  const cost = estimateVideoCost(quality, duration);
  await assertVideoBudget(cost);

  const image = await fetchImageAsInline(imageUrl);
  const started = await startVeoVideo({ prompt, image, quality, duration, aspectRatio });

  const { rows } = await pool.query(
    `INSERT INTO video_jobs (asset_id, studio_product_ids, operation, model, quality, duration_sec, aspect_ratio,
                             format, prompt, product_names, style, est_cost_usd, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'running') RETURNING *`,
    [assetId, studioProductIds, started.operation, started.model, started.quality, started.duration, aspectRatio,
      format, prompt, productNames, style, started.costUsd]
  );
  const job = rows[0];
  // El costo se registra al ARRANCAR: Google cobra la generación aunque después
  // falle la descarga, así que el tope diario tiene que verlo desde ya.
  await logVideoUsage({ model: started.model, purpose: assetId ? `reel:${assetId}` : 'estudio', costUsd: started.costUsd });
  watchJob(job.id);
  return job;
}

function watchJob(jobId) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const startedAt = Date.now();

  const tick = async () => {
    try {
      const { rows } = await pool.query('SELECT * FROM video_jobs WHERE id = $1', [jobId]);
      const job = rows[0];
      if (!job || job.status !== 'running') { running.delete(jobId); return; }

      if (Date.now() - startedAt > MAX_POLL_MIN * 60 * 1000) {
        await failJob(jobId, `El video tardó más de ${MAX_POLL_MIN} minutos. Puede que siga generándose en Google; probá de nuevo.`);
        running.delete(jobId);
        return;
      }

      const state = await pollVeoOperation(job.operation);
      if (!state.done) { setTimeout(tick, POLL_EVERY_MS); return; }
      if (state.error) { await failJob(jobId, state.error); running.delete(jobId); return; }

      const buffer = state.inline
        ? Buffer.from(state.inline, 'base64')
        : await downloadVeoVideo(state.uri);
      const filename = `reels/veo-${job.asset_id || 'studio'}-${Date.now()}.mp4`;
      const url = await uploadAsset({ buffer, filename, contentType: 'video/mp4' });

      if (job.asset_id) {
        await pool.query('UPDATE generated_assets SET video_path = $2, updated_at = now() WHERE id = $1', [job.asset_id, url]);
      } else {
        await pool.query(
          `INSERT INTO studio_assets (kind, path, prompt, product_ids, product_names, format, est_cost_usd)
           VALUES ('video', $1, $2, $3, $4, $5, $6)`,
          [url, job.prompt, job.studio_product_ids, job.product_names, job.format, job.est_cost_usd]
        );
      }
      await pool.query(
        `UPDATE video_jobs SET status = 'done', video_path = $2, updated_at = now() WHERE id = $1`,
        [jobId, url]
      );
      console.log(`[video] Video listo (job ${jobId}, ${(buffer.length / 1e6).toFixed(1)} MB): ${url}`);
      running.delete(jobId);
    } catch (err) {
      console.warn(`[video] Error siguiendo el job ${jobId}: ${err.message}`);
      // Un error de red puntual no debería matar el trabajo: se reintenta salvo
      // que ya se haya pasado de tiempo.
      if (Date.now() - startedAt > MAX_POLL_MIN * 60 * 1000) {
        await failJob(jobId, err.message);
        running.delete(jobId);
      } else {
        setTimeout(tick, POLL_EVERY_MS);
      }
    }
  };
  setTimeout(tick, POLL_EVERY_MS);
}

async function failJob(jobId, message) {
  await pool.query(
    `UPDATE video_jobs SET status = 'error', error = $2, updated_at = now() WHERE id = $1`,
    [jobId, String(message).slice(0, 500)]
  ).catch(() => {});
  console.warn(`[video] Job ${jobId} falló: ${message}`);
}

/** Trabajos en curso/recientes (para el panel). */
async function listVideoJobs({ assetId = null, limit = 20 } = {}) {
  const { rows } = await pool.query(
    assetId
      ? `SELECT * FROM video_jobs WHERE asset_id = $1 ORDER BY id DESC LIMIT $2`
      : `SELECT * FROM video_jobs ORDER BY id DESC LIMIT $1`,
    assetId ? [assetId, limit] : [limit]
  );
  return rows;
}

/** Al arrancar el server, retoma los trabajos que quedaron a medio camino. */
async function resumeVideoJobs() {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM video_jobs WHERE status = 'running' AND created_at > now() - interval '30 minutes'`
    );
    // Los que quedaron colgados hace rato se marcan como error para no dejar el
    // panel esperando para siempre.
    await pool.query(
      `UPDATE video_jobs SET status = 'error', error = 'El servidor se reinició mientras se generaba.', updated_at = now()
       WHERE status = 'running' AND created_at <= now() - interval '30 minutes'`
    );
    rows.forEach((r) => watchJob(r.id));
    if (rows.length) console.log(`[video] Retomando ${rows.length} generación(es) de video en curso.`);
  } catch (err) {
    // Sin migrar todavía (tabla inexistente): no es motivo para no arrancar.
    if (!/video_jobs/.test(err.message)) console.warn('[video] No pude retomar trabajos:', err.message);
  }
}

module.exports = {
  hasVeo,
  VEO_QUALITIES,
  listVideoQualities,
  listApiVideoStyles,
  estimateVideoCost,
  normalizeQuality,
  normalizeDuration,
  buildVeoApiPrompt,
  createVideoJob,
  listVideoJobs,
  resumeVideoJobs,
  videoSpendTodayUsd,
};
