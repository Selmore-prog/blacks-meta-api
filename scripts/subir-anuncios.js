#!/usr/bin/env node
/* =========================================================================
 * SUBIR ANUNCIOS A UN CONJUNTO DE META (fotos y videos) — desde oct-2026
 *
 * Generaliza scripts/subir-piezas-motor.js: aquél tenía las 6 piezas del
 * 17-sep escritas en el código. Éste lee un spec JSON, así que cada tanda
 * nueva es un archivo y no un cambio de código.
 *
 *   node scripts/subir-anuncios.js <spec.json>             → vista previa
 *   node scripts/subir-anuncios.js <spec.json> --aplicar   → crea lo que falte
 *   node scripts/subir-anuncios.js <spec.json> --actualizar → a los que YA existen
 *        (mismo nombre) les pone un creativo nuevo: mismo ID de anuncio, así el
 *        manifiesto de precios y los informes no se rompen. Vuelven a revisión.
 *
 * Spec:
 * { "adset": "1202...", "piezas": [{
 *     "nombre": "05 · Jean Clásico · $36.999",
 *     "tipo": "imagen" | "video",
 *     "feed": "ruta 4:5 (jpg o mp4)", "vertical": "ruta 9:16 (jpg o mp4)",
 *     "cuadrado": "ruta 1:1 (jpg o mp4) — opcional pero recomendado",
 *     "portada_feed" / "portada_vertical" / "portada_cuadrado": "jpg (sólo video)",
 *     "titulo": "...", "descripcion": "...", "cta": "SHOP_NOW",
 *     "url": "https://blacksindumentaria.com.ar/productos/...",
 *     "texto_feed": "...", "texto_vertical": "...",
 *     "pausar": ["ad_id viejo que este anuncio reemplaza"] }] }
 *
 * CARRUSEL (oct-2026, lo arma scripts/carrusel-mas-vendidos.js):
 *   { "nombre", "tipo": "carrusel", "url": "destino del 'ver más'",
 *     "texto_feed": "texto principal", "cta": "SHOP_NOW",
 *     "ordenar_por_rendimiento": true   (Meta reordena las tarjetas según cuál
 *                                       rinde; sólo en Facebook. false = el orden del spec),
 *     "tarjetas": [{ "imagen": "1080x1080.jpg", "titulo", "descripcion", "url" }] }
 *   Cada tarjeta lleva a SU producto. Va un solo texto para todas las ubicaciones:
 *   el carrusel no admite reglas por ubicación (en historias Meta pone cada
 *   tarjeta sobre su propio fondo, no hace falta versión 9:16).
 *
 * LO QUE YA SE APRENDIÓ Y ESTÁ RESUELTO ACÁ (ver subir-piezas-motor.js):
 *  · Un solo anuncio con TRES formatos (`asset_customization_rules`), así no se
 *    parte la señal de aprendizaje y ninguna ubicación recorta el texto:
 *      9:16 → historias y reels de Facebook e Instagram
 *      4:5  → feeds (Facebook, Instagram, Explorar, perfil)
 *      1:1  → todo lo demás (columna derecha, búsqueda, Marketplace, Messenger,
 *             Audience Network): esas ubicaciones recortan el 4:5 a cuadrado y
 *             se comían el titular o las cuotas.
 *    Sin "cuadrado" en el spec queda como antes: el 4:5 va a todo lo que no es vertical.
 *  · La ÚLTIMA regla es un cajón de sastre sin posiciones: si queda una
 *    ubicación sin regla, Meta rechaza el creativo entero.
 *  · Un texto por ubicación con `body_label` (no se pueden rotar varios
 *    `bodies` con reglas por ubicación).
 *  · La identidad de IG va en `instagram_user_id` (`instagram_actor_id`
 *    quedó obsoleto y da un error que despista).
 *  · SIN `url_tags`: los anuncios del 21-sep no las tienen y Meta agrega sola
 *    utm_source=ig|fb, utm_medium=paid y utm_campaign=<ID de campaña>. Así la
 *    sección Pauta cruza la campaña contra GA4 por ID. Las del 17-sep sí las
 *    tenían (motor_primavera_26) y en GA4 la misma campaña quedó partida en
 *    dos nombres: no repetirlo.
 *  · Un reemplazo PAUSA el anuncio viejo recién cuando el nuevo ya existe.
 *    Pausa, no borra: el historial del viejo sirve para comparar.
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

/* ------------------------------- Utilidades ------------------------------- */

async function fbGet(p) {
  const res = await fetch(`${GRAPH}/${API}/${p}${p.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
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
  if (d.error) throw new Error(`${d.error.error_user_msg || d.error.message} [${d.error.code}/${d.error.error_subcode || ''}]`);
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

/* Los videos se procesan en Meta después de subirse: un creativo que apunta a
 * un video todavía "processing" falla con un error genérico. Se espera a
 * `ready` (en la práctica, 20-90 segundos para un clip de 10 s). */
async function subirVideo(ruta) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('name', path.basename(ruta));
  fd.append('source', new Blob([fs.readFileSync(ruta)], { type: 'video/mp4' }), path.basename(ruta));
  const res = await fetch(`${GRAPH}/${API}/${CUENTA}/advideos`, { method: 'POST', body: fd });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  for (let i = 0; i < 60; i++) {
    const st = await fbGet(`${d.id}?fields=status`);
    const estado = st.status && st.status.video_status;
    if (estado === 'ready') return d.id;
    if (estado === 'error') throw new Error(`Meta no pudo procesar el video ${path.basename(ruta)}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`El video ${path.basename(ruta)} no terminó de procesarse en 5 minutos`);
}

const REGLA_VERTICAL = {
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['story', 'facebook_reels'],
  instagram_positions: ['story', 'reels'],
};
// Feeds donde el 4:5 se ve entero. "video_feeds" sólo existe para video.
const reglaFeed = (esVideo) => ({
  publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: esVideo ? ['feed', 'profile_feed', 'video_feeds'] : ['feed', 'profile_feed'],
  instagram_positions: ['stream', 'explore', 'profile_feed'],
});
const REGLA_RESTO = { publisher_platforms: ['facebook', 'instagram', 'audience_network', 'messenger'] };

function creativo(p, activos) {
  const esVideo = p.tipo === 'video';
  const conCuadrado = Boolean(p.cuadrado);
  const etiqueta = esVideo ? 'video_label' : 'image_label';
  const afs = {
    bodies: [
      { text: p.texto_feed, adlabels: [{ name: 'body_feed' }] },
      { text: p.texto_vertical, adlabels: [{ name: 'body_vertical' }] },
    ],
    titles: [{ text: p.titulo }],
    link_urls: [{ website_url: p.url }],
    call_to_action_types: [p.cta || 'SHOP_NOW'],
    ad_formats: [esVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
    // La ÚLTIMA regla siempre es el cajón de sastre sin posiciones.
    asset_customization_rules: [
      { customization_spec: REGLA_VERTICAL, [etiqueta]: { name: 'vertical' }, body_label: { name: 'body_vertical' }, priority: 1 },
      ...(conCuadrado
        ? [
          { customization_spec: reglaFeed(esVideo), [etiqueta]: { name: 'feed' }, body_label: { name: 'body_feed' }, priority: 2 },
          { customization_spec: REGLA_RESTO, [etiqueta]: { name: 'cuadrado' }, body_label: { name: 'body_feed' }, priority: 3 },
        ]
        : [{ customization_spec: REGLA_RESTO, [etiqueta]: { name: 'feed' }, body_label: { name: 'body_feed' }, priority: 2 }]),
    ],
  };
  if (p.descripcion) afs.descriptions = [{ text: p.descripcion }];
  if (esVideo) {
    afs.videos = [
      { video_id: activos.videoFeed, thumbnail_hash: activos.portadaFeed, adlabels: [{ name: 'feed' }] },
      { video_id: activos.videoVertical, thumbnail_hash: activos.portadaVertical, adlabels: [{ name: 'vertical' }] },
    ];
    if (conCuadrado) afs.videos.push({ video_id: activos.videoCuadrado, thumbnail_hash: activos.portadaCuadrado, adlabels: [{ name: 'cuadrado' }] });
  } else {
    afs.images = [
      { hash: activos.feed, adlabels: [{ name: 'feed' }] },
      { hash: activos.vertical, adlabels: [{ name: 'vertical' }] },
    ];
    if (conCuadrado) afs.images.push({ hash: activos.cuadrado, adlabels: [{ name: 'cuadrado' }] });
  }
  return {
    name: `Pieza ${p.nombre}`,
    object_story_spec: { page_id: PAGINA, instagram_user_id: IG_USER },
    asset_feed_spec: afs,
  };
}

function creativoCarrusel(p, hashes) {
  const cta = p.cta || 'SHOP_NOW';
  return {
    name: `Pieza ${p.nombre}`,
    object_story_spec: {
      page_id: PAGINA,
      instagram_user_id: IG_USER,
      link_data: {
        link: p.url,
        message: p.texto_feed,
        multi_share_optimized: p.ordenar_por_rendimiento !== false,
        // Sin la tarjeta final con la foto de perfil: ocupa un lugar y no vende nada.
        multi_share_end_card: false,
        call_to_action: { type: cta, value: { link: p.url } },
        child_attachments: p.tarjetas.map((t, i) => ({
          link: t.url,
          image_hash: hashes[i],
          name: t.titulo,
          ...(t.descripcion ? { description: t.descripcion } : {}),
          call_to_action: { type: cta, value: { link: t.url } },
        })),
      },
    },
  };
}

const archivosDe = (p) => {
  if (p.tipo === 'carrusel') return (p.tarjetas || []).map((t) => t.imagen);
  if (p.tipo === 'video') {
    return [p.feed, p.vertical, p.portada_feed, p.portada_vertical, ...(p.cuadrado ? [p.cuadrado, p.portada_cuadrado] : [])];
  }
  return [p.feed, p.vertical, ...(p.cuadrado ? [p.cuadrado] : [])];
};

/* ---------------------------------- Main ---------------------------------- */

(async () => {
  const specPath = process.argv[2];
  const actualizar = process.argv.includes('--actualizar');
  const aplicar = process.argv.includes('--aplicar') || actualizar;
  if (!specPath) {
    console.error('Uso: node scripts/subir-anuncios.js <spec.json> [--aplicar]');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const base = path.dirname(path.resolve(specPath));
  const ruta = (r) => (path.isAbsolute(r) ? r : path.join(base, r));

  const faltan = [];
  for (const p of spec.piezas) {
    if (p.tipo === 'carrusel' && !((p.tarjetas || []).length >= 2 && p.tarjetas.length <= 10)) {
      faltan.push(`${p.nombre}: un carrusel lleva de 2 a 10 tarjetas (tiene ${(p.tarjetas || []).length})`);
    }
    for (const a of archivosDe(p)) if (!a || !fs.existsSync(ruta(a))) faltan.push(`${p.nombre}: ${a}`);
  }
  if (faltan.length) {
    console.error('Faltan archivos:\n  ' + faltan.join('\n  '));
    process.exit(1);
  }

  console.log(`\nConjunto ${spec.adset} · ${spec.piezas.length} piezas · ${aplicar ? 'APLICAR' : 'vista previa'}\n`);
  if (!aplicar) {
    for (const p of spec.piezas) {
      console.log(`  ${p.nombre} [${p.tipo}] → ${p.url}`);
      if (p.tipo === 'carrusel') {
        console.log(`     texto:     ${p.texto_feed}`);
        p.tarjetas.forEach((t, i) => console.log(`     ${String(i + 1).padStart(2)}. ${t.titulo}${t.descripcion ? '  |  ' + t.descripcion : ''}\n         ${t.url}`));
        console.log('');
        continue;
      }
      console.log(`     título:    ${p.titulo}${p.descripcion ? '  |  ' + p.descripcion : ''}`);
      console.log(`     feed:      ${p.texto_feed}`);
      console.log(`     vertical:  ${p.texto_vertical}`);
      if (p.pausar && p.pausar.length) console.log(`     pausa:     ${p.pausar.join(', ')}`);
      console.log('');
    }
    console.log('Corré con --aplicar para crearlos.');
    return;
  }

  const estados = encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'DISAPPROVED', 'WITH_ISSUES', 'PREAPPROVED']));
  const existentes = (await fbGet(`${spec.adset}/ads?fields=name,effective_status&limit=200&effective_status=${estados}`)).data || [];

  for (const p of spec.piezas) {
    const ya = existentes.find((a) => a.name === p.nombre);
    if (ya && !actualizar) {
      console.log(`· ${p.nombre} ya existía, se saltea`);
      continue;
    }
    if (!ya && actualizar) {
      console.log(`· ${p.nombre} no existe: con --actualizar sólo se tocan los que ya están`);
      continue;
    }
    try {
      const activos = {};
      let datos;
      if (p.tipo === 'carrusel') {
        const hashes = [];
        for (const t of p.tarjetas) hashes.push(await subirImagen(ruta(t.imagen)));
        datos = creativoCarrusel(p, hashes);
      } else if (p.tipo === 'video') {
        activos.videoFeed = await subirVideo(ruta(p.feed));
        activos.videoVertical = await subirVideo(ruta(p.vertical));
        activos.portadaFeed = await subirImagen(ruta(p.portada_feed));
        activos.portadaVertical = await subirImagen(ruta(p.portada_vertical));
        if (p.cuadrado) {
          activos.videoCuadrado = await subirVideo(ruta(p.cuadrado));
          activos.portadaCuadrado = await subirImagen(ruta(p.portada_cuadrado));
        }
      } else {
        activos.feed = await subirImagen(ruta(p.feed));
        activos.vertical = await subirImagen(ruta(p.vertical));
        if (p.cuadrado) activos.cuadrado = await subirImagen(ruta(p.cuadrado));
      }
      const cr = await fbPost(`${CUENTA}/adcreatives`, datos || creativo(p, activos));
      if (ya) {
        await fbPost(ya.id, { creative: { creative_id: cr.id } });
        console.log(`↻ ${p.nombre} (${ya.id}) → creativo nuevo ${cr.id}`);
        continue;
      }
      const ad = await fbPost(`${CUENTA}/ads`, {
        name: p.nombre,
        adset_id: spec.adset,
        creative: { creative_id: cr.id },
        status: 'ACTIVE',
      });
      console.log(`✓ ${p.nombre} → ${ad.id}`);
      for (const viejo of p.pausar || []) {
        await fbPost(viejo, { status: 'PAUSED' });
        console.log(`   pausado ${viejo}`);
      }
    } catch (e) {
      console.log(`✗ ${p.nombre}: ${e.message}`);
    }
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
