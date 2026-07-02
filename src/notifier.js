const config = require('./config');

/**
 * Notificaciones por Telegram (gratis, sin dependencias).
 * Se activa configurando TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID; si faltan, todo es no-op
 * para no romper ningún flujo.
 *
 * Cómo obtenerlos (una sola vez):
 *  1. En Telegram, hablale a @BotFather -> /newbot -> te da el TOKEN.
 *  2. Mandale un mensaje cualquiera a tu bot nuevo.
 *  3. Abrí https://api.telegram.org/bot<TOKEN>/getUpdates y copiá "chat":{"id":...} -> ese es el CHAT_ID.
 */
function isEnabled() {
  return Boolean(config.telegram.botToken && config.telegram.chatId);
}

/** Manda un mensaje de texto (Markdown simple). Nunca lanza: loguea y sigue. */
async function sendTelegram(text) {
  if (!isEnabled()) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: String(text).slice(0, 4000),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.warn('[notifier] Telegram no aceptó el mensaje:', JSON.stringify(data).slice(0, 200));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[notifier] Error mandando Telegram:', err.message);
    return { ok: false };
  }
}

/** Resumen después de la pasada de publicación automática. */
async function notifyPublishResult({ publishedCount, errors = [] }) {
  if (!isEnabled()) return;
  if (!publishedCount && !errors.length) return; // nada que contar
  const lines = [`*BLACKS · Publicación diaria*`];
  if (publishedCount) lines.push(`✅ ${publishedCount} pieza(s) publicada(s) en IG/FB.`);
  for (const e of errors) {
    lines.push(`⚠️ Asset #${e.assetId}: ${e.error}${e.willRetry ? ' _(se reintenta solo)_' : ' *(sin más reintentos — revisá el panel)*'}`);
  }
  await sendTelegram(lines.join('\n'));
}

/** Aviso de piezas esperando aprobación (se llama después de generar). */
async function notifyPendingApproval(count) {
  if (!isEnabled() || !count) return;
  await sendTelegram(`*BLACKS · Contenido nuevo*\n📝 Hay ${count} pieza(s) generadas esperando tu revisión en el panel:\n${config.publicBaseUrl}`);
}

/** Informe semanal con métricas por pilar y recomendación. */
async function notifyWeeklyReport({ pillars = [], recommendation = '' }) {
  if (!isEnabled()) return;
  const lines = [`*BLACKS · Informe semanal*`];
  if (!pillars.length) {
    lines.push('Todavía no hay publicaciones con métricas.');
  } else {
    for (const p of pillars) {
      lines.push(`• *${p.pillar}*: ${p.posts_count} post(s), alcance prom. ${p.avg_reach ?? 0}, likes prom. ${p.avg_likes ?? 0}`);
    }
  }
  if (recommendation) lines.push(`\n💡 ${recommendation}`);
  await sendTelegram(lines.join('\n'));
}

module.exports = { isEnabled, sendTelegram, notifyPublishResult, notifyPendingApproval, notifyWeeklyReport };
