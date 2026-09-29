/* =========================================================================
 * IDEAS DE FOTO A PARTIR DE UNA PRENDA REAL
 *
 * Lo usa el bloque "Vidriera de fotos" del home: el dueño elige la prenda de una
 * placa y acá se le proponen varias fotos posibles (estudio con fondo de color,
 * calle, lugar de trabajo, detalle de tela, bodegón…) cada una con el prompt
 * listo para pegar en Gemini o ChatGPT — o para generarla desde el panel.
 *
 * POR QUÉ LAS IDEAS BASE NO LAS ESCRIBE UN MODELO
 * Salen de los DATOS de la prenda, no de la imaginación de nadie:
 *   - el tipo de prenda y la tela, del nombre y la ficha;
 *   - el COLOR, de las variantes con stock (nunca de mirar la foto: ver
 *     channelVisualCatalog.js), así la foto nunca muestra un color agotado;
 *   - las fotos de referencia, las de ESE color;
 *   - los rasgos ("Triple costura", "Tejido ripstop"), de la ficha real.
 * Así funcionan siempre, gratis y al instante, aunque la cuenta de Gemini esté
 * sin crédito (pasó en sep-2026). La IA de texto se usa aparte, sólo si el dueño
 * pide "otras ideas con IA", y aun ahí el modelo propone la ESCENA: la parte de
 * la prenda (qué es, qué color, qué no se toca) la sigue armando este archivo.
 *
 * LA FOTO SE VA A VER CHICA
 * Una placa de la vidriera mide lo que una tarjeta de producto: ~145 px de ancho
 * en celular. Todos los prompts piden lo mismo por eso: un solo sujeto, la
 * prenda grande, fondo simple y con contraste. Una escena linda llena de
 * detalles, a ese tamaño, es una mancha.
 * ========================================================================= */

const pool = require('./db');
const { visualCatalog, catalogPhotos } = require('./channelVisualCatalog');
const { specsFor } = require('./whatsappVisual');
const { productPath } = require('./homeRails');
const { promptDeFoto } = require('./homeCopy');

/* ------------------------------------------------------------ utilidades -- */

function sinTildes(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Elige de una lista de forma estable para un seed (mismo seed = misma idea). */
function elegir(lista, seed, salto = 0) {
  if (!lista.length) return null;
  const n = Math.abs(Math.trunc(Number(seed) || 0)) + salto;
  return lista[n % lista.length];
}

const RATIOS = { '3-4': '3:4', '4-5': '4:5', '1-1': '1:1', '2-3': '2:3', '9-16': '9:16' };

/* ------------------------------------------------------- tipo de prenda -- */

/* El orden importa: lo más específico primero. "Bermuda Cargo" tiene que ser
   bermuda y no pantalón; "Pantalón Jean" tiene que ser jean. */
const TIPOS = [
  { re: /\b(mameluco|overol|enterito)\b/, tipo: 'mameluco', es: 'mameluco', en: 'work coverall', zona: 'entero' },
  { re: /\b(borcegu\w*)\b/, tipo: 'borcegui', es: 'borceguí', en: 'lace-up leather work boots', zona: 'calzado', par: true },
  { re: /\b(botin\w*|bota|botas)\b/, tipo: 'botin', es: 'botín', en: 'work boots', zona: 'calzado', par: true },
  { re: /\b(zapatilla\w*)\b/, tipo: 'zapatilla', g: 'f', es: 'zapatilla', en: 'sneakers', zona: 'calzado', par: true },
  { re: /\b(alpargata\w*)\b/, tipo: 'alpargata', g: 'f', es: 'alpargata', en: 'canvas espadrilles', zona: 'calzado', par: true },
  { re: /\b(zapato\w*|calzado)\b/, tipo: 'calzado', es: 'calzado', en: 'work shoes', zona: 'calzado', par: true },
  { re: /\b(bermuda\w*|short\w*)\b/, tipo: 'bermuda', g: 'f', es: 'bermuda', en: 'shorts', zona: 'abajo' },
  { re: /\b(jean\w*|vaquer\w*|denim)\b/, tipo: 'jean', es: 'jean', en: 'jeans', zona: 'abajo' },
  { re: /\b(jogger\w*)\b/, tipo: 'jogger', es: 'jogger', en: 'joggers', zona: 'abajo' },
  { re: /\b(pantal\w*|cargo)\b/, tipo: 'pantalon', es: 'pantalón', en: 'work trousers', zona: 'abajo' },
  { re: /\b(chaleco\w*)\b/, tipo: 'chaleco', es: 'chaleco', en: 'vest', zona: 'arriba' },
  { re: /\b(campera\w*|parka|chaqueta|rompeviento\w*|softshell)\b/, tipo: 'campera', g: 'f', es: 'campera', en: 'jacket', zona: 'abrigo' },
  { re: /\b(polar\w*)\b/, tipo: 'polar', es: 'polar', en: 'fleece jacket', zona: 'abrigo' },
  { re: /\b(buzo\w*|hoodie|canguro)\b/, tipo: 'buzo', es: 'buzo', en: 'sweatshirt', zona: 'arriba' },
  { re: /\b(chomba\w*|polo)\b/, tipo: 'chomba', g: 'f', es: 'chomba', en: 'polo shirt', zona: 'arriba' },
  { re: /\b(camisa\w*|camisaco)\b/, tipo: 'camisa', g: 'f', es: 'camisa', en: 'work shirt', zona: 'arriba' },
  { re: /\b(remera\w*|camiseta\w*|musculosa\w*)\b/, tipo: 'remera', g: 'f', es: 'remera', en: 't-shirt', zona: 'arriba' },
  { re: /\b(guante\w*)\b/, tipo: 'guantes', g: 'mp', es: 'guantes', en: 'work gloves', zona: 'accesorio', par: true },
  { re: /\b(gorra\w*|gorro\w*|sombrero\w*)\b/, tipo: 'gorra', g: 'f', es: 'gorra', en: 'cap', zona: 'accesorio' },
  { re: /\b(casco\w*)\b/, tipo: 'casco', es: 'casco', en: 'hard hat', zona: 'accesorio' },
  { re: /\b(anteojo\w*|lente\w*|gafa\w*)\b/, tipo: 'anteojos', g: 'mp', es: 'anteojos', en: 'safety glasses', zona: 'accesorio' },
  { re: /\b(media|medias|calcetin\w*)\b/, tipo: 'medias', g: 'fp', es: 'medias', en: 'socks', zona: 'accesorio', par: true },
  { re: /\b(faja\w*)\b/, tipo: 'faja', g: 'f', es: 'faja', en: 'lumbar support belt', zona: 'accesorio' },
];

const TELAS = [
  { re: /ripstop|rip stop|antidesgarro/, es: 'ripstop', en: 'ripstop fabric with its visible square grid weave' },
  { re: /\bgrafa\b/, es: 'grafa', en: 'heavy Grafa cotton twill workwear fabric' },
  { re: /gabardina/, es: 'gabardina', en: 'cotton gabardine twill' },
  { re: /\b(jean|denim|vaquer)/, es: 'denim', en: 'denim with its diagonal twill and natural fading' },
  { re: /micropique|pique/, es: 'piqué', en: 'fine piqué knit' },
  { re: /softshell/, es: 'softshell', en: 'softshell fabric' },
  { re: /\bpolar\b/, es: 'polar', en: 'soft fleece' },
  { re: /frisa|frisad/, es: 'frisa', en: 'brushed fleece-backed cotton' },
  { re: /gamuza/, es: 'gamuza', en: 'suede' },
  { re: /\bcuero\b/, es: 'cuero', en: 'full-grain leather' },
  { re: /impermeable|nylon|poliamida/, es: 'nylon', en: 'water-resistant nylon' },
  { re: /\balgodon\b|jersey/, es: 'algodón', en: 'cotton jersey' },
];

/* Colores: el nombre de la variante (castellano) → cómo se lo dice al modelo.
   "Azul" en ropa de trabajo es azul marino, no francia: es lo que vende Pampero. */
const COLORES = {
  negro: ['black', 'oscuro'], blanco: ['white', 'claro'], crudo: ['off-white', 'claro'],
  azul: ['navy blue', 'oscuro'], 'azul marino': ['navy blue', 'oscuro'], 'azul noche': ['midnight blue', 'oscuro'],
  'azul francia': ['royal blue', 'azul'], 'azul oscuro': ['dark indigo', 'azul'], celeste: ['light blue', 'claro'],
  'jean claro': ['light-wash denim', 'azul'], 'jean oscuro': ['dark-wash denim', 'azul'], indigo: ['indigo', 'azul'],
  verde: ['olive green', 'verde'], 'verde oliva': ['olive green', 'verde'], 'verde militar': ['military green', 'verde'],
  beige: ['beige', 'tierra'], arena: ['sand', 'tierra'], kaki: ['khaki', 'tierra'], caqui: ['khaki', 'tierra'],
  khaki: ['khaki', 'tierra'], marron: ['brown', 'tierra'], habano: ['tan brown', 'tierra'], suela: ['tan', 'tierra'],
  camel: ['camel', 'tierra'], topo: ['taupe', 'tierra'], 'gris topo': ['taupe', 'tierra'],
  gris: ['grey', 'oscuro'], 'gris oscuro': ['charcoal grey', 'oscuro'], 'gris claro': ['light grey', 'claro'],
  melange: ['heather grey', 'claro'], 'gris melange': ['heather grey', 'claro'], grafito: ['graphite grey', 'oscuro'],
  bordo: ['burgundy', 'vivo'], rojo: ['red', 'vivo'], naranja: ['orange', 'vivo'], amarillo: ['yellow', 'vivo'],
  'amarillo fluo': ['fluorescent yellow', 'vivo'], 'naranja fluo': ['fluorescent orange', 'vivo'],
  rosa: ['pink', 'claro'], lila: ['lilac', 'claro'],
};

/* Fondo liso que hace resaltar a la prenda según su color. Todos terrosos o de
   la paleta de la marca: nada de fucsia ni turquesa, que en ropa de trabajo se
   leen como otra tienda. [inglés, castellano] */
const FONDOS = {
  oscuro: [['burnt orange', 'naranja quemado'], ['warm sand', 'arena cálida'], ['pale sage green', 'verde salvia']],
  verde: [['terracotta', 'terracota'], ['warm sand', 'arena cálida'], ['bone white', 'blanco hueso']],
  tierra: [['deep forest green', 'verde bosque'], ['charcoal grey', 'gris carbón'], ['dusty blue', 'azul grisáceo']],
  claro: [['cobalt blue', 'azul cobalto'], ['charcoal grey', 'gris carbón'], ['burnt orange', 'naranja quemado']],
  azul: [['mustard ochre', 'ocre mostaza'], ['warm sand', 'arena cálida'], ['burnt orange', 'naranja quemado']],
  vivo: [['charcoal grey', 'gris carbón'], ['bone white', 'blanco hueso'], ['deep navy', 'azul profundo']],
};

function colorEn(nombre) {
  const k = sinTildes(nombre).trim();
  if (COLORES[k]) return { en: COLORES[k][0], familia: COLORES[k][1] };
  // "Verde Musgo" → verde; "Negro/Gris" → negro. La primera palabra conocida manda.
  const primera = k.split(/[\s/-]+/).find((w) => COLORES[w]);
  if (primera) return { en: COLORES[primera][0], familia: COLORES[primera][1] };
  return { en: `"${nombre}" coloured`, familia: 'oscuro' };
}

/* ------------------------------------------------------- castellano ------ */

/** "el pantalón", "la camisa", "los guantes", "las medias". */
function laPrenda(p) {
  const art = { m: 'el', f: 'la', mp: 'los', fp: 'las' }[p.g] || 'el';
  return `${art} ${p.es}`;
}

/** Concuerda un adjetivo terminado en -o con la prenda: doblado → doblada/doblados. */
function concuerda(adj, p) {
  if (!/o$/.test(adj)) return p.g === 'mp' || p.g === 'fp' ? `${adj}s` : adj;
  const raiz = adj.slice(0, -1);
  return { m: adj, f: `${raiz}a`, mp: `${raiz}os`, fp: `${raiz}as` }[p.g] || adj;
}

/** El color de la variante, en minúscula y concordado: "la camisa negra". */
function colorEs(nombre, p) {
  if (!nombre) return '';
  return String(nombre).toLocaleLowerCase('es-AR').split(/\s+/).map((w) => (/^(negro|blanco|rojo|amarillo|morado|oscuro|claro)$/.test(w) ? concuerda(w, p) : w)).join(' ');
}

/* LAVADOS DE JEAN. En los jeans la variante "Color" no trae colores sino
   lavados ("Claro", "Medio 2", "Estático"): decirle al modelo "Claro coloured
   jeans" no significa nada. */
function lavadoDeJean(nombre) {
  const k = sinTildes(nombre);
  if (/negro/.test(k)) return 'black denim';
  if (/nevad|celeste|clar/.test(k)) return 'light-wash blue denim';
  if (/medio/.test(k)) return 'mid-wash blue denim';
  if (/oscur|azul|indigo|rigid|estatic/.test(k)) return 'dark-wash blue denim';
  return null;
}

/* ---------------------------------------------------------- estación ------ */

/** Hemisferio sur. Octubre y noviembre suman los jacarandás de Buenos Aires. */
function estacion(fecha = new Date()) {
  const m = fecha.getMonth() + 1;
  const d = fecha.getDate();
  const md = m * 100 + d;
  if (md >= 921 && md < 1221) return { id: 'primavera', en: 'spring', jacaranda: m === 10 || m === 11 };
  if (md >= 1221 || md < 321) return { id: 'verano', en: 'summer', jacaranda: false };
  if (md >= 321 && md < 621) return { id: 'otono', en: 'autumn', jacaranda: false };
  return { id: 'invierno', en: 'winter', jacaranda: false };
}

/* ------------------------------------------------------ análisis de prenda */

function descripcionDe(row) {
  const d = row.raw && row.raw.description;
  const html = typeof d === 'string' ? d : (d && d.es) || row.description || '';
  return String(html);
}

/**
 * Todo lo que hace falta saber de una prenda para pedir una foto de ella,
 * sacado de los datos del catálogo. No toca la base: recibe la fila.
 */
function analizarPrenda(row) {
  const nombre = String(row.name || '').trim();
  const n = sinTildes(nombre);
  const desc = sinTildes(descripcionDe(row).replace(/<[^>]+>/g, ' '));

  const t = TIPOS.find((x) => x.re.test(n)) || { tipo: 'prenda', g: 'f', es: 'prenda', en: 'garment', zona: 'arriba' };
  let en = t.en;
  // Afinar el sustantivo inglés con lo que dice el nombre.
  if (t.tipo === 'pantalon' && /\bcargo\b/.test(n)) en = 'cargo work trousers';
  if (t.tipo === 'bermuda' && /\bcargo\b/.test(n)) en = 'cargo shorts';
  if (t.tipo === 'chaleco' && /reflectiv|alta visib/.test(n)) en = 'high-visibility safety vest';
  if (t.tipo === 'buzo' && /canguro|hoodie|capucha/.test(n)) en = 'hooded sweatshirt';
  if (t.zona === 'calzado' && /seguridad|puntera/.test(n)) en = t.tipo === 'zapatilla' ? 'safety sneakers with protective toe cap' : `safety ${t.en} with protective toe cap`;
  if (/desmontable/.test(n)) en = `convertible zip-off ${en}`;

  const telaDef = TELAS.find((x) => x.re.test(n)) || TELAS.find((x) => x.re.test(desc)) || null;

  /* Mundos donde la prenda tiene sentido. Una prenda puede estar en varios: un
     cargo ripstop es de trabajo, de calle y de sierra a la vez. */
  const mundos = new Set();
  const todo = `${n} ${desc}`;
  if (/seguridad|puntera|ignifug|reflectiv|alta visib|antiestatic|dielectric|iram/.test(n)) mundos.add('seguridad');
  if (/trekking|desmontable|secado rapido|outdoor|camping|proteccion uv|\buv\b/.test(todo) || (telaDef && telaDef.es === 'ripstop')) mundos.add('aire_libre');
  if (/grafa|mameluco|trabajo|laboral|industria|obra|cargo|ombu|pampero/.test(todo) || ['seguridad'].some((m) => mundos.has(m))) mundos.add('trabajo');
  if (/jean|chomba|remera|buzo|jogger|slim|urbano|alpargata|zapatilla|cargo|bermuda|campera|camisa/.test(n)) mundos.add('urbano');
  if (!mundos.size) mundos.add('urbano');

  /* Lugar de trabajo que le corresponde. Un borceguí de seguridad en un
     depósito o una camisa de campo en una planta química se leen falsos. */
  let lugar = 'taller';
  if (mundos.has('seguridad') && t.zona === 'calzado') lugar = 'obra';
  else if (/reflectiv|alta visib/.test(n)) lugar = 'obra';
  else if (/ignifug|antiestatic|dielectric/.test(n)) lugar = 'planta';
  else if (/grafa|mameluco/.test(n)) lugar = 'taller';
  else if (t.tipo === 'camisa' || /secado rapido|trekking/.test(todo)) lugar = 'campo';
  else if (/cargo|ripstop/.test(n)) lugar = 'deposito';

  // Colores CON STOCK, de las variantes. Nunca de mirar la foto.
  const vc = visualCatalog(row);
  const fotos = catalogPhotos(row);
  const colores = vc.colors
    .filter((c) => c.inStock || c.catalogOnly)
    .map((c) => {
      const lavado = t.tipo === 'jean' ? lavadoDeJean(c.name) : null;
      return {
        nombre: c.name,
        ...(lavado ? { en: lavado, familia: /black/.test(lavado) ? 'oscuro' : 'azul' } : colorEn(c.name)),
        fotos: c.photoIndices.map((i) => fotos[i] && fotos[i].url).filter(Boolean),
      };
    });

  const mujer = /\b(dama|mujer|femenin\w*)\b/.test(n);

  return {
    id: Number(row.id),
    nombre,
    marca: row.brand || null,
    tipo: t.tipo,
    es: t.es,
    g: t.g || 'm',
    en,
    zona: t.zona,
    par: !!t.par,
    tela: telaDef ? { es: telaDef.es, en: telaDef.en } : null,
    mundos: [...mundos],
    lugar,
    colores,
    rasgos: specsFor(row).slice(0, 3),
    fotos: fotos.map((f) => f.url),
    fotoPrincipal: vc.primaryPhoto != null && fotos[vc.primaryPhoto] ? fotos[vc.primaryPhoto].url : (row.image_url || (fotos[0] && fotos[0].url) || null),
    persona: mujer ? 'a woman' : 'a man',
    personaEs: mujer ? 'Modelo mujer' : 'Modelo',
  };
}

/* ------------------------------------------------------------ escenas ------ */

/* [inglés para el prompt, castellano para el dueño] */
const CALLES = [
  ['a cobblestone street in San Telmo, Buenos Aires, with old colonial façades and iron balconies far out of focus', 'una calle empedrada de San Telmo'],
  ['the weathered exposed-brick wall of an old factory in Barracas, Buenos Aires', 'la pared de ladrillo de una vieja fábrica de Barracas'],
  ['a quiet tree-lined street in Palermo, Buenos Aires, with parked cars and trees far out of focus', 'una calle arbolada de Palermo'],
  ['an old railway platform in Buenos Aires with painted iron columns, softly blurred', 'un andén de tren con columnas de hierro'],
];

const LUGARES = {
  obra: ['a real construction site in Argentina: bare concrete columns, timber formwork and rebar, a little dust in the air, background blurred', 'una obra en construcción'],
  taller: ['a tidy metal workshop with a steel workbench and tools hanging on a pegboard, background softly blurred', 'un taller metalúrgico'],
  deposito: ['a logistics warehouse aisle with tall pallet racks, background softly blurred', 'un depósito logístico'],
  campo: ['an open rural shed in the Argentine pampas with hay bales and a tractor far out of focus', 'un galpón de campo'],
  planta: ['an industrial plant floor with painted yellow safety lines and steel structures, background blurred', 'una planta industrial'],
};

const AIRE_LIBRE = [
  ['a rocky trail in the Sierras de Córdoba with dry golden grass and low hills behind', 'un sendero de las Sierras de Córdoba'],
  ['the open Patagonian steppe with low shrubs and a wide pale sky', 'la estepa patagónica'],
  ['a wooden dock in the Tigre river delta with green vegetation behind', 'un muelle del Delta del Tigre'],
];

const SOMBRAS = [
  ['a sunlit off-white plaster wall with crisp shadows of palm leaves falling across it', 'una pared blanca al sol con sombras de hojas'],
  ['a sunlit ochre stucco wall with a sharp diagonal window shadow', 'una pared ocre al sol con la sombra de una ventana'],
];

const SUPERFICIES = [
  ['a raw polished-concrete floor, seen from directly above', 'un piso de cemento alisado, visto desde arriba'],
  ['a worn wooden workbench seen from directly above, with a mate gourd and a steel thermos just at the edge of frame', 'un banco de madera gastada con un mate y un termo al borde'],
  ['a sheet of weathered galvanised steel, seen from directly above', 'una chapa galvanizada gastada, vista desde arriba'],
];

/* ------------------------------------------------------- piezas del prompt */

/** Con qué más va vestido el modelo, para que la prenda elegida sea la única que
    importa. Las que ya están en el conjunto no se inventan. */
function estilismo(prendas) {
  const zonas = new Set(prendas.map((p) => p.zona));
  const urbano = prendas.some((p) => p.mundos.includes('urbano') && !p.mundos.includes('seguridad'));
  const partes = [];
  if (!zonas.has('arriba') && !zonas.has('abrigo') && !zonas.has('entero')) partes.push('a plain crew-neck t-shirt in a neutral tone');
  if (!zonas.has('abajo') && !zonas.has('entero')) partes.push('plain dark work trousers');
  if (!zonas.has('calzado')) partes.push(urbano ? 'simple leather boots' : 'plain work boots');
  if (!partes.length) return '';
  return ` Styled with ${partes.join(', ')}, all clearly secondary, logo-free and quieter in colour than the featured piece.`;
}

/** "the olive green Pampero cargo work trousers" */
function nombrarPrenda(p, color) {
  const col = color ? `${color.en.replace(/ denim$/, '')} ` : '';
  const marca = p.marca && !/^blacks$/i.test(p.marca) ? `${p.marca.charAt(0).toUpperCase()}${p.marca.slice(1).toLowerCase()} ` : '';
  return `the ${col}${marca}${p.en}`;
}

function fidelidad(prendas, colores) {
  const lineas = prendas.map((p, i) => {
    const rasgos = p.rasgos.length ? ` Real features from the product sheet (in Spanish): ${p.rasgos.map((r) => `"${r}"`).join(', ')}.` : '';
    const tela = p.tela ? ` Fabric: ${p.tela.en}.` : '';
    const prenda = nombrarPrenda(p, colores[i]);
    return `${prendas.length > 1 ? `Piece ${i + 1}: ${prenda}` : prenda.charAt(0).toUpperCase() + prenda.slice(1)} ("${p.nombre}") must match the attached reference photo${prendas.length > 1 ? ` of it` : 's'} exactly: same cut, colour, pockets, seams, trims and hardware.${tela}${rasgos}`;
  });
  return `${lineas.join(' ')} Do not invent logos, prints, reflective strips, patches or pockets that are not in the reference.`;
}

/** La foto va a medir lo que una tarjeta de producto. */
function composicionDePlaca(ratio, estilo, { producto = false } = {}) {
  const partes = [
    `Composed for a small vertical ${ratio} tile about the size of a product card on a phone screen:`,
    producto
      ? 'the product large and centred, filling most of the frame,'
      : 'one clear subject filling most of the frame height, the featured garment clearly readable,',
    'a simple background with strong tonal contrast against the garment and no small busy details.',
  ];
  if (estilo === 'banner') partes.push('Keep the lower third calm and slightly darker so a short white headline can sit there.');
  else if (estilo === 'etiqueta') partes.push('Keep the bottom 15% of the frame simple: a small product label will overlap it.');
  return partes.join(' ');
}

function sujetoPuesto(prendas, colores, encuadre) {
  const p = prendas[0];
  const su = p.persona === 'a woman' ? 'her' : 'his';
  const lista = prendas.map((x, i) => nombrarPrenda(x, colores[i])).join(prendas.length > 2 ? ', ' : ' and ');
  if (prendas.length === 1 && p.zona === 'calzado') {
    return `${nombrarPrenda(p, colores[0])} worn by ${p.persona} in ${su} thirties, framed from mid-calf down, feet planted naturally on the ground, dark trousers turned up once at the ankle so the whole ${p.par ? 'pair' : 'shoe'} is visible`;
  }
  if (prendas.length === 1 && p.zona === 'accesorio') {
    return `${nombrarPrenda(p, colores[0])} worn by ${p.persona} in ${su} thirties, framed close so the ${p.en} is the clear subject`;
  }
  return `${p.persona} in ${su} thirties with a natural, unposed look, wearing ${lista}${encuadre ? `, ${encuadre}` : ''}`;
}

function sujetoProducto(p, color, como) {
  const cosa = nombrarPrenda(p, color);
  if (p.zona === 'calzado') return `${p.par ? 'the pair of ' : ''}${cosa.replace(/^the /, '')} ${como === 'bodegon' ? 'placed side by side, slightly angled' : 'standing on the floor'}`;
  if (como === 'bodegon') {
    if (p.zona === 'abajo') return `${cosa} neatly folded in thirds with one leg and pocket showing, laid flat`;
    return `${cosa} neatly folded and laid flat`;
  }
  return cosa;
}

/* ------------------------------------------------------------- las ideas -- */

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "el pantalón negro" o, si son varias, "el conjunto". */
function quePrenda(prendas, colores) {
  if (prendas.length > 1) return 'el conjunto';
  const p = prendas[0];
  return `${laPrenda(p)}${colores[0] ? ` ${colorEs(colores[0].nombre, p)}` : ''}`;
}

/**
 * Cada idea arma { titulo, que, porQue, escena } a partir de la prenda y el
 * seed. `escena` es el cuerpo del prompt en inglés, SIN la parte de fidelidad,
 * composición ni la cola técnica: eso se agrega igual para todas en armarPrompt().
 */
const IDEAS = {
  estudio_color(prendas, colores, seed) {
    const p = prendas[0];
    const fondo = elegir(FONDOS[(colores[0] && colores[0].familia) || 'oscuro'] || FONDOS.oscuro, seed);
    const soloProducto = p.zona === 'calzado' || p.zona === 'accesorio';
    /* Recortado del pecho para abajo el pantalón ocupa el doble de cuadro, y sin
       cara no hay gesto raro que arruine la foto. Se alterna con el cuerpo entero. */
    const encuadres = p.zona === 'arriba' || p.zona === 'abrigo'
      ? ['framed from mid-thigh up, three-quarter turn, one hand in a pocket', 'full body from head to shoes, three-quarter turn, weight on one leg']
      : ['full body from head to shoes, three-quarter turn, weight on one leg', 'cropped from the chest down to the shoes, no face in frame, three-quarter turn, weight on one leg'];
    const encuadre = elegir(encuadres, seed);
    const plano = /chest down/.test(encuadre) ? 'del pecho para abajo' : /mid-thigh/.test(encuadre) ? 'de medio cuerpo' : 'de cuerpo entero';
    const sujeto = soloProducto
      ? sujetoProducto(p, colores[0], 'estudio')
      : sujetoPuesto(prendas, colores, encuadre);
    return {
      titulo: `Estudio con fondo ${fondo[1]}`,
      que: `${soloProducto ? `${cap(laPrenda(p))} ${concuerda('solo', p)}${colores[0] ? ` ${colorEs(colores[0].nombre, p)}` : ''}` : `${p.personaEs} ${plano} con ${quePrenda(prendas, colores)}`}, sobre papel liso ${fondo[1]} y luz de sol dura con sombra marcada.`,
      porQue: 'En una tarjeta chica lo que se lee es el contraste: una prenda sobre un fondo liso de color opuesto se distingue aunque la foto mida 145 px.',
      escena: `Fashion editorial studio photograph: ${sujeto}, against a seamless ${fondo[0]} paper backdrop that curves into the floor. One hard key light imitating direct daylight from the side, casting a crisp, defined shadow on the backdrop, soft fill on the shadow side.${soloProducto ? ' The product rests directly on the floor, no pedestal or plinth.' : ''}`,
    };
  },

  calle(prendas, colores, seed, est) {
    const p = prendas[0];
    let lugar = elegir(CALLES, seed, 1);
    if (est.jacaranda && lugar === CALLES[2]) lugar = ['a quiet tree-lined street in Palermo, Buenos Aires, with jacaranda trees in purple bloom far out of focus', 'una calle de Palermo con jacarandás en flor'];
    const sujeto = sujetoPuesto(prendas, colores, 'walking mid-stride towards the camera, full body');
    return {
      titulo: 'En la calle',
      que: `${p.personaEs} caminando con ${quePrenda(prendas, colores)} por ${lugar[1]}, luz de media tarde.`,
      porQue: 'Muestra que la prenda sirve también fuera del trabajo. Es la foto que falta en el catálogo, donde todo está sobre blanco.',
      escena: `Street-style fashion photograph in ${est.en}: ${sujeto}, on ${lugar[0]}. Warm late-afternoon daylight from the side, long soft shadows, shallow depth of field so the street melts into the background.`,
    };
  },

  trabajo(prendas, colores) {
    const p = prendas[0];
    const lugar = LUGARES[p.lugar] || LUGARES.taller;
    const sujeto = p.zona === 'calzado'
      ? sujetoPuesto(prendas, colores, '')
      : sujetoPuesto(prendas, colores, 'standing relaxed at the end of a task, one hand resting on a surface, three-quarter body');
    return {
      titulo: 'Donde se usa',
      que: `${p.personaEs} con ${quePrenda(prendas, colores)} en ${lugar[1]}, en pausa, sin pose.`,
      porQue: 'Pone la prenda donde se usa de verdad: el que compra por rubro se reconoce en la escena.',
      // Sin acción: con herramientas en mano el modelo inventa golpes y gestos raros.
      escena: `Documentary workwear photograph: ${sujeto}, in ${lugar[0]}. Not working with tools, just a calm, natural pause. Natural daylight from a large opening, dust and wear on the surroundings, never on the garment.`,
    };
  },

  aire_libre(prendas, colores, seed, est) {
    const p = prendas[0];
    const lugar = elegir(AIRE_LIBRE, seed);
    const sujeto = sujetoPuesto(prendas, colores, 'walking on the path, full body, seen slightly from the side');
    return {
      titulo: 'Aire libre',
      que: `${p.personaEs} con ${quePrenda(prendas, colores)} en ${lugar[1]}.`,
      porQue: p.tela && p.tela.es === 'ripstop'
        ? 'La tela ripstop se entiende sola afuera: la escena explica para qué es sin escribir nada.'
        : 'Saca a la prenda del taller y la pone donde también se usa: fin de semana, campo, sierra.',
      escena: `Outdoor lifestyle photograph in ${est.en}: ${sujeto}, on ${lugar[0]}. Bright natural daylight with a slight haze, colours true and unsaturated.`,
    };
  },

  sombras(prendas, colores, seed) {
    const p = prendas[0];
    const pared = elegir(SOMBRAS, seed);
    const sujeto = p.zona === 'calzado'
      ? sujetoPuesto(prendas, colores, '')
      : sujetoPuesto(prendas, colores, 'leaning one shoulder against the wall, three-quarter body');
    return {
      titulo: 'Luz dura y sombras',
      que: `${p.personaEs} con ${quePrenda(prendas, colores)} contra ${pared[1]}, sol directo.`,
      porQue: 'Luz de primavera y sombras recortadas: le cambia el clima al home sin cambiar la prenda, y la silueta queda muy marcada en chico.',
      escena: `Minimal sunlit fashion photograph: ${sujeto}, in front of ${pared[0]}. Direct midday daylight, high contrast, clean graphic shadows.`,
    };
  },

  detalle(prendas, colores) {
    const p = prendas[0];
    const cosa = nombrarPrenda(p, colores[0]);
    const foco = {
      calzado: 'the toe cap, the laces and the edge of the sole tread',
      abajo: 'a pocket edge, its stitching and the fabric surface',
      accesorio: 'its surface, seams and finishing',
    }[p.zona] || 'the collar or placket, its stitching and the fabric surface';
    return {
      titulo: 'Detalle de la tela',
      que: `Primer plano de ${p.tela ? `la tela ${p.tela.es}` : 'la tela'}, las costuras y ${{ calzado: 'la puntera', abajo: 'un bolsillo', accesorio: 'las terminaciones' }[p.zona] || 'el cuello'}. Sin modelo.`,
      porQue: 'Sirve mucho como SEGUNDA foto de la placa: se alterna con la del look y muestra la calidad de cerca.',
      escena: `Macro product photograph: extreme close-up of ${cosa}, showing ${foco}${p.tela ? `, with the ${p.tela.en} clearly readable` : ''}. Low raking window light from one side that reveals the texture, the detail fills the whole frame.`,
      producto: true,
    };
  },

  bodegon(prendas, colores, seed) {
    const sup = elegir(SUPERFICIES, seed);
    const cosas = prendas.map((p, i) => sujetoProducto(p, colores[i], 'bodegon'));
    return {
      titulo: prendas.length > 1 ? 'El conjunto desde arriba' : 'Bodegón desde arriba',
      que: `${prendas.length > 1 ? 'Las prendas del conjunto ordenadas' : `${cap(laPrenda(prendas[0]))} ${concuerda(prendas[0].zona === 'calzado' ? 'apoyado' : 'doblado', prendas[0])}`} sobre ${sup[1]}. Sin modelo.`,
      porQue: 'Sin modelo no hay cara ni cuerpo que distraiga: la prenda se ve entera y ordenada, y a este tamaño es muy clara.',
      escena: `Overhead flat-lay product photograph: ${cosas.join(', ')}, arranged with space between ${prendas.length > 1 ? 'the pieces' : 'it and the edges'}, on ${sup[0]}. Soft window daylight from one side, gentle natural shadows.`,
      producto: true,
    };
  },
};

/** Qué ideas conviene proponer primero para esta prenda, en orden. */
function ordenDeIdeas(prendas) {
  const p = prendas[0];
  const m = new Set(prendas.flatMap((x) => x.mundos));
  const orden = ['estudio_color'];
  if (prendas.length > 1) orden.push('calle');
  if (m.has('seguridad')) orden.push('trabajo');
  if (m.has('urbano')) orden.push('calle', 'sombras');
  if (m.has('aire_libre')) orden.push('aire_libre');
  if (m.has('trabajo')) orden.push('trabajo');
  orden.push('detalle', 'bodegon');
  // Accesorios chicos: el estudio y el detalle son lo único que les sirve.
  const filtradas = p.zona === 'accesorio' ? orden.filter((x) => ['estudio_color', 'detalle', 'bodegon', 'trabajo'].includes(x)) : orden;
  return [...new Set(filtradas)];
}

/* --------------------------------------------------------------- armado --- */

/** Colores a usar en la foto: el que pidió el dueño si existe, si no el de más fotos (o rota con el seed). */
function coloresPara(prendas, seed, colorPedido) {
  return prendas.map((p, i) => {
    if (!p.colores.length) return null;
    if (i === 0 && colorPedido) {
      const c = p.colores.find((x) => sinTildes(x.nombre) === sinTildes(colorPedido));
      if (c) return c;
    }
    const conFoto = p.colores.filter((c) => c.fotos.length);
    return elegir(conFoto.length ? conFoto : p.colores, i === 0 ? seed : 0);
  });
}

/** Las fotos reales a adjuntar: SÓLO las del color elegido.
    Completar con fotos de otros colores le pide al modelo un pantalón negro
    mostrándole uno verde: promedia y sale cualquier cosa. Sólo si el color no
    tiene fotos propias se cae a la principal del producto. */
function referenciasPara(prendas, colores) {
  const salida = [];
  prendas.forEach((p, i) => {
    const delColor = (colores[i] && colores[i].fotos) || [];
    const cuantas = i === 0 ? (prendas.length > 1 ? 2 : 3) : 1;
    const fuente = delColor.length ? delColor : [p.fotoPrincipal, ...p.fotos];
    const urls = [...new Set(fuente.filter(Boolean))].slice(0, cuantas);
    urls.forEach((url) => salida.push({ url, producto: p.nombre, color: colores[i] ? colores[i].nombre : null }));
  });
  return salida.slice(0, 4);
}

function armarPrompt(escena, { prendas, colores, ratio, estilo, producto = false, extra = '' }) {
  const ratioTxt = RATIOS[ratio] || '3:4';
  const base = [
    escena,
    producto ? '' : estilismo(prendas).trim(),
    fidelidad(prendas, colores),
    composicionDePlaca(ratioTxt, estilo, { producto }),
    extra,
  ].filter(Boolean).join(' ');
  // promptDeFoto agrega SÓLO lo que falta: cámara, luz, textura, las
  // prohibiciones y la relación de aspecto al final.
  return promptDeFoto({ prompt_ia: base, ratio: ratioTxt, tipo: 'foto', max: 2400 });
}

/**
 * Ideas de foto para las prendas elegidas.
 * @param {object[]} prendas  salida de analizarPrenda(), la primera es la principal
 * @param {object}   opciones { ratio, estilo, seed, color, idea (texto libre del dueño), fecha }
 */
function armarIdeas(prendas, { ratio = '3-4', estilo = 'etiqueta', seed = 0, color = '', idea = '', fecha = new Date() } = {}) {
  if (!prendas.length) return [];
  const est = estacion(fecha);
  const colores = coloresPara(prendas, seed, color);
  const referencias = referenciasPara(prendas, colores);
  const base = { color: colores[0] ? colores[0].nombre : null, referencias, ratio: RATIOS[ratio] || '3:4' };

  const ideas = [];

  // La idea del dueño, si escribió una, va primero y tal cual.
  const propia = String(idea || '').trim().slice(0, 400);
  if (propia) {
    const sujeto = prendas[0].zona === 'calzado' || prendas[0].zona === 'accesorio'
      ? sujetoProducto(prendas[0], colores[0], 'estudio')
      : sujetoPuesto(prendas, colores, 'framed so the garment reads clearly');
    ideas.push({
      id: 'propia',
      titulo: 'Tu idea',
      que: propia,
      porQue: 'La escribiste vos: la prenda, el color y las fotos de referencia los agrego yo.',
      prompt: armarPrompt(`Photograph of ${sujeto}. Scene, as described by the store owner in Spanish (follow it faithfully): «${propia}».`, { prendas, colores, ratio, estilo }),
      ...base,
    });
  }

  ordenDeIdeas(prendas).forEach((id, k) => {
    const def = IDEAS[id](prendas, colores, seed + k, est);
    ideas.push({
      id,
      titulo: def.titulo,
      que: def.que,
      porQue: def.porQue,
      prompt: armarPrompt(def.escena, { prendas, colores, ratio, estilo, producto: !!def.producto }),
      ...base,
    });
  });

  return ideas.slice(0, propia ? 7 : 6);
}

/* ------------------------------------------------------------ con la base -- */

async function prendasPorId(ids) {
  const limpios = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 4);
  if (!limpios.length) return [];
  const { rows } = await pool.query(
    `SELECT id, name, brand, price, promo_price, stock, image_url, images, description, raw,
            COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink
       FROM products_cache WHERE id = ANY($1::bigint[])`,
    [limpios]
  );
  const porId = new Map(rows.map((r) => [Number(r.id), r]));
  return limpios.map((id) => porId.get(id)).filter(Boolean);
}

/** Lo que el panel muestra arriba de las ideas: la prenda y sus colores con stock. */
function fichaParaPanel(row, a) {
  return {
    id: a.id,
    name: a.nombre,
    url: productPath(row.permalink) || '',
    image: a.fotoPrincipal,
    colores: a.colores.map((c) => ({ nombre: c.nombre, foto: c.fotos[0] || null })),
    tipo: a.es,
    tela: a.tela ? a.tela.es : null,
  };
}

async function ideasDeFoto({ productIds, ratio, estilo, seed, color, idea }) {
  const filas = await prendasPorId(productIds);
  if (!filas.length) {
    throw Object.assign(new Error('Elegí primero la prenda de esta foto: las ideas salen de sus datos reales.'), { status: 400 });
  }
  const prendas = filas.map(analizarPrenda);
  return {
    productos: filas.map((r, i) => fichaParaPanel(r, prendas[i])),
    ideas: armarIdeas(prendas, { ratio, estilo, seed: Number(seed) || 0, color, idea }),
    fuente: 'datos',
  };
}

/**
 * OTRAS IDEAS, CON IA DE TEXTO.
 * El modelo propone sólo la ESCENA (en inglés) y el porqué. La prenda, el color,
 * la fidelidad y la composición para placa chica los arma armarPrompt() igual
 * que para las ideas base: el modelo no puede cambiarle el color a la prenda ni
 * olvidarse de que la foto va a verse chica.
 */
async function ideasDeFotoConIA({ productIds, ratio, estilo, color, idea, recientes = [] }) {
  const { generateJson } = require('./ai');
  const filas = await prendasPorId(productIds);
  if (!filas.length) throw Object.assign(new Error('Elegí primero la prenda de esta foto.'), { status: 400 });
  const prendas = filas.map(analizarPrenda);
  const colores = coloresPara(prendas, 0, color);
  const est = estacion();

  const datos = prendas.map((p, i) => ({
    nombre: p.nombre,
    tipo: p.es,
    tela: p.tela ? p.tela.es : null,
    color: colores[i] ? colores[i].nombre : null,
    rasgos: p.rasgos,
    dondeSeUsa: p.mundos,
  }));

  const salida = await generateJson({
    system: 'Sos director de arte de BLACKS, tienda argentina de ropa de trabajo, seguridad y urbano. Proponés fotos de producto para una vidriera del home: fotos chicas, del tamaño de una tarjeta de producto en un celular. Devolvés JSON y nada más.',
    prompt: `Proponé 4 fotos DISTINTAS entre sí para ${prendas.length > 1 ? 'este conjunto' : 'esta prenda'}.

DATOS REALES
${JSON.stringify({ prendas: datos, estacion: est.id, formaDeLaFoto: RATIOS[ratio] || '3:4', ideaDelDueno: idea || null }, null, 1)}
${recientes.length ? `\nYA PROPUESTAS (no las repitas): ${recientes.slice(0, 10).join(' | ')}` : ''}

Reglas:
- Ambientadas en Argentina cuando haya lugar (ciudad, obra, campo, sierra, estudio).
- La foto se ve CHICA: un solo sujeto, la prenda grande, fondo simple con contraste. Nada de escenas llenas de cosas.
- Nada de acción con herramientas (martillar, cortar, soldar): sale mal. Pausa natural, caminar, apoyarse.
- No describas la prenda, ni el resto de la ropa o el calzado del modelo, ni le cambies el color: eso lo agrego yo con los datos.

Para cada una:
- "titulo": 2 a 4 palabras en castellano.
- "que": qué se ve, una frase en castellano rioplatense.
- "porQue": por qué esa foto vende esta prenda, una frase.
- "escena_en": EN INGLÉS, un párrafo: tipo de foto, quién la lleva puesta (o si es sin modelo), pose, lugar concreto, luz con dirección y hora. Referite a la prenda sólo como "the featured garment".
- "con_modelo": true si hay una persona.

Formato exacto: {"ideas":[{"titulo":"…","que":"…","porQue":"…","escena_en":"…","con_modelo":true}]}`,
    schema: {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' }, que: { type: 'string' }, porQue: { type: 'string' },
              escena_en: { type: 'string' }, con_modelo: { type: 'boolean' },
            },
            required: ['titulo', 'que', 'porQue', 'escena_en', 'con_modelo'],
          },
        },
      },
      required: ['ideas'],
    },
    temperature: 0.95,
    maxTokens: 1800,
    thinkingBudget: 300,
  });

  const nombre = prendas.map((p, i) => nombrarPrenda(p, colores[i])).join(' and ');
  const referencias = referenciasPara(prendas, colores);
  /* Groq no recibe el esquema (sólo Gemini lo respeta): a veces devuelve la
     lista suelta o bajo otra clave. Se toma la primera lista que aparezca. */
  const crudas = Array.isArray(salida) ? salida
    : Array.isArray(salida && salida.ideas) ? salida.ideas
      : (Object.values(salida || {}).find(Array.isArray) || []);
  const ideas = crudas.slice(0, 4)
    .filter((x) => x && x.escena_en)
    .map((x, k) => {
      const escena = String(x.escena_en).replace(/the featured garment/gi, nombre).slice(0, 900);
      return {
        id: `ia_${k}`,
        titulo: String(x.titulo || 'Idea').slice(0, 40),
        que: String(x.que || '').slice(0, 240),
        porQue: String(x.porQue || '').slice(0, 240),
        prompt: armarPrompt(escena, { prendas, colores, ratio, estilo, producto: x.con_modelo === false }),
        color: colores[0] ? colores[0].nombre : null,
        referencias,
        ratio: RATIOS[ratio] || '3:4',
      };
    });

  return { productos: filas.map((r, i) => fichaParaPanel(r, prendas[i])), ideas, fuente: 'ia' };
}

/** Fotos del catálogo de estas prendas (lo único que se acepta como referencia al generar). */
async function fotosPermitidas(productIds) {
  const filas = await prendasPorId(productIds);
  return { filas, urls: new Set(filas.flatMap((r) => catalogPhotos(r).map((f) => f.url))) };
}

module.exports = {
  analizarPrenda,
  armarIdeas,
  estacion,
  colorEn,
  ideasDeFoto,
  ideasDeFotoConIA,
  fotosPermitidas,
  RATIOS,
};
