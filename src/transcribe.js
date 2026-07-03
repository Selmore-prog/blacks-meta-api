const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const config = require('./config');

// ffmpeg puede leer la URL directo y extraer sólo el audio (liviano, sin bajar todo el video).
function extractAudio(videoUrl) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `aud-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mp3`);
    execFile(
      ffmpegPath,
      ['-y', '-nostdin', '-loglevel', 'error', '-i', videoUrl, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', out],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (!err) return resolve(out);
        // Mensaje limpio: nunca mostrar la línea de comando cruda en el panel.
        const detail = String(stderr || '').trim().split('\n').pop() || (err.killed ? 'se agotó el tiempo (video muy largo o red lenta)' : 'ffmpeg falló');
        reject(new Error(`No pude extraer el audio del video: ${detail.slice(0, 200)}`));
      }
    );
  });
}

/** Manda un buffer de audio a Groq Whisper y devuelve { text, words }. */
async function whisper(buf, mimeType, filename) {
  if (!config.groq.apiKey) throw new Error('Falta GROQ_API_KEY para transcribir.');
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mimeType }), filename);
  fd.append('model', 'whisper-large-v3');
  fd.append('response_format', 'verbose_json');
  fd.append('language', 'es');
  fd.append('timestamp_granularities[]', 'word');
  fd.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.groq.apiKey}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Groq Whisper: ${(data.error && data.error.message) || JSON.stringify(data.error || data).slice(0, 200)}`);
  }
  const words = (data.words || []).map((w) => ({ word: w.word, start: Number(w.start), end: Number(w.end) }));
  return { text: data.text || '', words };
}

/**
 * Transcribe con tiempos por palabra.
 *  - isAudio=true (voz en off subida/grabada): se manda el archivo DIRECTO a Groq
 *    (acepta webm/opus, mp3, m4a, wav) — sin pasar por ffmpeg en el servidor.
 *  - videos: se extrae el audio con ffmpeg primero (no conviene subir el video entero).
 * Devuelve { text, words: [{ word, start, end }] }.
 */
async function transcribeVideo(sourceUrl, { isAudio = false } = {}) {
  if (isAudio) {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`No pude descargar la voz en off (${res.status}). Volvé a subirla.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 24 * 1024 * 1024) throw new Error('La voz en off supera 24 MB. Grabala más corta o comprimila.');
    const mime = res.headers.get('content-type') || 'audio/webm';
    const ext = (mime.split('/')[1] || 'webm').split(';')[0];
    return whisper(buf, mime.split(';')[0], `voz.${ext}`);
  }

  const audioPath = await extractAudio(sourceUrl);
  try {
    return await whisper(fs.readFileSync(audioPath), 'audio/mpeg', 'audio.mp3');
  } finally {
    try { fs.unlinkSync(audioPath); } catch (_) {}
  }
}

module.exports = { transcribeVideo, extractAudio };
