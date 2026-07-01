const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { uploadAsset } = require('./storage');

/* ---------- Subtítulos ASS (estilo moderno tipo reel) ---------- */

function assTime(t) {
  t = Math.max(0, Number(t) || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function assEscape(text) {
  return String(text || '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim();
}

// Agrupa las palabras en frases cortas (estilo reel: pocas palabras a la vez).
function groupWords(words, maxWords = 3, maxDur = 1.6) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || (Number(w.end) - Number(cur[0].start)) > maxDur)) {
      groups.push(cur); cur = [];
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => ({
    start: Number(g[0].start),
    end: Number(g[g.length - 1].end),
    text: g.map((x) => x.word).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
  }));
}

/**
 * Construye el archivo .ass a partir de las palabras (editables) y overlays.
 * style: { position:'bottom'|'top', uppercase:bool, fontSize:number, maxWords:number }
 */
function buildAss({ words = [], overlays = [], style = {}, w = 1080, h = 1920 }) {
  const up = style.uppercase !== false; // por defecto MAYÚSCULAS (más impacto)
  const size = style.fontSize || 92;
  const marginV = style.position === 'top' ? 240 : 360; // deja libre la UI de IG
  const align = style.position === 'top' ? 8 : 2;
  const primary = '&H00FFFFFF'; // blanco
  const outline = '&H00000000'; // negro

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Arial Black,${size},${primary},&H000000FF,${outline},&H64000000,-1,0,0,0,100,100,0,0,1,7,4,${align},90,90,${marginV},1
Style: Top,Arial Black,${Math.round(size * 0.9)},${primary},&H000000FF,${outline},&H64000000,-1,0,0,0,100,100,0,0,1,7,4,8,90,90,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const subs = groupWords(words, style.maxWords || 3).map((g) => {
    const txt = assEscape(up ? g.text.toUpperCase() : g.text);
    return `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Sub,,0,0,0,,${txt}`;
  });

  const tops = (overlays || []).filter((o) => o && o.text).map((o) => {
    const txt = assEscape(up ? String(o.text).toUpperCase() : o.text);
    return `Dialogue: 0,${assTime(o.start || 0)},${assTime(o.end || 3)},Top,,0,0,0,,${txt}`;
  });

  return header + subs.concat(tops).join('\n') + '\n';
}

/* ---------- Quemado con ffmpeg ---------- */

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 300000, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).slice(-400))) : resolve());
  });
}

/**
 * Quema los subtítulos (y opcional voz en off) sobre el video y devuelve la URL final subida.
 * videoUrl / voiceoverUrl pueden ser URLs http (ffmpeg las lee directo).
 */
async function renderEditedVideo({ videoUrl, words = [], overlays = [], voiceoverUrl = null, style = {}, filename }) {
  if (!videoUrl) throw new Error('[videoEditor] falta videoUrl');
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const assPath = path.join(os.tmpdir(), `subs-${id}.ass`);
  const outPath = path.join(os.tmpdir(), `edited-${id}.mp4`);
  fs.writeFileSync(assPath, buildAss({ words, overlays, style }));

  const assFilter = `ass=${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}`;
  const args = ['-y', '-loglevel', 'error', '-i', videoUrl];
  if (voiceoverUrl) args.push('-i', voiceoverUrl);
  if (voiceoverUrl) {
    args.push('-filter_complex', `[0:v]${assFilter}[v]`, '-map', '[v]', '-map', '1:a', '-shortest');
  } else {
    args.push('-vf', assFilter, '-map', '0:v', '-map', '0:a?');
  }
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', outPath);

  try {
    await runFfmpeg(args);
    const buf = fs.readFileSync(outPath);
    const url = await uploadAsset({ buffer: buf, filename: filename || `reels/edited-${id}.mp4`, contentType: 'video/mp4' });
    return url;
  } finally {
    try { fs.unlinkSync(assPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

module.exports = { buildAss, groupWords, renderEditedVideo };
