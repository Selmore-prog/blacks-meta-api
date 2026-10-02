#!/usr/bin/env node
/* =========================================================================
 * REMARKETING DE CATÁLOGO CON TALLES DE VERDAD Y PRECIO A LA VISTA — oct-2026
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 2-oct-2026)
 * El remarketing de catálogo usaba "Motor · Remarketing": todo lo que tenga
 * stock, 536 items. Medido ese día en las vistas previas: en Historias de
 * Instagram mostraba una grilla de 6 fotos SIN precio (camperas de invierno,
 * camisas de trabajo) y en el feed de Instagram una foto suelta sin precio.
 * Los clientes se quejaban de que "las publicidades son un misterio". Y en 4
 * días ($11 mil) no trajo ninguna compra.
 *
 * QUÉ ARMA (idempotente: lo que ya existe con el mismo nombre no se duplica)
 *  · Un conjunto de anuncios nuevo en la campaña de remarketing que usa
 *    "Motor · Remarketing curado" (lo mantiene src/adCatalogSet.js): todos
 *    los talles con stock de los productos curados que tienen curva (4 talles
 *    o más, con los del medio). Tiene que ser un conjunto de anuncios NUEVO:
 *    Meta no deja que un anuncio use un conjunto de productos distinto del
 *    de su conjunto de anuncios, y el evento/catálogo de uno publicado no se
 *    puede editar.
 *  · Público: visitantes y carritos de 90 días, sin compradores, 25-64 años y
 *    SIN expansión de público (el viejo la tenía prendida: le mostraba "lo que
 *    estuviste mirando" a gente que nunca entró).
 *  · Dos anuncios de catálogo con formato automático (carrusel o colección):
 *      1. "Catálogo · Banner envío gratis": la colección lleva de portada el
 *         banner con envío gratis, cuotas y 10% por transferencia
 *         (anuncios/2026-10/catalogo-banner/), y los productos abajo.
 *      2. "Catálogo · Portada automática": la misma, con la portada que arma Meta.
 *    En los dos, cada producto lleva su precio en la descripción. La etiqueta
 *    de % OFF sobre la foto sólo la muestra el feed de Facebook (Instagram no
 *    renderiza superposiciones), por eso el precio va también en el texto.
 *
 *   node scripts/setup-remarketing-curado.js              → vista previa
 *   node scripts/setup-remarketing-curado.js --aplicar    → crea todo EN PAUSA
 *   node scripts/setup-remarketing-curado.js --activar    → prende lo nuevo y
 *                                                          pausa el conjunto viejo
 *   node scripts/setup-remarketing-curado.js --aplicar --actualizar → creativos
 *        nuevos para los anuncios que ya existen (mismo ID)
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const CATALOGO = process.env.META_CATALOG_ID;

const CUENTA = 'act_3195782590470274';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';
const PIXEL = '5254594451333358';
const CAMPANA = '120250723080180783'; // Motor | Remarketing | Catálogo
const CONJUNTO_VIEJO = '120250723080410783'; // Remarketing 90d · Catálogo curado · Compra
const PRODUCT_SET = 'Motor · Remarketing curado';
const PRESUPUESTO = Number(process.env.REMARKETING_PRESUPUESTO_DIARIO || 3000);

const CONJUNTO = 'Remarketing 90d · Talles OK · Compra';
const PORTADA = path.join(__dirname, '..', 'anuncios', '2026-10', 'catalogo-banner', 'tarjetas', 'portada-envio-gratis.jpg');

// Todo verificado el 2-oct-2026 contra la tienda: envío gratis desde $45.000
// (promo 707208, todo el país), hasta 6 cuotas sin interés, 10% OFF por
// transferencia y 30 días para cambios. Sin "lo que estuviste mirando": la
// persona pudo haber mirado algo que ya no está en el conjunto curado.
const TEXTO = 'Seguí donde te quedaste: envío gratis a todo el país desde $45.000, hasta 6 cuotas sin interés '
  + 'y 10% OFF pagando por transferencia. Tenés 30 días para cambiar el talle.';
// Una sola etiqueta por descripción (regla de Meta). "round" saca los centavos
// ($35.999,10 → $35.999).
const DESCRIPCION = '{{product.current_price round}} · Hasta 6 cuotas sin interés';

// El del banner va SÓLO como colección: con formato automático (carrusel o
// colección) las vistas previas de Instagram salían como carrusel o grilla y
// el banner no se veía nunca (visto el 2-oct-2026). El otro queda automático:
// así compiten banner fijo contra lo que elija Meta.
const ANUNCIOS = [
  { nombre: 'Catálogo · Banner envío gratis', portada: true, formatos: ['COLLECTION'] },
  { nombre: 'Catálogo · Portada automática', portada: false, formatos: ['CAROUSEL', 'COLLECTION'] },
];

/* ------------------------------- Utilidades ------------------------------- */

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

async function subirImagen(ruta) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('source', new Blob([fs.readFileSync(ruta)]), path.basename(ruta));
  const res = await fetch(`${GRAPH}/${API}/${CUENTA}/adimages`, { method: 'POST', body: fd });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return Object.values(d.images)[0].hash;
}

const TODOS = encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED']));
async function buscar(edge, nombre) {
  const d = await fbGet(`${edge}?fields=id,name,effective_status&limit=200&effective_status=${TODOS}`);
  return (d.data || []).find((x) => x.name === nombre);
}

function creativo(nombre, productSetId, hashPortada, formatos) {
  const afs = {
    optimization_type: 'FORMAT_AUTOMATION',
    ad_formats: formatos,
    descriptions: [{ text: DESCRIPCION }],
  };
  if (hashPortada) afs.images = [{ hash: hashPortada }];
  return {
    name: `Pieza ${nombre}`,
    product_set_id: productSetId,
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
        // Sólo se ve en el feed de Facebook. El precio ya va debajo de cada
        // tarjeta; la etiqueta suma el % de descuento.
        image_overlay_spec: {
          overlay_template: 'pill_with_text',
          text_type: 'percentage_off',
          text_font: 'open_sans_condensed_bold',
          position: 'top_left',
          theme_color: 'background_f78400_text_ffffff',
        },
      },
    },
    asset_feed_spec: afs,
  };
}

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const sets = await fbGet(`${CATALOGO}/product_sets?fields=id,name,product_count&limit=200`);
  const set = (sets.data || []).find((s) => s.name === PRODUCT_SET);
  if (!set) throw new Error(`No existe "${PRODUCT_SET}": correr buildAdSet({ apply: true }) primero.`);

  console.log(`\n${CONJUNTO} · $${PRESUPUESTO.toLocaleString('es-AR')}/día · "${PRODUCT_SET}" (${set.product_count} items) · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  texto: ${TEXTO}\n  descripción: ${DESCRIPCION}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  // 1) Conjunto de anuncios (copia el público del viejo, sin expansión y 25-64)
  let conjunto = await buscar(`${CAMPANA}/adsets`, CONJUNTO);
  if (!conjunto) {
    const viejo = await fbGet(`${CONJUNTO_VIEJO}?fields=targeting,attribution_spec`);
    const t = viejo.targeting;
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: CAMPANA,
      status: 'PAUSED',
      daily_budget: PRESUPUESTO * 100,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE', product_set_id: set.id },
      attribution_spec: viejo.attribution_spec,
      targeting: {
        geo_locations: t.geo_locations,
        custom_audiences: t.custom_audiences.map((a) => ({ id: a.id })),
        excluded_custom_audiences: (t.excluded_custom_audiences || []).map((a) => ({ id: a.id })),
        age_min: 25,
        age_max: 64,
        targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
        targeting_automation: { advantage_audience: 0 },
      },
    });
    console.log(`✓ conjunto ${conjunto.id}`);
  } else console.log(`· conjunto ya existía ${conjunto.id}`);

  // 2) Anuncios
  // --actualizar: a los anuncios que ya existen les pone un creativo nuevo
  // (mismo ID de anuncio; vuelven a revisión).
  const actualizar = process.argv.includes('--actualizar');
  let hash = null;
  const ids = [];
  for (const a of ANUNCIOS) {
    let ad = await buscar(`${conjunto.id}/ads`, a.nombre);
    if (!ad || actualizar) {
      if (a.portada && !hash) hash = await subirImagen(PORTADA);
      const cr = await fbPost(`${CUENTA}/adcreatives`, creativo(a.nombre, set.id, a.portada ? hash : null, a.formatos));
      if (ad) {
        await fbPost(ad.id, { creative: { creative_id: cr.id } });
        console.log(`↻ anuncio ${a.nombre} (${ad.id}) → creativo nuevo ${cr.id}`);
      } else {
        ad = await fbPost(`${CUENTA}/ads`, { name: a.nombre, adset_id: conjunto.id, creative: { creative_id: cr.id }, status: activar ? 'ACTIVE' : 'PAUSED' });
        console.log(`✓ anuncio ${a.nombre} → ${ad.id}`);
      }
    } else console.log(`· anuncio ya existía ${a.nombre} ${ad.id}`);
    ids.push(ad.id);
  }

  if (activar) {
    for (const id of [conjunto.id, ...ids]) await fbPost(id, { status: 'ACTIVE' });
    await fbPost(CONJUNTO_VIEJO, { status: 'PAUSED' });
    console.log(`✓ nuevo ACTIVO · conjunto viejo ${CONJUNTO_VIEJO} en pausa (pausa, no borra: su historial sirve para comparar)`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
