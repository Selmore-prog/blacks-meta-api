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

module.exports = { resizeImage, detectLogoVariant };
