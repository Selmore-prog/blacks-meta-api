const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { analyzePixels, analyzeBuffer } = require('../src/photoStage');
const studio = require('../src/templatesStudio');
const { encodePng } = require('../src/productCutout');
const { capitalizarOraciones } = require('../src/textUtils');
const { templateCandidates, sinNumeroDeSlide, numeroDeSlide } = require('../scripts/generate-daily');

/* Fotos de estudio armadas en memoria: fondo gris cálido que se oscurece hacia el
   piso (como las del catálogo) y una "prenda" oscura. `corte` dice por dónde sale
   cortada, igual que un pantalón fotografiado de la cintura para abajo. */
function fotoDeEstudio({ w = 240, h = 240, x0 = 90, x1 = 150, y0 = 0, y1 = 200, ruido = false } = {}) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      let c = [236 - (y / h) * 10, 235 - (y / h) * 10, 231 - (y / h) * 10];
      if (ruido) c = [(x * 37 + y * 11) % 255, (x * 7 + y * 29) % 255, (x * 17 + y * 3) % 255];
      if (x >= x0 && x < x1 && y >= y0 && y < y1) c = [52, 58, 40];
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

test('la foto de estudio se mide: fondo liso, caja de la prenda y bordes cortados', () => {
  const a = analyzePixels(fotoDeEstudio());
  assert.equal(a.studio, true);
  assert.deepEqual(a.touches, { top: true, bottom: false, left: false, right: false });
  assert.ok(Math.abs(a.bbox.x0 - 90 / 240) < 0.02 && Math.abs(a.bbox.x1 - 150 / 240) < 0.02);
  assert.ok(a.bbox.y1 > 0.8 && a.bbox.y1 < 0.86);
  // El fondo fila por fila: más claro arriba (pared) que abajo (piso).
  const lum = (h) => parseInt(h.slice(1, 3), 16);
  assert.ok(lum(a.rows[0].color) > lum(a.rows[a.rows.length - 1].color));
  // Una foto de ambiente (fondo con textura) no se puede "poner en estudio".
  assert.equal(analyzePixels(fotoDeEstudio({ ruido: true, y0: 60, y1: 180 })).studio, false);
});

test('las composiciones dependen de por dónde viene cortada la foto', () => {
  const pantalon = analyzePixels(fotoDeEstudio());
  const feed = studio.composiciones(pantalon, 'feed');
  assert.ok(feed.includes('estudio_lado') && feed.includes('estudio_abajo'));
  assert.ok(!feed.includes('estudio_arriba')); // la línea del corte quedaría flotando
  const pecho = analyzePixels(fotoDeEstudio({ x0: 0, x1: 240, y0: 0, y1: 240 }));
  assert.deepEqual(studio.composiciones(pecho, 'feed'), ['estudio_escena']);
  // El director sólo ve lo que la foto sostiene.
  const slot = { id: 3, pillar: 'producto', post_type: 'feed', format: 'feed' };
  const visualProduct = { images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], description: 'Algodón' };
  const opciones = templateCandidates(slot, { visualProduct, photoAnalysis: pantalon });
  assert.ok(!opciones.includes('estudio_arriba'));
  assert.ok(opciones.includes('estudio_linea'));
});

test('la prenda cortada sale por el borde del cuadro y crece hasta llenar su zona', () => {
  const a = analyzePixels(fotoDeEstudio());
  const G = studio.geometry('feed');
  const zona = { x: 440, y: 0, w: 640, h: G.H };
  const st = studio.escenificar(a, zona, { x: 0, y: 0, w: G.W, h: G.H });
  assert.ok(st.box.y <= 0.5, 'el corte de arriba coincide con el borde del lienzo');
  assert.ok(st.sujeto.h > G.H * 0.8, 'la prenda ocupa casi todo el alto');
  assert.equal(st.feather.t, 0);
});

test('titulares: el gancho corto manda y el nombre de la prenda baja; nunca se pierde qué es', () => {
  const corto = studio.titulares({ hasProduct: true, displayTitle: 'Campera Trucker Térmica', overlayTitle: 'Abrigo sin volumen' });
  assert.deepEqual(corto, { titulo: 'Abrigo sin volumen', bajada: 'Campera Trucker Térmica' });
  const largo = studio.titulares({ hasProduct: true, displayTitle: 'Pantalón Cargo Ripstop', overlayTitle: 'Resiste la jornada completa sin romperse ni perder la forma' });
  assert.equal(largo.titulo, 'Pantalón Cargo Ripstop');
  assert.match(largo.bajada, /^Resiste la jornada/);
  assert.equal(studio.titulares({ hasProduct: false, overlayTitle: '¿Tu favorito de septiembre?' }).titulo, '¿Tu favorito de septiembre?');
});

test('los nombres del catálogo se acortan y se acentúan para el titular', () => {
  assert.equal(studio.nombreCorto('Pantalon Cargo Ripstop Antidesgarro Pampero'), 'Pantalón Cargo Ripstop');
  assert.equal(studio.nombreCorto('Borceguí Leñador Pampero Art.5909'), 'Borceguí Leñador');
  assert.equal(studio.nombreCorto('Pantalones Jean Vaquero Clásico Recto Original'), 'Jean Vaquero Clásico Recto');
  assert.equal(studio.nombreCorto('Botines De Seguridad Grafa 70 Con Puntera De Acero Homologado'), 'Botines de Seguridad');
  assert.equal(studio.conTildes('PANTALON TERMICO ALGODON'), 'PANTALÓN TÉRMICO ALGODÓN');
  assert.equal(studio.oracion('Calzado Dieléctrico'), 'Calzado dieléctrico');
  assert.equal(studio.oracion('Norma IRAM 3610'), 'Norma IRAM 3610');
});

test('los textos de la IA arrancan cada oración en mayúscula y hablan de vos', () => {
  assert.equal(capitalizarOraciones('es ripstop. esa malla resiste. ¿y el calor? así se lava.'), 'Es ripstop. Esa malla resiste. ¿Y el calor? Así se lava.');
  assert.equal(capitalizarOraciones('Lava la prenda a mano. Mira el detalle'), 'Lavá la prenda a mano. Mirá el detalle');
  assert.equal(capitalizarOraciones('blacksindumentaria.com.ar tiene 8.5 oz'), 'Blacksindumentaria.com.ar tiene 8.5 oz');
  assert.equal(sinNumeroDeSlide('Portada — ¿Qué es Ripstop?'), '¿Qué es Ripstop?');
  assert.equal(sinNumeroDeSlide('Paso 2 — revisá la tabla'), 'Revisá la tabla');
  assert.equal(sinNumeroDeSlide('3. Cierre'), 'Cierre');
  // El modelo numera con la palabra del tema: "Ventaja 2 —" salía debajo del "01" del diseño.
  assert.equal(sinNumeroDeSlide('Ventaja 2 — Durabilidad prolongada'), 'Durabilidad prolongada');
  assert.equal(sinNumeroDeSlide('Consejo 3: lavá del revés'), 'Lavá del revés');
  assert.equal(sinNumeroDeSlide('5 bolsillos para todo'), '5 bolsillos para todo');
  assert.equal(numeroDeSlide('Ventaja 1 — Resistencia a desgarros'), 1); // la guía no trae tapa: se le agrega
  assert.equal(numeroDeSlide('¿Qué es el ripstop?'), null);
  // Abreviaturas, voseo en el medio y nombres propios.
  assert.equal(capitalizarOraciones('10% desde 10 und. y 20% desde 50 und.'), '10% desde 10 und. y 20% desde 50 und.');
  assert.equal(capitalizarOraciones('Votá por tu favorito y dinos por qué.'), 'Votá por tu favorito y decinos por qué.');
  assert.equal(studio.oracion('Las marcas Pampero, Ombú y Grafa 70. Retirá en Buenos Aires'), 'Las marcas Pampero, Ombú y Grafa 70. Retirá en Buenos Aires');
  assert.equal(studio.oracion('Suela Antideslizante Y Resistente'), 'Suela antideslizante y resistente');
});

test('varias fotos: el mismo set va en línea sin costuras; prendas o sesiones distintas, en mosaico lleno', () => {
  const foto = (o) => ({ url: 'foto.png', analysis: analyzePixels(fotoDeEstudio(o)) });
  const pantalon = foto();
  const torso = foto({ x0: 40, x1: 200, y0: 30, y1: 240 }); // cortado abajo, como una remera en modelo
  const html = (photos) => studio.buildHtml({ format: 'feed', template: 'estudio_linea', photos, overlayTitle: 'Tres colores', hasProduct: false });
  // Tres fotos del mismo set (mismo corte, mismo fondo): una fila a la misma escala.
  assert.match(html([pantalon, pantalon, pantalon]), /class="col"/);
  // Un pantalón cortado en la cintura y dos torsos: cada foto en su cuadro, nada se funde
  // (un corte en la segunda fila se desvanecía como una niebla).
  assert.match(html([pantalon, torso, torso]), /class="tile"/);
  // Cuatro torsos: 2×2. En cuatro columnas angostas quedaban chicos, con la mitad de arriba vacía.
  const tops = [...html([torso, torso, torso, torso]).matchAll(/class="tile" style="left:\d+px;top:(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(tops.length, 4);
  assert.equal(new Set(tops).size, 2, 'dos filas de dos');
});

let browser;
after(async () => { if (browser) await browser.close(); });

test('render: texto dentro de las zonas seguras, sin tarjetas, foto a sangre y en mayúscula', async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  // Sin red: las tipografías caen a las de sistema y el ajuste de texto igual tiene que andar.
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith('http') ? r.abort() : r.continue()));
  const png = (img) => `data:image/png;base64,${encodePng(img.data, img.w, img.h).toString('base64')}`;
  const pantalon = fotoDeEstudio();
  const zapato = fotoDeEstudio({ x0: 40, x1: 200, y0: 90, y1: 170 });
  const fotos = {
    pantalon: { url: png(pantalon), analysis: await analyzeBuffer(encodePng(pantalon.data, pantalon.w, pantalon.h)) },
    zapato: { url: png(zapato), analysis: await analyzeBuffer(encodePng(zapato.data, zapato.w, zapato.h)) },
  };
  const base = {
    overlayTitle: 'Resiste todo el día', displayTitle: 'Pantalón Cargo Ripstop', kicker: 'Pampero', hasProduct: true,
    specs: ['Tejido ripstop antidesgarro', 'Triple costura', 'Bolsillos con tapa'], price: 72399, promoPrice: 59999, ctaLabel: 'Comprá online',
  };
  const casos = [
    ['feed', 'estudio_lado', [fotos.pantalon]], ['feed', 'estudio_abajo', [fotos.pantalon]], ['feed', 'estudio_arriba', [fotos.zapato]],
    ['story', 'estudio_abajo', [fotos.pantalon]], ['story', 'estudio_arriba', [fotos.zapato]],
    ['feed', 'estudio_linea', [fotos.pantalon, fotos.pantalon]], ['story', 'estudio_linea', [fotos.zapato, fotos.zapato, fotos.zapato]],
    ['feed', 'estudio_titular', []], ['story', 'estudio_titular', [fotos.pantalon, fotos.pantalon]],
    ['feed', 'estudio_titular', [fotos.pantalon, fotos.pantalon, fotos.pantalon]],
  ];
  for (const [format, template, photos] of casos) {
    const G = studio.geometry(format);
    await page.setViewport({ width: G.W, height: G.H });
    const { comp } = await studio.renderOnPage(page, { ...base, format, template, photos, numerar: template === 'estudio_linea' }, { waitUntil: 'load' });
    assert.equal(comp, template, `${format}/${template}`);
    const s = await page.evaluate(() => ({
      zones: [...document.querySelectorAll('.zone')].map((z) => { const r = z.getBoundingClientRect(); const c = z.querySelector('.copy'); return { top: r.top, bottom: r.bottom, over: c.offsetHeight > z.clientHeight + 1 }; }),
      h1: getComputedStyle(document.querySelector('h1')).textTransform,
      photoTops: [...document.querySelectorAll('.photo')].map((p) => p.getBoundingClientRect().top),
      cards: [...document.querySelectorAll('.photo')].filter((p) => getComputedStyle(p).borderRadius !== '0px' || getComputedStyle(p).boxShadow !== 'none').length,
      nums: [...document.querySelectorAll('.num')].map((n) => n.textContent),
      copy: (() => { const r = document.querySelector('.zone .copy').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })(),
      franja: Math.min(...[...document.querySelectorAll('.tile,.col')].map((e) => e.getBoundingClientRect().top)),
    }));
    s.zones.forEach((z) => {
      assert.ok(z.top >= G.top - 1 && z.bottom <= G.H - G.bottom + 1, `${format}/${template}: texto fuera de zona segura`);
      assert.equal(z.over, false, `${format}/${template}: el texto no entra`);
    });
    assert.equal(s.h1, 'uppercase');
    assert.equal(s.cards, 0, 'sin tarjetas ni sombras alrededor de la foto');
    if (template === 'estudio_lado' || (template === 'estudio_abajo' && format === 'feed')) {
      assert.ok(Math.min(...s.photoTops) <= 0.5, `${format}/${template}: el pantalón cortado sale por arriba`);
    }
    if (template === 'estudio_linea') assert.deepEqual(s.nums, photos.map((_, i) => String(i + 1)));
    if (template === 'estudio_titular' && photos.length) {
      // El afiche no deja pozo: la franja de fotos se lleva lo que el texto no usa.
      assert.ok(s.franja - s.copy.bottom <= 60, `${format}: el texto queda pegado a la franja`);
      assert.ok(s.copy.top - G.top <= 80 || G.H - s.franja >= G.H * 0.57, `${format}: sin pozo arriba del titular`);
    }
  }
  await page.close();
});
