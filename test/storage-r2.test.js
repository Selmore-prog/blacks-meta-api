const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

/* Un R2 de mentira: guarda en memoria y, como el de verdad, rechaza con 403 la
   firma que no cierra. La verificación está escrita acá, aparte de aws4fetch,
   para que un error de uso de la librería no pase la prueba por casualidad. */
const CLAVE = { id: 'clave-de-prueba', secreta: 'secreta-de-prueba' };
const objetos = new Map();
const pedidos = [];

const sha256 = (x) => crypto.createHash('sha256').update(x).digest('hex');
const hmac = (k, x) => crypto.createHmac('sha256', k).update(x).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function firmaValida(req, cuerpo) {
  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/);
  if (!m) return 'sin firma';
  const [, id, dia, region, firmadas, firma] = m;
  if (id !== CLAVE.id) return 'clave desconocida';
  if (region !== 'auto') return `región ${region}`;
  const hashCuerpo = req.headers['x-amz-content-sha256'];
  if (!hashCuerpo) return 'sin x-amz-content-sha256';
  if (hashCuerpo !== 'UNSIGNED-PAYLOAD' && hashCuerpo !== sha256(cuerpo)) return 'cuerpo alterado';
  const [ruta, query = ''] = req.url.split('?');
  const rutaCanonica = ruta.split('/').map((t) => rfc3986(decodeURIComponent(t))).join('/');
  const queryCanonica = query.split('&').filter(Boolean).sort().join('&');
  const nombres = firmadas.split(';');
  const cabeceras = nombres.map((n) => `${n}:${String(req.headers[n] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const pedido = [req.method, rutaCanonica, queryCanonica, cabeceras, firmadas, hashCuerpo].join('\n');
  const fecha = req.headers['x-amz-date'];
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', fecha, alcance, sha256(pedido)].join('\n');
  const k = ['aws4_request'].reduce((acc, x) => hmac(acc, x), hmac(hmac(hmac(`AWS4${CLAVE.secreta}`, dia), region), 's3'));
  return hmac(k, aFirmar).toString('hex') === firma ? null : 'SignatureDoesNotMatch';
}

const servidor = http.createServer((req, res) => {
  const partes = [];
  req.on('data', (c) => partes.push(c));
  req.on('end', () => {
    const cuerpo = Buffer.concat(partes);
    const problema = firmaValida(req, cuerpo);
    pedidos.push({ metodo: req.method, url: req.url, problema });
    if (problema) {
      res.writeHead(403, { 'Content-Type': 'application/xml' });
      return res.end(`<?xml version="1.0"?><Error><Code>${problema === 'SignatureDoesNotMatch' ? problema : 'AccessDenied'}</Code></Error>`);
    }
    const clave = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'PUT') {
      objetos.set(clave, { cuerpo, tipo: req.headers['content-type'], cache: req.headers['cache-control'] });
      res.writeHead(200, { ETag: `"${sha256(cuerpo).slice(0, 32)}"` });
      return res.end();
    }
    if (req.method === 'HEAD' || req.method === 'GET') {
      const o = objetos.get(clave);
      res.writeHead(o ? 200 : 404, o ? { 'Content-Type': o.tipo, 'Content-Length': o.cuerpo.length } : {});
      return res.end(req.method === 'GET' && o ? o.cuerpo : undefined);
    }
    res.writeHead(405);
    res.end();
  });
});

let storage;
before(async () => {
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'cuenta123',
    R2_ACCESS_KEY_ID: ` ${CLAVE.id}\n`, // pegada con espacios: se limpia
    R2_SECRET_ACCESS_KEY: CLAVE.secreta,
    R2_BUCKET: 'blacks-assets',
    R2_PUBLIC_URL: 'pub-abc123.r2.dev/', // sin https y con barra: se arregla
    R2_ENDPOINT: `http://127.0.0.1:${servidor.address().port}`,
  });
  storage = require('../src/storage');
});
after(() => servidor.close());

test('con las cinco variables, sube a R2 con firma válida y devuelve la dirección pública', async () => {
  assert.equal(storage.storageTarget(), 'r2');
  const buffer = Buffer.from('jpeg de mentira');
  const url = await storage.uploadAsset({ buffer, filename: 'feed-1792500000000-42.jpg', contentType: 'image/jpeg' });
  assert.equal(url, 'https://pub-abc123.r2.dev/feed-1792500000000-42.jpg');
  const o = objetos.get('/blacks-assets/feed-1792500000000-42.jpg');
  assert.ok(o, 'el archivo llegó al bucket');
  assert.deepEqual(o.cuerpo, buffer);
  assert.equal(o.tipo, 'image/jpeg');
  assert.equal(o.cache, 'public, max-age=31536000');
  assert.equal(pedidos.at(-1).problema, null);
});

test('las carpetas y los nombres raros se firman y se publican bien', async () => {
  const url = await storage.uploadAsset({ buffer: Buffer.from('mp4'), filename: "reels/edición (1) l'última!.mp4", contentType: 'video/mp4' });
  assert.equal(url, 'https://pub-abc123.r2.dev/reels/edici%C3%B3n%20%281%29%20l%27%C3%BAltima%21.mp4');
  assert.ok(objetos.has("/blacks-assets/reels/edición (1) l'última!.mp4"));
  assert.equal(objetos.get("/blacks-assets/reels/edición (1) l'última!.mp4").tipo, 'video/mp4');
  assert.equal(pedidos.at(-1).problema, null);
});

test('consulta si un archivo ya está, sin bajarlo', async () => {
  assert.equal(await storage.r2ObjectExists('feed-1792500000000-42.jpg'), true);
  assert.equal(await storage.r2ObjectExists('no-existe.jpg'), false);
  assert.equal(pedidos.at(-1).metodo, 'HEAD');
});

test('si R2 rechaza, el error dice el código y no devuelve una dirección', async () => {
  const antes = CLAVE.secreta;
  CLAVE.secreta = 'otra'; // el servidor espera otra clave secreta: firma inválida
  try {
    await assert.rejects(
      storage.uploadAsset({ buffer: Buffer.from('x'), filename: 'feed-mal.jpg', contentType: 'image/jpeg' }),
      /R2 respondió 403 \(SignatureDoesNotMatch\)/,
    );
  } finally {
    CLAVE.secreta = antes;
  }
});

test('la mudanza cambia sólo las direcciones cuyo archivo ya está en R2', () => {
  const { reescribirTexto, reescribirValor, cacheDe } = require('../scripts/mudar-a-r2');
  const S = 'https://znfhimoajvrsrgdaoxbn.supabase.co/storage/v1/object/public/blacks-assets/';
  const enR2 = new Set(['feed-1.jpg', 'reels/reel 2.mp4']);

  const t = reescribirTexto(`${S}feed-1.jpg`, enR2);
  assert.equal(t.valor, 'https://pub-abc123.r2.dev/feed-1.jpg');
  assert.equal(t.cambiadas, 1);

  const sinCopiar = reescribirTexto(`${S}feed-9.jpg`, enR2);
  assert.equal(sinCopiar.valor, `${S}feed-9.jpg`);
  assert.deepEqual(sinCopiar.quedan, ['feed-9.jpg']);

  // Otro bucket, u otra cosa que no es Storage: no se toca.
  assert.equal(reescribirTexto('https://x.supabase.co/storage/v1/object/public/otro/feed-1.jpg', enR2).cambiadas, 0);

  const j = reescribirValor({
    single: true,
    sceneUrl: `${S}reels/reel%202.mp4`,
    recipe: { price: '62999', slides: [`${S}feed-1.jpg`, `${S}feed-9.jpg`] },
  }, enR2);
  assert.deepEqual(j.valor, {
    single: true,
    sceneUrl: 'https://pub-abc123.r2.dev/reels/reel%202.mp4',
    recipe: { price: '62999', slides: ['https://pub-abc123.r2.dev/feed-1.jpg', `${S}feed-9.jpg`] },
  });
  assert.equal(j.cambiadas, 2);

  assert.equal(cacheDe('max-age=3600'), 'public, max-age=3600');
  assert.equal(cacheDe(null), 'public, max-age=31536000');
});
