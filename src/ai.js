const config = require('./config');
const { resizeImage } = require('./imageUtils');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function hasGemini() {
  return Boolean(config.gemini.apiKey);
}

function preferGemini() {
  return config.ai.provider === 'gemini' && hasGemini();
}

/* =========================================================================
 * VOZ DE MARCA (rioplatense, humana, anti-"suena a IA")
 * ========================================================================= */

const VOICE_CORE = `Sos el/la community manager y copywriter de BLACKS Indumentaria (@blacks.indumentaria), una marca ARGENTINA de indumentaria de trabajo/industria (remeras, pantalones cargo, camisas, buzos, camperas, mamelucos, chalecos) y calzado de seguridad (botines y zapatos con o sin puntera de acero). Vende las marcas Pampero, Ombú, Grafa 70 y Gurre. Atiende venta minorista y también mayorista/corporativa (uniformes con logo para empresas).

ESCRIBÍS EN ESPAÑOL RIOPLATENSE (ARGENTINA), NATURAL Y HUMANO:
- Voseo SIEMPRE: "conseguí", "llevate", "fijate", "aprovechá", "mirá", "pedí". Nunca tuteo ("consigue", "llévate", "mira").
- Hablás como una persona real de Argentina, no como un aviso traducido ni como una IA. Cero tono neutro/mexicano/español.
- Vocabulario real del rubro y del país: "ropa de laburo", "para el laburo", "calzado de seguridad", "puntera de acero", "en cuotas", "por transferencia", "envío a todo el país", "retirás por el local", "presupuesto para tu empresa", "aguanta los trapos".
- Tono: directo, canchero pero profesional, sin vueltas. Le hablás a alguien que trabaja con las manos y valora que le dure y le rinda la plata. Nunca grandilocuente ni motivacional trucho.

REGLAS DURAS PARA QUE NO SUENE A IA (si rompés esto, está mal):
- PROHIBIDO: "descubrí/descubre", "eleva/llevá tu X al siguiente nivel", "no te lo pierdas", "en el mundo de", "sumérgete", "potenciá tu experiencia", "calidad premium excepcional", "vive la experiencia", cadenas de signos de exclamación.
- Nada de frases genéricas de catálogo. Decí algo CONCRETO: para qué sirve, el aguante, la terminación, para qué laburo va, el beneficio real.
- Máximo 1 o 2 emojis por pieza, sólo si suman. Muchas veces, ninguno.
- Un solo CTA claro por pieza. Nunca dos llamados a la acción.

SITIO WEB: es ${config.brand.site}. NUNCA menciones "blackshop.com.ar" ni ningún dominio viejo: ese sitio ya no existe.

HASHTAGS: 4 a 6, mezclando marca (#BlacksIndumentaria), rubro (#RopaDeTrabajo #CalzadoDeSeguridad #IndumentariaLaboral), la marca/producto puntual y algo local cuando aplique (#Argentina). Nada de #instagood ni genéricos vacíos.`;

/** Reemplaza dominios viejos por el sitio actual en cualquier texto generado. */
function sanitizeText(text) {
  if (!text) return text;
  let out = String(text);
  for (const old of config.brand.oldSites || []) {
    out = out.replace(new RegExp(old.replace(/[.]/g, '\\.'), 'gi'), config.brand.site);
  }
  return out;
}

function sanitizeCopy(copy) {
  return {
    overlay: sanitizeText(copy.overlay),
    caption: sanitizeText(copy.caption),
    hashtags: sanitizeText(copy.hashtags),
    cta: sanitizeText(copy.cta),
  };
}

function formatGuidance(postType, format) {
  if (format === 'story' && postType !== 'reel') {
    return `FORMATO: Historia de Instagram (vertical 9:16, se ve pocos segundos).
- "overlay" = texto MUY corto y con gancho para poner ARRIBA de la imagen (máx ~6 palabras).
- "caption" = 1 línea corta de apoyo (la historia casi no se lee, va al grano).
- Pensá algo que invite a tocar/deslizar/responder.`;
  }
  if (postType === 'reel') {
    return `FORMATO: Reel (video vertical 9:16).
- "overlay" = el gancho del primer segundo (texto corto que aparece en pantalla).
- "caption" = 2 a 4 líneas para el pie del Reel, con ritmo, que dé ganas de ver el video.`;
  }
  return `FORMATO: Post de feed (imagen 4:5).
- "overlay" = título corto y potente para poner sobre la imagen (máx ~7 palabras).
- "caption" = 2 a 5 líneas para el pie del posteo. Primera línea = gancho fuerte (se ve antes del "ver más").`;
}

// Temporada del hemisferio SUR (Argentina) según el mes actual.
function seasonContext(date = new Date()) {
  const m = date.getMonth();
  let estacion, nota;
  if (m === 11 || m <= 1) { estacion = 'verano'; nota = 'hace calor: remeras, chombas, ropa fresca y liviana para el laburo.'; }
  else if (m <= 4) { estacion = 'otoño'; nota = 'refresca: buzos, camperas livianas, media estación.'; }
  else if (m <= 7) { estacion = 'invierno'; nota = 'hace frío: camperas, buzos, polares, softshell, ropa térmica, abrigo para el laburo a la intemperie.'; }
  else { estacion = 'primavera'; nota = 'empieza a templar: buzos livianos, camperas rompeviento, media estación.'; }
  return `Estamos en ${estacion} en Argentina — ${nota} Si encaja, mencioná el clima/temporada de forma natural (sin forzar).`;
}

function buildCopyPrompt({ pillar, pillarDetail, postType, format, product, brandProfile, interactionHint }) {
  const productInfo = product
    ? `Producto a destacar: ${product.name}${product.brand ? ` (marca ${product.brand})` : ''}${product.price ? `, precio $${Number(product.price).toLocaleString('es-AR')}` : ''}${typeof product.stock === 'number' ? `, stock ${product.stock}` : ''}.`
    : 'No hay un producto puntual; el foco es la marca/línea en general.';

  let voice = '';
  if (brandProfile && brandProfile.voice_guide) {
    voice += `\n\nVOZ APRENDIDA DE LA CUENTA REAL (respetá este estilo y vocabulario):\n${brandProfile.voice_guide}`;
  }
  let sg = brandProfile && brandProfile.style_guide;
  if (sg && typeof sg === 'string') { try { sg = JSON.parse(sg); } catch (_) { sg = null; } }
  if (sg) {
    if (Array.isArray(sg.hashtags_frecuentes) && sg.hashtags_frecuentes.length) {
      voice += `\nHashtags que usa/rinden en esta cuenta (priorizá estos): ${sg.hashtags_frecuentes.slice(0, 10).join(' ')}`;
    }
    if (Array.isArray(sg.cta_frecuentes) && sg.cta_frecuentes.length) {
      voice += `\nCTAs típicos de la cuenta: ${sg.cta_frecuentes.slice(0, 5).join(' / ')}`;
    }
    if (Array.isArray(sg.dont) && sg.dont.length) {
      voice += `\nEvitá (según la guía de marca): ${sg.dont.slice(0, 5).join('; ')}`;
    }
  }

  const interaction = interactionHint
    ? `\n\nEsta pieza busca interacción: ${interactionHint}. Redactá el copy/overlay para provocar esa interacción.`
    : '';

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}
${productInfo}
Temporada: ${seasonContext()}${interaction}${voice}

Escribí el copy siguiendo la voz de marca y las reglas. Devolvé SOLO un JSON válido con esta forma exacta:
{"overlay": "...", "caption": "...", "hashtags": "...", "cta": "..."}`;
}

function parseCopyJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : cleaned;
  const obj = JSON.parse(jsonStr);
  return {
    overlay: obj.overlay || obj.titulo || '',
    caption: obj.caption || '',
    hashtags: obj.hashtags || '',
    cta: obj.cta || '',
  };
}

/* =========================================================================
 * GEMINI: llamadas de bajo nivel
 * ========================================================================= */

// Las keys nuevas (AQ.) y las viejas (AIza) funcionan igual con este header en el
// endpoint nativo. Usamos x-goog-api-key (recomendado) en vez de ?key=.
async function geminiGenerateContent(model, body) {
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(`Gemini ${model} ${res.status}: ${t.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Si un modelo de imagen devuelve 429 (cuota agotada / plan gratuito), dejamos de
// intentar generar imágenes en este proceso para no acumular errores ni demoras.
let imageQuotaHit = false;

function textFromResponse(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts) return '';
  return parts.map((p) => p.text || '').join('').trim();
}

function inlineImageFromResponse(data) {
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  for (const p of parts) {
    if (p.inlineData && p.inlineData.data) {
      return { buffer: Buffer.from(p.inlineData.data, 'base64'), mimeType: p.inlineData.mimeType || 'image/png' };
    }
  }
  return null;
}

/* =========================================================================
 * GROQ (fallback de copy)
 * ========================================================================= */

async function groqCopy(promptUser) {
  if (!config.groq.apiKey) throw new Error('No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas para generar copy.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groq.apiKey}` },
    body: JSON.stringify({
      model: config.groq.model || 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${VOICE_CORE}\n\nDevolvé SIEMPRE un JSON válido y nada más: {"overlay","caption","hashtags","cta"}.` },
        { role: 'user', content: promptUser },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${body}`);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Respuesta de Groq sin contenido.');
  return parseCopyJson(content);
}

/* =========================================================================
 * API PUBLICA
 * ========================================================================= */

/**
 * Genera { overlay, caption, hashtags, cta }. Intenta Gemini y cae a Groq.
 */
async function generateCopy(opts) {
  const promptUser = buildCopyPrompt(opts);

  if (preferGemini()) {
    try {
      const data = await geminiGenerateContent(config.gemini.textModel, {
        systemInstruction: { parts: [{ text: VOICE_CORE }] },
        contents: [{ role: 'user', parts: [{ text: promptUser }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          // gemini-2.5-flash "piensa" por defecto y se come el presupuesto de tokens
          // (devolvía JSON truncado/vacío). Lo apagamos para copy.
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: 'object',
            properties: {
              overlay: { type: 'string' },
              caption: { type: 'string' },
              hashtags: { type: 'string' },
              cta: { type: 'string' },
            },
            required: ['overlay', 'caption', 'hashtags', 'cta'],
          },
        },
      });
      return sanitizeCopy(parseCopyJson(textFromResponse(data)));
    } catch (err) {
      console.warn(`[ai] Gemini copy falló, caigo a Groq: ${err.message}`);
    }
  }
  return sanitizeCopy(await groqCopy(promptUser));
}

/**
 * Genera un fondo/lienzo con IA (sin texto) para usar de backdrop de la pieza.
 * Best-effort: si no hay Gemini o falla, devuelve null y se usa el diseño plano.
 * Devuelve { buffer, mimeType } o null.
 */
async function generateBackground({ theme, format = 'feed', referenceImages = [] } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || imageQuotaHit) return null;

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const prompt = `Generá una imagen de fondo ${ratio} para una pieza de redes de una marca argentina de ropa de trabajo y calzado de seguridad llamada BLACKS.
Estilo: industrial, sobrio, premium, real (obra, taller, depósito, industria). Paleta oscura con acentos naranja (#C1440C), negro y gris. Textura sutil, iluminación cinematográfica.
IMPORTANTE: SIN texto, SIN logos, SIN letras. Dejá aire/espacio negativo en el centro y abajo para sobreimprimir texto después. Tema: ${theme || 'ropa de trabajo e industria'}.`;

  try {
    const parts = [{ text: prompt }];
    for (const ref of referenceImages.slice(0, 3)) {
      if (ref && ref.data && ref.mimeType) parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
    }
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    return inlineImageFromResponse(data);
  } catch (err) {
    if (err.status === 429) { imageQuotaHit = true; console.warn('[ai] Imágenes IA sin cuota gratis (429): uso plantilla. Activá facturación en Google para habilitarlas.'); }
    else console.warn(`[ai] generateBackground falló (sigo con diseño plano): ${err.message}`);
    return null;
  }
}

/**
 * Genera una ESCENA PROFESIONAL con el producto real adentro (foto de producto como
 * referencia). Devuelve { buffer, mimeType } o null (best-effort, con fallback).
 */
async function generateProductScene({ productImageUrl, productName, theme, format = 'feed' } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || imageQuotaHit || !productImageUrl) return null;

  let ref;
  try {
    const r = await fetch(productImageUrl);
    if (!r.ok) return null;
    let buf = Buffer.from(await r.arrayBuffer());
    buf = await resizeImage(buf, 1024).catch(() => buf);
    ref = { data: buf.toString('base64'), mimeType: 'image/jpeg' };
  } catch (_) { return null; }

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const prompt = `Usá EXACTAMENTE el producto de la imagen de referencia (no lo cambies) y ponelo en una escena de catálogo profesional ${ratio} para una marca argentina de ropa de trabajo y calzado de seguridad (BLACKS).
Estilo: foto de estudio premium, industrial y real (obra/taller/depósito), fondo degradado neutro u oscuro con acentos naranja (#C1440C). Iluminación cinematográfica, sombras suaves.
IMPORTANTE: mantené el producto fiel al de la referencia. SIN texto, SIN logos, SIN letras. Dejá aire en el centro y abajo para sobreimprimir texto después. Tema/contexto: ${theme || productName || 'ropa de trabajo'}.`;

  try {
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: ref }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    return inlineImageFromResponse(data);
  } catch (err) {
    if (err.status === 429) { imageQuotaHit = true; console.warn('[ai] Imágenes IA sin cuota gratis (429): uso plantilla con la foto del producto.'); }
    else console.warn(`[ai] generateProductScene falló (uso plantilla): ${err.message}`);
    return null;
  }
}

/**
 * Análisis multimodal de piezas de referencia + captions reales de la cuenta.
 * Devuelve { style_guide (obj), voice_guide (texto) }.
 * images: [{ data (base64), mimeType }]. captions: [string].
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Observa un lote de piezas y devuelve notas en texto (para después sintetizar).
async function observeBatch(images) {
  const parts = [{ text: `Sos director de arte. Analizá el ESTILO VISUAL de estas ${images.length} piezas de una marca argentina de ropa de trabajo (BLACKS). Describí concreto: paleta con hex aproximados, tipografías (peso/estilo), composición y jerarquía, tratamiento de fondos y fotos, cómo y dónde aparece el logo, elementos gráficos recurrentes, y diferencias entre feed (4:5) e historia (9:16). Texto plano, sin JSON.` }];
  for (const img of images) parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  const data = await geminiGenerateContent(config.gemini.visionModel, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1400, thinkingConfig: { thinkingBudget: 0 } },
  });
  return textFromResponse(data);
}

/**
 * Análisis multimodal PROFUNDO: procesa las piezas en lotes (se toma su tiempo),
 * junta observaciones y sintetiza una guía de estilo + voz. images: [{data, mimeType}].
 */
async function analyzeStyle({ images = [], captions = [] } = {}) {
  if (!hasGemini()) {
    throw new Error('El análisis de estilo necesita GEMINI_API_KEY (Google AI Studio). Cargala en las variables de entorno.');
  }

  // 1) Observación por lotes de hasta 40 imágenes (10 por llamada).
  const batches = chunk(images.slice(0, 40), 10);
  const notes = [];
  for (const batch of batches) {
    try { notes.push(await observeBatch(batch)); }
    catch (e) { console.warn(`[ai] lote de estilo falló: ${e.message}`); }
  }

  // 2) Síntesis final en JSON estructurado (usa las notas + los captions reales).
  const SYNTH = `Sos director de arte y copy de una marca argentina de indumentaria de trabajo (BLACKS). Con las observaciones de las piezas y los textos reales, armá una guía para que otra IA imite el estilo y la voz.

Devolvé SOLO un JSON válido con esta forma:
{
  "style_guide": {
    "paleta": ["#hex", "..."],
    "tipografia": "tipografías y su peso/estilo",
    "composicion": "cómo se ubican producto/texto/logo, márgenes, jerarquía",
    "elementos_recurrentes": ["marcos, badges, franjas, etc."],
    "tratamiento_foto": "fondo, iluminación, estilo de foto",
    "formato_notas": "diferencias feed (4:5) vs historia (9:16)",
    "logo_uso": "dónde y cómo aparece el logo",
    "hashtags_frecuentes": ["#..."],
    "cta_frecuentes": ["frases de CTA que se repiten"],
    "emojis": "nivel de uso y cuáles",
    "longitud_caption": "corto/medio/largo y líneas aprox.",
    "temas_recurrentes": ["temas/ángulos que más se repiten"],
    "do": ["qué SÍ hacer para verse de la marca"],
    "dont": ["qué NO hacer / errores a evitar"]
  },
  "voice_guide": "Párrafo accionable sobre TONO y VOCABULARIO ARGENTINO real: muletillas, formalidad, emojis, largo, CTA, expresiones que se repiten."
}`;

  const parts = [{ text: SYNTH }];
  if (notes.length) parts.push({ text: `OBSERVACIONES DE ${images.length} PIEZAS:\n${notes.join('\n---\n')}` });
  if (captions.length) parts.push({ text: `CAPTIONS REALES DE LA CUENTA:\n- ${captions.slice(0, 40).join('\n- ')}` });

  const data = await geminiGenerateContent(config.gemini.textModel, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  });

  const parsed = JSON.parse(String(textFromResponse(data)).replace(/```json|```/g, '').trim());
  return {
    style_guide: parsed.style_guide || {},
    voice_guide: parsed.voice_guide || '',
    batches: batches.length,
  };
}

module.exports = {
  generateCopy,
  generateBackground,
  generateProductScene,
  analyzeStyle,
  sanitizeText,
  hasGemini,
  VOICE_CORE,
};
