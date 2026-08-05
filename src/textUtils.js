/* =========================================================================
 * Utilidades de texto compartidas entre el generador de copy (ai.js) y el
 * renderer de imágenes (imageRenderer.js). Sin dependencias del proyecto para
 * no armar un require circular (imageRenderer ya requiere ai.js).
 * ========================================================================= */

// Emojis/pictogramas que Chromium NO puede dibujar (el server sólo trae fuentes de
// texto, no de emoji) → salían como cuadraditos vacíos (tofu) horneados en la pieza.
// Los sacamos de TODO el texto que se estampa. Rango: sólo pictogramas/emoji/flechas
// decorativas, nunca puntuación, tildes, ñ, guiones ni comillas. Es URL-safe (las URLs
// son ASCII), por eso se puede aplicar dentro de esc() sin romper los src de imágenes.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20D0}-\u{20FF}\u{2190}-\u{21FF}\u{2900}-\u{297F}]/gu;

function stripEmoji(s) {
  if (!s) return s;
  return String(s).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

// Ortografía de marca: "friza" es la falta común; el término correcto de la tela es
// "frisa" (algodón con frisa). Se corrige preservando mayúsculas/plural. Se aplica al
// COPY generado por IA y a los títulos que salen del nombre del producto — NUNCA a URLs
// (por si un slug/archivo se llamara "friza").
const SPELL_FIXES = [
  { re: /\bfriza(s?)\b/gi, to: 'frisa' },
];

function fixSpelling(s) {
  if (!s) return s;
  let out = String(s);
  for (const { re, to } of SPELL_FIXES) {
    out = out.replace(re, (m, tail = '') => {
      const cased = m === m.toUpperCase() ? to.toUpperCase()
        : (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
      return cased + (tail || '');
    });
  }
  return out;
}

/**
 * Acorta un texto para usarlo como ETIQUETA DE BOTÓN, cortando por palabra entera.
 * Un `slice(0, n)` a secas partía el CTA al medio y quedaba impreso en la pieza:
 * "¡No te quedes afuera! Entrá a nuestra web y asegurate los de" (caso real, jul-2026).
 * Si hay que recortar, se corta en el último espacio y se limpia la puntuación colgada;
 * nunca se agrega "…" (en un botón queda raro).
 */
// Palabras que no pueden quedar al final de una etiqueta: si el recorte cae ahí, la
// frase queda colgada ("Entrá a", "asegurate los").
const LABEL_DANGLING = /\s+(a|al|de|del|con|sin|para|por|en|y|e|o|u|que|el|la|los|las|un|una|unos|unas|tu|tus|su|sus|mi|mis|lo|le|te|se|más|muy|ya|desde|hasta|sobre|entre)$/i;

function shortLabel(s, max = 34) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const tidy = (x) => {
    let out = x.replace(/[\s,;:.–—-]+$/, '');
    // Puede quedar más de un conector encadenado ("y asegurate los" -> "y asegurate" -> …).
    for (let i = 0; i < 3 && LABEL_DANGLING.test(out); i += 1) {
      out = out.replace(LABEL_DANGLING, '').replace(/[\s,;:.–—-]+$/, '');
    }
    return out;
  };
  if (!t) return '';

  // LA URL SE SACA, NO SE RECORTA. Un botón que dice la dirección web repite el pie de la
  // pieza (que ya la muestra) y encima, al partir por puntos para buscar la frase de
  // acción, la URL se hacía pedazos: "Comprá ahora en www.blacksindumentaria.com.ar"
  // terminaba impreso como "blacksindumentaria" (caso real). Se quita la URL y queda la
  // acción; si al sacarla no queda nada accionable, se usa un llamado corto de la casa.
  const hadUrl = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|ar|net|shop)\b)/i.test(t);
  let clean = t
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\b[a-z0-9-]+(\.[a-z]{2,4}){1,2}\b/gi, ' ')
    // Al sacar la URL puede quedar una preposición huérfana: "Entrá a ___ y aprovechá".
    .replace(/\s+(a|al|en|de|del|con|desde|hasta|por)\s+(y|e|o|u)\s+/gi, ' $2 ')
    .replace(/\s+(a|al|en|de|del|con|desde|hasta|por)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (hadUrl) {
    const bare = tidy(clean.replace(/[\s,;:.–—-]+$/, ''));
    clean = bare.length >= 8 ? bare : 'Comprá en nuestra web';
    if (clean.length <= max) return clean;
  }

  if (clean.length <= max) return clean.replace(/[\s,;:.–—-]+$/, '');
  // Si el CTA vino como varias frases ("¡No te quedes afuera! Entrá a nuestra web y
  // asegurate los descuentos."), la ACCIÓN está en la última: recortar la primera dejaba
  // un botón que no pide nada ("¡No te quedes afuera! Entrá").
  const clauses = clean.split(/[!?.¡¿]+/).map((c) => c.trim()).filter((c) => c.length > 7);
  const source = clauses.length > 1 ? clauses[clauses.length - 1] : clean;
  if (source.length <= max) return tidy(source);
  const cut = source.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return tidy(base);
}

// Verbos con los que arranca un beneficio redactado como frase ("Pagá en hasta 6 cuotas"):
// como CHIP no aportan, el dato es lo que viene después.
const CHIP_LEAD_VERB = /^(pag[aá]|llevate|consegu[ií]|aprovech[aá]|compr[aá]|obten[eé]|sum[aá]|eleg[ií]|ten[eé]|disfrut[aá]|acced[eé])\s+(en\s+|con\s+|tu\s+|el\s+|la\s+|los\s+|las\s+|hasta\s+|de\s+)*/i;
// Coletillas que alargan sin agregar dato ("en toda la web", "en todos nuestros productos").
const CHIP_TAIL_FILLER = /\s+(en|de|por|para)\s+(toda|todo|todos|todas|nuestra|nuestro|nuestras|nuestros|el|la|los|las)\s+[\wáéíóúñ]+(\s+[\wáéíóúñ]+)?\.?$/i;

/**
 * Compacta un DATO para imprimirlo como chip en una pieza.
 *
 * El prompt pide "máx ~4 palabras" y el modelo igual devuelve frases enteras: en la promo
 * de liquidación salió "Pagá en hasta 6 cuotas sin interés o 10% OFF extra por
 * transferencia bancaria." (77 caracteres) — impreso chico y en tres renglones, ilegible
 * en el celular. El largo no se puede dejar librado al prompt: se garantiza acá.
 *
 * Estrategia, en orden: quedarse con UNA de las alternativas si el dato trae dos unidas
 * por "o", sacar el verbo del arranque, sacar la coletilla del final y, recién si sigue
 * largo, cortar por palabra entera.
 */
function compactFact(s, max = 30) {
  let t = String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  // "6 cuotas sin interés o 10% OFF por transferencia" -> la primera alternativa.
  const alt = t.split(/\s+o\s+/i);
  if (alt.length > 1 && alt[0].trim().length >= 8) t = alt[0].trim();
  t = t.replace(CHIP_LEAD_VERB, '').trim();
  t = t.replace(CHIP_TAIL_FILLER, '').trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    t = (sp > max * 0.5 ? cut.slice(0, sp) : cut);
  }
  t = t.replace(/[\s,;:.–—-]+$/, '');
  for (let i = 0; i < 3 && LABEL_DANGLING.test(t); i += 1) {
    t = t.replace(LABEL_DANGLING, '').replace(/[\s,;:.–—-]+$/, '');
  }
  return t.replace(/^([a-záéíóúñ])/, (m) => m.toUpperCase());
}

/* =========================================================================
 * CONCORDANCIA DE GÉNERO ("Conseguilas" vs "Conseguilos")
 *
 * El cierre de los carruseles usaba SIEMPRE el mismo texto de marca
 * (BRAND_CTA_HEADLINE = "Conseguilas en la web"), en femenino. En una pieza de
 * pantalones quedaba "Conseguilas" — mal escrito y sin forma de arreglarlo desde
 * el panel (bug real, ago-2026). Acá el pronombre pegado al verbo (-lo/-la/-los/
 * -las) se adapta al género del producto de la pieza. El NÚMERO se respeta tal
 * como está escrito (la marca habla en plural), sólo cambia el género.
 * ========================================================================= */

const NO_ACCENTS = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Sustantivos del rubro donde la morfología sola falla o conviene fijar.
const MASC_NOUNS = new Set(['pantalon', 'jean', 'buzo', 'borcego', 'botin', 'calzado', 'guante', 'casco',
  'chaleco', 'mameluco', 'delantal', 'short', 'cinturon', 'gorro', 'zapato', 'zueco', 'sweater', 'saco',
  'ambo', 'abrigo', 'protector', 'respirador', 'arnes', 'traje', 'conjunto', 'kit', 'par', 'equipo',
  'uniforme', 'overol', 'pullover', 'anteojo', 'barbijo', 'pilot', 'piloto', 'impermeable']);
const FEM_NOUNS = new Set(['campera', 'camisa', 'remera', 'chomba', 'camiseta', 'bota', 'faja', 'capucha',
  'gorra', 'mochila', 'zapatilla', 'ropa', 'prenda', 'chaqueta', 'polera', 'musculosa', 'media',
  'antiparra', 'mascara', 'camisola', 'bermuda', 'malla', 'rodillera', 'polaina', 'indumentaria']);

/** Singular aproximado (sólo para decidir género/número, no para imprimir). */
function singularize(w) {
  if (/[^aeiou]es$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Género gramatical del sustantivo que encabeza el nombre del producto: 'm' | 'f'. */
function nounGender(word) {
  const w = singularize(NO_ACCENTS(String(word || '')).toLowerCase().replace(/[^a-z]/g, ''));
  if (!w) return 'm';
  if (MASC_NOUNS.has(w)) return 'm';
  if (FEM_NOUNS.has(w)) return 'f';
  if (/(cion|sion|dad|tad|umbre|eza|ura|tud)$/.test(w)) return 'f';
  if (/a$/.test(w)) return 'f';
  return 'm';
}

/**
 * Género del producto según su nombre: gana la primera palabra que esté en el
 * lexicón del rubro ("Pantalón Cargo Slim Fit" -> pantalón -> masculino); si
 * ninguna está, se decide por la primera palabra con la regla morfológica.
 */
function productGender(productName) {
  const words = String(productName || '').split(/[\s/,-]+/).filter(Boolean);
  for (const w of words) {
    const norm = singularize(NO_ACCENTS(w).toLowerCase().replace(/[^a-z]/g, ''));
    if (MASC_NOUNS.has(norm)) return 'm';
    if (FEM_NOUNS.has(norm)) return 'f';
  }
  return words.length ? nounGender(words[0]) : 'm';
}

// Palabras comunes que TERMINAN en lo/la/los/las sin ser verbo+pronombre.
const NOT_ENCLITIC = new Set(['regalo', 'trabajo', 'catalogo', 'articulo', 'estilo', 'modelo', 'intervalo',
  'terciopelo', 'pantalon', 'abuelo', 'suelo', 'cuello', 'ella', 'aquella', 'plantilla', 'semilla',
  'pantalla', 'estrella', 'espalda', 'tela', 'talla', 'malla', 'sala', 'ala', 'bola', 'cola', 'gala',
  'escuela', 'suela', 'tobillo', 'solo', 'sola', 'solos', 'solas', 'halo', 'palo', 'pelo', 'malo']);
// verbo (termina en vocal, con o sin pronombre encadenado) + lo/la/los/las
const ENCLITIC_RE = /\b([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{2,}[aeiouáéíóú](?:te|se|me|nos)?)(los|las|lo|la)\b/g;

/**
 * Adapta al género del producto los pronombres pegados al verbo de un texto corto
 * ("Conseguilas en la web" + "Pantalón Cargo" -> "Conseguilos en la web").
 * Conserva el número (plural/singular) y no toca artículos ("la web") ni palabras
 * que sólo terminan parecido ("regalo", "pantalla").
 */
function agreeWithProduct(text, productName) {
  const t = String(text == null ? '' : text);
  if (!t || !productName) return t;
  const gender = productGender(productName);
  return t.replace(ENCLITIC_RE, (full, stem, suffix) => {
    if (full.length < 7) return full;
    if (NOT_ENCLITIC.has(NO_ACCENTS(full).toLowerCase())) return full;
    const plural = suffix.endsWith('s');
    const want = (gender === 'f' ? 'la' : 'lo') + (plural ? 's' : '');
    return stem + want;
  });
}

module.exports = { stripEmoji, fixSpelling, shortLabel, compactFact, agreeWithProduct, productGender };
