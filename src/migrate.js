const pool = require('./db');

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

CREATE INDEX IF NOT EXISTS idx_calendar_date ON content_calendar (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_assets_calendar ON generated_assets (calendar_id);
CREATE INDEX IF NOT EXISTS idx_insights_meta_post_id ON post_insights (meta_post_id);
`;

const ALTER_SQL = `
ALTER TABLE generated_assets ADD COLUMN IF NOT EXISTS video_path TEXT;
`;

async function migrate() {
  console.log('[migrate] Creando y actualizando tablas si no existen...');
  await pool.query(SQL);
  await pool.query(ALTER_SQL);
  console.log('[migrate] Listo.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
