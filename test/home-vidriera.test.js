const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analizarPrenda, armarIdeas } = require('../src/photoIdeas');
const { renderBlock } = require('../src/homeBlocksRender');
const { validateConfig } = require('../src/homeBlocks');

const CDN = 'https://acdn-us.mitiendanube.com/stores/339/112/products/';

/* Un cargo con tres colores: dos con stock y el verde agotado. Cada color tiene
   su foto asignada por variante, como en Tiendanube. */
const cargo = {
  id: 74186334,
  name: 'Pantalon Cargo Ripstop Antidesgarro Pampero',
  brand: 'PAMPERO',
  image_url: `${CDN}verde.jpg`,
  images: [`${CDN}verde.jpg`, `${CDN}negro.jpg`, `${CDN}beige.jpg`],
  raw: {
    description: { es: '<ul><li><strong>Tejido Ripstop antidesgarro:</strong> resiste el uso intenso.</li><li><strong>Triple costura:</strong> en laterales y entrepierna.</li></ul>' },
    attributes: [{ es: 'Color' }, { es: 'Talle' }],
    images: [{ id: 1, src: `${CDN}verde.jpg` }, { id: 2, src: `${CDN}negro.jpg` }, { id: 3, src: `${CDN}beige.jpg` }],
    variants: [
      { values: [{ es: 'Verde' }, { es: '40' }], stock: 0, image_id: 1 },
      { values: [{ es: 'Negro' }, { es: '40' }], stock: 5, image_id: 2 },
      { values: [{ es: 'Beige' }, { es: '42' }], stock: 3, image_id: 3 },
    ],
  },
};

const camisa = {
  id: 2,
  name: 'Camisa Pampero Secado Rapido Liviana Ripstop',
  brand: 'Pampero',
  image_url: `${CDN}camisa.jpg`,
  images: [`${CDN}camisa.jpg`],
  raw: { attributes: [{ es: 'Color' }], images: [{ id: 9, src: `${CDN}camisa.jpg` }], variants: [{ values: [{ es: 'Negro' }], stock: 4, image_id: 9 }] },
};

test('la prenda se lee de los datos: tipo, tela, mundos y sólo los colores con stock', () => {
  const p = analizarPrenda(cargo);
  assert.equal(p.tipo, 'pantalon');
  assert.equal(p.en, 'cargo work trousers');
  assert.equal(p.tela.es, 'ripstop');
  assert.ok(p.mundos.includes('aire_libre') && p.mundos.includes('trabajo'));
  assert.deepEqual(p.colores.map((c) => c.nombre), ['Negro', 'Beige']);
  assert.ok(p.rasgos.some((r) => /triple costura/i.test(r)));
});

test('los lavados de jean no se le piden al modelo como si fueran colores', () => {
  const jean = analizarPrenda({
    id: 3, name: 'Pantalones Jean Vaquero Clásico Recto Original', image_url: `${CDN}j.jpg`, images: [],
    raw: { attributes: [{ es: 'Color' }], variants: [{ values: [{ es: 'Claro' }], stock: 2 }, { values: [{ es: 'Medio 2' }], stock: 1 }] },
  });
  assert.deepEqual(jean.colores.map((c) => c.en), ['light-wash blue denim', 'mid-wash blue denim']);
});

test('las ideas usan el color elegido y adjuntan SÓLO fotos de ese color', () => {
  const ideas = armarIdeas([analizarPrenda(cargo)], { color: 'Beige', ratio: '3-4', estilo: 'etiqueta' });
  assert.ok(ideas.length >= 5);
  ideas.forEach((idea) => {
    assert.equal(idea.color, 'Beige');
    assert.deepEqual(idea.referencias.map((r) => r.url), [`${CDN}beige.jpg`]);
    assert.match(idea.prompt, /beige Pampero cargo work trousers/);
    assert.doesNotMatch(idea.prompt, /olive|black Pampero/);
    // La forma de la placa, al final y en su propia oración.
    assert.match(idea.prompt, /Output aspect ratio: 3:4\./);
    assert.match(idea.prompt, /size of a product card/);
  });
  // Estudio con un fondo que contrasta con una prenda tierra.
  assert.match(ideas[0].titulo, /verde bosque|gris carbón|azul grisáceo/);
});

test('la idea escrita por el dueño va primero y conserva la prenda real', () => {
  const ideas = armarIdeas([analizarPrenda(cargo)], { idea: 'en una terraza al atardecer' });
  assert.equal(ideas[0].id, 'propia');
  assert.match(ideas[0].prompt, /«en una terraza al atardecer»/);
  assert.match(ideas[0].prompt, /must match the attached reference photos exactly/);
});

test('el castellano concuerda con la prenda', () => {
  const ideas = armarIdeas([analizarPrenda(camisa)], {});
  const textos = ideas.map((i) => i.que).join(' ');
  assert.match(textos, /la camisa negra/);
  assert.doesNotMatch(textos, /el camisa/);
});

test('un conjunto no inventa ropa de las zonas que ya cubre y adjunta una foto de cada prenda', () => {
  const ideas = armarIdeas([analizarPrenda(cargo), analizarPrenda(camisa)], {});
  const estudio = ideas.find((i) => i.id === 'estudio_color');
  assert.doesNotMatch(estudio.prompt, /plain crew-neck t-shirt|plain dark work trousers/);
  assert.equal(new Set(estudio.referencias.map((r) => r.producto)).size, 2);
});

/* ------------------------------------------------------------ render ----- */

function producto(id, extra = {}) {
  return { id, name: `Prenda ${id}`, url: `/productos/prenda-${id}/`, image: `${CDN}p${id}.jpg`, price: 30000, promo_price: null, stock: 5, ...extra };
}

function bloque(data, fotos) {
  return {
    slot: 'block_6', type: 'vidriera', theme: 'claro', width: 'contenido', spacing: 'normal', device: 'todos',
    data: { card_style: 'etiqueta', layout: 'carrusel', ratio: '3-4', size: 'producto', show_price: true, fotos, ...data },
  };
}

test('la placa entera es un link a la prenda y las miniaturas del conjunto a cada una', () => {
  const porId = new Map([[1, producto(1, { promo_price: 24000 })], [2, producto(2)]]);
  const fotos = [
    { product_ids: [1], image: 'https://x.test/a.jpg', kicker: 'Look 01' },
    { product_ids: [1, 2], image: 'https://x.test/b.jpg' },
  ];
  const html = renderBlock(bloque({}, fotos), { porId, fotos });
  assert.match(html, /class="hb-vf-link" href="\/productos\/prenda-1\/"/);
  assert.match(html, /\$24\.000/);
  assert.match(html, /<s>\$30\.000<\/s>/);
  // Conjunto: sin precio suelto, con sus dos miniaturas linkeadas.
  assert.match(html, /Look completo/);
  assert.match(html, /2 prendas/);
  assert.match(html, /class="hb-vf-mini" href="\/productos\/prenda-2\/"/);
  // Nunca un <a> adentro de otro: la placa es un <article>.
  assert.doesNotMatch(html, /<a class="hb-vf"/);
  assert.match(html, /data-hb-carrusel/);
});

test('sin foto propia va la de catálogo, y una placa vacía no dibuja etiqueta', () => {
  const porId = new Map([[1, producto(1)]]);
  const fotos = [{ product_ids: [1], image: '' }, { product_ids: [], image: '' }];
  const html = renderBlock(bloque({}, fotos), { porId, fotos });
  assert.match(html, /hb-vf hb-vf--catalogo/);
  assert.match(html, /p1\.jpg/);
  assert.equal((html.match(/hb-vf-ficha/g) || []).length, 1);
});

test('los tres diseños salen con su estructura', () => {
  const porId = new Map([[1, producto(1)]]);
  const fotos = [{ product_ids: [1], image: 'https://x.test/a.jpg', kicker: 'Nuevo' }, { product_ids: [1], image: 'https://x.test/b.jpg' }];
  assert.match(renderBlock(bloque({ card_style: 'banner' }, fotos), { porId, fotos }), /hb-vf-over[\s\S]*hb-vf-tit/);
  const marco = renderBlock(bloque({ card_style: 'marco', layout: 'grilla' }, fotos), { porId, fotos });
  assert.match(marco, /hb-vf-num" aria-hidden="true">02</);
  assert.doesNotMatch(marco, /data-hb-carrusel/);
});

test('publicar exige dos fotos y que ninguna esté vacía', () => {
  const base = { slot: 'block_6', type: 'vidriera', enabled: true };
  assert.throws(() => validateConfig({ blocks: [{ ...base, data: { fotos: [{ product_ids: [1] }] } }] }), /al menos 2 fotos/);
  assert.throws(() => validateConfig({ blocks: [{ ...base, data: { fotos: [{ product_ids: [1] }, { product_ids: [] }] } }] }), /la foto 2 está vacía/);
  const ok = validateConfig({ blocks: [{ ...base, data: { fotos: [{ product_ids: [1] }, { image: 'https://x.test/a.jpg', product_ids: [] }] } }] });
  assert.equal(ok.blocks[0].data.card_style, 'etiqueta');
  assert.deepEqual(ok.blocks[0].data.fotos[0].product_ids, [1]);
});
