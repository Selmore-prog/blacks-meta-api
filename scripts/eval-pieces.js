/* =========================================================================
 * BANCO DE PRUEBAS DE PIEZAS (eval)
 * Genera piezas REALES (misma IA de escena que producción) para una muestra de
 * productos, las renderiza a PNG LOCAL (no sube a Supabase) y corre el QA visual
 * que ya existe (reviewRenderedPiece). Tope de gasto por corrida.
 *
 *   node scripts/eval-pieces.js [--budget 1.0] [--format story|feed] [--ids 1,2,3]
 *
 * Salida: PNGs + eval-report.md en el directorio indicado por EVAL_OUT (o ./eval-out).
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const pool = require('./../src/db');
const {
  describeProductPhotos, planHeroShot, generateProductScene,
  reviewRenderedPiece, imageSpendTodayUsd,
} = require('../src/ai');
const { buildHtml, DIMS } = require('../src/imageRenderer');
const { getLogos } = require('../src/styleService');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const BUDGET = Number(arg('budget', '1.0'));
const FORMAT = arg('format', 'story') === 'feed' ? 'feed' : 'story';
const OUT = process.env.EVAL_OUT || path.join(process.cwd(), 'eval-out');
const IDS = arg('ids', '').split(',').map((s) => s.trim()).filter(Boolean);

// Muestra diversa por defecto (buzo, botín, pantalón, chomba, campera) si no dan --ids.
const DEFAULT_IDS = ['106194256', '54626580', '344297681', '203561925'];

async function pickProducts() {
  const ids = IDS.length ? IDS : DEFAULT_IDS;
  const { rows } = await pool.query('SELECT * FROM products_cache WHERE id = ANY($1::bigint[])', [ids.map(Number)]);
  return rows;
}

function synthStoryPoints(p) {
  const pts = [];
  const desc = String(p.description || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  if (/algod[oó]n/.test(desc)) pts.push('Algodón resistente');
  if (/frisa|friza/.test(desc)) pts.push('Interior con frisa');
  if (/puntera|acero/.test(desc)) pts.push('Puntera de acero');
  if (/impermeable|softshell|polar/.test(desc)) pts.push('Abrigo para el frío');
  pts.push('6 cuotas sin interés');
  return pts.slice(0, 3);
}

async function renderLocal(html, format, file) {
  const { w, h } = DIMS[format];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; }); } catch (_) {}
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
    fs.writeFileSync(file, buffer);
    return buffer;
  } finally { await browser.close(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const products = await pickProducts();
  const logos = await getLogos().catch(() => ({ onLight: null, onDark: null }));
  const startSpend = await imageSpendTodayUsd().catch(() => 0);
  const report = [`# Eval de piezas (${FORMAT}) — ${new Date().toISOString()}`, `Tope: US$${BUDGET} · productos: ${products.length}`, ''];
  let generated = 0;

  for (const p of products) {
    const spentSoFar = (await imageSpendTodayUsd().catch(() => 0)) - startSpend;
    if (spentSoFar >= BUDGET) { report.push(`\n> ⛔ Tope de US$${BUDGET} alcanzado (gastado ${spentSoFar.toFixed(3)}). Corte.`); break; }

    const refImgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
    if (!refImgs.length) { report.push(`\n## ${p.name} (#${p.id})\n- ⚠️ sin fotos, salteado`); continue; }

    console.log(`[eval] ${p.name} (#${p.id})...`);
    const photoDescriptions = await describeProductPhotos(refImgs.slice(0, 8)).catch(() => []);
    const heroShot = await planHeroShot({
      productName: p.name, productDescription: p.description, brief: `Historia de producto: ${p.name}`,
      pillar: 'producto', objective: 'venta', photoDescriptions, photoCount: refImgs.length, format: FORMAT,
    }).catch(() => null);

    const heroUrl = heroShot ? (refImgs[heroShot.photoIndex] || refImgs[0]) : refImgs[0];
    const scene = await generateProductScene({
      productImageUrl: heroUrl, productImageUrls: refImgs.filter((u) => u !== heroUrl).slice(0, 3),
      productName: p.name, theme: `${p.name}${p.category ? ` (${p.category})` : ''}`,
      brief: `Historia de producto: ${p.name}`, format: FORMAT, seed: Number(p.id), shotSpec: heroShot,
    }).catch((e) => { console.warn('  scene err', e.message); return null; });

    const bgImageUrl = scene ? `data:${scene.mimeType};base64,${scene.buffer.toString('base64')}` : null;
    const opts = {
      format: FORMAT, template: 'fullbleed', logos,
      overlayTitle: p.name,
      price: p.price, promoPrice: p.promo_price,
      storyPoints: synthStoryPoints(p),
      ctaLabel: 'Ver en nuestra web',
      layoutSeed: Number(p.id),
      ...(bgImageUrl ? { bgImageUrl } : { productImageUrl: heroUrl, coverImage: true }),
    };
    const file = path.join(OUT, `${FORMAT}-${p.id}.jpg`);
    const buffer = await renderLocal(buildHtml(opts), FORMAT, file);
    generated += 1;

    const qa = await reviewRenderedPiece({ buffer, overlayText: p.name }).catch(() => ({ ok: null, issues: [] }));
    report.push(`\n## ${p.name} (#${p.id})`);
    report.push(`- foto IA: ${scene ? 'sí ($' + (scene.costUsd || 0).toFixed(3) + ')' : 'NO (cayó a foto real)'} · toma: ${heroShot ? heroShot.shotType : '-'}`);
    report.push(`- QA visual: ${qa.ok === false ? '❌ ' + (qa.issues || []).join(' · ') : (qa.ok === null ? '(no disponible)' : '✅ ok')}`);
    report.push(`- archivo: ${path.basename(file)}`);
  }

  const totalSpent = (await imageSpendTodayUsd().catch(() => 0)) - startSpend;
  report.push(`\n---\nGeneradas ${generated} piezas · gasto de esta corrida ≈ US$${totalSpent.toFixed(3)}`);
  fs.writeFileSync(path.join(OUT, 'eval-report.md'), report.join('\n'));
  console.log(`\n[eval] listo. Reporte: ${path.join(OUT, 'eval-report.md')} · gasto ≈ US$${totalSpent.toFixed(3)}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
