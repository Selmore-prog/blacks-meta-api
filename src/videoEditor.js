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

// #RRGGBB -> color ASS (&HAABBGGRR).
function hexToAss(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '&H0000A5FF';
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

// Agrupa las palabras en frases cortas (estilo reel), conservando cada palabra con sus tiempos.
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
  return groups.map((g) => ({ start: Number(g[0].start), end: Number(g[g.length - 1].end), words: g }));
}

/**
 * Construye el .ass estilo CREADOR (karaoke: cada palabra se pinta con color de acento
 * cuando se dice) con pop-in. style: { position, uppercase, fontSize, maxWords, color, karaoke }
 */
function buildAss({ words = [], overlays = [], style = {}, w = 1080, h = 1920 }) {
  const up = style.uppercase !== false;
  const size = style.fontSize || 96;
  const marginV = style.position === 'top' ? 300 : 420; // por encima de la UI de IG
  const align = style.position === 'top' ? 8 : 2;
  const font = style.font || 'DejaVu Sans'; // disponible en el runner; Bold garantiza impacto
  const white = '&H00FFFFFF';
  const accent = hexToAss(style.color || '#E4571B'); // color con el que se resalta la palabra
  const outline = '&H00000000';
  const karaoke = style.karaoke !== false;

  // En karaoke: PrimaryColour = color "cantado" (acento), SecondaryColour = base (blanco).
  const primary = karaoke ? accent : white;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,${font},${size},${primary},${white},${outline},&H90000000,-1,0,0,0,100,100,1,0,1,8,3,${align},80,80,${marginV},1
Style: Top,${font},${Math.round(size * 0.9)},${white},${white},${outline},&H90000000,-1,0,0,0,100,100,1,0,1,8,3,8,80,80,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const subs = groupWords(words, style.maxWords || 3).map((g) => {
    let body;
    if (karaoke) {
      body = g.words.map((wd) => {
        const cs = Math.max(6, Math.round((Number(wd.end) - Number(wd.start)) * 100));
        return `{\\k${cs}}${assEscape(up ? String(wd.word).toUpperCase() : wd.word)} `;
      }).join('').trim();
    } else {
      body = assEscape(up ? g.words.map((x) => x.word).join(' ').toUpperCase() : g.words.map((x) => x.word).join(' '));
    }
    // pop-in: aparece con un pequeño escalado + fade.
    const intro = '{\\fad(60,40)\\fscx70\\fscy70\\t(0,130,\\fscx100\\fscy100)}';
    return `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Sub,,0,0,0,,${intro}${body}`;
  });

  const tops = (overlays || []).filter((o) => o && o.text).map((o) => {
    const txt = assEscape(up ? String(o.text).toUpperCase() : o.text);
    return `Dialogue: 0,${assTime(o.start || 0)},${assTime(o.end || 3)},Top,,0,0,0,,{\\fad(80,60)}${txt}`;
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
