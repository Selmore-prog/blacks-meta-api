const path = require('path');
const express = require('express');
const config = require('./config');
const pool = require('./db');
const { generateCopy } = require('./copywriter');
const { renderPostBuffer } = require('./imageRenderer');
const { renderReelVideo } = require('./videoRenderer');
const { seedCalendar } = require('./calendar');
const { generateDaily, generateForSlot } = require('../scripts/generate-daily');
const { publishAssetById, publishDailyAuto } = require('./publishService');
const { syncPostInsights, analyzePerformance } = require('./insights');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Middleware para validar secreto de Cron en endpoints automatizados
function authCron(req, res, next) {
  const authHeader = req.headers['authorization'];
  const cronHeader = req.headers['x-cron-secret'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : cronHeader;

  if (!token || token !== config.cronSecret) {
    return res.status(401).json({ error: 'Acceso no autorizado. CRON_SECRET inválido.' });
  }
  next();
}

// --- Endpoints para GitHub Actions Cron Jobs ---
app.post('/api/cron/generate-daily', authCron, async (req, res) => {
  try {
    const result = await generateDaily();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/generate-daily] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/publish-daily', authCron, async (req, res) => {
  try {
    const result = await publishDailyAuto();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/publish-daily] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/sync-insights', authCron, async (req, res) => {
  try {
    await syncPostInsights();
    res.json({ ok: true });
  } catch (err) {
    console.error('[cron/sync-insights] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Calendario: trae los próximos N días con su asset generado ---
app.get('/api/calendar', async (req, res) => {
  try {
    const days = Number(req.query.days || 14);
    await seedCalendar(days);

    const { rows } = await pool.query(
      `SELECT c.*,
              a.id as asset_id, a.caption, a.hashtags, a.cta, a.image_path, a.video_path, a.meta_post_id, a.status as asset_status,
              p.name as product_name, p.image_url as product_image_url, p.price as product_price
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Reporte de Métricas e Insights ---
app.get('/api/insights/report', async (req, res) => {
  try {
    const report = await analyzePerformance();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Lista de productos sincronizados ---
app.get('/api/products', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : '%';
    const { rows } = await pool.query(
      `SELECT id, name, brand, category, price, stock, image_url
       FROM products_cache WHERE name ILIKE $1 ORDER BY synced_at DESC LIMIT 50`,
      [search]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Genera copy + imagen/video para un slot puntual del calendario ---
app.post('/api/generate/:calendarId', async (req, res) => {
  const { calendarId } = req.params;
  try {
    const { rows: calendarRows } = await pool.query('SELECT * FROM content_calendar WHERE id = $1', [calendarId]);
    const slot = calendarRows[0];
    if (!slot) return res.status(404).json({ error: 'No existe ese slot de calendario' });

    await generateForSlot(slot);

    const { rows: assetRows } = await pool.query(
      `SELECT * FROM generated_assets WHERE calendar_id = $1 ORDER BY id DESC LIMIT 1`,
      [calendarId]
    );

    res.json(assetRows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Aprobar / Editar / Descartar / Publicar un asset generado ---
app.post('/api/assets/:assetId/approve', async (req, res) => {
  try {
    await pool.query(`UPDATE generated_assets SET status = 'approved', updated_at = now() WHERE id = $1`, [req.params.assetId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:assetId/edit', async (req, res) => {
  const { caption, hashtags, cta } = req.body || {};
  try {
    await pool.query(
      `UPDATE generated_assets SET caption = COALESCE($2, caption), hashtags = COALESCE($3, hashtags),
       cta = COALESCE($4, cta), updated_at = now() WHERE id = $1`,
      [req.params.assetId, caption, hashtags, cta]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:assetId/discard', async (req, res) => {
  try {
    await pool.query(`UPDATE generated_assets SET status = 'discarded', updated_at = now() WHERE id = $1`, [req.params.assetId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:assetId/publish', async (req, res) => {
  try {
    const result = await publishAssetById(req.params.assetId);
    res.json(result);
  } catch (err) {
    console.error('[server/publish]', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`[server] BLACKS content engine corriendo en puerto ${config.port}`);
});
