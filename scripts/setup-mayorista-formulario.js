#!/usr/bin/env node
/* =========================================================================
 * MAYORISTA CON FORMULARIO DE META (prueba) — oct-2026
 *
 * POR QUÉ EXISTE (Sebastián, 15-oct-2026)
 * "No me paran de llegar mensajes de revendedores" aun después de reorientar
 * el mayorista a empresas (7-oct). Sospechaba del píxel: la campaña mayorista
 * NO usa el píxel (optimiza "conversación de WhatsApp iniciada", sin públicos),
 * así que un píxel nuevo no cambia nada. Lo medido del 7 al 15-oct:
 *  · "Video · 4 pantalones de trabajo" trajo 73 de 77 conversaciones (95%):
 *    un catálogo de productos, lo que busca un revendedor. Las piezas de
 *    empresa (90 chombas bordadas, chombas para tu empresa) recibieron $574 y
 *    $141: Meta optimiza por quién ESCRIBE, y el revendedor escribe a todos
 *    los proveedores. Ese anuncio quedó en pausa el 15-oct.
 *
 * QUÉ PRUEBA: el mismo público, pero en vez de abrir WhatsApp de una abre un
 * formulario instantáneo de BAJA FRICCIÓN que igual califica:
 *  · Nombre y teléfono vienen precargados de Facebook; la empresa también
 *    cuando Facebook la sabe. Sólo dos preguntas de un toque:
 *    "¿Para qué es la compra?" (uniformes para mi equipo / para revender) y
 *    "¿Para cuántas personas?". El revendedor puede seguir llegando (Sebastián
 *    también le vende), pero llega MARCADO y Kommo lo manda a otro lado.
 *  · Tipo "más volumen" (sin pantalla de revisión): Sebastián pidió calidad
 *    sin fricción.
 *  · Pantalla final con botón a WhatsApp y el MISMO mensaje precargado del
 *    mayorista ("Hola! Quiero cotizar ropa de trabajo para mi empresa."), que
 *    Kommo usa para mandar la charla al embudo mayorista.
 *  · Los contactos entran a Kommo con su integración de formularios de
 *    Facebook (Leads → Automatizar → Agregar fuente → Facebook → Lead Ads
 *    Form). Hay que conectarla ANTES de activar: si no, quedan sólo en el
 *    centro de clientes potenciales de Meta y nadie los llama.
 *  · Todo lo que promete sale de company_facts: logo bordado o estampado,
 *    muestra digital para aprobar antes de producir, Factura A.
 *
 * Presupuesto: no suma plata. --activar baja el conjunto de WhatsApp de
 * $4.000 a $2.000 por día y prende éste con $2.000.
 *
 *   node scripts/setup-mayorista-formulario.js              → vista previa
 *   node scripts/setup-mayorista-formulario.js --aplicar    → crea formulario, conjunto y anuncios EN PAUSA
 *   node scripts/setup-mayorista-formulario.js --activar    → reparte el presupuesto y lo prende
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';
const CAMPANA = '120250763176950783'; // Motor | Mayorista | WhatsApp (OUTCOME_LEADS, presupuesto por conjunto)
const CONJUNTO_WA = '120250763665960783'; // Mayorista · WhatsApp · Empresas (de ahí sale el público)
const WHATSAPP = '5491153248230';
const PRECARGADO = 'Hola! Quiero cotizar ropa de trabajo para mi empresa.';

const PRESUPUESTO = 2000; // pesos por día, para cada uno de los dos conjuntos al activar

const FORMULARIO = 'Mayorista · Empresas · Uniformes · 2026-10';
const CONJUNTO = 'Mayorista · Formulario · Empresas';

const formulario = {
  name: FORMULARIO,
  locale: 'es_LA',
  is_optimized_for_quality: false, // "más volumen": sin pantalla de revisión
  block_display_for_non_targeted_viewer: true,
  context_card: {
    title: 'Uniformes para tu equipo, con tu logo',
    style: 'LIST_STYLE',
    content: [
      'Bordamos o estampamos el logo de tu empresa',
      'Te mandamos una muestra digital para aprobar antes de producir',
      'Emitimos Factura A',
    ],
    button_text: 'Pedir cotización',
  },
  question_page_custom_headline: 'Contanos de tu empresa',
  questions: [
    { type: 'FULL_NAME' },
    { type: 'PHONE' },
    { type: 'COMPANY_NAME' },
    {
      type: 'CUSTOM',
      key: 'uso',
      label: '¿Para qué es la compra?',
      options: [
        { key: 'equipo', value: 'Uniformes para mi equipo' },
        { key: 'reventa', value: 'Para revender' },
      ],
    },
    {
      type: 'CUSTOM',
      key: 'personas',
      label: '¿Para cuántas personas?',
      options: [
        { key: 'menos_10', value: 'Menos de 10' },
        { key: '10_30', value: 'Entre 10 y 30' },
        { key: '31_100', value: 'Entre 31 y 100' },
        { key: 'mas_100', value: 'Más de 100' },
      ],
    },
  ],
  privacy_policy: {
    url: 'https://blacksindumentaria.com.ar/politica-de-privacidad/',
    link_text: 'Política de privacidad',
  },
  thank_you_page: {
    title: '¡Gracias! Ya recibimos tus datos',
    body: 'Te vamos a escribir por WhatsApp para cotizarte. Si querés adelantarte, escribinos ahora.',
    button_type: 'VIEW_WEBSITE',
    button_text: 'Escribinos por WhatsApp',
    website_url: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(PRECARGADO)}`,
  },
};

// Mismos videos y portadas que los anuncios de empresa del conjunto de WhatsApp;
// cambia el cierre del texto y el botón.
const ANUNCIOS = [
  {
    nombre: 'Formulario · 90 chombas bordadas para un cliente',
    de: '120250845677370783',
    texto: 'Así quedó un pedido de 90 chombas para un cliente: logos bordados y cinta reflectiva en frente y espalda. '
      + 'Hacemos los uniformes de tu equipo con el logo de tu empresa, bordado o estampado, con muestra digital para '
      + 'aprobar antes de producir. Emitimos Factura A. Pedí tu cotización: dejanos tus datos y te escribimos por WhatsApp.',
  },
  {
    nombre: 'Formulario · Chombas para tu empresa',
    de: '120250845673140783',
    texto: 'Chombas Pampero de micropiqué para el equipo de tu empresa, con tu logo bordado o estampado. Antes de '
      + 'producir te mandamos una muestra digital para aprobar, y emitimos Factura A. Pedí tu cotización: dejanos tus '
      + 'datos y te escribimos por WhatsApp.',
  },
];

/* ------------------------------- Utilidades ------------------------------- */

async function fbGet(p, token = TOKEN) {
  const res = await fetch(`${GRAPH}/${API}/${p}${p.includes('?') ? '&' : '?'}access_token=${token}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
  return d;
}

async function fbPost(p, campos, token = TOKEN) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  body.append('access_token', token);
  const res = await fetch(`${GRAPH}/${API}/${p}`, { method: 'POST', body });
  const d = await res.json();
  if (d.error) throw new Error(`${d.error.error_user_title ? d.error.error_user_title + ': ' : ''}${d.error.error_user_msg || d.error.message} [${d.error.code}/${d.error.error_subcode || ''}]`);
  return d;
}

const TODOS = encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED']));
async function buscar(edge, nombre) {
  const d = await fbGet(`${edge}?fields=id,name,effective_status&limit=200&effective_status=${TODOS}`);
  return (d.data || []).find((x) => x.name === nombre);
}

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const base = await fbGet(`${CONJUNTO_WA}?fields=targeting,daily_budget`);
  const t = base.targeting;
  const targeting = {
    geo_locations: t.geo_locations,
    age_min: t.age_min,
    age_max: t.age_max,
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: t.publisher_platforms,
    facebook_positions: t.facebook_positions,
    instagram_positions: t.instagram_positions,
  };

  console.log(`\n${CONJUNTO} · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  público: edad ${targeting.age_min}-${targeting.age_max}, ${JSON.stringify(targeting.geo_locations.countries)} · fb ${targeting.facebook_positions} · ig ${targeting.instagram_positions}`);
  console.log(`  formulario "${FORMULARIO}": ${formulario.questions.map((q) => q.label || q.type).join(' · ')}`);
  for (const a of ANUNCIOS) console.log(`  anuncio "${a.nombre}" (video de ${a.de})\n    ${a.texto}`);
  console.log(`  presupuesto al activar: WhatsApp $${(base.daily_budget / 100).toLocaleString('es-AR')} → $${PRESUPUESTO.toLocaleString('es-AR')} · formulario $${PRESUPUESTO.toLocaleString('es-AR')}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  // El formulario se crea con el token de la PÁGINA que sale del usuario del sistema.
  const { access_token: tokenPagina } = await fbGet(`${PAGINA}?fields=access_token`);
  const formularios = await fbGet(`${PAGINA}/leadgen_forms?fields=id,name,status&limit=100`, tokenPagina);
  let form = (formularios.data || []).find((f) => f.name === FORMULARIO);
  if (!form) {
    form = await fbPost(`${PAGINA}/leadgen_forms`, formulario, tokenPagina);
    console.log(`✓ formulario ${form.id}`);
  } else console.log(`· formulario ya existía ${form.id}`);

  let conjunto = await buscar(`${CAMPANA}/adsets`, CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: CAMPANA,
      status: 'PAUSED',
      daily_budget: PRESUPUESTO * 100, // centavos
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      destination_type: 'ON_AD',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { page_id: PAGINA },
      targeting,
    });
    console.log(`✓ conjunto ${conjunto.id} (en pausa)`);
  } else console.log(`· conjunto ya existía ${conjunto.id} (${conjunto.effective_status})`);

  for (const a of ANUNCIOS) {
    const ya = await buscar(`${conjunto.id}/ads`, a.nombre);
    if (ya) { console.log(`· anuncio ya existía ${ya.id}`); continue; }
    const origen = await fbGet(`${a.de}?fields=creative{object_story_spec}`);
    const v = origen.creative.object_story_spec.video_data;
    const cr = await fbPost(`${CUENTA}/adcreatives`, {
      name: `Pieza ${a.nombre}`,
      object_story_spec: {
        page_id: PAGINA,
        instagram_user_id: IG_USER,
        video_data: {
          video_id: v.video_id,
          image_hash: v.image_hash,
          title: v.title,
          message: a.texto,
          call_to_action: { type: 'GET_QUOTE', value: { lead_gen_form_id: form.id } },
        },
      },
    });
    // Nace activo dentro del conjunto en pausa: pasa la revisión ahora.
    const ad = await fbPost(`${CUENTA}/ads`, { name: a.nombre, adset_id: conjunto.id, creative: { creative_id: cr.id }, status: 'ACTIVE' });
    console.log(`✓ anuncio ${a.nombre} → ${ad.id}`);
  }

  if (activar) {
    await fbPost(CONJUNTO_WA, { daily_budget: PRESUPUESTO * 100 });
    console.log(`✓ WhatsApp a $${PRESUPUESTO.toLocaleString('es-AR')}/día`);
    await new Promise((r) => setTimeout(r, 31_000)); // límite de 1 edición de conjunto cada 30 s (#613)
    await fbPost(conjunto.id, { status: 'ACTIVE' });
    console.log(`✓ ${CONJUNTO} ACTIVO a $${PRESUPUESTO.toLocaleString('es-AR')}/día`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
