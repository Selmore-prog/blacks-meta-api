const pool = require('./db');
const config = require('./config');
const { generateJson } = require('./ai');

/**
 * DATOS VERIFICADOS DE LA EMPRESA.
 *
 * Baja las páginas institucionales de la web oficial (quiénes somos, políticas,
 * devoluciones, FAQ, beneficios), les saca el texto y le pide a la IA que EXTRAIGA
 * —sin inventar— los hechos concretos (envío gratis desde $X, cuotas, mínimos
 * mayoristas, plazos de cambio, etc.). El resultado se cachea en company_facts y
 * entra a TODOS los prompts de copy como "DATOS VERIFICADOS DE LA EMPRESA".
 *
 * Por qué existe: el pilar 'marca' (y otros) no tenían ninguna fuente de verdad y la
 * IA inventaba datos que suenan creíbles ("Desde 1993", "miles de clientes"). Ahora,
 * o el dato está acá (y es cierto, sale de la web), o no se menciona. Se refresca solo
 * por cron semanal y a mano desde el panel, así se mantiene al día si cambia la web.
 */

// Páginas institucionales a leer. Si agregás/quitás una, tocá sólo esta lista.
const COMPANY_URLS = [
  'https://blacksindumentaria.com.ar/quienes-somos/',
  'https://blacksindumentaria.com.ar/politicas-y-funcionamiento/',
  'https://blacksindumentaria.com.ar/beneficios-cliente/',
  'https://blacksindumentaria.com.ar/politica-de-devolucion/',
  'https://blacksindumentaria.com.ar/preguntas-frecuentes/',
];

const MAX_CHARS_PER_PAGE = 8000; // recorte por página para acotar el prompt de síntesis
// (Tiendanube repite ~1.5k de menú/carrito arriba de cada página; el margen lo compensa.)

/** Decodifica las pocas entidades HTML que aparecen en texto plano. */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/gi, 'Á').replace(/&Eacute;/gi, 'É').replace(/&Iacute;/gi, 'Í')
    .replace(/&Oacute;/gi, 'Ó').replace(/&Uacute;/gi, 'Ú').replace(/&Ntilde;/gi, 'Ñ')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * Baja una URL y devuelve su texto plano visible (best-effort). Saca script/style/head,
 * convierte los tags en espacios y colapsa el espacio en blanco. Timeout corto para no
 * colgar la corrida si una página tarda.
 */
async function fetchPageText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': config.tiendanube.userAgent, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
    return text.slice(0, MAX_CHARS_PER_PAGE);
  } finally {
    clearTimeout(timer);
  }
}

function buildSynthPrompt(pages) {
  const blocks = pages
    .map((p) => `### PÁGINA: ${p.url}\n${p.text || '(no se pudo leer)'}`)
    .join('\n\n');

  return `Sos un asistente que EXTRAE datos institucionales de una empresa a partir del texto REAL de su sitio web. La empresa es BLACKS Indumentaria (marca argentina de ropa de trabajo, calzado de seguridad, EPP y personalización textil; venta minorista y mayorista).

Abajo está el texto plano de las páginas institucionales del sitio. Tu tarea es sacar SÓLO los hechos concretos y verificables que están LITERALMENTE en ese texto.

REGLAS ESTRICTAS (críticas):
- PROHIBIDO inventar, inferir o completar. Si un dato NO aparece textualmente en las páginas, NO lo incluyas en "facts".
- Nada de suposiciones "razonables": si no está escrito, no existe para vos.
- Cada "fact" tiene que ser una frase corta, concreta y auto-contenida, en español argentino, con el dato tal cual (montos, plazos, cantidades, porcentajes). Ej: "Envío gratis a todo el país en compras desde $55.000", "Hasta 6 cuotas sin interés", "Mínimo mayorista: 10 pares de calzado y/o 10 unidades de indumentaria".
- Incluí sólo datos ÚTILES para redactar posteos: qué venden, a quién, medios de pago, cuotas, envíos y su costo/umbral, plazos y condiciones de cambio/devolución, mínimos y beneficios mayoristas, personalización, canales de contacto, ubicación, marcas que trabajan, valores/misión si son concretos.
- En "no_data" listá los datos TÍPICOS de marca que la gente esperaría pero que NO aparecen en el texto (por ejemplo: "año de fundación", "años de trayectoria", "cantidad de clientes", "cantidad de sucursales"). Esto sirve para que NUNCA se inventen.
- IGNORÁ el ruido de la web que no es un hecho de la empresa: menú de categorías, textos del carrito, y sobre todo el AÑO DE COPYRIGHT del pie de página (ej. "© 2026") — ese año NO es dato de la empresa y NO va ni en "facts" ni como año de fundación.
- Máximo 20 items en "facts". Sin duplicados. Sin texto de relleno.

Devolvé SOLO este JSON:
{"facts": ["...", "..."], "no_data": ["año de fundación", "..."]}

TEXTO DE LAS PÁGINAS:
${blocks}`;
}

/**
 * Refresca los datos verificados: baja las páginas, sintetiza con IA y guarda en
 * company_facts. Devuelve un resumen. Si NINGUNA página se pudo leer, no toca nada
 * (deja el último cache) y lanza para que se vea el error.
 */
async function syncCompanyInfo() {
  console.log('[companyInfo] Leyendo páginas institucionales del sitio...');
  const pages = [];
  for (const url of COMPANY_URLS) {
    try {
      const text = await fetchPageText(url);
      pages.push({ url, text, chars: text.length, fetched_at: new Date().toISOString() });
      console.log(`[companyInfo] ${url} -> ${text.length} caracteres`);
    } catch (err) {
      pages.push({ url, text: '', chars: 0, error: err.message, fetched_at: new Date().toISOString() });
      console.warn(`[companyInfo] No pude leer ${url}: ${err.message}`);
    }
  }

  const readable = pages.filter((p) => p.text && p.text.length > 50);
  if (!readable.length) {
    throw new Error('No se pudo leer ninguna página del sitio (revisá conexión/URLs). No se actualizó nada.');
  }

  const result = await generateJson({
    system: 'Extraés datos institucionales verificables de un sitio web. Respondés SOLO con JSON válido y NUNCA inventás datos que no estén en el texto.',
    prompt: buildSynthPrompt(readable),
    maxTokens: 2000,
    temperature: 0.1,
    schema: {
      type: 'object',
      properties: {
        facts: { type: 'array', items: { type: 'string' } },
        no_data: { type: 'array', items: { type: 'string' } },
      },
      required: ['facts'],
    },
  });

  const facts = Array.isArray(result && result.facts)
    ? result.facts.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const noData = Array.isArray(result && result.no_data)
    ? result.no_data.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  if (!facts.length) {
    throw new Error('La IA no devolvió ningún dato verificable. No se actualizó (queda el cache anterior).');
  }

  const factsSummary = facts.map((f) => `- ${f}`).join('\n');

  await pool.query(
    `INSERT INTO company_facts (id, facts_summary, no_data, sources, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       facts_summary = EXCLUDED.facts_summary, no_data = EXCLUDED.no_data,
       sources = EXCLUDED.sources, updated_at = now()`,
    [factsSummary, JSON.stringify(noData), JSON.stringify(pages)]
  );

  console.log(`[companyInfo] Guardados ${facts.length} dato(s) verificado(s); ${readable.length}/${COMPANY_URLS.length} página(s) leídas.`);
  return {
    facts_count: facts.length,
    pages_read: readable.length,
    pages_total: COMPANY_URLS.length,
    no_data: noData,
    facts_summary: factsSummary,
  };
}

/** Devuelve la fila única de datos verificados (o un objeto vacío si aún no se sincronizó). */
async function getCompanyFacts() {
  const { rows } = await pool.query(`SELECT * FROM company_facts WHERE id = 1`);
  return rows[0] || { id: 1, facts_summary: null, no_data: null, sources: null, updated_at: null };
}

/**
 * Bloque listo para inyectar en el prompt de copy. Datos VERIFICADOS (se pueden citar
 * tal cual) + la lista explícita de lo que NO se sabe (para que no se invente).
 */
function companyFactsContext(cf) {
  if (!cf || !cf.facts_summary) return '';
  let noData = cf.no_data;
  if (typeof noData === 'string') { try { noData = JSON.parse(noData); } catch (_) { noData = null; } }
  const noDataLine = Array.isArray(noData) && noData.length
    ? `\nDATOS QUE NO TENEMOS (NUNCA los inventes ni les pongas un número): ${noData.join(', ')}.`
    : '';
  return `DATOS VERIFICADOS DE LA EMPRESA (de la web oficial ${config.brand.site} — son ciertos, podés citarlos TAL CUAL cuando sumen; lo que no esté acá, no lo afirmes):\n${cf.facts_summary}${noDataLine}`;
}

module.exports = { syncCompanyInfo, getCompanyFacts, companyFactsContext, fetchPageText, COMPANY_URLS };
