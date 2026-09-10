/* =========================================================================
 * PANEL DE LA FRANJA DE BENEFICIOS
 *
 * La tira de "envío gratis / cuotas / cambios" que va arriba de las categorías.
 * Va configurable y no escrita en el theme porque los números cambian: el
 * mínimo de envío gratis, el % por transferencia, la cantidad de cuotas.
 *
 * Depende de los helpers de dashboard.js (api, esc, toast), igual que
 * nav-panel.js. Backend: src/benefits.js + /api/nav/benefits.
 * ========================================================================= */

const bfState = { campos: [], donde: [], estilos: [], posiciones: [], mobiles: [], sugerencias: [], iconos: {}, rutas: [], cfg: null, sucio: false, verMobile: false };

async function bfCargar(force) {
  const cont = document.getElementById('hs-beneficios');
  if (!cont) return;
  try {
    const d = await api('/api/nav/benefits' + (force ? '?force=1' : ''));
    bfState.campos = d.fields || [];
    bfState.donde = d.donde || [];
    bfState.estilos = d.estilos || [];
    bfState.posiciones = d.posiciones || [];
    bfState.mobiles = d.mobiles || [];
    bfState.sugerencias = d.sugerencias || [];
    bfState.iconos = d.iconos || {};
    bfState.rutas = d.rutas || [];
    bfState.cfg = d.config || { items: [], donde: 'minoristas', estilo: 'linea', enabled: false };
    if (!Array.isArray(bfState.cfg.items)) bfState.cfg.items = [];
    bfRender();
    bfSucio(false);
  } catch (err) {
    cont.innerHTML = `<p class="error">No se pudo cargar: ${esc(err.message)}</p>`;
  }
}

function bfRender() {
  const cont = document.getElementById('hs-beneficios');
  if (!cont) return;
  const c = bfState.cfg;

  const filas = c.items.length
    ? c.items.map((it, i) => `
        <div class="bf-fila">
          <select onchange="bfSet('items.${i}.icono', this.value)">
            ${Object.entries(bfState.iconos).map(([v, o]) =>
              `<option value="${esc(v)}"${v === (it.icono || '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
          <input type="text" value="${esc(it.text || '')}" maxlength="60"
            placeholder="Envío gratis a partir de $55.000"
            onchange="bfSet('items.${i}.text', this.value)">
          <button class="btn btn-sm btn-danger" onclick="bfBorrar(${i})">Sacar</button>
        </div>`).join('')
    : '<p class="hint" style="margin:0 0 12px">Todavía no hay ningún mensaje.</p>';

  cont.innerHTML = `
    <p class="hint" style="margin:0 0 16px">
      La tira que va <b>arriba de todo en las páginas de categoría</b>. Hoy no hay ninguna:
      la franja de confianza está sólo en la página de inicio, así que quien entra directo
      desde un anuncio no ve el envío gratis ni que puede cambiar.
    </p>

    <label class="nav-sw" style="margin-bottom:14px">
      <input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="bfSet('enabled', this.checked)">
      <span>Mostrar la franja en la tienda</span>
    </label>

    <h5 class="nav-grupo-tit">Mensajes</h5>
    <div class="bf-filas">${filas}</div>
    <div class="nav-acciones" style="margin:10px 0 22px">
      <button class="btn btn-sm" onclick="bfAgregar()">+ Agregar un mensaje</button>
      ${!c.items.length ? '<button class="btn btn-sm" onclick="bfSugeridos()">Usar los cuatro de siempre</button>' : ''}
    </div>

    <div class="nav-grupo">
      <h5 class="nav-grupo-tit">Dónde y cómo se ve</h5>
      <div class="nav-grupo-campos">
        <label class="nav-campo">
          <span class="nav-label">Dónde se muestra</span>
          <select onchange="bfSet('donde', this.value)">
            ${bfState.donde.map((o) => `<option value="${esc(o.value)}"${o.value === c.donde ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
          <span class="nav-help">${esc(bfDondeAyuda())}</span>
        </label>
        <label class="nav-campo">
          <span class="nav-label">Cómo se ve</span>
          <select onchange="bfSet('estilo', this.value)">
            ${bfState.estilos.map((o) => `<option value="${esc(o.value)}"${o.value === c.estilo ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </label>
        <label class="nav-campo">
          <span class="nav-label">En qué parte de la página</span>
          <select onchange="bfSet('posicion', this.value)">
            ${bfState.posiciones.map((o) => `<option value="${esc(o.value)}"${o.value === (c.posicion || 'interior') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
          <span class="nav-help">Si la categoría tiene banner, arriba de todo la franja queda por encima del banner y se pierde.</span>
        </label>
        <label class="nav-campo">
          <span class="nav-label">En el celular</span>
          <select onchange="bfSet('mobile', this.value)">
            ${bfState.mobiles.map((o) => `<option value="${esc(o.value)}"${o.value === (c.mobile || 'desliza') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </label>
        <label class="nav-campo">
          <span class="nav-label">Color de fondo</span>
          <div class="nav-color">
            <input type="color" value="${esc(c.bg || '#f6f5f3')}" oninput="bfSet('bg', this.value)">
            ${c.bg ? `<button class="btn btn-sm" onclick="bfSet('bg','')">Sacar</button>` : ''}
          </div>
        </label>
        <label class="nav-campo">
          <span class="nav-label">Color del texto</span>
          <div class="nav-color">
            <input type="color" value="${esc(c.color || '#121212')}" oninput="bfSet('color', this.value)">
            ${c.color ? `<button class="btn btn-sm" onclick="bfSet('color','')">Sacar</button>` : ''}
          </div>
        </label>
      </div>
    </div>

    <div class="nav-acciones">
      <button class="btn btn-primary" id="bf-publicar" onclick="bfPublicar()">Publicar en la tienda</button>
      <span class="nav-sucio hidden" id="bf-sucio">Hay cambios sin publicar</span>
    </div>

    <div class="nav-previa">
      <h4>Así se va a ver</h4>
      <div class="np-barra" style="margin-bottom:10px">
        <button class="btn btn-sm" data-on="${!bfState.verMobile}" onclick="bfVer(false)">Computadora</button>
        <button class="btn btn-sm" data-on="${bfState.verMobile}" onclick="bfVer(true)">Celular</button>
      </div>
      <div class="bf-previa-caja ${bfState.verMobile ? 'bf-previa-caja--mobile' : ''}">
        <div class="bf-previa" id="bf-previa"></div>
      </div>
      <p class="np-nota" id="bf-alcance"></p>
    </div>`;
  bfPrevia();
}

function bfDondeAyuda() {
  const c = bfState.cfg;
  if (c.donde === 'elegidas') return 'Todavía no se puede elegir a mano desde acá: por ahora usá una de las otras dos.';
  if (c.donde === 'todas') return 'También en las mayoristas, donde el precio se consulta y no hay carrito.';
  return 'Las minoristas son las que tienen precio y carrito. Se detectan solas, y las categorías nuevas que cuelguen de ellas quedan cubiertas sin tocar nada.';
}

/* --------------------------------------------------------------- previa - */

function bfPrevia() {
  const caja = document.getElementById('bf-previa');
  if (!caja) return;
  const c = bfState.cfg;
  const items = c.items.filter((x) => x && x.text);

  caja.style.setProperty('--bf-bg', c.bg || '#f6f5f3');
  caja.style.setProperty('--bf-color', c.color || '#121212');
  // Las mismas clases que usa la tienda, para que la previa no invente nada.
  caja.className = 'bf-previa bf-previa--' + (c.estilo === 'tarjetas' ? 'tarjetas' : 'linea')
    + (bfState.verMobile ? ' bf-previa--m bf-previa--m-' + (c.mobile === 'grilla' ? 'grilla' : 'desliza') : '');
  caja.innerHTML = items.length
    ? items.map((it) => {
        const d = (bfState.iconos[it.icono || ''] || {}).d || '';
        const ico = d ? `<svg class="bf-p-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${esc(d)}"/></svg>` : '';
        return `<span class="bf-p-item">${ico}<span>${esc(it.text)}</span></span>`;
      }).join('')
    : '<span class="hint">Agregá un mensaje para ver cómo queda.</span>';

  const alc = document.getElementById('bf-alcance');
  if (alc) {
    alc.textContent = c.donde === 'todas'
      ? 'Se va a ver en todas las categorías.'
      : c.donde === 'elegidas'
        ? 'Se va a ver sólo en las que elijas.'
        : `Se va a ver en ${bfState.rutas.length} rama(s) minorista(s) y en todo lo que cuelgue de ellas${bfState.rutas.length ? ': /' + bfState.rutas.join(', /') : ''}.`;
  }
}

/* ------------------------------------------------------------- acciones - */

/** Guarda un valor. Acepta rutas tipo "items.0.text". */
function bfSet(ruta, valor) {
  const partes = ruta.split('.');
  let obj = bfState.cfg;
  for (let i = 0; i < partes.length - 1; i++) obj = obj[partes[i]];
  obj[partes[partes.length - 1]] = valor;
  bfSucio(true);
  // Cambiar "dónde" o el estilo cambia qué campos y qué ayuda se muestran; el
  // resto sólo repinta la previa, para no rehacer el formulario en cada tecla
  // (que fue el bug que hacía que el botón Publicar no recibiera el clic).
  if (['donde', 'estilo', 'bg', 'color', 'posicion', 'mobile'].includes(ruta)) bfRender();
  else bfPrevia();
}

function bfAgregar() {
  bfState.cfg.items.push({ text: '', icono: '' });
  bfSucio(true);
  bfRender();
}
function bfBorrar(i) {
  bfState.cfg.items.splice(i, 1);
  bfSucio(true);
  bfRender();
}
function bfSugeridos() {
  bfState.cfg.items = bfState.sugerencias.map((x) => ({ ...x }));
  bfState.cfg.enabled = true;
  bfSucio(true);
  bfRender();
}

function bfVer(mobile) { bfState.verMobile = mobile; bfRender(); }

function bfSucio(v) {
  bfState.sucio = v;
  const a = document.getElementById('bf-sucio');
  if (a) a.classList.toggle('hidden', !v);
  const b = document.getElementById('bf-publicar');
  if (b) b.classList.toggle('nav-pendiente', !!v);
}

async function bfPublicar() {
  try {
    const r = await api('/api/nav/benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bfState.cfg),
    });
    bfState.cfg = r.config;
    bfSucio(false);
    bfRender();
    toast('Publicado. En la tienda se ve al recargar.', 'ok');
  } catch (err) { toast(err.message, 'error'); }
}
