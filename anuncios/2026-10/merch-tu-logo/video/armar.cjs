// Junta video + sonido, saca la portada y copia todo al escritorio.
// Antes: node sonido.cjs · node render.cjs feed · node render.cjs story (y node ../piezas.cjs para las estáticas)
// node armar.cjs → ~/Desktop/piezas-motor/merchandising/
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const FF = '/Users/sebastianelmore/blacks-content-engine/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const SAL = path.join(__dirname, 'salida'), DEST = path.join(os.homedir(), 'Desktop/piezas-motor/merchandising');
fs.mkdirSync(path.join(DEST, 'videos'), { recursive: true });
fs.mkdirSync(path.join(DEST, 'estaticas'), { recursive: true });
const PORTADA = 0.9; // la pregunta con los cuatro productos flotando
for (const [fmt, nombre] of [['feed', 'feed-4x5'], ['story', 'historia-9x16']]) {
  const mudo = path.join(SAL, `merch-${fmt}-sin-sonido.mp4`);
  if (!fs.existsSync(mudo)) { console.log('falta', mudo); continue; }
  const out = path.join(DEST, 'videos', `merch-tu-logo-${nombre}.mp4`);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mudo, '-i', path.join(__dirname, 'sonido.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  fs.copyFileSync(mudo, path.join(DEST, 'videos', `merch-tu-logo-${nombre}-sin-sonido.mp4`));
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(PORTADA), '-i', mudo, '-frames:v', '1', '-q:v', '2', path.join(DEST, 'videos', `portada-${nombre}.jpg`)]);
  console.log('listo', out);
}
const EST = path.join(__dirname, '..', 'salida', 'estaticas');
for (const f of fs.readdirSync(EST)) fs.copyFileSync(path.join(EST, f), path.join(DEST, 'estaticas', f));
console.log('estáticas copiadas:', fs.readdirSync(EST).length);
