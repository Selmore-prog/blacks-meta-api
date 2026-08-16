/* =========================================================================
 * BACKUP DE DESCRIPCIONES Y SEO — se corre ANTES de tocar nada.
 *
 * Guarda en un archivo JSON el estado actual de todos los productos y
 * categorías: descripción completa, seo_title y seo_description. Es la red
 * para poder volver atrás si una reescritura no gusta.
 *
 * OJO: `products_cache.description` NO sirve para esto — el sync la recorta a
 * 600 caracteres. Las descripciones reales van de 800 a 1.900 y traen HTML con
 * imágenes embebidas (guías de talle). Por eso se piden de a uno a la API, que
 * es la única fuente completa.
 *
 * USO:
 *   node scripts/backup-descriptions.js
 *   node scripts/backup-descriptions.js --restore backups/archivo.json
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const config = require('./../src/config');
const pool = require('./../src/db');

const API = `${config.tiendanube.apiBase}/${config.tiendanube.storeId}`;
const HEADERS = {
  ...(config.tiendanube.authHeaderStyle === 'authentication'
    ? { Authentication: `bearer ${config.tiendanube.accessToken}` }
    : { Authorization: `Bearer ${config.tiendanube.accessToken}` }),
  'User-Agent': config.tiendanube.userAgent,
  'Content-Type': 'application/json',
};

/** Los textos vienen como string o como objeto multi-idioma {es: '...'}. */
const txt = (v) => (typeof v === 'string' ? v : (v && (v.es || Object.values(v)[0])) || '');

// La API de Tiendanube limita a ~2 pedidos por segundo por tienda. Sin freno,
// devuelve 429 y el backup queda incompleto justo en los productos del final.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, opts = {}, reintentos = 3) {
  for (let i = 0; i <= reintentos; i += 1) {
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
    if (res.status === 429) {
      const espera = 2000 * (i + 1);
      console.warn(`  [429] pasado de rueda, esperando ${espera / 1000}s...`);
      await dormir(espera);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`Demasiados 429 seguidos en ${url}`);
}

async function backup() {
  const { rows } = await pool.query('SELECT id, name FROM products_cache WHERE price > 0 ORDER BY id');
  console.log(`[backup] ${rows.length} productos minoristas a respaldar...`);

  const productos = [];
  for (const [i, p] of rows.entries()) {
    const d = await pedir(`${API}/products/${p.id}`);
    productos.push({
      id: p.id,
      name: txt(d.name),
      description: d.description,      // se guarda CRUDO (objeto multi-idioma), tal cual lo devuelve la API
      seo_title: d.seo_title,
      seo_description: d.seo_description,
    });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${rows.length}`);
    await dormir(550);
  }

  console.log('[backup] categorías...');
  const categorias = [];
  let page = 1;
  for (;;) {
    // Tiendanube NO devuelve una lista vacía al pasarse de la última página:
    // tira 404 con "Last page is N". Hay que tratarlo como fin de la lista y
    // no como error, o el backup muere justo al final.
    let lote;
    try {
      lote = await pedir(`${API}/categories?per_page=200&page=${page}`);
    } catch (err) {
      if (/HTTP 404/.test(err.message)) break;
      throw err;
    }
    if (!Array.isArray(lote) || !lote.length) break;
    for (const c of lote) {
      categorias.push({
        id: c.id, name: txt(c.name), handle: txt(c.handle),
        visibility: c.visibility,
        seo_title: c.seo_title, seo_description: c.seo_description, description: c.description,
      });
    }
    page += 1;
    await dormir(550);
  }

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `catalogo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), productos, categorias }, null, 2));

  console.log(`\n[backup] Listo: ${productos.length} productos y ${categorias.length} categorías`);
  console.log(`[backup] Archivo: ${archivo}`);
  console.log(`[backup] Tamaño: ${(fs.statSync(archivo).size / 1024).toFixed(0)} KB`);
  return archivo;
}

/** Devuelve todo al estado del backup. Se usa si una reescritura no gustó. */
async function restaurar(archivo) {
  const data = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log(`[restore] Backup del ${data.fecha}: ${data.productos.length} productos.`);
  for (const [i, p] of data.productos.entries()) {
    await pedir(`${API}/products/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ description: p.description, seo_title: p.seo_title, seo_description: p.seo_description }),
    });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${data.productos.length}`);
    await dormir(550);
  }
  console.log('[restore] Productos restaurados.');
}

if (require.main === module) {
  const idx = process.argv.indexOf('--restore');
  const tarea = idx > -1 ? restaurar(process.argv[idx + 1]) : backup();
  tarea.then(() => pool.end()).catch((e) => { console.error('[error]', e.message); process.exit(1); });
}

module.exports = { backup, restaurar, pedir, txt, API, HEADERS, dormir };
