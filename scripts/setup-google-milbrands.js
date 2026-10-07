#!/usr/bin/env node
/* =========================================================================
 * RECREAR EN GOOGLE ADS LO QUE SERVÍA DE MILBRANDS — oct-2026
 *
 * POR QUÉ EXISTE
 * La agencia Milbrands ELIMINÓ sus dos campañas minoristas el 30-sep-2026 a
 * las 17:37 (historial de cambios: marketing.milbrands@gmail.com). Una campaña
 * eliminada no se puede reactivar, sólo recrear. Medido con GA4 del 8-jul al
 * 6-oct: "Milbrands - Pmax - General" fue lo que más vendió de toda la pauta
 * (39 compras, $2.335.351 con $422.100: 5,5 veces lo invertido).
 *
 * QUÉ RECREA (y qué NO, a propósito)
 *  1. La Performance Max General IGUAL que estaba: mismo catálogo de Merchant
 *     Center (todos los productos), mismo grupo de recursos (títulos, textos,
 *     imágenes, temas de búsqueda y señal de público), mismo nombre y logo,
 *     Argentina en español, puja por conversiones con SÓLO compras en la web
 *     como objetivo, $5.000 por día. Lo que Google había generado solo (15
 *     videos y 24 imágenes) no se copia: lo vuelve a generar.
 *  2. De "Milbrands - Busqueda - Marca Propia", SÓLO la marca. Medido jul-sep:
 *     las palabras con "blacks" trajeron 9,5 de sus 16,5 compras con $41.638
 *     de $296.192. El resto eran genéricas en concordancia amplia ("ropa de
 *     trabajo", "uniformes para empresas") que casi no vendían y se pisan con
 *     las campañas mayoristas que maneja Rodri. Esas NO se recrean.
 * Las campañas de Rodri no se tocan: el script sólo crea campañas nuevas.
 *
 *   node scripts/setup-google-milbrands.js             → valida todo en Google, no crea nada
 *   node scripts/setup-google-milbrands.js --aplicar   → crea las dos EN PAUSA
 *   node scripts/setup-google-milbrands.js --activar   → las prende
 * ========================================================================= */

require('dotenv').config();
const config = require('../src/config');
const { gaql, mutate } = require('../src/googleAds');

const C = config.googleAds.customerId;
const PMAX_VIEJA = '23124247859';
const BUSQUEDA_VIEJA = '23124187589';
const NOMBRE_PMAX = 'Blacks - Pmax - General (recreada de Milbrands)';
const NOMBRE_MARCA = 'Blacks - Busqueda - Marca';
const PRESUPUESTO_PMAX = 5000;  // pesos por día: lo que gastaba en septiembre
const PRESUPUESTO_MARCA = 1500; // la marca gastaba ~$460 por día; el tope real es el volumen de búsquedas
const ARGENTINA = 'geoTargetConstants/2032';
const ESPANOL = 'languageConstants/1003';

const rn = (tipo, id) => `customers/${C}/${tipo}/${id}`;
const micros = (pesos) => String(Math.round(pesos * 1e6));

// Todo verificado el 6/7-oct-2026 (tienda y company_facts). Límites de Google:
// títulos de 30 caracteres, descripciones de 90. Nada en mayúsculas sostenidas:
// "10% OFF" lo rechaza la política CAPITALIZATION (probado el 7-oct).
const TITULOS = [
  'Blacks Indumentaria', 'Tienda Online de Blacks', 'Ropa de Trabajo y Calzado',
  'Pampero, Ombú y Grafa 70', 'Envío Gratis Desde $45.000', 'Hasta 6 Cuotas Sin Interés',
  'Descuento por Transferencia', '30 Días Para Cambiar', 'Uniformes Con Tu Logo',
  'Emitimos Factura A y B', 'Envíos a Todo el País', 'Jeans, Cargos y Chombas',
];
const DESCRIPCIONES = [
  'Ropa de trabajo y calzado de seguridad Pampero, Ombú y Grafa 70. Envíos a todo el país.',
  'Envío gratis desde $45.000, 6 cuotas sin interés y 10% de descuento por transferencia.',
  'Uniformes con el logo de tu empresa, bordado o estampado. Emitimos Factura A y B.',
  'Comprá online en la tienda de Blacks y tenés 30 días para cambiar el talle.',
];
const PALABRAS = [
  ['blacks indumentaria', 'EXACT'], ['blacks indumentaria', 'PHRASE'],
  ['black indumentaria', 'EXACT'], ['black indumentaria', 'PHRASE'],
];
// Llamadas de la búsqueda vieja que siguen siendo ciertas. Afuera "Excelentes
// precios" (no se puede sostener) y "Venta por mayor y menor" (esta campaña es
// minorista y mayorista se apunta a empresas).
const LLAMADAS = ['Envíos a todo el país', 'Cuotas sin interés', 'Indumentaria Pampero', 'Calzado Pampero', 'Sitio 100% seguro', 'Merchandising'];

for (const t of TITULOS) if (t.length > 30) throw new Error(`Título largo (${t.length}): ${t}`);
for (const d of DESCRIPCIONES) if (d.length > 90) throw new Error(`Descripción larga (${d.length}): ${d}`);

async function existente(nombre) {
  const r = await gaql(`SELECT campaign.id, campaign.status FROM campaign WHERE campaign.name = "${nombre}" AND campaign.status != "REMOVED"`);
  return r[0] ? r[0].campaign : null;
}

async function operacionesPmax() {
  const vieja = (await gaql(`SELECT campaign.shopping_setting.merchant_id FROM campaign WHERE campaign.id = ${PMAX_VIEJA}`))[0].campaign;
  const recursos = await gaql(`SELECT asset_group_asset.field_type, asset.resource_name FROM asset_group_asset WHERE campaign.id = ${PMAX_VIEJA} AND asset_group_asset.source = "ADVERTISER"`);
  const deCampana = await gaql(`SELECT campaign.id, campaign_asset.field_type, asset.resource_name FROM campaign_asset WHERE campaign.id = ${PMAX_VIEJA} AND campaign_asset.source = "ADVERTISER"`);
  const senales = await gaql(`SELECT asset_group_signal.search_theme.text, asset_group_signal.audience.audience FROM asset_group_signal WHERE campaign.id = ${PMAX_VIEJA}`);

  const presupuesto = rn('campaignBudgets', -1);
  const campana = rn('campaigns', -2);
  const grupo = rn('assetGroups', -3);
  const ops = [
    { campaignBudgetOperation: { create: { resourceName: presupuesto, name: `${NOMBRE_PMAX} · presupuesto`, amountMicros: micros(PRESUPUESTO_PMAX), deliveryMethod: 'STANDARD', explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: campana, name: NOMBRE_PMAX, status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX',
      campaignBudget: presupuesto, maximizeConversions: {},
      shoppingSetting: { merchantId: vieja.shoppingSetting.merchantId },
      brandGuidelinesEnabled: true,
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST' },
      assetAutomationSettings: [
        { assetAutomationType: 'GENERATE_IMAGE_EXTRACTION', assetAutomationStatus: 'OPTED_IN' },
        { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' },
      ],
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    } } },
    { campaignCriterionOperation: { create: { campaign: campana, location: { geoTargetConstant: ARGENTINA } } } },
    { campaignCriterionOperation: { create: { campaign: campana, language: { languageConstant: ESPANOL } } } },
    ...deCampana.map((r) => ({ campaignAssetOperation: { create: { campaign: campana, asset: r.asset.resourceName, fieldType: r.campaignAsset.fieldType } } })),
    { assetGroupOperation: { create: { resourceName: grupo, campaign: campana, name: 'General', finalUrls: ['https://blacksindumentaria.com.ar'], status: 'ENABLED' } } },
    ...recursos.map((r) => ({ assetGroupAssetOperation: { create: { assetGroup: grupo, asset: r.asset.resourceName, fieldType: r.assetGroupAsset.fieldType } } })),
    { assetGroupListingGroupFilterOperation: { create: { assetGroup: grupo, type: 'UNIT_INCLUDED', listingSource: 'SHOPPING' } } },
    ...senales.filter((r) => r.assetGroupSignal.searchTheme)
      .map((r) => ({ assetGroupSignalOperation: { create: { assetGroup: grupo, searchTheme: { text: r.assetGroupSignal.searchTheme.text } } } })),
  ];
  // La señal de público vieja ("All Users of Blacks GA4", ~18.000 visitantes) era un
  // público atado a SU grupo de recursos: Google no deja reusarlo en otro. Se crea uno
  // igual (mismas listas) atado al grupo nuevo.
  const publicos = senales.filter((r) => r.assetGroupSignal.audience);
  for (const [i, r] of publicos.entries()) {
    const viejo = (await gaql(`SELECT audience.dimensions, audience.exclusion_dimension FROM audience WHERE audience.resource_name = "${r.assetGroupSignal.audience.audience}"`))[0].audience;
    const nuevo = rn('audiences', -(20 + i));
    ops.push({ audienceOperation: { create: { resourceName: nuevo, name: `${NOMBRE_PMAX} · visitantes ${i + 1}`, scope: 'ASSET_GROUP', assetGroup: grupo, dimensions: viejo.dimensions, ...(viejo.exclusionDimension ? { exclusionDimension: viejo.exclusionDimension } : {}) } } });
    ops.push({ assetGroupSignalOperation: { create: { assetGroup: grupo, audience: { audience: nuevo } } } });
  }
  return { ops, resumen: `${recursos.length} recursos del grupo, ${deCampana.length} de campaña (nombre y logos), ${senales.length} señales, catálogo ${vieja.shoppingSetting.merchantId}` };
}

async function operacionesMarca() {
  const llamadasViejas = await gaql(`SELECT campaign.id, asset.resource_name, asset.callout_asset.callout_text FROM campaign_asset WHERE campaign.id = ${BUSQUEDA_VIEJA} AND campaign_asset.field_type = "CALLOUT"`);
  const llamadas = llamadasViejas.filter((r) => LLAMADAS.includes(r.asset.calloutAsset.calloutText));
  const nombre = (await gaql(`SELECT campaign.id, asset.resource_name FROM campaign_asset WHERE campaign.id = ${BUSQUEDA_VIEJA} AND campaign_asset.field_type = "BUSINESS_NAME" AND campaign_asset.source = "ADVERTISER"`))[0];

  const presupuesto = rn('campaignBudgets', -11);
  const campana = rn('campaigns', -12);
  const grupo = rn('adGroups', -13);
  const ops = [
    { campaignBudgetOperation: { create: { resourceName: presupuesto, name: `${NOMBRE_MARCA} · presupuesto`, amountMicros: micros(PRESUPUESTO_MARCA), deliveryMethod: 'STANDARD', explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: campana, name: NOMBRE_MARCA, status: 'PAUSED', advertisingChannelType: 'SEARCH',
      campaignBudget: presupuesto, maximizeConversions: {},
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    } } },
    { campaignCriterionOperation: { create: { campaign: campana, location: { geoTargetConstant: ARGENTINA } } } },
    { campaignCriterionOperation: { create: { campaign: campana, language: { languageConstant: ESPANOL } } } },
    ...llamadas.map((r) => ({ campaignAssetOperation: { create: { campaign: campana, asset: r.asset.resourceName, fieldType: 'CALLOUT' } } })),
    ...(nombre ? [{ campaignAssetOperation: { create: { campaign: campana, asset: nombre.asset.resourceName, fieldType: 'BUSINESS_NAME' } } }] : []),
    { adGroupOperation: { create: { resourceName: grupo, campaign: campana, name: 'Marca', status: 'ENABLED', type: 'SEARCH_STANDARD' } } },
    ...PALABRAS.map(([text, matchType]) => ({ adGroupCriterionOperation: { create: { adGroup: grupo, status: 'ENABLED', keyword: { text, matchType } } } })),
    { adGroupAdOperation: { create: { adGroup: grupo, status: 'ENABLED', ad: {
      finalUrls: ['https://blacksindumentaria.com.ar/'],
      responsiveSearchAd: {
        // El nombre de la marca siempre primero: es una búsqueda de marca.
        headlines: TITULOS.map((text, i) => (i === 0 ? { text, pinnedField: 'HEADLINE_1' } : { text })),
        descriptions: DESCRIPCIONES.map((text) => ({ text })),
      },
    } } } },
  ];
  return { ops, resumen: `${PALABRAS.length} palabras de marca, ${TITULOS.length} títulos, ${DESCRIPCIONES.length} descripciones, ${llamadas.length} llamadas` };
}

/** Igual que las viejas: sólo las compras en la web cuentan para la puja. */
async function soloCompras(campaignId) {
  const metas = await gaql(`SELECT campaign_conversion_goal.resource_name, campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable FROM campaign_conversion_goal WHERE campaign.id = ${campaignId}`);
  const ops = metas
    .map((r) => r.campaignConversionGoal)
    // Las de categoría u origen UNKNOWN no se pueden editar por la API (Google devuelve
    // "'UNKNOWN' part of the resource name is invalid"); se dejan como vienen.
    .filter((g) => g.category !== 'UNKNOWN' && g.origin !== 'UNKNOWN')
    .filter((g) => g.biddable !== (g.category === 'PURCHASE' && g.origin === 'WEBSITE'))
    .map((g) => ({ campaignConversionGoalOperation: { update: { resourceName: g.resourceName, biddable: g.category === 'PURCHASE' && g.origin === 'WEBSITE' }, updateMask: 'biddable' } }));
  if (ops.length) await mutate(ops);
  return ops.length;
}

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const activar = process.argv.includes('--activar');

  if (activar) {
    for (const nombre of [NOMBRE_PMAX, NOMBRE_MARCA]) {
      const c = await existente(nombre);
      if (!c) { console.log(`· ${nombre}: no existe, corré antes con --aplicar`); continue; }
      await mutate([{ campaignOperation: { update: { resourceName: rn('campaigns', c.id), status: 'ENABLED' }, updateMask: 'status' } }]);
      console.log(`✓ ${nombre} (${c.id}) ACTIVA`);
    }
    return;
  }

  for (const [nombre, armar] of [[NOMBRE_PMAX, operacionesPmax], [NOMBRE_MARCA, operacionesMarca]]) {
    const ya = await existente(nombre);
    if (ya) {
      const metas = aplicar ? await soloCompras(ya.id) : 0;
      console.log(`· ${nombre} ya existe (${ya.id}, ${ya.status})${aplicar ? ` · ${metas} objetivos ajustados a sólo compras` : ''}`);
      continue;
    }
    const { ops, resumen } = await armar();
    if (!aplicar) {
      await mutate(ops, { validateOnly: true });
      console.log(`✓ ${nombre}: Google validó ${ops.length} operaciones (${resumen}). Corré con --aplicar para crearla en pausa.`);
      continue;
    }
    const respuestas = await mutate(ops);
    const creada = respuestas.map((r) => r.campaignResult).find(Boolean);
    const id = creada.resourceName.split('/').pop();
    const metas = await soloCompras(id);
    console.log(`✓ ${nombre} creada EN PAUSA (${id}) · ${resumen} · ${metas} objetivos ajustados a sólo compras`);
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
