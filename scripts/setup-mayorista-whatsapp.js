#!/usr/bin/env node
/* =========================================================================
 * CAMPAÑA MAYORISTA DE META QUE LLEVA A WHATSAPP — oct-2026
 *
 * POR QUÉ EXISTE
 * La agencia corría la mayorista optimizando COMPRAS en un píxel muerto
 * (/mayorista no tiene carrito: cierra por WhatsApp). $22.013 en 12 días → 1
 * conversación. El 1-oct-2026 la agencia ya no está y la mayorista quedó sin
 * nada en Meta, siendo el 76% de las consultas del negocio.
 *
 * QUÉ ARMA (idempotente: lo que ya existe con el mismo nombre no se duplica)
 *  · Campaña "Motor | Mayorista | WhatsApp" — objetivo Clientes potenciales
 *    (OUTCOME_LEADS): Meta busca gente con más chance de pedir cotización que
 *    con el objetivo Interacción, que trae charla.
 *  · Conjunto que optimiza CONVERSACIONES de WhatsApp al número que atiende
 *    Kommo (+54 9 11 5324-8230). El bot "ENTRANTES BIFURC" separa mayorista de
 *    minorista, así que hasta la consulta minorista que entre no se pierde.
 *  · Un carrusel de 5 tarjetas con fotos reales de la tienda, cada una con un
 *    beneficio para empresas (desde 10 u., logo bordado, Factura A, envíos,
 *    puntera de acero). Mensaje precargado: "Hola! Quiero cotizar ropa de
 *    trabajo para mi empresa", que el bot reconoce como mayorista.
 *
 *   node scripts/setup-mayorista-whatsapp.js              → vista previa
 *   node scripts/setup-mayorista-whatsapp.js --aplicar    → crea todo EN PAUSA
 *   node scripts/setup-mayorista-whatsapp.js --activar    → crea lo que falte y prende todo
 *
 * Presupuesto por defecto $4.000/día (MAYORISTA_PRESUPUESTO_DIARIO, en pesos).
 * Las tarjetas salen de: python3 scripts/carrusel-tarjetas.py anuncios/2026-10/mayorista-whatsapp/tarjetas.json
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';
const WHATSAPP = '5491153248230'; // el de Kommo (company_facts, theme y WABA "Blacks Indumentaria")
const PRESUPUESTO = Number(process.env.MAYORISTA_PRESUPUESTO_DIARIO || 4000);

const CAMPANA = 'Motor | Mayorista | WhatsApp';
const CONJUNTO = 'Mayorista · WhatsApp · Empresas';
const ANUNCIO = 'Carrusel · Mayorista · 5 rubros · 2026-10';
const CARPETA = path.join(__dirname, '..', 'anuncios', '2026-10', 'mayorista-whatsapp', 'tarjetas');

const TEXTO = '¿Necesitás ropa de trabajo para tu equipo? Armamos el pedido de tu empresa con Pampero, '
  + 'Ombú y Grafa 70: desde 10 unidades, con el logo bordado o estampado, Factura A y envíos a todo el país. '
  + 'Escribinos por WhatsApp y te pasamos la cotización.';
const PRECARGADO = 'Hola! Quiero cotizar ropa de trabajo para mi empresa.';
const SALUDO = '¡Hola! Contanos qué prendas y cuántas unidades necesitás, y te cotizamos.';

const TARJETAS = [
  { imagen: '01-uniformes.jpg', titulo: 'Ropa de trabajo para tu empresa', descripcion: 'Desde 10 unidades' },
  { imagen: '02-chombas-logo.jpg', titulo: 'Chombas con tu logo', descripcion: 'Bordado o estampado' },
  { imagen: '03-camisas.jpg', titulo: 'Camisas Ombú · Grafa 70 · Pampero', descripcion: 'Factura A' },
  { imagen: '04-cargo.jpg', titulo: 'Pantalones cargo de trabajo', descripcion: 'Envíos a todo el país' },
  { imagen: '05-calzado.jpg', titulo: 'Calzado de seguridad', descripcion: 'Puntera de acero' },
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

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const activar = process.argv.includes('--activar');
  const aplicar = process.argv.includes('--aplicar') || activar;
  const estado = activar ? 'ACTIVE' : 'PAUSED';

  for (const t of TARJETAS) {
    if (!fs.existsSync(path.join(CARPETA, t.imagen))) throw new Error(`Falta ${t.imagen}: corré primero scripts/carrusel-tarjetas.py`);
  }
  console.log(`\n${CAMPANA} · $${PRESUPUESTO.toLocaleString('es-AR')}/día · WhatsApp +${WHATSAPP} · ${aplicar ? (activar ? 'ACTIVAR' : 'APLICAR (en pausa)') : 'vista previa'}`);
  console.log(`  texto: ${TEXTO}\n  mensaje precargado: "${PRECARGADO}"`);
  TARJETAS.forEach((t, i) => console.log(`  ${i + 1}. ${t.titulo} · ${t.descripcion}`));
  if (!aplicar) return console.log('\nCorré con --aplicar (en pausa) o --activar.');

  // 1) Campaña
  let campana = await buscar(`${CUENTA}/campaigns`, CAMPANA);
  if (!campana) {
    campana = await fbPost(`${CUENTA}/campaigns`, {
      name: CAMPANA,
      objective: 'OUTCOME_LEADS',
      special_ad_categories: [],
      // Presupuesto por conjunto (ABO): Meta exige decirlo explícito en campañas nuevas.
      is_adset_budget_sharing_enabled: false,
      status: estado,
    });
    console.log(`✓ campaña ${campana.id}`);
  } else console.log(`· campaña ya existía ${campana.id}`);

  // 2) Conjunto
  let conjunto = await buscar(`${campana.id}/adsets`, CONJUNTO);
  if (!conjunto) {
    conjunto = await fbPost(`${CUENTA}/adsets`, {
      name: CONJUNTO,
      campaign_id: campana.id,
      destination_type: 'WHATSAPP',
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: Math.round(PRESUPUESTO * 100), // centavos (ver gotchas en memoria: daily_budget va en centavos)
      promoted_object: { page_id: PAGINA, whatsapp_phone_number: WHATSAPP },
      targeting: {
        geo_locations: { countries: ['AR'], location_types: ['home', 'recent'] },
        // Compradores de empresa: 25 es el mínimo que se puede FORZAR con
        // Advantage+ audience; el rango 28-60 va como sugerencia.
        age_min: 25,
        age_max: 65,
        age_range: [28, 60],
        targeting_automation: { advantage_audience: 1 },
        // Sin Marketplace ni columna derecha: recortan las tarjetas (medido el 28-sep).
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed', 'story', 'facebook_reels'],
        instagram_positions: ['stream', 'story', 'reels', 'explore'],
      },
      status: estado,
    });
    console.log(`✓ conjunto ${conjunto.id}`);
  } else console.log(`· conjunto ya existía ${conjunto.id}`);

  // 3) Anuncio (carrusel que abre WhatsApp en cada tarjeta)
  let anuncio = await buscar(`${conjunto.id}/ads`, ANUNCIO);
  if (!anuncio) {
    const hashes = [];
    for (const t of TARJETAS) hashes.push(await subirImagen(path.join(CARPETA, t.imagen)));
    const wa = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } };
    const creativo = await fbPost(`${CUENTA}/adcreatives`, {
      name: `Pieza ${ANUNCIO}`,
      object_story_spec: {
        page_id: PAGINA,
        instagram_user_id: IG_USER,
        link_data: {
          link: 'https://api.whatsapp.com/send',
          message: TEXTO,
          multi_share_optimized: true,
          multi_share_end_card: false,
          call_to_action: wa,
          child_attachments: TARJETAS.map((t, i) => ({
            link: 'https://api.whatsapp.com/send',
            image_hash: hashes[i],
            name: t.titulo,
            description: t.descripcion,
            call_to_action: wa,
          })),
          page_welcome_message: {
            type: 'VISUAL_EDITOR',
            version: 2,
            landing_screen_type: 'welcome_message',
            media_type: 'text',
            text_format: {
              customer_action_type: 'autofill_message',
              message: { text: SALUDO, autofill_message: { content: PRECARGADO } },
            },
          },
        },
      },
    });
    anuncio = await fbPost(`${CUENTA}/ads`, { name: ANUNCIO, adset_id: conjunto.id, creative: { creative_id: creativo.id }, status: estado });
    console.log(`✓ anuncio ${anuncio.id}`);
  } else console.log(`· anuncio ya existía ${anuncio.id}`);

  if (activar) {
    for (const id of [campana.id, conjunto.id, anuncio.id]) await fbPost(id, { status: 'ACTIVE' });
    console.log('✓ todo ACTIVO');
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
