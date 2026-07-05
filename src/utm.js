const config = require('./config');

/**
 * Links a la tienda con UTMs de atribución del motor.
 *
 * La campaña lleva el ID del slot del calendario (engine_<calendarId>): al cruzar
 * después con Google Analytics (dimensión sessionCampaignName) se sabe exactamente
 * qué pieza trajo cada visita y cada compra.
 *
 * Dónde sirve de verdad: Instagram NO hace clickeables los links de los captions
 * de feed, así que meter URLs ahí sólo ensucia el texto. El link con UTM va donde
 * hay click real: el sticker de link de las historias semi-manuales (el modal de
 * publicación manual lo ofrece listo para copiar) y el link de la bio.
 */
function utmLink(baseUrl, { calendarId, pillar } = {}) {
  if (!baseUrl) return null;
  const withProto = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  try {
    const u = new URL(withProto);
    u.searchParams.set('utm_source', 'instagram');
    u.searchParams.set('utm_medium', 'organic');
    u.searchParams.set('utm_campaign', `engine_${calendarId || 'general'}`);
    if (pillar) u.searchParams.set('utm_content', pillar);
    return u.toString();
  } catch (_) {
    return baseUrl;
  }
}

/** Link a la home de la tienda con UTMs (cuando la pieza no tiene producto puntual). */
function storeUtmLink(opts = {}) {
  return utmLink(config.brand.site, opts);
}

module.exports = { utmLink, storeUtmLink };
