const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { capitalizarOraciones, desdeMayusculas, fixSpelling } = require('../src/textUtils');

/* Plan B del texto: sin crédito en Gemini todo sale por Groq, que tiene un cupo POR
   MODELO. El 29-sep-2026 el modelo principal agotó su cupo del día y la pieza falló. */
test('sin Gemini, el texto sigue saliendo aunque un modelo de Groq agote su cupo del día', async () => {
  const antes = { provider: config.ai.provider, key: config.groq.apiKey, model: config.groq.model, fetch: global.fetch };
  config.ai.provider = 'groq';
  config.groq.apiKey = 'clave-de-prueba';
  config.groq.model = 'openai/gpt-oss-120b';
  const pedidos = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    pedidos.push(body);
    if (body.model === 'openai/gpt-oss-120b') {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199386, Requested 1300. Please try again in 7m26.4s.' } }), { status: 429 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"titular":"Resiste la jornada"}' } }] }), { status: 200 });
  };
  try {
    const { generateJson } = require('../src/ai');
    assert.deepEqual(await generateJson({ prompt: 'Un titular' }), { titular: 'Resiste la jornada' });
    assert.deepEqual(pedidos.map((p) => p.model), ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
    assert.equal(pedidos[1].reasoning_effort, 'none'); // qwen no "piensa": no gasta el cupo en eso
    // El modelo agotado no se vuelve a probar en cada pieza del día.
    pedidos.length = 0;
    await generateJson({ prompt: 'Otro titular' });
    assert.deepEqual(pedidos.map((p) => p.model), ['qwen/qwen3.8-27b']);
  } finally {
    config.ai.provider = antes.provider;
    config.groq.apiKey = antes.key;
    config.groq.model = antes.model;
    global.fetch = antes.fetch;
  }
});

test('el voseo no convierte en orden lo que describe a la prenda', () => {
  assert.equal(capitalizarOraciones('Evalúa la resistencia a tensiones'), 'Evaluá la resistencia a tensiones');
  // "Seca rápido" dice cómo es la prenda: "Secá rápido" cambiaba el sentido.
  assert.equal(capitalizarOraciones('Seca rápido. Lleva bolsillos laterales. Mide 70 cm de largo.'), 'Seca rápido. Lleva bolsillos laterales. Mide 70 cm de largo.');
  assert.equal(capitalizarOraciones('usa tu talle de siempre. cuida tu ropa'), 'Usá tu talle de siempre. Cuidá tu ropa');
});

test('títulos de la IA: en mayúscula se corrigen igual, "cómo" con tilde y nombres propios bien escritos', () => {
  // El modelo a veces escribe el título entero en mayúscula: "EVALÚA" salía sin pasar a voseo.
  assert.equal(desdeMayusculas('EVALÚA LA DURABILIDAD EN USO REAL'), 'Evaluá la durabilidad en uso real');
  assert.equal(desdeMayusculas('CÓMO ELEGIR TU EPP'), 'Cómo elegir tu EPP');
  assert.equal(capitalizarOraciones('Como comprar al por mayor'), 'Cómo comprar al por mayor');
  assert.equal(capitalizarOraciones('Como primer paso, medí tu cintura'), 'Como primer paso, medí tu cintura');
  assert.equal(capitalizarOraciones('Es tan fácil como comprar online'), 'Es tan fácil como comprar online');
  assert.equal(fixSpelling('Escribinos por whatsapp. Retirá en buenos aires. Cada talla.'), 'Escribinos por WhatsApp. Retirá en Buenos Aires. Cada talle.');
});
