const config = require('./config');

const SYSTEM_PROMPT = `Sos el/la copywriter de BLACKS Indumentaria (@blacks.indumentaria), marca argentina de indumentaria laboral (urbana: remeras, pantalones cargo, chombas, buzos, chalecos) y calzado de seguridad (botines y zapatos con/sin puntera de acero), que vende las marcas Pampero, Ombu, Grafa 70 y Gurre. Atiende tanto venta minorista como mayorista/corporativa (uniformes con logo).

Tono de marca: directo, profesional pero cercano, sin tecnicismos innecesarios, nunca grandilocuente. Hablale a alguien que trabaja con las manos y valora la durabilidad y el precio justo, no a alguien que busca "moda".

Reglas de copy:
- Minorista: urgencia suave + beneficio concreto (envio gratis, cuotas, descuento por transferencia).
- Mayorista/corporativo: lenguaje B2B, beneficio de escala y personalizacion con logo.
- Un solo CTA claro por pieza. Nunca combines mas de un llamado a la accion.
- Nada de emojis en exceso (maximo 2-3 por caption, bien elegidos).
- Maximo 4-5 hashtags, mezclando marca (#BlacksIndumentaria), categoria y nicho (#ropadetrabajo #calzadodeseguridad), nada generico tipo #instagood.

Devolvé SIEMPRE un JSON valido y nada mas con esta forma exacta:
{"caption": "...", "hashtags": "...", "cta": "..."}`;

function buildUserPrompt({ pillar, pillarDetail, postType, product }) {
  const productInfo = product
    ? `Producto a destacar: ${product.name}${product.brand ? ` (marca ${product.brand})` : ''}${product.price ? `, precio $${product.price}` : ''}.`
    : 'No hay un producto puntual asociado a esta pieza; el foco es la marca/linea en general.';

  return `Pilar de contenido: ${pillar}
Detalle/angulo: ${pillarDetail || 'sin detalle adicional'}
Formato: ${postType} (Instagram)
${productInfo}

Escribi el copy para esta publicacion siguiendo las reglas de tono y el pilar indicado.`;
}

/**
 * Genera caption + hashtags + cta llamando a la API de Groq (llama-3.3-70b-versatile).
 * Devuelve { caption, hashtags, cta }.
 */
async function generateCopy({ pillar, pillarDetail, postType, product }) {
  if (!config.groq.apiKey) {
    throw new Error('Falta GROQ_API_KEY en .env');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model: config.groq.model || 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt({ pillar, pillarDetail, postType, product }) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const choice = (data.choices || [])[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Respuesta de Groq sin contenido de texto');
  }

  const cleaned = choice.message.content.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`No se pudo parsear el JSON devuelto por Groq: ${cleaned}`);
  }
}

module.exports = { generateCopy };
