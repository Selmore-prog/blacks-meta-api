/* ==========================================================================
 * PANEL DE TRABAJOS CON BORDADO — compartido
 *
 * Lo cargan DOS páginas: el panel del dueño (dashboard.html, dentro de la
 * pestaña Productos) y el portal del equipo (equipo.html). Por eso vive en su
 * propio archivo y no dentro de dashboard.js: el portal no puede cargar el
 * panel entero, y duplicar el código significaría arreglar cada bug dos veces.
 *
 * Depende de estos helpers, que cada página provee a su manera:
 *   api() · esc() · toast() · skeleton() · panelHead() · tip() · hydrateIcons()
 * En dashboard.js son los de siempre; en equipo.js hay una versión mínima.
 * ========================================================================== */

let worksState = { items: [], techniques: [], nuevo: { products: [], file: null }, searchTimer: null, busy: false };

const WORK_TECH_LABEL = {
  bordado: 'Bordado', estampado: 'Estampado', dtf: 'DTF', sublimado: 'Sublimado', vinilo: 'Vinilo',
};

async function loadWorks() {
  const box = document.getElementById('works-tools');
  if (!box) return;
  if (!worksState.items.length) box.innerHTML = skeleton('rows', 3);
  try {
    const data = await api('/api/works');
    worksState.items = data.works || [];
    worksState.techniques = data.techniques || Object.keys(WORK_TECH_LABEL);
    renderWorks();
  } catch (err) {
    box.innerHTML = `<div class="panel"><p class="hint">No se pudieron cargar los trabajos: ${esc(err.message)}</p></div>`;
  }
}

function renderWorks() {
  const box = document.getElementById('works-tools');
  if (!box) return;
  const n = worksState.items.length;
  const generales = worksState.items.filter((w) => !(w.products || []).length).length;

  // Contador en la solapa: de un vistazo se sabe si hay algo cargado.
  const badge = document.getElementById('pt-works-count');
  if (badge) { badge.textContent = n; badge.classList.toggle('hidden', !n); }

  box.innerHTML = `<div class="panel">
    ${panelHead('Trabajos realizados',
      'Fotos de prendas que ya bordaste o estampaste. Aparecen en la ficha de los productos MAYORISTAS, debajo del botón de WhatsApp. Un trabajo sin productos vinculados se muestra en todas las fichas.',
      `<button class="btn-ghost btn-sm" onclick="loadWorks()"><span data-ic="refresh"></span> Refrescar</button>`)}

    <p class="hint" style="margin:0 0 16px;">
      ${n
        ? `<b>${n}</b> trabajo${n === 1 ? '' : 's'} cargado${n === 1 ? '' : 's'}${generales ? ` · <b>${generales}</b> sin producto (se ven en todas las fichas mayoristas)` : ''}.`
        : 'Todavía no cargaste ninguno. Subí la primera foto acá abajo.'}
      <br>⚠ Si en la foto se ve el logo de un cliente, asegurate de tener su permiso antes de publicarla.
    </p>

    <div class="wk-form">
      <label class="wk-drop" for="wk-file">
        <div id="wk-preview" class="wk-preview"><span data-ic="image"></span></div>
        <div>
          <b>Elegí la foto</b>
          <div class="wk-drop-sub">JPG, PNG o WEBP. Hasta 10 MB.</div>
        </div>
        <input type="file" id="wk-file" accept="image/jpeg,image/png,image/webp,image/avif" hidden>
      </label>

      <div class="wk-fields">
        <div>
          <label class="wk-lbl">Técnica</label>
          <select id="wk-technique">
            ${worksState.techniques.map((t) => `<option value="${t}">${WORK_TECH_LABEL[t] || t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="wk-lbl">Cliente o rubro ${tip('Se muestra abajo de la foto. Si no tenés permiso para nombrar a la empresa, poné el rubro: "Logística", "Gastronomía". Podés dejarlo vacío.')}</label>
          <input type="text" id="wk-client" placeholder="Ej: Constructora del Sur">
        </div>
        <div>
          <label class="wk-lbl">Prenda</label>
          <input type="text" id="wk-garment" placeholder="Ej: campera trucker">
        </div>
      </div>

      <div class="wk-search flash-search">
        <label class="wk-lbl">¿En qué productos se muestra? ${tip('Buscá el producto mayorista y agregalo. Si no agregás ninguno, el trabajo se muestra en TODAS las fichas mayoristas.')}</label>
        <input type="text" id="wk-search-input" placeholder="Buscá el producto por nombre… (vacío = se muestra en todas)">
        <div class="flash-results" id="wk-results"></div>
        <div id="wk-chosen" class="wk-chips"></div>
      </div>

      <button class="btn-primary" id="wk-add-btn" onclick="worksCreate()"><span data-ic="check"></span> Agregar trabajo</button>
    </div>

    <div id="wk-list" class="wk-list"></div>
  </div>`;

  hydrateIcons(box);
  renderWorksChosen();
  renderWorksList();
  bindWorksForm();
}

function bindWorksForm() {
  const file = document.getElementById('wk-file');
  if (file) {
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      worksState.nuevo.file = f || null;
      const prev = document.getElementById('wk-preview');
      if (!prev) return;
      if (f) {
        // Se libera en cuanto la imagen carga: si no, cada foto elegida deja un
        // blob retenido en memoria hasta que se recargue el panel.
        const url = URL.createObjectURL(f);
        prev.innerHTML = `<img src="${url}" alt="" onload="URL.revokeObjectURL(this.src)">`;
      } else {
        prev.innerHTML = '';
        hydrateIcons(prev);
      }
    });
  }

  const input = document.getElementById('wk-search-input');
  const results = document.getElementById('wk-results');
  if (input && results) {
    input.addEventListener('input', () => {
      clearTimeout(worksState.searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.classList.remove('open'); results.innerHTML = ''; return; }
      worksState.searchTimer = setTimeout(() => worksDoSearch(q), 250);
    });
    input.addEventListener('focus', () => { if (results.innerHTML) results.classList.add('open'); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.wk-search')) results.classList.remove('open');
    });
  }
}

async function worksDoSearch(q) {
  const results = document.getElementById('wk-results');
  if (!results) return;
  try {
    const rows = await api('/api/works/search?q=' + encodeURIComponent(q));
    const yaEstan = new Set(worksState.nuevo.products.map((p) => p.id));
    const libres = rows.filter((r) => !yaEstan.has(r.id));
    results.innerHTML = libres.length
      ? libres.map((r) => `
        <div class="flash-result" onclick='worksPick(${JSON.stringify(r).replace(/'/g, '&#39;')})'>
          ${r.image ? `<img src="${esc(r.image)}" alt="">` : ''}
          <div class="fr-info">
            <div class="fr-name">${esc(r.name)}</div>
            <div class="fr-meta">${r.mayorista ? 'Mayorista' : 'Minorista'}</div>
          </div>
          <span class="fr-add">+</span>
        </div>`).join('')
      : `<div class="flash-empty">Sin resultados nuevos para "${esc(q)}".</div>`;
    results.classList.add('open');
  } catch (err) {
    results.innerHTML = `<div class="flash-empty">${esc(err.message)}</div>`;
    results.classList.add('open');
  }
}

function worksPick(prod) {
  if (worksState.nuevo.products.some((p) => p.id === prod.id)) return;
  worksState.nuevo.products.push({ id: prod.id, name: prod.name });
  const input = document.getElementById('wk-search-input');
  const results = document.getElementById('wk-results');
  if (input) input.value = '';
  if (results) { results.classList.remove('open'); results.innerHTML = ''; }
  renderWorksChosen();
}

function worksUnpick(i) {
  worksState.nuevo.products.splice(i, 1);
  renderWorksChosen();
}

function renderWorksChosen() {
  const box = document.getElementById('wk-chosen');
  if (!box) return;
  box.innerHTML = worksState.nuevo.products.length
    ? worksState.nuevo.products.map((p, i) => `
        <span class="wk-chip">${esc(p.name)}<button type="button" onclick="worksUnpick(${i})" aria-label="Quitar">&times;</button></span>`).join('')
    : '<span class="wk-chip wk-chip-ghost">Sin productos: se muestra en todas las fichas mayoristas</span>';
}

async function worksCreate() {
  if (worksState.busy) return;
  const f = worksState.nuevo.file;
  if (!f) { toast('Elegí una foto primero.', 'warn'); return; }
  if (f.size > 10 * 1024 * 1024) { toast('La foto pesa más de 10 MB.', 'warn'); return; }

  const btn = document.getElementById('wk-add-btn');
  worksState.busy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }

  const fd = new FormData();
  fd.append('file', f);
  fd.append('technique', (document.getElementById('wk-technique') || {}).value || 'bordado');
  fd.append('client', (document.getElementById('wk-client') || {}).value || '');
  fd.append('garment', (document.getElementById('wk-garment') || {}).value || '');
  fd.append('products', JSON.stringify(worksState.nuevo.products.map((p) => p.id)));

  try {
    await api('/api/works', { method: 'POST', body: fd });
    worksState.nuevo = { products: [], file: null };
    toast('Trabajo agregado.', 'ok');
    await loadWorks();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    worksState.busy = false;
    const b = document.getElementById('wk-add-btn');
    if (b) { b.disabled = false; b.innerHTML = '<span data-ic="check"></span> Agregar trabajo'; hydrateIcons(b.parentElement || document); }
  }
}

function renderWorksList() {
  const box = document.getElementById('wk-list');
  if (!box) return;
  if (!worksState.items.length) { box.innerHTML = ''; return; }

  box.innerHTML = worksState.items.map((w) => {
    const prods = w.products || [];
    return `<div class="wk-card${w.active ? '' : ' wk-off'}">
      <img src="${esc(w.image_url)}" alt="" loading="lazy">
      <div class="wk-card-info">
        <div class="wk-card-top">
          <span class="wk-tag">${esc(WORK_TECH_LABEL[w.technique] || w.technique)}</span>
          ${w.client ? `<b>${esc(w.client)}</b>` : '<span class="wk-muted">Sin cliente</span>'}
          ${w.garment ? `<span class="wk-muted">· ${esc(w.garment)}</span>` : ''}
        </div>
        <div class="wk-card-prods">
          ${prods.length
            ? prods.map((p) => `<span class="wk-chip wk-chip-sm">${esc(p.name || ('#' + p.id))}</span>`).join('')
            : '<span class="wk-chip wk-chip-ghost wk-chip-sm">En todas las fichas mayoristas</span>'}
        </div>
      </div>
      <div class="wk-card-actions">
        <button class="btn-ghost btn-sm" onclick="worksToggle(${w.id}, ${!w.active})">${w.active ? 'Ocultar' : 'Mostrar'}</button>
        <button class="btn-ghost btn-sm wk-danger" onclick="worksDelete(${w.id})">Borrar</button>
      </div>
    </div>`;
  }).join('');
}

async function worksToggle(id, active) {
  try {
    await api(`/api/works/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    const it = worksState.items.find((w) => w.id === id);
    if (it) it.active = active;
    renderWorksList();
  } catch (err) { toast(err.message, 'error'); }
}

async function worksDelete(id) {
  if (!confirm('¿Borrar este trabajo? Deja de mostrarse en las fichas.')) return;
  try {
    await api(`/api/works/${id}`, { method: 'DELETE' });
    worksState.items = worksState.items.filter((w) => w.id !== id);
    renderWorks();
    toast('Trabajo borrado.', 'ok');
  } catch (err) { toast(err.message, 'error'); }
}
