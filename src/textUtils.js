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

module.exports = { stripEmoji, fixSpelling };
