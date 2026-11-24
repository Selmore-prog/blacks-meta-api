/* =========================================================================
 * EMAIL MARKETING — la IA arma el mail entero desde una idea
 *
 * La IA NO escribe HTML: elige bloques, los ordena y redacta. El HTML lo dibuja
 * siempre plantilla.js, que es lo que se ve bien en Gmail, Outlook y el celular.
 *
 * QUÉ SE LE DA: el catálogo (sólo lo que tiene precio, stock y foto), los datos
 * verificados del negocio, los links que existen y, si hay una oferta programada,
 * sus precios.
 * QUÉ SE LE CONTROLA DESPUÉS: productos que existan, links de la lista, y que cada
 * precio, porcentaje, cantidad o fecha que escribió salga de la idea, del catálogo o
 * de los datos del negocio. Si inventó algo se le devuelve una vez para corregir; lo
 * que quede sin respaldo se marca para que una persona lo mire.
 * ========================================================================= */

const pool = require('../db');
const config = require('../config');
const { limpiarBloques, preciosProgramados } = require('./campanas');
const { TEMAS } = require('./plantilla');

const corto = (s, n) => String(s === null || s === undefined ? '' : s).slice(0, n);
const llano = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const error = (status, m) => { const e = new Error(m); e.status = status; return e; };

const WHATSAPP = 'https://wa.me/5491153248230?text=Hola!%20Quiero%20cotizar%20ropa%20de%20trabajo%20para%20mi%20empresa.';

/* ------------------------------- Insumos ------------------------------- */

const VACIAS = new Set(['para', 'con', 'los', 'las', 'del', 'una', 'que', 'por', 'mail', 'email', 'campana', 'producto', 'productos', 'oferta', 'ofertas', 'precio', 'precios', 'clientes', 'sobre', 'todos', 'toda', 'desde', 'hasta', 'quiero', 'hace', 'armame', 'algo', 'como', 'mas', 'tienda', 'blacks']);

/** Hasta 32 productos: los que nombra la idea, los de la oferta y los más vendidos. */
async function catalogo({ texto, para, oferta, fijos = [] }) {
  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, promo_price, stock, sales_30d, image_url, description FROM products_cache
      WHERE published IS NOT FALSE AND image_url IS NOT NULL AND ${para === 'mayorista' ? '(price IS NULL OR price = 0)' : 'price > 0 AND (stock IS NULL OR stock > 0)'}`,
  );
  const palabras = [...new Set(llano(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !VACIAS.has(w)).map((w) => w.replace(/(es|s)$/, '')))];
  const puntos = rows.map((p) => {
    const pajar = llano(`${p.name} ${p.brand || ''} ${p.category || ''}`);
    const nombrado = palabras.filter((w) => pajar.includes(w)).length;
    return { p, n: nombrado * 100 + (oferta.has(Number(p.id)) ? 60 : 0) + (fijos.includes(Number(p.id)) ? 500 : 0) + Math.min(50, Number(p.sales_30d || 0)) };
  }).sort((a, b) => b.n - a.n);
  return puntos.slice(0, 32).map(({ p }, i) => ({
    id: Number(p.id), nombre: p.name, precio: Math.round(Number(p.promo_price || p.price) || 0), lista: Math.round(Number(p.price) || 0),
    oferta: oferta.get(Number(p.id)) || null, stock: p.stock, vendidos30d: Number(p.sales_30d || 0),
    // Sólo los primeros llevan ficha: son los que nombra la idea o los más vendidos.
    ficha: i < 10 ? corto(p.description, 230).replace(/\s+/g, ' ').trim() : '',
  }));
}

let fotosCache = { en: 0, datos: [] };
/** Fotos de trabajos con logo que ya están publicadas en la landing mayorista. */
async function fotosMayoristas() {
  if (Date.now() - fotosCache.en < 3600000) return fotosCache.datos;
  let datos = [];
  try {
    const r = await fetch('https://cotizador-blacks.vercel.app/api/mayorista/config', { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    datos = (d.casos || []).filter((c) => /^https:\/\/\S+\.(jpe?g|png)$/i.test(c.imagen || '')).map((c) => ({ src: c.imagen, que: c.alt || c.titulo }));
  } catch (_) { /* sin fotos: el mail sale con productos o sin imagen */ }
  fotosCache = { en: Date.now(), datos };
  return datos;
}

async function links(para) {
  const sitio = config.storeUrl.replace(/\/+$/, '');
  const fijos = para === 'mayorista'
    ? [{ url: WHATSAPP, que: 'WhatsApp para pedir presupuesto' }, { url: `${sitio}/mayorista-empresas/`, que: 'armar la consulta mayorista' }, { url: `${sitio}/mayorista`, que: 'catálogo mayorista' }]
    : [{ url: `${sitio}/`, que: 'inicio de la tienda' }];
  if (para === 'mayorista') return fijos;
  try {
    const c = await require('../storeCategories').categorias();
    return [...fijos, ...(c.vendibles || []).slice(0, 24).map((x) => ({ url: `${sitio}${x.url}`, que: `sección ${x.ruta || x.nombre}` }))];
  } catch (_) { return fijos; }
}

/* ------------------------------ Lo que se pide ------------------------------ */

const BLOQUES = `Bloques disponibles (JSON). Usá sólo estos campos:
- {"tipo":"titulo","antetitulo":"hasta 30 letras, opcional","titulo":"hasta 45 letras","bajada":"hasta 140 letras, opcional","alinear":"centro|izquierda"}
- {"tipo":"texto","texto":"párrafos separados por una línea vacía; **negrita**; {nombre} pone el nombre de la persona","alinear":"izquierda|centro"}
- {"tipo":"estrella","id":ID,"nombre":"nombre corto opcional","detalle":"una frase opcional","boton":"Comprar"}  → un producto grande con precio
- {"tipo":"productos","titulo":"opcional","ids":[ID],"columnas":1|2|3,"boton":"Comprar"}  → 1 = foto al lado de los datos; 2 = grilla de a dos (4 productos quedan bien); 3 = tres chicos
- {"tipo":"foto_texto","id":ID,"titulo":"","texto":"dos frases","boton":"","lado":"izquierda|derecha"}  → foto de un producto con texto al lado
- {"tipo":"imagen","id":ID,"aSangre":true|false}  → sólo la foto del producto
- {"tipo":"banda","titulo":"","texto":"","boton":"opcional","url":"","color":"acento|tinta|suave"}  → franja de color para un mensaje fuerte
- {"tipo":"boton","texto":"2 a 4 palabras con verbo","url":""}
- {"tipo":"lista","titulo":"opcional","items":["hasta 6 frases cortas"]}
- {"tipo":"pasos","titulo":"opcional","items":["hasta 4 pasos en orden"]}  → sólo si de verdad es una secuencia
- {"tipo":"beneficios","items":["2 a 4, muy cortos"]}
- {"tipo":"cupon","texto":"","codigo":""}  → sólo si la idea trae un código
- {"tipo":"separador"}
- {"tipo":"firma","texto":""}`;

function instrucciones(para) {
  return `Sos quien diseña y escribe los mails de BLACKS, una tienda argentina de ropa de trabajo y urbana. Armás mails minimalistas, modernos y que venden.

CÓMO DISEÑÁS
Un mail tiene UNA idea y un camino claro. Cada bloque tiene que ganarse su lugar: si lo sacás y no se pierde nada, no va. Elegí la estructura según de qué es el mail:
- Aviso (horarios, feriado, cambio): titulo corto, texto, y como mucho un boton. Sin productos, sin banda, sin beneficios.
- Un producto: titulo, estrella, y a lo sumo una lista con 2 o 3 datos de su ficha.
- Varios en oferta: titulo, estrella con el principal, productos, y una banda sólo si hay una condición importante (una fecha o un regalo).
- Guía o comparación: titulo a la izquierda, 3 o 4 foto_texto alternando el lado, boton.
- Lanzamiento o temporada: imagen a sangre primero, titulo a la izquierda, texto breve, productos.
- Empresas, cómo es el proceso: titulo, foto_texto, pasos, banda con WhatsApp.
- Historia o marca: imagen, texto más largo, firma.
Se pueden mezclar, pero casi ningún mail necesita más de 6 bloques. "beneficios" va sólo en mails de venta, al final, y no repite lo que ya dijiste. "separador" casi nunca. Los bloques estrella y productos ya traen su botón: un boton aparte sólo si lleva a otro lado. No cierres siempre igual.
tema "negro" sólo para Black Friday o fechas fuertes; si no, "claro". La banda "acento" es naranja: usala una vez, para lo más importante.

CÓMO ESCRIBÍS
- Voseo rioplatense, frases cortas y concretas. Ortografía y concordancia perfectas. Mayúscula sólo al empezar la frase y en nombres propios.
- Sin emojis ni signos de exclamación. Sin frases de publicidad: nada de "no te lo pierdas", "imperdible", "descubrí", "renová tu placard", "de primera calidad", "ideal para", "pensado para", "al próximo nivel", "llegó el momento".
- El asunto dice qué hay adentro, en 25 a 45 letras. El preheader suma un dato, no repite el asunto.
- Decí las condiciones tal cual vienen en la idea, sin cambiarles el alcance: si la idea dice "llevando 2 jeans", no es "llevando 2 prendas".
- ${para === 'mayorista' ? 'El mail es para EMPRESAS que visten a su equipo: hablá de su equipo, el logo, la muestra digital y la Factura A. Sin precios, sin cuotas, sin prometer envío gratis, sin las palabras "mayorista" ni "oferta". Las prendas se muestran para consultar. El botón lleva a WhatsApp o a la consulta.' : 'El mail es para personas que compran en la tienda online. Cuotas: "3 y 6 cuotas sin interés". El envío gratis es desde $45.000 de compra.'}

QUÉ NO PODÉS INVENTAR
- De una prenda sólo podés decir lo que está en su nombre o en su ficha. Si no tiene ficha, hablá del uso en general o no digas nada: nada de costuras, telas, refuerzos ni duración inventados.
- Precios, descuentos, plazos, stock, cupones, testimonios, fechas ni compromisos ("despachamos al día siguiente"). Sólo los que trae la idea o los datos del negocio.
- No escribas el precio de los productos en los textos, salvo el que diga la idea: el sistema lo pone solo debajo de cada uno.
- Un precio es por unidad: no lo juntes con una promo por cantidad en la misma frase (mal: "llevá 2 a $39.999"; bien: "El jean a $39.999. Llevando 2, el envío es gratis").
- Nada que no se pueda comprobar: "el más barato del año", "últimas unidades", "los mejores", "garantizamos".
- No nombres el año. Sólo los productos (por id) y los links de las listas.`;
}

/* ------------------------------- Controles ------------------------------- */

// "GUÍA DE COMPRA" → "Guía de compra". Las siglas cortas (EPP, OFF) quedan.
const sinGritar = (s) => (s.length > 6 && s === s.toUpperCase() && /\p{Lu}{4}/u.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** Números que afirman algo: precios, porcentajes, cantidades y fechas. */
function afirmaciones(texto) {
  const t = String(texto || '');
  const salen = [];
  for (const m of t.matchAll(/\$\s?\d[\d.]*/g)) salen.push(m[0]);
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?\s?%/g)) salen.push(m[0]);
  for (const m of t.matchAll(/\b\d{1,3}\s*(?:cuotas|días|dias|horas|unidades|pares|prendas|meses|x|por)\b/gi)) salen.push(m[0]);
  for (const m of t.matchAll(/\b\d{1,2}\s+(?:y\s+\d{1,2}\s+)?de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi)) salen.push(m[0]);
  for (const m of t.matchAll(/\b\d{1,2}\/\d{1,2}\b/g)) salen.push(m[0]);
  return salen;
}

const numeros = (s) => (String(s).match(/\d[\d.]*/g) || []).map((x) => x.replace(/\./g, '')).filter(Boolean);

/**
 * Lo que el texto afirma y nadie le dijo. Las fechas sólo pueden salir de la idea: si
 * se buscaran en los datos del negocio, el 9 del teléfono "autorizaría" un 9 de diciembre.
 */
function sinRespaldo(textos, fuentes, fuentesFecha = fuentes) {
  const permitidos = new Set(numeros(fuentes));
  const fechas = new Set(numeros(fuentesFecha));
  const esFecha = (a) => /\bde\s+[a-z]{4,}|\d\/\d/i.test(a);
  return [...new Set(textos.flatMap(afirmaciones).filter((a) => numeros(a).some((n) => !(esFecha(a) ? fechas : permitidos).has(n))))];
}

const PROHIBIDAS = /no te lo pierdas|no te pierdas|imperdible|últimas unidades|ultimas unidades|m[aá]s barat[oa]s? del a[ñn]o|m[aá]s bajos del a[ñn]o|mejores? precios? del mercado|al pr[oó]ximo nivel|est[aá]s list[oa]|de primera calidad|descubr[ií]|renov[aá] tu|garantizamos|costuras? (?:dobles?|triples?|reforzadas?)|lleg[oó] el momento/i;
const PROHIBIDAS_EMPRESAS = /env[ií]os? gratis|sin cargo|cuotas|\bofertas?\b/i;

/**
 * El envío gratis siempre tiene condición (desde $45.000 o llevando 2): decirlo suelto,
 * o pegado al precio de una prenda, promete algo que el carrito después no da.
 */
const envioSinCondicion = (t) => /env[ií]os?\s+(?:es\s+|sale\s+|va\s+)?(?:gratis|sin cargo|sin costo)/i.test(t) && !/llev|compr[aá]ndo|compr[aá]s|sumando|(?:desde|superando|a partir de)\s+(?:los\s+)?\$|\b2\b|\bdos\b|\$\s?45\.000/i.test(t);

function textosDe(r) {
  const t = [r.asunto, r.preheader, ...(r.asuntos || [])];
  for (const b of r.bloques || []) for (const k of ['antetitulo', 'titulo', 'bajada', 'texto', 'nombre', 'detalle', 'boton', 'codigo']) if (b[k]) t.push(b[k]);
  for (const b of r.bloques || []) for (const x of b.items || []) t.push(x);
  return t.filter(Boolean);
}

const prolijo = (x, n) => {
  const s = sinGritar(corto(x, n)).replace(/\s*\b20\d\d\b/g, '').replace(/[ \t]{2,}/g, ' ').replace(/black friday/gi, 'Black Friday').replace(/\b(pampero|gurre|ombú|blacks)\b/gi, (m) => (m.toLowerCase() === 'blacks' ? 'BLACKS' : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())).replace(/!{1,}/g, '.').replace(/¡/g, '').replace(/\.{2,}/g, '.').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/[ \t]{2,}/g, ' ').trim();
  // Los modelos de respaldo se comen tildes en palabras que acá aparecen siempre.
  const conTildes = s.replace(/\b(envio|envios|dias|clasico|clasica|clasicos|algodon|pantalon|ultimo|ultimos|credito)\b/gi, (m) => {
    const b = { envio: 'envío', envios: 'envíos', dias: 'días', clasico: 'clásico', clasica: 'clásica', clasicos: 'clásicos', algodon: 'algodón', pantalon: 'pantalón', ultimo: 'último', ultimos: 'últimos', credito: 'crédito' }[m.toLowerCase()];
    return m[0] === m[0].toUpperCase() ? b[0].toUpperCase() + b.slice(1) : b;
  });
  return conTildes.replace(/(^|[.!?]\s+|\n)(¿?)(\p{Ll})/gu, (_, a, q, l) => a + q + l.toUpperCase());
};

/** De lo que devolvió la IA a un mail que se puede dibujar. Nunca confía en ids ni en links. */
function sanear(r, { ids, urls, fotos, para, sitio }) {
  const primera = urls[0];
  const bloques = limpiarBloques(r.bloques).map((b) => {
    const x = { ...b };
    for (const k of ['antetitulo', 'titulo', 'bajada', 'texto', 'nombre', 'detalle', 'alt']) if (x[k]) x[k] = prolijo(x[k], 4000);
    if (x.boton) x.boton = prolijo(x.boton, 40).replace(/\.$/, '');
    if (x.tipo === 'boton' && x.texto) x.texto = x.texto.replace(/\.$/, '');
    if (x.items) x.items = x.items.map((i) => prolijo(i, 160)).filter(Boolean);
    if (x.titulo) x.titulo = x.titulo.replace(/([^.])\.$/, '$1');
    if (x.id && !ids.has(x.id)) x.id = null;
    if (x.ids) x.ids = [...new Set(x.ids.filter((i) => ids.has(i)))];
    if (x.src && !fotos.includes(x.src)) x.src = '';
    if (x.url && !urls.includes(x.url) && !String(x.url).startsWith(`${sitio}/productos/`)) x.url = primera;
    if (para === 'mayorista' && ['estrella', 'productos'].includes(x.tipo)) { x.sinPrecio = true; if (/compr/i.test(x.boton || '')) x.boton = 'Pedir presupuesto'; }
    return x;
  }).filter((b) => {
    if (b.tipo === 'estrella') return Boolean(b.id);
    if (b.tipo === 'productos') return b.ids.length > 0;
    if (b.tipo === 'imagen') return Boolean(b.id || b.src);
    if (b.tipo === 'foto_texto') return Boolean(b.id || b.src);
    if (['beneficios', 'lista', 'pasos'].includes(b.tipo)) return b.items.length > 0;
    if (b.tipo === 'cupon') return Boolean(b.codigo);
    if (b.tipo === 'boton') { if (!b.url) b.url = primera; return Boolean(b.texto); }
    if (b.tipo === 'banda') { if (b.boton && !b.url) b.url = primera; return Boolean(b.titulo || b.texto); }
    if (b.tipo === 'titulo') return Boolean(b.titulo);
    if (['texto', 'firma'].includes(b.tipo)) return Boolean(b.texto);
    return true;
  });
  // Sin separadores colgados al principio, al final o repetidos, ni dos botones seguidos.
  const orden = bloques.filter((b, i, a) => {
    const ant = a[i - 1];
    // Los beneficios ya vienen con sus líneas: un separador pegado queda doble.
    if (b.tipo === 'separador') return i > 0 && i < a.length - 1 && ant.tipo !== 'separador' && ant.tipo !== 'beneficios' && a[i + 1].tipo !== 'beneficios';
    if (b.tipo === 'boton') return !ant || ant.tipo !== 'boton';
    return true;
  }).slice(0, 12);
  const hayCamino = orden.some((b) => ['boton', 'estrella', 'productos'].includes(b.tipo) || (['banda', 'foto_texto'].includes(b.tipo) && b.boton));
  if (!hayCamino && orden.length) orden.push({ tipo: 'boton', texto: para === 'mayorista' ? 'Pedir presupuesto' : 'Ver la tienda', url: primera });
  const asuntos = [r.asunto, ...(Array.isArray(r.asuntos) ? r.asuntos : [])].map((x) => prolijo(x, 80).replace(/\.$/, '')).filter(Boolean);
  return {
    nombre: prolijo(corto(r.nombre, 60).replace(/_+/g, ' '), 60).replace(/\.$/, '') || asuntos[0] || 'Mail con IA',
    asunto: asuntos[0] || '', asuntos: [...new Set(asuntos)].slice(0, 3), preheader: prolijo(r.preheader, 120),
    tema: TEMAS[r.tema] ? r.tema : 'claro', bloques: orden,
  };
}

/* -------------------------------- Principal -------------------------------- */

/**
 * @param idea    qué mail se quiere, o qué cambiarle al actual
 * @param para    'minorista' | 'mayorista'
 * @param actual  { asunto, preheader, tema, precios, bloques } para pedir un cambio
 */
async function componer({ idea, para = 'minorista', actual = null } = {}) {
  const pedido = corto(idea, 1500).trim();
  if (pedido.length < 4) throw error(400, actual ? 'Contá qué querés cambiar.' : 'Contá en una o dos frases de qué es el mail.');
  const publico = para === 'mayorista' ? 'mayorista' : 'minorista';
  const { generateJson } = require('../ai');
  const { getCompanyFacts } = require('../companyInfo');
  const oferta = publico === 'minorista' ? await preciosProgramados() : new Map();
  const bloquesActuales = actual ? limpiarBloques(actual.bloques) : [];
  const fijos = bloquesActuales.flatMap((b) => [b.id, ...(b.ids || [])]).filter(Boolean);
  const textoBusqueda = `${pedido} ${bloquesActuales.map((b) => `${b.titulo || ''} ${b.texto || ''}`).join(' ')}`;
  const [prods, urls, fotos, hechos] = await Promise.all([
    catalogo({ texto: textoBusqueda, para: publico, oferta, fijos }), links(publico),
    publico === 'mayorista' ? fotosMayoristas() : [], getCompanyFacts().catch(() => null),
  ]);
  const datos = corto((hechos && hechos.facts_summary) || '', 5000);
  const usaOferta = oferta.size > 0 && /black|cyber|oferta|evento|descuento/i.test(pedido);
  const previos = actual ? [] : (await pool.query("SELECT bloques FROM email_campaigns ORDER BY id DESC LIMIT 4").catch(() => ({ rows: [] }))).rows.map((x) => (x.bloques || []).map((y) => y.tipo).join(' > ')).filter(Boolean);
  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: config.timezone });

  const listaProd = prods.map((p) => `${p.id} · ${p.nombre}${publico === 'mayorista' ? '' : ` · $${(usaOferta && p.oferta ? p.oferta : p.precio).toLocaleString('es-AR')}${usaOferta && p.oferta ? ' (precio de la oferta)' : ''}${p.precio < p.lista ? ` · antes $${p.lista.toLocaleString('es-AR')}` : ''} · ${p.vendidos30d} vendidos en 30 días`}${p.ficha ? `\n    ficha: ${p.ficha}` : ''}`).join('\n');
  const base = `Hoy es ${hoy}.
${actual ? `MAIL ACTUAL:\n${JSON.stringify({ asunto: actual.asunto, preheader: actual.preheader, tema: actual.tema, bloques: bloquesActuales })}\n\nPEDIDO DE CAMBIO: ${pedido}\nHacé sólo lo que pide y dejá el resto igual (devolvé el mail completo).` : `IDEA: ${pedido}`}

PRODUCTOS (id · nombre${publico === 'mayorista' ? '' : ' · precio'}):
${listaProd || 'ninguno'}

LINKS:
${urls.map((u) => `${u.url} → ${u.que}`).join('\n')}
${fotos.length ? `\nFOTOS DE TRABAJOS (van en "src" de imagen o foto_texto, sin id):\n${fotos.map((f) => `${f.src} → ${f.que}`).join('\n')}\n` : ''}
DATOS DEL NEGOCIO (verificados):
${datos}

${BLOQUES}
${previos.length ? `\nEstructuras de los últimos mails (hacé una distinta si la idea lo permite):\n${previos.join('\n')}\n` : ''}
Devolvé SÓLO este JSON: {"nombre":"nombre interno, hasta 40 letras","asunto":"","asuntos":["otros 2 asuntos distintos"],"preheader":"","tema":"claro|negro","bloques":[...]}`;

  const opciones = { ids: new Set(prods.map((p) => p.id)), urls: urls.map((u) => u.url), fotos: fotos.map((f) => f.src), para: publico, sitio: config.storeUrl.replace(/\/+$/, '') };
  const fuentes = [pedido, datos, hoy, '45.000 3 6', actual ? JSON.stringify(actual) : ''].join(' ');
  const fechas = [pedido, hoy, actual ? JSON.stringify(actual) : ''].join(' ');
  const problemasDe = (r) => {
    const t = textosDe(r);
    const p = sinRespaldo(t, fuentes, fechas).map((x) => `"${x}" no está en la idea ni en los datos`);
    for (const x of t) {
      const m = x.match(PROHIBIDAS) || (publico === 'mayorista' && x.match(PROHIBIDAS_EMPRESAS));
      if (m) p.push(`sacá "${m[0]}"`);
    }
    const porBloque = [r.asunto, r.preheader, ...r.bloques.map((b) => [b.antetitulo, b.titulo, b.bajada, b.texto, b.detalle, ...(b.items || [])].filter(Boolean).join('. '))];
    if (porBloque.some((x) => x && envioSinCondicion(x))) p.push('el envío gratis tiene que ir con su condición (desde $45.000 o llevando 2)');
    if (r.bloques.length < 2) p.push('faltan bloques');
    if (!r.asunto) p.push('falta el asunto');
    return [...new Set(p)];
  };

  const pedir = async (extra = '', temperature = 0.75) => sanear(await generateJson({ system: instrucciones(publico), prompt: base + extra, maxTokens: 5000, temperature, thinkingBudget: 1024 }), opciones);
  let r = await pedir();
  let problemas = problemasDe(r);
  // Siempre hay una segunda mirada: el primer intento suele traer relleno, algún error
  // de ortografía y detalles de prendas que no están en la ficha.
  // En un cambio puntual sólo se repasa si algo quedó mal: si no, el repaso deshace el pedido.
  const otra = actual && !problemas.length ? null : await pedir(`\n\nBORRADOR QUE ESCRIBIÓ OTRA PERSONA:\n${JSON.stringify({ nombre: r.nombre, asunto: r.asunto, asuntos: r.asuntos.slice(1), preheader: r.preheader, tema: r.tema, bloques: r.bloques })}\n\nCorregilo como editor exigente y devolvé el mail completo, en el mismo JSON:\n1. Ortografía y concordancia.\n2. Sacá todo bloque o frase que no aporte, y lo que se repita.\n3. Sacá cualquier dato de una prenda que no esté en su nombre o ficha, y cualquier compromiso que no esté en la idea o en los datos.\n4. Que las condiciones digan exactamente lo mismo que la idea.${problemas.length ? `\n5. Además: ${problemas.join('; ')}.` : ''}\nSi algo ya está bien, dejalo igual.`, 0.3).catch(() => null);
  if (otra && otra.bloques.length) { const p2 = problemasDe(otra); if (p2.length <= problemas.length) { r = otra; problemas = p2; } }
  // El color del fondo se obedece siempre, aunque el modelo se distraiga.
  const fondo = llano(pedido).match(/fondo (claro|blanco|negro|oscuro)/);
  if (fondo) r.tema = ['claro', 'blanco'].includes(fondo[1]) ? 'claro' : 'negro';
  if (!r.bloques.length) throw error(502, 'La IA no pudo armar el mail. Probá contarlo con otras palabras.');
  const usados = r.bloques.flatMap((b) => [b.id, ...(b.ids || [])]).filter(Boolean);
  return {
    ...r, revisar: problemas,
    precios: actual && actual.precios ? actual.precios : (usaOferta && usados.some((i) => oferta.has(Number(i))) ? 'oferta' : 'tienda'),
    descuento_transferencia: publico === 'mayorista' ? 0 : 10,
    productos: usados.length ? (await pool.query('SELECT id, name, price, promo_price, stock, image_url, permalink FROM products_cache WHERE id = ANY($1::bigint[])', [usados])).rows : [],
  };
}

/* ---------------------- El lapicito: asunto y adelanto ---------------------- */

const TONOS = {
  directo: 'Directo: decí lo concreto, sin vueltas ni adjetivos.',
  cercano: 'Cercano: como el mensaje de alguien conocido, cálido y simple.',
  curioso: 'Curioso: dejá una pregunta o un dato que dé ganas de abrir, sin engañar: lo que insinúa tiene que estar en el mail.',
  urgente: 'Con urgencia: remarcá la fecha o el plazo SÓLO si figura en el mail. Si no hay fecha, no inventes ninguna ni digas "últimas horas".',
  elegante: 'Elegante: sobrio y corto, como una marca cuidada.',
  divertido: 'Divertido: un guiño con humor liviano, sin chistes sobre personas.',
};

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/gu;

/** Con emojis: uno solo, al principio o al final. Sin emojis: ninguno. */
function limpiarOpcion(texto, { campo, emojis }) {
  const crudo = corto(texto, 160).replace(/["“”«»]/g, '').trim();
  const hallados = crudo.match(EMOJI) || [];
  const alPrincipio = hallados.length > 0 && crudo.startsWith(hallados[0]);
  let limpio = prolijo(crudo, 160);
  if (campo === 'asunto') limpio = limpio.replace(/\.$/, '');
  if (!limpio || !emojis || !hallados.length) return limpio;
  return alPrincipio ? `${hallados[0]} ${limpio}` : `${limpio} ${hallados[0]}`;
}

const LARGO = { asunto: [12, 62], preheader: [20, 110] };

/** Cuatro maneras de decir el asunto o el texto de al lado, en el tono pedido. */
async function mejorar({ campo, texto = '', tono = 'directo', emojis = false, para = 'minorista', mail = {} } = {}) {
  if (!LARGO[campo]) throw error(400, 'Ese campo no se puede mejorar.');
  const t = TONOS[tono] ? tono : 'directo';
  const { generateJson } = require('../ai');
  const { getCompanyFacts } = require('../companyInfo');
  const { productosDeCache } = require('./campanas');
  const bloques = limpiarBloques(mail.bloques);
  const [prods, hechos] = await Promise.all([productosDeCache(bloques, mail.precios), getCompanyFacts().catch(() => null)]);
  const publico = para === 'mayorista' ? 'mayorista' : 'minorista';
  const contenido = textosDe({ bloques }).join(' | ');
  const lista = [...prods.values()].map((p) => `${p.name}${publico === 'mayorista' || !Number(p.price) ? '' : ` $${Math.round(Number(p.promo_price || p.price)).toLocaleString('es-AR')}`}`).join('; ');
  const actual = corto(texto, 150).trim();
  const otro = corto(campo === 'asunto' ? mail.preheader : mail.asunto, 150).trim();
  if (!actual && !contenido && !lista) throw error(400, 'Todavía no hay nada en el mail de donde sacar el texto.');
  const datos = corto((hechos && hechos.facts_summary) || '', 2500);
  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: config.timezone });
  const system = `Escribís ${campo === 'asunto' ? 'asuntos' : 'textos de adelanto (los que se ven al lado del asunto en la bandeja)'} de mails para BLACKS, una tienda argentina de ropa de trabajo y urbana. Voseo rioplatense, ortografía perfecta, mayúscula sólo al empezar y en nombres propios. Sin signos de exclamación, sin mayúsculas sostenidas, sin frases de publicidad ("no te lo pierdas", "imperdible", "descubrí"). No inventás precios, descuentos, fechas, plazos ni stock: sólo lo que está en el mail o en los datos. Un precio es por unidad: no lo juntes con una promo por cantidad. El envío gratis va siempre con su condición. No hables de cuotas. No nombrás el año.${publico === 'mayorista' ? ' Le hablás a empresas: sin precios, sin cuotas, sin "ofertas" ni envío gratis.' : ''}
${emojis ? 'Cada opción lleva UN emoji que tenga que ver con lo que dice, al principio o al final.' : 'Sin ningún emoji.'}
${TONOS[t]}
${campo === 'asunto' ? 'Cada asunto: 25 a 45 letras. Que se entienda qué hay adentro.' : 'Cada texto: 40 a 85 letras. Suma un dato que el asunto no dice y no lo repite.'}`;
  const prompt = `Hoy es ${hoy}.\n${actual ? `${campo === 'asunto' ? 'ASUNTO' : 'ADELANTO'} ACTUAL: ${actual}` : 'Todavía está vacío.'}\n${otro ? `${campo === 'asunto' ? 'ADELANTO' : 'ASUNTO'} DEL MAIL: ${otro}\n` : ''}CONTENIDO DEL MAIL: ${contenido || 'sin textos todavía'}\nPRODUCTOS: ${lista || 'ninguno'}\nDATOS DEL NEGOCIO: ${datos}\n\n${actual ? 'Mejoralo en el tono pedido: la MISMA idea y el mismo producto, dicho mejor. No cambies de tema.' : 'Proponelo en el tono pedido.'} Como mucho dos opciones en forma de pregunta. Devolvé sólo {"opciones":["6 opciones bien distintas entre sí"]}`;
  const fuentes = [actual, otro, contenido, lista, datos].join(' ');
  const fechas = [actual, otro, contenido, hoy].join(' ');
  const [min, max] = LARGO[campo];
  const vistas = new Set([llano(actual)]);
  const buenas = [];
  const juntar = (opciones) => {
    for (const x of Array.isArray(opciones) ? opciones : []) {
      const o = limpiarOpcion(x, { campo, emojis });
      const clave = llano(o.replace(EMOJI, '')).trim();
      if (o.length < min || o.length > max || vistas.has(clave) || PROHIBIDAS.test(o)) continue;
      if (publico === 'mayorista' && PROHIBIDAS_EMPRESAS.test(o)) continue;
      if (sinRespaldo([o], fuentes, fechas).length || envioSinCondicion(o)) continue;
      if (/cuotas/i.test(o) && !/cuotas/i.test(actual)) continue;
      // Un precio al lado de "envío gratis" se lee como que una sola prenda viaja gratis.
      if (o.split(/[.;]\s/).some((x) => /\$\s?\d/.test(x.replace(/\$\s?45\.000/g, '')) && /env[ií]o|sin cargo/i.test(x))) continue;
      // "a 39.999" sin el signo.
      if (/(?<![$\d.])\b\d{2,3}\.\d{3}\b/.test(o.replace(/\$\s+/g, '$'))) continue;
      if (o.includes('¿') && buenas.filter((b) => b.includes('¿')).length >= 2) continue;
      vistas.add(clave);
      buenas.push(o);
    }
  };
  juntar((await generateJson({ system, prompt, maxTokens: 900, temperature: 0.9 })).opciones);
  if (buenas.length < 3) juntar((await generateJson({ system, prompt: `${prompt}\nMuchas opciones se descartaron por inventar datos o por el largo: respetá las reglas.`, maxTokens: 900, temperature: 0.6 }).catch(() => ({}))).opciones);
  if (!buenas.length) throw error(502, 'No salió ninguna opción que respete los datos del mail. Probá con otro tono.');
  return { opciones: buenas.slice(0, 4) };
}

module.exports = { componer, mejorar, limpiarOpcion, envioSinCondicion, sanear, sinRespaldo, afirmaciones, textosDe, prolijo };
