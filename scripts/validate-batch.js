require('dotenv').config();
const pool = require('../src/db');
const { generateForSlot } = require('./generate-daily');

/**
 * TANDA DE VALIDACIÓN (herramienta de desarrollo, no corre en producción).
 *
 * Genera varias piezas reales seguidas cubriendo pilares y formatos distintos, y
 * reporta con qué plantilla salió cada una y si alguna rompió. Existe porque probar
 * una sola pieza no alcanza: los problemas aparecen en las combinaciones (carrusel
 * educativo, historia mayorista, producto sin foto recortable).
 *
 *   node scripts/validate-batch.js        -> las próximas 6 del calendario
 *   node scripts/validate-batch.js 10     -> las próximas 10
 */
const LIMITE = Number(process.argv[2]) || 6;

(async () => {
  const { rows } = await pool.query(
    `SELECT * FROM content_calendar
      WHERE scheduled_date >= CURRENT_DATE AND pillar <> 'repost'
      ORDER BY scheduled_date LIMIT $1`, [LIMITE]
  );
  console.log(`[tanda] ${rows.length} slots a generar\n`);
  const res = [];
  for (const slot of rows) {
    const t0 = Date.now();
    try {
      await generateForSlot(slot);
      const a = await pool.query(
        'SELECT id, template, image_path FROM generated_assets WHERE calendar_id=$1 ORDER BY id DESC LIMIT 1', [slot.id]
      );
      const p = a.rows[0];
      res.push({
        slot: slot.id, pilar: slot.pillar,
        formato: `${slot.format}/${slot.post_type}${slot.carousel ? '/carrusel' : ''}`,
        plantilla: p ? p.template : 'SIN PIEZA', url: p ? p.image_path : null,
        seg: Math.round((Date.now() - t0) / 1000),
      });
    } catch (e) {
      res.push({
        slot: slot.id, pilar: slot.pillar, formato: `${slot.format}/${slot.post_type}`,
        plantilla: `ERROR: ${e.message.slice(0, 60)}`, seg: Math.round((Date.now() - t0) / 1000),
      });
    }
  }
  console.log('\n===== RESULTADO =====');
  console.table(res.map(({ url, ...r }) => r));
  console.log('\nURLs:');
  res.forEach((r) => r.url && console.log(` ${r.slot} ${r.plantilla}  ${r.url}`));
  const rotas = res.filter((r) => String(r.plantilla).startsWith('ERROR') || r.plantilla === 'SIN PIEZA');
  console.log(`\n${res.length - rotas.length}/${res.length} piezas generadas sin error.`);
  await pool.end();
})().catch((e) => { console.error('FALLA GENERAL:', e); process.exit(1); });
