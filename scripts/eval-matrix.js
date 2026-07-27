/* =========================================================================
 * BANCO DE PRUEBAS — MATRIZ (eval-matrix)
 * Renderiza una MATRIZ de estilos (feed/historia, fullbleed/promo/magazine/
 * stackedcards/grid, carrusel, tarjetas institucionales mayorista/educativo) para
 * unos pocos productos reales. Genera la ESCENA IA una sola vez por producto y la
 * reusa entre plantillas full-bleed; el resto usa fotos reales (gratis). PNG local,
 * QA visual, tope de gasto.
 *
 *   node scripts/eval-matrix.js [--budget 1.5] [--ids a,b]
 * Salida en EVAL_OUT (o ./eval-out).
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const pool = require('../src/db');
const {
  describeProductPhotos, planHeroShot, generateProductScene, reviewRenderedPiece, imageSpendTodayUsd,
} = require('../src/ai');
const { buildHtml, DIMS } = require('../src/imageRenderer');
const { getLogos } = require('../src/styleService');

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const BUDGET = Number(arg('budget', '1.5'));
const OUT = process.env.EVAL_OUT || path.join(process.cwd(), 'eval-out');
const IDS = arg('ids', '344297681,106194256').split(',').map((s) => s.trim()).filter(Boolean);

let browser;
async function renderLocal(html, format, file) {
  const { w, h } = DIMS[format];
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}
    const buffer = await page.screenshot({ type: 'jpeg', quality: 88 });
    fs.writeFileSync(file, buffer);
    return buffer;
  } finally { await page.close(); }
}

const report = [];
async function shoot(name, format, opts, overlayText) {
  const file = path.join(OUT, `${name}.jpg`);
  const buffer = await renderLocal(buildHtml({ format, logos: opts.logos, ...opts }), format, file);
  const qa = await reviewRenderedPiece({ buffer, overlayText: overlayText || opts.overlayTitle || null }).catch(() => ({ ok: null, issues: [] }));
  const flag = qa.ok === false ? `❌ ${(qa.issues || []).join(' · ')}` : (qa.ok === null ? '(qa n/d)' : '✅');
  report.push(`- ${name} · ${flag}`);
  console.log(`[eval] ${name} ${flag}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { rows: products } = await pool.query('SELECT * FROM products_cache WHERE id = ANY($1::bigint[])', [IDS.map(Number)]);
  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const startSpend = await imageSpendTodayUsd().catch(() => 0);
  const spent = async () => (await imageSpendTodayUsd().catch(() => 0)) - startSpend;

  const price = (p) => ({ price: p.price, promoPrice: p.promo_price });

  for (const p of products) {
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
    if (!imgs.length) continue;
    const short = String(p.id);
    report.push(`\n## ${p.name} (#${p.id})`);

    // Escena IA (feed) una sola vez, reusada por las plantillas full-bleed.
    let scene = null;
    if (await spent() < BUDGET) {
      const pd = await describeProductPhotos(imgs.slice(0, 8)).catch(() => []);
      const hero = await planHeroShot({ productName: p.name, productDescription: p.description, brief: `Producto: ${p.name}`, pillar: 'producto', objective: 'venta', photoDescriptions: pd, photoCount: imgs.length, format: 'feed' }).catch(() => null);
      const heroUrl = hero ? (imgs[hero.photoIndex] || imgs[0]) : imgs[0];
      const s = await generateProductScene({ productImageUrl: heroUrl, productImageUrls: imgs.filter((u) => u !== heroUrl).slice(0, 3), productName: p.name, theme: `${p.name}${p.category ? ` (${p.category})` : ''}`, brief: `Producto: ${p.name}`, format: 'feed', seed: Number(p.id), shotSpec: hero }).catch((e) => { console.warn('scene err', e.message); return null; });
      if (s) scene = `data:${s.mimeType};base64,${s.buffer.toString('base64')}`;
    }
    report.push(`  (escena IA: ${scene ? 'sí' : 'no — usa foto real'} · gasto acum ≈ US$${(await spent()).toFixed(3)})`);

    const bg = scene ? { bgImageUrl: scene } : { productImageUrl: imgs[0], coverImage: true };
    const pts = ['Calidad Pampero', '6 cuotas sin interés', 'Envío a todo el país'];

    // 1) FEED fullbleed (escena IA)
    await shoot(`feed-fullbleed-${short}`, 'feed', { ...bg, template: 'fullbleed', overlayTitle: p.name, ...price(p), ctaLabel: null, logos });
    // 2) FEED promo (escena IA, precio gigante)
    await shoot(`feed-promo-${short}`, 'feed', { ...bg, template: 'promo', overlayTitle: p.name, ...price(p), badgeText: 'OFERTA', logos });
    // 3) FEED magazine (foto real chica)
    await shoot(`feed-magazine-${short}`, 'feed', { productImageUrl: imgs[0], template: 'magazine', overlayTitle: p.name, kicker: 'BLACKS INDUMENTARIA', storyPoints: pts, logos });
    // 4) FEED stackedcards (foto real)
    await shoot(`feed-stacked-${short}`, 'feed', { productImageUrl: imgs[0], template: 'stackedcards', overlayTitle: p.name, ...price(p), logos });
    // 5) FEED grid (varias fotos reales)
    if (imgs.length >= 3) await shoot(`feed-grid-${short}`, 'feed', { productImageUrls: imgs.slice(0, 4), template: 'grid', overlayTitle: p.name, ...price(p), logos });
    // 6) STORY fullbleed con precio + puntos (efímero)
    await shoot(`story-fullbleed-${short}`, 'story', { ...bg, template: 'fullbleed', overlayTitle: p.name, ...price(p), storyPoints: pts, ctaLabel: 'Ver en la web', logos });
  }

  // Carrusel (producto 0): hero escena + 2 detalles reales + precio + cta.
  const p0 = products[0];
  if (p0) {
    const imgs = Array.isArray(p0.images) ? p0.images : [];
    const scene0 = fs.existsSync(path.join(OUT, `feed-fullbleed-${p0.id}.jpg`)); // ya renderizado
    report.push(`\n## Carrusel — ${p0.name}`);
    // hero (reusa foto real cover si no hay escena para no gastar de nuevo)
    await shoot(`carousel-1-hero-${p0.id}`, 'feed', { productImageUrl: imgs[0], coverImage: true, template: 'fullbleed', overlayTitle: p0.name, logos });
    if (imgs[1]) await shoot(`carousel-2-detalle-${p0.id}`, 'feed', { productImageUrl: imgs[1], coverImage: true, template: 'fullbleed', overlayTitle: 'Detalle real', logos });
    if (imgs[2]) await shoot(`carousel-3-detalle-${p0.id}`, 'feed', { productImageUrl: imgs[2], coverImage: true, template: 'fullbleed', overlayTitle: 'Terminaciones', logos });
    await shoot(`carousel-4-cta-${p0.id}`, 'feed', { productImageUrl: imgs[3] || imgs[0], coverImage: true, template: 'fullbleed', ctaHeadline: 'Conseguilo en la web', ctaBenefits: ['6 cuotas sin interés', 'Envío a todo el país'], logos });
  }

  // Institucionales (gratis, sin foto)
  await shoot('inst-mayorista', 'story', { template: 'mayorista', overlayTitle: 'Uniformes para tu empresa', storyPoints: ['Mínimo 10 unidades', 'Personalización con logo', 'Factura A'], logos });
  await shoot('inst-educativo', 'feed', { template: 'educativo', overlayTitle: 'Cómo elegir tu talle', kicker: 'PARA SABER', bodyText: 'Medí el ancho de tu pecho y compará con la guía de talles antes de comprar.', productImageUrl: (products[0] && (products[0].images || [])[0]) || null, logos });

  const total = await spent();
  report.push(`\n---\nGasto de la corrida ≈ US$${total.toFixed(3)} (tope US$${BUDGET})`);
  fs.writeFileSync(path.join(OUT, 'matrix-report.md'), report.join('\n'));
  console.log(`\n[eval] listo. Gasto ≈ US$${total.toFixed(3)}. Reporte: ${path.join(OUT, 'matrix-report.md')}`);
  await browser.close();
  await pool.end();
})().catch((e) => { console.error(e); if (browser) browser.close(); process.exit(1); });
