const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { uploadAsset } = require('./storage');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Genera un Reel MP4 vertical 9:16 (1080x1920) con efecto Ken Burns (zoom lento)
 * a pantalla completa a partir de un buffer de imagen (que ya viene en 9:16).
 * Sube el video a Supabase Storage y devuelve su URL pública.
 */
async function renderReelVideo({ imageBuffer, duration = 8, filename }) {
  if (!imageBuffer) {
    throw new Error('[videoRenderer] imageBuffer es requerido para generar un Reel');
  }

  const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tmpImgPath = path.join(os.tmpdir(), `input-${id}.jpg`);
  const tmpVidPath = path.join(os.tmpdir(), `output-${id}.mp4`);
  const outFile = filename || `reel-${id}.mp4`;
  const fps = 25;
  const frames = Math.round(duration * fps);

  fs.writeFileSync(tmpImgPath, imageBuffer);

  const cleanup = () => {
    if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
    if (fs.existsSync(tmpVidPath)) fs.unlinkSync(tmpVidPath);
  };

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tmpImgPath)
      // Pista de audio en silencio (Instagram Reels recomienda un stream de audio válido).
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .complexFilter([
        // Escalamos a 2x para que el zoom sea suave, luego zoompan hace el Ken Burns
        // y quedamos en 1080x1920. z sube lento hasta 1.12.
        `[0:v]scale=2160:3840,zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps},format=yuv420p[outv]`,
      ])
      .map('[outv]')
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        `-t ${duration}`,
        '-r', String(fps),
        '-movflags +faststart',
        '-map', '1:a',
      ])
      .save(tmpVidPath)
      .on('end', async () => {
        try {
          const videoBuffer = fs.readFileSync(tmpVidPath);
          cleanup();
          const url = await uploadAsset({ buffer: videoBuffer, filename: outFile, contentType: 'video/mp4' });
          console.log(`[videoRenderer] Reel generado: ${url}`);
          resolve(url);
        } catch (err) {
          cleanup();
          reject(err);
        }
      })
      .on('error', (err) => {
        cleanup();
        console.error('[videoRenderer] Error ejecutando ffmpeg:', err.message);
        reject(err);
      });
  });
}

module.exports = { renderReelVideo };
