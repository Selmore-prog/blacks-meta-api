#!/usr/bin/env node
/* =========================================================================
 * CAMPAÑA DE BLACK FRIDAY (26 al 29 de noviembre de 2026)
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 23-nov-2026)
 * "Armá todas las piezas de Black Friday ya para activar después". En
 * Argentina el Black Friday no lo organiza nadie: cae el viernes 27 y la
 * mayoría lo estira hasta el lunes 30. Del 19 al 23-nov entró una sola venta
 * (la gente espera el Black, como en 2025: la semana del 17-nov cayó de 29 a
 * 10 pedidos), así que la campaña tiene que salir el primer minuto.
 *
 * El 25-nov Sebastián lo adelantó un día: del jueves 26 al domingo 29.
 *
 * CÓMO ESTÁ ARMADA (igual que Cyber Blacks, que funcionó sin tocar el 02)
 *  · CAMPAÑA APARTE, presupuesto por conjunto (ABO): meter anuncios nuevos en
 *    el 02 le reinicia el aprendizaje, y en una campaña con presupuesto
 *    compartido el jean se llevaría toda la plata.
 *  · DOS CONJUNTOS:
 *      Teaser (sin precio, "se viene"): opcional, 1-2 días antes. Termina solo
 *        cuando arranca el Black.
 *      Ofertas (con precio): del inicio al fin. Termina solo.
 *  · OPTIMIZA COMPRA con el píxel, SIN EXCLUSIONES: en un evento los que ya
 *    compraron, visitaron o dejaron el carrito son los que más compran.
 *    Edad fija 25-64 (65+ visita y no compra), la zona del 02.
 *  · Instagram completo + Reels de Facebook (el feed de Facebook gastó sin
 *    vender en octubre).
 *  · Los anuncios con precio NO pueden salir antes de que la tienda cobre el
 *    precio Black: --activar se corre DESPUÉS de activar la oferta en la tienda
 *    (revision-black-friday/aplicar.cjs en ~/tiendanube-tpl).
 *
 *   node scripts/setup-black-friday.js                 → vista previa y estado
 *   node scripts/setup-black-friday.js --aplicar       → crea campaña y conjuntos EN PAUSA
 *   node scripts/setup-black-friday.js --teaser        → prende sólo el teaser (antes del Black)
 *   node scripts/setup-black-friday.js --activar       → apaga el teaser y prende las ofertas
 *   node scripts/setup-black-friday.js --ultimo-dia    → además prende el anuncio "Último día"
 *   node scripts/setup-black-friday.js --terminar      → pausa todo
 *   node scripts/setup-black-friday.js --programar     → deja PROGRAMADO: las ofertas arrancan
 *        solas en --inicio (Meta no entrega antes de start_time) y "Último día" el domingo 29.
 *        El teaser no se toca. Va junto con aplicar.cjs --programar (la tienda arranca 23:30).
 *   ... --presupuesto 15000 · --presupuesto-teaser 5000
 *   ... --inicio 2026-11-26T00:00:00-0300 · --fin 2026-11-29T23:59:00-0300
 *
 * Los anuncios los sube scripts/subir-anuncios.js (EN PAUSA, así Meta los
 * revisa antes y al prenderlos salen sin esperar):
 *   node scripts/subir-anuncios.js anuncios/2026-11/black-friday/subir-teaser.json --aplicar --en-pausa
 *   node scripts/subir-anuncios.js anuncios/2026-11/black-friday/subir-ofertas.json --aplicar --en-pausa
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const CONJUNTO_02 = '120250779709150783'; // de ahí salen la zona y la atribución

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PRESUPUESTO = Number(arg('presupuesto', 15000));
const PRESUPUESTO_TEASER = Number(arg('presupuesto-teaser', 5000));
const INICIO = arg('inicio', '2026-11-26T00:00:00-0300');
const FIN = arg('fin', '2026-11-29T23:59:00-0300');

const INICIO_ULTIMO = arg('inicio-ultimo-dia', '2026-11-29T00:00:00-0300');
const PRESUPUESTO_ULTIMO = Number(arg('presupuesto-ultimo-dia', 5000));

const CAMPANA = 'Motor | Black Friday | Web';
const CONJ_ULTIMO = 'Black Friday · Último día · Todos 25-64';
const CONJ_TEASER = 'Black Friday · Teaser · Todos 25-64';
const CONJ_OFERTAS = 'Black Friday · Ofertas · Todos 25-64 · Compra';
const ANUNCIO_ULTIMO_DIA = 'BF7 · Jean · Último día';

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
  const d = await fbGet(`${edge}?fields=id,name,effective_status,status&limit=200&effective_status=${TODOS}`);
  return (d.data || []).find((x) => x.name === nombre);
}
async function anuncios(conjuntoId) {
  const d = await fbGet(`${conjuntoId}/ads?fields=id,name,status,effective_status&limit=50&effective_status=${TODOS}`);
  return d.data || [];
}
const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`;

(async () => {
  const flags = ['aplicar', 'teaser', 'activar', 'ultimo-dia', 'terminar', 'programar'].filter((f) => process.argv.includes(`--${f}`));
  const crear = flags.length > 0 && !flags.includes('terminar');

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

  console.log(`\n${CAMPANA}`);
  console.log(`  ${CONJ_TEASER}: ${pesos(PRESUPUESTO_TEASER)}/día, termina ${INICIO}`);
  console.log(`  ${CONJ_OFERTAS}: ${pesos(PRESUPUESTO)}/día, ${INICIO} → ${FIN}`);
  console.log(`  optimiza compra · edad 25-64 · sin exclusiones · Instagram + Reels de Facebook`);

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana && !crear) {
    console.log('\nTodavía no existe. Corré con --aplicar para crearla EN PAUSA.');
    return;
  }
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA, objective: 'OUTCOME_SALES', special_ad_categories: [],
      is_adset_budget_sharing_enabled: false, status: 'PAUSED',
    });
    console.log(`✓ campaña ${campana.id} (en pausa)`);
  }

  const conjunto = async (nombre, presupuesto, fin, inicio = null) => {
    let c = await buscar(`${campana.id}/adsets`, nombre);
    if (!c && crear) {
      c = await fbPost(`${CUENTA}/adsets`, {
        name: nombre, campaign_id: campana.id, billing_event: 'IMPRESSIONS',
        optimization_goal: 'OFFSITE_CONVERSIONS',
        promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' },
        attribution_spec: base.attribution_spec, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: Math.round(presupuesto * 100), end_time: fin, ...(inicio ? { start_time: inicio } : {}), targeting, status: 'PAUSED',
      });
      console.log(`✓ conjunto ${nombre} ${c.id} (en pausa)`);
      c = { id: c.id, name: nombre, status: 'PAUSED' };
    }
    return c;
  };
  const teaser = await conjunto(CONJ_TEASER, PRESUPUESTO_TEASER, INICIO);
  // Las ofertas se crean YA con start_time: Meta no deja cambiar la hora de inicio de
  // un conjunto creado "desde ahora" (error 1487057, visto el 23-nov).
  const ofertas = await conjunto(CONJ_OFERTAS, PRESUPUESTO, FIN, new Date(INICIO).getTime() > Date.now() ? INICIO : null);
  const ultimo = flags.includes('programar') || (await buscar(`${campana.id}/adsets`, CONJ_ULTIMO))
    ? await conjunto(CONJ_ULTIMO, PRESUPUESTO_ULTIMO, FIN, INICIO_ULTIMO) : null;

  const exigirAnuncios = async (c, spec) => {
    const ads = await anuncios(c.id);
    if (!ads.length) throw new Error(`"${c.name || ''}" no tiene anuncios: node scripts/subir-anuncios.js anuncios/2026-11/black-friday/${spec} --aplicar --en-pausa`);
    return ads;
  };

  if (flags.includes('teaser')) {
    const ads = await exigirAnuncios(teaser, 'subir-teaser.json');
    for (const a of ads) if (a.status !== 'ACTIVE') await fbPost(a.id, { status: 'ACTIVE' });
    await fbPost(teaser.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO_TEASER * 100), end_time: INICIO });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ TEASER prendido a ${pesos(PRESUPUESTO_TEASER)}/día hasta ${INICIO}`);
  }

  if (flags.includes('activar') || flags.includes('ultimo-dia')) {
    const ads = await exigirAnuncios(ofertas, 'subir-ofertas.json');
    for (const a of ads) {
      const prender = a.name !== ANUNCIO_ULTIMO_DIA || flags.includes('ultimo-dia');
      if (prender && a.status !== 'ACTIVE') { await fbPost(a.id, { status: 'ACTIVE' }); console.log(`  ✓ ${a.name}`); }
    }
    if (teaser && teaser.status === 'ACTIVE') { await fbPost(teaser.id, { status: 'PAUSED' }); console.log('  · teaser pausado'); }
    await fbPost(ofertas.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO * 100), end_time: FIN });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ OFERTAS prendidas a ${pesos(PRESUPUESTO)}/día hasta ${FIN}`);
  }

  if (flags.includes('programar')) {
    // Ofertas: todo ACTIVO pero con start_time: Meta lo muestra "Programado" y no
    // entrega ni gasta antes de esa hora. El "Último día" del conjunto de ofertas
    // queda en pausa: va en su propio conjunto, que arranca el domingo.
    if (new Date(INICIO).getTime() <= Date.now()) throw new Error(`--inicio ${INICIO} ya pasó: para prender ahora usá --activar.`);
    const ads = await exigirAnuncios(ofertas, 'subir-ofertas.json');
    for (const a of ads) {
      const quiero = a.name === ANUNCIO_ULTIMO_DIA ? 'PAUSED' : 'ACTIVE';
      if (a.status !== quiero) await fbPost(a.id, { status: quiero });
    }
    await fbPost(ofertas.id, { status: 'ACTIVE', start_time: INICIO, end_time: FIN, daily_budget: Math.round(PRESUPUESTO * 100) });
    console.log(`✓ OFERTAS programadas: arrancan ${INICIO}, ${pesos(PRESUPUESTO)}/día hasta ${FIN}`);
    const adsUltimo = await anuncios(ultimo.id);
    if (!adsUltimo.length) {
      console.log(`  · "Último día" sin anuncio: node scripts/subir-anuncios.js anuncios/2026-11/black-friday/subir-ultimo-dia.json --aplicar --en-pausa y volver a correr --programar`);
    } else {
      for (const a of adsUltimo) if (a.status !== 'ACTIVE') await fbPost(a.id, { status: 'ACTIVE' });
      await fbPost(ultimo.id, { status: 'ACTIVE', start_time: INICIO_ULTIMO, end_time: FIN, daily_budget: Math.round(PRESUPUESTO_ULTIMO * 100) });
      console.log(`✓ ÚLTIMO DÍA programado: arranca ${INICIO_ULTIMO}, ${pesos(PRESUPUESTO_ULTIMO)}/día hasta ${FIN}`);
    }
    if (teaser && teaser.status !== 'PAUSED') console.log('  · el teaser sigue como estaba');
    await fbPost(campana.id, { status: 'ACTIVE' });
  }

  if (flags.includes('terminar')) {
    for (const c of [teaser, ofertas, ultimo].filter(Boolean)) await fbPost(c.id, { status: 'PAUSED' });
    await fbPost(campana.id, { status: 'PAUSED' });
    console.log('✓ campaña y conjuntos pausados');
  }

  console.log(`\ncampaña ${campana.id}`);
  for (const c of [teaser, ofertas, ultimo].filter(Boolean)) {
    const ads = await anuncios(c.id);
    const d = await fbGet(`${c.id}?fields=effective_status,start_time,end_time,daily_budget`);
    console.log(`  ${c.id} ${c.name} · ${d.effective_status} · ${d.start_time || ''} → ${d.end_time || ''} · ${pesos(Number(d.daily_budget) / 100)}/día`);
    for (const a of ads) console.log(`     ${a.id} ${a.name} · ${a.effective_status}`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
