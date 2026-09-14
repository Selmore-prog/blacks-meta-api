/**
 * HISTORIAL DE IMÁGENES DE UNA PIEZA — "volver a la versión anterior".
 *
 * Por qué existe (caso real, 14-sep-2026): el dueño tenía un carrusel con una foto
 * generada que le gustaba, quiso cambiar SÓLO el texto de ese cuadro y la corrección
 * volvió a generar la escena: el texto cambió, pero la foto buena se perdió y no había
 * ninguna forma de recuperarla desde el panel.
 *
 * La recuperación es barata porque cada render sube un archivo con NOMBRE NUEVO a
 * Supabase Storage (`feed-<timestamp>-<rand>.jpg`) y nada se borra nunca: la imagen
 * anterior sigue publicada en su URL. O sea que "volver atrás" no es restaurar un
 * archivo, es volver a apuntar la fila a las URLs de antes. Cuesta $0 y no llama a la IA.
 *
 * Se guarda la RECETA además de las URLs (slides_meta): sin ella, volver atrás dejaba la
 * pieza con la foto vieja y el plan nuevo, y la siguiente corrección partía de un estado
 * que no era el que se ve.
 */

const pool = require('./db');

// Cuántas versiones se conservan por pieza. Son sólo URLs y JSON (bytes), pero no tiene
// sentido acumular sin límite: con 12 pasos atrás alcanza de sobra para una sesión de
// correcciones, y las viejas se borran solas.
const MAX_VERSIONS = 12;

/** Normaliza una columna JSONB que puede venir como texto (según el driver/consulta). */
function asJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

/**
 * Guarda el estado ACTUAL de la pieza antes de pisarlo. Best-effort: si falla, la
 * corrección tiene que seguir igual — perder el historial es molesto, no perder la
 * corrección es peor.
 *
 * @param {number} assetId
 * @param {string} label  qué cambio viene después ("Corrección del cuadro 3")
 * @returns {Promise<number|null>} id de la versión guardada
 */
async function snapshotAsset(assetId, label) {
  try {
    const { rows } = await pool.query(
      `SELECT image_path, slides, slides_meta FROM generated_assets WHERE id = $1`, [assetId]
    );
    const a = rows[0];
    if (!a || !a.image_path) return null; // nada que guardar (pieza sin imagen todavía)

    const { rows: ins } = await pool.query(
      `INSERT INTO asset_versions (asset_id, image_path, slides, slides_meta, label)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [assetId, a.image_path,
        a.slides ? JSON.stringify(asJson(a.slides)) : null,
        a.slides_meta ? JSON.stringify(asJson(a.slides_meta)) : null,
        String(label || 'Cambio en la pieza').slice(0, 120)]
    );

    // Podar las más viejas de esta pieza.
    await pool.query(
      `DELETE FROM asset_versions
        WHERE asset_id = $1
          AND id NOT IN (SELECT id FROM asset_versions WHERE asset_id = $1 ORDER BY id DESC LIMIT $2)`,
      [assetId, MAX_VERSIONS]
    );
    return ins[0].id;
  } catch (err) {
    console.warn(`[versions] No pude guardar la versión anterior del asset ${assetId} (sigo): ${err.message}`);
    return null;
  }
}

/** Versiones guardadas de una pieza, de la más nueva a la más vieja. */
async function listVersions(assetId) {
  const { rows } = await pool.query(
    `SELECT id, image_path, slides, slides_meta, label, created_at
       FROM asset_versions WHERE asset_id = $1 ORDER BY id DESC`, [assetId]
  );
  return rows.map((r) => ({
    id: r.id,
    image_path: r.image_path,
    slides: asJson(r.slides),
    slides_meta: asJson(r.slides_meta),
    label: r.label,
    created_at: r.created_at,
  }));
}

/**
 * Vuelve la pieza a una versión guardada. Antes de pisar, guarda la versión ACTUAL: así
 * "volver atrás" también se puede deshacer (el dueño puede ir y venir comparando).
 *
 * @param {number} assetId
 * @param {number|null} versionId  null = la última guardada (el "deshacer" de un clic)
 */
async function restoreVersion(assetId, versionId = null) {
  const { rows } = await pool.query(
    versionId
      ? `SELECT * FROM asset_versions WHERE asset_id = $1 AND id = $2`
      : `SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY id DESC LIMIT 1`,
    versionId ? [assetId, Number(versionId)] : [assetId]
  );
  const v = rows[0];
  if (!v) throw new Error('Esta pieza no tiene ninguna versión anterior guardada.');

  // La actual pasa a ser una versión más (por eso volver atrás es reversible).
  await snapshotAsset(assetId, 'Estado antes de volver atrás');

  await pool.query(
    `UPDATE generated_assets SET image_path = $2, slides = $3, slides_meta = $4, updated_at = now()
      WHERE id = $1`,
    [assetId, v.image_path,
      v.slides ? JSON.stringify(asJson(v.slides)) : null,
      v.slides_meta ? JSON.stringify(asJson(v.slides_meta)) : null]
  );

  // La versión restaurada se consume: si no, "volver atrás" dos veces devolvía siempre
  // lo mismo (la lista quedaba con la misma entrada arriba de todo).
  await pool.query(`DELETE FROM asset_versions WHERE id = $1`, [v.id]);

  return {
    image_path: v.image_path,
    slides: asJson(v.slides),
    slides_meta: asJson(v.slides_meta),
    label: v.label,
    created_at: v.created_at,
  };
}

module.exports = { snapshotAsset, listVersions, restoreVersion, MAX_VERSIONS };
