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
  if (t.length <= max) return t.replace(/[\s,;:.–—-]+$/, '');
  // Si el CTA vino como varias frases ("¡No te quedes afuera! Entrá a nuestra web y
  // asegurate los descuentos."), la ACCIÓN está en la última: recortar la primera dejaba
  // un botón que no pide nada ("¡No te quedes afuera! Entrá").
  const clauses = t.split(/[!?.¡¿]+/).map((c) => c.trim()).filter((c) => c.length > 7);
  const source = clauses.length > 1 ? clauses[clauses.length - 1] : t;
  if (source.length <= max) return tidy(source);
  const cut = source.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return tidy(base);
}

module.exports = { stripEmoji, fixSpelling, shortLabel };
