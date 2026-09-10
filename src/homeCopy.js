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
    /* `data.ratio` es la forma que el bloque tiene elegida en el panel, y es la
       que el theme le va a imponer a la foto por CSS. Sin esto la indicación
       salía sin relación de aspecto y la imagen volvía cuadrada, para después
       recortarse sola en la tarjeta. No todos los tipos de bloque tienen el
       campo; los que no, siguen igual que antes. */
    prompt_ia: promptDeFoto({ ...v, ratio: v.ratio || data.ratio, tipo: String(v.tipo || '').toLowerCase() }),
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
  { falta: /texture|weave|stitching|grain/i,
    texto: 'True shallow depth of field, visible fabric weave and stitching, authentic wear and creases, slight film grain.' },
];

/* PIEL Y POSTURA SÓLO SI EN LA ESCENA HAY ALGUIEN.
   Iban siempre, así que un banner de producto suelto —la recomendación del
   producto estrella dice literalmente "the single garment on its own, no
   model"— se llevaba igual "real skin texture with pores" y "relaxed
   asymmetric posture caught mid-task". El prompt le pedía al modelo la postura
   de una persona que la propia escena prohibía, y una contradicción adentro
   del prompt se paga en toda la imagen, no sólo en esa parte. */
const PIEZAS_FOTO_CON_GENTE = [
  { falta: /pores|skin texture/i, texto: 'Real skin texture with pores and imperfections.' },
  { falta: /candid|documentary|unposed|mid-task/i,
    texto: 'Relaxed asymmetric posture caught mid-task, documentary photography, unretouched colour.' },
];
const PIEZAS_FOTO_SIN_GENTE = [
  { falta: /still[- ]life|documentary|unretouched/i,
    texto: 'Still-life product photography, unretouched colour, nothing else in shot.' },
];
/* "wearing" y "hands" entran a propósito: alcanza con una mano o un torso para
   que la textura de piel deje de sobrar. */
const HAY_GENTE = /worker|model\b|person|people|crew|\bman\b|\bwoman\b|hands?\b|someone|uniformed|wearing/i;

/* Las NEGACIONES se borran antes de buscar. Si no, la escena del producto
   suelto —que dice "No model, nothing else in shot"— daba positivo por la
   palabra "model" que estaba justo para prohibirla, y terminaba llevándose la
   textura de piel y la postura igual que si hubiera alguien. */
const GENTE_NEGADA = /\b(?:no|without|not)\s+(?:\w+\s+){0,2}(?:workers?|models?|persons?|people|crews?|man|men|woman|women|hands?|someone|humans?)\b/gi;

function hayGente(base) {
  return HAY_GENTE.test(String(base).replace(GENTE_NEGADA, ' '));
}

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
   importa para esta tienda: la prenda tiene que ser LA REAL.

   POR QUÉ ESTÁ PARTIDO EN CLÁUSULAS y no es un párrafo único, como era hasta
   sep-2026: el párrafo se agregaba sólo si el prompt del modelo NO decía ya
   algo del estilo "no text". El prompt de los banners (homeBanners.js) empieza
   con "the photograph itself must contain no text and no numbers", así que
   daba positivo en esa prueba y se saltaba el negativo ENTERO — los banners
   se generaban sin ninguna de las otras prohibiciones (piel de plástico,
   saturación, pose de catálogo, aspecto 3D). Ahora cada prohibición se evalúa
   por su cuenta, igual que las piezas técnicas de acá arriba: la que ya está
   dicha no se repite, y las demás se agregan igual. */
const NEGATIVO_FOTO = [
  { falta: /no text|no letters|without text|no typography/i, texto: 'No text, no letters, no numbers, no captions, no watermarks.' },
  { falta: /no logo|brand mark|wordmark|no branding/i, texto: 'No logos and no invented brand marks of any kind.' },
  { falta: /plastic skin|waxy|airbrush/i, texto: 'No plastic or waxy skin, no airbrushed retouching.' },
  { falta: /saturat|hdr/i, texto: 'No oversaturated colours, no HDR glow.' },
  { falta: /symmetry|catalogue pose|catalog pose|stock[- ]photo/i, texto: 'No perfect symmetry, no studio catalogue pose, no stock-photo smile.' },
  { falta: /\b3d\b|rendered|cgi|illustration/i, texto: 'No rendered, CGI or 3D look, no illustration.' },
];

const NEGATIVO_VIDEO = [
  { falta: /do not alter|keep its exact|unchanged garment/i, texto: 'Do not alter the garment: keep its exact colour, cut, pockets, seams and hardware.' },
  { falta: /no logo|brand mark|wordmark|no branding/i, texto: 'No invented logos, brand marks, prints or reflective strips.' },
  { falta: /no text|no caption|without text/i, texto: 'No text or captions on screen.' },
  { falta: /no cuts|single continuous|one shot/i, texto: 'No cuts, no montage, no speed ramps.' },
  { falta: /orbit|drone|aerial/i, texto: 'No camera orbit, no drone or aerial shot.' },
  { falta: /plastic skin|waxy/i, texto: 'No plastic skin, no oversaturated colours, no studio catalogue pose.' },
  { falta: /\b3d\b|rendered|cgi|morphing/i, texto: 'No HDR glow, no 3D or rendered look, no morphing fabric.' },
];

/* -------------------------------------------------------------------------
 * RELACIÓN DE ASPECTO
 *
 * Hasta sep-2026 acá se pegaba tal cual lo que viniera en "formato", que casi
 * siempre era una medida en píxeles: el prompt terminaba diciendo
 * "Aspect ratio: 1920x724 (wide banner)". Dos problemas encadenados:
 *
 *   1. Los modelos de imagen no razonan en píxeles, quieren una razón (21:9).
 *   2. Cuando el prompt se genera para COPIAR Y PEGAR en la app de Gemini —que
 *      es como se usan los tres paneles que muestran estos textos— no existe el
 *      generationConfig.imageConfig que en las llamadas por API corrige el
 *      pedido (ver geminiGenerateContent en ai.js, que explica que el ratio
 *      escrito dentro del prompt se ignora).
 *
 * Resultado medido en la tienda: los cuatro banners del carrusel volvieron con
 * cuatro formas distintas (2.69, 2.26, 2.69 y 2.36) y el home saltaba al pasar
 * de uno al otro. Acá el formato se traduce SIEMPRE a una de las razones que
 * los modelos aceptan, eligiendo la más parecida cuando vino en píxeles.
 * ----------------------------------------------------------------------- */
const RATIOS_SOPORTADOS = [
  ['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3],
  ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9],
];

/* La distancia se mide en logaritmo y no restando: entre 2.65 y sus candidatos,
   restar hace parecer que 16:9 (1.78) está tan cerca como 21:9 (2.33), cuando
   en proporción visual 21:9 es muchísimo más parecido. */
function ratioMasCercano(valor) {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return RATIOS_SOPORTADOS.reduce((mejor, actual) => (
    Math.abs(Math.log(actual[1] / valor)) < Math.abs(Math.log(mejor[1] / valor)) ? actual : mejor
  ))[0];
}

/** Traduce "21:9", "3-2", "1920x823" o "1920 × 823 px" a una razón soportada.
    El guion se acepta porque es como escribe la forma el catálogo de bloques
    (homeBlocks.js: '3-2', '16-9', '9-16'). */
function ratioSoportado(formato) {
  const s = String(formato || '').trim();
  if (!s) return null;
  const razon = s.match(/(\d{1,2})\s*[:-]\s*(\d{1,2})/);
  if (razon) return ratioMasCercano(Number(razon[1]) / Number(razon[2]));
  const px = s.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (px) return ratioMasCercano(Number(px[1]) / Number(px[2]));
  return null;
}

/* Cortar a los 900 caracteres justos partía la última oración al medio y el
   prompt terminaba en algo como "the worker is holding a" — una frase colgada
   que el modelo trata como parte de la escena. Se corta en el último punto. */
function recortarEnFrase(txt, max) {
  if (txt.length <= max) return txt;
  const corte = txt.slice(0, max);
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '));
  if (fin > max * 0.5) return corte.slice(0, fin + 1).trim();
  return corte.replace(/\s+\S*$/, '').trim();
}

/**
 * Arma el prompt final: lo que escribió el modelo + sólo las piezas técnicas
 * que le faltan + las prohibiciones + la referencia del producto real.
 */
function promptDeFoto(v) {
  const base = recortarEnFrase(String(v.prompt_ia || v.que || '').trim(), 900);
  if (!base) return '';
  const esVideo = String(v.tipo || '').toLowerCase() === 'video'
    || /\bvideo\b|\bclip\b|footage|seconds long/i.test(String(v.campo || '') + ' ' + base);

  const partes = [base];
  const piezas = esVideo
    ? PIEZAS_VIDEO
    : PIEZAS_FOTO.concat(hayGente(base) ? PIEZAS_FOTO_CON_GENTE : PIEZAS_FOTO_SIN_GENTE);
  piezas.forEach((p) => { if (!p.falta.test(base)) partes.push(p.texto); });

  // Las prohibiciones se evalúan de a una: ver el comentario de NEGATIVO_FOTO.
  const negativos = esVideo ? NEGATIVO_VIDEO : NEGATIVO_FOTO;
  negativos.forEach((n) => { if (!n.falta.test(base)) partes.push(n.texto); });

  /* El ratio va al FINAL y en su propia oración: es lo último que lee el modelo
     y lo que más se pierde cuando queda enterrado en medio del párrafo. Se
     agrega la orden de llenar el cuadro porque el vicio conocido de estos
     modelos es dibujar la escena panorámica dentro de un cuadrado y rellenar
     con barras negras (por eso existe trimLetterbox en imageUtils.js). */
  const ratio = ratioSoportado(v.ratio || v.formato);
  if (ratio) {
    partes.push(`Output aspect ratio: ${ratio}.`
      + ' Compose for this exact frame and fill it edge to edge:'
      + ' no letterboxing, no black bars, no borders, no padding.');
  }

  /* LA PRENDA DE REFERENCIA.
     Antes esto decía siempre "must match the attached reference photo". No hay
     ninguna foto adjunta en ninguno de los tres paneles que muestran estos
     prompts: los tres los dejan en un textarea para copiarlos y pegarlos a
     mano. Pedirle al modelo que respete una foto que no recibió es una
     instrucción imposible, y con una imposible adentro el resto del prompt se
     cumple peor. Ahora se menciona el adjunto SÓLO si de verdad se adjunta. */
  if (v.producto_de_referencia) {
    const nombre = String(v.producto_de_referencia).slice(0, 90);
    partes.push(v.referencia_adjunta
      ? `The garment must match the attached reference photo of "${nombre}" exactly.`
      : `The garment is a "${nombre}": real workwear cut, proportions and fabric, with no invented details, prints or trims.`);
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
