// Sumar productos a la oferta prendida + página de la oferta (26-nov-2026), con
// una tienda y una base FALSAS: no toca Tiendanube ni la base de verdad.
// Corre con: node --test test/flash-sale-sumar.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const settings = new Map();
const tienda = new Map();        // variant_id → promotional_price
const categoriasDe = new Map();  // product_id → [category_id]
const categorias = new Map();    // id → { id, name, handle, visibility, parent }
let escrituras = 0;
let siguienteCat = 900;

function producto(id, price, variantes, cats = [5]) {
  categoriasDe.set(id, [...cats]);
  return { id, name: `P${id}`, price, promo_price: variantes[0][1], stock: 10, image_url: 'x.jpg', images: [], permalink: `p${id}`,
    raw: { variants: variantes.map(([vid, promo]) => ({ id: vid, price: price.toFixed(2), promotional_price: promo == null ? null : promo.toFixed(2) })) } };
}
const cache = new Map([
  [1, producto(1, 50999, [[11, 43999], [12, 43999]], [5, 7])],
  [2, producto(2, 39999, [[21, null], [22, null]])],
  [3, producto(3, 69999, [[31, 53999], [32, 53999]])],
  [4, producto(4, 58399, [[41, 48999]])],
]);
for (const p of cache.values()) for (const v of p.raw.variants) tienda.set(v.id, v.promotional_price);
const original = new Map(tienda);

const pool = {
  async query(sql, params = []) {
    if (/INSERT INTO app_settings/.test(sql)) {
      const [k, v] = params;
      const fila = settings.get(k);
      if (fila && fila.candado && Date.now() - fila.at < params[2] * 60000) return { rows: [] };
      settings.set(k, { value: v, at: Date.now(), candado: true });
      return { rows: [{ key: k }] };
    }
    if (/DELETE FROM app_settings/.test(sql)) { settings.delete(params[0]); return { rows: [] }; }
    if (/FROM products_cache\s+WHERE id = ANY/.test(sql)) return { rows: params[0].map(Number).map((id) => cache.get(id)).filter(Boolean).map((p) => ({ ...p, raw: JSON.parse(JSON.stringify(p.raw)) })) };
    if (/SELECT raw FROM products_cache/.test(sql)) return { rows: [{ raw: JSON.parse(JSON.stringify(cache.get(Number(params[0])).raw)) }] };
    if (/UPDATE products_cache SET raw/.test(sql)) { cache.get(Number(params[0])).raw = JSON.parse(params[1]); return { rows: [] }; }
    if (/UPDATE products_cache SET promo_price/.test(sql)) { cache.get(Number(params[0])).promo_price = params[1]; return { rows: [] }; }
    throw new Error('SQL no previsto en la prueba: ' + sql.slice(0, 60));
  },
};

// Lo mínimo de la API de Tiendanube que usa la página.
async function tnRequest(method, ruta, body) {
  const [camino, query] = ruta.split('?');
  const q = new URLSearchParams(query || '');
  const no = () => { const e = new Error('404'); e.status = 404; throw e; };
  if (method === 'GET' && camino === '/categories') return [...categorias.values()];
  if (method === 'POST' && camino === '/categories') {
    const id = siguienteCat++;
    // Tiendanube le pone un sufijo al azar a la dirección.
    const c = { id, parent: 0, name: body.name, handle: { es: body.name.es.toLowerCase().replace(/\s+/g, '-') + '-x7k2' }, visibility: body.visibility || 'visible' };
    categorias.set(id, c);
    return c;
  }
  let m = camino.match(/^\/categories\/(\d+)$/);
  if (m && method === 'GET') return categorias.get(Number(m[1])) || no();
  if (m && method === 'PUT') {
    const c = categorias.get(Number(m[1])) || no();
    // Como Tiendanube: lo que no se manda de los textos queda vacío.
    Object.assign(c, { name: body.name || { es: '' } }, body.handle ? { handle: body.handle } : {}, body.visibility ? { visibility: body.visibility } : {});
    return c;
  }
  if (method === 'GET' && camino === '/products') {
    const cat = Number(q.get('category_id'));
    const lista = [...categoriasDe].filter(([, cs]) => cs.includes(cat)).map(([id, cs]) => ({ id, categories: cs.map((c) => ({ id: c })) }));
    return lista.length ? lista : no();
  }
  m = camino.match(/^\/products\/(\d+)$/);
  if (m && method === 'GET') return { id: Number(m[1]), categories: (categoriasDe.get(Number(m[1])) || []).map((c) => ({ id: c })) };
  if (m && method === 'PUT') { categoriasDe.set(Number(m[1]), body.categories.map(Number)); return {}; }
  throw new Error(`API no prevista: ${method} ${ruta}`);
}

const fake = (archivo, exportsObj) => {
  const id = require.resolve(path.join(SRC, archivo));
  require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj };
};
fake('db.js', pool);
fake('settings.js', { getSetting: async (k) => (settings.get(k) && !settings.get(k).candado ? settings.get(k).value : null), setSetting: async (k, v) => settings.set(k, { value: v }) });
fake('tiendanube.js', { tnRequest, setVariantPromotionalPrice: async (pid, vid, promo) => { escrituras += 1; tienda.set(vid, promo == null ? null : Number(promo).toFixed(2)); } });
fake('homeRails.js', { productPath: (p) => `/productos/${p}/`, getRailsConfig: async () => ({ transfer_discount_pct: 10 }), invalidate: () => {} });

process.env.FLASH_WRITE_DELAY_MS = '0';
const flash = require(path.join(SRC, 'flashSale.js'));
const { nombreDe } = require(path.join(SRC, 'flashPagina.js'));

const BLACK = { title: 'BLACK FRIDAY', estilo: 'black', ends_at: new Date(Date.now() + 4 * 864e5).toISOString(), discount_base: 'current', pagina: true, items: [{ id: 1, precio: 39999 }, { id: 2, pct: 10 }] };

test('el nombre de la página sale del título, sin gritar', () => {
  assert.strictEqual(nombreDe({ title: 'BLACK FRIDAY' }), 'Black Friday');
  assert.strictEqual(nombreDe({ title: 'Ofertas de verano' }), 'Ofertas de verano');
  assert.strictEqual(nombreDe({ title: 'BLACK FRIDAY', pagina_nombre: 'Black Friday 2026' }), 'Black Friday 2026');
});

test('al activar arma la página visible, con dirección limpia, los productos y el botón "Ver todas"', async () => {
  await flash.saveConfig(BLACK);
  await flash.activate();
  const cfg = await flash.getConfig();
  const cat = categorias.get(cfg.pagina_info.category_id);
  assert.strictEqual(cat.name.es, 'Black Friday');
  assert.strictEqual(cat.visibility, 'visible', 'oculta, Tiendanube contesta "no encontrada"');
  assert.strictEqual(cat.handle.es, 'black-friday', 'sin el sufijo al azar');
  assert.deepStrictEqual(categoriasDe.get(1), [5, 7, cat.id], 'se suma la categoría y quedan las suyas');
  assert.deepStrictEqual(categoriasDe.get(2), [5, cat.id]);
  assert.deepStrictEqual(categoriasDe.get(3), [5], 'lo que no está en la oferta no se toca');
  assert.strictEqual(cfg.url, '/black-friday/');
  assert.strictEqual(tienda.get(11), '39999.00');
});

test('sumar con la oferta prendida escribe sólo los nuevos y los suma a la página', async () => {
  const antes = escrituras;
  const r = await flash.addItems({ items: [{ id: 3, precio: 49999 }, { id: 4, pct: 8 }, { id: 1, precio: 1 }] });
  assert.deepStrictEqual(r.sumados.map((s) => s.id), [3, 4], 'el que ya estaba (1) se ignora');
  assert.strictEqual(escrituras - antes, 3, '2 variantes del 3 + 1 del 4, ninguna del jean');
  assert.strictEqual(tienda.get(31), '49999.00');
  assert.strictEqual(tienda.get(41), '44999.00', '8% sobre $48.999, redondeado a ...99');
  assert.strictEqual(tienda.get(11), '39999.00', 'el jean sigue igual');
  const cfg = await flash.getConfig();
  assert.deepStrictEqual(cfg.items.map((i) => i.id), [1, 2, 3, 4]);
  const cat = cfg.pagina_info.category_id;
  assert.ok(categoriasDe.get(3).includes(cat) && categoriasDe.get(4).includes(cat));
});

test('con la oferta prendida se puede cambiar el orden sin tocar precios', async () => {
  const antes = escrituras;
  const cfg = await flash.getConfig();
  await flash.saveConfig({ ...cfg, items: [{ id: 3 }, { id: 1 }, { id: 4 }, { id: 2 }] });
  const d = await flash.getConfig();
  assert.deepStrictEqual(d.items.map((i) => i.id), [3, 1, 4, 2]);
  assert.strictEqual(d.items.find((i) => i.id === 1).precio, 39999, 'cada uno conserva su precio o %');
  assert.strictEqual(escrituras, antes, 'no se escribió ningún precio');
  assert.strictEqual(d.active, true);
  // Otra lista (falta uno o sobra uno) no se toma como orden.
  await flash.saveConfig({ ...d, items: [{ id: 1 }, { id: 2 }] });
  assert.deepStrictEqual((await flash.getConfig()).items.map((i) => i.id), [3, 1, 4, 2]);
});

test('no se suma lo que no baja el precio, ni sin la oferta prendida', async () => {
  const r = await flash.addItems({ items: [{ id: 99 }] }).catch((e) => e);
  assert.ok(r instanceof Error || r.sumados.length === 0);
  await assert.rejects(flash.addItems({ items: [] }), /No hay productos nuevos/);
});

test('al terminar devuelve TODOS los precios (también los sumados) y vacía la página', async () => {
  await flash.end();
  for (const [vid, promo] of original) assert.strictEqual(tienda.get(vid), promo, `variante ${vid}`);
  const cfg = await flash.getConfig();
  assert.strictEqual(cfg.active, false);
  assert.strictEqual(cfg.url, null, 'el link automático se va con la página');
  const cat = cfg.pagina_info.category_id;
  for (const id of [1, 2, 3, 4]) assert.ok(!categoriasDe.get(id).includes(cat), `producto ${id} fuera de la página`);
  assert.deepStrictEqual(categoriasDe.get(1), [5, 7]);
  assert.strictEqual(categorias.get(cat).visibility, 'hidden', 'vacía se oculta');
  assert.strictEqual(categorias.get(cat).name.es, 'Black Friday', 'el nombre no se pierde');
  await assert.rejects(flash.addItems({ items: [{ id: 3 }] }), /no está prendida/);
});

test('un link escrito a mano no se pisa, y la página oculta vuelve a mostrarse', async () => {
  await flash.saveConfig({ ...BLACK, url: '/ofertas-especiales/' });
  await flash.activate();
  const c = await flash.getConfig();
  assert.strictEqual(c.url, '/ofertas-especiales/');
  assert.strictEqual(categorias.get(c.pagina_info.category_id).visibility, 'visible');
  assert.strictEqual(categorias.size, 1, 'reusa la misma categoría');
  await flash.end();
  assert.strictEqual((await flash.getConfig()).url, '/ofertas-especiales/');
});
