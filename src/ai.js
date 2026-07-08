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
- PLURALES DE MARCA: el tejido/tecnología NO se pluraliza. Correcto: "buzos polar", "camperas softshell". INCORRECTO: "buzos polares", "camperas softshells".
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
    if (pillar === 'educativo') {
      // En educativo la foto es SOLO ilustración: si el texto además nombra prendas
      // del catálogo como "solución", el posteo queda como venta encubierta (feedback
      // real del usuario: "queda muy obvio que quiere vender").
      productInfo += `\nIMAGEN DE LA PIEZA: la foto de fondo es "${visualProduct.name}". Es SOLO decoración/ilustración: NO la menciones, NO la uses de ejemplo y NO nombres prendas o productos a raíz de ella.`;
    } else {
      productInfo += `\nIMAGEN DE LA PIEZA: la foto de fondo es "${visualProduct.name}"${visualProduct.brand ? ` (marca ${visualProduct.brand})` : ''}. NO estás vendiendo ese producto puntual: usalo como ejemplo/ilustración del tema. El copy y el overlay tienen que tener sentido con esa foto (mismo tipo de prenda/calzado); si das ejemplos, que sean de ese tipo de producto.`;
    }
  }

  // Pieza EDUCATIVA = 100% educativa. El valor es el consejo, no el catálogo.
  // Prohibido convertir un tip en lista de productos propios ("buzos polar, camperas
  // softshell o ropa térmica te mantienen...") — eso es venta encubierta y se nota.
  const educationalGuard = pillar === 'educativo'
    ? `\n\nREGLA DE ORO DEL PILAR EDUCATIVO (romperla arruina la pieza):
- La pieza enseña algo útil y se sostiene SOLA, sin vender. PROHIBIDO nombrar productos, modelos, marcas propias o tipos de prenda del catálogo como "la solución" ("buzos polar", "camperas softshell", "nuestros botines", etc.).
- Si el consejo pide hablar de equipamiento, hablá en GENÉRICO y desde el criterio: "ropa de abrigo adecuada", "calzado certificado", "capas que aíslen la humedad" — el QUÉ MIRAR/CÓMO ELEGIR, nunca el QUÉ COMPRAR.
- PROHIBIDO todo CTA de compra ("comprá", "conseguilo", "visitá la tienda", "mirá el catálogo"). El CTA educativo es: guardá el post, compartilo con tu equipo, contanos tu experiencia.
- La marca gana AUTORIDAD siendo la que sabe, no la que aprovecha para vender. Un solo posteo educativo que vende quema la serie entera.`
    : '';
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

  // En educativo, la nota de temporada NO lista prendas (era otra puerta por la que
  // se colaban "buzos, camperas, softshell" en piezas que no deben vender).
  const seasonLine = pillar === 'educativo'
    ? `${seasonContext().split('—')[0].trim()} — podés usar el clima como contexto del consejo, sin listar prendas del catálogo.`
    : seasonContext();

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}${OBJECTIVE_GUIDE[objective] ? `\n${OBJECTIVE_GUIDE[objective]}` : ''}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}
${productInfo}${wholesaleInfo}${educationalGuard}
Temporada: ${seasonLine}${commercial}${winners}${noRepeat}${interaction}${voice}

${carousel ? (['educativo', 'mayorista'].includes(pillar)
    ? `\nCARRUSEL PASO A PASO: devolvé "slides": un array de ${slideCount} objetos {"title","text"}. Es una GUÍA accionable, no un folleto: (1) portada con gancho que promete el resultado ("Guía de talles sin equivocarte", "Cómo comprar al por mayor"), (2-${slideCount - 1}) PASOS numerados y concretos — "title" tipo "PASO 1 — MEDÍ TU CINTURA" y "text" con la instrucción exacta (qué hacer, con qué, qué número anotar), (${slideCount}) cierre con el beneficio + CTA${pillar === 'educativo' ? ' (CTA educativo: guardar/compartir/comentar — nunca comprar)' : ''}. Cada paso tiene que poder hacerse EN EL MOMENTO. Nada repetido entre slides.${pillar === 'educativo' ? ' NINGÚN slide nombra productos/prendas propias como solución.' : ''}\n`
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
  { re: /buzos?\s+polares/i, label: 'plural incorrecto: es "buzos polar" (regla de marca: el tejido no se pluraliza)' },
  { re: /camperas?\s+softshells/i, label: 'plural incorrecto: es "camperas softshell"' },
];

// Venta encubierta en piezas EDUCATIVAS: lo educativo no vende ni nombra el catálogo
// propio como solución (feedback real del usuario, jul-2026).
const EDU_SELLING_PATTERNS = [
  { re: /\b(compr[aá]|conseguil[oa]s?|llevate|adquir[ií])\b/i, label: 'pieza educativa con CTA/verbo de compra (prohibido en educativo)' },
  { re: /nuestr[oa]s?\s+(buzos?|camperas?|remeras?|chombas?|pantalones?|camisas?|mamelucos?|chalecos?|botines?|zapatos?|calzados?|productos?|l[ií]nea|tienda|cat[aá]logo|modelos?)/i, label: 'pieza educativa nombra productos propios ("nuestros X") — debe ser genérica' },
  { re: /(visit[aá]|mir[aá]|entr[aá] a|pas[aá] por)\s+(la |nuestra |el |nuestro )?(tienda|web|cat[aá]logo|local)/i, label: 'pieza educativa manda a la tienda/catálogo (el CTA educativo es guardar/compartir/comentar)' },
  { re: /(buzos?|camperas?|ropa)\s+(polar(es)?|softshell|t[eé]rmica)[^.]{0,80}\b(te|los?|las?)\s+(mantien|proteg|abriga|cuida)/i, label: 'pieza educativa recomienda prendas del catálogo como solución (venta encubierta) — reformular en genérico ("ropa de abrigo adecuada")' },
];

/** Revisa un copy generado y devuelve la lista de problemas (vacía = pasa). */
function lintCopy(copy, { format = 'feed', postType = 'feed', pillar = null } = {}) {
  const problems = [];
  const all = [copy.overlay, copy.caption, copy.cta, ...(copy.slides || []).map((s) => `${s.title} ${s.text}`)]
    .filter(Boolean).join('\n');

  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(all)) problems.push(label);
  }

  if (pillar === 'educativo') {
    for (const { re, label } of EDU_SELLING_PATTERNS) {
      if (re.test(all)) problems.push(label);
    }
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
  let targetModel = model || 'gemini-2.5-flash-image';
  const hasInlineData = body?.contents?.some(c => c?.parts?.some(p => p.inlineData));

  // Si el modelo es Imagen 4/3 y NO hay foto de referencia adjunta (ej. generateBackground o generateDiagram),
  // usamos directamente el endpoint nativo :predict de Imagen con soporte de relación de aspecto.
  if (targetModel && typeof targetModel === 'string' && targetModel.startsWith('imagen-')) {
    if (hasInlineData) {
      // Imagen 4 no admite entrada de imágenes (da error 400: Image in input is not supported for this model).
      // Para escenas que toman el producto del catálogo como referencia, usamos gemini-2.5-flash-image.
      targetModel = 'gemini-2.5-flash-image';
    } else {
      const promptText = body?.contents?.map(c => c?.parts?.filter(p => p.text)?.map(p => p.text)?.join('\n'))?.join('\n') || '';
      const aspectRatio = body?.aspectRatio || '1:1';
      const predictRes = await fetch(`${GEMINI_BASE}/models/${targetModel}:predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          instances: [{ prompt: promptText }],
          parameters: { sampleCount: 1, aspectRatio },
        }),
      });
      if (predictRes.ok) {
        const predJson = await predictRes.json();
        const firstPred = predJson.predictions && predJson.predictions[0];
        if (firstPred && firstPred.bytesBase64Encoded) {
          return {
            predictions: predJson.predictions,
            candidates: [{
              content: {
                parts: [{ inlineData: { data: firstPred.bytesBase64Encoded, mimeType: firstPred.mimeType || 'image/png' } }],
              },
            }],
          };
        }
      }
      const t = await predictRes.text().catch(() => '');
      console.warn(`[ai] ${targetModel}:predict falló (${predictRes.status}: ${t.slice(0, 150)}), cayendo a gemini-2.5-flash-image...`);
      targetModel = 'gemini-2.5-flash-image';
    }
  }

  let res = await fetch(`${GEMINI_BASE}/models/${targetModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify(body),
  });
  if (res.status === 404 && targetModel !== 'gemini-2.5-flash-image') {
    console.warn(`[ai] Modelo ${targetModel} dio 404 en v1beta generateContent, reintentando con gemini-2.5-flash-image...`);
    targetModel = 'gemini-2.5-flash-image';
    res = await fetch(`${GEMINI_BASE}/models/${targetModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(`Gemini ${targetModel} ${res.status}: ${t.slice(0, 300)}`);
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
  'gemini-3.1-flash-image': 0.0672,
  'gemini-3.1-flash-lite-image': 0.02,
  'gemini-3-pro-image': 0.139,
  'gemini-3-pro-image-preview': 0.139,
  'imagen-4.0-generate-001': 0.04,
  'imagen-4.0-ultra-generate-001': 0.06,
  'imagen-3.0-generate-002': 0.03,
  'imagen-3.0-fast-generate-001': 0.015,
  'imagen-3.0-generate-001': 0.03,
  'flux-schnell': 0.003,
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
/**
 * Guía de OCASIÓN: cómo la escena tiene que reflejar la fecha/festividad SIN texto.
 * Detecta fechas patrias argentinas para meter identidad nacional creíble (bandera
 * real en el fondo, luz celeste), no como sticker plano.
 */
function occasionGuidance(occasion) {
  if (!occasion) return '';
  const isPatria = /independencia|25 de mayo|revoluci[oó]n de mayo|d[ií]a de la bandera|g[üu]emes|belgrano|san mart[ií]n/i.test(occasion);
  const patria = isPatria
    ? `\n- ES UNA FECHA PATRIA ARGENTINA: incorporá la identidad nacional de forma CREÍBLE y parte de la foto — una bandera argentina real colgada o flameando al fondo del galpón/taller, luz celeste natural entrando, o el celeste y blanco integrados en objetos reales de la escena. NUNCA como sticker, filtro, guirnalda de dibujito ni gráfico plano. Sobria y de marca, con orgullo de trabajo nacional, sin sobreactuar.`
    : `\n- Reflejá el clima de la fecha con la luz, la escena y el ambiente (energía comercial si es promo/oferta; calidez si es una fecha de comunidad), nunca con texto ni carteles.`;
  return `\nOCASIÓN / FECHA DE LA PIEZA: ${occasion}${patria}`;
}

/** Bloque de BRIEF: las indicaciones explícitas del usuario/plan para esta pieza. */
function briefBlock(brief) {
  if (!brief) return '';
  return `\nBRIEF DE LA PIEZA (respetá estas indicaciones al pie de la letra; las que pidan texto/cupón/precio se resuelven después con tipografía, vos NO escribas texto): "${brief}"`;
}

async function generateBackground({ theme, brief, occasion, format = 'feed', referenceImages = [] } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const prompt = `Actuás como DIRECTOR DE ARTE SENIOR y ESPECIALISTA EN PROMPT ENGINEERING de una agencia creativa premium. Generá la fotografía de fondo ${ratio} para una pieza comercial de BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONCEPTO GENERAL (la imagen tiene que contarlo con autoridad visual, no ser decorativa): "${theme || 'ropa de trabajo e industria'}".${briefBlock(brief)}${occasionGuidance(occasion)}

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
- Fotografía editorial hiperrealista, calidad de campaña publicitaria impresa de alta gama. Lente Hasselblad H6D-100c, óptica 50mm/85mm f/1.8 prime lens, apertura amplia, profundidad de campo real y micro-texturas ultra nítidas.
- Iluminación comercial motivada (softbox de estudio cenital difuso + luz natural de galpón o sol bajo entrando por portón industrial): contraste dramático chiaroscuro con reflejos especulares limpios y sombras con caída real.
- Escenario auténtico argentino del rubro: obra en construcción, taller metalúrgico, depósito logístico, galpón, superficies con desgaste creíble. NADA de estudios genéricos ni escenarios plásticos "de stock".
- Color grading sobrio y premium: ciencia de color Kodak Portra 400, base negro/gris carbón con UN acento naranja quemado (#C1440C) apareciendo de forma orgánica en la escena. Grano fílmico sutil.
${brandStyle ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

REALISMO ANTI-IA (crítico — la foto tiene que pasar por tomada con cámara real):
- PROHIBIDO usar palabras genéricas en la interpretación mental como: hermoso, fotorrealista, 4k, 8k, render, unreal engine, masterpiece.
- Imperfecciones del mundo real: polvo flotando en el aire capturado por la luz volumétrica, arrugas naturales en telas, rayones en herramientas, suciedad creíble en el piso. NADA impecable ni simetría artificial.
- Física de luz real: una sola fuente dominante coherente, sombras que caen exactamente hacia el mismo ángulo, reflejos ópticos imperfectos.

ARQUITECTURA DE NEGATIVE SPACE Y ZONAS SEGURAS (TEXT SAFE AREAS):
- Composición por regla de los tercios con AMPLIO espacio negativo limpio y desenfocado (bokeh/depth of field) en el tercio superior e inferior para permitir la legibilidad absoluta del copy/titular tipográfico que se superpondrá después.
- LA SALIDA ES SOLO LA FOTOGRAFÍA. El diseño gráfico (títulos, precios, logos, íconos, placas) lo agrega DESPUÉS otro sistema: si la imagen trae CUALQUIER texto, letra, número, ícono o logo, se descarta y se pierde el trabajo.
- PROHIBIDO además: marcas visibles, caras reconocibles en primer plano, manos deformes, objetos flotando, aspecto render 3D o IA evidente. Si hay personas, de espaldas o con desenfoque suave.`;

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
async function generateProductScene({ productImageUrl, productName, theme, brief, occasion, format = 'feed' } = {}) {
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
  const prompt = `Actuás como DIRECTOR DE ARTE SENIOR de una campaña publicitaria high-end. Tomá EXACTAMENTE el producto adjunto de la imagen de referencia (fidelidad absoluta de marca: mismo modelo, geometría, color, costuras, etiquetas — queda terminantemente prohibido rediseñarlo o alterar sus proporciones) y componé una escena comercial de catálogo ${ratio} para BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONTEXTO DE LA PIEZA: ${theme || productName || 'indumentaria laboral y seguridad industrial'}.${briefBlock(brief)}${occasionGuidance(occasion)}

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
- El producto es EL héroe y punto focal absoluto de la composición: nítido, con micro-texturas de tela/cuero ultradetalladas, ocupando la posición de máximo impacto visual en la regla de los tercios.
- Lente Hasselblad 85mm f/1.8 prime lens, macro commercial product photography, enfoque selectivo milimétrico en los detalles y terminaciones del producto.
- Escena creíble y auténtica de uso industrial: banco de taller metalúrgico, andamio, pallet de depósito logístico, hormigón pulido, chapa o madera tratada. Utilería mínima y realista SIN competir con el producto.
- Iluminación de estudio dramática (softbox lateral + contraluz rim lighting para recortar el contorno del producto) o luz natural volumétrica de galpón. Sombras suaves con caída y física real.
- Color grading premium: ciencia de color Kodak Portra 400, fondo neutro oscuro (carbón/grafito #1c1c1e) con acentos naranja quemado (#C1440C) sutiles.
${brandStyle ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

REALISMO Y PRESERVACIÓN ESTRUCTURAL (PRODUCT-IN-CONTEXT):
- PROHIBIDO generar alucinaciones visuales, deformaciones de la puntera/suela, o cambios en las letras y etiquetas del packaging/producto original.
- Imperfecciones creíbles en el entorno (no en el producto): superficies con polvo o micro-rayas realistas, profundidad de campo suave con fondo desenfocado (bokeh) para resaltar la figura del producto.

ARQUITECTURA DE ZONAS SEGURAS (NEGATIVE SPACE):
- Aire limpio y desenfocado en los tercios superior e inferior para garantizar contraste absoluto al superponer titulares y precios.
- LA SALIDA ES SOLO LA FOTOGRAFÍA. El diseño gráfico (títulos, precios, logos, íconos, placas, badges) lo agrega DESPUÉS otro sistema: si la imagen trae CUALQUIER texto, letra, número, ícono o placa gráfica, se descarta y se pierde el trabajo.
- PROHIBIDO además: logos inventados, manos/pies deformes, duplicar el producto, cambiarle color o forma, o aspecto de render 3D artificial.`;

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
 * ESTUDIO: escena profesional con UNO O VARIOS productos reales (combo/outfit).
 * A diferencia de generateProductScene (pieza del calendario, 1 producto), acá se
 * mandan hasta 4 fotos de referencia y la escena tiene que integrarlos juntos de
 * forma creíble. Devuelve { buffer, mimeType, costUsd } o null (best-effort).
 * products: [{ name, imageUrl }]
 */
async function generateStudioScene({ products = [], theme, format = 'feed' } = {}) {
  if (!hasGemini() || isImageQuotaCoolingDown() || !products.length) return null;

  const refs = [];
  for (const p of products.slice(0, 4)) {
    if (!p.imageUrl) continue;
    try {
      const r = await fetch(p.imageUrl);
      if (!r.ok) continue;
      let buf = Buffer.from(await r.arrayBuffer());
      buf = await resizeImage(buf, 1024).catch(() => buf);
      refs.push({ data: buf.toString('base64'), mimeType: 'image/jpeg' });
    } catch (_) { /* seguimos con las que se pudieron bajar */ }
  }
  if (!refs.length) return null;

  const isCombo = products.length > 1;
  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const names = products.map((p, i) => `${i + 1}. ${p.name}`).join('\n');

  const prompt = `Actuás como DIRECTOR DE ARTE SENIOR y FOTÓGRAFO COMERCIAL DE ALTA GAMA. Componé UNA fotografía publicitaria ${ratio} para BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

PRODUCTOS DE REFERENCIA (${refs.length} foto${refs.length > 1 ? 's' : ''} adjunta${refs.length > 1 ? 's' : ''} — FIDELIDAD ABSOLUTA a cada uno: conserva geometría, color exacto, costuras, ojales, suelas, logotipos y terminaciones; prohibido rediseñarlos ni alterar sus proporciones):
${names}

${isCombo
    ? `CONFIGURACIÓN DE COMBO/CONJUNTO COMERCIAL: Los ${products.length} productos deben presentarse integrados y coordinados como un equipo de trabajo de alta gama. Puedes elegir una de estas dos puestas en escena: (A) Modelo/Trabajador en acción creíble vistiendo el conjunto completo (prendas puestas con caída real de tejido grafa/trucker pesado y botines calzados, rostro de espaldas o en sombra parcial para no distraer del producto); o (B) Bodegón arquitectónico / Flat-lay sobre superficie industrial (mesa de trabajo de acero cepillado, hormigón pulido o madera tratada) donde cada prenda y calzado tiene su propio espacio focal, iluminación dramática y textura nítida. Ningún producto debe quedar tapado por otro.`
    : `El producto es EL héroe y punto focal absoluto: nítido, con micro-texturas de tela/cuero ultradetalladas, ocupando la posición de máximo impacto visual.`}
${theme ? `\nCONTEXTO/IDEA DE LA ESCENA: ${theme}.` : ''}

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
- Escena auténtica del rubro laboral/industrial argentino: taller metalúrgico, obra en construcción, depósito logístico o galpón con textura real. Utilería mínima y realista SIN robar protagonismo.
- Lente Hasselblad 85mm prime lens f/1.8, enfoque selectivo milimétrico en las texturas del tejido y cuero, profundidad de campo con bokeh arquitectónico en el fondo.
- Iluminación motivada de estudio chiaroscuro (softbox lateral + contraluz rim lighting para recortar el contorno) o luz natural rasante de galpón. Sombras volumétricas con física real.
- Color grading premium: Kodak Portra 400, base oscuro/carbón (#1c1c1e) con acentos naranja quemado (#C1440C) sutiles.
- REALISMO ANTI-IA: Imperfecciones creíbles en el entorno (desgaste en piso o herramientas), una sola fuente de luz coherente. Manos anatómicamente perfectas si aparecen.

REGLA DURA DE NEGATIVE SPACE: LA SALIDA ES SOLO LA FOTOGRAFÍA. Prohibido incluir texto, letras, números, logos inventados o placas gráficas superpuestas. Aire limpio y desenfocado arriba y abajo para futura superposición tipográfica.`;

  try {
    const parts = [{ text: prompt }, ...refs.map((r) => ({ inlineData: r }))];
    const data = await geminiGenerateContent(config.gemini.imageModel, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const img = inlineImageFromResponse(data);
    if (img) img.costUsd = await logImageUsage('estudio');
    if (img) img.prompt = prompt;
    return img;
  } catch (err) {
    if (err.status === 429) { markImageQuotaHit(); console.warn('[ai] Cuota de imágenes agotada (429) en el estudio.'); }
    else console.warn(`[ai] generateStudioScene falló: ${err.message}`);
    return null;
  }
}

/* =========================================================================
 * PROMPTS DE VIDEO (Veo/Gemini) — bloques compartidos.
 * El problema #1 con estos modelos es que "re-imaginan" el producto entre frames.
 * Estas reglas atacan eso: ancla textual del producto + fidelidad dura + cámara
 * quieta (las órbitas son lo que más rompe la fidelidad).
 * ========================================================================= */

/** Ancla textual: nombre + descripción real acota lo que el modelo puede inventar. */
function productAnchorLines(products) {
  return products.map((p, i) => {
    const desc = p.description ? ` — ${String(p.description).replace(/\s+/g, ' ').slice(0, 200)}` : '';
    return `${products.length > 1 ? `${i + 1}. ` : ''}${p.name}${desc}`;
  }).join('\n');
}

function videoFidelityRules(isCombo) {
  return `FIDELIDAD DEL PRODUCTO (lo MÁS importante — si esto se rompe, el video no sirve):
- ${isCombo ? 'Cada producto' : 'El producto'} tiene que quedar IDÉNTICO en TODOS los frames: mismo color exacto, mismo corte, mismos bolsillos, cierres, costuras, etiquetas y logo que en las fotos de referencia. No cambia nada de un frame a otro.
- PROHIBIDO: rediseñar, recolorear o "mejorar" el producto; agregarle estampados, texturas, logos o marcas que no estén en las fotos; deformarlo, estirarlo o cambiarle la silueta; que "mute" (morphing) entre frames.
- El producto queda SIEMPRE dentro del cuadro, sin cortes de plano que lo obliguen a re-generarse. Un solo plano continuo es mejor que varios cortes.
- Si tenés que elegir entre un movimiento de cámara vistoso y mantener el producto idéntico, ELEGÍ mantenerlo idéntico.`;
}

function videoCameraRules() {
  return `CÁMARA CINEMATOGRÁFICA (diseñada milimétricamente para que el producto NO mute ni se deforme): plano fijo estable o push-in cinemático MUY lento y suave hacia el producto hero (dolly track), con micro-animación ambiental elegante (polvo flotando en luz volumétrica, destellos especulares). PROHIBIDO: órbitas de 360°, giros bruscos o paneos laterales rápidos (obligan al modelo a inventar ángulos y destruyen la fidelidad del producto). Física de luz coherente, motion blur natural de 24fps film look.`;
}

function videoRealismRules() {
  return `REALISMO ANTI-IA (que NO parezca video generado): imperfecciones reales (desgaste, polvo, arrugas de tela con física creíble, piso sucio de obra), una sola fuente de luz coherente con sombras hacia el mismo lado, leve grano fílmico, saturación contenida tipo documental. PROHIBIDO: superficies plásticas perfectas, movimientos flotantes irreales, cámara imposiblemente estable, colores vibrantes de render, transiciones mágicas. Si hay personas: de espaldas o fuera de foco, manos con anatomía perfecta.`;
}

/**
 * ESTUDIO: súper-prompt de VIDEO para pegar en Gemini/Veo, con uno o varios
 * productos (combo). No llama a ninguna API: el video lo genera el usuario a mano
 * y después lo sube a la biblioteca del estudio.
 */
function buildStudioVideoPrompt({ products = [], theme, format = 'story', duration = 8 } = {}) {
  const isCombo = products.length > 1;
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const allImages = products.flatMap((p) => (Array.isArray(p.images) && p.images.length ? p.images : [p.imageUrl]).filter(Boolean));

  const prompt = `[SUBJECT & ACTION]: ${isCombo
    ? `Un trabajador profesional en un entorno industrial auténtico vistiendo un conjunto de trabajo BLACKS (${products.map(p => p.name).join(' + ')}). Los productos se muestran en uso real con una progresión natural de movimiento, donde la tela pesada y el calzado de seguridad lucen firmes, cómodos y ultra resistentes.`
    : `El producto hero (${products[0]?.name || 'calzado/indumentaria BLACKS'}) presentado en su entorno natural de trabajo industrial, mostrando su firmeza, costuras reforzadas y terminación premium en acción.`}
${productAnchorLines(products)}

[CAMERA MOVEMENT]: Plano fijo estable de alta calidad de cine 35mm o push-in cinemático MUY lento y suave hacia el producto (dolly track frontal/lateral a velocidad constante). Cámara montada en grúa o estabilizador pesado. PROHIBIDO: órbitas de 360°, giros bruscos, paneos rápidos o zoom digital irreal.

[LIGHTING & ATMOSPHERE]: Iluminación dramática motivada de galpón industrial (haces de luz solar baja o lámparas halógenas de taller entrando por portón alto, cruzando el aire con polvo en suspensión volumétrico). Contraluz (rim lighting) para separar el contorno del calzado/indumentaria del fondo oscuro. Color grading Kodak Portra 400, tonos carbón con acentos naranja quemado.

[FIDELITY & REALISM CONSTRAINTS]:
- ${isCombo ? 'Cada producto del combo' : 'El producto'} se mantiene 100% IDÉNTICO y consistente en todos los fotogramas (cero morphing, cero mutaciones en logos, costuras o suelas).
- Física de tela y movimiento corporal anatómicamente perfectos. Sombras con caída real.
- SIN TEXTO en pantalla, sin placas, sin números ni marcas de agua.
- Duración: ~${duration} segundos a 24fps motion blur natural.`;

  return {
    prompt,
    instructions: [
      'RECOMENDADO (Estándar Oro Image-to-Video / i2v en Runway Gen-3 / Kling / Veo): Subí como "Primer Fotograma" (Frame 0) la imagen perfecta ya renderizada en estudio. Así el video anima solo la luz y la cámara sin deformar la ropa/calzado.',
      `OPCIÓN GEMINI VEO (Reference-to-Video): Subí las fotos de referencia de ${isCombo ? 'TODOS los productos' : 'el producto'} (frente, espalda y detalle para máxima fidelidad).`,
      `Pegá el prompt cinematográfico. Elegí formato ${ratio} y ~${duration}s.`,
      'Descargá el .mp4 e ingrésalo acá con "Subir resultado" para guardarlo en la biblioteca del estudio.',
    ],
    productImages: allImages,
    platformNote: 'Para máxima calidad sin alucinaciones, el flujo top agencia es Image-to-Video (i2v): toma la imagen fotográfica generada (donde el producto ya quedó 100% idéntico) y súbela a Runway Gen-3, Kling AI o Gemini Veo i2v junto con este prompt cinemático.',
  };
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
function buildVideoPrompt({ productName, productDescription, productImages = [], productImageUrl, theme, format = 'story', caption } = {}) {
  const imgs = (productImages && productImages.length ? productImages : [productImageUrl]).filter(Boolean);
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const anchor = productAnchorLines([{ name: productName || 'producto de trabajo', description: productDescription }]);
  const prompt = `Creá un video comercial ${ratio} de ~8 segundos para BLACKS, una marca argentina de ropa de trabajo y calzado de seguridad.

PRODUCTO (usá EXACTAMENTE el de las imágenes de referencia adjuntas):
${anchor}

${videoFidelityRules(false)}

ESCENA: mostralo en un entorno real con contexto (${theme || 'obra / taller / depósito / fábrica / calle'}), usado o exhibido de forma creíble. Ambiente real argentino, no set de estudio artificial.
${videoCameraRules()}
${videoRealismRules()}
ESTÉTICA: robusta, premium, alto contraste, look de aviso moderno. SIN texto en pantalla (el texto/subtítulos los agrego después). Terminá en un plano hero limpio del producto.`;
  const instructions = [
    'RECOMENDADO (Estándar Oro Image-to-Video / i2v en Runway Gen-3 / Kling / Luma / Veo): Subí como "Primer Fotograma" (Frame 0 / Input Image) la foto estática generada por el sistema. Eso garantiza 100% cero deformación del producto.',
    'OPCIÓN GEMINI VEO (Reference-to-Video): Subí VARIAS fotos del producto desde distintos ángulos (frente, espalda, detalle) y pegá el prompt.',
    `Elegí formato ${ratio} y duración ~8s.`,
    'Descargá el video .mp4 y subilo al panel (botón "Subir video") para publicarlo en Instagram.',
  ];
  const platformNote = 'ESTRATEGIA DE VIDEO PUBLICITARIO: Si generas video desde texto puro o solo con fotos sueltas, los modelos suelen alucinar o alterar costuras y logos. El método profesional es Image-to-Video (i2v): toma el PNG final de alta calidad logrado en la pieza estática (donde el calzado/indumentaria ya está en contexto) y anímalo en Runway Gen-3 Alpha, Kling AI o Gemini Veo i2v usando las directrices cinemáticas de este prompt.';
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
  generateStudioScene,
  buildStudioVideoPrompt,
  generateDiagram,
  analyzeStyle,
  buildVideoPrompt,
  sanitizeText,
  hasGemini,
  currentImagePriceUsd,
  lintCopy,
  VOICE_CORE,
};
