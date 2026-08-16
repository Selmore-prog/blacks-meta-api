/* =========================================================================
 * REESCRITURA DE DESCRIPCIONES DE PRODUCTO
 *
 * Reordena la descripción para que se lea mejor y convierta más, SIN inventar
 * nada y SIN perder contenido. No es "generar una descripción nueva": es
 * reestructurar la que ya está.
 *
 * LAS DOS REGLAS QUE NO SE NEGOCIAN, y por qué
 *
 * 1. NO SE PIERDEN LAS IMÁGENES. Medido sobre el catálogo real (ago-2026):
 *    11 de cada 12 descripciones traen <img> embebidas, y son guías de talle y
 *    gráficos técnicos propios de cada producto. Si se pierden no se pueden
 *    reponer. Por eso las imágenes NO pasan por la IA: se extraen antes, se
 *    reemplazan por marcadores, y se vuelven a insertar al final. La IA nunca
 *    las ve ni puede borrarlas.
 *
 * 2. NO SE INVENTAN DATOS TÉCNICOS. Acá se venden botines con puntera de acero
 *    y ropa de seguridad. Que la IA agregue "cumple norma IRAM" o una
 *    resistencia que nadie verificó no es un error de redacción, es un
 *    problema serio. El prompt lo prohíbe y además hay una verificación
 *    posterior que compara los números del texto original con los del nuevo.
 * ========================================================================= */

const { generateJson } = require('./ai');

/* ------------------------- protección de imágenes ------------------------- */

/**
 * Saca las <img> (y los <a> que las envuelven) y las cambia por marcadores.
 * Devuelve el HTML "pelado" y la lista para poder reponerlas después.
 */
function extraerImagenes(html) {
  const imagenes = [];
  const pelado = String(html || '').replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>|<img[^>]*>/gi, (tag) => {
    imagenes.push(tag);
    return `[[IMG_${imagenes.length - 1}]]`;
  });
  return { pelado, imagenes };
}

/** Vuelve a poner las imágenes en su lugar. Las que la IA haya borrado se
 *  reponen al final, para que NUNCA se pierda una guía de talle. */
function reponerImagenes(html, imagenes) {
  let out = String(html || '');
  const usadas = new Set();
  out = out.replace(/\[\[IMG_(\d+)\]\]/g, (_, n) => {
    const i = Number(n);
    if (imagenes[i] === undefined) return '';
    usadas.add(i);
    return imagenes[i];
  });
  const perdidas = imagenes.filter((_, i) => !usadas.has(i));
  if (perdidas.length) out += `\n${perdidas.join('\n')}`;
  return { html: out, repuestasAlFinal: perdidas.length };
}

/* ------------------------- verificación de datos ------------------------- */

/** Números con su unidad: "1200 g", "40%", "talle 42". Son los datos duros. */
function extraerDatos(texto) {
  const plano = String(texto || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return (plano.match(/\d+(?:[.,]\d+)?\s*(?:%|mm|cm|m|kg|g|gr|lts?|l|pulgadas?|"|talles?|años?)/gi) || [])
    .map((s) => s.toLowerCase().replace(/\s+/g, ' ').trim());
}

/** Palabras que sólo pueden aparecer si YA estaban: certificaciones y normas. */
const PALABRAS_RIESGO = /\b(iram|iso\s*\d|ansi|astm|ce\b|certificad[oa]|homologad[oa]|norma\s+\w+|garantía\s+de\s+\d+)/gi;

/**
 * Compara original contra reescrito y devuelve los problemas encontrados.
 * No corrige: sólo avisa, para que una descripción sospechosa no se publique sola.
 */
function verificar(original, nuevo) {
  const problemas = [];

  const datosOrig = new Set(extraerDatos(original));
  const datosNuevo = extraerDatos(nuevo);
  const inventados = datosNuevo.filter((d) => !datosOrig.has(d));
  if (inventados.length) problemas.push(`números que no estaban en el original: ${inventados.join(', ')}`);

  const riesgoOrig = new Set((String(original).match(PALABRAS_RIESGO) || []).map((s) => s.toLowerCase()));
  const riesgoNuevo = (String(nuevo).match(PALABRAS_RIESGO) || []).map((s) => s.toLowerCase());
  const certInventadas = riesgoNuevo.filter((p) => !riesgoOrig.has(p));
  if (certInventadas.length) problemas.push(`menciona certificaciones/normas que no estaban: ${certInventadas.join(', ')}`);

  const largoOrig = String(original).replace(/<[^>]+>/g, '').trim().length;
  const largoNuevo = String(nuevo).replace(/<[^>]+>/g, '').trim().length;
  if (largoNuevo < largoOrig * 0.6) {
    problemas.push(`quedó ${Math.round((1 - largoNuevo / largoOrig) * 100)}% más corta: puede haber perdido información`);
  }
  return problemas;
}

/* ------------------------------ reescritura ------------------------------ */

const SISTEMA = `Sos redactor de fichas de producto de una tienda argentina de ropa y calzado
de trabajo y seguridad industrial (BLACKS Indumentaria). Reescribís descripciones que YA existen.

TU TAREA ES REESTRUCTURAR, NO CREAR. Reglas absolutas:
- PROHIBIDO agregar información que no esté en el texto original. Nada de certificaciones,
  normas (IRAM, ISO, ANSI), garantías, materiales, medidas ni porcentajes nuevos. Si el original
  no lo dice, no existe.
- PROHIBIDO borrar información. Todo dato técnico, material, medida, color o uso que esté en el
  original tiene que seguir estando.
- Los marcadores [[IMG_0]], [[IMG_1]] son imágenes: copialos TAL CUAL donde correspondan por
  contexto. No los borres ni los inventes.
- Escribí en español rioplatense (vos, no tú). Tono directo y concreto, sin exageraciones
  publicitarias vacías ("el mejor del mercado", "increíble", "revolucionario").
- El comprador es trabajador, empresa o comercio: le importa que dure, que sea cómodo y que
  cumpla la función. Hablale de eso.

ESTRUCTURA que tenés que devolver (HTML simple):
1. Un <p> de apertura de 1 o 2 oraciones: qué es y para quién sirve.
2. <h3>Características</h3> seguido de un <ul> con <li> y <strong> para el nombre de cada
   característica. Una línea por característica, concreta.
3. Si el original menciona usos o rubros, <h3>Ideal para</h3> con un <ul> corto.
4. Si el original tiene datos de materiales/composición/talles, <h3>Ficha técnica</h3> con <ul>.
5. Los marcadores de imagen donde tengan sentido.
NO uses <h1> ni <h2>: el nombre del producto ya es el H1 de la página.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    descripcion_html: { type: 'string', description: 'La descripción reescrita en HTML simple' },
    cambios: { type: 'string', description: 'En una línea, qué se reordenó' },
  },
  required: ['descripcion_html'],
};

/**
 * Reescribe UNA descripción. Devuelve el resultado junto con los problemas
 * detectados; nunca escribe en Tiendanube (de eso se encarga quien la llame).
 */
async function reescribir({ nombre, descripcion }) {
  const original = String(descripcion || '');
  if (original.replace(/<[^>]+>/g, '').trim().length < 60) {
    return { ok: false, motivo: 'la descripción original es demasiado corta para reestructurar' };
  }

  const { pelado, imagenes } = extraerImagenes(original);

  const salida = await generateJson({
    system: SISTEMA,
    prompt: `Producto: ${nombre}\n\nDescripción actual (reestructurala respetando las reglas):\n\n${pelado}`,
    schema: ESQUEMA,
    temperature: 0.4,
    maxTokens: 2500,
  });

  if (!salida || !salida.descripcion_html) return { ok: false, motivo: 'la IA no devolvió texto' };

  const { html, repuestasAlFinal } = reponerImagenes(salida.descripcion_html, imagenes);
  const problemas = verificar(pelado, salida.descripcion_html);
  if (repuestasAlFinal) problemas.push(`${repuestasAlFinal} imagen(es) que la IA había quitado se repusieron al final`);

  return {
    ok: true,
    original,
    nuevo: html,
    cambios: salida.cambios || '',
    problemas,
    imagenes: imagenes.length,
  };
}

module.exports = { reescribir, extraerImagenes, reponerImagenes, verificar, extraerDatos };
