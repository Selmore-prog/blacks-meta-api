#!/usr/bin/env node
/* =========================================================================
 * KITS X3 DE REMERAS Y CHOMBAS PARA EL CALOR — oct-2026
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 13-oct-2026)
 * Arranca el calor en AMBA y la pauta vende casi sólo jean: del 7 al 13-oct,
 * 7 de las 9 ventas verificadas que vinieron de Meta fueron jean, y en el 02
 * "22 · Jean en 5 Colores" se llevó el 96% del gasto. Los anuncios sueltos de
 * remera (17) y chomba (16) existen en el 02 pero Meta les dio $34 y $12 en la
 * semana: dentro del mismo conjunto el jean les gana siempre la subasta.
 *
 * QUÉ PRODUCTO: el KIT X3, no el pack x2.
 *  · Remeras: el pack x2 cuesta $38.999 y NO llega al envío gratis ($45.000);
 *    el kit x3 sale $56.997 con envío gratis y es lo más barato por unidad.
 *  · Chombas: el kit x3 ($76.947) deja elegir COLOR Y TALLE DE CADA UNA (el
 *    pack x2 es dos iguales) y sale del stock de la chomba suelta, que es el
 *    triple que el del pack. Es además la foto que ya funciona: la prenda
 *    apilada en sus colores, como el jean en 5 colores.
 *  · Los dos tienen el 5% del kit, 6 cuotas sin interés y 10% por transferencia
 *    (verificado en las fichas el 13-oct-2026).
 *
 * QUÉ ARMA (idempotente: lo que ya existe con el mismo nombre no se duplica)
 *  · Un conjunto de anuncios en la campaña minorista (CBO), al lado del 02,
 *    con el mismo público (25-64 fijo, sin compradores/carrito/visitantes de
 *    90 días) optimizando COMPRA. Ubicaciones como el 03: Instagram completo +
 *    Reels de Facebook (el feed de Facebook gastó $37.297 sin compras).
 *  · Los anuncios los sube scripts/subir-anuncios.js con
 *    anuncios/2026-10/kits-x3/subir.json (nacen activos dentro del conjunto en
 *    pausa: pasan la revisión ahora y arrancan apenas se prende).
 *
 * --activar: prende el conjunto con un piso de gasto (por defecto $2.500) y
 * PAUSA el 03 de catálogo para liberar el suyo: con $14.400 de campaña Meta no
 * acepta dos pisos (ya rechazó $3.000 solo, 100/1885648). El 03 gastó $16.582
 * del 7 al 13-oct con 2 carritos, 0 compras según Meta y 1 venta verificada
 * (un jean, que ya tiene sus anuncios).
 *
 *   node scripts/setup-kits-verano.js              → vista previa
 *   node scripts/setup-kits-verano.js --aplicar    → crea el conjunto EN PAUSA
 *   node scripts/setup-kits-verano.js --activar    → pausa el 03 y prende éste
 *   ... --minimo 2500 → piso diario en pesos (0 = sin piso)
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const CAMPANA = '120250570335540783'; // Motor | Minorista | Primavera 26 (CBO)
const CONJUNTO_02 = '120250779709150783'; // 02 · Prospecting amplio · Compra (de ahí sale el público)
const CONJUNTO_03 = '120250830629400783'; // 03 · Catálogo · Más vendidos · Compra

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const MINIMO = Number(arg('minimo', 2500));

const CONJUNTO = '04 · Kits x3 · Remeras y chombas · Compra';

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
  const t = base.targeting;
  const targeting = {
    geo_locations: t.geo_locations,
    age_min: t.age_min,
    age_max: t.age_max,
    excluded_custom_audiences: (t.excluded_custom_audiences || []).map((a) => ({ id: a.id })),
    targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: ['instagram', 'facebook'],
    instagram_positions: ['stream', 'story', 'explore', 'reels', 'profile_feed'],
    facebook_positions: ['facebook_reels'],
  };

  console.log(`\n${CONJUNTO} · ${aplicar ? (activar ? `ACTIVAR (piso $${MINIMO.toLocaleString('es-AR')}/día, pausa el 03)` : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  edad ${targeting.age_min}-${targeting.age_max} · excluye ${targeting.excluded_custom_audiences.length} públicos · ig ${targeting.instagram_positions} · fb ${targeting.facebook_positions}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let conjunto = await buscar(`${CAMPANA}/adsets`, CONJUNTO);
  if (!conjunto) {
    // Sin piso al crearlo: el piso va recién al activar, cuando el 03 ya soltó el suyo.
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: CAMPANA,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' },
      attribution_spec: base.attribution_spec,
      targeting,
    });
    console.log(`✓ conjunto ${conjunto.id} (en pausa)`);
  } else console.log(`· conjunto ya existía ${conjunto.id} (${conjunto.effective_status})`);

  if (activar) {
    const ads = await fbGet(`${conjunto.id}/ads?fields=id,name,effective_status&limit=50&effective_status=${TODOS}`);
    if (!(ads.data || []).length) throw new Error('El conjunto no tiene anuncios: subilos con scripts/subir-anuncios.js anuncios/2026-10/kits-x3/subir.json --aplicar');
    await fbPost(CONJUNTO_03, { status: 'PAUSED' });
    console.log('✓ 03 · Catálogo · Más vendidos en pausa');
    // Las ediciones de conjunto tienen límite de 1 cada 30 s en esta cuenta (#613).
    await new Promise((r) => setTimeout(r, 31_000));
    const campos = { status: 'ACTIVE' };
    if (MINIMO > 0) campos.daily_min_spend_target = MINIMO * 100; // centavos
    await fbPost(conjunto.id, campos);
    console.log(`✓ ${CONJUNTO} ACTIVO${MINIMO > 0 ? ` con piso de $${MINIMO.toLocaleString('es-AR')}/día` : ''}`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
