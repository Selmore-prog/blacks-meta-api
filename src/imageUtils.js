const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

/**
 * Redimensiona un buffer de imagen a un ancho máximo (sin agrandar) y lo devuelve
 * como JPEG. Usa el ffmpeg que ya trae el proyecto (sirve para achicar las fotos
 * gigantes de Drive antes de mandarlas a Gemini o guardarlas).
 */
function resizeImage(buffer, maxWidth = 1080, quality = 3) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `img-in-${id}`);
    const outPath = path.join(os.tmpdir(), `img-out-${id}.jpg`);
    fs.writeFileSync(inPath, buffer);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} try { fs.unlinkSync(outPath); } catch (_) {} };
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale='min(iw,${maxWidth})':-2`, '-q:v', String(quality), outPath],
      (err) => {
        if (err) { clean(); return reject(err); }
        try {
          const out = fs.readFileSync(outPath);
          clean();
          resolve(out);
        } catch (e) { clean(); reject(e); }
      }
    );
  });
}

/**
 * Detecta si el LOGO (imagen con transparencia) está dibujado en tinta oscura o clara,
 * mirando solo los píxeles OPACOS (ignora el fondo transparente, que sesgaría el promedio).
 * Devuelve 'dark' (va bien sobre fondos CLAROS) o 'light' (va bien sobre fondos OSCUROS).
 */
function detectLogoVariant(buffer) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `logo-in-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    fs.writeFileSync(inPath, buffer);
    const SIZE = 48;
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${SIZE}:${SIZE}`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || stdout.length < SIZE * SIZE * 4) return resolve('dark'); // sin datos: asumimos oscuro (el caso más común)
        let sum = 0;
        let opaquePixels = 0;
        for (let i = 0; i < stdout.length; i += 4) {
          const alpha = stdout[i + 3];
          if (alpha < 200) continue; // ignoramos transparente/semi-transparente
          const lum = 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
          sum += lum;
          opaquePixels += 1;
        }
        // Sin transparencia detectable (ej. logo con fondo sólido, no PNG transparente):
        // usamos el promedio de TODA la imagen como aproximación.
        if (opaquePixels < 20) {
          let total = 0;
          for (let i = 0; i < stdout.length; i += 4) {
            total += 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
          }
          const avg = total / (stdout.length / 4);
          return resolve(avg < 128 ? 'dark' : 'light');
        }
        const avg = sum / opaquePixels;
        resolve(avg < 128 ? 'dark' : 'light');
      }
    );
  });
}

/**
 * Mide la CAJA DE TINTA de una imagen con transparencia (típicamente el logo): el
 * rectángulo mínimo que contiene los píxeles dibujados, en coordenadas normalizadas
 * 0..1 sobre la imagen entera, más el aspect ratio (ancho/alto) de la imagen.
 *
 * ¿Por qué? Los PNG de logo suelen venir con un margen transparente enorme alrededor
 * de la marca. Al renderizarlos con `height:150px` el navegador escala TODA la imagen
 * (margen incluido), así que la marca visible queda mucho más chica que los 150px
 * pedidos — de ahí el "el logo aparece muy chico" del dueño, que no se arreglaba
 * subiendo el número. Con esta medición el renderer puede encuadrar SOLO la tinta y
 * mostrarla al tamaño real que se pidió.
 *
 * Devuelve { x0, y0, x1, y1, aspect, coverage } o null si no se pudo medir.
 */
function measureInkBox(buffer) {
  return new Promise((resolve) => {
    const W = 128; // grilla de análisis: suficiente precisión, costo despreciable
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `ink-in-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(
      ffmpegPath,
      // scale=W:-2 mantiene el aspect: del largo del buffer deducimos el alto real.
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || !stdout.length) return resolve(null);
        const H = Math.floor(stdout.length / (W * 4));
        if (H < 8) return resolve(null);

        // ¿La imagen tiene transparencia real? Si no (logo con fondo sólido), la "tinta"
        // se define por contraste contra el color de las esquinas (el fondo).
        let hasAlpha = false;
        for (let i = 3; i < stdout.length; i += 4) {
          if (stdout[i] < 250) { hasAlpha = true; break; }
        }
        const cornerLum = (x, y) => {
          const i = (y * W + x) * 4;
          return 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
        };
        const bgLum = (cornerLum(0, 0) + cornerLum(W - 1, 0) + cornerLum(0, H - 1) + cornerLum(W - 1, H - 1)) / 4;

        let minX = W; let minY = H; let maxX = -1; let maxY = -1; let inkPixels = 0;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 4;
            const alpha = stdout[i + 3];
            let isInk;
            if (hasAlpha) {
              isInk = alpha > 40;
            } else {
              const lum = 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
              isInk = Math.abs(lum - bgLum) > 28;
            }
            if (!isInk) continue;
            inkPixels += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        if (maxX < 0 || maxY < 0) return resolve(null);
        const box = {
          x0: minX / W,
          y0: minY / H,
          x1: (maxX + 1) / W,
          y1: (maxY + 1) / H,
          aspect: W / H,
          coverage: inkPixels / (W * H),
        };
        // Caja degenerada o que ya ocupa casi todo: no hay nada que compensar.
        if (box.x1 - box.x0 < 0.05 || box.y1 - box.y0 < 0.05) return resolve(null);
        resolve(box);
      }
    );
  });
}

/**
 * Saca las BARRAS NEGRAS (letterbox) de una imagen generada por IA.
 *
 * Los modelos de imagen suelen devolver un cuadrado y "dibujar" adentro una escena
 * panorámica con bandas negras arriba y abajo (pasó con la escena de liquidación: volvió
 * 1024x1024 con dos franjas muertas). Pedir el ratio correcto lo evita casi siempre, pero
 * cuando no, esas bandas entran a la pieza como zonas negras. Acá se detectan las filas
 * uniformes y muy oscuras de los bordes y se recorta.
 *
 * Devuelve el buffer recortado, o el original si no hay barras (o si algo falla).
 */
function trimLetterbox(buffer) {
  return new Promise((resolve) => {
    const W = 64;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `lb-in-${id}`);
    const outPath = path.join(os.tmpdir(), `lb-out-${id}.jpg`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(buffer); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.length) { clean(); return resolve(buffer); }
        const H = Math.floor(stdout.length / (W * 3));
        if (H < 16) { clean(); return resolve(buffer); }
        // Una fila es "barra" si TODOS sus píxeles son casi negros.
        const isBar = (y) => {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 3;
            if (stdout[i] > 26 || stdout[i + 1] > 26 || stdout[i + 2] > 26) return false;
          }
          return true;
        };
        let top = 0; while (top < H && isBar(top)) top += 1;
        let bottom = 0; while (bottom < H - top && isBar(H - 1 - bottom)) bottom += 1;
        const keep = H - top - bottom;
        // Barras despreciables: no vale la pena tocar la imagen.
        const minBar = Math.max(2, Math.round(H * 0.02));
        if (top < minBar && bottom < minBar) { clean(); return resolve(buffer); }
        // Tiene que quedar una franja de contenido REAL. El corte no se decide por un
        // porcentaje fijo (un letterbox de 21:9 dentro de un cuadrado se come el 57% y es
        // legítimo) sino por lo que queda: banda suficiente y claramente más clara que
        // las barras. Si la imagen entera es casi negra, es una foto oscura a propósito.
        if (keep < H * 0.3) { clean(); return resolve(buffer); }
        let sum = 0;
        for (let y = top; y < H - bottom; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 3;
            sum += Math.max(stdout[i], stdout[i + 1], stdout[i + 2]);
          }
        }
        if (sum / (keep * W) < 30) { clean(); return resolve(buffer); }
        const topFrac = top / H;
        const keepFrac = (H - top - bottom) / H;
        execFile(
          ffmpegPath,
          ['-y', '-loglevel', 'error', '-i', inPath,
            '-vf', `crop=iw:ih*${keepFrac.toFixed(5)}:0:ih*${topFrac.toFixed(5)}`, '-q:v', '2', outPath],
          (err2) => {
            if (err2) { clean(); return resolve(buffer); }
            let out = buffer;
            try { out = fs.readFileSync(outPath); } catch (_) { /* queda el original */ }
            clean(); try { fs.unlinkSync(outPath); } catch (_) {}
            resolve(out);
          }
        );
      }
    );
  });
}

module.exports = { resizeImage, detectLogoVariant, measureInkBox, trimLetterbox };
