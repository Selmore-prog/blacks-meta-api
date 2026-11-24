/* =========================================================================
 * EMAIL MARKETING (pestaña "Email")
 *
 * Tres pantallas: Campañas (lista, editor y reporte), Audiencias y Ajustes.
 * El mail se arma con bloques a la izquierda y se ve a la derecha tal como llega
 * (lo dibuja el servidor: src/email/plantilla.js, el mismo código que envía).
 *
 * Enviar pide escribir cuántas personas lo van a recibir: si ese número cambió
 * desde que se abrió la ventana, el servidor no lo manda.
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, tip, icon, skeleton,
 * showInfoModal). Backend: src/email/rutas.js.
 * ========================================================================= */

const emState = { d: null, pane: 'campanias', c: null, ancho: 'pc', guardarT: null, vistaT: null, vistaN: 0, sucio: false, guardando: null };
window.emCargado = false;

// esc() de dashboard.js no escapa comillas y acá van textos adentro de atributos.
const emE = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const emNum = (n) => Number(n || 0).toLocaleString('es-AR');
const emPct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('es-AR')}%` : '—');
const emPlata = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`;
const emBody = () => document.getElementById('email-body');
const emJson = (metodo, body) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function emFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });
}

const EM_ESTADO = { borrador: 'Borrador', programada: 'Programada', enviando: 'Enviando', pausada: 'Pausada', enviada: 'Enviada', cancelada: 'Cancelada' };
const EM_TIPO = { minorista: 'Minorista', mayorista: 'Mayorista' };
const EM_BLOQUES = {
  titulo: 'Título', texto: 'Texto', imagen: 'Foto', estrella: 'Producto destacado', productos: 'Productos', boton: 'Botón',
  beneficios: 'Beneficios', cupon: 'Cupón', separador: 'Línea', firma: 'Firma',
};

async function emailCargar() {
  window.emCargado = true;
  if (!emState.d) emBody().innerHTML = skeleton('rows', 4);
  try {
    emState.d = await api('/api/email/inicio');
    emPintar();
  } catch (e) {
    window.emCargado = false;
    emBody().innerHTML = `<div class="em-vacio"><p>No se pudo cargar: ${emE(e.message)}</p><button class="btn-ghost" onclick="emailCargar()">Reintentar</button></div>`;
  }
}
window.emailCargar = emailCargar;

async function emPane(p) {
  if (emState.sucio && !(await emGuardar()) && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
  emState.pane = p; emState.c = null; emState.sucio = false;
  emPintar();
  // Al volver a Campañas o Audiencias, los números del momento.
  try { emState.d = await api('/api/email/inicio'); if (emState.pane === p && !emState.c && p !== 'ajustes') emPintar(); } catch (_) { /* queda lo que había */ }
}
window.emPane = emPane;

function emPintar() {
  const { d, pane } = emState;
  document.querySelectorAll('#em-tabs button').forEach((b) => { b.classList.toggle('active', b.dataset.pane === pane); b.setAttribute('aria-pressed', b.dataset.pane === pane); });
  const avisoEnvio = d.proveedor ? '' : `<div class="em-aviso">${icon('alert')}<div><b>Falta conectar el servicio de envío.</b> Podés armar mails, cargar audiencias y bajar el HTML para pegarlo en Perfit. <button class="em-link" onclick="emPane('ajustes')">Cómo conectarlo</button></div></div>`;
  if (pane === 'campanias') emBody().innerHTML = avisoEnvio + emCampanias();
  if (pane === 'audiencias') emBody().innerHTML = emAudiencias();
  if (pane === 'ajustes') emBody().innerHTML = emAjustes();
}

/* ------------------------------ Campañas ------------------------------ */

function emCampanias() {
  const { campanias } = emState.d;
  const filas = campanias.map((c) => {
    const salio = ['enviando', 'pausada', 'enviada', 'cancelada'].includes(c.estado);
    const cuando = c.estado === 'programada' ? `Sale el ${emFecha(c.programada_para)}` : salio ? emFecha(c.empezo) : `Editado el ${emFecha(c.actualizado)}`;
    return `<button class="em-fila" onclick="${salio ? `emReporte(${c.id})` : `emEditar(${c.id})`}">
      <span class="em-fila-n"><b>${emE(c.nombre)}</b><small>${emE(c.asunto || 'Sin asunto')}</small>${c.aviso ? `<small class="em-mal">${emE(c.aviso)}</small>` : ''}</span>
      <span class="em-estado em-${c.estado}">${EM_ESTADO[c.estado] || c.estado}</span>
      <span class="em-fila-f">${cuando}</span>
      <span class="em-fila-m">${salio ? `<b>${emNum(c.enviados)}</b><small>${c.pendientes ? `de ${emNum(c.total)}` : 'enviados'}</small>` : ''}</span>
      <span class="em-fila-m">${salio ? `<b>${emPct(c.abrieron, c.enviados)}</b><small>abrieron</small>` : ''}</span>
      <span class="em-fila-m">${salio ? `<b>${emPct(c.tocaron, c.enviados)}</b><small>tocaron</small>` : ''}</span>
    </button>`;
  }).join('');
  return `<div class="em-cab"><h3>Campañas</h3><button class="btn-primary" onclick="emNueva()">${icon('plus')} Nueva campaña</button></div>
    ${filas ? `<div class="em-lista">${filas}</div>` : '<div class="em-vacio"><p>Todavía no hay campañas. Empezá eligiendo un diseño.</p></div>'}`;
}

function emNueva() {
  const tarjetas = emState.d.plantillas.map((p) => `<button class="em-plantilla" onclick="emCrear('${p.clave}')"><span class="em-mini em-mini-${p.tema}"><i></i><i></i><i></i></span><b>${emE(p.nombre)}</b><small>${emE(p.detalle)}</small></button>`).join('');
  emState.modal = showInfoModal('Elegí un diseño', `<div class="em-plantillas">${tarjetas}</div>`);
}
window.emNueva = emNueva;

async function emCrear(plantilla) {
  try {
    const c = await api('/api/email/campanias', emJson('POST', { plantilla }));
    if (emState.modal) emState.modal.remove();
    emEditar(c.id);
  } catch (e) { toast(e.message, 'error'); }
}
window.emCrear = emCrear;

/* ------------------------------- Editor ------------------------------- */

async function emEditar(id) {
  emBody().innerHTML = skeleton('rows', 5);
  try {
    const c = await api(`/api/email/campanias/${id}`);
    c.mapaProductos = new Map(c.productos.map((p) => [Number(p.id), p]));
    emState.c = c;
    emState.sucio = false;
    emPintarEditor();
  } catch (e) { toast(e.message, 'error'); emailCargar(); }
}
window.emEditar = emEditar;

function emPintarEditor() {
  const { c, d } = emState;
  const fija = c.estado !== 'borrador';
  const listas = (clave) => d.listas.map((l) => `<label class="em-check"><input type="checkbox" ${c[clave].includes(l.id) ? 'checked' : ''} onchange="emLista('${clave}', ${l.id}, this.checked)"> <span>${emE(l.nombre)}</span> <small>${emNum(l.activos)}</small></label>`).join('');
  emBody().innerHTML = `
    <div class="em-cab"><button class="btn-ghost btn-sm" onclick="emSalir()">← Campañas</button>
      <span class="em-guardado" id="em-guardado" role="status">${fija ? 'No se puede editar: ya está programada.' : 'Guardado'}</span>
      <div class="em-acciones">
        <button class="btn-ghost" onclick="emPrueba()">Mandar prueba</button>
        <button class="btn-ghost" onclick="emArchivo()">Bajar HTML</button>
        ${fija ? `<button class="btn-ghost" onclick="emAccion('cancelar')">Cancelar el envío programado</button>` : '<button class="btn-primary" onclick="emEnviar()">Enviar…</button>'}
      </div></div>
    <div class="em-editor"><div class="em-form" ${fija ? 'inert' : ''}>
      <section class="em-caja"><h4>Qué es</h4>
        <label class="em-campo"><span>Nombre (sólo lo ves vos)</span><input class="input" value="${emE(c.nombre)}" oninput="emCampo('nombre', this.value)"></label>
        <label class="em-campo"><span>Asunto</span><input class="input" id="em-asunto" maxlength="150" value="${emE(c.asunto)}" oninput="emCampo('asunto', this.value)"><small id="em-asunto-n"></small></label>
        <label class="em-campo"><span>Texto al lado del asunto</span><input class="input" id="em-preheader" maxlength="150" value="${emE(c.preheader)}" oninput="emCampo('preheader', this.value)"></label>
        <details class="em-ia"><summary>${icon('wand')} Escribir con IA</summary><textarea class="input" id="em-idea" rows="3" placeholder="Ej: Black Friday del 27 al 30, el jean a $39.999 y llevando 2 el envío es gratis"></textarea><button class="btn-ghost btn-sm" id="em-ia-btn" onclick="emRedactar()">Proponer textos</button><div id="em-ia-res"></div></details>
        <div class="em-dos"><label class="em-campo"><span>Sale desde</span><select class="input" onchange="emCampo('remitente_email', this.value)">${d.ajustes.remitentes.map((r) => `<option value="${emE(r.email)}" ${r.email === c.remitente_email ? 'selected' : ''}>${emE(r.email)}</option>`).join('')}</select></label>
        <label class="em-campo"><span>Con el nombre</span><input class="input" value="${emE(c.remitente_nombre)}" oninput="emCampo('remitente_nombre', this.value)"></label></div>
        <label class="em-campo"><span>Las respuestas llegan a</span><input class="input" type="email" value="${emE(c.responder_a)}" oninput="emCampo('responder_a', this.value)"></label>
      </section>
      <section class="em-caja"><h4>A quién</h4>
        ${d.listas.length ? `<div class="em-checks">${listas('listas')}</div><details class="em-mas"><summary>Afinar</summary><p class="em-sub">No mandarle a los de:</p><div class="em-checks">${listas('excluir')}</div>
          <label class="em-check"><input type="checkbox" ${c.filtro.movidos ? 'checked' : ''} onchange="emFiltro('movidos', this.checked)"> <span>Sólo quien compró, abrió o tocó un mail en el último año</span></label>
          <label class="em-campo"><span>No repetir a quien recibió un mail en los últimos (días, 0 = no importa)</span><input class="input" type="number" min="0" max="60" value="${Number(c.filtro.diasSinMail || 0)}" oninput="emFiltro('diasSinMail', Number(this.value))"></label></details>`
    : '<p class="em-sub">Todavía no hay listas. Cargalas en Audiencias.</p>'}
        <p class="em-personas"><b id="em-personas">${emNum(c.personas)}</b> personas lo van a recibir</p>
      </section>
      <section class="em-caja"><h4>Diseño</h4>
        <div class="em-dos"><label class="em-campo"><span>Fondo</span><select class="input" onchange="emCampo('tema', this.value)"><option value="claro" ${c.tema === 'claro' ? 'selected' : ''}>Claro</option><option value="negro" ${c.tema === 'negro' ? 'selected' : ''}>Negro</option></select></label>
        <label class="em-campo"><span>% por transferencia (0 = no mostrar)</span><input class="input" type="number" min="0" max="50" value="${c.descuento_transferencia}" oninput="emCampo('descuento_transferencia', Number(this.value))"></label></div>
        <label class="em-check"><input type="checkbox" ${c.precios === 'oferta' ? 'checked' : ''} onchange="emCampo('precios', this.checked ? 'oferta' : 'tienda')"> <span>Mostrar los precios de la oferta programada ${tip('Para ver y bajar el mail antes de que arranque la oferta. Si lo enviás desde acá, sólo sale cuando la tienda ya tiene esos precios.')}</span></label>
        <div id="em-bloques"></div>
        <div class="em-agregar"><span>Agregar:</span>${Object.entries(EM_BLOQUES).map(([k, n]) => `<button class="btn-ghost btn-sm" onclick="emAgregar('${k}')">${n}</button>`).join('')}</div>
      </section></div>
      <div class="em-vista"><div class="em-vista-cab"><div class="view-toggle" role="group" aria-label="Ancho de la vista previa"><button class="btn-sm ${emState.ancho === 'pc' ? 'active' : ''}" onclick="emAncho('pc')">Computadora</button><button class="btn-sm ${emState.ancho === 'cel' ? 'active' : ''}" onclick="emAncho('cel')">Celular</button></div></div>
        <div class="em-bandeja" id="em-bandeja"></div>
        <iframe id="em-iframe" class="em-iframe em-${emState.ancho}" title="Vista previa del mail" sandbox="allow-same-origin"></iframe>
        <div id="em-avisos"></div></div></div>`;
  emPintarBloques();
  emVista();
}

function emCampo(k, v) { emState.c[k] = v; emTocado(); }
function emFiltro(k, v) { emState.c.filtro = { ...emState.c.filtro, [k]: v }; emTocado(); }
function emLista(clave, id, si) { const s = new Set(emState.c[clave]); if (si) s.add(id); else s.delete(id); emState.c[clave] = [...s]; emTocado(); }
Object.assign(window, { emCampo, emFiltro, emLista });

function emTocado() {
  emState.sucio = true;
  const g = document.getElementById('em-guardado');
  if (g) g.textContent = 'Guardando…';
  clearTimeout(emState.guardarT); clearTimeout(emState.vistaT);
  emState.guardarT = setTimeout(emGuardar, 900);
  emState.vistaT = setTimeout(emVista, 350);
}

async function emGuardar() {
  clearTimeout(emState.guardarT);
  if (emState.guardando) await emState.guardando;
  const c = emState.c;
  if (!c || !emState.sucio || c.estado !== 'borrador') return true;
  emState.sucio = false;
  emState.guardando = (async () => {
    const g = document.getElementById('em-guardado');
    try {
      const { nombre, asunto, preheader, remitente_nombre, remitente_email, responder_a, tema, descuento_transferencia, bloques, listas, excluir, filtro, precios } = c;
      const r = await api(`/api/email/campanias/${c.id}`, emJson('PUT', { nombre, asunto, preheader, remitente_nombre, remitente_email, responder_a, tema, descuento_transferencia, bloques, listas, excluir, filtro, precios }));
      c.personas = r.personas;
      const p = document.getElementById('em-personas');
      if (p) p.textContent = emNum(r.personas);
      if (g && !emState.sucio) g.textContent = 'Guardado';
      return true;
    } catch (e) {
      emState.sucio = true;
      if (g) g.textContent = `No se guardó: ${e.message}`;
      return false;
    }
  })();
  const ok = await emState.guardando;
  emState.guardando = null;
  return ok;
}

async function emVista() {
  const c = emState.c;
  if (!c) return;
  const n = document.getElementById('em-asunto-n');
  if (n) n.textContent = c.asunto ? `${c.asunto.length} letras` : '';
  const band = document.getElementById('em-bandeja');
  if (band) band.innerHTML = `<b>${emE(c.remitente_nombre)}</b> <span>${emE((c.asunto || 'Sin asunto').replace(/\s?\{nombre\}/gi, ' Ana'))}</span> <small>${emE(c.preheader)}</small>`;
  const turno = ++emState.vistaN;
  try {
    const r = await api(`/api/email/campanias/${c.id}/vista`, emJson('POST', { asunto: c.asunto, preheader: c.preheader, tema: c.tema, descuento_transferencia: c.descuento_transferencia, precios: c.precios, bloques: c.bloques }));
    if (turno !== emState.vistaN) return;
    emPonerHtml('em-iframe', r.html);
    document.getElementById('em-avisos').innerHTML = r.avisos.length ? `<div class="em-avisos"><b>Para revisar</b><ul>${r.avisos.map((a) => `<li>${emE(a)}</li>`).join('')}</ul></div>` : '';
  } catch (e) { const a = document.getElementById('em-avisos'); if (a) a.innerHTML = `<div class="em-avisos">${emE(e.message)}</div>`; }
}

// El alto sigue al contenido y los links de la vista previa no navegan el panel.
function emPonerHtml(id, html) {
  const f = document.getElementById(id);
  if (!f) return;
  const alto = () => { try { f.style.height = `${f.contentDocument.documentElement.scrollHeight}px`; } catch (_) { /* aún cargando */ } };
  f.onload = () => {
    alto();
    f.contentDocument.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });
    f.contentDocument.querySelectorAll('img').forEach((i) => i.addEventListener('load', alto));
  };
  f.srcdoc = html;
}

function emAncho(a) {
  emState.ancho = a;
  const f = document.getElementById('em-iframe');
  f.className = `em-iframe em-${a}`;
  document.querySelectorAll('.em-vista-cab button').forEach((b, i) => b.classList.toggle('active', (i === 0) === (a === 'pc')));
  setTimeout(() => { try { f.style.height = `${f.contentDocument.documentElement.scrollHeight}px`; } catch (_) { /* cargando */ } }, 250);
}
window.emAncho = emAncho;

async function emSalir() {
  if (emState.sucio && !(await emGuardar()) && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
  emState.c = null; emState.sucio = false; emState.d = null;
  emailCargar();
}
window.emSalir = emSalir;
window.addEventListener('beforeunload', (e) => { if (emState.sucio) e.preventDefault(); });

/* ------------------------------- Bloques ------------------------------- */

function emInput(i, k, etiqueta, { area = false, tipo = 'text', pista = '' } = {}) {
  const v = emState.c.bloques[i][k] || '';
  return `<label class="em-campo"><span>${etiqueta}</span>${area ? `<textarea class="input" rows="${k === 'texto' ? 6 : 2}" placeholder="${emE(pista)}" oninput="emBloque(${i}, '${k}', this.value)">${emE(v)}</textarea>` : `<input class="input" type="${tipo}" value="${emE(v)}" placeholder="${emE(pista)}" oninput="emBloque(${i}, '${k}', this.value)">`}</label>`;
}

function emProdChip(i, id) {
  const p = emState.c.mapaProductos.get(Number(id));
  return `<span class="em-chip">${p && p.image_url ? `<img src="${emE(p.image_url)}" alt="">` : ''}<span>${emE(p ? p.name : `Producto ${id}`)}<small>${p ? emPlata(p.promo_price || p.price) : 'no publicado'}</small></span><button aria-label="Sacar" onclick="emQuitarProd(${i}, ${Number(id)})">×</button></span>`;
}

const EM_CAMPOS = {
  titulo: (i, b) => emInput(i, 'antetitulo', 'Arriba del título') + emInput(i, 'titulo', 'Título', { area: true }) + emInput(i, 'bajada', 'Debajo', { area: true })
    + `<label class="em-campo"><span>Alineado</span><select class="input" onchange="emBloque(${i}, 'alinear', this.value)"><option value="centro">Al centro</option><option value="izquierda" ${b.alinear === 'izquierda' ? 'selected' : ''}>A la izquierda</option></select></label>`,
  texto: (i) => emInput(i, 'texto', 'Texto', { area: true, pista: 'Un renglón vacío separa párrafos. **negrita** y [link](https://…). {nombre} pone el nombre.' }),
  imagen: (i, b) => emInput(i, 'src', 'Dirección de la foto (https://…)', { tipo: 'url' }) + emInput(i, 'alt', 'Qué se ve (para quien no carga fotos)') + emInput(i, 'url', 'Al tocarla va a', { tipo: 'url' })
    + `<label class="em-check"><input type="checkbox" ${b.aSangre ? 'checked' : ''} onchange="emBloque(${i}, 'aSangre', this.checked)"> <span>De borde a borde</span></label>`,
  estrella: (i, b) => `${b.id ? `<div class="em-chips">${emProdChip(i, b.id)}</div>` : ''}${emBuscador(i)}` + emInput(i, 'nombre', 'Nombre (vacío = el de la tienda)') + emInput(i, 'detalle', 'Detalle', { area: true }) + emInput(i, 'src', 'Otra foto (vacío = la de la tienda)', { tipo: 'url' }) + emInput(i, 'boton', 'Botón'),
  productos: (i, b) => emInput(i, 'titulo', 'Título') + `<div class="em-chips">${(b.ids || []).map((x) => emProdChip(i, x)).join('')}</div>${emBuscador(i)}<div class="em-dos"><label class="em-campo"><span>Por fila</span><select class="input" onchange="emBloque(${i}, 'columnas', Number(this.value))">${[1, 2, 3].map((n) => `<option ${Number(b.columnas) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${emInput(i, 'boton', 'Botón')}</div>`,
  boton: (i) => emInput(i, 'texto', 'Texto del botón') + emInput(i, 'url', 'Va a', { tipo: 'url' }),
  beneficios: (i, b) => `<label class="em-campo"><span>Uno por renglón, hasta 4</span><textarea class="input" rows="4" oninput="emBloque(${i}, 'items', this.value.split('\\n'))">${emE((b.items || []).join('\n'))}</textarea></label>`,
  cupon: (i) => emInput(i, 'texto', 'Texto') + emInput(i, 'codigo', 'Código'),
  separador: () => '',
  firma: (i) => emInput(i, 'texto', 'Firma', { area: true }),
};

function emBuscador(i) {
  return `<div class="em-buscar"><input class="input" type="search" placeholder="Buscar producto para agregar" aria-label="Buscar producto" oninput="emBuscar(${i}, this)"><div class="em-resultados" id="em-res-${i}"></div></div>`;
}

function emPintarBloques() {
  const cont = document.getElementById('em-bloques');
  if (!cont) return;
  cont.innerHTML = emState.c.bloques.map((b, i) => `<details class="em-bloque" ${emState.abierto === i ? 'open' : ''} ontoggle="if (this.open) emState.abierto = ${i}">
    <summary><b>${EM_BLOQUES[b.tipo] || b.tipo}</b><small>${emE(emResumen(b))}</small>
      <span class="em-mover"><button aria-label="Subir" ${i === 0 ? 'disabled' : ''} onclick="emMover(event, ${i}, -1)">↑</button><button aria-label="Bajar" ${i === emState.c.bloques.length - 1 ? 'disabled' : ''} onclick="emMover(event, ${i}, 1)">↓</button><button aria-label="Sacar" onclick="emSacar(event, ${i})">×</button></span></summary>
    <div class="em-bloque-c">${EM_CAMPOS[b.tipo] ? EM_CAMPOS[b.tipo](i, b) : ''}</div></details>`).join('');
}

function emResumen(b) {
  if (b.tipo === 'productos') return `${(b.ids || []).length} elegidos`;
  if (b.tipo === 'estrella') { const p = emState.c.mapaProductos.get(Number(b.id)); return p ? p.name : 'sin elegir'; }
  if (b.tipo === 'beneficios') return (b.items || []).filter(Boolean).join(' · ').slice(0, 50);
  return String(b.titulo || b.texto || b.codigo || b.alt || '').split('\n')[0].slice(0, 50);
}

function emBloque(i, k, v) { emState.c.bloques[i][k] = v; emTocado(); }
function emAgregar(tipo) {
  const nuevo = { titulo: { titulo: 'Título' }, texto: { texto: '' }, imagen: { src: '', alt: '', url: '' }, estrella: { id: null, boton: 'Comprar' }, productos: { ids: [], columnas: 2, boton: 'Comprar' }, boton: { texto: 'Ver más', url: 'https://blacksindumentaria.com.ar/' }, beneficios: { items: ['10% OFF por transferencia'] }, cupon: { texto: 'Usá este código', codigo: '' }, separador: {}, firma: { texto: 'Equipo BLACKS' } }[tipo];
  emState.c.bloques.push({ tipo, ...nuevo });
  emState.abierto = emState.c.bloques.length - 1;
  emPintarBloques(); emTocado();
}
function emMover(ev, i, paso) {
  ev.preventDefault();
  const b = emState.c.bloques; const j = i + paso;
  if (j < 0 || j >= b.length) return;
  [b[i], b[j]] = [b[j], b[i]];
  emState.abierto = -1; emPintarBloques(); emTocado();
}
function emSacar(ev, i) { ev.preventDefault(); emState.c.bloques.splice(i, 1); emState.abierto = -1; emPintarBloques(); emTocado(); }
Object.assign(window, { emBloque, emAgregar, emMover, emSacar });

let emBuscarT;
function emBuscar(i, input) {
  clearTimeout(emBuscarT);
  const q = input.value.trim();
  const res = document.getElementById(`em-res-${i}`);
  if (q.length < 2) { res.innerHTML = ''; return; }
  emBuscarT = setTimeout(async () => {
    try {
      const r = (await api(`/api/products?q=${encodeURIComponent(q)}`)).filter((p) => Number(p.price) > 0).slice(0, 8);
      emState.hallados = new Map(r.map((p) => [Number(p.id), p]));
      res.innerHTML = r.length ? r.map((p) => `<button onclick="emPonerProd(${i}, ${Number(p.id)})">${p.image_url ? `<img src="${emE(p.image_url)}" alt="">` : ''}<span>${emE(p.name)}<small>${emPlata(p.promo_price || p.price)} · ${p.stock === null ? 'sin control de stock' : `${emNum(p.stock)} u`}</small></span></button>`).join('') : '<p class="em-sub">Nada con ese nombre (sólo aparecen los que tienen precio).</p>';
    } catch (e) { res.innerHTML = `<p class="em-sub">${emE(e.message)}</p>`; }
  }, 250);
}
function emPonerProd(i, id) {
  const p = emState.hallados.get(id);
  emState.c.mapaProductos.set(id, p);
  const b = emState.c.bloques[i];
  if (b.tipo === 'estrella') b.id = id; else if (!b.ids.includes(id)) b.ids.push(id);
  emState.abierto = i; emPintarBloques(); emTocado();
}
function emQuitarProd(i, id) {
  const b = emState.c.bloques[i];
  if (b.tipo === 'estrella') b.id = null; else b.ids = b.ids.filter((x) => Number(x) !== id);
  emPintarBloques(); emTocado();
}
Object.assign(window, { emBuscar, emPonerProd, emQuitarProd });

async function emRedactar() {
  const btn = document.getElementById('em-ia-btn');
  const res = document.getElementById('em-ia-res');
  const ids = emState.c.bloques.flatMap((b) => (b.tipo === 'estrella' ? [b.id] : b.tipo === 'productos' ? b.ids : [])).filter(Boolean);
  const listasTipo = emState.d.listas.filter((l) => emState.c.listas.includes(l.id)).map((l) => l.tipo);
  btn.disabled = true; btn.textContent = 'Pensando…';
  try {
    const r = await api('/api/email/redactar', emJson('POST', { idea: document.getElementById('em-idea').value, para: listasTipo.length && listasTipo.every((t) => t === 'mayorista') ? 'mayorista' : 'minorista', ids }));
    emState.ia = r;
    res.innerHTML = `<p class="em-sub">Elegí un asunto:</p>${r.asuntos.map((a, i) => `<button class="em-opcion" onclick="emUsarIa(${i})">${emE(a)}</button>`).join('')}<p class="em-sub">${emE([r.titulo, r.bajada].filter(Boolean).join(' · '))}</p>`;
  } catch (e) { res.innerHTML = `<p class="em-sub em-mal">${emE(e.message)}</p>`; }
  btn.disabled = false; btn.textContent = 'Proponer textos';
}
function emUsarIa(i) {
  const { c, ia } = emState;
  c.asunto = ia.asuntos[i]; c.preheader = ia.preheader;
  let t = c.bloques.find((b) => b.tipo === 'titulo');
  if (!t) { t = { tipo: 'titulo' }; c.bloques.unshift(t); }
  Object.assign(t, { antetitulo: ia.antetitulo, titulo: ia.titulo, bajada: ia.bajada });
  const boton = c.bloques.find((b) => b.tipo === 'boton');
  if (boton && ia.boton) boton.texto = ia.boton;
  document.getElementById('em-asunto').value = c.asunto;
  document.getElementById('em-preheader').value = c.preheader;
  emPintarBloques(); emTocado();
  toast('Textos puestos. Revisalos antes de enviar.', 'ok');
}
Object.assign(window, { emRedactar, emUsarIa });

/* --------------------------- Prueba y envío --------------------------- */

async function emPrueba() {
  if (!(await emGuardar())) return toast('No se pudo guardar.', 'error');
  const a = emState.d.ajustes.pruebas.join(', ');
  const m = showInfoModal('Mandar una prueba', `<label class="em-campo"><span>A (hasta 5 mails)</span><input class="input" id="em-prueba" value="${emE(a)}" placeholder="vos@blacksindumentaria.com.ar"></label><div class="em-acciones" style="margin-top:14px;"><button class="btn-primary" id="em-prueba-btn">Mandar prueba</button></div>`);
  m.querySelector('#em-prueba-btn').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await api(`/api/email/campanias/${emState.c.id}/prueba`, emJson('POST', { para: m.querySelector('#em-prueba').value.split(/[\s,;]+/).filter(Boolean) }));
      m.remove(); toast(`Prueba enviada a ${r.enviados.join(', ')}`, 'ok');
    } catch (e) { toast(e.message, 'error'); ev.target.disabled = false; }
  };
}

async function emArchivo() {
  if (!(await emGuardar())) return toast('No se pudo guardar.', 'error');
  toast('Preparando el archivo: leo precios y fotos de la tienda…');
  try {
    const r = await fetch(`/api/email/campanias/${emState.c.id}/archivo`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    const nombre = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(await r.blob());
    const l = document.createElement('a');
    l.href = url; l.download = nombre ? nombre[1] : 'mail.html'; l.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { toast(e.message, 'error'); }
}

async function emEnviar() {
  if (!(await emGuardar())) return toast('No se pudo guardar.', 'error');
  const { c, d } = emState;
  const dias = Math.ceil(c.personas / d.ajustes.topeDiario);
  const m = showInfoModal('Enviar campaña', `
    <p class="em-envio"><b>${emE(c.asunto || 'Sin asunto')}</b><br>Desde ${emE(c.remitente_nombre)} &lt;${emE(c.remitente_email)}&gt;</p>
    <p class="em-envio">${emNum(c.personas)} personas · hasta ${emNum(d.ajustes.topeDiario)} por día${dias > 1 ? `: va a tardar ${dias} días` : ''}.</p>
    ${d.totales.bajas ? '' : '<p class="em-sub em-mal">Todavía no cargaste las bajas de Perfit: si seguís, le vas a escribir a gente que ya pidió no recibir mails.</p>'}
    <label class="em-campo"><span>Cuándo (vacío = ahora)</span><input class="input" type="datetime-local" id="em-cuando"></label>
    <label class="em-campo"><span>Para confirmar, escribí cuántas personas lo van a recibir</span><input class="input" inputmode="numeric" id="em-confirmo" autocomplete="off" placeholder="${c.personas}"></label>
    <div class="em-acciones" style="margin-top:14px;"><button class="btn-primary" id="em-enviar-btn" ${d.proveedor ? '' : 'disabled'}>Enviar campaña</button></div>
    ${d.proveedor ? '' : '<p class="em-sub em-mal">Falta conectar el servicio de envío (Ajustes).</p>'}`);
  m.querySelector('#em-enviar-btn').onclick = async (ev) => {
    const cuando = m.querySelector('#em-cuando').value;
    ev.target.disabled = true;
    try {
      const r = await api(`/api/email/campanias/${c.id}/enviar`, emJson('POST', { confirmo: Number(m.querySelector('#em-confirmo').value.replace(/\D/g, '')), cuando: cuando ? new Date(`${cuando}:00-03:00`).toISOString() : null }));
      m.remove(); emState.c = null; emState.d = null;
      toast(cuando ? `Programada para el ${emFecha(r.programada_para)}` : 'Empezó a salir', 'ok');
      emailCargar();
    } catch (e) { toast(e.message, 'error'); ev.target.disabled = false; }
  };
}

async function emAccion(accion, id) {
  const cual = id || emState.c.id;
  if (accion === 'cancelar' && !window.confirm('¿Cancelar? Los mails que todavía no salieron no se mandan.')) return;
  try {
    await api(`/api/email/campanias/${cual}/${accion}`, emJson('POST'));
    toast({ pausar: 'Pausada', seguir: 'Sigue saliendo', cancelar: 'Cancelada', duplicar: 'Duplicada' }[accion], 'ok');
    emState.c = null; emState.d = null;
    emailCargar();
  } catch (e) { toast(e.message, 'error'); }
}
Object.assign(window, { emPrueba, emArchivo, emEnviar, emAccion });

/* ------------------------------- Reporte ------------------------------- */

async function emReporte(id) {
  emBody().innerHTML = skeleton('stats');
  try {
    const r = await api(`/api/email/campanias/${id}/reporte`);
    emState.r = r;
    const c = r.campania;
    const num = (v, t, s = '') => `<div class="stat"><b>${v}</b><span>${t}</span>${s ? `<small class="em-sub">${s}</small>` : ''}</div>`;
    const maxH = Math.max(1, ...r.horas.map((h) => h.aperturas + h.clicks));
    emBody().innerHTML = `
      <div class="em-cab"><button class="btn-ghost btn-sm" onclick="emSalir()">← Campañas</button><div class="em-acciones">
        ${c.estado === 'enviando' ? `<button class="btn-ghost" onclick="emAccion('pausar', ${id})">Pausar</button>` : ''}
        ${c.estado === 'pausada' ? `<button class="btn-primary" onclick="emAccion('seguir', ${id})">Seguir enviando</button>` : ''}
        ${['enviando', 'pausada'].includes(c.estado) ? `<button class="btn-ghost" onclick="emAccion('cancelar', ${id})">Cancelar lo que falta</button>` : ''}
        <button class="btn-ghost" onclick="emAccion('duplicar', ${id})">Duplicar</button></div></div>
      <div class="em-rep-cab"><h3>${emE(c.nombre)} <span class="em-estado em-${c.estado}">${EM_ESTADO[c.estado]}</span></h3><p class="em-sub">${emE(c.asunto)} · ${emE(c.remitente)} · ${emFecha(c.empezo)}</p>${c.aviso ? `<p class="em-mal">${emE(c.aviso)}</p>` : ''}</div>
      <div class="em-stats">
        ${num(emNum(r.enviados), 'enviados', r.pendientes ? `faltan ${emNum(r.pendientes)}` : r.fallidos ? `${emNum(r.fallidos)} no salieron` : '')}
        ${num(emPct(r.abrieron, r.enviados), `abrieron ${tip('Apple Mail abre los mails solo, así que este número siempre sale un poco inflado. Los clics son más confiables.')}`, `${emNum(r.abrieron)} personas, ${emNum(r.aperturas)} veces`)}
        ${num(emPct(r.tocaron, r.enviados), 'tocaron un link', `${emNum(r.tocaron)} personas, ${emNum(r.clicks)} clics`)}
        ${num(emPct(r.tocaron, r.abrieron), 'de los que abrieron, tocaron')}
        ${num(emPlata(r.ventas.total), `en ventas ${tip('Pedidos pagos con el link del mail, o de alguien que tocó un link hasta 5 días antes. Se actualiza con la sincronización diaria de pedidos.')}`, `${emNum(r.ventas.cantidad)} pedidos`)}
        ${num(emPct(r.bajas, r.enviados), 'se dieron de baja', `${emNum(r.bajas)} personas`)}
        ${num(emPct(r.rebotes, r.enviados), 'rebotaron', `${emNum(r.rebotes)} · spam ${emNum(r.quejas)}`)}
      </div>
      <div class="em-dos em-rep">
        <section class="em-caja"><h4>Mapa de calor</h4><p class="em-sub">Los clics sobre cada foto, título y botón.</p><iframe id="em-mapa" class="em-iframe em-pc" title="Mapa de calor del mail" sandbox="allow-same-origin"></iframe></section>
        <div><section class="em-caja"><h4>Links</h4>${r.links.length ? `<table class="em-tabla"><thead><tr><th>Link</th><th>Personas</th><th>Clics</th></tr></thead><tbody>${[...r.links].sort((a, b) => b.clicks - a.clicks).map((l) => `<tr><td><b>${emE(l.etiqueta || 'Link')}</b><small>${emE(l.url.replace(/[?&]utm_[^&]*/g, '').replace(/^https?:\/\//, '').slice(0, 60))}</small></td><td>${emNum(l.personas)}</td><td>${emNum(l.clicks)}</td></tr>`).join('')}</tbody></table>` : '<p class="em-sub">Sin links todavía.</p>'}</section>
        <section class="em-caja"><h4>Primeras 72 horas</h4>${r.horas.length ? `<div class="em-horas" role="img" aria-label="Aperturas y clics por hora">${r.horas.map((h) => `<i title="${emFecha(h.hora)}: ${h.aperturas} aperturas, ${h.clicks} clics" style="height:${Math.max(4, Math.round(((h.aperturas + h.clicks) / maxH) * 100))}%"></i>`).join('')}</div>` : '<p class="em-sub">Todavía nadie lo abrió.</p>'}</section>
        <section class="em-caja"><h4>Quién</h4><div class="em-filtros">${[['todos', 'Todos'], ['tocaron', 'Tocaron'], ['abrieron', 'Abrieron'], ['no_abrieron', 'No abrieron'], ['rebotes', 'Rebotes'], ['bajas', 'Bajas']].map(([k, n]) => `<button class="btn-ghost btn-sm" onclick="emQuien(${id}, '${k}', 1)">${n}</button>`).join('')}</div><div id="em-quien"></div></section></div>
      </div>`;
    emQuien(id, 'todos', 1);
    const m = await api(`/api/email/campanias/${id}/mapa`);
    emPonerHtml('em-mapa', m.html);
  } catch (e) { toast(e.message, 'error'); emailCargar(); }
}
window.emReporte = emReporte;

async function emQuien(id, ver, pagina) {
  const cont = document.getElementById('em-quien');
  if (!cont) return;
  try {
    const r = await api(`/api/email/campanias/${id}/actividad?ver=${ver}&pagina=${pagina}`);
    const paginas = Math.ceil(r.total / 50);
    cont.innerHTML = r.filas.length ? `<table class="em-tabla"><thead><tr><th>Persona</th><th>Abrió</th><th>Tocó</th></tr></thead><tbody>${r.filas.map((f) => `<tr><td><b>${emE(f.email)}</b><small>${emE(f.baja_en ? 'se dio de baja' : f.error || (f.enviado_en ? emFecha(f.enviado_en) : 'pendiente'))}</small></td><td>${f.aperturas || '—'}</td><td>${f.clicks || '—'}</td></tr>`).join('')}</tbody></table>
      ${paginas > 1 ? `<div class="em-paginas"><button class="btn-ghost btn-sm" ${pagina <= 1 ? 'disabled' : ''} onclick="emQuien(${id}, '${ver}', ${pagina - 1})">Anterior</button><span>${pagina} de ${paginas}</span><button class="btn-ghost btn-sm" ${pagina >= paginas ? 'disabled' : ''} onclick="emQuien(${id}, '${ver}', ${pagina + 1})">Siguiente</button></div>` : ''}` : '<p class="em-sub">Nadie por ahora.</p>';
  } catch (e) { cont.innerHTML = `<p class="em-sub em-mal">${emE(e.message)}</p>`; }
}
window.emQuien = emQuien;

/* ------------------------------ Audiencias ------------------------------ */

function emAudiencias() {
  const { listas, totales } = emState.d;
  const filas = listas.map((l) => `<tr><td><b>${emE(l.nombre)}</b><small>${emE(l.detalle || (l.origen === 'tienda' ? 'De Tiendanube' : 'Cargada de un archivo'))}</small></td><td>${EM_TIPO[l.tipo] || '—'}</td><td>${emNum(l.activos)}</td><td>${emPct(l.movidos, l.activos)}</td><td>${emNum(l.contactos - l.activos)}</td><td><button class="btn-ghost btn-sm" onclick="emBorrarLista(${l.id})" aria-label="Borrar la lista ${emE(l.nombre)}">Borrar</button></td></tr>`).join('');
  return `<div class="em-cab"><h3>Audiencias</h3><div class="em-acciones"><button class="btn-ghost" id="em-tienda" onclick="emTienda()">${icon('refresh')} Traer de Tiendanube</button></div></div>
    <p class="em-sub">${emNum(totales.activos)} contactos activos · ${emNum(totales.bajas)} bajas · ${emNum(totales.malos)} rebotes o spam (no se les manda nunca).</p>
    ${filas ? `<div class="em-tabla-c"><table class="em-tabla"><thead><tr><th>Lista</th><th>Tipo</th><th>Activos</th><th>Se movieron ${tip('Compraron, abrieron o tocaron un mail en los últimos 6 meses.')}</th><th>No se les manda</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="em-vacio"><p>Todavía no hay listas. Traé las de Tiendanube o cargá un archivo de Perfit.</p></div>'}
    <section class="em-caja em-importar"><h4>Cargar un archivo</h4><p class="em-sub">En Perfit: Audiencia → la lista → menú ⋮ → Exportar. Sirve cualquier CSV con una columna de mails.</p>
      <div class="em-dos"><label class="em-campo"><span>Archivo CSV</span><input class="input" type="file" accept=".csv,.txt,text/csv" id="em-csv"></label>
      <label class="em-campo"><span>Qué es</span><select class="input" id="em-csv-tipo" onchange="document.getElementById('em-csv-lista').disabled = this.value === 'bajas'"><option value="minorista">Lista minorista</option><option value="mayorista">Lista mayorista</option><option value="bajas">Bajas y rebotes (no mandarles)</option></select></label></div>
      <label class="em-campo"><span>Nombre de la lista</span><input class="input" id="em-csv-lista" placeholder="Nuby"></label>
      <button class="btn-primary" id="em-csv-btn" onclick="emImportar()">Cargar archivo</button>
      <p class="em-sub">Cargá primero "Cancelaron suscripción" y "Direcciones rebotadas" como bajas: así nadie que ya pidió no recibir mails vuelve a recibirlos.</p></section>`;
}

async function emTienda() {
  const b = document.getElementById('em-tienda');
  b.disabled = true; b.textContent = 'Trayendo… puede tardar un minuto';
  try {
    const r = await api('/api/email/listas/tienda', emJson('POST'));
    toast(`Listo: ${r.map((x) => `${x.lista} ${emNum(x.validos)}`).join(' · ')}`, 'ok');
    emailCargar();
  } catch (e) { toast(e.message, 'error'); emPintar(); }
}

async function emImportar() {
  const f = document.getElementById('em-csv').files[0];
  const tipo = document.getElementById('em-csv-tipo').value;
  const nombre = document.getElementById('em-csv-lista').value.trim();
  if (!f) return toast('Elegí un archivo.', 'error');
  if (tipo !== 'bajas' && !nombre) return toast('Poné el nombre de la lista.', 'error');
  const b = document.getElementById('em-csv-btn');
  b.disabled = true; b.textContent = 'Cargando…';
  try {
    const q = tipo === 'bajas' ? 'bajas=1' : `tipo=${tipo}&lista=${encodeURIComponent(nombre)}`;
    const r = await api(`/api/email/listas/importar?${q}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await f.text() });
    toast(r.bajas !== undefined ? `${emNum(r.bajas)} mails marcados como baja` : `${emNum(r.validos)} contactos cargados${r.descartados ? `, ${emNum(r.descartados)} repetidos o mal escritos` : ''}`, 'ok');
    emailCargar();
  } catch (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = 'Cargar archivo'; }
}

async function emBorrarLista(id) {
  if (!window.confirm('¿Borrar la lista? Los contactos y sus bajas se conservan.')) return;
  try { await api(`/api/email/listas/${id}`, { method: 'DELETE' }); emailCargar(); } catch (e) { toast(e.message, 'error'); }
}
Object.assign(window, { emTienda, emImportar, emBorrarLista });

/* ------------------------------- Ajustes ------------------------------- */

function emAjustes() {
  const { ajustes: a, proveedor, seguimiento, webhook } = emState.d;
  const paso = (ok, t) => `<li class="${ok ? 'ok' : ''}">${t}</li>`;
  return `<div class="em-cab"><h3>Ajustes</h3></div>
    <section class="em-caja"><h4>Servicio de envío</h4>
      <p>${proveedor ? `Conectado: <b>${proveedor === 'resend' ? 'Resend' : 'Amazon SES'}</b>` : 'Sin conectar.'}</p>
      <ol class="em-pasos">
        ${paso(Boolean(proveedor), 'Crear la cuenta en resend.com o en Amazon SES y agregar el dominio blacksindumentaria.com.ar. Los registros que pide van en el DNS del dominio, sin tocar los de Google ni los de Perfit.')}
        ${paso(Boolean(proveedor), 'En Render → Environment: <code>RESEND_API_KEY</code>, o bien <code>EMAIL_SES_KEY</code>, <code>EMAIL_SES_SECRET</code> y <code>EMAIL_SES_REGION</code>.')}
        ${paso(webhook, `Avisos de rebotes y spam: en Resend → Webhooks, dirección <code>${emE(seguimiento.base)}/api/email/webhook/resend</code> con bounced y complained; la clave va en <code>RESEND_WEBHOOK_SECRET</code>. En Amazon SES, SNS a <code>${emE(seguimiento.base)}/api/email/webhook/ses?k=…</code> con <code>EMAIL_WEBHOOK_KEY</code>.`)}
        ${paso(seguimiento.propio, `Opcional y recomendado: que los links salgan con el dominio propio. Crear <code>mail.blacksindumentaria.com.ar</code> apuntando a Render y cargar <code>EMAIL_TRACK_URL</code>. Hoy salen con <code>${emE(seguimiento.base)}</code>.`)}
      </ol></section>
    <section class="em-caja"><h4>Desde dónde salen</h4><div id="em-remitentes">${a.remitentes.map((r) => emRemitente(r)).join('')}</div><button class="btn-ghost btn-sm" onclick="document.getElementById('em-remitentes').insertAdjacentHTML('beforeend', emRemitente({ nombre: 'BLACKS', email: '' }))">Agregar otro</button>
      <label class="em-campo"><span>Mails de prueba (separados por coma)</span><input class="input" id="em-aj-pruebas" value="${emE(a.pruebas.join(', '))}"></label>
      <label class="em-campo"><span>Pie del mail</span><input class="input" id="em-aj-empresa" value="${emE(a.empresa)}"></label></section>
    <section class="em-caja"><h4>Ritmo</h4><p class="em-sub">Un dominio que arranca a mandar miles de mails de golpe cae en spam. Empezá con 300 por día y duplicá cada 2 o 3 días si los rebotes quedan abajo del 2%.</p>
      <div class="em-dos"><label class="em-campo"><span>Mails por día, como máximo</span><input class="input" type="number" min="10" max="20000" id="em-aj-tope" value="${a.topeDiario}"></label><label class="em-campo"><span>Mails por minuto</span><input class="input" type="number" min="1" max="600" id="em-aj-min" value="${a.porMinuto}"></label></div></section>
    <button class="btn-primary" onclick="emGuardarAjustes(this)">Guardar ajustes</button>`;
}

function emRemitente(r) {
  return `<div class="em-dos em-rem"><label class="em-campo"><span>Nombre</span><input class="input em-rem-n" value="${emE(r.nombre)}"></label><label class="em-campo"><span>Mail</span><input class="input em-rem-m" type="email" value="${emE(r.email)}"></label></div>`;
}

async function emGuardarAjustes(btn) {
  btn.disabled = true;
  try {
    const remitentes = [...document.querySelectorAll('.em-rem')].map((x) => ({ nombre: x.querySelector('.em-rem-n').value, email: x.querySelector('.em-rem-m').value.trim() })).filter((x) => x.email);
    emState.d.ajustes = await api('/api/email/ajustes', emJson('POST', {
      remitentes, pruebas: document.getElementById('em-aj-pruebas').value, empresa: document.getElementById('em-aj-empresa').value,
      topeDiario: document.getElementById('em-aj-tope').value, porMinuto: document.getElementById('em-aj-min').value,
    }));
    toast('Ajustes guardados', 'ok');
  } catch (e) { toast(e.message, 'error'); }
  btn.disabled = false;
}
Object.assign(window, { emRemitente, emGuardarAjustes });
