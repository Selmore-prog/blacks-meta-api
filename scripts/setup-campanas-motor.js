#!/usr/bin/env node
/* =========================================================================
 * ESTRUCTURA DE CAMPAÑAS "MOTOR" — cuenta paralela, minorista — sep-2026
 *
 * POR QUÉ EXISTE
 * La cuenta que maneja la agencia (act_1081633014296710) tiene tres defectos
 * MEDIDOS que le cuestan plata, y que no se arreglan con creatividad:
 *   1. CERO exclusiones en los 10 conjuntos → Cold, Warm y Hot pujan entre
 *      ellos por la misma persona. Al que ya compró se le sigue pagando.
 *   2. La campaña mayorista optimiza por `PURCHASE` de un píxel
 *      (783070322886424) cuyo último evento fue el 20-jul-2026. Píxel muerto.
 *   3. Los product sets filtran por categoría + `in stock` y nada más: cero
 *      noción de temporada (de ahí las alpargatas en pleno invierno).
 *
 * Esta estructura corre en la cuenta VACÍA del mismo Business Manager
 * (act_3195782590470274 "BLACKS INDUMENTARIA") para poder comparar sin tocar
 * nada de la agencia. Mismo BM = se comparten píxel, catálogo y audiencias,
 * que es lo que permite EXCLUIR de verdad.
 *
 * LA DECISIÓN QUE MANDA TODO: SE OPTIMIZA POR CARRITO, NO POR COMPRA
 * Medido en la cuenta de la agencia, últimos 30 días:
 *      Compras            23  →  ~5,4 por semana
 *      Iniciar pago       76  →  ~18 por semana
 *      Agregar al carrito 255 →  ~59 por semana   ← el único arriba de 50
 * Meta necesita ~50 eventos por semana por conjunto para salir de fase de
 * aprendizaje (umbral que Andromeda ajustó en feb-mar 2026). Optimizar por
 * Compra con 5 por semana es condenar la campaña a aprendizaje permanente:
 * es exactamente lo que le pasa hoy a la agencia. Se arranca por Carrito
 * (cuesta $1.886 vs $20.914 la compra) y se migra a Compra recién cuando el
 * volumen lo aguante.
 *
 * DOS CONJUNTOS Y NO SEIS, A PROPÓSITO
 * Con este volumen, cada conjunto extra parte la señal y ninguno aprende.
 * Un DTC de indumentaria que consolidó 16 conjuntos en 2 bajó el CPA 23% en
 * seis semanas justamente por esto. Presupuesto a nivel campaña (CBO) para
 * que Meta reparta solo.
 *
 * TODO SE CREA EN PAUSA. Nada gasta un peso hasta que alguien lo active a
 * mano desde el Administrador de anuncios.
 *
 * Uso:
 *   node scripts/setup-campanas-motor.js            → muestra qué haría
 *   node scripts/setup-campanas-motor.js --aplicar  → lo crea (en PAUSA)
 * ========================================================================= */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

/* --------------------------------- Activos -------------------------------- */

const CUENTA = 'act_3195782590470274'; // BLACKS INDUMENTARIA (vacía, mismo BM)
const PIXEL = '5254594451333358'; // Pixel Black´s Indumentaria 2024 - TN (vivo)
const PAGINA = '1622576497958916';
const IG_ACTOR = '17841402095943903';
const CATALOGO = process.env.META_CATALOG_ID || '1668558807152270';

// Conjuntos de productos que mantiene src/adCatalogSet.js (con temporada,
// curva de talles, sin mayorista y sin duplicados).
const SET_CURADO = '1284747276956907'; // 49 productos, 1 item por producto
const SET_REMARKETING = '1604803547655031'; // 508 items, con talles duplicados a propósito

/* Las audiencias de la cuenta de la agencia NO se pueden usar desde acá
 * (Meta devuelve "públicos personalizados ya no disponibles"): pertenecen a
 * esa cuenta, no al BM. Así que se crean propias contra el MISMO píxel. Con
 * `prefill: true` nacen con el historial de los últimos 90 días adentro, no
 * vacías esperando tráfico nuevo. */
const AUDIENCIAS = [
  { clave: 'compradores', name: 'Motor · Compradores 90d', evento: 'Purchase' },
  { clave: 'carrito', name: 'Motor · Carrito 90d', evento: 'AddToCart' },
  { clave: 'visitantes', name: 'Motor · Visitantes 90d', evento: 'PageView' },
];

const TIENDA = process.env.STORE_URL || 'https://blacksindumentaria.com.ar';

/* ------------------------------- Presupuesto ------------------------------ */
/* $9.000/día es un punto medio explícito, no un número mágico:
 *   · a $1.886 el carrito, da ~33 carritos por semana (el umbral son 50),
 *   · para salir limpio de aprendizaje harían falta $13.500/día,
 *   · abajo de $6.000/día no se lee nada y es plata tirada.
 * Se cambia acá o desde el Administrador antes de activar. */
const PRESUPUESTO_DIARIO_ARS = Number(process.env.MOTOR_PRESUPUESTO_DIARIO || 9000);

/* ------------------------------ Utilidades API ---------------------------- */

async function fb(metodo, path, campos = {}) {
  // OJO: en un GET el token TIENE que ir en la query. Si se lo deja en el body,
  // `fetch` lo descarta sin avisar y Meta contesta "(#200) Provide valid app ID",
  // que no tiene nada que ver con lo que realmente pasó.
  const url = metodo === 'GET'
    ? `${GRAPH}/${API}/${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`
    : `${GRAPH}/${API}/${path}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) {
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  body.append('access_token', TOKEN);
  const res = await fetch(url, metodo === 'GET' ? undefined : { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const e = data.error;
    throw new Error(`${e.message}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''} [code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}]`);
  }
  return data;
}

// 7 días clic + 1 día visualización: la ventana estándar. Se deja explícita
// para que la comparación contra la cuenta de la agencia sea pareja.
const ATRIBUCION = [
  { event_type: 'CLICK_THROUGH', window_days: 7 },
  { event_type: 'VIEW_THROUGH', window_days: 1 },
];

const GEO = { countries: ['AR'], location_types: ['home', 'recent'] };
const RETENCION_90D = 7776000;

/* Idempotencia: este script se va a correr más de una vez (la primera falló
 * por permisos). Nunca duplica: si ya existe algo con el mismo nombre, lo
 * reusa. */
async function buscarPorNombre(edge, nombre) {
  const d = await fb('GET', `${CUENTA}/${edge}?fields=name,id&limit=200`);
  return (d.data || []).find((x) => x.name === nombre) || null;
}

async function asegurarAudiencias() {
  const ids = {};
  for (const a of AUDIENCIAS) {
    const ya = await buscarPorNombre('customaudiences', a.name);
    if (ya) {
      console.log(`· Audiencia ya existía: ${a.name} → ${ya.id}`);
      ids[a.clave] = ya.id;
      continue;
    }
    const r = await fb('POST', `${CUENTA}/customaudiences`, {
      name: a.name,
      prefill: 'true', // `subtype` ya no se admite en v21.0: se infiere de la regla
      rule: {
        inclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: PIXEL }],
            retention_seconds: RETENCION_90D,
            filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: a.evento }] },
          }],
        },
      },
    });
    console.log(`✓ Audiencia creada: ${a.name} → ${r.id}`);
    ids[a.clave] = r.id;
  }
  return ids;
}

/* --------------------------------- Armado --------------------------------- */

const campania = {
  name: 'Motor | Minorista | Primavera 26',
  objective: 'OUTCOME_SALES',
  status: 'PAUSED',
  special_ad_categories: [],
  buying_type: 'AUCTION',
  daily_budget: Math.round(PRESUPUESTO_DIARIO_ARS * 100), // la API va en centavos
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
};

function conjuntos(campaignId, aud) {
  return [
    {
      name: '01 · Prospecting amplio · Carrito',
      campaign_id: campaignId,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      destination_type: 'WEBSITE',
      promoted_object: { pixel_id: PIXEL, custom_event_type: 'ADD_TO_CART' },
      attribution_spec: ATRIBUCION,
      targeting: {
        geo_locations: GEO,
        age_min: 18,
        age_max: 65,
        // Público amplio a propósito: con este volumen los intereses sólo
        // achican el pozo de aprendizaje. Lo que sí hacemos y la agencia no
        // es EXCLUIR a quien ya compró.
        targeting_automation: { advantage_audience: 1 },
        excluded_custom_audiences: [{ id: aud.compradores }],
        // Sin publisher_platforms = ubicaciones Advantage+ (todas).
      },
    },
    {
      name: '02 · Retargeting 90d · Catálogo curado',
      campaign_id: campaignId,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      /* `product_catalog_id` NO va acá: con conversiones de sitio Meta lo
       * rechaza ("no se admite con el objetivo WEBSITE_CONVERSIONS"). El
       * catálogo lo deduce solo del `product_set_id`. */
      promoted_object: {
        pixel_id: PIXEL,
        custom_event_type: 'ADD_TO_CART',
        product_set_id: SET_REMARKETING,
      },
      attribution_spec: ATRIBUCION,
      targeting: {
        geo_locations: GEO,
        age_min: 18,
        age_max: 65,
        custom_audiences: [{ id: aud.visitantes }, { id: aud.carrito }],
        excluded_custom_audiences: [{ id: aud.compradores }],
      },
    },
  ];
}

/* El anuncio de catálogo se puede crear YA: las piezas las arma Meta con las
 * fotos y precios del feed, así que no depende de que haya creatividades
 * nuevas. El conjunto 01 queda esperando las piezas. */
function creativoCatalogo() {
  return {
    name: 'Catálogo · Motor Remarketing',
    product_set_id: SET_REMARKETING,
    object_story_spec: {
      page_id: PAGINA,
      /* @blacks.indumentaria quedó asignada a esta cuenta publicitaria en el BM
       * el 17-sep-2026. Sin esto, el ANUNCIO falla (el creativo se crea igual,
       * el error salta recién al crear el anuncio) porque el conjunto tiene
       * ubicaciones de Instagram y Meta exige una identidad para mostrarlas.
       * El campo es `instagram_user_id`: `instagram_actor_id` quedó obsoleto y
       * en v21 devuelve "must be a valid Instagram account id" aunque el ID
       * sea correcto y el activo esté bien asignado. */
      instagram_user_id: IG_ACTOR,
      template_data: {
        link: TIENDA,
        message: 'Lo que estuviste mirando, todavía está.',
        name: '{{product.name}}',
        description: '{{product.current_price}}',
        call_to_action: { type: 'SHOP_NOW' },
        format_option: 'carousel_images_multi_items',
      },
    },
  };
}

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const aplicar = process.argv.includes('--aplicar');

  if (!TOKEN) {
    console.error('Falta META_ADS_ACCESS_TOKEN en el .env');
    process.exit(1);
  }

  console.log(`\nCuenta destino : ${CUENTA} (BLACKS INDUMENTARIA)`);
  console.log(`Presupuesto    : $${PRESUPUESTO_DIARIO_ARS.toLocaleString('es-AR')}/día a nivel campaña (CBO)`);
  console.log(`Optimización   : Agregar al carrito (no Compra) — ver cabecera`);
  console.log(`Modo           : ${aplicar ? 'APLICAR (crea todo EN PAUSA)' : 'vista previa, no escribe nada'}\n`);

  if (!aplicar) {
    console.log('Campaña:', JSON.stringify(campania, null, 1));
    console.log('\nConjuntos:', JSON.stringify(conjuntos('<id>', { compradores: '<aud>', carrito: '<aud>', visitantes: '<aud>' }), null, 1));
    console.log('\nCorré con --aplicar para crearlo.');
    return;
  }

  const aud = await asegurarAudiencias();

  let camp = await buscarPorNombre('campaigns', campania.name);
  if (camp) {
    console.log(`· Campaña ya existía: ${camp.id} (se reusa, no se duplica)`);
  } else {
    camp = await fb('POST', `${CUENTA}/campaigns`, campania);
    console.log(`✓ Campaña creada: ${camp.id}`);
  }

  const creados = [];
  for (const cj of conjuntos(camp.id, aud)) {
    const ya = await buscarPorNombre('adsets', cj.name);
    if (ya) {
      console.log(`· Conjunto ya existía: ${cj.name} → ${ya.id}`);
      creados.push({ ...cj, id: ya.id });
      continue;
    }
    try {
      const r = await fb('POST', `${CUENTA}/adsets`, cj);
      console.log(`✓ Conjunto creado: ${cj.name} → ${r.id}`);
      creados.push({ ...cj, id: r.id });
    } catch (e) {
      console.log(`✗ Conjunto "${cj.name}" NO se creó: ${e.message}`);
    }
  }

  const retarget = creados.find((c) => c.name.startsWith('02'));
  if (retarget) {
    try {
      const adYa = await buscarPorNombre('ads', 'Catálogo dinámico · Motor');
      if (adYa) { console.log(`· Anuncio de catálogo ya existía: ${adYa.id}`); throw { ya: true }; }
      // El creativo puede haber quedado de un intento anterior que falló al
      // crear el anuncio: se reusa en vez de dejar copias sueltas dando vueltas.
      const cr = (await buscarPorNombre('adcreatives', creativoCatalogo().name))
        || (await fb('POST', `${CUENTA}/adcreatives`, creativoCatalogo()));
      const ad = await fb('POST', `${CUENTA}/ads`, {
        name: 'Catálogo dinámico · Motor',
        adset_id: retarget.id,
        creative: { creative_id: cr.id },
        status: 'PAUSED',
      });
      console.log(`✓ Anuncio de catálogo creado: ${ad.id} (en pausa)`);
    } catch (e) {
      if (!e.ya) console.log(`✗ Anuncio de catálogo NO se creó: ${e.message}`);
    }
  }

  console.log('\nTodo quedó EN PAUSA. Revisalo en el Administrador de anuncios antes de activar.');
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
