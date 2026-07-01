const config = require('./config');

/**
 * Trae los captions reales de las últimas publicaciones de la cuenta de Instagram
 * para aprender el idioma/vocabulario que se venía usando (voz real de la cuenta).
 */
async function fetchRecentCaptions(limit = 25) {
  const { igUserId, pageAccessToken, apiVersion } = config.meta;
  if (!igUserId || !pageAccessToken) {
    throw new Error('Faltan IG_USER_ID / META_PAGE_ACCESS_TOKEN para leer la cuenta.');
  }
  const url = `https://graph.facebook.com/${apiVersion}/${igUserId}/media?fields=caption,media_type,media_url,thumbnail_url,timestamp&limit=${limit}&access_token=${pageAccessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Graph API: ${data.error.message}`);

  const items = (data.data || []).map((m) => ({
    caption: (m.caption || '').trim(),
    media_type: m.media_type,
    image_url: m.media_url || m.thumbnail_url || null,
    timestamp: m.timestamp,
  }));

  return {
    captions: items.map((i) => i.caption).filter(Boolean),
    media: items,
  };
}

module.exports = { fetchRecentCaptions };
