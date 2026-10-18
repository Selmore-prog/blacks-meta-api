/* =========================================================================
 * ASISTENTE IA DE LA TIENDA (pestaña "Asistente IA")
 *
 * El globito ✦ de blacksindumentaria.com.ar le habla al cotizador
 * (cotizador-blacks, /api/ia-web), que contesta con el mismo cerebro que el bot
 * de WhatsApp y guarda cada charla en Supabase. Esta pantalla:
 *   - prende, apaga o deja en prueba el globito (modo prueba = sólo se ve
 *     abriendo la tienda con ?ia=1);
 *   - muestra cuántas charlas hubo y qué pasó (carrito, WhatsApp mayorista,
 *     cambios, persona, "no supo");
 *   - deja leer cada charla completa, con lo que se le mostró abajo de cada
 *     respuesta (productos, carrito, botones) y qué tocó la persona;
 *   - cambia los ajustes (saludo, botones de arranque, números, mínimo mayorista…).
 *
 * Lo que SABE la IA (información del negocio y respuestas enseñadas) es el mismo
 * del bot de WhatsApp y se edita en el cotizador (/admin/ia → Lo que sabe).
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, tip, icon, skeleton, panelHead).
 * Backend: src/asistenteWeb.js → /api/asistente/*.
 * ========================================================================= */

const iaState = { data: null, ajustes: null, filtro: 'todas', q: '', guardando: false };
window.iaCargado = false;

const IA_TIENDA = 'https://www.blacksindumentaria.com.ar';
const IA_ADMIN_BOT = 'https://cotizador-blacks.vercel.app/admin/ia';
const iaNum = (n) => Number(n || 0).toLocaleString('es-AR');
const iaPlata = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
const iaDos = (n) => String(n).padStart(2, '0');
// Los links salen de la tienda o del cotizador, pero las charlas las escriben
// visitantes: sólo se enlaza lo que empieza con https://.
const iaUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '#');

function iaFechaHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${iaDos(d.getDate())}/${iaDos(d.getMonth() + 1)} ${iaDos(d.getHours())}:${iaDos(d.getMinutes())}`;
}

function iaHace(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return iaFechaHora(iso);
}

// "/productos/pantalon-cargo/" en vez de la URL entera.
function iaRuta(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? 'Inicio' : decodeURIComponent(u.pathname);
  } catch (_) { return url || ''; }
}

function iaRango() {
  const dias = Number(document.getElementById('ia-periodo').value) || 7;
  const hoy = new Date();
  const ymd = (d) => d.toLocaleDateString('sv-SE');
  return { desde: ymd(new Date(hoy.getTime() - (dias - 1) * 864e5)), hasta: ymd(hoy) };
}

async function asistenteCargar() {
  const body = document.getElementById('asistente-body');
  if (!body) return;
  window.iaCargado = true;
  body.innerHTML = skeleton('stats') + skeleton('rows', 4);
  const { desde, hasta } = iaRango();
  try {
    const [data, ajustes] = await Promise.all([
      api(`/api/asistente/charlas?desde=${desde}&hasta=${hasta}&filtro=${encodeURIComponent(iaState.filtro)}&q=${encodeURIComponent(iaState.q)}`),
      api('/api/asistente/ajustes'),
    ]);
    iaState.data = data;
    iaState.ajustes = ajustes;
    iaRender();
  } catch (err) {
    window.iaCargado = false;
    body.innerHTML = `<div class="panel"><p class="error" style="margin:0">${esc(err.message)}</p>
      <div style="margin-top:12px"><button class="btn-ghost btn-sm" onclick="asistenteCargar()">Reintentar</button></div></div>`;
  }
}

// Sólo la lista (al cambiar el filtro o buscar), sin volver a pedir los ajustes.
async function iaRecargarLista() {
  const cont = document.getElementById('ia-lista');
  if (cont) cont.innerHTML = skeleton('rows', 3);
  const { desde, hasta } = iaRango();
  try {
    iaState.data = await api(`/api/asistente/charlas?desde=${desde}&hasta=${hasta}&filtro=${encodeURIComponent(iaState.filtro)}&q=${encodeURIComponent(iaState.q)}`);
    iaPintarLista();
  } catch (err) {
    if (cont) cont.innerHTML = `<p class="error" style="margin:0">${esc(err.message)}</p>`;
  }
}

let iaBuscarTimer = null;
function asistenteBuscar(valor) {
  clearTimeout(iaBuscarTimer);
  iaBuscarTimer = setTimeout(() => { iaState.q = valor.trim(); iaRecargarLista(); }, 350);
}
function asistenteFiltrar(valor) {
  iaState.filtro = valor;
  iaRecargarLista();
}

/* ---------------- estado y modo ---------------- */

const IA_MODOS = {
  apagado: { titulo: 'Asistente apagado', texto: 'El globito no aparece en la tienda.' },
  prueba: { titulo: 'Asistente en modo prueba', texto: 'Sólo lo ve quien abre la tienda con ?ia=1 (queda recordado en ese navegador; ?ia=0 lo olvida). Sus charlas van aparte, como "prueba".' },
  encendido: { titulo: 'Asistente encendido', texto: 'Lo ven todos los visitantes de la tienda.' },
};

function iaEstado() {
  const a = iaState.ajustes.ajustes;
  const m = IA_MODOS[a.modo] || IA_MODOS.prueba;
  const alcance = [
    a.dispositivos === 'celular' ? 'sólo en celular' : a.dispositivos === 'compu' ? 'sólo en la compu' : '',
    a.paginas === 'fichas' ? 'sólo en las fichas de producto' : '',
  ].filter(Boolean).join(' · ');
  const boton = (modo, label) => `<button class="${a.modo === modo ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="asistenteModo('${modo}')" aria-pressed="${a.modo === modo}">${label}</button>`;
  return `<div class="panel cr-estado">
    <div class="cr-estado-txt">
      <span class="cr-dot ${a.modo === 'encendido' ? 'on' : a.modo === 'prueba' ? 'ia-dot-prueba' : ''}"></span>
      <div>
        <b>${m.titulo} ${tip('Contesta el cotizador con el mismo cerebro que el bot de WhatsApp: lee la tienda con el stock por talle, las descripciones, la información del negocio y las respuestas enseñadas. Recomienda productos, arma el carrito y, desde el mínimo mayorista, pasa al WhatsApp mayorista con el pedido escrito. Usa Gemini.')}</b>
        <span class="hint">${esc(m.texto)}${alcance ? ` (${esc(alcance)})` : ''}
          <a href="${IA_TIENDA}/?ia=1" target="_blank" rel="noopener">Probar en la tienda ↗</a></span>
      </div>
    </div>
    <div class="ia-modos">${boton('apagado', 'Apagado')}${boton('prueba', 'Prueba')}${boton('encendido', 'Encendido')}</div>
  </div>`;
}

async function asistenteModo(modo) {
  if (iaState.ajustes && iaState.ajustes.ajustes.modo === modo) return;
  if (modo === 'encendido' && !window.confirm('¿Prender el asistente para todos?\n\nDesde ahora el globito ✦ aparece a todos los visitantes de la tienda (en un minuto, como mucho).')) return;
  try {
    iaState.ajustes = await api('/api/asistente/ajustes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo }),
    });
    toast(modo === 'encendido' ? 'Asistente encendido: aparece en la tienda en un minuto.' : modo === 'prueba' ? 'Modo prueba: sólo con ?ia=1.' : 'Asistente apagado.', 'ok');
    iaRender();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ---------------- números ---------------- */

function iaKpi(label, valor, sub, ayuda) {
  return `<div class="st-kpi">
    <span class="st-kpi-lbl">${esc(label)} ${tip(ayuda)}</span>
    <b>${valor}</b>
    <span class="st-kpi-prev">${sub || '&nbsp;'}</span>
  </div>`;
}

function iaKpis(s) {
  return [
    iaKpi('Charlas', iaNum(s.charlas), `${iaNum(s.mensajes)} mensajes · ${iaNum(s.celular)} desde el celular`,
      'Personas que escribieron al menos un mensaje en el período (sin las charlas de prueba).'),
    iaKpi('Carritos armados', iaNum(s.carritos), s.clic_carrito ? `${iaNum(s.clic_carrito)} tocaron "Agregar" · ${iaPlata(s.monto_clic)}` : 'nadie tocó "Agregar" todavía',
      'Charlas en las que el asistente armó el carrito con stock real. "Tocaron Agregar" = la persona tocó el botón que suma los productos a su carrito (el monto es el de esos carritos; la compra se ve en Tiendanube).'),
    iaKpi('Al WhatsApp mayorista', iaNum(s.mayorista), s.clic_mayorista ? `${iaNum(s.clic_mayorista)} lo tocaron` : 'nadie lo tocó todavía',
      'Charlas en las que pidió el mínimo mayorista o más, logo o reventa, y el asistente le pasó el botón del WhatsApp mayorista con su pedido escrito.'),
    iaKpi('Consultas de pedidos', iaNum(s.pedidos), 'con número de pedido y mail',
      'Preguntaron por una compra (estado, envío, seguimiento). El asistente sólo muestra el pedido si coinciden el número y el mail con el que se hizo.'),
    iaKpi('Cambios', iaNum(s.cambios), 'plataforma + WhatsApp minorista',
      'Quisieron cambiar o devolver una compra: con el número de pedido y el mail verificados, se les pasó la plataforma de cambios y el WhatsApp minorista.'),
    iaKpi('Pidieron una persona', iaNum(s.persona), 'incluye reclamos',
      'Pidieron hablar con alguien, hicieron un reclamo o insultaron: se les pasó el WhatsApp.'),
    iaKpi('No supo', iaNum(s.no_supo), s.no_supo ? 'enseñale la respuesta en el bot' : '&nbsp;',
      'Preguntas generales que el asistente no pudo contestar con lo que sabe. La respuesta se enseña en el cotizador (/admin/ia → Lo que sabe) y vale para la web y para WhatsApp.'),
    iaKpi('Errores', iaNum(s.errores), 'incluye las que llegaron al tope',
      'Charlas en las que Gemini no contestó (se le ofreció el WhatsApp) o que llegaron al tope de mensajes.'),
    iaKpi('Consumo', iaNum(s.tokens), 'tokens de Gemini',
      'Lo que se le pidió a Gemini en el período (sin las pruebas). Con facturación activa en Google AI Studio, ahí se ve el costo exacto.'),
  ].join('');
}

/* ---------------- lista de charlas ---------------- */

const IA_FILTROS = {
  todas: 'Todas',
  sin_revisar: 'Sin revisar',
  carrito: 'Le armó el carrito',
  clic_carrito: 'Tocó "Agregar al carrito"',
  mayorista: 'WhatsApp mayorista',
  pedido: 'Consultas de pedidos',
  cambios: 'Cambios',
  persona: 'Pidió una persona',
  reclamo: 'Reclamos',
  no_supo: 'No supo contestar',
  fuera_de_tema: 'Fuera de tema',
  error: 'Errores',
  prueba: 'De prueba',
};

// Las etiquetas que importan para auditar, con color.
const IA_ETIQUETAS = {
  carrito: ['Carrito', 'ok'], clic_carrito: ['Tocó Agregar', 'ok'],
  mayorista: ['Mayorista', 'naranja'], clic_mayorista: ['Fue al WhatsApp', 'naranja'],
  pedido: ['Pedido', ''], clic_seguimiento: ['Siguió el envío', 'ok'],
  cambios: ['Cambios', ''], persona: ['Pidió persona', ''], clic_minorista: ['WhatsApp minorista', ''],
  reclamo: ['Reclamo', 'rojo'], insulto: ['Insultos', 'rojo'], fuera_de_tema: ['Fuera de tema', ''],
  no_supo: ['No supo', 'rojo'], tope: ['Tope', 'rojo'], error: ['Error', 'rojo'],
};
function iaEtiquetas(resultado) {
  return (resultado || []).filter((r) => IA_ETIQUETAS[r])
    .map((r) => `<span class="badge ia-tag ${IA_ETIQUETAS[r][1]}">${esc(IA_ETIQUETAS[r][0])}</span>`).join('');
}

function iaPintarLista() {
  const cont = document.getElementById('ia-lista');
  if (!cont || !iaState.data) return;
  const lista = iaState.data.charlas;
  if (!lista.length) {
    cont.innerHTML = `<p class="hint" style="margin:6px 0 0;">${iaState.filtro === 'todas' && !iaState.q
      ? 'Todavía no hay charlas en este período.' : 'Ninguna charla con ese filtro.'}</p>`;
    return;
  }
  cont.innerHTML = lista.map((c) => `<button type="button" class="ia-fila${c.revisada ? ' revisada' : ''}" onclick="asistenteAbrir('${esc(c.id)}')">
      <span class="ia-fila-top">
        <b>${esc(c.primero || '(sin mensajes)')}</b>
        <span class="ia-fila-meta">${esc(iaHace(c.actualizada))} · ${c.dispositivo === 'celular' ? 'celular' : 'compu'} · ${iaNum(c.cantidad)} mensaje${c.cantidad === 1 ? '' : 's'}${c.carrito_total ? ` · carrito ${iaPlata(c.carrito_total)}` : ''}</span>
      </span>
      <span class="ia-fila-tags">${c.prueba ? '<span class="badge type">Prueba</span>' : ''}${iaEtiquetas(c.resultado)}${c.revisada ? '<span class="badge status-approved">Revisada</span>' : ''}</span>
      ${c.pagina ? `<span class="ia-fila-pag">Empezó en ${esc(iaRuta(c.pagina))}</span>` : ''}
    </button>`).join('')
    + (lista.length >= 200 ? '<p class="hint" style="margin:8px 0 0;">Se muestran las 200 charlas más nuevas del período.</p>' : '');
}

/* ---------------- una charla ---------------- */

function iaBloques(b) {
  if (!b) return '';
  const partes = [];
  if (b.productos && b.productos.length) {
    partes.push(`<div class="ia-bloque"><span>Le mostró</span>${b.productos.map((p) => `<a href="${esc(iaUrl(p.url))}" target="_blank" rel="noopener">${esc(p.nombre)}</a> <small>${iaPlata(p.precio)}${p.stock ? ` · ${esc(p.stock)}` : ''}</small>`).join('<br>')}</div>`);
  }
  if (b.carrito && b.carrito.lineas && b.carrito.lineas.length) {
    const lineas = b.carrito.lineas.map((l) => (l.link
      ? `${l.cantidad} × ${esc(l.nombre)} (${esc(l.opciones)}) · ${iaPlata(l.precio * l.cantidad)}`
      : `${esc(l.nombre)}: ${l.problema === 'mayorista' ? 'por cantidad, mayorista' : l.problema === 'sin stock' ? 'sin stock' : 'faltó elegir'}${l.hay && l.hay.length ? ` (hay ${esc(l.hay.join(', '))})` : ''}`)).join('<br>');
    partes.push(`<div class="ia-bloque"><span>Carrito${b.carrito.total ? ` · ${iaPlata(b.carrito.total)}` : ''}</span>${lineas}${b.carrito.link ? `<br><a href="${esc(iaUrl(b.carrito.link))}" target="_blank" rel="noopener">Link del carrito ↗</a>` : ''}</div>`);
  }
  if (b.pedido) {
    const p = b.pedido;
    partes.push(`<div class="ia-bloque"><span>Pedido #${esc(p.numero)} (verificado)</span>${esc(p.estado)}${p.pago ? ` · ${esc(p.pago)}` : ''}${p.metodo ? `<br><small>${esc(p.metodo)}${p.seguimiento ? ` · seguimiento ${esc(p.seguimiento)}` : ''}</small>` : ''}${p.productos && p.productos.length ? `<br><small>${p.productos.map((x) => `${x.cantidad} × ${esc(x.nombre)}`).join(' · ')}</small>` : ''}</div>`);
  }
  if (b.botones && b.botones.length) {
    partes.push(`<div class="ia-bloque"><span>Botones</span>${b.botones.map((x) => `<a href="${esc(iaUrl(x.url))}" target="_blank" rel="noopener">${esc(x.texto)} ↗</a>`).join('<br>')}</div>`);
  }
  return partes.join('');
}

function iaCerrarCharla() {
  const o = document.getElementById('ia-charla-modal');
  if (o) o.remove();
}

async function asistenteAbrir(id) {
  iaCerrarCharla();
  const o = document.createElement('div');
  o.id = 'ia-charla-modal';
  o.className = 'modal-overlay';
  o.innerHTML = `<div class="modal ia-modal"><div class="modal-header"><h2>Charla</h2>
    <button class="btn-close" onclick="iaCerrarCharla()" aria-label="Cerrar">&times;</button></div>
    <div class="modal-body"><p class="loading">Cargando…</p></div></div>`;
  o.addEventListener('click', (e) => { if (e.target === o) iaCerrarCharla(); });
  document.body.appendChild(o);
  const cuerpo = o.querySelector('.modal-body');
  try {
    const c = await api(`/api/asistente/charla/${encodeURIComponent(id)}`);
    const msgs = (c.mensajes || []).map((m) => `<div class="ia-msg ${m.rol === 'cliente' ? 'cliente' : 'ia'}">
        <div class="ia-msg-txt">${esc(m.texto).replace(/\n/g, '<br>')}</div>
        ${m.rol === 'ia' ? iaBloques(m.bloques) : ''}
        <div class="ia-msg-meta">${esc(iaFechaHora(m.t))}${m.ms ? ` · ${(m.ms / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} s` : ''}${m.consulta && m.consulta.respondida === false ? ' · <b class="ia-rojo">no supo contestar</b>' : ''}${m.resultado && m.resultado.length ? ` · ${esc(m.resultado.join(', '))}` : ''}</div>
      </div>`).join('');
    const clics = (c.resultado || []).filter((r) => r.startsWith('clic_'));
    cuerpo.innerHTML = `<div class="ia-charla-meta">
        <span>${esc(iaFechaHora(c.creada))} → ${esc(iaFechaHora(c.actualizada))}</span>
        <span>${c.dispositivo === 'celular' ? 'Celular' : 'Compu'}</span>
        ${c.pagina ? `<a href="${esc(iaUrl(c.pagina))}" target="_blank" rel="noopener">${esc(c.titulo || iaRuta(c.pagina))} ↗</a>` : ''}
        <span>${iaNum(c.tokens)} tokens${c.modelo ? ` · ${esc(c.modelo)}` : ''}</span>
      </div>
      <div class="ia-fila-tags" style="margin-bottom:12px">${c.prueba ? '<span class="badge type">Prueba</span>' : ''}${iaEtiquetas(c.resultado)}</div>
      ${clics.length ? '' : '<p class="hint" style="margin:0 0 12px">No tocó ningún botón de las respuestas (carrito, WhatsApp ni productos).</p>'}
      <div class="ia-transcript">${msgs || '<p class="hint">Sin mensajes.</p>'}</div>
      <div style="margin-top:16px; display:flex; gap:8px; justify-content:flex-end;">
        <button class="${c.revisada ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="asistenteRevisada('${esc(c.id)}', ${c.revisada ? 'false' : 'true'})">
          ${c.revisada ? 'Marcar sin revisar' : 'Marcar revisada'}</button>
      </div>`;
  } catch (err) {
    cuerpo.innerHTML = `<p class="error" style="margin:0">${esc(err.message)}</p>`;
  }
}

async function asistenteRevisada(id, revisada) {
  try {
    await api(`/api/asistente/charla/${encodeURIComponent(id)}/revisada`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisada }),
    });
    const c = iaState.data && iaState.data.charlas.find((x) => x.id === id);
    if (c) c.revisada = revisada;
    iaPintarLista();
    iaCerrarCharla();
    toast(revisada ? 'Charla revisada.' : 'Vuelve a "sin revisar".', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ---------------- ajustes ---------------- */

function iaAjustes() {
  const { ajustes: a, limites: L, porDefecto: d } = iaState.ajustes;
  const opcion = (valor, actual, label) => `<option value="${valor}"${valor === actual ? ' selected' : ''}>${label}</option>`;
  const sug = [0, 1, 2, 3].map((i) => `<input class="input" id="ia-sug-${i}" maxlength="${L.sugerencia}" value="${esc(a.sugerencias[i] || '')}" placeholder="${esc(d.sugerencias[i] || '')}">`).join('');
  return `<details class="panel ia-ajustes">
    <summary>${panelHead('Ajustes del asistente', 'Se guardan en Supabase y la tienda los toma en un minuto. Lo que SABE la IA (información del negocio, respuestas enseñadas, marca preferida) es lo mismo del bot de WhatsApp y se edita en el cotizador.')}</summary>
    <p class="hint">Para cambiar lo que sabe la IA (envíos, cambios, preguntas frecuentes, marca preferida) entrá a <a href="${IA_ADMIN_BOT}" target="_blank" rel="noopener">cotizador → Asistente IA → Lo que sabe ↗</a>: vale para la web y para WhatsApp.</p>
    <div class="grid-2">
      <div class="field"><label>Dónde aparece</label>
        <select class="input" id="ia-dispositivos">${opcion('todos', a.dispositivos, 'Celular y compu')}${opcion('celular', a.dispositivos, 'Sólo celular')}${opcion('compu', a.dispositivos, 'Sólo compu')}</select></div>
      <div class="field"><label>En qué páginas</label>
        <select class="input" id="ia-paginas">${opcion('todas', a.paginas, 'Todas')}${opcion('fichas', a.paginas, 'Sólo fichas de producto')}</select></div>
      <div class="field"><label>Nombre ${tip('Lo que se ve arriba de la ventanita y como se presenta.')}</label>
        <input class="input" id="ia-nombre" maxlength="${L.nombre}" value="${esc(a.nombre)}"></div>
      <div class="field"><label>Cuánto piensa ${tip('Más es más lento (unos segundos) y gasta más, pero se equivoca menos. Para la web conviene Normal: la gente espera la respuesta mirando la pantalla.')}</label>
        <select class="input" id="ia-piensa">${opcion('rapido', a.piensa, 'Rápido')}${opcion('normal', a.piensa, 'Normal')}${opcion('mas', a.piensa, 'Más')}</select></div>
    </div>
    <div class="field"><label>Saludo ${tip('El primer mensaje de la ventanita. No gasta Gemini: lo pone la tienda.')}</label>
      <textarea class="input" id="ia-saludo" maxlength="${L.saludo}" rows="3">${esc(a.saludo)}</textarea></div>
    <div class="field"><label>Botones de arranque ${tip('Las respuestas rápidas que aparecen debajo del saludo. Hasta 4, cortas. Vacío = el de siempre.')}</label>
      <div class="ia-sugs">${sug}</div></div>
    <div class="grid-2">
      <div class="field"><label>Mínimo mayorista (unidades) ${tip('Desde esta cantidad le pasa el WhatsApp mayorista con su pedido escrito en vez de armarle el carrito.')}</label>
        <input class="input" id="ia-minimo" type="number" min="2" max="100" value="${a.minimoMayorista}"></div>
      <div class="field"><label>Tope de mensajes por charla ${tip('Cuando la persona llega a esta cantidad de mensajes, el asistente le pasa el WhatsApp y termina la charla. Frena el abuso.')}</label>
        <input class="input" id="ia-tope" type="number" min="5" max="100" value="${a.topeMensajes}"></div>
      <div class="field"><label>WhatsApp mayorista</label>
        <input class="input" id="ia-wa-mayorista" inputmode="numeric" value="${esc(a.whatsappMayorista)}" placeholder="5491153248230"></div>
      <div class="field"><label>WhatsApp minorista (cambios y personas)</label>
        <input class="input" id="ia-wa-minorista" inputmode="numeric" value="${esc(a.whatsappMinorista)}" placeholder="5491151456431"></div>
    </div>
    <label class="ia-check"><input type="checkbox" id="ia-aviso"${a.aviso ? ' checked' : ''}> Mostrar una vez el cartelito "Preguntale a la IA" al lado del globito</label>
    <div class="field" style="margin-top:14px"><label>Indicaciones extra para la IA ${tip('Lo que quieras que tenga en cuenta además de lo de siempre: una promo del momento, algo que no tiene que ofrecer, cómo recomendar. Valen más que las instrucciones de base, salvo las reglas de no inventar precios ni stock.')}</label>
      <textarea class="input" id="ia-instrucciones" maxlength="${L.instrucciones}" rows="3" placeholder="Ej: esta semana hay 20% OFF en camperas; si preguntan por ropa de dama, recomendá primero la línea Pampero Mujer.">${esc(a.instrucciones)}</textarea></div>
    <div style="display:flex; justify-content:flex-end; gap:8px;">
      <button class="btn-primary" onclick="asistenteGuardar(this)">${icon('save')} Guardar ajustes</button>
    </div>
  </details>`;
}

async function asistenteGuardar(boton) {
  if (iaState.guardando) return;
  const v = (id) => document.getElementById(id).value;
  const cambios = {
    dispositivos: v('ia-dispositivos'),
    paginas: v('ia-paginas'),
    nombre: v('ia-nombre'),
    piensa: v('ia-piensa'),
    saludo: v('ia-saludo'),
    sugerencias: [0, 1, 2, 3].map((i) => v(`ia-sug-${i}`).trim()).filter(Boolean),
    minimoMayorista: Number(v('ia-minimo')),
    topeMensajes: Number(v('ia-tope')),
    whatsappMayorista: v('ia-wa-mayorista'),
    whatsappMinorista: v('ia-wa-minorista'),
    aviso: document.getElementById('ia-aviso').checked,
    instrucciones: v('ia-instrucciones'),
  };
  if (!cambios.sugerencias.length) delete cambios.sugerencias;
  iaState.guardando = true;
  boton.disabled = true;
  try {
    iaState.ajustes = await api('/api/asistente/ajustes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    });
    toast('Ajustes guardados: la tienda los toma en un minuto.', 'ok');
    iaRender({ ajustesAbiertos: true });
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    iaState.guardando = false;
    boton.disabled = false;
  }
}

/* ---------------- pintar todo ---------------- */

function iaRender({ ajustesAbiertos = false } = {}) {
  const d = iaState.data;
  const body = document.getElementById('asistente-body');
  if (!body || !d || !iaState.ajustes) return;
  const abiertos = ajustesAbiertos || Boolean(body.querySelector('.ia-ajustes[open]'));
  body.innerHTML = `
    ${iaEstado()}
    <div class="st-range"><b>${esc(d.desde)} → ${esc(d.hasta)}</b>${d.stats.prueba ? `<span>+ ${iaNum(d.stats.prueba)} charla${d.stats.prueba === 1 ? '' : 's'} de prueba (no cuentan)</span>` : ''}</div>
    <div class="st-kpis">${iaKpis(d.stats)}</div>
    <div class="panel" style="margin-bottom:18px;">
      ${panelHead('Charlas', 'Una por persona y por día (la charla sigue 24 h en su navegador). Tocá una para leerla entera, con los productos, el carrito y los botones que se le mostraron. Se guardan 90 días.',
        `<input class="input ia-buscar" type="search" placeholder="Buscar en los mensajes…" value="${esc(iaState.q)}" oninput="asistenteBuscar(this.value)">
         <select class="input cr-filtro" onchange="asistenteFiltrar(this.value)">
          ${Object.entries(IA_FILTROS).map(([id, label]) => `<option value="${id}"${iaState.filtro === id ? ' selected' : ''}>${esc(label)}${id === 'sin_revisar' && d.stats.sin_revisar ? ` (${d.stats.sin_revisar})` : ''}</option>`).join('')}
        </select>`)}
      <div id="ia-lista"></div>
    </div>
    ${iaAjustes()}`;
  if (abiertos) body.querySelector('.ia-ajustes').setAttribute('open', '');
  iaPintarLista();
}

window.asistenteCargar = asistenteCargar;
