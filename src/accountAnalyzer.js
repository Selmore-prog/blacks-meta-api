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

function fmtHour(date) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(date);
}
function fmtDay(date) {
  const d = new Intl.DateTimeFormat('es-AR', { timeZone: config.timezone, weekday: 'long' }).format(date);
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function avgRank(map, key) {
  return Object.entries(map)
    .map(([k, v]) => ({ [key]: k, posts: v.n, avgEngagement: Math.round(v.eng / v.n) }))
    .filter((x) => x.posts >= 2)
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

/**
 * Analiza el contenido previo de la cuenta: qué horario, día, formato y hashtags
 * rindieron mejor (engagement = likes + comentarios). Sirve para afinar la estrategia.
 * NOTA: la Graph API de Meta no expone el audio/música de los reels.
 */
async function analyzeAccountPerformance(limit = 60) {
  const { igUserId, pageAccessToken, apiVersion } = config.meta;
  if (!igUserId || !pageAccessToken) throw new Error('Faltan IG_USER_ID / META_PAGE_ACCESS_TOKEN.');

  const fields = 'caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink';
  const url = `https://graph.facebook.com/${apiVersion}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Graph API: ${data.error.message}`);

  const media = data.data || [];
  const byHour = {}, byDay = {}, byFormat = {}, byTag = {};
  let totalEng = 0;

  for (const m of media) {
    const eng = (m.like_count || 0) + (m.comments_count || 0);
    totalEng += eng;
    const date = m.timestamp ? new Date(m.timestamp) : null;
    if (date) {
      const h = fmtHour(date), d = fmtDay(date);
      (byHour[h] = byHour[h] || { n: 0, eng: 0 }).n++; byHour[h].eng += eng;
      (byDay[d] = byDay[d] || { n: 0, eng: 0 }).n++; byDay[d].eng += eng;
    }
    const fmt = m.media_product_type || m.media_type || 'IMAGE';
    (byFormat[fmt] = byFormat[fmt] || { n: 0, eng: 0 }).n++; byFormat[fmt].eng += eng;
    for (const tag of (m.caption || '').match(/#[\wáéíóúñÁÉÍÓÚÑ]+/g) || []) {
      const t = tag.toLowerCase();
      (byTag[t] = byTag[t] || { n: 0, eng: 0 }).n++; byTag[t].eng += eng;
    }
  }

  const topPosts = media
    .map((m) => ({ permalink: m.permalink, engagement: (m.like_count || 0) + (m.comments_count || 0),
                   format: m.media_product_type || m.media_type, caption: (m.caption || '').slice(0, 120) }))
    .sort((a, b) => b.engagement - a.engagement).slice(0, 5);

  return {
    analyzed: media.length,
    avgEngagement: media.length ? Math.round(totalEng / media.length) : 0,
    bestHours: avgRank(byHour, 'hour').slice(0, 5),
    bestDays: avgRank(byDay, 'day').slice(0, 4),
    byFormat: avgRank(byFormat, 'format'),
    topHashtags: avgRank(byTag, 'tag').slice(0, 12),
    topPosts,
    note: 'La API de Meta no expone el audio/música de los reels, así que eso no se puede analizar automáticamente.',
  };
}

module.exports = { fetchRecentCaptions, analyzeAccountPerformance };
