const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, dateRange, normalizePosts } = require('../src/whatsappChannel');
const { buildPlanPrompt } = require('../src/planner');
const { completeMessage, currentPrice, benefitsFromConfig, verifiedBenefitsConfig,
  normalizeChannelTone } = require('../src/channelCommerce');

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
