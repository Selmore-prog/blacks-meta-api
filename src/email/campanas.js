/* =========================================================================
 * EMAIL MARKETING — campañas: guardar, enviar, seguir y medir
 *
 * CÓMO SALE UNA CAMPAÑA
 *  1. Enviar (o programar) pide confirmar la CANTIDAD de personas: si cambió
 *     desde que se miró la pantalla, no sale.
 *  2. Al empezar se relee cada producto de Tiendanube (precio y stock del momento)
 *     y el HTML queda fijo: lo que se mandó es lo que muestra el reporte.
 *  3. Una fila por persona en email_sends. La cola manda de a poco (por minuto y
 *     por día), primero a los que más se movieron. Se puede pausar.
 *  4. Si el proveedor avisa un problema de la cuenta, la campaña se pausa sola y
 *     el motivo queda escrito. Más de 5% de rebotes también la frena.
 * ========================================================================= */

const crypto = require('crypto');
const config = require('../config');
const pool = require('../db');
const base = require('./base');
const proveedor = require('./proveedor');
const { renderizar, abrirLink, PLANTILLAS, TEMAS, TIPOS } = require('./plantilla');

const error = (status, m) => { const e = new Error(m); e.status = status; return e; };
// Sólo para firmar links y nada más: no expone la clave del panel.
const SECRETO = crypto.createHash('sha256').update(`email-links:${process.env.EMAIL_LINK_SECRET || config.cronSecret || ''}:${config.databaseUrl || ''}`).digest('hex');
const urlBase = () => String(process.env.EMAIL_TRACK_URL || config.publicBaseUrl || '').replace(/\/+$/, '');

/* ------------------------------ Productos ------------------------------ */

/** Productos que usa el mail. conPrecio: sólo los que muestran precio (a esos se les exige stock). */
function idsDe(bloques, conPrecio = false) {
  const ids = new Set();
  for (const b of bloques || []) {
    if (!b || (conPrecio && b.sinPrecio)) continue;
    if (b.tipo === 'estrella' && b.id) ids.add(Number(b.id));
    if (b.tipo === 'productos') for (const x of b.ids || []) ids.add(Number(x));
    if (!conPrecio && ['imagen', 'foto_texto'].includes(b.tipo) && b.id) ids.add(Number(b.id));
  }
  return [...ids].filter((x) => Number.isInteger(x) && x > 0);
}

/* Precios de la oferta flash PROGRAMADA (Black Friday): sólo los que tienen precio
   fijo. Sirven para ver y bajar el mail antes de que la oferta arranque. Al enviar
   desde el motor no se usan: manda el precio real del momento y se compara. */
async function preciosProgramados() {
  try {
    const cfg = JSON.parse((await require('../settings').getSetting('flash_sale')) || '{}');
    const o = (cfg.programada && cfg.programada.config) || (cfg.active ? cfg : null);
    return new Map(((o && o.items) || []).filter((x) => Number(x.precio) > 0).map((x) => [Number(x.id), Number(x.precio)]));
  } catch (_) { return new Map(); }
}

async function conOferta(m, precios) {
  if (precios !== 'oferta') return m;
  const of = await preciosProgramados();
  for (const [id, p] of m) if (of.has(id) && of.get(id) < Number(p.price)) m.set(id, { ...p, promo_price: of.get(id) });
  return m;
}

async function productosDeCache(bloques, precios) {
  const ids = idsDe(bloques);
  if (!ids.length) return new Map();
  const { rows } = await pool.query('SELECT id, name, price, promo_price, stock, image_url, permalink FROM products_cache WHERE id = ANY($1::bigint[]) AND published IS NOT FALSE', [ids]);
  return conOferta(new Map(rows.map((r) => [Number(r.id), { ...r, id: Number(r.id) }])), precios);
}

// Outlook de escritorio no muestra WEBP y muchas fotos de la tienda sólo existen así.
async function enJpg(url) {
  if (!/\.webp(\?|$)/i.test(url || '')) return url;
  try {
    const { spawn } = require('child_process');
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return url;
    const entrada = Buffer.from(await res.arrayBuffer());
    const jpg = await new Promise((ok, mal) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-f', 'webp_pipe', '-i', 'pipe:0', '-vf', 'scale=min(iw\\,900):-2', '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']);
      const partes = [];
      p.stdout.on('data', (x) => partes.push(x));
      p.on('error', mal);
      p.on('close', (c) => (c === 0 && partes.length ? ok(Buffer.concat(partes)) : mal(new Error(`ffmpeg ${c}`))));
      p.stdin.on('error', () => {});
      p.stdin.end(entrada);
    });
    const { uploadAsset } = require('../storage');
    const nombre = `email/${crypto.createHash('sha1').update(url).digest('hex')}.jpg`;
    const r = await uploadAsset({ buffer: jpg, filename: nombre, contentType: 'image/jpeg' });
    return (r && (r.url || r.publicUrl)) || (typeof r === 'string' ? r : url);
  } catch (e) {
    console.warn('[email] no pude pasar la foto a JPG:', e.message);
    return url;
  }
}

/** Precio y stock del momento, leídos de Tiendanube. Si uno no existe más, frena. */
async function productosFrescos(bloques, precios) {
  const { fetchProduct } = require('../tiendanube');
  const m = new Map();
  const exigidos = new Set(idsDe(bloques, true));
  for (const id of idsDe(bloques)) {
    const p = await fetchProduct(id);
    if (!p || p.published === false || (p.raw && p.raw.published === false)) throw error(409, `El producto ${id} ya no está publicado en la tienda.`);
    if (exigidos.has(id) && !Number(p.price)) throw error(409, `"${p.name}" no tiene precio (¿es la ficha mayorista?).`);
    if (exigidos.has(id) && p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0) throw error(409, `"${p.name}" no tiene stock.`);
    m.set(id, { id, name: p.name, price: p.price, promo_price: p.promo_price, stock: p.stock, image_url: await enJpg(p.image_url), permalink: p.permalink });
  }
  // Para el archivo: se puede bajar hoy con el precio que va a tener la oferta.
  if (precios === 'oferta') return conOferta(m, precios);
  // Para enviar una campaña de la oferta: la oferta ya tiene que estar prendida.
  if (precios === 'exigir') {
    const of = await preciosProgramados();
    for (const [id, p] of m) {
      const real = Number(p.promo_price || p.price);
      if (of.has(id) && real > of.get(id)) throw error(409, `"${p.name}" todavía está a $${real.toLocaleString('es-AR')} en la tienda: la oferta no arrancó.`);
    }
  }
  return m;
}

/* ------------------------------ Campañas ------------------------------ */

const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const enteros = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
const corto = (s, n) => String(s === null || s === undefined ? '' : s).slice(0, n);
const linkSeguro = (u) => (/^(https?:\/\/|mailto:|tel:)/i.test(String(u || '').trim()) ? String(u).trim().slice(0, 900) : '');

function limpiarBloques(bloques) {
  return (Array.isArray(bloques) ? bloques : []).slice(0, 30).filter((b) => b && TIPOS.includes(b.tipo)).map((b) => {
    const r = { tipo: b.tipo };
    for (const k of ['antetitulo', 'titulo', 'nombre', 'codigo', 'boton', 'alt']) if (b[k] !== undefined) r[k] = corto(b[k], 160);
    for (const k of ['bajada', 'detalle']) if (b[k] !== undefined) r[k] = corto(b[k], 600);
    if (b.texto !== undefined) r.texto = corto(b.texto, 4000);
    if (b.alinear !== undefined) r.alinear = ['izquierda', 'centro'].includes(b.alinear) ? b.alinear : 'centro';
    if (b.url !== undefined) r.url = linkSeguro(b.url);
    if (b.src !== undefined) r.src = /^https:\/\//i.test(String(b.src)) ? String(b.src).slice(0, 900) : '';
    if (b.aSangre !== undefined) r.aSangre = Boolean(b.aSangre);
    if (['estrella', 'imagen', 'foto_texto'].includes(b.tipo)) { const n = Number(b.id); if (b.tipo === 'estrella' || b.id) r.id = Number.isInteger(n) && n > 0 ? n : null; }
    if (['estrella', 'productos'].includes(b.tipo) && b.sinPrecio) r.sinPrecio = true;
    if (b.tipo === 'foto_texto') r.lado = b.lado === 'derecha' ? 'derecha' : 'izquierda';
    if (b.tipo === 'banda') r.color = ['acento', 'tinta', 'suave'].includes(b.color) ? b.color : 'suave';
    if (b.tipo === 'lista') r.items = (Array.isArray(b.items) ? b.items : []).map((x) => corto(x, 160)).slice(0, 8);
    if (b.tipo === 'pasos') r.items = (Array.isArray(b.items) ? b.items : []).map((x) => corto(x, 160)).slice(0, 5);
    if (b.tipo === 'productos') { r.ids = enteros(b.ids).slice(0, 12); r.columnas = [1, 2, 3].includes(Number(b.columnas)) ? Number(b.columnas) : 2; }
    if (b.tipo === 'beneficios') r.items = (Array.isArray(b.items) ? b.items : []).map((x) => corto(x, 60)).slice(0, 4);
    return r;
  });
}

async function una(id) {
  await base.ensureSchema();
  const { rows } = await pool.query('SELECT * FROM email_campaigns WHERE id = $1', [id]);
  if (!rows[0]) throw error(404, 'Esa campaña no existe.');
  return rows[0];
}

async function crear({ plantilla = 'oferta', nombre, contenido = null } = {}) {
  await base.ensureSchema();
  const p = PLANTILLAS.find((x) => x.clave === plantilla) || PLANTILLAS[0];
  const a = await base.getAjustes();
  const n = corto(nombre || `${p.nombre} ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: config.timezone })}`, 80);
  const { rows } = await pool.query(
    `INSERT INTO email_campaigns (nombre, remitente_nombre, remitente_email, responder_a, tema, descuento_transferencia, bloques)
     VALUES ($1,$2,$3,$3,$4,$5,$6) RETURNING *`,
    [n, a.remitentes[0].nombre, a.remitentes[0].email, p.tema, p.para === 'minorista' ? 10 : 0, JSON.stringify(p.bloques)],
  );
  const c = rows[0];
  const r = await pool.query('UPDATE email_campaigns SET utm = $2 WHERE id = $1 RETURNING *', [c.id, `mail_${c.id}_${slug(n)}`]);
  if (contenido) return guardar(c.id, contenido);
  return r.rows[0];
}

async function duplicar(id) {
  const c = await una(id);
  const { rows } = await pool.query(
    `INSERT INTO email_campaigns (nombre, asunto, preheader, remitente_nombre, remitente_email, responder_a, tema, descuento_transferencia, bloques, listas, excluir, filtro, precios)
     SELECT 'Copia de ' || left(nombre, 70), asunto, preheader, remitente_nombre, remitente_email, responder_a, tema, descuento_transferencia, bloques, listas, excluir, filtro, precios FROM email_campaigns WHERE id = $1 RETURNING *`, [c.id],
  );
  const r = await pool.query('UPDATE email_campaigns SET utm = $2 WHERE id = $1 RETURNING *', [rows[0].id, `mail_${rows[0].id}_${slug(c.nombre)}`]);
  return r.rows[0];
}

async function guardar(id, d = {}) {
  const c = await una(id);
  if (c.estado !== 'borrador') throw error(409, 'Sólo se edita un borrador. Para cambiar una enviada, duplicala.');
  const a = await base.getAjustes();
  const remitente = d.remitente_email === undefined ? c.remitente_email : base.mailLimpio(d.remitente_email);
  if (!a.remitentes.some((r) => r.email === remitente)) throw error(400, 'Ese remitente no está en los ajustes.');
  const responder = d.responder_a === undefined ? c.responder_a : (base.mailLimpio(d.responder_a) || '');
  const { rows } = await pool.query(
    `UPDATE email_campaigns SET nombre=$2, asunto=$3, preheader=$4, remitente_nombre=$5, remitente_email=$6, responder_a=$7, tema=$8,
       descuento_transferencia=$9, bloques=$10, listas=$11, excluir=$12, filtro=$13, precios=$14, actualizado=now() WHERE id=$1 AND estado='borrador' RETURNING *`,
    [id, corto(d.nombre ?? c.nombre, 80) || c.nombre, corto(d.asunto ?? c.asunto, 150), corto(d.preheader ?? c.preheader, 150),
      corto(d.remitente_nombre ?? c.remitente_nombre, 60).replace(/["<>\r\n]/g, '') || 'BLACKS', remitente, responder,
      TEMAS[d.tema] ? d.tema : c.tema, Math.min(50, Math.max(0, Math.round(Number(d.descuento_transferencia ?? c.descuento_transferencia) || 0))),
      JSON.stringify(d.bloques === undefined ? c.bloques : limpiarBloques(d.bloques)),
      d.listas === undefined ? c.listas : enteros(d.listas), d.excluir === undefined ? c.excluir : enteros(d.excluir),
      JSON.stringify(d.filtro === undefined ? c.filtro : { movidos: Boolean(d.filtro && d.filtro.movidos), diasSinMail: Math.min(60, Math.max(0, Number(d.filtro && d.filtro.diasSinMail) || 0)) }),
      ['tienda', 'oferta'].includes(d.precios) ? d.precios : c.precios],
  );
  if (!rows[0]) throw error(409, 'La campaña ya no es un borrador.');
  return rows[0];
}

/**
 * Sin ningún mail enviado se borra del todo. Si ya salió, se archiva: se va de la
 * lista, pero los links y la baja de los mails que la gente ya tiene siguen andando.
 */
async function eliminar(id) {
  const c = await una(id);
  if (['programada', 'enviando', 'pausada'].includes(c.estado)) throw error(409, 'Primero cancelá el envío.');
  const b = await pool.query("DELETE FROM email_campaigns WHERE id = $1 AND estado IN ('borrador','cancelada') AND NOT EXISTS (SELECT 1 FROM email_sends s WHERE s.campaign_id = $1 AND s.enviado_en IS NOT NULL)", [id]);
  if (b.rowCount) return { borrada: true };
  await pool.query('UPDATE email_campaigns SET archivada = true WHERE id = $1', [id]);
  return { archivada: true };
}

async function recuperar(id) { await pool.query('UPDATE email_campaigns SET archivada = false WHERE id = $1', [id]); }

async function lista({ archivadas = false } = {}) {
  await base.ensureSchema();
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.asunto, c.estado, c.tema, c.programada_para, c.empezo, c.termino, c.actualizado, c.total, c.aviso,
        count(s.id) FILTER (WHERE s.estado IN ('enviado','rebote','queja'))::int AS enviados,
        count(s.id) FILTER (WHERE s.estado = 'pendiente')::int AS pendientes,
        count(s.id) FILTER (WHERE s.aperturas > 0 AND NOT s.robot)::int AS abrieron,
        count(s.id) FILTER (WHERE s.clicks > 0 AND NOT s.robot)::int AS tocaron,
        count(s.id) FILTER (WHERE s.estado = 'rebote')::int AS rebotes
       FROM email_campaigns c LEFT JOIN email_sends s ON s.campaign_id = c.id
      WHERE c.archivada = $1
      GROUP BY c.id ORDER BY (c.estado = 'programada') DESC, CASE WHEN c.estado = 'programada' THEN c.programada_para END ASC, COALESCE(c.empezo, c.actualizado) DESC LIMIT 100`,
    [Boolean(archivadas)],
  );
  return rows;
}

/* ---------------------------- Destinatarios ---------------------------- */

const DESTINATARIOS = `
  SELECT DISTINCT c.id, c.nombre, GREATEST(c.ultima_compra, c.ultimo_click, c.ultima_apertura) AS movimiento
    FROM email_contacts c JOIN email_list_contacts lc ON lc.contact_id = c.id
   WHERE lc.list_id = ANY($1::int[]) AND c.estado = 'activo'
     AND NOT EXISTS (SELECT 1 FROM email_list_contacts x WHERE x.contact_id = c.id AND x.list_id = ANY($2::int[]))
     AND ($3::boolean = false OR GREATEST(c.ultima_compra, c.ultimo_click, c.ultima_apertura) > now() - interval '365 days')
     AND ($4::int = 0 OR NOT EXISTS (SELECT 1 FROM email_sends s WHERE s.contact_id = c.id AND s.estado = 'enviado' AND s.enviado_en > now() - make_interval(days => $4::int)))`;

const parametros = (c) => [c.listas || [], c.excluir || [], Boolean(c.filtro && c.filtro.movidos), Number((c.filtro && c.filtro.diasSinMail) || 0)];

async function cuantos(c) {
  if (!(c.listas || []).length) return 0;
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM (${DESTINATARIOS}) d`, parametros(c));
  return rows[0].n;
}

/* ----------------------------- Vista y prueba ----------------------------- */

async function vista(id, borrador, modo = 'vista') {
  const c = { ...(await una(id)), ...(borrador ? { ...borrador, bloques: limpiarBloques(borrador.bloques) } : {}) };
  const a = await base.getAjustes();
  const r = renderizar(c, { productos: await productosDeCache(c.bloques, c.precios), modo, baseLogo: '', base: urlBase(), secreto: SECRETO, empresa: a.empresa });
  return { html: r.html.replace(/%%NOMBRE%%/g, ' Ana'), avisos: revisar(c, r), links: r.links };
}

/** Lo que conviene corregir antes de mandar. */
function revisar(c, r) {
  const avisos = [...r.avisos];
  const a = String(c.asunto || '').trim();
  if (!a) avisos.push('Falta el asunto.');
  else if (a.length > 60) avisos.push(`El asunto tiene ${a.length} letras: en el celular se ven unas 40.`);
  if (a && a === a.toUpperCase() && /[A-ZÁÉÍÓÚ]{4}/.test(a)) avisos.push('El asunto está todo en mayúsculas: los filtros de spam lo castigan.');
  if (/!{2,}|\${2,}|gratis!|100% gratis/i.test(a)) avisos.push('El asunto tiene signos que suenan a spam.');
  if (!String(c.preheader || '').trim()) avisos.push('Falta el texto que se ve al lado del asunto en la bandeja.');
  if (r.links.filter((l) => l.etiqueta !== 'Logo').length === 0) avisos.push('El mail no tiene ningún botón ni link.');
  const kb = Math.round(Buffer.byteLength(r.html) / 1024);
  if (kb > 95) avisos.push(`El mail pesa ${kb} KB: Gmail corta los de más de 102 KB.`);
  return [...new Set(avisos)];
}

/** HTML para bajar y pegar en otra herramienta (por ejemplo Perfit). Con fotos en JPG y UTM. */
async function archivo(id) {
  const c = await una(id);
  const a = await base.getAjustes();
  const r = renderizar(c, { productos: await productosFrescos(c.bloques, c.precios), modo: 'vista', base: urlBase(), secreto: SECRETO, empresa: a.empresa });
  return { nombre: `${slug(c.nombre) || 'mail'}.html`, html: r.html.replace(/%%NOMBRE%%/g, '') };
}

const primerNombre = (n) => {
  const x = String(n || '').trim().split(/\s+/)[0] || '';
  if (!/^[a-záéíóúüñ'-]{2,20}$/i.test(x)) return '';
  return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
};

// El nombre entra en HTML y en el asunto: sólo letras (primerNombre), no hace falta escapar.
const personalizar = (s, token, nombre) => {
  const n = primerNombre(nombre);
  let r = String(s).split('%%TOKEN%%').join(token);
  // "{nombre}, mirá esto" sin nombre: se va con la coma y la frase arranca en mayúscula.
  if (!n) r = r.replace(/(^|>)%%NOMBRE%%,\s*(\p{L})?/gu, (_, antes, letra) => antes + (letra || '').toUpperCase());
  else r = r.replace(/(^|>)%%NOMBRE%%/g, (_, antes) => antes + n);
  return r.split('%%NOMBRE%%').join(n ? ` ${n}` : '');
};
const asuntoPara = (asunto, nombre) => personalizar(String(asunto).trim().replace(/\s?\{nombre\}/gi, '%%NOMBRE%%'), '', nombre).trim();

async function prueba(id, para) {
  const c = await una(id);
  const a = await base.getAjustes();
  const destinos = (Array.isArray(para) && para.length ? para : a.pruebas).map(base.mailLimpio).filter(Boolean).slice(0, 5);
  if (!destinos.length) throw error(400, 'Cargá a qué mail mandar la prueba.');
  if (!proveedor.cual()) throw error(409, 'Todavía no hay un servicio de envío conectado (ver Ajustes).');
  const r = renderizar(c, { productos: await productosDeCache(c.bloques, c.precios), modo: 'vista', base: urlBase(), secreto: SECRETO, empresa: a.empresa });
  for (const d of destinos) {
    await proveedor.enviar({
      deNombre: c.remitente_nombre, deEmail: c.remitente_email, responderA: c.responder_a, para: d,
      asunto: `[PRUEBA] ${asuntoPara(c.asunto || c.nombre, 'Ana')}`, html: personalizar(r.html, '', 'Ana'), texto: personalizar(r.texto, '', 'Ana'),
    });
  }
  return { enviados: destinos };
}

/* ------------------------------- Enviar ------------------------------- */

async function programar(id, { confirmo, cuando } = {}) {
  const c = await una(id);
  if (c.estado !== 'borrador') throw error(409, 'Esta campaña ya salió o está programada.');
  if (!proveedor.cual()) throw error(409, 'Todavía no hay un servicio de envío conectado (ver Ajustes).');
  if (!String(c.asunto).trim()) throw error(400, 'Falta el asunto.');
  const n = await cuantos(c);
  if (!n) throw error(400, 'No hay a quién mandarle: elegí al menos una lista con contactos activos.');
  if (Number(confirmo) !== n) throw error(409, `Ahora son ${n} personas. Revisá y volvé a confirmar.`);
  const r = renderizar(c, { productos: await productosDeCache(c.bloques, c.precios), modo: 'vista', base: urlBase(), secreto: SECRETO });
  if (r.avisos.length) throw error(400, `Antes de enviar: ${r.avisos[0]}`);
  const fecha = cuando ? fechaFutura(cuando) : null;
  const { rows } = await pool.query("UPDATE email_campaigns SET estado='programada', programada_para=$2, total=$3, aviso=NULL WHERE id=$1 AND estado='borrador' RETURNING *", [id, fecha || new Date(), n]);
  if (!rows[0]) throw error(409, 'La campaña ya no es un borrador.');
  if (!fecha) despertar();
  return rows[0];
}

const fechaFutura = (cuando) => {
  const f = new Date(cuando);
  if (Number.isNaN(f.getTime()) || f.getTime() < Date.now() - 60000) throw error(400, 'La fecha tiene que ser futura.');
  if (f.getTime() > Date.now() + 180 * 86400000) throw error(400, 'Se puede programar hasta 6 meses para adelante.');
  return f;
};

async function reprogramar(id, { cuando } = {}) {
  const f = fechaFutura(cuando);
  const { rows } = await pool.query("UPDATE email_campaigns SET programada_para=$2 WHERE id=$1 AND estado='programada' RETURNING *", [id, f]);
  if (!rows[0]) throw error(409, 'Esta campaña no está programada.');
  return rows[0];
}

/** Programada → fija el HTML y arma la cola. */
async function empezar(c) {
  const tomada = await pool.query("UPDATE email_campaigns SET estado='enviando', empezo=now() WHERE id=$1 AND estado='programada' RETURNING *", [c.id]);
  if (!tomada.rows[0]) return;
  try {
    const a = await base.getAjustes();
    const r = renderizar(c, { productos: await productosFrescos(c.bloques, c.precios === 'oferta' ? 'exigir' : 'tienda'), modo: 'envio', base: urlBase(), secreto: SECRETO, empresa: a.empresa });
    if (r.avisos.length) throw error(409, r.avisos[0]);
    const { rows } = await pool.query(`SELECT * FROM (${DESTINATARIOS}) d ORDER BY movimiento DESC NULLS LAST, id`, parametros(c));
    for (let i = 0; i < rows.length; i += 1000) {
      const t = rows.slice(i, i + 1000);
      await pool.query(
        'INSERT INTO email_sends (campaign_id, contact_id, token, orden) SELECT $1, * FROM unnest($2::bigint[], $3::text[], $4::int[]) ON CONFLICT DO NOTHING',
        [c.id, t.map((x) => x.id), t.map(() => base.token()), t.map((_, j) => i + j)],
      );
    }
    await pool.query('UPDATE email_campaigns SET html=$2, texto=$3, links=$4, total=$5 WHERE id=$1', [c.id, r.html, r.texto, JSON.stringify(r.links), rows.length]);
  } catch (e) {
    console.error('[email] no pude empezar la campaña', c.id, e.message);
    await pool.query("UPDATE email_campaigns SET estado='borrador', empezo=NULL, programada_para=NULL, aviso=$2 WHERE id=$1", [c.id, `No salió: ${e.message}`]);
    await pool.query("DELETE FROM email_sends WHERE campaign_id=$1 AND estado='pendiente'", [c.id]);
  }
}

async function pausar(id) {
  const { rowCount } = await pool.query("UPDATE email_campaigns SET estado='pausada', aviso='Pausada a mano.' WHERE id=$1 AND estado='enviando'", [id]);
  if (!rowCount) throw error(409, 'No se está enviando.');
}
async function seguir(id) {
  const { rowCount } = await pool.query("UPDATE email_campaigns SET estado='enviando', aviso=NULL WHERE id=$1 AND estado='pausada'", [id]);
  if (!rowCount) throw error(409, 'No está pausada.');
  despertar();
}
/** Programada → vuelve a borrador. Enviando o pausada → no manda lo que falta. */
async function cancelar(id) {
  const p = await pool.query("UPDATE email_campaigns SET estado='borrador', programada_para=NULL WHERE id=$1 AND estado='programada'", [id]);
  if (p.rowCount) return;
  const e = await pool.query("UPDATE email_campaigns SET estado='cancelada', termino=now(), aviso='Cancelada antes de terminar.' WHERE id=$1 AND estado IN ('enviando','pausada')", [id]);
  if (!e.rowCount) throw error(409, 'No hay nada para cancelar.');
  await pool.query("UPDATE email_sends SET estado='saltado' WHERE campaign_id=$1 AND estado='pendiente'", [id]);
}

let corriendo = false;
let aviso = null;
function despertar() { if (!aviso) aviso = setTimeout(() => { aviso = null; procesar().catch((e) => console.error('[email] cola:', e.message)); }, 500); if (aviso.unref) aviso.unref(); }

async function mandadosHoy() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM email_sends WHERE enviado_en >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1", [config.timezone]);
  return rows[0].n;
}

async function enviarUno(c, s) {
  // Se pudo dar de baja después de armarse la cola.
  if (s.contacto_estado !== 'activo') { await pool.query("UPDATE email_sends SET estado='saltado' WHERE id=$1", [s.id]); return 'saltado'; }
  try {
    const id = await proveedor.enviar({
      deNombre: c.remitente_nombre, deEmail: c.remitente_email, responderA: c.responder_a, para: s.email,
      asunto: asuntoPara(c.asunto, s.nombre), html: personalizar(c.html, s.token, s.nombre), texto: personalizar(c.texto, s.token, s.nombre),
      baja: `${urlBase()}/e/b/${s.token}`, clave: `send-${s.token}`,
    });
    await pool.query("UPDATE email_sends SET estado='enviado', proveedor_id=$2, enviado_en=now(), error=NULL WHERE id=$1", [s.id, id]);
    return 'enviado';
  } catch (e) {
    const otra = e.reintentar && (e.frenar || s.intentos < 3);
    await pool.query('UPDATE email_sends SET estado=$2, error=$3, intentos=intentos+$4 WHERE id=$1', [s.id, otra ? 'pendiente' : 'fallido', String(e.message).slice(0, 300), e.frenar ? 0 : 1]);
    if (e.frenar) {
      await pool.query("UPDATE email_campaigns SET estado='pausada', aviso=$2 WHERE id=$1 AND estado='enviando'", [c.id, String(e.message).slice(0, 300)]);
      return 'frenar';
    }
    return 'fallido';
  }
}

/**
 * Una vuelta de la cola. La llaman el propio motor cada minuto y el cron. `SKIP
 * LOCKED` deja que dos procesos convivan sin mandar dos veces el mismo mail.
 */
async function procesar({ maxMs = 55000 } = {}) {
  if (corriendo || !proveedor.cual()) return { salteado: true };
  corriendo = true;
  const hasta = Date.now() + maxMs;
  let mandados = 0;
  try {
    await base.ensureSchema();
    const listas = await pool.query("SELECT * FROM email_campaigns WHERE estado='programada' AND programada_para <= now() ORDER BY programada_para LIMIT 3");
    for (const c of listas.rows) await empezar(c);
    // Quedaron a mitad de camino (se reinició el motor). Con Resend la clave de
    // idempotencia evita el duplicado; con SES no se puede saber y no se repite.
    await pool.query("UPDATE email_sends SET estado = $1, error = $2 WHERE estado='enviando' AND tomado_en < now() - interval '10 minutes'",
      proveedor.cual() === 'resend' ? ['pendiente', null] : ['fallido', 'Se cortó mientras salía: no se repite por las dudas.']);
    const a = await base.getAjustes();
    let queda = a.topeDiario - (await mandadosHoy());
    const pausa = Math.max(100, Math.floor(60000 / a.porMinuto));
    while (queda > 0 && Date.now() < hasta) {
      const camp = await pool.query("SELECT * FROM email_campaigns WHERE estado='enviando' AND html IS NOT NULL ORDER BY empezo LIMIT 1");
      const c = camp.rows[0];
      if (!c) break;
      const { rows } = await pool.query(
        `UPDATE email_sends s SET estado='enviando', tomado_en=now() FROM email_contacts k
          WHERE k.id = s.contact_id AND s.id IN (SELECT id FROM email_sends WHERE campaign_id=$1 AND estado='pendiente' ORDER BY orden LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING s.id, s.token, s.intentos, s.orden, k.email, k.nombre, k.estado AS contacto_estado`, [c.id, Math.min(10, queda)],
      );
      if (!rows.length) {
        await pool.query("UPDATE email_campaigns SET estado='enviada', termino=now() WHERE id=$1 AND estado='enviando' AND NOT EXISTS (SELECT 1 FROM email_sends WHERE campaign_id=$1 AND estado IN ('pendiente','enviando'))", [c.id]);
        const sigue = await pool.query("SELECT 1 FROM email_campaigns WHERE id=$1 AND estado='enviando'", [c.id]);
        if (sigue.rows[0]) break; // otro proceso está con los últimos
        continue;
      }
      let frenado = false;
      for (const s of rows.sort((x, y) => x.orden - y.orden)) {
        if (frenado) { await pool.query("UPDATE email_sends SET estado='pendiente' WHERE id=$1", [s.id]); continue; }
        const r = await enviarUno(c, s);
        if (r === 'enviado') { mandados++; queda--; }
        if (r === 'frenar') frenado = true; else await new Promise((ok) => { setTimeout(ok, pausa); });
      }
      await frenarSiRebota(c.id);
    }
    return { mandados, queda };
  } finally { corriendo = false; }
}

async function frenarSiRebota(id) {
  const { rows } = await pool.query("SELECT count(*) FILTER (WHERE estado IN ('enviado','rebote','queja'))::int AS n, count(*) FILTER (WHERE estado='rebote')::int AS r, count(*) FILTER (WHERE estado='queja')::int AS q FROM email_sends WHERE campaign_id=$1", [id]);
  const { n, r, q } = rows[0];
  if (n >= 50 && (r / n > 0.05 || q / n > 0.003)) {
    await pool.query("UPDATE email_campaigns SET estado='pausada', aviso=$2 WHERE id=$1 AND estado='enviando'", [id, `Se frenó sola: ${r} rebotes y ${q} quejas en ${n} mails. Seguir así daña la reputación del dominio.`]);
  }
}

/* ----------------------------- Seguimiento ----------------------------- */

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const tokenValido = (t) => /^[A-Za-z0-9_-]{16,40}$/.test(String(t || ''));

async function abrio(token) {
  if (!tokenValido(token)) return;
  const { rows } = await pool.query('UPDATE email_sends SET aperturas = aperturas + 1, primera_apertura = COALESCE(primera_apertura, now()) WHERE token=$1 AND enviado_en IS NOT NULL RETURNING id, campaign_id, contact_id, aperturas', [token]);
  const s = rows[0];
  if (!s) return;
  if (s.aperturas <= 20) await pool.query("INSERT INTO email_events (campaign_id, send_id, tipo) VALUES ($1,$2,'apertura')", [s.campaign_id, s.id]);
  await pool.query('UPDATE email_contacts SET ultima_apertura = now() WHERE id=$1', [s.contact_id]);
}

/** Anota el clic (si el token existe) y devuelve a dónde ir. La firma decide el destino. */
function destino(u, s) { return abrirLink(u, s, SECRETO); }

const ROBOT_LINKS = 3;
const ROBOT_SEGUNDOS = 2;
// Eventos que cuentan: los de personas, no los de antivirus.
const SIN_ROBOTS = 'AND send_id NOT IN (SELECT id FROM email_sends WHERE campaign_id = $1 AND robot)';

async function toco(token, indice, robot = false) {
  if (!tokenValido(token) || robot) return;
  // Los antivirus de empresa abren todos los links apenas llega el mail.
  const { rows } = await pool.query(
    `UPDATE email_sends SET clicks = clicks + 1, primer_click = COALESCE(primer_click, now()), primera_apertura = COALESCE(primera_apertura, now()), aperturas = GREATEST(aperturas, 1)
      WHERE token=$1 AND enviado_en IS NOT NULL AND now() - enviado_en > interval '4 seconds' RETURNING id, campaign_id, contact_id, clicks`, [token],
  );
  const s = rows[0];
  if (!s) return;
  const i = Number(indice);
  if (s.clicks <= 50) await pool.query("INSERT INTO email_events (campaign_id, send_id, tipo, link) VALUES ($1,$2,'click',$3)", [s.campaign_id, s.id, Number.isInteger(i) ? i : null]);
  // 3 links distintos en 2 segundos no lo hace una persona: es el antivirus de su empresa.
  await pool.query(`UPDATE email_sends SET robot = true WHERE id = $1 AND NOT robot
    AND (SELECT count(DISTINCT link) FROM email_events WHERE send_id = $1 AND tipo = 'click' AND fecha > now() - interval '${ROBOT_SEGUNDOS} seconds') >= ${ROBOT_LINKS}`, [s.id]);
  await pool.query('UPDATE email_contacts SET ultimo_click = now(), ultima_apertura = now() WHERE id=$1', [s.contact_id]);
}

async function darDeBaja(token) {
  if (!tokenValido(token)) return false;
  const { rows } = await pool.query('UPDATE email_sends SET baja_en = COALESCE(baja_en, now()) WHERE token=$1 RETURNING id, campaign_id, contact_id', [token]);
  const s = rows[0];
  if (!s) return false;
  if (await base.marcarContacto(s.contact_id, 'baja', 'pidió la baja')) await pool.query("INSERT INTO email_events (campaign_id, send_id, tipo) VALUES ($1,$2,'baja')", [s.campaign_id, s.id]);
  return true;
}

async function avisoDelProveedor(a) {
  if (!a || !a.id) return false;
  if (a.tipo === 'rebote_temporal') { await pool.query('UPDATE email_sends SET error=$2 WHERE proveedor_id=$1', [a.id, String(a.detalle).slice(0, 300)]); return true; }
  const { rows } = await pool.query('UPDATE email_sends SET estado=$2, error=$3 WHERE proveedor_id=$1 RETURNING id, campaign_id, contact_id', [a.id, a.tipo, String(a.detalle).slice(0, 300)]);
  const s = rows[0];
  if (!s) return false;
  await base.marcarContacto(s.contact_id, a.tipo, a.detalle);
  await pool.query('INSERT INTO email_events (campaign_id, send_id, tipo) VALUES ($1,$2,$3)', [s.campaign_id, s.id, a.tipo]);
  await frenarSiRebota(s.campaign_id);
  return true;
}

/* ------------------------------- Reporte ------------------------------- */

async function reporte(id) {
  const c = await una(id);
  const [r, l, h] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE estado IN ('enviado','rebote','queja'))::int AS enviados,
        count(*) FILTER (WHERE estado='pendiente')::int AS pendientes, count(*) FILTER (WHERE estado='fallido')::int AS fallidos,
        count(*) FILTER (WHERE estado='rebote')::int AS rebotes, count(*) FILTER (WHERE estado='queja')::int AS quejas,
        count(*) FILTER (WHERE aperturas > 0 AND NOT robot)::int AS abrieron, COALESCE(sum(aperturas) FILTER (WHERE NOT robot),0)::int AS aperturas,
        count(*) FILTER (WHERE clicks > 0 AND NOT robot)::int AS tocaron, COALESCE(sum(clicks) FILTER (WHERE NOT robot),0)::int AS clicks,
        count(*) FILTER (WHERE robot)::int AS antivirus,
        count(*) FILTER (WHERE baja_en IS NOT NULL)::int AS bajas FROM email_sends WHERE campaign_id=$1`, [id]),
    pool.query(`SELECT link, count(*)::int AS clicks, count(DISTINCT send_id)::int AS personas FROM email_events WHERE campaign_id=$1 AND tipo='click' AND link IS NOT NULL ${SIN_ROBOTS} GROUP BY link`, [id]),
    pool.query(`SELECT date_trunc('hour', fecha) AS hora, count(*) FILTER (WHERE tipo='apertura')::int AS aperturas, count(*) FILTER (WHERE tipo='click')::int AS clicks FROM email_events WHERE campaign_id=$1 AND fecha < $2::timestamptz + interval '72 hours' ${SIN_ROBOTS} GROUP BY 1 ORDER BY 1`, [id, c.empezo || c.creado]),
  ]);
  // Ventas: pedido pago con la UTM del mail, o de alguien que tocó un link hasta 5 días antes.
  const v = await pool.query(
    `WITH p AS (SELECT raw->>'id' AS id, raw->>'number' AS numero, (raw->>'total')::numeric AS total, (raw->>'created_at')::timestamptz AS fecha, lower(trim(raw->>'contact_email')) AS email,
         (raw->'customer_visit'->'utm_parameters'->>'utm_campaign') AS utm, COALESCE(raw->>'landing_url','') AS landing
       FROM orders_cache WHERE raw->>'payment_status'='paid' AND (raw->>'created_at')::timestamptz >= $3)
     SELECT DISTINCT p.id, p.numero, p.total, p.fecha, (p.utm = $2 OR position('utm_campaign=' || $2 IN p.landing) > 0) AS directa FROM p
      LEFT JOIN email_contacts k ON k.email = p.email LEFT JOIN email_sends s ON s.contact_id = k.id AND s.campaign_id = $1
     WHERE p.utm = $2 OR position('utm_campaign=' || $2 IN p.landing) > 0 OR (s.primer_click IS NOT NULL AND NOT s.robot AND p.fecha BETWEEN s.primer_click AND s.primer_click + interval '5 days')`,
    [id, c.utm || `mail_${id}`, c.empezo || c.creado],
  );
  const conteos = {};
  for (const x of l.rows) conteos[x.link] = x;
  const links = (c.links || []).map((x) => ({ ...x, clicks: (conteos[x.i] || {}).clicks || 0, personas: (conteos[x.i] || {}).personas || 0 }));
  return {
    campania: { id: c.id, nombre: c.nombre, asunto: c.asunto, estado: c.estado, empezo: c.empezo, termino: c.termino, aviso: c.aviso, remitente: c.remitente_email, total: c.total },
    ...r.rows[0], links, horas: h.rows,
    ventas: { cantidad: v.rows.length, total: v.rows.reduce((s, x) => s + Number(x.total || 0), 0), directas: v.rows.filter((x) => x.directa).length },
  };
}

/** El mail enviado, con los clics dibujados arriba de cada link. */
async function mapa(id) {
  const c = await una(id);
  const l = await pool.query(`SELECT link, count(*)::int AS n FROM email_events WHERE campaign_id=$1 AND tipo='click' AND link IS NOT NULL ${SIN_ROBOTS} GROUP BY link`, [id]);
  const conteos = Object.fromEntries(l.rows.map((x) => [x.link, x.n]));
  const a = await base.getAjustes();
  return renderizar(c, { productos: await productosDeCache(c.bloques, c.precios), modo: 'calor', conteos, baseLogo: '', base: urlBase(), empresa: a.empresa }).html.replace(/%%NOMBRE%%/g, '');
}

const LINK_GENERICO = /^(comprar|ver|ver m[aá]s|ver producto|link|aprovech[aá]|quiero)$/i;
const sinUtm = (u) => String(u || '').replace(/[?&]utm_[^&]*/g, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

/** Índice de link → nombre legible. Un botón genérico toma el nombre del producto al que lleva. */
function nombresDeLinks(links) {
  const porUrl = new Map();
  for (const l of links) if (l.etiqueta && !LINK_GENERICO.test(l.etiqueta.trim()) && !porUrl.has(sinUtm(l.url))) porUrl.set(sinUtm(l.url), l.etiqueta);
  return new Map(links.map((l) => [l.i, { nombre: (LINK_GENERICO.test((l.etiqueta || '').trim()) && porUrl.get(sinUtm(l.url))) || l.etiqueta || 'Link', url: l.url }]));
}

async function actividad(id, { ver = 'todos', pagina = 1 } = {}) {
  const filtro = { todos: 'true', abrieron: 's.aperturas > 0 AND NOT s.robot', tocaron: 's.clicks > 0 AND NOT s.robot', antivirus: 's.robot', no_abrieron: "(s.aperturas = 0 OR s.robot) AND s.estado='enviado'", rebotes: "s.estado IN ('rebote','queja','fallido')", bajas: 's.baja_en IS NOT NULL' }[ver] || 'true';
  const p = Math.max(1, Number(pagina) || 1);
  const { rows } = await pool.query(
    `SELECT s.id, k.email, k.nombre, s.estado, s.enviado_en, s.primera_apertura, s.aperturas, s.primer_click, s.clicks, s.baja_en, s.error, s.robot, count(*) OVER()::int AS total
       FROM email_sends s JOIN email_contacts k ON k.id = s.contact_id WHERE s.campaign_id=$1 AND ${filtro}
      ORDER BY s.robot, s.clicks DESC, s.aperturas DESC, s.orden LIMIT 50 OFFSET $2`, [id, (p - 1) * 50],
  );
  // Qué tocó cada uno. Un "Comprar" se nombra con el producto al que lleva, y la foto,
  // el título y el botón del mismo producto cuentan juntos.
  const conClic = rows.filter((f) => f.clicks > 0).map((f) => f.id);
  const tocados = new Map();
  if (conClic.length) {
    const [ev, camp] = await Promise.all([
      pool.query("SELECT send_id, link FROM email_events WHERE campaign_id=$1 AND tipo='click' AND send_id = ANY($2::bigint[])", [id, conClic]),
      pool.query('SELECT links FROM email_campaigns WHERE id=$1', [id]),
    ]);
    const nombres = nombresDeLinks((camp.rows[0] || {}).links || []);
    const porEnvio = new Map();
    for (const e of ev.rows) {
      if (!porEnvio.has(e.send_id)) porEnvio.set(e.send_id, []);
      porEnvio.get(e.send_id).push(e);
    }
    for (const [sendId, clics] of porEnvio) {
      const cuenta = new Map();
      for (const e of clics) {
        const n = nombres.get(e.link) || { nombre: 'Link', url: null };
        const x = cuenta.get(n.nombre) || { etiqueta: n.nombre, url: n.url, veces: 0 };
        x.veces++;
        cuenta.set(n.nombre, x);
      }
      tocados.set(sendId, [...cuenta.values()].sort((x, y) => y.veces - x.veces));
    }
  }
  const filas = rows.map(({ id: sendId, ...f }) => ({ ...f, links: tocados.get(sendId) || [] }));
  return { filas, total: rows[0] ? rows[0].total : 0, pagina: p };
}

module.exports = {
  crear, duplicar, guardar, eliminar, recuperar, reprogramar, lista, una, vista, archivo, prueba, programar, pausar, seguir, cancelar, procesar, cuantos,
  abrio, toco, destino, darDeBaja, avisoDelProveedor, reporte, mapa, actividad, nombresDeLinks, preciosProgramados, productosDeCache, limpiarBloques, asuntoPara, personalizar, primerNombre, GIF, PLANTILLAS, urlBase,
};
