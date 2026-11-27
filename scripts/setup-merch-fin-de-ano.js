#!/usr/bin/env node
/* =========================================================================
 * MERCHANDISING · REGALOS DE FIN DE AÑO (oct-2026)
 *
 * POR QUÉ ASÍ (análisis del 23-oct-2026, ver memoria del proyecto):
 *  · Los productos de merchandising son de Zecat: no están en Tiendanube ni en
 *    el catálogo de Meta, y no se compran en la web (se cotizan por WhatsApp
 *    con el pedido por color y talle). Un anuncio de catálogo mostraría el
 *    precio de UNA unidad sin logo ni envío y optimizaría compras que no existen.
 *  · Por eso: piezas propias con el logo de muestra puesto en cada producto
 *    (anuncios/2026-10/merch-tu-logo) que llevan a la WEB, donde la persona
 *    prueba su logo, ve el precio con su logo y arma el pedido. El que hace eso
 *    es un comprador más serio que el que toca "enviar mensaje" en un anuncio
 *    (en el mayorista a WhatsApp, oct: 76 conversaciones → 1 presupuesto).
 *  · Campaña aparte (no un conjunto en la mayorista): no reinicia el
 *    aprendizaje de los conjuntos de uniformes que ya andan.
 *  · Optimiza VISITAS A LA PÁGINA (LANDING_PAGE_VIEWS): las consultas por
 *    WhatsApp desde la web le llegan a Meta como "Contact" recién desde el
 *    23-oct y son pocas para que Meta optimice por eso. Se mide con Contact
 *    (canal whatsapp_merch) y con Kommo (el primer mensaje dice "Quiero
 *    cotizar en Blacks Indumentaria" y el link de /merchandising/).
 *  · Público: el similar 1% de los clientes mayoristas de Kommo (empresas que
 *    ya compraron), 25-64, sin Advantage+; mismas ubicaciones que el mayorista
 *    (sin Marketplace ni columna derecha, que recortan las piezas).
 *  · Termina sola el 15-dic: después ya no llegan los regalos de fin de año.
 *
 *   node scripts/setup-merch-fin-de-ano.js            → vista previa
 *   node scripts/setup-merch-fin-de-ano.js --aplicar  → crea campaña y conjunto EN PAUSA
 *     (los anuncios se suben aparte: node scripts/subir-anuncios.js anuncios/2026-10/merch-tu-logo/subir.json --aplicar)
 *   node scripts/setup-merch-fin-de-ano.js --activar  → prende campaña y conjunto
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const SIMILAR_CLIENTES = '120250968051160783'; // Similar 1% AR · Kommo · Mayorista · Clientes que compraron

const CAMPANA = 'Motor | Merchandising | Web';
const CONJUNTO = 'Merch · Empresas · Fin de año';
const PRESUPUESTO = Number(process.env.PRESUPUESTO || 3000); // pesos por día
const FIN = '2026-12-15T23:59:00-0300';

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

  const targeting = {
    geo_locations: { countries: ['AR'], location_types: ['home', 'recent'] },
    age_min: 25,
    age_max: 64,
    custom_audiences: [{ id: SIMILAR_CLIENTES }],
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed', 'story', 'facebook_reels'],
    instagram_positions: ['stream', 'story', 'reels', 'explore'],
  };

  console.log(`\n${CAMPANA} › ${CONJUNTO} · $${PRESUPUESTO.toLocaleString('es-AR')}/día hasta el 15-dic · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log('  objetivo: tráfico, optimiza visitas a la página · público: similar 1% de clientes mayoristas, AR 25-64');
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_TRAFFIC',
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
      destination_type: 'WEBSITE',
      optimization_goal: 'LANDING_PAGE_VIEWS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: Math.round(PRESUPUESTO * 100), // centavos
      end_time: FIN,
      targeting,
      status: 'PAUSED',
    });
    console.log(`✓ conjunto ${conjunto.id} (en pausa)`);
  } else console.log(`· conjunto ya existía ${conjunto.id} (${conjunto.effective_status})`);

  if (activar) {
    await fbPost(conjunto.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO * 100) });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ ACTIVA a $${PRESUPUESTO.toLocaleString('es-AR')}/día`);
  }
  console.log(`\nconjunto: ${conjunto.id}`);
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
