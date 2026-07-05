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

ESCRIBÍS EN ESPAÑOL ARGENTINO PROFESIONAL (formal pero cercano):
- Voseo SIEMPRE: "conseguí", "llevate", "fijate", "aprovechá", "mirá", "pedí". Nunca tuteo ("consigue", "llévate", "mira").
- Sos la voz de una MARCA SERIA del rubro: profesional, clara y confiable. Argentino sí, pero SIN lunfardo ni jerga excesiva.
- PROHIBIDO el lunfardo: "laburo", "laburante", "laburás", "pifiarla", "la banca", "canchero", "aguanta los trapos", "posta", "una masa", "de una". En su lugar: "trabajo", "quienes trabajan", "equivocarte", "resiste", "rinde".
- Vocabulario correcto del rubro: "ropa de trabajo", "indumentaria laboral", "calzado de seguridad", "puntera de acero", "en cuotas", "por transferencia", "envío a todo el país", "retiro por el local", "presupuesto para tu empresa".
- Tono: directo y concreto, sin vueltas. Le hablás a alguien que trabaja con las manos y valora la durabilidad y el rendimiento de su inversión. Nunca grandilocuente ni motivacional vacío. Profesional no significa acartonado: frases simples, cero solemnidad.

REGLAS DURAS PARA QUE NO SUENE A IA (si rompés esto, está mal):
- PROHIBIDO: "descubrí/descubre", "eleva/llevá tu X al siguiente nivel", "no te lo pierdas", "en el mundo de", "sumérgete", "potenciá tu experiencia", "calidad premium excepcional", "vive la experiencia", cadenas de signos de exclamación.
- Nada de frases genéricas de catálogo. Decí algo CONCRETO: para qué sirve, la resistencia, la terminación, para qué tipo de trabajo va, el beneficio real.
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
    slides: (copy.slides || []).map((s) => ({ title: sanitizeText(s.title), text: sanitizeText(s.text) })),
  };
}

function formatGuidance(postType, format) {
  if (format === 'story' && postType !== 'reel') {
    return `FORMATO: Historia de Instagram (vertical 9:16, se ve pocos segundos).
- "overlay" = texto MUY corto y con gancho para poner ARRIBA de la imagen (máx ~6 palabras).
- "caption" = 1 línea corta y al grano. Nada largo.`;
  }
  if (postType === 'reel') {
    return `FORMATO: Reel (video vertical 9:16).
- "overlay" = el gancho del primer segundo (texto corto en pantalla).
- "caption" = 2 líneas cortas con ritmo. Concisa.`;
  }
  return `FORMATO: Post de feed (imagen 4:5).
- "overlay" = título corto y potente (máx ~7 palabras).
- "caption" = MÁXIMO 2-3 líneas cortas. Primera línea = gancho. Cortito y al hueso (los captions largos rinden peor).`;
}

// Temporada del hemisferio SUR (Argentina) según el mes actual.
function seasonContext(date = new Date()) {
  const m = date.getMonth();
  let estacion, nota;
  if (m === 11 || m <= 1) { estacion = 'verano'; nota = 'hace calor: remeras, chombas, ropa fresca y liviana para el trabajo.'; }
  else if (m <= 4) { estacion = 'otoño'; nota = 'refresca: buzos, camperas livianas, media estación.'; }
  else if (m <= 7) { estacion = 'invierno'; nota = 'hace frío: camperas, buzos, polares, softshell, ropa térmica, abrigo para el trabajo a la intemperie.'; }
  else { estacion = 'primavera'; nota = 'empieza a templar: buzos livianos, camperas rompeviento, media estación.'; }
  return `Estamos en ${estacion} en Argentina — ${nota} Si encaja, mencioná el clima/temporada de forma natural (sin forzar).`;
}

// Qué busca cada pieza: baja del plan mensual al copy para que el CTA tenga sentido.
const OBJECTIVE_GUIDE = {
  venta: 'OBJETIVO: VENDER. Cerrá con un motivo concreto para comprar ahora (beneficio real, cuotas, envío, descuento por transferencia). CTA de compra directo.',
  trafico: 'OBJETIVO: LLEVAR TRÁFICO A LA TIENDA. Despertá interés y mandá a ver el producto/catálogo en la web. El CTA apunta al sitio, no a "comprá ya".',
  confianza: 'OBJETIVO: CONSTRUIR CONFIANZA. Aportá valor real (un dato útil, prueba social, historia) SIN vender agresivo. CTA suave o ninguno.',
  comunidad: 'OBJETIVO: GENERAR CONVERSACIÓN. Terminá con una pregunta fácil de responder o una invitación a votar/comentar. El CTA es responder, no comprar.',
};

/**
 * Texto de precio para el prompt. REGLA DE ORO: si el producto tiene precio
 * promocional (tachado con descuento en Tiendanube), EL PRECIO QUE VALE ES LA
 * OFERTA — el regular sólo sirve como "antes" para mostrar el descuento.
 */
function productPriceText(product) {
  const regular = product.price ? Number(product.price) : null;
  const promo = product.promo_price && regular && Number(product.promo_price) < regular ? Number(product.promo_price) : null;
  const fmt = (n) => `$${Number(n).toLocaleString('es-AR')}`;
  if (promo) {
    const off = Math.round((1 - promo / regular) * 100);
    return `, EN OFERTA: el precio vigente es ${fmt(promo)} (antes ${fmt(regular)}, -${off}%). Si mencionás precio, usá SIEMPRE el de oferta (${fmt(promo)}) y aprovechá el descuento como argumento de venta. NUNCA presentes ${fmt(regular)} como el precio actual: es el tachado.`;
  }
  return regular ? `, precio ${fmt(regular)}` : '';
}

function buildCopyPrompt({ pillar, pillarDetail, postType, format, product, visualProduct, brandProfile, interactionHint, carousel, slideCount = 3, wholesale, commercialContext, topCaptions, objective, recentPieces }) {
  let productInfo = product
    ? `Producto a destacar: ${product.name}${product.brand ? ` (marca ${product.brand})` : ''}${productPriceText(product)}${typeof product.stock === 'number' ? `, stock ${product.stock}` : ''}.`
    : 'No hay un producto puntual; el foco es la marca/línea en general.';
  // Descripción real de Tiendanube: características para que el copy sea concreto y fiel.
  if (product && product.description) {
    productInfo += `\nCaracterísticas reales (usá SOLO datos de acá, no inventes): "${product.description}"`;
  }
  // Ancla visual: la pieza no vende este producto, pero SU FOTO es la imagen de fondo.
  // El copy tiene que poder convivir con esa foto (mismo rubro/tipo de prenda), sin venderla.
  if (!product && visualProduct) {
    productInfo += `\nIMAGEN DE LA PIEZA: la foto de fondo es "${visualProduct.name}"${visualProduct.brand ? ` (marca ${visualProduct.brand})` : ''}. NO estás vendiendo ese producto puntual: usalo como ejemplo/ilustración del tema. El copy y el overlay tienen que tener sentido con esa foto (mismo tipo de prenda/calzado); si das ejemplos, que sean de ese tipo de producto.`;
  }
  const wholesaleInfo = (pillar === 'mayorista' && wholesale)
    ? `\nCONDICIONES MAYORISTAS (metelas en el copy, tono B2B, sin precio unitario, cerrá con "pedí tu presupuesto"): ${wholesale}`
    : '';

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
  const commercial = commercialContext
    ? `\n\nCALENDARIO COMERCIAL CERCANO:\n${commercialContext}\nSi alguna fecha encaja con el producto/pilar, usala como ángulo de venta natural. Si queda forzada, ignorala.`
    : '';

  // Feedback loop: los posts que mejor rindieron en la cuenta enseñan estructura y tono.
  const winners = (Array.isArray(topCaptions) && topCaptions.length)
    ? `\n\nPOSTS QUE MEJOR FUNCIONARON EN ESTA CUENTA (imitá su estructura, largo y tono — NO los copies literal ni repitas sus productos):\n${topCaptions.map((c, i) => `${i + 1}. "${String(c).slice(0, 220)}"`).join('\n')}`
    : '';

  // Anti-repetición: lo último que salió de la cuenta. El copy nuevo tiene que
  // aportar algo distinto — mismo producto puede volver, pero con OTRO ángulo.
  const noRepeat = (Array.isArray(recentPieces) && recentPieces.length)
    ? `\n\nCONTENIDO RECIENTE DE LA CUENTA (lo último generado/publicado). PROHIBIDO repetir estos temas, ganchos, ángulos o frases — si el producto o tema coincide, encaralo desde un ángulo CLARAMENTE distinto:\n${recentPieces.map((r) => `- ${r}`).join('\n')}`
    : '';

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}${OBJECTIVE_GUIDE[objective] ? `\n${OBJECTIVE_GUIDE[objective]}` : ''}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}
${productInfo}${wholesaleInfo}
Temporada: ${seasonContext()}${commercial}${winners}${noRepeat}${interaction}${voice}

${carousel ? (['educativo', 'mayorista'].includes(pillar)
    ? `\nCARRUSEL PASO A PASO: devolvé "slides": un array de ${slideCount} objetos {"title","text"}. Es una GUÍA accionable, no un folleto: (1) portada con gancho que promete el resultado ("Guía de talles sin equivocarte", "Cómo comprar al por mayor"), (2-${slideCount - 1}) PASOS numerados y concretos — "title" tipo "PASO 1 — MEDÍ TU CINTURA" y "text" con la instrucción exacta (qué hacer, con qué, qué número anotar), (${slideCount}) cierre con el beneficio + CTA. Cada paso tiene que poder hacerse EN EL MOMENTO. Nada repetido entre slides.\n`
    : `\nCARRUSEL: además, devolvé "slides": un array de ${slideCount} objetos {"title","text"} para un carrusel deslizable. Cada slide UN punto distinto, con progresión: (1) gancho, (2-${slideCount - 1}) beneficios/datos concretos, (${slideCount}) cierre + CTA. "title" cortísimo (2-4 palabras, va grande en pantalla), "text" 1 línea corta. Nada repetido entre slides.\n`) : ''}
Escribí el copy siguiendo la voz de marca y las reglas. Devolvé SOLO un JSON válido con esta forma exacta:
{"overlay": "...", "caption": "...", "hashtags": "...", "cta": "..."${carousel ? ', "slides": [{"title":"...","text":"..."}]' : ''}}`;
}

/* =========================================================================
 * CONTROL DE CALIDAD DEL COPY (determinístico, gratis)
 * Chequea lo que más obligaba a editar a mano. Si falla, se regenera UNA vez
 * pasándole los problemas como feedback; si vuelve a fallar, gana la versión
 * con menos problemas y queda registrado en qa_notes.
 * ========================================================================= */

// Frases que delatan copy de IA + lunfardo prohibido por la voz de marca.
const BANNED_PATTERNS = [
  { re: /descubr[ií]/i, label: 'usa "descubrí/descubre" (frase de IA)' },
  { re: /siguiente nivel/i, label: 'usa "al siguiente nivel" (frase de IA)' },
  { re: /no te lo pierdas/i, label: 'usa "no te lo pierdas" (frase de IA)' },
  { re: /en el mundo de/i, label: 'usa "en el mundo de" (frase de IA)' },
  { re: /sum[eé]rge?te|sumergite/i, label: 'usa "sumérgete" (frase de IA)' },
  { re: /potenci[aá] tu experiencia|viv[ií] la experiencia|vive la experiencia/i, label: 'frase de experiencia genérica (IA)' },
  { re: /calidad premium excepcional/i, label: 'usa "calidad premium excepcional"' },
  { re: /!{2,}/, label: 'cadena de signos de exclamación' },
  { re: /\blabur(o|a|ás|as|ante|antes)\b/i, label: 'lunfardo ("laburo/laburante")' },
  { re: /\bbanca(n|r|mos)?\b/i, label: 'lunfardo ("banca/bancan")' },
  { re: /\bposta\b/i, label: 'lunfardo ("posta")' },
  { re: /\bcanchero/i, label: 'lunfardo ("canchero")' },
  { re: /\bpifi/i, label: 'lunfardo ("pifiar")' },
  { re: /aguanta los trapos/i, label: 'lunfardo ("aguanta los trapos")' },
];

/** Revisa un copy generado y devuelve la lista de problemas (vacía = pasa). */
function lintCopy(copy, { format = 'feed', postType = 'feed' } = {}) {
  const problems = [];
  const all = [copy.overlay, copy.caption, copy.cta, ...(copy.slides || []).map((s) => `${s.title} ${s.text}`)]
    .filter(Boolean).join('\n');

  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(all)) problems.push(label);
  }

  const overlayWords = String(copy.overlay || '').trim().split(/\s+/).filter(Boolean).length;
  if (overlayWords > 10) problems.push(`overlay muy largo (${overlayWords} palabras, máximo ~7)`);

  const capLen = String(copy.caption || '').length;
  if (format === 'story' && postType !== 'reel' && capLen > 220) {
    problems.push(`caption de historia muy largo (${capLen} caracteres, va 1 línea corta)`);
  }
  if (format === 'feed' && capLen > 500) problems.push(`caption muy largo (${capLen} caracteres)`);
  if (!String(copy.caption || '').trim()) problems.push('caption vacío');

  const ov = String(copy.overlay || '').trim().toLowerCase();
  if (ov && ov.length > 12 && String(copy.caption || '').toLowerCase().includes(ov)) {
    problems.push('el caption repite textual el overlay');
  }

  const tags = String(copy.hashtags || '').match(/#[^\s#]+/g) || [];
  if (tags.length > 8) problems.push(`demasiados hashtags (${tags.length}, van 4-6)`);

  return problems;
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
    slides: Array.isArray(obj.slides) ? obj.slides.map((s) => ({ title: s.title || '', text: s.text || '' })) : [],
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

// Si un modelo de imagen devuelve 429 (cuota agotada), pausamos los intentos por un
// rato en vez de apagarlos para siempre: en Render el proceso web vive días, así que
// un flag fijo dejaba las imágenes IA apagadas hasta el próximo deploy aunque la cuota
// ya se hubiera recuperado (o el usuario hubiera activado facturación mientras tanto).
let imageQuotaHitUntil = 0;
const IMAGE_QUOTA_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos

function isImageQuotaCoolingDown() {
  return Date.now() < imageQuotaHitUntil;
}

function markImageQuotaHit() {
  imageQuotaHitUntil = Date.now() + IMAGE_QUOTA_COOLDOWN_MS;
}

// Precio estimado en USD por imagen generada, por modelo (referencia jul-2026;
// ajustar si Google cambia tarifas). Sólo para MOSTRAR consumo, no factura nada.
const IMAGE_PRICE_USD = {
  'gemini-2.5-flash-image': 0.039,
  'gemini-3.1-flash-image': 0.039,
  'gemini-3.1-flash-lite-image': 0.02,
  'gemini-3-pro-image': 0.139,
  'gemini-3-pro-image-preview': 0.139,
};

// Guía de estilo APRENDIDA de la marca (brand_profile) resumida para prompts de imagen.
// Cache por proceso: la generación diaria corre en un proceso nuevo cada vez.
let brandStyleCache;
async function brandStyleForImages() {
  if (brandStyleCache !== undefined) return brandStyleCache;
  try {
    const { getBrandProfile } = require('./brandProfile');
    const bp = await getBrandProfile();
    let sg = bp && bp.style_guide;
    if (typeof sg === 'string') { try { sg = JSON.parse(sg); } catch (_) { sg = null; } }
    const parts = [];
    if (sg) {
      if (sg.paleta) parts.push(`Paleta de la marca: ${Array.isArray(sg.paleta) ? sg.paleta.slice(0, 6).join(', ') : sg.paleta}.`);
      if (sg.tratamiento_foto) parts.push(`Tratamiento fotográfico de la marca: ${sg.tratamiento_foto}.`);
      if (sg.composicion) parts.push(`Composición típica: ${sg.composicion}.`);
      if (Array.isArray(sg.elementos_recurrentes) && sg.elementos_recurrentes.length) {
        parts.push(`Elementos recurrentes de sus piezas: ${sg.elementos_recurrentes.slice(0, 5).join('; ')}.`);
      }
    }
    brandStyleCache = parts.join(' ');
  } catch (_) { brandStyleCache = ''; }
  return brandStyleCache;
}

/** Precio estimado por imagen del modelo configurado (para mostrar ANTES de generar). */
function currentImagePriceUsd() {
  return IMAGE_PRICE_USD[config.gemini.imageModel] ?? 0.05;
}

/** Registra cada imagen generada con su costo estimado y lo devuelve (best-effort, nunca rompe). */
async function logImageUsage(purpose) {
  const cost = currentImagePriceUsd();
  try {
    const pool = require('./db');
    await pool.query(
      `INSERT INTO ai_usage (kind, model, purpose, est_cost_usd) VALUES ('image', $1, $2, $3)`,
      [config.gemini.imageModel, purpose, cost]
    );
  } catch (err) {
    console.warn('[ai] No pude registrar el consumo de imagen:', err.message);
  }
  return cost;
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

async function groqCopy(promptUser, wantSlides = false) {
  if (!config.groq.apiKey) throw new Error('No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas para generar copy.');
  const shape = wantSlides
    ? '{"overlay","caption","hashtags","cta","slides":[{"title","text"},...]} — "slides" es OBLIGATORIO'
    : '{"overlay","caption","hashtags","cta"}';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groq.apiKey}` },
    body: JSON.stringify({
      model: config.groq.model || 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${VOICE_CORE}\n\nDevolvé SIEMPRE un JSON válido y nada más: ${shape}.` },
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

/** Un intento de copy. `feedback`: problemas de la versión anterior para corregir. */
async function generateCopyOnce(opts, feedback = null) {
  let promptUser = buildCopyPrompt(opts);
  if (feedback && feedback.length) {
    promptUser += `\n\nIMPORTANTE: una versión anterior de este copy se rechazó por estos problemas. Corregilos TODOS:\n${feedback.map((p) => `- ${p}`).join('\n')}`;
  }

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
              ...(opts.carousel ? { slides: { type: 'array', minItems: 3, items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] } } } : {}),
            },
            // En carrusel las slides son OBLIGATORIAS: sin ellas la pieza sale simple.
            required: ['overlay', 'caption', 'hashtags', 'cta', ...(opts.carousel ? ['slides'] : [])],
          },
        },
      });
      const parsed = parseCopyJson(textFromResponse(data));
      if (opts.carousel && (!Array.isArray(parsed.slides) || parsed.slides.length < 2)) {
        throw new Error('Gemini no devolvió slides para el carrusel');
      }
      return { copy: sanitizeCopy(parsed), model: 'gemini' };
    } catch (err) {
      console.warn(`[ai] Gemini copy falló, caigo a Groq: ${err.message}`);
    }
  }
  return { copy: sanitizeCopy(await groqCopy(promptUser, Boolean(opts.carousel))), model: 'groq' };
}

/**
 * Genera { overlay, caption, hashtags, cta } con control de calidad: si el copy
 * rompe reglas de la voz (lunfardo, frases de IA, largos), se regenera UNA vez
 * con los problemas como feedback. Devuelve además:
 *  - gen_model: 'gemini' | 'groq' (con qué modelo salió — groq es el respaldo)
 *  - qa_notes: problemas que quedaron sin resolver (null = pasó limpio)
 */
async function generateCopy(opts) {
  let attempt = await generateCopyOnce(opts);
  let problems = lintCopy(attempt.copy, opts);

  if (problems.length) {
    console.warn(`[ai] Copy rechazado por QA (${problems.join(' · ')}). Regenero con feedback.`);
    try {
      const retry = await generateCopyOnce(opts, problems);
      const retryProblems = lintCopy(retry.copy, opts);
      // Gana la versión con menos problemas (el reintento suele salir limpio).
      if (retryProblems.length <= problems.length) { attempt = retry; problems = retryProblems; }
    } catch (err) {
      console.warn(`[ai] El reintento de copy falló (queda la 1a versión): ${err.message}`);
    }
  }

  return {
    ...attempt.copy,
    gen_model: attempt.model,
    qa_notes: problems.length ? problems.join(' · ') : null,
  };
}

/**
 * Genera un objeto JSON arbitrario (para el planner y otras tareas estructuradas).
 * Intenta Gemini (con responseSchema) y cae a Groq (json_object). Lanza si ambos fallan.
 */
async function generateJson({ system, prompt, schema, maxTokens = 4000, temperature = 0.6 }) {
  if (preferGemini()) {
    try {
      const data = await geminiGenerateContent(config.gemini.textModel, {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
          ...(schema ? { responseSchema: schema } : {}),
        },
      });
      const text = textFromResponse(data);
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (err) {
      console.warn(`[ai] Gemini JSON falló, caigo a Groq: ${err.message}`);
    }
  }
  if (!config.groq.apiKey) throw new Error('No hay GROQ_API_KEY ni GEMINI_API_KEY para generar JSON.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groq.apiKey}` },
    body: JSON.stringify({
      model: config.groq.model || 'llama-3.3-70b-versatile',
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system || 'Sos un asistente que devuelve datos estructurados.'}\n\nDevolvé SIEMPRE un JSON válido y nada más.` },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Respuesta de Groq sin contenido.');
  return JSON.parse(content.replace(/```json|```/g, '').trim());
}

/**
 * Genera un fondo/lienzo con IA (sin texto) para usar de backdrop de la pieza.
 * Best-effort: si no hay Gemini o falla, devuelve null y se usa el diseño plano.
 * Devuelve { buffer, mimeType } o null.
 */
async function generateBackground({ theme, format = 'feed', referenceImages = [] } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const prompt = `Actuás como DIRECTOR DE ARTE SENIOR de una agencia creativa premium. Generá la imagen de fondo ${ratio} para una pieza de Instagram de BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONCEPTO (la imagen tiene que contarlo, no ser decorativa): "${theme || 'ropa de trabajo e industria'}".

DIRECCIÓN DE FOTOGRAFÍA:
- Fotografía editorial hiperrealista, calidad de campaña publicitaria impresa. Lente 35-50mm, apertura amplia, profundidad de campo real, enfoque selectivo.
- Iluminación cinematográfica motivada (luz de galpón, sol bajo entrando por un portón, tubo fluorescente industrial): contraste alto, sombras con detalle.
- Escenario auténtico argentino del rubro: obra en construcción, taller metalúrgico, depósito logístico, galpón, manos trabajando con herramientas reales. NADA de estudios genéricos ni escenarios "de stock".
- Color grading sobrio y premium: base negro/gris carbón con UN acento naranja quemado (#C1440C) apareciendo natural en la escena (casco, cinta de peligro, luz cálida, óxido). Grano fílmico sutil.
${brandStyle ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

REALISMO ANTI-IA (crítico — la foto tiene que pasar por tomada con cámara real):
- Imperfecciones del mundo real: polvo en el aire, desgaste en superficies, arrugas reales en telas, rayones en herramientas, suciedad creíble en el piso. NADA impecable ni simétrico.
- Física de luz real: una sola fuente dominante coherente, sombras que caen todas para el mismo lado, reflejos imperfectos. Evitá la iluminación pareja "de render".
- Encuadre levemente imperfecto, como de fotógrafo humano (no centrado quirúrgico). Leve viñeteo y grano fílmico. Colores con la saturación contenida de una foto editorial, nunca los tonos vibrantes plásticos típicos de IA.

COMPOSICIÓN PARA DISEÑO:
- Regla de tercios, con AMPLIO espacio negativo limpio en el centro-abajo para sobreimprimir un titular tipográfico después.
- LA SALIDA ES SOLO LA FOTOGRAFÍA. El diseño gráfico (títulos, precios, logos, íconos, placas) lo agrega DESPUÉS otro sistema: si la imagen trae CUALQUIER texto, letra, número, ícono o logo, se descarta y se pierde el trabajo.
- PROHIBIDO además: marcas visibles, caras reconocibles en primer plano, manos deformes, objetos flotando, aspecto "render 3D" o "imagen de IA" evidente. Si hay personas, de espaldas o fuera de foco.`;

  try {
    const parts = [{ text: prompt }];
    for (const ref of referenceImages.slice(0, 3)) {
      if (ref && ref.data && ref.mimeType) parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
    }
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const img = inlineImageFromResponse(data);
    if (img) img.costUsd = await logImageUsage('fondo');
    return img;
  } catch (err) {
    if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min y sigo con plantilla mientras tanto.`); }
    else console.warn(`[ai] generateBackground falló (sigo con diseño plano): ${err.message}`);
    return null;
  }
}

/**
 * Genera una ILUSTRACIÓN DIDÁCTICA (no fotográfica) para piezas educativas:
 * dibujos técnicos tipo "cómo medirse la prenda", comparativas, esquemas de uso.
 * Pensada para la plantilla educativa (fondo claro). Best-effort: null si falla.
 */
async function generateDiagram({ topic, format = 'feed' } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;

  const prompt = `Actuás como ILUSTRADOR TÉCNICO EDITORIAL de una marca de indumentaria de trabajo. Generá UNA ilustración didáctica (NO una fotografía) que ENSEÑE visualmente este tema: "${topic || 'cómo elegir ropa de trabajo'}".

QUÉ TIENE QUE SER:
- Un dibujo instructivo claro, tipo manual/infografía SIN texto: por ejemplo, la silueta de una prenda con cinta métrica y flechas mostrando DÓNDE se mide (pecho, cintura, largo), un botín en corte mostrando la puntera de acero, o una comparativa lado a lado de dos prendas.
- Estilo ilustración vectorial plana (flat), trazos limpios y gruesos, mínima cantidad de elementos. Nada de estilo cartoon infantil ni 3D.

PALETA (obligatoria, es la identidad de la marca):
- Fondo blanco o gris muy claro (#f4f4f5), LISO.
- Línea principal en gris carbón oscuro (#1c1c1e).
- UN solo color de acento: naranja quemado (#C1440C) para las flechas/indicaciones importantes.

REGLA DURA: la salida es SOLO el dibujo. PROHIBIDO cualquier texto, letra, número, cota, logo o etiqueta (los textos los agrega otro sistema después; si aparece alguno, la imagen se descarta). Composición centrada con aire alrededor, formato ${format === 'story' ? 'vertical' : 'cuadrado/vertical'}.`;

  try {
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const img = inlineImageFromResponse(data);
    if (img) img.costUsd = await logImageUsage('ilustración didáctica');
    return img;
  } catch (err) {
    if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min.`); }
    else console.warn(`[ai] generateDiagram falló (sigo sin ilustración): ${err.message}`);
    return null;
  }
}

/**
 * Genera una ESCENA PROFESIONAL con el producto real adentro (foto de producto como
 * referencia). Devuelve { buffer, mimeType } o null (best-effort, con fallback).
 */
async function generateProductScene({ productImageUrl, productName, theme, format = 'feed' } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown() || !productImageUrl) return null;

  let ref;
  try {
    const r = await fetch(productImageUrl);
    if (!r.ok) return null;
    let buf = Buffer.from(await r.arrayBuffer());
    buf = await resizeImage(buf, 1024).catch(() => buf);
    ref = { data: buf.toString('base64'), mimeType: 'image/jpeg' };
  } catch (_) { return null; }

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const prompt = `Actuás como DIRECTOR DE ARTE SENIOR de una campaña de e-commerce premium. Tomá EXACTAMENTE el producto de la imagen de referencia (fidelidad total: mismo modelo, color, costuras, etiquetas — no lo rediseñes) y componé una escena de catálogo profesional ${ratio} para BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONTEXTO DE LA PIEZA: ${theme || productName || 'ropa de trabajo'}.

DIRECCIÓN DE FOTOGRAFÍA:
- El producto es EL protagonista absoluto: nítido, con textura de tela/cuero visible, ocupando el centro visual.
- Escena real y creíble del uso: banco de taller, andamio, pallet de depósito, piso de hormigón, chapa. Utilería mínima y auténtica (guantes, casco, herramientas) SIN robar protagonismo.
- Luz de estudio dramática tipo campaña (softbox lateral + contraluz sutil) o luz natural motivada de galpón. Sombras suaves con caída real.
- Color grading premium: fondo neutro oscuro (carbón/grafito) con un acento naranja (#C1440C) discreto en la escena. Nada saturado ni plástico.
- REALISMO ANTI-IA (crítico): la escena tiene que pasar por foto de cámara real. Superficies con desgaste y polvo creíbles, tela con arrugas y caída natural, una sola fuente de luz dominante con sombras coherentes, leve grano fílmico, encuadre humano (no simetría quirúrgica). Saturación contenida de foto editorial, nunca colores plásticos vibrantes de render.
${brandStyle ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

COMPOSICIÓN PARA DISEÑO:
- Aire limpio en el centro-abajo para sobreimprimir titular y precio después.
- LA SALIDA ES SOLO LA FOTOGRAFÍA. El diseño gráfico (títulos, precios, logos, íconos, placas, badges) lo agrega DESPUÉS otro sistema: si la imagen trae CUALQUIER texto, letra, número, ícono o placa gráfica, se descarta y se pierde el trabajo.
- PROHIBIDO además: logos inventados, manos/pies deformes, duplicar el producto, cambiarle color o forma, aspecto "render 3D" o IA evidente.`;

  try {
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: ref }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const img = inlineImageFromResponse(data);
    if (img) img.costUsd = await logImageUsage('escena de producto');
    return img;
  } catch (err) {
    if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min y sigo con la foto del producto mientras tanto.`); }
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

  // 1) Observación por lotes de hasta 120 imágenes (10 por llamada) — se toma su tiempo.
  const batches = chunk(images.slice(0, 120), 10);
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

/**
 * Arma un súper-prompt listo para pegar en Gemini/Veo (Omni) y generar una escena
 * de video a medida. No llama a la API (es texto): la generación la hace el usuario a mano.
 */
function buildVideoPrompt({ productName, productImages = [], productImageUrl, theme, format = 'story', caption } = {}) {
  const imgs = (productImages && productImages.length ? productImages : [productImageUrl]).filter(Boolean);
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const prompt = `Creá un video comercial ${ratio} de ~8 segundos para BLACKS, una marca argentina de ropa de trabajo y calzado de seguridad.

PRODUCTO (REGLA ESTRICTA): usá EXACTAMENTE el producto de las imágenes de referencia adjuntas (${productName || 'producto de trabajo'}). Es imprescindible que sea IDÉNTICO:
- NO agregues ni inventes marcas, logos, etiquetas, parches, cierres, costuras, texturas, estampados, colores ni detalles que NO estén en las fotos.
- NO cambies el color, el corte ni los materiales.
- Si dudás de un detalle, no lo agregues. El producto del video tiene que ser el mismo que se vende.

ESCENA: mostralo en un entorno real con contexto (${theme || 'obra / taller / depósito / fábrica / calle'}), usado o exhibido de forma creíble. Ambiente real argentino, no set de estudio artificial.
CÁMARA: movimiento lento y cinematográfico (dolly-in suave u órbita corta) con micro-vibración de cámara en mano, como filmado por un camarógrafo real. Profundidad de campo, partículas de polvo, luz de golden hour o luz industrial cálida. Motion blur natural de 24fps.
REALISMO ANTI-IA (crítico — que NO parezca video generado): imperfecciones del mundo real (desgaste, polvo, arrugas de tela con física creíble, piso sucio de obra), una sola fuente de luz coherente con sombras que caen todas para el mismo lado, leve grano fílmico, saturación contenida tipo documental. PROHIBIDO: superficies plásticas perfectas, movimientos flotantes irreales, cámara imposiblemente estable, colores vibrantes de render, transiciones mágicas o morphing.
ESTÉTICA: robusta, premium, alto contraste, look de aviso moderno. SIN texto en pantalla (el texto/subtítulos los agrego después). Terminá en un plano hero limpio del producto.`;
  const instructions = [
    'Abrí Gemini (Veo/Omni) o tu herramienta de video.',
    'Subí VARIAS fotos del producto desde distintos ángulos (frente, espalda, detalle) — mientras más perspectivas, más fiel queda.',
    `Pegá el prompt. Elegí formato ${ratio} y ~8s.`,
    'Descargá el .mp4 y subilo al panel (botón "Subir video") para publicarlo como Reel.',
  ];
  const platformNote = 'Gemini Veo/Omni (lo tuyo) es muy bueno. Para máxima fidelidad, mandá varias fotos del producto. Alternativas con tier gratuito (más limitadas/con marca de agua): Kling, Runway, Pika. Lo más fiel siempre es tu propia filmación + edición.';
  return {
    prompt: caption ? `${prompt}\n\nCONTEXTO DEL POSTEO (para el tono, NO para poner texto): ${caption}` : prompt,
    instructions,
    productImages: imgs,
    productImageUrl: imgs[0] || null,
    platformNote,
  };
}

module.exports = {
  generateCopy,
  generateJson,
  generateBackground,
  generateProductScene,
  generateDiagram,
  analyzeStyle,
  buildVideoPrompt,
  sanitizeText,
  hasGemini,
  currentImagePriceUsd,
  lintCopy,
  VOICE_CORE,
};
