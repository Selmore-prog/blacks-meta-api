/* =========================================================================
 * TEXTOS E INDICACIONES VISUALES PARA LOS BLOQUES DEL HOME
 *
 * Escribe el contenido de un bloque con IA, pero ATADO A DATOS REALES: las
 * categorías y las URLs salen de la API de Tiendanube, los productos del
 * catálogo sincronizado, y la temporada del calendario. El modelo redacta; no
 * decide qué es verdad.
 *
 * TRES REGLAS QUE SE HACEN CUMPLIR POR CÓDIGO, no por prompt
 *   1. Los botones sólo pueden apuntar a URLs que EXISTEN. Cualquier link que
 *      el modelo invente se reemplaza por la categoría real más parecida, o se
 *      borra. Un botón lindo a un 404 es peor que no tener botón.
 *   2. Nada de cifras inventadas. Si el prompt no trae el número, el texto no
 *      puede decirlo: se filtran los porcentajes y precios que no vinieron en
 *      los datos.
 *   3. Los textos entran en los límites de cada campo (el catálogo de bloques
 *      declara el máximo), así no se corta la frase en la tarjeta.
 *
 * Además de los textos devuelve la INDICACIÓN VISUAL de cada foto o video:
 * qué mostrar, en qué formato y qué evitar. Es lo que después se saca con el
 * celular o se busca en el banco de fotos.
 * ========================================================================= */

const { generateJson, hasGemini } = require('./ai');
const { BLOCK_TYPES } = require('./homeBlocks');
const { urlsPermitidas } = require('./storeCategories');
const { getBrandProfile } = require('./brandProfile');
const { getCompanyFacts } = require('./companyInfo');
const pool = require('./db');

/* -------------------------------------------------------------------------
 * ESQUEMA
 * Se deriva del MISMO catálogo de campos que usa el panel, así un campo nuevo
 * en homeBlocks.js queda cubierto solo. Se piden únicamente los campos que un
 * texto puede llenar: las fotos, los interruptores y los productos los elige
 * una persona.
 * ----------------------------------------------------------------------- */
const CAMPOS_DE_TEXTO = ['texto', 'textarea', 'url', 'opciones'];

function esquemaCampo(campo) {
  if (campo.type === 'opciones') {
    return { type: 'string', enum: (campo.options || []).map((o) => o.value), description: campo.label };
  }
  return { type: 'string', description: `${campo.label}${campo.max ? ` (máximo ${campo.max} caracteres)` : ''}` };
}

function esquemaDe(tipo) {
  const t = BLOCK_TYPES[tipo];
  if (!t) throw Object.assign(new Error(`Tipo de bloque desconocido: ${tipo}`), { status: 400 });

  const props = {};
  const orden = [];
  t.fields.forEach((c) => {
    if (c.type === 'lista') {
      const sub = {};
      const subOrden = [];
      (c.item || []).forEach((x) => {
        if (!CAMPOS_DE_TEXTO.includes(x.type)) return;
        sub[x.key] = esquemaCampo(x);
        subOrden.push(x.key);
      });
      if (!subOrden.length) return;
      props[c.key] = {
        type: 'array',
        description: `${c.label} (entre ${c.min || 1} y ${c.max || 6})`,
        items: { type: 'object', properties: sub, propertyOrdering: subOrden, required: subOrden },
      };
      orden.push(c.key);
      return;
    }
    if (!CAMPOS_DE_TEXTO.includes(c.type)) return;
    props[c.key] = esquemaCampo(c);
    orden.push(c.key);
  });

  // La indicación de foto/video de cada hueco de imagen que tenga el tipo.
  const huecos = t.fields.filter((c) => c.type === 'imagen' || c.type === 'video').map((c) => c.key);
  const huecosLista = (t.fields.find((c) => c.type === 'lista')?.item || [])
    .filter((c) => c.type === 'imagen').map((c) => c.key);

  props.visuales = {
    type: 'array',
    description: 'Una indicación por cada foto o video que hay que conseguir.',
    items: {
      type: 'object',
      properties: {
        campo: { type: 'string', description: `Cuál de estos huecos: ${[...huecos, ...huecosLista].join(', ') || 'imagen'}` },
        que: { type: 'string', description: 'Qué tiene que mostrar la foto o el video, en una frase concreta.' },
        formato: { type: 'string', description: 'Proporción y orientación. Ej: "vertical 3:4, 1200x1600".' },
        encuadre: { type: 'string', description: 'Plano, luz y punto de vista.' },
        evitar: { type: 'string', description: 'El error típico que arruina esta foto.' },
      },
      propertyOrdering: ['campo', 'que', 'formato', 'encuadre', 'evitar'],
      required: ['campo', 'que', 'formato', 'encuadre', 'evitar'],
    },
  };
  orden.push('visuales');

  props.porQue = { type: 'string', description: 'Una línea: por qué este texto y no otro. Para el dueño, no para el cliente.' };
  orden.push('porQue');

  return { schema: { type: 'object', properties: props, propertyOrdering: orden }, tipo: t };
}

/* -------------------------------------------------------------------------
 * CONTEXTO REAL
 * ----------------------------------------------------------------------- */
async function productosDestacados(limite = 8) {
  const { rows } = await pool.query(
    `SELECT name, brand, price, promo_price, stock, sales_30d
       FROM products_cache
      WHERE COALESCE(stock,0) > 0 AND price > 0
      ORDER BY COALESCE(sales_30d,0) DESC, stock DESC
      LIMIT $1`, [limite]
  ).catch(() => ({ rows: [] }));
  return rows.map((r) => `${r.name}${r.brand ? ` (${r.brand})` : ''} — $${Math.round(Number(r.price))}, ${r.stock} en stock, ${r.sales_30d || 0} vendidos en 30 días`);
}

/* -------------------------------------------------------------------------
 * LIMPIEZA DE LA SALIDA
 * ----------------------------------------------------------------------- */

/** Los links tienen que existir. Si el modelo inventó uno, se busca el más parecido. */
function corregirUrl(valor, permitidas) {
  const s = String(valor || '').trim();
  if (!s) return '';
  const limpio = '/' + s.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '');
  const exacta = permitidas.find((p) => p.url.toLowerCase() === limpio.toLowerCase());
  if (exacta) return exacta.url;

  // Parecido por palabras: "/ropa-de-obra" inventado cae en "/obra" si existe.
  const palabras = limpio.replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase().split(' ').filter((w) => w.length > 3);
  let mejor = null;
  let mejorPuntaje = 0;
  permitidas.forEach((p) => {
    const texto = `${p.url} ${p.nombre}`.toLowerCase();
    const puntaje = palabras.filter((w) => texto.includes(w)).length;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = p; }
  });
  return mejorPuntaje > 0 ? mejor.url : '';
}

/* Cifras que no vinieron en los datos: el modelo las escribe con toda
   naturalidad ("hasta 40% off", "más de 5.000 clientes") y son inventadas. */
function sinNumerosInventados(texto, permitidos) {
  // Devuelve SIEMPRE una cadena: el modelo omite campos opcionales sin avisar y
  // más abajo esto se recorta con .slice(). Devolver undefined rompía el pedido
  // entero por un campo que en realidad no hacía falta.
  if (texto == null || texto === '') return '';
  return String(texto).replace(/\b\d[\d.,]*\s*%|\$\s?\d[\d.,]*|\b\d{3,}[\d.,]*\b/g, (m) => {
    const n = m.replace(/[^\d]/g, '');
    return permitidos.has(n) ? m : '';
  }).replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

function numerosPermitidos(contexto) {
  const set = new Set();
  JSON.stringify(contexto).replace(/\d+/g, (m) => { set.add(m); return m; });
  return set;
}

/** Recorta cada campo al máximo que declara el catálogo y limpia lo inventado. */
function limpiar(salida, tipoDef, permitidas, numeros) {
  const data = {};
  tipoDef.fields.forEach((c) => {
    if (c.type === 'lista') {
      const items = Array.isArray(salida[c.key]) ? salida[c.key] : [];
      data[c.key] = items.slice(0, c.max || 6).map((it) => {
        const limpio = {};
        (c.item || []).forEach((sub) => {
          const v = it ? it[sub.key] : '';
          if (sub.type === 'url') limpio[sub.key] = corregirUrl(v, permitidas);
          else if (sub.type === 'opciones') {
            const validos = (sub.options || []).map((o) => o.value);
            limpio[sub.key] = validos.includes(v) ? v : (sub.default || validos[0]);
          } else if (CAMPOS_DE_TEXTO.includes(sub.type)) {
            limpio[sub.key] = sinNumerosInventados(v, numeros).slice(0, sub.max || 200);
          }
        });
        return limpio;
      });
      return;
    }
    if (!CAMPOS_DE_TEXTO.includes(c.type)) return;
    const v = salida[c.key];
    if (c.type === 'url') data[c.key] = corregirUrl(v, permitidas);
    else if (c.type === 'opciones') {
      const validos = (c.options || []).map((o) => o.value);
      if (validos.includes(v)) data[c.key] = v;
    } else data[c.key] = sinNumerosInventados(v, numeros).slice(0, c.max || 200);
  });

  // Un botón sin link no sirve, y un link sin texto tampoco: se cortan de a pares.
  ['cta1', 'cta2'].forEach((cta) => {
    if (!data[`${cta}_url`] || !data[`${cta}_text`]) {
      data[`${cta}_url`] = '';
      data[`${cta}_text`] = '';
    }
  });

  const visuales = (Array.isArray(salida.visuales) ? salida.visuales : []).slice(0, 6).map((v) => ({
    campo: String(v.campo || 'image').slice(0, 40),
    que: String(v.que || '').slice(0, 300),
    formato: String(v.formato || '').slice(0, 80),
    encuadre: String(v.encuadre || '').slice(0, 300),
    evitar: String(v.evitar || '').slice(0, 300),
  }));

  return { data, visuales, porQue: String(salida.porQue || '').slice(0, 400) };
}

/* -------------------------------------------------------------------------
 * GENERACIÓN
 * ----------------------------------------------------------------------- */

const SISTEMA = `Escribís los textos de la página de inicio de BLACKS Indumentaria, una tienda argentina de ropa de trabajo, seguridad industrial y urbano, que vende al público y por mayor.

CÓMO ESCRIBIR
- Castellano rioplatense, voseo. Como habla alguien del rubro, no como un folleto.
- Frases cortas. Sujeto y verbo. Sin adjetivos apilados.
- Concreto antes que lindo: "puntera que aguanta 200 joules" le gana a "máxima protección".
- Nada de "descubrí", "sumérgete", "vivila", "elevá tu estilo", "calidad premium", "la mejor calidad", signos de exclamación ni emojis.
- El rubro en Argentina se vende con catálogo aburrido. La idea es sonar moderno sin sonar a marca de ropa urbana genérica: sobrio, técnico, directo.

QUÉ NO INVENTAR, NUNCA
- Números: porcentajes, cantidades, plazos, precios, años de trayectoria. Sólo podés usar los que estén en los DATOS.
- Certificaciones, normas o materiales que no estén en los datos.
- Links: sólo podés usar las URLs de la lista. Si ninguna sirve, dejá el botón vacío.

Devolvés JSON y nada más.`;

/**
 * Escribe un bloque completo.
 * @param {string} tipo        tipo de bloque (portada, media_texto, ...)
 * @param {object} rol         qué papel cumple en el home: { que, porQue, dato }
 * @param {object} extra       { instrucciones, categoria, estacion, evento }
 */
async function sugerirBloque({ tipo, rol = {}, extra = {} }) {
  const { schema, tipo: tipoDef } = esquemaDe(tipo);
  if (!hasGemini() && !process.env.GROQ_API_KEY) {
    throw Object.assign(new Error('No hay GEMINI_API_KEY ni GROQ_API_KEY configuradas: no puedo escribir los textos.'), { status: 400 });
  }

  const [permitidas, productos, marca, empresa] = await Promise.all([
    urlsPermitidas(),
    productosDestacados(),
    getBrandProfile().catch(() => null),
    getCompanyFacts().catch(() => null),
  ]);

  const contexto = {
    bloque: { tipo, para: tipoDef.para, resumen: tipoDef.resumen },
    papelEnLaPagina: rol,
    temporada: extra.estacion || null,
    proximoEvento: extra.evento || null,
    categoriaAEmpujar: extra.categoria || null,
    productosQueMasSeVenden: productos,
    urlsQueExisten: permitidas.map((p) => `${p.url} — ${p.nombre}${p.ventas_30d ? ` (${p.ventas_30d} vendidos en 30 días)` : ''}`),
    vozDeMarca: marca && marca.tone ? marca.tone : null,
    datosDeLaEmpresa: empresa ? String(empresa).slice(0, 1200) : null,
    indicacionDelDueno: extra.instrucciones || null,
  };

  const prompt = `Escribí el contenido de un bloque "${tipoDef.label}" para la página de inicio.

QUÉ TIENE QUE LOGRAR ESTE BLOQUE
${rol.que || tipoDef.resumen}
${rol.porQue ? `Por qué está en esa posición: ${rol.porQue}` : ''}
${rol.dato ? `Dato que lo justifica: ${rol.dato}` : ''}

DATOS (lo único que podés dar por cierto)
${JSON.stringify(contexto, null, 1)}

Además de los textos, devolvé en "visuales" una indicación por cada foto o video que haya que conseguir: qué mostrar, en qué formato, cómo encuadrarlo y qué evitar. Tené en cuenta que la mayoría de las visitas son desde el celular, así que las fotos verticales encuadran mejor.`;

  const salida = await generateJson({
    system: SISTEMA,
    prompt,
    schema,
    temperature: 0.75,
    maxTokens: 2600,
    // Un poco de razonamiento: sin esto elige el ángulo más obvio y todos los
    // bloques terminan diciendo lo mismo.
    thinkingBudget: 900,
  });

  return limpiar(salida, tipoDef, permitidas, numerosPermitidos(contexto));
}

module.exports = { sugerirBloque, esquemaDe, corregirUrl, limpiar, sinNumerosInventados };
