#!/usr/bin/env node
/* =========================================================================
 * PIEZAS DEL CONJUNTO 01 (PROSPECTING) — campaña Motor — sep-2026
 *
 * Sube las imágenes y arma un anuncio por pieza dentro de
 * "01 · Prospecting amplio · Carrito".
 *
 * ── CORRECCIÓN URGENTE DEL 17-sep-2026 ──────────────────────────────────
 * El anuncio del Ripstop llevaba a la ficha MAYORISTA del producto, donde
 * dice "Consultar precio" y no hay carrito. El permalink salió de buscar
 * "cargo ripstop" en el catálogo y quedarse con el primer match, que era
 * `pan-ripstop-pampero` (mayorista, precio $0) en vez de
 * `pantalon-cargo-ripstop-antidesgarro-pampero` (minorista, $59.999).
 * CÓMO APLICAR: la tienda tiene fichas duplicadas mayorista/minorista con
 * nombres casi iguales. Un destino NUNCA se da por bueno porque devuelva
 * 200: hay que verificar que tenga precio y carrito.
 *
 * ── CADA ANUNCIO LLEVA LAS DOS VERSIONES DE LA IMAGEN ────────────────────
 * `asset_customization_rules` manda el 9:16 a historias y reels y el 4:5 al
 * resto. Es UN anuncio, así que la señal de aprendizaje no se parte en dos.
 *
 * ── UN TEXTO POR UBICACIÓN ───────────────────────────────────────────────
 * Meta NO deja rotar varios `bodies` cuando hay personalización por
 * ubicación: "no se pueden aplicar varios activos bodies a la regla 1". Cada
 * regla tiene que resolver a UN activo de cada tipo. Así que en vez de
 * rotación se hace algo mejor para este caso: texto largo en el feed, donde
 * se lee, y texto corto y directo en historias y reels, donde se pasa de
 * largo en un segundo. Doce textos distintos en la calle entre las 6 piezas,
 * y Meta compara al nivel del anuncio, que es donde hay volumen.
 *
 * ── DOS COSAS QUE LA API NO PERDONA ──────────────────────────────────────
 *  · El campo es `instagram_user_id`. `instagram_actor_id` quedó obsoleto y
 *    devuelve "must be a valid Instagram account id" aunque el ID esté bien.
 *  · Las reglas de personalización tienen que cubrir TODAS las ubicaciones
 *    del conjunto. Por eso la última es un cajón de sastre sin posiciones:
 *    si queda una sin regla, Meta rechaza el creativo entero.
 *
 * Uso:
 *   node scripts/subir-piezas-motor.js               → vista previa
 *   node scripts/subir-piezas-motor.js --aplicar     → crea lo que falte
 *   node scripts/subir-piezas-motor.js --reemplazar  → rehace TODO (borra y crea)
 * ========================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;

const CUENTA = 'act_3195782590470274';
const ADSET_PROSPECTING = '120250570451900783';
const PAGINA = '1622576497958916';
const IG_USER = '17841402095943903';

const TIENDA = 'https://blacksindumentaria.com.ar';

/* ── UTMs ────────────────────────────────────────────────────────────────
 * Sin esto GA4 no puede atribuir NADA de esta campaña, y toda la idea de
 * medirla con la misma vara que la agencia se cae. Se mandan como `url_tags`
 * del creativo: así valen también para el anuncio de catálogo, donde el link
 * lo pone el feed producto por producto y no hay una URL fija que tocar.
 *
 * Van los IDs además de los nombres a propósito: un nombre se renombra y el
 * histórico de GA4 se parte en dos; el ID no cambia nunca.
 *
 * OJO: `url_tags` NO se puede editar en un creativo ya creado ("Especifica
 * name, status o las etiquetas"). Para cambiarlas hay que rehacer el anuncio. */
const UTM = [
  'utm_source={{site_source_name}}',
  'utm_medium=paid_social',
  'utm_campaign=motor_primavera_26',
  'utm_content={{ad.name}}',
  'utm_term={{adset.name}}',
  'meta_campaign_id={{campaign.id}}',
  'meta_adset_id={{adset.id}}',
  'meta_ad_id={{ad.id}}',
  'segmento=minorista',
].join('&');
const CARPETA = process.env.PIEZAS_DIR
  || '/tmp/claude-501/-Users-sebastianelmore-blacks-content-engine/31f3eb5a-1f5c-47e5-900c-5c33d6d54112/scratchpad/piezas-final';

/* Los anuncios arrancan en el mismo estado que tenga la campaña: si está
 * corriendo, un reemplazo que quedara en pausa la dejaría sin anuncios. */
const ESTADO = process.argv.includes('--pausado') ? 'PAUSED' : 'ACTIVE';

const PIEZAS = [
  {
    archivo: 'cargo-ripstop',
    nombre: '01 · Cargo Ripstop',
    titulo: 'Cargo Ripstop — 30% OFF',
    cta: 'SHOP_NOW',
    url: `${TIENDA}/productos/pantalon-cargo-ripstop-antidesgarro-pampero/`, // ← minorista, verificada
    feed: 'El cargo que aguanta la jornada. Tela ripstop antidesgarro, bolsillos reforzados, para usar todos los días. 6 cuotas sin interés y envío gratis.',
    historia: 'Ripstop antidesgarro. 30% OFF y envío gratis desde $55.000.',
  },
  {
    archivo: 'jean-vaquero',
    nombre: '02 · Jean Vaquero',
    titulo: 'Jean Vaquero Clásico — $32.999',
    cta: 'SHOP_NOW',
    url: `${TIENDA}/productos/pantalones-jean-vaquero-clasico-recto-original/`,
    feed: 'El clásico que aguanta. Jean recto de trabajo, tela firme, corte de siempre. 6 cuotas sin interés.',
    historia: 'Jean recto de trabajo a $32.999 en 6 cuotas sin interés.',
  },
  {
    archivo: 'chomba-micropique',
    nombre: '03 · Chomba Micropique',
    titulo: 'Chomba Pampero — desde $21.999',
    cta: 'SHOP_NOW',
    url: `${TIENDA}/productos/chomba-micropique-pampero/`,
    feed: 'Primavera arrancó. Chomba de micropique, fresca y prolija, para laburar cómodo.',
    historia: 'Chombas de micropique desde $21.999. Frescas y prolijas.',
  },
  {
    archivo: 'detalle-tela',
    nombre: '04 · Detalle de tela',
    titulo: 'Hecho para durar',
    cta: 'LEARN_MORE',
    url: `${TIENDA}/pantalones/cargos/`,
    feed: 'Mirá la costura. Doble refuerzo en cada punto de desgaste, tela ripstop y remaches metálicos.',
    historia: 'Si se engancha, no se rasga. Eso es ripstop.',
  },
  {
    archivo: 'jornada',
    nombre: '05 · La jornada',
    titulo: 'Blacks Indumentaria Profesional',
    cta: 'SHOP_NOW',
    url: `${TIENDA}/primavera/`, // categoría real de temporada, no el listado entero
    feed: 'Desde temprano. Ropa de trabajo que aguanta la jornada entera.',
    historia: 'Arrancás a las 6 y terminás a las 6. Tu ropa igual.',
  },
  {
    archivo: 'conjunto',
    nombre: '06 · Equipo completo',
    titulo: 'Armá tu equipo de trabajo',
    cta: 'SHOP_NOW',
    url: `${TIENDA}/combos/`, // 18 productos armados, mucho mejor que /productos/
    feed: 'El equipo completo. Pantalón, chomba y borcegos en un solo pedido. 6 cuotas sin interés y envío gratis superando los $55.000.',
    historia: 'Armá tu equipo en un solo pedido. Envío gratis +$55.000.',
  },
];

/* ------------------------------- Utilidades ------------------------------- */

async function fbGet(p) {
  const res = await fetch(`${GRAPH}/${API}/${p}${p.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

async function fbPost(p, campos) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) {
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  body.append('access_token', TOKEN);
  const res = await fetch(`${GRAPH}/${API}/${p}`, { method: 'POST', body });
  const d = await res.json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
  return d;
}

async function fbDelete(id) {
  await fetch(`${GRAPH}/${API}/${id}?access_token=${TOKEN}`, { method: 'DELETE' });
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

function creativo(p, hFeed, hStory) {
  return {
    name: `Pieza ${p.nombre}`,
    url_tags: UTM,
    object_story_spec: { page_id: PAGINA, instagram_user_id: IG_USER },
    asset_feed_spec: {
      images: [
        { hash: hFeed, adlabels: [{ name: 'feed_img' }] },
        { hash: hStory, adlabels: [{ name: 'story_img' }] },
      ],
      bodies: [
        { text: p.feed, adlabels: [{ name: 'body_feed' }] },
        { text: p.historia, adlabels: [{ name: 'body_story' }] },
      ],
      titles: [{ text: p.titulo }],
      link_urls: [{ website_url: p.url }],
      call_to_action_types: [p.cta],
      ad_formats: ['SINGLE_IMAGE'],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['story', 'facebook_reels'],
            instagram_positions: ['story', 'reels'],
          },
          image_label: { name: 'story_img' },
          body_label: { name: 'body_story' },
          priority: 1,
        },
        {
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram', 'audience_network', 'messenger'],
          },
          image_label: { name: 'feed_img' },
          body_label: { name: 'body_feed' },
          priority: 2,
        },
      ],
    },
  };
}

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const reemplazar = process.argv.includes('--reemplazar');

  const faltan = [];
  for (const p of PIEZAS) {
    for (const f of ['45', '916']) {
      if (!fs.existsSync(path.join(CARPETA, f, `${p.archivo}.jpg`))) faltan.push(`${f}/${p.archivo}.jpg`);
    }
  }
  if (faltan.length) {
    console.error('Faltan archivos:\n  ' + faltan.join('\n  '));
    console.error('\nGeneralos con: python3 scripts/piezas-overlay.py <originales> ' + CARPETA);
    process.exit(1);
  }

  console.log(`\n${PIEZAS.length} piezas · 2 formatos · 2 textos cada una (feed / historias)`);
  console.log(`Estado de los anuncios: ${ESTADO}`);
  console.log(`Modo: ${reemplazar ? 'REEMPLAZAR (borra y rehace)' : aplicar ? 'APLICAR' : 'vista previa'}\n`);

  if (!aplicar && !reemplazar) {
    PIEZAS.forEach((p) => {
      console.log(`  ${p.nombre}  →  ${p.url}`);
      console.log(`     feed:      ${p.feed}`);
      console.log(`     historias: ${p.historia}`);
      console.log('');
    });
    console.log('Corré con --aplicar (crea lo que falte) o --reemplazar (rehace todo).');
    return;
  }

  const existentes = (await fbGet(`${CUENTA}/ads?fields=name&limit=200&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'DISAPPROVED', 'WITH_ISSUES', 'PREAPPROVED']))}`)).data || [];

  for (const p of PIEZAS) {
    const viejo = existentes.find((a) => a.name === p.nombre);
    if (viejo && !reemplazar) {
      console.log(`· ${p.nombre} ya existía, se saltea`);
      continue;
    }
    try {
      const hFeed = await subirImagen(path.join(CARPETA, '45', `${p.archivo}.jpg`));
      const hStory = await subirImagen(path.join(CARPETA, '916', `${p.archivo}.jpg`));
      const cr = await fbPost(`${CUENTA}/adcreatives`, creativo(p, hFeed, hStory));
      const ad = await fbPost(`${CUENTA}/ads`, {
        name: p.nombre,
        adset_id: ADSET_PROSPECTING,
        creative: { creative_id: cr.id },
        status: ESTADO,
      });
      // El viejo recién se borra cuando el nuevo YA existe: así el conjunto
      // nunca se queda sin anuncios en el medio de la operación.
      if (viejo) await fbDelete(viejo.id);
      console.log(`✓ ${p.nombre} → ${ad.id}${viejo ? ' (reemplazó ' + viejo.id + ')' : ''}`);
    } catch (e) {
      console.log(`✗ ${p.nombre}: ${e.message}`);
    }
  }

  console.log(`\nListo. Los anuncios quedaron en ${ESTADO}.`);
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
