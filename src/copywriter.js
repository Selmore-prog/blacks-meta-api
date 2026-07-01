// Se mantiene por compatibilidad: la lógica real de copy vive en src/ai.js
// (Gemini con voz argentina y fallback a Groq). Este archivo sólo re-exporta.
const { generateCopy } = require('./ai');

module.exports = { generateCopy };
