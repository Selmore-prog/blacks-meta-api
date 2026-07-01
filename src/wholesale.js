const pool = require('./db');

async function getWholesaleSettings() {
  const { rows } = await pool.query(`SELECT * FROM wholesale_settings WHERE id = 1`);
  return rows[0] || { id: 1, min_qty: null, conditions: null, discount_note: null, contact: null };
}

async function saveWholesaleSettings({ min_qty, conditions, discount_note, contact }) {
  await pool.query(
    `INSERT INTO wholesale_settings (id, min_qty, conditions, discount_note, contact, updated_at)
     VALUES (1, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       min_qty = EXCLUDED.min_qty, conditions = EXCLUDED.conditions,
       discount_note = EXCLUDED.discount_note, contact = EXCLUDED.contact, updated_at = now()`,
    [min_qty || null, conditions || null, discount_note || null, contact || null]
  );
  return getWholesaleSettings();
}

/** Texto listo para inyectar en el prompt de copy de piezas mayoristas. */
function wholesaleContext(w) {
  if (!w) return '';
  const parts = [];
  if (w.min_qty) parts.push(`Compra mínima: ${w.min_qty} unidades.`);
  if (w.discount_note) parts.push(`Descuentos: ${w.discount_note}.`);
  if (w.conditions) parts.push(`Condiciones: ${w.conditions}.`);
  if (w.contact) parts.push(`Para pedir presupuesto: ${w.contact}.`);
  return parts.join(' ');
}

module.exports = { getWholesaleSettings, saveWholesaleSettings, wholesaleContext };
