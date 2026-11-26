/* =========================================================================
 * EMAIL MARKETING — tablas, contactos, listas y ajustes
 *
 * Las tablas llevan RLS prendido (como el resto desde el 10-nov-2026): guardan
 * mails de clientes y el rol público de Supabase no las puede leer. El motor
 * entra como dueño de la base y no lo nota.
 * ========================================================================= */

const crypto = require('crypto');
const pool = require('../db');
const { getSetting, setSetting } = require('../settings');

const SQL = `
CREATE TABLE IF NOT EXISTS email_contacts (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  nombre         TEXT,
  tipo           TEXT,                              -- 'minorista' | 'mayorista' | null
  estado         TEXT NOT NULL DEFAULT 'activo',    -- 'activo' | 'baja' | 'rebote' | 'queja'
  motivo         TEXT,
  ultima_apertura TIMESTAMPTZ,
  ultimo_click   TIMESTAMPTZ,
  ultima_compra  TIMESTAMPTZ,
  creado         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_lists (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL UNIQUE,
  tipo           TEXT,
  origen         TEXT NOT NULL DEFAULT 'archivo',   -- 'archivo' | 'tienda'
  detalle        TEXT,
  creado         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_list_contacts (
  list_id        INTEGER NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  contact_id     BIGINT NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, contact_id)
);
CREATE INDEX IF NOT EXISTS email_list_contacts_c ON email_list_contacts(contact_id);
CREATE TABLE IF NOT EXISTS email_campaigns (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  asunto         TEXT NOT NULL DEFAULT '',
  preheader      TEXT NOT NULL DEFAULT '',
  remitente_nombre TEXT NOT NULL DEFAULT 'BLACKS',
  remitente_email TEXT NOT NULL DEFAULT '',
  responder_a    TEXT NOT NULL DEFAULT '',
  tema           TEXT NOT NULL DEFAULT 'claro',
  descuento_transferencia INTEGER NOT NULL DEFAULT 0,
  bloques        JSONB NOT NULL DEFAULT '[]',
  listas         INTEGER[] NOT NULL DEFAULT '{}',
  excluir        INTEGER[] NOT NULL DEFAULT '{}',
  filtro         JSONB NOT NULL DEFAULT '{}',
  utm            TEXT,
  estado         TEXT NOT NULL DEFAULT 'borrador',  -- borrador | programada | enviando | pausada | enviada | cancelada
  programada_para TIMESTAMPTZ,
  html           TEXT,
  texto          TEXT,
  links          JSONB NOT NULL DEFAULT '[]',
  total          INTEGER NOT NULL DEFAULT 0,
  aviso          TEXT,
  creado         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado    TIMESTAMPTZ NOT NULL DEFAULT now(),
  empezo         TIMESTAMPTZ,
  termino        TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS email_sends (
  id             BIGSERIAL PRIMARY KEY,
  campaign_id    INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id     BIGINT NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  orden          INTEGER NOT NULL DEFAULT 0,
  estado         TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviando | enviado | fallido | rebote | queja | saltado
  proveedor_id   TEXT,
  error          TEXT,
  intentos       INTEGER NOT NULL DEFAULT 0,
  tomado_en      TIMESTAMPTZ,
  enviado_en     TIMESTAMPTZ,
  primera_apertura TIMESTAMPTZ,
  aperturas      INTEGER NOT NULL DEFAULT 0,
  primer_click   TIMESTAMPTZ,
  clicks         INTEGER NOT NULL DEFAULT 0,
  baja_en        TIMESTAMPTZ,
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS email_sends_cola ON email_sends(campaign_id, estado, orden);
CREATE INDEX IF NOT EXISTS email_sends_prov ON email_sends(proveedor_id);
CREATE INDEX IF NOT EXISTS email_sends_fecha ON email_sends(enviado_en);
CREATE TABLE IF NOT EXISTS email_events (
  id             BIGSERIAL PRIMARY KEY,
  campaign_id    INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  send_id        BIGINT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,                     -- apertura | click | baja | rebote | queja
  link           INTEGER,
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_c ON email_events(campaign_id, tipo);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS precios TEXT NOT NULL DEFAULT 'tienda'; -- 'tienda' | 'oferta' (la programada)
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS archivada BOOLEAN NOT NULL DEFAULT false;
-- Antivirus de empresa: abren 3 links distintos o más en 2 segundos. Se marcan al tocar
-- (campanas.toco) y no cuentan en ningún total. La primera vez se corrigen los envíos viejos.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sends' AND column_name = 'robot') THEN
    ALTER TABLE email_sends ADD COLUMN robot BOOLEAN NOT NULL DEFAULT false;
    UPDATE email_sends SET robot = true WHERE id IN (
      SELECT e1.send_id FROM email_events e1 JOIN email_events e2 ON e2.send_id = e1.send_id AND e2.tipo = 'click'
         AND e2.fecha >= e1.fecha AND e2.fecha <= e1.fecha + interval '2 seconds'
       WHERE e1.tipo = 'click' GROUP BY e1.send_id, e1.id HAVING count(DISTINCT e2.link) >= 3);
  END IF;
END $$;
ALTER TABLE email_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
`;

let lista = null;
function ensureSchema() {
  if (!lista) lista = pool.query(SQL).catch((e) => { lista = null; throw e; });
  return lista;
}

/* ------------------------------- Ajustes ------------------------------- */

const AJUSTES = {
  remitentes: [
    { nombre: 'BLACKS', email: 'ventasweb@blacksindumentaria.com.ar' },
    { nombre: 'BLACKS', email: 'info@blacksindumentaria.com.ar' },
  ],
  pruebas: [],             // a quién se le mandan las pruebas
  topeDiario: 300,         // mails por día entre todas las campañas (se sube de a poco)
  porMinuto: 30,
  empresa: 'BLACKS Indumentaria · Av. Directorio 7320, Ciudad Autónoma de Buenos Aires',
};

const MAIL = /^[^\s@"<>(),;:\\[\]]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
function mailLimpio(s) {
  const m = String(s || '').trim().toLowerCase().replace(/^mailto:/, '').replace(/[.,;]+$/, '');
  return m.length <= 254 && MAIL.test(m) ? m : null;
}

async function getAjustes() {
  let guardado = {};
  try { guardado = JSON.parse((await getSetting('email_ajustes')) || '{}'); } catch (_) { /* queda el de fábrica */ }
  return { ...AJUSTES, ...guardado };
}

async function setAjustes(cambios = {}) {
  const a = await getAjustes();
  const error = (m) => { const e = new Error(m); e.status = 400; return e; };
  if (cambios.remitentes !== undefined) {
    const r = (Array.isArray(cambios.remitentes) ? cambios.remitentes : [])
      .map((x) => ({ nombre: String((x && x.nombre) || 'BLACKS').replace(/["<>\r\n]/g, '').trim().slice(0, 60) || 'BLACKS', email: mailLimpio(x && x.email) }));
    if (!r.length || r.some((x) => !x.email)) throw error('Cada remitente necesita un mail válido.');
    a.remitentes = r.slice(0, 6);
  }
  if (cambios.pruebas !== undefined) {
    const p = (Array.isArray(cambios.pruebas) ? cambios.pruebas : String(cambios.pruebas).split(/[\s,;]+/)).filter(Boolean).map(mailLimpio);
    if (p.some((x) => !x)) throw error('Hay un mail de prueba mal escrito.');
    a.pruebas = [...new Set(p)].slice(0, 5);
  }
  if (cambios.topeDiario !== undefined) a.topeDiario = Math.min(20000, Math.max(10, Math.round(Number(cambios.topeDiario) || 300)));
  if (cambios.porMinuto !== undefined) a.porMinuto = Math.min(600, Math.max(1, Math.round(Number(cambios.porMinuto) || 30)));
  if (cambios.empresa !== undefined) a.empresa = String(cambios.empresa).replace(/[\r\n]+/g, ' ').trim().slice(0, 160) || AJUSTES.empresa;
  await setSetting('email_ajustes', JSON.stringify(a));
  return a;
}

/* --------------------------- Contactos y listas --------------------------- */

const token = () => crypto.randomBytes(15).toString('base64url');

async function listaPorNombre({ nombre, tipo = null, origen = 'archivo', detalle = null }) {
  const n = String(nombre || '').trim().slice(0, 80);
  if (!n) { const e = new Error('La lista necesita un nombre.'); e.status = 400; throw e; }
  const { rows } = await pool.query(
    `INSERT INTO email_lists (nombre, tipo, origen, detalle) VALUES ($1,$2,$3,$4)
     ON CONFLICT (nombre) DO UPDATE SET tipo = COALESCE(EXCLUDED.tipo, email_lists.tipo),
       detalle = COALESCE(EXCLUDED.detalle, email_lists.detalle), actualizado = now() RETURNING *`,
    [n, tipo, origen, detalle],
  );
  return rows[0];
}

/**
 * Guarda contactos y los suma a una lista. Nunca reactiva a quien se dio de baja,
 * rebotó o marcó spam: el estado sólo cambia hacia "peor".
 */
async function guardarContactos(contactos, { listaId = null, tipo = null, reemplazar = false } = {}) {
  const vistos = new Map();
  for (const c of contactos) {
    const email = mailLimpio(c.email);
    if (email && !vistos.has(email)) vistos.set(email, { email, nombre: String(c.nombre || '').trim().slice(0, 80) || null, compra: c.compra || null });
  }
  const limpios = [...vistos.values()];
  if (reemplazar && listaId) await pool.query('DELETE FROM email_list_contacts WHERE list_id = $1', [listaId]);
  for (let i = 0; i < limpios.length; i += 1000) {
    const t = limpios.slice(i, i + 1000);
    const { rows } = await pool.query(
      `INSERT INTO email_contacts (email, nombre, tipo, ultima_compra)
       SELECT e, NULLIF(n,''), $3, NULLIF(c,'')::timestamptz FROM unnest($1::text[], $2::text[], $4::text[]) AS x(e, n, c)
       ON CONFLICT (email) DO UPDATE SET nombre = COALESCE(email_contacts.nombre, EXCLUDED.nombre),
         tipo = COALESCE(email_contacts.tipo, EXCLUDED.tipo),
         ultima_compra = GREATEST(email_contacts.ultima_compra, EXCLUDED.ultima_compra)
       RETURNING id`,
      [t.map((x) => x.email), t.map((x) => x.nombre || ''), tipo, t.map((x) => x.compra || '')],
    );
    if (listaId) {
      await pool.query('INSERT INTO email_list_contacts (list_id, contact_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING', [listaId, rows.map((r) => r.id)]);
    }
  }
  return { validos: limpios.length, descartados: contactos.length - limpios.length };
}

/** Lee un CSV (coma, punto y coma o tabulación) y devuelve [{ email, nombre }]. */
function leerCsv(texto) {
  const limpio = String(texto || '').replace(/^\uFEFF/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0];
  const separador = sep[1] > 1 ? sep[0] : ',';
  const filas = [];
  let campo = ''; let fila = []; let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === separador) { fila.push(campo); campo = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim())) filas.push(fila);
  if (!filas.length) return [];
  const cab = filas[0].map((x) => x.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const tieneCabecera = !filas[0].some((x) => mailLimpio(x));
  const col = (re) => cab.findIndex((x) => re.test(x));
  let iMail = tieneCabecera ? col(/^(e-?mail|mail|correo)/) : filas[0].findIndex((x) => mailLimpio(x));
  if (iMail < 0 && tieneCabecera && filas[1]) iMail = filas[1].findIndex((x) => mailLimpio(x));
  const iNombre = tieneCabecera ? col(/^(nombre|first ?name|name)/) : -1;
  if (iMail < 0) return [];
  return filas.slice(tieneCabecera ? 1 : 0).map((f) => ({ email: f[iMail], nombre: iNombre >= 0 ? f[iNombre] : '' }));
}

async function importar({ lista, tipo = null, csv, bajas = false }) {
  await ensureSchema();
  const contactos = leerCsv(csv);
  if (!contactos.length) { const e = new Error('No encontré una columna con mails en el archivo.'); e.status = 400; throw e; }
  if (bajas) {
    const mails = [...new Set(contactos.map((c) => mailLimpio(c.email)).filter(Boolean))];
    await pool.query(
      `INSERT INTO email_contacts (email, estado, motivo) SELECT unnest($1::text[]), 'baja', 'importado'
       ON CONFLICT (email) DO UPDATE SET estado = CASE WHEN email_contacts.estado = 'activo' THEN 'baja' ELSE email_contacts.estado END, motivo = COALESCE(email_contacts.motivo, 'importado')`,
      [mails],
    );
    return { bajas: mails.length };
  }
  const l = await listaPorNombre({ nombre: lista, tipo: ['minorista', 'mayorista'].includes(tipo) ? tipo : null });
  const r = await guardarContactos(contactos, { listaId: l.id, tipo: l.tipo });
  return { lista: l, ...r };
}

/**
 * Listas que salen solas de la tienda: los compradores (pedidos pagos) y los que
 * se registraron y aceptaron mails sin comprar. Los segundos son en su mayoría
 * consultas mayoristas (lo dijo Sebastián el 24-nov-2026), por eso van aparte.
 */
async function sincronizarTienda() {
  await ensureSchema();
  const { tnRequest } = require('../tiendanube');
  const compras = await pool.query(
    `SELECT lower(trim(raw->>'contact_email')) AS email, max(raw->>'contact_name') AS nombre, max(raw->>'created_at') AS compra
       FROM orders_cache WHERE raw->>'payment_status' = 'paid' AND COALESCE(raw->>'contact_email','') <> '' GROUP BY 1`,
  );
  const compradores = compras.rows.filter((r) => mailLimpio(r.email));
  const esComprador = new Set(compradores.map((r) => r.email));
  const aceptan = new Map();
  const noAceptan = new Set();
  for (let pagina = 1; pagina <= 150; pagina++) {
    let d;
    try { d = await tnRequest('GET', `/customers?per_page=200&page=${pagina}&fields=id,name,email,accepts_marketing,created_at`); } catch (e) { if (e.status === 404) break; throw e; }
    for (const c of d || []) {
      const email = mailLimpio(c.email);
      if (!email) continue;
      if (c.accepts_marketing) aceptan.set(email, { email, nombre: c.name, creado: c.created_at }); else noAceptan.add(email);
    }
    if (!d || d.length < 200) break;
  }
  const hace = (meses) => new Date(Date.now() - meses * 30.4 * 86400000).toISOString();
  const sinCompra = [...aceptan.values()].filter((c) => !esComprador.has(c.email));
  const grupos = [
    { nombre: 'Compradores de la tienda', tipo: 'minorista', detalle: 'Pedidos pagos de Tiendanube. Sin los que pidieron no recibir mails.', datos: compradores.filter((c) => !noAceptan.has(c.email)).map((c) => ({ email: c.email, nombre: c.nombre, compra: c.compra })) },
    { nombre: 'Contactos de la tienda sin compra · último año', tipo: 'mayorista', detalle: 'Aceptan mails y no compraron. En su mayoría son consultas mayoristas.', datos: sinCompra.filter((c) => c.creado >= hace(12)) },
    { nombre: 'Contactos de la tienda sin compra · más viejos', tipo: 'mayorista', detalle: 'De más de un año: usarlos con cuidado, pueden rebotar.', datos: sinCompra.filter((c) => c.creado < hace(12)) },
  ];
  const salida = [];
  for (const g of grupos) {
    const l = await listaPorNombre({ nombre: g.nombre, tipo: g.tipo, origen: 'tienda', detalle: g.detalle });
    const r = await guardarContactos(g.datos, { listaId: l.id, tipo: g.tipo, reemplazar: true });
    salida.push({ lista: g.nombre, ...r });
  }
  return salida;
}

async function listas() {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT l.*, count(c.id)::int AS contactos,
            count(c.id) FILTER (WHERE c.estado = 'activo')::int AS activos,
            count(c.id) FILTER (WHERE c.estado = 'activo' AND GREATEST(c.ultima_apertura, c.ultimo_click, c.ultima_compra) > now() - interval '180 days')::int AS movidos
       FROM email_lists l LEFT JOIN email_list_contacts lc ON lc.list_id = l.id LEFT JOIN email_contacts c ON c.id = lc.contact_id
      GROUP BY l.id ORDER BY l.origen DESC, l.nombre`,
  );
  const t = await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'activo')::int AS activos,
    count(*) FILTER (WHERE estado = 'baja')::int AS bajas, count(*) FILTER (WHERE estado IN ('rebote','queja'))::int AS malos FROM email_contacts`);
  return { listas: rows, totales: t.rows[0] };
}

async function borrarLista(id) {
  await ensureSchema();
  const usada = await pool.query("SELECT nombre FROM email_campaigns WHERE estado IN ('programada','enviando','pausada') AND ($1 = ANY(listas) OR $1 = ANY(excluir)) LIMIT 1", [id]);
  if (usada.rows[0]) { const e = new Error(`La está usando la campaña "${usada.rows[0].nombre}".`); e.status = 409; throw e; }
  await pool.query('DELETE FROM email_lists WHERE id = $1', [id]);
}

/** Da de baja (o marca rebote/queja). Devuelve true si cambió algo. */
async function marcarContacto(contactId, estado, motivo) {
  const peor = { activo: 0, baja: 1, rebote: 2, queja: 3 };
  const { rows } = await pool.query('SELECT estado FROM email_contacts WHERE id = $1', [contactId]);
  if (!rows[0] || peor[rows[0].estado] >= peor[estado]) return false;
  await pool.query('UPDATE email_contacts SET estado = $2, motivo = $3 WHERE id = $1', [contactId, estado, motivo || null]);
  return true;
}

module.exports = {
  ensureSchema, getAjustes, setAjustes, mailLimpio, token, listaPorNombre, guardarContactos,
  leerCsv, importar, sincronizarTienda, listas, borrarLista, marcarContacto, AJUSTES,
};
