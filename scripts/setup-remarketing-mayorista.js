#!/usr/bin/env node
/* =========================================================================
 * REMARKETING MAYORISTA POR WHATSAPP — nov-2026
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 24-nov-2026)
 * El 87% de las visitas pagas de Google son mayoristas: $553.000 en 30 días,
 * 144 consultas y 96 de cada 100 se van sin escribir. Meta no les mostraba nada
 * mayorista. Pidió que sea por WhatsApp y que NO traiga consultas de gente que
 * no está interesada.
 *
 * LOS FILTROS (cada uno sale de algo medido, no de una corazonada)
 *  1. Público: sólo quien entró a una página /mayorista del sitio en 90 días
 *     (casi todos llegaron buscando en Google). En octubre, a gente fría, el
 *     anuncio de WhatsApp trajo 94 consultas en Kommo y 2 presupuestos.
 *     Sin expansión de público.
 *  2. Afuera: quien ya consultó (Contact o Lead, 90 días) y los clientes
 *     mayoristas de Kommo, que ya tienen vendedor.
 *  3. Horario: lunes a viernes de 8 a 17. Del 25-oct al 24-nov, de las consultas
 *     que entraron en ese horario 24 de 174 llegaron a presupuesto (14%); fuera
 *     de horario, 2 de 98. El equipo contesta sólo en esa franja.
 *     Meta pide presupuesto TOTAL (no diario) para poder elegir horarios.
 *  4. La persona ELIGE el tamaño de su equipo en vez de mandar un texto ya
 *     escrito (con el precargado, 42% mandaba eso y no contestaba más). Las tres
 *     primeras opciones empiezan con la frase que Kommo ya reconoce como
 *     mayorista; la cuarta es para el que busca una prenda suelta, que va al
 *     camino minorista sin ocupar a un vendedor.
 *  5. Nada de "4 pantalones" (138 conversaciones, imán de revendedores): sólo
 *     videos de uniformes con logo. Los textos dicen "equipos de 10 personas o
 *     más", Factura A y muestra digital.
 *
 *   node scripts/setup-remarketing-mayorista.js              → vista previa
 *   node scripts/setup-remarketing-mayorista.js --aplicar    → públicos, campaña y conjunto EN PAUSA
 *   node scripts/subir-anuncios.js anuncios/2026-12/remarketing-mayorista/anuncios.json --aplicar --en-pausa
 *   node scripts/setup-remarketing-mayorista.js --estado     → tamaño de los públicos y estado
 *   node scripts/setup-remarketing-mayorista.js --activar    → prende todo
 *   node scripts/setup-remarketing-mayorista.js --pausar     → lo apaga
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PAGINA = '1622576497958916';
const PIXEL = '5254594451333358';
const WHATSAPP = '5491153248230';
const CLIENTES_KOMMO = '120250968050330783'; // Kommo · Mayorista · Clientes que compraron

const CAMPANA = 'Motor | Mayorista | Remarketing WhatsApp';
const CONJUNTO = 'Mayorista · Visitó el sitio 90d · Lun a vie 8-17';
const TOTAL = Number(process.env.RMK_MAYORISTA_TOTAL || 28000);
const DESDE = process.env.RMK_MAYORISTA_DESDE || '2026-11-24T12:50:30-0300';
const HASTA = process.env.RMK_MAYORISTA_HASTA || '2026-12-09T17:00:00-0300';

const DIAS_90 = 90 * 86400;
const evento = (nombre, extra = []) => ({
  event_sources: [{ type: 'pixel', id: PIXEL }],
  retention_seconds: DIAS_90,
  filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: nombre }, ...extra] },
});
const PUBLICOS = {
  visito: {
    nombre: 'Motor · Visitó mayorista 90d',
    rule: { inclusions: { operator: 'or', rules: [evento('PageView', [{ field: 'url', operator: 'i_contains', value: '/mayorista' }])] } },
  },
  consulto: {
    nombre: 'Motor · Ya consultó (WhatsApp o formulario) 90d',
    rule: { inclusions: { operator: 'or', rules: [evento('Contact'), evento('Lead')] } },
  },
};

async function fbGet(p, q = {}) {
  const u = new URL(`${GRAPH}/${API}/${p}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  u.searchParams.set('access_token', TOKEN);
  const d = await (await fetch(u)).json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
  return d;
}

async function fbPost(p, campos) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  body.append('access_token', TOKEN);
  const d = await (await fetch(`${GRAPH}/${API}/${p}`, { method: 'POST', body })).json();
  if (d.error) throw new Error(`${d.error.error_user_title ? d.error.error_user_title + ': ' : ''}${d.error.error_user_msg || d.error.message} [${d.error.code}/${d.error.error_subcode || ''}]`);
  return d;
}

const ESTADOS = ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'PREAPPROVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
async function buscar(edge, nombre, conEstado = true) {
  const d = await fbGet(edge, { fields: 'id,name', limit: 200, ...(conEstado ? { effective_status: ESTADOS } : {}) });
  return (d.data || []).find((x) => x.name === nombre);
}

// Meta cuenta los días con domingo = 0 y los minutos desde las 0 hs.
const HORARIO = [{ start_minute: 8 * 60, end_minute: 17 * 60, days: [1, 2, 3, 4, 5], timezone_type: 'ADVERTISER' }];

const segmentacion = (visito, consulto) => ({
  geo_locations: { countries: ['AR'], location_types: ['home', 'recent'] },
  age_min: 25,
  age_max: 64,
  targeting_automation: { advantage_audience: 0 },
  // Sin esto Meta prende SOLO la expansión (custom_audience: 1, visto el 24-nov al
  // releer el conjunto recién creado) y lo muestra a gente que nunca entró al sitio.
  targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
  custom_audiences: [{ id: visito }],
  excluded_custom_audiences: [{ id: consulto }, { id: CLIENTES_KOMMO }],
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed', 'story', 'facebook_reels'],
  instagram_positions: ['stream', 'story', 'reels', 'explore'],
});

async function tamano(nombre, targeting) {
  const d = await fbGet(`${CUENTA}/delivery_estimate`, {
    optimization_goal: 'CONVERSATIONS',
    promoted_object: { page_id: PAGINA, whatsapp_phone_number: WHATSAPP },
    targeting_spec: targeting,
  });
  const e = (d.data || [])[0] || {};
  console.log(`  ${nombre}: ${e.estimate_mau_lower_bound} a ${e.estimate_mau_upper_bound} personas${e.estimate_ready ? '' : ' (Meta todavía lo está armando)'}`);
}

(async () => {
  const arg = (a) => process.argv.includes(a);
  const aplicar = arg('--aplicar');
  console.log(`\n${CAMPANA} › ${CONJUNTO}\n  $${TOTAL.toLocaleString('es-AR')} en total, del ${DESDE.slice(0, 10)} al ${HASTA.slice(0, 10)}, lunes a viernes de 8 a 17`);

  if (arg('--estado') || arg('--activar') || arg('--pausar')) {
    const campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
    if (!campana) throw new Error('Todavía no existe: corré --aplicar');
    const conjunto = await buscar(`${campana.id}/adsets`, CONJUNTO);
    if (arg('--activar') || arg('--pausar')) {
      const status = arg('--activar') ? 'ACTIVE' : 'PAUSED';
      const ads = (await fbGet(`${conjunto.id}/ads`, { fields: 'id,name', effective_status: ESTADOS, limit: 50 })).data || [];
      if (status === 'ACTIVE' && !ads.length) throw new Error('El conjunto no tiene anuncios: falta subir-anuncios.js');
      for (const id of [...ads.map((a) => a.id), conjunto.id, campana.id]) await fbPost(id, { status });
      console.log(`✓ campaña, conjunto y ${ads.length} anuncios → ${status}`);
    }
    const c = await fbGet(conjunto.id, { fields: 'name,status,effective_status,lifetime_budget,start_time,end_time,adset_schedule,pacing_type,optimization_goal,destination_type,promoted_object,targeting' });
    console.log(JSON.stringify(c, null, 1));
    const ads = (await fbGet(`${conjunto.id}/ads`, { fields: 'id,name,status,effective_status,issues_info', effective_status: ESTADOS, limit: 50 })).data || [];
    ads.forEach((a) => console.log(`  ${a.id} ${a.name} · ${a.status} / ${a.effective_status}${a.issues_info ? ' · ' + JSON.stringify(a.issues_info) : ''}`));
    const t = c.targeting;
    await tamano('visitó /mayorista en 90 días', { geo_locations: t.geo_locations, age_min: 18, age_max: 65, custom_audiences: t.custom_audiences });
    await tamano('el público final (con filtros)', t);
    return;
  }
  if (!aplicar) return console.log('\nVista previa. Corré con --aplicar (todo en pausa).');

  const ids = {};
  for (const [clave, p] of Object.entries(PUBLICOS)) {
    let a = await buscar(`${CUENTA}/customaudiences`, p.nombre, false);
    if (!a) {
      a = await fbPost(`${CUENTA}/customaudiences`, { name: p.nombre, rule: p.rule, prefill: true });
      console.log(`✓ público ${a.id} ${p.nombre}`);
    } else console.log(`· público ya existía ${a.id} ${p.nombre}`);
    ids[clave] = a.id;
  }

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_LEADS',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
      status: 'PAUSED',
    });
    console.log(`✓ campaña ${campana.id} (en pausa)`);
  } else console.log(`· campaña ya existía ${campana.id}`);

  let conjunto = await buscar(`${campana.id}/adsets`, CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: campana.id,
      destination_type: 'WHATSAPP',
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      lifetime_budget: Math.round(TOTAL * 100),
      start_time: DESDE,
      end_time: HASTA,
      pacing_type: ['day_parting'],
      adset_schedule: HORARIO,
      promoted_object: { page_id: PAGINA, whatsapp_phone_number: WHATSAPP },
      targeting: segmentacion(ids.visito, ids.consulto),
      status: 'PAUSED',
    });
    console.log(`✓ conjunto ${conjunto.id} (en pausa)`);
  } else {
    // Mismo conjunto, segmentación al día (seguro mientras esté en pausa).
    await fbPost(conjunto.id, { targeting: segmentacion(ids.visito, ids.consulto) });
    console.log(`· conjunto ya existía ${conjunto.id}: segmentación actualizada`);
  }
  console.log('\nPoné este conjunto en "adset" de anuncios/2026-12/remarketing-mayorista/anuncios.json y corré subir-anuncios.js.');
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
