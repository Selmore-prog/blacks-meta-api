/* =========================================================================
 * ESTADÍSTICAS DE LA TIENDA — todo lo que pasa en blacksindumentaria.com.ar,
 * por el rango de fechas que se quiera y comparado contra el período anterior.
 *
 * POR QUÉ EXISTE
 * Tiendanube cobra el plan alto para mostrar estadísticas, y las que muestra son
 * las suyas: no cruzan las visitas de Analytics con los pedidos reales, no separan
 * minorista de mayorista y no se pueden bajar como informe. Acá se arma todo eso
 * con los datos que el motor ya tiene conectados.
 *
 * DE DÓNDE SALE CADA NÚMERO (esto es lo importante para leer el informe)
 *  · VISITAS, ORIGEN DEL TRÁFICO, DISPOSITIVOS, PÁGINAS, VISTAS DE PRODUCTO y los
 *    pasos del embudo (ficha → carrito → checkout) → Google Analytics 4.
 *  · PEDIDOS, FACTURACIÓN, UNIDADES, TICKET, MEDIOS DE PAGO, ENVÍOS, PROVINCIAS,
 *    CUPONES y CLIENTES → los pedidos REALES de Tiendanube (orders_cache).
 *  · CONSULTAS (WhatsApp) → los clics guardados por el propio sitio (lead_clicks).
 *
 * La conversión se calcula con los pedidos de Tiendanube sobre las sesiones de
 * Analytics, y NO con el evento `purchase` de GA4: ese evento subcuenta (medido en
 * la propia cuenta, GA4 informa ~89 compras donde Tiendanube tiene bastantes más),
 * porque se pierden las compras de quien bloquea el tag y las cargadas a mano.
 * GA4 se usa para "cuánta gente" y Tiendanube para "cuánta plata": cada uno en lo
 * que es fuente de verdad.
 * ========================================================================= */

const pool = require('./db');
const { runReport, isEnabled: gaEnabled } = require('./analytics');
const { norm, baseName } = require('./productInterest');

const TZ = 'America/Argentina/Buenos_Aires';
const CUR = 'cur';
const PREV = 'prev';

/* ------------------------------- fechas ------------------------------- */

/** Hoy en Argentina como 'YYYY-MM-DD' (el servidor puede estar en UTC). */
function hoyArg() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Aritmética de fechas en UTC puro: sin husos, 'YYYY-MM-DD' entra y sale. */
function masDias(fecha, n) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

/** Días que abarca el rango, contando los dos extremos. */
function diasDe(from, to) {
  const [y1, m1, d1] = String(from).split('-').map(Number);
  const [y2, m2, d2] = String(to).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5) + 1;
}

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/**
 * Atajos de la barra de arriba del panel. Todos terminan HOY (el día en curso va
 * incompleto y así se avisa) salvo los de mes cerrado.
 */
const PRESETS = {
  '7': { label: 'Últimos 7 días', dias: 7 },
  '15': { label: 'Últimos 15 días', dias: 15 },
  '30': { label: 'Últimos 30 días', dias: 30 },
  '60': { label: 'Últimos 60 días', dias: 60 },
  '90': { label: 'Últimos 90 días', dias: 90 },
  '180': { label: 'Últimos 6 meses', dias: 180 },
  '365': { label: 'Último año', dias: 365 },
  mes_actual: { label: 'Este mes' },
  mes_pasado: { label: 'Mes pasado' },
};

function resolverRango({ preset, from, to } = {}) {
  if (esFecha(from) && esFecha(to)) {
    return from <= to ? { from, to, preset: 'custom' } : { from: to, to: from, preset: 'custom' };
  }
  const hoy = hoyArg();
  const p = PRESETS[String(preset)] ? String(preset) : '30';
  if (p === 'mes_actual') return { from: `${hoy.slice(0, 7)}-01`, to: hoy, preset: p };
  if (p === 'mes_pasado') {
    const primeroDeEste = `${hoy.slice(0, 7)}-01`;
    const ultimoDelPasado = masDias(primeroDeEste, -1);
    return { from: `${ultimoDelPasado.slice(0, 7)}-01`, to: ultimoDelPasado, preset: p };
  }
  return { from: masDias(hoy, -(PRESETS[p].dias - 1)), to: hoy, preset: p };
}

/**
 * Contra qué se compara.
 *   'previo'  → el mismo número de días, pegado antes (lo natural para "¿mejoré?").
 *   'anio'    → las mismas fechas del año pasado (para negocios de temporada).
 *   'ninguno' → sin comparación.
 */
function resolverComparacion(from, to, modo = 'previo') {
  if (modo === 'ninguno') return null;
  if (modo === 'anio') {
    return { from: masDias(from, -365), to: masDias(to, -365), label: 'mismo período del año pasado' };
  }
  const dias = diasDe(from, to);
  return { from: masDias(from, -dias), to: masDias(from, -1), label: 'período anterior' };
}

/* ------------------------------- helpers ------------------------------- */

const n0 = (v) => Number(v || 0);
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

/** Variación %. null = no había base con qué comparar (se muestra "nuevo"). */
function delta(cur, prev) {
  if (prev === null || prev === undefined) return null;
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const filas = (rep) => (rep && rep.rows) || [];
const met = (r, i) => Number(((r.metricValues || [])[i] || {}).value || 0);
const dim = (r, i) => (((r.dimensionValues || [])[i] || {}).value || '');
/** Con dos períodos, GA manda el nombre del rango como ÚLTIMA dimensión. */
const rangoDe = (r) => dim(r, (r.dimensionValues || []).length - 1);

/* ------------------------- Google Analytics ------------------------- */

/** Pasos del embudo minorista, en orden. Todos medidos en SESIONES. */
const PASOS = [
  { evento: null, id: 'sesiones', label: 'Entraron a la tienda' },
  { evento: 'view_item', id: 'ficha', label: 'Miraron un producto' },
  { evento: 'add_to_cart', id: 'carrito', label: 'Pusieron algo en el carrito' },
  { evento: 'begin_checkout', id: 'checkout', label: 'Empezaron a comprar' },
  { evento: 'purchase', id: 'compra', label: 'Compraron' },
];

async function analytics(rango, comparado) {
  if (!gaEnabled()) return null;
  const dateRanges = comparado
    ? [{ startDate: rango.from, endDate: rango.to, name: CUR },
      { startDate: comparado.from, endDate: comparado.to, name: PREV }]
    : [{ startDate: rango.from, endDate: rango.to, name: CUR }];

  const eventosEmbudo = PASOS.filter((p) => p.evento).map((p) => p.evento);
  const pedir = (body) => runReport(body).catch((err) => {
    console.warn(`[storeMetrics] GA no respondió una parte del informe: ${err.message}`);
    return null;
  });

  const [totales, porDia, fuentes, dispositivos, landings, eventos, items] = await Promise.all([
    pedir({
      dateRanges,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
        { name: 'screenPageViews' }, { name: 'engagementRate' }, { name: 'averageSessionDuration' }],
    }),
    pedir({
      dateRanges: [{ startDate: rango.from, endDate: rango.to }],
      dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }], limit: 400,
    }),
    pedir({
      dateRanges, dimensions: [{ name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 30,
    }),
    pedir({
      dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10,
    }),
    pedir({
      dateRanges: [{ startDate: rango.from, endDate: rango.to }],
      dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 25,
    }),
    pedir({
      dateRanges, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [...eventosEmbudo, 'generate_lead'] } } },
      limit: 40,
    }),
    // Vistas por producto: es la consulta más pesada (GA guarda el nombre CON la
    // variante, ~1200 nombres para 352 productos), por eso va con límite alto y
    // se agrupa acá sacando el paréntesis final.
    pedir({
      dateRanges, dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsViewed' }, { name: 'itemsAddedToCart' }, { name: 'itemsPurchased' }],
      orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }], limit: 5000,
    }),
  ]);

  /** Suma una métrica por período. */
  const porRango = (rep, i) => {
    const out = { cur: 0, prev: 0 };
    for (const r of filas(rep)) {
      const bucket = rangoDe(r) === PREV ? 'prev' : 'cur';
      out[bucket] += met(r, i);
    }
    return out;
  };
  // engagementRate y duración son promedios: no se suman entre filas, pero como el
  // reporte de totales trae UNA fila por período, alcanza con leerla.
  const filaDe = (rep, nombre) => filas(rep).find((r) => (comparado ? rangoDe(r) === nombre : true)) || null;

  const cur = filaDe(totales, CUR);
  const prev = comparado ? filaDe(totales, PREV) : null;
  const leer = (fila, i) => (fila ? met(fila, i) : 0);

  const agrupar = (rep, { claveDim = 0, metrica = 0, limite = 12 } = {}) => {
    const map = new Map();
    for (const r of filas(rep)) {
      const k = dim(r, claveDim);
      if (!k) continue;
      const acc = map.get(k) || { nombre: k, cur: 0, prev: 0 };
      acc[rangoDe(r) === PREV ? 'prev' : 'cur'] += met(r, metrica);
      map.set(k, acc);
    }
    return [...map.values()].sort((a, b) => b.cur - a.cur).slice(0, limite);
  };

  const sesionesPorEvento = new Map();
  for (const r of filas(eventos)) {
    const k = dim(r, 0);
    const acc = sesionesPorEvento.get(k) || { cur: 0, prev: 0, eventos: 0 };
    if (rangoDe(r) === PREV) acc.prev += met(r, 0);
    else { acc.cur += met(r, 0); acc.eventos += met(r, 1); }
    sesionesPorEvento.set(k, acc);
  }

  // Productos: vistas/carritos/compras agrupando variantes por nombre base.
  const itemsMap = new Map();
  for (const r of filas(items)) {
    const clave = norm(baseName(dim(r, 0)));
    if (!clave) continue;
    const acc = itemsMap.get(clave) || { vistas: 0, vistasPrev: 0, carritos: 0, compras: 0 };
    if (rangoDe(r) === PREV) acc.vistasPrev += met(r, 0);
    else { acc.vistas += met(r, 0); acc.carritos += met(r, 1); acc.compras += met(r, 2); }
    itemsMap.set(clave, acc);
  }

  return {
    sesiones: { cur: leer(cur, 0), prev: prev ? leer(prev, 0) : null },
    usuarios: { cur: leer(cur, 1), prev: prev ? leer(prev, 1) : null },
    nuevos: { cur: leer(cur, 2), prev: prev ? leer(prev, 2) : null },
    vistasPagina: { cur: leer(cur, 3), prev: prev ? leer(prev, 3) : null },
    engagement: { cur: r2(leer(cur, 4) * 100), prev: prev ? r2(leer(prev, 4) * 100) : null },
    duracion: { cur: Math.round(leer(cur, 5)), prev: prev ? Math.round(leer(prev, 5)) : null },
    porDia: filas(porDia).map((r) => ({
      fecha: `${dim(r, 0).slice(0, 4)}-${dim(r, 0).slice(4, 6)}-${dim(r, 0).slice(6, 8)}`,
      sesiones: met(r, 0),
    })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    fuentes: agrupar(fuentes, { limite: 12 }),
    dispositivos: agrupar(dispositivos, { limite: 5 }),
    landings: filas(landings).map((r) => ({ pagina: dim(r, 0), sesiones: met(r, 0), engagement: r2(met(r, 1) * 100) })),
    eventos: sesionesPorEvento,
    items: itemsMap,
    itemsLeidos: filas(items).length,
  };
}

/* --------------------------- pedidos reales --------------------------- */

const RANGO = `(o.created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`;
const VIVOS = `o.status <> 'cancelled'`;

/** Todo lo que sale de orders_cache para un rango. */
async function pedidos(from, to) {
  const p = [from, to];
  const [tot, uni, dia, prod, medios, envios, provincias, cupones, clientes] = await Promise.all([
    pool.query(`
      SELECT count(*) FILTER (WHERE ${VIVOS})::int                                                AS pedidos,
             count(*) FILTER (WHERE ${VIVOS} AND o.payment_status = 'paid')::int                  AS pagados,
             count(*) FILTER (WHERE o.status = 'cancelled')::int                                  AS cancelados,
             COALESCE(sum(o.total) FILTER (WHERE ${VIVOS} AND o.payment_status = 'paid'), 0)      AS facturacion,
             COALESCE(sum(o.total) FILTER (WHERE ${VIVOS} AND o.payment_status <> 'paid'), 0)     AS pendiente,
             COALESCE(sum(o.discount) FILTER (WHERE ${VIVOS}), 0)                                 AS descuentos,
             COALESCE(sum(o.shipping_cost) FILTER (WHERE ${VIVOS}), 0)                            AS envio_cobrado,
             count(DISTINCT o.customer_id) FILTER (WHERE ${VIVOS})::int                           AS compradores
        FROM orders_cache o WHERE ${RANGO}`, p),
    pool.query(`
      SELECT COALESCE(sum((i->>'quantity')::numeric), 0)::int AS unidades
        FROM orders_cache o, jsonb_array_elements(o.products) i
       WHERE ${RANGO} AND ${VIVOS}`, p),
    pool.query(`
      SELECT to_char((o.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')                     AS fecha,
             count(*) FILTER (WHERE ${VIVOS})::int                                                AS pedidos,
             COALESCE(sum(o.total) FILTER (WHERE ${VIVOS} AND o.payment_status = 'paid'), 0)      AS ingresos
        FROM orders_cache o WHERE ${RANGO} GROUP BY 1 ORDER BY 1`, p),
    pool.query(`
      SELECT (i->>'product_id')::bigint            AS id,
             max(i->>'name')                       AS nombre,
             sum((i->>'quantity')::numeric)::int   AS unidades,
             COALESCE(sum((i->>'total')::numeric), 0) AS ingresos,
             count(DISTINCT o.id)::int             AS pedidos
        FROM orders_cache o, jsonb_array_elements(o.products) i
       WHERE ${RANGO} AND ${VIVOS} AND (i->>'product_id') IS NOT NULL
       GROUP BY 1`, p),
    pool.query(`
      SELECT COALESCE(o.gateway, 'sin dato') AS nombre, count(*)::int AS pedidos,
             COALESCE(sum(o.total), 0) AS monto
        FROM orders_cache o WHERE ${RANGO} AND ${VIVOS} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    pool.query(`
      SELECT COALESCE(o.shipping_option, 'sin dato') AS nombre, count(*)::int AS pedidos
        FROM orders_cache o WHERE ${RANGO} AND ${VIVOS} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    pool.query(`
      SELECT COALESCE(o.province, 'sin dato') AS nombre, count(*)::int AS pedidos,
             COALESCE(sum(o.total), 0) AS monto
        FROM orders_cache o WHERE ${RANGO} AND ${VIVOS} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, p),
    pool.query(`
      SELECT o.coupon AS nombre, count(*)::int AS pedidos, COALESCE(sum(o.discount), 0) AS descuento
        FROM orders_cache o WHERE ${RANGO} AND ${VIVOS} AND o.coupon IS NOT NULL
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    // Nuevo = su PRIMER pedido de la historia cayó dentro del rango.
    pool.query(`
      WITH primeras AS (
        SELECT customer_id, min(created_at) AS primera
          FROM orders_cache WHERE status <> 'cancelled' AND customer_id IS NOT NULL GROUP BY 1
      ), en_rango AS (
        SELECT DISTINCT o.customer_id FROM orders_cache o
         WHERE ${RANGO} AND ${VIVOS} AND o.customer_id IS NOT NULL
      )
      SELECT count(*) FILTER (WHERE (pr.primera AT TIME ZONE '${TZ}')::date >= $1::date)::int AS nuevos,
             count(*) FILTER (WHERE (pr.primera AT TIME ZONE '${TZ}')::date <  $1::date)::int AS repiten
        FROM en_rango e JOIN primeras pr ON pr.customer_id = e.customer_id`, p),
  ]);

  const t = tot.rows[0] || {};
  const unidades = n0(uni.rows[0] && uni.rows[0].unidades);
  const pedidosCant = n0(t.pedidos);
  return {
    pedidos: pedidosCant,
    pagados: n0(t.pagados),
    cancelados: n0(t.cancelados),
    facturacion: r2(t.facturacion),
    pendiente: r2(t.pendiente),
    descuentos: r2(t.descuentos),
    envioCobrado: r2(t.envio_cobrado),
    compradores: n0(t.compradores),
    unidades,
    ticket: pedidosCant ? r2(n0(t.facturacion) / Math.max(1, n0(t.pagados))) : 0,
    unidadesPorPedido: pedidosCant ? r2(unidades / pedidosCant) : 0,
    porDia: dia.rows.map((r) => ({ fecha: r.fecha, pedidos: n0(r.pedidos), ingresos: r2(r.ingresos) })),
    productos: prod.rows.map((r) => ({
      id: Number(r.id), nombre: r.nombre, unidades: n0(r.unidades),
      ingresos: r2(r.ingresos), pedidos: n0(r.pedidos),
    })),
    medios: medios.rows.map((r) => ({ nombre: r.nombre, pedidos: n0(r.pedidos), monto: r2(r.monto) })),
    envios: envios.rows.map((r) => ({ nombre: r.nombre, pedidos: n0(r.pedidos) })),
    provincias: provincias.rows.map((r) => ({ nombre: r.nombre, pedidos: n0(r.pedidos), monto: r2(r.monto) })),
    cupones: cupones.rows.map((r) => ({ nombre: r.nombre, pedidos: n0(r.pedidos), descuento: r2(r.descuento) })),
    clientes: {
      nuevos: n0(clientes.rows[0] && clientes.rows[0].nuevos),
      repiten: n0(clientes.rows[0] && clientes.rows[0].repiten),
    },
  };
}

/** Consultas de WhatsApp guardadas por el sitio (mayorista / minorista). */
async function consultas(from, to) {
  const rango = `(created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`;
  const [tipos, canales] = await Promise.all([
    pool.query(`SELECT COALESCE(lead_type, 'sin dato') AS tipo, count(*)::int AS total
                  FROM lead_clicks WHERE ${rango} GROUP BY 1`, [from, to]),
    pool.query(`SELECT COALESCE(contact_channel, 'sin dato') AS canal, count(*)::int AS total
                  FROM lead_clicks WHERE ${rango} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [from, to]),
  ]);
  const porTipo = Object.fromEntries(tipos.rows.map((r) => [r.tipo, n0(r.total)]));
  return {
    total: tipos.rows.reduce((a, r) => a + n0(r.total), 0),
    mayorista: n0(porTipo.mayorista),
    minorista: n0(porTipo.minorista),
    canales: canales.rows.map((r) => ({ nombre: r.canal, total: n0(r.total) })),
  };
}

/* ------------------------- de dónde salió cada consulta -------------------------
 * El panel muestra cuántas consultas mayoristas y minoristas hubo. La pregunta que
 * sigue siempre es la misma: "¿y de dónde salieron?". Acá se abre ese número por el
 * BOTÓN que se tocó, la página donde estaba la persona, el producto que estaba
 * mirando, de qué campaña venía y a qué hora consultó.
 *
 * Sale todo de `lead_clicks`, que lo escribe el propio sitio con cada clic a WhatsApp
 * (ver /api/leads/click). Ojo con lo que significa: es un CLIC, no una conversación.
 * ------------------------------------------------------------------------------ */

/** Nombre en castellano de cada botón. Lo crudo ("whatsapp_mayorista_landing") no se
 *  le puede mostrar a nadie, y el mismo diccionario se usa en el informe y el panel. */
const CANALES = {
  whatsapp_flotante: 'Globo flotante de WhatsApp',
  whatsapp_producto: 'Botón dentro de una ficha de producto',
  whatsapp_mayorista_landing: 'Botón de la landing mayorista',
  whatsapp_menu: 'WhatsApp del menú',
  whatsapp_footer: 'WhatsApp del pie de página',
  whatsapp_buscador: 'WhatsApp del buscador',
  whatsapp_otro: 'Otro link de WhatsApp del sitio',
  formulario_express: 'Formulario express de la landing mayorista',
  formulario: 'Formulario de contacto',
  telefono: 'Tocaron el teléfono',
  email: 'Tocaron el mail',
};
const canalLabel = (id) => CANALES[id] || String(id || 'sin dato').replace(/^whatsapp_/, 'WhatsApp ').replace(/_/g, ' ');

/** Origen legible de una consulta: la campaña si la hay, si no el canal, si no directo. */
function origenDeLead(source, campaign) {
  const s = String(source || '').toLowerCase();
  if (/google/.test(s)) return 'Google (pauta o búsqueda)';
  if (/meta|fb|face|ig|insta/.test(s)) return 'Meta (Instagram / Facebook)';
  if (s) return source;
  return campaign ? `Campaña ${campaign}` : 'Directo / orgánico';
}

async function leadDetail({ preset, from, to, tipo = 'todos', compare = 'previo' } = {}) {
  // El modal tiene que mostrar EXACTAMENTE el período que está en pantalla, así que
  // acepta las mismas fechas (o el mismo atajo) que el informe.
  const rango = resolverRango({ preset, from, to });
  const comparado = resolverComparacion(rango.from, rango.to, compare);
  const filtroTipo = ['mayorista', 'minorista'].includes(tipo) ? tipo : null;
  const donde = `(created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`
    + (filtroTipo ? ` AND lead_type = $3` : '');
  const args = filtroTipo ? [rango.from, rango.to, filtroTipo] : [rango.from, rango.to];

  const grupo = (col, limite = 12) => pool.query(
    `SELECT COALESCE(NULLIF(${col}, ''), 'sin dato') AS nombre, count(*)::int AS total
       FROM lead_clicks WHERE ${donde} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limite}`, args
  );

  const [tot, canales, tiposRows, paginas, rutas, productos, origenes, porDia, horas, ultimas, previoRows, desdeRows] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM lead_clicks WHERE ${donde}`, args),
    grupo('contact_channel'),
    pool.query(`SELECT COALESCE(lead_type, 'sin dato') AS nombre, count(*)::int AS total
                  FROM lead_clicks WHERE ${donde} GROUP BY 1 ORDER BY 2 DESC`, args),
    grupo('page_type', 8),
    grupo('page_path', 10),
    pool.query(`SELECT item_name AS nombre, count(*)::int AS total FROM lead_clicks
                 WHERE ${donde} AND item_name IS NOT NULL AND item_name <> 'Sin especificar'
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, args),
    pool.query(`SELECT source, campaign, count(*)::int AS total FROM lead_clicks
                 WHERE ${donde} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`, args),
    pool.query(`SELECT to_char((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS fecha,
                       count(*)::int AS total FROM lead_clicks WHERE ${donde} GROUP BY 1 ORDER BY 1`, args),
    pool.query(`SELECT extract(hour FROM created_at AT TIME ZONE '${TZ}')::int AS hora,
                       count(*)::int AS total FROM lead_clicks WHERE ${donde} GROUP BY 1 ORDER BY 1`, args),
    pool.query(`SELECT to_char(created_at AT TIME ZONE '${TZ}', 'DD/MM HH24:MI') AS cuando,
                       lead_type, contact_channel, item_name, page_path, campaign, source
                  FROM lead_clicks WHERE ${donde} ORDER BY created_at DESC LIMIT 40`, args),
    comparado
      ? pool.query(`SELECT count(*)::int AS total FROM lead_clicks
                     WHERE (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                     ${filtroTipo ? 'AND lead_type = $3' : ''}`,
      filtroTipo ? [comparado.from, comparado.to, filtroTipo] : [comparado.from, comparado.to])
      : Promise.resolve({ rows: [{ total: null }] }),
    // Desde cuándo hay registro: el sitio empezó a guardar los clics en una fecha
    // concreta, y sin esto un "antes: 0" parece una caída y es que no se medía.
    pool.query(`SELECT to_char(min(created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS desde FROM lead_clicks`),
  ]);

  const total = n0(tot.rows[0] && tot.rows[0].total);
  const previo = previoRows.rows[0] ? previoRows.rows[0].total : null;
  const conPct = (rows, mapa = (x) => x.nombre) => rows.map((r) => ({
    nombre: mapa(r), crudo: r.nombre, total: n0(r.total),
    pct: total ? r2((n0(r.total) / total) * 100) : 0,
  }));

  // Origen: se juntan las filas de source+campaign bajo un mismo nombre legible.
  const porOrigen = new Map();
  for (const r of origenes.rows) {
    const clave = origenDeLead(r.source, r.campaign);
    const acc = porOrigen.get(clave) || { nombre: clave, total: 0, campanas: new Set() };
    acc.total += n0(r.total);
    if (r.campaign) acc.campanas.add(r.campaign);
    porOrigen.set(clave, acc);
  }

  // La hora importa: son consultas por WhatsApp y alguien las tiene que contestar.
  const franja = (h) => (h < 9 ? 'Antes de las 9' : h < 13 ? '9 a 13' : h < 18 ? '13 a 18' : h < 21 ? '18 a 21' : 'Después de las 21');
  const porFranja = new Map();
  for (const r of horas.rows) {
    const k = franja(n0(r.hora));
    porFranja.set(k, (porFranja.get(k) || 0) + n0(r.total));
  }

  return {
    rango: { ...rango, dias: diasDe(rango.from, rango.to) },
    comparado,
    tipo: filtroTipo || 'todos',
    total,
    previo,
    delta: delta(total, previo),
    // Aviso cuando el período de comparación es anterior al primer clic registrado.
    midiendoDesde: (desdeRows.rows[0] && desdeRows.rows[0].desde) || null,
    comparacionIncompleta: Boolean(comparado && desdeRows.rows[0] && desdeRows.rows[0].desde
      && comparado.from < desdeRows.rows[0].desde),
    canales: conPct(canales.rows, (r) => canalLabel(r.nombre)),
    tipos: conPct(tiposRows.rows),
    paginas: conPct(paginas.rows),
    rutas: conPct(rutas.rows),
    productos: conPct(productos.rows),
    origenes: [...porOrigen.values()]
      .map((o) => ({ nombre: o.nombre, total: o.total, pct: total ? r2((o.total / total) * 100) : 0, campanas: [...o.campanas].slice(0, 4) }))
      .sort((a, b) => b.total - a.total),
    porDia: porDia.rows.map((r) => ({ fecha: r.fecha, total: n0(r.total) })),
    franjas: [...porFranja.entries()].map(([nombre, t]) => ({ nombre, total: t, pct: total ? r2((t / total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total),
    ultimas: ultimas.rows.map((r) => ({
      cuando: r.cuando,
      tipo: r.lead_type,
      canal: canalLabel(r.contact_channel),
      producto: r.item_name && r.item_name !== 'Sin especificar' ? r.item_name : null,
      pagina: r.page_path,
      origen: origenDeLead(r.source, r.campaign),
    })),
  };
}

/* --------------------------- tabla de productos --------------------------- */

/**
 * TODOS los productos del catálogo con lo que se puede saber de cada uno: cuánta
 * gente lo miró (Analytics), cuánto se vendió (Tiendanube) y qué porcentaje de los
 * que lo miraron lo compraron. Sin recortar a los cinco primeros: el corte lo hace
 * el que mira la tabla, ordenando por la columna que le interese.
 */
async function tablaProductos(ga, ventas) {
  const { rows } = await pool.query(`
    SELECT id, name, brand, price, promo_price, stock, image_url, published, sales_30d
      FROM products_cache ORDER BY name ASC`);

  const ventasPorId = new Map(ventas.productos.map((p) => [Number(p.id), p]));
  const items = (ga && ga.items) || new Map();

  // Las visitas se cruzan por NOMBRE (Analytics no manda el id del producto). Cuando
  // dos fichas comparten nombre —la minorista y su gemela mayorista, 22 casos en este
  // catálogo— las vistas van a la MINORISTA y la otra queda marcada, en vez de contar
  // dos veces la misma visita.
  const usados = new Set();
  const ordenados = [...rows].sort((a, b) => {
    const pa = Number(a.price) > 0 ? 0 : 1;
    const pb = Number(b.price) > 0 ? 0 : 1;
    return pa - pb;
  });

  const porId = new Map();
  for (const p of ordenados) {
    const clave = norm(p.name);
    const gaItem = items.get(clave);
    const repetido = usados.has(clave);
    if (gaItem) usados.add(clave);
    const v = ventasPorId.get(Number(p.id)) || { unidades: 0, ingresos: 0, pedidos: 0 };
    const vistas = gaItem && !repetido ? gaItem.vistas : 0;
    porId.set(Number(p.id), {
      id: Number(p.id),
      nombre: p.name,
      marca: p.brand || null,
      imagen: p.image_url,
      segmento: Number(p.price) > 0 ? 'minorista' : 'mayorista',
      publicado: p.published !== false,
      precio: p.price === null ? null : r2(p.price),
      promo: p.promo_price === null ? null : r2(p.promo_price),
      stock: p.stock === null ? null : Number(p.stock),
      vistas,
      vistasPrev: gaItem && !repetido ? gaItem.vistasPrev : 0,
      carritos: gaItem && !repetido ? gaItem.carritos : 0,
      unidades: v.unidades,
      ingresos: v.ingresos,
      pedidos: v.pedidos,
      // De cada 100 que lo miraron, cuántos lo compraron.
      conversion: vistas ? r2((v.pedidos / vistas) * 100) : null,
      comparteNombre: repetido && Boolean(gaItem),
    });
  }

  // Vendidos que ya no están en el catálogo (despublicados o borrados): igual
  // facturaron en el período y tienen que aparecer.
  for (const v of ventas.productos) {
    if (porId.has(Number(v.id))) continue;
    porId.set(Number(v.id), {
      id: Number(v.id), nombre: v.nombre || `Producto #${v.id}`, marca: null, imagen: null,
      segmento: 'fuera de catálogo', publicado: false, precio: null, promo: null, stock: null,
      vistas: 0, vistasPrev: 0, carritos: 0,
      unidades: v.unidades, ingresos: v.ingresos, pedidos: v.pedidos,
      conversion: null, comparteNombre: false,
    });
  }

  const lista = [...porId.values()].sort((a, b) => b.ingresos - a.ingresos || b.vistas - a.vistas);
  const segmento = (cual) => {
    const del = lista.filter((p) => p.segmento === cual);
    return {
      productos: del.length,
      vistas: del.reduce((a, p) => a + p.vistas, 0),
      unidades: del.reduce((a, p) => a + p.unidades, 0),
      ingresos: r2(del.reduce((a, p) => a + p.ingresos, 0)),
    };
  };
  const minorista = segmento('minorista');
  const mayorista = segmento('mayorista');
  const totalVistas = minorista.vistas + mayorista.vistas;
  return {
    lista,
    segmentos: {
      minorista: { ...minorista, pctVistas: totalVistas ? r2((minorista.vistas / totalVistas) * 100) : 0 },
      mayorista: { ...mayorista, pctVistas: totalVistas ? r2((mayorista.vistas / totalVistas) * 100) : 0 },
    },
  };
}

/* ------------------------------ el informe ------------------------------ */

/** Un número del resumen de arriba, con su comparación y de dónde salió. */
function kpi(id, label, valor, previo, fuente, ayuda, extra = {}) {
  return { id, label, valor: r2(valor), previo: previo === null || previo === undefined ? null : r2(previo), delta: delta(valor, previo), fuente, ayuda, ...extra };
}

async function buildStoreReport({ preset, from, to, compare = 'previo' } = {}) {
  const rango = resolverRango({ preset, from, to });
  const comparado = resolverComparacion(rango.from, rango.to, compare);
  const dias = diasDe(rango.from, rango.to);

  const [ga, ventas, ventasPrev, leads, leadsPrev, meta] = await Promise.all([
    analytics(rango, comparado).catch((err) => {
      console.warn(`[storeMetrics] Analytics falló entero: ${err.message}`);
      return null;
    }),
    pedidos(rango.from, rango.to),
    comparado ? pedidos(comparado.from, comparado.to) : null,
    consultas(rango.from, rango.to),
    comparado ? consultas(comparado.from, comparado.to) : null,
    // to_char y no ::date: pg devuelve DATE como objeto Date y el aviso terminaba
    // diciendo "desde el Tue Sep 03 2024 00:00:00 GMT-0300".
    pool.query(`SELECT to_char(min(created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS primero,
                       max(synced_at) AS sincronizado, count(*)::int AS total FROM orders_cache`),
  ]);

  const productos = await tablaProductos(ga, ventas);

  const sesiones = ga ? ga.sesiones.cur : null;
  const sesionesPrev = ga && ga.sesiones.prev !== null ? ga.sesiones.prev : null;
  const conversion = sesiones ? r2((ventas.pedidos / sesiones) * 100) : null;
  const conversionPrev = (sesionesPrev && ventasPrev) ? r2((ventasPrev.pedidos / sesionesPrev) * 100) : null;

  /* Embudo. Cada paso son SESIONES: es la única forma de que los escalones se
     puedan comparar entre sí. El último paso usa los pedidos REALES de Tiendanube
     y por eso puede ser MAYOR que el `purchase` de Analytics — está aclarado en
     la propia fila para que no parezca un error. */
  const embudo = [];
  if (ga) {
    const base = ga.sesiones.cur || 0;
    let anterior = null;
    for (const paso of PASOS) {
      const gaSes = paso.evento ? ((ga.eventos.get(paso.evento) || {}).cur || 0) : base;
      const valor = paso.id === 'compra' ? ventas.pedidos : gaSes;
      const fila = {
        id: paso.id,
        label: paso.label,
        sesiones: valor,
        pctDelTotal: base ? r2((valor / base) * 100) : 0,
        retencion: anterior === null ? null : (anterior ? r2((valor / anterior) * 100) : 0),
        fuente: paso.id === 'compra' ? 'Tiendanube (pedidos reales)' : 'Google Analytics',
        nota: paso.id === 'compra'
          ? `Analytics registra ${((ga.eventos.get('purchase') || {}).cur || 0)} compras en el mismo período: cuenta de menos, por eso mandan los pedidos.`
          : null,
      };
      embudo.push(fila);
      anterior = valor;
    }
  }

  const resumen = [
    ga && kpi('sesiones', 'Visitas a la tienda', ga.sesiones.cur, ga.sesiones.prev, 'Google Analytics',
      'Sesiones: una persona que entra, mira y se va es UNA visita, aunque abra diez páginas.'),
    ga && kpi('usuarios', 'Personas distintas', ga.usuarios.cur, ga.usuarios.prev, 'Google Analytics',
      'La misma persona que vuelve tres veces cuenta una sola vez.'),
    kpi('pedidos', 'Pedidos', ventas.pedidos, ventasPrev ? ventasPrev.pedidos : null, 'Tiendanube',
      'Pedidos hechos en el período, sin contar los cancelados.'),
    kpi('facturacion', 'Facturación', ventas.facturacion, ventasPrev ? ventasPrev.facturacion : null, 'Tiendanube',
      'Suma de los pedidos PAGADOS. Los que están esperando pago se muestran aparte.', { moneda: true }),
    conversion !== null && kpi('conversion', 'Conversión', conversion, conversionPrev, 'Analytics + Tiendanube',
      'De cada 100 visitas, cuántas terminaron en pedido. Es pedidos reales sobre sesiones.', { pct: true }),
    kpi('ticket', 'Ticket promedio', ventas.ticket, ventasPrev ? ventasPrev.ticket : null, 'Tiendanube',
      'Cuánta plata deja en promedio cada pedido pagado.', { moneda: true }),
    kpi('unidades', 'Prendas vendidas', ventas.unidades, ventasPrev ? ventasPrev.unidades : null, 'Tiendanube',
      'Unidades sumadas de todos los pedidos no cancelados.'),
    kpi('consultas', 'Consultas por WhatsApp', leads.total, leadsPrev ? leadsPrev.total : null, 'Clics guardados por el sitio',
      'Clics a un botón de WhatsApp. Es un clic, no una conversación: si abre y no escribe, igual suma.'),
  ].filter(Boolean);

  /* Avisos: todo lo que hay que saber para no leer mal un número. */
  const avisos = [];
  const hoy = hoyArg();
  if (rango.to >= hoy) avisos.push('El día de hoy está incompleto: todavía no terminó.');
  if (!ga) avisos.push('Google Analytics no está respondiendo: no hay visitas, origen del tráfico ni embudo. Los pedidos y la facturación sí son reales.');
  const primerPedido = meta.rows[0] && meta.rows[0].primero;
  if (primerPedido && rango.from < String(primerPedido)) {
    avisos.push(`Tengo pedidos guardados desde el ${primerPedido}: lo anterior a esa fecha aparece en cero.`);
  }
  const compartidos = productos.lista.filter((p) => p.comparteNombre).length;
  if (compartidos) {
    avisos.push(`${compartidos} producto(s) están cargados dos veces en Tiendanube (ficha minorista y mayorista con el mismo nombre). Analytics no las puede separar: las visitas se le asignan a la minorista.`);
  }
  if (ventas.cancelados) avisos.push(`${ventas.cancelados} pedido(s) cancelados quedaron fuera de todos los números.`);
  if (ventas.pendiente > 0) {
    avisos.push(`Hay ${ventas.pedidos - ventas.pagados} pedido(s) sin pagar por $${Math.round(ventas.pendiente).toLocaleString('es-AR')}: no suman a la facturación.`);
  }

  return {
    generado: new Date().toISOString(),
    rango: { ...rango, dias, label: (PRESETS[rango.preset] || {}).label || `${rango.from} a ${rango.to}` },
    comparado: comparado ? { ...comparado, dias: diasDe(comparado.from, comparado.to) } : null,
    resumen,
    embudo,
    porDia: unirPorDia(rango, ga, ventas),
    trafico: ga ? {
      fuentes: ga.fuentes.map((f) => ({ nombre: f.nombre, sesiones: f.cur, previo: comparado ? f.prev : null, delta: comparado ? delta(f.cur, f.prev) : null })),
      dispositivos: ga.dispositivos.map((d) => ({ nombre: d.nombre, sesiones: d.cur, delta: comparado ? delta(d.cur, d.prev) : null })),
      landings: ga.landings,
      paginasPorVisita: ga.sesiones.cur ? r2(ga.vistasPagina.cur / ga.sesiones.cur) : 0,
      duracionMedia: ga.duracion.cur,
      engagement: ga.engagement.cur,
    } : null,
    ventas: {
      ...ventas,
      previo: ventasPrev ? {
        pedidos: ventasPrev.pedidos, facturacion: ventasPrev.facturacion,
        unidades: ventasPrev.unidades, ticket: ventasPrev.ticket,
      } : null,
    },
    consultas: { ...leads, previo: leadsPrev ? leadsPrev.total : null, delta: leadsPrev ? delta(leads.total, leadsPrev.total) : null },
    productos: productos.lista,
    segmentos: productos.segmentos,
    catalogo: {
      pedidosGuardados: meta.rows[0] ? meta.rows[0].total : 0,
      desde: primerPedido || null,
      sincronizado: meta.rows[0] ? meta.rows[0].sincronizado : null,
    },
    avisos,
  };
}

/** Serie diaria unificada: visitas (GA) y pedidos/facturación (Tiendanube). */
function unirPorDia(rango, ga, ventas) {
  const sesionesPorFecha = new Map(((ga && ga.porDia) || []).map((d) => [d.fecha, d.sesiones]));
  const ventasPorFecha = new Map(ventas.porDia.map((d) => [d.fecha, d]));
  const out = [];
  for (let f = rango.from; f <= rango.to; f = masDias(f, 1)) {
    const v = ventasPorFecha.get(f) || { pedidos: 0, ingresos: 0 };
    out.push({ fecha: f, sesiones: sesionesPorFecha.get(f) || 0, pedidos: v.pedidos, ingresos: v.ingresos });
  }
  return out;
}

/* Caché en memoria: cada informe son 7 consultas a Google Analytics y 10 a la base.
   Diez minutos alcanzan para que tocar entre pestañas o descargar el informe no
   vuelva a pagar ese costo, y es poco para que un pedido nuevo tarde en verse. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

async function cachedStoreReport(params = {}) {
  const rango = resolverRango(params);
  const clave = `${rango.from}|${rango.to}|${params.compare || 'previo'}`;
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.at < CACHE_MS && !params.force) return hit.data;
  const data = await buildStoreReport(params);
  cache.set(clave, { data, at: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return data;
}

function invalidate() { cache.clear(); }

module.exports = {
  buildStoreReport, cachedStoreReport, invalidate, leadDetail, canalLabel,
  resolverRango, resolverComparacion, PRESETS, hoyArg, masDias, diasDe,
};
