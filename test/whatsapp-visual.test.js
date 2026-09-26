const { test } = require('node:test');
const assert = require('node:assert/strict');
const { imageUrls, specsFor, statedPrices } = require('../src/whatsappVisual');

test('la pieza usa sólo fotos del catálogo permitido y preserva distintas tomas', () => {
  const first = 'https://acdn-us.mitiendanube.com/stores/339/112/products/a.jpg';
  const second = 'https://acdn-us.mitiendanube.com/stores/339/112/products/b.jpg';
  assert.deepEqual(imageUrls({ image_url: first, images: [first, second, 'http://localhost/private',
    'https://evil.example/photo.jpg'] }), [first, second]);
});

test('la ficha visual mayorista extrae datos reales sin basura de HTML', () => {
  const specs = specsFor({ name: 'Buzo Hoodie Pampero', raw: { description: { es:
    'Buzo con interior frisado. &bull; Bolsillo canguro &bull; Capucha regulable &bull; Puños y cintura de Rib.' } } });
  assert.ok(specs.some((item) => /Bolsillo canguro/i.test(item)));
  assert.ok(specs.every((item) => !/&bull;|uso diario|ideal para/i.test(item)));
});

test('el precio impreso se compara con el catálogo antes de crear la pieza', () => {
  assert.deepEqual(statedPrices('Texto\n\n💰 Precio: $24.999\n💳 Hasta 6 cuotas sin interés'), [24999]);
  assert.deepEqual(statedPrices('💰 Remera: $17.999\n💰 Pantalón: $58.999'), [17999, 58999]);
});
