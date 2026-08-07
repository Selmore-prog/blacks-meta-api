/* =========================================================================
 * AJUSTES EDITABLES DESDE EL PANEL (ago-2026)
 *
 * Hasta ahora el modelo de imagen se fijaba con la variable GEMINI_IMAGE_MODEL
 * en Render: cambiarlo obligaba a tocar el deploy. Como la decisión "más calidad
 * vs. menos costo por imagen" es del dueño y depende del mes, vive acá: una
 * tabla clave/valor chiquita que pisa la config en caliente.
 *
 * Se cargan al arrancar el server y en cada corrida de generación (que es un
 * proceso aparte cuando la dispara el cron).
 * ========================================================================= */

const pool = require('./db');
const config = require('./config');

// Modelos habilitados para generar las escenas de las piezas, con el precio por
// imagen de la tarifa pública de Google (ago-2026). Se muestran en el panel.
const IMAGE_MODEL_OPTIONS = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Económico',
    desc: 'El de siempre. Buen resultado y el más barato por pieza.',
    usd: 0.039,
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Mejorado',
    desc: 'Modelo más nuevo: más nitidez y mejor respeto de la indicación. Tarda la mitad.',
    usd: 0.067,
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Máxima calidad',
    desc: 'El mejor de Google para producto. Para campañas importantes.',
    usd: 0.139,
  },
];

const VALID_IMAGE_MODELS = IMAGE_MODEL_OPTIONS.map((o) => o.id);

async function getSetting(key) {
  try {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : null;
  } catch (err) {
    // Tabla todavía no migrada: se sigue con lo que diga el entorno.
    return null;
  }
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

/** Aplica a config lo que esté guardado en la base. Best-effort: nunca rompe el arranque. */
async function loadSettings() {
  const model = await getSetting('image_model');
  if (model && VALID_IMAGE_MODELS.includes(model)) {
    config.gemini.imageModel = model;
  }
  return { imageModel: config.gemini.imageModel };
}

async function setImageModel(model) {
  if (!VALID_IMAGE_MODELS.includes(model)) {
    const err = new Error(`Modelo de imagen no permitido: ${model}`);
    err.status = 400;
    throw err;
  }
  await setSetting('image_model', model);
  config.gemini.imageModel = model;
  return model;
}

/**
 * Cuánto vale para el negocio UNA consulta mayorista (WhatsApp / cotizador).
 * Es el único número que permite comparar en la misma escala una campaña que
 * manda a /mayorista (donde no hay carrito, así que nunca va a haber ROAS) con
 * una que vende online. Lo carga el dueño: ticket mayorista promedio × cuántas
 * consultas terminan cerrando. 0 = todavía no lo cargó.
 */
async function getLeadValue() {
  const v = Number(await getSetting('valor_consulta_mayorista'));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function setLeadValue({ ticket = 0, cierrePct = 0, valor = 0 } = {}) {
  const calculado = valor > 0 ? Number(valor) : Number(ticket) * (Number(cierrePct) / 100);
  const final = Number.isFinite(calculado) && calculado > 0 ? Math.round(calculado) : 0;
  await setSetting('valor_consulta_mayorista', String(final));
  if (ticket) await setSetting('ticket_mayorista', String(Math.round(Number(ticket))));
  if (cierrePct) await setSetting('cierre_mayorista_pct', String(Number(cierrePct)));
  return final;
}

/** Los supuestos con los que se calculó el valor, para poder mostrarlos/editarlos. */
async function getLeadValueDetail() {
  const [valor, ticket, cierre] = await Promise.all([
    getLeadValue(),
    getSetting('ticket_mayorista'),
    getSetting('cierre_mayorista_pct'),
  ]);
  return { valor, ticket: Number(ticket) || 0, cierrePct: Number(cierre) || 0 };
}

module.exports = {
  IMAGE_MODEL_OPTIONS, VALID_IMAGE_MODELS, loadSettings, getSetting, setSetting, setImageModel,
  getLeadValue, setLeadValue, getLeadValueDetail,
};
