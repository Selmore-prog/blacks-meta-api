const pool = require('./db');

/** Devuelve la fila única del perfil de marca (id=1) o un objeto vacío. */
async function getBrandProfile() {
  const { rows } = await pool.query(`SELECT * FROM brand_profile WHERE id = 1`);
  return rows[0] || { id: 1, style_guide: null, voice_guide: null, sample_captions: null };
}

async function saveBrandProfile({ style_guide, voice_guide, sample_captions }) {
  await pool.query(
    `INSERT INTO brand_profile (id, style_guide, voice_guide, sample_captions, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       style_guide = COALESCE(EXCLUDED.style_guide, brand_profile.style_guide),
       voice_guide = COALESCE(EXCLUDED.voice_guide, brand_profile.voice_guide),
       sample_captions = COALESCE(EXCLUDED.sample_captions, brand_profile.sample_captions),
       updated_at = now()`,
    [style_guide ? JSON.stringify(style_guide) : null, voice_guide || null, sample_captions ? JSON.stringify(sample_captions) : null]
  );
  return getBrandProfile();
}

module.exports = { getBrandProfile, saveBrandProfile };
