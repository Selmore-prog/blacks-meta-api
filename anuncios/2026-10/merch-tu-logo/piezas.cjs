// Saca las piezas estáticas a JPG: node piezas.cjs [pieza,…]  → salida/estaticas/
// (feed 4:5, historia 9:16, carrusel 1:1: tapa, un producto por tarjeta y cierre)
const path = require('path'), fs = require('fs');
const puppeteer = require('/Users/sebastianelmore/blacks-content-engine/node_modules/puppeteer');
const AQUI = __dirname;
const datos = JSON.parse(fs.readFileSync(path.join(AQUI, 'renders', 'renders.json'), 'utf8'));
fs.writeFileSync(path.join(AQUI, 'datos.js'), `window.DATOS = ${JSON.stringify(datos)};\n`);
const TODAS = [['feed', 1080, 1350, 'feed-4x5'], ['story', 1080, 1920, 'historia-9x16'], ['tapa', 1080, 1080, 'carrusel-00-tapa'],
  ...['mate', 'termo', 'gorra', 'mochila', 'botella', 'cuaderno', 'lapicera'].map((k, i) => [k, 1080, 1080, `carrusel-0${i + 1}-${k}`]),
  ['cierre', 1080, 1080, 'carrusel-08-cierre']];
const pedidas = process.argv[2] ? process.argv[2].split(',') : null;
(async () => {
  const OUT = path.join(AQUI, 'salida', 'estaticas');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  for (const [pieza, w, h, nombre] of TODAS) {
    if (pedidas && !pedidas.includes(pieza)) continue;
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(AQUI, 'piezas.html') + '?pieza=' + pieza, { waitUntil: 'networkidle0' });
    await p.evaluate(() => window.listo);
    await (await p.$('#pieza')).screenshot({ path: path.join(OUT, `${nombre}.jpg`), type: 'jpeg', quality: 92 });
    console.log(nombre);
  }
  await b.close();
})();
