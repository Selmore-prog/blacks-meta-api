#!/usr/bin/env node
/* =========================================================================
 * PROSPECTING DE LA TIENDA OPTIMIZANDO COMPRAS — oct-2026
 *
 * POR QUÉ EXISTE (medido el 2-oct-2026)
 * "01 · Prospecting amplio · Iniciar pago" optimiza INICIOS DE PAGO y Meta
 * aprendió a buscar gente que toca "Iniciar compra" pero no paga:
 *   · inicios de pago → compras: 30% (1-27 sep), 10% (28-30 sep) y 0 de 20
 *     el 1 y 2 de octubre (Google: 60%). Cero ventas en la tienda desde el
 *     30-sep 18:45 en todos los canales.
 *   · gasta a los saltos: el 2-oct se fue $11.800 en UNA hora (8 a 9) y a
 *     las 10 no quedaba presupuesto; el 30-sep casi todo entre 0 y 9 hs.
 *   · el evento no se puede cambiar en un conjunto publicado (error
 *     3260011), así que va un conjunto nuevo en la MISMA campaña (CBO).
 * Las guías de 2026 coinciden: optimizar por el resultado que importa
 * (compra), pocos conjuntos, segmentación amplia y no tocar nada durante el
 * aprendizaje. El píxel registra ~40 compras por semana en total, que es la
 * señal con la que Meta busca compradores parecidos.
 *
 * QUÉ ARMA (idempotente)
 *  · "02 · Prospecting amplio · Compra": misma segmentación que el 01 (edad
 *    fija 25-64, Argentina, ubicaciones sin Marketplace ni columna derecha),
 *    evento COMPRA, misma atribución (7 días clic / 1 día vista).
 *  · Los anuncios del 01 que no tienen problemas de stock, con el MISMO
 *    creativo (conservan me gusta y comentarios).
 *
 *   node scripts/setup-prospecting-compra.js             → vista previa
 *   node scripts/setup-prospecting-compra.js --aplicar   → crea todo EN PAUSA
 *   node scripts/setup-prospecting-compra.js --activar   → prende el 02 y pausa el 01
 *
 * DESPUÉS DE ACTIVAR: no tocarlo por 7 días (cada cambio reinicia el
 * aprendizaje). Mirar compras verificadas, no "resultados" de Meta.
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const CAMPANA = '120250570335540783'; // Motor | Minorista | Primavera 26 (CBO)
const CONJUNTO_VIEJO = '120250621817500783'; // 01 · Prospecting amplio · Iniciar pago
const CONJUNTO = '02 · Prospecting amplio · Compra';

// Afuera: 14 Bermuda (sin 42, 56 ni 60 en ningún color), 19 Video Ripstop
// (sin 42, 50 ni 54) y el carrusel de jean en colores (repite al 22).
const ANUNCIOS = [
  '22 · Jean en 5 Colores',
  '12 · Jean Clásico Recto',
  '13 · Combo Jean + Alpargatas',
  '21 · Combo Jean + Remera',
  '15 · Cargo Slim Fit',
  '16 · Chomba Micropique',
  '17 · Remera Lisa Pampero',
  '23 · Alpargatas Rueda',
  '18 · Video · Jean Clásico Recto',
  '20 · Video · Jean + Alpargatas',
  '24 · Video · Temporada · Donde estés',
  'Carrusel · Los más vendidos · 2026-10',
];

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

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const viejo = await fbGet(`${CONJUNTO_VIEJO}?fields=targeting,attribution_spec`);
  const anunciosViejos = (await fbGet(`${CONJUNTO_VIEJO}/ads?fields=id,name,effective_status,creative{id}&limit=200&effective_status=${TODOS}`)).data || [];
  const elegidos = ANUNCIOS.map((n) => anunciosViejos.find((a) => a.name === n));
  const faltan = ANUNCIOS.filter((n, i) => !elegidos[i]);
  if (faltan.length) throw new Error(`No encuentro en el 01: ${faltan.join(', ')}`);

  console.log(`\n${CONJUNTO} · evento COMPRA · ${ANUNCIOS.length} anuncios · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  const t = viejo.targeting;
  console.log(`  edad ${t.age_min}-${t.age_max} · ${t.publisher_platforms} · fb ${t.facebook_positions} · ig ${t.instagram_positions}`);
  for (const a of elegidos) console.log(`  · ${a.name} (creativo ${a.creative.id})`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let conjunto = ((await fbGet(`${CAMPANA}/adsets?fields=id,name&limit=200&effective_status=${TODOS}`)).data || [])
    .find((x) => x.name === CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: CAMPANA,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' },
      attribution_spec: viejo.attribution_spec,
      targeting: t,
    });
    console.log(`✓ conjunto ${conjunto.id}`);
  } else console.log(`· conjunto ya existía ${conjunto.id}`);

  const yaEstan = ((await fbGet(`${conjunto.id}/ads?fields=id,name&limit=200&effective_status=${TODOS}`)).data || []);
  for (const a of elegidos) {
    if (yaEstan.some((x) => x.name === a.name)) { console.log(`· ${a.name} ya estaba`); continue; }
    const ad = await fbPost(`${CUENTA}/ads`, { name: a.name, adset_id: conjunto.id, creative: { creative_id: a.creative.id }, status: 'ACTIVE' });
    console.log(`✓ ${a.name} → ${ad.id}`);
  }

  if (activar) {
    await fbPost(conjunto.id, { status: 'ACTIVE' });
    await fbPost(CONJUNTO_VIEJO, { status: 'PAUSED' });
    console.log(`✓ ${CONJUNTO} ACTIVO · 01 (${CONJUNTO_VIEJO}) en pausa — pausa, no borra`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
