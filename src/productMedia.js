const pool = require('./db');
const { tnRequest } = require('./tiendanube');

/**
 * FOTOS DE PRODUCTO · copiar entre publicaciones y asignar la foto de cada variante.
 *
 * Por qué existe (pedido de ago-2026): la tienda tiene productos que comparten las mismas
 * fotos (el mismo pantalón publicado como minorista y como mayorista, packs x2 del mismo
 * artículo, variantes de color que se publican por separado). Subirlas a mano implicaba
 * descargar cada foto y volver a cargarla en la otra publicación, una por una — con
 * productos de 29 fotos eso es media hora de trabajo mecánico.
 *
 * NO hace falta descargar nada: `POST /products/{id}/images` acepta un `src` con la URL
 * de la imagen y Tiendanube la trae de su lado. Copiar 29 fotos son 29 llamadas y ningún
 * byte pasa por acá.
 *
 * Lo segundo que se pidió —"la foto principal de cada variante, la que aparece cuando
 * clickeás el talle"— también se puede: cada variante tiene un `image_id` que apunta a
 * una imagen DEL MISMO producto, y se fija con `PUT /products/{pid}/variants/{vid}`.
 * Mirando datos reales, las variantes se agrupan por COLOR (las cuatro variantes "Beige"
 * comparten la misma imagen), así que la operación útil es asignar por color de una vez,
 * no variante por variante.
 *
 * TODO lo de este módulo ESCRIBE en la tienda en vivo. Hay dos modos y la diferencia
 * importa: `copyImages` AGREGA al final (no toca lo que ya está), mientras que
 * `replaceImages` sustituye — sube las nuevas, re-vincula las variantes y recién ahí
 * borra las viejas. El reemplazo es el que se usa cuando el mismo artículo está
 * publicado dos veces y las fotos tienen que ser las mismas, no la suma de las dos.
 */

/** Búsqueda predictiva sobre el catálogo local (products_cache): instantánea. */
async function searchProducts(q, limite = 12) {
  const texto = String(q || '').trim();
  if (texto.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT id, name, price, image_url, published,
            COALESCE(jsonb_array_length(images), 0) AS fotos
       FROM products_cache
      WHERE unaccent_lower(name) LIKE unaccent_lower($1)
      ORDER BY published DESC NULLS LAST, sales_30d DESC NULLS LAST
      LIMIT $2`,
    [`%${texto}%`, limite]
  ).catch(async () => pool.query(
    // Sin la función unaccent_lower (no está instalada la extensión), se cae a un LIKE
    // simple sobre el nombre en minúsculas: alcanza para un buscador predictivo.
    `SELECT id, name, price, image_url, published,
            COALESCE(jsonb_array_length(images), 0) AS fotos
       FROM products_cache
      WHERE lower(name) LIKE lower($1)
      ORDER BY published DESC NULLS LAST, sales_30d DESC NULLS LAST
      LIMIT $2`,
    [`%${texto}%`, limite]
  ));
  return rows;
}

/** Fotos REALES del producto, en vivo desde Tiendanube (no del cache). */
async function getImages(productId) {
  const imgs = await tnRequest('GET', `/products/${productId}/images`);
  return (imgs || [])
    .map((i) => ({ id: i.id, src: i.src, position: i.position, width: i.width, height: i.height }))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Variantes agrupadas por COLOR, con qué foto tiene asignada cada grupo.
 * El color es el primer valor de la variante que no es la marca ni un talle numérico
 * — Tiendanube guarda los valores como una lista sin etiquetar, así que se deduce.
 */
async function getVariantGroups(productId) {
  const p = await tnRequest('GET', `/products/${productId}`);
  const variants = (p && p.variants) || [];
  const grupos = new Map();
  for (const v of variants) {
    const vals = (v.values || []).map((x) => (typeof x === 'string' ? x : x.es || Object.values(x)[0] || ''));
    // Talles (números o S/M/L/XL) y marcas conocidas no son el color.
    const color = vals.find((s) => s && !/^\d+$/.test(s) && !/^(x{0,3}[sml]|xx?l|t?\d{1,2})$/i.test(s)
      && !/^(pampero|ombu|omb[uú]|grafa\s*70|gurre|rueda)$/i.test(s)) || '(sin color)';
    const g = grupos.get(color) || { color, variantes: [], imageIds: new Set() };
    g.variantes.push({ id: v.id, talle: vals.join(' / '), image_id: v.image_id || null });
    if (v.image_id) g.imageIds.add(v.image_id);
    grupos.set(color, g);
  }
  return [...grupos.values()].map((g) => ({
    color: g.color,
    cantidad: g.variantes.length,
    variantes: g.variantes,
    // Si el grupo tiene más de una imagen asignada, está inconsistente: son variantes del
    // mismo color que muestran fotos distintas al clickearlas.
    imageIds: [...g.imageIds],
    consistente: g.imageIds.size <= 1,
  }));
}

/** Pausa entre escrituras. Ver `subirFoto`. */
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sube UNA foto al producto destino, con pausa y reintento.
 *
 * Sin esto se perdían fotos en silencio: al copiar 16 de una, las TRES ÚLTIMAS fallaron
 * (la API de Tiendanube limita la tasa de escritura). Reintentadas de a una, entraron sin
 * problema. La pausa de 350 ms entre subidas hace que el caso normal no falle, y el
 * reintento con espera creciente cubre el resto.
 */
async function subirFoto(destino, src, { intentos = 3 } = {}) {
  let ultimo = null;
  for (let i = 1; i <= intentos; i += 1) {
    try {
      return await tnRequest('POST', `/products/${destino}/images`, { src });
    } catch (err) {
      ultimo = err;
      if (i < intentos) await dormir(900 * i);
    }
  }
  throw ultimo;
}

/** El color de una variante: su primer valor que no es marca ni talle. */
function colorDeVariante(v) {
  const vals = (v.values || []).map((x) => (typeof x === 'string' ? x : x.es || Object.values(x)[0] || ''));
  return vals.find((t) => t && !/^\d+$/.test(t) && !/^(x{0,3}[sml]|xx?l|t?\d{1,2})$/i.test(t)
    && !/^(pampero|ombu|omb[uú]|grafa\s*70|gurre|rueda)$/i.test(t)) || '(sin color)';
}

/**
 * REEMPLAZA las fotos del destino por las del origen.
 *
 * Es lo que se necesita cuando el mismo artículo está publicado dos veces (minorista y
 * mayorista, o un pack x2): las fotos no se suman, se sustituyen. Agregar dejaba el
 * destino con las viejas Y las nuevas mezcladas.
 *
 * El orden importa y no es negociable:
 *   1. Primero SE SUBEN todas las nuevas. Si alguna falla, se aborta sin borrar nada —
 *      el producto queda con fotos de más, que es recuperable; nunca sin fotos.
 *   2. Se re-vinculan las variantes. Borrar una imagen que una variante usa la deja sin
 *      foto: en este mismo caso, 18 de 24 variantes apuntaban a fotos viejas. Como el
 *      archivo nuevo conserva el nombre del original en su URL, se puede saber qué foto
 *      nueva corresponde a cuál del origen, y de ahí a qué color.
 *   3. Recién entonces se borran las viejas.
 */
async function replaceImages({ fromId, toId, imageIds = null }) {
  if (!fromId || !toId) throw new Error('Faltan el producto de origen y el de destino.');
  if (String(fromId) === String(toId)) throw new Error('El origen y el destino son el mismo producto.');

  const [origenImgs, origenProd, destinoImgsAntes, destinoProd] = await Promise.all([
    getImages(fromId),
    tnRequest('GET', `/products/${fromId}`),
    getImages(toId),
    tnRequest('GET', `/products/${toId}`),
  ]);

  const elegidas = imageIds && imageIds.length
    ? origenImgs.filter((i) => imageIds.map(String).includes(String(i.id)))
    : origenImgs;
  if (!elegidas.length) throw new Error('No hay fotos para copiar en el producto de origen.');

  // 1) Subir todas las nuevas, guardando de cuál del origen viene cada una.
  const mapa = new Map(); // id de imagen del ORIGEN -> id de la imagen NUEVA en el destino
  const errores = [];
  for (const img of elegidas) {
    try {
      const nueva = await subirFoto(toId, img.src);
      mapa.set(String(img.id), nueva.id);
      await dormir(350);
    } catch (err) {
      errores.push(`foto ${img.position || img.id}: ${err.message.slice(0, 120)}`);
    }
  }
  if (errores.length) {
    return {
      abortado: true,
      copiadas: mapa.size,
      errores,
      mensaje: `Se subieron ${mapa.size} de ${elegidas.length} fotos y ${errores.length} fallaron. NO se borró ninguna foto vieja: el producto quedó con las dos tandas. Reintentá para completar, o borrá las nuevas desde Tiendanube.`,
    };
  }

  // 2) Re-vincular las variantes del destino a las fotos nuevas, por color.
  const colorAImagenOrigen = new Map();
  for (const v of origenProd.variants || []) {
    if (v.image_id && !colorAImagenOrigen.has(colorDeVariante(v))) {
      colorAImagenOrigen.set(colorDeVariante(v), String(v.image_id));
    }
  }
  const revinculadas = { ok: 0, sinEquivalente: [] };
  for (const v of destinoProd.variants || []) {
    const color = colorDeVariante(v);
    const imgOrigen = colorAImagenOrigen.get(color);
    const nueva = imgOrigen ? mapa.get(imgOrigen) : null;
    if (!nueva) {
      if (!revinculadas.sinEquivalente.includes(color)) revinculadas.sinEquivalente.push(color);
      continue;
    }
    try {
      await tnRequest('PUT', `/products/${toId}/variants/${v.id}`, { image_id: nueva });
      revinculadas.ok += 1;
      await dormir(200);
    } catch (err) {
      errores.push(`variante ${v.id}: ${err.message.slice(0, 100)}`);
    }
  }

  // 3) Ahora sí, borrar las fotos que ya estaban.
  const borradas = [];
  for (const vieja of destinoImgsAntes) {
    try {
      await tnRequest('DELETE', `/products/${toId}/images/${vieja.id}`);
      borradas.push(vieja.id);
      await dormir(200);
    } catch (err) {
      errores.push(`no pude borrar la foto vieja ${vieja.id}: ${err.message.slice(0, 90)}`);
    }
  }

  console.log(`[productMedia] Reemplazo en #${toId}: ${mapa.size} fotos nuevas, ${borradas.length} viejas borradas, ${revinculadas.ok} variantes re-vinculadas.`);
  return {
    abortado: false,
    copiadas: mapa.size,
    borradas: borradas.length,
    variantes_revinculadas: revinculadas.ok,
    colores_sin_equivalente: revinculadas.sinEquivalente,
    errores,
  };
}

/**
 * Copia fotos de un producto a otro(s). `imageIds` vacío = todas.
 * Nunca borra ni reordena lo que ya está en el destino: agrega al final.
 * Devuelve el detalle por destino para poder mostrar qué entró y qué no.
 */
async function copyImages({ fromId, toIds = [], imageIds = null }) {
  if (!fromId) throw new Error('Falta el producto de origen.');
  const destinos = (Array.isArray(toIds) ? toIds : [toIds]).map(String).filter((id) => id && id !== String(fromId));
  if (!destinos.length) throw new Error('Elegí al menos un producto de destino (distinto del origen).');

  const todas = await getImages(fromId);
  const elegidas = imageIds && imageIds.length
    ? todas.filter((i) => imageIds.map(String).includes(String(i.id)))
    : todas;
  if (!elegidas.length) throw new Error('No hay fotos para copiar en el producto de origen.');

  const resultado = [];
  for (const destino of destinos) {
    const detalle = { producto_id: destino, copiadas: 0, errores: [] };
    for (const img of elegidas) {
      try {
        // `src` = la URL de la foto original. Tiendanube la descarga de su lado; no se
        // sube ningún byte desde acá, por eso copiar 29 fotos es rápido y barato.
        await subirFoto(destino, img.src);
        detalle.copiadas += 1;
        await dormir(350);
      } catch (err) {
        detalle.errores.push(`foto ${img.position || img.id}: ${err.message.slice(0, 120)}`);
      }
    }
    resultado.push(detalle);
    console.log(`[productMedia] ${detalle.copiadas}/${elegidas.length} fotos copiadas de #${fromId} a #${destino}${detalle.errores.length ? ` (${detalle.errores.length} con error)` : ''}.`);
  }
  return { origen: fromId, fotos_elegidas: elegidas.length, destinos: resultado };
}

/**
 * Asigna la foto principal de las variantes. `asignaciones` = [{ imageId, variantIds }].
 * Es la foto que Tiendanube muestra al clickear ese color/talle en la ficha.
 */
async function setVariantImages({ productId, asignaciones = [] }) {
  if (!productId) throw new Error('Falta el producto.');
  const resultado = { actualizadas: 0, errores: [] };
  for (const a of asignaciones) {
    const imageId = Number(a.imageId);
    if (!imageId) { resultado.errores.push('Asignación sin imagen elegida.'); continue; }
    for (const vid of a.variantIds || []) {
      try {
        await tnRequest('PUT', `/products/${productId}/variants/${vid}`, { image_id: imageId });
        resultado.actualizadas += 1;
      } catch (err) {
        resultado.errores.push(`variante ${vid}: ${err.message.slice(0, 120)}`);
      }
    }
  }
  console.log(`[productMedia] ${resultado.actualizadas} variante(s) con foto asignada en el producto #${productId}.`);
  return resultado;
}

module.exports = { searchProducts, getImages, getVariantGroups, copyImages, replaceImages, setVariantImages };
