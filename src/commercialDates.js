const pool = require('./db');

function thirdSunday(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  let count = 0;
  while (d.getUTCMonth() === monthIndex) {
    if (d.getUTCDay() === 0) {
      count += 1;
      if (count === 3) return d.toISOString().slice(0, 10);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

function blackFriday(year) {
  const d = new Date(Date.UTC(year, 10, 30)); // Noviembre
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function event(date, title, category, angle, priority = 5, source = 'seed') {
  return { date, title, category, angle, priority, source };
}

function defaultCommercialDates(year = new Date().getFullYear()) {
  const items = [
    event(`${year}-01-15`, 'Pleno verano', 'temporada', 'Ropa fresca, remeras y prendas livianas para laburar con calor.', 3),
    event(`${year}-03-01`, 'Vuelta al ritmo de trabajo', 'temporada', 'Reponer básicos de trabajo después del verano.', 4),
    event(`${year}-05-01`, 'Día del Trabajador', 'marca', 'Mensaje de marca para la gente que labura todos los días.', 8),
    event(`${year}-05-10`, 'Arranque del frío', 'temporada', 'Camperas, buzos, polares y abrigo para intemperie.', 7),
    event(`${year}-06-15`, 'Aguinaldo de invierno', 'promo', 'Momento fuerte para renovar calzado de seguridad y abrigo.', 9),
    event(`${year}-06-21`, 'Invierno', 'temporada', 'Contenido de abrigo, capas y prendas resistentes al frío.', 7),
    event(thirdSunday(year, 5), 'Día del Padre', 'promo', 'Regalos útiles: calzado, camperas y ropa de trabajo que dura.', 8),
    event(`${year}-07-09`, 'Día de la Independencia', 'marca', 'Guiño argentino, industria y trabajo nacional sin sobreactuar.', 3),
    event(`${year}-07-20`, 'Día del Amigo', 'engagement', 'Encuestas/duplas de productos para compartir o recomendar.', 3),
    event(`${year}-09-21`, 'Primavera', 'temporada', 'Media estación: buzos livianos, rompevientos y prendas versátiles.', 4),
    event(thirdSunday(year, 9), 'Día de la Madre', 'promo', 'Regalos útiles y promos de temporada.', 5),
    event(blackFriday(year), 'Black Friday', 'promo', 'Urgencia comercial con ofertas y cuotas.', 8),
    event(`${year}-12-15`, 'Aguinaldo de fin de año', 'promo', 'Renovar equipo, calzado y ropa de trabajo antes de cerrar el año.', 9),
    event(`${year}-12-24`, 'Navidad', 'promo', 'Regalos útiles y compras de último momento.', 5),
  ];

  // Fechas CACE confirmadas para 2026. Para años siguientes quedan como eventos editables,
  // no oficiales, para que la app igual pueda planificar con anticipación.
  if (year === 2026) {
    items.push(
      event('2026-05-11', 'Hot Sale 2026 - día 1', 'promo', 'Ofertas fuertes con stock y envío a todo el país.', 10, 'CACE'),
      event('2026-05-12', 'Hot Sale 2026 - día 2', 'promo', 'Recordatorio de oportunidad y productos más consultados.', 10, 'CACE'),
      event('2026-05-13', 'Hot Sale 2026 - último día', 'promo', 'Urgencia real: cierre de promos.', 10, 'CACE'),
      event('2026-11-03', 'CyberMonday 2026 - día 1', 'promo', 'Campaña digital, cuotas y ofertas online.', 10, 'CACE/Tiendanube'),
      event('2026-11-04', 'CyberMonday 2026 - día 2', 'promo', 'Refuerzo de productos con más clicks/consultas.', 10, 'CACE/Tiendanube'),
      event('2026-11-05', 'CyberMonday 2026 - último día', 'promo', 'Último llamado con CTA directo.', 10, 'CACE/Tiendanube'),
    );
  } else {
    items.push(
      event(`${year}-05-11`, 'Semana Hot Sale (a confirmar)', 'promo', 'Preparar campaña de ofertas online cuando CACE confirme fecha.', 6),
      event(`${year}-11-03`, 'Semana CyberMonday (a confirmar)', 'promo', 'Preparar campaña digital cuando CACE confirme fecha.', 6),
    );
  }

  return items.filter((item) => item.date);
}

async function seedCommercialDates({ fromYear = new Date().getFullYear(), years = 2 } = {}) {
  const rows = [];
  for (let y = fromYear; y < fromYear + years; y += 1) rows.push(...defaultCommercialDates(y));
  for (const row of rows) {
    await pool.query(
      `INSERT INTO commercial_dates (event_date, title, category, angle, priority, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_date, title) DO UPDATE SET
         category = EXCLUDED.category,
         angle = EXCLUDED.angle,
         priority = EXCLUDED.priority,
         source = EXCLUDED.source`,
      [row.date, row.title, row.category, row.angle, row.priority, row.source]
    );
  }
  return rows.length;
}

async function listCommercialDates({ from, to } = {}) {
  const start = from || new Date().toISOString().slice(0, 10);
  const end = to || (() => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 60);
    return d.toISOString().slice(0, 10);
  })();
  const { rows } = await pool.query(
    `SELECT id, event_date, title, category, angle, priority, source
     FROM commercial_dates
     WHERE event_date BETWEEN $1 AND $2
     ORDER BY event_date, priority DESC, id`,
    [start, end]
  );
  return rows;
}

async function getCommercialContextForDate(date, { daysAhead = 7 } = {}) {
  const start = String(date || new Date()).slice(0, 10);
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + daysAhead);
  const end = endDate.toISOString().slice(0, 10);
  const rows = await listCommercialDates({ from: start, to: end });
  if (!rows.length) return null;
  return rows.map((r) => {
    const day = String(r.event_date).slice(0, 10);
    return `${day}: ${r.title} (${r.category}) - ${r.angle}`;
  }).join('\n');
}

module.exports = {
  defaultCommercialDates,
  seedCommercialDates,
  listCommercialDates,
  getCommercialContextForDate,
};
