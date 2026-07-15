const pool = require('./db');

/**
 * MEMORIA DE ERRORES (aprendizaje del sistema).
 *
 * Por qué existe (pedido real, jul-2026): el pipeline ya corrige errores en el
 * momento (lint de copy, auditoría factual, QA de imágenes), pero cada corrección
 * se PERDÍA al terminar el proceso — el mismo error podía volver a aparecer al día
 * siguiente. Acá cada error detectado (por el sistema o por el usuario en el panel)
 * queda registrado como una LECCIÓN, y las lecciones más frecuentes/recientes se
 * inyectan en los prompts del director creativo y del copywriter para que NO se
 * repitan. El sistema aprende de sus propios fallos.
 *
 * Fuentes de lecciones (columna `source`):
 *  - 'lint'         : el control determinístico rechazó el copy y el reintento tampoco salió limpio
 *  - 'factual'      : la auditoría factual corrigió un dato inventado
 *  - 'image'        : una imagen IA se descartó por texto/logo horneado
 *  - 'render'       : el QA visual post-render encontró la pieza rota (texto cortado, pisado)
 *  - 'user_edit'    : el usuario corrigió el caption a mano en el panel (la lección se deriva del diff)
 *  - 'user_discard' : el usuario descartó una pieza indicando el motivo
 *
 * `scope` = pilar ('producto', 'mayorista'...) o 'global'. Al armar el contexto se
 * traen las globales + las del pilar de la pieza.
 *
 * TODO es best-effort: si la tabla no existe o la DB falla, ninguna función lanza —
 * el aprendizaje nunca puede romper la generación.
 */

const VALID_SOURCES = ['lint', 'factual', 'image', 'render', 'user_edit', 'user_discard'];

// Qué fuentes alimentan cada prompt. Las lecciones de imagen/render no van al copy
// (no puede hacer nada con ellas) y las de lint no van al director (son de redacción).
const SOURCES_FOR_COPY = ['lint', 'factual', 'user_edit', 'user_discard'];
const SOURCES_FOR_DIRECTOR = ['factual', 'render', 'user_edit', 'user_discard'];

function clean(s, max = 300) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Registra (o refuerza) una lección. Si ya existe la misma lección para ese
 * source+scope, incrementa el contador y actualiza la última vez vista — las
 * lecciones que más se repiten pesan más en el contexto.
 */
async function recordLesson({ source, scope = 'global', lesson, detail = null } = {}) {
  const l = clean(lesson);
  if (!l || !VALID_SOURCES.includes(source)) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qa_lessons (source, scope, lesson, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source, scope, lesson)
       DO UPDATE SET times_seen = qa_lessons.times_seen + 1, last_seen_at = now(),
                     detail = COALESCE(EXCLUDED.detail, qa_lessons.detail)
       RETURNING id, times_seen`,
      [source, clean(scope, 40) || 'global', l, clean(detail, 500)]
    );
    const row = rows[0];
    if (row && row.times_seen > 1) {
      console.log(`[learning] Lección reforzada (${source}/${scope}, vista ${row.times_seen} veces): ${l.slice(0, 90)}`);
    }
    return row || null;
  } catch (err) {
    console.warn(`[learning] No pude registrar la lección (sigo): ${err.message}`);
    return null;
  }
}

/** Lecciones activas para un pilar (globales + del pilar), las más repetidas/recientes primero. */
async function topLessons({ pillar = null, sources = null, limit = 8 } = {}) {
  try {
    const params = [limit];
    let where = `active`;
    if (pillar) { params.push(pillar); where += ` AND (scope = 'global' OR scope = $${params.length})`; }
    if (Array.isArray(sources) && sources.length) { params.push(sources); where += ` AND source = ANY($${params.length})`; }
    const { rows } = await pool.query(
      `SELECT id, source, scope, lesson, times_seen
       FROM qa_lessons WHERE ${where}
       ORDER BY times_seen DESC, last_seen_at DESC
       LIMIT $1`,
      params
    );
    return rows;
  } catch (err) {
    return []; // tabla inexistente / DB caída: sin lecciones, la generación sigue igual
  }
}

/**
 * Bloque de prompt con las lecciones aprendidas, listo para inyectar.
 * Devuelve '' si no hay lecciones (no ensucia el prompt).
 */
async function lessonsContext({ pillar = null, audience = 'copy', limit = 8 } = {}) {
  const sources = audience === 'director' ? SOURCES_FOR_DIRECTOR : SOURCES_FOR_COPY;
  const rows = await topLessons({ pillar, sources, limit });
  if (!rows.length) return '';
  const label = {
    lint: 'control de calidad', factual: 'auditoría factual', image: 'QA de imagen',
    render: 'QA visual', user_edit: 'corrección del dueño', user_discard: 'pieza descartada por el dueño',
  };
  return `\n\nLECCIONES APRENDIDAS DE ERRORES ANTERIORES (errores REALES ya cometidos por este sistema y marcados — repetir cualquiera de estos es la peor falla posible):\n${rows
    .map((r) => `- ${r.lesson}${r.times_seen > 1 ? ` (pasó ${r.times_seen} veces)` : ''} [${label[r.source] || r.source}]`)
    .join('\n')}`;
}

/**
 * Deriva una lección GENERAL del diff entre el copy generado y la corrección manual
 * del usuario en el panel. Usa la IA de texto (gratis). Best-effort y pensada para
 * correr en segundo plano: nunca bloquea la respuesta del endpoint.
 */
async function deriveLessonFromEdit({ before, after, pillar = null } = {}) {
  const a = clean(before, 900);
  const b = clean(after, 900);
  if (!a || !b || a === b) return null;
  try {
    const { generateJson } = require('./ai'); // require perezoso: evita ciclo ai.js ↔ learning.js
    const result = await generateJson({
      system: 'Analizás correcciones editoriales y extraés la regla general detrás de cada cambio. Respondés SOLO JSON válido.',
      prompt: `El dueño de una marca corrigió A MANO el caption que generó su sistema de contenido. Compará las dos versiones y extraé la lección GENERAL que el sistema tiene que aprender para no repetir el error (no describas el cambio puntual: formulá la regla reutilizable, en imperativo, máx 25 palabras, en español argentino).

CAPTION GENERADO (rechazado):
"${a}"

CAPTION CORREGIDO POR EL DUEÑO (correcto):
"${b}"

Si el cambio es trivial o cosmético sin regla general (una coma, un typo del dueño), devolvé {"lesson": null}.
Devolvé SOLO: {"lesson": "la regla en imperativo o null", "reason": "en qué se basa (corto)"}`,
      maxTokens: 200,
      temperature: 0.2,
    });
    const lesson = result && result.lesson && String(result.lesson).toLowerCase() !== 'null' ? clean(result.lesson, 200) : null;
    if (!lesson) return null;
    return recordLesson({
      source: 'user_edit',
      scope: pillar || 'global',
      lesson,
      detail: `antes: "${a.slice(0, 200)}" → después: "${b.slice(0, 200)}"`,
    });
  } catch (err) {
    console.warn(`[learning] No pude derivar la lección de la edición (sigo): ${err.message}`);
    return null;
  }
}

/** Lista para el panel (todas, activas o no). */
async function listLessons({ limit = 100 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT id, source, scope, lesson, detail, times_seen, active, created_at, last_seen_at
       FROM qa_lessons ORDER BY active DESC, times_seen DESC, last_seen_at DESC LIMIT $1`,
      [Math.max(1, Math.min(Number(limit) || 100, 500))]
    );
    return rows;
  } catch (_) { return []; }
}

/** Activa/desactiva una lección (si una regla quedó vieja, el usuario la apaga sin borrarla). */
async function setLessonActive(id, active) {
  try {
    const { rowCount } = await pool.query(`UPDATE qa_lessons SET active = $2 WHERE id = $1`, [id, Boolean(active)]);
    return rowCount > 0;
  } catch (_) { return false; }
}

module.exports = { recordLesson, topLessons, lessonsContext, deriveLessonFromEdit, listLessons, setLessonActive };
