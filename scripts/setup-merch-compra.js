#!/usr/bin/env node
/* =========================================================================
 * MERCHANDISING: CAMPAÑA QUE BUSCA CONSULTAS Y COMPRAS, NO VISITAS — nov-2026
 *
 * POR QUÉ EXISTE (análisis del 16-nov-2026)
 * "Motor | Merchandising | Web" optimizaba VISITAS A LA PÁGINA: del 23-oct al
 * 15-nov gastó $69.103 → 959 visitas y 2 consultas desde Meta. Meta hizo lo
 * que se le pidió: encontró gente que hace clic barato, no gente que compra.
 * Se pausó el 16-nov.
 *
 * Desde el 7/10-nov el merchandising SE COMPRA ONLINE: 523 productos de Zecat
 * sin logo con carrito y checkout de la tienda (precio final con IVA y
 * descuento por cantidad); CON logo sigue por WhatsApp (cotizador-blacks,
 * docs/merchandising-continuidad-2026-11-08.md).
 *
 * QUÉ OPTIMIZA: el evento Contact del píxel (cada toque de WhatsApp; el de la
 * página de merch va con content_category=whatsapp_merch). Es la señal con
 * volumen: Purchase de merch es muy poca para que Meta aprenda, y el carrito
 * de merch no manda AddToCart al píxel (es propio, no el de Tiendanube). Las
 * compras igual se ven en Tiendanube y en el informe.
 *
 * Mismo público que la anterior (similar 1% de clientes mayoristas de Kommo,
 * AR 25-64) y mismos videos y fotos (sin precios: el precio de merch depende
 * de la cantidad). Lo que cambia es el texto: "comprá online o con tu logo".
 * Termina sola el 15-dic (temporada de regalos de fin de año).
 *
 *   node scripts/setup-merch-compra.js            → vista previa
 *   node scripts/setup-merch-compra.js --aplicar  → crea todo EN PAUSA
 *   node scripts/setup-merch-compra.js --activar  → lo prende
 *   ... --presupuesto 3000
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PIXEL = '5254594451333358';
const CONJUNTO_VIEJO = '120251097890420783'; // Merch · Empresas · Fin de año (visitas, pausada)
const ANUNCIOS_VIEJOS = {
  video: '120251097930190783',
  imagen: '120251097895830783',
  carrusel: '120251097897270783',
};

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PRESUPUESTO = Number(arg('presupuesto', 3000));
const FIN = arg('fin', '2026-12-15T23:59:00-0300');

const CAMPANA = 'Motor | Merchandising | Compra y consulta';
const CONJUNTO = 'Merch · Empresas · Consultas y compras';

const TEXTO_FEED = 'Regalos de fin de año para tu equipo 🎁 Más de 500 productos de merchandising '
  + '(mates, termos, gorras, mochilas, botellas, cuadernos) para comprar online, con precio final con IVA '
  + 'y descuento por cantidad. ¿Los querés con el logo de tu empresa? Probalo en la web y cotizalo por WhatsApp.';
const TEXTO_VERTICAL = 'Merchandising para tu empresa 🎁 Comprá online, o probá tu logo y cotizalo.';
const TITULO = 'Comprá online o con tu logo';
const TEXTO_CARRUSEL = 'Regalos de fin de año para tu equipo 🎁 Comprá online, o probá el logo de tu empresa '
  + 'en cada producto y cotizalo por WhatsApp. Descuento por cantidad.';

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

/** Mismo creativo con el texto nuevo. Los videos/fotos y las reglas por ubicación se reusan. */
function creativoNuevo(viejo, nombre) {
  const oss = viejo.object_story_spec || {};
  if (oss.link_data) { // carrusel
    return { name: `Pieza ${nombre}`, object_story_spec: { ...oss, link_data: { ...oss.link_data, message: TEXTO_CARRUSEL } } };
  }
  const a = viejo.asset_feed_spec;
  const limpio = {
    ad_formats: a.ad_formats,
    optimization_type: a.optimization_type,
    asset_customization_rules: a.asset_customization_rules,
    link_urls: a.link_urls,
    call_to_action_types: a.call_to_action_types,
    descriptions: a.descriptions,
    titles: [{ text: TITULO }],
    bodies: (a.bodies || []).map((b) => ({
      adlabels: b.adlabels,
      text: (b.adlabels || []).some((l) => l.name === 'body_vertical') ? TEXTO_VERTICAL : TEXTO_FEED,
    })),
  };
  if (a.videos) limpio.videos = a.videos.map(({ adlabels, video_id, thumbnail_hash }) => ({ adlabels, video_id, thumbnail_hash }));
  if (a.images) limpio.images = a.images.map(({ adlabels, hash }) => ({ adlabels, hash }));
  return { name: `Pieza ${nombre}`, object_story_spec: { page_id: oss.page_id, instagram_user_id: oss.instagram_user_id }, asset_feed_spec: limpio };
}

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const viejo = await fbGet(`${CONJUNTO_VIEJO}?fields=targeting`);
  const t = viejo.targeting;
  const targeting = {
    geo_locations: t.geo_locations,
    age_min: t.age_min,
    age_max: t.age_max,
    custom_audiences: (t.custom_audiences || []).map((a) => ({ id: a.id })),
    targeting_relaxation_types: t.targeting_relaxation_types,
    targeting_automation: { advantage_audience: 0 },
    publisher_platforms: t.publisher_platforms,
    facebook_positions: t.facebook_positions,
    instagram_positions: t.instagram_positions,
  };

  console.log(`\n${CAMPANA} › ${CONJUNTO} · $${PRESUPUESTO.toLocaleString('es-AR')}/día hasta ${FIN} · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  optimiza Contact (WhatsApp) · público: ${(t.custom_audiences || []).map((a) => a.name).join(', ')}`);
  console.log(`  texto feed: ${TEXTO_FEED}\n  texto vertical: ${TEXTO_VERTICAL}\n  carrusel: ${TEXTO_CARRUSEL}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_LEADS',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
      status: 'PAUSED',
    });
    console.log(`✓ campaña ${campana.id}`);
  } else console.log(`· campaña ya existía ${campana.id} (${campana.effective_status})`);

  let conjunto = await buscar(`${campana.id}/adsets`, CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: campana.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      destination_type: 'WEBSITE',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'CONTACT' },
      attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }, { event_type: 'VIEW_THROUGH', window_days: 1 }],
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: Math.round(PRESUPUESTO * 100),
      end_time: FIN,
      targeting,
      status: 'PAUSED',
    });
    console.log(`✓ conjunto ${conjunto.id}`);
  } else console.log(`· conjunto ya existía ${conjunto.id} (${conjunto.effective_status})`);

  const nombres = { video: 'Merch · Video · Comprá online o con tu logo', imagen: 'Merch · Imagen · Comprá online o con tu logo', carrusel: 'Merch · Carrusel · 7 productos · Comprá online' };
  for (const [tipo, adViejo] of Object.entries(ANUNCIOS_VIEJOS)) {
    const nombre = nombres[tipo];
    if (await buscar(`${conjunto.id}/ads`, nombre)) { console.log(`· ${nombre} ya existía`); continue; }
    const v = await fbGet(`${adViejo}?fields=creative{object_story_spec,asset_feed_spec}`);
    const cr = await fbPost(`${CUENTA}/adcreatives`, creativoNuevo(v.creative, nombre));
    const ad = await fbPost(`${CUENTA}/ads`, { name: nombre, adset_id: conjunto.id, creative: { creative_id: cr.id }, status: 'ACTIVE' });
    console.log(`✓ ${nombre} → ${ad.id}`);
  }

  if (activar) {
    await fbPost(conjunto.id, { status: 'ACTIVE', daily_budget: Math.round(PRESUPUESTO * 100), end_time: FIN });
    await fbPost(campana.id, { status: 'ACTIVE' });
    console.log(`✓ ACTIVA a $${PRESUPUESTO.toLocaleString('es-AR')}/día hasta ${FIN}`);
  }
  console.log(`\ncampaña ${campana.id} · conjunto ${conjunto.id}`);
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
