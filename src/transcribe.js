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
      ['-y', '-loglevel', 'error', '-i', videoUrl, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', out],
      { timeout: 120000 },
      (err) => (err ? reject(err) : resolve(out))
    );
  });
}

/**
 * Transcribe el audio de un video con Groq Whisper (whisper-large-v3), con tiempos por palabra.
 * Devuelve { text, words: [{ word, start, end }] }.
 */
async function transcribeVideo(videoUrl) {
  if (!config.groq.apiKey) throw new Error('Falta GROQ_API_KEY para transcribir.');
  const audioPath = await extractAudio(videoUrl);
  try {
    const buf = fs.readFileSync(audioPath);
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
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
  } finally {
    try { fs.unlinkSync(audioPath); } catch (_) {}
  }
}

module.exports = { transcribeVideo, extractAudio };
