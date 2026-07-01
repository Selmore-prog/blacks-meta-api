const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const pool = require('./db');
const { seedCalendar, calendarIsEmpty } = require('./calendar');
const { generateForSlot } = require('../scripts/generate-daily');
const { generateDaily } = require('../scripts/generate-daily');
const { publishAssetById, publishDailyAuto } = require('./publishService');
const { syncPostInsights, analyzePerformance } = require('./insights');
const { getBrandProfile } = require('./brandProfile');
const styleService = require('./styleService');
const { importDriveFolder } = require('./driveService');
const { analyzeAccountPerformance } = require('./accountAnalyzer');
const { hasGemini } = require('./ai');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Envuelve handlers async para que cualquier rechazo caiga en el middleware de errores
// (evita 500s "colgados" y promesas sin manejar).
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
  res.json({
    ai: hasGemini() ? 'gemini' : (config.groq.apiKey ? 'groq' : 'none'),
    aiImages: config.ai.useAiImages,
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
  res.json({ ok: true, ...(await publishDailyAuto()) });
}));

app.post('/api/cron/sync-insights', authCron, wrap(async (req, res) => {
  await syncPostInsights();
  res.json({ ok: true });
}));

/* ----------------------- Calendario ----------------------- */
app.get('/api/calendar', wrap(async (req, res) => {
  const days = Math.min(Number(req.query.days || 14), 60);

  // Sólo sembramos si el calendario está vacío (no en cada carga: eso era lento).
  if (await calendarIsEmpty()) await seedCalendar(days);

  const { rows } = await pool.query(
    `SELECT c.*,
            a.id as asset_id, a.caption, a.hashtags, a.cta, a.image_path, a.video_path,
            a.meta_post_id, a.status as asset_status, a.format as asset_format,
            p.name as product_name, p.image_url as product_image_url, p.price as product_price, p.stock as product_stock
     FROM content_calendar c
     LEFT JOIN LATERAL (
       SELECT * FROM generated_assets WHERE calendar_id = c.id ORDER BY id DESC LIMIT 1
     ) a ON true
     LEFT JOIN products_cache p ON p.id = a.product_id
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

/* ----------------------- Insights / Productos ----------------------- */
app.get('/api/insights/report', wrap(async (req, res) => {
  res.json(await analyzePerformance());
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

  await generateForSlot(slot, { pillarDetail: newDetail || slot.pillar_detail });
  const { rows: assetRows } = await pool.query(
    `SELECT * FROM generated_assets WHERE calendar_id = $1 ORDER BY id DESC LIMIT 1`, [id]
  );
  res.json(assetRows[0]);
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

app.post('/api/assets/:assetId/publish', wrap(async (req, res) => {
  const id = intParam(req.params.assetId);
  if (!id) return res.status(400).json({ error: 'assetId inválido' });
  const force = Boolean(req.body && req.body.force);
  res.json(await publishAssetById(id, { force }));
}));

/* ----------------------- Estilo de marca ----------------------- */
app.get('/api/style', wrap(async (req, res) => {
  const [references, profile] = await Promise.all([styleService.listReferences(), getBrandProfile()]);
  res.json({ references, profile, geminiReady: hasGemini() });
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
  res.json(await importDriveFolder(url, { maxImages: Math.min(Number(maxImages) || 40, 80) }));
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
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

process.on('unhandledRejection', (reason) => console.error('[server] unhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('[server] uncaughtException:', err));

app.listen(config.port, () => {
  console.log(`[server] BLACKS content engine en puerto ${config.port} · IA: ${hasGemini() ? 'Gemini' : 'Groq'} · imágenes IA: ${config.ai.useAiImages}`);
});
