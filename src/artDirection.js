const pool = require('./db');

/**
 * DIRECCIÓN DE ARTE · memoria de diseño del feed.
 *
 * Por qué existe (feedback del dueño, ago-2026): "que no siempre tengan el mismo fondo
 * y demás… que quede como si un diseñador gráfico estuviera haciendo las piezas día a
 * día y fuera cambiando". Los números le daban la razón: en 45 días, 29 de 72 piezas
 * salieron con la plantilla `fullbleed` (40%), en el pilar `producto` dos plantillas se
 * comieron el 84%, y `grid`/`overlap`/`splitscreen`/`polaroidstrip` no se usaron NUNCA.
 * Hubo tres `fullbleed` seguidas el mismo día más de una vez.
 *
 * La causa no era falta de plantillas sino falta de MEMORIA: cada pieza se decidía
 * sola, sin saber cómo venían saliendo las anteriores. El director creativo (IA)
 * elegía siempre la opción más "segura" y la rotación de respaldo (`slot.id % n`) no
 * garantiza nada porque los ids no son consecutivos por pilar.
 *
 * Acá vive esa memoria y se aplica en DOS niveles:
 *
 *  1. PLANTILLA — se penalizan las usadas hace poco. El director sigue eligiendo, pero
 *     sobre un menú del que se sacaron las repetidas (si queda alternativa válida).
 *  2. VARIANTE DE LAYOUT — dentro de una misma plantilla, la composición cambia
 *     (dónde va el precio, si hay banda de color, marco, scrim). Así, aunque dos
 *     piezas usen `fullbleed`, no se ven iguales en la grilla del perfil.
 *
 * Todo es best-effort: si la DB no responde, se devuelve el pool sin tocar y la
 * generación sigue como siempre.
 */

/**
 * VARIANTES DE COMPOSICIÓN por plantilla.
 *
 * Son cambios de LAYOUT reales (posición, jerarquía, tratamiento del fondo), no de
 * color: la identidad de la marca —negro, naranja quemado, Anton + Inter— no se toca.
 * Un diseñador que trabaja bien para una marca varía la composición, no la paleta.
 */
const TEMPLATE_VARIANTS = {
  fullbleed: [
    // La de siempre: scrim editorial y tarjeta de precio de vidrio abajo a la izquierda.
    'clasico',
    // Lower-third de aviso: banda oscura sólida abajo con el precio y el CTA adentro.
    // La foto respira arriba, sin la viñeta radial que oscurece el centro.
    'banda',
    // Sin tarjeta: el precio va como etiqueta angular arriba a la derecha y el titular
    // gigante abajo a la izquierda, tipo afiche de vía pública.
    'esquina',
    // Aviso de revista: la foto va enmarcada con margen de "papel" y el bloque de texto
    // ocupa la franja inferior con fondo claro. Rompe con el negro de las otras tres.
    'marco',
  ],
  // El resto de las plantillas todavía no tiene variantes implementadas en el
  // renderer. NO se listan acá aunque sería fácil escribirlas: la memoria de diseño
  // asumiría que la pieza cambió de composición cuando en realidad salió idéntica, y
  // la rotación de plantillas —que es la que más mueve la aguja— quedaría relajada
  // por una variedad que no existe. Al agregar una variante a una plantilla, se
  // implementa primero en imageRenderer y recién ahí se anota acá.
};

/** Variantes válidas de una plantilla (siempre incluye 'clasico'). */
function variantsFor(template) {
  return TEMPLATE_VARIANTS[template] || ['clasico'];
}

/**
 * Historial de diseño reciente: qué plantilla + variante salió en las últimas piezas.
 * Se lee de generated_assets (la columna `template` guarda "plantilla:variante" desde
 * ago-2026; las filas viejas traen sólo la plantilla y se leen igual).
 */
async function recentDesigns(limit = 10) {
  try {
    const { rows } = await pool.query(
      `SELECT template FROM generated_assets
       WHERE template IS NOT NULL AND status != 'discarded'
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    return rows.map((r) => decodeDesign(r.template));
  } catch (_) {
    return [];
  }
}

/**
 * Saca del pool las plantillas usadas en las últimas `ventana` piezas.
 *
 * Regla de seguridad: si filtrar deja el pool vacío, se devuelve el original. Nunca se
 * bloquea una generación por variedad — es preferible una plantilla repetida a una
 * pieza que no sale. Y se afloja de a poco: primero se intenta excluir las últimas 3,
 * si no queda nada, las últimas 2, después la última.
 */
function withoutRecent(pool_, recientes, ventana = 3) {
  const opciones = Array.isArray(pool_) ? pool_.filter(Boolean) : [];
  if (opciones.length <= 1) return opciones;
  for (let n = ventana; n >= 1; n -= 1) {
    const usadas = new Set(recientes.slice(0, n).map((d) => d.template));
    const libres = opciones.filter((t) => !usadas.has(t));
    if (libres.length) return libres;
  }
  return opciones;
}

/**
 * Elige la variante de composición de una plantilla: la que hace más que no se usa
 * con esa plantilla. Determinística salvo empate (ahí desempata el seed del slot),
 * así dos piezas del mismo día no caen en la misma.
 */
function pickVariant(template, recientes, seed = 0) {
  const opciones = variantsFor(template);
  if (opciones.length <= 1) return opciones[0];
  // Antigüedad de cada variante: cuántas piezas atrás se usó por última vez con ESTA
  // plantilla. Sin uso reciente = infinito (candidata ideal).
  const antiguedad = new Map(opciones.map((v) => [v, Infinity]));
  recientes.forEach((d, i) => {
    if (d.template !== template) return;
    if (antiguedad.get(d.variant) === Infinity) antiguedad.set(d.variant, i);
  });
  let mejor = null;
  let mejorEdad = -1;
  const desempate = Math.abs(Number(seed) || 0);
  opciones.forEach((v, i) => {
    const edad = antiguedad.get(v);
    // El desempate por seed evita que dos piezas generadas en la misma corrida (que
    // ven el mismo historial) elijan las dos la primera variante libre de la lista.
    const puntaje = edad === Infinity ? 1000 + ((desempate + i) % opciones.length) : edad;
    if (puntaje > mejorEdad) { mejorEdad = puntaje; mejor = v; }
  });
  return mejor || opciones[0];
}

/** "fullbleed:banda" para guardar en generated_assets.template. */
function encodeDesign(template, variant) {
  if (!template) return null;
  return variant && variant !== 'clasico' ? `${template}:${variant}` : template;
}

/** Inverso de encodeDesign. Tolera filas viejas, que guardan sólo la plantilla. */
function decodeDesign(stored) {
  const [template, variant] = String(stored || '').split(':');
  return { template: template || null, variant: variant || 'clasico' };
}

/**
 * Arranques de copy ya usados: las primeras palabras de las últimas piezas.
 *
 * Medición real (45 días, 72 piezas): 8 empezaban con "llevate las", 5 con "equipá a",
 * 4 con "aprovechá la"… ~40% del feed arrancaba con una de 8 fórmulas. El prompt ya
 * pedía "no repitas temas", pero nunca le mostraba al modelo CÓMO venía arrancando —
 * y el arranque es justo lo único que se lee en el feed antes del "ver más".
 */
async function recentOpeners(limit = 25) {
  try {
    const { rows } = await pool.query(
      `SELECT caption FROM generated_assets
       WHERE caption IS NOT NULL AND status != 'discarded'
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    const vistos = new Set();
    for (const r of rows) {
      const primera = String(r.caption).split('\n')[0].trim();
      const arranque = primera.split(/\s+/).slice(0, 2).join(' ').replace(/[^\p{L}\s]/gu, '').trim();
      if (arranque.length >= 4) vistos.add(arranque.toLowerCase());
    }
    return [...vistos].slice(0, 14);
  } catch (_) {
    return [];
  }
}

/**
 * Todo el contexto de dirección de arte de una pieza, en una sola pasada a la DB.
 * Devuelve { recientes, arranquesUsados }: `recientes` alimenta withoutRecent y
 * pickVariant, `arranquesUsados` viaja al prompt del copy y a su lint.
 *
 * A la IA no se le explica nada de esto a propósito: la variedad se impone en código
 * (el menú ya llega filtrado). Pedirle "no repitas" a un modelo que igual elige la
 * opción más segura fue exactamente lo que no funcionó durante 45 días.
 */
async function directionFor() {
  const [recientes, arranquesUsados] = await Promise.all([recentDesigns(10), recentOpeners(25)]);
  return { recientes, arranquesUsados };
}

module.exports = {
  TEMPLATE_VARIANTS,
  variantsFor,
  recentDesigns,
  recentOpeners,
  withoutRecent,
  pickVariant,
  encodeDesign,
  decodeDesign,
  directionFor,
};
