/* =========================================================================
 * CADENA DE HISTORIAS (nov-2026)
 *
 * Pedido del dueño, en Black Friday: "una cadena de historias de los productos que
 * están en la categoría Black Friday, como esa historia (foto de la prenda, % OFF,
 * precio tachado), una atrás de la otra, como un carrusel de historias de los
 * descuentos de hoy".
 *
 * Cómo se resuelve:
 *   - UNA tarjeta del calendario con N historias adentro (slides), no N tarjetas: la
 *     tabla content_calendar tiene UNIQUE (fecha, plataforma, tipo) y la siembra del
 *     calendario depende de esa restricción (ON CONFLICT), así que hay una sola
 *     historia por día. La cadena ocupa ese lugar.
 *   - Cada historia es la plantilla del sistema Estudio con la FOTO REAL del catálogo
 *     y los datos reales de la ficha: nombre, % OFF, precio final, precio tachado, dos
 *     características de la descripción. Sin IA = gratis, rápido y sin inventar nada.
 *     Con "IA" se le pide a Gemini la escena con la prenda (cuesta por imagen y, si no
 *     hay crédito o se pasa el tope diario, cae sola a la foto real).
 *   - Portada opcional: el afiche oscuro con el nombre de la cadena, el descuento
 *     máximo y una fila con las prendas.
 *
 * EL LINK DEL PRODUCTO EN CADA HISTORIA: la API de Instagram NO permite poner el
 * sticker de link al publicar una historia (ningún sticker, de hecho). Por eso la
 * cadena por defecto queda "semi": al tocar "Cómo publicarla" el panel lista cada
 * historia con su imagen y su link con UTM listo para copiar. Si se elige "que se
 * publique sola", el motor sube las historias en orden por la API, sin link.
 * ========================================================================= */

const pool = require('./db');
const config = require('./config');
const { productPath } = require('./homeRails');
const { utmLink } = require('./utm');

const MAX_PRODUCTOS = 15;
const ARTES = ['foto', 'ia'];

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query('ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS story_chain JSONB')
      .catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const texto = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const money = (v) => `$${Math.round(Number(v)).toLocaleString('es-AR')}`;

function idList(v, max = MAX_PRODUCTOS) {
  let lista = v;
  if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (_) { lista = null; } }
  return [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max);
}

/** % de descuento real (precio promocional contra el de lista). null si no hay oferta. */
function descuento(p) {
  const precio = num(p.price);
  const promo = num(p.promo_price);
  if (!(precio > 0) || !(promo > 0) || promo >= precio) return null;
  return Math.round((1 - promo / precio) * 100);
}

/** Link absoluto a la ficha en la tienda (el `permalink` del cache es el handle pelado). */
function productUrl(permalink) {
  const ruta = productPath(permalink);
  return ruta ? `https://${config.brand.site}${ruta}` : null;
}

const COLUMNAS = `id, name, brand, price, promo_price, stock, image_url, images, description, sales_30d,
  COALESCE(published, true) AS published,
  COALESCE(permalink, raw->'handle'->>'es', raw->>'canonical_url') AS permalink`;

function aTarjeta(r) {
  return {
    id: Number(r.id),
    name: r.name,
    brand: r.brand || null,
    image_url: r.image_url || null,
    price: num(r.price),
    promo_price: num(r.promo_price),
    off: descuento(r),
    stock: r.stock === null ? null : Number(r.stock),
    sales_30d: Number(r.sales_30d) || 0,
    url: productUrl(r.permalink),
    fotos: fotosDe(r).slice(0, 12),
    publicable: Boolean(r.image_url) && (r.stock === null || Number(r.stock) > 0) && r.published !== false && num(r.price) > 0,
  };
}

/**
 * Categorías para el desplegable, sacadas del cache local (cada producto guarda TODAS
 * sus categorías en `raw`). No depende de la API de Tiendanube: si el token vence, el
 * desplegable sigue andando. Primero las que tienen más productos EN OFERTA, que es lo
 * que se busca para una cadena de descuentos.
 */
async function categorias() {
  const { rows } = await pool.query(`
    SELECT (c->>'id')::bigint AS id,
           max(COALESCE(c->'name'->>'es', c->>'name')) AS nombre,
           count(*) FILTER (WHERE p.image_url IS NOT NULL AND COALESCE(p.stock, 1) > 0
                              AND COALESCE(p.published, true) AND p.price > 0)::int AS productos,
           count(*) FILTER (WHERE p.promo_price > 0 AND p.promo_price < p.price
                              AND p.image_url IS NOT NULL AND COALESCE(p.stock, 1) > 0
                              AND COALESCE(p.published, true))::int AS en_oferta
      FROM products_cache p, jsonb_array_elements(COALESCE(p.raw->'categories', '[]'::jsonb)) c
     GROUP BY 1
    HAVING count(*) FILTER (WHERE p.image_url IS NOT NULL AND COALESCE(p.stock, 1) > 0 AND p.price > 0) > 0
     ORDER BY en_oferta DESC, productos DESC
     LIMIT 120`);
  const lista = rows.map((r) => ({ id: Number(r.id), nombre: r.nombre, productos: r.productos, en_oferta: r.en_oferta }));
  // La sugerida: una categoría de fecha comercial con ofertas (Black Friday, Cyber, Hot
  // Sale, liquidación) y, entre ésas, la MÁS NUEVA (el id de Tiendanube crece): el 27-nov
  // la de "CYBER" de principios de mes seguía con 16 en oferta y le ganaba a la de Black
  // Friday. Si no hay ninguna, que el dueño elija.
  const fecha = lista
    .filter((c) => c.en_oferta > 0 && /black|cyber|hot\s*sale|liquid|oferta|promo|sale|descuento/i.test(c.nombre || ''))
    .sort((a, b) => b.id - a.id)[0];
  return { categorias: lista, sugerida: fecha ? fecha.id : null };
}

/** Productos de una categoría listos para la cadena: más vendidos primero. */
async function productosDeCategoria(categoriaId) {
  const id = Number(categoriaId);
  if (!Number.isInteger(id) || id <= 0) return [];
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM products_cache
      WHERE raw->'categories' @> $1::jsonb
      ORDER BY COALESCE(sales_30d, 0) DESC, (promo_price IS NOT NULL) DESC, name`,
    [JSON.stringify([{ id }])]
  );
  return rows.map(aTarjeta);
}

/** Productos por id, EN EL ORDEN pedido (el orden es el de la cadena). */
async function productosPorId(ids) {
  const lista = idList(ids);
  if (!lista.length) return [];
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM products_cache WHERE id = ANY($1::bigint[])`, [lista]);
  const porId = new Map(rows.map((r) => [Number(r.id), r]));
  return lista.map((id) => porId.get(id)).filter(Boolean);
}

/** Configuración guardada en el slot, siempre con todos los campos. */
function normalizarConfig(raw = {}) {
  let c = raw;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = {}; } }
  c = c && typeof c === 'object' ? c : {};
  const nombre = texto(c.nombre, 40) || 'Ofertas de hoy';
  return {
    nombre,
    volanta: texto(c.volanta, 32) || nombre.toUpperCase(),
    // 'descuento' = el % OFF de cada producto como titular; 'texto' = el mismo para todas.
    titulo_modo: c.titulo_modo === 'texto' ? 'texto' : 'descuento',
    titulo: texto(c.titulo, 34),
    cta: texto(c.cta, 30) || 'Comprá en la web',
    arte: ARTES.includes(c.arte) ? c.arte : 'foto',
    portada: c.portada !== false,
    categoria_id: Number(c.categoria_id) > 0 ? Number(c.categoria_id) : null,
    // Correcciones a mano por historia: { <product_id> | 'portada': { composicion, foto, titulo, arte } }.
    ajustes: Object.fromEntries(Object.entries(c.ajustes && typeof c.ajustes === 'object' ? c.ajustes : {})
      .map(([k, v]) => [k, normalizarAjustes(v)]).filter(([, v]) => Object.keys(v).length)),
  };
}

/* Dos características de la ficha. Se piden más y se descartan las que arrancan con un
   conector: del par "Costuras reforzadas: En cuello y hombros…" el extractor rescata el
   valor, y en la historia de la remera quedaba impreso "En cuello y hombros para mayor
   resistencia", que suelto no se entiende. */
function datosDe(extractSpecTags, fila) {
  return extractSpecTags(fila.description, 5, { productName: fila.name })
    .filter((d) => !/^(en|para|con|de|del|a|al|y|que|por)\s/i.test(String(d).trim()))
    .slice(0, 2);
}

function titularDe(cfg, p) {
  const off = descuento(p);
  if (cfg.titulo_modo === 'descuento' && off) return `${off}% OFF`;
  return cfg.titulo || (off ? `${off}% OFF` : cfg.volanta);
}

/**
 * Crea (o reemplaza) el slot de historia del día con la cadena. No genera: devuelve el
 * slot y el server dispara la generación en segundo plano, como cualquier pieza.
 * Si el día ya tiene historia y no se pidió reemplazarla, devuelve { conflicto }.
 */
async function crearSlot(body = {}) {
  await ensureSchema();
  const fecha = texto(body.fecha, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw Object.assign(new Error('Fecha inválida.'), { status: 400 });
  const hora = texto(body.hora, 5) || null;
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw Object.assign(new Error('Hora inválida (HH:MM).'), { status: 400 });
  const ids = idList(body.productos);
  if (!ids.length) throw Object.assign(new Error('Elegí al menos un producto.'), { status: 400 });
  const cfg = normalizarConfig(body);
  const automatico = body.publicacion === 'auto';
  const slotId = Number(body.slot_id) > 0 ? Number(body.slot_id) : null;

  // ¿El día ya tiene historia? (una sola por día: ver la cabecera)
  const { rows: existentes } = await pool.query(
    `SELECT c.id, c.theme_title, c.pillar_detail, c.status, c.story_chain,
            EXISTS (SELECT 1 FROM generated_assets a WHERE a.calendar_id = c.id AND a.status <> 'discarded') AS tiene_pieza
       FROM content_calendar c
      WHERE c.scheduled_date = $1 AND c.platform = 'instagram' AND c.post_type = 'story'`,
    [fecha]
  );
  const existente = existentes[0] || null;
  if (existente && existente.status === 'published' && Number(existente.id) !== slotId) {
    throw Object.assign(new Error('Ese día ya tiene una historia PUBLICADA. Elegí otro día para la cadena.'), { status: 409 });
  }
  if (existente && Number(existente.id) !== slotId && !body.reemplazar) {
    return {
      conflicto: {
        id: existente.id,
        tema: existente.theme_title || existente.pillar_detail || 'historia del día',
        tiene_pieza: existente.tiene_pieza,
        es_cadena: Boolean(existente.story_chain),
      },
    };
  }

  const titulo = `Cadena · ${cfg.nombre}`;
  const detalle = `Cadena de historias: ${cfg.nombre} · ${ids.length} producto${ids.length === 1 ? '' : 's'}${cfg.portada && ids.length > 1 ? ' + portada' : ''}`;
  const hint = automatico ? null : 'LINK: a cada historia ponele el sticker de link con el link de su producto (en "Cómo publicarla" están listos para copiar).';
  const valores = [fecha, hora, titulo, detalle, automatico ? 'auto' : 'semi', hint, ids[0], JSON.stringify(ids), JSON.stringify(cfg)];

  /* origin 'manual' y no uno propio: la siembra diaria del calendario (src/calendar.js)
     sólo respeta los slots 'manual'. Con otro origen, una cadena todavía SIN pieza (se
     está generando o falló) podía ser pisada por la rotación o borrada por el plan del
     mes. Lo que la identifica como cadena es la columna story_chain. */
  // Editar la misma cadena, o reemplazar la historia que ya había ese día.
  const destino = slotId || (existente ? Number(existente.id) : null);
  if (destino) {
    // Las correcciones a mano de cada historia se conservan al editar la cadena (las de
    // los productos que siguen en la lista, y la de la portada).
    const { rows: previa } = await pool.query('SELECT story_chain FROM content_calendar WHERE id = $1', [destino]);
    const antes = previa[0] && previa[0].story_chain ? normalizarConfig(previa[0].story_chain).ajustes : {};
    cfg.ajustes = Object.fromEntries(Object.entries(antes).filter(([k]) => k === 'portada' || ids.includes(Number(k))));
    valores[8] = JSON.stringify(cfg);
    const { rows } = await pool.query(
      `UPDATE content_calendar
          SET scheduled_date = $2, scheduled_time = $3, theme_title = $4, pillar_detail = $5,
              automation_level = $6, interaction_hint = $7, forced_product_id = $8, forced_product_ids = $9::jsonb,
              story_chain = $10::jsonb, post_type = 'story', format = 'story', pillar = 'promo', objective = 'venta',
              carousel = true, origin = 'manual', visual_brief = NULL, art_mode = NULL, carousel_style = NULL,
              status = CASE WHEN status = 'published' THEN status ELSE 'pending' END
        WHERE id = $1
        RETURNING *`,
      [destino, ...valores]
    );
    if (!rows[0]) throw Object.assign(new Error('No existe ese slot.'), { status: 404 });
    return { slot: rows[0] };
  }

  const { rows } = await pool.query(
    `INSERT INTO content_calendar
       (scheduled_date, platform, post_type, format, pillar, objective, scheduled_time, theme_title, pillar_detail,
        automation_level, interaction_hint, forced_product_id, forced_product_ids, story_chain, carousel, status, origin)
     VALUES ($1, 'instagram', 'story', 'story', 'promo', 'venta', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, true, 'pending', 'manual')
     RETURNING *`,
    valores
  );
  return { slot: rows[0] };
}

/** Las fotos del producto (la principal primero), como URLs. */
function fotosDe(fila) {
  const extra = (Array.isArray(fila.images) ? fila.images : [])
    .map((x) => (typeof x === 'string' ? x : x && (x.src || x.url)))
    .filter(Boolean);
  return [...new Set([fila.image_url, ...extra].filter(Boolean))];
}

const COMPOSICIONES = ['estudio_abajo', 'estudio_arriba', 'estudio_lado', 'estudio_escena'];

/** Ajustes a mano de UNA historia ("Corregir esta historia"), saneados. */
function normalizarAjustes(raw = {}) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (COMPOSICIONES.includes(a.composicion)) out.composicion = a.composicion;
  if (typeof a.foto === 'string' && /^https:\/\//.test(a.foto)) out.foto = a.foto.slice(0, 600);
  const titulo = texto(a.titulo, 34);
  if (titulo) out.titulo = titulo;
  if (ARTES.includes(a.arte)) out.arte = a.arte;
  return out;
}

const linkDe = (slotId, url) => (url ? utmLink(url, { calendarId: slotId, pillar: 'cadena' }) : null);

/** Renderiza la PORTADA: afiche oscuro con el nombre de la cadena y las prendas en fila. */
async function renderPortada(slot, cfg, usables, sello, ajustes = {}) {
  const { renderPostBuffer } = require('./imageRenderer');
  const offs = usables.map((x) => x.card.off).filter(Boolean);
  const maxOff = offs.length ? Math.max(...offs) : null;
  const r = await renderPostBuffer({
    format: 'story',
    template: 'estudio_titular',
    overlayTitle: ajustes.titulo || cfg.nombre,
    badgeText: maxOff ? `Hasta ${maxOff}% OFF` : 'Hoy',
    deck: `${usables.length} productos${maxOff ? ' con descuento' : ''}. Pasá para ver cada precio.`,
    hasProduct: false,
    ctaLabel: 'Deslizá',
    productImageUrls: usables.map((x) => x.card.image_url).filter(Boolean).slice(0, 4),
    pillar: 'promo',
    layoutSeed: Number(slot.id),
    filename: `cadena-${slot.id}-${sello}-00.jpg`,
  });
  const shot = { kind: 'portada', name: `Portada · ${cfg.nombre}`, link: linkDe(slot.id, `https://${config.brand.site}`) };
  if (Object.keys(ajustes).length) shot.ajustes = ajustes;
  return { url: r.url, costo: r.costUsd || 0, shot };
}

/** Renderiza la historia de UN producto, con los ajustes a mano si los tiene. */
async function renderHistoria(slot, cfg, { fila, card }, n, sello, ajustes = {}) {
  const { renderPostBuffer, extractSpecTags } = require('./imageRenderer');
  const studio = require('./templatesStudio');
  const fotos = fotosDe(fila);
  // Sólo una foto DEL producto: la URL viene del panel y la abre el navegador del render.
  const principal = ajustes.foto && fotos.includes(ajustes.foto) ? ajustes.foto : card.image_url;
  const arte = ajustes.arte || cfg.arte;
  const r = await renderPostBuffer({
    format: 'story',
    // Foto arriba y texto abajo (como la historia que se tomó de modelo). Si la foto
    // pide otra composición (prenda ancha, escena), el sistema Estudio la corrige solo,
    // salvo que el dueño la haya fijado a mano.
    template: ajustes.composicion || 'estudio_abajo',
    composicionFija: Boolean(ajustes.composicion),
    overlayTitle: ajustes.titulo || titularDe(cfg, fila),
    displayTitle: studio.nombreCorto(fila.name),
    productName: fila.name,
    hasProduct: true,
    badgeText: cfg.volanta,
    price: card.price,
    promoPrice: card.off ? card.promo_price : null,
    specs: datosDe(extractSpecTags, fila),
    ctaLabel: cfg.cta,
    productImageUrl: principal,
    productImageUrls: fotos.filter((u) => u !== principal).slice(0, 3),
    useAiProductScene: arte === 'ia',
    bgTheme: fila.name,
    pillar: 'promo',
    layoutSeed: Number(slot.id) + n,
    filename: `cadena-${slot.id}-${sello}-${String(n).padStart(2, '0')}.jpg`,
  });
  const shot = {
    kind: 'producto',
    product_id: card.id,
    name: fila.name,
    price: card.price,
    promo_price: card.off ? card.promo_price : null,
    off: card.off,
    url: card.url,
    link: linkDe(slot.id, card.url),
    comp: r.studioComp || null,
  };
  if (Object.keys(ajustes).length) shot.ajustes = ajustes;
  return { url: r.url, costo: r.costUsd || 0, shot };
}

async function productosUsables(slot) {
  const filas = await productosPorId(slot.forced_product_ids);
  const productos = filas.map((r) => ({ fila: r, card: aTarjeta(r) }));
  return {
    usables: productos.filter((x) => x.card.publicable),
    fuera: productos.filter((x) => !x.card.publicable).map((x) => x.card.name),
  };
}

/**
 * Genera las historias de un slot de cadena y guarda la pieza (una imagen por historia
 * en `slides`, con el producto y su link en `slides_meta`). La llama generateForSlot,
 * así que la usan igual el botón "Rehacer", la generación diaria y la creación.
 * Los ajustes a mano de cada historia (cfg.ajustes) se respetan al rehacer la cadena.
 */
async function generarParaSlot(slot, overrides = {}) {
  const studio = require('./templatesStudio');
  const cfg = normalizarConfig(slot.story_chain);
  if (overrides.artMode === 'generativa') cfg.arte = 'ia';
  else if (overrides.artMode === 'foto' || overrides.artMode === 'tipografica') cfg.arte = 'foto';

  const { usables, fuera } = await productosUsables(slot);
  if (!usables.length) {
    throw new Error('Ninguno de los productos de la cadena tiene stock, foto y precio. Sincronizá el catálogo o elegí otros.');
  }
  if (fuera.length) console.warn(`[cadena] Slot #${slot.id}: fuera por sin stock/foto/precio: ${fuera.join(', ')}`);

  const slides = [];
  const shots = [];
  let costo = 0;
  const sello = Date.now();
  if (cfg.portada && usables.length > 1) {
    const r = await renderPortada(slot, cfg, usables, sello, cfg.ajustes.portada);
    slides.push(r.url); shots.push(r.shot); costo += r.costo;
  }
  // Una a la vez a propósito: Render tiene 512 MB y cada historia abre una página de
  // Chromium (el semáforo del renderer igual limita a 2, pero no hay apuro).
  for (let i = 0; i < usables.length; i += 1) {
    const r = await renderHistoria(slot, cfg, usables[i], i + 1, sello, cfg.ajustes[usables[i].card.id]);
    slides.push(r.url); shots.push(r.shot); costo += r.costo;
  }

  const lineas = usables.map(({ card }) => `• ${studio.nombreCorto(card.name)}: ${money(card.off ? card.promo_price : card.price)}${card.off ? ` (antes ${money(card.price)}, ${card.off}% OFF)` : ''}`);
  const caption = `${cfg.nombre}: ${usables.length} producto${usables.length === 1 ? '' : 's'}${usables.some((x) => x.card.off) ? ' con descuento' : ''}.\n${lineas.join('\n')}`;

  await pool.query(
    `INSERT INTO generated_assets (calendar_id, product_id, caption, hashtags, cta, image_path, video_path, format, slides, status, template, est_cost_usd, gen_model, slides_meta)
     VALUES ($1, $2, $3, NULL, $4, $5, NULL, 'story', $6::jsonb, 'draft', 'cadena', $7, 'cadena', $8::jsonb)`,
    [slot.id, usables[0].card.id, caption, cfg.cta, slides[0], JSON.stringify(slides), costo,
      JSON.stringify({ mode: 'cadena', shots, fuera })]
  );
  const { cancelQueuedForCalendar } = require('./publishService');
  await cancelQueuedForCalendar(slot.id).catch(() => {});
  await pool.query(`UPDATE content_calendar SET status = 'draft' WHERE id = $1 AND status <> 'published'`, [slot.id]);
  console.log(`[cadena] Slot #${slot.id} (${cfg.nombre}): ${slides.length} historias${costo > 0 ? ` · IA US$${costo.toFixed(2)}` : ''}${fuera.length ? ` · ${fuera.length} fuera por stock/foto` : ''}`);
  return { slides: slides.length, costo, fuera };
}

/**
 * "CORREGIR ESTA HISTORIA": rehace UNA historia de la cadena con lo que eligió el dueño
 * (composición, otra foto del producto, otro titular, escena con IA) sin tocar las demás.
 * Guarda la versión anterior (Volver atrás) y anota el ajuste en la cadena para que
 * "Rehacer cadena" no lo pierda.
 */
async function corregirHistoria({ assetId, index, ajustes: crudos }) {
  const { rows } = await pool.query(
    `SELECT a.*, c.story_chain, c.forced_product_ids
       FROM generated_assets a JOIN content_calendar c ON c.id = a.calendar_id
      WHERE a.id = $1`, [assetId]
  );
  const asset = rows[0];
  if (!asset) throw Object.assign(new Error('No existe esa pieza.'), { status: 404 });
  const receta = recetaDe(asset);
  const slides = Array.isArray(asset.slides) ? [...asset.slides] : [];
  if (!receta || !asset.story_chain) throw Object.assign(new Error('Esta pieza no es una cadena de historias.'), { status: 400 });
  if (asset.status === 'published') throw Object.assign(new Error('La cadena ya está publicada: no se puede corregir.'), { status: 409 });
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= slides.length) throw Object.assign(new Error('Historia inválida.'), { status: 400 });

  const slot = { id: asset.calendar_id, forced_product_ids: asset.forced_product_ids, story_chain: asset.story_chain };
  const cfg = normalizarConfig(asset.story_chain);
  const shot = receta.shots[i] || {};
  const ajustes = normalizarAjustes(crudos);
  const sello = Date.now();
  const { usables } = await productosUsables(slot);
  let r;
  let clave;
  if (shot.kind === 'portada') {
    clave = 'portada';
    r = await renderPortada(slot, cfg, usables, sello, ajustes.titulo ? { titulo: ajustes.titulo } : {});
  } else {
    clave = String(shot.product_id);
    const prod = usables.find((x) => x.card.id === Number(shot.product_id))
      || (await productosPorId([shot.product_id])).map((f) => ({ fila: f, card: aTarjeta(f) }))[0];
    if (!prod) throw Object.assign(new Error('El producto de esa historia ya no está en el catálogo.'), { status: 409 });
    r = await renderHistoria(slot, cfg, prod, i, sello, ajustes);
  }

  await require('./assetVersions').snapshotAsset(asset.id, `Historia ${i + 1}: antes de corregirla`);
  slides[i] = r.url;
  const shots = [...receta.shots];
  shots[i] = r.shot;
  const meta = { ...receta, shots };
  await pool.query(
    `UPDATE generated_assets SET slides = $2::jsonb, slides_meta = $3::jsonb, image_path = $4,
            est_cost_usd = COALESCE(est_cost_usd, 0) + $5, updated_at = now()
      WHERE id = $1`,
    [asset.id, JSON.stringify(slides), JSON.stringify(meta), slides[0], r.costo]
  );
  // El ajuste queda en la cadena: si después se rehace entera, esta historia sale igual.
  const nuevaCfg = { ...cfg, ajustes: { ...cfg.ajustes } };
  if (Object.keys(r.shot.ajustes || {}).length) nuevaCfg.ajustes[clave] = r.shot.ajustes;
  else delete nuevaCfg.ajustes[clave];
  await pool.query('UPDATE content_calendar SET story_chain = $2::jsonb WHERE id = $1', [asset.calendar_id, JSON.stringify(nuevaCfg)]);
  console.log(`[cadena] Asset #${asset.id}: historia ${i + 1} corregida ${JSON.stringify(ajustes)}${r.costo ? ` · IA US$${r.costo.toFixed(2)}` : ''}`);
  return { slides, slides_meta: meta, image_path: slides[0], costo: r.costo };
}

/**
 * Qué composiciones se pueden elegir a mano con ESTA foto del producto (el panel apaga
 * las demás). Sólo fotos del propio producto: la URL la abre el servidor para medirla.
 */
async function composicionesDeFoto(productId, url) {
  const [fila] = await productosPorId([productId]);
  if (!fila) throw Object.assign(new Error('No existe ese producto.'), { status: 404 });
  const foto = url && fotosDe(fila).includes(url) ? url : fila.image_url;
  const analysis = await require('./photoStage').analyzeUrl(foto);
  const studio = require('./templatesStudio');
  const t = (analysis && analysis.touches) || {};
  const corte = t.top && t.bottom ? 'viene cortada arriba y abajo'
    : t.top ? 'viene cortada arriba' : t.bottom ? 'viene cortada abajo' : null;
  return {
    foto,
    validas: analysis ? studio.composicionesManuales(analysis, 'story') : [],
    automatica: analysis ? studio.composiciones(analysis, 'story')[0] : null,
    corte,
    estudio: Boolean(analysis && analysis.studio),
  };
}

/**
 * Después de "Volver atrás" en una cadena: los ajustes guardados en la cadena pasan a ser
 * los de la versión restaurada, para que "Rehacer cadena" no reviva una corrección
 * que se deshizo.
 */
async function sincronizarAjustes(assetId) {
  const { rows } = await pool.query(
    `SELECT a.slides_meta, a.calendar_id, c.story_chain FROM generated_assets a
       JOIN content_calendar c ON c.id = a.calendar_id WHERE a.id = $1`, [assetId]
  );
  const r = rows[0];
  const receta = r && recetaDe(r);
  if (!receta || !r.story_chain) return;
  const cfg = normalizarConfig(r.story_chain);
  cfg.ajustes = {};
  receta.shots.forEach((sh) => {
    const a = normalizarAjustes(sh.ajustes);
    if (!Object.keys(a).length) return;
    cfg.ajustes[sh.kind === 'portada' ? 'portada' : String(sh.product_id)] = a;
  });
  await pool.query('UPDATE content_calendar SET story_chain = $2::jsonb WHERE id = $1', [r.calendar_id, JSON.stringify(cfg)]);
}

/** La receta guardada de una cadena ({ mode:'cadena', shots }) o null si no es cadena. */
function recetaDe(asset) {
  let m = asset && asset.slides_meta;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = null; } }
  return m && m.mode === 'cadena' && Array.isArray(m.shots) ? m : null;
}

module.exports = {
  ensureSchema, categorias, productosDeCategoria, productosPorId: async (ids) => (await productosPorId(ids)).map(aTarjeta),
  crearSlot, generarParaSlot, corregirHistoria, sincronizarAjustes, composicionesDeFoto, recetaDe, normalizarConfig, productUrl, MAX_PRODUCTOS,
};
