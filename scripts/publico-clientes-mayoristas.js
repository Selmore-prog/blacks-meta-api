#!/usr/bin/env node
/* =========================================================================
 * PÚBLICO DE META CON LOS CLIENTES MAYORISTAS REALES (Kommo) — oct-2026
 *
 * POR QUÉ EXISTE (Sebastián, 15/16-oct-2026)
 * La campaña mayorista de WhatsApp busca "gente que escriba" y Meta aprendió
 * a traer al que escribe fácil, no al que compra. Medido en Kommo del 1 al
 * 16-oct: de 76 conversaciones que trajo el anuncio, el 42% mandó sólo el
 * mensaje precargado y nada más, y 1 llegó a presupuesto (el equipo respondió
 * 74). Las que entraron por el formulario con datos o el cotizador
 * conversaron casi todas.
 *
 * QUÉ HACE: le da a Meta el ejemplo correcto.
 *  · Toma del embudo Mayorista de Kommo los contactos de los leads que
 *    COMPRARON o aceptaron el presupuesto: Closed-won, GANADOS RECIENTES,
 *    presup. aceptado / ped. en proceso y buen servicio (los nombró Sebastián).
 *    Ticket mediano ~$2 millones: no es el revendedor chico de 10 prendas.
 *  · Sube teléfono y email a un público personalizado de Meta, normalizados y
 *    con SHA-256 (Meta nunca ve el dato en claro; es lo que exige la API).
 *  · Crea un público SIMILAR del 1% en Argentina: gente parecida a quienes
 *    ya te compraron por mayor.
 *  · --aplicar-a-conjuntos: pone ese similar como público de los dos
 *    conjuntos mayoristas (WhatsApp y formulario), con la misma edad.
 *
 * Volver a correrlo actualiza la lista (reemplaza los contactos, así entran
 * los clientes nuevos); el similar se recalcula solo en Meta.
 *
 *   node scripts/publico-clientes-mayoristas.js                         → vista previa (cuántos, sin subir)
 *   node scripts/publico-clientes-mayoristas.js --subir                 → crea/actualiza público y similar
 *   node scripts/publico-clientes-mayoristas.js --aplicar-a-conjuntos   → pone el similar en los
 *        dos conjuntos (sólo si Meta ya lo calculó; si no, sale con código 2)
 * ========================================================================= */

require('dotenv').config();
const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com';
const API = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const CUENTA = 'act_3195782590470274';
const KOMMO = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;

const EMBUDO_MAYORISTA = 9272975;
// Closed-won · GANADOS RECIENTES · presup. aceptado / ped. en proceso · buen servicio
const ETAPAS_GANADAS = [142, 71927603, 90596252, 71927607];
const CONJUNTOS = ['120250763665960783', '120250967382890783']; // Mayorista · WhatsApp · Empresas / Mayorista · Formulario · Empresas

const PUBLICO = 'Kommo · Mayorista · Clientes que compraron';
const SIMILAR = 'Similar 1% AR · Kommo · Mayorista · Clientes que compraron';

/* ------------------------------- Kommo ------------------------------- */

async function kommo(ruta, params = {}) {
  const u = new URL(KOMMO + ruta);
  for (const [k, v] of Object.entries(params)) u.searchParams.append(k, v);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${process.env.KOMMO_TOKEN}` } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Kommo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function leadsGanados() {
  const out = [];
  for (let page = 1; ; page++) {
    const q = { limit: 250, page, 'filter[pipeline_id]': EMBUDO_MAYORISTA, with: 'contacts' };
    ETAPAS_GANADAS.forEach((s, i) => {
      q[`filter[statuses][${i}][pipeline_id]`] = EMBUDO_MAYORISTA;
      q[`filter[statuses][${i}][status_id]`] = s;
    });
    const d = await kommo('/leads', q);
    if (!d) break;
    out.push(...d._embedded.leads);
    if (!d._links || !d._links.next) break;
  }
  return out;
}

async function contactos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const q = { limit: 250 };
    ids.slice(i, i + 200).forEach((id, j) => { q[`filter[id][${j}]`] = id; });
    const d = await kommo('/contacts', q);
    if (d) out.push(...d._embedded.contacts);
  }
  return out;
}

const valores = (c, code) => ((c.custom_fields_values || []).find((f) => f.field_code === code) || { values: [] }).values.map((v) => String(v.value));

/** Teléfono a formato de Meta: sólo dígitos, con 54 y el 9 de celular. */
function telefono(t) {
  let d = t.replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('549') && d.length === 13) return d;
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) return `549${d}`;
  return null; // formato raro: mejor no mandarlo que mandar basura
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* -------------------------------- Meta -------------------------------- */

async function fbGet(p) {
  const res = await fetch(`${GRAPH}/${API}/${p}${p.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message);
  return d;
}

async function fbPost(p, campos, metodo = 'POST') {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  body.append('access_token', TOKEN);
  const res = await fetch(`${GRAPH}/${API}/${p}`, { method: metodo, body });
  const d = await res.json();
  if (d.error) throw new Error(`${d.error.error_user_title ? d.error.error_user_title + ': ' : ''}${d.error.error_user_msg || d.error.message} [${d.error.code}/${d.error.error_subcode || ''}]`);
  return d;
}

async function buscarPublico(nombre) {
  const d = await fbGet(`${CUENTA}/customaudiences?fields=id,name,approximate_count_lower_bound,operation_status&limit=200`);
  return (d.data || []).find((a) => a.name === nombre);
}

/* -------------------------------- Main -------------------------------- */

(async () => {
  const subir = process.argv.includes('--subir');
  const aplicar = process.argv.includes('--aplicar-a-conjuntos');

  const leads = await leadsGanados();
  const ids = [...new Set(leads.flatMap((l) => (l._embedded.contacts || []).map((c) => c.id)))];
  const cs = await contactos(ids);
  const filas = [];
  const vistos = new Set();
  for (const c of cs) {
    const tel = valores(c, 'PHONE').map(telefono).find(Boolean) || '';
    const mail = (valores(c, 'EMAIL')[0] || '').trim().toLowerCase();
    if (!tel && !mail) continue;
    const clave = tel || mail;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    filas.push([tel ? sha(tel) : '', mail ? sha(mail) : '']);
  }
  console.log(`\n${leads.length} leads ganados en el embudo Mayorista · ${ids.length} contactos · ${filas.length} con teléfono o email válido`);
  if (!subir && !aplicar) return console.log('Corré con --subir para crear/actualizar el público en Meta.');
  if (subir) await subirPublico(filas);
  if (aplicar) await aplicarAConjuntos();
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});

async function subirPublico(filas) {

  let publico = await buscarPublico(PUBLICO);
  if (!publico) {
    publico = await fbPost(`${CUENTA}/customaudiences`, {
      name: PUBLICO,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      description: 'Contactos de Kommo (embudo Mayorista) que compraron o aceptaron presupuesto. Lo arma scripts/publico-clientes-mayoristas.js',
    });
    console.log(`✓ público ${publico.id}`);
  } else console.log(`· público ya existía ${publico.id}: reemplazo los contactos`);

  // usersreplace reemplaza la lista entera (sesión de una sola tanda: son < 10.000).
  const sesion = { session_id: Date.now(), batch_seq: 1, last_batch_flag: true, estimated_num_total: filas.length };
  const r = await fbPost(`${publico.id}/usersreplace`, { session: sesion, payload: { schema: ['PHONE', 'EMAIL'], data: filas } });
  console.log(`✓ subidos ${r.num_received} (inválidos ${r.num_invalid_entries})`);

  let similar = await buscarPublico(SIMILAR);
  if (!similar) {
    similar = await fbPost(`${CUENTA}/customaudiences`, {
      name: SIMILAR,
      subtype: 'LOOKALIKE',
      origin_audience_id: publico.id,
      lookalike_spec: { type: 'similarity', ratio: 0.01, country: 'AR' },
    });
    console.log(`✓ similar ${similar.id} (Meta tarda unas horas en calcularlo)`);
  } else console.log(`· similar ya existía ${similar.id}`);
}

/** Pone el similar en los dos conjuntos mayoristas. Sólo si Meta ya lo terminó
 *  de calcular: recién creado dice "demasiado pequeño" unas horas, y ponerlo
 *  así frenaría la entrega. Sale con código 2 si todavía no está listo. */
async function aplicarAConjuntos() {
  const similar = await buscarPublico(SIMILAR);
  if (!similar) throw new Error('No existe el similar: corré primero con --subir.');
  const estado = await fbGet(`${similar.id}?fields=delivery_status`);
  if (!estado.delivery_status || estado.delivery_status.code !== 200) {
    console.log(`· el similar todavía no se puede usar (${estado.delivery_status && estado.delivery_status.description}). No toco los conjuntos.`);
    process.exit(2);
  }
  {
    for (const id of CONJUNTOS) {
      const s = await fbGet(`${id}?fields=name,targeting`);
      const t = s.targeting;
      t.custom_audiences = [{ id: similar.id }];
      t.targeting_automation = { advantage_audience: 0 }; // el similar manda, no es sugerencia
      await fbPost(id, { targeting: t });
      console.log(`✓ ${s.name}: público = ${SIMILAR}`);
      await new Promise((res) => setTimeout(res, 31_000)); // 1 edición de conjunto cada 30 s (#613)
    }
  }
}
