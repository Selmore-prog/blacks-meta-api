const pool = require('./db');

/**
 * ASISTENTE IA DE LA TIENDA · pestaña "Asistente IA" del panel.
 *
 * El globito ✦ de la tienda (theme: snipplets/ia-asistente.tpl y
 * static/js/ia-asistente.js) le habla al cotizador (cotizador-blacks,
 * /api/ia-web), que contesta con el mismo cerebro que el bot de WhatsApp: lee la
 * tienda con el stock por talle, las descripciones, "Lo que sabe" y las
 * respuestas que le enseñó el equipo, y arma el carrito.
 *
 * Por qué las charlas se guardan acá (Supabase) y las escribe el cotizador:
 * este panel corre en el plan gratis de Render, que se duerme sin uso. Si la
 * tienda dependiera de él para contestar, el primer mensaje después de un rato
 * tardaría casi un minuto. El cotizador (Vercel) escribe directo en estas
 * tablas por la API REST de Supabase y el panel sólo las lee y cambia los ajustes.
 *
 * Las tablas tienen RLS prendido y ninguna política: con la clave pública
 * (anon) no se lee ni se escribe nada. Sólo entran la service role (cotizador)
 * y la conexión directa de este panel.
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ia_web_charlas (
  id            TEXT PRIMARY KEY,                     -- lo genera el navegador (una charla por sesión)
  creada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada   TIMESTAMPTZ NOT NULL DEFAULT now(),
  pagina        TEXT,                                 -- URL donde arrancó la charla
  titulo        TEXT,                                 -- título de esa página
  dispositivo   TEXT,                                 -- 'celular' | 'compu'
  mensajes      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ rol, texto, t, bloques?, ms? }]
  cantidad      INTEGER NOT NULL DEFAULT 0,           -- mensajes de la persona
  resultado     TEXT[] NOT NULL DEFAULT '{}',         -- carrito, clic_carrito, mayorista, clic_mayorista, cambios, persona…
  carrito_total NUMERIC,
  tokens        INTEGER NOT NULL DEFAULT 0,
  modelo        TEXT,
  prueba        BOOLEAN NOT NULL DEFAULT false,       -- charla del modo prueba (?ia=1)
  revisada      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ia_web_charlas_actualizada ON ia_web_charlas (actualizada DESC);
ALTER TABLE ia_web_charlas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ia_web_ajustes (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  datos       JSONB NOT NULL DEFAULT '{}'::jsonb,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ia_web_ajustes ENABLE ROW LEVEL SECURITY;
INSERT INTO ia_web_ajustes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- La API REST de Supabase guarda en caché qué tablas existen: que las vea ya.
NOTIFY pgrst, 'reload schema';
`;

let schemaListo = null;
function ensureSchema() {
  if (!schemaListo) {
    schemaListo = pool.query(SCHEMA_SQL).catch((err) => {
      schemaListo = null;
      throw err;
    });
  }
  return schemaListo;
}

/* ---------------- ajustes ----------------
 * Espejo de cotizador-blacks/src/lib/iaWeb/ajustes.js: los mismos valores por
 * defecto y los mismos límites. El cotizador vuelve a validar al leer, así que
 * si alguno quedara distinto manda el del cotizador. */

const MODOS = ['apagado', 'prueba', 'encendido'];
const DISPOSITIVOS = ['todos', 'celular', 'compu'];
const PAGINAS = ['todas', 'fichas'];
const PIENSA = ['rapido', 'normal', 'mas'];

const POR_DEFECTO = {
  modo: 'prueba',
  dispositivos: 'todos',
  paginas: 'todas',
  nombre: 'Asistente Blacks',
  saludo: '¡Hola! Soy el asistente con IA de Blacks ✦ Te ayudo a encontrar tu talle, ver stock y precios, armar tu carrito o cotizar por mayor. ¿Qué estás buscando?',
  sugerencias: ['¿Qué talle soy?', 'Busco ropa de trabajo', 'Envíos y cambios', 'Comprar por mayor'],
  minimoMayorista: 10,
  whatsappMayorista: '5491153248230',
  whatsappMinorista: '5491151456431',
  topeMensajes: 30,
  piensa: 'normal',
  aviso: true,
  instrucciones: '',
};

const LIMITES = { nombre: 30, saludo: 400, sugerencia: 40, sugerencias: 4, instrucciones: 1000 };

const texto = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const entero = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};
const telefono = (v, def) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : def;
};

function normalizarAjustes(a = {}) {
  const d = POR_DEFECTO;
  const sugerencias = Array.isArray(a.sugerencias)
    ? a.sugerencias.map((s) => texto(s, LIMITES.sugerencia)).filter(Boolean).slice(0, LIMITES.sugerencias)
    : d.sugerencias;
  return {
    modo: MODOS.includes(a.modo) ? a.modo : d.modo,
    dispositivos: DISPOSITIVOS.includes(a.dispositivos) ? a.dispositivos : d.dispositivos,
    paginas: PAGINAS.includes(a.paginas) ? a.paginas : d.paginas,
    nombre: texto(a.nombre, LIMITES.nombre) || d.nombre,
    saludo: texto(a.saludo, LIMITES.saludo) || d.saludo,
    sugerencias,
    minimoMayorista: entero(a.minimoMayorista, 2, 100, d.minimoMayorista),
    whatsappMayorista: telefono(a.whatsappMayorista, d.whatsappMayorista),
    whatsappMinorista: telefono(a.whatsappMinorista, d.whatsappMinorista),
    topeMensajes: entero(a.topeMensajes, 5, 100, d.topeMensajes),
    piensa: PIENSA.includes(a.piensa) ? a.piensa : d.piensa,
    aviso: a.aviso !== false,
    instrucciones: texto(a.instrucciones, LIMITES.instrucciones),
  };
}

async function getAjustes() {
  await ensureSchema();
  const { rows } = await pool.query('SELECT datos, actualizado FROM ia_web_ajustes WHERE id = 1');
  return { ajustes: normalizarAjustes(rows[0]?.datos || {}), actualizado: rows[0]?.actualizado || null, porDefecto: POR_DEFECTO, limites: LIMITES };
}

async function saveAjustes(cambios = {}) {
  await ensureSchema();
  const { ajustes: actuales } = await getAjustes();
  const nuevos = normalizarAjustes({ ...actuales, ...(cambios || {}) });
  await pool.query(
    `INSERT INTO ia_web_ajustes (id, datos, actualizado) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now()`,
    [JSON.stringify(nuevos)]
  );
  return getAjustes();
}

/* ---------------- charlas ---------------- */

// Lo que guarda el cotizador en `resultado`, con el nombre que ve el dueño.
const RESULTADOS = {
  carrito: 'Le armó el carrito',
  clic_carrito: 'Tocó "Agregar al carrito"',
  mayorista: 'Lo pasó al WhatsApp mayorista',
  clic_mayorista: 'Tocó el WhatsApp mayorista',
  cambios: 'Cambios y devoluciones',
  persona: 'Pidió una persona',
  clic_minorista: 'Tocó el WhatsApp minorista',
  reclamo: 'Reclamo',
  insulto: 'Insultos',
  fuera_de_tema: 'Fuera de tema',
  no_supo: 'No supo contestar',
  tope: 'Llegó al tope de mensajes',
  error: 'Error',
};

// Las charlas se guardan 90 días (lo dice el aviso de la ventanita).
const DIAS_GUARDADAS = 90;
let ultimaLimpieza = 0;
async function borrarViejas() {
  if (Date.now() - ultimaLimpieza < 6 * 3600 * 1000) return;
  ultimaLimpieza = Date.now();
  await pool.query(`DELETE FROM ia_web_charlas WHERE actualizada < now() - ($1 || ' days')::interval`, [String(DIAS_GUARDADAS)]);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// desde / hasta: 'AAAA-MM-DD' (hora de Argentina). filtro: una clave de
// RESULTADOS, 'sin_revisar', 'prueba' o 'todas'. q: texto a buscar en los mensajes.
async function listar({ desde, hasta, filtro = 'todas', q = '', limite = 200 } = {}) {
  await ensureSchema();
  await borrarViejas().catch((err) => console.warn('[asistente-web] No pude borrar charlas viejas:', err.message));
  const d = FECHA.test(String(desde)) ? desde : new Date(Date.now() - 29 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const h = FECHA.test(String(hasta)) ? hasta : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const rango = `actualizada >= ($1::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
    AND actualizada < ($2::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'`;

  // Los números de arriba: sin las de prueba, para no inflarlos.
  const { rows: [s] } = await pool.query(
    `SELECT count(*)::int AS charlas,
            coalesce(sum(cantidad), 0)::int AS mensajes,
            count(*) FILTER (WHERE 'carrito' = ANY(resultado))::int AS carritos,
            count(*) FILTER (WHERE 'clic_carrito' = ANY(resultado))::int AS clic_carrito,
            coalesce(sum(carrito_total) FILTER (WHERE 'clic_carrito' = ANY(resultado)), 0)::numeric AS monto_clic,
            count(*) FILTER (WHERE 'mayorista' = ANY(resultado))::int AS mayorista,
            count(*) FILTER (WHERE 'clic_mayorista' = ANY(resultado))::int AS clic_mayorista,
            count(*) FILTER (WHERE 'cambios' = ANY(resultado))::int AS cambios,
            count(*) FILTER (WHERE resultado && ARRAY['persona','reclamo','insulto'])::int AS persona,
            count(*) FILTER (WHERE 'no_supo' = ANY(resultado))::int AS no_supo,
            count(*) FILTER (WHERE resultado && ARRAY['error','tope'])::int AS errores,
            count(*) FILTER (WHERE dispositivo = 'celular')::int AS celular,
            coalesce(sum(tokens), 0)::bigint AS tokens,
            count(*) FILTER (WHERE NOT revisada)::int AS sin_revisar
       FROM ia_web_charlas WHERE NOT prueba AND ${rango}`,
    [d, h]
  );
  const { rows: [p] } = await pool.query(`SELECT count(*)::int AS n FROM ia_web_charlas WHERE prueba AND ${rango}`, [d, h]);

  const params = [d, h];
  let extra = filtro === 'prueba' ? ' AND prueba' : ' AND NOT prueba';
  if (filtro === 'sin_revisar') extra += ' AND NOT revisada';
  else if (RESULTADOS[filtro]) {
    params.push(filtro);
    extra += ` AND $${params.length} = ANY(resultado)`;
  }
  const busca = String(q || '').trim().slice(0, 80);
  if (busca) {
    params.push(`%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    extra += ` AND (mensajes::text ILIKE $${params.length} OR pagina ILIKE $${params.length})`;
  }
  params.push(Math.min(Math.max(Number(limite) || 200, 1), 500));
  const { rows } = await pool.query(
    `SELECT id, creada, actualizada, pagina, titulo, dispositivo, cantidad, resultado, carrito_total, revisada, prueba,
            (SELECT m->>'texto' FROM jsonb_array_elements(mensajes) m WHERE m->>'rol' = 'cliente' LIMIT 1) AS primero
       FROM ia_web_charlas WHERE ${rango}${extra}
      ORDER BY actualizada DESC LIMIT $${params.length}`,
    params
  );
  return {
    desde: d,
    hasta: h,
    stats: { ...s, monto_clic: Number(s.monto_clic) || 0, tokens: Number(s.tokens) || 0, prueba: p.n },
    charlas: rows.map((r) => ({ ...r, carrito_total: r.carrito_total === null ? null : Number(r.carrito_total) })),
    resultados: RESULTADOS,
  };
}

async function detalle(id) {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM ia_web_charlas WHERE id = $1', [String(id).slice(0, 80)]);
  if (!rows[0]) {
    const err = new Error('No encontré esa charla (las charlas se guardan 90 días).');
    err.status = 404;
    throw err;
  }
  return { ...rows[0], carrito_total: rows[0].carrito_total === null ? null : Number(rows[0].carrito_total), resultados: RESULTADOS };
}

async function marcarRevisada(id, revisada = true) {
  await ensureSchema();
  const { rowCount } = await pool.query('UPDATE ia_web_charlas SET revisada = $2 WHERE id = $1', [String(id).slice(0, 80), Boolean(revisada)]);
  return { ok: rowCount > 0 };
}

module.exports = { SCHEMA_SQL, ensureSchema, getAjustes, saveAjustes, normalizarAjustes, listar, detalle, marcarRevisada, POR_DEFECTO, RESULTADOS };
