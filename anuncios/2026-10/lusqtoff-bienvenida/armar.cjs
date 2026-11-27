// Junta video + sonido y saca las portadas. Antes: node logos.cjs (una vez), node sonido.cjs, node render.cjs feed|story
// node armar.cjs → ~/Desktop/piezas-motor/videos/lusqtoff/
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const FF = '/Users/sebastianelmore/blacks-content-engine/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const SAL = path.join(__dirname, 'salida'), DEST = path.join(os.homedir(), 'Desktop/piezas-motor/videos/lusqtoff');
fs.mkdirSync(DEST, { recursive: true });
const PORTADA = 4.2; // "Bienvenida LÜSQTOFF a la familia Blacks" ya armado
for (const [fmt, nombre] of [['feed', 'feed-4x5'], ['story', 'historia-9x16']]) {
  const mudo = path.join(SAL, `lusqtoff-${fmt}-sin-sonido.mp4`);
  if (!fs.existsSync(mudo)) { console.log('falta', mudo); continue; }
  const out = path.join(DEST, `lusqtoff-bienvenida-${nombre}.mp4`);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mudo, '-i', path.join(__dirname, 'sonido.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  fs.copyFileSync(mudo, path.join(DEST, `lusqtoff-bienvenida-${nombre}-sin-sonido.mp4`));
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(PORTADA), '-i', mudo, '-frames:v', '1', '-q:v', '2', path.join(DEST, `portada-${nombre}.jpg`)]);
  console.log('listo', out);
}
