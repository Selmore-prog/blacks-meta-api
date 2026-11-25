const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { renderizar, abrirLink, firmar, empaquetar, conUtm, precios, PLANTILLAS } = require('../src/email/plantilla');
const { leerCsv, mailLimpio } = require('../src/email/base');
const proveedor = require('../src/email/proveedor');
const campanas = require('../src/email/campanas');
const { sanear, sinRespaldo, prolijo, limpiarOpcion, envioSinCondicion } = require('../src/email/componer');

const JEAN = { id: 1, name: 'Jean <Clásico> "Recto"', price: '44599', promo_price: '39999', stock: 10, image_url: 'https://x.com/j.jpg', permalink: 'jean-clasico' };
const REMERA = { id: 2, name: 'Remera', price: '22999', promo_price: null, stock: 0, image_url: 'https://x.com/r.jpg', permalink: 'remera' };
const productos = new Map([[1, JEAN], [2, REMERA]]);
const mail = (bloques, extra = {}) => ({ asunto: 'Hola', preheader: 'Algo', tema: 'claro', utm: 'mail_7_x', descuento_transferencia: 10, bloques, ...extra });
const OPC = { productos, base: 'https://motor.test', secreto: 'abc' };

test('precio: oferta, tachado y transferencia', () => {
  assert.deepStrictEqual(precios(JEAN, 10), { final: 39999, tachado: 44599, off: 10, transferencia: 35999 });
  assert.deepStrictEqual(precios(REMERA, 0), { final: 22999, tachado: 0, off: 0, transferencia: 0 });
});

test('el nombre del producto y los textos se escapan', () => {
  const { html } = renderizar(mail([{ tipo: 'estrella', id: 1 }, { tipo: 'titulo', titulo: '<script>x</script>' }]), OPC);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Jean &lt;Clásico&gt; &quot;Recto&quot;'));
});

test('en vista los links van directo y con UTM; afuera de la tienda sin UTM', () => {
  const { links } = renderizar(mail([{ tipo: 'estrella', id: 1 }, { tipo: 'boton', texto: 'Escribir', url: 'https://wa.me/549115?text=a%20b' }]), OPC);
  assert.ok(links.find((l) => l.url.includes('/productos/jean-clasico') && l.url.includes('utm_campaign=mail_7_x') && l.url.includes('utm_source=email')));
  assert.strictEqual(links[links.length - 1].url, 'https://wa.me/549115?text=a%20b');
  assert.strictEqual(conUtm('https://blacksindumentaria.com.ar.estafa.com/', 'x'), 'https://blacksindumentaria.com.ar.estafa.com/');
});

test('en envío cada link pasa por el motor, con destino firmado, y va la imagen de apertura y la baja', () => {
  const { html, links } = renderizar(mail([{ tipo: 'productos', ids: [1], columnas: 2 }]), { ...OPC, modo: 'envio' });
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const seguidos = hrefs.filter((h) => h.includes('/e/c/'));
  assert.strictEqual(seguidos.length, links.length);
  for (const h of seguidos) {
    const u = new URL(h.replace('%%TOKEN%%', 'tok'));
    const i = Number(u.pathname.split('/').pop());
    assert.strictEqual(abrirLink(u.searchParams.get('u'), u.searchParams.get('s'), 'abc'), links[i].url);
  }
  assert.ok(html.includes('https://motor.test/e/o/%%TOKEN%%.gif'));
  assert.ok(html.includes('https://motor.test/e/b/%%TOKEN%%'));
});

test('un destino cambiado, sin firma o que no es link no redirige', () => {
  const bueno = empaquetar('https://blacksindumentaria.com.ar/');
  assert.strictEqual(abrirLink(empaquetar('https://malo.com'), firmar('https://blacksindumentaria.com.ar/', 'abc'), 'abc'), null);
  assert.strictEqual(abrirLink(bueno, '', 'abc'), null);
  assert.strictEqual(abrirLink(bueno, firmar('https://blacksindumentaria.com.ar/', 'otra'), 'abc'), null);
  assert.strictEqual(abrirLink(empaquetar('javascript:alert(1)'), firmar('javascript:alert(1)', 'abc'), 'abc'), null);
});

test('avisa lo que falta: producto inexistente, sin stock, botón sin link, foto vacía', () => {
  const { avisos } = renderizar(mail([{ tipo: 'productos', ids: [99, 2] }, { tipo: 'boton', texto: 'Ir', url: '' }, { tipo: 'imagen', src: '' }]), OPC);
  assert.ok(avisos.some((a) => a.includes('ya no está publicado')));
  assert.ok(avisos.some((a) => a.includes('sin stock')));
  assert.ok(avisos.some((a) => a.includes('falta el link')));
  assert.ok(avisos.some((a) => a.includes('falta la foto')));
});

test('el mapa de calor dibuja los clics de cada link y el envío no lo lleva', () => {
  const c = mail([{ tipo: 'boton', texto: 'Ver', url: 'https://blacksindumentaria.com.ar/' }]);
  const calor = renderizar(c, { ...OPC, modo: 'calor', conteos: { 1: 3, 0: 1 } }).html;
  assert.ok(calor.includes('3 clics · 75%'));
  assert.ok(!renderizar(c, { ...OPC, modo: 'envio' }).html.includes('clics ·'));
});

test('{nombre}: con y sin nombre, en el texto y en el asunto', () => {
  const { html } = renderizar(mail([{ tipo: 'texto', texto: 'Hola {nombre}, mirá' }]), OPC);
  assert.ok(campanas.personalizar(html, 't', 'MARÍA laura').includes('Hola María, mirá'));
  assert.ok(campanas.personalizar(html, 't', '').includes('Hola, mirá'));
  assert.ok(campanas.personalizar(html, 't', '<b>x').includes('Hola, mirá'));
  assert.strictEqual(campanas.asuntoPara('{nombre}, volvió el jean', 'ana'), 'Ana, volvió el jean');
  assert.strictEqual(campanas.asuntoPara('Hola {nombre}', '3x'), 'Hola');
  assert.strictEqual(campanas.asuntoPara('{nombre}, último día', ''), 'Último día');
  const inicio = renderizar(mail([{ tipo: 'texto', texto: '{nombre}, mirá esto' }]), OPC).html;
  assert.ok(campanas.personalizar(inicio, 't', '').includes('>Mirá esto<'));
  assert.ok(campanas.personalizar(inicio, 't', 'ana').includes('>Ana, mirá esto<'));
});

test('los links del texto: sólo http, mailto o tel', () => {
  const { html } = renderizar(mail([{ tipo: 'texto', texto: '[ok](https://a.com/x?a=1&b=2) [mal](javascript:alert(1)) **fuerte**' }]), OPC);
  assert.ok(html.includes('href="https://a.com/x?a=1&amp;b=2"'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('<strong>fuerte</strong>'));
});

test('las plantillas se dibujan y pesan menos de lo que Gmail corta', () => {
  for (const p of PLANTILLAS) {
    const bloques = p.bloques.map((b) => (b.tipo === 'productos' ? { ...b, ids: [1, 1, 1, 1] } : b.tipo === 'estrella' ? { ...b, id: 1 } : b));
    const { html, texto } = renderizar(mail(bloques, { tema: p.tema }), { ...OPC, modo: 'envio' });
    assert.ok(Buffer.byteLength(html) < 95 * 1024, p.clave);
    assert.ok(texto.includes('No quiero recibir más mails'), p.clave);
    assert.ok(!html.includes('undefined') && !html.includes('NaN'), p.clave);
  }
});

test('limpiar bloques: descarta tipos raros, links y fotos inseguras', () => {
  const r = campanas.limpiarBloques([{ tipo: 'malo' }, { tipo: 'boton', texto: 'x', url: 'javascript:1' }, { tipo: 'imagen', src: 'http://x/y.jpg' }, { tipo: 'productos', ids: ['1', 'x', 1, -2], columnas: 9 }]);
  assert.deepStrictEqual(r, [{ tipo: 'boton', texto: 'x', url: '' }, { tipo: 'imagen', src: '' }, { tipo: 'productos', ids: [1], columnas: 2 }]);
});

test('CSV: coma, punto y coma, comillas, BOM y sin cabecera', () => {
  assert.deepStrictEqual(leerCsv('﻿Email;Nombre\na@b.com;"Pérez; Ana"\n\nc@d.com;Luis\n').map((x) => [x.email, x.nombre]), [['a@b.com', 'Pérez; Ana'], ['c@d.com', 'Luis']]);
  assert.deepStrictEqual(leerCsv('Nombre,E-mail,Ciudad\r\nAna,a@b.com,CABA').map((x) => [x.email, x.nombre]), [['a@b.com', 'Ana']]);
  assert.deepStrictEqual(leerCsv('a@b.com\nc@d.com').map((x) => x.email), ['a@b.com', 'c@d.com']);
  assert.deepStrictEqual(leerCsv('hola\nchau'), []);
});

test('mails: normaliza y descarta los rotos', () => {
  assert.strictEqual(mailLimpio('  Ana.Perez@Gmail.com. '), 'ana.perez@gmail.com');
  for (const malo of ['', 'ana', 'a@b', 'a b@c.com', 'a@b.com\r\nBcc: x@y.com', 'a@@b.com']) assert.strictEqual(mailLimpio(malo), null, malo);
});

test('remitente: sin inyección de cabeceras', () => {
  assert.strictEqual(proveedor.de('BLACKS"\r\nBcc: x', 'v@b.com'), '"BLACKSBcc: x" <v@b.com>');
});

test('webhook de Resend: firma correcta, cambiada y vieja', () => {
  const clave = crypto.randomBytes(24);
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${clave.toString('base64')}`;
  const cuerpo = '{"type":"email.bounced"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = (c, t) => `v1,${crypto.createHmac('sha256', clave).update(`id1.${t}.${c}`).digest('base64')}`;
  const h = (s, t = ts) => ({ 'svix-id': 'id1', 'svix-timestamp': t, 'svix-signature': s });
  assert.strictEqual(proveedor.firmaResendValida(h(sig(cuerpo, ts)), cuerpo), true);
  assert.strictEqual(proveedor.firmaResendValida(h(sig(cuerpo, ts)), `${cuerpo} `), false);
  const viejo = String(Number(ts) - 3600);
  assert.strictEqual(proveedor.firmaResendValida(h(sig(cuerpo, viejo), viejo), cuerpo), false);
  delete process.env.RESEND_WEBHOOK_SECRET;
  assert.strictEqual(proveedor.firmaResendValida(h(sig(cuerpo, ts)), cuerpo), false);
});

test('rebotes: sólo el permanente da de baja el contacto', () => {
  assert.strictEqual(proveedor.leerResend({ type: 'email.bounced', data: { email_id: '1', bounce: { type: 'Permanent' } } }).tipo, 'rebote');
  assert.strictEqual(proveedor.leerResend({ type: 'email.bounced', data: { email_id: '1', bounce: { type: 'Transient' } } }).tipo, 'rebote_temporal');
  assert.strictEqual(proveedor.leerResend({ type: 'email.opened', data: { email_id: '1' } }), null);
  assert.strictEqual(proveedor.leerSes({ notificationType: 'Complaint', mail: { messageId: 'a' } }).tipo, 'queja');
});

test('sin servicio de envío no hay proveedor', () => {
  for (const k of ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_SES_KEY', 'EMAIL_SES_SECRET']) delete process.env[k];
  assert.strictEqual(proveedor.cual(), null);
});

/* ------------------------- El mail que arma la IA ------------------------- */

const REGLAS = { ids: new Set([1, 2]), urls: ['https://blacksindumentaria.com.ar/', 'https://blacksindumentaria.com.ar/eshop'], fotos: ['https://cdn.com/a.jpg'], para: 'minorista', sitio: 'https://blacksindumentaria.com.ar' };

test('IA: descarta productos, links y fotos que no existen', () => {
  const r = sanear({ asunto: 'hola', tema: 'raro', bloques: [
    { tipo: 'titulo', titulo: 'GUÍA DE COMPRA!!' }, { tipo: 'estrella', id: 99 }, { tipo: 'productos', ids: [1, 77, 1] },
    { tipo: 'boton', texto: 'Ver todo.', url: 'https://malo.com/' }, { tipo: 'boton', texto: 'Otro', url: 'https://blacksindumentaria.com.ar/eshop' },
    { tipo: 'imagen', src: 'https://malo.com/x.jpg' }, { tipo: 'separador' }, { tipo: 'beneficios', items: ['a'] }, { tipo: 'iframe' },
  ] }, REGLAS);
  assert.deepStrictEqual(r.bloques.map((b) => b.tipo), ['titulo', 'productos', 'boton', 'beneficios']);
  assert.strictEqual(r.bloques[0].titulo, 'Guía de compra');
  assert.deepStrictEqual(r.bloques[1].ids, [1]);
  assert.deepStrictEqual([r.bloques[2].texto, r.bloques[2].url], ['Ver todo', 'https://blacksindumentaria.com.ar/']);
  assert.strictEqual(r.tema, 'claro');
});

test('IA: un mail sin ningún botón recibe uno; a empresas no se les muestran precios', () => {
  assert.strictEqual(sanear({ bloques: [{ tipo: 'texto', texto: 'Hola' }] }, REGLAS).bloques.pop().tipo, 'boton');
  const e = sanear({ bloques: [{ tipo: 'productos', ids: [1], boton: 'Comprar' }] }, { ...REGLAS, para: 'mayorista' }).bloques[0];
  assert.deepStrictEqual([e.sinPrecio, e.boton], [true, 'Pedir presupuesto']);
});

test('IA: marca precios, porcentajes, cantidades y fechas que nadie le dio', () => {
  const idea = 'El jean a $39.999 hasta el 30 de noviembre, 10% por transferencia';
  assert.deepStrictEqual(sinRespaldo(['Jean a $39.999, 10% menos, hasta el 30 de noviembre'], idea), []);
  assert.deepStrictEqual(sinRespaldo(['Todo a $19.999', '25% OFF', 'hasta el 9 de diciembre', '48 horas'], `${idea} tel 54 9 11`, idea), ['$19.999', '25%', '9 de diciembre', '48 horas']);
});

test('IA: prolijo saca emojis, años, gritos y signos', () => {
  assert.strictEqual(prolijo('black friday 2024 llegó!! 🔥 aprovechá', 80), 'Black Friday llegó. Aprovechá');
  assert.strictEqual(prolijo('¿sabés? envio en 2 dias, remera pampero', 80), '¿Sabés? Envío en 2 días, remera Pampero');
});

test('bloques nuevos: se dibujan, llevan sus links y las fichas en mayúsculas se leen normal', () => {
  const p = new Map([[1, { ...JEAN, name: 'CHOMBA PAMPERO DE PIQUE', price: '0', promo_price: null }]]);
  const { html, links, avisos } = renderizar(mail([
    { tipo: 'foto_texto', id: 1, titulo: 'Título', texto: 'Dato', boton: 'Ver', lado: 'derecha' },
    { tipo: 'banda', titulo: 'Fuerte', boton: 'Ir', url: 'https://blacksindumentaria.com.ar/', color: 'acento' },
    { tipo: 'lista', items: ['uno **dos**'] }, { tipo: 'pasos', items: ['a', 'b'] },
    { tipo: 'productos', ids: [1], columnas: 1, sinPrecio: true, boton: 'Consultar' },
  ]), { ...OPC, productos: p });
  assert.deepStrictEqual(avisos, []);
  assert.ok(html.includes('Chomba Pampero de Pique') && html.includes('<strong>dos</strong>') && !html.includes('undefined'));
  assert.ok(!/\$0/.test(html), 'sin precio');
  assert.deepStrictEqual(links.map((l) => l.etiqueta), ['Logo', 'Título', 'Ver', 'Ir', 'CHOMBA PAMPERO DE PIQUE', 'Consultar']);
});

test('lapicito: con emoji queda uno solo en su punta; sin emoji, ninguno', () => {
  const con = { campo: 'asunto', emojis: true };
  assert.strictEqual(limpiarOpcion('🔥🔥 black friday: el jean a $39.999!!', con), '🔥 Black Friday: el jean a $39.999');
  assert.strictEqual(limpiarOpcion('Volvió el jean 👖', con), 'Volvió el jean 👖');
  assert.strictEqual(limpiarOpcion('❤️ Para tu equipo.', con), '❤️ Para tu equipo');
  assert.strictEqual(limpiarOpcion('🔥 Volvió el jean 👖', { campo: 'asunto', emojis: false }), 'Volvió el jean');
  assert.strictEqual(limpiarOpcion('"Hay todos los talles."', { campo: 'preheader', emojis: false }), 'Hay todos los talles.');
});

test('envío gratis: nunca sin su condición', () => {
  for (const mal of ['Jean clásico $39.999 con envío gratis', 'Envíos gratis a todo el país', 'El envío es gratis', 'Envío gratis en jeans desde el 27']) assert.ok(envioSinCondicion(mal), mal);
  for (const bien of ['Llevando 2 jeans, el envío es gratis', 'Envío gratis desde $45.000', 'Comprando dos, el envío va gratis', 'Enviamos a todo el país']) assert.ok(!envioSinCondicion(bien), bien);
});

test('modo oscuro: el logo va en una imagen sin transparencia y el botón lleva borde', () => {
  const archivo = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'email-assets', 'logo-banda.png'));
  assert.ok([0, 2, 3].includes(archivo[25]), 'el PNG no puede tener canal alfa');
  assert.ok(!archivo.includes('tRNS'), 'ni transparencia por color');
  for (const tema of ['claro', 'negro']) {
    const { html } = renderizar(mail([{ tipo: 'boton', texto: 'Comprar', url: 'https://blacksindumentaria.com.ar/' }], { tema }), OPC);
    assert.ok(html.includes('/e/logo-banda.png'));
    assert.ok(!/logo-(claro|oscuro)/.test(html));
    assert.match(html, /border:1px solid #[0-9a-f]{6};border-radius:6px/);
  }
});
