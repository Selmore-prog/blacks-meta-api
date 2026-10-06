#!/usr/bin/env node
/* =========================================================================
 * CATÁLOGO DE LOS MÁS VENDIDOS PARA GENTE NUEVA — oct-2026
 *
 * POR QUÉ EXISTE (pedido de Sebastián, 6-oct-2026)
 * "Toda la pauta está yendo a un solo producto, el jean." Medido del 3 al
 * 6-oct: el anuncio "22 · Jean en 5 Colores" se llevó el 85% del conjunto
 * 02 y la ficha del jean tuvo 1.815 vistas contra 144 de la segunda (desde el
 * 29-sep). Agregar más anuncios de un producto al 02 no lo cambia: Meta ya
 * tenía remera, chomba, alpargatas, cargo y un carrusel de más vendidos ahí,
 * y entre todos se llevaron el 5% del gasto.
 *
 * QUÉ ARMA (idempotente: lo que ya existe con el mismo nombre no se duplica)
 *  · Un conjunto de anuncios en la campaña minorista (CBO), al lado del 02,
 *    con el conjunto de productos "Motor · Más vendidos · Prospecting" (lo
 *    mantiene src/adCatalogSet.js cada 6 h): los 10 más vendidos de 60 días
 *    con stock y sin talles del medio agotados, MENOS el jean clásico, que ya
 *    tiene sus anuncios. Meta elige a quién mostrarle cada producto.
 *  · Mismo público que el 02 (Argentina, 25-64 fijo, sin compradores ni
 *    visitantes de 90 días: esos los cubre el remarketing), optimizando COMPRA.
 *  · Ubicaciones: Instagram completo + Reels de Facebook. SIN feed ni
 *    historias de Facebook: del 21-sep al 6-oct el feed de Facebook se llevó
 *    $37.297 del prospecting con 0 compras (del 3 al 6-oct, 27% del gasto del
 *    02, 136 clics, 4 carritos, 0 compras) y las historias $5.238 con 0.
 *  · Gasto mínimo diario (por defecto $2.500) dentro del presupuesto de la
 *    campaña: sin piso, el CBO le daría todo al 02 como pasó con los otros
 *    productos. No suma presupuesto: sale de los mismos $14.400. Con $3.000
 *    Meta lo rechaza (100/1885648, "el gasto mínimo combinado es superior al
 *    presupuesto de la campaña") aunque el presupuesto sea $14.400; $2.500
 *    pasa (probado con validate_only el 6-oct-2026).
 *  · Un anuncio de catálogo con formato automático (carrusel o colección) y
 *    portada automática. La portada con banner muestra una pila de jeans, y
 *    este conjunto existe para que se vean los otros productos.
 *
 *   node scripts/setup-catalogo-mas-vendidos.js              → vista previa
 *   node scripts/setup-catalogo-mas-vendidos.js --aplicar    → crea todo EN PAUSA
 *   node scripts/setup-catalogo-mas-vendidos.js --activar    → lo prende
 *   ... --minimo 2500 → gasto mínimo diario en pesos (0 = sin piso)
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const CATALOGO = process.env.META_CATALOG_ID;

const CUENTA = 'act_3195782590470274';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';
const PIXEL = '5254594451333358';
const CAMPANA = '120250570335540783'; // Motor | Minorista | Primavera 26 (CBO)
const CONJUNTO_02 = '120250779709150783'; // 02 · Prospecting amplio · Compra (de ahí sale el público)
const PRODUCT_SET = 'Motor · Más vendidos · Prospecting';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const MINIMO = Number(arg('minimo', 2500));

const CONJUNTO = '03 · Catálogo · Más vendidos · Compra';
const ANUNCIO = 'Catálogo · Más vendidos · Automático';

// Verificado el 6-oct-2026 en la tienda: envío gratis desde $45.000 a todo el
// país (promo 707208), 6 cuotas sin interés, 10% OFF por transferencia y 30
// días para cambios. "Más vendidos" es literal: sale del ranking de pedidos.
const TEXTO = 'Los más vendidos de Black\'s. Envío gratis a todo el país desde $45.000, hasta 6 cuotas sin interés '
  + 'y 10% OFF pagando por transferencia. Tenés 30 días para cambiar el talle.';
const DESCRIPCION = '{{product.current_price round}} · Hasta 6 cuotas sin interés';

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

const TODOS = encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED']));
async function buscar(edge, nombre) {
  const d = await fbGet(`${edge}?fields=id,name,effective_status&limit=200&effective_status=${TODOS}`);
  return (d.data || []).find((x) => x.name === nombre);
}

function creativo(productSetId) {
  return {
    name: `Pieza ${ANUNCIO}`,
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
      },
    },
    asset_feed_spec: {
      optimization_type: 'FORMAT_AUTOMATION',
      ad_formats: ['CAROUSEL', 'COLLECTION'],
      descriptions: [{ text: DESCRIPCION }],
    },
  };
}

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;

  const sets = await fbGet(`${CATALOGO}/product_sets?fields=id,name,product_count&limit=200`);
  const set = (sets.data || []).find((s) => s.name === PRODUCT_SET);
  if (!set) throw new Error(`No existe "${PRODUCT_SET}": correr buildAdSet({ apply: true }) primero.`);
  const muestra = await fbGet(`${set.id}/products?fields=name&limit=500`);
  const productos = [...new Set((muestra.data || []).map((p) => p.name))];

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

  console.log(`\n${CONJUNTO} · mínimo $${MINIMO.toLocaleString('es-AR')}/día dentro del CBO · "${PRODUCT_SET}" (${set.product_count} items) · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  edad ${targeting.age_min}-${targeting.age_max} · excluye ${targeting.excluded_custom_audiences.length} públicos · ig ${targeting.instagram_positions} · fb ${targeting.facebook_positions}`);
  console.log(`  productos (${productos.length}): ${productos.join(' · ')}`);
  console.log(`  texto: ${TEXTO}\n  descripción: ${DESCRIPCION}`);
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  let conjunto = await buscar(`${CAMPANA}/adsets`, CONJUNTO);
  if (!conjunto) {
    const campos = {
      name: CONJUNTO,
      campaign_id: CAMPANA,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'PURCHASE', product_set_id: set.id },
      attribution_spec: base.attribution_spec,
      targeting,
    };
    if (MINIMO > 0) campos.daily_min_spend_target = MINIMO * 100; // centavos
    conjunto = await fbPost(`${CUENTA}/adsets`, campos);
    console.log(`✓ conjunto ${conjunto.id}`);
  } else console.log(`· conjunto ya existía ${conjunto.id}`);

  let ad = await buscar(`${conjunto.id}/ads`, ANUNCIO);
  if (!ad) {
    const cr = await fbPost(`${CUENTA}/adcreatives`, creativo(set.id));
    // El anuncio nace ACTIVO dentro del conjunto en pausa: así pasa la
    // revisión ahora y arranca apenas se prende el conjunto.
    ad = await fbPost(`${CUENTA}/ads`, { name: ANUNCIO, adset_id: conjunto.id, creative: { creative_id: cr.id }, status: 'ACTIVE' });
    console.log(`✓ anuncio ${ANUNCIO} → ${ad.id}`);
  } else console.log(`· anuncio ya existía ${ad.id}`);

  if (activar) {
    await fbPost(conjunto.id, { status: 'ACTIVE' });
    console.log(`✓ ${CONJUNTO} ACTIVO`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
