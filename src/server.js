const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const pool = require('./db');
const { seedCalendar, calendarIsEmpty } = require('./calendar');
const { generateForSlot } = require('../scripts/generate-daily');
const { generateDaily } = require('../scripts/generate-daily');
const { publishAssetById, publishDailyAuto, getPublishQueueStatus } = require('./publishService');
const { syncPostInsights, analyzePerformance } = require('./insights');
const { getBrandProfile } = require('./brandProfile');
const { uploadAsset } = require('./storage');
const styleService = require('./styleService');
const { importDriveFolder } = require('./driveService');
const { analyzeAccountPerformance } = require('./accountAnalyzer');
const { hasGemini, buildVideoPrompt } = require('./ai');
const { transcribeVideo } = require('./transcribe');
const { getWholesaleSettings, saveWholesaleSettings } = require('./wholesale');
const { listCommercialDates } = require('./commercialDates');
const { notifyPublishResult, notifyWeeklyReport } = require('./notifier');
const { generateMonthlyPlan, getPlan, nextPlannableMonth } = require('./planner');

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
  const open = ['/health', '/api/health', '/api/login', '/login.html', '/favicon.ico'];
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
  const summary = publish.summary || {};
  const publishActive = (summary.queued || 0) + (summary.processing || 0);
  res.json({
    reels: reels.rows,
    edits: edits.rows,
    publish,
    active: reels.rows.length + edits.rows.length + publishActive,
    failed: summary.failed || 0,
  });
}));

// Check liviano para que el cron de GitHub Actions (cada 30 min) no gaste minutos
// instalando dependencias cuando no hay nada que renderizar.
app.get('/api/cron/has-pending-renders', authCron, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM generated_assets a
          JOIN content_calendar c ON c.id = a.calendar_id
        WHERE c.post_type = 'reel' AND a.video_path IS NULL AND a.status != 'discarded')::int AS reels,
       (SELECT COUNT(*) FROM generated_assets
        WHERE edit_status = 'queued' AND video_path IS NOT NULL)::int AS edits`
  );
  const { reels, edits } = rows[0];
  res.json({ pending: reels + edits > 0, reels, edits });
}));

/* ----------------------- Calendario ----------------------- */
app.get('/api/calendar', wrap(async (req, res) => {
  const days = Math.min(Number(req.query.days || 14), 60);

  // Sólo sembramos si el calendario está vacío (no en cada carga: eso era lento).
  if (await calendarIsEmpty()) await seedCalendar(days);

  const { rows } = await pool.query(
    `SELECT c.*,
            a.id as asset_id, a.caption, a.hashtags, a.cta, a.image_path, a.video_path,
            a.meta_post_id, a.status as asset_status, a.format as asset_format, a.slides,
            a.edited_video_path, a.edit_status, a.voiceover_path, a.est_cost_usd, a.gen_model, a.qa_notes,
            p.name as product_name, p.image_url as product_image_url, p.price as product_price, p.stock as product_stock,
            COALESCE(cd.events, '[]'::json) AS commercial_dates
     FROM content_calendar c
     LEFT JOIN LATERAL (
       SELECT * FROM generated_assets WHERE calendar_id = c.id ORDER BY id DESC LIMIT 1
     ) a ON true
     LEFT JOIN products_cache p ON p.id = a.product_id
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
     WHERE c.scheduled_date >= CURRENT_DATE
     ORDER BY c.scheduled_date ASC, c.id ASC
     LIMIT $1`,
    [days]
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
  const { rows } = await pool.query(
    `INSERT INTO content_calendar
       (scheduled_date, platform, post_type, format, pillar, pillar_detail, automation_level,
        interaction_hint, scheduled_time, theme_title, carousel, status, origin)
     VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')
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

// Consumo de imágenes IA del mes (estimado en USD) + proyección a fin de mes.
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
  res.json({ month: now.toISOString().slice(0, 7), images: rows[0].images, usd, projection, byModel, enabled: config.ai.useAiImages });
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

app.get('/api/products', wrap(async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, stock, image_url
     FROM products_cache WHERE name ILIKE $1 ORDER BY synced_at DESC LIMIT 50`,
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

/* ----------------------- Generación / Assets ----------------------- */
app.post('/api/generate/:calendarId', wrap(async (req, res) => {
  const id = intParam(req.params.calendarId);
  if (!id) return res.status(400).json({ error: 'calendarId inválido' });

  const { rows } = await pool.query('SELECT * FROM content_calendar WHERE id = $1', [id]);
  let slot = rows[0];
  if (!slot) return res.status(404).json({ error: 'No existe ese slot de calendario' });
  if (slot.pillar === 'repost') return res.status(400).json({ error: 'Los slots de repost/descanso no se generan.' });

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

  const template = ['fullbleed', 'minimal', 'promo', 'educativo', 'mayorista'].includes(body.template) ? body.template : null;
  await generateForSlot(slot, { pillarDetail: newDetail || slot.pillar_detail, template });
  const { rows: assetRows } = await pool.query(
    `SELECT * FROM generated_assets WHERE calendar_id = $1 ORDER BY id DESC LIMIT 1`, [id]
  );
  res.json(assetRows[0]);
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
  await pool.query(
    `UPDATE generated_assets SET caption = COALESCE($2, caption), hashtags = COALESCE($3, hashtags),
       cta = COALESCE($4, cta), updated_at = now() WHERE id = $1`,
    [id, caption, hashtags, cta]
  );
  res.json({ ok: true });
}));

app.post('/api/assets/:assetId/discard', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  await pool.query(`UPDATE generated_assets SET status = 'discarded', updated_at = now() WHERE id = $1`, [id]);
  res.json({ ok: true });
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
    `SELECT a.caption, a.image_path, c.pillar_detail, c.theme_title, c.format,
            p.name as product_name, p.image_url as product_image_url, p.images as product_images
     FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
     LEFT JOIN products_cache p ON p.id = a.product_id WHERE a.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'No existe el asset' });
  const productImages = Array.isArray(r.product_images) && r.product_images.length
    ? r.product_images : [r.product_image_url || r.image_path].filter(Boolean);
  res.json(buildVideoPrompt({
    productName: r.product_name,
    productImages,
    theme: r.pillar_detail || r.theme_title,
    format: r.format,
    caption: r.caption,
  }));
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
});
