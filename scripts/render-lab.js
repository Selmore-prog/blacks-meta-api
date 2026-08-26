require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const pool = require('../src/db');
const { buildHtml, DIMS, TEMPLATES } = require('../src/imageRenderer');
const { cutoutFromUrl } = require('../src/productCutout');
const panorama = require('../src/carouselPanorama');

/**
 * LABORATORIO DE PIEZAS (herramienta de desarrollo, no corre en producción).
 *
 * Renderiza plantillas a archivos locales con datos REALES del catálogo, sin llamar a
 * ninguna IA y sin subir nada a Supabase. Existe para poder mirar el resultado de un
 * cambio de diseño en segundos en vez de esperar la generación diaria: el pipeline real
 * (generate-daily) tarda minutos, gasta en imágenes y publica.
 *
 *   node scripts/render-lab.js                      -> todas las plantillas, feed
 *   node scripts/render-lab.js fullbleed specsheet  -> sólo esas
 *   node scripts/render-lab.js --story              -> formato historia
 *   node scripts/render-lab.js --out /tmp/piezas    -> dónde escribir
 *   node scripts/render-lab.js --tira               -> carrusel continuo (la tira + cuadros)
 *   node scripts/render-lab.js --tira --seed 3      -> otro ritmo de composición
 *   node scripts/render-lab.js --producto camisa    -> con qué producto real probar
 *
 * Las piezas quedan en <out>/<template>-<formato>.jpg.
 */

const args = process.argv.slice(2);
const format = args.includes('--story') ? 'story' : 'feed';
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', '.render-lab');
// Valores de las opciones con argumento: no son nombres de plantilla. Ojo con indexOf:
// si la opción no está devuelve -1 y args[0] —que sí es una plantilla— quedaría excluido.
const valorDe = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : null);
const VALORES = new Set([OUT, valorDe('--producto'), valorDe('--seed')].filter(Boolean));
const wanted = args.filter((a) => !a.startsWith('--') && !VALORES.has(a));

/** Un producto real con varias fotos y descripción (para que las plantillas tengan de todo). */
async function pickProduct(nameLike) {
  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, promo_price, stock, description, image_url, images, permalink
       FROM products_cache
      WHERE published IS NOT FALSE AND image_url IS NOT NULL
        AND description IS NOT NULL AND length(description) > 200
        AND COALESCE(jsonb_array_length(images), 1) >= 3
        ${nameLike ? 'AND name ILIKE $1' : ''}
      ORDER BY COALESCE(jsonb_array_length(images), 1) DESC, sales_30d DESC NULLS LAST
      LIMIT 1`,
    nameLike ? [`%${nameLike}%`] : []
  );
  return rows[0] || null;
}

async function brandLogos() {
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key IN ('logo_light_url', 'logo_dark_url')`
  ).catch(() => ({ rows: [] }));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { light: map.logo_light_url || null, dark: map.logo_dark_url || null };
}

/**
 * CARRUSEL CONTINUO en el laboratorio: arma la tira ancha con fotos reales y escribe
 *   tira-completa.jpg  -> la tira entera (así se juzga la continuidad)
 *   tira-1..N.jpg      -> los cuadros tal como los va a ver Instagram
 * Sin subir nada ni llamar a ninguna IA. `--seed N` cambia el ritmo de composición.
 */
async function renderTira({ product, images, logos, seed }) {
  const nombre = String(product.name || '').trim();
  const specs = ['Cintura elastizada', 'Refuerzo en rodilla', 'Bolsillos cargo con fuelle'];
  const crudos = [
    { kind: 'hero', kicker: 'EL MODELO', headline: nombre.split(' ').slice(0, 3).join(' '), deck: 'La que aguanta el turno entero y vuelve al día siguiente.', photoUrl: images[0], badge: 'NUEVO' },
    { kind: 'detalle', kicker: 'EL DETALLE', headline: specs[1], deck: 'Doble costura en la zona que primero se rompe.', photoUrl: images[1] || images[0] },
    { kind: 'detalle', kicker: 'LA TELA', headline: specs[0], deck: 'Se mueve con vos, no te pelea.', photoUrl: images[2] || images[0] },
    { kind: 'cta', headline: 'Conseguila en la web', benefits: ['6 cuotas sin interés', 'Envío gratis a todo el país'], ctaLabel: 'Comprá online', photoUrl: images[3] || images[1] || images[0] },
  ];
  const panels = await Promise.all(crudos.map(async (p) => {
    const cut = await cutoutFromUrl(p.photoUrl).catch(() => null);
    return cut
      ? { ...p, cutout: { url: `data:image/png;base64,${cut.buffer.toString('base64')}`, box: cut.box, aspect: cut.width / cut.height } }
      : { ...p, cutout: null };
  }));
  console.log(`[lab] Tira: ${panels.length} cuadros · recortes OK: ${panels.filter((p) => p.cutout).length}`);

  const { n, w: W, h: H, panelW } = panorama.panoramaDims(panels.length);
  const html = panorama.buildPanoramaHtml({ panels, runningWord: nombre.split(' ')[0] || 'BLACKS', seed }, {});
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  try { await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 }); }
  catch (_) { await page.setContent(html, { waitUntil: 'load' }).catch(() => {}); }
  try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}

  await page.screenshot({ path: path.join(OUT, 'tira-completa.jpg'), type: 'jpeg', quality: 78 });
  for (let i = 0; i < n; i += 1) {
    await page.screenshot({
      path: path.join(OUT, `tira-${i + 1}.jpg`), type: 'jpeg', quality: 88,
      clip: { x: i * panelW, y: 0, width: panelW, height: H },
    });
  }
  console.log(`[lab] ✓ ${OUT}/tira-completa.jpg + ${n} cuadros`);
  await browser.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const prodIdx = args.indexOf('--producto');
  const product = await pickProduct(prodIdx >= 0 ? args[prodIdx + 1] : 'cargo');
  if (!product) throw new Error('No encontré un producto con fotos y descripción en products_cache.');
  const images = Array.isArray(product.images) ? product.images : JSON.parse(product.images || '[]');
  const logos = await brandLogos();

  console.log(`[lab] Producto: "${product.name}" · ${images.length} fotos · $${product.price}`);
  console.log(`[lab] Formato: ${format} · salida: ${OUT}`);

  // Carrusel continuo: es una tira ancha, no una plantilla — tiene su propia rama.
  if (args.includes('--tira')) {
    const seedIdx = args.indexOf('--seed');
    await renderTira({ product, images, logos, seed: seedIdx >= 0 ? Number(args[seedIdx + 1]) || 0 : 0 });
    await pool.end();
    return;
  }

  // Recorte de la prenda: lo necesitan recorte/ficha/editorial. Se calcula una vez
  // y se pasa como data URL, igual que hace renderPostBuffer en producción.
  const cut = await cutoutFromUrl(images[0] || product.image_url);
  console.log(`[lab] Recorte: ${cut ? `OK ${cut.width}x${cut.height} (sujeto ${(cut.coverage * 100).toFixed(0)}%)` : 'no disponible'}`);

  const base = {
    format,
    logos,
    cutoutUrl: cut ? `data:image/png;base64,${cut.buffer.toString('base64')}` : null,
    cutoutBox: cut ? cut.box : null,
    kicker: 'Destacado',
    deck: 'Tres cosas que mirar antes de comprar tu próxima prenda de trabajo.',
    stepNumber: '03',
    specs: ['Cintura elastizada', 'Refuerzo en rodilla', 'Bolsillos cargo', 'Tela ripstop'],
    showBrand: true,
    productImageUrl: images[0] || product.image_url,
    productImageUrls: images,
    overlayTitle: product.name,
    title: 'Bombacha de campo Pampero: resistencia clásica',
    price: product.price,
    promoPrice: product.promo_price,
    description: product.description,
    productName: product.name,
    brand: product.brand,
    layoutSeed: 7,
    ctaText: 'Comprá online',
    points: ['Hasta 6 cuotas sin interés', 'Envío gratis desde $55.000', '10% OFF por transferencia'],
  };

  const list = wanted.length ? wanted : TEMPLATES;
  const { w, h } = DIMS[format];
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });

  for (const template of list) {
    if (!TEMPLATES.includes(template)) { console.warn(`[lab] "${template}" no es una plantilla conocida — la salteo.`); continue; }
    const html = buildHtml({ ...base, template });
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    } catch (_) {
      await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
    }
    try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}
    const file = path.join(OUT, `${template}-${format}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log(`[lab] ✓ ${file}`);
  }

  await browser.close();
  await pool.end();
}

main().catch((err) => { console.error('[lab] Error:', err); process.exit(1); });
