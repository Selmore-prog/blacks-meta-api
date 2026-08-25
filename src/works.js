const pool = require('./db');
const { uploadAsset } = require('./storage');

/**
 * TRABAJOS REALIZADOS · biblioteca de fotos de prendas ya bordadas/estampadas.
 *
 * Por qué existe (pedido de ago-2026): en las fichas MAYORISTAS el visitante no ve
 * precio —tiene que escribir por WhatsApp— y la pregunta que lo frena siempre es la
 * misma: "¿cómo queda mi logo sobre esta prenda?". La respuesta es una foto de un
 * trabajo real sobre esa misma prenda.
 *
 * Por qué acá y no como fotos del producto en Tiendanube:
 *  1. La galería de la ficha mayorista ya es enorme (una ficha real medía 3.608 px
 *     de alto con 16 fotos). Sumarle trabajos la hace más larga, no más clara.
 *  2. Esa galería la reordena por color un JS delicado del theme (`filterGallery`).
 *     Meterle fotos que no son de la prenda es tocar justo eso.
 *  3. La MISMA foto sirve para la chomba, la remera y el buzo del mismo cliente.
 *     Cargada por producto, se sube N veces y se corrige N veces.
 *
 * Modelo: un trabajo = una foto + de quién es + con qué técnica. Se vincula a N
 * productos. Un trabajo SIN ningún producto vinculado es "general": aparece de
 * relleno en cualquier ficha que tenga pocos trabajos propios, así la sección
 * nunca queda vacía ni con una sola foto suelta.
 *
 * Nada de esto escribe en Tiendanube. Las fotos viven en Supabase Storage.
 */

const TECHNIQUES = ['bordado', 'estampado', 'dtf', 'sublimado', 'vinilo'];

/** Cuántas fotos como máximo devuelve la ficha (la tira muestra 3 y el resto va al visor). */
const MAX_PER_PRODUCT = 12;

/* --------------------------------- helpers -------------------------------- */

function cleanText(v, max = 120) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanTechnique(v) {
  const s = String(v || '').trim().toLowerCase();
  return TECHNIQUES.includes(s) ? s : 'bordado';
}

function cleanProductIds(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const raw of v) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 60);
}

/** Extensión segura a partir del mimetype: nunca confiamos en el nombre del archivo. */
function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/avif': 'avif',
  };
  return map[String(mime || '').toLowerCase()] || null;
}

/* ---------------------------------- lectura -------------------------------- */

/** Todos los trabajos con sus productos vinculados. Lo consume el panel. */
async function list() {
  const { rows } = await pool.query(
    `SELECT w.id, w.image_url, w.technique, w.client, w.garment, w.caption,
            w.position, w.active, w.created_at,
            COALESCE(
              json_agg(json_build_object('id', p.product_id, 'name', pc.name)
                       ORDER BY pc.name NULLS LAST)
              FILTER (WHERE p.product_id IS NOT NULL), '[]'
            ) AS products
       FROM works w
       LEFT JOIN work_products p ON p.work_id = w.id
       LEFT JOIN products_cache pc ON pc.id = p.product_id
      GROUP BY w.id
      ORDER BY w.position ASC, w.id DESC`
  );
  return rows;
}

/**
 * Los trabajos que le tocan a una ficha: primero los vinculados a ESE producto,
 * después los generales (sin ningún vínculo) para completar. Si no hay nada,
 * devuelve lista vacía y el theme no dibuja la sección.
 */
async function forProduct(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const { rows } = await pool.query(
    `WITH propios AS (
       SELECT w.*, 0 AS rank
         FROM works w
         JOIN work_products p ON p.work_id = w.id
        WHERE w.active AND p.product_id = $1
     ),
     generales AS (
       SELECT w.*, 1 AS rank
         FROM works w
        WHERE w.active
          AND NOT EXISTS (SELECT 1 FROM work_products p WHERE p.work_id = w.id)
     )
     SELECT id, image_url, technique, client, garment, caption, rank
       FROM (SELECT * FROM propios UNION ALL SELECT * FROM generales) t
      ORDER BY rank ASC, position ASC, id DESC
      LIMIT $2`,
    [id, MAX_PER_PRODUCT]
  );

  return rows.map((r) => ({
    url: r.image_url,
    technique: r.technique,
    client: r.client,
    caption: r.caption || null,
    own: r.rank === 0,
  }));
}

/** Buscador de productos para vincular. Sin filtro de precio: los mayoristas valen 0. */
async function searchProducts(q, limite = 12) {
  const texto = String(q || '').trim();
  if (texto.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT id, name, price, image_url
       FROM products_cache
      WHERE lower(name) LIKE lower($1)
      ORDER BY (price = 0 OR price IS NULL) DESC, name ASC
      LIMIT $2`,
    [`%${texto}%`, limite]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    image: r.image_url,
    // Los mayoristas se publican sin precio: sirve para que el panel los marque.
    mayorista: !Number(r.price),
  }));
}

/* ---------------------------------- escritura ------------------------------ */

/** Sube el archivo a Supabase y crea el trabajo. `file` es el objeto de multer. */
async function create({ file, technique, client, garment, caption, products }) {
  if (!file || !file.buffer) throw new Error('Falta la foto.');
  const ext = extFromMime(file.mimetype);
  if (!ext) throw new Error('La foto tiene que ser JPG, PNG, WEBP o AVIF.');

  const url = await uploadAsset({
    buffer: file.buffer,
    filename: `trabajos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
    contentType: file.mimetype,
  });

  const ids = cleanProductIds(products);
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows } = await cli.query(
      `INSERT INTO works (image_url, technique, client, garment, caption, position)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT max(position) + 1 FROM works), 0))
       RETURNING id`,
      [url, cleanTechnique(technique), cleanText(client), cleanText(garment, 60), cleanText(caption, 160)]
    );
    const workId = rows[0].id;
    await linkProducts(cli, workId, ids);
    await cli.query('COMMIT');
    return { ok: true, id: workId, url };
  } catch (err) {
    await cli.query('ROLLBACK');
    throw err;
  } finally {
    cli.release();
  }
}

/** Cambia los datos de un trabajo. `products` sólo se toca si viene en el body. */
async function update(id, body = {}) {
  const workId = Number(id);
  if (!Number.isFinite(workId)) throw new Error('Trabajo inexistente.');

  const sets = [];
  const vals = [];
  const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

  if (body.technique !== undefined) push('technique', cleanTechnique(body.technique));
  if (body.client !== undefined) push('client', cleanText(body.client));
  if (body.garment !== undefined) push('garment', cleanText(body.garment, 60));
  if (body.caption !== undefined) push('caption', cleanText(body.caption, 160));
  if (body.active !== undefined) push('active', !!body.active);

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    if (sets.length) {
      vals.push(workId);
      await cli.query(`UPDATE works SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    }
    if (body.products !== undefined) {
      await cli.query('DELETE FROM work_products WHERE work_id = $1', [workId]);
      await linkProducts(cli, workId, cleanProductIds(body.products));
    }
    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK');
    throw err;
  } finally {
    cli.release();
  }
  return { ok: true };
}

async function linkProducts(cli, workId, ids) {
  for (const pid of ids) {
    await cli.query(
      `INSERT INTO work_products (work_id, product_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [workId, pid]
    );
  }
}

/**
 * Borra el trabajo. La foto queda en Supabase a propósito: el borrado del Storage
 * no es transaccional y un archivo huérfano de 200 KB es mucho menos grave que
 * una tarjeta apuntando a una foto que ya no existe.
 */
async function remove(id) {
  const workId = Number(id);
  if (!Number.isFinite(workId)) throw new Error('Trabajo inexistente.');
  await pool.query('DELETE FROM works WHERE id = $1', [workId]);
  return { ok: true };
}

/** Reordena: recibe la lista completa de ids de trabajos en el orden nuevo. */
async function reorder(ids) {
  // No reusamos cleanProductIds acá: ese recorta a 60 (tope de vínculos por trabajo)
  // y truncar un reordenamiento dejaría trabajos con la posición vieja.
  const orden = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && !orden.includes(n)) orden.push(n);
  }
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    for (let i = 0; i < orden.length; i++) {
      await cli.query('UPDATE works SET position = $1 WHERE id = $2', [i, orden[i]]);
    }
    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK');
    throw err;
  } finally {
    cli.release();
  }
  return { ok: true };
}

module.exports = { list, forProduct, searchProducts, create, update, remove, reorder, TECHNIQUES };
