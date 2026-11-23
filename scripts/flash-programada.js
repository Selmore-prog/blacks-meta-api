#!/usr/bin/env node
/* =========================================================================
 * OFERTAS FLASH: ARRANQUE Y FIN AUTOMÁTICOS DESDE EL CRON — nov-2026
 *
 * POR QUÉ EXISTE
 * El Black Friday tiene que arrancar solo a la medianoche del viernes 27 y
 * terminar solo el lunes 30 a las 23:59 (src/flashSale.js: `programada` y
 * `despues`). El motor ya lo hace al servir el home, pero Render (plan gratis)
 * se duerme y a la medianoche puede no entrar nadie al home: este script lo
 * corre el runner de GitHub Actions a horas fijas. Usa el MISMO candado de la
 * base que Render, así que si los dos llegan a la vez se prende una sola vez.
 *
 *   node scripts/flash-programada.js        → hace lo que corresponda ahora
 *   node scripts/flash-programada.js --ver  → sólo cuenta el estado
 *
 * Si cambió algo escribe `cambio=si` en $GITHUB_OUTPUT: el workflow corrige
 * entonces el catálogo de Meta y refresca el home.
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const flash = require('../src/flashSale');

const hora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false }) : '—');

(async () => {
  const cfg = await flash.getConfig();
  console.log(`Oferta: "${cfg.title}" ${cfg.active ? 'ACTIVA' : 'apagada'} · termina ${hora(cfg.ends_at)}`);
  if (cfg.programada) console.log(`Programada: "${cfg.programada.config.title}" arranca ${hora(cfg.programada.inicia_at)}`);
  if (cfg.despues) console.log(`Después vuelve: "${cfg.despues.title}"`);
  if (process.argv.includes('--ver')) process.exit(0);

  const fin = await flash.maybeAutoEnd();
  const ini = await flash.maybeAutoStart();
  if (fin) console.log('Fin:', JSON.stringify(fin));
  if (ini) console.log('Arranque:', JSON.stringify(ini));
  const cambio = Boolean((fin && !fin.ocupado) || (ini && ini.arranco));
  console.log(cambio ? '✓ Hubo cambio.' : 'Nada que hacer.');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `cambio=${cambio ? 'si' : 'no'}\n`);
  process.exit(0);
})().catch((e) => {
  console.error('Falló:', e.message);
  process.exit(1);
});
