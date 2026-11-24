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

module.exports = { cual, enviar, ErrorDeEnvio, firmaResendValida, leerResend, leerSes, de };
