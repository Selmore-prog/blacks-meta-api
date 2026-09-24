const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBrief } = require('../src/reelBrief');
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
