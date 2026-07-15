const pool = require('./db');
const config = require('./config');
const { generateJson } = require('./ai');

/**
 * DIRECTOR CREATIVO (el "cerebro" que piensa la pieza ANTES de generar nada).
 *
 * Por qué existe (bug real, jul-2026): una pieza mayorista "Uniformes con logo para
 * tu empresa" salió con la foto de un pantalón suelto elegido por matcheo de palabras
 * clave — un producto que la tienda ni siquiera vende. La selección de producto, foto
 * y plantilla se decidía con heurísticas ciegas ANTES de entender qué es la pieza.
 * Cada imagen generada cuesta dinero: no se genera nada "porque sí".
 *
 * FLUJO (se ejecuta una vez por pieza, para TODOS los pilares):
 *
 *   SLOT (pilar, ángulo, formato, objetivo, fecha)
 *      │
 *      ├─ 1. RECOLECCIÓN DE CONTEXTO — todo REAL, nada inventado
 *      │     ├─ candidatos de producto según pilar (sólo publicados en Tiendanube,
 *      │     │  sin repetir protagonistas recientes; con nombre/marca/categoría/
 *      │     │  precio/stock/ventas/cantidad de fotos/descripción)
 *      │     ├─ datos verificados de la empresa (company_facts, de la web oficial)
 *      │     ├─ condiciones mayoristas reales (wholesale_settings)
 *      │     ├─ temporada argentina + fecha comercial del día
 *      │     ├─ últimas piezas (anti-repetición)
 *      │     └─ plantillas visuales candidatas con su descripción
 *      │
 *      ├─ 2. ANÁLISIS EN PROFUNDIDAD — una llamada a la IA de texto (gratis)
 *      │     ├─ ¿Qué ES la pieza? producto / institucional / tema
 *      │     ├─ ¿Necesita foto de producto? ¿QUÉ candidato real coincide DE VERDAD
 *      │     │  con el mensaje? (si ninguno coincide → sin producto: una tarjeta
 *      │     │  institucional limpia rinde más que una prenda sin relación)
 *      │     ├─ ¿Qué tratamiento visual? foto de producto / tarjeta sin foto / ilustración
 *      │     ├─ ¿Qué plantilla comunica mejor ESTE mensaje?
 *      │     └─ ángulo de copy + nota de imagen (sólo con los datos provistos)
 *      │
 *      ├─ 3. VALIDACIÓN DURA EN CÓDIGO — la IA propone, el código verifica
 *      │     ├─ product_id tiene que existir en la lista de candidatos (si no → null)
 *      │     ├─ visual/focus coherentes (sin producto ⇒ sin foto de producto)
 *      │     └─ template contra el catálogo real (la validación final por
 *      │        requisitos de fotos la hace generate-daily)
 *      │
 *      └─ 4. EJECUCIÓN en generateForSlot
 *            ├─ producto exacto (refrescado en vivo) o ninguno
 *            ├─ copy guiado por el ángulo del director + datos verificados
 *            ├─ imagen sólo si el análisis la justifica
 *            └─ FALLBACK TOTAL a las heurísticas clásicas si el director falla
 *
 * Best-effort: si la IA no responde o devuelve algo inválido, planPiece devuelve null
 * y generate-daily sigue con la lógica de siempre. Nunca rompe la generación.
 */

const FOCUS_VALUES = ['producto', 'institucional', 'tema'];
const VISUAL_VALUES = ['foto_producto', 'tarjeta_sin_foto', 'ilustracion'];

/** Temporada del hemisferio sur en una línea (para que el director no proponga abrigo en enero). */
function seasonLine(date = new Date()) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return 'verano (calor: ropa fresca y liviana)';
  if (m <= 4) return 'otoño (refresca: media estación)';
  if (m <= 7) return 'invierno (frío: abrigo, térmica, polar)';
  return 'primavera (templado: media estación)';
}

const CANDIDATE_STOPWORDS = new Set(['para', 'como', 'sobre', 'este', 'esta', 'todo', 'toda', 'todos', 'todas',
  'con', 'sin', 'los', 'las', 'del', 'una', 'que', 'por', 'mas', 'tus', 'sus', 'empresa', 'empresas',
  'mayorista', 'mayoristas', 'condiciones', 'descuento', 'descuentos', 'presupuesto', 'trabajo', 'blacks']);

/** Filtro SQL de disponibilidad por pilar (qué productos PUEDEN aparecer en la pieza). */
function pillarPoolSQL(pillar) {
  const { eligibleSQL } = require('./productScore');
  if (pillar === 'mayorista') {
    return `published IS NOT FALSE AND image_url IS NOT NULL AND (stock IS NULL OR price IS NULL OR price <= 0)`;
  }
  if (['producto', 'promo'].includes(pillar)) return eligibleSQL();
  // Pilares sin venta directa: el producto sería sólo ancla visual — retail con foto.
  return `published IS NOT FALSE AND image_url IS NOT NULL AND stock > 0 AND price > 0`;
}

/**
 * Candidatos REALES de producto para el slot, en DOS pasadas (embudo híbrido):
 *  1º los que MATCHEAN el tema del día (palabras del título/ángulo contra nombre y
 *     categoría, sin acentos) — si el brief pide "camisas oxford" y esa camisa está
 *     en el puesto #40 de ventas, igual entra al prompt del director;
 *  2º se completa con los top por ventas/fotos del pool del pilar (variedad).
 * Sólo publicados, sin protagonistas recientes, sin raw (filas livianas).
 * NOTA: los keywords NO se buscan en description a propósito — la descripción
 * menciona de todo y hacía elegir productos sin relación (bug ya conocido).
 */
async function gatherCandidates(slot, excludeIds = []) {
  const exc = excludeIds.length ? excludeIds : [0];
  const fields = `id, name, brand, category, price, promo_price, stock, sales_30d,
    COALESCE(jsonb_array_length(images), CASE WHEN image_url IS NULL THEN 0 ELSE 1 END) AS photos,
    LEFT(COALESCE(description, ''), 140) AS descr`;
  const poolSQL = pillarPoolSQL(slot.pillar);
  const norm = (col) => `translate(lower(${col}), 'áéíóúñü', 'aeiounu')`;

  // 1) Relevantes al tema del día (título + ángulo del plan).
  const rawText = `${slot.theme_title || ''} ${slot.pillar_detail || ''}`;
  const keywords = String(rawText).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !CANDIDATE_STOPWORDS.has(w))
    .slice(0, 8)
    .map((w) => `%${w}%`);

  let topical = [];
  if (keywords.length) {
    const { rows } = await pool.query(
      `SELECT ${fields} FROM products_cache
       WHERE ${poolSQL} AND NOT (id = ANY($1))
         AND (${norm('name')} LIKE ANY($2) OR ${norm(`COALESCE(category, '')`)} LIKE ANY($2))
       ORDER BY sales_30d DESC NULLS LAST, COALESCE(jsonb_array_length(images), 1) DESC
       LIMIT 12`,
      [exc, keywords]
    );
    topical = rows;
  }

  // 2) Completar con los top del pool (sin repetir los ya encontrados).
  const excAll = [...exc, ...topical.map((r) => Number(r.id))];
  const order = slot.pillar === 'mayorista'
    ? `COALESCE(jsonb_array_length(images), 1) DESC, sales_30d DESC NULLS LAST` // B2B: los más fotografiados lucen
    : `sales_30d DESC NULLS LAST, stock DESC NULLS LAST`;
  const { rows: top } = await pool.query(
    `SELECT ${fields} FROM products_cache
     WHERE ${poolSQL} AND NOT (id = ANY($1))
     ORDER BY ${order}
     LIMIT $2`,
    [excAll, Math.max(8, 28 - topical.length)]
  );

  // Los relevantes al tema van PRIMERO (el director los ve arriba de la lista).
  return [...topical, ...top];
}

function candidateLine(p) {
  const price = p.price && Number(p.price) > 0
    ? `$${Number(p.price).toLocaleString('es-AR')}${p.promo_price ? ` (oferta $${Number(p.promo_price).toLocaleString('es-AR')})` : ''}`
    : 'consultar (mayorista)';
  const stock = p.stock === null ? 'a pedido' : `${p.stock} u.`;
  return `- id ${p.id}: "${p.name}"${p.brand ? ` · marca ${p.brand}` : ''}${p.category ? ` · categoría ${p.category}` : ''} · ${price} · stock ${stock} · ${p.sales_30d || 0} ventas/30d · ${p.photos} foto(s)${p.descr ? ` · "${p.descr}"` : ''}`;
}

function buildDirectorPrompt({ slot, candidates, wholesale, companyFacts, recentPieces, templateOptions, occasion, lessons }) {
  const candidatesTxt = candidates.length
    ? candidates.map(candidateLine).join('\n')
    : '(no hay candidatos de producto disponibles para este pilar)';
  const templatesTxt = (templateOptions || []).length
    ? templateOptions.map((t) => `- ${t.name}: ${t.desc}`).join('\n')
    : '(la plantilla la decide el sistema)';
  const recentTxt = (recentPieces || []).length
    ? `\nÚLTIMAS PIEZAS DE LA CUENTA (no repitas enfoque ni protagonista):\n${recentPieces.slice(0, 8).map((r) => `- ${r}`).join('\n')}`
    : '';

  return `Analizá EN PROFUNDIDAD esta pieza de Instagram de BLACKS Indumentaria (ropa de trabajo y calzado de seguridad, Argentina) y decidí el plan creativo ANTES de que se genere nada. Cada imagen cuesta dinero: nada se genera "porque sí".

LA PIEZA:
- Pilar: ${slot.pillar} · Formato: ${slot.post_type}/${slot.format || 'feed'} · Objetivo: ${slot.objective || 'según pilar'}
- Ángulo del plan: "${slot.pillar_detail || '(sin detalle)'}"
- Título del día: "${slot.theme_title || '(sin título)'}"
- Temporada: ${seasonLine()}${occasion ? `\n- Fecha comercial del día: ${occasion}` : ''}
${wholesale ? `\nCONDICIONES MAYORISTAS REALES: ${wholesale}` : ''}${companyFacts ? `\n${companyFacts}` : ''}

CANDIDATOS DE PRODUCTO (los ÚNICOS productos que existen para esta pieza — publicados y con stock/condición correcta; cualquier otro producto NO EXISTE):
${candidatesTxt}

PLANTILLAS VISUALES DISPONIBLES:
${templatesTxt}
${recentTxt}${lessons || ''}

CÓMO DECIDIR (pensá en este orden):
1. ¿Qué ES la pieza? "focus":
   - "producto": el mensaje ES un producto/tipo de prenda concreto (mostrarlo y venderlo/destacarlo).
   - "institucional": el mensaje es la EMPRESA o su servicio — condiciones mayoristas, personalización, descuentos, envíos, quiénes somos, beneficios. Acá una tarjeta institucional limpia (sin producto) comunica MEJOR que una prenda suelta sin relación.
   - "tema": el mensaje es un consejo/tema/conversación (educativo, engagement, clima) — el producto, si va, es sólo ilustración coherente.
2. ¿Va producto? "product_id":
   - SOLO un id de la lista de candidatos. Elegilo únicamente si su NOMBRE o CATEGORÍA coincide DE VERDAD con el mensaje de la pieza. Error real a evitar: pieza "uniformes con logo para tu empresa" con la foto de un pantalón suelto — eso queda mal y desprestigia la marca.
   - Si el mensaje nombra un tipo de prenda ("uniformes" → chombas/camisas/mamelucos/conjuntos de trabajo; "calzado" → botines/zapatos), buscá un candidato de ESE tipo. Si NINGÚN candidato coincide bien: product_id null. SIN producto queda mejor que con el producto equivocado.
   - Entre candidatos igual de coherentes: priorizá más ventas y 2+ fotos.
   - Piezas institucionales generales (condiciones/beneficios/quiénes somos): normalmente product_id null.
3. Tratamiento visual "visual":
   - "foto_producto": hay producto elegido y merece protagonismo visual.
   - "tarjeta_sin_foto": pieza institucional/de texto — la plantilla tipográfica limpia de la marca.
   - "ilustracion": pieza educativa que se explica mejor con un dibujo didáctico que con una foto.
4. "template": la plantilla de la lista que MEJOR comunica este mensaje (respetá su descripción; una plantilla que requiere varias fotos no sirve para un candidato con 1 foto).
5. "copy_angle": el ángulo concreto para el copy en 1-2 frases — SOLO con los datos dados arriba (condiciones reales, datos verificados, producto elegido). PROHIBIDO inventar datos, cifras o características. Español argentino directo y profesional, sin frases de marketing de IA ("descubrí", "eleva tu", "no te lo pierdas").
   - TEMA SIN MATERIAL: si el ángulo del plan pide datos que NO figuran en el contexto (ej. "nuestra historia", trayectoria, hitos, cifras de la empresa), NO armes una pieza genérica de relleno — PIVOTEÁ el ángulo a algo CONCRETO del material disponible: qué hace la empresa (los datos verificados de arriba), condiciones reales, tipos de producto reales, o una pregunta específica a la audiencia. Una pieza que no dice nada específico no genera nada en la audiencia.
   - El copy_angle tiene que contener al menos UN elemento específico (un dato real, una condición, un tipo de producto, una pregunta concreta). PROHIBIDO el relleno corporativo: "la calidad es nuestra prioridad", "tu socio en seguridad", "te acompañamos", "comprometidos con la excelencia".
6. "image_note": 1 frase de dirección visual (escena/clima/qué transmitir), sin texto en imagen, sin datos inventados. null si visual es tarjeta_sin_foto.

Devolvé SOLO este JSON:
{"focus":"producto|institucional|tema","product_id":123,"product_reason":"por qué ese (o por qué ninguno)","visual":"foto_producto|tarjeta_sin_foto|ilustracion","template":"...","copy_angle":"...","image_note":"..."}`;
}

/**
 * Analiza el slot y devuelve el plan creativo validado, o null si el director no
 * está disponible / devolvió algo inservible (el llamador cae a las heurísticas).
 */
async function planPiece({ slot, wholesale = null, companyFacts = null, recentPieces = [], templateOptions = [], occasion = null, excludeIds = [] } = {}) {
  const candidates = await gatherCandidates(slot, excludeIds);
  const byId = new Map(candidates.map((c) => [Number(c.id), c]));

  // MEMORIA DE ERRORES: los fallos ya cometidos (y marcados por el dueño o el QA)
  // entran al análisis del director para que su plan no los repita. Best-effort.
  let lessons = '';
  try { lessons = await require('./learning').lessonsContext({ pillar: slot.pillar, audience: 'director' }); } catch (_) {}

  const result = await generateJson({
    system: 'Sos el DIRECTOR CREATIVO de una marca argentina de indumentaria de trabajo. Analizás cada pieza en profundidad antes de producirla: qué comunica, si lleva producto (y CUÁL exactamente), qué tratamiento visual y qué plantilla. Sos estricto: nunca forzás un producto que no coincide con el mensaje y nunca inventás datos. Respondés SOLO con JSON válido.',
    prompt: buildDirectorPrompt({ slot, candidates, wholesale, companyFacts, recentPieces, templateOptions, occasion, lessons }),
    maxTokens: 700,
    temperature: 0.3,
    schema: {
      type: 'object',
      properties: {
        focus: { type: 'string', enum: FOCUS_VALUES },
        product_id: { type: 'integer', nullable: true },
        product_reason: { type: 'string' },
        visual: { type: 'string', enum: VISUAL_VALUES },
        template: { type: 'string', nullable: true },
        copy_angle: { type: 'string' },
        image_note: { type: 'string', nullable: true },
      },
      required: ['focus', 'visual', 'copy_angle'],
    },
  });

  if (!result || typeof result !== 'object') return null;

  // --- Validación dura: la IA propone, el código verifica. ---
  const focus = FOCUS_VALUES.includes(result.focus) ? result.focus : 'tema';
  const visual = VISUAL_VALUES.includes(result.visual) ? result.visual : 'tarjeta_sin_foto';

  // El producto tiene que EXISTIR en la lista de candidatos reales (anti-alucinación).
  let product = null;
  const pid = Number(result.product_id);
  if (Number.isInteger(pid) && byId.has(pid)) product = byId.get(pid);

  // Coherencia: si el tratamiento es foto de producto pero no hay producto válido,
  // degradamos a tarjeta (nunca al revés: no forzamos una foto que el director no pidió).
  const finalVisual = visual === 'foto_producto' && !product ? 'tarjeta_sin_foto' : visual;

  // Plantilla: además de existir entre las opciones, tiene que SOSTENERSE con el
  // producto elegido (fotos reales suficientes, descripción si pide specs, formato).
  // Antes esta coherencia dependía sólo del prompt y una elección incoherente recién
  // se corregía silenciosamente al renderizar — plan y diseño podían divergir.
  const templateName = result.template ? String(result.template).trim().toLowerCase() : null;
  let validTemplate = (templateOptions || []).some((t) => t.name === templateName) ? templateName : null;
  if (validTemplate) {
    const { TEMPLATE_REQUIREMENTS } = require('./imageRenderer');
    const req = TEMPLATE_REQUIREMENTS[validTemplate];
    // Si la pieza no muestra foto de producto (tarjeta/ilustración), cuenta como 0 fotos.
    const photos = finalVisual === 'foto_producto' && product ? Number(product.photos) || 0 : 0;
    if (req) {
      if (req.minImages && photos < req.minImages) validTemplate = null;
      if (validTemplate && req.needsDescription && !(product && product.descr)) validTemplate = null;
      if (validTemplate && req.storyOnly && slot.format !== 'story') validTemplate = null;
    }
    if (!validTemplate) {
      console.log(`[creativeDirector] Plantilla '${templateName}' descartada: el producto elegido no la sostiene (fotos/descripción/formato). Rota la del pool.`);
    }
  }

  return {
    focus,
    product, // fila liviana de products_cache (sin raw) o null
    visual: finalVisual,
    template: validTemplate,
    copyAngle: result.copy_angle ? String(result.copy_angle).slice(0, 400) : null,
    imageNote: result.image_note && finalVisual !== 'tarjeta_sin_foto' ? String(result.image_note).slice(0, 250) : null,
    reason: result.product_reason ? String(result.product_reason).slice(0, 300) : null,
    candidatesCount: candidates.length,
  };
}

/* =========================================================================
 * AUDITORÍA FACTUAL POST-COPY (fase QA del director)
 * El lint determinístico (lintCopy) atrapa frases de IA y cifras de trayectoria,
 * pero NO puede saber si "suela de kevlar" o "10% por transferencia" es cierto
 * para ESTE producto/empresa. Acá un auditor IA compara cada afirmación concreta
 * del copy contra los datos reales y corrige lo inventado. Best-effort: si el
 * auditor falla, la pieza sigue (ya pasó el lint y la regla anti-invención).
 * ========================================================================= */

async function reviewCopyFacts({ copy, product, wholesale = null, companyFacts = null } = {}) {
  const texts = [copy && copy.caption, copy && copy.overlay, ...((copy && copy.story_points) || [])].filter(Boolean);
  if (!texts.length) return { ok: true };
  // Sin NINGUNA fuente contra la que verificar no hay auditoría posible.
  if (!product && !wholesale && !companyFacts) return { ok: true };

  const productBlock = product
    ? `PRODUCTO REAL: "${product.name}"${product.brand ? ` (marca ${product.brand})` : ''}${product.price ? ` · precio $${Number(product.price).toLocaleString('es-AR')}` : ' · precio: consultar'}${product.promo_price ? ` · oferta $${Number(product.promo_price).toLocaleString('es-AR')}` : ''}
DESCRIPCIÓN REAL (única fuente válida de características): "${String(product.description || '(sin descripción)').slice(0, 600)}"`
    : 'SIN PRODUCTO (pieza institucional/tema).';

  const prompt = `Sos AUDITOR FACTUAL de una marca. Compará el texto de esta pieza contra los ÚNICOS datos verdaderos disponibles y detectá afirmaciones concretas INVENTADAS (materiales, características técnicas, precios, cuotas, descuentos, plazos, certificaciones, montos) que NO estén respaldadas.

${productBlock}
${wholesale ? `CONDICIONES MAYORISTAS REALES: ${wholesale}` : ''}
${companyFacts || ''}

TEXTOS DE LA PIEZA:
1. caption: "${copy.caption || ''}"
2. overlay: "${copy.overlay || ''}"
${(copy.story_points || []).map((p, i) => `${3 + i}. punto: "${p}"`).join('\n')}

REGLAS:
- Una afirmación es INVENTADA sólo si es un dato CONCRETO y no figura en los datos de arriba. Frases generales de beneficio ("resistente", "cómodo", "rinde") NO son datos concretos: dejalas.
- Si detectás algo inventado en caption/overlay, reescribí SOLO ese texto quitando la afirmación (mismo tono, voseo argentino, mismo largo aproximado).
- Si corregís "story_points": devolvé la MISMA CANTIDAD de puntos, reemplazando CADA punto inventado por un dato REAL tomado de los datos de arriba (una condición, un beneficio verificado, un rubro concreto). PROHIBIDO devolver menos puntos o puntos genéricos tipo "calidad en nuestros productos" — cada punto tiene que ser específico y verificable.
- Las correcciones SIEMPRE salen del contexto dado: nunca agregues datos de tu conocimiento general.
- Si todo está respaldado: {"passed": true}.

Devolvé SOLO este JSON:
{"passed": false, "issues": ["qué estaba inventado"], "caption": "corregido o null", "overlay": "corregido o null", "story_points": ["corregidos"] o null}`;

  try {
    const result = await generateJson({
      system: 'Auditor factual de marketing. Estricto con los datos, conservador con el estilo. Respondés SOLO JSON válido.',
      prompt,
      maxTokens: 700,
      temperature: 0.1,
    });
    if (!result || result.passed === true) return { ok: true };

    const fixed = {};
    if (result.caption && String(result.caption).trim() && result.caption !== 'null') fixed.caption = String(result.caption).trim();
    if (result.overlay && String(result.overlay).trim() && result.overlay !== 'null') fixed.overlay = String(result.overlay).trim();
    if (Array.isArray(result.story_points) && result.story_points.length) {
      fixed.story_points = result.story_points.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3);
    }
    const issues = Array.isArray(result.issues) ? result.issues.map((i) => String(i).slice(0, 120)) : [];
    if (!Object.keys(fixed).length) return { ok: true };
    return { ok: false, fixed, issues };
  } catch (err) {
    console.warn(`[creativeDirector] Auditoría factual no disponible (sigo): ${err.message}`);
    return { ok: true };
  }
}

module.exports = { planPiece, gatherCandidates, reviewCopyFacts };
