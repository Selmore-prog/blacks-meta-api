const pool = require('./db');

/**
 * Ciclo de 14 días combinando feed / reel / historias, con:
 *  - format: 'feed' (4:5) | 'story' (9:16, incluye reels e historias)
 *  - automation_level: 'auto' (se publica solo) | 'semi' (se genera la pieza pero
 *    la publicás vos desde la app para poder sumar el sticker/encuesta, porque la
 *    API de Meta NO deja agregar stickers automáticamente)
 *  - interaction_hint: qué interacción agregar a mano cuando es 'semi'
 *  - scheduled_time: hora sugerida ARG (referencia para vos)
 *  - theme_title: temática del día
 */
const ROTATION = [
  // ---- Semana 1 ----
  { post_type: 'reel',  format: 'story', pillar: 'producto',   pillar_detail: 'Pampero - línea urbana/cargo', automation_level: 'auto', scheduled_time: '18:00', theme_title: 'Arranca la semana con lo nuevo' },
  { post_type: 'story', format: 'story', pillar: 'engagement', pillar_detail: '¿En qué rubro laburás?', automation_level: 'semi', interaction_hint: 'Agregá una ENCUESTA con 2 opciones: "Construcción/Obra" vs "Industria/Taller".', scheduled_time: '13:00', theme_title: 'Conocé a la comunidad' },
  { post_type: 'feed',  format: 'feed',  pillar: 'educativo',  pillar_detail: 'Puntera de acero vs sin puntera: cuándo va cada una', automation_level: 'auto', carousel: true, scheduled_time: '17:00', theme_title: 'Miércoles de saber' },
  { post_type: 'feed',  format: 'feed',  pillar: 'promo',      pillar_detail: 'Envío a todo el país + cuotas sin interés', automation_level: 'auto', scheduled_time: '18:00', theme_title: 'Oferta de la semana' },
  { post_type: 'story', format: 'story', pillar: 'marca',      pillar_detail: 'Pampero: por qué la banca el laburante', automation_level: 'auto', scheduled_time: '18:00', theme_title: 'Marca destacada' },
  { post_type: 'story', format: 'story', pillar: 'promo',      pillar_detail: 'Oferta de la semana en calzado de seguridad', automation_level: 'auto', scheduled_time: '11:00', theme_title: 'Aprovechá' },
  { post_type: 'feed',  format: 'feed',  pillar: 'repost',     pillar_detail: null, automation_level: 'auto', scheduled_time: '12:00', theme_title: 'Descanso / repost' },

  // ---- Semana 2 ----
  { post_type: 'reel',  format: 'story', pillar: 'producto',   pillar_detail: 'EPP: casco + anteojos + faja lumbar', automation_level: 'auto', scheduled_time: '18:00', theme_title: 'Equipate para el laburo' },
  { post_type: 'story', format: 'story', pillar: 'producto',   pillar_detail: 'Producto destacado: lo más vendido', automation_level: 'auto', scheduled_time: '13:00', theme_title: 'Recomendado de la semana' },
  { post_type: 'feed',  format: 'feed',  pillar: 'ugc',        pillar_detail: 'Caso mayorista: uniformamos a una empresa', automation_level: 'auto', scheduled_time: '17:00', theme_title: 'Clientes que confían' },
  { post_type: 'feed',  format: 'feed',  pillar: 'mayorista',  pillar_detail: 'Escala de descuentos + pedí tu presupuesto', automation_level: 'auto', carousel: true, scheduled_time: '18:00', theme_title: 'Para empresas' },
  { post_type: 'story', format: 'story', pillar: 'marca',      pillar_detail: 'Grafa 70 / Gurre', automation_level: 'auto', scheduled_time: '18:00', theme_title: 'Marca destacada' },
  { post_type: 'story', format: 'story', pillar: 'engagement', pillar_detail: 'Elegí vos: ¿este botín o este zapato?', automation_level: 'semi', interaction_hint: 'Agregá una ENCUESTA con las 2 fotos: "Botín" vs "Zapato".', scheduled_time: '11:00', theme_title: 'Vos elegís' },
  { post_type: 'feed',  format: 'feed',  pillar: 'repost',     pillar_detail: null, automation_level: 'auto', scheduled_time: '12:00', theme_title: 'Descanso / repost' },
];

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Inserta en content_calendar las filas que falten para los próximos `daysAhead` días.
 * No duplica (UNIQUE por fecha/plataforma/post_type).
 */
async function seedCalendar(daysAhead = 14, startDate = new Date()) {
  const inserted = [];

  for (let i = 0; i < daysAhead; i += 1) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const slot = ROTATION[i % ROTATION.length];
    const status = slot.pillar === 'repost' ? 'skipped' : 'pending';

    const result = await pool.query(
      `INSERT INTO content_calendar
         (scheduled_date, platform, post_type, format, pillar, pillar_detail, automation_level, interaction_hint, scheduled_time, theme_title, carousel, status)
       VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (scheduled_date, platform, post_type) DO UPDATE SET
         format = EXCLUDED.format,
         pillar = EXCLUDED.pillar,
         pillar_detail = EXCLUDED.pillar_detail,
         automation_level = EXCLUDED.automation_level,
         interaction_hint = EXCLUDED.interaction_hint,
         scheduled_time = EXCLUDED.scheduled_time,
         theme_title = EXCLUDED.theme_title,
         carousel = EXCLUDED.carousel
       WHERE content_calendar.status = 'pending'
       RETURNING id`,
      [toDateOnly(date), slot.post_type, slot.format, slot.pillar, slot.pillar_detail,
       slot.automation_level || 'auto', slot.interaction_hint || null, slot.scheduled_time || null,
       slot.theme_title || null, Boolean(slot.carousel), status]
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

async function calendarIsEmpty() {
  const { rows } = await pool.query(`SELECT 1 FROM content_calendar LIMIT 1`);
  return rows.length === 0;
}

module.exports = { ROTATION, seedCalendar, getPendingForDate, calendarIsEmpty };
