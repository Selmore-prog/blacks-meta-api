#!/usr/bin/env node
/* =========================================================================
 * CAMPAÑA "VERANO · SIN JEAN" — nov-2026
 *
 * POR QUÉ EXISTE (análisis del 16-nov-2026, OK de Sebastián ese día)
 * Del 26-oct al 15-nov el jean vendió lo mismo que antes (53 → 54 unidades)
 * pero el resto se cayó: chombas 20 → 1, remeras 14 → 4. En el 02 "22 · Jean
 * en 5 Colores" se lleva el 85% del gasto: dentro de un mismo conjunto Meta
 * le da la plata al anuncio que gana y no hay forma de forzarlo. La única
 * manera de mover el resto de la tienda es darle PRESUPUESTO PROPIO.
 *
 * El 5-nov Rodri probó la idea con "TEST NO JEANS", pero era una copia del 02
 * con 5 de 11 anuncios mostrando jean y el mismo público: $51k → 3 ventas,
 * las 3 de alpargatas (el anuncio de alpargatas, $14,6k → $104k, 7x). Ésta es
 * la versión limpia: NINGÚN jean, ni en combos.
 *
 * QUÉ PRODUCTOS (margen con costos de ML Manager, 16-nov, sin fijos)
 * Los que aguantan pauta y tienen stock parado: remera Gurre (equilibrio
 * 2,9x, 0 vendidas en 60 días), bermuda cargo Gurre (3,4x), chomba (3,7x),
 * alpargatas (4,5x), remera Pampero (4,8x) y los cargos Gurre (7,3x, nunca
 * tuvieron anuncio). NO entran los cargos Pampero (fit/slim 12,4x, ripstop
 * 14,8x, bermuda cargo 46x): cada venta deja $1-5k y con ~$15k de pauta por
 * venta pierden plata. Esos van por Google (gente que los busca).
 *
 * DOS CONJUNTOS CON PRESUPUESTO PROPIO (ABO, $4.000/día cada uno)
 *  1. CATÁLOGO: set "Motor · Verano sin jean · 2026-11" (1 item por color de
 *     cada producto, así el carrusel no repite la misma prenda). Meta elige
 *     qué producto mostrarle a cada uno: es lo que reparte la plata por toda
 *     la tienda. Precio y foto salen del catálogo (precios corregidos el
 *     16-nov; el cron diario ahora también los corrige).
 *  2. PLACAS: una por línea (anuncios/2026-11/verano-sin-jean/subir.json).
 *     Precios = los que cobra la tienda el 16-nov; van al manifiesto para que
 *     scripts/verificar-precios-anuncios.js avise si cambian.
 *
 * Público como el 02 (AR, 25-64 fijo, sin compradores/carrito/visitantes de
 * 90 días: a esos les habla el remarketing). Sólo Instagram: Reels de
 * Facebook gastó $40k en 30 días con 1 compra en la campaña minorista.
 *
 *   node scripts/setup-verano-sin-jean.js            → vista previa
 *   node scripts/setup-verano-sin-jean.js --aplicar  → crea todo EN PAUSA
 *   node scripts/setup-verano-sin-jean.js --activar  → prende campaña y conjuntos
 *   ... --presupuesto 4000 → por conjunto, en pesos
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';
const CONJUNTO_02 = '120250779709150783'; // de ahí salen zona, exclusiones y atribución
const PRODUCT_SET = '1454645392861328'; // Motor · Verano sin jean · 2026-11

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PRESUPUESTO = Number(arg('presupuesto', 4000));

const CAMPANA = 'Motor | Verano · Sin jean | Web';
const CONJ_CATALOGO = 'Verano · Catálogo sin jean · Compra';
const CONJ_PLACAS = 'Verano · Placas por línea · Compra';
const ANUNCIO_CATALOGO = 'Catálogo · Verano sin jean';

// Sin cuotas: 6 sin interés sólo desde $65.000 y casi todo el set está debajo.
const TEXTO = 'Llegó el calor: remeras, chombas, bermudas, cargos y alpargatas para todos los días. '
  + 'Envío gratis desde $45.000 y 10% OFF pagando por transferencia.';
const DESCRIPCION = 'Envío gratis desde $45.000';

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
    age_min: 25,
    age_max: 64,
    excluded_custom_audiences: (t.excluded_custom_audiences || []).map((a) => ({ id: a.id })),
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: ['instagram'],
    instagram_positions: ['stream', 'story', 'explore', 'reels', 'profile_feed'],
  };
  const set = await fbGet(`${PRODUCT_SET}?fields=name,product_count`);

  console.log(`\n${CAMPANA} · 2 conjuntos a $${PRESUPUESTO.toLocaleString('es-AR')}/día · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  edad 25-64 · excluye ${targeting.excluded_custom_audiences.length} públicos · sólo Instagram`);
  console.log(`  catálogo: "${set.name}" (${set.product_count} items)`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_SALES',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false, // ABO: cada conjunto con su plata
      status: 'PAUSED',
    });
    console.log(`✓ campaña ${campana.id}`);
  } else console.log(`· campaña ya existía ${campana.id} (${campana.effective_status})`);

  const conjunto = async (nombre, promoted) => {
    let c = await buscar(`${campana.id}/adsets`, nombre);
    if (!c) {
      c = await fbPost(`${CUENTA}/adsets`, {
        name: nombre,
        campaign_id: campana.id,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'OFFSITE_CONVERSIONS',
        promoted_object: promoted,
        attribution_spec: base.attribution_spec,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: Math.round(PRESUPUESTO * 100),
        targeting,
        status: 'PAUSED',
      });
      console.log(`✓ conjunto ${nombre} → ${c.id}`);
    } else console.log(`· conjunto ya existía ${nombre} ${c.id} (${c.effective_status})`);
    return c;
  };
  const catalogo = await conjunto(CONJ_CATALOGO, { pixel_id: PIXEL, custom_event_type: 'PURCHASE', product_set_id: PRODUCT_SET });
  const placas = await conjunto(CONJ_PLACAS, { pixel_id: PIXEL, custom_event_type: 'PURCHASE' });

  let ad = await buscar(`${catalogo.id}/ads`, ANUNCIO_CATALOGO);
  if (!ad) {
    const cr = await fbPost(`${CUENTA}/adcreatives`, {
      name: `Pieza ${ANUNCIO_CATALOGO}`,
      product_set_id: PRODUCT_SET,
      object_type: 'SHARE',
      object_story_spec: {
        page_id: PAGINA,
        instagram_user_id: IG_USER,
        template_data: {
          link: 'https://blacksindumentaria.com.ar/',
          message: TEXTO,
          name: '{{product.name}}',
          call_to_action: { type: 'SHOP_NOW' },
          multi_share_end_card: false,
        },
      },
      asset_feed_spec: {
        optimization_type: 'FORMAT_AUTOMATION',
        ad_formats: ['CAROUSEL', 'COLLECTION'],
        descriptions: [{ text: DESCRIPCION }],
      },
    });
    ad = await fbPost(`${CUENTA}/ads`, { name: ANUNCIO_CATALOGO, adset_id: catalogo.id, creative: { creative_id: cr.id }, status: 'ACTIVE' });
    console.log(`✓ anuncio ${ANUNCIO_CATALOGO} → ${ad.id}`);
  } else console.log(`· anuncio ya existía ${ad.id}`);

  if (activar) {
    const ads = await fbGet(`${placas.id}/ads?fields=id&limit=50&effective_status=${TODOS}`);
    if (!(ads.data || []).length) throw new Error('El conjunto de placas no tiene anuncios: subilos con scripts/subir-anuncios.js anuncios/2026-11/verano-sin-jean/subir.json --aplicar');
    for (const c of [catalogo, placas]) await fbPost(c.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO * 100) });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ ACTIVA: 2 conjuntos a $${PRESUPUESTO.toLocaleString('es-AR')}/día`);
  }
  console.log(`\ncampaña ${campana.id} · catálogo ${catalogo.id} · placas ${placas.id}`);
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
