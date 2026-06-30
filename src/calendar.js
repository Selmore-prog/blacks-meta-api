const pool = require('./db');

/**
 * Ciclo de 14 dias (2 semanas) basado en el documento de estrategia.
 * Repetilo indefinidamente rotando que producto/marca puntual se usa
 * en cada slot (eso lo resuelve generate-daily.js al elegir el producto).
 *
 * post_type: 'feed' | 'reel' | 'story'
 * pillar:    'producto' | 'educativo' | 'promo' | 'marca' | 'mayorista' | 'ugc' | 'engagement' | 'repost'
 */
const ROTATION = [
  { post_type: 'reel', pillar: 'producto', pillar_detail: 'Pampero - linea urbana/cargo' }, // Lunes S1
  { post_type: 'story', pillar: 'engagement', pillar_detail: 'Encuesta: en que rubro trabajas' }, // Martes S1
  { post_type: 'feed', pillar: 'educativo', pillar_detail: 'Puntera de acero vs sin puntera' }, // Miercoles S1
  { post_type: 'feed', pillar: 'promo', pillar_detail: 'Envio gratis + 6 cuotas sin interes' }, // Jueves S1
  { post_type: 'story', pillar: 'marca', pillar_detail: 'Pampero' }, // Viernes S1
  { post_type: 'story', pillar: 'ugc', pillar_detail: 'Deposito / equipo Mataderos' }, // Sabado S1
  { post_type: 'feed', pillar: 'repost', pillar_detail: null }, // Domingo S1 (se omite en generacion automatica)

  { post_type: 'reel', pillar: 'producto', pillar_detail: 'EPP: casco + anteojos + faja lumbar' }, // Lunes S2
  { post_type: 'story', pillar: 'educativo', pillar_detail: 'Trivia: normativa de seguridad laboral' }, // Martes S2
  { post_type: 'feed', pillar: 'ugc', pillar_detail: 'Caso de exito cliente mayorista' }, // Miercoles S2
  { post_type: 'feed', pillar: 'mayorista', pillar_detail: 'Escala de descuentos + cotizador online' }, // Jueves S2
  { post_type: 'story', pillar: 'marca', pillar_detail: 'Gurre / Grafa 70' }, // Viernes S2
  { post_type: 'story', pillar: 'engagement', pillar_detail: 'Elegi vos: este botin o este zapato' }, // Sabado S2
  { post_type: 'feed', pillar: 'repost', pillar_detail: null }, // Domingo S2
];

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Inserta en content_calendar las filas que falten para los proximos `daysAhead` dias,
 * empezando desde hoy, siguiendo el ciclo ROTATION. No duplica si ya existen
 * (gracias al UNIQUE de la tabla).
 */
async function seedCalendar(daysAhead = 14, startDate = new Date()) {
  const inserted = [];

  for (let i = 0; i < daysAhead; i += 1) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const slot = ROTATION[i % ROTATION.length];

    const result = await pool.query(
      `INSERT INTO content_calendar (scheduled_date, platform, post_type, pillar, pillar_detail, status)
       VALUES ($1, 'instagram', $2, $3, $4, $5)
       ON CONFLICT (scheduled_date, platform, post_type) DO NOTHING
       RETURNING id`,
      [toDateOnly(date), slot.post_type, slot.pillar, slot.pillar_detail, slot.pillar === 'repost' ? 'skipped' : 'pending']
    );

    if (result.rows[0]) inserted.push(result.rows[0].id);
  }

  return inserted;
}

async function getPendingForDate(date = new Date()) {
  const { rows } = await pool.query(
    `SELECT * FROM content_calendar WHERE scheduled_date = $1 AND status = 'pending' ORDER BY id`,
    [toDateOnly(date)]
  );
  return rows;
}

module.exports = { ROTATION, seedCalendar, getPendingForDate };
