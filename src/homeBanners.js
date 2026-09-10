const pool = require('./db');
const { leerHome } = require('./storeHome');
const { eligibleSQL } = require('./productScore');

/**
 * BANNERS RECOMENDADOS PARA EL HOME DE LA TIENDA.
 *
 * Por qué existe (pedido de ago-2026): "los banners de mi página no están tan buenos o
 * están muy sobrecargados… que me recomiende banners para poner, los principales de
 * arriba (tipo carrusel) y los que están en modo grilla/bento".
 *
 * Lo que se vio en el home real (blacksindumentaria.com.ar, 25-ago-2026): el banner
 * principal apila DOS descuentos distintos que compiten entre sí ("HASTA 45% OFF" y
 * "TODA LA WEB 10% OFF EN LA SEGUNDA UNIDAD"), más una franja de envíos, más una flecha
 * decorativa, más tres productos, más un eyebrow de temporada — y ningún botón. Un
 * banner tiene ~2 segundos de atención: con seis mensajes no se lee ninguno.
 *
 * REGLA DE ORO DE ESTE MÓDULO: **una promesa por banner**. Un mensaje, un producto o
 * categoría, un botón. Si hay dos ofertas que contar, son dos banners del carrusel, no
 * uno partido en dos.
 *
 * Las recomendaciones NO son plantillas genéricas: cada una viene con el número real que
 * la justifica, para poder discutirla. El dato que más manda hoy es que 3 de cada 4
 * consultas por WhatsApp son MAYORISTAS (177 contra 55 en 60 días) mientras el catálogo
 * mayorista es el 68% de los productos — y en el home el mayorista aparece recién abajo.
 *
 * Este módulo NO publica nada: Tiendanube no tiene API para el panel de diseño. Propone
 * el banner, lo renderiza como imagen lista para subir, y el dueño la sube a mano.
 */

/* Medidas del theme. Revisadas el 10-sep-2026 midiendo la tienda en vivo, donde
 * los cuatro banners del carrusel tenían CUATRO alturas distintas (476, 567, 475
 * y 542 px a 1280 de ancho) porque cada slide tomaba la altura de su propia foto.
 * Desde entonces el theme fija la proporción por CSS y recorta al centro
 * (.section-slider .slide-container en style-critical.scss), así que estas
 * medidas ya no son una sugerencia: lo que no entre en esta forma se recorta.
 *
 * `ratio` es el dato que de verdad importa y por eso está explícito: los modelos
 * de imagen trabajan con razones, no con píxeles, y sólo aceptan un puñado de
 * valores. Los tres de acá son de ese puñado, así que ninguna pieza necesita
 * recorte posterior.
 *
 * En celular el carrusel recorta al centro, así que nada importante puede vivir
 * en los costados: eso es lo que mide safeCenter. */
const SUPERFICIES = {
  slider: { w: 1920, h: 823, ratio: '21:9', label: 'Carrusel principal (arriba de todo)', safeCenter: 0.62 },
  sliderMobile: { w: 1080, h: 1440, ratio: '3:4', label: 'Carrusel principal (celular)', safeCenter: 1 },
  grid: { w: 1200, h: 1200, ratio: '1:1', label: 'Banner de grilla / bento (cuerpo de la página)', safeCenter: 1 },
};

/* Las recomendaciones tienen DOS descripciones de la foto y no una:
 *   - `queMostrar` está escrita para una PERSONA. Dice cosas como "NO una
 *     prenda suelta: la idea que tiene que quedar es CANTIDAD" o "sacá de acá
 *     el 10% OFF": criterio de marketing, en castellano y con mayúsculas de
 *     énfasis. Es lo que se lee en la tarjeta del panel.
 *   - `escena` está escrita para el GENERADOR: en inglés, describiendo lo que
 *     tiene que verse y nada más.
 * Hasta sep-2026 había una sola y se metía `queMostrar` crudo adentro de un
 * prompt en inglés. Quedaba un prompt bilingüe con instrucciones dirigidas a
 * otro lector ("sacá de acá el 10%"), que el modelo intenta interpretar como
 * parte de la escena. */
const ESTACION_EN = { verano: 'summer', otoño: 'autumn', invierno: 'winter', primavera: 'spring' };

/** Temporada del hemisferio sur: define qué conviene empujar hoy. */
function temporada(date = new Date()) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return { nombre: 'verano', liquida: 'primavera', liquida_regex: /pantal[oó]n|camisa|chomba|remera|softshell/i, empuja: /remera|chomba|bermuda|short|gorra|ojota/i };
  if (m <= 4) return { nombre: 'otoño', liquida: 'verano', liquida_regex: /remera|chomba|bermuda|short|gorra|ojota/i, empuja: /campera|buzo|pantal[oó]n|camisa/i };
  if (m <= 7) return { nombre: 'invierno', liquida: 'otoño', liquida_regex: /campera|buzo|pantal[oó]n|camisa/i, empuja: /campera|polar|buzo|t[eé]rmic|softshell|abrigo/i };
  return { nombre: 'primavera', liquida: 'invierno', liquida_regex: /campera|polar|buzo|t[eé]rmic|softshell|abrigo/i, empuja: /pantal[oó]n|camisa|chomba|remera|softshell/i };
}

/** Los números reales con los que se arma y se justifica cada recomendación. */
async function gatherContext() {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

  const [leads] = [await q(
    `SELECT lead_type, count(*)::int n FROM lead_clicks
      WHERE created_at > now() - interval '60 days' GROUP BY 1`
  )];
  const mayoristaLeads = (leads.find((l) => l.lead_type === 'mayorista') || {}).n || 0;
  const minoristaLeads = (leads.find((l) => l.lead_type === 'minorista') || {}).n || 0;

  const [cat] = await q(
    `SELECT count(*) FILTER (WHERE price IS NULL OR price <= 0)::int mayorista,
            count(*) FILTER (WHERE price > 0)::int minorista
       FROM products_cache WHERE published IS NOT FALSE`
  );

  const masVendidos = await q(
    `SELECT id, name, price, promo_price, image_url, sales_30d
       FROM products_cache WHERE ${eligibleSQL()}
       ORDER BY sales_30d DESC NULLS LAST LIMIT 8`
  );

  // Rebajas REALES vigentes (precio promocional cargado en Tiendanube), no inventadas.
  const enOferta = await q(
    `SELECT id, name, price, promo_price, image_url,
            round((1 - promo_price / price) * 100)::int off
       FROM products_cache
      WHERE ${eligibleSQL()} AND promo_price > 0 AND promo_price < price
      ORDER BY (1 - promo_price / price) DESC LIMIT 6`
  );

  const [ws] = await q('SELECT * FROM wholesale_settings ORDER BY id LIMIT 1').catch(() => [null]);

  const est = temporada();
  const deTemporada = masVendidos.filter((p) => est.empuja.test(p.name));
  const deLiquidacion = enOferta.filter((p) => est.liquida_regex.test(p.name));

  return {
    temporada: est.nombre,
    liquida: est.liquida,
    mayoristaLeads,
    minoristaLeads,
    pctMayorista: mayoristaLeads + minoristaLeads
      ? Math.round((mayoristaLeads / (mayoristaLeads + minoristaLeads)) * 100) : null,
    catalogo: cat,
    masVendidos,
    enOferta,
    deTemporada,
    deLiquidacion,
    mayorista: ws || null,
    descuentoMaximo: enOferta.length ? enOferta[0].off : null,
  };
}

/**
 * DIAGNÓSTICO DEL HOME ACTUAL + reglas para armar cualquier banner.
 *
 * Es la parte que más se usa: lo que se pidió son INDICACIONES de qué poner, no
 * necesariamente una imagen generada. Todo esto es fijo y sale de lo que se observó en
 * el home real (25-ago-2026), no depende de los datos del día.
 */
function guiaGeneral(ctx) {
  return {
    problemas: [
      'El banner principal tiene DOS descuentos distintos peleando: "HASTA 45% OFF" arriba y "10% OFF en la segunda unidad" en la franja de abajo. El cliente no sabe cuál le aplica, y ninguno de los dos se fija.',
      'Encima de esos dos hay una tercera promesa ("Envíos a todo el país"). Tres mensajes en la misma imagen equivalen a cero mensajes: el ojo no jerarquiza.',
      'No hay ningún BOTÓN. El banner se ve como un cartel, no como algo en lo que se puede hacer clic — y en mobile es donde más se pierde.',
      'Tres productos sueltos en el mismo cuadro compiten entre sí. Con uno solo, grande, se entiende qué se está vendiendo.',
      'Los envíos y las cuotas NO van en el banner: van en la barra de confianza que ya está arriba de todo. Repetirlos en el banner le roba lugar a la oferta.',
    ],
    reglas: [
      'UNA promesa por banner. Si hay dos ofertas para contar, son dos banners del carrusel, no uno partido en dos.',
      'Estructura fija: bajada chica (categoría) + titular grande (la promesa) + un botón. Nada más.',
      'El titular tiene que leerse en 2 segundos a 20 cm de distancia en un celular. Si necesita más de 5 palabras, no es un titular de banner.',
      'El producto va apoyado a un costado, no en el medio: el texto necesita el otro lado limpio.',
      'En mobile el carrusel recorta a los costados. Todo el texto tiene que vivir en el 62% del centro; el producto puede quedar cortado sin que se pierda nada.',
      'Máximo 3 banners en el carrusel. Con más, el cliente no llega a ver el tercero antes de scrollear.',
      'Los banners de la grilla NO llevan descuento: ahí el visitante ya entró y lo que necesita es encontrar su categoría. Un segundo cartel de oferta compite con el del carrusel y diluye los dos.',
    ],
    medidas: [
      `Carrusel principal: ${SUPERFICIES.slider.w}x${SUPERFICIES.slider.h} px (proporción 2.65). Texto dentro del 62% central.`,
      `Grilla / bento: ${SUPERFICIES.grid.w}x${SUPERFICIES.grid.h} px (cuadrado).`,
      'JPG de buena calidad, menos de 300 KB: el banner es lo primero que carga y pesa en la velocidad del sitio.',
    ],
    cadencia: `Revisá el carrusel cuando cambie la temporada o la promo. Hoy dice "Liquidación de invierno" y el invierno se termina: en septiembre ese banner queda viejo y transmite que la tienda está abandonada.`,
  };
}

/**
 * Arma las recomendaciones. Devuelve una lista ordenada por impacto esperado; cada una
 * trae el texto exacto que va impreso y el porqué con el número que lo sostiene.
 */
async function recommendBanners() {
  const ctx = await gatherContext();
  const recs = [];

  // 1. MAYORISTA EN EL CARRUSEL. Es la recomendación que más mueve la aguja y hoy no
  //    está: el mayorista vive abajo del home aunque genera 3 de cada 4 consultas.
  if (ctx.mayoristaLeads > ctx.minoristaLeads) {
    const min = ctx.mayorista && ctx.mayorista.min_units;
    recs.push({
      superficie: 'slider',
      posicion: 1,
      objetivo: 'Captar la consulta mayorista, que es la mayoría del negocio',
      kicker: 'Venta mayorista',
      titular: 'Equipá a tu equipo',
      bajada: min ? `Desde ${min} unidades · Factura A · Envíos a todo el país` : 'Precios por cantidad · Factura A · Envíos a todo el país',
      cta: 'Pedí tu presupuesto',
      url: '/mayorista',
      producto: null,
      porque: `${ctx.pctMayorista}% de las consultas por WhatsApp de los últimos 60 días son mayoristas (${ctx.mayoristaLeads} contra ${ctx.minoristaLeads}) y ${ctx.catalogo.mayorista} de los ${ctx.catalogo.mayorista + ctx.catalogo.minorista} productos publicados son mayoristas. Hoy el desvío a mayorista aparece recién abajo del home.`,
      queMostrar: 'Una foto de varias prendas iguales (un lote, una pila de camisas o mamelucos del mismo color) o gente trabajando uniformada. NO una prenda suelta: la idea que tiene que quedar es CANTIDAD.',
      escena: 'A bulk lot of identical workwear — a tall stack of folded shirts or a rack of coveralls, all the same colour — in a warehouse or workshop. The impression has to be quantity and supply, never one single garment.',
      queEvitar: 'No pongas precios acá. El mayorista se cotiza; un precio arruina la consulta porque el cliente decide solo en vez de escribir.',
    });
  }

  // 2. LA OFERTA, SOLA. El banner actual mezcla "45% OFF" con "10% OFF en la segunda
  //    unidad": son dos promesas peleando. Va una, con el número más alto REAL.
  if (ctx.descuentoMaximo && ctx.enOferta.length) {
    const p = ctx.deLiquidacion.length ? ctx.deLiquidacion[0] : ctx.enOferta[0];
    recs.push({
      superficie: 'slider',
      posicion: 2,
      objetivo: 'Empujar la rebaja con UNA sola promesa clara',
      kicker: `Liquidación de ${ctx.liquida}`,
      titular: `Hasta ${ctx.descuentoMaximo}% OFF`,
      bajada: `${ctx.enOferta.length} productos con rebaja real`,
      cta: 'Ver ofertas',
      url: '/ofertas',
      producto: p,
      porque: `Hay ${ctx.enOferta.length} productos con precio promocional cargado en Tiendanube; el mayor descuento real es ${ctx.descuentoMaximo}%. El banner actual mezcla ese número con un "10% OFF en la segunda unidad" y una franja de envíos: tres promesas compitiendo en la misma imagen.`,
      queMostrar: `Un producto de ${ctx.liquida} rebajado, exhibido de forma atractiva y natural. La imagen debe servir como un fondo limpio para que resalten los textos de descuento que se agregarán por encima en la tienda. No renderices texto ni números de descuento.`,
      escena: `A single ${ESTACION_EN[ctx.liquida] || ctx.liquida} workwear garment laid out or hanging on a plain, uncluttered surface, lit so the fabric reads clearly and the background stays calm and even.`,
      queEvitar: 'Sacá de acá el "10% OFF en la segunda unidad" y la franja de envíos: son otra promesa y otro banner. Si querés contar el 10%, que sea el segundo slide del carrusel.',
    });
  }

  // 3. EL PRODUCTO QUE MÁS SE VENDE, DE TEMPORADA.
  const estrella = ctx.deTemporada[0] || ctx.masVendidos[0];
  if (estrella) {
    recs.push({
      superficie: 'slider',
      posicion: 3,
      objetivo: 'Mostrar el producto que ya está funcionando',
      kicker: `Lo más elegido · ${ctx.temporada}`,
      titular: estrella.name.split(/\s+/).slice(0, 4).join(' '),
      bajada: 'El que más sale de la tienda este mes',
      cta: 'Verlo',
      url: '/productos',
      producto: estrella,
      porque: `${estrella.name} es el más vendido de los últimos 30 días entre los productos elegibles${estrella.sales_30d ? ` (${estrella.sales_30d} ventas)` : ''}${ctx.deTemporada[0] ? ` y es de temporada (${ctx.temporada})` : ''}.`,
      queMostrar: 'La foto del producto solo, grande y recortada del fondo, sobre fondo oscuro. Sin modelo cortado por el torso: si la foto de catálogo tiene a la persona cortada, usá la del producto suelto.',
      escena: 'The single garment on its own, large in the frame, against a dark even background. No model, no cropped body, nothing else in shot.',
      queEvitar: 'No le pongas precio ni descuento: este banner es de deseo, no de oferta. El precio lo ve en la ficha.',
    });
  }

  // 4-6. GRILLA / BENTO: categorías, no promesas. Acá el usuario ya está navegando; lo
  //      que necesita es orientarse rápido, no otro cartel de descuento.
  const bloques = [
    { kicker: 'Calzado de seguridad', en: 'a safety boot or work shoe', titular: 'Botines y zapatos', url: '/calzado', re: /bot[ií]n|zapato|calzado/i },
    { kicker: 'Ropa de trabajo', en: 'a pair of work trousers or cargo pants', titular: 'Pantalones y cargos', url: '/pantalones', re: /pantal[oó]n|cargo|bombacha/i },
    { kicker: 'Abrigo', en: 'a work jacket or fleece', titular: 'Camperas y buzos', url: '/abrigo', re: /campera|buzo|polar|softshell/i },
  ];
  for (const [i, b] of bloques.entries()) {
    const p = ctx.masVendidos.find((x) => b.re.test(x.name)) || null;
    recs.push({
      superficie: 'grid',
      posicion: i + 1,
      objetivo: 'Orientar al que ya está navegando (categoría, no descuento)',
      kicker: b.kicker,
      titular: b.titular,
      bajada: null,
      cta: 'Ver todo',
      url: b.url,
      producto: p,
      porque: 'En la grilla el visitante ya entró: lo que rinde es que encuentre su categoría en un vistazo. Un segundo cartel de descuento acá compite con el del carrusel y diluye los dos.',
      queMostrar: 'Una sola prenda representativa de la categoría, misma luz y mismo fondo en los tres banners de la grilla. Que los tres se vean claramente de la misma familia.',
      // El fondo y la luz se describen IGUAL en los tres a propósito: es lo que
      // hace que la grilla se lea como un set y no como tres fotos sueltas.
      escena: `${b.en.charAt(0).toUpperCase()}${b.en.slice(1)}, on its own, centred on a plain mid-grey concrete surface, lit from one side with soft even daylight.`,
      queEvitar: 'Nada de porcentajes, precios ni "últimas unidades" acá. Sólo el nombre de la categoría y un "Ver todo".',
    });
  }

  /* PROMPT LISTO PARA PEGAR, uno por recomendación.
     Cada recomendación ya venía con "qué mostrar" y "qué evitar" escritos para
     una persona; esto los convierte en la indicación para el generador, con la
     misma cola técnica anti-"parece IA" que usan los bloques (ver
     promptDeFoto en homeCopy.js) y con la MEDIDA de la superficie, que es el
     dato que más se olvida y el que obliga a rehacer la imagen. */
  const { promptDeFoto } = require('./homeCopy');
  recs.forEach((r, idx) => {
    const sup = SUPERFICIES[r.superficie] || SUPERFICIES.slider;
    /* Se aclara que la foto es el FONDO. Sin esto, una recomendación como
       "el número del descuento enorme" hacía que el generador dibujara el
       número dentro de la imagen — justo lo que no se quiere: el titular y el
       precio se tipografían encima después, y quemados en el JPG no se adaptan
       al celular ni los lee Google. */
    /* DÓNDE VA EL AIRE PARA EL TEXTO.
       Antes el lado se alternaba con idx % 2, o sea por el número de la
       recomendación y sin relación con nada. Ahora el theme deja elegir la
       alineación banner por banner (settings.slider_align_1..8), así que se
       decide UNA vez acá, se usa en el prompt y se le dice al dueño qué elegir
       en el panel de diseño: la foto y el texto quedan del mismo lado en vez de
       pelearse. Se alternan izquierda y derecha para que el carrusel no sea
       cuatro veces la misma composición. */
    const lado = idx % 2 === 0 ? 'left' : 'right';
    r.alineacion = r.superficie === 'slider' ? lado : 'left';
    r.alineacionLabel = r.superficie === 'slider'
      ? `En el panel de diseño, poné "Alineación del banner ${r.posicion}" en ${lado === 'left' ? 'Izquierda' : 'Derecha'}.`
      : '';

    const prodRef = r.producto ? ` Feature our specific product ("${r.producto.name}") realistically instead of generic clothing.` : '';

    /* El recorte se avisa SIEMPRE. El theme fija la proporción y usa
       object-fit: cover, así que si la foto viene con otra forma se le come los
       bordes — y lo primero que se pierde es justo lo que el modelo tiende a
       poner ahí. Decirlo en el prompt sale gratis y evita rehacer la imagen. */
    const enIngles = 'This is the BACKGROUND PHOTOGRAPH of a banner for an Argentine workwear and safety '
      + 'clothing store. The headline, any discount figure and the button are typeset on top afterwards, '
      + 'so the photograph itself must contain no text and no numbers. '
      + `Scene: ${r.escena || r.queMostrar}${prodRef} `
      + `Leave the ${r.superficie === 'slider' ? `${lado} third` : 'lower third'} of the frame calm and `
      + 'uncluttered so the typography can sit there and stay readable. '
      + 'Keep the subject well inside the frame: the edges get cropped on smaller screens.';
    r.medida = `${sup.w} x ${sup.h} px (${sup.ratio})`;
    r.prompt = promptDeFoto({
      tipo: 'foto',
      prompt_ia: enIngles,
      ratio: sup.ratio,
      producto_de_referencia: r.producto ? r.producto.name : '',
    });

    if (r.superficie === 'slider') {
      const supMob = SUPERFICIES.sliderMobile;
      /* En vertical el texto va abajo sí o sí, sin importar la alineación que
         tenga el banner en escritorio: al ancho de un teléfono no hay "tercio
         izquierdo" que alcance para un titular. */
      const enInglesMob = 'This is the BACKGROUND PHOTOGRAPH of a vertical mobile banner for an Argentine workwear '
        + 'and safety clothing store. The headline, any discount figure and the button are typeset on top '
        + 'afterwards, so the photograph itself must contain no text and no numbers. '
        + `Scene: ${r.escena || r.queMostrar}${prodRef} `
        + 'Frame it vertically, with the subject in the upper two thirds and the lower third calm and '
        + 'uncluttered so the typography can sit there and stay readable. '
        + 'Keep the subject centred and well inside the frame: the sides get cropped on narrow screens.';
      r.medidaMobile = `${supMob.w} x ${supMob.h} px (${supMob.ratio})`;
      r.promptMobile = promptDeFoto({
        tipo: 'foto',
        prompt_ia: enInglesMob,
        ratio: supMob.ratio,
        producto_de_referencia: r.producto ? r.producto.name : '',
      });
    }
  });

  return {
    contexto: ctx,
    guia: guiaGeneral(ctx),
    recomendaciones: recs,
    superficies: SUPERFICIES,
    // Lo que hay hoy arriba de todo, leído de la tienda en vivo.
    actuales: ((await leerHome()).banners) || [],
  };
}

module.exports = { recommendBanners, gatherContext, SUPERFICIES, temporada };

/**
 * Renderiza una recomendación como imagen lista para subir al panel de Tiendanube.
 * Devuelve { buffer, width, height }. No sube nada: el theme de Tiendanube no tiene API
 * para el panel de diseño, así que la imagen se descarga y se sube a mano.
 */
async function renderBanner(rec, { superficie = null } = {}) {
  const puppeteer = require('puppeteer');
  const { buildBannerHtml } = require('./templatesModern');
  const { cutoutFromUrl } = require('./productCutout');
  const dim = SUPERFICIES[superficie || rec.superficie] || SUPERFICIES.slider;

  let cutoutUrl = null;
  if (rec.producto && rec.producto.image_url) {
    const cut = await cutoutFromUrl(rec.producto.image_url);
    if (cut) cutoutUrl = `data:image/png;base64,${cut.buffer.toString('base64')}`;
  }

  const html = buildBannerHtml({
    width: dim.w, height: dim.h, safeCenter: dim.safeCenter,
    kicker: rec.kicker, titular: rec.titular, bajada: rec.bajada, cta: rec.cta, cutoutUrl,
  });

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: dim.w, height: dim.h });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 }).catch(async () => {
      await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
    });
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }).catch(() => {});
    const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
    return { buffer, width: dim.w, height: dim.h };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports.renderBanner = renderBanner;
