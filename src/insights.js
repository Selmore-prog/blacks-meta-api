const pool = require('./db');
const config = require('./config');

/**
 * Consulta las métricas de un post publicado en Instagram y las actualiza en post_insights.
 */
async function syncPostInsights() {
  const { pageAccessToken, apiVersion } = config.meta;
  if (!pageAccessToken) {
    console.warn('[insights] META_PAGE_ACCESS_TOKEN no configurado. Omitiendo sincronización de insights.');
    return;
  }

  // Traer todos los assets en estado published que tengan meta_post_id
  const { rows: publishedAssets } = await pool.query(
    `SELECT id, meta_post_id FROM generated_assets WHERE status = 'published' AND meta_post_id IS NOT NULL`
  );

  console.log(`[insights] Sincronizando métricas para ${publishedAssets.length} post(s)...`);

  for (const asset of publishedAssets) {
    try {
      // Instagram Graph API endpoint para insights de media
      const metrics = 'reach,impressions,saved,shares,likes,comments';
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${asset.meta_post_id}/insights?metric=${metrics}&access_token=${pageAccessToken}`
      );
      const data = await res.json();

      if (data.error) {
        console.error(`[insights] Error fetching insights para ${asset.meta_post_id}:`, data.error.message);
        continue;
      }

      const values = {
        reach: 0,
        impressions: 0,
        saved: 0,
        shares: 0,
        likes: 0,
        comments: 0,
      };

      for (const item of data.data || []) {
        const val = item.values && item.values[0] ? item.values[0].value : 0;
        if (item.name in values) values[item.name] = val;
      }

      await pool.query(
        `INSERT INTO post_insights (asset_id, meta_post_id, reach, impressions, saved, shares, likes, comments, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (meta_post_id) DO UPDATE SET
           reach = EXCLUDED.reach,
           impressions = EXCLUDED.impressions,
           saved = EXCLUDED.saved,
           shares = EXCLUDED.shares,
           likes = EXCLUDED.likes,
           comments = EXCLUDED.comments,
           fetched_at = now()`,
        [asset.id, asset.meta_post_id, values.reach, values.impressions, values.saved, values.shares, values.likes, values.comments]
      );
      console.log(`[insights] Actualizado post ${asset.meta_post_id} -> reach: ${values.reach}`);
    } catch (err) {
      console.error(`[insights] Error general en asset ${asset.id}:`, err.message);
    }
  }
}

/**
 * Agrupa las métricas por pilar y genera un resumen comparativo con sugerencias.
 */
async function analyzePerformance() {
  const { rows } = await pool.query(
    `SELECT c.pillar,
            COUNT(i.id) as posts_count,
            AVG(i.reach)::int as avg_reach,
            AVG(i.impressions)::int as avg_impressions,
            AVG(i.saved)::int as avg_saved,
            AVG(i.shares)::int as avg_shares,
            AVG(i.likes)::int as avg_likes
     FROM post_insights i
     JOIN generated_assets a ON a.id = i.asset_id
     JOIN content_calendar c ON c.id = a.calendar_id
     GROUP BY c.pillar
     ORDER BY avg_reach DESC`
  );

  let recommendation = 'Aún no hay suficientes datos para sugerir ajustes de rotación.';
  if (rows.length >= 2) {
    const topPillar = rows[0];
    const bottomPillar = rows[rows.length - 1];
    if (topPillar.avg_reach > bottomPillar.avg_reach * 1.3) {
      recommendation = `El pilar "${topPillar.pillar}" supera en alcance promedio (${topPillar.avg_reach}) en más de un 30% a "${bottomPillar.pillar}" (${bottomPillar.avg_reach}). Se recomienda aumentar la proporción de slots de "${topPillar.pillar}" en el calendario.`;
    }
  }

  return {
    pillars: rows,
    recommendation,
  };
}

module.exports = {
  syncPostInsights,
  analyzePerformance,
};
