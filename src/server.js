const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const pool = require('./db');
const { seedCalendar, calendarIsEmpty } = require('./calendar');
const { generateForSlot, VALID_TEMPLATES, regenerateSlide, correctPiece } = require('../scripts/generate-daily');
const { generateDaily } = require('../scripts/generate-daily');
const { publishAssetById, publishDailyAuto, getPublishQueueStatus, cancelQueuedForAsset, cancelQueuedForCalendar } = require('./publishService');
const { syncPostInsights, analyzePerformance } = require('./insights');
const { getBrandProfile } = require('./brandProfile');
const { uploadAsset } = require('./storage');
const styleService = require('./styleService');
const { importDriveFolder } = require('./driveService');
const { analyzeAccountPerformance } = require('./accountAnalyzer');
const { hasGemini, buildVideoPrompt, buildVideoPromptSet, analyzeSectionFunnel } = require('./ai');
const { sectionReport } = require('./sectionAnalysis');
const { buildSectionReportHtml } = require('./sectionReportHtml');
const { transcribeVideo } = require('./transcribe');
const { getWholesaleSettings, saveWholesaleSettings } = require('./wholesale');
const { syncCompanyInfo, getCompanyFacts } = require('./companyInfo');
const { listCommercialDates } = require('./commercialDates');
const { notifyPublishResult, notifyWeeklyReport } = require('./notifier');
const { generateMonthlyPlan, getPlan, nextPlannableMonth } = require('./planner');
const { buildInterest } = require('./productInterest');
const { buildLayout } = require('./homeLayout');
const { getRails, getRailsConfig, saveRailsConfig, validateConfig, buildPayload,
  invalidate: invalidateRails, RULES, SPECIAL_RULES, SLOT_IDS, LAYOUTS } = require('./homeRails');

const app = express();
app.use(express.json({ limit: '2mb' }));

/* ----------------------- Login del panel ----------------------- */
// Si DASHBOARD_PASSWORD está seteada, todo el panel y la API piden sesión
// (cookie firmada, stateless). Sin la variable, se comporta como antes (abierto).
const SESSION_COOKIE = 'blacks_session';

function sessionToken() {
  return crypto
    .createHmac('sha256', `${config.dashboardPassword}::${config.cronSecret}`)
    .update('blacks-dashboard-v1')
    .digest('hex');
}

function hasValidSession(req) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return false;
  const value = match.slice(SESSION_COOKIE.length + 1);
  const expected = sessionToken();
  return value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

app.post('/api/login', (req, res) => {
  if (!config.dashboardPassword) return res.json({ ok: true });
  const { password } = req.body || {};
  if (!password || password !== config.dashboardPassword) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  const maxAge = 30 * 24 * 60 * 60; // 30 días
  const secure = config.publicBaseUrl.startsWith('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionToken()}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (!config.dashboardPassword) return next();
  // Las llama la TIENDA (otro dominio), no el panel: no pueden pedir sesión.
  // /api/home/rails es de sólo lectura y devuelve lo mismo que ya se ve en la
  // vidriera pública (nombre, foto, precio y stock), así que no expone nada.
  // /api/tiendanube/oauth/callback lo llama TIENDANUBE redirigiendo al dueño
  // de la tienda: tampoco puede pedir sesión del panel. Va protegido con su
  // propio "state" de un solo uso (ver más abajo).
  const open = ['/health', '/api/health', '/api/login', '/login.html', '/favicon.ico',
    '/api/leads/click', '/api/home/rails', '/api/tiendanube/oauth/callback'];
  if (open.includes(req.path) || req.path.startsWith('/api/cron/')) return next(); // cron tiene su propio secret
  if (hasValidSession(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión requerida.', needLogin: true });
  return res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadVideo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120 * 1024 * 1024 } });

// Envuelve handlers async para que cualquier rechazo caiga en el middleware de errores
// (evita 500s "colgados" y promesas sin manejar).
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function textOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function boolOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(String(value).toLowerCase());
}

function assertOneOf(name, value, allowed) {
  if (value === undefined || value === null) return;
  if (!allowed.includes(value)) {
    const err = new Error(`${name} inválido. Valores permitidos: ${allowed.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

function assertDate(value) {
  if (value === undefined || value === null) return;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) {
    const err = new Error('scheduled_date inválida. Usá formato YYYY-MM-DD.');
    err.status = 400;
    throw err;
  }
}

function assertTime(value) {
  if (value === undefined || value === null) return;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const err = new Error('scheduled_time inválida. Usá formato HH:MM (00:00 a 23:59).');
    err.status = 400;
    throw err;
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// --- Health check (Render y monitoreo) ---
app.get(['/health', '/api/health'], wrap(async (req, res) => {
  let db = 'ok';
  try { await pool.query('SELECT 1'); } catch (e) { db = 'error: ' + e.message; }
  res.json({
    ok: db === 'ok',
    db,
    ai: hasGemini() ? 'gemini' : (config.groq.apiKey ? 'groq' : 'none'),
    aiImages: config.ai.useAiImages,
    timezone: config.timezone,
    time: new Date().toISOString(),
  });
}));

// --- Config para el panel (qué está activo) ---
app.get('/api/config', (req, res) => {
  const { currentImagePriceUsd } = require('./ai');
  res.json({
    ai: hasGemini() ? 'gemini' : (config.groq.apiKey ? 'groq' : 'none'),
    aiImages: config.ai.useAiImages,
    // Precio estimado por imagen IA del modelo configurado: el panel lo muestra
    // ANTES de generar. El copy/plan es gratis (tier free de Gemini/Groq).
    imageCostUsd: currentImagePriceUsd(),
    geminiReady: hasGemini(),
    autoPublishPillars: config.meta.autoPublishPillars,
    metaReady: Boolean(config.meta.igUserId && config.meta.pageAccessToken),
    timezone: config.timezone,
    brand: config.brand.name,
  });
});

/* ----------------------- Cron (GitHub Actions) ----------------------- */
function authCron(req, res, next) {
  const authHeader = req.headers['authorization'];
  const cronHeader = req.headers['x-cron-secret'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : cronHeader;
  if (!token || token !== config.cronSecret) {
    return res.status(401).json({ error: 'Acceso no autorizado. CRON_SECRET inválido.' });
  }
  next();
}

app.post('/api/cron/generate-daily', authCron, wrap(async (req, res) => {
  res.json({ ok: true, ...(await generateDaily()) });
}));

app.post('/api/cron/publish-daily', authCron, wrap(async (req, res) => {
  const result = await publishDailyAuto();
  await notifyPublishResult(result).catch(() => {});
  res.json({ ok: true, ...result });
}));

app.post('/api/cron/sync-insights', authCron, wrap(async (req, res) => {
  await syncPostInsights();
  const report = await analyzePerformance().catch(() => null);
  if (report) await notifyWeeklyReport(report).catch(() => {});
  res.json({ ok: true });
}));

// Refresca los datos verificados de la empresa desde la web oficial (cron semanal).
app.post('/api/cron/sync-company-info', authCron, wrap(async (req, res) => {
  res.json({ ok: true, ...(await syncCompanyInfo()) });
}));

app.get('/api/publish-queue', wrap(async (req, res) => {
  res.json(await getPublishQueueStatus({ limit: req.query.limit }));
}));

// Tareas en segundo plano, para el panel: qué está procesándose ahora mismo
// (videos de Reels que renderiza GitHub Actions, subtítulos en cola, cola de
// publicación). El frontend lo pollea y muestra un indicador en la barra superior.
app.get('/api/background-tasks', wrap(async (req, res) => {
  const [reels, edits, publish] = await Promise.all([
    pool.query(
      `SELECT a.id, c.scheduled_date, c.theme_title, c.pillar_detail
       FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
       WHERE c.post_type = 'reel' AND a.video_path IS NULL AND a.status NOT IN ('discarded')
       ORDER BY c.scheduled_date LIMIT 20`
    ),
    pool.query(
      `SELECT a.id, a.edit_status, c.scheduled_date, c.theme_title, c.pillar_detail
       FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
       WHERE a.edit_status IN ('queued', 'processing')
       ORDER BY a.updated_at DESC LIMIT 20`
    ),
    getPublishQueueStatus({ limit: 10 }),
  ]);
  // Videos que Veo está generando ahora mismo (tardan 1-4 min).
  const videos = await pool.query(
    `SELECT v.id, v.asset_id, v.status, v.quality, v.est_cost_usd, v.created_at, v.product_names,
            c.theme_title, c.pillar_detail
     FROM video_jobs v
     LEFT JOIN generated_assets a ON a.id = v.asset_id
     LEFT JOIN content_calendar c ON c.id = a.calendar_id
     WHERE v.status = 'running' ORDER BY v.id DESC LIMIT 10`
  ).catch(() => ({ rows: [] })); // tabla nueva: si todavía no migraron, no rompe el panel
  const summary = publish.summary || {};
  const publishActive = (summary.queued || 0) + (summary.processing || 0);
  res.json({
    // Reels sin video: ya no son una tarea automática (esperan que subas el video
    // generado en Gemini/Veo), así que no cuentan como "en proceso".
    reels: reels.rows,
    edits: edits.rows,
    videos: videos.rows,
    publish,
    active: edits.rows.length + publishActive + videos.rows.length,
    failed: summary.failed || 0,
  });
}));

// Check liviano para que el cron de GitHub Actions (cada 30 min) no gaste minutos
// instalando dependencias cuando no hay nada que renderizar.
// OJO: los Reels ya NO se auto-renderizan desde la imagen (el video estático con
// zoom no se publica más) — sólo cuentan las ediciones de subtítulos encoladas.
app.get('/api/cron/has-pending-renders', authCron, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM generated_assets
             WHERE edit_status = 'queued' AND video_path IS NOT NULL)::int AS edits`
  );
  const { edits } = rows[0];
  res.json({ pending: edits > 0, reels: 0, edits });
}));

/* ----------------------- Calendario ----------------------- */
app.get('/api/calendar', wrap(async (req, res) => {
  const days = Math.min(Number(req.query.days || 14), 60);
  // Días hacia atrás: nada se borra de la base cuando una pieza no se publica
  // (por ej. se pasó la ventana horaria) — sólo queda fuera de la vista por defecto
  // porque normalmente sólo interesa hoy en adelante. Con `back` se puede pedir
  // días anteriores sin costo extra: es la misma fila que ya estaba guardada.
  const back = Math.min(Math.max(Number(req.query.back) || 0, 0), 90);

  // Sólo sembramos si el calendario está vacío (no en cada carga: eso era lento).
  if (await calendarIsEmpty()) await seedCalendar(days);

  const { rows } = await pool.query(
    `SELECT c.*,
            a.id as asset_id, a.caption, a.hashtags, a.cta, a.image_path, a.video_path,
            a.meta_post_id, a.status as asset_status, a.format as asset_format, a.slides, a.slides_meta,
            a.edited_video_path, a.edit_status, a.voiceover_path, a.est_cost_usd, a.gen_model, a.qa_notes, a.sticker,
            p.name as product_name, p.image_url as product_image_url, p.price as product_price, p.stock as product_stock,
            fp.name as forced_product_name, fp.image_url as forced_product_image_url,
            COALESCE(cd.events, '[]'::json) AS commercial_dates,
            pq.status as queue_status, pq.last_error as queue_error
     FROM content_calendar c
     LEFT JOIN LATERAL (
       -- Preferí la última versión NO descartada; sólo si TODAS están descartadas
       -- mostramos la descartada (para poder regenerar). Antes tomaba la última por id
       -- sin filtrar y un descarte tapaba la versión buena.
       SELECT * FROM generated_assets WHERE calendar_id = c.id
       ORDER BY (status <> 'discarded') DESC, id DESC LIMIT 1
     ) a ON true
     LEFT JOIN products_cache p ON p.id = a.product_id
     LEFT JOIN products_cache fp ON fp.id = c.forced_product_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'id', d.id,
         'event_date', d.event_date,
         'title', d.title,
         'category', d.category,
         'angle', d.angle,
         'priority', d.priority,
         'source', d.source
       ) ORDER BY d.priority DESC, d.id) AS events
       FROM commercial_dates d
       WHERE d.event_date = c.scheduled_date
     ) cd ON true
     LEFT JOIN LATERAL (
       SELECT status, last_error FROM publish_queue WHERE asset_id = a.id ORDER BY id DESC LIMIT 1
     ) pq ON true
     WHERE c.scheduled_date >= CURRENT_DATE - ($2 || ' days')::interval
       AND c.scheduled_date < CURRENT_DATE + ($1 || ' days')::interval
     ORDER BY c.scheduled_date ASC, c.id ASC
     LIMIT 500`,
    [days, back]
  );
  res.json(rows);
}));

// Re-siembra manual del calendario.
app.post('/api/calendar/seed', wrap(async (req, res) => {
  const days = Math.min(Number(req.body && req.body.days) || 14, 60);
  const inserted = await seedCalendar(days);
  res.json({ ok: true, inserted: inserted.length });
}));

app.post('/api/calendar', wrap(async (req, res) => {
  const body = req.body || {};
  const scheduledDate = textOrNull(body.scheduled_date);
  const postType = textOrNull(body.post_type) || 'feed';
  const format = textOrNull(body.format) || (postType === 'feed' ? 'feed' : 'story');
  const pillar = textOrNull(body.pillar) || 'producto';
  const automationLevel = textOrNull(body.automation_level) || 'auto';
  const status = textOrNull(body.status) || (pillar === 'repost' ? 'skipped' : 'pending');
  const scheduledTime = textOrNull(body.scheduled_time);

  assertDate(scheduledDate);
  assertTime(scheduledTime);
  assertOneOf('post_type', postType, ['feed', 'story', 'reel']);
  assertOneOf('format', format, ['feed', 'story']);
  assertOneOf('automation_level', automationLevel, ['auto', 'semi']);
  assertOneOf('status', status, ['pending', 'draft', 'approved', 'published', 'skipped']);

  if (!scheduledDate) return res.status(400).json({ error: 'Falta scheduled_date.' });
  const forcedProductId = intParam(body.product_id);
  const { rows } = await pool.query(
    `INSERT INTO content_calendar
       (scheduled_date, platform, post_type, format, pillar, pillar_detail, automation_level,
        interaction_hint, scheduled_time, theme_title, carousel, status, origin, forced_product_id)
     VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual', $12)
     RETURNING *`,
    [
      scheduledDate,
      postType,
      format,
      pillar,
      textOrNull(body.pillar_detail),
      automationLevel,
      textOrNull(body.interaction_hint),
      scheduledTime,
      textOrNull(body.theme_title),
      Boolean(boolOrNull(body.carousel)),
      status,
      forcedProductId,
    ]
  );
  res.json({ ok: true, slot: rows[0] });
}));

app.patch('/api/calendar/:calendarId', wrap(async (req, res) => {
  const id = intParam(req.params.calendarId);
  if (!id) return res.status(400).json({ error: 'calendarId inválido' });
  const body = req.body || {};

  const values = {
    scheduled_date: textOrNull(body.scheduled_date),
    post_type: textOrNull(body.post_type),
    format: textOrNull(body.format),
    pillar: textOrNull(body.pillar),
    pillar_detail: textOrNull(body.pillar_detail),
    automation_level: textOrNull(body.automation_level),
    interaction_hint: textOrNull(body.interaction_hint),
    scheduled_time: textOrNull(body.scheduled_time),
    theme_title: textOrNull(body.theme_title),
    status: textOrNull(body.status),
    carousel: boolOrNull(body.carousel),
    objective: textOrNull(body.objective),
    // undefined = no tocar; null/vacío = desfijar el producto; número = fijarlo.
    forced_product_id: body.product_id === undefined ? undefined : (intParam(body.product_id) || null),
  };

  assertDate(values.scheduled_date);
  assertTime(values.scheduled_time);
  assertOneOf('post_type', values.post_type, ['feed', 'story', 'reel']);
  assertOneOf('format', values.format, ['feed', 'story']);
  assertOneOf('automation_level', values.automation_level, ['auto', 'semi']);
  assertOneOf('status', values.status, ['pending', 'draft', 'approved', 'published', 'skipped']);
  assertOneOf('objective', values.objective, ['venta', 'trafico', 'confianza', 'comunidad']);

  const allowed = Object.keys(values).filter((key) => values[key] !== undefined);
  if (!allowed.length) return res.status(400).json({ error: 'No hay campos para actualizar.' });
  const sets = allowed.map((key, i) => `${key} = $${i + 2}`);
  const params = [id, ...allowed.map((key) => values[key])];
  const { rows } = await pool.query(
    `UPDATE content_calendar SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'No existe ese slot de calendario.' });
  // Pausar el slot (skipped) cancela cualquier publicación pendiente de sus piezas.
  if (values.status === 'skipped') await cancelQueuedForCalendar(id).catch(() => {});
  res.json({ ok: true, slot: rows[0] });
}));

// Google Analytics de la tienda (cache 1 h: GA no hace falta consultarlo en cada carga).
let gaCache = { data: null, at: 0 };
app.get('/api/analytics/summary', wrap(async (req, res) => {
  const { topViewedWithRealSales, isEnabled } = require('./analytics');
  if (!isEnabled()) return res.json({ enabled: false });
  if (!gaCache.data || Date.now() - gaCache.at > 60 * 60 * 1000) {
    gaCache = { data: await topViewedWithRealSales(pool), at: Date.now() };
  }
  res.json({ enabled: true, ...gaCache.data });
}));

// Vistas de producto (Google Analytics) desglosadas Mayorista vs Minorista, para
// comparar qué mira el público en cada sección de la tienda. Cache 1h como el resto.
let segmentViewsCache = { data: null, at: 0 };
app.get('/api/analytics/views-by-segment', wrap(async (req, res) => {
  const { productViewsBySegment, isEnabled } = require('./analytics');
  if (!isEnabled()) return res.json({ enabled: false });
  if (!segmentViewsCache.data || Date.now() - segmentViewsCache.at > 60 * 60 * 1000) {
    segmentViewsCache = { data: await productViewsBySegment(pool), at: Date.now() };
  }
  if (!segmentViewsCache.data) return res.json({ enabled: false });
  res.json({ enabled: true, ...segmentViewsCache.data });
}));

// Consumo de imágenes IA del mes (estimado en USD) + proyección a fin de mes.
/* Modelo de imagen elegido desde el panel (calidad vs. costo por pieza). */
app.get('/api/settings/image-model', wrap(async (req, res) => {
  const { IMAGE_MODEL_OPTIONS } = require('./settings');
  res.json({ current: config.gemini.imageModel, options: IMAGE_MODEL_OPTIONS });
}));

app.post('/api/settings/image-model', wrap(async (req, res) => {
  const { setImageModel } = require('./settings');
  const model = await setImageModel((req.body || {}).model);
  res.json({ ok: true, current: model });
}));

app.get('/api/ai-usage', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS images, COALESCE(SUM(est_cost_usd), 0)::numeric(10,2) AS usd,
            COALESCE(MIN(created_at), now()) AS since
     FROM ai_usage WHERE kind = 'image' AND created_at >= date_trunc('month', now())`
  );
  const { rows: byModel } = await pool.query(
    `SELECT model, COUNT(*)::int AS images, COALESCE(SUM(est_cost_usd), 0)::numeric(10,2) AS usd
     FROM ai_usage WHERE kind = 'image' AND created_at >= date_trunc('month', now())
     GROUP BY model ORDER BY usd DESC`
  );
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const usd = Number(rows[0].usd);
  const projection = dayOfMonth >= 2 ? Number(((usd / dayOfMonth) * daysInMonth).toFixed(2)) : null;
  // Tope de gasto diario: cuánto va gastado HOY contra el techo configurado
  // (AI_IMAGE_DAILY_BUDGET_USD). Al llegar al tope, el pipeline sigue con plantilla.
  const { imageSpendTodayUsd } = require('./ai');
  const todayUsd = Number((await imageSpendTodayUsd().catch(() => 0)).toFixed(2));
  res.json({
    month: now.toISOString().slice(0, 7), images: rows[0].images, usd, projection, byModel,
    enabled: config.ai.useAiImages,
    today_usd: todayUsd,
    daily_budget_usd: Number(config.ai.imageDailyBudgetUsd) || null,
    budget_reached: Boolean(config.ai.imageDailyBudgetUsd) && todayUsd >= Number(config.ai.imageDailyBudgetUsd),
  });
}));

app.get('/api/commercial-dates', wrap(async (req, res) => {
  res.json(await listCommercialDates({ from: req.query.from, to: req.query.to }));
}));

/* ----------------------- Planner mensual IA ----------------------- */
app.get('/api/plan', wrap(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const plan = await getPlan(month);
  res.json(plan || { month, plan: null });
}));

app.post('/api/plan/generate', wrap(async (req, res) => {
  const body = req.body || {};
  const month = /^\d{4}-\d{2}$/.test(body.month || '') ? body.month : await nextPlannableMonth();
  const summary = await generateMonthlyPlan({ month });
  res.json({ ok: true, ...summary });
}));

// Cron mensual (día 25): deja armado el plan del mes siguiente.
app.post('/api/cron/generate-plan', authCron, wrap(async (req, res) => {
  const month = await nextPlannableMonth();
  res.json({ ok: true, ...(await generateMonthlyPlan({ month })) });
}));

/* ----------------------- Insights / Productos ----------------------- */
app.get('/api/insights/report', wrap(async (req, res) => {
  res.json(await analyzePerformance());
}));

/* ----------------------- Análisis de sección (rutas del sitio) -----------------------
 * Un informe comparado de UNA sección (/mayorista, /eshop…) entre dos períodos, con el
 * diagnóstico opcional de la IA. Nació de una pregunta que el panel no podía contestar:
 * julio tuvo el doble de visitas en /mayorista y menos consultas — ¿por qué?
 * Cache de 10 min por combinación: son ~17 consultas a Analytics por informe. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sectionCache = new Map();

function sectionParams(q) {
  const prefix = String(q.prefix || '/mayorista').trim();
  if (!/^\/[a-z0-9\-/_]*$/i.test(prefix)) throw new Error('La ruta de la sección no es válida (ej: /mayorista).');
  const dates = ['from', 'to', 'cmpFrom', 'cmpTo'].map((k) => String(q[k] || '').trim());
  if (!dates.every((d) => DATE_RE.test(d))) throw new Error('Faltan fechas (formato AAAA-MM-DD): from, to, cmpFrom, cmpTo.');
  const [from, to, cmpFrom, cmpTo] = dates;
  if (from > to || cmpFrom > cmpTo) throw new Error('El período termina antes de empezar.');
  return {
    prefix,
    current: { start: from, end: to, label: String(q.label || '').slice(0, 40) || undefined },
    previous: { start: cmpFrom, end: cmpTo, label: String(q.cmpLabel || '').slice(0, 40) || undefined },
  };
}

async function cachedSectionReport(q) {
  const params = sectionParams(q);
  const key = JSON.stringify(params);
  const hit = sectionCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const data = await sectionReport(params);
  sectionCache.set(key, { data, at: Date.now() });
  if (sectionCache.size > 20) sectionCache.delete(sectionCache.keys().next().value);
  return data;
}

app.get('/api/analysis/section', wrap(async (req, res) => {
  res.json(await cachedSectionReport(req.query));
}));

/* EMBUDOS: el recorrido completo, mayorista y minorista, con la caída de cada paso.
 * Comparte los mismos parámetros de fecha que el informe de sección. */
app.get('/api/analysis/embudo', wrap(async (req, res) => {
  const { siteFunnels } = require('./funnelAnalysis');
  const params = sectionParams(req.query);
  res.json(await siteFunnels({ ...params }));
}));

/* Qué se está midiendo, qué está llegando AHORA y qué significa cada evento.
 * Existe porque los eventos nuevos tardan hasta 48 h en aparecer en los informes
 * normales de GA4: sin la vista en tiempo real parece que no funcionan cuando en
 * realidad ya están entrando. */
app.get('/api/analysis/eventos', wrap(async (req, res) => {
  const { runRealtimeReport, runReport, isEnabled: gaOn } = require('./analytics');
  const { EVENT_CATALOG, OWN_EVENTS, CUSTOM_DIMENSIONS } = require('./eventCatalog');
  if (!gaOn()) return res.json({ enabled: false, reason: 'Google Analytics no está configurado.' });

  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const count = (rep) => {
    const out = {};
    for (const r of (rep && rep.rows) || []) out[r.dimensionValues[0].value] = Number(r.metricValues[0].value);
    return out;
  };

  const [rt, hist] = await Promise.all([
    runRealtimeReport({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 50 })
      .then(count).catch(() => null),
    runReport({
      dateRanges: [{ startDate: desde, endDate: hoy }],
      dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 50,
    }).then(count).catch(() => ({})),
  ]);

  // ¿Están declaradas las dimensiones personalizadas? Se prueba una: si GA no la
  // conoce, responde con error y sabemos que falta registrarlas todas.
  let dimensionsReady = true;
  let dimensionsError = null;
  try {
    await runReport({
      dateRanges: [{ startDate: desde, endDate: hoy }],
      dimensions: [{ name: 'customEvent:lead_type' }], metrics: [{ name: 'eventCount' }], limit: 1,
    });
  } catch (e) { dimensionsReady = false; dimensionsError = e.message; }

  const eventos = EVENT_CATALOG.map((e) => ({
    ...e,
    ahora: rt ? (rt[e.event] || 0) : null,
    periodo: hist[e.event] || 0,
  }));
  const propiosAhora = OWN_EVENTS.filter((n) => rt && rt[n]).length;
  const propiosPeriodo = OWN_EVENTS.filter((n) => hist[n]).length;

  res.json({
    enabled: true,
    realtimeOk: Boolean(rt),
    ventana: { desde, hasta: hoy, dias: days },
    eventos,
    resumen: {
      propios: OWN_EVENTS.length,
      llegandoAhora: propiosAhora,
      consolidados: propiosPeriodo,
      // El caso típico al día siguiente de publicar: entran en vivo pero los
      // informes todavía no los muestran.
      esperandoConsolidacion: propiosAhora > 0 && propiosPeriodo === 0,
    },
    dimensiones: {
      ok: dimensionsReady,
      error: dimensionsError,
      lista: CUSTOM_DIMENSIONS,
      comoRegistrar: 'GA4 > Administrar > Definiciones personalizadas > Crear dimensión personalizada. Ámbito: Evento. El "nombre del parámetro" tiene que escribirse exactamente igual que en la lista. GA4 sólo procesa desde el momento en que se crean: no es retroactivo.',
    },
  });
}));

// Estado de las tres fuentes del informe, en castellano y con el paso que falta.
// Sirve para no tener que adivinar por qué un panel aparece vacío.
app.get('/api/analysis/conexiones', wrap(async (req, res) => {
  const { isEnabled: gaOn, runReport } = require('./analytics');
  const { searchReport } = require('./searchConsole');
  const { adsReport } = require('./googleAds');
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const rango = { start: hace7, end: hoy };

  const analytics = gaOn()
    ? await runReport({ dateRanges: [{ startDate: hace7, endDate: hoy }], metrics: [{ name: 'sessions' }] })
      .then((r) => ({ ok: true, detalle: `${((r.rows || [])[0] || { metricValues: [{ value: 0 }] }).metricValues[0].value} sesiones en los últimos 7 días` }))
      .catch((e) => ({ ok: false, detalle: e.message }))
    : { ok: false, detalle: 'Falta GA_PROPERTY_ID o GA_CREDENTIALS_B64.' };

  const gsc = await searchReport({ prefix: '/', current: rango, previous: rango })
    .then((r) => (r.enabled
      ? { ok: true, detalle: `${r.totals.current.impressions} apariciones en Google en los últimos 7 días` }
      : { ok: false, detalle: r.reason }))
    .catch((e) => ({ ok: false, detalle: e.message }));

  const ads = await adsReport({ current: rango, previous: rango })
    .then((r) => (r.enabled
      ? { ok: true, detalle: `${r.campaigns.length} campañas con actividad · gastó ${r.currency} ${r.totals.cost} en 7 días` }
      : { ok: false, detalle: r.reason }))
    .catch((e) => ({ ok: false, detalle: e.message }));

  res.json({ analytics, searchConsole: gsc, googleAds: ads });
}));

// El diagnóstico se pide aparte (cuesta una llamada al modelo y tarda ~15 s): el informe
// con los números se ve al instante y la explicación se pide cuando hace falta.
app.post('/api/analysis/section/ai', wrap(async (req, res) => {
  const report = await cachedSectionReport({ ...req.query, ...req.body });
  const businessContext = typeof req.body?.businessContext === 'string' ? req.body.businessContext : '';
  const analysis = await analyzeSectionFunnel({ report, businessContext });
  res.json({ ok: true, analysis });
}));

// Informe descargable (HTML autocontenido, para mandar al equipo o imprimir en PDF).
app.get('/api/analysis/section/export', wrap(async (req, res) => {
  const report = await cachedSectionReport(req.query);
  let analysis = null;
  if (req.query.ai === '1') {
    analysis = await analyzeSectionFunnel({ report, businessContext: String(req.query.context || '') }).catch(() => null);
  }
  const name = `informe-${report.prefix.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'sitio'}-${report.current.start}_${report.current.end}.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buildSectionReportHtml(report, analysis));
}));

/* ----------------------- Meta Ads (pauta) ----------------------- */
// Gasto, compras y ROAS de la cuenta publicitaria (últimos 30 días). Cache 1 h.
// Best-effort: sin META_AD_ACCOUNT_ID o sin permiso ads_read devuelve enabled:false
// y el panel simplemente no muestra la sección.
let adsCache = { data: null, at: 0 };
app.get('/api/metrics/ads', wrap(async (req, res) => {
  const { adAccountId, adsAccessToken, apiVersion } = config.meta;
  if (!adAccountId || !adsAccessToken) return res.json({ enabled: false });
  if (adsCache.data && Date.now() - adsCache.at < 60 * 60 * 1000) return res.json(adsCache.data);

  const url = `https://graph.facebook.com/${apiVersion}/${adAccountId}/insights` +
    `?fields=spend,impressions,clicks,actions,action_values,account_name,account_currency` +
    `&date_preset=last_30d&access_token=${encodeURIComponent(adsAccessToken)}`;
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    console.warn('[server] Meta Ads insights falló:', data.error ? data.error.message : r.status);
    return res.json({ enabled: false, error: data.error ? data.error.message : `HTTP ${r.status}` });
  }

  const row = (data.data && data.data[0]) || null;
  const act = (arr, type) => {
    const f = (arr || []).find((a) => a.action_type === type);
    return f ? Number(f.value) : 0;
  };
  // omni_purchase agrega todas las compras (pixel + tienda); si no está, caemos al pixel.
  const purchases = row ? (act(row.actions, 'omni_purchase') || act(row.actions, 'offsite_conversion.fb_pixel_purchase')) : 0;
  const revenue = row ? (act(row.action_values, 'omni_purchase') || act(row.action_values, 'offsite_conversion.fb_pixel_purchase')) : 0;
  const spend = row ? Number(row.spend || 0) : 0;
  const clicks = row ? Number(row.clicks || 0) : 0;

  const out = {
    enabled: true,
    days: 30,
    account: (row && row.account_name) || adAccountId,
    currency: (row && row.account_currency) || 'ARS',
    spend,
    impressions: row ? Number(row.impressions || 0) : 0,
    clicks,
    purchases,
    revenue,
    roas: spend > 0 && revenue > 0 ? Number((revenue / spend).toFixed(2)) : null,
    cac: purchases > 0 ? Math.round(spend / purchases) : null, // costo por compra
    cpc: clicks > 0 ? Math.round(spend / clicks) : null,
    empty: !row,
  };
  adsCache = { data: out, at: Date.now() };
  res.json(out);
}));

// Auditoría de la pauta con IA: datos duros de campañas/anuncios/catálogos (cruzados
// con el stock real de Tiendanube) + diagnóstico de Gemini. Tarda ~30-60 s, así que
// se corre a demanda (POST) y el resultado queda cacheado en memoria (GET).
let adsAuditCache = null;
/* ----------------------- CONSULTAS DE WHATSAPP -----------------------
 * La tienda avisa cada clic al botón de WhatsApp con la campaña de la que vino
 * esa persona. Sirve para lo que Analytics no puede: mirar un chat concreto y
 * saber de dónde salió, sin escribirle ningún código al cliente en su mensaje.
 * Lo llama el navegador del visitante desde OTRO dominio (la tienda), así que
 * va sin sesión y con CORS abierto — sólo escribe una fila de analítica.
 * --------------------------------------------------------------------- */
const leadCors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

/* ----------------------- TERMÓMETRO DE INTERÉS -----------------------
 * Vistas y carritos (GA4) + ventas reales (Tiendanube) + gasto de pauta (Meta),
 * por producto, para separar "no se vende porque nadie lo ve" de "lo ven y no
 * les convence". Pega contra tres APIs externas y tarda ~2,5 s, así que se
 * cachea media hora; ?force=1 lo recalcula.
 * --------------------------------------------------------------------- */
let interestCache = { data: null, at: 0, days: null };
const INTEREST_TTL_MS = 30 * 60 * 1000;

app.get('/api/products/interest', wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 28, 7), 90);
  const fresco = interestCache.data && interestCache.days === days
    && Date.now() - interestCache.at < INTEREST_TTL_MS;
  if (fresco && req.query.force !== '1') return res.json(interestCache.data);
  const data = await buildInterest({ days });
  interestCache = { data, at: Date.now(), days };
  res.json(data);
}));

/* ----------------------- RIELES DEL HOME -----------------------
 * Lo que reemplaza al scraping: la tienda pide UNA vez esta lista (~10 KB) en
 * vez de bajarse 12 páginas de producto completas (2.095 KB). Devuelve los
 * productos ya elegidos por regla —ventas, stock, curva de talles— así que el
 * home se actualiza solo y nunca muestra algo agotado.
 * Sólo lectura, sin sesión, desde otro dominio. Ver src/homeRails.js.
 * --------------------------------------------------------------- */
const publicGetCors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

// Un GET simple no dispara preflight, así que hoy no hace falta; se registra
// igual para que agregar un header en el futuro no rompa la llamada en silencio.
app.options('/api/home/rails', publicGetCors);

app.get('/api/home/rails', publicGetCors, wrap(async (req, res) => {
  const payload = await getRails({ force: req.query.force === '1' });
  // El CDN/navegador puede servirlo hasta 5 min sin preguntar, y hasta 30 min
  // más mientras revalida atrás: ninguna visita espera por esto.
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  res.json(payload);
}));

// Catálogo de reglas disponibles + la config actual. Lo consume la pestaña
// "Home" del panel para armar los desplegables.
app.get('/api/home/rules', wrap(async (req, res) => {
  const describe = (obj) => Object.entries(obj).map(([id, r]) => ({ id, label: r.label, help: r.help }));
  // Antigüedad del catálogo: los rieles muestran el precio que está en
  // products_cache, no el que está en Tiendanube en este segundo. Si el sync
  // quedó viejo, la tarjeta miente y hay que poder verlo desde el panel.
  const { rows } = await pool.query('SELECT max(synced_at) AS ultimo FROM products_cache');
  const ultimo = rows[0] && rows[0].ultimo;
  res.json({
    rules: [...describe(RULES), ...describe(SPECIAL_RULES)],
    slots: SLOT_IDS,
    layouts: LAYOUTS,
    config: await getRailsConfig(),
    catalogo: {
      sincronizado: ultimo,
      minutos: ultimo ? Math.round((Date.now() - new Date(ultimo).getTime()) / 60000) : null,
    },
  });
}));

// Esquema recomendado del home: en qué orden conviene poner las secciones,
// con el número real que justifica cada posición. Ver src/homeLayout.js.
app.get('/api/home/layout', wrap(async (req, res) => {
  res.json(await buildLayout());
}));

// Vista previa: arma los rieles con una config que TODAVÍA NO se guardó, para
// poder ver qué productos van a salir antes de publicar el cambio en la tienda.
app.post('/api/home/preview', wrap(async (req, res) => {
  const cfg = validateConfig(req.body);
  res.json(await buildPayload(cfg));
}));

// Publicar: valida, guarda e invalida la caché. A partir de acá la tienda ya
// sirve los rieles nuevos.
app.post('/api/home/config', wrap(async (req, res) => {
  const cfg = await saveRailsConfig(req.body);
  res.json({ ok: true, config: cfg, rails: (await getRails({ force: true })).rails });
}));

/* =========================================================================
 * AUTORIZACIÓN OAuth de la app de Tiendanube (Partners)
 *
 * Se usa UNA sola vez para conseguir el access_token de la app registrada en
 * Partners (TIENDANUBE_APP_ID + TIENDANUBE_APP_CLIENT_SECRET). Ese token, a
 * diferencia del de Google, NO vence nunca por sí solo (confirmado en la doc
 * oficial de Tiendanube): sólo se invalida si se genera uno nuevo para la
 * misma app o si se desinstala la app del panel de la tienda. O sea que este
 * flujo se corre una vez y no hace falta repetirlo — si el token empieza a
 * fallar más adelante, la causa es una de esas dos, no una expiración.
 *
 * Requiere que en Partners, dentro de la configuración de la app, la
 * "Redirect URL" apunte exactamente a
 * ${PUBLIC_BASE_URL}/api/tiendanube/oauth/callback
 * ========================================================================= */
let tnOauthState = null; // { value, expira } — de un solo uso, vive 5 min (lo que dura el code de Tiendanube)

// Sólo para estas dos páginas HTML de diagnóstico: no hay un esc() global en
// el server (el del dashboard vive en el navegador, en dashboard.js).
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/api/tiendanube/oauth/start', wrap(async (req, res) => {
  const appId = process.env.TIENDANUBE_APP_ID;
  if (!appId) {
    return res.status(400).send('Falta TIENDANUBE_APP_ID en las variables de entorno.');
  }
  tnOauthState = { value: crypto.randomBytes(16).toString('hex'), expira: Date.now() + 5 * 60_000 };
  const url = `https://www.tiendanube.com/apps/${appId}/authorize?state=${tnOauthState.value}`;
  res.redirect(url);
}));

app.get('/api/tiendanube/oauth/callback', wrap(async (req, res) => {
  const { code, state, error } = req.query;
  const fail = (msg) => res.status(400).send(`<!doctype html><meta charset="utf-8">
    <body style="font-family:system-ui;background:#111;color:#eee;padding:40px;max-width:640px;margin:0 auto">
    <h2>No se pudo autorizar</h2><p>${msg}</p>
    <p><a href="/api/tiendanube/oauth/start" style="color:#e85d1b">Volver a intentar</a></p>`);

  if (error) return fail(`Tiendanube devolvió: ${error}`);
  if (!code) return fail('Faltó el código de autorización.');
  if (!tnOauthState || state !== tnOauthState.value) {
    return fail('El "state" no coincide o ya se usó. Volvé a arrancar el proceso desde el botón.');
  }
  if (Date.now() > tnOauthState.expira) return fail('Se venció el tiempo (5 min). Volvé a arrancar.');
  tnOauthState = null; // de un solo uso

  const appId = process.env.TIENDANUBE_APP_ID;
  const secret = process.env.TIENDANUBE_APP_CLIENT_SECRET;
  if (!appId || !secret) return fail('Faltan TIENDANUBE_APP_ID o TIENDANUBE_APP_CLIENT_SECRET en el servidor.');

  const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: appId, client_secret: secret, grant_type: 'authorization_code', code }),
  });
  const data = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !data.access_token) {
    return fail(`Tiendanube respondió: ${escHtml(JSON.stringify(data))}`);
  }

  // El token se MUESTRA una sola vez acá. No se guarda solo en ningún lado:
  // hay que copiarlo a mano a TIENDANUBE_ACCESS_TOKEN (.env local y variables
  // de Render) y reiniciar el servicio. Así queda igual que hoy: una única
  // variable de entorno, sin que el motor tenga que administrar el secreto.
  res.send(`<!doctype html><meta charset="utf-8">
    <body style="font-family:system-ui;background:#111;color:#eee;padding:40px;max-width:640px;margin:0 auto;line-height:1.6">
    <h2>✔ Autorizado</h2>
    <p>Copiá este valor a <code>TIENDANUBE_ACCESS_TOKEN</code> en tu <code>.env</code> local y en las variables de
    entorno de Render, y reiniciá el servicio. Esta pantalla no vuelve a mostrarlo.</p>
    <textarea readonly onclick="this.select()" style="width:100%;height:70px;background:#000;color:#0f0;
      font-family:monospace;font-size:13px;padding:10px;border-radius:8px;border:1px solid #333">${escHtml(data.access_token)}</textarea>
    <p style="color:#999;font-size:13px">Tienda (user_id): ${escHtml(String(data.user_id || ''))} ·
    Permisos otorgados: ${escHtml(String(data.scope || ''))}</p>
    <p style="color:#999;font-size:13px">Este token de Tiendanube NO vence solo. Sólo se invalida si volvés a correr
    esta autorización (genera uno nuevo) o si desinstalás la app desde el panel de la tienda.</p>`);
}));

// sendBeacon manda text/plain para evitar el preflight: se parsea a mano.
app.post('/api/leads/click', leadCors, express.text({ type: '*/*', limit: '16kb' }), wrap(async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'payload inválido' });

  const cut = (v, n = 200) => (v == null ? null : String(v).slice(0, n));
  await pool.query(
    `INSERT INTO lead_clicks (lead_type, contact_channel, item_name, page_type, page_path, campaign, source, click_id, ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [cut(body.lead_type, 20), cut(body.contact_channel, 60), cut(body.item_name), cut(body.page_type, 40),
      cut(body.page_path, 300), cut(body.campaign, 150), cut(body.source, 40), cut(body.click_id, 200), cut(body.ref, 20)]
  );
  res.json({ ok: true });
}));

// Últimas consultas, para cruzarlas por hora con los chats que entraron.
app.get('/api/leads/recent', wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const { rows } = await pool.query(
    `SELECT id, lead_type, contact_channel, item_name, page_type, page_path, campaign, source, ref,
            created_at AT TIME ZONE $2 AS hora_local, created_at
     FROM lead_clicks
     WHERE created_at >= now() - ($1 || ' days')::interval
     ORDER BY created_at DESC LIMIT 200`,
    [String(days), config.timezone]
  );
  res.json({ days, items: rows });
}));

/* ----------------------- PAUTA COMPARADA (Meta vs Google) -----------------------
 * Ver src/adsPerformance.js: los dos canales medidos con la MISMA vara para
 * poder decidir a dónde va el presupuesto. Cache de 10 minutos porque son
 * varias llamadas a Analytics + Meta y el panel lo pide seguido.
 * ------------------------------------------------------------------------------ */
const perfCache = new Map();
const PERF_TTL_MS = 10 * 60 * 1000;

async function paidReport(days, { fresh = false } = {}) {
  const { getLeadValue } = require('./settings');
  const valorConsulta = await getLeadValue();
  const key = `d${days}v${valorConsulta}`;
  const hit = perfCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < PERF_TTL_MS) return hit.data;
  const { paidPerformance } = require('./adsPerformance');
  const data = await paidPerformance({ days, valorConsulta });
  perfCache.set(key, { data, at: Date.now() });
  return data;
}

app.get('/api/ads/performance', wrap(async (req, res) => {
  const { getLeadValueDetail } = require('./settings');
  const days = [7, 14, 30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const [data, lead] = await Promise.all([
    paidReport(days, { fresh: req.query.fresh === '1' }),
    getLeadValueDetail(),
  ]);
  res.json({ ...data, leadValue: lead });
}));

/* Cuánto vale una consulta mayorista: sin esto, las campañas que van a la
 * sección sin carrito no se pueden poner en la misma escala que las de venta. */
app.post('/api/ads/lead-value', wrap(async (req, res) => {
  const { setLeadValue, getLeadValueDetail } = require('./settings');
  const b = req.body || {};
  await setLeadValue({ ticket: Number(b.ticket) || 0, cierrePct: Number(b.cierrePct) || 0, valor: Number(b.valor) || 0 });
  perfCache.clear(); // el valor entra en el cálculo: hay que recalcular
  res.json({ ok: true, ...(await getLeadValueDetail()) });
}));

// Diagnóstico narrativo con IA sobre ese mismo informe (texto: sin costo de imagen).
app.post('/api/ads/performance/ai', wrap(async (req, res) => {
  const { analyzePaidPerformance } = require('./adsPerformance');
  const body = req.body || {};
  const days = [7, 14, 30, 60, 90].includes(Number(body.days)) ? Number(body.days) : 30;
  const report = await paidReport(days);
  if (!report.ok) return res.status(400).json({ error: report.error });
  res.json(await analyzePaidPerformance(report, { contexto: textOrNull(body.contexto) || '' }));
}));

app.get('/api/ads/audit', wrap(async (req, res) => {
  res.json(adsAuditCache || { available: false });
}));

app.post('/api/ads/audit', wrap(async (req, res) => {
  const { runAdsAudit } = require('./adsAudit');
  adsAuditCache = { available: true, ...(await runAdsAudit()) };
  res.json(adsAuditCache);
}));

// Sincroniza la disponibilidad del catálogo de Meta con el stock real de Tiendanube.
// apply=false (default): dry-run, sólo informa. apply=true: corrige por API.
app.post('/api/catalog/sync', wrap(async (req, res) => {
  const { syncCatalogAvailability } = require('./catalogSync');
  res.json(await syncCatalogAvailability({ apply: Boolean(req.body && req.body.apply) }));
}));

// Versión cron: corre todos los días después del sync de productos (06:45 ARG),
// así el catálogo de anuncios amanece alineado con el stock del día.
app.post('/api/cron/sync-catalog', authCron, wrap(async (req, res) => {
  const { syncCatalogAvailability } = require('./catalogSync');
  res.json({ ok: true, ...(await syncCatalogAvailability({ apply: true })) });
}));

// Atribución por pieza: sesiones/compras de Google Analytics cuyas campañas empiezan
// con engine_ (los links con UTM que arma el motor llevan engine_<calendarId>).
let attributionCache = { data: null, at: 0 };
app.get('/api/metrics/attribution', wrap(async (req, res) => {
  const { runReport, isEnabled } = require('./analytics');
  if (!isEnabled()) return res.json({ enabled: false });
  if (attributionCache.data && Date.now() - attributionCache.at < 60 * 60 * 1000) {
    return res.json(attributionCache.data);
  }

  const report = await runReport({
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionCampaignName' }],
    metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
    dimensionFilter: {
      filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'BEGINS_WITH', value: 'engine_' } },
    },
    limit: 50,
  }).catch((err) => { console.warn('[server] Atribución GA falló:', err.message); return null; });

  const rows = (report && report.rows) || [];
  const parsed = rows.map((r) => ({
    campaign: r.dimensionValues[0].value,
    calendarId: Number((r.dimensionValues[0].value.match(/^engine_(\d+)$/) || [])[1]) || null,
    sessions: Number(r.metricValues[0].value),
    purchases: Number(r.metricValues[1].value),
    revenue: Number(r.metricValues[2].value),
  }));

  // Cruce con el calendario para mostrar QUÉ pieza era (tema, pilar, fecha).
  const ids = parsed.map((p) => p.calendarId).filter(Boolean);
  let slots = new Map();
  if (ids.length) {
    const { rows: slotRows } = await pool.query(
      `SELECT id, theme_title, pillar_detail, pillar, post_type, scheduled_date
       FROM content_calendar WHERE id = ANY($1)`, [ids]
    );
    slots = new Map(slotRows.map((s) => [s.id, s]));
  }
  const items = parsed
    .map((p) => ({ ...p, slot: slots.get(p.calendarId) || null }))
    .sort((a, b) => b.sessions - a.sessions);

  const out = { enabled: true, days: 28, items };
  attributionCache = { data: out, at: Date.now() };
  res.json(out);
}));

// Serie semanal de alcance (para el gráfico del panel): suma el reach de las piezas
// publicadas agrupado por semana de publicación programada (últimas 12 semanas).
app.get('/api/insights/weekly-reach', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('week', c.scheduled_date), 'YYYY-MM-DD') AS week,
            SUM(COALESCE(i.reach, 0))::int AS reach,
            SUM(COALESCE(i.impressions, 0))::int AS impressions,
            COUNT(*)::int AS posts
     FROM post_insights i
     JOIN generated_assets a ON a.id = i.asset_id
     JOIN content_calendar c ON c.id = a.calendar_id
     WHERE c.scheduled_date >= CURRENT_DATE - 84
     GROUP BY 1 ORDER BY 1`
  );
  res.json(rows);
}));

// Sincroniza el catálogo COMPLETO con Tiendanube a demanda (el cron diario ya lo
// hace solo a las 06:45 ARG; este endpoint es para no esperar esa corrida cuando
// hay un producto nuevo y todavía no aparece en el buscador del panel).
app.post('/api/products/sync', wrap(async (req, res) => {
  const { syncProducts } = require('../scripts/sync-products');
  const result = await syncProducts();
  // El catálogo cambió: los rieles del home tienen que rearmarse con el stock
  // nuevo en vez de esperar a que venza la caché de 15 minutos.
  invalidateRails();
  res.json({ ok: true, ...result });
}));

app.get('/api/products', wrap(async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, stock, image_url
     FROM products_cache WHERE published IS NOT FALSE AND name ILIKE $1 ORDER BY synced_at DESC LIMIT 50`,
    [search]
  );
  res.json(rows);
}));

// Análisis de productos: ventas (30d) + stock + si califica para protagonizar contenido.
app.get('/api/products/analytics', wrap(async (req, res) => {
  const { contentEligibility } = require('./productScore');
  const sizeCols = 'sizes_total, sizes_in_stock, size_coverage';
  const [winners, needVisibility, retail, totals] = await Promise.all([
    pool.query(`SELECT id, name, brand, price, promo_price, stock, sales_30d, image_url, ${sizeCols}
                FROM products_cache WHERE sales_30d > 0 ORDER BY sales_30d DESC LIMIT 15`),
    pool.query(`SELECT id, name, brand, price, stock, sales_30d, image_url, ${sizeCols}
                FROM products_cache WHERE stock >= 10 AND COALESCE(sales_30d,0) = 0 AND price > 0
                ORDER BY stock DESC LIMIT 15`),
    // Minoristas: precio > 0 y stock finito > 0. Todos, para chequear sincronización.
    pool.query(`SELECT id, name, brand, price, promo_price, stock, sales_30d, image_url, ${sizeCols}
                FROM products_cache WHERE price > 0 AND stock > 0 ORDER BY name ASC LIMIT 100`),
    pool.query(`SELECT count(*)::int total,
                       count(*) FILTER (WHERE stock > 0)::int con_stock,
                       count(*) FILTER (WHERE sales_30d > 0)::int con_ventas,
                       count(*) FILTER (WHERE price > 0 AND stock > 0)::int retail,
                       count(*) FILTER (WHERE stock IS NULL OR price IS NULL OR price <= 0)::int mayorista,
                       COALESCE(sum(sales_30d),0)::int unidades
                FROM products_cache`),
  ]);
  // content: {ok, reason} — si el producto puede protagonizar piezas de producto/promo.
  const withEligibility = (rows) => rows.map((p) => ({ ...p, content: contentEligibility(p) }));
  res.json({
    winners: withEligibility(winners.rows),
    needVisibility: withEligibility(needVisibility.rows),
    retail: withEligibility(retail.rows),
    totals: totals.rows[0],
  });
}));

// Condiciones mayoristas (editables) que entran al copy de las piezas mayoristas.
app.get('/api/wholesale', wrap(async (req, res) => {
  res.json(await getWholesaleSettings());
}));
app.post('/api/wholesale', wrap(async (req, res) => {
  const { min_qty, conditions, discount_note, contact } = req.body || {};
  res.json(await saveWholesaleSettings({ min_qty: min_qty ? Number(min_qty) : null, conditions, discount_note, contact }));
}));

// Datos verificados de la empresa (de la web oficial): se inyectan a TODOS los copys
// como fuente de verdad para que la IA no invente trayectoria/envíos/plazos/cuotas.
app.get('/api/company-info', wrap(async (req, res) => {
  const cf = await getCompanyFacts();
  let noData = cf.no_data;
  if (typeof noData === 'string') { try { noData = JSON.parse(noData); } catch (_) { noData = null; } }
  res.json({ facts_summary: cf.facts_summary, no_data: noData, updated_at: cf.updated_at });
}));
app.post('/api/company-info/sync', wrap(async (req, res) => {
  res.json(await syncCompanyInfo());
}));

/* ----------------------- Generación / Assets ----------------------- */
// Slots generándose AHORA (en memoria): la generación con el director de arte + varias
// escenas de IA puede tardar 1-3 min, así que corre en segundo plano y el panel poolea
// este estado en vez de quedar bloqueado. Se limpia solo al terminar (o por timeout).
const generatingSlots = new Map(); // calendarId -> { startedAt, error }
const GENERATION_TIMEOUT_MS = 6 * 60 * 1000;

app.get('/api/generating', wrap(async (req, res) => {
  // Limpieza defensiva de trabajos "colgados" (ej. si el proceso reinició a mitad).
  const now = Date.now();
  for (const [gid, info] of generatingSlots) {
    if (!info.error && now - info.startedAt > GENERATION_TIMEOUT_MS) generatingSlots.delete(gid);
  }
  const ids = [];
  const errors = {};
  for (const [gid, info] of generatingSlots) {
    if (info.error) { errors[gid] = info.error; } else { ids.push(gid); }
  }
  res.json({ ids, errors });
}));

app.post('/api/generate/:calendarId', wrap(async (req, res) => {
  const id = intParam(req.params.calendarId);
  if (!id) return res.status(400).json({ error: 'calendarId inválido' });

  const { rows } = await pool.query('SELECT * FROM content_calendar WHERE id = $1', [id]);
  let slot = rows[0];
  if (!slot) return res.status(404).json({ error: 'No existe ese slot de calendario' });
  if (slot.pillar === 'repost') return res.status(400).json({ error: 'Los slots de repost/descanso no se generan.' });
  if (generatingSlots.has(id) && !generatingSlots.get(id).error) {
    return res.status(409).json({ error: 'Esta pieza ya se está generando.' });
  }

  // Regenerar cambiando el tema/ángulo: se persiste en el slot y se usa al generar.
  const body = req.body || {};
  const newDetail = typeof body.pillarDetail === 'string' ? body.pillarDetail.trim() : null;
  const newTheme = typeof body.theme === 'string' ? body.theme.trim() : null;
  if (newDetail || newTheme) {
    await pool.query(
      `UPDATE content_calendar SET pillar_detail = COALESCE($2, pillar_detail), theme_title = COALESCE($3, theme_title) WHERE id = $1`,
      [id, newDetail, newTheme]
    );
    const { rows: r2 } = await pool.query('SELECT * FROM content_calendar WHERE id = $1', [id]);
    slot = r2[0];
  }

  const template = VALID_TEMPLATES.includes(body.template) ? body.template : null;
  // Dirección de arte elegida a mano: cómo tiene que resolverse la imagen de la pieza.
  const artMode = ['generativa', 'foto', 'tipografica'].includes(body.artMode) ? body.artMode : null;
  const artBrief = typeof body.artBrief === 'string' ? body.artBrief.trim().slice(0, 400) : null;

  // Guardamos qué versiones había ANTES: recién las descartamos si la nueva sale bien.
  // (Antes se descartaba primero y, si la generación en segundo plano fallaba, la pieza
  // quedaba "descartada" sin reemplazo y no se podía aprobar — bug real jul-2026.)
  const { rows: prevRows } = await pool.query(
    `SELECT id FROM generated_assets WHERE calendar_id = $1 AND status IN ('draft', 'approved')`, [id]
  );
  const prevIds = prevRows.map((r) => r.id);

  // Segundo plano: respondemos ya (el panel muestra "generando" y poolea /api/generating).
  generatingSlots.set(id, { startedAt: Date.now(), error: null });
  const slotForGen = slot;
  const detailForGen = newDetail || slot.pillar_detail;
  (async () => {
    try {
      await generateForSlot(slotForGen, { pillarDetail: detailForGen, template, artMode, artBrief });
      // La nueva se creó OK → recién ahora descartamos las viejas y limpiamos su cola.
      if (prevIds.length) {
        await pool.query(`UPDATE generated_assets SET status = 'discarded', updated_at = now() WHERE id = ANY($1)`, [prevIds]);
      }
      await cancelQueuedForCalendar(id).catch(() => {});
      generatingSlots.delete(id);
    } catch (err) {
      console.error(`[server] Generación en segundo plano del slot #${id} falló (la versión anterior queda intacta):`, err.message);
      // La versión vieja NO se tocó: la pieza sigue aprobable como estaba.
      generatingSlots.set(id, { startedAt: Date.now(), error: err.message });
      setTimeout(() => { const cur = generatingSlots.get(id); if (cur && cur.error) generatingSlots.delete(id); }, 30000);
    }
  })();

  res.json({ ok: true, generating: true });
}));

/**
 * Cuántos borradores conviene actualizar y por qué. 'stale' = piezas hechas con el
 * código viejo (sin gen_model): no tienen objetivo, control de calidad ni la
 * selección de producto por talles. Sólo cuenta borradores de hoy en adelante.
 */
app.get('/api/regenerate-drafts/preview', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE a.gen_model IS NULL)::int AS stale,
       COUNT(*)::int AS total
     FROM content_calendar c
     JOIN LATERAL (SELECT * FROM generated_assets WHERE calendar_id = c.id ORDER BY id DESC LIMIT 1) a ON true
     WHERE a.status = 'draft' AND c.scheduled_date >= CURRENT_DATE AND c.pillar != 'repost'`
  );
  res.json(rows[0]);
}));

/**
 * Regenera EN LOTE los borradores con la lógica actual (objetivo, QA de copy,
 * selección por talles, imágenes didácticas). Nunca toca aprobados/publicados.
 * scope 'stale' (default) = sólo los del código viejo; 'all' = todos los borradores.
 * El borrador anterior de cada slot se descarta para no acumular.
 */
app.post('/api/regenerate-drafts', wrap(async (req, res) => {
  const scope = (req.body && req.body.scope) === 'all' ? 'all' : 'stale';
  const { rows: slots } = await pool.query(
    `SELECT c.* FROM content_calendar c
     JOIN LATERAL (SELECT * FROM generated_assets WHERE calendar_id = c.id ORDER BY id DESC LIMIT 1) a ON true
     WHERE a.status = 'draft' AND c.scheduled_date >= CURRENT_DATE AND c.pillar != 'repost'
       ${scope === 'stale' ? 'AND a.gen_model IS NULL' : ''}
     ORDER BY c.scheduled_date, c.id`
  );

  let regenerated = 0;
  const failed = [];
  for (const slot of slots) {
    try {
      // Descartamos el borrador viejo ANTES de rehacer: así el nuevo queda como
      // única versión vigente y no se acumulan piezas huérfanas.
      await pool.query(
        `UPDATE generated_assets SET status = 'discarded', updated_at = now()
         WHERE calendar_id = $1 AND status = 'draft'`, [slot.id]
      );
      await generateForSlot(slot);
      regenerated += 1;
    } catch (err) {
      console.error(`[regenerate-drafts] Slot #${slot.id} falló:`, err.message);
      failed.push({ id: slot.id, date: slot.scheduled_date, error: err.message });
    }
  }
  res.json({ ok: true, regenerated, failed: failed.length, total: slots.length, errors: failed.slice(0, 5) });
}));

// Regenera UN SOLO slide del carrusel con correcciones (texto exacto y/o instrucción
// para la imagen). No toca los demás slides. Corre en segundo plano por si tarda.
app.post('/api/assets/:assetId/regenerate-slide', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const body = req.body || {};
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'index inválido' });
  const result = await regenerateSlide({
    assetId: id,
    index,
    overlay: typeof body.overlay === 'string' ? body.overlay : undefined,
    instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
  });
  res.json({ ok: true, ...result });
}));

// "Corregir la historia": para piezas SIMPLES (no carrusel). El usuario describe qué
// corregir y se aplica SÓLO ese cambio sobre los textos, reusando la misma escena ya
// generada (cero gasto de IA, la foto no se toca). Requiere receta guardada (piezas
// nuevas); las viejas hay que regenerarlas una vez.
app.post('/api/assets/:assetId/correct', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction : '';
  // Se puede corregir sólo el texto, sólo la imagen (artMode), o las dos cosas.
  const artMode = ['generativa', 'foto', 'tipografica'].includes(req.body?.artMode) ? req.body.artMode : null;
  const artBrief = typeof req.body?.artBrief === 'string' ? req.body.artBrief.trim().slice(0, 400) : null;
  if (!instruction.trim() && !artMode) return res.status(400).json({ error: 'Escribí qué hay que corregir o elegí una imagen distinta.' });
  const result = await correctPiece({ assetId: id, instruction, artMode, artBrief });
  res.json({ ok: true, ...result });
}));

app.post('/api/assets/:assetId/approve', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  await pool.query(`UPDATE generated_assets SET status = 'approved', updated_at = now() WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

app.post('/api/assets/:assetId/edit', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { caption, hashtags, cta } = req.body || {};
  // Estado ANTES de la edición: el diff con la corrección manual es la mejor señal
  // de aprendizaje que existe (el dueño marcando exactamente qué estaba mal).
  const { rows: prevRows } = await pool.query(
    `SELECT a.caption, c.pillar FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [id]
  );
  await pool.query(
    `UPDATE generated_assets SET caption = COALESCE($2, caption), hashtags = COALESCE($3, hashtags),
       cta = COALESCE($4, cta), updated_at = now() WHERE id = $1`,
    [id, caption, hashtags, cta]
  );
  res.json({ ok: true });
  // MEMORIA DE ERRORES: derivar la regla general del diff, en segundo plano
  // (ya respondimos; best-effort — si la IA no está, no pasa nada).
  const prev = prevRows[0];
  if (prev && typeof caption === 'string' && caption.trim() && prev.caption
      && caption.trim() !== String(prev.caption).trim()) {
    const { deriveLessonFromEdit } = require('./learning');
    deriveLessonFromEdit({ before: prev.caption, after: caption, pillar: prev.pillar }).catch(() => {});
  }
}));

/**
 * 3 versiones alternativas del caption para la MISMA imagen. Es texto: sale gratis
 * y no vuelve a pagar la escena de IA (que es lo caro de "Regenerar").
 */
app.post('/api/assets/:assetId/copy-variants', wrap(async (req, res) => {
  const { generateCopyVariants } = require('./ai');
  const { companyFactsContext, getCompanyFacts } = require('./companyInfo');
  const { lessonsContext } = require('./learning');
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { rows } = await pool.query(
    `SELECT a.caption, c.pillar, c.objective, c.format, c.post_type,
            p.name, p.description, p.price, p.promo_price
     FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
     LEFT JOIN products_cache p ON p.id = a.product_id WHERE a.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'No existe el asset' });
  const [companyFacts, lessons] = await Promise.all([
    getCompanyFacts().then(companyFactsContext).catch(() => ''),
    lessonsContext({ pillar: r.pillar }).catch(() => ''),
  ]);
  const variants = await generateCopyVariants({
    caption: r.caption,
    product: r.name ? { name: r.name, description: r.description, price: r.price, promo_price: r.promo_price } : null,
    pillar: r.pillar,
    objective: r.objective || 'venta',
    format: r.format || 'feed',
    postType: r.post_type || 'feed',
    companyFacts,
    lessons,
  });
  if (!variants.length) return res.status(502).json({ error: 'No pude generar variantes ahora. Probá de nuevo en un minuto.' });
  res.json({ variants });
}));

app.post('/api/assets/:assetId/discard', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  await pool.query(`UPDATE generated_assets SET status = 'discarded', updated_at = now() WHERE id = $1`, [id]);
  // Si estaba encolada para publicarse, se cancela: descartada = no sale.
  await cancelQueuedForAsset(id).catch(() => {});
  res.json({ ok: true });
  // MEMORIA DE ERRORES: si el dueño contó POR QUÉ la descarta, eso queda como
  // lección para el director creativo y el copy (en segundo plano, best-effort).
  const reason = req.body && typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (reason) {
    (async () => {
      const { rows } = await pool.query(
        `SELECT c.pillar, c.theme_title FROM generated_assets a
         JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [id]
      );
      const { recordLesson } = require('./learning');
      await recordLesson({
        source: 'user_discard',
        scope: (rows[0] && rows[0].pillar) || 'global',
        lesson: `El dueño descartó una pieza por esto: ${reason}. No repetirlo.`,
        detail: rows[0] && rows[0].theme_title ? `pieza: "${rows[0].theme_title}"` : null,
      });
    })().catch((err) => console.warn(`[server] No pude registrar la lección del descarte: ${err.message}`));
  }
}));

// MEMORIA DE ERRORES: lecciones aprendidas (de QA automático y del propio usuario).
// El panel las lista y permite apagar las que quedaron viejas (sin borrarlas).
app.get('/api/lessons', wrap(async (req, res) => {
  const { listLessons } = require('./learning');
  res.json({ lessons: await listLessons({ limit: Number(req.query.limit) || 100 }) });
}));

app.post('/api/lessons/:id/toggle', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const { setLessonActive } = require('./learning');
  const ok = await setLessonActive(id, Boolean(req.body && req.body.active));
  res.json({ ok });
}));

// Vuelve a dejar una pieza YA PUBLICADA como aprobada, para republicarla — por si el
// usuario la borró de Instagram a mano o simplemente quiere que salga de nuevo.
// Limpia el meta_post_id viejo (una nueva publicación va a tener un ID distinto).
app.post('/api/assets/:assetId/republish', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { rows } = await pool.query(
    `UPDATE generated_assets SET status = 'approved', meta_post_id = NULL, updated_at = now()
     WHERE id = $1 AND status = 'published' RETURNING calendar_id`,
    [id]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Esa pieza no está publicada; no hace falta republicarla.' });
  await pool.query(`UPDATE content_calendar SET status = 'approved' WHERE id = $1`, [rows[0].calendar_id]);
  // Por si había quedado una fila vieja en la cola de publicación, la limpiamos para
  // que la próxima pasada la vuelva a encolar en limpio.
  await pool.query(`DELETE FROM publish_queue WHERE asset_id = $1`, [id]);
  res.json({ ok: true });
}));

// Súper-prompt para generar una escena de video a mano en Gemini/Veo.
app.get('/api/assets/:assetId/video-prompt', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { rows } = await pool.query(
    `SELECT a.caption, a.image_path, c.pillar_detail, c.theme_title, c.format, c.pillar,
            p.name as product_name, p.description as product_description,
            p.image_url as product_image_url, p.images as product_images
     FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
     LEFT JOIN products_cache p ON p.id = a.product_id WHERE a.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'No existe el asset' });
  const productImages = Array.isArray(r.product_images) && r.product_images.length
    ? r.product_images : [r.product_image_url || r.image_path].filter(Boolean);
  res.json(buildVideoPromptSet({
    productName: r.product_name,
    productDescription: r.product_description,
    productImages,
    theme: r.pillar_detail || r.theme_title,
    format: r.format,
    caption: r.caption,
    pillar: r.pillar,
  }));
}));

/* ----------------------- Video con IA (Veo 3.1) -----------------------
 * Antes el video era 100% manual: copiabas el prompt, lo pegabas en Gemini/Veo,
 * bajabas el mp4 y lo volvías a subir. Estos endpoints lo generan solos desde el
 * panel: arrancan la operación, la siguen en segundo plano y dejan el video
 * enganchado a la pieza (o en la biblioteca del Estudio). Ver src/videoAi.js.
 * ------------------------------------------------------------------------ */

/** Fotogramas candidatos para arrancar el video (image-to-video). */
async function videoStartFrames(assetId) {
  const { rows } = await pool.query(
    `SELECT a.image_path, a.slides_meta, p.name AS product_name, p.description AS product_description,
            p.image_url AS product_image_url, p.images AS product_images
     FROM generated_assets a LEFT JOIN products_cache p ON p.id = a.product_id WHERE a.id = $1`,
    [assetId]
  );
  const r = rows[0];
  if (!r) return null;
  let meta = r.slides_meta;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = null; } }
  const frames = [];
  // La escena limpia (sin textos quemados) es el mejor primer fotograma: ya tiene
  // la luz y el ambiente de la pieza. La foto de catálogo es la más fiel al producto.
  if (meta && meta.sceneUrl) frames.push({ id: 'escena', label: 'Escena de la pieza', url: meta.sceneUrl });
  const photos = Array.isArray(r.product_images) && r.product_images.length
    ? r.product_images : [r.product_image_url].filter(Boolean);
  photos.slice(0, 4).forEach((url, i) => frames.push({ id: `foto${i}`, label: `Foto real ${i + 1}`, url }));
  // Ojo: la imagen de la pieza NO sirve de primer fotograma — tiene los textos
  // quemados encima y el video los deformaría. Sin foto limpia, va sólo texto.
  return { frames, product: r };
}

// Qué se puede generar y cuánto sale (el panel lo muestra ANTES de gastar).
app.get('/api/video/options', wrap(async (req, res) => {
  const { listVideoQualities, listApiVideoStyles, hasVeo, videoSpendTodayUsd } = require('./videoAi');
  const duration = Number(req.query.duration) || 8;
  const assetId = intParam(req.query.assetId);
  const frames = assetId ? await videoStartFrames(assetId) : null;
  res.json({
    available: hasVeo(),
    qualities: listVideoQualities(duration),
    styles: listApiVideoStyles(),
    durations: [4, 6, 8],
    spentTodayUsd: Number((await videoSpendTodayUsd()).toFixed(2)),
    budgetUsd: config.ai.videoDailyBudgetUsd,
    frames: frames ? frames.frames : [],
    productName: frames && frames.product ? frames.product.product_name : null,
  });
}));

app.post('/api/assets/:assetId/generate-video', wrap(async (req, res) => {
  const { createVideoJob, buildVeoApiPrompt, listVideoJobs } = require('./videoAi');
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });

  // Una pieza a la vez: si ya hay uno corriendo, se devuelve ese (evita pagar dos).
  const jobs = await listVideoJobs({ assetId: id, limit: 1 });
  if (jobs[0] && jobs[0].status === 'running') return res.json({ ok: true, job: jobs[0], already: true });

  const info = await videoStartFrames(id);
  if (!info) return res.status(404).json({ error: 'No existe el asset' });
  const { rows: crows } = await pool.query(
    `SELECT c.pillar, c.format, c.pillar_detail, c.theme_title FROM generated_assets a
     JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [id]
  );
  const slot = crows[0] || {};
  const body = req.body || {};
  const frame = info.frames.find((f) => f.id === body.frame) || info.frames[0] || null;
  const prompt = textOrNull(body.prompt) || buildVeoApiPrompt({
    productName: info.product.product_name,
    productDescription: info.product.product_description,
    style: body.style,
    theme: slot.pillar_detail || slot.theme_title,
    pillar: slot.pillar,
    hasStartImage: Boolean(frame),
  });

  const job = await createVideoJob({
    assetId: id,
    prompt,
    imageUrl: frame ? frame.url : null,
    quality: body.quality,
    duration: body.duration,
    aspectRatio: slot.format === 'feed' ? '9:16' : '9:16', // Reels e historias son verticales
    format: slot.format || 'story',
    productNames: info.product.product_name,
    style: body.style || 'secuencia',
  });
  res.json({ ok: true, job });
}));

app.get('/api/assets/:assetId/video-job', wrap(async (req, res) => {
  const { listVideoJobs } = require('./videoAi');
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const jobs = await listVideoJobs({ assetId: id, limit: 1 });
  res.json(jobs[0] || null);
}));

// Subir un video propio (ej: generado en Gemini/Veo) y dejarlo listo para publicar como Reel.
app.post('/api/assets/:assetId/upload-video', uploadVideo.single('file'), wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún video.' });
  const ext = ((req.file.mimetype || 'video/mp4').split('/')[1] || 'mp4').replace(/[^a-z0-9]/gi, '');
  const url = await uploadAsset({
    buffer: req.file.buffer,
    filename: `reels/uploaded-${id}-${Date.now()}.${ext}`,
    contentType: req.file.mimetype || 'video/mp4',
  });
  await pool.query(`UPDATE generated_assets SET video_path = $2, updated_at = now() WHERE id = $1`, [id, url]);
  res.json({ ok: true, video_path: url });
}));

/* ----------------------- Editor de video ----------------------- */
function assetVideoUrl(row) {
  const { getPublicUrl } = require('./storage');
  return getPublicUrl(row.video_path);
}

// Transcribe el audio del video (Groq Whisper) y guarda las palabras con tiempos.
app.post('/api/assets/:assetId/transcribe', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { rows } = await pool.query('SELECT video_path, voiceover_path FROM generated_assets WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'No existe el asset' });
  const { getPublicUrl } = require('./storage');
  // Si hay voz en off cargada, transcribimos ESA voz (para videos mudos/narrados).
  const isAudio = Boolean(rows[0].voiceover_path);
  const source = isAudio ? getPublicUrl(rows[0].voiceover_path) : assetVideoUrl(rows[0]);
  if (!source) return res.status(400).json({ error: 'No hay audio para transcribir. Subí un video con voz o una voz en off.' });
  const result = await transcribeVideo(source, { isAudio });
  await pool.query(`UPDATE generated_assets SET subtitles = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(result.words)]);
  res.json({ ok: true, text: result.text, words: result.words });
}));

// Guarda los subtítulos editados + overlays + estilo.
app.post('/api/assets/:assetId/subtitles', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { words, overlays, style } = req.body || {};
  await pool.query(
    `UPDATE generated_assets SET subtitles = COALESCE($2, subtitles), overlays = COALESCE($3, overlays),
       edit_style = COALESCE($4, edit_style), updated_at = now() WHERE id = $1`,
    [id, words ? JSON.stringify(words) : null, overlays ? JSON.stringify(overlays) : null, style ? JSON.stringify(style) : null]
  );
  res.json({ ok: true });
}));

// Sube una pista de voz en off (audio) para el video.
app.post('/api/assets/:assetId/upload-voiceover', uploadVideo.single('file'), wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se subió audio.' });
  const ext = ((req.file.mimetype || 'audio/mpeg').split('/')[1] || 'mp3').replace(/[^a-z0-9]/gi, '');
  const url = await uploadAsset({ buffer: req.file.buffer, filename: `voiceover/${id}-${Date.now()}.${ext}`, contentType: req.file.mimetype || 'audio/mpeg' });
  await pool.query(`UPDATE generated_assets SET voiceover_path = $2, updated_at = now() WHERE id = $1`, [id, url]);
  res.json({ ok: true, voiceover_path: url });
}));

// Encola el renderizado del video editado (subtítulos + voz). Lo procesa GitHub Actions.
app.post('/api/assets/:assetId/render-edit', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { words, overlays, style } = req.body || {};
  await pool.query(
    `UPDATE generated_assets SET subtitles = COALESCE($2, subtitles), overlays = COALESCE($3, overlays),
       edit_style = COALESCE($4, edit_style), edit_status = 'queued', updated_at = now() WHERE id = $1`,
    [id, words ? JSON.stringify(words) : null, overlays ? JSON.stringify(overlays) : null, style ? JSON.stringify(style) : null]
  );
  res.json({ ok: true, edit_status: 'queued' });
}));

app.get('/api/assets/:assetId/edit-status', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const { rows } = await pool.query('SELECT edit_status, edited_video_path FROM generated_assets WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'No existe el asset' });
  res.json(rows[0]);
}));

app.post('/api/assets/:assetId/publish', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const force = Boolean(req.body && req.body.force);
  res.json(await publishAssetById(id, { force }));
}));

/* ----------------------- Estudio creativo ----------------------- */
// Imágenes/videos de productos APARTE de las piezas del calendario: elegís un
// producto o un combo, generás la imagen con IA o te llevás el prompt de video
// para Gemini/Veo, y todo queda guardado en la biblioteca (studio_assets).

app.get('/api/studio/assets', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM studio_assets ORDER BY id DESC LIMIT 80`
  );
  res.json(rows);
}));

async function studioProducts(ids) {
  const clean = (ids || []).map(Number).filter(Boolean).slice(0, 4);
  if (!clean.length) return [];
  const { rows } = await pool.query(
    `SELECT id, name, description, image_url, images FROM products_cache WHERE id = ANY($1)`, [clean]
  );
  // Respetar el orden en que se eligieron.
  return clean.map((id) => rows.find((r) => Number(r.id) === id)).filter(Boolean)
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      imageUrl: r.image_url,
      images: Array.isArray(r.images) ? r.images : [],
    }));
}

app.post('/api/studio/image', wrap(async (req, res) => {
  const { generateStudioScene } = require('./ai');
  const body = req.body || {};
  const products = await studioProducts(body.productIds);
  if (!products.length) return res.status(400).json({ error: 'Elegí al menos un producto.' });
  const format = body.format === 'story' ? 'story' : 'feed';

  const img = await generateStudioScene({ products, theme: textOrNull(body.theme), format });
  if (!img) return res.status(502).json({ error: 'No se pudo generar la imagen (cuota de IA agotada o Gemini no disponible). Probá de nuevo en unos minutos.' });

  const url = await uploadAsset({
    buffer: img.buffer,
    filename: `studio/img-${Date.now()}.${(img.mimeType || 'image/png').split('/')[1] || 'png'}`,
    contentType: img.mimeType || 'image/png',
  });
  const { rows } = await pool.query(
    `INSERT INTO studio_assets (kind, path, prompt, product_ids, product_names, format, est_cost_usd)
     VALUES ('image', $1, $2, $3, $4, $5, $6) RETURNING *`,
    [url, img.prompt || null, products.map((p) => p.id), products.map((p) => p.name).join(' + '), format, img.costUsd || 0]
  );
  res.json(rows[0]);
}));

app.post('/api/studio/video-prompt', wrap(async (req, res) => {
  const { buildStudioVideoPromptSet } = require('./ai');
  const body = req.body || {};
  const products = await studioProducts(body.productIds);
  if (!products.length) return res.status(400).json({ error: 'Elegí al menos un producto.' });
  res.json(buildStudioVideoPromptSet({
    products,
    theme: textOrNull(body.theme),
    format: body.format === 'feed' ? 'feed' : 'story',
    duration: Math.min(Math.max(Number(body.duration) || 8, 5), 15),
  }));
}));

// Sube a la biblioteca el resultado generado afuera (video de Veo/Gemini o una imagen).
// Video con IA (Veo) desde el Estudio: mismo motor que las piezas, pero el
// resultado va a la biblioteca en vez de engancharse a un slot del calendario.
app.post('/api/studio/video', wrap(async (req, res) => {
  const { createVideoJob, buildVeoApiPrompt } = require('./videoAi');
  const body = req.body || {};
  const products = await studioProducts(body.productIds);
  if (!products.length) return res.status(400).json({ error: 'Elegí al menos un producto.' });
  const format = body.format === 'feed' ? 'feed' : 'story';
  const first = products[0];
  const prompt = textOrNull(body.prompt) || buildVeoApiPrompt({
    productName: products.map((p) => p.name).join(' + '),
    productDescription: products.length === 1 ? first.description : null,
    style: body.style,
    theme: textOrNull(body.theme),
    hasStartImage: true,
  });
  const job = await createVideoJob({
    studioProductIds: products.map((p) => p.id),
    prompt,
    imageUrl: (first.images && first.images[0]) || first.imageUrl || null,
    quality: body.quality,
    duration: body.duration,
    aspectRatio: '9:16',
    format,
    productNames: products.map((p) => p.name).join(' + '),
    style: body.style || 'secuencia',
  });
  res.json({ ok: true, job });
}));

// Estado de los videos del Estudio (los que no están atados a una pieza).
app.get('/api/studio/video-jobs', wrap(async (req, res) => {
  const { listVideoJobs } = require('./videoAi');
  const jobs = await listVideoJobs({ limit: 10 });
  res.json(jobs.filter((j) => !j.asset_id));
}));

app.post('/api/studio/upload', uploadVideo.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
  const mime = req.file.mimetype || 'application/octet-stream';
  const kind = mime.startsWith('video/') ? 'video' : 'image';
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  const url = await uploadAsset({
    buffer: req.file.buffer,
    filename: `studio/${kind}-${Date.now()}.${ext}`,
    contentType: mime,
  });
  let productIds = [];
  try { productIds = JSON.parse(req.body.productIds || '[]').map(Number).filter(Boolean); } catch (_) {}
  const { rows } = await pool.query(
    `INSERT INTO studio_assets (kind, path, prompt, product_ids, product_names, format)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [kind, url, textOrNull(req.body.prompt), productIds, textOrNull(req.body.productNames), textOrNull(req.body.format) || 'story']
  );
  res.json(rows[0]);
}));

app.delete('/api/studio/assets/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  await pool.query(`DELETE FROM studio_assets WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

/* ----------------------- Auditoría de conversión ----------------------- */
// ¿Por qué la gente no compra? Embudo GA + pauta Meta + ventas reales, con IA.
let convAuditCache = null;
app.get('/api/metrics/conversion-audit', wrap(async (req, res) => {
  res.json(convAuditCache || { available: false });
}));
app.post('/api/metrics/conversion-audit', wrap(async (req, res) => {
  const { runConversionAudit } = require('./adsAudit');
  convAuditCache = { available: true, ...(await runConversionAudit()) };
  res.json(convAuditCache);
}));

/* ----------------------- Estilo de marca ----------------------- */
app.get('/api/style', wrap(async (req, res) => {
  const [references, profile, folders] = await Promise.all([
    styleService.listReferences(), getBrandProfile(), styleService.foldersSummary(),
  ]);
  res.json({ references, profile, folders, geminiReady: hasGemini() });
}));

app.post('/api/style/upload', upload.array('files', 20), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No se subió ningún archivo.' });
  const added = [];
  for (const f of files) {
    added.push(await styleService.addUpload({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }));
  }
  res.json({ ok: true, added });
}));

app.post('/api/style/logo', upload.array('files', 5), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No se subió ningún logo.' });
  const added = [];
  for (const f of files) {
    added.push(await styleService.addLogo({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }));
  }
  res.json({ ok: true, added });
}));

app.post('/api/style/link', wrap(async (req, res) => {
  const { url, caption } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Falta la URL.' });
  res.json({ ok: true, reference: await styleService.addLink({ url, caption }) });
}));

app.delete('/api/style/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  await styleService.deleteReference(id);
  res.json({ ok: true });
}));

app.post('/api/style/analyze', wrap(async (req, res) => {
  const includeAccount = req.body ? req.body.includeAccount !== false : true;
  res.json(await styleService.runStyleAnalysis({ includeAccount }));
}));

// Importa imágenes de una carpeta PÚBLICA de Google Drive como referencias de estilo.
app.post('/api/style/drive-import', wrap(async (req, res) => {
  const { url, maxImages } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Falta el link de la carpeta de Drive.' });
  res.json(await importDriveFolder(url, { maxImages: Math.min(Number(maxImages) || 250, 400) }));
}));

/* ----------------------- Análisis de cuenta (IG) ----------------------- */
app.get('/api/account/analysis', wrap(async (req, res) => {
  res.json(await analyzeAccountPerformance(Number(req.query.limit) || 60));
}));

/* ----------------------- Manejo de errores ----------------------- */
app.use((req, res) => res.status(404).json({ error: 'No encontrado' }));

app.use((err, req, res, next) => {
  console.error('[server] Error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un slot con esa fecha, plataforma y formato de publicación. Probá otro día o tipo (feed/reel/story).' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

process.on('unhandledRejection', (reason) => console.error('[server] unhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('[server] uncaughtException:', err));

app.listen(config.port, () => {
  console.log(`[server] BLACKS content engine en puerto ${config.port} · IA: ${hasGemini() ? 'Gemini' : 'Groq'} · imágenes IA: ${config.ai.useAiImages}`);
  // Ajustes guardados desde el panel (ej. modelo de imagen elegido).
  require('./settings').loadSettings()
    .then((s) => console.log(`[server] Modelo de imagen: ${s.imageModel}`))
    .catch(() => {});
  // Retoma los videos de Veo que quedaron a medio generar (ya están pagados).
  require('./videoAi').resumeVideoJobs().catch(() => {});
});
