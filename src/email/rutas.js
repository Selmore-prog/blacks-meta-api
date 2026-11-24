/* =========================================================================
 * EMAIL MARKETING — rutas
 *
 *  /e/…                    PÚBLICAS: las toca quien recibe el mail (apertura,
 *                          clic, baja, logo). No devuelven datos de nadie.
 *  /api/email/webhook/…    PÚBLICAS con firma: las llama el servicio de envío.
 *  /api/email/…            sólo el dueño (el portal del equipo no entra: no está
 *                          en ninguna sección de src/teamPortal.js).
 * ========================================================================= */

const path = require('path');
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const pool = require('../db');
const base = require('./base');
const campanas = require('./campanas');
const proveedor = require('./proveedor');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n < 1) { const e = new Error('id inválido'); e.status = 400; throw e; }
  return n;
};
const ROBOT = /bot|crawl|spider|preview|scanner|proofpoint|mimecast|barracuda|safelinks|headless|python-requests|curl|wget/i;

/* ------------------------------- Públicas ------------------------------- */

const publicas = express.Router();

publicas.get('/e/logo-:cual.png', (req, res) => {
  const c = req.params.cual === 'claro' ? 'claro' : 'oscuro';
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'email-assets', `logo-${c}.png`), { maxAge: '30d' });
});

publicas.get('/e/o/:token.gif', (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, private, max-age=0' }).send(campanas.GIF);
  if (req.method === 'GET') campanas.abrio(req.params.token).catch((e) => console.error('[email] apertura:', e.message));
});

// Primero redirige y después anota: quien tocó no espera a la base.
publicas.get('/e/c/:token/:i', (req, res) => {
  const destino = campanas.destino(req.query.u, req.query.s) || config.storeUrl;
  res.set('Cache-Control', 'no-store').redirect(302, destino);
  if (req.method === 'GET') campanas.toco(req.params.token, req.params.i, ROBOT.test(req.get('user-agent') || '')).catch((e) => console.error('[email] clic:', e.message));
});

const paginaBaja = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo}</title><style>body{margin:0;background:#f3f2ef;color:#17181c;font:17px/1.55 -apple-system,system-ui,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh}main{background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;margin:20px;text-align:center}h1{font-size:24px;line-height:1.2;margin:0 0 10px}p{margin:0 0 20px;color:#62646b}button{font:inherit;font-weight:700;background:#17181c;color:#fff;border:0;border-radius:8px;padding:14px 26px;cursor:pointer}</style></head><body><main><h1>${titulo}</h1>${cuerpo}</main></body></html>`;

publicas.get('/e/b/:token', (req, res) => {
  res.set('Cache-Control', 'no-store').send(paginaBaja('¿Dejamos de escribirte?', '<p>No vas a recibir más mails de BLACKS con novedades y ofertas.</p><form method="post"><button>Sí, darme de baja</button></form>'));
});
// También la usa el botón "Cancelar suscripción" de Gmail (List-Unsubscribe-Post).
publicas.post('/e/b/:token', wrap(async (req, res) => {
  await base.ensureSchema();
  await campanas.darDeBaja(req.params.token);
  res.set('Cache-Control', 'no-store').send(paginaBaja('Listo', '<p>No te vamos a escribir más.</p>'));
}));

publicas.post('/api/email/webhook/resend', express.text({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
  const cuerpo = req.rawBody ? req.rawBody.toString('utf8') : String(req.body || '');
  if (!proveedor.firmaResendValida(req.headers, cuerpo)) return res.status(401).json({ error: 'firma inválida' });
  await campanas.avisoDelProveedor(proveedor.leerResend(JSON.parse(cuerpo)));
  res.json({ ok: true });
}));

publicas.post('/api/email/webhook/ses', express.text({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
  const clave = String(process.env.EMAIL_WEBHOOK_KEY || '');
  const dada = String(req.query.k || '');
  if (clave.length < 16 || dada.length !== clave.length || !crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(clave))) return res.status(401).json({ error: 'clave inválida' });
  const d = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (d.Type === 'SubscriptionConfirmation') {
    const u = new URL(d.SubscribeURL);
    if (u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) await fetch(u);
    return res.json({ ok: true });
  }
  await campanas.avisoDelProveedor(proveedor.leerSes(typeof d.Message === 'string' ? JSON.parse(d.Message) : d));
  res.json({ ok: true });
}));

/* ------------------------------- Privadas ------------------------------- */

const privadas = express.Router();

privadas.use('/api/email', (req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) return next();
  const origen = req.get('origin');
  if (origen) {
    let ok = false;
    try { ok = new URL(origen).host === req.get('host'); } catch (_) { /* origen roto */ }
    if (!ok) return res.status(403).json({ error: 'Origen no permitido.' });
  }
  return next();
});

privadas.get('/api/email/inicio', wrap(async (req, res) => {
  const [l, c, a] = await Promise.all([base.listas(), campanas.lista(), base.getAjustes()]);
  res.json({
    ...l, campanias: c, ajustes: a, proveedor: proveedor.cual(),
    plantillas: campanas.PLANTILLAS.map(({ clave, nombre, para, tema, detalle }) => ({ clave, nombre, para, tema, detalle })),
    seguimiento: { base: campanas.urlBase(), propio: /blacksindumentaria\.com\.ar/i.test(campanas.urlBase()) },
    webhook: Boolean(process.env.RESEND_WEBHOOK_SECRET || process.env.EMAIL_WEBHOOK_KEY),
  });
}));

privadas.post('/api/email/ajustes', wrap(async (req, res) => { res.json(await base.setAjustes(req.body || {})); }));

privadas.post('/api/email/listas/importar', express.text({ type: 'text/csv', limit: '20mb' }), wrap(async (req, res) => {
  res.json(await base.importar({ lista: req.query.lista, tipo: req.query.tipo, bajas: req.query.bajas === '1', csv: req.body }));
}));
privadas.post('/api/email/listas/tienda', wrap(async (req, res) => { res.json(await base.sincronizarTienda()); }));
privadas.delete('/api/email/listas/:id', wrap(async (req, res) => { await base.borrarLista(id(req)); res.json({ ok: true }); }));

privadas.post('/api/email/campanias', wrap(async (req, res) => { res.json(await campanas.crear(req.body || {})); }));
privadas.get('/api/email/campanias/:id', wrap(async (req, res) => {
  const c = await campanas.una(id(req));
  const { html, texto, ...resto } = c;
  const p = await campanas.productosDeCache(c.bloques, c.precios);
  res.json({ ...resto, productos: [...p.values()], personas: await campanas.cuantos(c) });
}));
privadas.put('/api/email/campanias/:id', wrap(async (req, res) => {
  const c = await campanas.guardar(id(req), req.body || {});
  res.json({ ok: true, personas: await campanas.cuantos(c), actualizado: c.actualizado });
}));
privadas.delete('/api/email/campanias/:id', wrap(async (req, res) => { await campanas.borrar(id(req)); res.json({ ok: true }); }));
privadas.post('/api/email/campanias/:id/duplicar', wrap(async (req, res) => { res.json(await campanas.duplicar(id(req))); }));
privadas.post('/api/email/campanias/:id/vista', wrap(async (req, res) => { res.json(await campanas.vista(id(req), req.body || null)); }));
privadas.post('/api/email/campanias/:id/prueba', wrap(async (req, res) => { res.json(await campanas.prueba(id(req), (req.body || {}).para)); }));
privadas.post('/api/email/campanias/:id/enviar', wrap(async (req, res) => { res.json(await campanas.programar(id(req), req.body || {})); }));
privadas.post('/api/email/campanias/:id/pausar', wrap(async (req, res) => { await campanas.pausar(id(req)); res.json({ ok: true }); }));
privadas.post('/api/email/campanias/:id/seguir', wrap(async (req, res) => { await campanas.seguir(id(req)); res.json({ ok: true }); }));
privadas.post('/api/email/campanias/:id/cancelar', wrap(async (req, res) => { await campanas.cancelar(id(req)); res.json({ ok: true }); }));
privadas.get('/api/email/campanias/:id/archivo', wrap(async (req, res) => {
  const a = await campanas.archivo(id(req));
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${a.nombre}"` }).send(a.html);
}));
privadas.get('/api/email/campanias/:id/reporte', wrap(async (req, res) => { res.json(await campanas.reporte(id(req))); }));
privadas.get('/api/email/campanias/:id/mapa', wrap(async (req, res) => { res.json({ html: await campanas.mapa(id(req)) }); }));
privadas.get('/api/email/campanias/:id/actividad', wrap(async (req, res) => { res.json(await campanas.actividad(id(req), req.query)); }));
privadas.post('/api/email/redactar', wrap(async (req, res) => {
  const { idea, para, ids } = req.body || {};
  if (!String(idea || '').trim()) return res.status(400).json({ error: 'Contá en una frase de qué es el mail.' });
  const lista = (Array.isArray(ids) ? ids : []).map(Number).filter((x) => x > 0).slice(0, 8);
  const { rows } = lista.length ? await pool.query('SELECT name, price, promo_price FROM products_cache WHERE id = ANY($1::bigint[])', [lista]) : { rows: [] };
  res.json(await campanas.redactar({ idea, para, productos: rows }));
}));

// Cada minuto mientras el motor esté despierto; el cron horario es la red de seguridad.
function arrancar() {
  const t = setInterval(() => { campanas.procesar().catch((e) => console.error('[email] cola:', e.message)); }, 60000);
  if (t.unref) t.unref();
}

module.exports = { publicas, privadas, arrancar };
