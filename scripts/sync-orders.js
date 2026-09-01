const pool = require('../src/db');
const { fetchOrders } = require('../src/tiendanube');

/* =========================================================================
 * COPIA LOCAL DE LOS PEDIDOS DE TIENDANUBE (orders_cache).
 *
 * Por qué hace falta guardarlos y no consultarlos en vivo: la sección de
 * Estadísticas contesta por CUALQUIER rango de fechas (últimos 7, 15, 30, 60 días,
 * un mes de hace un año, comparado contra el período anterior...). Pedirle eso a la
 * API de Tiendanube en cada carga son decenas de páginas de 200 pedidos por
 * consulta: lento, frágil y con límite de rate. Contra la base es instantáneo.
 *
 * DOS MODOS:
 *   backfill    (tabla vacía o `--dias N`): trae por FECHA DE PEDIDO hacia atrás.
 *   incremental (lo de todos los días): trae por FECHA DE MODIFICACIÓN desde la
 *               última corrida menos 2 días de colchón. Es la única forma de
 *               enterarse de un pedido que se pagó o se canceló DESPUÉS: su
 *               created_at no cambia, su updated_at sí.
 * ========================================================================= */

const DIAS_BACKFILL = 730; // 2 años: alcanza para comparar contra el mismo mes del año pasado

const COLUMNAS = `id, number, created_at, paid_at, cancelled_at, status, payment_status,
  shipping_status, total, subtotal, discount, shipping_cost, currency, gateway,
  shipping_option, coupon, customer_id, customer_name, customer_email, province, city,
  landing_url, order_origin, products, raw`;

async function guardar(o) {
  await pool.query(
    `INSERT INTO orders_cache (${COLUMNAS}, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now())
     ON CONFLICT (id) DO UPDATE SET
       number = EXCLUDED.number, created_at = EXCLUDED.created_at, paid_at = EXCLUDED.paid_at,
       cancelled_at = EXCLUDED.cancelled_at, status = EXCLUDED.status,
       payment_status = EXCLUDED.payment_status, shipping_status = EXCLUDED.shipping_status,
       total = EXCLUDED.total, subtotal = EXCLUDED.subtotal, discount = EXCLUDED.discount,
       shipping_cost = EXCLUDED.shipping_cost, currency = EXCLUDED.currency,
       gateway = EXCLUDED.gateway, shipping_option = EXCLUDED.shipping_option,
       coupon = EXCLUDED.coupon, customer_id = EXCLUDED.customer_id,
       customer_name = EXCLUDED.customer_name, customer_email = EXCLUDED.customer_email,
       province = EXCLUDED.province, city = EXCLUDED.city, landing_url = EXCLUDED.landing_url,
       order_origin = EXCLUDED.order_origin, products = EXCLUDED.products, raw = EXCLUDED.raw,
       synced_at = now()`,
    [o.id, o.number, o.created_at, o.paid_at, o.cancelled_at, o.status, o.payment_status,
      o.shipping_status, o.total, o.subtotal, o.discount, o.shipping_cost, o.currency, o.gateway,
      o.shipping_option, o.coupon, o.customer_id, o.customer_name, o.customer_email, o.province,
      o.city, o.landing_url, o.order_origin, JSON.stringify(o.products || []), o.raw]
  );
}

/**
 * @param {number|null} dias  fuerza un backfill de tantos días hacia atrás.
 * @returns {{modo, pedidos, desde}}
 */
async function syncOrders({ dias = null } = {}) {
  const { rows } = await pool.query('SELECT count(*)::int AS total, max(synced_at) AS ultimo FROM orders_cache');
  const vacia = !rows[0] || rows[0].total === 0;
  const backfill = vacia || Boolean(dias);

  let desde;
  let by;
  if (backfill) {
    const d = dias || DIAS_BACKFILL;
    desde = new Date(Date.now() - d * 864e5).toISOString();
    by = 'created_at';
    console.log(`[sync-orders] Backfill: pedidos creados desde ${desde.slice(0, 10)} (${d} días).`);
  } else {
    // 2 días de colchón: barato y cubre cualquier corrida que se haya salteado.
    const ultimo = new Date(rows[0].ultimo || Date.now() - 7 * 864e5);
    desde = new Date(ultimo.getTime() - 2 * 864e5).toISOString();
    by = 'updated_at';
    console.log(`[sync-orders] Incremental: pedidos modificados desde ${desde.slice(0, 16)}.`);
  }

  const pedidos = await fetchOrders({ since: desde, by, maxPages: backfill ? 80 : 20 });
  console.log(`[sync-orders] ${pedidos.length} pedido(s) traídos. Guardando...`);
  for (const o of pedidos) await guardar(o);

  const resumen = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status <> 'cancelled')::int AS validos,
            min(created_at)::date AS primero, max(created_at)::date AS ultimo
       FROM orders_cache`
  );
  const r = resumen.rows[0];
  console.log(`[sync-orders] Listo. ${r.total} pedidos en la base (${r.validos} no cancelados), del ${r.primero} al ${r.ultimo}.`);
  return { modo: backfill ? 'backfill' : 'incremental', pedidos: pedidos.length, desde, total: r.total };
}

if (require.main === module) {
  // node scripts/sync-orders.js --dias 730
  const i = process.argv.indexOf('--dias');
  const dias = i > -1 ? Number(process.argv[i + 1]) : null;
  syncOrders({ dias: Number.isFinite(dias) ? dias : null })
    .then(() => pool.end())
    .catch((err) => {
      console.error('[sync-orders] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { syncOrders };
