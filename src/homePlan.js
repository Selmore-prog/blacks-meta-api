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

  // 1. Los dos negocios en una sola página.
  if (s.leads.total >= 20 && s.leads.pct_mayorista >= 55) {
    const posMay = posDe('promotional');
    av(posMay && posMay <= 4 ? 'medio' : 'alto',
      'El home atiende sobre todo al mayorista y no se nota arriba',
      posMay
        ? `El desvío a mayorista está en la posición ${posMay} de ${orden.length}. En celular eso son varias pantallas de scroll antes de que un comprador por cantidad entienda que puede comprar por cantidad.`
        : 'No hay ninguna sección que desvíe al mayorista en el home visible.',
      `${s.leads.pct_mayorista}% de las consultas por WhatsApp de los últimos 60 días son mayoristas (${s.leads.mayorista} de ${s.leads.total}), y ${s.catalogo.pct_mayorista}% del catálogo también.`);
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
 * Criterio general, en una línea: primero lo que ya convierte, enseguida la
 * bifurcación entre los dos negocios, después lo que da confianza, y al final
 * lo que acompaña pero no vende solo.
 * ----------------------------------------------------------------------- */
function armarPlan(s) {
  const plan = [];
  const riel = (n) => s.rieles[n] || null;
  const push = (o) => plan.push({ ...o, pos: plan.length + 1 });

  const mayoristaManda = s.leads.pct_mayorista != null && s.leads.pct_mayorista >= 55;
  // Para liquidar se prefiere la categoría de la temporada que se va; si no hay
  // una armada, la que más stock tenga parado.
  const paraLiquidar = s.catSaliente || s.stockParado;
  const liquidar = paraLiquidar && paraLiquidar.stock > 200;

  push({
    id: 'slider', tipo: 'nativa',
    que: s.catTemporada
      ? `Carrusel principal con UNA promesa. Ahora conviene que sea ${s.catTemporada.ruta} (${s.catTemporada.url}).`
      : 'Carrusel principal con UNA promesa y un botón.',
    porQue: 'Es lo único que ve todo el mundo sin scrollear. Cuatro mensajes rotando es ninguno.',
    dato: s.catTemporada
      ? `Entra ${s.estacion.nombre} y esa categoría ya tiene ${s.catTemporada.productos} productos cargados.`
      : null,
  });

  push({
    id: 'block', tipo: 'bloque', bloque: 'atributos',
    que: 'Tira de atributos: factura A, certificación, talles, envío.',
    porQue: 'Son las objeciones que frenan la compra. Puestas acá se responden antes de que aparezcan, y ocupan una franja fina.',
    dato: s.home.secciones.some((x) => x.id === 'informatives' && x.oculta)
      ? 'Hoy la sección nativa de "Información de envíos y pagos" está apagada, así que esto no está dicho en ningún lado del home.'
      : null,
  });

  if (mayoristaManda) {
    push({
      id: 'block', tipo: 'bloque', bloque: 'media_texto',
      que: 'Desvío a mayorista: foto de equipo equipado, tres viñetas (precio por cantidad, factura A, entrega) y botón a /mayorista.',
      porQue: 'Es el negocio más grande y hoy hay que scrollear medio home para encontrarlo. Un bloque propio con foto convierte mucho mejor que un banner suelto.',
      dato: `${s.leads.pct_mayorista}% de las consultas son mayoristas (${s.leads.mayorista} de ${s.leads.total} en 60 días).`,
    });
  }

  const r0 = riel(0);
  push({
    id: 'rail_1', tipo: 'riel',
    que: r0 ? `Riel automático: "${r0.title}".` : 'Riel automático con los más vendidos.',
    porQue: 'Lo que ya se vende solo, arriba. Se arma con ventas y stock reales, así que nunca muestra algo agotado.',
    dato: s.catalogo.ventas_30d ? `${s.catalogo.ventas_30d} unidades vendidas en los últimos 30 días.` : null,
  });

  if (s.flash.activa || liquidar) {
    push({
      id: 'flash_sale', tipo: 'nativa',
      que: s.flash.activa
        ? `Ofertas flash con contador: "${s.flash.titulo || 'oferta activa'}".`
        : `Ofertas flash con contador, para liquidar ${paraLiquidar ? `"${paraLiquidar.ruta}" (${paraLiquidar.url})` : 'el saldo de temporada'}.`,
      porQue: liquidar
        ? `Estamos ${s.estacion.fase === 'arranca' ? 'entrando en' : 'saliendo de'} ${s.estacion.nombre}: hay que ${s.estacion.liquida} mientras todavía se vende.`
        : 'La oferta con fecha de fin es lo único que empuja a decidir hoy en vez de "después".',
      dato: paraLiquidar ? `${paraLiquidar.stock} unidades en depósito de "${paraLiquidar.ruta}".` : null,
    });
  }

  push({
    id: 'block', tipo: 'bloque', bloque: 'editorial',
    que: 'Editorial de tres placas: una grande y dos chicas, cada una a su categoría o a un uso.',
    porQue: 'Reemplaza la grilla de banners cuadrados por algo que se puede navegar. Es donde el home deja de parecer un catálogo.',
    dato: (s.categorias.vendibles || []).length
      ? `Candidatas por ventas de 30 días: ${(s.categorias.vendibles || []).filter((c) => c.url !== '/eshop').slice(0, 3).map((c) => `${c.ruta} (${c.url}, ${c.ventas_30d} vendidas)`).join(' · ')}.`
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
    porQue: 'Es el diferencial contra la competencia argentina, que vende ropa de trabajo sin explicar nada. Además es el contenido que Google entiende y que responde la duda antes del WhatsApp.',
    dato: s.leads.minorista ? `${s.leads.minorista} consultas minoristas en 60 días, muchas de talle y material.` : null,
  });

  push({
    id: 'lookbook', tipo: 'nativa',
    que: 'Lookbook interactivo con los combos.',
    porQue: 'Sube el ticket: muestra la prenda puesta y deja llevarse el conjunto.',
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

  push({
    id: 'block', tipo: 'bloque', bloque: 'preguntas',
    que: 'Preguntas frecuentes: factura A, talles, envíos, mayorista.',
    porQue: 'Cada duda resuelta acá es una consulta de WhatsApp que no hay que contestar a mano, y una compra que no se posterga.',
    dato: s.leads.total ? `${s.leads.total} consultas por WhatsApp en 60 días.` : null,
  });

  push({
    id: 'brands', tipo: 'nativa',
    que: 'Marcas.',
    porQue: 'Da respaldo cerca del final, cuando el visitante ya está evaluando si le compra a un desconocido.',
    dato: s.marcas.length ? `${s.marcas.filter((m) => m.marca !== '(sin marca)').length} marcas en el catálogo.` : null,
  });

  push({
    id: 'newsletter', tipo: 'nativa',
    que: 'Newsletter.',
    porQue: 'Último recurso para el que se va sin comprar. Va al final porque interrumpe.',
    dato: null,
  });

  return plan;
}

/* -------------------------------------------------------------------------
 * DIFERENCIA CONTRA LA REALIDAD
 * Traduce el plan a movimientos concretos en el panel de diseño.
 * ----------------------------------------------------------------------- */
function comparar(plan, home) {
  if (!home.disponible) return { movimientos: [], sinLectura: true };

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
      movimientos.push({
        tipo: 'mover', id: p.id, nombre: nombreDe(p.id), origen: actual + 1, destino: p.pos,
        texto: `Mové "${nombreDe(p.id)}" de la posición ${actual + 1} a la ${p.pos}.`,
      });
    }
  });

  // Lo que está en la página y el plan no propone.
  visibles.forEach((v, i) => {
    if (conSlot.some((p) => p.id === v.id)) return;
    movimientos.push({
      tipo: v.viejo ? 'sacar' : 'sobra', id: v.id, nombre: v.nombre, origen: i + 1,
      texto: v.viejo
        ? `Sacá "${v.nombre}": es uno de los layouts viejos, sólo muestra productos con URLs pegadas a mano.`
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
      destino: enPlan ? enPlan.pos : null,
      estado: enPlan ? (enPlan.pos === i + 1 ? 'queda' : 'mover') : (v.viejo ? 'sacar' : 'sobra'),
    };
  });

  return { plan: conSlot, movimientos, hoy };
}

async function buildPlan() {
  const s = await senales();
  const plan = armarPlan(s);
  const { plan: conSlot, movimientos, hoy, sinLectura } = comparar(plan, s.home);
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
