/* =========================================================================
 * ESQUEMA RECOMENDADO DEL HOME
 *
 * Propone en qué orden conviene poner las secciones de la página de inicio,
 * usando las secciones REALES del theme (los mismos nombres que aparecen en el
 * panel de diseño de Tiendanube, en "Página de inicio") y los datos reales de
 * la cuenta. No es una plantilla genérica: cada bloque viene con el número que
 * lo justifica, así se puede discutir la recomendación en vez de creerla.
 *
 * LA DECISIÓN QUE MÁS PESA, y por qué
 * BLACKS son dos negocios en una sola página. Medido sobre los últimos 60 días:
 * de cada 4 consultas por WhatsApp, 3 son MAYORISTAS (93 contra 31), y 240 de
 * los 353 productos del catálogo son mayoristas (sin precio, "consultar"). Pero
 * el desvío a /mayorista está hoy en la posición 8 del home, después de cuatro
 * secciones de venta minorista. La recomendación principal es subirlo.
 *
 * LO QUE ESTE MÓDULO NO SABE
 * El orden ACTUAL de las secciones vive en el panel de diseño de Tiendanube,
 * que no tiene API: no hay forma de leerlo desde acá. Por eso el esquema se
 * presenta como propuesta a comparar a ojo, y no como un "antes y después".
 * ========================================================================= */

const pool = require('./db');
const { eligibleSQL } = require('./productScore');
const { getRailsConfig } = require('./homeRails');

/* Nombres tal cual aparecen en el selector de secciones del theme
   (config/settings.txt → section_order). Si se renombra allá, renombrar acá. */
const SECCIONES = {
  slider: 'Carrusel de imágenes',
  informatives: 'Información de envíos, pagos y compra',
  rail_1: '★ Riel automático 1',
  rail_2: '★ Riel automático 2',
  rail_3: '★ Riel automático 3',
  rail_4: '★ Riel automático 4',
  main_categories: 'Categorías principales',
  categories: 'Banners de categorías',
  promotional: 'Banners promocionales',
  news_banners: 'Banners de novedades',
  lookbook: 'Lookbook Interactivo',
  brands: 'Marcas',
  institutional: 'Mensaje institucional',
  newsletter: 'Newsletter',
};

async function señales() {
  const [cat, leads, cfg] = await Promise.all([
    pool.query(`SELECT
        count(*) FILTER (WHERE ${eligibleSQL()})::int AS elegibles,
        count(*) FILTER (WHERE promo_price IS NOT NULL AND promo_price < price)::int AS ofertas,
        count(*) FILTER (WHERE price IS NULL OR price = 0)::int AS mayoristas,
        count(*)::int AS total
      FROM products_cache`),
    pool.query(`SELECT lead_type, count(*)::int n FROM lead_clicks
                 WHERE created_at > now() - interval '60 days' GROUP BY 1`),
    getRailsConfig(),
  ]);

  const l = Object.fromEntries(leads.rows.map((r) => [r.lead_type || 'otro', r.n]));
  const may = l.mayorista || 0;
  const min = l.minorista || 0;
  const totalLeads = may + min;

  return {
    ...cat.rows[0],
    leadsMayorista: may,
    leadsMinorista: min,
    pctMayorista: totalLeads ? Math.round((may / totalLeads) * 100) : null,
    rieles: (cfg.rails || []).map((r) => ({ id: r.id, title: r.title, rule: r.rule })),
  };
}

/**
 * El orden propuesto. El criterio general, en una línea: primero lo que ya
 * sabemos que convierte, después la bifurcación entre los dos negocios, y al
 * final lo que da confianza pero no vende solo.
 */
function armarBloques(s) {
  const riel = (n) => s.rieles[n] || null;
  const b = [];
  const push = (o) => b.push({ ...o, pos: b.length + 1 });

  push({
    id: 'slider', tipo: 'hero',
    que: 'La oferta principal del momento, con un botón claro.',
    porQue: 'Es lo primero y lo único que ve todo el mundo sin scrollear. Una sola promesa, no cuatro.',
    dato: null,
  });

  push({
    id: 'informatives', tipo: 'confianza',
    que: 'Envío gratis, cuotas y formas de pago, en una franja fina.',
    porQue: 'Son las tres objeciones que frenan la compra. Puestas acá arriba se responden antes de que aparezcan, y ocupan poca altura.',
    dato: null,
  });

  if (riel(0)) {
    push({
      id: riel(0).id, tipo: 'riel', titulo: riel(0).title,
      que: `Riel automático: ${riel(0).title}.`,
      porQue: 'El primer contacto con producto tiene que ser con lo que ya sabés que se vende. Es la prueba social más barata que tenés.',
      dato: `Se arma solo con la regla "${riel(0).rule}".`,
    });
  }

  push({
    id: 'promotional', tipo: 'b2b',
    que: 'Banner grande que manda a /mayorista.',
    porQue: 'Acá está el cambio más importante del esquema. El visitante mayorista no quiere ver una vidriera de precios minoristas: quiere llegar a su sección. Hoy este desvío está recién en la posición 8, después de cuatro secciones de venta al público.',
    dato: s.pctMayorista !== null
      ? `${s.leadsMayorista} de las ${s.leadsMayorista + s.leadsMinorista} consultas de los últimos 60 días son mayoristas (${s.pctMayorista}%), y ${s.mayoristas} de tus ${s.total} productos son de ese catálogo.`
      : 'Todavía no hay consultas registradas para medirlo.',
    destacado: true,
  });

  push({
    id: 'main_categories', tipo: 'navegacion',
    que: 'Las categorías principales, con foto.',
    porQue: 'Para el que no sabe qué busca. Es la red de contención del que no le interesó ningún producto de arriba.',
    dato: null,
  });

  if (riel(1)) {
    push({
      id: riel(1).id, tipo: 'riel', titulo: riel(1).title,
      que: `Riel automático: ${riel(1).title}.`,
      porQue: 'El gancho de precio va después de la navegación: el que ya se orientó y no compró, acá encuentra el motivo.',
      dato: s.ofertas ? `Hoy tenés ${s.ofertas} productos con precio promocional cargado.` : 'Ojo: hoy no hay productos con precio promocional cargado.',
    });
  }

  push({
    id: 'lookbook', tipo: 'contenido',
    que: 'El lookbook con los combos.',
    porQue: 'Sube el ticket: en vez de un pantalón, un conjunto. Va acá porque pide más atención que un riel y ya filtramos a los que se fueron.',
    dato: null,
  });

  if (riel(2)) {
    push({
      id: riel(2).id, tipo: 'riel', titulo: riel(2).title,
      que: `Riel automático: ${riel(2).title}.`,
      porQue: 'Tercer y último riel de producto. Más abajo, el rendimiento de un carrusel cae bastante.',
      dato: null,
    });
  }

  push({
    id: 'brands', tipo: 'confianza',
    que: 'Las marcas que vendés: Pampero, Ombu, Grafa 70.',
    porQue: 'En ropa de trabajo la marca es el argumento de calidad. Pero es confianza, no deseo: no vende sola, así que va abajo.',
    dato: null,
  });

  push({
    id: 'news_banners', tipo: 'contenido',
    que: 'Personalización con logo, uniformes, servicios.',
    porQue: 'Es el argumento diferencial para empresas, y refuerza el camino mayorista para el que llegó hasta acá leyendo todo.',
    dato: null,
  });

  push({
    id: 'newsletter', tipo: 'cierre',
    que: 'Suscripción al newsletter.',
    porQue: 'Última chance de capturar al que no compró ni consultó. Siempre al final: si va arriba, compite con la venta.',
    dato: null,
  });

  return b;
}

function armarNotas(s) {
  const n = [];
  if (s.elegibles < 60) {
    n.push(`Sólo ${s.elegibles} de tus ${s.total} productos pasan el filtro de los rieles (precio, foto, stock y curva de talles sana). `
      + `Por eso el esquema usa 3 rieles y no 4: con 4 de 12 productos cada uno se repetiría medio catálogo.`);
  }
  if (s.rieles.length > 3) {
    n.push(`Tenés ${s.rieles.length} rieles configurados y el esquema propone 3. El cuarto conviene dejarlo para una campaña puntual (una temporada, un lanzamiento) y no permanente.`);
  }
  if (!s.ofertas) {
    n.push('No hay productos con precio promocional cargado en Tiendanube, así que un riel de ofertas hoy saldría vacío.');
  }
  n.push('El orden se cambia en Tiendanube: Panel de diseño → Página de inicio → arrastrar las secciones. Los nombres de acá son los mismos que vas a ver ahí.');
  return n;
}

async function buildLayout() {
  const s = await señales();
  return {
    generado: new Date().toISOString(),
    señales: s,
    bloques: armarBloques(s).map((x) => ({ ...x, seccion: SECCIONES[x.id] || x.id })),
    notas: armarNotas(s),
  };
}

module.exports = { buildLayout, SECCIONES };
