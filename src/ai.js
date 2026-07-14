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

HASHTAGS: 4 a 6, mezclando marca (#BlacksIndumentaria), rubro (#RopaDeTrabajo #CalzadoDeSeguridad #IndumentariaLaboral), la marca/producto puntual y algo local cuando aplique (#Argentina). Nada de #instagood ni genéricos vacíos.

REGLA DE ORO — PROHIBIDO INVENTAR DATOS (romperla es el peor error posible, peor que un caption flojo):
- NUNCA inventes años de fundación/trayectoria ("desde 19XX", "hace X años que..."), cantidad de clientes/sucursales/empleados, premios, cifras de ventas, ni ninguna estadística. Si no tenés el dato EXACTO en el contexto que te pasaron (DATOS VERIFICADOS DE LA EMPRESA, ficha del producto, condiciones mayoristas), NO LO MENCIONES — hablá en general ("con trayectoria en el rubro", "elegidos por empresas de todo el país") sin poner un número que no te dieron.
- Lo mismo con políticas concretas: plazos de devolución/cambio, envío gratis a partir de qué monto, cuotas sin interés, mínimos de compra mayorista, medios de pago. Si el dato está en "DATOS VERIFICADOS DE LA EMPRESA" usalo TAL CUAL viene (no lo redondees ni lo cambies); si no está ahí, no lo afirmes.
- Ante la duda entre sonar más vendedor con un dato lindo pero no confirmado, y sonar más simple pero 100% cierto: SIEMPRE gana lo cierto.`;

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
    sticker: copy.sticker
      ? {
          type: copy.sticker.type,
          question: sanitizeText(copy.sticker.question),
          options: (copy.sticker.options || []).map(sanitizeText),
          correct_index: copy.sticker.correct_index,
        }
      : null,
    template: copy.template || null,
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

function buildCopyPrompt({ pillar, pillarDetail, postType, format, product, visualProduct, brandProfile, interactionHint, wantSticker, carousel, slideCount = 3, wholesale, commercialContext, topCaptions, objective, recentPieces, companyFacts, templateOptions, directorNotes }) {
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

  // Piezas SEMI: además del copy, se especifica EXACTAMENTE el sticker de Instagram
  // que va a agregarse a mano (tipo, pregunta, opciones textuales, respuesta correcta).
  // Sin esto, el panel decía "agregá una encuesta" sin decir QUÉ opciones poner.
  const stickerSpec = wantSticker
    ? `\n\nSTICKER INTERACTIVO (obligatorio): esta pieza se publica a mano para agregarle un sticker de Instagram. Devolvé también "sticker", la especificación EXACTA y lista para copiar:
- "type": "encuesta" | "quiz" | "pregunta" | "slider" — elegí según la interacción pedida (${interactionHint || 'una encuesta simple'}).
- "question": la pregunta textual del sticker (corta, en voseo, coherente con la imagen y el copy).
- "options": las opciones EXACTAS a tipear. Encuesta: 2 a 4 opciones de máx. 25 caracteres. Quiz: 2 a 4 opciones cortas. Pregunta abierta o slider: array vacío.
- "correct_index": SOLO para quiz, el índice (desde 0) de la respuesta correcta. En el resto, null.
La pregunta y las opciones tienen que ser concretas y fáciles de contestar en 2 segundos (nada genérico tipo "¿Te gusta?"). El overlay de la imagen y el sticker deben complementarse, no repetirse textual.`
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

  // Datos verificados de la web oficial: la ÚNICA fuente de verdad para hechos de la
  // empresa (envíos, cuotas, plazos, mínimos, trayectoria). Fuera de acá, no se afirma.
  const facts = companyFacts ? `\n\n${companyFacts}` : '';

  // El cerebro elige el FORMATO DE IMAGEN (plantilla) que mejor le queda a esta pieza,
  // entre las candidatas válidas para el producto/pilar. Va en la misma respuesta del
  // copy (gratis). Si no elige, se rota por seed.
  const templates = (Array.isArray(templateOptions) && templateOptions.length)
    ? `\n\nFORMATO DE IMAGEN (elegí el que MEJOR comunica ESTA pieza según su mensaje y objetivo; devolvé "template" con el nombre exacto):\n${templateOptions.map((t) => `- ${t.name}: ${t.desc}`).join('\n')}`
    : '';

  // Ángulo decidido por el director creativo (el análisis previo de la pieza):
  // el copy lo desarrolla, no lo contradice.
  const director = directorNotes
    ? `\nÁNGULO DEL DIRECTOR CREATIVO (desarrollalo, es la línea de esta pieza): ${directorNotes}`
    : '';

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}${OBJECTIVE_GUIDE[objective] ? `\n${OBJECTIVE_GUIDE[objective]}` : ''}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}${director}
${productInfo}${wholesaleInfo}${educationalGuard}${facts}
Temporada: ${seasonLine}${commercial}${winners}${noRepeat}${interaction}${stickerSpec}${templates}${voice}

${carousel ? (['educativo', 'mayorista'].includes(pillar)
    ? `\nCARRUSEL PASO A PASO: devolvé "slides": un array de ${slideCount} objetos {"title","text"}. Es una GUÍA accionable, no un folleto: (1) portada con gancho que promete el resultado ("Guía de talles sin equivocarte", "Cómo comprar al por mayor"), (2-${slideCount - 1}) PASOS numerados y concretos — "title" tipo "PASO 1 — MEDÍ TU CINTURA" y "text" con la instrucción exacta (qué hacer, con qué, qué número anotar), (${slideCount}) cierre con el beneficio + CTA${pillar === 'educativo' ? ' (CTA educativo: guardar/compartir/comentar — nunca comprar)' : ''}. Cada paso tiene que poder hacerse EN EL MOMENTO. Nada repetido entre slides.${pillar === 'educativo' ? ' NINGÚN slide nombra productos/prendas propias como solución.' : ''}\n`
    : `\nCARRUSEL: además, devolvé "slides": un array de ${slideCount} objetos {"title","text"} para un carrusel deslizable. Cada slide UN punto distinto, con progresión: (1) gancho, (2-${slideCount - 1}) beneficios/datos concretos, (${slideCount}) cierre + CTA. "title" cortísimo (2-4 palabras, va grande en pantalla), "text" 1 línea corta. Nada repetido entre slides.\n`) : ''}
Escribí el copy siguiendo la voz de marca y las reglas. Devolvé SOLO un JSON válido con esta forma exacta:
{"overlay": "...", "caption": "...", "hashtags": "...", "cta": "..."${carousel ? ', "slides": [{"title":"...","text":"..."}]' : ''}${wantSticker ? ', "sticker": {"type":"encuesta","question":"...","options":["...","..."],"correct_index":null}' : ''}${(Array.isArray(templateOptions) && templateOptions.length) ? ', "template": "nombre_de_la_plantilla_elegida"' : ''}}`;
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
  { re: /no busques m[aá]s/i, label: 'usa "no busques más" (frase de IA)' },
  { re: /te tenemos cubiert/i, label: 'usa "te tenemos cubierto" (frase de IA)' },
  { re: /tu (mejor )?aliad[oa]/i, label: 'usa "tu aliado/a" (frase de IA)' },
  { re: /marca la diferencia/i, label: 'usa "marca la diferencia" (frase de IA)' },
  { re: /soluci[oó]n perfecta|opci[oó]n perfecta/i, label: 'usa "solución/opción perfecta" (frase de IA)' },
  { re: /es m[aá]s que (un|una)\b/i, label: 'usa "es más que un/una..." (frase de IA)' },
];

// Venta encubierta en piezas EDUCATIVAS: lo educativo no vende ni nombra el catálogo
// propio como solución (feedback real del usuario, jul-2026).
const EDU_SELLING_PATTERNS = [
  { re: /\b(compr[aá]|conseguil[oa]s?|llevate|adquir[ií])\b/i, label: 'pieza educativa con CTA/verbo de compra (prohibido en educativo)' },
  { re: /nuestr[oa]s?\s+(buzos?|camperas?|remeras?|chombas?|pantalones?|camisas?|mamelucos?|chalecos?|botines?|zapatos?|calzados?|productos?|l[ií]nea|tienda|cat[aá]logo|modelos?)/i, label: 'pieza educativa nombra productos propios ("nuestros X") — debe ser genérica' },
  { re: /(visit[aá]|mir[aá]|entr[aá] a|pas[aá] por)\s+(la |nuestra |el |nuestro )?(tienda|web|cat[aá]logo|local)/i, label: 'pieza educativa manda a la tienda/catálogo (el CTA educativo es guardar/compartir/comentar)' },
  { re: /(buzos?|camperas?|ropa)\s+(polar(es)?|softshell|t[eé]rmica)[^.]{0,80}\b(te|los?|las?)\s+(mantien|proteg|abriga|cuida)/i, label: 'pieza educativa recomienda prendas del catálogo como solución (venta encubierta) — reformular en genérico ("ropa de abrigo adecuada")' },
];

// Datos inventados (bug real, jul-2026: una pieza de marca dijo "Desde 1993" sin que
// ese año exista en ningún lado — la IA lo inventó porque sonaba creíble). Se chequea
// SIEMPRE, en los 8 pilares: ningún ángulo necesita una cifra falsa para funcionar.
const FABRICATION_PATTERNS = [
  { re: /\bdesde\s+(19|20)\d{2}\b/i, label: 'menciona un año de fundación/trayectoria ("desde 19XX/20XX") — dato no verificado, no lo inventes' },
  { re: /\b(hace\s+m[aá]s de\s+\d+\s+a[ñn]os|\d+\s*\+?\s*a[ñn]os\s+(de\s+)?(trayectoria|experiencia|en\s+el\s+mercado))/i, label: 'menciona una cantidad de años de trayectoria — dato no verificado, no lo inventes' },
  { re: /\+?\d[\d.,]*\s*(mil\s+)?(clientes|empresas|sucursales|locales|empleados)\b/i, label: 'menciona una cifra de clientes/empresas/sucursales — dato no verificado, no lo inventes' },
  { re: /\bmiles de (clientes|empresas)\b/i, label: 'menciona "miles de clientes/empresas" — cifra no verificada, no la inventes' },
  { re: /l[ií]der(es)?\s+(del|en el)\s+mercado|somos\s+(los\s+)?(n[uú]mero uno|m[aá]s elegidos)|el\s+(m[aá]s|mejor)\s+elegido/i, label: 'afirmación de liderazgo/superlativo sin dato que la respalde' },
];

const STICKER_TYPES = ['encuesta', 'quiz', 'pregunta', 'slider'];

/** Valida la especificación de sticker de una pieza semi. Devuelve problemas (vacía = pasa). */
function lintSticker(sticker) {
  const problems = [];
  if (!sticker || typeof sticker !== 'object') return ['falta la especificación del sticker (pieza semi)'];
  if (!STICKER_TYPES.includes(sticker.type)) problems.push(`tipo de sticker inválido ("${sticker.type}")`);
  if (!String(sticker.question || '').trim()) problems.push('el sticker no tiene pregunta');
  const opts = Array.isArray(sticker.options) ? sticker.options.filter((o) => String(o || '').trim()) : [];
  if (['encuesta', 'quiz'].includes(sticker.type)) {
    if (opts.length < 2) problems.push(`el sticker de ${sticker.type} necesita al menos 2 opciones exactas`);
    if (opts.length > 4) problems.push('el sticker tiene más de 4 opciones (Instagram permite hasta 4)');
    const long = opts.find((o) => String(o).length > 30);
    if (long) problems.push(`opción de sticker muy larga ("${String(long).slice(0, 30)}…"): máx ~25 caracteres`);
  }
  if (sticker.type === 'quiz') {
    const ci = sticker.correct_index;
    if (ci === null || ci === undefined || !Number.isInteger(Number(ci)) || Number(ci) < 0 || Number(ci) >= opts.length) {
      problems.push('el quiz no indica cuál es la respuesta correcta (correct_index)');
    }
  }
  return problems;
}

/** Revisa un copy generado y devuelve la lista de problemas (vacía = pasa). */
function lintCopy(copy, { format = 'feed', postType = 'feed', pillar = null, wantSticker = false } = {}) {
  const problems = [];
  const all = [copy.overlay, copy.caption, copy.cta,
    ...(copy.slides || []).map((s) => `${s.title} ${s.text}`),
    ...(copy.sticker ? [copy.sticker.question, ...(copy.sticker.options || [])] : [])]
    .filter(Boolean).join('\n');

  if (wantSticker) problems.push(...lintSticker(copy.sticker));

  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(all)) problems.push(label);
  }

  for (const { re, label } of FABRICATION_PATTERNS) {
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
    sticker: obj.sticker && typeof obj.sticker === 'object'
      ? {
          type: String(obj.sticker.type || '').toLowerCase(),
          question: obj.sticker.question || '',
          options: Array.isArray(obj.sticker.options) ? obj.sticker.options.map((o) => String(o || '').trim()).filter(Boolean) : [],
          correct_index: Number.isInteger(Number(obj.sticker.correct_index)) && obj.sticker.correct_index !== null
            ? Number(obj.sticker.correct_index) : null,
        }
      : null,
    // Plantilla elegida por el cerebro (se valida contra las candidatas al renderizar).
    template: obj.template ? String(obj.template).trim().toLowerCase() : null,
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
      // negativePrompt: Imagen le da más peso a este campo dedicado que a una mención
      // de "sin texto" perdida en medio de un prompt largo — por eso además de estar
      // en el prompt, se manda acá aparte.
      const negativePrompt = 'text, letters, words, numbers, typography, title, banner, sign, coupon code, price tag, watermark, logo, wordmark, emblem, badge, invented brand mark';
      const predictRes = await fetch(`${GEMINI_BASE}/models/${targetModel}:predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({
          instances: [{ prompt: promptText }],
          parameters: { sampleCount: 1, aspectRatio, negativePrompt },
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
 * VARIEDAD DE ESCENA (anti-monotonía)
 * Los prompts fijos ("taller metalúrgico + naranja quemado") hacían que todas
 * las piezas se parecieran — y un feed repetitivo grita IA. Cada pieza elige
 * una combinación distinta de escenario/luz/cámara, determinística por seed
 * (mismo slot = misma escena al regenerar plantilla, distinto slot = distinta).
 * ========================================================================= */

const SCENE_POOL = {
  escenario: [
    'taller metalúrgico con banco de trabajo de acero, morsa, virutas y herramientas colgadas en un panel',
    'obra en construcción: encofrados de madera, hierros del 8 atados con alambre, bloques y polvo de cemento en el aire',
    'depósito logístico con racks altos cargados, pallets de madera estibados y una zorra hidráulica',
    'galpón industrial amplio con portón corredizo alto abierto, piso de hormigón alisado con marcas de uso',
    'taller mecánico rural: máquinas agrícolas, mesada con grasa, madera gastada y bidones',
    'estructura metálica en montaje con andamios tubulares y tablones',
    'carpintería con madera estacionada apilada, aserrín flotando en la luz y prensas de banco',
    'patio de materiales a cielo abierto con contenedores oxidados, chapas onduladas y cadenas',
  ],
  luz: [
    'sol bajo de la tarde entrando rasante por el portón: sombras largas, tonos cálidos y bordes dorados',
    'mediodía con haces de luz volumétrica cayendo desde tragaluces altos, polvo en suspensión visible',
    'amanecer frío con neblina suave: luz azulada, contraste bajo y ambiente callado',
    'noche de taller: lámparas halógenas colgantes que arman islas de luz cálida sobre fondo en penumbra',
    'día nublado de luz pareja y difusa, colores naturales desaturados tipo documental',
    'contraluz dramático desde una abertura: siluetas recortadas con rim light y flare sutil',
  ],
  camara: [
    'ángulo bajo (contrapicado suave) que le da presencia y solidez al sujeto',
    'cámara a la altura del pecho, encuadre frontal en tres cuartos, naturalidad de foto documental',
    'leve picado sobre la superficie de trabajo, casi flat-lay pero con perspectiva real',
    'cámara a ras del piso: primer plano protagonista y fondo profundo totalmente desenfocado',
    'plano medio lateral con capas de profundidad: algo fuera de foco en primerísimo plano, sujeto nítido detrás',
  ],
};

/**
 * Elige una combinación de escena determinística por seed (o aleatoria sin seed).
 * Devuelve { escenario, luz, camara, describe() }.
 */
function sceneVariation(seed = null) {
  const n = seed !== null && Number.isFinite(Number(seed))
    ? Math.abs(Math.trunc(Number(seed)))
    : Math.floor(Math.random() * 99991);
  const pick = (arr, salt) => arr[(n * 7 + salt) % arr.length];
  const v = {
    escenario: pick(SCENE_POOL.escenario, 0),
    luz: pick(SCENE_POOL.luz, 3),
    camara: pick(SCENE_POOL.camara, 5),
  };
  v.describe = () => `- ESCENARIO de esta pieza (usalo, no lo cambies por el genérico de siempre): ${v.escenario}.
- LUZ de esta pieza: ${v.luz}.
- CÁMARA/ENCUADRE de esta pieza: ${v.camara}.`;
  return v;
}

/**
 * Regla dura anti-texto/anti-logo, compartida por todos los prompts de imagen.
 * Repetida a propósito con distintas palabras: algunos modelos (Imagen sobre todo)
 * ignoran una única mención de "sin texto" en medio de un prompt largo.
 * strict=true se usa en el segundo intento, si el primero vino con texto/logo.
 */
function noTextNoLogoRule(strict = false) {
  const base = `REGLA DURA — CERO TIPOGRAFÍA: la salida es SOLO la fotografía/ilustración, sin ninguna letra, palabra, número, título, cartel, código, precio, cupón, sticker ni tipografía de ningún tipo, en NINGÚN idioma (ni español, ni inglés, ni inventado) — ni siquiera la palabra "BLACKS". El texto y el logo se agregan DESPUÉS con un sistema de diseño aparte; si la imagen trae cualquier rastro de texto o de un logo/isotipo (real o inventado), se descarta entera.
REGLA DURA — CERO LOGOS: prohibido inventar o insinuar un logo, isotipo, escudo, sello o marca gráfica de ningún tipo (ni de BLACKS ni de ninguna otra marca), aunque sea sutil o parcialmente tapado.`;
  if (!strict) return base;
  return `${base}
REINTENTO ESTRICTO: el intento anterior violó esta regla. Es la instrucción MÁS IMPORTANTE del prompt, por encima de cualquier otra idea creativa — priorizala incluso si el resultado es una composición más simple y menos "publicitaria". Ante la duda, dejá más aire vacío y menos elementos en vez de arriesgarte a escribir algo.`;
}

/**
 * Verificación de calidad post-generación: se le muestra la imagen ya generada a un
 * modelo de visión y se le pregunta si coló texto o un logo (lo que rompió la pieza
 * de Independencia: un botín inventado con un titular en inglés mal escrito horneado
 * en la foto). Best-effort — si el chequeo en sí falla (cuota, red), se asume OK para
 * no trabar todo el pipeline por un problema de la verificación y no de la imagen.
 */
async function checkImageQuality(img) {
  try {
    const data = await geminiGenerateContent(config.gemini.visionModel, {
      contents: [{
        role: 'user',
        parts: [
          { text: `Sos control de calidad de una agencia de publicidad. Mirá esta imagen y respondé SOLO un JSON, sin explicación adicional: {"hasText": bool, "hasLogo": bool, "notes": "breve, en español"}.
- "hasText": true si aparece CUALQUIER letra, palabra, número, título, cartel, código de cupón o tipografía visible en la foto, en cualquier idioma, sin importar cuán chica, borrosa o parcial.
- "hasLogo": true SOLO si aparece un logo, isotipo o wordmark de MARCA COMERCIAL (inventada o real: por ejemplo un logo de ropa, de calzado, o cualquier isotipo tipo "sello de marca"). NO cuenta como logo: banderas nacionales (incluida la bandera Argentina con su sol), escudos patrios, ni símbolos religiosos, deportivos o culturales genéricos — esos SÍ pueden estar si el contexto de la escena los pide.` },
          { inlineData: { data: img.buffer.toString('base64'), mimeType: img.mimeType } },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 150, thinkingConfig: { thinkingBudget: 0 } },
    });
    const raw = textFromResponse(data).replace(/```json|```/g, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : raw);
    return { ok: !obj.hasText && !obj.hasLogo, hasText: !!obj.hasText, hasLogo: !!obj.hasLogo, notes: obj.notes || '' };
  } catch (err) {
    console.warn(`[ai] chequeo de calidad de imagen falló (sigo, asumo OK): ${err.message}`);
    return { ok: true };
  }
}

/* =========================================================================
 * GROQ (fallback de copy)
 * ========================================================================= */

async function groqCopy(promptUser, wantSlides = false, wantSticker = false) {
  if (!config.groq.apiKey) throw new Error('No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas para generar copy.');
  const stickerShape = wantSticker ? ',"sticker":{"type","question","options":[...],"correct_index"} — "sticker" es OBLIGATORIO' : '';
  const shape = wantSlides
    ? `{"overlay","caption","hashtags","cta","slides":[{"title","text"},...]${stickerShape}} — "slides" es OBLIGATORIO`
    : `{"overlay","caption","hashtags","cta"${stickerShape}}`;
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
              ...(opts.wantSticker ? {
                sticker: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['encuesta', 'quiz', 'pregunta', 'slider'] },
                    question: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    correct_index: { type: 'integer', nullable: true },
                  },
                  required: ['type', 'question', 'options'],
                },
              } : {}),
              ...((Array.isArray(opts.templateOptions) && opts.templateOptions.length)
                ? { template: { type: 'string', enum: opts.templateOptions.map((t) => t.name) } }
                : {}),
            },
            // En carrusel las slides son OBLIGATORIAS: sin ellas la pieza sale simple.
            // En piezas semi, el sticker también. La plantilla, si se ofrecieron opciones.
            required: ['overlay', 'caption', 'hashtags', 'cta', ...(opts.carousel ? ['slides'] : []), ...(opts.wantSticker ? ['sticker'] : []), ...((Array.isArray(opts.templateOptions) && opts.templateOptions.length) ? ['template'] : [])],
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
  return { copy: sanitizeCopy(await groqCopy(promptUser, Boolean(opts.carousel), Boolean(opts.wantSticker))), model: 'groq' };
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
const PATRIA_RE = /independencia|25 de mayo|revoluci[oó]n de mayo|d[ií]a de la bandera|g[üu]emes|belgrano|san mart[ií]n|orgullo argentino|orgullo nacional|bandera argentina|celeste y blanco|hecho en argentina/i;

/**
 * Identidad patria CREÍBLE en la escena (bandera real, luz celeste) — reutilizable
 * tanto para fechas comerciales formales (occasionGuidance) como para cualquier
 * brief que el usuario escriba a mano pidiendo "orgullo argentino"/bandera/sol.
 */
function patrioticVisualGuidance(text) {
  if (!text || !PATRIA_RE.test(text)) return '';
  return `\n- IDENTIDAD PATRIA ARGENTINA pedida en el brief: incorporá la identidad nacional de forma CREÍBLE y parte de la foto — una bandera argentina real colgada o flameando al fondo del galpón/taller, luz celeste natural entrando (o un sol entrando fuerte por una abertura, si el brief lo pide), el celeste y blanco integrados en objetos reales de la escena. NUNCA como sticker, filtro, guirnalda de dibujito ni gráfico plano. Sobria y de marca, con orgullo de trabajo nacional, sin sobreactuar.`;
}

function occasionGuidance(occasion) {
  if (!occasion) return '';
  const patria = PATRIA_RE.test(occasion)
    ? patrioticVisualGuidance(occasion)
    : `\n- Reflejá el clima de la fecha con la luz, la escena y el ambiente (energía comercial si es promo/oferta; calidez si es una fecha de comunidad), nunca con texto ni carteles.`;
  return `\nOCASIÓN / FECHA DE LA PIEZA: ${occasion}${patria}`;
}

/**
 * Bloque de BRIEF. allowScenery=false (tomas de DETALLE/macro) NO agrega la guía patria
 * (bandera/sol) — una bandera en un primer plano cerrado del producto no tiene sentido y
 * fue justo el problema: el zoom "sol bordado" salía con una bandera de fondo.
 */
function briefBlock(brief, { allowScenery = true } = {}) {
  if (!brief) return '';
  return `\nBRIEF DE LA PIEZA (respetá estas indicaciones al pie de la letra; las que pidan texto/cupón/precio se resuelven después con tipografía, vos NO escribas texto): "${brief}"${allowScenery ? patrioticVisualGuidance(brief) : ''}`;
}

/**
 * VISIÓN: mira las fotos reales del producto y describe QUÉ muestra cada una (frontal,
 * lateral, trasera, detalle del sol, suela, en uso...). Así el director de arte deja de
 * elegir el número de foto a ciegas: puede pedir "la foto que muestra el sol" y el
 * overlay coincide con lo que realmente se ve. Best-effort: si falla, devuelve [].
 */
async function describeProductPhotos(imageUrls = []) {
  const urls = [...new Set((imageUrls || []).filter(Boolean))].slice(0, 8);
  if (!urls.length || !hasGemini() || isImageQuotaCoolingDown()) return [];
  const parts = [{
    text: `Sos catalogador de producto. Te paso ${urls.length} fotos DEL MISMO producto (indexadas 0 a ${urls.length - 1}, en orden). Por cada foto decí: "shows" = QUÉ muestra en pocas palabras (ángulo: frontal/3-4/lateral/trasera/cenital, y si es DETALLE/zoom de una parte puntual como "detalle del sol bordado"/"suela de yute"/"etiqueta"/"puntera", o el producto entero); "is_detail" = true si es un primer plano de una parte; "color" = el color DOMINANTE del producto en esa foto, en 1-2 palabras (ej. "azul denim", "crudo", "negro"). Devolvé SOLO un JSON array alineado al orden: [{"i":0,"shows":"...","is_detail":false,"color":"..."},...]. Literal, no inventes.` },
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) { parts.push({ text: '(foto no disponible)' }); continue; }
      let buf = Buffer.from(await r.arrayBuffer());
      buf = await resizeImage(buf, 640).catch(() => buf);
      parts.push({ inlineData: { data: buf.toString('base64'), mimeType: 'image/jpeg' } });
    } catch (_) { parts.push({ text: '(foto no disponible)' }); }
  }
  try {
    const data = await geminiGenerateContent(config.gemini.visionModel, {
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 900, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    });
    const arr = JSON.parse(String(textFromResponse(data)).replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) return [];
    return urls.map((_, i) => {
      const d = arr.find((x) => Number(x.i) === i) || arr[i] || {};
      return { index: i, shows: String(d.shows || '').slice(0, 100), isDetail: Boolean(d.is_detail), color: String(d.color || '').toLowerCase().trim().slice(0, 30) };
    });
  } catch (err) {
    console.warn(`[ai] describeProductPhotos falló (sigo sin descripciones): ${err.message}`);
    return [];
  }
}

async function generateBackground({ theme, brief, occasion, format = 'feed', referenceImages = [], seed = null } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const scene = sceneVariation(seed);
  const hasRefs = referenceImages.slice(0, 3).some((r) => r && r.data && r.mimeType);
  const buildPrompt = (strict) => `Actuás como DIRECTOR DE ARTE SENIOR y ESPECIALISTA EN PROMPT ENGINEERING de una agencia creativa premium. Generá la fotografía de fondo ${ratio} para una pieza comercial de BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONCEPTO GENERAL (la imagen tiene que contarlo con autoridad visual, no ser decorativa): "${theme || 'ropa de trabajo e industria'}".${briefBlock(brief)}${occasionGuidance(occasion)}

QUÉ MOSTRAR (sin foto de referencia de ningún producto puntual — esto es un FONDO/AMBIENTE, no un producto):
- Está PROHIBIDO inventar un producto específico como protagonista: nada de un calzado, bota, campera o prenda puntual en primer plano, nítida y reconocible como "el producto" — eso NO existe en el catálogo real y arruina la pieza (fue justo lo que pasó con un botín inventado que no vendemos).
- Mostrá en cambio AMBIENTE y CONTEXTO: el espacio de trabajo (taller, obra, depósito, galpón), herramientas, texturas, materiales, luz. Si aparece indumentaria o calzado, que sea genérico y secundario — de fondo, algo desenfocado o parcialmente fuera de cuadro, nunca el centro de atención ni con detalle de marca/diseño particular.

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
- Fotografía editorial hiperrealista, calidad de campaña publicitaria impresa de alta gama. Lente Hasselblad H6D-100c, óptica 50mm/85mm f/1.8 prime lens, apertura amplia, profundidad de campo real y micro-texturas ultra nítidas.
${scene.describe()}
- Escenario auténtico argentino del rubro, con superficies de desgaste creíble. NADA de estudios genéricos ni escenarios plásticos "de stock".
- Color grading sobrio y premium: ciencia de color Kodak Portra 400, base negro/gris carbón con UN acento naranja quemado (#C1440C) apareciendo de forma orgánica en la escena. Grano fílmico sutil.
${brandStyle ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

REALISMO ANTI-IA (crítico — la foto tiene que pasar por tomada con cámara real):
- PROHIBIDO usar palabras genéricas en la interpretación mental como: hermoso, fotorrealista, 4k, 8k, render, unreal engine, masterpiece.
- Imperfecciones del mundo real: polvo flotando en el aire capturado por la luz volumétrica, arrugas naturales en telas, rayones en herramientas, suciedad creíble en el piso. NADA impecable ni simetría artificial.
- Física de luz real: una sola fuente dominante coherente, sombras que caen exactamente hacia el mismo ángulo, reflejos ópticos imperfectos.

ARQUITECTURA DE NEGATIVE SPACE Y ZONAS SEGURAS (TEXT SAFE AREAS):
- Composición por regla de los tercios con AMPLIO espacio negativo limpio y desenfocado (bokeh/depth of field) en el tercio superior e inferior para permitir la legibilidad absoluta del copy/titular tipográfico que se superpondrá después.
${noTextNoLogoRule(strict)}
- PROHIBIDO además: caras reconocibles en primer plano, manos deformes, objetos flotando, aspecto render 3D o IA evidente. Si hay personas, de espaldas o con desenfoque suave.`;

  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parts = [{ text: buildPrompt(attempt > 0) }];
      for (const ref of referenceImages.slice(0, 3)) {
        if (ref && ref.data && ref.mimeType) parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
      }
      const data = await geminiGenerateContent(config.gemini.imageModel, {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const img = inlineImageFromResponse(data);
      if (!img) continue;
      spent += await logImageUsage('fondo'); // se generó y se gastó, se use o no
      // Sin referencia real, el chequeo de calidad es la única red de seguridad contra
      // texto/logo horneado en la imagen — vale la pena aunque cueste un poco más.
      const check = hasRefs ? { ok: true } : await checkImageQuality(img);
      if (!check.ok) {
        console.warn(`[ai] generateBackground: descartada por control de calidad (texto=${check.hasText} logo=${check.hasLogo} ${check.notes || ''}), reintentando más estricto...`);
        continue;
      }
      img.costUsd = spent;
      return img;
    } catch (err) {
      if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min y sigo con plantilla mientras tanto.`); return null; }
      console.warn(`[ai] generateBackground falló (intento ${attempt + 1}/2): ${err.message}`);
    }
  }
  console.warn('[ai] generateBackground: sin resultado limpio tras reintentar, sigo con diseño plano.');
  return null;
}

/**
 * Genera una ILUSTRACIÓN DIDÁCTICA (no fotográfica) para piezas educativas:
 * dibujos técnicos tipo "cómo medirse la prenda", comparativas, esquemas de uso.
 * Pensada para la plantilla educativa (fondo claro). Best-effort: null si falla.
 */
async function generateDiagram({ topic, format = 'feed' } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;

  const buildPrompt = (strict) => `Actuás como ILUSTRADOR TÉCNICO EDITORIAL de una marca de indumentaria de trabajo. Generá UNA ilustración didáctica (NO una fotografía) que ENSEÑE visualmente este tema: "${topic || 'cómo elegir ropa de trabajo'}".

QUÉ TIENE QUE SER:
- Un dibujo instructivo claro, tipo manual/infografía: por ejemplo, la silueta de una prenda con cinta métrica y flechas mostrando DÓNDE se mide (pecho, cintura, largo), un botín en corte mostrando la puntera de acero, o una comparativa lado a lado de dos prendas. Las flechas y líneas indicadoras SÍ pueden estar (son dibujo, no texto); los NÚMEROS y ETIQUETAS de esas medidas los agrega después el sistema de diseño.
- Estilo ilustración vectorial plana (flat), trazos limpios y gruesos, mínima cantidad de elementos. Nada de estilo cartoon infantil ni 3D. Genérico: no un producto puntual del catálogo, sino la idea/silueta ilustrada.

PALETA (obligatoria, es la identidad de la marca):
- Fondo blanco o gris muy claro (#f4f4f5), LISO.
- Línea principal en gris carbón oscuro (#1c1c1e).
- UN solo color de acento: naranja quemado (#C1440C) para las flechas/indicaciones importantes.

${noTextNoLogoRule(strict)}
Composición centrada con aire alrededor, formato ${format === 'story' ? 'vertical' : 'cuadrado/vertical'}.`;

  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await geminiGenerateContent(config.gemini.imageModel, {
        contents: [{ role: 'user', parts: [{ text: buildPrompt(attempt > 0) }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const img = inlineImageFromResponse(data);
      if (!img) continue;
      spent += await logImageUsage('ilustración didáctica');
      const check = await checkImageQuality(img);
      if (!check.ok) {
        console.warn(`[ai] generateDiagram: descartada por control de calidad (texto=${check.hasText} logo=${check.hasLogo} ${check.notes || ''}), reintentando más estricto...`);
        continue;
      }
      img.costUsd = spent;
      return img;
    } catch (err) {
      if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min.`); return null; }
      console.warn(`[ai] generateDiagram falló (intento ${attempt + 1}/2): ${err.message}`);
    }
  }
  console.warn('[ai] generateDiagram: sin resultado limpio tras reintentar, sigo sin ilustración.');
  return null;
}

/**
 * Genera una ESCENA PROFESIONAL con el producto real adentro (foto de producto como
 * referencia). Devuelve { buffer, mimeType } o null (best-effort, con fallback).
 */
/**
 * DIRECTOR DE ARTE (cerebro): antes de generar imágenes, la IA DISEÑA el carrusel —
 * decide qué muestra cada slide, qué característica REAL enfatizar, qué foto real usar,
 * cuánto fondo, y si va badge. Así cada pieza sale distinta y pensada para SU producto,
 * en vez de repetir un prompt genérico. Best-effort: si falla, generate-daily cae a la
 * lógica simple (misma escena por slide).
 */
async function planCarouselShots({ productName, productDescription, brief, pillar = 'producto', occasion, slideCount = 4, photoCount = 1, objective = 'venta', photoDescriptions = [], format = 'feed', brandName = null } = {}) {
  const cleanDesc = productDescription
    ? String(productDescription).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700)
    : '';
  const isFeed = format !== 'story';
  // Qué muestra CADA foto real (de la visión): el cerebro deja de elegir a ciegas.
  const photosBlock = (photoDescriptions && photoDescriptions.length)
    ? `\nQUÉ MUESTRA CADA FOTO REAL (elegí para cada slide la foto cuyo contenido coincide con el overlay; NO pongas un overlay de un detalle si ninguna foto lo muestra):\n${photoDescriptions.map((p) => `- foto ${p.index}: ${p.shows}${p.color ? ` (color: ${p.color})` : ''}${p.isDetail ? ' [DETALLE]' : ''}`).join('\n')}`
    : `\n(No hay descripción de las fotos: elegí photo_index variados y overlays genéricos-pero-verdaderos, sin afirmar detalles que no podés confirmar.)`;
  // Estrategia fotográfica según el pilar: qué tipo de piezas convienen para cada objetivo.
  const PILLAR_STRATEGY = {
    producto: 'Catálogo premium: dominan las tomas de ESTUDIO (background "limpio") y los DETALLES/ZOOM de las características reales. El producto es la estrella absoluta.',
    promo: 'Vendedor y directo: hero potente + 1-2 detalles que justifican el precio. Fondo limpio de estudio. La última toma prepara el cierre con precio.',
    marca: 'Aspiracional: mezclá 1 hero de estudio con 1-2 tomas en CONTEXTO real de trabajo (más lifestyle), transmitiendo identidad, no venta directa.',
    ugc: 'Cercano y real: predominan tomas en contexto/uso, como fotos genuinas, menos "de estudio perfecto".',
    engagement: 'Simple y claro: 1-2 tomas limpias que inviten a opinar/comparar.',
    mayorista: 'Serio y corporativo: tomas de estudio prolijas que muestren durabilidad y terminación para empresas.',
  };
  const strategy = PILLAR_STRATEGY[pillar] || PILLAR_STRATEGY.producto;
  const system = 'Sos DIRECTOR DE ARTE de una agencia premium de indumentaria de trabajo (BLACKS). Diseñás carruseles de Instagram que se ven como catálogo profesional real (tipo lookbook Nike/Zara), NO como plantilla repetida. Pensás cada toma como un fotógrafo de producto. Respondés SOLO con JSON válido.';
  const prompt = `Diseñá el SHOT LIST (lista de tomas) para un carrusel de ${slideCount} slides sobre este producto.

PRODUCTO: ${productName || 'producto de trabajo BLACKS'}${brandName ? `\nMARCA DEL PRODUCTO: ${brandName} (mencionala en el overlay de la HERO — el nombre lo incluye).` : ''}${cleanDesc ? `\nDESCRIPCIÓN REAL (características verdaderas — elegí qué detalles/zooms mostrar SÓLO en base a esto, NO inventes features): "${cleanDesc}"` : ''}
PILAR: ${pillar} · OBJETIVO: ${objective} · FORMATO: ${isFeed ? 'feed (evergreen: SIN precio, cierre con CTA)' : 'story (efímero: el precio puede ir)'}
ESTRATEGIA PARA ESTE PILAR: ${strategy}${brief ? `\nBRIEF (define el ángulo, respetalo — si menciona un detalle puntual como "sol bordado" o "bandera", dedicale una toma de zoom): "${brief}"` : ''}${occasion ? `\nOCASIÓN/FECHA: ${occasion}` : ''}
FOTOS REALES DISPONIBLES: ${photoCount} (índices 0 a ${photoCount - 1}).${photosBlock}

REGLAS (cada slide con un PROPÓSITO distinto — que NO sean todas iguales):
- Progresión: slide 1 = HERO de estudio que engancha (overlay CON la marca si la hay); slides del medio = ZOOM/DETALLE de características REALES; si hay variantes de color, un slide 'variantes'; ÚLTIMA = cierre 'cta'.
- Seguí la estrategia del pilar para decidir cuánto estudio vs contexto.
- CONSISTENCIA DE COLOR (importante): elegí UN color principal del producto (el del brief, o el que tenga más fotos) y usá SIEMPRE fotos de ESE color para la hero y los detalles. NO mezcles: prohibido hero de un color y el detalle del sol de otro color.
- FOTOS ÚNICAS: cada foto (photo_index) se usa UNA SOLA vez en TODO el carrusel. Nunca repitas una foto entre slides (ni en el cierre).
- shot_type 'variantes' (opcional, sólo si en las fotos hay 2+ COLORES distintos): un collage/bento que muestra los OTROS colores. Poné en "extra_photos" los photo_index de las otras variantes de color (2 a 4). overlay tipo "También en otros colores".
- shot_type 'cta' (SIEMPRE el último en feed): cierre con llamado a la acción sobre una foto linda del producto NO usada antes. overlay tipo "Conseguilas en la web" / "Sumalas a tu look". SIN precio.
- REGLA DE ORO overlay↔foto: el overlay TIENE que describir lo MÁS DISTINTIVO que MUESTRA la foto elegida. Si ninguna foto muestra ese detalle, NO hagas ese slide.
- overlay ACERTADO, no genérico ni inventado: si la foto muestra la etiqueta con la bandera argentina, el overlay va tipo "Etiqueta argentina" / "Hecho en Argentina" — NUNCA inventes el material ("de lona") si no está en la descripción real. Elegí el rasgo que hace ÚNICO a ese detalle (la bandera, el sol, la costura reforzada, la suela de yute), no una obviedad.
- badge: casi siempre null. "NUEVO" (sólo en la hero) si el brief habla de lanzamiento; "OFERTA" si hay oferta real. Si no, null en TODOS.
- overlay: MÁXIMO ~5 palabras, en voseo. Nunca repitas overlay.

Devolvé SOLO este JSON:
{"shots":[{"shot_type":"hero","focus":"qué muestra/enfatiza, concreto","photo_index":0,"extra_photos":[],"background":"limpio","overlay":"texto que describe ESA foto (con marca en la hero)","badge":null}]}`;

  const schema = {
    type: 'object',
    properties: {
      shots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            shot_type: { type: 'string', enum: ['hero', 'detalle', 'contexto', 'flatlay', 'variantes', 'cta'] },
            focus: { type: 'string' },
            photo_index: { type: 'integer' },
            extra_photos: { type: 'array', items: { type: 'integer' } },
            background: { type: 'string', enum: ['limpio', 'sutil', 'contexto'] },
            overlay: { type: 'string', nullable: true },
            badge: { type: 'string', nullable: true },
          },
          required: ['shot_type', 'focus', 'photo_index', 'background'],
        },
      },
    },
    required: ['shots'],
  };

  const result = await generateJson({ system, prompt, schema, maxTokens: 1800, temperature: 0.7 });
  const shots = Array.isArray(result && result.shots) ? result.shots : [];
  if (!shots.length) throw new Error('El director de arte no devolvió tomas.');
  const clampIdx = (n, def = 0) => Math.max(0, Math.min(photoCount - 1, Number.isInteger(n) ? n : def));
  // Normalización + garantía de FOTOS ÚNICAS: si el cerebro repite una foto, se le
  // asigna la próxima libre (el usuario pidió que NUNCA se repita una foto de Tiendanube).
  const used = new Set();
  const nextFree = () => { for (let i = 0; i < photoCount; i += 1) if (!used.has(i)) return i; return 0; };
  const norm = shots.slice(0, slideCount).map((s) => {
    let pi = clampIdx(s.photo_index);
    if (used.has(pi)) pi = nextFree();
    used.add(pi);
    const extras = Array.isArray(s.extra_photos)
      ? [...new Set(s.extra_photos.map((n) => clampIdx(n)).filter((n) => !used.has(n)))].slice(0, 4)
      : [];
    extras.forEach((n) => used.add(n));
    return {
      shotType: ['hero', 'detalle', 'contexto', 'flatlay', 'variantes', 'cta'].includes(s.shot_type) ? s.shot_type : 'hero',
      focus: s.focus ? String(s.focus).slice(0, 160) : '',
      photoIndex: pi,
      extraPhotos: extras,
      background: ['limpio', 'sutil', 'contexto'].includes(s.background) ? s.background : 'limpio',
      overlay: s.overlay && String(s.overlay).trim() && String(s.overlay).toLowerCase() !== 'null' ? String(s.overlay).trim().slice(0, 60) : null,
      badge: ['NUEVO', 'OFERTA'].includes(String(s.badge || '').toUpperCase()) ? String(s.badge).toUpperCase() : null,
    };
  });
  return norm;
}

/**
 * Dirección de fotografía de UNA toma. Si viene shotSpec (del director de arte con IA),
 * arma la toma a medida (detalle/hero/flatlay/contexto + cuánto fondo); si no, usa la
 * escena ambientada genérica de siempre.
 */
function shotDirection(shotSpec, scene) {
  if (!shotSpec) {
    return `- El producto es EL héroe y punto focal absoluto de la composición: nítido, con micro-texturas de tela/cuero ultradetalladas, ocupando la posición de máximo impacto visual en la regla de los tercios.
- Lente Hasselblad 85mm f/1.8 prime lens, macro commercial product photography, enfoque selectivo milimétrico en los detalles y terminaciones del producto.
${scene.describe()}
- Utilería mínima y realista del escenario elegido, SIN competir con el producto.`;
  }
  const bg = shotSpec.background || 'limpio';
  const bgLine = bg === 'contexto'
    ? scene.describe()
    : bg === 'sutil'
      ? `- Fondo MUY simple: una superficie de trabajo neutra (hormigón pulido, chapa mate o madera oscura) apenas sugerida y totalmente desenfocada. Casi sin escenario — el foco absoluto es el producto.`
      : `- Fondo de ESTUDIO FOTOGRÁFICO PROFESIONAL (no blanco plano ni recorte): ciclorama / seamless sweep sin esquinas (infinity cove) en gris medio a gris carbón, con degradado direccional suave y una viñeta sutil que enmarca el producto. El producto apoyado con SOMBRA DE CONTACTO realista (o sutil reflejo en superficie pulida). Iluminación de estudio de tres puntos con reflejo especular controlado, calidad de lookbook premium (Nike/Zara). El producto llena buena parte del cuadro — NADA de un objeto chiquito perdido en un mar de blanco.`;
  const focus = shotSpec.focus || 'la calidad y terminación del producto';
  const typeLine = {
    detalle: `- TOMA DE DETALLE / MACRO EXTREMO: recortá MUY CERCA a ${focus}. SÓLO esa parte del producto llena el cuadro (ocupa >70% del encuadre). NO muestres el producto entero, NO recompongas la escena, NO agregues banderas, props ni objetos de fondo — es un zoom fotográfico macro de e-commerce sobre ese detalle puntual, con fondo de estudio liso y desenfocado. Se ven las costuras, la textura del material y las terminaciones a máximo detalle. Enfoque milimétrico, profundidad de campo mínima.`,
    hero: `- TOMA HERO: el producto entero, centrado y protagonista absoluto, nítido de punta a punta, en la posición de máximo impacto. Enfatizá ${focus}.`,
    flatlay: `- TOMA CENITAL (flat-lay): el producto visto desde arriba sobre una superficie limpia, prolijo y ordenado, con aire alrededor. Enfatizá ${focus}.`,
    contexto: `- TOMA EN CONTEXTO: el producto en uso/ambiente creíble, pero SIEMPRE como protagonista nítido. Enfatizá ${focus}.`,
  }[shotSpec.shotType] || `- El producto es el héroe absoluto. Enfatizá ${focus}.`;
  return `${typeLine}
- Lente Hasselblad 85mm f/1.8 prime lens, macro commercial product photography, enfoque selectivo milimétrico.
${bgLine}`;
}

async function generateProductScene({ productImageUrl, productImageUrls = [], productName, theme, brief, occasion, format = 'feed', seed = null, shotSpec = null } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown() || (!productImageUrl && !productImageUrls.length)) return null;

  // Hasta 4 fotos del MISMO producto (distintos ángulos): más referencias = menos
  // chance de que el modelo "reinvente" costuras, color o silueta.
  const urls = [...new Set([productImageUrl, ...productImageUrls].filter(Boolean))].slice(0, 4);
  const refs = [];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      let buf = Buffer.from(await r.arrayBuffer());
      buf = await resizeImage(buf, 1024).catch(() => buf);
      refs.push({ data: buf.toString('base64'), mimeType: 'image/jpeg' });
    } catch (_) { /* seguimos con las que se pudieron bajar */ }
  }
  if (!refs.length) return null;

  const ratio = format === 'story' ? 'vertical 9:16 (1080x1920)' : 'vertical 4:5 (1080x1350)';
  const brandStyle = await brandStyleForImages();
  const scene = sceneVariation(seed);
  // Tomas de DETALLE/macro: nada de escenografía (bandera, ambiente, composición de
  // marca) — sólo el detalle sobre estudio liso. Evita que el zoom "sol bordado" salga
  // con una bandera de fondo o el producto entero.
  const allowScenery = !shotSpec || ['hero', 'contexto'].includes(shotSpec.shotType);
  const buildPrompt = (strict) => `Actuás como DIRECTOR DE ARTE SENIOR de una campaña publicitaria high-end. Tomá EXACTAMENTE el producto adjunto de la${refs.length > 1 ? 's' : ''} imagen${refs.length > 1 ? 'es' : ''} de referencia${refs.length > 1 ? ` (son ${refs.length} fotos DEL MISMO producto desde distintos ángulos: usalas todas para reproducirlo fiel)` : ''} (fidelidad absoluta de marca: mismo modelo, geometría, color, costuras, etiquetas — queda terminantemente prohibido rediseñarlo, inventarle detalles que no tiene, o alterar sus proporciones) y componé una ${allowScenery ? 'escena comercial de catálogo' : 'toma de producto de catálogo'} ${ratio} para BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

CONTEXTO DE LA PIEZA: ${theme || productName || 'indumentaria laboral y seguridad industrial'}.${briefBlock(brief, { allowScenery })}${allowScenery ? occasionGuidance(occasion) : ''}

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
${shotDirection(shotSpec, scene)}
- Color grading premium: ciencia de color Kodak Portra 400, con acentos naranja quemado (#C1440C) sutiles.
${brandStyle && allowScenery ? `- IDENTIDAD DE LA MARCA (respetala): ${brandStyle}` : ''}

REALISMO Y PRESERVACIÓN ESTRUCTURAL (PRODUCT-IN-CONTEXT):
- PROHIBIDO generar alucinaciones visuales, deformaciones de la puntera/suela, o cambios en las letras y etiquetas del packaging/producto original.
- Imperfecciones creíbles en el entorno (no en el producto): profundidad de campo suave con fondo desenfocado (bokeh) para resaltar la figura del producto.

FIDELIDAD ABSOLUTA — PROHIBIDO MODIFICAR EL PRODUCTO (lo más importante):
- El producto de la salida tiene que ser PÍXEL A PÍXEL el de la referencia: mismo bordado, mismos apliques, misma etiqueta, mismas costuras, misma suela, mismo color. PROHIBIDO agregar, mover, agrandar o inventar CUALQUIER elemento que no esté EXACTAMENTE donde está en la foto de referencia (ej: NO agregues un sol/escudo/logo bordado si la referencia no lo tiene, NI lo muevas de lugar). Si dudás de un detalle, dejalo TAL CUAL la referencia. Cambiás sólo el fondo/escena y la luz, NUNCA el producto.

UN SOLO PRODUCTO EN CUADRO (crítico):
- Mostrá EXACTAMENTE UN producto: el de la referencia. PROHIBIDO agregar un SEGUNDO par de calzado, otra prenda o cualquier producto extra — ni de fondo, ni en primer plano, ni desenfocado, ni "de acompañamiento". Si la referencia es un par de calzado, se ve ESE par y nada más.

ARQUITECTURA DE ZONAS SEGURAS (NEGATIVE SPACE):
- Aire limpio y desenfocado en los tercios superior e inferior para garantizar contraste absoluto al superponer titulares y precios.
${noTextNoLogoRule(strict)}
- PROHIBIDO además: manos/pies deformes, duplicar el producto, cambiarle color o forma, o aspecto de render 3D artificial.`;

  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await geminiGenerateContent(config.gemini.imageModel, {
        contents: [{ role: 'user', parts: [{ text: buildPrompt(attempt > 0) }, ...refs.map((r) => ({ inlineData: r }))] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const img = inlineImageFromResponse(data);
      if (!img) continue;
      spent += await logImageUsage('escena de producto');
      const check = await checkImageQuality(img);
      if (!check.ok) {
        console.warn(`[ai] generateProductScene: descartada por control de calidad (texto=${check.hasText} logo=${check.hasLogo} ${check.notes || ''}), reintentando más estricto...`);
        continue;
      }
      img.costUsd = spent;
      return img;
    } catch (err) {
      if (err.status === 429) { markImageQuotaHit(); console.warn(`[ai] Cuota de imágenes agotada (429): pauso ${IMAGE_QUOTA_COOLDOWN_MS / 60000} min y sigo con la foto del producto mientras tanto.`); return null; }
      console.warn(`[ai] generateProductScene falló (intento ${attempt + 1}/2): ${err.message}`);
    }
  }
  console.warn('[ai] generateProductScene: sin resultado limpio tras reintentar, uso la foto del producto.');
  return null;
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
  const scene = sceneVariation(); // estudio: escena distinta en cada generación
  const names = products.map((p, i) => `${i + 1}. ${p.name}`).join('\n');

  const buildPrompt = (strict) => `Actuás como DIRECTOR DE ARTE SENIOR y FOTÓGRAFO COMERCIAL DE ALTA GAMA. Componé UNA fotografía publicitaria ${ratio} para BLACKS, marca argentina de indumentaria de trabajo y calzado de seguridad.

PRODUCTOS DE REFERENCIA (${refs.length} foto${refs.length > 1 ? 's' : ''} adjunta${refs.length > 1 ? 's' : ''} — FIDELIDAD ABSOLUTA a cada uno: conserva geometría, color exacto, costuras, ojales, suelas, logotipos y terminaciones; prohibido rediseñarlos, inventarles detalles que no tienen, o alterar sus proporciones):
${names}

${isCombo
    ? `CONFIGURACIÓN DE COMBO/CONJUNTO COMERCIAL: Los ${products.length} productos deben presentarse integrados y coordinados como un equipo de trabajo de alta gama. Puedes elegir una de estas dos puestas en escena: (A) Modelo/Trabajador en acción creíble vistiendo el conjunto completo (prendas puestas con caída real de tejido grafa/trucker pesado y botines calzados, rostro de espaldas o en sombra parcial para no distraer del producto); o (B) Bodegón arquitectónico / Flat-lay sobre superficie industrial (mesa de trabajo de acero cepillado, hormigón pulido o madera tratada) donde cada prenda y calzado tiene su propio espacio focal, iluminación dramática y textura nítida. Ningún producto debe quedar tapado por otro.`
    : `El producto es EL héroe y punto focal absoluto: nítido, con micro-texturas de tela/cuero ultradetalladas, ocupando la posición de máximo impacto visual.`}
${theme ? `\nCONTEXTO/IDEA DE LA ESCENA: ${theme}.` : ''}

DIRECCIÓN DE FOTOGRAFÍA Y ÓPTICA COMERCIAL:
${scene.describe()}
- Utilería mínima y realista del escenario elegido, SIN robar protagonismo a los productos.
- Lente Hasselblad 85mm prime lens f/1.8, enfoque selectivo milimétrico en las texturas del tejido y cuero, profundidad de campo con bokeh arquitectónico en el fondo.
- Color grading premium: Kodak Portra 400, base sobria con acentos naranja quemado (#C1440C) sutiles.
- REALISMO ANTI-IA: Imperfecciones creíbles en el entorno (desgaste en piso o herramientas), una sola fuente de luz coherente. Manos anatómicamente perfectas si aparecen.

${noTextNoLogoRule(strict)}
Aire limpio y desenfocado arriba y abajo para futura superposición tipográfica.`;

  let spent = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt = buildPrompt(attempt > 0);
      const parts = [{ text: prompt }, ...refs.map((r) => ({ inlineData: r }))];
      const data = await geminiGenerateContent(config.gemini.imageModel, {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const img = inlineImageFromResponse(data);
      if (!img) continue;
      spent += await logImageUsage('estudio');
      const check = await checkImageQuality(img);
      if (!check.ok) {
        console.warn(`[ai] generateStudioScene: descartada por control de calidad (texto=${check.hasText} logo=${check.hasLogo} ${check.notes || ''}), reintentando más estricto...`);
        continue;
      }
      img.costUsd = spent;
      img.prompt = prompt;
      return img;
    } catch (err) {
      if (err.status === 429) { markImageQuotaHit(); console.warn('[ai] Cuota de imágenes agotada (429) en el estudio.'); return null; }
      console.warn(`[ai] generateStudioScene falló (intento ${attempt + 1}/2): ${err.message}`);
    }
  }
  console.warn('[ai] generateStudioScene: sin resultado limpio tras reintentar.');
  return null;
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
    const desc = p.description ? ` — ${String(p.description).replace(/\s+/g, ' ').slice(0, 260)}` : '';
    return `${products.length > 1 ? `${i + 1}. ` : ''}${p.name}${desc}`;
  }).join('\n');
}

function videoFidelityRules(isCombo) {
  return `FIDELIDAD DEL PRODUCTO (la regla más importante — un video con costuras, cierres, bolsillos, texturas o detalles que NO están en la foto de referencia se descarta entero, aunque el resto salga bien):
- Usá SOLO lo que se ve en la(s) foto(s) de referencia adjunta(s). PROHIBIDO inventar costuras, pespuntes, bolsillos, cierres, botones, hebillas, cordones, relieves, estampados o texturas que no sean visibles ahí. Si una parte del producto no se ve clara en la referencia (ej. la espalda), dejala AMBIGUA o fuera de foco — nunca le inventes geometría nueva.
- ${isCombo ? 'Cada producto' : 'El producto'} mantiene el MISMO color exacto, el mismo corte y la misma silueta en TODOS los frames. Cero "mejoras" creativas, cero morphing entre frames, cero mutaciones de logo/etiqueta.
- Es UNA SOLA TOMA CONTINUA (single continuous take): nada de cortes de plano, ángulos distintos empalmados ni jump cuts. Cualquier cambio de encuadre pasa DENTRO del mismo plano, por movimiento de cámara — nunca por corte de edición.
- Si tenés que elegir entre un movimiento vistoso y mantener el producto idéntico + una sola toma, ELEGÍ SIEMPRE lo segundo.`;
}

function videoRealismRules() {
  return `REALISMO ANTI-IA (que NO parezca video generado): imperfecciones reales (desgaste, polvo, arrugas de tela con física creíble, piso sucio de obra), una sola fuente de luz coherente con sombras hacia el mismo lado, leve grano fílmico, saturación contenida tipo documental. PROHIBIDO: superficies plásticas perfectas, movimientos flotantes irreales, cámara imposiblemente estable, colores vibrantes de render, transiciones mágicas. Si hay personas: de espaldas o fuera de foco, manos con anatomía perfecta.`;
}

/* =========================================================================
 * CINEMATOGRAFÍA PROFESIONAL (lenguaje de rodaje real)
 * sceneVariation ya elige escenario/luz/encuadre; esto agrega el VOCABULARIO
 * TÉCNICO de un director de fotografía real (óptica + técnica de cámara) para
 * que el video se sienta filmado, no "generado" — foco selectivo, rack focus,
 * dolly, gimbal: siempre en UNA sola toma fluida, sin cortes ni saltos.
 * ========================================================================= */
const CINE_POOL = {
  optica: [
    'lente prime 50mm f/2, bokeh cremoso y compresión natural sin distorsión',
    'lente macro 100mm f/2.8 para el detalle del producto, profundidad de campo mínima y muy selectiva',
    'lente anamórfico 40mm, leve aberración de lente y flares horizontales característicos de cine',
    'zoom cinematográfico 24-70mm operado a mano con micro-temblor orgánico (handheld sutil y controlado, NO tembloroso)',
  ],
  tecnica: [
    'RACK FOCUS: arranca con foco en un elemento del entorno en primer plano (el producto queda desenfocado detrás) y el enfoque se corre suavemente hacia el producto, que termina nítido a mitad de toma — una sola pasada de foco, técnica de focus puller profesional, sin saltos',
    'PUSH-IN CONTINUO: dolly frontal lento y constante acercándose al producto, velocidad pareja de principio a fin, sin aceleraciones ni tirones',
    'TRACKING LATERAL: la cámara se desplaza en paralelo al sujeto sobre rieles, manteniendo el producto siempre a la misma distancia focal, un solo recorrido fluido',
    'PLANO FIJO CON RESPIRO: cámara en trípode, perfectamente estable; sólo el aire, el polvo o la tela se mueven en el encuadre — la quietud absoluta es la puesta en escena',
    'TILT-REVEAL: arranca en un detalle del entorno (una herramienta, el piso, una textura) y sube o gira lentamente en UN solo movimiento hasta revelar el producto en plano completo',
  ],
};

/** Combinación de óptica + técnica de cámara determinística por seed (o al azar sin seed). */
function cinematographyPlan(seed = null) {
  const n = seed !== null && Number.isFinite(Number(seed)) ? Math.abs(Math.trunc(Number(seed))) : Math.floor(Math.random() * 99991);
  return {
    optica: CINE_POOL.optica[(n * 13 + 2) % CINE_POOL.optica.length],
    tecnica: CINE_POOL.tecnica[(n * 13 + 9) % CINE_POOL.tecnica.length],
  };
}

/* =========================================================================
 * POSTURA DEL PRODUCTO EN VIDEO (reemplaza la "acción física")
 * Feedback real del usuario (2026-07-11): las acciones dinámicas (caminar,
 * agacharse, atarse cordones) generan artefactos y movimiento entrecortado en
 * Gemini Omni/Veo — animar un cuerpo completo en movimiento complejo es lo que
 * más rompe. El default ahora es QUIETUD: alguien con la prenda puesta, de pie,
 * con sólo micro-movimiento ambiental — como si lo estuvieran FILMANDO (no como
 * si estuviera actuando). El movimiento lo aporta la CÁMARA (cinematographyPlan),
 * no el cuerpo.
 * ========================================================================= */
const PRODUCT_POSTURE_RULES = [
  { re: /bot[ií]n|zapato|calzado|borcegu[ií]/i, posture: 'de pie, con el calzado bien apoyado y el peso del cuerpo firme sobre el piso' },
  { re: /campera|buzo|canguro|chaleco|softshell|rompeviento|t[eé]rmic/i, posture: 'de pie, con la prenda puesta y el cierre/cuello bien visible' },
  { re: /pantal[oó]n|cargo|jean/i, posture: 'de pie, con el pantalón calzando naturalmente en la cintura y el largo real de la pierna' },
  { re: /remera|chomba|camisa/i, posture: 'de pie, con la prenda puesta y la caída natural de la tela sobre los hombros' },
  { re: /mameluco|overol/i, posture: 'de pie, con el mameluco puesto y los tirantes/cierre bien visibles' },
  { re: /casco|anteojo|guante|faja|pasamont|arn[eé]s/i, posture: 'de pie, con el equipo ya puesto y ajustado' },
];
const DEFAULT_PRODUCT_POSTURE = 'de pie, con la prenda/calzado puesto de forma natural';

function productPostureFor(name) {
  const rule = PRODUCT_POSTURE_RULES.find((r) => r.re.test(name || ''));
  return rule ? rule.posture : DEFAULT_PRODUCT_POSTURE;
}

/** Describe QUIETUD + micro-movimiento ambiental — NO una acción física dinámica. */
function productActionFor(name) {
  return `${productPostureFor(name)}, prácticamente QUIETO/A. El único movimiento es sutil y ambiental: la tela que se acomoda o se mueve levemente con el viento, una respiración natural, el peso del cuerpo que se asienta. PROHIBIDO actuar una acción física dinámica (caminar, agacharse, atarse cordones, gestos grandes o repetidos) — ese tipo de movimiento articulado es lo que más rompe la coherencia del video y genera cortes/artefactos. Ante la duda entre quietud y una acción vistosa, elegí SIEMPRE la quietud.`;
}

/**
 * Para combos: UNA persona con TODO el conjunto puesto, quieta — el recorrido
 * por cada prenda lo hace la CÁMARA (ver cinematographyPlan), no una secuencia
 * de acciones del cuerpo.
 */
function comboActionSequence(products) {
  const names = products.slice(0, 3).map((p) => p.name).join(', ');
  return `Una persona con TODO el conjunto puesto (${names}), de pie, prácticamente quieta — el único movimiento es ambiental (tela, viento leve, respiración natural). La cámara es la que recorre el conjunto con su movimiento (ver técnica de cámara); nada de secuencia de gestos ni transiciones de acción entre prendas.`;
}

/** Regla dura: si la referencia muestra a una persona con la cara visible, en el video esa cara NO se reconstruye ni se muestra (es lo que más falla/genera artefactos en estos modelos). */
const FACE_RULE = `[ROSTRO]: si en la foto de referencia aparece una persona con la cara visible, en el video la cara NO debe mostrarse ni reconstruirse. Encuadrá desde el cuello hacia abajo, de espaldas, con la cabeza fuera de cuadro, girada hacia un costado, en penumbra o desenfocada — nunca de frente y nítida. Generar caras es lo que más se rompe y genera artefactos; evitalo directamente encuadrando sin mostrarla.`;

/** Tono/energía del video según el PILAR de la pieza (antes era igual para cualquier pilar). */
function pillarVideoTone(pillar) {
  const tones = {
    producto: 'Tono de catálogo premium: foco total en el detalle y la calidad del producto, ritmo tranquilo y confiado.',
    promo: 'Tono comercial con energía contenida: urgencia sutil (aprovechar la oferta ahora) sin gestos exagerados ni cortes rápidos.',
    marca: 'Tono de marca: atmosférico, más sensación que venta — como un momento real de trabajo, no un aviso publicitario.',
    mayorista: 'Tono corporativo y de equipo: sensación de un grupo de trabajo real y coordinado, seriedad profesional, sin golpes de efecto.',
    educativo: 'Tono claro y calmo, casi documental: como mostrando el producto para que se entienda bien, sin apuro.',
    ugc: 'Tono cercano y espontáneo: como contenido genuino grabado en el lugar de trabajo, no un comercial armado.',
    engagement: 'Tono cercano y conversacional, simple y directo.',
  };
  return tones[pillar] || tones.producto;
}

/**
 * ESTUDIO: súper-prompt de VIDEO para pegar en Gemini/Veo, con uno o varios
 * productos (combo). No llama a ninguna API: el video lo genera el usuario a mano
 * y después lo sube a la biblioteca del estudio.
 */
function buildStudioVideoPrompt({ products = [], theme, format = 'story', duration = 8, pillar = 'producto' } = {}) {
  const isCombo = products.length > 1;
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const allImages = products.flatMap((p) => (Array.isArray(p.images) && p.images.length ? p.images : [p.imageUrl]).filter(Boolean));

  const scene = sceneVariation();
  const cine = cinematographyPlan();
  const action = isCombo ? comboActionSequence(products) : productActionFor(products[0] && products[0].name);

  const prompt = `Un director de fotografía profesional filma este plano para BLACKS, marca argentina de ropa de trabajo y calzado de seguridad. Formato ${ratio}, ~${duration} segundos, UNA SOLA TOMA CONTINUA — sin cortes de edición, sin distintos ángulos empalmados.

[TONO DE LA PIEZA]: ${pillarVideoTone(pillar)}

[PRODUCTO${isCombo ? 'S' : ''}] (fidelidad absoluta a las fotos de referencia adjuntas):
${productAnchorLines(products)}

${videoFidelityRules(isCombo)}

[ESCENA]: ${theme ? `${theme} — ambientado así: ` : ''}${scene.escenario}. Ambiente laboral argentino real, con desgaste y utilería creíbles.

[PERSONA Y POSTURA] (quietud, no actuación — ver por qué abajo): ${action}

${FACE_RULE}

[ÓPTICA Y TÉCNICA DE CÁMARA] (vocabulario de rodaje profesional, un solo movimiento fluido de principio a fin):
- Óptica: ${cine.optica}.
- Técnica: ${cine.tecnica}.
- Encuadre de esta escena: ${scene.camara}.
- La cámara se opera con estabilizador/gimbal o rieles de dolly: el movimiento es CONTINUO y a velocidad constante, sin aceleraciones ni sacudidas. PROHIBIDO: órbitas de 360°, giros bruscos, paneos rápidos, cortes de edición o distintos planos empalmados.

[RITMO] (~${duration}s dentro de esa misma toma):
- Arranque: el/los producto(s) ya en cuadro, reconocibles desde el primer frame.
- Desarrollo: la quietud/micro-movimiento descripto arriba — el interés lo genera la cámara, no el sujeto.
- Cierre: la cámara termina de asentarse en un plano hero limpio y estable, ideal como último frame/portada.

[LUZ Y ATMÓSFERA]: ${scene.luz}. Contraluz (rim lighting) para separar el contorno del producto del fondo. Color grading Kodak Portra 400, tonos sobrios con acentos naranja quemado.

[AUDIO] (si el modelo genera sonido, ej. Veo 3): sonido ambiente diegético del lugar — eco de galpón, herramientas lejanas, viento suave. SIN música, SIN voces, SIN efectos de "whoosh" publicitarios.

[REALISMO]: física de tela con caída real, sombras con caída real. SIN TEXTO en pantalla, sin placas, sin números ni marcas de agua.`;

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
function buildVideoPrompt({ productName, productDescription, productImages = [], productImageUrl, theme, format = 'story', caption, pillar = 'producto' } = {}) {
  const imgs = (productImages && productImages.length ? productImages : [productImageUrl]).filter(Boolean);
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const anchor = productAnchorLines([{ name: productName || 'producto de trabajo', description: productDescription }]);
  const scene = sceneVariation();
  const cine = cinematographyPlan();
  const action = productActionFor(productName);
  const prompt = `Un director de fotografía profesional filma este plano para BLACKS, marca argentina de ropa de trabajo y calzado de seguridad. Formato ${ratio}, ~8 segundos, UNA SOLA TOMA CONTINUA — sin cortes de edición, sin distintos ángulos empalmados.

[TONO DE LA PIEZA]: ${pillarVideoTone(pillar)}

[PRODUCTO] (usá EXACTAMENTE el de las imágenes de referencia adjuntas):
${anchor}

${videoFidelityRules(false)}

[ESCENA]: ${theme ? `${theme} — ambientado así: ` : ''}${scene.escenario}. Ambiente real argentino con desgaste creíble, no set de estudio artificial.

[PERSONA Y POSTURA] (quietud, no actuación — ver por qué abajo): ${action}

${FACE_RULE}

[ÓPTICA Y TÉCNICA DE CÁMARA] (vocabulario de rodaje profesional, un solo movimiento fluido de principio a fin):
- Óptica: ${cine.optica}.
- Técnica: ${cine.tecnica}.
- Encuadre de esta escena: ${scene.camara}.
- La cámara se opera con estabilizador/gimbal o rieles de dolly: el movimiento es CONTINUO y a velocidad constante, sin aceleraciones ni sacudidas. PROHIBIDO: órbitas de 360°, giros bruscos, paneos rápidos, cortes de edición o distintos planos empalmados.

[RITMO] (~8s dentro de esa misma toma):
- 0-1.5s: el producto ya está en cuadro, nítido y reconocible desde el primer frame (en Reels se decide seguir mirando en el primer segundo).
- 1.5-6s: la quietud/micro-movimiento descripto arriba. Nada teatral ni "de publicidad".
- 6-8s: la cámara se asienta en un plano hero limpio y estable del producto (último frame usable como portada).

[LUZ Y ATMÓSFERA]: ${scene.luz}.
${videoRealismRules()}

[AUDIO] (si el modelo genera sonido, ej. Veo 3): sólo sonido ambiente diegético del lugar — eco, herramientas lejanas, viento suave. SIN música, SIN voces en off, SIN efectos "whoosh" publicitarios.

[ESTÉTICA]: robusta, premium, alto contraste, look de aviso moderno filmado por un director de fotografía real. SIN texto en pantalla (el texto/subtítulos los agrego después).`;
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
  planCarouselShots,
  describeProductPhotos,
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
