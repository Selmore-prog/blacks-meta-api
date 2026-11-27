#!/usr/bin/env node
/* =========================================================================
 * CAMPAÑA DE CYBER BLACKS (2, 3 y 4 de noviembre de 2026)
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 1-nov-2026, 21 h)
 * "Activar ya la publicidad del Cyber, sin precios, que sea más de que hay
 * Cyber en mi página". Los precios Cyber todavía no estaban cargados en la
 * tienda, así que las placas (anuncios/2026-11/cyber-blacks/sin-precio.json)
 * no prometen ningún número: dicen CYBER BLACKS, la fecha y "los más
 * vendidos a precio Cyber". Arranca apenas Meta aprueba los anuncios.
 *
 * POR QUÉ ASÍ
 *  · CAMPAÑA APARTE, con su presupuesto ($8.000/día, elegido por Sebastián):
 *    meter anuncios nuevos en el 02 le reinicia el aprendizaje, y dentro de
 *    la campaña minorista (CBO) el jean del 02 le ganaría toda la plata.
 *  · OPTIMIZA COMPRA con el píxel de la tienda, como el 02.
 *  · SIN EXCLUSIONES: el 02 deja afuera a compradores, carritos y visitantes
 *    de 90 días (son del remarketing). En el Cyber esos son justamente los
 *    que más compran: acá entran todos. Edad fija 25-64 como el resto
 *    (65+ visita y no compra) y la misma zona que el 02.
 *  · Ubicaciones como el 04: Instagram completo + Reels de Facebook (el feed
 *    de Facebook gastó $37.297 sin compras en octubre).
 *  · TERMINA SOLA el 4-nov a las 23:59: las placas dicen "2, 3 y 4 de
 *    noviembre". Si el Cyber se estira, regenerar las placas con la fecha
 *    nueva y correr con --fin.
 *
 *   node scripts/setup-cyber-blacks.js              → vista previa
 *   node scripts/setup-cyber-blacks.js --aplicar    → crea campaña y conjunto EN PAUSA
 *   node scripts/setup-cyber-blacks.js --activar    → los prende (con anuncios ya subidos)
 *   ... --presupuesto 8000 · --fin 2026-11-04T23:59:00-0300
 *
 * Los anuncios los sube scripts/subir-anuncios.js con
 * anuncios/2026-11/cyber-blacks/subir.json.
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const CONJUNTO_02 = '120250779709150783'; // de ahí salen la zona y la atribución

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PRESUPUESTO = Number(arg('presupuesto', 8000));
const FIN = arg('fin', '2026-11-04T23:59:00-0300');

const CAMPANA = 'Motor | Cyber Blacks | Web';
const CONJUNTO = 'Cyber Blacks · Todos 25-64 · Compra';

async function fbGet(p) {
  const res = await fetch(`${GRAPH}/${API}/${p}${p.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
  return d;
}

async function fbPost(p, campos) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  body.append('access_token', TOKEN);
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

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const base = await fbGet(`${CONJUNTO_02}?fields=targeting,attribution_spec`);
  const targeting = {
    geo_locations: base.targeting.geo_locations,
    age_min: 25,
    age_max: 64,
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: ['instagram', 'facebook'],
    instagram_positions: ['stream', 'story', 'explore', 'reels', 'profile_feed'],
    facebook_positions: ['facebook_reels'],
  };

  console.log(`\n${CAMPANA} › ${CONJUNTO} · $${PRESUPUESTO.toLocaleString('es-AR')}/día hasta ${FIN} · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  optimiza compra · edad ${targeting.age_min}-${targeting.age_max} · sin exclusiones · ig ${targeting.instagram_positions} · fb ${targeting.facebook_positions}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_SALES',
      special_ad_categories: [],
      // Presupuesto por conjunto (ABO): Meta exige decirlo explícito en campañas nuevas.
      is_adset_budget_sharing_enabled: false,
      status: 'PAUSED',
    });
    console.log(`✓ campaña ${campana.id} (en pausa)`);
  } else console.log(`· campaña ya existía ${campana.id} (${campana.effective_status})`);

  let conjunto = await buscar(`${campana.id}/adsets`, CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: campana.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' },
      attribution_spec: base.attribution_spec,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: Math.round(PRESUPUESTO * 100), // centavos
      end_time: FIN,
      targeting,
      status: 'PAUSED',
    });
    console.log(`✓ conjunto ${conjunto.id} (en pausa)`);
  } else console.log(`· conjunto ya existía ${conjunto.id} (${conjunto.effective_status})`);

  if (activar) {
    const ads = await fbGet(`${conjunto.id}/ads?fields=id&limit=50&effective_status=${TODOS}`);
    if (!(ads.data || []).length) throw new Error('El conjunto no tiene anuncios: subilos con scripts/subir-anuncios.js anuncios/2026-11/cyber-blacks/subir.json --aplicar');
    await fbPost(conjunto.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO * 100), end_time: FIN });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ ACTIVA a $${PRESUPUESTO.toLocaleString('es-AR')}/día hasta ${FIN}`);
  }
  console.log(`\nconjunto: ${conjunto.id}`);
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
