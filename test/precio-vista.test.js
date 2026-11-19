// Precios a la vista, sin compra (src/precioVista.js). Sin base ni red:
// sólo las cuentas puras. node --test test/precio-vista.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const pv = require('../src/precioVista');

// Árbol real (recortado) de la tienda: Mayorista › Herramientas, Mayorista › EPP › Guantes.
const ARBOL = [
  { id: 22030313, padre: null },
  { id: 41943073, padre: 22030313 },
  { id: 2963020, padre: 22030313 },
  { id: 25683780, padre: 2963020 },
  { id: 21736015, padre: null },
];

test('una categoría tildada cubre sus subcategorías; manda la tildada más cercana', () => {
  const epp = { id: 2963020, minimo: 10, descuentos: true, iva: 'incluido' };
  const raiz = { id: 22030313, minimo: 5, descuentos: false, iva: 'mas' };
  const c = pv.categoriasCubiertas([raiz, epp], ARBOL);
  assert.equal(c.get(22030313), raiz);
  assert.equal(c.get(41943073), raiz);
  assert.equal(c.get(2963020), epp, 'EPP está tildada: gana sobre el abuelo');
  assert.equal(c.get(25683780), epp, 'Guantes cuelga de EPP');
  assert.equal(c.has(21736015), false, 'Shop Online no está tildada');
});

test('el mapa público sólo lleva productos con precio y en una categoría tildada', () => {
  const cfg = pv.normalizarConfig({
    categorias: [{ id: 41943073, minimo: 1, descuentos: false, iva: 'mas' }],
    precios: {
      377924162: { precio: 289999, cats: [21736015, 22030313, 41943073] }, // compresor: en Herramientas
      53828451: { precio: 15000, cats: [22030313, 25684532] },              // chomba: no está en una tildada
    },
  });
  const m = pv.mapaPublico(cfg, ARBOL);
  assert.deepEqual(m, { 377924162: { p: 289999, min: 1, desc: false, iva: 'mas' } });
});

test('quitar la categoría saca el precio de la tienda pero lo deja guardado', () => {
  const precios = { 377924162: { precio: 289999, cats: [41943073] } };
  const sin = pv.normalizarConfig({ categorias: [], precios });
  assert.deepEqual(pv.mapaPublico(sin, ARBOL), {});
  assert.equal(sin.precios['377924162'].precio, 289999);
});

test('normalizar: defaults de la ficha mayorista, sin repetidos y sin basura', () => {
  const cfg = pv.normalizarConfig({
    categorias: [{ id: '41943073' }, { id: 41943073, minimo: 3 }, { id: 'x' }, { id: 2963020, minimo: 0, iva: 'raro' }],
    precios: { abc: { precio: 10 }, 1: { precio: -5 }, 2: { precio: 1e12 }, 3: { precio: 1500.6, cats: ['41943073', 'x'] } },
  });
  assert.deepEqual(cfg.categorias, [
    { id: 41943073, minimo: 10, descuentos: true, iva: 'incluido' },
    { id: 2963020, minimo: 10, descuentos: true, iva: 'incluido' },
  ]);
  assert.deepEqual(Object.keys(cfg.precios), ['3']);
  assert.equal(cfg.precios['3'].precio, 1501);
  assert.deepEqual(cfg.precios['3'].cats, [41943073]);
});

test('precio en Tiendanube: el menor de las variantes, con la oferta si hay', () => {
  assert.equal(pv.precioEnTiendanube({ variants: [{ price: '0.00', promotional_price: '0.00' }] }), 0);
  assert.equal(pv.precioEnTiendanube({ variants: [{ price: '5000.00', promotional_price: '4000.00' }, { price: '4500.00' }] }), 4000);
});

test('precios escritos a mano: punto de miles y coma decimal', () => {
  assert.equal(pv.entero('289.999'), 289999);
  assert.equal(pv.entero('$ 1.234,50'), 1235);
  assert.equal(pv.entero(289999.4), 289999);
  assert.ok(Number.isNaN(pv.entero('abc')));
});

// ---- Campo "Precio a la vista" de Tiendanube (19-nov-2026) ----

test('campo de Tiendanube: lee el precio como lo escriba la persona', () => {
  assert.equal(pv.precioDeCampo('50.000'), 50000);
  assert.equal(pv.precioDeCampo('50000'), 50000);
  assert.equal(pv.precioDeCampo('$ 50.000,00'), 50000);
  assert.equal(pv.precioDeCampo('50000.00'), 50000);
  assert.equal(pv.precioDeCampo('1.234.567'), 1234567);
  assert.equal(pv.precioDeCampo(289999), 289999);
  assert.equal(pv.precioDeCampo('50.5'), 51, 'decimal: queda chico y el motor lo descarta (< 100)');
  for (const v of ['', null, undefined, 'consultar', '-5000', 0, '0']) assert.equal(pv.precioDeCampo(v), 0, String(v));
});

test('el campo se reconoce por el nombre, sin importar mayúsculas ni tildes', () => {
  assert.ok(pv.esCampoPrecio({ owner_resource: 'product', name: 'Precio a la vista' }));
  assert.ok(pv.esCampoPrecio({ owner_resource: 'product', name: '  PRECIO A LA VISTA (web)' }));
  assert.ok(!pv.esCampoPrecio({ owner_resource: 'product', name: 'Canal' }));
  assert.ok(!pv.esCampoPrecio({ owner_resource: 'variant', name: 'Precio a la vista' }));
});

test('un precio cargado en Tiendanube le gana al del motor, sólo en categorías tildadas', () => {
  const cfg = pv.normalizarConfig({
    categorias: [{ id: 41943073, minimo: 1, descuentos: false, iva: 'mas' }],
    precios: { 377924162: { precio: 50000, cats: [41943073] }, 100: { precio: 7000, cats: [41943073] } },
  });
  const tn = {
    valores: { 377924162: 55000, 200: 9000, 300: 12000 },
    // 200 está en Herramientas (lo dice Tiendanube); 300 está en Shop Online, no tildada.
    cats: { 377924162: [41943073], 200: [22030313, 41943073], 300: [21736015] },
  };
  assert.deepEqual(pv.mapaPublico(cfg, ARBOL, tn), {
    377924162: { p: 55000, min: 1, desc: false, iva: 'mas' }, // gana Tiendanube
    100: { p: 7000, min: 1, desc: false, iva: 'mas' },        // sólo en el motor
    200: { p: 9000, min: 1, desc: false, iva: 'mas' },        // sólo en Tiendanube
  });
  // Sin lo de Tiendanube (no contestó), queda el del motor.
  assert.equal(pv.mapaPublico(cfg, ARBOL, null)['377924162'].p, 50000);
});
