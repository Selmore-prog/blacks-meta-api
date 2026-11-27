#!/usr/bin/env node
/* =========================================================================
 * GOOGLE SHOPPING · CARGOS Y TEMPORADA — 20-nov-2026
 *
 * POR QUÉ (análisis del 20-nov con el dueño): ningún producto minorista de la
 * tienda estaba en una campaña de Shopping activa. En Merchant Center los
 * cargos, remeras, chombas y bermudas figuraban "No campaigns advertising this
 * product". "MaxPerf_ Genérica" no tiene Merchant Center vinculado (gasta en
 * Discover/YouTube) y "Blacks - Pmax - General" está en pausa. Quien busca
 * "pantalón cargo pampero" ve los anuncios con foto y precio de ML, no los
 * nuestros.
 *
 * QUÉ CREA (todo EN PAUSA; prender es decisión del dueño):
 *   A. "Blacks | Shopping | Cargos"                      $5.000/día
 *   B. "Blacks | Shopping | Remeras, chombas y bermudas" $3.000/día
 * Shopping estándar con CPC manual (sin que el algoritmo elija ganadores),
 * sólo búsqueda de Google, Argentina. Cada producto con su tope de clic según
 * el margen (costo de la planilla del ML Manager, precio de la tienda, envío
 * gratis desde $45.000 y cuotas): ver TOPES abajo. Todas las variantes de cada
 * producto (también las sin stock: si vuelven, se publican solas).
 * Conversiones de estas campañas: sólo COMPRAS (los contactos de WhatsApp y
 * formularios mayoristas no cuentan acá).
 *
 * ⚠️ PRIORIDAD: una Performance Max que incluya los mismos productos le gana a
 * Shopping estándar. Hoy "Milbrands | Perfomance Max | Hotsale 2026" figura
 * ENABLED con todos los productos: el script avisa si está sirviendo.
 *
 *   node scripts/setup-shopping-temporada.js            → ensayo (validateOnly, no crea nada)
 *   node scripts/setup-shopping-temporada.js --aplicar  → crea todo EN PAUSA
 * ========================================================================= */

require('dotenv').config({ quiet: true });

const V = 'v26';
const C = process.env.GOOGLE_ADS_CUSTOMER_ID;
const MERCHANT = '5629307403';
const FEED = 'AR';
const APLICAR = process.argv.includes('--aplicar');
const pesos = n => Math.round(n * 1e6);

/* Tope de CPC por producto (pesos). Margen estimado por venta, después de envío
   gratis, cobro y cuotas: cargos Pampero ~$6k, cargos Gurre ~$10k, ripstop Gurre
   ~$5k, chomba ~$10k, remeras ~$7k, bermuda cargo Pampero ~$4k, bermudas Gurre
   ~$8k. Tope ≈ margen × 1,5 % de conversión. */
const CAMPANAS = [
  {
    nombre: 'Blacks | Shopping | Cargos', presupuesto: 5000, grupo: 'Cargos',
    productos: {
      'Pantalon Cargo Ripstop Antidesgarro Pampero': 100,
      'Pantalon Cargo Slim Fit Elastizado Pampero': 100,
      'Pantalon Cargo Reforzado Pampero': 100,
      'Pantalon Cargo Fit Gurre Elastizado Premium': 140,
      'Pantalon Cargo Cazador Gurre Reforzado': 140,
      'Pantalon Cargo Ripstop Gurre Antidesgarro Premium': 80
    }
  },
  {
    nombre: 'Blacks | Shopping | Remeras, chombas y bermudas', presupuesto: 3000, grupo: 'Temporada',
    productos: {
      'Chomba Micropique Pampero': 120,
      'Pack X2 Chomba Micropique Pampero': 140,
      'Remera Lisa Algodón Pampero': 90,
      'Pack X2 Remera Lisa Algodón Pampero': 120,
      'Remera Lisa Algodon Gurre': 80,
      'Remera Oversize Lisa Blacks': 60,
      'Bermuda Cargo Cazador Gurre': 110,
      'Bermuda Nautica Gurre Con Reflectivo': 80,
      'Bermuda Cargo Pampero': 60
    }
  }
];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\(.*$/, '').trim();

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google no dio token: ' + JSON.stringify(j));
  return j.access_token;
}

(async () => {
  const H = { Authorization: 'Bearer ' + await token(), 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) H['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const base = `https://googleads.googleapis.com/${V}/customers/${C}`;
  const gaql = async query => {
    const out = []; let pageToken;
    do {
      const r = await (await fetch(base + '/googleAds:search', { method: 'POST', headers: H, body: JSON.stringify(pageToken ? { query, pageToken } : { query }) })).json();
      if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 500));
      out.push(...(r.results || [])); pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  };

  // 0) Avisos previos: PMax que podrían ganarle, y que no existan ya estas campañas.
  const pmax = await gaql("SELECT campaign.name, campaign.status, campaign.serving_status, campaign.end_date_time, campaign.shopping_setting.merchant_id FROM campaign WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND campaign.status = 'ENABLED'");
  pmax.forEach(p => console.log('PMax activa:', p.campaign.name, '· sirviendo:', p.campaign.servingStatus, '· fin:', p.campaign.endDateTime || '-', '· Merchant Center:', (p.campaign.shoppingSetting && p.campaign.shoppingSetting.merchantId) || 'no'));
  const ya = await gaql("SELECT campaign.name FROM campaign WHERE campaign.status != 'REMOVED'");
  const nombres = new Set(ya.map(x => x.campaign.name));
  for (const c of CAMPANAS) if (nombres.has(c.nombre)) throw new Error(`Ya existe "${c.nombre}": no la duplico.`);

  // 1) Ids de Merchant Center de cada producto (todas sus variantes).
  const sp = await gaql(`SELECT shopping_product.title, shopping_product.item_id, shopping_product.availability FROM shopping_product WHERE shopping_product.feed_label = '${FEED}'`);
  const porNombre = {};
  for (const x of sp) {
    const k = norm(x.shoppingProduct.title);
    (porNombre[k] = porNombre[k] || []).push({ id: String(x.shoppingProduct.itemId).toLowerCase(), stock: x.shoppingProduct.availability === 'IN_STOCK' });
  }

  // 2) Operaciones (un solo pedido atómico por campaña).
  let temp = -1;
  const nuevo = () => temp--;
  for (const c of CAMPANAS) {
    const ops = [];
    const bud = `customers/${C}/campaignBudgets/${nuevo()}`;
    const cam = `customers/${C}/campaigns/${nuevo()}`;
    const ag = `customers/${C}/adGroups/${nuevo()}`;
    const raiz = `customers/${C}/adGroupCriteria/${ag.split('/').pop()}~${nuevo()}`;
    ops.push({ campaignBudgetOperation: { create: { resourceName: bud, name: c.nombre + ' · presupuesto', amountMicros: pesos(c.presupuesto), deliveryMethod: 'STANDARD', explicitlyShared: false } } });
    ops.push({ campaignOperation: { create: {
      resourceName: cam, name: c.nombre, status: 'PAUSED', advertisingChannelType: 'SHOPPING', campaignBudget: bud,
      manualCpc: { enhancedCpcEnabled: false },
      shoppingSetting: { merchantId: MERCHANT, feedLabel: FEED, campaignPriority: 0 },
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
    } } });
    ops.push({ campaignCriterionOperation: { create: { campaign: cam, location: { geoTargetConstant: 'geoTargetConstants/2032' } } } });
    ops.push({ adGroupOperation: { create: { resourceName: ag, name: c.grupo, campaign: cam, type: 'SHOPPING_PRODUCT_ADS', status: 'ENABLED', cpcBidMicros: pesos(50) } } });
    ops.push({ adGroupAdOperation: { create: { adGroup: ag, status: 'ENABLED', ad: { shoppingProductAd: {} } } } });
    ops.push({ adGroupCriterionOperation: { create: { resourceName: raiz, adGroup: ag, status: 'ENABLED', listingGroup: { type: 'SUBDIVISION' } } } });
    let total = 0, conStock = 0;
    console.log(`\n${c.nombre} · $${c.presupuesto}/día · EN PAUSA`);
    for (const [prod, tope] of Object.entries(c.productos)) {
      const items = porNombre[norm(prod)] || [];
      if (!items.length) { console.log(`  ⚠ ${prod}: no está en Merchant Center, queda afuera`); continue; }
      const s = items.filter(i => i.stock).length;
      total += items.length; conStock += s;
      console.log(`  ${prod.padEnd(50)} tope $${String(tope).padStart(3)} · ${items.length} variantes (${s} con stock)`);
      for (const it of items) {
        ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, status: 'ENABLED', cpcBidMicros: pesos(tope), listingGroup: { type: 'UNIT', parentAdGroupCriterion: raiz, caseValue: { productItemId: { value: it.id } } } } } });
      }
    }
    // "Todo lo demás": excluido.
    ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, negative: true, listingGroup: { type: 'UNIT', parentAdGroupCriterion: raiz, caseValue: { productItemId: {} } } } } });
    console.log(`  total: ${total} variantes (${conStock} con stock) · ${ops.length} operaciones`);

    const r = await fetch(base + '/googleAds:mutate', { method: 'POST', headers: H, body: JSON.stringify({ mutateOperations: ops, validateOnly: !APLICAR }) });
    const j = await r.json();
    if (!r.ok) { console.log('  ✗ Google rechazó:', JSON.stringify(j).slice(0, 1500)); process.exitCode = 1; continue; }
    if (!APLICAR) { console.log('  ✓ Ensayo bien: Google acepta todo (no se creó nada).'); continue; }
    const creada = (j.mutateOperationResponses || []).map(x => x.campaignResult && x.campaignResult.resourceName).find(Boolean);
    console.log('  ✓ Creada EN PAUSA:', creada);

    // Conversiones de esta campaña: sólo compras.
    const id = creada.split('/').pop();
    const metas = await gaql(`SELECT campaign_conversion_goal.resource_name, campaign_conversion_goal.category, campaign_conversion_goal.biddable FROM campaign_conversion_goal WHERE campaign.id = ${id}`);
    const cambiar = metas.filter(m => (m.campaignConversionGoal.category === 'PURCHASE') !== !!m.campaignConversionGoal.biddable)
      .map(m => ({ update: { resourceName: m.campaignConversionGoal.resourceName, biddable: m.campaignConversionGoal.category === 'PURCHASE' }, updateMask: 'biddable' }));
    if (cambiar.length) {
      const rr = await fetch(base + '/campaignConversionGoals:mutate', { method: 'POST', headers: H, body: JSON.stringify({ operations: cambiar }) });
      console.log('  conversiones: sólo compras →', rr.ok ? 'listo' : 'no se pudo: ' + (await rr.text()).slice(0, 300));
    }
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
