/* =========================================================================
 * APLICAR LAS REESCRITURAS AL CATÁLOGO REAL
 *
 * Escribe en Tiendanube las descripciones reestructuradas y el SEO de las
 * categorías que estaban vacías. Se corre DESPUÉS de backup-descriptions.js.
 *
 * TRES COSAS QUE HACE PORQUE ESTO TOCA UNA TIENDA EN PRODUCCIÓN:
 *
 * 1. SE PUEDE CORTAR Y RETOMAR. Cada producto escrito se anota en un archivo
 *    de progreso. Si se corta la luz o la API empieza a fallar, se vuelve a
 *    correr y sigue donde quedó, sin repetir ni pisar lo ya hecho.
 *
 * 2. NO PUBLICA LO QUE NO PASA LA VERIFICACIÓN. Si el texto nuevo menciona una
 *    norma o un número que no estaba en el original, ese producto se SALTEA y
 *    queda listado al final para revisar a mano. Un aviso de "quedó más corta"
 *    no bloquea (se revisó: es relleno), pero una certificación inventada sí.
 *
 * 3. RESPETA EL FORMATO MULTI-IDIOMA. `description` en esta cuenta es
 *    { es: "..." }. Se escribe con la misma forma; mandar un string pelado
 *    puede romper el campo.
 *
 * USO:
 *   node scripts/apply-rewrites.js --productos
 *   node scripts/apply-rewrites.js --categorias
 *   node scripts/apply-rewrites.js --productos --limite 10   (para probar de a poco)
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const pool = require('./../src/db');
const { pedir, txt, API, dormir } = require('./backup-descriptions');
const { reescribir } = require('./../src/rewriteDescriptions');
const { generateJson } = require('./../src/ai');

/* UN ARCHIVO DE PROGRESO POR TAREA, y no uno compartido.
   Con un solo archivo, correr productos y categorías al mismo tiempo hace que
   se pisen: cada proceso guarda SU copia en memoria y borra lo que anotó el
   otro. Pasó de verdad — las categorías escritas desaparecieron del registro
   (en Tiendanube sí quedaron, pero el archivo decía cero). */
const progresoPath = (tarea) => path.join(__dirname, '..', 'backups', `progreso-${tarea}.json`);

function leerProgreso(tarea) {
  try { return JSON.parse(fs.readFileSync(progresoPath(tarea), 'utf8')); }
  catch (_) { return { hechos: {}, bloqueados: [] }; }
}
function guardarProgreso(tarea, p) {
  fs.mkdirSync(path.dirname(progresoPath(tarea)), { recursive: true });
  fs.writeFileSync(progresoPath(tarea), JSON.stringify(p, null, 2));
}

/** Un aviso de largo es informativo; inventar datos es motivo de bloqueo. */
const esBloqueante = (problema) => /no estaban|certificaciones|normas/i.test(problema);

/* ------------------------------ productos ------------------------------ */

async function aplicarProductos(limite) {
  const progreso = leerProgreso('productos');
  const { rows } = await pool.query(
    'SELECT id, name FROM products_cache WHERE price > 0 ORDER BY sales_30d DESC NULLS LAST'
  );
  const pendientes = rows.filter((p) => !progreso.hechos[p.id]);
  const lote = limite ? pendientes.slice(0, limite) : pendientes;

  console.log(`[productos] ${rows.length} minoristas · ${Object.keys(progreso.hechos).length} ya hechos · ${lote.length} en esta corrida\n`);

  let ok = 0; let bloqueados = 0; let fallos = 0;
  for (const [i, p] of lote.entries()) {
    const marca = `${String(i + 1).padStart(3)}/${lote.length}`;
    try {
      const actual = await pedir(`${API}/products/${p.id}`);
      const desc = txt(actual.description);
      const r = await reescribir({ nombre: p.name, descripcion: desc });

      if (!r.ok) {
        console.log(`${marca} ⊘ ${p.name.slice(0, 44)} — ${r.motivo}`);
        progreso.hechos[p.id] = { estado: 'omitido', motivo: r.motivo };
        fallos += 1;
      } else {
        const graves = r.problemas.filter(esBloqueante);
        if (graves.length) {
          console.log(`${marca} ⚠ ${p.name.slice(0, 44)} — BLOQUEADO: ${graves.join(' | ')}`);
          progreso.bloqueados.push({ id: p.id, name: p.name, problemas: graves });
          progreso.hechos[p.id] = { estado: 'bloqueado', problemas: graves };
          bloqueados += 1;
        } else {
          await pedir(`${API}/products/${p.id}`, {
            method: 'PUT',
            body: JSON.stringify({ description: { es: r.nuevo } }),
          });
          const avisos = r.problemas.length ? ` (${r.problemas.length} aviso)` : '';
          console.log(`${marca} ✓ ${p.name.slice(0, 44)}${avisos}`);
          progreso.hechos[p.id] = { estado: 'ok', imagenes: r.imagenes, avisos: r.problemas };
          ok += 1;
        }
      }
    } catch (err) {
      console.log(`${marca} ✗ ${p.name.slice(0, 44)} — ${err.message.slice(0, 70)}`);
      fallos += 1;
    }
    guardarProgreso('productos', progreso);
    await dormir(700);
  }

  console.log(`\n[productos] escritos ${ok} · bloqueados ${bloqueados} · fallidos ${fallos}`);
  if (progreso.bloqueados.length) {
    console.log('\nPara revisar a mano (no se publicaron):');
    progreso.bloqueados.forEach((b) => console.log(`  · ${b.name}: ${b.problemas.join(' | ')}`));
  }
}

/* ------------------------------ categorías ------------------------------ */

const SISTEMA_CAT = `Escribís metadatos SEO para categorías de una tienda argentina de ropa y calzado
de trabajo y seguridad industrial (BLACKS Indumentaria), que vende minorista online y mayorista.
- seo_title: máximo 60 caracteres. Empezá por lo que la persona busca (el rubro), no por la marca.
  Terminá con "| BLACKS" sólo si entra en los 60.
- seo_description: entre 120 y 155 caracteres, en español rioplatense. Decí qué hay en la categoría
  y por qué comprar ahí (envíos a todo el país, personalización con logo, marcas). Sin exagerar.
- PROHIBIDO inventar marcas, normas o certificaciones que no estén en los datos que te paso.`;

const ESQUEMA_CAT = {
  type: 'object',
  properties: { seo_title: { type: 'string' }, seo_description: { type: 'string' } },
  required: ['seo_title', 'seo_description'],
};

async function aplicarCategorias(limite) {
  const progreso = leerProgreso('categorias');

  let todas = []; let page = 1;
  for (;;) {
    let l;
    try { l = await pedir(`${API}/categories?per_page=200&page=${page}`); }
    catch (e) { if (/HTTP 404/.test(e.message)) break; throw e; }
    if (!Array.isArray(l) || !l.length) break;
    todas = todas.concat(l); page += 1; await dormir(500);
  }

  // Sólo las visibles que tienen el campo VACÍO: nunca se pisa un título escrito a mano.
  const pendientes = todas.filter((c) => c.visibility === 'visible'
    && !txt(c.seo_title).trim() && !progreso.hechos[c.id]);
  const lote = limite ? pendientes.slice(0, limite) : pendientes;
  console.log(`[categorías] ${todas.length} totales · ${lote.length} visibles sin título en esta corrida\n`);

  let ok = 0; let fallos = 0;
  for (const [i, c] of lote.entries()) {
    const nombre = txt(c.name);
    const marca = `${String(i + 1).padStart(3)}/${lote.length}`;
    try {
      const { rows } = await pool.query(
        'SELECT name FROM products_cache WHERE category ILIKE $1 AND price > 0 LIMIT 6', [nombre]
      );
      const ejemplos = rows.map((r) => r.name).join('; ') || '(sin productos en el cache)';
      const r = await generateJson({
        system: SISTEMA_CAT,
        prompt: `Categoría: "${nombre}" (URL: /${txt(c.handle)})\nProductos de ejemplo: ${ejemplos}`,
        schema: ESQUEMA_CAT, temperature: 0.5, maxTokens: 500,
      });
      if (!r || !r.seo_title) throw new Error('la IA no devolvió título');

      /* HAY QUE REENVIAR name Y handle SÍ O SÍ.
         La API de categorías de Tiendanube NO hace actualización parcial: si el
         PUT sólo trae los campos de SEO, BORRA el nombre y el handle de la
         categoría, y la URL queda rota (404 en la tienda).
         Pasó de verdad el 16-ago-2026 con /pantalones1, /camisas1 y /remeras:
         quedaron sin nombre ni URL hasta restaurarlas desde el backup.
         Los productos NO tienen este problema (ahí el PUT parcial funciona),
         es específico de categorías. */
      await pedir(`${API}/categories/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: c.name,
          handle: c.handle,
          seo_title: { es: r.seo_title },
          seo_description: { es: r.seo_description },
        }),
      });
      console.log(`${marca} ✓ ${nombre.slice(0, 40).padEnd(42)} ${r.seo_title.length}/60`);
      progreso.hechos[c.id] = { estado: 'ok', seo_title: r.seo_title };
      ok += 1;
    } catch (err) {
      console.log(`${marca} ✗ ${nombre.slice(0, 40)} — ${err.message.slice(0, 60)}`);
      fallos += 1;
    }
    guardarProgreso('categorias', progreso);
    await dormir(700);
  }
  console.log(`\n[categorías] escritas ${ok} · fallidas ${fallos}`);
}

if (require.main === module) {
  const args = process.argv;
  const limIdx = args.indexOf('--limite');
  const limite = limIdx > -1 ? Number(args[limIdx + 1]) : null;
  const tarea = args.includes('--categorias') ? aplicarCategorias(limite) : aplicarProductos(limite);
  tarea.then(() => pool.end()).catch((e) => { console.error('[error]', e.message); process.exit(1); });
}

module.exports = { aplicarProductos, aplicarCategorias };
