// Arma logos/lusq.js con los logos de Lüsqtoff vectorizados (potrace) listos para animar:
// el isologo solo y el logo completo con cada letra por separado.
// node logos.cjs   (los *-trazado.svg salen de potrace sobre lusq-iso.png y lusq-logo.png)
const path = require('path'), fs = require('fs');
const puppeteer = require('/Users/sebastianelmore/blacks-content-engine/node_modules/puppeteer');
const L = f => fs.readFileSync(path.join(__dirname, 'logos', f), 'utf8');

(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  const out = await p.evaluate((iso, letras, wmIso) => {
    // potrace: <g transform="translate(0,H) scale(.1,-.1)"> con un <path> por figura (agujeros incluidos)
    function leer(svgText) {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const vb = doc.documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
      const H = vb[3];
      const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.appendChild(host);
      const figuras = [...doc.querySelectorAll('path')].map(n => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.setAttribute('d', n.getAttribute('d')); host.appendChild(el);
        const bb = el.getBBox();
        // a coordenadas de la imagen trazada (y para abajo)
        return { d: n.getAttribute('d'), x: bb.x * .1, y: H - (bb.y + bb.height) * .1, w: bb.width * .1, h: bb.height * .1 };
      });
      host.remove();
      return { H, figuras };
    }
    const caja = fs => { const x0 = Math.min(...fs.map(f => f.x)), y0 = Math.min(...fs.map(f => f.y)), x1 = Math.max(...fs.map(f => f.x + f.w)), y1 = Math.max(...fs.map(f => f.y + f.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };

    const I = leer(iso), T = leer(letras), WI = leer(wmIso);
    const isoBox = caja(I.figuras), wmIsoBox = caja(WI.figuras.filter(f => f.w > 50));
    // letras: se ordenan de izquierda a derecha; los puntos de la Ü van con la U
    const fs_ = T.figuras.filter(f => f.w > 20).sort((a, b) => a.x - b.x);
    const letrasG = [];
    for (const f of fs_) {
      const ult = letrasG[letrasG.length - 1];
      const solapa = ult && f.x < ult.box.x + ult.box.w - 5 && (f.h < 200 || ult.box.h < 200 || (f.x + f.w) < ult.box.x + ult.box.w + 5);
      if (solapa) { ult.ds.push(f.d); ult.box = caja([ult.box, f]); }
      else letrasG.push({ ds: [f.d], box: { x: f.x, y: f.y, w: f.w, h: f.h } });
    }
    // el iso de alta del archivo grande, encajado donde está el iso chico del logo completo
    const s = wmIsoBox.h / isoBox.h;
    const isoEnWm = { s, tx: wmIsoBox.x - isoBox.x * s, ty: wmIsoBox.y - isoBox.y * s, ancho: isoBox.w * s, anchoChico: wmIsoBox.w };
    const todo = caja([wmIsoBox, ...letrasG.map(l => l.box)]);
    return {
      iso: { H: I.H, box: isoBox, ds: I.figuras.map(f => f.d) },
      wm: { H: T.H, box: todo, isoBox: wmIsoBox, isoEnWm, letras: letrasG.map(l => ({ ds: l.ds, box: l.box })) },
    };
  }, L('lusq-iso-trazado.svg'), L('lusq-letras-trazado.svg'), L('lusq-wm-iso-trazado.svg'));
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'logos', 'lusq.js'), '// generado por logos.cjs\nwindow.LUSQ = ' + JSON.stringify(out) + ';\n');
  console.log('letras:', out.wm.letras.length, out.wm.letras.map(l => Math.round(l.box.x) + '/' + Math.round(l.box.w)).join(' '));
  console.log('iso box', out.iso.box, '\niso en logo', out.wm.isoEnWm, '\nlogo box', out.wm.box);
})();
