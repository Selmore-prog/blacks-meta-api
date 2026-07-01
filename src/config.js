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
    // Modelos gratuitos del tier de Google AI Studio.
    textModel: required('GEMINI_TEXT_MODEL', 'gemini-2.0-flash'),
    imageModel: required('GEMINI_IMAGE_MODEL', 'gemini-2.0-flash-preview-image-generation'),
    visionModel: required('GEMINI_VISION_MODEL', 'gemini-2.0-flash'),
  },

  ai: {
    // 'gemini' usa Gemini si hay key y cae a Groq si falla; 'groq' fuerza Groq.
    provider: required('AI_PROVIDER', geminiKey ? 'gemini' : 'groq'),
    // Generar imágenes con IA (Gemini) en vez de solo la plantilla Puppeteer.
    useAiImages: bool('AI_IMAGES', Boolean(geminiKey)),
  },

  supabase: {
    url: required('SUPABASE_URL'),
    key: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_ANON_KEY),
    bucket: required('SUPABASE_STORAGE_BUCKET', 'blacks-assets'),
  },

  cronSecret: required('CRON_SECRET', 'secret-dev'),

  meta: {
    pageAccessToken: required('META_PAGE_ACCESS_TOKEN'),
    igUserId: required('IG_USER_ID'),
    pageId: required('META_PAGE_ID'),
    apiVersion: 'v21.0',
    autoPublishPillars: (process.env.AUTO_PUBLISH_PILLARS || 'promo,producto').split(',').map((s) => s.trim()).filter(Boolean),
  },

  publicBaseUrl: required('PUBLIC_BASE_URL', 'http://localhost:8080'),

  brand: {
    name: 'BLACKS',
    instagram: '@blacks.indumentaria',
    colors: {
      black: '#0A0A0A',
      white: '#FFFFFF',
      darkOrange: '#C1440C',
    },
    knownBrands: ['Pampero', 'Ombu', 'Ombú', 'Grafa 70', 'Grafa70', 'Gurre'],
  },
};
