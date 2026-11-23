// Oferta programada + oferta siguiente + candado (Black Friday, nov-2026), con
// una tienda y una base FALSAS: no toca Tiendanube ni la base de verdad.
// Corre con: node --test test/flash-sale-programada.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const settings = new Map();
const tienda = new Map();   // variant_id → promotional_price (lo que "cobra" Tiendanube)
let escrituras = 0;

function producto(id, price, variantes) {
  return { id, name: `P${id}`, price, promo_price: variantes[0][1], stock: 10, image_url: 'x.jpg', images: [], permalink: `p${id}`,
    raw: { variants: variantes.map(([vid, promo]) => ({ id: vid, price: price.toFixed(2), promotional_price: promo == null ? null : promo.toFixed(2) })) } };
}
const cache = new Map([
  [1, producto(1, 50999, [[11, 43999], [12, 43999]])],   // jean
  [2, producto(2, 44999, [[21, 32999], [22, 32999]])],   // bermuda (verano −9 %)
]);
for (const p of cache.values()) for (const v of p.raw.variants) tienda.set(v.id, v.promotional_price);

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
const fake = (archivo, exportsObj) => {
  const id = require.resolve(path.join(SRC, archivo));
  require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj };
};
fake('db.js', pool);
fake('settings.js', { getSetting: async (k) => (settings.get(k) && !settings.get(k).candado ? settings.get(k).value : null), setSetting: async (k, v) => settings.set(k, { value: v }) });
fake('tiendanube.js', { setVariantPromotionalPrice: async (pid, vid, promo) => { escrituras += 1; tienda.set(vid, promo == null ? null : Number(promo).toFixed(2)); } });
fake('homeRails.js', { productPath: (p) => `/productos/${p}/`, getRailsConfig: async () => ({ transfer_discount_pct: 10 }), invalidate: () => {} });

process.env.FLASH_WRITE_DELAY_MS = '0';
const flash = require(path.join(SRC, 'flashSale.js'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cfgActual = async () => flash.getConfig();

const VERANO = { title: 'Ofertas de verano', ends_at: new Date(Date.now() + 14 * 864e5).toISOString(), discount_base: 'current', items: [{ id: 2, pct: 9 }] };
const BLACK = { title: 'BLACK FRIDAY', estilo: 'black', ends_at: new Date(Date.now() + 4 * 864e5).toISOString(), discount_base: 'current', items: [{ id: 1, precio: 39999 }, { id: 2, pct: 9 }] };

test('arranca sola, guarda la de verano y la devuelve al terminar', { timeout: 60000 }, async () => {
  await flash.saveConfig(VERANO);
  await flash.activate();
  assert.strictEqual(tienda.get(21), '29999.00');

  await flash.programar(BLACK, new Date(Date.now() + 200).toISOString());
  assert.strictEqual(await flash.maybeAutoStart(), null, 'antes de la hora no hace nada');
  await esperar(250);

  // Dos disparos a la vez (Render y el cron): una sola activación.
  const [a, b] = await Promise.all([flash.maybeAutoStart(), flash.maybeAutoStart()]);
  assert.ok((a && a.arranco) || (b && b.arranco));
  let cfg = await cfgActual();
  assert.strictEqual(cfg.title, 'BLACK FRIDAY');
  assert.strictEqual(cfg.active, true);
  assert.strictEqual(cfg.programada, null);
  assert.strictEqual(cfg.despues.title, 'Ofertas de verano');
  assert.strictEqual(tienda.get(11), '39999.00', 'jean a precio Black');
  assert.strictEqual(tienda.get(21), '29999.00', 'bermuda igual que en verano');
  // La libreta del Black anota el precio de ANTES del verano (no el de verano):
  const libreta = new Map(cfg.applied.variants.map((v) => [v.variant_id, v.prior_promo]));
  assert.strictEqual(libreta.get(21), 32999);
  assert.strictEqual(libreta.get(11), 43999);
  // La copia del catálogo quedó con el precio nuevo (la lee el catálogo de Meta):
  assert.strictEqual(cache.get(1).raw.variants[0].promotional_price, '39999.00');

  const fin = await flash.end({ auto: true });
  assert.strictEqual(fin.siguiente, 'Ofertas de verano');
  cfg = await cfgActual();
  assert.strictEqual(cfg.title, 'Ofertas de verano');
  assert.strictEqual(cfg.active, true);
  assert.strictEqual(cfg.despues, null);
  assert.strictEqual(tienda.get(11), '43999.00', 'jean vuelve a su precio');
  assert.strictEqual(tienda.get(21), '29999.00', 'verano otra vez');
  assert.strictEqual(new Map(cfg.applied.variants.map((v) => [v.variant_id, v.prior_promo])).get(21), 32999);
  assert.strictEqual(cache.get(1).raw.variants[0].promotional_price, '43999.00');
});

test('con el candado tomado por otro proceso no hace nada', async () => {
  await flash.programar(BLACK, new Date(Date.now() + 50).toISOString());
  await esperar(80);
  settings.set('flash_sale_candado', { value: 'otro', at: Date.now(), candado: true });
  const antes = escrituras;
  const r = await flash.maybeAutoStart();
  assert.deepStrictEqual(r, { ok: true, ocupado: true });
  assert.strictEqual(escrituras, antes);
  settings.delete('flash_sale_candado');
  await flash.cancelarProgramada();
  assert.strictEqual((await cfgActual()).programada, null);
});

test('no se puede programar en el pasado ni sin productos', async () => {
  await assert.rejects(flash.programar(BLACK, new Date(Date.now() - 1000).toISOString()), /ya pasó/);
  await assert.rejects(flash.programar({ ...BLACK, items: [] }, new Date(Date.now() + 1000).toISOString()), /no tiene productos/);
});
