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
    autoPublishPillars: (process.env.AUTO_PUBLISH_PILLARS || 'promo,producto').split(',').map((s) => s.trim()).filter(Boolean),
    // Historia de refuerzo automática cuando se publica un post de feed (STORY_BOOST=false para apagarla).
    storyBoost: bool('STORY_BOOST', true),
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
    colors: {
      black: '#0A0A0A',
      white: '#FFFFFF',
      darkOrange: '#C1440C',
    },
    knownBrands: ['Pampero', 'Ombu', 'Ombú', 'Grafa 70', 'Grafa70', 'Gurre'],
  },
};
