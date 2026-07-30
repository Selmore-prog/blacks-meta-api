const config = require('./config');
const { resizeImage } = require('./imageUtils');
const { stripEmoji, fixSpelling } = require('./textUtils');

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
- ORTOGRAFÍA: la tela del interior del buzo se escribe "frisa" / "algodón con frisa" (NUNCA "friza").
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

/** Reemplaza dominios viejos por el sitio actual y corrige la ortografía de marca. */
function sanitizeText(text) {
  if (!text) return text;
  let out = String(text);
  for (const old of config.brand.oldSites || []) {
    out = out.replace(new RegExp(old.replace(/[.]/g, '\\.'), 'gi'), config.brand.site);
  }
  return fixSpelling(out);
}

// Campos que se HORNEAN sobre la imagen: además de sanitizar, se les sacan los emojis
// (el server no tiene fuente de emoji → salían como cuadraditos). El caption y los
// hashtags NO pasan por acá: son texto de Instagram y ahí el emoji sí se ve bien.
function sanitizeBurned(text) {
  return stripEmoji(sanitizeText(text));
}

function sanitizeCopy(copy) {
  return {
    overlay: sanitizeBurned(copy.overlay),
    caption: sanitizeText(copy.caption),
    hashtags: sanitizeText(copy.hashtags),
    cta: sanitizeBurned(copy.cta),
    slides: (copy.slides || []).map((s) => ({ title: sanitizeBurned(s.title), text: sanitizeBurned(s.text) })),
    sticker: copy.sticker
      ? {
          type: copy.sticker.type,
          question: sanitizeBurned(copy.sticker.question),
          options: (copy.sticker.options || []).map(sanitizeBurned),
          correct_index: copy.sticker.correct_index,
        }
      : null,
    story_points: (copy.story_points || []).map(sanitizeBurned),
    template: copy.template || null,
  };
}

function formatGuidance(postType, format) {
  if (format === 'story' && postType !== 'reel') {
    return `FORMATO: Historia de Instagram (vertical 9:16, se ve pocos segundos y EL CAPTION CASI NADIE LO VE).
- REGLA CLAVE: TODO el mensaje tiene que estar EN la imagen — el "overlay" (gancho), los "story_points" (la información concreta) y el "cta" SE IMPRIMEN SOBRE la pieza. Lo que no esté ahí, no existe para el espectador.
- "overlay" = gancho MUY corto (máx ~6 palabras).
- "cta" = acción concreta y CORTA (máx ~6 palabras, se imprime como botón en la pieza; ej: "Escribinos por WhatsApp", "Buscanos: link en bio").
- "caption" = 1 línea corta y al grano (es secundario: casi nadie lo lee).`;
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

function buildCopyPrompt({ pillar, pillarDetail, postType, format, product, visualProduct, brandProfile, interactionHint, wantSticker, carousel, slideCount = 3, wholesale, commercialContext, topCaptions, objective, recentPieces, companyFacts, templateOptions, directorNotes, lessons, imageContext }) {
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

  // Historias: el caption casi no se ve (va abajo, chiquito) — la información tiene que
  // estar EN la imagen. Se piden 2-3 puntos cortos con datos REALES que la plantilla
  // imprime sobre la historia (chips). Nada inventado: salen del contexto de arriba.
  const wantStoryPoints = format === 'story' && postType !== 'reel';
  const storyPointsSpec = wantStoryPoints
    ? `\n\nPUNTOS DE LA HISTORIA (obligatorio): devolvé también "story_points": 2 o 3 puntos CORTÍSIMOS (máx ~4 palabras cada uno) que se imprimen SOBRE la imagen de la historia como texto. Son la información clave que el espectador tiene que llevarse en 3 segundos: beneficios/condiciones/datos REALES tomados SOLO del contexto de esta pieza (producto, condiciones mayoristas, datos verificados). Ej: ["Mínimo 10 unidades", "Personalización con logo", "Envío gratis al país"]. PROHIBIDO inventar datos y PROHIBIDO repetir textual el overlay. SIN emojis ni íconos (se imprimen como texto y los emojis no se ven).`
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

  // La IMAGEN ya está decidida por el director de fotografía (qué foto real y qué
  // toma): el copy y el overlay tienen que hablar de ESO que se ve. Antes copy e
  // imagen se decidían por separado y podían contradecirse (bug real, jul-2026:
  // overlay sobre "puntera de acero" con una foto que mostraba la suela).
  const imageCtx = imageContext
    ? `\nIMAGEN YA DECIDIDA PARA ESTA PIEZA (director de fotografía): ${imageContext}. El "overlay" describe/refuerza exactamente ESO que la foto muestra, y el copy desarrolla ese mismo foco — PROHIBIDO destacar una característica que la imagen no muestra.`
    : '';

  return `${formatGuidance(postType, format)}

Pilar de contenido: ${pillar}${OBJECTIVE_GUIDE[objective] ? `\n${OBJECTIVE_GUIDE[objective]}` : ''}
Ángulo/detalle: ${pillarDetail || 'sin detalle adicional'}${director}${imageCtx}
${productInfo}${wholesaleInfo}${educationalGuard}${facts}
Temporada: ${seasonLine}${commercial}${winners}${noRepeat}${lessons || ''}${interaction}${stickerSpec}${storyPointsSpec}${templates}${voice}

${carousel ? (['educativo', 'mayorista'].includes(pillar)
    ? `\nCARRUSEL PASO A PASO: devolvé "slides": un array de ${slideCount} objetos {"title","text"}. Es una GUÍA accionable, no un folleto: (1) portada con gancho que promete el resultado ("Guía de talles sin equivocarte", "Cómo comprar al por mayor"), (2-${slideCount - 1}) PASOS numerados y concretos — "title" tipo "PASO 1 — MEDÍ TU CINTURA" y "text" con la instrucción exacta (qué hacer, con qué, qué número anotar), (${slideCount}) cierre con el beneficio + CTA${pillar === 'educativo' ? ' (CTA educativo: guardar/compartir/comentar — nunca comprar)' : ''}. Cada paso tiene que poder hacerse EN EL MOMENTO. Nada repetido entre slides.${pillar === 'educativo' ? ' NINGÚN slide nombra productos/prendas propias como solución.' : ''}\n`
    : `\nCARRUSEL: además, devolvé "slides": un array de ${slideCount} objetos {"title","text"} para un carrusel deslizable. Cada slide UN punto distinto, con progresión: (1) gancho, (2-${slideCount - 1}) beneficios/datos concretos, (${slideCount}) cierre + CTA. "title" cortísimo (2-4 palabras, va grande en pantalla), "text" 1 línea corta. Nada repetido entre slides.\n`) : ''}
Escribí el copy siguiendo la voz de marca y las reglas. Devolvé SOLO un JSON válido con esta forma exacta:
{"overlay": "...", "caption": "...", "hashtags": "...", "cta": "..."${carousel ? ', "slides": [{"title":"...","text":"..."}]' : ''}${wantSticker ? ', "sticker": {"type":"encuesta","question":"...","options":["...","..."],"correct_index":null}' : ''}${wantStoryPoints ? ', "story_points": ["...","..."]' : ''}${(Array.isArray(templateOptions) && templateOptions.length) ? ', "template": "nombre_de_la_plantilla_elegida"' : ''}}`;
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
  // Relleno corporativo vacío (bug real, jul-2026: pieza de marca sin material concreto
  // salió "la confianza y la calidad son nuestra prioridad" — no dice NADA). Una pieza
  // que no puede afirmar algo específico no se salva con frases institucionales huecas.
  { re: /(la |nuestra )?(confianza|calidad|seguridad)( y (la |nuestra )?(calidad|confianza|seguridad))* (es|son) (nuestra|nuestro|la|el) (prioridad|compromiso|norte|esencia|pilar)/i, label: 'relleno corporativo ("la calidad es nuestra prioridad") — decí algo CONCRETO o no lo digas' },
  { re: /tu socio (en|de|para)/i, label: 'usa "tu socio en..." (relleno corporativo)' },
  { re: /comprometid[oa]s? con (la|el|tu)/i, label: 'usa "comprometidos con..." (relleno corporativo)' },
  { re: /nos apasiona|nuestra pasi[oó]n/i, label: 'usa "nos apasiona" (relleno corporativo)' },
  { re: /te acompa[ñn]amos (con|en|desde)/i, label: 'usa "te acompañamos" (relleno corporativo, no dice nada concreto)' },
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
    ...(copy.story_points || []),
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

  // Puntos de historia: van impresos SOBRE la imagen — cortos o no entran.
  const points = Array.isArray(copy.story_points) ? copy.story_points : [];
  const longPoint = points.find((p) => String(p).length > 32);
  if (longPoint) problems.push(`punto de historia muy largo ("${String(longPoint).slice(0, 32)}…"): máx ~4 palabras`);

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
    // Puntos cortos que la plantilla imprime SOBRE la historia (info que el caption no muestra).
    story_points: Array.isArray(obj.story_points)
      ? obj.story_points.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
      : [],
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

/* =========================================================================
 * TOPE DE GASTO DIARIO (control de plata, jul-2026)
 * Cada imagen IA cuesta dinero real. Con AI_IMAGE_DAILY_BUDGET_USD (default US$3)
 * se fija un techo por día calendario argentino: al llegar, las piezas del resto
 * del día salen con plantilla (gratis) en vez de escena IA. La generación NUNCA
 * se corta — sólo el gasto. Cache de 60s para no consultar la DB en cada slide.
 * ========================================================================= */

let budgetCache = { at: 0, spent: 0 };

/** Gasto de HOY (día calendario ARG) en imágenes IA, en USD. Best-effort: 0 si falla. */
async function imageSpendTodayUsd() {
  if (Date.now() - budgetCache.at < 60 * 1000) return budgetCache.spent;
  try {
    const pool = require('./db');
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(est_cost_usd), 0)::float AS spent
       FROM ai_usage
       WHERE kind = 'image' AND (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date`,
      [config.timezone]
    );
    budgetCache = { at: Date.now(), spent: Number(rows[0].spent) || 0 };
  } catch (err) {
    console.warn(`[ai] No pude leer el gasto del día (asumo 0 y sigo): ${err.message}`);
    budgetCache = { at: Date.now(), spent: 0 };
  }
  return budgetCache.spent;
}

/** true si generar UNA imagen más pasaría el tope diario (y conviene usar plantilla). */
async function imageBudgetExceeded() {
  const budget = Number(config.ai.imageDailyBudgetUsd) || 0;
  if (budget <= 0) return false; // sin tope configurado
  const spent = await imageSpendTodayUsd();
  if (spent + currentImagePriceUsd() > budget) {
    console.warn(`[ai] Tope de gasto diario alcanzado (US$${spent.toFixed(2)} de US$${budget}): esta pieza sale con plantilla (gratis).`);
    return true;
  }
  return false;
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
    budgetCache.spent += cost; // el tope diario ve el gasto al instante (sin esperar el cache)
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
// Escenarios URBANOS/EDITORIALES para prendas CASUAL/versátiles (jean, chomba, remera,
// buzo, short, anteojos): SIN obra ni herramientas. Feedback real (2026-07-27): un video
// de un jean ambientado en una obra salía con "golpes de la nada" (Veo interpretaba
// "persona + herramientas en obra" como que tenía que trabajar/martillar) — incoherente
// con el producto. Estos escenarios no tienen props de acción, así que no invitan a nada.
const URBAN_SCENE_POOL = {
  escenario: [
    'estudio fotográfico limpio de fondo neutro (gris medio a hormigón), sin props, foco total en la prenda',
    'loft industrial reciclado y prolijo: ladrillo visto, ventanales grandes, piso de cemento pulido, mínimo mobiliario',
    'vereda de barrio con pared de textura y algo de vegetación urbana, fondo desenfocado editorial',
    'calle de ciudad con arquitectura moderna totalmente desenfocada de fondo (bokeh), tono lookbook',
    'patio interno con pared de cemento y una planta, ambiente sereno de media tarde',
    'garage urbano ordenado con luz natural entrando de costado, SIN herramientas a la vista',
  ],
  luz: [
    'luz natural de media tarde, suave y direccional, con sombras largas cálidas',
    'luz difusa y envolvente de un ventanal grande, tono neutro editorial',
    'atardecer dorado suave entrando de costado, contraste medio y bordes cálidos',
    'día nublado de luz pareja, colores naturales contenidos tipo documental de moda',
  ],
  camara: [
    'cámara a la altura de la cintura, encuadre frontal en tres cuartos, naturalidad editorial',
    'plano medio lateral con capas de profundidad y fondo desenfocado',
    'leve contrapicado que le da presencia a la silueta, encuadre limpio',
    'cámara a la altura del pecho, composición centrada y prolija de lookbook',
  ],
};

function sceneFromPool(pool, seed = null) {
  const n = seed !== null && Number.isFinite(Number(seed))
    ? Math.abs(Math.trunc(Number(seed)))
    : Math.floor(Math.random() * 99991);
  const pick = (arr, salt) => arr[(n * 7 + salt) % arr.length];
  const v = {
    escenario: pick(pool.escenario, 0),
    luz: pick(pool.luz, 3),
    camara: pick(pool.camara, 5),
  };
  v.describe = () => `- ESCENARIO de esta pieza (usalo, no lo cambies por el genérico de siempre): ${v.escenario}.
- LUZ de esta pieza: ${v.luz}.
- CÁMARA/ENCUADRE de esta pieza: ${v.camara}.`;
  return v;
}

function sceneVariation(seed = null) {
  return sceneFromPool(SCENE_POOL, seed);
}

// Sólo la indumentaria claramente LABORAL/de seguridad va en escena de obra/industria
// (le queda y es icónico). Todo lo demás (casual/versátil) va a escenario urbano/editorial:
// una obra con herramientas invita a "actuar trabajo" y rompe la coherencia (jean, chomba…).
const WORKWEAR_NAME_RE = /(bot[ií]n|borcegu[ií]|puntera|acero|seguridad|mameluco|overol|grafa|softshell|rompeviento|t[eé]rmic|ign(í|i)fug|diel[eé]ctric|alta visibilidad|refractari|casco|arn[eé]s|faja lumbar|guante|antiflama|cargo de trabajo)/i;
function isWorkwearName(name) { return WORKWEAR_NAME_RE.test(name || ''); }

/** Escena de VIDEO acorde al producto: laboral→industrial, casual→urbano/editorial. */
function videoSceneFor(name, seed = null) {
  return isWorkwearName(name) ? sceneVariation(seed) : sceneFromPool(URBAN_SCENE_POOL, seed);
}

/**
 * Reglas de realismo y dinámica para las escenas de imagen. Buscan el look editorial
 * "con vida" que pidió el dueño (foto real, no render), respetando la fidelidad del
 * producto y sin reconstruir caras (regla que evita los morphs de modelo inventado).
 */
function photoRealismRules() {
  return `REALISMO FOTOGRÁFICO Y DINÁMICA (que se sienta una FOTO real de campaña, no un render 3D):
- Textura auténtica: si hay piel, con poros y micro-relieve real; la tela con fibras, frisa y caída natural del tejido; grano de película sutil (Kodak Portra). NADA de acabado plástico/CGI ni "piel de cera".
- Luz creíble e imperfecta: una fuente principal coherente, sombras suaves reales, y —si el escenario lo pide— un leve flare, halo o polvo en suspensión. Evitá la luz plana de catálogo muerto.
- ENERGÍA Y MOVIMIENTO: buscá una toma con vida — un pliegue de tela en movimiento, una pose natural a medio gesto, peso real sobre el cuerpo o la superficie. Dinámica y con profundidad, NUNCA un maniquí rígido ni acartonado.
- PRENDA PUESTA vs SUELTA: si la referencia muestra la prenda VESTIDA sobre una persona, mantené ese enfoque editorial (prenda puesta, caída real), encuadrando de los hombros/torso hacia abajo o de 3/4 de espaldas — NUNCA muestres ni reconstruyas la CARA (recortá por encima del mentón o dejala totalmente fuera de cuadro/foco). Si la referencia es la prenda SUELTA (sin persona), NO inventes una persona ni un modelo: quedate en bodegón/estudio.
- Referencia de estilo: lookbook editorial premium (Carhartt / Zara / Nike), dinámico y creíble.`;
}

/**
 * Regla dura anti-texto/anti-logo, compartida por todos los prompts de imagen.
 * Repetida a propósito con distintas palabras: algunos modelos (Imagen sobre todo)
 * ignoran una única mención de "sin texto" en medio de un prompt largo.
 * strict=true se usa en el segundo intento, si el primero vino con texto/logo.
 */
/**
 * Dirección de arte de AFICHE (artStyle 'poster'), para cuando el dueño pide desde el
 * panel "hacela con imagen generativa" en una promo o fecha comercial.
 *
 * IMPORTANTE — por qué no se le pide al modelo "un banner": un banner lleva texto, y
 * pedirle texto a la IA es exactamente lo que rompió piezas antes (titulares en inglés,
 * mal escritos, horneados en la foto e imposibles de corregir). Acá el modelo hace el
 * ARTE —composición de campaña, luz dramática, profundidad— y deja libre a propósito la
 * zona donde después el sistema de diseño estampa el titular, el precio y el botón con
 * la tipografía real de la marca. Se obtiene el look de banner sin el riesgo del texto.
 */
function posterArtDirection(format) {
  const zone = format === 'story'
    ? 'la MITAD INFERIOR del cuadro (de la mitad para abajo)'
    : 'el TERCIO INFERIOR y el TERCIO SUPERIOR del cuadro';
  return `
DIRECCIÓN DE AFICHE / KEY VISUAL DE CAMPAÑA (esta pieza es un afiche publicitario, no una foto de catálogo):
- Composición de AVISO: un sujeto o gesto visual dominante, encuadre decidido, tensión y jerarquía clara. Que se lea de un vistazo a 20 cm en un celular.
- Luz teatral de campaña: contraluz o luz lateral marcada, haces volumétricos, contraste alto, negros profundos con detalle. Nada de iluminación plana de estudio.
- Profundidad real en capas (primer plano fuera de foco, sujeto nítido, fondo con caída) para que la pieza no se vea "pegada".
- Paleta gráfica y editorial: base negro/carbón con el naranja quemado (#C1440C) como acento que aparece en la luz, en un objeto o en un reflejo. Contraste alto, saturación controlada.
- ESPACIO RESERVADO PARA EL TEXTO (crítico): dejá ${zone} deliberadamente despejado —oscuro, desenfocado o vacío— sin detalle importante. Ahí va a ir el titular y el precio, que se estampan DESPUÉS con la tipografía de la marca. Si el sujeto invade esa zona, recomponé: mejor el sujeto más chico y desplazado que un texto ilegible encima.`;
}

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
async function checkImageQuality(img, { productHasBranding = false } = {}) {
  // En escenas de PRODUCTO real, la prenda/calzado trae SU marca puesta (etiqueta
  // "Pampero", "Ombú" bordada, etc.) — eso es fidelidad, no un logo inventado.
  // Sin esta excepción el QA descartaba escenas legítimas YA PAGADAS y la pieza caía
  // a la plantilla sin foto de estudio (bug real, jul-2026: plata tirada + pieza fea).
  const brandingException = productHasBranding
    ? `\n- EXCEPCIÓN IMPORTANTE (escena de producto real): la marca/etiqueta que el producto trae PUESTA (bordado, etiqueta cosida, sello en la suela, marquilla en la cintura) NO cuenta como logo NI como texto — es parte del producto real y DEBE estar. Sólo marcá hasLogo/hasText si hay un logo o texto AGREGADO FUERA del producto: sello flotante, marca de agua, cartel, titular, wordmark en el fondo o en el piso.`
    : '';
  try {
    const data = await geminiGenerateContent(config.gemini.visionModel, {
      contents: [{
        role: 'user',
        parts: [
          { text: `Sos control de calidad de una agencia de publicidad. Mirá esta imagen y respondé SOLO un JSON, sin explicación adicional: {"hasText": bool, "hasLogo": bool, "notes": "breve, en español"}.
- "hasText": true si aparece CUALQUIER letra, palabra, número, título, cartel, código de cupón o tipografía visible en la foto, en cualquier idioma, sin importar cuán chica, borrosa o parcial.
- "hasLogo": true SOLO si aparece un logo, isotipo o wordmark de MARCA COMERCIAL (inventada o real: por ejemplo un logo de ropa, de calzado, o cualquier isotipo tipo "sello de marca"). NO cuenta como logo: banderas nacionales (incluida la bandera Argentina con su sol), escudos patrios, ni símbolos religiosos, deportivos o culturales genéricos — esos SÍ pueden estar si el contexto de la escena los pide.${brandingException}` },
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

/**
 * QA VISUAL POST-RENDER (el "Director de Arte" que da la aprobación final).
 * A diferencia de checkImageQuality (que revisa la imagen IA cruda), esto mira la
 * PIEZA TERMINADA — plantilla renderizada con títulos, precio y logo estampados — y
 * detecta SOLO roturas graves de diseño que hasta ahora nadie veía antes de publicar:
 *   1. texto cortado/truncado o que se sale del canvas,
 *   2. elementos que se PISAN entre sí (logo sobre el título, precio sobre el producto),
 *   3. texto ilegible por falta de contraste con el fondo,
 *   4. zonas rotas (foto que no cargó: bloque gris/blanco vacío, ícono de imagen rota).
 * NO opina de gustos/estética: sólo roturas objetivas. Es una llamada de visión al
 * modelo de texto (gratis). Best-effort: si el chequeo falla, se asume OK para no
 * trabar el pipeline por un problema del verificador y no de la pieza.
 */
async function reviewRenderedPiece({ buffer, mimeType = 'image/jpeg', overlayText = null } = {}) {
  if (!buffer || !hasGemini()) return { ok: true, issues: [] };
  try {
    let small = buffer;
    // 1024 y no menos: con 768 el texto chico (la URL del pie) se veía borroso y el
    // modelo lo marcaba "cortado" sin estarlo (falso positivo real, jul-2026).
    small = await resizeImage(small, 1024).catch(() => small);
    const data = await geminiGenerateContent(config.gemini.visionModel, {
      contents: [{
        role: 'user',
        parts: [
          { text: `Sos el DIRECTOR DE ARTE que da la aprobación FINAL de una pieza de Instagram ya diseñada (plantilla con textos y logo estampados). Revisala y respondé SOLO un JSON: {"ok": bool, "issues": ["problema concreto en español", ...]}.

Marcá ok=false SOLO si estás COMPLETAMENTE SEGURO de una ROTURA OBJETIVA e inequívoca:
1. Texto CORTADO: se ven letras por la MITAD (mutiladas por el borde de la imagen o por otro elemento), o una palabra que claramente sigue pero desaparece. Que un texto esté CERCA del borde o toque los márgenes NO es cortado: cortado = faltan pedazos de letras a la vista. Que un texto venga REPARTIDO EN VARIAS LÍNEAS tampoco es cortado: es el salto de línea normal del diseño — leelo como un solo texto continuo juntando todas sus líneas antes de opinar.${overlayText ? ` El texto esperado es: "${String(overlayText).slice(0, 90)}" — puede aparecer como titular grande, como etiqueta chica arriba del precio, repartido en 2 o 3 líneas, o incluso NO aparecer (hay diseños donde la foto y el precio son todo el mensaje): ninguna de esas cosas es un defecto. Sólo marcalo si en la pieza se ve un pedazo de ese texto con letras MUTILADAS.` : ''}
2. Elementos SUPERPUESTOS que se pisan al punto de no poder leerse (un texto arriba de otro texto, el logo tapando el titular).
3. Texto ILEGIBLE por contraste casi nulo con el fondo (mismo tono; no alcanza con "podría tener más contraste").
4. Zona ROTA: bloque gris/blanco plano donde claramente debía ir una foto, ícono de imagen rota del navegador.
5. BLOQUES PEGADOS: dos bloques distintos (la tarjeta de la foto, los datos, el precio, el botón, la URL del pie) que se TOCAN o quedan a un par de píxeles, sin nada de aire entre ellos, de modo que se leen como un solo amasijo. No cuenta que estén "cerca" con una separación clara y prolija: sólo si literalmente se tocan o se solapan.
6. PRODUCTO MAL ENCUADRADO dentro de una tarjeta: la foto muestra a una persona cortada de golpe por el borde de la tarjeta (por ejemplo el torso cortado al ras, sin cabeza, con el corte al aire en el medio de la tarjeta blanca) y se lee como un recorte mal hecho, no como un encuadre buscado. Si la foto va a sangre (ocupa toda la pieza), un recorte así es normal en fotografía editorial y NO es un problema.

ELEMENTOS NORMALES DEL DISEÑO (NUNCA son problema): el pie centrado con la URL "${config.brand.site}" — si se lee entera, está perfecta; el wordmark/logo BLACKS arriba; mucho aire/espacio negativo (es intencional); texto chico pero completo; fotos de catálogo con fondo blanco; marcas de agua gigantes muy tenues de fondo; degradados oscuros sobre la foto.

REGLA DE ORO: ante la MÍNIMA duda, ok=true. Un falso rechazo frena una pieza sana y cuesta trabajo humano; sólo rechazá lo que un cliente señalaría como "esto salió mal" al primer vistazo.` },
          { inlineData: { data: small.toString('base64'), mimeType } },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
    });
    const raw = textFromResponse(data).replace(/```json|```/g, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : raw);
    const issues = Array.isArray(obj.issues) ? obj.issues.map((i) => String(i).slice(0, 140)).filter(Boolean) : [];
    return { ok: obj.ok !== false, issues };
  } catch (err) {
    console.warn(`[ai] QA visual de la pieza falló (sigo, asumo OK): ${err.message}`);
    return { ok: true, issues: [] };
  }
}

/* =========================================================================
 * GROQ (fallback de copy)
 * ========================================================================= */

async function groqCopy(promptUser, wantSlides = false, wantSticker = false, wantStoryPoints = false) {
  if (!config.groq.apiKey) throw new Error('No hay GROQ_API_KEY ni GEMINI_API_KEY configuradas para generar copy.');
  const stickerShape = wantSticker ? ',"sticker":{"type","question","options":[...],"correct_index"} — "sticker" es OBLIGATORIO' : '';
  const pointsShape = wantStoryPoints ? ',"story_points":["...","..."] — "story_points" (2-3 puntos cortos) es OBLIGATORIO' : '';
  const shape = wantSlides
    ? `{"overlay","caption","hashtags","cta","slides":[{"title","text"},...]${stickerShape}${pointsShape}} — "slides" es OBLIGATORIO`
    : `{"overlay","caption","hashtags","cta"${stickerShape}${pointsShape}}`;
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
  // Historias (no reel): además del caption se piden los puntos que van SOBRE la imagen.
  const wantStoryPoints = opts.format === 'story' && opts.postType !== 'reel';

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
              ...(wantStoryPoints ? {
                story_points: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
              } : {}),
              ...((Array.isArray(opts.templateOptions) && opts.templateOptions.length)
                ? { template: { type: 'string', enum: opts.templateOptions.map((t) => t.name) } }
                : {}),
            },
            // En carrusel las slides son OBLIGATORIAS: sin ellas la pieza sale simple.
            // En piezas semi, el sticker también. La plantilla, si se ofrecieron opciones.
            required: ['overlay', 'caption', 'hashtags', 'cta', ...(opts.carousel ? ['slides'] : []), ...(opts.wantSticker ? ['sticker'] : []), ...(wantStoryPoints ? ['story_points'] : []), ...((Array.isArray(opts.templateOptions) && opts.templateOptions.length) ? ['template'] : [])],
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
  return { copy: sanitizeCopy(await groqCopy(promptUser, Boolean(opts.carousel), Boolean(opts.wantSticker), wantStoryPoints)), model: 'groq' };
}

/**
 * Genera { overlay, caption, hashtags, cta } con control de calidad: si el copy
 * rompe reglas de la voz (lunfardo, frases de IA, largos), se regenera UNA vez
 * con los problemas como feedback. Devuelve además:
 *  - gen_model: 'gemini' | 'groq' (con qué modelo salió — groq es el respaldo)
 *  - qa_notes: problemas que quedaron sin resolver (null = pasó limpio)
 */
/** Registra una lección en la memoria de errores (fire-and-forget, jamás rompe). */
function learnFrom(source, scope, lesson, detail = null) {
  try { require('./learning').recordLesson({ source, scope, lesson, detail }); } catch (_) { /* nunca rompe */ }
}

async function generateCopy(opts) {
  // MEMORIA DE ERRORES: las lecciones aprendidas de fallos anteriores (del sistema y
  // de las correcciones del dueño en el panel) entran al prompt para no repetirlos.
  let lessons = '';
  try { lessons = await require('./learning').lessonsContext({ pillar: opts.pillar, audience: 'copy' }); } catch (_) {}
  opts = { ...opts, lessons };

  let attempt = await generateCopyOnce(opts);
  let problems = lintCopy(attempt.copy, opts);

  if (problems.length) {
    console.warn(`[ai] Copy rechazado por QA (${problems.join(' · ')}). Regenero con feedback.`);
    try {
      // Si el problema es de la familia "relleno corporativo", el reintento suele
      // esquivar la frase exacta y pisar una prima ("tu socio" → "tu aliado").
      // Se bloquea la familia entera y se le dice QUÉ poner en su lugar.
      const feedback = [...problems];
      if (problems.some((p) => /relleno corporativo|socio|aliad|frase de IA/.test(p))) {
        feedback.push('PROHIBIDA también cualquier variante o sinónimo de esas frases ("tu aliado", "tu compañero", "tu partner", "estamos para vos", eslóganes vacíos). En su lugar, decí QUÉ HACE u OFRECE la empresa en concreto (rubro, servicio, condición real).');
      }
      const retry = await generateCopyOnce(opts, feedback);
      const retryProblems = lintCopy(retry.copy, opts);
      // Gana la versión con menos problemas (el reintento suele salir limpio).
      if (retryProblems.length <= problems.length) { attempt = retry; problems = retryProblems; }
    } catch (err) {
      console.warn(`[ai] El reintento de copy falló (queda la 1a versión): ${err.message}`);
    }
  }

  // Problema que NI el reintento con feedback pudo limpiar = patrón que se repite:
  // queda como lección para que las próximas generaciones lo eviten de entrada.
  // (Se normalizan los números para que "overlay muy largo (12 palabras)" y
  // "(9 palabras)" cuenten como LA MISMA lección y sumen frecuencia.)
  for (const p of problems) {
    learnFrom('lint', opts.pillar || 'global', `No repetir este error de copy: ${String(p).replace(/\d+/g, 'N')}`);
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
    text: `Sos catalogador de producto. Te paso ${urls.length} fotos DEL MISMO producto (indexadas 0 a ${urls.length - 1}, en orden). Por cada foto decí:
- "shows": QUÉ muestra en pocas palabras (ángulo: frontal/3-4/lateral/trasera/cenital, y si es DETALLE/zoom de una parte puntual como "detalle del sol bordado"/"suela de yute"/"etiqueta"/"puntera", o el producto entero).
- "is_detail": true si es un primer plano de una parte.
- "color": el color DOMINANTE del producto en esa foto, en 1-2 palabras (ej. "azul denim", "crudo", "negro").
- "framing": cómo está ENCUADRADO el sujeto. "entero" = el producto (y la persona, si hay) se ve completo, sin quedar cortado por el borde del cuadro. "recorte_cuerpo" = hay una persona o maniquí y el borde de la foto la CORTA por el medio (típico: se ve del torso hacia abajo, sin cabeza; o los brazos/piernas cortados). "detalle" = zoom deliberado de una parte.
- "has_person": true si aparece una persona o maniquí con la prenda puesta.
- "fills_frame": true si el sujeto OCUPA casi todo el cuadro (poco fondo vacío alrededor); false si el producto es chico y flota con mucho fondo blanco/vacío.
Devolvé SOLO un JSON array alineado al orden: [{"i":0,"shows":"...","is_detail":false,"color":"...","framing":"entero","has_person":false,"fills_frame":true},...]. Literal: mirá cada foto, no inventes.` },
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
      const framing = ['entero', 'recorte_cuerpo', 'detalle'].includes(d.framing) ? d.framing : null;
      return {
        index: i,
        shows: String(d.shows || '').slice(0, 100),
        isDetail: Boolean(d.is_detail),
        color: String(d.color || '').toLowerCase().trim().slice(0, 30),
        // Encuadre: "recorte_cuerpo" es el defecto que el dueño detectó a ojo (el modelo
        // cortado por el torso). Se usa para NO elegir esa foto como hero si hay una
        // entera, y para encuadrarla a sangre (editorial) si es la única que hay.
        framing: framing || (d.is_detail ? 'detalle' : 'entero'),
        hasPerson: Boolean(d.has_person),
        fillsFrame: d.fills_frame !== false,
      };
    });
  } catch (err) {
    console.warn(`[ai] describeProductPhotos falló (sigo sin descripciones): ${err.message}`);
    return [];
  }
}

async function generateBackground({ theme, brief, occasion, format = 'feed', referenceImages = [], seed = null, artStyle = null } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown()) return null;
  if (await imageBudgetExceeded()) return null; // tope diario: sigue con plantilla (gratis)

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
${artStyle === 'poster' ? posterArtDirection(format) : ''}
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
        learnFrom('image', 'global', `El modelo de imagen coló ${check.hasText ? 'texto' : 'un logo'} en un fondo generado (plata tirada): reforzar la regla anti-texto/anti-logo`, check.notes);
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
  if (await imageBudgetExceeded()) return null; // tope diario: sigue con plantilla (gratis)

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
        learnFrom('image', 'global', `El modelo de imagen coló ${check.hasText ? 'texto' : 'un logo'} en una ilustración didáctica (plata tirada): reforzar la regla anti-texto/anti-logo`, check.notes);
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
 * DIRECTOR DE FOTOGRAFÍA para PIEZAS SIMPLES (una sola imagen). Es el paso que hace
 * que la pieza deje de ser "una foto cualquiera del producto" (bug real, jul-2026):
 * hasta ahora sólo los carruseles miraban las fotos; las piezas simples usaban a
 * ciegas la primera foto de Tiendanube con una toma genérica. Acá el sistema VE qué
 * muestra cada foto real (visión), lee la ficha/descripción verdadera y el ángulo
 * decidido por el director creativo, y elige LA foto y LA toma para ESTA pieza:
 *  - si el ángulo habla de la suela y hay una foto de la suela → toma 'detalle' de ESA foto
 *    (que además se renderiza con la FOTO REAL a pantalla completa: gratis y sin alucinación);
 *  - si no hay detalle puntual → 'hero' con la foto que mejor presenta el producto.
 * El copy se escribe DESPUÉS, sabiendo qué muestra la imagen — pieza e imagen dejan
 * de ir por caminos separados. Best-effort: si falla, se sigue como siempre.
 * Devuelve { shotType, focus, photoIndex, background, overlay, badge } o null.
 */
async function planHeroShot({ productName, productDescription, brief, pillar = 'producto', objective = 'venta', occasion = null, photoDescriptions = [], photoCount = 1, format = 'feed', brandName = null } = {}) {
  const cleanDesc = productDescription
    ? String(productDescription).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700)
    : '';
  const photosBlock = (photoDescriptions && photoDescriptions.length)
    ? `QUÉ MUESTRA CADA FOTO REAL DISPONIBLE (elegí por CONTENIDO, no por orden):\n${photoDescriptions.map((p) => `- foto ${p.index}: ${p.shows}${p.color ? ` (color: ${p.color})` : ''}${p.isDetail ? ' [DETALLE/ZOOM]' : ''}${p.framing === 'recorte_cuerpo' ? ' [OJO: la persona sale CORTADA por el borde — encuadre parcial]' : ''}${p.framing === 'entero' && p.hasPerson ? ' [persona COMPLETA]' : ''}`).join('\n')}`
    : `(No hay descripción de las fotos: hay ${photoCount} foto(s), índices 0 a ${photoCount - 1}. Elegí photo_index 0 y una toma 'hero' genérica-pero-verdadera.)`;

  const system = 'Sos DIRECTOR DE FOTOGRAFÍA de una agencia premium de indumentaria de trabajo (BLACKS). Para cada pieza única de Instagram decidís QUÉ foto real usar y QUÉ toma armar, como un profesional que estudia el brief y el material antes de disparar. Respondés SOLO con JSON válido.';
  const prompt = `Decidí LA toma para UNA pieza de Instagram (una sola imagen) de este producto.

PRODUCTO: ${productName || 'producto de trabajo BLACKS'}${brandName ? ` (marca ${brandName})` : ''}
${cleanDesc ? `FICHA REAL (única fuente válida de características — nada fuera de esto existe): "${cleanDesc}"` : '(sin descripción disponible: no afirmes ninguna característica técnica)'}
PILAR: ${pillar} · OBJETIVO: ${objective} · FORMATO: ${format === 'story' ? 'historia 9:16' : 'feed 4:5'}${occasion ? `\nOCASIÓN/FECHA: ${occasion}` : ''}
${brief ? `ÁNGULO DE LA PIEZA (el mensaje ya decidido — la foto tiene que CONTARLO): "${brief}"` : ''}

${photosBlock}

CÓMO DECIDIR (pensalo como un profesional, en este orden):
1. ¿El ángulo nombra o gira alrededor de un DETALLE puntual (suela, puntera, costura, bordado, tela, etiqueta)? → buscá la foto que MUESTRA ese detalle y armá shot_type "detalle" con focus en eso, respaldado por la ficha real. Si NINGUNA foto lo muestra, NO fuerces el detalle: hero del producto entero.
2. ¿El ángulo es de uso/contexto (obra, taller, clima)? → "contexto" con la foto más natural.
3. ¿Es presentación/venta general? → "hero" con la foto que mejor presenta el producto ENTERO (frontal o 3/4, el color con mejor foto). Si es una PRENDA y hay una foto donde se ve PUESTA/con caída real, preferila (queda más editorial y con vida que la prenda colgada plana).
4. ENCUADRE (regla firme para las tomas 'hero'): entre dos fotos parecidas, elegí SIEMPRE la de encuadre "entero" antes que una marcada [OJO: la persona sale CORTADA]. Una hero con el modelo cortado por el torso se lee como error de recorte y es exactamente el problema que hay que evitar. Sólo usá una foto de encuadre parcial como hero si NINGUNA otra muestra el producto entero, o si el ángulo pide expresamente ese recorte.
5. "background": "limpio" (estudio) para producto/promo/mayorista; "sutil" para detalle; "contexto" sólo si el ángulo lo pide.
6. "overlay": QUÉ diría un titular de máx ~5 palabras sobre LO QUE SE VE en esa foto, con datos reales (voseo argentino). Es un respaldo: si no aporta, null.
7. "badge": "OFERTA" sólo si el ángulo habla de una oferta real; "NUEVO" sólo si habla de lanzamiento; si no, null.
REGLA DE ORO: el focus tiene que estar RESPALDADO por la ficha real y VISIBLE en la foto elegida. Prohibido inventar materiales o características.

Devolvé SOLO este JSON:
{"shot_type":"hero|detalle|contexto|flatlay","focus":"qué enfatiza, concreto y real","photo_index":0,"background":"limpio|sutil|contexto","overlay":"máx 5 palabras o null","badge":null,"reason":"por qué esa foto/toma en 1 frase"}`;

  const schema = {
    type: 'object',
    properties: {
      shot_type: { type: 'string', enum: ['hero', 'detalle', 'contexto', 'flatlay'] },
      focus: { type: 'string' },
      photo_index: { type: 'integer' },
      background: { type: 'string', enum: ['limpio', 'sutil', 'contexto'] },
      overlay: { type: 'string', nullable: true },
      badge: { type: 'string', nullable: true },
      reason: { type: 'string' },
    },
    required: ['shot_type', 'focus', 'photo_index', 'background'],
  };

  const s = await generateJson({ system, prompt, schema, maxTokens: 400, temperature: 0.4 });
  if (!s || typeof s !== 'object') return null;
  let pi = Math.max(0, Math.min(photoCount - 1, Number.isInteger(Number(s.photo_index)) ? Number(s.photo_index) : 0));
  const descs = photoDescriptions || [];
  let shotType = ['hero', 'detalle', 'contexto', 'flatlay'].includes(s.shot_type) ? s.shot_type : 'hero';

  // VALIDACIÓN DURA DEL ENCUADRE. El prompt pide preferir fotos enteras, pero el modelo
  // igual elegía la foto 0 (en el catálogo de Tiendanube las primeras suelen ser las del
  // modelo cortado por el torso) — de ahí la queja del dueño: "no me gusta que se vea la
  // foto del producto con el torso cortado... que el programa detecte estas
  // inconsistencias y las corrija al generar". Acá se corrige sí o sí: para una hero, si
  // la foto elegida tiene encuadre parcial y existe otra ENTERA del mismo producto, se
  // cambia. Se prioriza mantener el color de la foto que el modelo había elegido.
  const isWholeShot = shotType === 'hero' || shotType === 'contexto';
  const chosen = descs.find((p) => p.index === pi);
  if (isWholeShot && chosen && chosen.framing === 'recorte_cuerpo') {
    const whole = descs.filter((p) => p.framing === 'entero' && !p.isDetail);
    const sameColor = whole.find((p) => p.color && chosen.color && p.color === chosen.color);
    const better = sameColor || whole.find((p) => p.hasPerson) || whole[0];
    if (better) {
      console.log(`[ai] planHeroShot: la foto #${pi} recorta al modelo (torso cortado) — cambio a la #${better.index} ("${better.shows}"), que muestra el producto entero.`);
      pi = better.index;
    }
  }

  // Validación dura: una toma 'detalle' sólo vale si la foto elegida ES un detalle
  // real (según la visión) — si no, degrada a hero (mejor entero que un falso zoom).
  const desc = descs.find((p) => p.index === pi);
  if (shotType === 'detalle' && desc && !desc.isDetail) shotType = 'hero';
  return {
    shotType,
    focus: s.focus ? String(s.focus).slice(0, 160) : '',
    photoIndex: pi,
    extraPhotos: [],
    background: ['limpio', 'sutil', 'contexto'].includes(s.background) ? s.background : 'limpio',
    overlay: s.overlay && String(s.overlay).trim() && String(s.overlay).toLowerCase() !== 'null' ? String(s.overlay).trim().slice(0, 60) : null,
    badge: ['NUEVO', 'OFERTA'].includes(String(s.badge || '').toUpperCase()) ? String(s.badge).toUpperCase() : null,
    reason: s.reason ? String(s.reason).slice(0, 200) : null,
    photoShows: desc ? desc.shows : null, // qué muestra la foto elegida (para el copy)
    // Encuadre de la foto final: el renderer decide con esto si la muestra a sangre
    // (foto con persona / que llena el cuadro) o dentro de la tarjeta de estudio
    // (recorte de catálogo chico sobre fondo blanco). Ver photoFraming en imageRenderer.
    photoFraming: desc ? desc.framing : null,
    photoHasPerson: desc ? Boolean(desc.hasPerson) : false,
    photoFillsFrame: desc ? desc.fillsFrame !== false : false,
  };
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

async function generateProductScene({ productImageUrl, productImageUrls = [], productName, theme, brief, occasion, format = 'feed', seed = null, shotSpec = null, artStyle = null } = {}) {
  if (!config.ai.useAiImages || !hasGemini() || isImageQuotaCoolingDown() || (!productImageUrl && !productImageUrls.length)) return null;
  // Tope diario de gasto: la pieza sale con la foto real del catálogo (gratis).
  // NOTA: el Estudio (generateStudioScene) NO pasa por el tope — es una acción manual
  // y deliberada del usuario desde el panel, no gasto automático del pipeline.
  if (await imageBudgetExceeded()) return null;

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

${photoRealismRules()}

REALISMO Y PRESERVACIÓN ESTRUCTURAL (PRODUCT-IN-CONTEXT):
- PROHIBIDO generar alucinaciones visuales, deformaciones de la puntera/suela, o cambios en las letras y etiquetas del packaging/producto original.
- Imperfecciones creíbles en el entorno (no en el producto): profundidad de campo suave con fondo desenfocado (bokeh) para resaltar la figura del producto.

FIDELIDAD ABSOLUTA — PROHIBIDO MODIFICAR EL PRODUCTO (lo más importante):
- El producto de la salida tiene que ser PÍXEL A PÍXEL el de la referencia: mismo bordado, mismos apliques, misma etiqueta, mismas costuras, misma suela, mismo color. PROHIBIDO agregar, mover, agrandar o inventar CUALQUIER elemento que no esté EXACTAMENTE donde está en la foto de referencia (ej: NO agregues un sol/escudo/logo bordado si la referencia no lo tiene, NI lo muevas de lugar). Si dudás de un detalle, dejalo TAL CUAL la referencia. Cambiás sólo el fondo/escena y la luz, NUNCA el producto.

UN SOLO PRODUCTO EN CUADRO (crítico):
- Mostrá EXACTAMENTE UN producto: el de la referencia. PROHIBIDO agregar un SEGUNDO par de calzado, otra prenda o cualquier producto extra — ni de fondo, ni en primer plano, ni desenfocado, ni "de acompañamiento". Si la referencia es un par de calzado, se ve ESE par y nada más.

ARQUITECTURA DE ZONAS SEGURAS (NEGATIVE SPACE):
- Aire limpio y desenfocado en los tercios superior e inferior para garantizar contraste absoluto al superponer titulares y precios.
${artStyle === 'poster' ? posterArtDirection(format) : ''}
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
      // La marca propia del producto (etiqueta Pampero/Ombú real) NO es motivo de
      // descarte: sólo logos/texto agregados FUERA del producto.
      const check = await checkImageQuality(img, { productHasBranding: true });
      if (!check.ok) {
        console.warn(`[ai] generateProductScene: descartada por control de calidad (texto=${check.hasText} logo=${check.hasLogo} ${check.notes || ''}), reintentando más estricto...`);
        learnFrom('image', 'global', `El modelo de imagen coló ${check.hasText ? 'texto' : 'un logo'} en una escena de producto (plata tirada): reforzar la regla anti-texto/anti-logo`, check.notes);
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

${photoRealismRules()}

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
      // Productos reales con su marca puesta: la etiqueta propia no es descarte.
      const check = await checkImageQuality(img, { productHasBranding: true });
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
  return `REALISMO ANTI-IA (que NO parezca video generado): imperfecciones reales (desgaste natural, algo de polvo, arrugas de tela con física creíble, superficies con uso real), una sola fuente de luz coherente con sombras hacia el mismo lado, leve grano fílmico, saturación contenida tipo documental. PROHIBIDO: superficies plásticas perfectas, movimientos flotantes irreales, cámara imposiblemente estable, colores vibrantes de render, transiciones mágicas. Si hay personas: de espaldas o fuera de foco, manos con anatomía perfecta.`;
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
  return `${productPostureFor(name)}, prácticamente QUIETO/A. El único movimiento es sutil y ambiental: la tela que se acomoda o se mueve levemente con el viento, una respiración natural, el peso del cuerpo que se asienta. PROHIBIDO actuar una acción física dinámica (caminar, agacharse, atarse cordones, gestos grandes o repetidos) — ese tipo de movimiento articulado es lo que más rompe la coherencia del video y genera cortes/artefactos. Ante la duda entre quietud y una acción vistosa, elegí SIEMPRE la quietud.
- LA PERSONA NO TRABAJA NI USA HERRAMIENTAS: aunque el entorno tenga objetos, NO martilla, NO golpea, NO opera máquinas, NO carga ni manipula nada. Está simplemente de pie mostrando la prenda, como en una sesión de fotos. Cero golpes, impactos o acciones repetitivas de "trabajo".`;
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
// Subject por estilo adaptado a un COMBO del estudio (varios productos coordinados).
function buildStudioVideoPrompt({ products = [], theme, format = 'story', duration = 8, pillar = 'producto', style = 'lookbook' } = {}) {
  const isCombo = products.length > 1;
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const allImages = products.flatMap((p) => (Array.isArray(p.images) && p.images.length ? p.images : [p.imageUrl]).filter(Boolean));
  const names = products.map((p) => p && p.name).filter(Boolean).join(' ');
  const st = VIDEO_STYLES[style] || VIDEO_STYLES.lookbook;
  // Prompt en INGLÉS (rinde mejor en Veo), con fidelidad/continuidad reforzadas y el
  // subject adaptado a combo (englishVideoSections maneja isCombo).
  const prompt = buildVideoFramePromptEN({ ratio, duration, pillar, anchor: productAnchorLines(products), isCombo, imageCount: allImages.length, style, name: names, theme });

  return {
    style,
    label: st.label,
    prompt,
    instructions: videoHowToInstructions(ratio, { combo: isCombo }),
    productImages: allImages,
    platformNote: 'Para máxima fidelidad el flujo pro es Image-to-Video (i2v): subí una foto como primer fotograma. Para CAMBIOS DE ESCENA con todas tus fotos: un clip por foto (i2v) y unilos en un editor — un solo prompt no recorre todas las fotos como escenas.',
  };
}

/** Todos los estilos de video del estudio de una (para el modal con selector). */
function buildStudioVideoPromptSet(ctx = {}) {
  const styles = VIDEO_STYLE_ORDER.map((id) => {
    const r = buildStudioVideoPrompt({ ...ctx, style: id });
    return { id, label: r.label, desc: VIDEO_STYLES[id].desc, prompt: r.prompt };
  });
  const base = buildStudioVideoPrompt(ctx);
  return { styles, instructions: base.instructions, productImages: base.productImages, platformNote: base.platformNote };
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
/* =========================================================================
 * ESTILOS DE VIDEO (presets para tener a mano y variar)
 * Cada estilo produce un prompt distinto compartiendo las reglas de fidelidad y
 * anti-artefacto. Los que NO tienen persona son los que menos se rompen en Veo
 * (la persona/rostro/acción es lo que más falla). Cada .build() devuelve las
 * secciones que cambian; buildVideoPrompt arma el marco común alrededor.
 * ========================================================================= */
const VIDEO_STYLES = {
  lookbook: {
    label: 'Modelo quieto (lookbook)',
    desc: 'Persona con la prenda puesta, casi inmóvil; el movimiento lo hace la cámara. Premium, tipo catálogo.',
    person: true,
    build: ({ name, theme }) => {
      const scene = videoSceneFor(name);
      return {
        sceneLine: `[ESCENA]: ${theme ? `${theme} — ambientado así: ` : ''}${scene.escenario}. Ambiente real argentino, no set de estudio artificial.`,
        subject: `[PERSONA Y POSTURA] (quietud, no actuación): ${productActionFor(name)}`,
        optica: cinematographyPlan().optica,
        camera: `RACK FOCUS o PUSH-IN lento y CONTINUO hacia el producto (una sola pasada, sin saltos). Todo el movimiento lo aporta la cámara; el sujeto está quieto. Encuadre: ${scene.camara}.`,
        luz: scene.luz,
        rhythm: `- 0-1.5s: el producto ya en cuadro, nítido y reconocible.\n- 1.5-6s: quietud con micro-movimiento de tela/aire.\n- 6-8s: plano hero limpio y estable (portada).`,
      };
    },
  },
  producto_solo: {
    label: 'Solo el producto (sin persona)',
    desc: 'La prenda sola, sin nadie. La opción que MENOS se rompe en Veo.',
    person: false,
    build: () => ({
      sceneLine: `[ESCENA]: estudio limpio de fondo neutro (gris a hormigón) o una superficie de trabajo prolija, con muy poca utilería. Sin obra ni herramientas.`,
      subject: `[SUJETO]: SOLO el producto, SIN ninguna persona en cuadro. La prenda se presenta con su caída natural (apoyada, colgada o como si la sostuviera un maniquí invisible), en su forma real. PROHIBIDO que aparezca una persona, manos, un rostro o partes del cuerpo.`,
      optica: 'lente prime 50mm f/2.8, bokeh cremoso y compresión natural',
      camera: `PUSH-IN lento y continuo hacia el producto, o una órbita MUY suave (máx 20°) alrededor de la prenda. Velocidad pareja, sin sacudidas ni giros de 360°.`,
      luz: 'luz de estudio suave y direccional con un contraluz que recorta el contorno del producto, tonos cálidos sobrios',
      rhythm: `- 0-1.5s: el producto ya en cuadro, completo y nítido.\n- 1.5-6s: la cámara se acerca o rodea lento; la tela apenas se mueve con el aire.\n- 6-8s: plano hero final limpio (portada).`,
    }),
  },
  macro: {
    label: 'Detalle macro',
    desc: 'Primerísimo plano de la tela, costuras, cierre, etiqueta. Enfoca la calidad; casi no se rompe.',
    person: false,
    build: () => ({
      sceneLine: `[ESCENA]: fondo neutro totalmente desenfocado; sólo importa el detalle del producto.`,
      subject: `[SUJETO]: PRIMERÍSIMO PLANO / MACRO de un detalle REAL del producto — la textura de la tela, una costura, el cierre, el puño o la etiqueta (usá SOLO detalles visibles en la referencia). NO se ve el producto entero ni ninguna persona. Ese detalle llena el cuadro, con profundidad de campo mínima.`,
      optica: 'lente macro 100mm f/2.8, profundidad de campo mínima y muy selectiva',
      camera: `RACK FOCUS macro: el foco viaja suave por el detalle en una sola pasada; o un PUSH-IN macro lentísimo. Cero movimiento brusco.`,
      luz: 'luz rasante suave que revela la textura y el relieve del material, con sombras delicadas',
      rhythm: `- 0-2s: el detalle ya nítido y reconocible.\n- 2-6s: micro-recorrido de foco/acercamiento sobre la textura.\n- 6-8s: se asienta en el detalle más lindo (portada).`,
    }),
  },
  flatlay: {
    label: 'Flat-lay cenital',
    desc: 'La prenda apoyada y filmada desde arriba, prolija. Estilo e-commerce, muy estable.',
    person: false,
    build: () => ({
      sceneLine: `[ESCENA]: una superficie limpia y prolija (madera, hormigón o mesa de trabajo), vista DESDE ARRIBA. Sin obra ni herramientas.`,
      subject: `[SUJETO]: la prenda apoyada PLANA sobre la superficie, vista CENITAL (desde arriba, 90°), ordenada y con aire alrededor. SIN persona.`,
      optica: 'lente 35mm en cenital, encuadre parejo sin distorsión',
      camera: `Cámara cenital: PUSH-IN vertical lentísimo hacia la prenda, o un leve deslizamiento lateral (parallax) muy suave. Nada de rotaciones bruscas.`,
      luz: 'luz difusa pareja desde arriba con una sombra suave de contacto, tono neutro editorial',
      rhythm: `- 0-1.5s: la prenda completa ya en cuadro, prolija.\n- 1.5-6s: acercamiento o deslizamiento lento.\n- 6-8s: plano cenital final estable (portada).`,
    }),
  },
  percha: {
    label: 'En percha',
    desc: 'La prenda colgada de una percha, con un balanceo leve. Simple y elegante, sin persona.',
    person: false,
    build: () => ({
      sceneLine: `[ESCENA]: la prenda colgada de una PERCHA contra una pared limpia (cemento, madera o fondo neutro). Sin obra ni herramientas.`,
      subject: `[SUJETO]: la prenda en la percha con su caída natural. El único movimiento es un balanceo MUY leve de la percha, o el aire moviendo apenas la tela. SIN persona.`,
      optica: 'lente prime 50mm f/2.8, bokeh cremoso',
      camera: `TILT-REVEAL vertical: arranca abajo (el ruedo) y sube lento hasta el cuello/hombro; o un push-in frontal lento. Un solo movimiento continuo.`,
      luz: 'luz lateral suave de ventana con sombra larga en la pared, tono cálido sereno',
      rhythm: `- 0-1.5s: la prenda ya reconocible.\n- 1.5-6s: el tilt o acercamiento revela la prenda con el balanceo leve.\n- 6-8s: plano hero estable de la prenda colgada (portada).`,
    }),
  },
  ambiente: {
    label: 'Ambiente / marca',
    desc: 'El producto protagonista en un entorno real, atmosférico y quieto. B-roll de marca.',
    person: false,
    build: ({ name, theme }) => {
      const scene = videoSceneFor(name);
      return {
        sceneLine: `[ESCENA]: ${theme ? `${theme} — ambientado así: ` : ''}${scene.escenario}. Ambiente real argentino con desgaste creíble.`,
        subject: `[SUJETO]: el producto es el protagonista en su entorno, quieto y con presencia — un plano de MARCA (b-roll), más atmósfera que venta. Puede haber una persona SÓLO de fondo, desenfocada o fuera de cuadro, nunca en foco ni "trabajando".`,
        optica: cinematographyPlan().optica,
        camera: `PLANO FIJO con respiro (trípode) o TRACKING lateral lentísimo; el interés lo dan la luz, el polvo en el aire y la textura. Cero acción, cero golpes. Encuadre: ${scene.camara}.`,
        luz: scene.luz,
        rhythm: `- 0-2s: el producto ya en cuadro, reconocible.\n- 2-6s: quietud atmosférica (polvo, luz, tela).\n- 6-8s: se asienta en un plano hero de marca (portada).`,
      };
    },
  },
  secuencia: {
    label: 'Secuencia (filmmaker)',
    desc: 'Una sola toma coreografiada que revela varias caras del producto (detalle → plano completo → hero). Dinámico pero SIN cortes que buguean.',
    person: false,
    build: ({ name, theme }) => {
      const scene = videoSceneFor(name);
      return {
        sceneLine: `[ESCENA]: ${theme ? `${theme} — ambientado así: ` : ''}${scene.escenario}.`,
        subject: `[SUJETO]: el producto presentado para que la cámara revele varias de sus caras en UN solo movimiento coreografiado — los "cortes" son movimientos suaves de cámara, nunca ediciones. El producto se mantiene idéntico todo el tiempo.`,
        optica: cinematographyPlan().optica,
        camera: `Un "oner" coreografiado (una sola toma, sensación de filmmaker): arranca en un detalle (rack focus), sube en grúa/tilt hasta revelar el producto entero, cierra con un push lento a un plano hero. Un solo movimiento motivado, sin cortes.`,
        luz: scene.luz,
        rhythm: `- 0-2s: abre en un detalle (ya fiel), después revela.\n- 2-6s: el movimiento continuo recorre el producto con vida (tela, polvo, luz).\n- 6-8s: aterriza en un hero limpio (portada).`,
      };
    },
  },
};
const VIDEO_STYLE_ORDER = ['secuencia', 'lookbook', 'producto_solo', 'macro', 'flatlay', 'percha', 'ambiente'];

/** Lista de estilos disponibles (para el selector del panel). */
function listVideoStyles() {
  return VIDEO_STYLE_ORDER.map((id) => ({ id, label: VIDEO_STYLES[id].label, desc: VIDEO_STYLES[id].desc }));
}

/* =========================================================================
 * PROMPTS DE VIDEO EN INGLÉS (Veo/Runway/Kling obedecen mejor en inglés).
 * El PROMPT que se pega en el modelo va en inglés; las etiquetas y las
 * instrucciones del panel siguen en español. Mismo set de estilos.
 * ========================================================================= */
const _rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const VIDEO_SCENE_EN = {
  urban: [
    'a clean neutral studio (mid-grey to concrete seamless), minimal props, full focus on the garment',
    'a reclaimed industrial loft: exposed brick, large windows, polished concrete floor, minimal furniture',
    'a city sidewalk with a textured wall and some urban greenery, softly blurred editorial background',
    'a modern city street fully defocused in the background (bokeh), lookbook tone',
    'an inner courtyard with a concrete wall and a plant, calm mid-afternoon light',
    'a tidy urban garage with natural side light, NO tools in view',
  ],
  industrial: [
    'a metalworking workshop with a steel bench, a vise and tools on a pegboard',
    'a construction site: timber formwork, rebar tied with wire, blocks and cement dust in the air',
    'a logistics warehouse with tall loaded racks and wooden pallets',
    'a wide industrial shed with a high sliding door open, worn polished-concrete floor',
    'an open materials yard with rusted containers, corrugated metal and chains',
  ],
};
const VIDEO_LIGHT_EN = [
  'soft directional late-afternoon light with long warm shadows',
  'diffused wrap-around window light, neutral editorial tone',
  'soft golden-hour light raking from the side, medium contrast',
  'even overcast light, restrained natural colors, fashion-documentary look',
];
function videoSceneEN(name) { return _rnd(isWorkwearName(name) ? VIDEO_SCENE_EN.industrial : VIDEO_SCENE_EN.urban); }
function videoLightEN() { return _rnd(VIDEO_LIGHT_EN); }

function videoToneEN(pillar) {
  const t = {
    producto: 'Premium catalog tone: full focus on the detail and quality of the product, calm and confident pace.',
    promo: 'Commercial tone with contained energy: subtle urgency (grab the offer now), no exaggerated gestures or fast cuts.',
    marca: 'Brand tone: atmospheric, more feeling than selling — a real work moment, not an ad.',
    mayorista: 'Corporate team tone: a real, coordinated work crew, professional seriousness, no gimmicks.',
    educativo: 'Clear, calm, almost documentary: showing the product so it reads well, unhurried.',
    ugc: 'Close and spontaneous: genuine content shot on location, not a polished commercial.',
    engagement: 'Close, conversational, simple and direct.',
  };
  return t[pillar] || t.producto;
}
function videoFidelityEN(isCombo, imageCount) {
  const which = isCombo ? 'Each product' : 'The product';
  return `PRODUCT FIDELITY (the single most important rule — a clip that adds seams, zippers, pockets, textures or details NOT present in the reference photos is discarded, even if the rest looks great):
- Use ALL ${imageCount > 1 ? `${imageCount} ` : ''}attached reference image(s) to reconstruct the product faithfully from every angle. ${which} must stay IDENTICAL to the references for the ENTIRE clip: exact same color, cut, silhouette, stitching, labels and hardware. Do NOT invent, add, move, enlarge or "improve" anything.
- Absolute CONTINUITY: zero morphing between frames, zero logo/label mutation, no drifting proportions. If a part is not clearly visible in the references (e.g. the back), keep it ambiguous or out of focus — never invent new geometry.
- ONE SINGLE CONTINUOUS TAKE: no hard cuts, no jump cuts, no different angles spliced together. Any change of framing happens WITHIN the same shot, driven by camera movement — never by an edit.
- If forced to choose between a flashy move and keeping the product identical in one take, ALWAYS choose the latter.`;
}
const FACE_RULE_EN = `[FACE]: if a reference shows a person's face, the video must NOT show or reconstruct it. Frame from the neck down, from behind, head out of frame, turned away, in shadow or out of focus — never sharp and frontal.`;
const VIDEO_REALISM_EN = `ANTI-AI REALISM (must NOT look generated): real imperfections (natural wear, a little dust, cloth wrinkles with believable physics, surfaces with real use), one coherent light source with shadows falling the same way, subtle film grain, restrained documentary saturation. FORBIDDEN: perfect plastic surfaces, floating unreal motion, an impossibly stable camera, vibrant render colors, magic transitions. If people appear: from behind or out of focus, hands with perfect anatomy.`;
const VIDEO_AUDIO_EN = `[AUDIO] (if the model outputs sound, e.g. Veo 3): only soft diegetic ambience (light wind, a distant murmur, fabric rustle). NO music, NO voice-over, NO advertising "whoosh" SFX, and NO hits, hammering or tools in the foreground.`;
const VIDEO_AESTHETIC_EN = `[AESTHETIC]: rugged, premium, high-contrast, a modern ad shot by a real cinematographer. NO on-screen text (captions are added later).`;
const CAMERA_TAIL_EN = `The camera does ALL the movement on a gimbal/dolly at a slow, constant speed — motivated and cinematic, one fluid move from start to finish. FORBIDDEN: 360° orbits, whip pans, sudden jerks, edit cuts or spliced shots.`;

function englishVideoSections(style, { name, theme, isCombo }) {
  const item = isCombo ? 'the coordinated set of garments' : 'the garment';
  const sceneTop = (s, tail) => `[SCENE]: ${theme ? `${theme} — set in: ` : ''}${s}. ${tail}`;
  switch (style) {
    case 'producto_solo': return {
      scene: `[SCENE]: a clean neutral studio (mid-grey to concrete) or a tidy work surface, very few props. No construction, no tools.`,
      subject: `[SUBJECT]: ONLY ${item}, with NO person in frame — presented with its natural drape (laid down, hung, or as if held by an invisible mannequin), in its real shape. FORBIDDEN: any person, hands, face or body parts.`,
      optica: 'a 50mm prime f/2.8, creamy bokeh, natural compression',
      camera: `A slow continuous PUSH-IN toward the product, or a very gentle 20°-max arc around it. ${CAMERA_TAIL_EN}`,
      light: 'soft directional studio light with a rim light separating the product from the background, sober warm tones',
      rhythm: `- 0-1.5s: product already in frame, complete and sharp.\n- 1.5-6s: the camera moves in/around slowly; the fabric barely shifts with the air.\n- 6-8s: clean final hero frame (usable as cover).`,
    };
    case 'macro': return {
      scene: `[SCENE]: a fully defocused neutral background; only the product detail matters.`,
      subject: `[SUBJECT]: EXTREME CLOSE-UP / MACRO of a REAL detail of ${isCombo ? 'one of the garments' : 'the product'} — the fabric weave, a seam, the zipper, the cuff or the label (use ONLY details visible in the references). The full product and any person are NOT shown. That detail fills the frame with minimal depth of field.`,
      optica: 'a 100mm macro f/2.8, minimal and very selective depth of field',
      camera: `A macro RACK FOCUS gliding across the detail in a single pass, or a very slow macro PUSH-IN. ${CAMERA_TAIL_EN}`,
      light: 'soft raking light that reveals the material texture and relief, with delicate shadows',
      rhythm: `- 0-2s: the detail already sharp and recognizable.\n- 2-6s: a micro focus/push across the texture.\n- 6-8s: settles on the nicest detail (cover).`,
    };
    case 'flatlay': return {
      scene: `[SCENE]: a clean, tidy surface (wood, concrete or a work table), seen FROM ABOVE. No construction, no tools.`,
      subject: `[SUBJECT]: ${isCombo ? 'the garments of the set laid FLAT and neatly arranged, coordinated with air between them' : 'the garment laid FLAT on the surface'}, TOP-DOWN (90° overhead), tidy with breathing room. NO person.`,
      optica: 'a 35mm overhead, even framing without distortion',
      camera: `Overhead camera: a very slow vertical PUSH-IN toward the garment, or a very gentle lateral slide (parallax). ${CAMERA_TAIL_EN}`,
      light: 'even diffuse light from above with a soft contact shadow, neutral editorial tone',
      rhythm: `- 0-1.5s: the full garment already in frame, tidy.\n- 1.5-6s: slow push or slide.\n- 6-8s: stable final overhead frame (cover).`,
    };
    case 'percha': return {
      scene: `[SCENE]: the garment on a HANGER against a clean wall (concrete, wood or neutral). No construction, no tools.`,
      subject: `[SUBJECT]: ${isCombo ? 'the garments of the set on hangers against a clean wall, coordinated' : 'the garment on the hanger with its natural drape'}. The only motion is a VERY slight sway of the hanger, or the air barely moving the fabric. NO person.`,
      optica: 'a 50mm prime f/2.8, creamy bokeh',
      camera: `A vertical TILT-REVEAL: start low (the hem) and rise slowly to the collar/shoulder; or a slow frontal push-in. One continuous move. ${CAMERA_TAIL_EN}`,
      light: 'soft side window light with a long shadow on the wall, calm warm tone',
      rhythm: `- 0-1.5s: the garment already recognizable.\n- 1.5-6s: the tilt/push reveals the garment with the slight sway.\n- 6-8s: stable hero frame of the hanging garment (cover).`,
    };
    case 'secuencia': return {
      scene: sceneTop(videoSceneEN(name), 'A real, lived-in Argentine setting, not an artificial studio.'),
      subject: `[SUBJECT]: ${item} presented so the camera can reveal several of its facets in ONE continuous choreographed move — the "cuts" are smooth camera moves, never edits.${isCombo ? '' : ' It may rest on an invisible mannequin or a still model seen from behind.'} The product stays perfectly consistent throughout.`,
      optica: _rnd(['a 35mm on a gimbal, natural perspective', 'an anamorphic 40mm with subtle horizontal flares', 'a 50mm prime f/2, creamy bokeh']),
      camera: `A choreographed continuous "oner" (single take, filmmaker feel): begin on a close detail (rack focus in), then crane/tilt up to reveal the full product, then a slow push to a clean hero — one motivated move, no edit cuts. Shot variety happens WITHIN a single take. ${CAMERA_TAIL_EN}`,
      light: videoLightEN(),
      rhythm: `- 0-2s: open on a detail (already faithful), then reveal.\n- 2-6s: the continuous move travels across the product with life (fabric, dust, light).\n- 6-8s: lands on a clean hero (cover).`,
    };
    case 'ambiente': return {
      scene: sceneTop(videoSceneEN(name), 'A real, lived-in Argentine setting with believable wear.'),
      subject: `[SUBJECT]: ${item} is the hero in its environment, still and with presence — a BRAND b-roll shot, more atmosphere than sell. A person may appear ONLY in the background, defocused or out of frame, never in focus and never "working".`,
      optica: _rnd(['a 50mm prime f/2, creamy bokeh', 'an anamorphic 40mm with subtle flares']),
      camera: `A locked-off tripod shot with "breathing", or a very slow lateral TRACKING; the interest comes from light, airborne dust and texture. Zero action, zero hits. ${CAMERA_TAIL_EN}`,
      light: videoLightEN(),
      rhythm: `- 0-2s: product already in frame, recognizable.\n- 2-6s: atmospheric stillness (dust, light, fabric).\n- 6-8s: settles on a brand hero frame (cover).`,
    };
    case 'lookbook':
    default: return {
      scene: sceneTop(videoSceneEN(name), 'A real, lived-in Argentine setting, not an artificial studio.'),
      subject: `[SUBJECT & POSE] (stillness, not acting): a person wearing ${item}, standing, essentially STILL. The only motion is subtle and ambient: fabric settling or moving lightly with the air, a natural breath, the body's weight settling. FORBIDDEN: any dynamic physical action (walking, crouching, tying laces, big or repeated gestures) — that articulated motion is what breaks coherence and creates artifacts. The person NEVER works or uses tools: no hammering, no operating machines — they just present the garment like a photo shoot. When in doubt, choose stillness.`,
      optica: _rnd(['a 50mm prime f/2, creamy bokeh, natural compression', 'a 35mm on a gimbal with subtle organic micro-shake (controlled handheld)']),
      camera: `A slow, continuous RACK FOCUS or PUSH-IN toward the product (single pass, no jumps). The camera provides all the movement; the subject is still. ${CAMERA_TAIL_EN}`,
      light: videoLightEN(),
      rhythm: `- 0-1.5s: product already in frame, sharp and recognizable.\n- 1.5-6s: stillness with micro fabric/air movement.\n- 6-8s: clean, stable hero frame (cover).`,
    };
  }
}

/** Arma el prompt de video completo EN INGLÉS para un estilo. */
function buildVideoFramePromptEN({ ratio, duration = 8, pillar, anchor, isCombo, imageCount, style, name, theme, caption }) {
  const st = VIDEO_STYLES[style] || VIDEO_STYLES.lookbook;
  const sec = englishVideoSections(style, { name, theme, isCombo });
  const prompt = `A professional cinematographer shoots this take for BLACKS, an Argentine workwear and safety-footwear brand. Format ${ratio}, ~${duration}s, ONE SINGLE CONTINUOUS TAKE — no edit cuts, no spliced angles.

[TONE]: ${videoToneEN(pillar)}

[PRODUCT${isCombo ? 'S' : ''}] (use EXACTLY the one(s) in the attached reference images):
${anchor}

${videoFidelityEN(isCombo, imageCount)}

${sec.scene}

${sec.subject}
${st.person ? `\n${FACE_RULE_EN}\n` : ''}
[OPTICS & CAMERA] (one fluid move from start to finish):
- Optics: ${sec.optica}.
- Move: ${sec.camera}

[PACING] (~${duration}s within the same take):
${sec.rhythm}

[LIGHT & MOOD]: ${sec.light}. Kodak Portra 400 grade, sober tones with subtle burnt-orange accents.
${VIDEO_REALISM_EN}

${VIDEO_AUDIO_EN}

${VIDEO_AESTHETIC_EN}`;
  return caption ? `${prompt}\n\nPOST CONTEXT (for tone only, do NOT render any text): ${caption}` : prompt;
}

// Instrucciones (en español, para el usuario) — incluyen el flujo multi-clip i2v.
function videoHowToInstructions(ratio, { combo = false } = {}) {
  return [
    'RECOMENDADO — i2v (image-to-video): subí UNA de tus fotos como "Primer fotograma" (Frame 0 / Input Image). Es lo que MÁS fija el producto (cero deformación).',
    `CAMBIOS DE ESCENA reales usando TODAS tus fotos: generá un clip corto (i2v) por CADA foto y unilos en un editor (CapCut/Premiere/DaVinci). Un solo prompt NO recorre todas tus fotos como escenas — las usa de referencia. Así conseguís el "estilo filmmaker" con fidelidad perfecta.`,
    'El prompt está en INGLÉS a propósito: Veo/Runway/Kling obedecen mucho mejor en inglés.',
    `Elegí formato ${ratio} y ~8s por clip.`,
    combo ? 'Subí las fotos de TODOS los productos (frente, espalda, detalle) para máxima fidelidad.' : 'Subí varias fotos del producto (frente, espalda, detalle) para máxima fidelidad.',
    'Descargá el/los .mp4 y subilo con "Subir video".',
  ];
}

function buildVideoPrompt({ productName, productDescription, productImages = [], productImageUrl, theme, format = 'story', caption, pillar = 'producto', style = 'lookbook' } = {}) {
  const imgs = (productImages && productImages.length ? productImages : [productImageUrl]).filter(Boolean);
  const ratio = format === 'feed' ? '4:5' : '9:16 vertical';
  const anchor = productAnchorLines([{ name: productName || 'producto de trabajo', description: productDescription }]);
  const st = VIDEO_STYLES[style] || VIDEO_STYLES.lookbook;
  // El prompt que se pega en Veo va en INGLÉS (obedece mejor). Reglas de fidelidad,
  // continuidad y "usar TODAS las fotos" reforzadas.
  const prompt = buildVideoFramePromptEN({ ratio, duration: 8, pillar, anchor, isCombo: false, imageCount: imgs.length, style, name: productName, theme, caption });
  const platformNote = 'Para máxima fidelidad el flujo pro es Image-to-Video (i2v): subí una foto como primer fotograma. Para CAMBIOS DE ESCENA usando todas tus fotos: un clip por foto (i2v) y unilos en un editor — un solo prompt no recorre todas las fotos como escenas.';
  return {
    style,
    label: st.label,
    prompt,
    instructions: videoHowToInstructions(ratio, { combo: false }),
    productImages: imgs,
    productImageUrl: imgs[0] || null,
    platformNote,
  };
}

/** Todos los estilos de video de una (para el modal: poder variar sin recargar). */
function buildVideoPromptSet(ctx = {}) {
  const styles = VIDEO_STYLE_ORDER.map((id) => {
    const r = buildVideoPrompt({ ...ctx, style: id });
    return { id, label: r.label, desc: VIDEO_STYLES[id].desc, prompt: r.prompt };
  });
  const base = buildVideoPrompt(ctx);
  return { styles, instructions: base.instructions, productImages: base.productImages, productImageUrl: base.productImageUrl, platformNote: base.platformNote };
}

/**
 * "Corregir la historia": el usuario describe UNA corrección puntual sobre una pieza YA
 * generada; el cerebro devuelve el set corregido de los textos que se imprimen, cambiando
 * SÓLO lo pedido y dejando el resto idéntico. No toca la foto (la escena se reusa aparte).
 * current = { overlayTitle, storyPoints[], cta, badge, hasPrice }.
 */
async function parseCorrection({ instruction, current = {}, caption = '', pillar = '' }) {
  const points = Array.isArray(current.storyPoints) ? current.storyPoints : [];
  const system = 'Sos editor de una pieza de Instagram YA diseñada de BLACKS (indumentaria de trabajo argentina, voseo). El usuario pide UNA corrección puntual. Respondés SOLO JSON con el set corregido de textos, cambiando EXCLUSIVAMENTE lo que el usuario pide y dejando TODO lo demás EXACTAMENTE IGUAL. Nunca inventás datos ni precios.';
  const prompt = `TEXTOS ACTUALES DE LA PIEZA (los que se ven impresos sobre la imagen):
- titulo (overlay): ${JSON.stringify(current.overlayTitle || '')}
- puntos (chips): ${JSON.stringify(points)}
- boton (cta): ${JSON.stringify(current.cta || '')}
- badge/sello: ${JSON.stringify(current.badge || '')}
- ¿muestra precio?: ${current.hasPrice ? 'sí' : 'no'}${pillar ? `\n- pilar: ${pillar}` : ''}${caption ? `\n- caption (texto de IG, secundario): ${JSON.stringify(String(caption).slice(0, 200))}` : ''}

PEDIDO DEL USUARIO (la ÚNICA corrección a aplicar): "${String(instruction).slice(0, 400)}"

REGLAS:
- Devolvé cada campo con su valor FINAL. Los campos que el pedido NO menciona los devolvés IDÉNTICOS carácter por carácter (mismo texto, mismo orden, misma cantidad de puntos, mismos signos $ / paréntesis / mayúsculas). PROHIBIDO reformatear, acortar o "mejorar" un texto que el usuario no mencionó.
- Cambiá EXCLUSIVAMENTE lo que el pedido nombra. Si el pedido toca UN punto de la lista, los demás puntos vuelven exactamente igual.
- Voseo argentino, sin emojis, sin inventar datos ni precios.
- Si es corregir una palabra/ortografía, cambiala donde aparezca en esos textos.
- Si el pedido pide sacar/ocultar el precio, poné "hide_price": true (si no, false).
- "targets_photo": true SÓLO si el pedido es sobre la FOTO en sí (fondo, escena, color de la prenda, recorte) y no sobre un texto.
- "note": 1 frase corta en español diciendo qué corregiste.

Devolvé SOLO este JSON:
{"overlayTitle":"...","story_points":["..."],"cta":"...","badge":"...","hide_price":false,"targets_photo":false,"note":"..."}`;
  const schema = {
    type: 'object',
    properties: {
      overlayTitle: { type: 'string', nullable: true },
      story_points: { type: 'array', items: { type: 'string' } },
      cta: { type: 'string', nullable: true },
      badge: { type: 'string', nullable: true },
      hide_price: { type: 'boolean' },
      targets_photo: { type: 'boolean' },
      note: { type: 'string' },
    },
    required: ['note'],
  };
  const s = await generateJson({ system, prompt, schema, maxTokens: 700, temperature: 0.1 });
  if (!s || typeof s !== 'object') throw new Error('No pude interpretar la corrección. Probá reformulando el pedido.');
  return {
    overlayTitle: 'overlayTitle' in s ? (s.overlayTitle || null) : undefined,
    storyPoints: Array.isArray(s.story_points) ? s.story_points : undefined,
    cta: 'cta' in s ? (s.cta || null) : undefined,
    badge: 'badge' in s ? (s.badge || null) : undefined,
    hidePrice: s.hide_price === true,
    targetsPhoto: s.targets_photo === true,
    note: s.note ? String(s.note).slice(0, 160) : '',
  };
}

module.exports = {
  generateCopy,
  generateJson,
  parseCorrection,
  generateBackground,
  generateProductScene,
  planCarouselShots,
  planHeroShot,
  describeProductPhotos,
  generateStudioScene,
  buildStudioVideoPrompt,
  buildStudioVideoPromptSet,
  generateDiagram,
  analyzeStyle,
  buildVideoPrompt,
  buildVideoPromptSet,
  listVideoStyles,
  sanitizeText,
  hasGemini,
  currentImagePriceUsd,
  imageSpendTodayUsd,
  reviewRenderedPiece,
  lintCopy,
  VOICE_CORE,
};
