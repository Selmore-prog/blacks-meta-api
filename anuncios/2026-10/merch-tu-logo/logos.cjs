// Los logos de muestra ("TU LOGO" con la chispa naranja) en PNG transparente: node logos.cjs
const path = require('path');
const puppeteer = require('/Users/sebastianelmore/blacks-content-engine/node_modules/puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setViewport({ width: 2000, height: 1200, deviceScaleFactor: 1 });
  for (const forma of ['apilado', 'linea', 'texto']) for (const tono of ['claro', 'oscuro']) {
    await p.goto('file://' + path.join(__dirname, 'logos.html') + `?forma=${forma}&tono=${tono}`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    const el = await p.$('#l');
    await el.screenshot({ path: path.join(__dirname, 'logos', `${forma}-${tono}.png`), omitBackground: true });
    console.log(forma, tono);
  }
  await b.close();
})();
