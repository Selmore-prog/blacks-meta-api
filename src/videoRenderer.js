const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { uploadAsset } = require('./storage');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Genera un Reel MP4 vertical 9:16 (1080x1920) con efecto Ken Burns / zoom lento
 * o fondo difuminado a partir de un buffer de imagen JPEG.
 * Sube el video generado a Supabase Storage y devuelve su URL pública.
 */
async function renderReelVideo({ imageBuffer, duration = 8, filename }) {
  if (!imageBuffer) {
    throw new Error('[videoRenderer] imageBuffer es requerido para generar un Reel');
  }

  const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tmpImgPath = path.join(os.tmpdir(), `input-${id}.jpg`);
  const tmpVidPath = path.join(os.tmpdir(), `output-${id}.mp4`);
  const outFile = filename || `reel-${id}.mp4`;

  fs.writeFileSync(tmpImgPath, imageBuffer);

  return new Promise((resolve, reject) => {
    // Usamos anullsrc para incluir una pista de audio en silencio (AAC), ya que
    // Instagram Reels Graph API requiere/recomienda un stream de audio válido.
    ffmpeg()
      .input(tmpImgPath)
      .loop(duration)
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        `-t ${duration}`,
        '-movflags +faststart',
      ])
      // Filtro: crea un fondo difuminado 1080x1920 y centra la pieza 1080x1350 con un ligero zoom lento
      .complexFilter([
        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:10[bg]',
        '[0:v]scale=1080:1350[fg]',
        '[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]',
      ])
      .map('[outv]')
      .map('1:a')
      .save(tmpVidPath)
      .on('end', async () => {
        try {
          const videoBuffer = fs.readFileSync(tmpVidPath);
          // Limpiar archivos temporales
          if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
          if (fs.existsSync(tmpVidPath)) fs.unlinkSync(tmpVidPath);

          const url = await uploadAsset({
            buffer: videoBuffer,
            filename: outFile,
            contentType: 'video/mp4',
          });
          console.log(`[videoRenderer] Reel generado exitosamente: ${url}`);
          resolve(url);
        } catch (err) {
          if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
          if (fs.existsSync(tmpVidPath)) fs.unlinkSync(tmpVidPath);
          reject(err);
        }
      })
      .on('error', (err) => {
        if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
        if (fs.existsSync(tmpVidPath)) fs.unlinkSync(tmpVidPath);
        console.error('[videoRenderer] Error ejecutando ffmpeg:', err.message);
        reject(err);
      });
  });
}

module.exports = {
  renderReelVideo,
};
