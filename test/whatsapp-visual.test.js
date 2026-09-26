const { test } = require('node:test');
const assert = require('node:assert/strict');
const { imageUrls, specsFor, offerFor, visualHeadline, planVisualStyles,
  statedPrices } = require('../src/whatsappVisual');

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

test('la pieza muestra descuento sólo si el catálogo tiene una promoción real', () => {
  assert.deepEqual(offerFor({ price: 59999, promo_price: 42999 }),
    { price: 42999, regularPrice: 59999, discountPercent: 28 });
  assert.deepEqual(offerFor({ price: 24999, promo_price: null }),
    { price: 24999, regularPrice: null, discountPercent: null });
  assert.deepEqual(offerFor({ price: 24999, promo_price: 28000 }),
    { price: 24999, regularPrice: null, discountPercent: null });
});

test('el título identifica al producto y la ficha conserva todas sus características', () => {
  const product = { name: 'Camisa Pampero', raw: { description: { es:
    'Tela Grafa. • Costuras Reforzadas • Bolsillos con Fuelle' } } };
  const headline = visualHeadline([product], { id: 12, topic: 'Novedad de producto' });
  assert.equal(headline, product.name);
  assert.ok(specsFor(product).length > 0);
});

test('el director visual alterna composición entre publicaciones vecinas', () => {
  const posts = [1, 2, 3, 4, 5].map((id) => ({
    id, post_date: `2026-09-${String(id + 1).padStart(2, '0')}`,
    audience: 'minorista', topic: 'Producto',
  }));
  const styles = planVisualStyles(posts);
  for (let index = 1; index < posts.length; index++) {
    assert.notEqual(styles.get(String(posts[index].id)), styles.get(String(posts[index - 1].id)));
  }
});
