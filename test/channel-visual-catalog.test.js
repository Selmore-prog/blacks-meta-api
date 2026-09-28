const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { catalogPhotos, visualCatalog, visualCampaign, complementaryCaption } = require('../src/channelVisualCatalog');

const url = (id) => `https://acdn-us.mitiendanube.com/stores/339/112/products/${id}.jpg`;
function fixture() {
  return { name: 'Pantalón', image_url: url(0), raw: {
    attributes: [{ es: 'Talle' }, { es: 'Color' }],
    images: Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, src: url(i), width: 1024, height: 1024 })),
    variants: [
      { values: [{ es: '40' }, { es: 'Verde' }], stock: 0, stock_management: true, image_id: 100 },
      { values: [{ es: '42' }, { es: 'Negro' }], stock: 2, stock_management: true, image_id: 110 },
      { values: [{ es: '44' }, { es: 'Negro' }], stock: 0, stock_management: true, image_id: 110 },
      { values: [{ es: '46' }, { es: 'Azul' }], stock: 9, stock_management: true, image_id: 111, visible: false },
    ],
  } };
}

test('los colores y talles salen de variantes comprables y no de fotos ni del stock total', () => {
  const product = fixture();
  const result = visualCatalog(product);
  assert.deepEqual(result.colors.map((c) => c.name), ['Negro']);
  assert.deepEqual(result.colors[0].stockSizes, ['42']);
  assert.equal(result.primaryPhoto, 10);
  assert.deepEqual(result.heroPhotoIndices, [10]);
  assert.ok(!result.gallery.some((p) => p.index === 0 || p.index === 11));
  assert.deepEqual(result.gallery.find((p) => p.index === 10).colors, ['Negro']);
  assert.equal(catalogPhotos(product).length, 12);
});

test('stock desconocido no se publica como disponible; mayorista sin gestión requiere consulta', () => {
  const product = fixture();
  product.raw.variants = [
    { values: [{ es: 'M' }, { es: 'Beige' }], stock: null, stock_management: false, image_id: 102 },
    { values: [{ es: 'L' }, { es: 'Marrón' }], stock: null, stock_management: true, image_id: 103 },
  ];
  const { colors } = visualCatalog(product);
  assert.equal(colors.length, 1);
  assert.equal(colors[0].inStock, false);
  assert.equal(colors[0].catalogOnly, true);
  const caption = complementaryCaption({ body: 'Hacé tu consulta.' }, [{ ...product, colors }]);
  assert.match(caption, /Consultá disponibilidad/);
  assert.doesNotMatch(caption, /con stock|Marrón/);
});

test('una foto compartida por variantes de distintos colores no se etiqueta como un color específico', () => {
  const product = fixture();
  product.raw.variants[0].image_id = 110;
  const result = visualCatalog(product);
  assert.deepEqual(result.gallery.find((p) => p.index === 10).colors, []);
});

test('el copy complementario conserva párrafos y enlace y agrega talles exactos', () => {
  const product = { ...fixture(), ...visualCatalog(fixture()) };
  const body = 'Primer párrafo.\n\nSegundo párrafo.\n\n💰 Precio: $20.000\n🛒 https://example.com/producto';
  const caption = complementaryCaption({ body }, [product]);
  assert.ok(caption.startsWith('Primer párrafo.\n\nSegundo párrafo.'));
  assert.match(caption, /Negro: 42/);
  assert.ok(caption.endsWith('🛒 https://example.com/producto'));
  assert.doesNotMatch(caption, /44|Verde|Azul/);
});

test('los avisos de reposición requieren un pedido del usuario; descuento requiere datos de catálogo', () => {
  assert.equal(visualCampaign({ source: 'automatic', topic: 'Reingreso', audience: 'minorista' }, []).type, 'notice');
  assert.equal(visualCampaign({ source: 'custom', topic_request: 'Avisar reingreso', audience: 'mayorista' }, []).type, 'restock');
  assert.equal(visualCampaign({ audience: 'minorista' }, [{ discountPercent: 28 }]).type, 'promotion');
  assert.equal(visualCampaign({ audience: 'mayorista' }, [{ discountPercent: 28 }]).type, 'notice');
});

const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../public/whatsapp-visual.js'), 'utf8'), browser);
const { fitImage, slides } = browser.window.whatsappVisual;

test('retratos, cuadrados y panorámicas caben completos sin deformación ni recorte', () => {
  const bounds = { x: 60, y: 230, w: 730, h: 740 };
  for (const [w, h] of [[400, 1600], [1800, 600], [1024, 1024]]) {
    const fit = fitImage(w, h, bounds);
    assert.ok(fit.x >= bounds.x && fit.y >= bounds.y);
    assert.ok(fit.x + fit.w <= bounds.x + bounds.w + .001);
    assert.ok(fit.y + fit.h <= bounds.y + bounds.h + .001);
    assert.ok(Math.abs(fit.w / fit.h - w / h) < .001);
  }
});

test('las piezas adicionales dan acceso a todas las fotos admitidas, incluidas las posteriores a la octava', () => {
  const product = { ...fixture(), ...visualCatalog(fixture()) };
  const pages = slides({ products: [product], kind: 'texto' });
  const covered = new Set(pages.flatMap((page) => page.items || []).map((p) => p.index));
  for (const photo of product.gallery) assert.ok(covered.has(photo.index));
  assert.ok(pages.some((p) => p.type === 'colors'));
  assert.ok(!covered.has(0));
});
