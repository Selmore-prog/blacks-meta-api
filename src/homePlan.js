/* =========================================================================
 * PLAN DEL HOME — qué conviene mostrar, en qué orden y por qué.
 *
 * QUÉ ES
 * Cruza tres cosas que hasta ahora se miraban por separado:
 *   1. Cómo está el home HOY, leído del HTML de la tienda en vivo (storeHome.js).
 *   2. Qué dice el catálogo: stock real, ventas de 30 días, categorías, cuánto
 *      es mayorista y cuánto minorista.
 *   3. En qué momento del año estamos y qué se viene.
 * Y devuelve un orden propuesto posición por posición, mezclando las secciones
 * nativas de Tiendanube, los rieles automáticos y los bloques de contenido.
 *
 * REGLA DE LA CASA: cada posición viene con el NÚMERO que la justifica.
 * Una recomendación sin el dato atrás no se puede discutir, sólo obedecer. Si
 * el dato no existe, la posición se propone igual pero sin inventar la cifra.
 *
 * LO QUE NO HACE
 * No puede mover las secciones solo: el panel de diseño de Tiendanube no tiene
 * API para escribir. Por eso el plan termina en una lista de movimientos
 * concretos para hacer a mano, una sola vez. Lo que SÍ puede hacer solo es
 * crear los bloques de contenido con sus textos (ver homeBlocks.js).
 * ========================================================================= */

const pool = require('./db');
const { leerHome, nombreDe } = require('./storeHome');
const { getRailsConfig } = require('./homeRails');
const { getBlocksConfig } = require('./homeBlocks');
const { categorias: categoriasReales } = require('./storeCategories');
const flashSale = require('./flashSale');

/* -------------------------------------------------------------------------
 * ESTACIÓN
 * Hemisferio sur. Importa para dos cosas: qué categoría conviene empujar y
 * cuál conviene empezar a liquidar antes de que se coma el depósito.
 * ----------------------------------------------------------------------- */
const ESTACIONES = [
  { meses: [12, 1, 2], nombre: 'verano', sale: 'primavera',
    empuja: 'ropa liviana, protección solar y calzado fresco', liquida: 'lo que quedó de invierno' },
  { meses: [3, 4, 5], nombre: 'otoño', sale: 'verano',
    empuja: 'medias estaciones: camisas, buzos y camperas livianas', liquida: 'remeras y prendas de verano' },
  { meses: [6, 7, 8], nombre: 'invierno', sale: 'otoño',
    empuja: 'abrigo, polares, camperas térmicas y calzado con forro', liquida: 'lo de entretiempo' },
  { meses: [9, 10, 11], nombre: 'primavera', sale: 'invierno',
    empuja: 'entretiempo y prendas de trabajo livianas', liquida: 'el saldo de invierno, antes de que pierda temporada' },
];

function estacionDe(fecha = new Date()) {
  const mes = fecha.getMonth() + 1;
  const e = ESTACIONES.find((x) => x.meses.includes(mes));
  // A mitad de estación conviene empujar; sobre el final, liquidar.
  const posicion = e.meses.indexOf(mes); // 0 = arranca, 2 = se termina
  return { ...e, mes, fase: posicion === 0 ? 'arranca' : posicion === 1 ? 'plena' : 'termina' };
}

async function proximoEvento() {
  const { rows } = await pool.query(
    `SELECT event_date, title, category, angle
       FROM commercial_dates
      WHERE event_date >= current_date
      ORDER BY event_date ASC
      LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;
  const dias = Math.round((new Date(rows[0].event_date) - new Date()) / 86400000);
  return { fecha: rows[0].event_date, titulo: rows[0].title, categoria: rows[0].category, angulo: rows[0].angle, dias };
}

/* -------------------------------------------------------------------------
 * SEÑALES
 * ----------------------------------------------------------------------- */
async function senales() {
  const [resumen, categorias, marcas, leads, cfgRieles, cfgBloques, flash, home, evento, cats] = await Promise.all([
    pool.query(`SELECT count(*)::int total,
        count(*) FILTER (WHERE price IS NULL OR price = 0)::int mayoristas,
        count(*) FILTER (WHERE promo_price IS NOT NULL AND promo_price < price)::int con_oferta,
        count(*) FILTER (WHERE COALESCE(stock,0) > 0)::int con_stock,
        sum(COALESCE(sales_30d,0))::int ventas_30d,
        max(synced_at) AS sync
      FROM products_cache`),
    pool.query(`SELECT COALESCE(NULLIF(category,''),'(sin categoría)') AS cat,
        count(*)::int n, sum(COALESCE(stock,0))::int stock,
        sum(COALESCE(sales_30d,0))::int ventas_30d,
        count(*) FILTER (WHERE price IS NULL OR price = 0)::int mayorista
      FROM products_cache GROUP BY 1 ORDER BY ventas_30d DESC, n DESC`),
    pool.query(`SELECT COALESCE(NULLIF(brand,''),'(sin marca)') AS marca,
        count(*)::int n, sum(COALESCE(sales_30d,0))::int ventas_30d
      FROM products_cache GROUP BY 1 ORDER BY ventas_30d DESC LIMIT 8`),
    pool.query(`SELECT COALESCE(lead_type,'otro') tipo, count(*)::int n
      FROM lead_clicks WHERE created_at > now() - interval '60 days' GROUP BY 1`),
    getRailsConfig(),
    getBlocksConfig(),
    flashSale.getBlock().catch(() => ({ active: false })),
    leerHome(),
    proximoEvento(),
    // El árbol real de Tiendanube, no la etiqueta suelta que quedó en el cache.
    categoriasReales().catch(() => ({ disponible: false, vendibles: [], mayoristas: [], lista: [] })),
  ]);

  const l = Object.fromEntries(leads.rows.map((r) => [r.tipo, r.n]));
  const may = l.mayorista || 0;
  const min = l.minorista || 0;
  const totalLeads = may + min;
  const r = resumen.rows[0];

  const etiquetas = categorias.rows.filter((c) => c.cat !== '(sin categoría)');

  /* Para elegir qué empujar se usan las categorías REALES de Tiendanube, no la
     etiqueta única de products_cache: vistas desde ahí la tienda parece tener
     tres categorías y en realidad tiene más de cien anidadas. Se descartan las
     muy generales (la raíz de la tienda) porque recomendar "Shop Online" no
     dice nada. */
  const generales = ['/eshop', '/mayorista'];
  const vendibles = (cats.vendibles || []).filter((c) => !generales.includes(c.url));
  const topCategoria = vendibles[0] || null;
  const stockParado = vendibles.slice().sort((a, b) => b.stock - a.stock)[0] || null;

  /* ¿Hay categorías armadas para la temporada que entra y para la que se va?
     Si existen y tienen productos, el plan las usa; si no, no se inventa nada.
     Se busca en el nombre y en la URL porque la tienda las nombra de las dos
     formas ("Invierno 26" con handle /otono-invierno). */
  const est = estacionDe();
  const sinTilde = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const buscarCat = (palabra) => (cats.lista || [])
    .filter((c) => c.productos >= 4 && sinTilde(`${c.nombre} ${c.url}`).includes(sinTilde(palabra)))
    .sort((a, b) => b.productos - a.productos)[0] || null;

  const catTemporada = buscarCat(est.nombre);
  const catSaliente = buscarCat(est.sale);

  // Marcas escritas de dos formas distintas ("PAMPERO" y "Pampero") cuentan como
  // dos: se detecta acá porque ensucia cualquier riel filtrado por marca.
  const porNombre = new Map();
  marcas.rows.forEach((m) => {
    const k = m.marca.toLowerCase();
    porNombre.set(k, (porNombre.get(k) || 0) + 1);
  });
  const marcasDuplicadas = [...porNombre.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  return {
    catalogo: {
      ...r,
      sync: r.sync,
      minutos_sync: r.sync ? Math.round((Date.now() - new Date(r.sync).getTime()) / 60000) : null,
      pct_mayorista: r.total ? Math.round((r.mayoristas / r.total) * 100) : null,
    },
    categorias: cats,
    etiquetas,
    topCategoria,
    stockParado,
    catTemporada,
    catSaliente,
    marcas: marcas.rows,
    marcasDuplicadas,
    leads: { mayorista: may, minorista: min, total: totalLeads,
      pct_mayorista: totalLeads ? Math.round((may / totalLeads) * 100) : null },
    rieles: (cfgRieles.rails || []).map((x) => ({ id: x.id, title: x.title, rule: x.rule })),
    bloques: (cfgBloques.blocks || []).map((b) => ({ slot: b.slot, type: b.type, enabled: b.enabled })),
    flash: { activa: !!flash.active, titulo: flash.title || null },
    estacion: estacionDe(),
    evento,
    home,
  };
}

/* -------------------------------------------------------------------------
 * DIAGNÓSTICO
 * Lo que está mal HOY, ordenado por cuánto duele. Cada punto trae su número.
 * ----------------------------------------------------------------------- */
function diagnosticar(s) {
  const d = [];
  const av = (nivel, titulo, detalle, dato) => d.push({ nivel, titulo, detalle, dato });
  const orden = (s.home.secciones || []).filter((x) => !x.oculta);
  const posDe = (id) => { const i = orden.findIndex((x) => x.id === id); return i < 0 ? null : i + 1; };

  /* 1. LOS DOS NEGOCIOS EN UNA SOLA PÁGINA.
     El objetivo es vender al público; el mayorista es consultivo. Así que acá
     NO se mide "¿está el mayorista bien arriba?" sino al revés: ¿cuánto tarda
     un visitante común en ver un precio con botón de comprar? Cada sección sin
     precio antes del primer riel es una pantalla en la que puede concluir que
     la tienda es sólo por cantidad y se va. */
  {
    const CON_PRECIO = ['rail_1', 'rail_2', 'rail_3', 'rail_4', 'flash_sale',
      'products', 'new', 'sale', 'promotion', 'best_seller', 'main_product'];
    const iPrimerPrecio = orden.findIndex((x) => CON_PRECIO.includes(x.id));
    const posMay = posDe('promotional');

    if (iPrimerPrecio === -1) {
      av('alto', 'El home no muestra ni un precio',
        'No hay ninguna sección de producto visible. El visitante que llega de una publicidad no tiene forma de saber que puede comprar una unidad.',
        null);
    } else if (iPrimerPrecio + 1 > 4) {
      av('alto', 'Tarda en aparecer el primer producto con precio',
        `Hay que pasar ${iPrimerPrecio} secciones antes de ver un precio con botón de comprar. En celular eso son varias pantallas, y el que vino a comprar una unidad se va antes.`,
        `El primer bloque con precio está en la posición ${iPrimerPrecio + 1} de ${orden.length}.`);
    }

    // El riesgo inverso: mayorista tan arriba que tapa la venta al público.
    if (posMay && iPrimerPrecio !== -1 && posMay < iPrimerPrecio + 1) {
      av('alto', 'El mayorista aparece ANTES que el primer precio',
        `"Banners promocionales" está en la posición ${posMay} y el primer producto con precio recién en la ${iPrimerPrecio + 1}. Para el que entra por primera vez, la tienda parece ser sólo por cantidad.`,
        `${s.leads.pct_mayorista}% de las consultas ya son mayoristas (${s.leads.mayorista} de ${s.leads.total} en 60 días): esa demanda llega sola y no necesita el mejor lugar de la página.`);
    } else if (posMay && posMay <= 4) {
      av('medio', 'El desvío mayorista está muy arriba para una tienda que quiere vender al público',
        `Está en la posición ${posMay}. Conviene bajarlo detrás de dos o tres rieles de producto: el que compra por cantidad scrollea igual, el que compra una unidad no.`,
        `${s.leads.pct_mayorista}% de las consultas son mayoristas (${s.leads.mayorista} de ${s.leads.total}). Ese número mide quién PREGUNTA, no quién quiere comprar: el minorista que no encuentra precio se va sin escribir.`);
    }
  }

  /* 1a. Bloques escritos en el motor que nunca se pusieron en la página.
     Es el olvido más fácil del flujo: se arma el bloque acá, se publica, y falta
     el paso de arrastrar el hueco en el panel de diseño de Tiendanube. Desde el
     motor se ve "listo" y en la tienda no está. */
  {
    const enLaPagina = new Set(orden.map((x) => x.id));
    const huerfanos = (s.bloques || []).filter((b) => b.enabled && !enLaPagina.has(b.slot));
    if (huerfanos.length) {
      av('alto', `Tenés ${huerfanos.length} ${huerfanos.length === 1 ? 'bloque armado que no está' : 'bloques armados que no están'} en la página`,
        `${huerfanos.map((b) => b.slot.replace('block_', 'Bloque de contenido ')).join(', ')}. El contenido ya está escrito y publicado en el motor, pero el hueco no está puesto en el orden de la página de inicio: hay que arrastrarlo desde el panel de diseño de Tiendanube.`,
        null);
    }
  }

  // 1b. Contenido duplicado entre las franjas fijas del theme.
  {
    const fijas = (s.home.secciones || []).filter((x) => x.fija && !x.oculta).map((x) => x.id);
    if (fijas.includes('trust_badges') && fijas.includes('guarantees')) {
      av('bajo', 'La promesa de confianza está dicha dos veces',
        'La franja de arriba (envío, cuotas, retiro, cambios) y "¿Por qué elegir BLACKS?" del final dicen casi lo mismo. No es grave, pero alarga la página. Si se recorta una, que sea la del final.',
        'Las dos están escritas a mano en templates/home.tpl.');
    }
  }

  // 2. Temporada que se va con stock encima. Es el aviso que caduca.
  if (s.catSaliente && s.catSaliente.stock > 200) {
    av('alto', `Queda stock de ${s.estacion.sale} y ya entra ${s.estacion.nombre}`,
      `"${s.catSaliente.ruta}" (${s.catSaliente.url}) tiene ${s.catSaliente.stock} unidades en depósito. Cada semana que pasa se vende peor. Conviene liquidarlo con contador ahora, no en dos meses.`,
      `${s.catSaliente.productos} productos, ${s.catSaliente.ventas_30d} vendidos en 30 días.`);
  }

  // 3. Concentración: todo depende de una categoría.
  if (s.topCategoria && s.catalogo.ventas_30d) {
    const pct = Math.round((s.topCategoria.ventas_30d / s.catalogo.ventas_30d) * 100);
    if (pct >= 40) {
      av('medio', 'Las ventas dependen de una sola categoría',
        `"${s.topCategoria.ruta}" (${s.topCategoria.url}) concentra casi todo. Un riel o un bloque de otra categoría reparte el riesgo.`,
        `${pct}% de las ventas de 30 días (${s.topCategoria.ventas_30d} de ${s.catalogo.ventas_30d} unidades).`);
    }
  }

  // La temporada que entra, si hay una categoría armada para eso.
  if (s.catTemporada) {
    av('medio', `Hay una categoría de ${s.estacion.nombre} y no está en el home`,
      `"${s.catTemporada.ruta}" (${s.catTemporada.url}) ya tiene ${s.catTemporada.productos} productos cargados. Es la que conviene empujar en el carrusel principal y en un bloque, ahora que ${s.estacion.fase === 'arranca' ? 'arranca' : 'está plena'} la temporada.`,
      `${s.catTemporada.productos} productos, ${s.catTemporada.stock} unidades de stock, ${s.catTemporada.ventas_30d} vendidas en 30 días.`);
  }

  // 3. Secciones puestas y vacías: ocupan lugar y no muestran nada.
  if (s.home.vacias && s.home.vacias.length) {
    av('medio', 'Hay secciones en el orden que no muestran nada',
      `${s.home.vacias.map(nombreDe).join(', ')}. Están arrastradas en el panel de diseño pero sin configurar: dejan un salto en blanco en la página.`,
      `${s.home.vacias.length} ${s.home.vacias.length === 1 ? 'sección' : 'secciones'} vacías.`);
  }

  // 4. Peso y scraping.
  if (s.home.scrapers > 0) {
    av('alto', 'Todavía hay una sección que se baja la ficha de cada producto',
      'El lookbook (y cualquier sección que quede del theme viejo) descarga la página HTML completa de cada producto para sacarle la foto y el precio. Cada ficha pesa unos 175 KB. Se arregla apuntándolas al motor, como ya hacen los rieles.',
      `El home pesa ${s.home.peso_kb} KB.`);
  } else if (s.home.peso_kb > 900) {
    av('medio', 'El home pesa bastante',
      'Arriba de 1 MB, en un celular con datos, la primera pantalla tarda. Vale revisar el tamaño de las fotos del carrusel.',
      `${s.home.peso_kb} KB.`);
  }

  // 5. Catálogo desactualizado: los rieles muestran lo que dice el cache.
  if (s.catalogo.minutos_sync != null && s.catalogo.minutos_sync > 180) {
    av('medio', 'El catálogo del motor está viejo',
      'Los rieles y los bloques de producto muestran el precio y el stock que tiene guardados el motor, no el que está en Tiendanube en este segundo.',
      `Última sincronización hace ${Math.round(s.catalogo.minutos_sync / 60)} h.`);
  }

  // 6. Marcas escritas de dos formas.
  if (s.marcasDuplicadas.length) {
    av('bajo', 'Hay marcas cargadas con distinta escritura',
      `${s.marcasDuplicadas.join(', ')} aparece escrita de más de una forma en el catálogo. Cualquier filtro o riel por marca las trata como marcas distintas.`,
      null);
  }

  // 7. Poco stock disponible.
  if (s.catalogo.con_stock && s.catalogo.total) {
    const pct = Math.round((s.catalogo.con_stock / s.catalogo.total) * 100);
    if (pct < 30) {
      av('medio', 'Pocos productos tienen stock cargado',
        'Los rieles automáticos sólo muestran lo que tiene stock real y curva de talles sana. Con pocos productos elegibles, los cuatro rieles terminan mostrando casi lo mismo.',
        `${s.catalogo.con_stock} de ${s.catalogo.total} productos con stock (${pct}%).`);
    }
  }

  const peso = { alto: 0, medio: 1, bajo: 2 };
  return d.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

/* -------------------------------------------------------------------------
 * EL PLAN
 *
 * OBJETIVO DECLARADO POR EL DUEÑO (sep-2026): la página es para vender AL
 * PÚBLICO. El mayorista es consultivo — se atiende, no se empuja.
 *
 * Esto va contra la lectura ingenua del dato: 77% de las consultas de WhatsApp
 * son mayoristas, y la conclusión automática sería subir el mayorista arriba de
 * todo. Es al revés, por dos razones:
 *   1. Ese 77% es CONSECUENCIA del home actual, no una preferencia del mercado.
 *      El minorista que no encuentra precio se va sin escribir; el mayorista
 *      escribe siempre porque no tiene otra forma de comprar. Se está midiendo
 *      quién pregunta, no quién quiere comprar.
 *   2. Un desvío mayorista en las primeras pantallas le dice al visitante común
 *      "acá se vende por cantidad, no es para mí" — y se va antes de ver un precio.
 * Por eso el mayorista entra DESPUÉS de que quedó claro que hay venta al público
 * con precio y botón de comprar, y entra como puerta de consulta, no como oferta.
 *
 * Criterio general: primero lo que ya convierte al público, después lo que da
 * confianza, recién ahí la puerta mayorista, y al final lo que acompaña.
 * ----------------------------------------------------------------------- */
function armarPlan(s) {
  const plan = [];
  const riel = (n) => s.rieles[n] || null;
  const push = (o) => plan.push({ ...o, pos: plan.length + 1 });

  // Para liquidar se prefiere la categoría de la temporada que se va; si no hay
  // una armada, la que más stock tenga parado.
  const paraLiquidar = s.catSaliente || s.stockParado;
  const liquidar = paraLiquidar && paraLiquidar.stock > 200;

  // Las secciones escritas a mano en el theme ya ocupan lugar y ya dicen cosas.
  // El plan tiene que contarlas o duplica contenido (ver src/storeHome.js).
  const fijas = (s.home.secciones || []).filter((x) => x.fija && !x.oculta);
  const tieneFija = (id) => fijas.some((f) => f.id === id);

  push({
    id: 'slider', tipo: 'nativa',
    que: 'Carrusel principal con UNA promesa y un botón, con precio visible o "comprar".',
    porQue: 'Es lo único que ve todo el mundo sin scrollear. Acá se decide si el visitante entiende que puede comprar una unidad. Cuatro mensajes rotando es ninguno.',
    dato: null,
  });

  if (tieneFija('trust_badges')) {
    push({
      id: 'trust_badges', tipo: 'fija',
      que: 'Franja de confianza: envío gratis, cuotas, punto de retiro, cambios.',
      porQue: 'Ya está escrita en el theme y está bien puesta: son las objeciones del comprador minorista, respondidas antes de que aparezcan.',
      dato: 'Es fija: se edita en templates/home.tpl, no se arrastra desde el panel de diseño.',
    });
  } else {
    push({
      id: 'block', tipo: 'bloque', bloque: 'atributos',
      que: 'Tira de atributos: envío, cuotas, cambios, talles.',
      porQue: 'Las objeciones del comprador minorista, arriba y en una franja fina.',
      dato: null,
    });
  }

  const r0 = riel(0);
  push({
    id: 'rail_1', tipo: 'riel',
    que: r0 ? `Riel automático: "${r0.title}".` : 'Riel automático con los más vendidos.',
    porQue: 'Producto con precio y botón lo antes posible: es lo que despeja la duda de "¿me venden a mí?". Se arma con ventas y stock reales, así que nunca muestra algo agotado.',
    dato: s.catalogo.ventas_30d ? `${s.catalogo.ventas_30d} unidades vendidas en los últimos 30 días.` : null,
  });

  if (s.flash.activa || liquidar) {
    push({
      id: 'flash_sale', tipo: 'nativa',
      que: s.flash.activa
        ? `Ofertas flash con contador: "${s.flash.titulo || 'oferta activa'}".`
        : `Ofertas flash con contador, para liquidar ${paraLiquidar ? `"${paraLiquidar.cat}"` : 'el saldo de temporada'}.`,
      porQue: liquidar
        ? `Estamos ${s.estacion.fase === 'arranca' ? 'entrando en' : 'saliendo de'} ${s.estacion.nombre}: hay que ${s.estacion.liquida} mientras todavía se vende. El contador es lo único que empuja a decidir hoy.`
        : 'La oferta con fecha de fin es lo único que empuja a decidir hoy en vez de "después".',
      dato: paraLiquidar ? `${paraLiquidar.stock} unidades en depósito de "${paraLiquidar.cat}".` : null,
    });
  }

  push({
    id: 'block', tipo: 'bloque', bloque: 'editorial',
    que: 'Editorial de tres placas: una grande y dos chicas, cada una a su categoría o a un uso.',
    porQue: 'Reparte al visitante según para qué vino, sin obligarlo a usar el menú. Es donde el home deja de parecer un catálogo.',
    dato: s.categoriasReales && s.categoriasReales.length
      ? `Hay ${s.categoriasReales.length} categorías reales para elegir destino; las de más venta son ${s.categoriasReales.slice(0, 3).map((c) => c.nombre).join(', ')}.`
      : null,
  });

  const r1 = riel(1);
  push({
    id: 'rail_2', tipo: 'riel',
    que: r1 ? `Riel automático: "${r1.title}".` : 'Riel automático de ofertas.',
    porQue: 'Segunda pasada de producto, ya con el visitante enganchado.',
    dato: s.catalogo.con_oferta ? `${s.catalogo.con_oferta} productos con precio de oferta real cargado.` : null,
  });

  push({
    id: 'block', tipo: 'bloque', bloque: 'media_texto',
    que: 'Informativo: una norma o un material explicado (IRAM 3610, Grafa vs. ripstop) con foto y viñetas.',
    porQue: 'Es el diferencial contra la competencia argentina, que vende ropa de trabajo sin explicar nada. Responde la duda antes del WhatsApp y es contenido que Google entiende.',
    dato: s.leads.minorista ? `${s.leads.minorista} consultas minoristas en 60 días, muchas de talle y material.` : null,
  });

  push({
    id: 'lookbook', tipo: 'nativa',
    que: 'Lookbook interactivo con los combos.',
    porQue: 'Sube el ticket minorista: muestra la prenda puesta y deja llevarse el conjunto.',
    dato: s.home.scrapers > 0 ? 'Pendiente: hoy es la sección que se baja la ficha completa de cada producto.' : null,
  });

  const r2 = riel(2);
  if (r2) {
    push({
      id: 'rail_3', tipo: 'riel',
      que: `Riel automático: "${r2.title}".`,
      porQue: 'Última pasada de producto antes de cerrar.',
      dato: null,
    });
  }

  /* LA PUERTA MAYORISTA, acá y no antes.
     Ya se vio precio, botón de comprar y tres rieles de producto: nadie puede
     pensar que la tienda es sólo por cantidad. El que compra para su empresa
     scrollea hasta acá sin problema — de hecho hoy escribe igual estando en la
     posición 6. Se trata como consulta, no como venta. */
  push({
    id: 'block', tipo: 'bloque', bloque: 'media_texto',
    que: 'Puerta mayorista, en tono consultivo: "¿Necesitás equipar a tu equipo?" con foto, tres viñetas (precio por cantidad, factura A, entrega) y un botón que lleva a consultar.',
    porQue: 'Va acá a propósito. Más arriba le dice al comprador común "esto no es para vos" y lo pierde antes del primer precio. Acá abajo ya no hay confusión posible: el que llega sabe que hay venta al público y el que compra por cantidad igual lo encuentra.',
    dato: s.leads.pct_mayorista != null
      ? `${s.leads.pct_mayorista}% de las consultas por WhatsApp son mayoristas (${s.leads.mayorista} de ${s.leads.total} en 60 días). Es la demanda que ya llega sola: no necesita empuje, necesita una puerta clara.`
      : null,
  });

  push({
    id: 'block', tipo: 'bloque', bloque: 'preguntas',
    que: 'Preguntas frecuentes: talles, envíos, cambios, factura A y compra por cantidad.',
    porQue: 'Cada duda resuelta acá es una consulta de WhatsApp que no hay que contestar a mano, y una compra minorista que no se posterga.',
    dato: s.leads.total ? `${s.leads.total} consultas por WhatsApp en 60 días.` : null,
  });

  push({
    id: 'brands', tipo: 'nativa',
    que: 'Marcas.',
    porQue: 'Da respaldo cerca del final, cuando el visitante ya está evaluando si le compra a un desconocido.',
    dato: s.marcas.length ? `${s.marcas.filter((m) => m.marca !== '(sin marca)').length} marcas en el catálogo.` : null,
  });

  if (tieneFija('about_strip')) {
    push({
      id: 'about_strip', tipo: 'fija',
      que: 'Franja "quiénes somos".',
      porQue: 'Ya está en el theme y en el lugar correcto: el que llegó hasta acá está decidiendo si le compra a un desconocido.',
      dato: 'Es fija: se edita en snipplets/home/home-about-strip.tpl.',
    });
  }

  push({
    id: 'newsletter', tipo: 'nativa',
    que: 'Newsletter.',
    porQue: 'Último recurso para el que se va sin comprar. Va al final porque interrumpe.',
    dato: null,
  });

  if (tieneFija('guarantees')) {
    push({
      id: 'guarantees', tipo: 'fija',
      que: '"¿Por qué elegir BLACKS?" — las garantías largas.',
      porQue: 'Cierra la página. Ojo: repite parte de lo que ya dice la franja de confianza de arriba; si se recorta, que sea acá.',
      dato: 'Es fija: se edita en templates/home.tpl.',
    });
  }

  return plan;
}

/* -------------------------------------------------------------------------
 * DIFERENCIA CONTRA LA REALIDAD
 * Traduce el plan a movimientos concretos en el panel de diseño.
 * ----------------------------------------------------------------------- */
function comparar(plan, home, bloquesCfg = []) {
  if (!home.disponible) return { movimientos: [], sinLectura: true };
  // Qué tipo de bloque vive hoy en cada hueco, para que el boceto dibuje la
  // silueta correcta en la columna "Hoy" y no una caja genérica.
  const tipoDeHueco = new Map(bloquesCfg.map((b) => [b.slot, b.type]));

  const visibles = (home.secciones || []).filter((s) => !s.oculta);
  const ocultas = (home.secciones || []).filter((s) => s.oculta).map((s) => s.id);
  const huecosLibres = ['block_1', 'block_2', 'block_3', 'block_4', 'block_5', 'block_6']
    .filter((b) => !visibles.some((v) => v.id === b));

  // A cada posición "bloque" del plan se le asigna un hueco: primero los que ya
  // están puestos en la página, después los que hay que arrastrar.
  const puestos = visibles.filter((v) => v.id.startsWith('block_')).map((v) => v.id);
  let iPuesto = 0;
  let iLibre = 0;
  const conSlot = plan.map((p) => {
    if (p.tipo !== 'bloque') return p;
    const slot = puestos[iPuesto] || huecosLibres[iLibre];
    if (puestos[iPuesto]) iPuesto += 1; else iLibre += 1;
    return { ...p, slot: slot || null, id: slot || 'block' };
  });

  const movimientos = [];
  conSlot.forEach((p) => {
    const actual = visibles.findIndex((v) => v.id === p.id);
    // Para la comparación lado a lado: en qué posición está hoy y qué le pasa.
    p.posActual = actual === -1 ? null : actual + 1;
    p.estado = actual === -1
      ? (ocultas.includes(p.id) ? 'encender' : 'agregar')
      : (actual + 1 === p.pos ? 'queda' : 'mover');
    if (p.tipo === 'bloque' && !p.slot) {
      movimientos.push({ tipo: 'sin_hueco', id: p.id, nombre: 'Bloque de contenido',
        texto: 'No quedan huecos de bloque libres: el theme tiene seis. Sacá uno que no uses o pisá su contenido.' });
      return;
    }
    if (actual === -1) {
      const oculto = ocultas.includes(p.id);
      movimientos.push({
        tipo: oculto ? 'encender' : 'agregar', id: p.id, nombre: nombreDe(p.id), destino: p.pos,
        texto: oculto
          ? `Encendé "${nombreDe(p.id)}" (hoy está apagada) y ponela en la posición ${p.pos}.`
          : `Arrastrá "${nombreDe(p.id)}" a la posición ${p.pos}.`,
      });
    } else if (actual + 1 !== p.pos) {
      /* Las secciones fijas no se pueden arrastrar: están escritas en el theme.
         Se avisa igual, pero diciendo dónde se tocan y sin contarlas como un
         movimiento del panel de diseño (si no, la lista pide algo imposible). */
      const v = visibles[actual];
      if (v && v.fija) {
        movimientos.push({
          tipo: 'fija', id: p.id, nombre: v.nombre, origen: actual + 1, destino: p.pos,
          texto: `"${v.nombre}" queda en la posición ${actual + 1} y el plan la pondría en la ${p.pos}. No se arrastra desde el panel: está escrita en ${v.donde}.`,
        });
      } else {
        movimientos.push({
          tipo: 'mover', id: p.id, nombre: nombreDe(p.id), origen: actual + 1, destino: p.pos,
          texto: `Mové "${nombreDe(p.id)}" de la posición ${actual + 1} a la ${p.pos}.`,
        });
      }
    }
  });

  // Lo que está en la página y el plan no propone.
  visibles.forEach((v, i) => {
    if (conSlot.some((p) => p.id === v.id)) return;
    movimientos.push({
      tipo: v.viejo ? 'sacar' : (v.fija ? 'fija' : 'sobra'), id: v.id, nombre: v.nombre, origen: i + 1,
      texto: v.viejo
        ? `Sacá "${v.nombre}": es uno de los layouts viejos, sólo muestra productos con URLs pegadas a mano.`
        : v.fija
          ? `"${v.nombre}" está en la posición ${i + 1}. Es fija del theme (${v.donde}): no la mueve el panel de diseño.`
          : `"${v.nombre}" está en la posición ${i + 1} y no entra en el plan. No molesta, pero alarga la página.`,
    });
  });

  /* La columna "hoy": cada sección visible con lo que le pasa en el plan. */
  const hoy = visibles.map((v, i) => {
    const enPlan = conSlot.find((p) => p.id === v.id);
    return {
      pos: i + 1,
      id: v.id,
      nombre: v.nombre,
      vacia: v.vacia,
      viejo: v.viejo,
      // Para que el boceto pinte la etiqueta correcta: un riel no es lo mismo
      // que una sección nativa, y una fija del theme no se puede arrastrar.
      tipo: v.fija ? 'fija' : /^rail_\d$/.test(v.id) ? 'riel' : v.id.startsWith('block_') ? 'bloque' : 'nativa',
      bloque: tipoDeHueco.get(v.id) || null,
      fija: v.fija,
      destino: enPlan ? enPlan.pos : null,
      estado: enPlan ? (enPlan.pos === i + 1 ? 'queda' : 'mover') : (v.viejo ? 'sacar' : 'sobra'),
    };
  });

  return { plan: conSlot, movimientos, hoy };
}

async function buildPlan() {
  const s = await senales();
  const plan = armarPlan(s);
  const { plan: conSlot, movimientos, hoy, sinLectura } = comparar(plan, s.home, s.bloques);
  return {
    generado: new Date().toISOString(),
    senales: s,
    diagnostico: diagnosticar(s),
    plan: conSlot || plan,
    hoy: hoy || [],
    movimientos: movimientos || [],
    sinLectura: !!sinLectura,
  };
}

module.exports = { buildPlan, senales, estacionDe };
