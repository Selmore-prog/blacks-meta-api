require('dotenv').config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(String(v).toLowerCase());
}

const geminiKey = required('GEMINI_API_KEY', process.env.GOOGLE_API_KEY);

module.exports = {
  port: process.env.PORT || 8080,

  // Zona horaria de referencia para todo el calendario/horarios.
  timezone: required('TZ_DISPLAY', 'America/Argentina/Buenos_Aires'),

  databaseUrl: required('DATABASE_URL'),

  tiendanube: {
    storeId: required('TIENDANUBE_STORE_ID'),
    accessToken: required('TIENDANUBE_ACCESS_TOKEN'),
    userAgent: required('TIENDANUBE_USER_AGENT', 'BlacksContentEngine (contacto@blacksindumentaria.com.ar)'),
    authHeaderStyle: required('TIENDANUBE_AUTH_HEADER_STYLE', 'authorization'),
    apiBase: 'https://api.tiendanube.com/v1',
  },

  groq: {
    apiKey: required('GROQ_API_KEY'),
    model: required('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  },

  gemini: {
    apiKey: geminiKey,
    // gemini-2.5-flash: texto/visión GRATIS en el tier de Google AI Studio.
    textModel: required('GEMINI_TEXT_MODEL', 'gemini-2.5-flash'),
    // gemini-2.5-flash-image (Nano Banana): generación de imágenes. OJO: NO es gratis
    // (da 429 en el tier gratuito). Sólo se usa si AI_IMAGES=true y activaste facturación.
    imageModel: required('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image'),
    visionModel: required('GEMINI_VISION_MODEL', 'gemini-2.5-flash'),
  },

  ai: {
    // 'gemini' usa Gemini si hay key y cae a Groq si falla; 'groq' fuerza Groq.
    provider: required('AI_PROVIDER', geminiKey ? 'gemini' : 'groq'),
    // Generar imágenes con IA (paga en Gemini). Por defecto APAGADO para no incurrir en costo:
    // las piezas se arman con la plantilla profesional (gratis). Activá AI_IMAGES=true sólo
    // si habilitaste facturación en Google y querés escenas generadas con IA.
    useAiImages: bool('AI_IMAGES', false),
  },

  supabase: {
    url: required('SUPABASE_URL'),
    key: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_ANON_KEY),
    bucket: required('SUPABASE_STORAGE_BUCKET', 'blacks-assets'),
  },

  cronSecret: required('CRON_SECRET', 'secret-dev'),

  // Google Analytics 4 de la tienda (Tiendanube). Ver src/analytics.js.
  ga: {
    propertyId: required('GA_PROPERTY_ID', ''),
    credentialsB64: required('GA_CREDENTIALS_B64', ''),
  },

  // Notificaciones por Telegram (opcionales, gratis). Ver src/notifier.js para el paso a paso.
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN', ''),
    chatId: required('TELEGRAM_CHAT_ID', ''),
  },

  // Contraseña del panel. Si está vacía, el panel queda SIN login (como antes) —
  // seteala en Render para cerrar el acceso público.
  dashboardPassword: required('DASHBOARD_PASSWORD', ''),

  meta: {
    pageAccessToken: required('META_PAGE_ACCESS_TOKEN'),
    igUserId: required('IG_USER_ID'),
    pageId: required('META_PAGE_ID'),
    apiVersion: 'v21.0',
    // Lectura de la cuenta publicitaria (gasto, ROAS, CAC). Token con scope ads_read;
    // si no hay uno específico, se intenta con el de página. Sin adAccountId, la
    // sección de pauta del panel simplemente no aparece (best-effort).
    adsAccessToken: process.env.META_ADS_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || null,
    adAccountId: process.env.META_AD_ACCOUNT_ID || null,
    // Catálogo de Meta a mantener sincronizado con el stock real de Tiendanube
    // (el que usan los anuncios dinámicos). Sin esto, el sincronizador no corre.
    catalogId: process.env.META_CATALOG_ID || null,
    autoPublishPillars: (process.env.AUTO_PUBLISH_PILLARS || 'promo,producto').split(',').map((s) => s.trim()).filter(Boolean),
    // AUTO_APPROVE=true: las piezas de HOY que salieron limpias del control de calidad
    // (copy sin problemas, modelo principal, no reels sin video, slot automático) se
    // aprueban solas antes de encolar la publicación diaria. Apagado por defecto:
    // sin la variable seguís aprobando todo a mano desde el panel.
    autoApprove: bool('AUTO_APPROVE', false),
    // Historia de refuerzo automática cuando se publica un post de feed (STORY_BOOST=false para apagarla).
    // Nota: hoy queda apagada de fábrica porque la API no permite LINKEAR la historia al
    // post del feed (eso es sólo en la app), y una historia suelta no sirve de refuerzo.
    storyBoost: bool('STORY_BOOST', false),
    // Ventana de auto-publicación: si una pieza no se publicó dentro de X minutos de su
    // horario (por un error/retraso), NO se publica tarde (no sirve postear a las 21hs una
    // pieza de las 17:30). Queda 'failed' para republicar a mano. Manual no tiene este límite.
    maxPublishDelayMin: Number(process.env.PUBLISH_MAX_DELAY_MIN) || 120,
  },

  publicBaseUrl: required('PUBLIC_BASE_URL', 'http://localhost:8080'),

  brand: {
    name: 'BLACKS',
    instagram: '@blacks.indumentaria',
    site: 'www.blacksindumentaria.com.ar',
    // Dominios viejos que NO deben aparecer nunca en el copy generado.
    oldSites: ['blackshop.com.ar', 'blackshop.com', 'www.blackshop.com.ar', 'blackshop'],
    // Texto fijo del beneficio por transferencia (aparece en el bloque de precio).
    transferNote: required('BRAND_TRANSFER_NOTE', '10% de descuento pagando con transferencia'),
    // Slide de CIERRE (CTA) de los carruseles de feed: en vez de precio (que envejece)
    // va un llamado a la acción con los beneficios. Editables por variable de entorno.
    ctaHeadline: required('BRAND_CTA_HEADLINE', 'Conseguilas en la web'),
    ctaBenefits: required('BRAND_CTA_BENEFITS', '6 cuotas sin interés · Envío gratis a todo el país')
      .split(/·|\|/).map((s) => s.trim()).filter(Boolean),
    colors: {
      black: '#0A0A0A',
      white: '#FFFFFF',
      darkOrange: '#C1440C',
    },
    knownBrands: ['Pampero', 'Ombu', 'Ombú', 'Grafa 70', 'Grafa70', 'Gurre', 'Rueda'],
  },
};
