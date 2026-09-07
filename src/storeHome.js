/* =========================================================================
 * LEER EL HOME REAL DE LA TIENDA
 *
 * EL PROBLEMA QUE RESUELVE
 * El orden de las secciones de la página de inicio vive en el panel de diseño
 * de Tiendanube, que NO tiene API. Hasta ago-2026 eso obligaba a que cualquier
 * recomendación de orden fuera una propuesta a comparar de memoria, sin poder
 * decir "hoy está así".
 *
 * Pero el theme deja el orden escrito en el HTML: cada sección sale envuelta en
 * `<div class="home-section-wrapper section-XXX">` (ver templates/home.tpl), y
 * Tiendanube le antepone `__hidden__` al id de las que el dueño apagó. Así que
 * el orden se puede LEER: se baja el home como lo baja cualquier visitante y se
 * parsea. No hace falta permiso ni token — es la vidriera pública.
 *
 * De paso, la misma bajada sirve para medir el peso real de la página y para
 * detectar dos cosas que no se ven mirando el panel: secciones que están en el
 * orden pero salen VACÍAS (puestas y nunca configuradas) y secciones que
 * todavía se bajan la ficha de cada producto para sacarle la foto.
 * ========================================================================= */

const config = require('./config');

const CACHE_TTL_MS = 20 * 60 * 1000;
let cache = { at: 0, data: null };

/* Nombres tal cual aparecen en el selector del panel de diseño
   (config/settings.txt → section_order). Si se renombra allá, renombrar acá. */
const NOMBRES = {
  slider: 'Carrusel de imágenes',
  rail_1: '★ Riel automático 1',
  rail_2: '★ Riel automático 2',
  rail_3: '★ Riel automático 3',
  rail_4: '★ Riel automático 4',
  flash_sale: '★ Ofertas flash (con contador)',
  block_1: '◆ Bloque de contenido 1',
  block_2: '◆ Bloque de contenido 2',
  block_3: '◆ Bloque de contenido 3',
  block_4: '◆ Bloque de contenido 4',
  block_5: '◆ Bloque de contenido 5',
  block_6: '◆ Bloque de contenido 6',
  atajos: 'Atajos visuales',
  main_categories: 'Categorías principales',
  products: 'Productos destacados',
  lookbook: 'Lookbook interactivo',
  hot_blacks: 'Hot Blacks',
  new: 'Productos nuevos',
  sale: 'Productos en oferta',
  promotion: 'Productos en promoción',
  best_seller: 'Productos más vendidos',
  category_remeras: 'Remeras',
  category_pantalones: 'Pantalones',
  category_calzado: 'Calzado',
  category_invierno: 'Colección Invierno',
  informatives: 'Información de envíos, pagos y compra',
  welcome: 'Mensaje de bienvenida',
  institutional: 'Mensaje institucional',
  categories: 'Banners de categorías',
  promotional: 'Banners promocionales',
  news_banners: 'Banners de novedades',
  brands: 'Marcas',
  video: 'Video',
  main_product: 'Producto principal',
  newsletter: 'Newsletter',
  instafeed: 'Publicaciones de Instagram',
  testimonials: 'Testimonios',
  modules: 'Módulos de imagen y texto',
};

const nombreDe = (id) => NOMBRES[id] || id;

/* SECCIONES FIJAS DEL THEME.
   No están en el orden del panel de diseño de Tiendanube porque no salen del
   selector de secciones: están escritas a mano en templates/home.tpl y por eso
   no se pueden arrastrar. Aparecen igual en la página y ocupan lugar, así que
   el esquema tiene que contarlas o el orden propuesto miente.
   Para moverlas hay que tocar el .tpl, no el panel. */
const FIJAS = [
  {
    clase: 'trust-badges-section',
    id: 'trust_badges',
    nombre: 'Franja de confianza (envío, cuotas, retiro, cambios)',
    donde: 'templates/home.tpl — se imprime enganchada después de la PRIMERA sección del orden',
    contenido: 'Envío gratis, financiación, punto de retiro y cambios/devoluciones.',
  },
  {
    clase: 'ab-strip',
    id: 'about_strip',
    nombre: 'Franja "quiénes somos"',
    donde: 'snipplets/home/home-about-strip.tpl — después del bucle de secciones',
    contenido: 'Gancho corto de la historia, con link a /quienes-somos.',
  },
  {
    clase: 'guarantees-section',
    id: 'guarantees',
    nombre: '"¿Por qué elegir BLACKS?"',
    donde: 'templates/home.tpl — al final, después del bucle',
    contenido: 'Las garantías largas, ya cerca del pie.',
  },
];

/* Los ocho layouts que quedaron del theme viejo. Se marcan aparte porque la
   recomendación es sacarlos, no moverlos. */
const LAYOUTS_VIEJOS = ['hero_split', 'cards_3d', 'masonry', 'magazine',
  'minimal_grid', 'bold_showcase', 'parallax_slider', 'metro_tiles'];

/**
 * Corta el HTML en los tramos de cada sección para poder mirar qué hay adentro
 * de cada una. Devuelve [{ id, oculta, html }] en el orden en que salen.
 */
function trocear(html) {
  const marcas = [];

  // Secciones del orden del panel.
  const re = /<div class="home-section-wrapper section-([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) marcas.push({ bruto: m[1], desde: m.index, fija: null });

  // Secciones escritas a mano en el theme. Se buscan por su clase raíz y se
  // intercalan por posición real en el documento, que es como las ve el visitante.
  FIJAS.forEach((f) => {
    const i = html.indexOf(`class="${f.clase}"`);
    if (i !== -1) marcas.push({ bruto: f.id, desde: i, fija: f });
  });

  marcas.sort((a, b) => a.desde - b.desde);

  return marcas.map((mar, i) => {
    const hasta = i + 1 < marcas.length ? marcas[i + 1].desde : Math.min(html.length, mar.desde + 60000);
    const oculta = mar.bruto.startsWith('__hidden__');
    return {
      id: oculta ? mar.bruto.slice('__hidden__'.length) : mar.bruto,
      oculta,
      fija: mar.fija,
      html: html.slice(mar.desde, hasta),
    };
  });
}

/* Una sección "vacía" es la que está puesta en el orden pero no imprimió nada:
   el dueño la arrastró y nunca la configuró. En el HTML se ve como un wrapper
   con nada más que espacios adentro. */
function estaVacia(trozo) {
  const dentro = trozo.html.replace(/<div class="home-section-wrapper[^>]*>/, '').replace(/<\/div>\s*$/, '');
  const limpio = dentro.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, '');
  return limpio.length < 40;
}

/**
 * Baja el home de la tienda y lo lee. Nunca tira: si la tienda no contesta,
 * devuelve `disponible: false` y el resto del panel sigue andando.
 */
async function leerHome({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const url = config.storeUrl;
  let html = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': config.tiendanube.userAgent, 'Accept-Language': 'es-AR,es' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    const data = { disponible: false, error: err.message, url, secciones: [], leido: new Date().toISOString() };
    cache = { at: Date.now(), data };
    return data;
  }

  const trozos = trocear(html);
  const secciones = trozos.map((t, i) => ({
    pos: i + 1,
    id: t.id,
    nombre: t.fija ? t.fija.nombre : nombreDe(t.id),
    oculta: t.oculta,
    // Una fija nunca está "vacía": su contenido está escrito en el theme.
    vacia: !t.oculta && !t.fija && estaVacia(t),
    viejo: LAYOUTS_VIEJOS.includes(t.id),
    // `fija: true` = no se puede arrastrar desde el panel de diseño.
    fija: !!t.fija,
    donde: t.fija ? t.fija.donde : null,
    contenido: t.fija ? t.fija.contenido : null,
  }));

  /* Señal de peso: `parseFromString` es la huella del scraping viejo — una
     sección que se baja la ficha HTML COMPLETA de cada producto (~175 KB cada
     una) para sacarle la foto y el precio. No alcanza con buscar el fetch:
     cada snippet arma la URL a su manera. */
  const scrapers = (html.match(/parseFromString/g) || []).length;
  const usaMotor = html.includes('/api/home/rails');

  const data = {
    disponible: true,
    url,
    leido: new Date().toISOString(),
    banners: bannersActuales(html),
    secciones,
    visibles: secciones.filter((s) => !s.oculta).length,
    ocultas: secciones.filter((s) => s.oculta).length,
    vacias: secciones.filter((s) => s.vacia).map((s) => s.id),
    viejas: secciones.filter((s) => s.viejo && !s.oculta).map((s) => s.id),
    peso_kb: Math.round(Buffer.byteLength(html) / 1024),
    scrapers,
    usaMotor,
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Sólo los ids visibles, en orden. Es lo que se compara contra el plan. */
function ordenActual(home) {
  return (home.secciones || []).filter((s) => !s.oculta).map((s) => s.id);
}

/**
 * LOS BANNERS QUE HAY HOY EN EL CARRUSEL, leídos de la tienda en vivo.
 *
 * El panel de diseño de Tiendanube no tiene API, pero el carrusel sale impreso
 * en el HTML: cada slide es un <img class="slider-image"> con su srcset y, si
 * tiene link, envuelto en un <a>. Con eso alcanza para mostrarle al dueño lo
 * que tiene puesto al lado de lo que le conviene poner.
 *
 * Detalle que importa: el theme deja el PRIMER slide con src real y los demás
 * en lazy (src es un gif transparente de 1px y la foto está en data-srcset).
 * Hay que mirar los dos atributos o se ve un solo banner.
 */
function bannersActuales(htmlCompleto) {
  /* Se acota al carrusel PRINCIPAL. Sin esto entraban también los banners de
     categorías y las fotos de marcas, que también son swiper-slide. Y como el
     theme imprime el set de escritorio y el de celular por separado, se corta
     en el contenedor mobile para no listar cada banner dos veces. */
  const desde = htmlCompleto.indexOf('js-home-main-slider');
  if (desde === -1) return [];
  const hastaMobile = htmlCompleto.indexOf('js-home-mobile-slider', desde);
  const finSeccion = htmlCompleto.indexOf('home-section-wrapper', desde + 40);
  const corte = [hastaMobile, finSeccion].filter((n) => n > desde);
  const html = htmlCompleto.slice(desde, corte.length ? Math.min(...corte) : desde + 40000);

  const slides = [];
  const re = /<div class="swiper-slide[^"]*"[\s\S]{0,2600}?<\/div>\s*<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null && slides.length < 12) {
    const trozo = m[0];
    const set = (trozo.match(/(?:data-)?srcset="([^"]+)"/) || [])[1] || '';
    // Del srcset se toma la variante más grande (la última declarada).
    const grande = set.split(',').map((x) => x.trim().split(' ')[0]).filter(Boolean).pop();
    const src = grande || (trozo.match(/(?:data-)?src="(https?:[^"]+)"/) || [])[1];
    if (!src) continue;
    // Tiendanube sirve las fotos con URL sin protocolo (//acdn-us...). En el
    // navegador hereda el de la página, pero desde Node o sobre http se rompe:
    // se fija https, que es lo que sirve el CDN.
    const abs = src.startsWith('//') ? `https:${src}` : src;
    const link = (trozo.match(/<a[^>]+href="([^"]+)"/) || [])[1] || null;
    const texto = /js-swiper-text/.test(trozo);
    if (slides.some((x) => x.imagen === abs)) continue;
    slides.push({ imagen: abs, link, conTexto: texto });
  }
  return slides;
}

function invalidate() { cache = { at: 0, data: null }; }

module.exports = { leerHome, ordenActual, nombreDe, NOMBRES, LAYOUTS_VIEJOS, FIJAS, bannersActuales, invalidate };
