/* =========================================================================
 * EMAIL MARKETING — quién entrega los mails
 *
 * El motor arma, segmenta y mide; la entrega la hace un servicio de envío con el
 * dominio autenticado. Dos opciones, se elige con EMAIL_PROVIDER:
 *
 *  · resend → RESEND_API_KEY. Para los rebotes y quejas: webhook de Resend a
 *    /api/email/webhook/resend y su clave en RESEND_WEBHOOK_SECRET (whsec_…).
 *  · ses    → EMAIL_SES_KEY, EMAIL_SES_SECRET, EMAIL_SES_REGION (por defecto
 *    us-east-1). Rebotes y quejas: SNS a /api/email/webhook/ses?k=EMAIL_WEBHOOK_KEY.
 *
 * Sin ninguna, la sección anda entera menos enviar. NO se usa el Gmail de la
 * empresa (Google Workspace) para campañas: tiene tope diario y un envío masivo
 * puede bloquear la casilla con la que se atiende.
 * ========================================================================= */

const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();

function cual() {
  const p = env('EMAIL_PROVIDER').toLowerCase();
  if ((p === 'resend' || (!p && env('RESEND_API_KEY'))) && env('RESEND_API_KEY')) return 'resend';
  if ((p === 'ses' || (!p && env('EMAIL_SES_KEY'))) && env('EMAIL_SES_KEY') && env('EMAIL_SES_SECRET')) return 'ses';
  return null;
}

// Nombre con comillas si hace falta, sin saltos de línea (inyección de cabeceras).
const de = (nombre, email) => `"${String(nombre || 'BLACKS').replace(/["\\\r\n]/g, '')}" <${email}>`;
const unaLinea = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

class ErrorDeEnvio extends Error {
  constructor(mensaje, { reintentar = false, frenar = false } = {}) {
    super(mensaje);
    this.reintentar = reintentar; // sólo este mail, más tarde
    this.frenar = frenar;         // algo de la cuenta: no seguir mandando
  }
}

async function porResend(m) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json',
      ...(m.clave ? { 'Idempotency-Key': m.clave } : {}),
    },
    body: JSON.stringify({
      from: de(m.deNombre, m.deEmail), to: [m.para], subject: unaLinea(m.asunto), html: m.html, text: m.texto,
      ...(m.responderA ? { reply_to: m.responderA } : {}),
      ...(m.baja ? { headers: { 'List-Unsubscribe': `<${m.baja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await res.json().catch(() => ({}));
  if (res.ok && d.id) return d.id;
  const detalle = `Resend ${res.status}: ${d.message || d.name || 'sin detalle'}`;
  if (res.status === 429 && /daily|monthly|quota/i.test(`${d.name} ${d.message}`)) throw new ErrorDeEnvio(detalle, { frenar: true, reintentar: true });
  if (res.status === 429 || res.status >= 500) throw new ErrorDeEnvio(detalle, { reintentar: true });
  if (res.status === 401 || res.status === 403) throw new ErrorDeEnvio(detalle, { frenar: true, reintentar: true });
  throw new ErrorDeEnvio(detalle);
}

async function porSes(m) {
  const { AwsClient } = require('aws4fetch');
  const region = env('EMAIL_SES_REGION') || 'us-east-1';
  const aws = new AwsClient({ accessKeyId: env('EMAIL_SES_KEY'), secretAccessKey: env('EMAIL_SES_SECRET'), service: 'ses', region, retries: 0 });
  const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      FromEmailAddress: de(m.deNombre, m.deEmail),
      Destination: { ToAddresses: [m.para] },
      ...(m.responderA ? { ReplyToAddresses: [m.responderA] } : {}),
      ...(env('EMAIL_SES_CONFIG_SET') ? { ConfigurationSetName: env('EMAIL_SES_CONFIG_SET') } : {}),
      Content: {
        Simple: {
          Subject: { Data: unaLinea(m.asunto), Charset: 'UTF-8' },
          Body: { Html: { Data: m.html, Charset: 'UTF-8' }, Text: { Data: m.texto, Charset: 'UTF-8' } },
          ...(m.baja ? { Headers: [{ Name: 'List-Unsubscribe', Value: `<${m.baja}>` }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] } : {}),
        },
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await res.json().catch(() => ({}));
  if (res.ok && d.MessageId) return d.MessageId;
  const detalle = `SES ${res.status}: ${d.message || d.Message || d.__type || 'sin detalle'}`;
  if (/quota|sending paused|not authorized|not verified/i.test(detalle) || res.status === 401 || res.status === 403) throw new ErrorDeEnvio(detalle, { frenar: true, reintentar: true });
  if (res.status === 429 || res.status >= 500) throw new ErrorDeEnvio(detalle, { reintentar: true });
  throw new ErrorDeEnvio(detalle);
}

/** @returns id del mail en el proveedor */
async function enviar(m) {
  const p = cual();
  if (p === 'resend') return porResend(m);
  if (p === 'ses') return porSes(m);
  throw new ErrorDeEnvio('Todavía no hay un servicio de envío conectado.', { frenar: true, reintentar: true });
}

/* ------------------------------- Conexión ------------------------------- */

/**
 * Qué falta para enviar, preguntándoselo al servicio. Devuelve una lista de pasos
 * { ok, texto } para la pantalla de Ajustes. ok = null es "no se pudo saber".
 */
async function estado(dominios, topeDiario = 0) {
  const p = cual();
  const pasos = [];
  if (!p) return { proveedor: null, pasos: [{ ok: false, texto: 'No hay claves cargadas en Render.' }], listo: false };
  if (p === 'ses') {
    const { AwsClient } = require('aws4fetch');
    const region = env('EMAIL_SES_REGION') || 'us-east-1';
    const aws = new AwsClient({ accessKeyId: env('EMAIL_SES_KEY'), secretAccessKey: env('EMAIL_SES_SECRET'), service: 'ses', region, retries: 1 });
    const pedir = async (ruta) => {
      try {
        const r = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/${ruta}`, { signal: AbortSignal.timeout(15000) });
        return { s: r.status, d: await r.json().catch(() => ({})) };
      } catch (e) { return { s: 0, d: { message: e.message } }; }
    };
    const c = await pedir('account');
    if (c.s !== 200) {
      pasos.push({ ok: false, texto: `Amazon no aceptó las claves (${c.s || 'sin respuesta'}: ${c.d.message || c.d.Message || 'revisá clave, secreto y región'}).` });
      return { proveedor: p, region, pasos, listo: false };
    }
    const q = c.d.SendQuota || {};
    pasos.push({ ok: true, texto: `Claves correctas, región ${region}.` });
    for (const dom of dominios) {
      const i = await pedir(`identities/${dom}`);
      const ok = i.s === 200 && i.d.VerifiedForSendingStatus === true;
      pasos.push({ ok, texto: ok ? `${dom} verificado.` : i.s === 404 ? `${dom} todavía no está agregado en esta región.` : `${dom} sin verificar: ${(i.d.DkimAttributes && i.d.DkimAttributes.Status) || i.d.message || 'faltan los registros DKIM'}.` });
    }
    pasos.push({ ok: c.d.ProductionAccessEnabled === true, texto: c.d.ProductionAccessEnabled ? 'Cuenta habilitada para mandar a cualquiera.' : 'La cuenta sigue en modo de prueba: sólo manda a mails verificados.' });
    const max = Math.round(q.Max24HourSend || 0);
    if (c.d.ProductionAccessEnabled) pasos.push({ ok: max < 0 || max >= topeDiario, texto: `Amazon te deja ${max < 0 ? 'mandar sin tope' : `mandar ${max.toLocaleString('es-AR')} por día`} (van ${Math.round(q.SentLast24Hours || 0).toLocaleString('es-AR')}).` });
    if (c.d.EnforcementStatus && c.d.EnforcementStatus !== 'HEALTHY') pasos.push({ ok: false, texto: `Amazon puso la cuenta en ${c.d.EnforcementStatus}: revisá los avisos en la consola.` });
    pasos.push({ ok: Boolean(env('EMAIL_WEBHOOK_KEY')), texto: env('EMAIL_WEBHOOK_KEY') ? 'Clave de avisos de rebotes cargada.' : 'Falta EMAIL_WEBHOOK_KEY: sin eso no se enteran los rebotes ni las quejas.' });
    return { proveedor: p, region, pasos, listo: pasos.every((x) => x.ok) };
  }
  const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}` }, signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ message: e.message }) }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Una clave "sólo enviar" no puede leer dominios: sirve igual.
    if (/restricted/i.test(d.name || d.message || '')) pasos.push({ ok: null, texto: 'Clave de sólo envío: mandá una prueba para confirmar el dominio.' });
    else pasos.push({ ok: false, texto: `Resend no aceptó la clave (${r.status || 'sin respuesta'}).` });
  } else {
    pasos.push({ ok: true, texto: 'Clave correcta.' });
    for (const dom of dominios) {
      const x = (d.data || []).find((y) => y.name === dom);
      pasos.push({ ok: Boolean(x && x.status === 'verified'), texto: x ? `${dom}: ${x.status === 'verified' ? 'verificado' : x.status}.` : `${dom} todavía no está agregado.` });
    }
  }
  pasos.push({ ok: Boolean(env('RESEND_WEBHOOK_SECRET')), texto: env('RESEND_WEBHOOK_SECRET') ? 'Avisos de rebotes conectados.' : 'Falta RESEND_WEBHOOK_SECRET: sin eso no se enteran los rebotes ni las quejas.' });
  return { proveedor: p, pasos, listo: pasos.every((x) => x.ok !== false) };
}

/* ------------------------------- Webhooks ------------------------------- */

/** Firma de Resend (Svix): HMAC de "id.fecha.cuerpo" con la clave whsec_. */
function firmaResendValida(headers, cuerpo, ahora = Date.now()) {
  const secreto = env('RESEND_WEBHOOK_SECRET');
  const id = headers['svix-id']; const ts = headers['svix-timestamp']; const firmas = String(headers['svix-signature'] || '');
  if (!secreto || !id || !ts || !firmas) return false;
  if (Math.abs(ahora / 1000 - Number(ts)) > 300) return false;
  const clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64');
  const esperada = crypto.createHmac('sha256', clave).update(`${id}.${ts}.${cuerpo}`).digest();
  return firmas.split(' ').some((f) => {
    const b = Buffer.from(f.replace(/^v1,/, ''), 'base64');
    return b.length === esperada.length && crypto.timingSafeEqual(b, esperada);
  });
}

/** Pasa el aviso del proveedor a { id, tipo: 'rebote' | 'queja', detalle } o null. */
function leerResend(d) {
  const id = d && d.data && d.data.email_id;
  if (!id) return null;
  if (d.type === 'email.complained') return { id, tipo: 'queja', detalle: 'marcado como spam' };
  if (d.type === 'email.bounced') {
    const b = d.data.bounce || {};
    return { id, tipo: /transient|temporary/i.test(b.type || '') ? 'rebote_temporal' : 'rebote', detalle: b.message || b.subType || 'rebote' };
  }
  return null;
}

function leerSes(m) {
  const id = m && m.mail && m.mail.messageId;
  const tipo = m && (m.notificationType || m.eventType);
  if (!id) return null;
  if (tipo === 'Complaint') return { id, tipo: 'queja', detalle: 'marcado como spam' };
  if (tipo === 'Bounce') return { id, tipo: m.bounce && m.bounce.bounceType === 'Permanent' ? 'rebote' : 'rebote_temporal', detalle: (m.bounce && m.bounce.bounceSubType) || 'rebote' };
  return null;
}

module.exports = { cual, estado, enviar, ErrorDeEnvio, firmaResendValida, leerResend, leerSes, de };
