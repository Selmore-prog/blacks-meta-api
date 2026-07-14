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

/**
 * Candidatos REALES de producto para el slot, según el pilar. Sólo publicados,
 * sin protagonistas recientes. Devuelve filas livianas (sin raw) para el prompt.
 */
async function gatherCandidates(slot, excludeIds = []) {
  const { eligibleSQL } = require('./productScore');
  const exc = excludeIds.length ? excludeIds : [0];
  const fields = `id, name, brand, category, price, promo_price, stock, sales_30d,
    COALESCE(jsonb_array_length(images), CASE WHEN image_url IS NULL THEN 0 ELSE 1 END) AS photos,
    LEFT(COALESCE(description, ''), 140) AS descr`;

  if (slot.pillar === 'mayorista') {
    // Pool mayorista: stock infinito (null) o "Consultar precio". Los más fotografiados
    // primero (una pieza B2B con 1 foto mala no luce).
    const { rows } = await pool.query(
      `SELECT ${fields} FROM products_cache
       WHERE published IS NOT FALSE AND image_url IS NOT NULL
         AND (stock IS NULL OR price IS NULL OR price <= 0)
         AND NOT (id = ANY($1))
       ORDER BY COALESCE(jsonb_array_length(images), 1) DESC, sales_30d DESC NULLS LAST
       LIMIT 30`,
      [exc]
    );
    return rows;
  }

  if (['producto', 'promo'].includes(slot.pillar)) {
    // Retail publicable: precio y stock reales + curva de talles sana.
    const { rows } = await pool.query(
      `SELECT ${fields} FROM products_cache
       WHERE ${eligibleSQL()} AND NOT (id = ANY($1))
       ORDER BY sales_30d DESC NULLS LAST, stock DESC
       LIMIT 25`,
      [exc]
    );
    return rows;
  }

  // Pilares sin venta directa (educativo/marca/ugc/engagement): el producto sería
  // sólo ancla visual — candidatos retail con foto, por ventas.
  const { rows } = await pool.query(
    `SELECT ${fields} FROM products_cache
     WHERE published IS NOT FALSE AND image_url IS NOT NULL AND stock > 0 AND price > 0
       AND NOT (id = ANY($1))
     ORDER BY sales_30d DESC NULLS LAST
     LIMIT 25`,
    [exc]
  );
  return rows;
}

function candidateLine(p) {
  const price = p.price && Number(p.price) > 0
    ? `$${Number(p.price).toLocaleString('es-AR')}${p.promo_price ? ` (oferta $${Number(p.promo_price).toLocaleString('es-AR')})` : ''}`
    : 'consultar (mayorista)';
  const stock = p.stock === null ? 'a pedido' : `${p.stock} u.`;
  return `- id ${p.id}: "${p.name}"${p.brand ? ` · marca ${p.brand}` : ''}${p.category ? ` · categoría ${p.category}` : ''} · ${price} · stock ${stock} · ${p.sales_30d || 0} ventas/30d · ${p.photos} foto(s)${p.descr ? ` · "${p.descr}"` : ''}`;
}

function buildDirectorPrompt({ slot, candidates, wholesale, companyFacts, recentPieces, templateOptions, occasion }) {
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
${recentTxt}

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

  const result = await generateJson({
    system: 'Sos el DIRECTOR CREATIVO de una marca argentina de indumentaria de trabajo. Analizás cada pieza en profundidad antes de producirla: qué comunica, si lleva producto (y CUÁL exactamente), qué tratamiento visual y qué plantilla. Sos estricto: nunca forzás un producto que no coincide con el mensaje y nunca inventás datos. Respondés SOLO con JSON válido.',
    prompt: buildDirectorPrompt({ slot, candidates, wholesale, companyFacts, recentPieces, templateOptions, occasion }),
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

  const templateName = result.template ? String(result.template).trim().toLowerCase() : null;
  const validTemplate = (templateOptions || []).some((t) => t.name === templateName) ? templateName : null;

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

module.exports = { planPiece, gatherCandidates };
