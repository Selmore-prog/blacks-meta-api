const config = require('./config');

// Guard de seguridad básico en memoria para evitar superar límite de 100 posts / 24 hs
let dailyPublishCount = 0;
let lastReset = Date.now();

function checkRateLimit() {
  if (Date.now() - lastReset > 24 * 60 * 60 * 1000) {
    dailyPublishCount = 0;
    lastReset = Date.now();
  }
  if (dailyPublishCount >= 95) {
    throw new Error('[metaPublisher] Se ha alcanzado el límite preventivo diario de publicaciones en Meta.');
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publica una pieza (imagen o reel/video) en Instagram vía Graph API.
 * Soporta mediaType: 'FEED', 'REELS', 'STORIES'.
 */
async function publishToInstagram({ imageUrl, videoUrl, caption, mediaType = 'FEED' }) {
  checkRateLimit();

  const { igUserId, pageAccessToken, apiVersion } = config.meta;
  if (!igUserId || !pageAccessToken) {
    throw new Error('[metaPublisher] Faltan IG_USER_ID o META_PAGE_ACCESS_TOKEN en la configuración.');
  }

  console.log(`[metaPublisher] Creando contenedor IG para ${mediaType}...`);

  const createParams = new URLSearchParams({
    access_token: pageAccessToken,
  });

  if (mediaType.toUpperCase() === 'STORIES') {
    createParams.append('media_type', 'STORIES');
    if (videoUrl) {
      createParams.append('video_url', videoUrl);
    } else if (imageUrl) {
      createParams.append('image_url', imageUrl);
    } else {
      throw new Error('[metaPublisher] Stories requiere imageUrl o videoUrl');
    }
  } else if (mediaType.toUpperCase() === 'REELS' || videoUrl) {
    createParams.append('media_type', 'REELS');
    createParams.append('video_url', videoUrl);
    if (caption) createParams.append('caption', caption);
  } else {
    // Feed imagen normal
    if (!imageUrl) throw new Error('[metaPublisher] Feed requiere imageUrl');
    createParams.append('image_url', imageUrl);
    if (caption) createParams.append('caption', caption);
  }

  const createRes = await fetch(`https://graph.facebook.com/${apiVersion}/${igUserId}/media`, {
    method: 'POST',
    body: createParams,
  });

  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    throw new Error(`Error creando contenedor en Instagram: ${JSON.stringify(createData.error || createData)}`);
  }

  const creationId = createData.id;
  console.log(`[metaPublisher] Contenedor creado ID: ${creationId}. Esperando procesamiento...`);

  // Polling de status_code hasta FINISHED (máximo 5 minutos / 60 reintentos cada 5s)
  let status = 'IN_PROGRESS';
  let attempts = 0;
  const maxAttempts = 60;

  while (status !== 'FINISHED' && attempts < maxAttempts) {
    attempts += 1;
    await sleep(5000);

    const statusRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${creationId}?fields=status_code&access_token=${pageAccessToken}`
    );
    const statusData = await statusRes.json();

    if (statusData.error) {
      throw new Error(`Error consultando estado del contenedor IG: ${JSON.stringify(statusData.error)}`);
    }

    status = statusData.status_code;
    console.log(`[metaPublisher] Intento ${attempts}/${maxAttempts} - Estado: ${status}`);

    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`El contenedor IG falló en procesarse con estado: ${status}`);
    }
  }

  if (status !== 'FINISHED') {
    throw new Error('[metaPublisher] Timeout esperando a que el video/imagen de Instagram se procese.');
  }

  // Paso 3: Publicar contenedor
  console.log(`[metaPublisher] Publicando contenedor ${creationId}...`);
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: pageAccessToken,
  });

  const publishRes = await fetch(`https://graph.facebook.com/${apiVersion}/${igUserId}/media_publish`, {
    method: 'POST',
    body: publishParams,
  });

  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw new Error(`Error en media_publish de Instagram: ${JSON.stringify(publishData.error || publishData)}`);
  }

  dailyPublishCount += 1;
  console.log(`[metaPublisher] ¡Publicado en Instagram con éxito! ID: ${publishData.id}`);
  return publishData.id;
}

/**
 * Publica una foto o video en la Página de Facebook vía Graph API.
 */
async function publishToFacebook({ imageUrl, videoUrl, caption }) {
  checkRateLimit();

  const { pageId, pageAccessToken, apiVersion } = config.meta;
  if (!pageId || !pageAccessToken) {
    console.warn('[metaPublisher] META_PAGE_ID no está configurado. Se omite publicación en Facebook.');
    return null;
  }

  const params = new URLSearchParams({
    access_token: pageAccessToken,
  });

  let url;
  if (videoUrl) {
    url = `https://graph-video.facebook.com/${apiVersion}/${pageId}/videos`;
    params.append('file_url', videoUrl);
    if (caption) params.append('description', caption);
  } else {
    url = `https://graph.facebook.com/${apiVersion}/${pageId}/photos`;
    params.append('url', imageUrl);
    if (caption) params.append('caption', caption);
  }

  const res = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Error publicando en Facebook: ${JSON.stringify(data.error || data)}`);
  }

  dailyPublishCount += 1;
  console.log(`[metaPublisher] ¡Publicado en Facebook con éxito! ID: ${data.id || data.post_id}`);
  return data.id || data.post_id;
}

/**
 * Espera a que Meta termine de procesar un contenedor antes de publicarlo.
 *
 * Existe por un error real en producción: "Media ID is not available" (code 9007,
 * "El contenido multimedia no está listo para publicarse"). El camino de imagen única
 * ya hacía este polling, pero el de CARRUSEL publicaba de inmediato — y un carrusel
 * tarda MÁS en procesarse, porque Meta tiene que terminar cada hijo y después el
 * contenedor. Subir la imagen no es lo mismo que tenerla lista.
 *
 * Devuelve cuando el contenedor está FINISHED; lanza si falla, expira o se agota el
 * tiempo. `etiqueta` sólo sirve para que el log diga de cuál de los contenedores habla.
 */
async function waitForContainer(id, { etiqueta = 'contenedor', maxAttempts = 30, everyMs = 4000 } = {}) {
  const { pageAccessToken, apiVersion } = config.meta;
  for (let intento = 1; intento <= maxAttempts; intento += 1) {
    const r = await fetch(
      `https://graph.facebook.com/${apiVersion}/${id}?fields=status_code&access_token=${pageAccessToken}`
    );
    const d = await r.json();
    if (d.error) throw new Error(`Error consultando estado de ${etiqueta}: ${JSON.stringify(d.error)}`);
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') {
      throw new Error(`${etiqueta} falló al procesarse (estado ${d.status_code}).`);
    }
    console.log(`[metaPublisher] ${etiqueta} ${id}: ${d.status_code} (${intento}/${maxAttempts})`);
    await sleep(everyMs);
  }
  throw new Error(`Timeout esperando a que Meta procese ${etiqueta} (${maxAttempts * everyMs / 1000}s).`);
}

/**
 * Publica un CARRUSEL de imágenes en Instagram (feed). Crea un contenedor por imagen
 * (is_carousel_item), luego el contenedor CAROUSEL con los children y publica.
 */
async function publishCarouselToInstagram({ imageUrls, caption }) {
  checkRateLimit();
  const { igUserId, pageAccessToken, apiVersion } = config.meta;
  if (!igUserId || !pageAccessToken) {
    throw new Error('[metaPublisher] Faltan IG_USER_ID o META_PAGE_ACCESS_TOKEN.');
  }
  const base = `https://graph.facebook.com/${apiVersion}/${igUserId}`;

  const childIds = [];
  for (const url of imageUrls) {
    const p = new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: pageAccessToken });
    const r = await fetch(`${base}/media`, { method: 'POST', body: p });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(`Error creando item de carrusel: ${JSON.stringify(d.error || d)}`);
    childIds.push(d.id);
  }

  // Cada hijo tiene que estar procesado ANTES de armar el contenedor del carrusel:
  // si se manda `children` con uno todavía en curso, Meta devuelve 9007 al publicar.
  for (const [i, id] of childIds.entries()) {
    await waitForContainer(id, { etiqueta: `slide ${i + 1}/${childIds.length}` });
  }

  const cp = new URLSearchParams({ media_type: 'CAROUSEL', children: childIds.join(','), access_token: pageAccessToken });
  if (caption) cp.append('caption', caption);
  const cr = await fetch(`${base}/media`, { method: 'POST', body: cp });
  const cd = await cr.json();
  if (!cr.ok || cd.error) throw new Error(`Error creando contenedor de carrusel: ${JSON.stringify(cd.error || cd)}`);

  // Y el contenedor del carrusel también: es el que devolvía "Media ID is not available".
  await waitForContainer(cd.id, { etiqueta: 'carrusel' });

  /*
   * Reintento ante el 9007 ("Media ID is not available"). Aunque el contenedor ya diga
   * FINISHED, Meta a veces tarda unos segundos más en dejarlo publicable — es una carrera
   * conocida de su lado. Como el contenedor ya está armado, reintentar es gratis y no
   * duplica nada: si saliera publicado, la segunda llamada fallaría por otro motivo.
   * Cualquier otro error se propaga en el primer intento, sin reintentos inútiles.
   */
  let pd = null;
  for (let intento = 1; intento <= 3; intento += 1) {
    const pubp = new URLSearchParams({ creation_id: cd.id, access_token: pageAccessToken });
    const pr = await fetch(`${base}/media_publish`, { method: 'POST', body: pubp });
    pd = await pr.json();
    if (pr.ok && !pd.error) break;
    const code = pd && pd.error && pd.error.code;
    if (code !== 9007 || intento === 3) {
      throw new Error(`Error publicando carrusel: ${JSON.stringify(pd.error || pd)}`);
    }
    console.warn(`[metaPublisher] El carrusel todavía no estaba listo (9007). Reintento ${intento}/3 en 10s...`);
    await sleep(10000);
  }

  dailyPublishCount += 1;
  console.log(`[metaPublisher] Carrusel publicado (${imageUrls.length} slides). ID: ${pd.id}`);
  return pd.id;
}

module.exports = {
  publishToInstagram,
  waitForContainer,
  publishToFacebook,
  publishCarouselToInstagram,
};
