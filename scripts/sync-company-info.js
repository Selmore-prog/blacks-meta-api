const pool = require('../src/db');
const { syncCompanyInfo } = require('../src/companyInfo');

// Refresca a mano los datos verificados de la empresa (web oficial -> IA -> company_facts).
// Útil para el bootstrap inicial o para forzar una actualización sin esperar el cron semanal.
if (require.main === module) {
  syncCompanyInfo()
    .then((r) => {
      console.log(`[sync-company-info] Listo: ${r.facts_count} dato(s), ${r.pages_read}/${r.pages_total} página(s).`);
      return pool.end();
    })
    .catch((err) => {
      console.error('[sync-company-info] Error:', err.message);
      process.exit(1);
    });
}
