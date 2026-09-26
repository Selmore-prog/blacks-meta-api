const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, dateRange, normalizePosts } = require('../src/whatsappChannel');
const { buildPlanPrompt } = require('../src/planner');
const { completeMessage, currentPrice, benefitsFromConfig, verifiedBenefitsConfig,
  normalizeChannelTone } = require('../src/channelCommerce');
const { reviewPosts } = require('../src/channelEditorial');

test('la semana del canal conserva fechas reales, incluso al cambiar de mes', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.deepEqual(dateRange('2026-09-29', 7), [
    '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    '2026-10-03', '2026-10-04', '2026-10-05',
  ]);
});

test('no se guarda una tanda incompleta ni un producto fuera del stock elegible', () => {
  const dates = ['2026-09-25', '2026-09-26'];
  const valid = { date: dates[0], kind: 'encuesta', topic: 'Talles', body: '¿Qué buscás?',
    poll_options: ['Ropa', 'Calzado'], product_id: 42 };
  assert.throws(() => normalizePosts([valid], dates, [{ id: 42 }]), /Falta una propuesta/);
  assert.throws(() => normalizePosts([{ ...valid, product_id: 99 }], dates.slice(0, 1), [{ id: 42 }]), /producto sin stock apto/);
  assert.deepEqual(normalizePosts([valid], dates.slice(0, 1), [{ id: 42 }])[0].poll_options, ['Ropa', 'Calzado']);
});

test('el plan mensual recibe la frecuencia de reels elegida', () => {
  const prompt = buildPlanPrompt('2026-10', {
    commercialDates: [], topProducts: [], insights: { pillars: [] }, recentTopics: [],
    weatherDays: [], bestHours: [], store: null, wholesale: null,
  }, { reelsPerWeek: 4 });
  assert.match(prompt, /4 reels por semana/);
  assert.match(prompt, /No repitas el mismo producto/);
});

test('el mensaje minorista usa precio promocional y beneficios configurados con link directo', () => {
  const product = { name: 'Pantalón cargo', permalink: 'pantalon-cargo', price: '65000', promo_price: '59000', raw: {} };
  const benefits = { enabled: true, items: [
    { text: 'Envío gratis a partir de $55.000' }, { text: 'Hasta 6 cuotas sin interés' },
  ] };
  assert.equal(currentPrice(product), 59000);
  assert.equal(benefitsFromConfig(benefits).shippingThreshold, 55000);
  const message = completeMessage('Atención, volvió a ingresar el pantalón cargo 👖', [product], 'minorista', benefits, null);
  assert.match(message, /^Ya está disponible otra vez el pantalón cargo/);
  assert.match(message, /Precio: \$59\.000/);
  assert.match(message, /Envío gratis/);
  assert.match(message, /6 cuotas sin interés/);
  assert.match(message, /https:\/\/blacksindumentaria\.com\.ar\/productos\/pantalon-cargo\//);
});

test('el mensaje mayorista dirige a consultas sin precio ni beneficios minoristas', () => {
  const product = { name: 'Pantalón cargo', permalink: 'pantalon-cargo', price: 65000, raw: {} };
  const message = completeMessage('Gran noticia: reingresó el pantalón', [product], 'mayorista',
    { enabled: true, items: [{ text: 'Hasta 6 cuotas sin interés' }] }, { contact: 'WhatsApp 11 1234-5678' });
  assert.match(message, /Volvió a estar disponible/);
  assert.match(message, /Consultas mayoristas: WhatsApp 11 1234-5678/);
  assert.match(message, /\/productos\/pantalon-cargo\//);
  assert.doesNotMatch(message, /Precio:|cuotas sin interés/);
  assert.equal(normalizeChannelTone('Che, atención: reingresó el pantalón'), 'Volvió a estar disponible el pantalón');
});

test('varios productos muestran su precio individual y omiten beneficios sin configurar', () => {
  const products = [
    { name: 'Pantalón A', permalink: 'pantalon-a', price: 42000, raw: {} },
    { name: 'Pantalón B', permalink: 'pantalon-b', price: 68000, raw: {} },
  ];
  const message = completeMessage('Dos opciones para elegir 👖', products, 'minorista', null, null);
  assert.match(message, /Pantalón A: \$42\.000/);
  assert.match(message, /Pantalón B: \$68\.000/);
  assert.match(message, /\/productos\/pantalon-a\//);
  assert.match(message, /\/productos\/pantalon-b\//);
  assert.doesNotMatch(message, /envío gratis|cuotas sin interés/i);
});

test('las cuotas se recuperan de datos recientes de la tienda y se omiten si están vencidos', () => {
  const facts = { facts_summary: '- Hasta 6 cuotas sin interés\n- Envío gratis en compras desde $55.000',
    updated_at: new Date().toISOString() };
  const current = benefitsFromConfig(verifiedBenefitsConfig(null, facts));
  assert.match(current.installment, /6 cuotas sin interés/);
  assert.equal(current.shippingThreshold, 55000);
  assert.equal(benefitsFromConfig(verifiedBenefitsConfig(null,
    { ...facts, updated_at: '2020-01-01T00:00:00Z' })).installment, null);
});

test('el canal detecta artículos usados antes o planificados después y títulos repetidos', () => {
  const posts = [{ date: '2026-09-27', kind: 'texto', topic: 'Un detalle útil del jean',
    body: 'El corte recto permite combinarlo con prendas de trabajo.', product_id: 42 }];
  const surrounding = [
    { post_date: '2026-09-25', topic: 'Otro jean', body: 'Un texto distinto', product_id: 42 },
    { post_date: '2026-09-29', topic: 'Un detalle útil del jean', body: 'Otro texto', product_id: 99 },
  ];
  const issues = reviewPosts(posts, surrounding, [{ id: 42, name: 'Jean recto' }]);
  assert.ok(issues.some((issue) => /repite un producto/.test(issue)));
  assert.ok(issues.some((issue) => /repite el tema/.test(issue)));
});

test('el canal rechaza usar lluvia para vender un jean común', () => {
  const post = { date: '2026-09-27', kind: 'texto', topic: 'Vestir en días de lluvia',
    body: 'Si llueve, elegí este jean para estar cómodo.', product_id: 42 };
  assert.match(reviewPosts([post], [], [{ id: 42, name: 'Jean vaquero recto' }]).join(' '), /lluvia\/clima/);
  assert.deepEqual(reviewPosts([{ ...post, product_id: 43 }], [], [
    { id: 43, name: 'Piloto impermeable' },
  ]), []);
  assert.match(reviewPosts([{ ...post, topic: 'Una remera para cualquier clima', body: 'Mirá la tela.' }], [],
    [{ id: 42, name: 'Jean vaquero recto' }]).join(' '), /lluvia\/clima/);
});

test('el canal compara el texto editorial sin confundir pies comerciales', () => {
  const first = { date: '2026-09-25', topic: 'Una opción práctica',
    body: 'Una prenda versátil para acompañarte durante toda la jornada.\n\n💰 Precio: $32.999\n🛒 Comprá acá: https://example.com',
    product_id: 10 };
  const second = { date: '2026-09-28', topic: 'Para la jornada',
    body: 'Una prenda versátil para acompañarte durante toda la jornada.\n\n💰 Precio: $58.999', product_id: 11 };
  assert.match(reviewPosts([second], [first], []).join(' '), /texto se parece demasiado/);
  assert.deepEqual(reviewPosts([{ ...second, body: 'La elección del talle puede cambiar cómo se siente una prenda al usarla.' }],
    [{ ...first, product_id: null, body: '💰 Precio: $32.999\n🛒 Comprá acá: https://example.com' }], []), []);
});

test('la tanda no puede recomendar el mismo artículo dos veces y varía el pie comercial', () => {
  const posts = [
    { date: '2026-09-25', kind: 'texto', topic: 'Cómo elegir un cargo', body: 'Mirá el corte del cargo.', product_id: 42 },
    { date: '2026-09-28', kind: 'texto', topic: 'Otra opción de cargo', body: 'Otra forma de usarlo.', product_id: 42 },
  ];
  assert.match(reviewPosts(posts, [], [{ id: 42, name: 'Pantalón cargo' }]).join(' '), /repite un producto/);
  const product = { name: 'Pantalón cargo', permalink: 'pantalon-cargo', price: 42000, raw: {} };
  const benefits = { enabled: true, items: [{ text: 'Hasta 6 cuotas sin interés' }] };
  const first = completeMessage('Un corte práctico.', [product], 'minorista', benefits, null, 0);
  const second = completeMessage('Mirá el detalle.', [product], 'minorista', benefits, null, 1);
  assert.notEqual(first.split('\n\n')[1], second.split('\n\n')[1]);
  assert.match(second, /\$42\.000/);
  assert.match(second, /6 cuotas sin interés/);
});

test('la revisión editorial rechaza clichés y recomendaciones con estructura idéntica', () => {
  const posts = [
    { date: '2026-09-25', kind: 'texto', topic: 'A', body: 'Es ideal para cualquier momento.', product_id: 1 },
    { date: '2026-09-26', kind: 'texto', topic: 'B', body: 'Tiene un corte recto y cierre metálico.', product_id: 2 },
    { date: '2026-09-27', kind: 'texto', topic: 'C', body: 'La tela es gabardina elastizada.', product_id: 3 },
  ];
  const issues = reviewPosts(posts, [], []);
  assert.ok(issues.some((issue) => /frase genérica/.test(issue)));
  assert.ok(issues.some((issue) => /un solo bloque/.test(issue)));
});

test('la revisión editorial detecta aperturas de plantilla en la tanda', () => {
  const posts = [
    { date: '2026-09-25', kind: 'texto', topic: 'A', body: 'Nuestra camisa tiene cierre metálico.', product_id: 1 },
    { date: '2026-09-26', kind: 'texto', topic: 'B', body: 'Para una jornada de trabajo, mirá los bolsillos.', product_id: 2 },
    { date: '2026-09-27', kind: 'texto', topic: 'C', body: 'Nuestro botín tiene suela de goma.', product_id: 3 },
  ];
  assert.match(reviewPosts(posts, [], []).join(' '), /apertura formularia/);
});
