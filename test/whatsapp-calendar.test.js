const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
let browser;
after(async () => { if (browser) await browser.close(); });
const root = path.resolve(__dirname, '..');

async function setup(width = 1280) {
  browser ||= await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1000 });
  const section = fs.readFileSync(path.join(root, 'public/dashboard.html'), 'utf8').match(/<section id="view-whatsapp"[\s\S]*?<\/section>/)[0].replace('view hidden', 'view');
  await page.setContent(`<style>${fs.readFileSync(path.join(root, 'public/dashboard.css'), 'utf8')} .shell{margin:0 auto;max-width:1180px}</style><main class="shell">${section}</main>`);
  await page.evaluate(() => {
    window.calls = []; window.failNext = false; window.delayNext = false;
    window.fixturePosts = [
      { id: 1, post_date: '2026-09-28', topic: 'Reingreso: Cargo Ripstop', body: 'Tejido antidesgarro, triple costura y bolsillos funcionales.\nhttps://blacksindumentaria.com.ar/productos/pantalon-cargo-ripstop-pampero-original/', kind: 'texto', audience: 'minorista', status: 'draft', source: 'automatic' },
      { id: 2, post_date: '2026-09-28', topic: 'Prepará tu próxima reposición', body: 'Consultá talles y disponibilidad para tu equipo.', kind: 'texto', audience: 'mayorista', status: 'planned', source: 'custom', scheduled_at: '2026-09-28T18:00:00Z' },
      { id: 3, post_date: '2026-09-29', topic: '¿Qué prenda usás más?', body: 'Contanos qué necesitás para tu jornada.', kind: 'encuesta', poll_options: ['Pantalón cargo', 'Camisa de trabajo'], audience: 'minorista', status: 'published_manual' },
    ];
    window.esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    window.icon = () => ''; window.toast = () => {}; window.confirmModal = async () => true;
    window.whatsappVisual = { open: () => { window.visualOpened = true; } };
    window.showInfoModal = (_title, html) => { const el = document.createElement('div'); el.id = 'test-modal'; el.innerHTML = html; document.body.append(el); return el; };
    window.api = async (url, opts = {}) => {
      window.calls.push({ url, ...opts });
      if (url.includes('/summary')) return { total: 3, next_scheduled_at: '2026-10-08T18:00:00Z' };
      if (url.includes('?from=')) {
        if (window.failNext) { window.failNext = false; throw new Error('Error de conexión'); }
        const query = new URL(url, 'http://test').searchParams;
        const result = window.fixturePosts.filter(p => p.post_date >= query.get('from') && p.post_date <= query.get('to'));
        if (window.delayNext) { window.delayNext = false; await new Promise(resolve => { window.releaseRequest = resolve; }); }
        return structuredClone(result);
      }
      if (opts.method === 'PATCH') {
        const p = window.fixturePosts.find(p => p.id === Number(url.split('/')[3]));
        Object.assign(p, JSON.parse(opts.body)); return p;
      }
      if (opts.method === 'DELETE') { window.fixturePosts = window.fixturePosts.filter(p => p.id !== Number(url.split('/')[3])); return {}; }
      if (url.endsWith('/generate')) return { generated: JSON.parse(opts.body).count };
      throw new Error(`Unexpected API: ${url}`);
    };
  });
  await page.addScriptTag({ path: path.join(root, 'public/whatsapp-channel-panel.js') });
  await page.evaluate(async () => { document.getElementById('wa-start').value = '2026-09-28'; await window.loadWhatsAppChannel(); });
  return page;
}
const idle = page => page.waitForFunction(() => document.getElementById('wa-calendar').getAttribute('aria-busy') === 'false');

test('calendario compacto: selección, mensajes múltiples, acciones, navegación y móvil', async () => {
  const page = await setup();
  assert.equal(await page.$$eval('[data-date]', els => els.length), 35);
  assert.equal(await page.$$eval('.wa-post', els => els.length), 2);
  assert.equal(await page.$eval('[data-date="2026-09-28"]', el => el.getAttribute('aria-pressed')), 'true');
  assert.match(await page.$eval('#wa-summary', el => el.textContent), /3 mensajes este mes/);
  assert.ok(await page.$eval('#wa-calendar', el => el.getBoundingClientRect().height < 510));
  await page.click('[data-date="2026-09-29"]');
  assert.equal(await page.$$eval('.wa-post', els => els.length), 1);
  await page.click('[data-visual="3"]');
  assert.equal(await page.evaluate(() => window.visualOpened), true);
  await page.click('[data-status="3"]'); await idle(page);
  assert.equal(await page.evaluate(() => window.fixturePosts[2].status), 'draft');
  await page.click('[data-edit="3"]');
  await page.$eval('#wa-edit-topic', el => { el.value = 'Encuesta corregida'; });
  await page.click('#wa-edit-save'); await idle(page);
  await page.waitForFunction(() => !document.getElementById('test-modal'));
  assert.equal(await page.$eval('.wa-post h3', el => el.textContent), 'Encuesta corregida');
  await page.click('[data-date="2026-09-30"]');
  assert.equal(await page.$$eval('.wa-empty', els => els.length), 1);
  await page.click('[data-generate="2026-09-30"]'); await idle(page);
  assert.ok(await page.evaluate(() => window.calls.some(c => c.url.endsWith('/generate') && c.body === JSON.stringify({ start: '2026-09-30', count: 1 }))));
  await page.click('[data-wa-view="week"]'); await idle(page);
  assert.equal(await page.$$eval('[data-date]', els => els.length), 7);
  await page.click('#wa-next'); await idle(page);
  assert.equal(await page.$eval('#wa-start', el => el.value), '2026-10-07');
  await page.click('[data-wa-view="month"]'); await idle(page);
  await page.evaluate(async () => { document.getElementById('wa-start').value = '2026-01-31'; await window.loadWhatsAppChannel(); });
  await page.click('#wa-next'); await idle(page);
  assert.equal(await page.$eval('#wa-start', el => el.value), '2026-02-28');
  await page.click('#wa-next-planned'); await idle(page);
  assert.equal(await page.$eval('#wa-start', el => el.value), '2026-10-08');
  await page.evaluate(async () => { document.getElementById('wa-start').value = '2026-09-28'; await window.loadWhatsAppChannel(); });
  if (process.env.WA_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.WA_PREVIEW_DIR, 'calendario-whatsapp.png'), fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.ok(await page.$eval('#wa-calendar', el => el.getBoundingClientRect().height < 370));
  if (process.env.WA_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.WA_PREVIEW_DIR, 'calendario-whatsapp-movil.png'), fullPage: true });
  await page.click('[data-delete="1"]'); await idle(page);
  await page.waitForFunction(() => !document.querySelector('[data-delete="1"]'));
  assert.equal(await page.$$eval('.wa-post', els => els.length), 1);
  await page.close();
});

test('cargas solapadas o fallidas no muestran mensajes de otra fecha', async () => {
  const page = await setup();
  await page.evaluate(() => { window.delayNext = true; document.getElementById('wa-start').value = '2026-10-01'; window.loadWhatsAppChannel(); });
  await page.waitForFunction(() => typeof window.releaseRequest === 'function');
  await page.evaluate(async () => { document.getElementById('wa-start').value = '2026-09-28'; await window.loadWhatsAppChannel(); window.releaseRequest(); });
  await idle(page);
  assert.equal(await page.$$eval('.wa-post', els => els.length), 2);
  assert.match(await page.$eval('#wa-period', el => el.textContent), /septiembre/);
  await page.evaluate(async () => { window.failNext = true; await window.loadWhatsAppChannel(); });
  assert.equal(await page.$$eval('[data-date]', els => els.length), 0);
  assert.match(await page.$eval('#wa-posts', el => el.textContent), /Error de conexión/);
  await page.click('#wa-reload'); await idle(page);
  assert.equal(await page.$$eval('.wa-post', els => els.length), 2);
  await page.close();
});
