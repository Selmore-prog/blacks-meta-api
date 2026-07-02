const pool = require('../src/db');
const { runStyleAnalysis } = require('../src/styleService');

/** Análisis de estilo automático (cron cada ~48h). Requiere GEMINI_API_KEY. */
async function main() {
  console.log('[analyze-style] Corriendo análisis de estilo automático...');
  try {
    const r = await runStyleAnalysis({ includeAccount: true });
    console.log(`[analyze-style] Listo. ${r.analyzedImages} piezas, ${r.analyzedCaptions} captions.`);
  } catch (err) {
    console.error('[analyze-style] Error:', err.message);
  }
  await pool.end();
}

main();
