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

module.exports = { resizeImage };
