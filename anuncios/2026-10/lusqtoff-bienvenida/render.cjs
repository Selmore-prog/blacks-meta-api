// node render.cjs feed|story [t1,t2,...]   → previews/ (cuadros sueltos)  ó  el MP4 sin sonido
// Desenfoque de movimiento: cada cuadro es el promedio de SUB muestras repartidas en medio cuadro
// (obturador de 180°, como una cámara), así los movimientos rápidos no se ven a saltos.
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const puppeteer = require('/Users/sebastianelmore/blacks-content-engine/node_modules/puppeteer');
const FF = '/Users/sebastianelmore/blacks-content-engine/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const fmt = process.argv[2] || 'feed';
const previews = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const W = 1080, H = fmt === 'story' ? 1920 : 1350, FPS = 30, DUR = 11;
const SUB = Number(process.env.SUB || 4), SHUTTER = .5;
const OUT = process.env.OUT || path.join(__dirname, 'salida');

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await p.goto('file://' + path.join(__dirname, 'comp.html') + '?fmt=' + fmt, { waitUntil: 'networkidle0' });
  await p.evaluate(() => window.listo);
  if (previews) {
    fs.mkdirSync(path.join(__dirname, 'previews'), { recursive: true });
    for (const t of previews) {
      await p.evaluate(t => window.renderAt(t), t);
      await p.screenshot({ path: path.join(__dirname, 'previews', `${fmt}_${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 88 });
    }
    await b.close(); return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `lusqtoff-${fmt}-sin-sonido.mp4`);
  // tmix (ffmpeg 4.4) recién emite con SUB muestras juntas: su salida n es el promedio de n..n+SUB-1,
  // así que el grupo de cada cuadro empieza en los múltiplos de SUB
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `tmix=frames=${SUB},select='not(mod(n\\,${SUB}))',setpts=N/(${FPS}*TB)`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(DUR * FPS);
  for (let f = 0; f < N; f++) {
    for (let k = 0; k < SUB; k++) {
      const t = Math.max(0, (f + (SUB > 1 ? ((k + .5) / SUB - .5) * SHUTTER : 0)) / FPS);
      await p.evaluate(t => window.renderAt(t), t);
      const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    if (f % 30 === 0) process.stdout.write(`${fmt} ${f}/${N}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log('listo', out);
})();
