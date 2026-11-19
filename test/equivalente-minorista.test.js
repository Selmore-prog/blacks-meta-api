// Equivalente minorista de un mayorista (src/equivalenteMinorista.js), sin base:
// sólo la elección pura. node --test test/equivalente-minorista.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { elegir } = require('../src/equivalenteMinorista');

// Minoristas reales (con precio y stock) del 19-nov-2026.
const MIN = [
  { name: 'Chomba Micropique Pampero', stock: 59 },
  { name: 'Pack X2 Chomba Micropique Pampero', stock: 25 },
  { name: 'Chomba Dama Pique Pampero', stock: 4 },
  { name: 'Remera Lisa Algodón Pampero', stock: 80 },
  { name: 'Remera Lisa Algodon Gurre', stock: 10 },
  { name: 'Remera Oversize Lisa Blacks', stock: 30 },
  { name: 'Pantalon Cargo De Trabajo Ombu Reforzado', stock: 12 },
  { name: 'Pantalon Trabajo Clasico Pampero', stock: 40 },
  { name: 'Pantalon Cargo Slim Fit Elastizado Pampero', stock: 15 },
  { name: 'Buzo Polar Medio Cierre Pampero', stock: 9 },
];
const de = (n) => { const r = elegir(n, MIN); return r ? r.fila.name : null; };

test('la chomba mayorista encuentra la minorista, no el pack ni la de dama', () => {
  assert.equal(de('CHOMBA PAMPERO'), 'Chomba Micropique Pampero');
  assert.equal(de('CHOMBA MICROPIQUE PAMPERO'), 'Chomba Micropique Pampero');
});

test('dama, manga larga, cargo, oversize y fit tienen que coincidir de los dos lados', () => {
  assert.equal(de('CHOMBA PAMPERO DAMA'), 'Chomba Dama Pique Pampero');
  assert.equal(de('REMERA ALGODÓN PAMPERO MANGA LARGA'), null);
  assert.equal(de('PANTALÓN DE TRABAJO OMBU'), null, 'el único Ombú minorista es cargo');
  assert.equal(de('PANTALÓN DE TRABAJO CARGO OMBU'), 'Pantalon Cargo De Trabajo Ombu Reforzado');
  assert.equal(de('PANTALÓN DE TRABAJO PAMPERO'), 'Pantalon Trabajo Clasico Pampero');
  assert.equal(de('REMERA OVERSIZE'), 'Remera Oversize Lisa Blacks');
  assert.equal(de('REMERA ALGODÓN'), 'Remera Lisa Algodón Pampero', 'empate: gana el de más stock');
});

test('sin todas las palabras, con más de 2 de más o con una sola palabra: nada', () => {
  assert.equal(de('Termómetro láser digital Lusqtoff'), null);
  assert.equal(de('BUZO POLAR PAMPERO BORDADO'), null);
  assert.equal(de('PANTALÓN CARGO'), null, 'cargo + 3 palabras de más (slim fit elastizado pampero) no alcanza');
  assert.equal(de('Remera'), null);
});
