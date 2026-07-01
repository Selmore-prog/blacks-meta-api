const config = require('./config');

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

HASHTAGS: 4 a 6, mezclando marca (#BlacksIndumentaria), rubro (#RopaDeTrabajo #CalzadoDeSeguridad #IndumentariaLaboral), la marca/producto puntual y algo local cuando aplique (#Argentina). Nada de #instagood ni genéricos vacíos.`;

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

function buildCopyPrompt({ pillar, pillarDetail, postType, format, product, brandProfile, interactionHint }) {
  const productInfo = product
    ? `Producto a destacar: ${product.name}${product.brand ? ` (marca ${product.brand})` : ''}${product.price ? `, precio $${Number(product.price).toLocaleString('es-AR')}` : ''}${typeof product.stock === 'number' ? `, stock ${product.stock}` : ''}.`
    : 'No hay un producto puntual; el foco es la marca/línea en general.';

  const voice = brandProfile && brandProfile.voice_guide
    ? `\n\nVOZ APRENDIDA DE LA CUENTA REAL (respetá este estilo y vocabulario):\n${brandProfile.voice_guide}`
    : '';

  const interaction = interactionHint
    ? `\n\nEsta pieza busca interacción: ${interactionHint}. Redactá el copy/overlay para provocar esa interacción.`
    : '';

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}
${productInfo}${interaction}${voice}

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

async function geminiGenerateContent(model, body) {
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${config.gemini.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini ${model} ${res.status}: ${t.slice(0, 600)}`);
  }
  return res.json();
}

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
        generationConfig: { temperature: 0.85, maxOutputTokens: 800, responseMimeType: 'application/json' },
      });
      return parseCopyJson(textFromResponse(data));
    } catch (err) {
      console.warn(`[ai] Gemini copy falló, caigo a Groq: ${err.message}`);
    }
  }
  return groqCopy(promptUser);
}

/**
 * Genera un fondo/lienzo con IA (sin texto) para usar de backdrop de la pieza.
 * Best-effort: si no hay Gemini o falla, devuelve null y se usa el diseño plano.
 * Devuelve { buffer, mimeType } o null.
 */
async function generateBackground({ theme, format = 'feed', referenceImages = [] } = {}) {
  if (!config.ai.useAiImages || !hasGemini()) return null;

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
    console.warn(`[ai] generateBackground falló (sigo con diseño plano): ${err.message}`);
    return null;
  }
}

/**
 * Análisis multimodal de piezas de referencia + captions reales de la cuenta.
 * Devuelve { style_guide (obj), voice_guide (texto) }.
 * images: [{ data (base64), mimeType }]. captions: [string].
 */
async function analyzeStyle({ images = [], captions = [] } = {}) {
  if (!hasGemini()) {
    throw new Error('El análisis de estilo necesita GEMINI_API_KEY (Google AI Studio). Cargala en las variables de entorno.');
  }

  const instruction = `Sos director de arte y copy de una marca argentina de indumentaria de trabajo (BLACKS). Te paso piezas gráficas reales que subió la cuenta y algunos textos (captions) reales que se venían publicando. Analizá el ESTILO para que otra IA pueda imitarlo.

Devolvé SOLO un JSON válido con esta forma:
{
  "style_guide": {
    "paleta": ["#hex", "..."],
    "tipografia": "descripción",
    "composicion": "cómo se ubican producto/texto/logo",
    "elementos_recurrentes": ["..."],
    "tratamiento_foto": "fondo, iluminación, estilo de foto de producto",
    "formato_notas": "qué se ve distinto en feed vs historia"
  },
  "voice_guide": "Párrafo describiendo el TONO y el VOCABULARIO ARGENTINO real de los captions: muletillas, nivel de formalidad, uso de emojis, largo típico, tipo de CTA, palabras/expresiones que se repiten. Sé específico y accionable para replicar la voz."
}`;

  const parts = [{ text: instruction }];
  if (captions.length) {
    parts.push({ text: `\nCAPTIONS REALES DE LA CUENTA:\n- ${captions.slice(0, 25).join('\n- ')}` });
  }
  for (const img of images.slice(0, 12)) {
    if (img && img.data && img.mimeType) parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  }

  const data = await geminiGenerateContent(config.gemini.visionModel, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
  });

  const parsed = JSON.parse(String(textFromResponse(data)).replace(/```json|```/g, '').trim());
  return {
    style_guide: parsed.style_guide || {},
    voice_guide: parsed.voice_guide || '',
  };
}

module.exports = {
  generateCopy,
  generateBackground,
  analyzeStyle,
  hasGemini,
  VOICE_CORE,
};
