const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

/**
 * RECORTE DE LA PRENDA (fondo fuera, con transparencia real).
 *
 * Por qué existe: las fotos del catálogo de Tiendanube vienen sobre fondo de estudio
 * blanco/gris. Pegadas tal cual en la pieza quedaban como una foto rectangular con el
 * modelo cortado por el torso y los pies fuera de cuadro — el "formato raro" del que se
 * quejó el dueño. Con la prenda recortada se puede, en cambio:
 *   - poner el TITULAR POR DETRÁS del producto (el efecto moderno que pidió),
 *   - tirar LÍNEAS Y FLECHAS desde puntos reales de la prenda para la ficha técnica,
 *   - encuadrar por la silueta real en vez de estirar la foto entera.
 *
 * Cómo: relleno por inundación (flood fill) desde los bordes. Cada píxel candidato se
 * compara contra el vecino que YA se marcó como fondo, no contra un color global — así
 * un fondo con degradado (el típico gris de estudio) se sigue comiendo entero sin
 * empezar a morder la prenda. Después se suaviza el borde para que no quede aserrado.
 *
 * Sin dependencias nuevas: ffmpeg (que ya está) decodifica a RGBA crudo y el PNG con
 * alpha se escribe a mano con zlib. sharp/canvas traerían binarios pesados a un
 * servicio que ya va justo de memoria.
 *
 * Es best-effort: ante cualquier duda devuelve null y el llamador usa la foto original.
 */

/** Decodifica una imagen a RGBA crudo con ffmpeg, escalada a un ancho máximo. */
function decodeRgba(buffer, maxWidth = 900) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `cut-in-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale='min(iw,${maxWidth})':-2`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || !stdout.length) return resolve(null);
        // ffmpeg no dice las dimensiones en rawvideo: se deducen del aspecto original.
        resolve({ data: stdout });
      }
    );
  });
}

/** Ancho y alto reales de la imagen (ffprobe no viene en el paquete: lo saca ffmpeg). */
function probeSize(buffer) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `probe-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(ffmpegPath, ['-hide_banner', '-i', inPath], (err, _out, stderr) => {
      clean();
      const m = String(stderr || '').match(/,\s(\d{2,5})x(\d{2,5})[,\s]/);
      resolve(m ? { w: Number(m[1]), h: Number(m[2]) } : null);
    });
  });
}

/** Escribe un PNG RGBA (sin dependencias). data = Buffer RGBA de w*h*4. */
function encodePng(data, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0; // filtro 0 (None) por fila
    data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 6;  // color type 6 = RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/**
 * Recorta el fondo de una foto de producto.
 * Devuelve { buffer (PNG con alpha), width, height, box: {x0,y0,x1,y1} normalizado,
 * coverage } o null si la foto no es apta (fondo con textura, producto que toca todos
 * los bordes, etc.) — en ese caso el llamador se queda con la foto original.
 *
 * tolerance: cuánto puede alejarse un píxel de su vecino de fondo y seguir siendo fondo.
 * Bajo = conservador (deja halo), alto = agresivo (muerde la prenda). 26 salió del
 * ajuste contra fotos reales del catálogo (blancas, grises y con degradado).
 */
async function cutoutProduct(buffer, { tolerance = 26, maxWidth = 900 } = {}) {
  const [decoded, size] = await Promise.all([decodeRgba(buffer, maxWidth), probeSize(buffer)]);
  if (!decoded || !size) return null;
  const w = Math.min(size.w, maxWidth);
  const h = Math.round((w / size.w) * size.h);
  const data = decoded.data;
  if (data.length < w * h * 4) return null;

  const N = w * h;
  // 0 = sin clasificar, 1 = fondo
  const bg = new Uint8Array(N);
  const lum = new Float32Array(N);
  const sat = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const p = i * 4;
    const r = data[p]; const g = data[p + 1]; const b = data[p + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  // El fondo tiene que ser CLARO: si los bordes son oscuros, la foto es ambientada
  // (escena, no estudio) y recortarla no tiene sentido.
  let borderSum = 0; let borderCount = 0;
  for (let x = 0; x < w; x += 1) { borderSum += lum[x] + lum[(h - 1) * w + x]; borderCount += 2; }
  for (let y = 0; y < h; y += 1) { borderSum += lum[y * w] + lum[y * w + w - 1]; borderCount += 2; }
  const borderLum = borderSum / borderCount;
  if (borderLum < 170) return null;

  /*
   * Qué cuenta como fondo. La primera versión comparaba cada píxel contra el VECINO que
   * lo alcanzaba y se caminaba dentro de la prenda: con pasos de 26 el relleno cruzaba el
   * borde de a poco y se comía el producto entero (cobertura del sujeto: 0,7%).
   *
   * El criterio ahora es ABSOLUTO, medido sobre fotos reales del catálogo: el fondo de
   * estudio es NEUTRO (saturación ~0) y CLARO (luminancia ~234), mientras que la prenda
   * tiene saturación 34-69. Con un umbral fijo no hay deriva posible. La conexión desde
   * el borde se mantiene igual, y es la que protege las partes claras DE ADENTRO de la
   * prenda (una etiqueta blanca, un logo) de borrarse: no tocan el borde.
   */
  const lumMin = borderLum - 34;
  const satMax = 22;

  /*
   * GUARDA POR BORDES. Con sólo color, las partes BLANCAS del sujeto que se conectan
   * con el fondo se borraban: una zapatilla blanca sobre piso blanco, o una remera
   * clara contra el ciclorama (se veía el fondo asomando por adentro de la prenda).
   * El contorno del objeto igual existe como salto de luminancia, aunque el color de
   * los dos lados sea casi el mismo. Midiendo el gradiente (Sobel simplificado) y
   * tratando los píxeles de borde como PARED, el relleno se frena en el contorno en
   * vez de colarse adentro.
   */
  const edge = new Float32Array(N);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      edge[i] = Math.abs(gx) + Math.abs(gy);
    }
  }
  const EDGE_WALL = 18;
  const isBg = (i) => sat[i] < satMax && lum[i] > lumMin && edge[i] < EDGE_WALL;

  const queue = new Int32Array(N);
  let qh = 0; let qt = 0;
  const push = (i) => { if (!bg[i]) { bg[i] = 1; queue[qt++] = i; } };
  for (let x = 0; x < w; x += 1) {
    if (isBg(x)) push(x);
    const b = (h - 1) * w + x;
    if (isBg(b)) push(b);
  }
  for (let y = 0; y < h; y += 1) {
    const l = y * w;
    if (isBg(l)) push(l);
    const r = y * w + w - 1;
    if (isBg(r)) push(r);
  }

  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i / w) | 0;
    const tryPix = (j) => { if (!bg[j] && isBg(j)) push(j); };
    if (x > 0) tryPix(i - 1);
    if (x < w - 1) tryPix(i + 1);
    if (y > 0) tryPix(i - w);
    if (y < h - 1) tryPix(i + w);
  }

  /*
   * PELADO DEL HALO. La guarda por bordes deja sin clasificar la línea del contorno
   * (es fondo por color, pero gradiente alto), y eso se ve como un borde claro de 1-2 px
   * alrededor del recorte. Acá se pela: un píxel pegado al fondo que además coincide en
   * COLOR con el fondo pasa a ser fondo, ignorando el gradiente. Sólo avanza desde
   * fondo ya confirmado y en pasadas contadas, así que no puede desbocarse hacia adentro
   * de la prenda como pasaba con el criterio relativo al vecino.
   */
  const colorIsBg = (i) => sat[i] < satMax && lum[i] > lumMin;
  for (let pass = 0; pass < 2; pass += 1) {
    const flip = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (bg[i] || !colorIsBg(i)) continue;
        const vecino = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1])
          || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
        if (vecino) flip.push(i);
      }
    }
    if (!flip.length) break;
    for (const i of flip) bg[i] = 1;
  }

  // Cobertura del sujeto: si quedó casi todo o casi nada, el recorte falló.
  let subject = 0;
  for (let i = 0; i < N; i += 1) if (!bg[i]) subject += 1;
  const coverage = subject / N;
  if (coverage < 0.04 || coverage > 0.92) return null;

  /*
   * CONTROL DE FRAGMENTACIÓN — el más importante de todos.
   *
   * Falla real, y grave: en una foto con el modelo de REMERA BLANCA, el recorte se comió
   * la remera (es clara y neutra, igual que el fondo) y la pieza salió con la cabeza
   * flotando, los dos brazos sueltos y un agujero en el torso. Técnicamente el recorte
   * "funcionó" —cobertura y caja daban bien— pero era impublicable.
   *
   * Un recorte sano es UN cuerpo conectado (más, a lo sumo, alguna isla chica). Uno roto
   * son varios pedazos grandes separados. Se miden las componentes conexas del sujeto: si
   * la más grande no concentra la mayoría de los píxeles, el recorte se descarta y la
   * plantilla cae a una que use la foto entera. Mejor una fullbleed correcta que una
   * pieza moderna con un modelo descuartizado.
   */
  const comp = new Int32Array(N).fill(-1);
  const cola = new Int32Array(N);
  let mayor = 0;
  let comps = 0;
  for (let seed = 0; seed < N; seed += 1) {
    if (bg[seed] || comp[seed] !== -1) continue;
    let qh = 0; let qt = 0;
    comp[seed] = comps; cola[qt++] = seed;
    let tam = 0;
    while (qh < qt) {
      const i = cola[qh++];
      tam += 1;
      const x = i % w;
      const y = (i / w) | 0;
      const vecino = (j) => { if (!bg[j] && comp[j] === -1) { comp[j] = comps; cola[qt++] = j; } };
      if (x > 0) vecino(i - 1);
      if (x < w - 1) vecino(i + 1);
      if (y > 0) vecino(i - w);
      if (y < h - 1) vecino(i + w);
    }
    if (tam > mayor) mayor = tam;
    comps += 1;
  }
  const cohesion = mayor / subject;
  if (cohesion < 0.72) {
    console.warn(`[cutout] Recorte descartado: quedó partido en ${comps} pedazos y el mayor sólo tiene el ${Math.round(cohesion * 100)}% del sujeto (típico de una prenda clara sobre fondo claro).`);
    return null;
  }

  // Suavizado del borde: alpha = promedio de los vecinos en una ventana de 3x3.
  // Sin esto el recorte queda con escalones y se nota que es un collage.
  const out = Buffer.alloc(N * 4);
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let acc = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          acc += bg[yy * w + xx] ? 0 : 255;
          n += 1;
        }
      }
      const a = Math.round(acc / n);
      const p = i * 4;
      out[p] = data[p]; out[p + 1] = data[p + 1]; out[p + 2] = data[p + 2];
      out[p + 3] = a;
      if (a > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  return {
    buffer: encodePng(out, w, h),
    width: w,
    height: h,
    coverage,
    // Caja del sujeto, normalizada: con esto la plantilla ubica el titular DETRÁS de la
    // prenda y ancla las líneas de la ficha técnica a puntos reales del producto.
    box: { x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h },
  };
}

/** Baja una foto por URL y la recorta. Devuelve null ante cualquier problema. */
async function cutoutFromUrl(url, opts = {}) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await cutoutProduct(Buffer.from(await res.arrayBuffer()), opts);
  } catch (_) {
    return null;
  }
}

module.exports = { cutoutProduct, cutoutFromUrl, encodePng };
