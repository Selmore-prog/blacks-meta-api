const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, dateRange, normalizePosts } = require('../src/whatsappChannel');
const { buildPlanPrompt } = require('../src/planner');

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
