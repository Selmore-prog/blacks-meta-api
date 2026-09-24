const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBrief, briefIssues, fitBriefTiming } = require('../src/reelBrief');
const { parseForecast, weatherBand } = require('../src/weather');
const { qualifies } = require('../src/shippingBadge');

test('el guion ata producto real y duración a tomas consecutivas', () => {
  const brief = normalizeBrief({ product_id: 42, duration_sec: 25, shots: [
    { seconds: '0-2', record: 'Mostrar paquete' },
    { seconds: '2-18', record: 'Abrir y mostrar prenda' },
  ] }, null, [42]);
  assert.equal(brief.product_id, 42);
  assert.equal(brief.duration_sec, 18);
  assert.throws(() => normalizeBrief({ shots: [
    { seconds: '0-2', record: 'Inicio' }, { seconds: '3-18', record: 'Final' },
  ] }));
});

test('un guion no se guarda con voz imposible, frases acartonadas ni preparación cortada', () => {
  const preparation = 'Prepará una prenda con su etiqueta visible, una mesa y buena luz para mostrar los detalles sin agregar productos de utilería.';
  const draft = {
    product_id: null, preparation, hook: 'Mirá la etiqueta antes de lavar',
    shots: [
      { seconds: '0-2', record: 'El presentador muestra la etiqueta', say: 'Mirá bien la etiqueta de cuidado antes de lavar esta prenda', on_screen: 'Mirá la etiqueta' },
      { seconds: '2-12', record: 'Mostrá la etiqueta de cerca', say: 'Cada prenda trae indicaciones propias.', on_screen: 'Seguí las indicaciones' },
    ],
  };
  const issues = briefIssues(draft);
  assert.ok(issues.some((issue) => issue.includes('palabras habladas')));
  assert.ok(issues.some((issue) => issue.includes('acartonadas')));
  const normalized = normalizeBrief(draft, null, []);
  assert.equal(normalized.preparation, preparation);
  assert.equal(normalized.version, 2);
});

test('un guion educativo no inventa cuidados ni nombra un modelo sin asociarlo', () => {
  const draft = {
    product_id: null, preparation: 'Prepará una prenda y una mesa.',
    shots: [
      { seconds: '0-3', record: 'Mostrá la prenda', say: 'Lavá en frío la Chomba Micropique Pampero.', on_screen: '' },
      { seconds: '3-15', record: 'Mostrá la etiqueta', say: 'Revisá la etiqueta.', on_screen: '' },
    ],
  };
  const issues = briefIssues(draft, { products: [{ id: 42, name: 'Chomba Micropique Pampero' }] });
  assert.ok(issues.some((issue) => issue.includes('product_id es null')));
  assert.ok(issues.some((issue) => issue.includes('etiqueta')));
});

test('la corrección final conserva frases completas y da tiempo suficiente a la voz', () => {
  const draft = {
    product_id: null,
    preparation: 'Prepará una mesa limpia y una prenda con su etiqueta de cuidado visible.',
    caption: 'Mirá la etiqueta de cada prenda. Lavá en frío y usá detergente suave. Así cuidás mejor la ropa que usás todos los días.',
    shots: [
      { seconds: '0-2', record: 'Mostrá la Chomba Micropique Pampero', say: 'Antes de lavar, mirá bien la etiqueta de cuidado de tu prenda.', on_screen: 'Mirá la etiqueta' },
      { seconds: '2-12', record: 'Mostrá la etiqueta', say: 'Lavá en frío. Cada prenda tiene indicaciones distintas.', on_screen: 'Seguí la etiqueta' },
    ],
  };
  const fitted = fitBriefTiming(draft, [{ id: 42, name: 'Chomba Micropique Pampero' }], []);
  assert.deepEqual(briefIssues(fitted, { products: [{ id: 42, name: 'Chomba Micropique Pampero' }] }), []);
  assert.ok(fitted.shots[0].seconds.endsWith('-5'));
  assert.ok(!JSON.stringify(fitted).includes('Chomba Micropique Pampero'));
  assert.ok(!fitted.caption.includes('Lavá en frío'));
});

test('el pronóstico agrupa intervalos en el día local de CABA', () => {
  const days = parseForecast({ properties: { timeseries: [
    { time: '2026-09-25T01:00:00Z', data: { instant: { details: { air_temperature: 25 } } } },
    { time: '2026-09-25T14:00:00Z', data: { instant: { details: { air_temperature: 12 } } } },
  ] } });
  assert.deepEqual(days.map((d) => d.date), ['2026-09-24', '2026-09-25']);
  assert.equal(weatherBand(days[0]), 'calor');
  assert.equal(weatherBand(days[1]), 'frio');
});

test('el envío gratis usa el precio visible después del descuento', () => {
  const min = Number(process.env.FREE_SHIPPING_MIN || 45000);
  assert.equal(qualifies({ price: min + 5000, promo_price: min - 5000, raw: { free_shipping: false } }), false);
  assert.equal(qualifies({ price: min + 5000, promo_price: min + 1000, raw: { free_shipping: false } }), true);
  assert.equal(qualifies({ price: min + 5000, promo_price: min - 5000, raw: { free_shipping: true } }), true);
});
