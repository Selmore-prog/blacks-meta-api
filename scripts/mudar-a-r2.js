/* =========================================================================
 * MUDANZA DE LOS ARCHIVOS DEL MOTOR: SUPABASE STORAGE → CLOUDFLARE R2
 *
 *   node scripts/mudar-a-r2.js            en seco: cuenta y revisa, no cambia nada
 *   node scripts/mudar-a-r2.js --aplicar  copia a R2 y reescribe la base
 *
 * Por qué: desde oct-2026 lo nuevo se sube a R2 (ver src/storage.js), pero las
 * piezas, reels y referencias viejas siguen apuntando a Supabase, que corta
 * Storage cuando se pasa la cuota de tráfico del mes.
 *
 * Qué hace:
 * 1. Lista los archivos del bucket de Supabase leyendo storage.objects por
 *    Postgres (eso anda aunque Storage esté cortado).
 * 2. Copia a R2, con la misma ruta, los que todavía no están. Los baja de la
 *    dirección pública de Supabase: para este paso Supabase tiene que volver a
 *    contestar. Si se corta a la mitad, se corre de nuevo y sigue.
 * 3. En las tablas del motor cambia cada dirección de Supabase por la de R2,
 *    SÓLO si ese archivo ya está en R2. Las tablas y columnas se buscan solas
 *    (hoy: generated_assets, asset_versions, style_references, studio_assets,
 *    video_jobs y works).
 *
 * No toca: la carpeta home-blocks/ ni app_settings (home_blocks y media_tienda):
 * las fotos del home las muda src/storeMedia.js al Worker. No borra nada de
 * Supabase.
 * ========================================================================= */

const config = require('../src/config');
const { r2PublicUrl, putR2Object, r2ObjectExists, CACHE_UN_ANIO } = require('../src/storage');

const APLICAR = process.argv.includes('--aplicar');
const BUCKET = config.supabase.bucket || 'blacks-assets';
const SALTEAR = /^home-blocks\//;
const TABLAS_FUERA = new Set(['app_settings']);
const URL_SUPABASE = new RegExp(
  `https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/${BUCKET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^\\s"'<>?#\\\\)]+)`,
  'gi',
);

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function claveDeUrl(tramo) {
  try { return decodeURIComponent(tramo); } catch (_) { return tramo; }
}

/** Cambia en un texto las direcciones de Supabase cuyo archivo está en `enR2`. */
function reescribirTexto(texto, enR2) {
  let cambiadas = 0;
  const quedan = [];
  const valor = texto.replace(URL_SUPABASE, (url, tramo) => {
    const clave = claveDeUrl(tramo);
    if (!enR2.has(clave)) { quedan.push(clave); return url; }
    cambiadas++;
    return r2PublicUrl(clave);
  });
  return { valor, cambiadas, quedan };
}

/** Igual, recorriendo un valor JSON (slides, slides_meta) sin tocar su forma. */
function reescribirValor(valor, enR2) {
  const total = { cambiadas: 0, quedan: [] };
  const recorrer = (v) => {
    if (typeof v === 'string') {
      const r = reescribirTexto(v, enR2);
      total.cambiadas += r.cambiadas;
      total.quedan.push(...r.quedan);
      return r.valor;
    }
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x)]));
    return v;
  };
  return { valor: recorrer(valor), ...total };
}

async function enParalelo(items, cuantos, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(cuantos, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function urlEnSupabase(clave) {
  const ruta = clave.split('/').map(encodeURIComponent).join('/');
  return `${String(config.supabase.url).replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

// "max-age=3600" de Supabase → "public, max-age=3600" en R2.
function cacheDe(original) {
  const s = String(original || '').trim();
  if (!s) return CACHE_UN_ANIO;
  return /^public\b/i.test(s) ? s : `public, ${/^\d+$/.test(s) ? `max-age=${s}` : s}`;
}

async function columnasConDirecciones(pool) {
  const { rows } = await pool.query(`
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying', 'json', 'jsonb')
       AND EXISTS (SELECT 1 FROM information_schema.columns i
                    WHERE i.table_schema = 'public' AND i.table_name = c.table_name AND i.column_name = 'id')
     ORDER BY 1, 2`);
  const patron = `%/storage/v1/object/public/${BUCKET}/%`;
  const out = [];
  for (const col of rows) {
    if (TABLAS_FUERA.has(col.table_name)) continue;
    const t = `public."${col.table_name}"`;
    const c = `"${col.column_name}"`;
    const { rows: filas } = await pool.query(`SELECT id, ${c} AS valor, ${c}::text AS crudo FROM ${t} WHERE ${c}::text LIKE $1 ORDER BY id`, [patron]);
    if (filas.length) out.push({ tabla: col.table_name, columna: col.column_name, tipo: col.data_type, filas });
  }
  return out;
}

function planificar(columnas, enR2) {
  return columnas.map((col) => {
    const cambios = [];
    let direcciones = 0;
    const quedan = [];
    for (const fila of col.filas) {
      const esJson = col.tipo === 'json' || col.tipo === 'jsonb';
      const r = esJson ? reescribirValor(fila.valor, enR2) : reescribirTexto(fila.valor, enR2);
      direcciones += r.cambiadas;
      quedan.push(...r.quedan);
      if (r.cambiadas) cambios.push({ id: fila.id, crudo: fila.crudo, nuevo: esJson ? JSON.stringify(r.valor) : r.valor });
    }
    return { ...col, cambios, direcciones, quedan };
  });
}

async function main() {
  const faltan = Object.entries({
    R2_ACCOUNT_ID: config.r2.accountId,
    R2_ACCESS_KEY_ID: config.r2.accessKeyId,
    R2_SECRET_ACCESS_KEY: config.r2.secretAccessKey,
    R2_BUCKET: config.r2.bucket,
    R2_PUBLIC_URL: config.r2.publicUrl,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) {
    console.error(`Faltan variables de R2 en .env: ${faltan.join(', ')}.`);
    process.exit(1);
  }
  const pool = require('../src/db');

  console.log(APLICAR ? '== MUDANZA A R2 (se aplica) ==' : '== MUDANZA A R2 (en seco: no se cambia nada; para hacerlo, --aplicar) ==');
  console.log(`Supabase: bucket ${BUCKET}  →  R2: bucket ${config.r2.bucket} (${config.r2.publicUrl})\n`);

  // 1. Qué hay en Supabase
  const { rows: objetos } = await pool.query(
    `SELECT name, metadata->>'mimetype' AS tipo, COALESCE((metadata->>'size')::bigint, 0) AS bytes,
            metadata->>'cacheControl' AS cache
       FROM storage.objects WHERE bucket_id = $1 ORDER BY name`,
    [BUCKET],
  );
  const delHome = objetos.filter((o) => SALTEAR.test(o.name));
  const candidatos = objetos.filter((o) => !SALTEAR.test(o.name));
  const suma = (xs) => xs.reduce((a, o) => a + Number(o.bytes), 0);
  console.log(`Archivos en Supabase: ${objetos.length} (${mb(suma(objetos))}).`);
  console.log(`  Se saltean ${delHome.length} de home-blocks/ (${mb(suma(delHome))}): esos los muda src/storeMedia.js.`);

  // 2. Cuáles ya están en R2
  const enR2 = new Set();
  try {
    await enParalelo(candidatos, 8, async (o) => { if (await r2ObjectExists(o.name)) enR2.add(o.name); });
  } catch (err) {
    console.error(`\nR2 no contesta bien: ${err.message}.`);
    console.error(err.status === 403 || err.status === 401
      ? 'Revisá R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY (y que el token tenga "Object Read & Write" sobre este bucket).'
      : 'Revisá R2_ACCOUNT_ID y R2_BUCKET.');
    await pool.end();
    process.exit(1);
  }
  const porCopiar = candidatos.filter((o) => !enR2.has(o.name));
  console.log(`  Ya en R2: ${enR2.size}. Por copiar: ${porCopiar.length} (${mb(suma(porCopiar))}).`);

  // ¿Supabase contesta? Con la cuota agotada (402) no se puede copiar. Otro
  // error puede ser de ese archivo solo: se intenta igual y se anota.
  let supabaseCortado = false;
  if (porCopiar.length) {
    try {
      const r = await fetch(urlEnSupabase(porCopiar[0].name), { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      supabaseCortado = r.status === 402;
      console.log(`  Supabase Storage: ${supabaseCortado ? 'CORTADO (responde 402: cuota de tráfico agotada)' : `contesta (${r.status})`}.`);
    } catch (err) {
      supabaseCortado = true;
      console.log(`  Supabase Storage: no contesta (${err.message}).`);
    }
  }

  // 3. Copiar
  const fallidas = [];
  if (APLICAR && porCopiar.length && !supabaseCortado) {
    console.log(`\nCopiando ${porCopiar.length} archivos a R2...`);
    let hechas = 0;
    let cortado = false;
    await enParalelo(porCopiar, 4, async (o) => {
      if (cortado) return;
      try {
        const r = await fetch(urlEnSupabase(o.name), { signal: AbortSignal.timeout(120_000) });
        if (r.status === 402) { cortado = true; throw new Error('Supabase respondió 402 (cuota de tráfico agotada)'); }
        if (!r.ok) throw new Error(`Supabase respondió ${r.status}`);
        const buffer = Buffer.from(await r.arrayBuffer());
        const contentType = o.tipo || (r.headers.get('content-type') || '').split(';')[0] || 'application/octet-stream';
        await putR2Object({ buffer, filename: o.name, contentType, cacheControl: cacheDe(o.cache) });
        enR2.add(o.name);
        if (++hechas % 50 === 0) console.log(`  ${hechas}/${porCopiar.length}`);
      } catch (err) {
        fallidas.push({ name: o.name, error: err.message });
      }
    });
    console.log(`  Copiados: ${hechas}. Con error: ${fallidas.length}.`);
    fallidas.slice(0, 10).forEach((f) => console.log(`    ${f.name}: ${f.error}`));
    if (cortado) console.log('  Supabase se cortó en el medio: lo que falta se copia corriendo esto de nuevo cuando vuelva.');
  } else if (porCopiar.length && supabaseCortado) {
    console.log(APLICAR
      ? '\nNo se puede copiar con Supabase cortado: se cambian en la base sólo las direcciones de lo que ya está en R2.'
      : '  Con Supabase cortado, --aplicar sólo cambiaría las direcciones de lo que ya está en R2.');
  }

  // 4. Direcciones en la base. En seco se cuenta como si la copia saliera bien
  //    (salvo con Supabase cortado: ahí sólo lo que ya está en R2).
  const destino = APLICAR || supabaseCortado ? enR2 : new Set([...enR2, ...porCopiar.map((o) => o.name)]);
  const columnas = planificar(await columnasConDirecciones(pool), destino);
  const existentes = new Set(objetos.map((o) => o.name));
  console.log(`\nDirecciones de Supabase en la base (sin contar app_settings):`);
  if (!columnas.length) console.log('  ninguna.');
  for (const col of columnas) {
    const huerfanas = col.quedan.filter((k) => !existentes.has(k)).length;
    const home = col.quedan.filter((k) => SALTEAR.test(k)).length;
    const otras = col.quedan.length - huerfanas - home;
    const notas = [
      huerfanas && `${huerfanas} a archivos que ya no existen`,
      home && `${home} de home-blocks/`,
      otras && `${otras} todavía no en R2`,
    ].filter(Boolean).join(', ');
    console.log(`  ${col.tabla}.${col.columna}: ${col.filas.length} filas → ${APLICAR ? 'se cambian' : 'se cambiarían'} ${col.direcciones} direcciones en ${col.cambios.length} filas${notas ? ` (quedan como están: ${notas})` : ''}.`);
  }

  if (APLICAR) {
    const cliente = await pool.connect();
    let filas = 0;
    let cambiaronAntes = 0;
    try {
      await cliente.query('BEGIN');
      for (const col of columnas) {
        const t = `public."${col.tabla}"`;
        const c = `"${col.columna}"`;
        const cast = col.tipo === 'json' || col.tipo === 'jsonb' ? `::${col.tipo}` : '';
        for (const cambio of col.cambios) {
          // Sólo si nadie la cambió desde que se leyó (el panel puede estar abierto).
          const r = await cliente.query(`UPDATE ${t} SET ${c} = $2${cast} WHERE id = $1 AND ${c}::text = $3`, [cambio.id, cambio.nuevo, cambio.crudo]);
          if (r.rowCount) filas += r.rowCount; else cambiaronAntes++;
        }
      }
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      cliente.release();
    }
    console.log(`\nBase actualizada: ${filas} filas.${cambiaronAntes ? ` ${cambiaronAntes} cambiaron mientras tanto: se toman en la próxima corrida.` : ''}`);
  } else {
    console.log('\nNo se cambió nada. Para hacerlo: node scripts/mudar-a-r2.js --aplicar');
  }

  await pool.end();
  if (fallidas.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('La mudanza falló:', err.message);
    process.exit(1);
  });
}

module.exports = { reescribirTexto, reescribirValor, cacheDe };
