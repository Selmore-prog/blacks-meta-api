const pool = require('../src/db');

/**
 * DESHABILITADO A PEDIDO: el auto-render (imagen estática con zoom lento) generaba
 * "videos" que no se quieren publicar. Los Reels ahora se completan a mano: se
 * genera el copy + la imagen base desde el panel, se crea el video real en
 * Gemini/Veo con el botón "Prompt video IA" y se sube con "Subir video".
 * La función queda como no-op para que el cron y los scripts existentes no rompan.
 */
async function renderPendingReels() {
  console.log('[render-pending-reels] Auto-render de Reels deshabilitado (los videos se generan en Gemini/Veo y se suben a mano).');
  return { renderedCount: 0, total: 0 };
}

if (require.main === module) {
  renderPendingReels()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[render-pending-reels] Error general:', err);
      process.exit(1);
    });
}

module.exports = { renderPendingReels };
