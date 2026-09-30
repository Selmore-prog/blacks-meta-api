/* =========================================================================
 * ANÁLISIS DE FOTOS DE CATÁLOGO PARA PONERLAS "EN ESCENA" — sin IA.
 *
 * El problema que resuelve (sep-2026): cuando Gemini no genera la escena (cuenta
 * sin crédito, cuota, error), la pieza caía a la foto de catálogo metida en una
 * tarjeta blanca o flotando en el medio con márgenes: se veía el rectángulo de la
 * foto, la prenda chica y la pieza "de e-commerce pegado". El dueño lo describió
 * como "vacíos, espacios en blanco" y "que no sea fluido".
 *
 * Las fotos del catálogo son buenas: estudio con fondo liso (gris cálido o blanco),
 * luz pareja, la prenda puesta. Lo que faltaba era usarlas como FOTOGRAFÍA y no
 * como recorte: medir el fondo del estudio y extenderlo al lienzo entero, agrandar
 * la prenda hasta que llene su zona, y apoyar en el borde del lienzo los lados por
 * donde la foto ya viene cortada (un pantalón cortado en la cintura tiene que salir
 * por arriba del cuadro, no terminar en una línea recta flotando).
 *
 * Este archivo MIDE; el que compone es src/templatesStudio.js. Devuelve:
 *   - studio:   si el fondo es liso de estudio (se puede extender) o no (foto de
 *               ambiente: va a sangre con velo, sin extensión);
 *   - bbox:     la caja de la prenda (fracciones 0..1 de la foto);
 *   - touches:  por qué bordes sale cortada la prenda (arriba/abajo/izq/der);
 *   - rows:     el color del fondo fila por fila (pared → piso), para pintar el
 *               lienzo con el mismo degradado del estudio y que no haya costura.
 *
 * Todo con ffmpeg (ya está en el proyecto) a una grilla chica: ~40 ms por foto.
 * Best-effort: ante cualquier duda devuelve null y el diseño usa la foto a sangre.
 * ========================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const GRID_W = 240;
const ROW_SAMPLES = 24;

/* ----------------------------------------------------------- utilidades -- */

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function medianColor(pixels) {
  return [0, 1, 2].map((k) => median(pixels.map((p) => p[k])));
}

/** Decodifica a RGBA crudo con ffmpeg a una grilla de GRID_W de ancho. */
function decode(buffer, width = GRID_W) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `stage-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${width}:-2`, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || !stdout.length) return resolve(null);
        const h = Math.floor(stdout.length / (width * 4));
        if (h < 16) return resolve(null);
        resolve({ data: stdout, w: width, h });
      }
    );
  });
}

/* --------------------------------------------------------------- análisis -- */

/**
 * Mide una foto ya decodificada. Separada de la descarga para poder probarla con
 * imágenes armadas en memoria.
 * @param {{data:Buffer,w:number,h:number}} img
 */
function analyzePixels(img) {
  const { data, w: W, h: H } = img;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const band = Math.max(3, Math.round(W * 0.03));

  /* FONDO FILA POR FILA. Un estudio no es un color: es una pared que se va
     oscureciendo hasta el piso, con la línea donde se juntan. Se toma la mediana
     de las franjas izquierda y derecha de cada fila; cuando no coinciden (la
     prenda toca uno de los costados) se queda con la que sigue la fila anterior. */
  const leftRow = [];
  const rightRow = [];
  for (let y = 0; y < H; y += 1) {
    const l = []; const r = [];
    for (let x = 0; x < band; x += 1) { l.push(px(x, y)); r.push(px(W - 1 - x, y)); }
    leftRow.push(medianColor(l));
    rightRow.push(medianColor(r));
  }
  // Semilla: la mediana de las cuatro esquinas (casi siempre fondo).
  const corners = [leftRow[0], rightRow[0], leftRow[H - 1], rightRow[H - 1]];
  let prev = medianColor(corners);
  const bg = [];
  let disagreements = 0;
  for (let y = 0; y < H; y += 1) {
    const L = leftRow[y]; const R = rightRow[y];
    let c;
    if (dist(L, R) <= 16) c = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2, (L[2] + R[2]) / 2];
    else { c = dist(L, prev) <= dist(R, prev) ? L : R; disagreements += 1; }
    bg.push(c);
    prev = c;
  }
  // Suavizado (mediana móvil de 7): saca el ruido de compresión sin perder la
  // línea del piso, que ocupa varias filas.
  const smooth = bg.map((_, y) => {
    const win = [];
    for (let k = -3; k <= 3; k += 1) win.push(bg[Math.max(0, Math.min(H - 1, y + k))]);
    return medianColor(win);
  });

  /* ¿ES FONDO DE ESTUDIO? Liso (poca variación entre filas vecinas), poco
     saturado y parejo entre los dos costados en la mayoría de las filas. Un fondo
     de calle, de obra o de pasto falla por algún lado. */
  let jumps = 0;
  for (let y = 1; y < H; y += 1) if (dist(smooth[y], smooth[y - 1]) > 10) jumps += 1;
  const maxSat = Math.max(...smooth.map(sat));
  const agree = 1 - disagreements / H;
  const studio = jumps <= Math.max(3, H * 0.03) && maxSat <= 42 && agree >= 0.35;

  /* SILUETA: todo lo que se aparta del fondo de su fila. Después se queda con la
     mancha más grande (y las que pesan de verdad): el sello chico de marca que
     algunas fotos traen en una esquina no tiene que estirar la caja. */
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const b = smooth[y];
    const bl = lum(b);
    for (let x = 0; x < W; x += 1) {
      const c = px(x, y);
      if (dist(c, b) > 26 || Math.abs(lum(c) - bl) > 20) mask[y * W + x] = 1;
    }
  }
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let start = 0; start < W * H; start += 1) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = comps.length;
    let area = 0; let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
    stack.push(start); label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W; const y = (p - x) / W;
      area += 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const n = [p - 1, p + 1, p - W, p + W];
      if (x === 0) n[0] = -1;
      if (x === W - 1) n[1] = -1;
      for (const q of n) {
        if (q < 0 || q >= W * H || !mask[q] || label[q] !== -1) continue;
        label[q] = id; stack.push(q);
      }
    }
    comps.push({ id, area, x0, y0, x1, y1 });
  }
  if (!comps.length) return null;
  const biggest = comps.reduce((a, b) => (b.area > a.area ? b : a));
  const kept = comps.filter((c) => c.id === biggest.id || c.area >= biggest.area * 0.12);
  const keptIds = new Set(kept.map((c) => c.id));
  let x0 = W; let y0 = H; let x1 = -1; let y1 = -1; let area = 0;
  kept.forEach((c) => {
    x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); area += c.area;
  });
  if (x1 - x0 < W * 0.04 || y1 - y0 < H * 0.04) return null;

  // ¿Por dónde sale cortada? Alcanza con unos pocos píxeles de la silueta en el
  // borde: una remera cortada a la altura del pecho toca el borde de abajo entero.
  const edgeHits = (xs, ys) => {
    let n = 0;
    for (const y of ys) for (const x of xs) if (label[y * W + x] !== -1 && keptIds.has(label[y * W + x])) n += 1;
    return n;
  };
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const minHits = (len) => Math.max(3, Math.round(len * 0.02));
  const touches = {
    top: edgeHits(range(0, W), [0, 1]) >= minHits(W),
    bottom: edgeHits(range(0, W), [H - 1, H - 2]) >= minHits(W),
    left: edgeHits([0, 1], range(0, H)) >= minHits(H),
    right: edgeHits([W - 1, W - 2], range(0, H)) >= minHits(H),
  };

  const rows = Array.from({ length: ROW_SAMPLES }, (_, i) => {
    const y = Math.round((i / (ROW_SAMPLES - 1)) * (H - 1));
    return { at: y / (H - 1), color: hex(smooth[y]) };
  });
  const meanBg = medianColor(smooth);

  return {
    w: W,
    h: H,
    aspect: W / H,
    studio,
    bbox: { x0: x0 / W, y0: y0 / H, x1: (x1 + 1) / W, y1: (y1 + 1) / H },
    coverage: area / (W * H),
    touches,
    rows,
    top: hex(smooth[0]),
    bottom: hex(smooth[H - 1]),
    bg: hex(meanBg),
    bgLum: Math.round(lum(meanBg)),
  };
}

async function analyzeBuffer(buffer) {
  const img = await decode(buffer);
  if (!img) return null;
  try { return analyzePixels(img); } catch (_) { return null; }
}

/* ------------------------------------------------------ fotos de la tienda -- */

/**
 * La foto ORIGINAL de Tiendanube en vez de la de 1024 px. El CDN guarda la foto
 * subida (2000 px en el catálogo) y sirve versiones achicadas con un sufijo
 * "-1024-1024". Para una pieza de 1080 px en la que la prenda se agranda hasta
 * llenar su zona, la de 1024 se ve blanda. Se prueba que exista antes de usarla.
 */
const HI_RES = new Map();
async function hiResUrl(url) {
  const s = String(url || '');
  const m = s.match(/^(https:\/\/acdn-us\.mitiendanube\.com\/.+?)-\d{3,4}-\d{1,4}(\.(?:jpe?g|png|webp))$/i);
  if (!m) return s;
  if (HI_RES.has(s)) return HI_RES.get(s);
  const candidate = `${m[1]}${m[2]}`;
  let ok = false;
  try {
    const r = await fetch(candidate, { method: 'HEAD' });
    ok = r.ok;
  } catch (_) { ok = false; }
  const out = ok ? candidate : s;
  if (HI_RES.size > 800) HI_RES.clear();
  HI_RES.set(s, out);
  return out;
}

const CACHE = new Map();

/**
 * Analiza una foto por URL (https o data:). Cachea por URL: la misma foto se usa
 * en la pieza, la historia de refuerzo y cada corrección.
 */
async function analyzeUrl(url) {
  const s = String(url || '');
  if (!s) return null;
  if (CACHE.has(s)) return CACHE.get(s);
  let buffer = null;
  try {
    if (s.startsWith('data:')) {
      const m = s.match(/^data:[^;]+;base64,(.*)$/s);
      if (m) buffer = Buffer.from(m[1], 'base64');
    } else if (/^https?:/i.test(s)) {
      const r = await fetch(s);
      if (r.ok) buffer = Buffer.from(await r.arrayBuffer());
    }
  } catch (_) { buffer = null; }
  const result = buffer ? await analyzeBuffer(buffer) : null;
  if (CACHE.size > 400) CACHE.clear();
  // data: URIs largos no se guardan como clave: ocupan memoria y no se repiten.
  if (!s.startsWith('data:')) CACHE.set(s, result);
  return result;
}

module.exports = { analyzeUrl, analyzeBuffer, analyzePixels, hiResUrl, decode };
