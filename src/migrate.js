const pool = require('./db');
const { seedCommercialDates } = require('./commercialDates');

const SQL = `
CREATE TABLE IF NOT EXISTS products_cache (
  id              BIGINT PRIMARY KEY,            -- id del producto en Tiendanube
  name            TEXT NOT NULL,
  brand           TEXT,                          -- Pampero / Ombu / Grafa 70 / Gurre / null
  category        TEXT,
  price           NUMERIC,
  stock           INTEGER,
  image_url       TEXT,
  permalink       TEXT,
  raw             JSONB,                         -- respuesta cruda de Tiendanube, por si hace falta algo mas adelante
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_calendar (
  id              SERIAL PRIMARY KEY,
  scheduled_date  DATE NOT NULL,
  platform        TEXT NOT NULL,                 -- 'instagram' | 'facebook'
  post_type       TEXT NOT NULL,                 -- 'feed' | 'reel' | 'story'
  pillar          TEXT NOT NULL,                 -- 'producto' | 'educativo' | 'promo' | 'marca' | 'mayorista' | 'ugc' | 'engagement' | 'repost'
  pillar_detail   TEXT,                          -- ej: nombre de la marca destacada esa semana
  status          TEXT NOT NULL DEFAULT 'pending',-- 'pending' | 'draft' | 'approved' | 'published' | 'skipped'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheduled_date, platform, post_type)
);

CREATE TABLE IF NOT EXISTS generated_assets (
  id              SERIAL PRIMARY KEY,
  calendar_id     INTEGER NOT NULL REFERENCES content_calendar(id) ON DELETE CASCADE,
  product_id      BIGINT REFERENCES products_cache(id),
  caption         TEXT,
  hashtags        TEXT,
  cta             TEXT,
  image_path      TEXT,                          -- URL publica en Supabase Storage o ruta de la imagen generada
  video_path      TEXT,                          -- URL publica en Supabase Storage o ruta del reel generado
  status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'approved' | 'published' | 'discarded'
  meta_post_id    TEXT,                           -- id devuelto por la Graph API una vez publicado (fase 2)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_insights (
  id              SERIAL PRIMARY KEY,
  asset_id        INTEGER REFERENCES generated_assets(id) ON DELETE CASCADE,
  meta_post_id    TEXT NOT NULL UNIQUE,
  reach           INTEGER DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  saved           INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfil de marca aprendido (guia de estilo + voz). Fila unica id = 1.
CREATE TABLE IF NOT EXISTS brand_profile (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  style_guide     JSONB,                          -- {paleta, composicion, formato, elementos...}
  voice_guide     TEXT,                           -- resumen de tono/vocabulario argentino de la cuenta
  sample_captions JSONB,                          -- captions reales de la cuenta usados de referencia
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_profile_singleton CHECK (id = 1)
);

-- Piezas de referencia (subidas al panel o linkeadas) para que la IA aprenda el estilo.
CREATE TABLE IF NOT EXISTS style_references (
  id              SERIAL PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'link'
  source          TEXT,                           -- 'upload' | 'drive' | 'url' | 'instagram'
  url             TEXT,                           -- URL publica (Supabase / Drive directo / IG)
  storage_path    TEXT,                           -- path dentro del bucket si fue subida
  caption         TEXT,                           -- texto que acompanaba la pieza (si se conoce)
  analysis        JSONB,                          -- lo que Gemini extrajo de esta pieza puntual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Condiciones mayoristas editables (fila única id = 1).
CREATE TABLE IF NOT EXISTS wholesale_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  min_qty         INTEGER,                        -- cantidad mínima de compra
  conditions      TEXT,                           -- condiciones/beneficios (texto libre)
  discount_note   TEXT,                           -- ej: "descuentos por volumen"
  contact         TEXT,                           -- cómo pedir presupuesto
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_singleton CHECK (id = 1)
);

-- Cola de publicación con reintentos: si Meta falla en el horario de publicación,
-- el post queda encolado y se reintenta en la próxima pasada del cron.
CREATE TABLE IF NOT EXISTS publish_queue (
  id              SERIAL PRIMARY KEY,
  asset_id        INTEGER NOT NULL UNIQUE REFERENCES generated_assets(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'queued',   -- 'queued' | 'processing' | 'done' | 'failed'
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_dates (
  id              SERIAL PRIMARY KEY,
  event_date      DATE NOT NULL,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'promo', -- promo|temporada|marca|engagement
  angle           TEXT,
  priority        INTEGER NOT NULL DEFAULT 5,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_date, title)
);

-- Plan mensual generado con IA (planner). Un plan por mes; seedCalendar lo usa
-- día a día y cae a la ROTATION fija si un día no tiene plan.
CREATE TABLE IF NOT EXISTS rotation_plans (
  id              SERIAL PRIMARY KEY,
  month           TEXT NOT NULL UNIQUE,           -- 'YYYY-MM'
  plan            JSONB NOT NULL,                 -- [{date, post_type, format, pillar, ...}]
  source          TEXT NOT NULL DEFAULT 'ai',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumo de IA generativa (imágenes): cada generación con su costo estimado en USD.
CREATE TABLE IF NOT EXISTS ai_usage (
  id              SERIAL PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'image',
  model           TEXT,
  purpose         TEXT,
  est_cost_usd    NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estudio creativo: imágenes/videos generados aparte de las piezas del calendario,
-- con uno o varios productos (combo). path = URL pública en Supabase Storage.
CREATE TABLE IF NOT EXISTS studio_assets (
  id              SERIAL PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
  path            TEXT NOT NULL,
  prompt          TEXT,                           -- prompt usado (imagen) o entregado (video)
  product_ids     BIGINT[],                       -- productos protagonistas
  product_names   TEXT,                           -- nombres al momento de generar (por si cambian)
  format          TEXT DEFAULT 'feed',            -- 'feed' 4:5 | 'story' 9:16
  est_cost_usd    NUMERIC DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON content_calendar (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_publish_queue_status ON publish_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_commercial_dates_date ON commercial_dates (event_date);
CREATE INDEX IF NOT EXISTS idx_assets_calendar ON generated_assets (calendar_id);
CREATE INDEX IF NOT EXISTS idx_insights_meta_post_id ON post_insights (meta_post_id);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products_cache (stock);
`;

// Columnas nuevas agregadas de forma incremental (no rompen datos existentes).
const ALTER_SQL = `
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS video_path TEXT;
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS format TEXT;             -- 'feed' | 'story'
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS sales_30d INTEGER DEFAULT 0; -- unidades vendidas ult. 30 días
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS promo_price NUMERIC; -- precio promocional (si está en oferta)
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS images JSONB;         -- todas las fotos del producto (distintas perspectivas)
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS description TEXT;     -- descripción de Tiendanube (características)
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS slides JSONB;       -- URLs de las slides del carrusel (la 1a = image_path)
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS carousel BOOLEAN DEFAULT false;
-- Editor de video:
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS subtitles JSONB;        -- palabras con tiempos (editables)
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS overlays JSONB;         -- textos sobre el video [{text,start,end}]
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS voiceover_path TEXT;    -- pista de voz en off subida
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS edited_video_path TEXT; -- video final con subtítulos quemados
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS edit_status TEXT DEFAULT 'none'; -- none|queued|processing|done|error
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS edit_style JSONB;       -- estilo de subtítulos elegido
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS format TEXT;             -- 'feed' (4:5) | 'story' (9:16)
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS automation_level TEXT DEFAULT 'auto'; -- 'auto' | 'semi'
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS interaction_hint TEXT;   -- sticker/interaccion a agregar a mano
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS scheduled_time TEXT;     -- 'HH:MM' hora ARG sugerida
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS theme_title TEXT;        -- tematica/titulo del dia
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'rotation'; -- 'rotation' | 'plan' | 'manual'
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS template TEXT; -- plantilla visual usada (fullbleed|minimal|promo|educativo|mayorista)
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS story_teaser_path TEXT; -- historia 9:16 de refuerzo pre-renderizada (se publica al salir el feed)
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS variant TEXT; -- logos: 'dark' (tinta oscura, va en fondo claro) | 'light' (tinta clara, va en fondo oscuro)
-- Costo real de cada pieza en imágenes IA (Ronda 37). 0 = se generó gratis.
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS est_cost_usd NUMERIC DEFAULT 0;
-- Objetivo de cada pieza (Ronda 40): venta | trafico | confianza | comunidad.
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS objective TEXT;
-- QA del copy (Ronda 38): con qué modelo salió y qué problemas quedaron (null = limpio).
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS gen_model TEXT;
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS qa_notes TEXT;
-- Producto FIJADO a mano desde el panel (pilar 'producto'): si está seteado, el
-- generador usa EXACTAMENTE este producto en vez de elegirlo automáticamente.
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS forced_product_id BIGINT REFERENCES products_cache(id);
-- Receta de cada slide del carrusel (para regenerar UNO solo con correcciones):
-- [{kind, shotType, photoIndex, extraPhotos, background, focus, overlay, badge}]
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS slides_meta JSONB;
-- Sticker interactivo (piezas semi): especificación exacta generada con el copy
-- {type: encuesta|quiz|pregunta|slider, question, options: [..], correct_index}.
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS sticker JSONB;
-- Curva de talles (Ronda 36): para no protagonizar productos con stock en un solo talle.
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS sizes_total INTEGER;    -- variantes/talles del producto
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS sizes_in_stock INTEGER; -- variantes/talles con stock
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS size_coverage NUMERIC;  -- sizes_in_stock / sizes_total (0-1)

-- Rellenar 'format' en filas viejas segun post_type (feed=4:5, reel/story=9:16).
UPDATE content_calendar SET format = CASE WHEN post_type = 'feed' THEN 'feed' ELSE 'story' END WHERE format IS NULL;
UPDATE content_calendar SET automation_level = 'auto' WHERE automation_level IS NULL;
`;

/**
 * Backfill de la curva de talles para productos ya cacheados: se recalcula desde
 * el JSON crudo de Tiendanube (raw) sin tocar la API. Sólo filas sin calcular.
 */
async function backfillSizeCoverage() {
  const { rows } = await pool.query(
    `SELECT id, raw FROM products_cache WHERE sizes_total IS NULL AND raw IS NOT NULL`
  );
  if (!rows.length) return;
  const { normalizeProduct } = require('./tiendanube');
  let done = 0;
  for (const row of rows) {
    try {
      const raw = typeof row.raw === 'string' ? JSON.parse(row.raw) : row.raw;
      const p = normalizeProduct(raw);
      await pool.query(
        `UPDATE products_cache SET sizes_total = $2, sizes_in_stock = $3, size_coverage = $4 WHERE id = $1`,
        [row.id, p.sizes_total, p.sizes_in_stock, p.size_coverage]
      );
      done += 1;
    } catch (err) {
      console.warn(`[migrate] No pude calcular talles del producto ${row.id}: ${err.message}`);
    }
  }
  console.log(`[migrate] Curva de talles calculada para ${done} producto(s).`);
}

async function migrate() {
  console.log('[migrate] Creando y actualizando tablas si no existen...');
  await pool.query(SQL);
  await pool.query(ALTER_SQL);
  // Asegurar la fila unica del perfil de marca.
  await pool.query(`INSERT INTO brand_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await seedCommercialDates({ fromYear: new Date().getFullYear(), years: 2 });
  await backfillSizeCoverage();
  console.log('[migrate] Listo.');
  await pool.end();
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('[migrate] Error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
