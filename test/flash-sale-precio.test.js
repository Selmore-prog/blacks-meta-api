// Ofertas flash con precio fijo por producto (Black Friday, nov-2026).
// Corre con: node --test test/flash-sale-precio.test.js
const test = require('node:test');
const assert = require('node:assert');
const { promoDeVariante, precioRedondo } = require('../src/flashSale');

const cfg = { default_pct: 10, discount_base: 'current' };

test('precio fijo: el jean de $43.999 (lista $50.999) pasa a $39.999 exacto', () => {
  assert.strictEqual(promoDeVariante({ price: '50999.00', promotional_price: '43999.00' }, { id: 1, precio: 39999 }, cfg), 39999);
});

test('precio fijo gana sobre el %', () => {
  assert.strictEqual(promoDeVariante({ price: 50999, promotional_price: 43999 }, { id: 1, pct: 30, precio: 39999 }, cfg), 39999);
});

test('precio fijo nunca sube lo que el cliente ya ve', () => {
  assert.strictEqual(promoDeVariante({ price: 50999, promotional_price: 37999 }, { id: 1, precio: 39999 }, cfg), null);
  assert.strictEqual(promoDeVariante({ price: 50999, promotional_price: 39999 }, { id: 1, precio: 39999 }, cfg), null);
});

test('precio fijo igual o mayor al regular no se escribe', () => {
  assert.strictEqual(promoDeVariante({ price: 39999, promotional_price: null }, { id: 1, precio: 39999 }, cfg), null);
  assert.strictEqual(promoDeVariante({ price: 30000, promotional_price: null }, { id: 1, precio: 39999 }, cfg), null);
});

test('variante sin precio se saltea', () => {
  assert.strictEqual(promoDeVariante({ price: '0.00', promotional_price: null }, { id: 1, precio: 39999 }, cfg), null);
});

test('sin precio fijo sigue el % de siempre, redondeado a ...99', () => {
  // Remera Gurre de la oferta de verano: $18.999 actual, 11 %
  assert.strictEqual(promoDeVariante({ price: 25999, promotional_price: 18999 }, { id: 1, pct: 11 }, cfg), precioRedondo(18999 * 0.89));
  assert.strictEqual(promoDeVariante({ price: 25999, promotional_price: 18999 }, { id: 1, pct: 11 }, cfg), 16899);
});
