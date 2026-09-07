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
        // Para pegar en Gemini/Nano Banana y sacar la pieza sin sesión de fotos.
        tipo: {
          type: 'string', enum: ['foto', 'video'],
          description: 'Si este hueco se llena con una foto o con un video.',
        },
        prompt_ia: {
          type: 'string',
          description: 'Indicación EN INGLÉS para el generador, en un solo párrafo. Si es foto: fotografía documental realista (cámara, lente, luz con dirección, textura de tela y piel, desgaste, postura natural). Si es video: un solo plano continuo de 5 a 8 segundos, describiendo el movimiento de cámara, el movimiento dentro del cuadro, el punto de foco y cómo cambia. Sin texto ni logos.',
        },
        producto_de_referencia: {
          type: 'string',
          description: 'Nombre EXACTO de un producto del catálogo cuya foto conviene adjuntar al generador para que la prenda sea la real. Vacío si la foto no muestra una prenda concreta.',
        },
      },
      propertyOrdering: ['campo', 'tipo', 'que', 'formato', 'encuadre', 'evitar', 'prompt_ia', 'producto_de_referencia'],
      required: ['campo', 'tipo', 'que', 'formato', 'encuadre', 'evitar', 'prompt_ia', 'producto_de_referencia'],
    },
  };
  orden.push('visuales');

  props.respaldo = {
    type: 'string',
    description: 'Qué productos REALES del catálogo sostienen lo que dice este bloque, nombrados como figuran en los datos. Si no hay ninguno, decilo.',
  };
  orden.push('respaldo');

  props.porQue = { type: 'string', description: 'Una línea: por qué este texto y no otro. Para el dueño, no para el cliente.' };
  orden.push('porQue');

  return { schema: { type: 'object', properties: props, propertyOrdering: orden }, tipo: t };
}

/* -------------------------------------------------------------------------
 * CONTEXTO REAL
 * ----------------------------------------------------------------------- */
/**
 * Productos reales AGRUPADOS POR CATEGORÍA.
 *
 * Sin esto la IA recibía sólo el top 8 global de la tienda y, al escribir una
 * placa de "Construcción" o "Gastronomía", hablaba del rubro en abstracto: no
 * tenía forma de saber si hay algo que vender ahí. Con esto puede nombrar
 * prendas que existen —y, sobre todo, NO proponer un rubro para el que no hay
 * stock, que es el error caro.
 *
 * Sale de `raw->'categories'`, que es la lista completa por producto (la columna
 * `category` guarda una sola y miente sobre la taxonomía real).
 */
async function productosPorCategoria(maxCategorias = 8, porCategoria = 5) {
  const { rows } = await pool.query(
    `WITH expandido AS (
       SELECT p.id, p.name, p.brand, p.price, p.stock, COALESCE(p.sales_30d,0) AS ventas,
              c->'name'->>'es' AS categoria,
              c->'handle'->>'es' AS handle
         FROM products_cache p,
              LATERAL jsonb_array_elements(COALESCE(p.raw->'categories','[]'::jsonb)) c
        WHERE COALESCE(p.stock,0) > 0 AND p.price > 0
     ), rankeado AS (
       SELECT *, row_number() OVER (PARTITION BY categoria ORDER BY ventas DESC, stock DESC) AS puesto,
              sum(ventas) OVER (PARTITION BY categoria) AS ventas_cat,
              count(*) OVER (PARTITION BY categoria) AS n_cat
         FROM expandido
        WHERE categoria IS NOT NULL
     )
     SELECT categoria, handle, name, brand, price, stock, ventas, n_cat, ventas_cat
       FROM rankeado
      WHERE puesto <= $2
      ORDER BY ventas_cat DESC, categoria, puesto
      LIMIT $1 * $2`,
    [maxCategorias, porCategoria]
  ).catch((e) => { console.warn('[homeCopy] productosPorCategoria:', e.message); return { rows: [] }; });

  const porCat = new Map();
  rows.forEach((r) => {
    if (!porCat.has(r.categoria)) {
      porCat.set(r.categoria, { categoria: r.categoria, url: r.handle ? `/${r.handle}` : null,
        productosConStock: Number(r.n_cat), ventas_30d: Number(r.ventas_cat), ejemplos: [] });
    }
    const c = porCat.get(r.categoria);
    if (c.ejemplos.length < porCategoria) {
      c.ejemplos.push(`${r.name}${r.brand ? ` (${r.brand})` : ''} — $${Math.round(Number(r.price))}, ${r.stock} en stock`);
    }
  });
  return [...porCat.values()].slice(0, maxCategorias);
}

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
    // El prompt del modelo es la idea; las reglas anti-"parece IA" se agregan
    // acá por código para que estén SIEMPRE, aunque el modelo se olvide.
    tipo: String(v.tipo || '').toLowerCase() === 'video' ? 'video' : 'foto',
    producto_de_referencia: String(v.producto_de_referencia || '').slice(0, 120),
    // Se arma DESPUÉS de normalizar tipo y producto: los usa.
    prompt_ia: promptDeFoto({ ...v, tipo: String(v.tipo || '').toLowerCase() }),
  }));

  return {
    data,
    visuales,
    respaldo: String(salida.respaldo || '').slice(0, 500),
    porQue: String(salida.porQue || '').slice(0, 400),
  };
}

/* LA COLA TÉCNICA, EN PARTES INDEPENDIENTES.
   Antes era un bloque único: si el modelo ya había elegido una cámara, se le
   pegaba otra atrás y el prompt terminaba pidiendo "Canon C300" y "Sony FX3" a
   la vez. Instrucciones contradictorias = generación peor. Ahora cada pieza
   tiene su propia guarda y sólo se agrega la que falta.

   Todo esto va por código y no en el pedido al modelo porque es justo lo que el
   modelo omite, y lo que más delata una imagen o un video generado. */
const PIEZAS_FOTO = [
  { falta: /canon|nikon|sony|leica|fujifilm|\d{2}mm|f\/\d/i,
    texto: 'Shot on a Canon EOS R6 with a 35mm f/1.8 lens.' },
  { falta: /daylight|natural light|golden hour|overcast|window light/i,
    texto: 'Natural directional daylight with soft falloff.' },
  { falta: /texture|weave|stitching|pores|grain/i,
    texto: 'True shallow depth of field, visible fabric weave and stitching, real skin texture with pores and imperfections, authentic wear and creases, slight film grain.' },
  { falta: /candid|documentary|unposed|mid-task/i,
    texto: 'Relaxed asymmetric posture caught mid-task, documentary photography, unretouched colour.' },
];

const PIEZAS_VIDEO = [
  { falta: /continuous take|single shot|one shot|no cuts/i,
    texto: 'Single continuous take, no cuts, no scene changes, 6 seconds, 24fps.' },
  { falta: /canon|sony|arri|red komodo|blackmagic|\d{2}mm|f\/\d/i,
    texto: 'Shot on a Sony FX3 with a 35mm f/2 lens.' },
  { falta: /handheld|gimbal|tripod|dolly|tracks|camera move/i,
    texto: 'Handheld with subtle natural micro-movement, slow deliberate camera move.' },
  { falta: /focus/i,
    texto: 'Focus stays locked on the garment with a gentle rack focus at the end, shallow depth of field.' },
  { falta: /daylight|natural light|overcast|window light/i,
    texto: 'Natural directional daylight with soft falloff.' },
  { falta: /texture|weave|stitching|ripstop grid|grain/i,
    texto: 'Visible fabric weave, stitching and ripstop grid, authentic creases, dust and wear, real skin texture, slight grain.' },
];

/* Lo que NUNCA hay que dejar librado al modelo. La primera regla es la que más
   importa para esta tienda: la prenda tiene que ser LA REAL. */
const NEGATIVO_FOTO = 'No text, no letters, no watermarks, no logos, no invented brand marks, '
  + 'no plastic or waxy skin, no oversaturated colours, no perfect symmetry, no studio catalogue pose, '
  + 'no HDR glow, no rendered or 3D look, no stock-photo smile.';

const NEGATIVO_VIDEO = 'Do not alter the garment: keep its exact colour, cut, pockets, seams and '
  + 'hardware as shown in the reference photo. No invented logos, brand marks, prints or reflective '
  + 'strips. No text or captions on screen. No cuts, no montage, no speed ramps, no camera orbit, '
  + 'no drone shot. No plastic skin, no oversaturated colours, no studio catalogue pose, '
  + 'no HDR glow, no 3D or rendered look, no morphing fabric.';

/**
 * Arma el prompt final: lo que escribió el modelo + sólo las piezas técnicas
 * que le faltan + las prohibiciones + la referencia del producto real.
 */
function promptDeFoto(v) {
  const base = String(v.prompt_ia || v.que || '').trim();
  if (!base) return '';
  const esVideo = String(v.tipo || '').toLowerCase() === 'video'
    || /\bvideo\b|\bclip\b|footage|seconds long/i.test(String(v.campo || '') + ' ' + base);

  const partes = [base.slice(0, 900)];
  const piezas = esVideo ? PIEZAS_VIDEO : PIEZAS_FOTO;
  piezas.forEach((p) => { if (!p.falta.test(base)) partes.push(p.texto); });

  const negativo = esVideo ? NEGATIVO_VIDEO : NEGATIVO_FOTO;
  if (!/no text|do not alter|without text/i.test(base)) partes.push(negativo);

  if (v.formato) partes.push(`Aspect ratio: ${String(v.formato).slice(0, 60)}.`);
  if (v.producto_de_referencia) {
    partes.push(`The garment must match the attached reference photo of "${String(v.producto_de_referencia).slice(0, 90)}" exactly.`);
  }
  return partes.join(' ');
}

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
- Rubros y categorías: si proponés un rubro (construcción, gastronomía, industria...), tiene
  que haber productos con stock para ese rubro en "queHayPorCategoria". No propongas un rubro
  vacío: mandás al cliente a una categoría sin nada. Si no hay para tres rubros, hacé dos.

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

  const [permitidas, productos, porCategoria, marca, empresa] = await Promise.all([
    urlsPermitidas(),
    productosDestacados(),
    productosPorCategoria(),
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
    // Para que un rubro no se proponga si no hay nada que vender ahí.
    queHayPorCategoria: porCategoria,
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

Además de los textos, devolvé en "visuales" una indicación por cada foto o video que haya que conseguir: qué mostrar, en qué formato, cómo encuadrarlo y qué evitar. Tené en cuenta que la mayoría de las visitas son desde el celular, así que las fotos verticales encuadran mejor.

En "respaldo" nombrá los productos REALES de los datos que sostienen lo que escribiste (los que el cliente va a encontrar si hace clic). Si lo que escribiste no tiene productos que lo respalden, decilo ahí en vez de inventar.

En cada visual marcá en "tipo" si ese hueco se llena con "foto" o con "video" (los bloques de video llevan video; el resto, foto).

En "prompt_ia" escribí la indicación para el generador, EN INGLÉS y en un solo párrafo. Si es video, describí UN SOLO plano continuo: qué hace la cámara, qué se mueve dentro del cuadro, dónde está el foco y cómo cambia. Si es foto, la escena fija. Tiene que dar una foto que no parezca generada: cámara y lente concretos, luz natural con dirección, textura real de tela y piel, desgaste y polvo donde corresponda, postura natural y asimétrica, profundidad de campo verdadera. Ambientada en Argentina (obra, planta, taller o calle, según el caso). Sin texto, sin logos, sin marcas inventadas, sin piel plástica, sin saturación de más, sin simetría perfecta, sin pose de catálogo.`;

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

/**
 * PROMPT PARA UN HUECO SUELTO.
 *
 * Distinto de sugerirBloque(): acá el bloque YA ESTÁ ESCRITO por el dueño y lo
 * único que falta es la foto o el video de un campo puntual. Así que el
 * contexto no es "qué debería decir este bloque" sino "esto es lo que dice —
 * conseguime la imagen que le corresponde". Es lo que hacía falta para los
 * bloques que se arman a mano y no salen de una recomendación del esquema.
 *
 * @param {string} tipo    tipo de bloque
 * @param {object} data    lo que el dueño ya escribió
 * @param {string} campo   qué hueco: image, image_mobile, video_url, tiles.1.image…
 */
async function promptDeCampo({ tipo, data = {}, campo = 'image', instrucciones = '' }) {
  const tipoDef = BLOCK_TYPES[tipo];
  if (!tipoDef) throw Object.assign(new Error(`Tipo de bloque desconocido: ${tipo}`), { status: 400 });
  if (!hasGemini() && !process.env.GROQ_API_KEY) {
    throw Object.assign(new Error('No hay GEMINI_API_KEY ni GROQ_API_KEY configuradas.'), { status: 400 });
  }

  const [productos, marca] = await Promise.all([
    productosDestacados(12),
    getBrandProfile().catch(() => null),
  ]);

  // El hueco puede estar adentro de una lista (placa 2 del editorial, por ej.):
  // ahí lo que importa es el texto DE ESA placa, no el del bloque entero.
  const partes = String(campo).split('.');
  let textoDelHueco = data;
  if (partes.length === 3) {
    const lista = data[partes[0]];
    if (Array.isArray(lista) && lista[Number(partes[1])]) textoDelHueco = lista[Number(partes[1])];
  }
  const esVideo = /video/.test(campo);

  const escrito = Object.entries(textoDelHueco)
    .filter(([k, v]) => typeof v === 'string' && v.trim() && !/^(image|video)/.test(k) && !/_url$/.test(k))
    .map(([k, v]) => `${k}: ${v}`).join('\n');

  const contexto = {
    bloque: { tipo, para: tipoDef.para },
    hueco: campo,
    esVideo,
    loQueYaDiceElBloque: escrito || '(todavía sin texto)',
    productosDelCatalogo: productos,
    vozDeMarca: marca && marca.tone ? marca.tone : null,
    indicacionDelDueno: instrucciones || null,
  };

  const salida = await generateJson({
    system: SISTEMA,
    prompt: `Necesito ${esVideo ? 'un VIDEO' : 'una FOTO'} para un hueco puntual de un bloque de la página de inicio que YA ESTÁ ESCRITO. No reescribas los textos: conseguime la pieza que les corresponde.

DATOS
${JSON.stringify(contexto, null, 1)}

Devolvé:
- "que": qué tiene que mostrar, en una frase concreta.
- "formato": proporción y orientación. La mayoría de las visitas son de celular.
- "encuadre": plano, luz y punto de vista.
- "evitar": el error típico que arruina esta pieza.
- "producto_de_referencia": el nombre EXACTO de un producto del catálogo cuya foto conviene adjuntar al generador, si la pieza muestra una prenda concreta. Vacío si no.
- "prompt_ia": la indicación para el generador, EN INGLÉS y en un solo párrafo.${esVideo
  ? ' Describí UN SOLO plano continuo: qué hace la cámara, qué se mueve en el cuadro, dónde está el foco y cómo cambia.'
  : ' La escena fija.'}`,
    schema: {
      type: 'object',
      properties: {
        que: { type: 'string' },
        formato: { type: 'string' },
        encuadre: { type: 'string' },
        evitar: { type: 'string' },
        producto_de_referencia: { type: 'string' },
        prompt_ia: { type: 'string' },
      },
      propertyOrdering: ['que', 'formato', 'encuadre', 'evitar', 'producto_de_referencia', 'prompt_ia'],
      required: ['que', 'formato', 'encuadre', 'evitar', 'producto_de_referencia', 'prompt_ia'],
    },
    temperature: 0.7,
    maxTokens: 1200,
    thinkingBudget: 400,
  });

  const v = {
    campo,
    tipo: esVideo ? 'video' : 'foto',
    que: String(salida.que || '').slice(0, 300),
    formato: String(salida.formato || '').slice(0, 80),
    encuadre: String(salida.encuadre || '').slice(0, 300),
    evitar: String(salida.evitar || '').slice(0, 300),
    producto_de_referencia: String(salida.producto_de_referencia || '').slice(0, 120),
  };
  // Las reglas anti-"parece IA" se agregan por código, igual que en el resto.
  v.prompt_ia = promptDeFoto({ ...v, prompt_ia: salida.prompt_ia });
  return v;
}

module.exports = { promptDeCampo, sugerirBloque, esquemaDe, corregirUrl, limpiar, sinNumerosInventados, promptDeFoto, productosPorCategoria };
