/* ==========================================================================
 * PORTAL DEL EQUIPO — lógica de la página /equipo.html
 *
 * Es una entrada acotada: segunda contraseña y sólo las secciones que el dueño
 * haya tildado en el panel. Quien entra por acá NO puede tocar ofertas flash,
 * pauta, métricas ni nada que escriba precios — eso lo garantiza el servidor
 * (src/teamPortal.js, denegar por defecto), no esta página.
 *
 * Provee además la versión mínima de los helpers que works-panel.js espera
 * (api, esc, toast, skeleton, panelHead, tip, icon, hydrateIcons), para poder
 * reusar ese panel tal cual sin cargar dashboard.js entero.
 * ========================================================================== */

/* ------------------------------- helpers --------------------------------- */

function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) { mostrarLogin(); throw new Error('Se cerró la sesión. Volvé a entrar.'); }
  if (res.status === 403) throw new Error((data && data.error) || 'Tu acceso no incluye esta sección.');
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4200);
}

function skeleton(kind, n = 3) {
  if (kind === 'rows') return Array.from({ length: n }, () => '<div class="sk sk-row"></div>').join('');
  return '<div class="sk sk-row"></div>';
}

/* Los tres íconos que usa works-panel.js. Devuelve '' para cualquier otro:
   un ícono que falta no puede romper la página. */
const ICONOS = {
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
};
function icon(name) {
  const d = ICONOS[name];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-.125em">${d}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach((el) => { el.innerHTML = icon(el.dataset.ic); el.removeAttribute('data-ic'); });
}

function tip(text, pos = '') {
  if (!text) return '';
  return `<span class="tip ${pos}" tabindex="0" role="note" data-tip="${esc(text)}">i</span>`;
}
function panelHead(title, tipText = '', actions = '') {
  return `<div class="p-head"><h3>${title}${tip(tipText)}</h3>${actions ? `<div class="p-actions">${actions}</div>` : ''}</div>`;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest ? e.target.closest('.tip') : null;
  document.querySelectorAll('.tip.tip-open').forEach((x) => { if (x !== t) x.classList.remove('tip-open'); });
  if (t) { t.classList.toggle('tip-open'); e.stopPropagation(); }
});

/* ------------------------------- secciones -------------------------------- */

const TEAM_SECCIONES = {
  calendar: { label: 'Calendario', panel: 'sec-calendar', cargar: () => loadTeamCalendar() },
  works:    { label: 'Trabajos con bordado', panel: 'sec-works',    cargar: () => loadWorks() },
  products: { label: 'Productos',            panel: 'sec-products', cargar: () => cargarProductos() },
};

let habilitadas = [];
let teamCurrentEmail = '';
const yaCargadas = new Set();

function mostrarLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('password-view').classList.add('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function mostrarCambioClave(required = true) {
  document.getElementById('password-title').textContent = required ? 'Elegí tu contraseña' : 'Cambiar contraseña';
  document.getElementById('password-help').textContent = required
    ? 'La clave temporal sirve para el primer ingreso. Cambiala para usar las secciones habilitadas.'
    : 'Ingresá tu contraseña actual y elegí una nueva de al menos 12 caracteres.';
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('password-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function mostrarPortal(sections, email = '') {
  teamCurrentEmail = email;
  document.getElementById('team-change-pass').classList.toggle('hidden', !email);
  habilitadas = Object.keys(TEAM_SECCIONES).filter((id) => sections && sections[id]);
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('password-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  const tabs = document.getElementById('team-tabs');
  if (!habilitadas.length) {
    tabs.innerHTML = '';
    document.getElementById('sec-calendar').classList.add('hidden');
    document.getElementById('sec-works').classList.add('hidden');
    document.getElementById('sec-products').classList.add('hidden');
    document.getElementById('team-sub').textContent =
      'Todavía no te habilitaron ninguna sección. Avisale a Sebastián.';
    return;
  }

  // Con una sola sección habilitada las solapas no aportan nada: no se dibujan.
  tabs.innerHTML = habilitadas.length > 1
    ? habilitadas.map((id, i) => `<button class="ptab${i === 0 ? ' active' : ''}" data-pane="${id}" onclick="abrirSeccion('${id}')">${esc(TEAM_SECCIONES[id].label)}</button>`).join('')
    : '';
  abrirSeccion(habilitadas[0]);
}

function abrirSeccion(id) {
  if (!habilitadas.includes(id)) return;
  document.querySelectorAll('#team-tabs .ptab').forEach((t) => t.classList.toggle('active', t.dataset.pane === id));
  habilitadas.forEach((otro) => {
    document.getElementById(TEAM_SECCIONES[otro].panel).classList.toggle('hidden', otro !== id);
  });
  document.getElementById('team-sub').textContent = `${TEAM_SECCIONES[id].label}${teamCurrentEmail ? ` · ${teamCurrentEmail}` : ''}`;
  if (yaCargadas.has(id)) return;
  yaCargadas.add(id);
  TEAM_SECCIONES[id].cargar();
}

/* ---------------------- calendario (sólo lectura) ------------------------ */

let teamCalendarItems = [];
let teamCalendarSelected = null;

function teamDateKey(value) { return String(value || '').slice(0, 10); }
function teamTodayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function teamAddDays(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function teamNiceDate(key) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${key}T12:00:00Z`));
}
function teamStatus(status) {
  return ({ pending: 'Pendiente', draft: 'Borrador', approved: 'Aprobado', published: 'Publicado', skipped: 'Omitido' })[status] || status || 'Pendiente';
}

async function loadTeamCalendar() {
  const host = document.getElementById('team-calendar');
  host.innerHTML = `<div class="panel">${skeleton('rows', 4)}</div>`;
  try {
    const data = await api('/api/team/calendar?days=30');
    teamCalendarItems = data.items || [];
    const today = teamTodayKey();
    teamCalendarSelected = teamCalendarItems.find((item) => teamDateKey(item.scheduled_date) >= today)
      ? teamDateKey(teamCalendarItems.find((item) => teamDateKey(item.scheduled_date) >= today).scheduled_date)
      : today;
    renderTeamCalendar();
  } catch (err) { host.innerHTML = `<div class="panel"><p class="hint">${esc(err.message)}</p></div>`; }
}

function selectTeamCalendarDay(key) {
  teamCalendarSelected = key;
  renderTeamCalendar();
}

function renderTeamCalendar() {
  const host = document.getElementById('team-calendar');
  if (!host) return;
  const today = teamTodayKey();
  const start = teamAddDays(today, -7);
  const end = teamAddDays(today, 30);
  const mondayShift = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = teamAddDays(start, -mondayShift);
  const byDate = new Map();
  for (const item of teamCalendarItems) {
    const date = teamDateKey(item.scheduled_date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  }
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = teamAddDays(gridStart, i);
    const items = byDate.get(date) || [];
    cells.push(`<button class="team-cal-day ${date === teamCalendarSelected ? 'selected' : ''} ${date < start || date > end ? 'outside' : ''}"
      data-date="${date}" onclick="selectTeamCalendarDay('${date}')" type="button">
      <b>${esc(date.slice(8))}${date === today ? ' · Hoy' : ''}</b>
      ${items.length ? `<span>${items.length === 1
        ? esc(items[0].post_type === 'reel' ? '1 Reel' : items[0].post_type === 'story' ? '1 Historia' : '1 Feed')
        : `${items.length} piezas`}</span>` : ''}</button>`);
  }
  const selected = byDate.get(teamCalendarSelected) || [];
  host.innerHTML = `<div class="team-cal-head"><div><span class="studio-kicker">PLAN DE CONTENIDOS</span><h2>Calendario</h2></div>
    <button class="btn-ghost btn-sm" onclick="loadTeamCalendar()">Actualizar</button></div>
    <div class="team-cal-layout"><div class="team-cal-scroll"><div class="team-cal-grid">
      ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => `<div class="team-cal-weekday">${day}</div>`).join('')}
      ${cells.join('')}
    </div></div>
    <div class="panel team-cal-detail"><h3>${esc(teamNiceDate(teamCalendarSelected))}</h3>
      ${selected.length ? selected.map((item) => `<div class="team-cal-piece">
        <span class="badge type">${esc(item.post_type === 'reel' ? 'Reel' : item.post_type === 'story' ? 'Historia' : 'Feed')}</span>
        <span class="badge">${esc(teamStatus(item.status))}</span>
        <h4>${esc(item.theme_title || item.pillar_detail || item.pillar || 'Pieza planificada')}</h4>
        ${item.scheduled_time ? `<p>Horario: ${esc(item.scheduled_time)} hs</p>` : ''}
        ${item.caption ? `<p><b>Texto:</b> ${esc(item.caption)}</p>` : ''}
        ${item.reel_brief ? `<details><summary>Ver guion · ${Number(item.reel_brief.duration_sec) || 0} s</summary>
          <p><b>Prepará:</b> ${esc(item.reel_brief.preparation)}</p>
          <ol>${(item.reel_brief.shots || []).map((shot) => `<li><b>${esc(shot.seconds)} s:</b> ${esc(shot.record)}${shot.say ? `<br>Decí: “${esc(shot.say)}”` : ''}${shot.on_screen ? `<br>En pantalla: ${esc(shot.on_screen)}` : ''}</li>`).join('')}</ol></details>` : ''}
      </div>`).join('') : '<p class="hint">No hay piezas planificadas para este día.</p>'}
    </div></div>`;
}

/* --------------------- productos (sólo lectura) --------------------------- */

async function cargarProductos() {
  const box = document.getElementById('team-products');
  box.innerHTML = `<div class="panel">${skeleton('rows', 5)}</div>`;
  try {
    const d = await api('/api/products/analytics');
    const lista = (titulo, ayuda, filas) => `
      <div class="panel" style="margin-bottom:16px;">
        ${panelHead(esc(titulo), ayuda)}
        ${(filas || []).length ? `<div class="wk-list">${filas.map(fila).join('')}</div>`
          : '<p class="hint" style="margin:0;">Nada por acá.</p>'}
      </div>`;
    const fila = (r) => `
      <div class="wk-card">
        ${r.image_url ? `<img src="${esc(r.image_url)}" alt="" loading="lazy">` : '<img alt="">'}
        <div class="wk-card-info">
          <div class="wk-card-top"><b>${esc(r.name || '')}</b></div>
          <div class="wk-card-prods">
            <span class="wk-chip wk-chip-sm">${r.stock == null ? 'sin dato' : r.stock + ' en stock'}</span>
            <span class="wk-chip wk-chip-sm">${r.sales_30d ? r.sales_30d + ' vendidos (30 d)' : 'sin ventas 30 d'}</span>
          </div>
        </div>
      </div>`;
    box.innerHTML =
      lista('Los que más se venden', 'Sirven para sacar fotos y contenido: ya sabés que interesan.', d.winners) +
      lista('No los ve casi nadie', 'Tienen stock pero poca visita. Buenos candidatos para fotos nuevas.', d.needVisibility);
    hydrateIcons(box);
  } catch (err) {
    box.innerHTML = `<div class="panel"><p class="hint">${esc(err.message)}</p></div>`;
  }
}

/* --------------------------------- login ---------------------------------- */

async function teamLogout() {
  try { await fetch('/api/team/logout', { method: 'POST' }); } catch (_) {}
  location.reload();
}

function teamInit() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    const pass = document.getElementById('team-pass').value;
    const email = document.getElementById('team-email').value.trim();
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const r = await fetch('/api/team/user-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo entrar.');
      document.getElementById('team-pass').value = '';
      if (d.mustChangePassword) mostrarCambioClave();
      else mostrarPortal(d.sections, d.email);
    } catch (e2) {
      err.textContent = e2.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  document.getElementById('legacy-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = document.getElementById('legacy-login-btn');
    const error = document.getElementById('login-error');
    button.disabled = true; error.textContent = '';
    try {
      const response = await fetch('/api/team/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('legacy-team-pass').value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo entrar.');
      mostrarPortal(data.sections);
    } catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = document.getElementById('password-btn');
    const error = document.getElementById('password-error');
    button.disabled = true; error.textContent = '';
    try {
      await api('/api/team/password', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: document.getElementById('team-current-pass').value,
          newPassword: document.getElementById('team-new-pass').value }) });
      document.getElementById('team-current-pass').value = '';
      document.getElementById('team-new-pass').value = '';
      const session = await api('/api/team/session');
      mostrarPortal(session.sections, session.email);
    } catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  });

  // ¿Ya tenía sesión abierta? Entonces salteamos el login.
  fetch('/api/team/session')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && d.ok) {
      if (d.mustChangePassword) mostrarCambioClave();
      else mostrarPortal(d.sections, d.email);
    } })
    .catch(() => {});
}
