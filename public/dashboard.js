/* ============ iconos (SVG inline, sin emojis) ============ */
const ICONS = {
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
};
function icon(name, extra = '') {
  const fill = name === 'play' ? 'currentColor' : 'none';
  return `<svg class="ic ${extra}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach((el) => { el.innerHTML = icon(el.dataset.ic); el.removeAttribute('data-ic'); });
}

/* ============ helpers ============ */
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401 && data && data.needLogin) {
    window.location.href = '/login.html';
    throw new Error('Sesión vencida.');
  }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

/* ============ skeleton loaders ============ */
/** HTML de carga con shimmer, en lugar de textos "Cargando…". */
function skeleton(kind, n = 3) {
  if (kind === 'cards') {
    return `<div class="sk-chiprow">${'<span class="sk"></span>'.repeat(4)}</div>` +
      Array.from({ length: n }, () => `<div class="sk-card">
        <div class="sk sk-ph"></div>
        <div>
          <div class="sk-chiprow"><span class="sk"></span><span class="sk"></span></div>
          <div class="sk sk-line w80"></div><div class="sk sk-line w60"></div>
          <div class="sk sk-line w40" style="margin-top:26px; height:34px; border-radius:10px;"></div>
        </div>
      </div>`).join('');
  }
  if (kind === 'stats') return `<div class="prod-totals" style="margin-bottom:18px;">${'<div class="sk sk-stat"></div>'.repeat(4)}</div>`;
  if (kind === 'rows') return Array.from({ length: n }, () => '<div class="sk sk-row"></div>').join('');
  return '<div class="sk sk-row"></div>';
}

let toastTimer;
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4200);
}

function showInfoModal(title, bodyHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-header"><h2>${title}</h2><button class="btn-close">&times;</button></div>
    <div class="modal-body">${bodyHtml}</div>
  </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.classList.contains('btn-close')) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

function formatDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const s = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function typeLabel(item) {
  if (item.post_type === 'reel') return 'Reel';
  if (item.post_type === 'story') return 'Historia';
  return 'Feed';
}

/* ============ tabs ============ */
function switchTab(view) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  if (view === 'style') loadStyle();
  if (view === 'metrics') loadMetrics();
  if (view === 'products') loadProducts();
  if (view === 'studio') loadStudio();
}

/* Sub-pestañas de Métricas (para que la vista no sea un scroll infinito). */
function switchMetricsPane(name) {
  document.querySelectorAll('.mtab').forEach((t) => t.classList.toggle('active', t.dataset.pane === name));
  document.querySelectorAll('.mt-pane').forEach((p) => p.classList.toggle('hidden', p.id !== `mt-${name}`));
}

/* Menú lateral comprimible: sólo íconos para darle más lugar a la app. */
function toggleSidenav() {
  const mini = document.body.classList.toggle('nav-mini');
  localStorage.setItem('navMini', mini ? '1' : '0');
  const b = document.getElementById('side-collapse');
  if (b) b.textContent = mini ? '›' : '‹';
}
if (localStorage.getItem('navMini') === '1') {
  document.body.classList.add('nav-mini');
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('side-collapse');
    if (b) b.textContent = '›';
  });
}

// Recarga el calendario SIN saltar al tope (mantiene el scroll donde estabas).
async function reloadKeepScroll() {
  const y = window.scrollY;
  await loadCalendar();
  window.scrollTo(0, y);
}

function parseSlides(s) {
  if (!s) return null;
  if (Array.isArray(s)) return s;
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : null; } catch (_) { return null; }
}

/* ============ status chips ============ */
let appCfg = null; // config del server (IA activa, costo por imagen, etc.)

/**
 * Costo de generar UNA pieza: el texto siempre es gratis (tier free); si las
 * imágenes IA están activadas, puede sumar hasta 1 imagen (~US$0.04).
 */
function genCostLabel() {
  if (!appCfg || !appCfg.aiImages) return 'Gratis';
  const usd = Number(appCfg.imageCostUsd || 0.04).toFixed(2).replace('.', ',');
  return `hasta US$ ${usd}`;
}

/** Etiqueta chica de costo para poner dentro de un botón que genera algo. */
function costTag(label) {
  const free = /gratis/i.test(label);
  return `<span class="cost-tag ${free ? 'free' : 'paid'}">${label}</span>`;
}

async function loadConfig() {
  try {
    const c = await api('/api/config');
    appCfg = c;
    const chips = document.getElementById('status-chips');
    const ai = c.geminiReady ? `<span class="chip ok"><span class="dot"></span>IA: Gemini</span>`
      : `<span class="chip warn"><span class="dot"></span>IA: Groq (cargá Gemini)</span>`;
    const img = c.aiImages ? `<span class="chip ok"><span class="dot"></span>Imágenes IA · US$ ${Number(c.imageCostUsd || 0).toFixed(2)} c/u</span>`
      : `<span class="chip ok"><span class="dot"></span>Generación gratis</span>`;
    const meta = c.metaReady ? `<span class="chip ok"><span class="dot"></span>Meta conectado</span>`
      : `<span class="chip warn"><span class="dot"></span>Meta sin conectar</span>`;
    chips.innerHTML = ai + img + meta;
    // Costos en los botones que generan: plan y estilo son texto (gratis siempre);
    // "Generar hoy" depende de si las imágenes IA están activadas.
    const tagInto = (el, label) => { if (el && !el.querySelector('.cost-tag')) el.insertAdjacentHTML('beforeend', costTag(label)); };
    tagInto(document.getElementById('btn-month-plan'), 'Gratis');
    tagInto(document.getElementById('btn-generate-today'), genCostLabel() === 'Gratis' ? 'Gratis' : `${genCostLabel()} c/u`);
    tagInto(document.getElementById('analyze-btn'), 'Gratis');
  } catch (e) { /* silencioso */ }
}

/* ============ tareas en segundo plano ============ */
/**
 * Indicador en la barra superior: si hay videos de Reels renderizándose, subtítulos
 * en cola o piezas en la cola de publicación, aparece un chip con el conteo.
 * Tocándolo se ve el detalle de qué está pasando con cada cosa.
 */
let bgTasksData = null;
async function pollBgTasks() {
  const btn = document.getElementById('bg-tasks');
  if (!btn) return;
  try {
    bgTasksData = await api('/api/background-tasks');
    const n = bgTasksData.active || 0;
    const failed = bgTasksData.failed || 0;
    btn.classList.toggle('hidden', !n && !failed);
    if (n) btn.innerHTML = `${icon('refresh', 'spin')} ${n} tarea${n > 1 ? 's' : ''} en segundo plano`;
    else if (failed) btn.innerHTML = `${icon('alert')} ${failed} con error`;
    btn.classList.toggle('warn-chip', !n && failed > 0);
  } catch (_) { /* silencioso: si falla el poll no molestamos */ }
}

function bgTaskTitle(t) {
  return t.theme_title || t.pillar_detail || `Pieza #${t.id}`;
}

function openBgTasks() {
  const d = bgTasksData;
  if (!d) return;
  const fdate = (x) => (x ? String(x).slice(0, 10) : '');
  const section = (title, rows, emptyMsg) => `
    <div class="field"><label>${title}</label>
      ${rows.length ? rows.join('') : `<p class="hint" style="margin:0;">${emptyMsg}</p>`}
    </div>`;

  const reels = (d.reels || []).map((t) => `<div class="dl-row">
    <span>${icon('film')} ${esc(bgTaskTitle(t))} <span class="hint" style="margin:0;">· ${fdate(t.scheduled_date)}</span></span>
    <span class="badge semi">esperando tu video</span></div>`);
  const edits = (d.edits || []).map((t) => `<div class="dl-row">
    <span>${icon('film')} ${esc(bgTaskTitle(t))}</span>
    <span class="badge semi">subtítulos en cola</span></div>`);
  const pubItems = ((d.publish && d.publish.items) || []).filter((q) => ['queued', 'processing', 'failed'].includes(q.status));
  const pubs = pubItems.map((q) => `<div class="dl-row">
    <span>${icon('send')} ${esc(q.theme_title || `${q.pillar} · ${q.post_type}`)} <span class="hint" style="margin:0;">· ${fdate(q.scheduled_date)}</span></span>
    <span class="badge ${q.status === 'failed' ? 'qa-warn' : 'semi'}" ${q.last_error ? `title="${esc(q.last_error)}"` : ''}>
      ${q.status === 'failed' ? `falló (${q.attempts}/${q.max_attempts})` : q.status === 'processing' ? 'publicando…' : 'en cola'}</span></div>`);

  const body = `
    <p class="hint" style="margin-top:0;">Los subtítulos se procesan en la corrida automática (cada ~30 min) y la cola de publicación corre sola en el horario de cada pieza. Los Reels sin video esperan que subas el tuyo (generado en Gemini/Veo).</p>
    ${section(`${icon('film')} Reels esperando tu video (${(d.reels || []).length})`, reels, 'Ninguno: todos los Reels tienen su video.')}
    ${section(`${icon('edit')} Subtítulos en proceso (${(d.edits || []).length})`, edits, 'Nada en cola.')}
    ${section(`${icon('send')} Cola de publicación (${pubItems.length})`, pubs, 'Nada esperando para publicarse.')}
    <div style="display:flex; justify-content:flex-end;">
      <button class="btn-ghost btn-sm" id="bg-refresh">${icon('refresh')} Actualizar</button>
    </div>`;
  const ov = showInfoModal('Tareas en segundo plano', body);
  ov.querySelector('#bg-refresh').addEventListener('click', async () => {
    await pollBgTasks();
    ov.remove();
    openBgTasks();
  });
}

/* ============ calendario ============ */
let calItems = [];
let calView = 'list';
// Horizonte de días que pedimos al calendario. Se PERSISTE en localStorage: al
// planificar un mes que se estira más allá de la ventana (ej. agosto visto desde
// julio) el horizonte sube y sobrevive al recargar la página — antes volvía a 30 y
// el mes recién planificado "desaparecía" de la vista aunque estaba en la base.
const CAL_DAYS_MAX = 60; // tope que acepta /api/calendar
function loadCalDays() {
  const saved = Number(localStorage.getItem('calViewDays'));
  return saved >= 21 && saved <= CAL_DAYS_MAX ? saved : 30;
}
function setCalDays(n) {
  calendarViewDays = Math.min(CAL_DAYS_MAX, Math.max(21, Math.round(n)));
  localStorage.setItem('calViewDays', String(calendarViewDays));
}
let calendarViewDays = loadCalDays();
const filters = { status: 'all', format: 'all', pillar: 'all', auto: 'all', comercial: 'all', q: '' };
function comercialOf(it) {
  if (it.pillar === 'mayorista') return 'mayorista';
  if (['producto', 'promo'].includes(it.pillar)) return 'minorista';
  return 'otro';
}

function commercialDatesOf(it) {
  const raw = it && it.commercial_dates;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_) { return []; }
  }
  return [];
}

function groupByDate(items) {
  const groups = {};
  for (const it of items) {
    const key = String(it.scheduled_date).slice(0, 10);
    (groups[key] = groups[key] || []).push(it);
  }
  return groups;
}

function statusOf(it) {
  if (!it.asset_id) return (it.pillar === 'repost' || it.status === 'skipped') ? 'repost' : 'sin-generar';
  return it.asset_status || it.status;
}

// Los estados viven en inglés en la DB; acá se muestran siempre en español.
const STATUS_LABELS = {
  pending: 'Pendiente', draft: 'Borrador', approved: 'Aprobada', published: 'Publicada',
  discarded: 'Descartada', skipped: 'Pausada', failed: 'Falló',
};
function statusLabel(s) { return STATUS_LABELS[s] || s; }

/** Confirmación con el modal propio (reemplaza al confirm() nativo del navegador). */
function confirmModal(title, message, confirmLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const overlay = showInfoModal(title, `
      <p style="margin:0 0 16px; color:var(--muted); font-size:14px; line-height:1.5;">${message}</p>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn-discard" id="cm-no">Cancelar</button>
        <button class="btn-primary" id="cm-yes">${confirmLabel}</button>
      </div>`);
    const done = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('#cm-no').addEventListener('click', () => done(false));
    overlay.querySelector('#cm-yes').addEventListener('click', () => done(true));
  });
}

function getFiltered() {
  return calItems.filter((it) => {
    if (filters.status !== 'all' && statusOf(it) !== filters.status) return false;
    if (filters.format !== 'all' && it.post_type !== filters.format) return false;
    if (filters.pillar !== 'all' && it.pillar !== filters.pillar) return false;
    if (filters.auto !== 'all' && (it.automation_level || 'auto') !== filters.auto) return false;
    if (filters.comercial !== 'all' && comercialOf(it) !== filters.comercial) return false;
    if (filters.q) {
      const hay = `${it.caption || ''} ${it.pillar_detail || ''} ${it.theme_title || ''} ${it.pillar}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });
}

function renderFilters() {
  const pillars = [...new Set(calItems.map((i) => i.pillar))].sort();
  const sel = (id, label, opts, val) => `<select class="filter" id="${id}" onchange="onFilter('${id}', this.value)">
    <option value="all">${label}: todos</option>
    ${opts.map((o) => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`;
  const bar = document.getElementById('filters');
  bar.innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700;">${icon('filter')} Filtros</span>` +
    sel('f-status', 'Estado', [
      { v: 'sin-generar', t: 'Sin generar' }, { v: 'draft', t: 'Borrador' },
      { v: 'approved', t: 'Aprobado' }, { v: 'published', t: 'Publicado' }, { v: 'repost', t: 'Descanso' },
    ], filters.status) +
    sel('f-format', 'Formato', [{ v: 'feed', t: 'Feed' }, { v: 'story', t: 'Historia' }, { v: 'reel', t: 'Reel' }], filters.format) +
    sel('f-pillar', 'Pilar', pillars.map((p) => ({ v: p, t: p })), filters.pillar) +
    sel('f-auto', 'Tipo', [{ v: 'auto', t: 'Automática' }, { v: 'semi', t: 'Semi' }], filters.auto) +
    sel('f-comercial', 'Venta', [{ v: 'minorista', t: 'Minorista' }, { v: 'mayorista', t: 'Mayorista' }], filters.comercial) +
    `<input class="filter-search" id="f-q" placeholder="Buscar en el texto…" value="${esc(filters.q)}" oninput="onFilter('f-q', this.value)" />` +
    `<span class="filter-count" id="f-count"></span>`;
}

function onFilter(id, val) {
  const map = { 'f-status': 'status', 'f-format': 'format', 'f-pillar': 'pillar', 'f-auto': 'auto', 'f-comercial': 'comercial', 'f-q': 'q' };
  filters[map[id]] = val;
  renderCalView();
}

async function loadCalendar() {
  const list = document.getElementById('calendar-list');
  list.innerHTML = skeleton('cards', 3);
  try {
    calItems = await api(`/api/calendar?days=${calendarViewDays}`);
    document.getElementById('next-plan').innerHTML =
      `${icon('bot')} <b>Automático:</b> genera piezas todos los días a las <b>07:00 ARG</b> y publica lo aprobado <b>en el horario programado de cada pieza</b>. Los posts de feed salen con su historia de refuerzo. El resto lo revisás y publicás vos desde acá.`;
    renderFilters();
    renderCalView();
    refreshStaleDraftsButton();
  } catch (e) {
    list.innerHTML = `<p class="empty">Error cargando el calendario: ${esc(e.message)}</p>`;
  }
}

/* Muestra "Actualizar borradores" sólo si hay piezas hechas con el código viejo. */
async function refreshStaleDraftsButton() {
  const btn = document.getElementById('btn-stale-drafts');
  if (!btn) return;
  try {
    const info = await api('/api/regenerate-drafts/preview');
    const stale = info && info.stale ? info.stale : 0;
    btn.classList.toggle('hidden', stale === 0);
    if (stale) btn.innerHTML = `${icon('wand')} Actualizar ${stale} borrador${stale > 1 ? 'es' : ''}`;
  } catch (_) { btn.classList.add('hidden'); }
}

/**
 * Botón "Ver más días" al pie del calendario: aparece sólo si el horizonte todavía
 * no llegó al tope (60) y estamos mostrando la última tanda completa. Sube el
 * horizonte de a ~3 semanas y recuerda la preferencia (localStorage).
 */
function renderCalMore() {
  const host = document.getElementById('calendar-list');
  if (!host) return;
  const existing = document.getElementById('cal-more');
  if (existing) existing.remove();
  if (calView !== 'list' || calendarViewDays >= CAL_DAYS_MAX) return;
  const wrap = document.createElement('div');
  wrap.id = 'cal-more';
  wrap.style.cssText = 'text-align:center; margin:18px 0 4px;';
  wrap.innerHTML = `<button class="btn-ghost btn-sm" id="cal-more-btn">${icon('calendar')} Ver más días</button>`;
  host.appendChild(wrap);
  wrap.querySelector('#cal-more-btn').addEventListener('click', () => {
    setCalDays(calendarViewDays + 21);
    loadCalendar();
  });
}

function setCalView(mode) {
  calView = mode;
  document.getElementById('vt-list').classList.toggle('active', mode === 'list');
  document.getElementById('vt-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('vt-profile').classList.toggle('active', mode === 'profile');
  renderCalView();
}

function renderCalView() {
  const list = document.getElementById('calendar-list');
  const grid = document.getElementById('calendar-grid');
  const profile = document.getElementById('calendar-profile');
  list.classList.toggle('hidden', calView !== 'list');
  grid.classList.toggle('hidden', calView !== 'grid');
  profile.classList.toggle('hidden', calView !== 'profile');
  const items = getFiltered();
  const countEl = document.getElementById('f-count');
  if (countEl) countEl.textContent = `${items.length} de ${calItems.length} piezas`;
  if (calView === 'list') renderCalList(items);
  else if (calView === 'grid') renderCalGrid(items);
  else renderProfileGrid();
  renderCalMore();
}

/**
 * Vista "Perfil": cómo va a quedar la grilla de Instagram con lo planificado.
 * Mezcla lo PUBLICADO real con lo APROBADO en su posición cronológica exacta
 * (del más nuevo al más viejo, como la grilla real). Con el toggle se pueden
 * sumar también los borradores para ver el futuro completo. Ignora los filtros.
 */
let pgIncludeDrafts = false;
function renderProfileGrid() {
  const holder = document.getElementById('calendar-profile');
  const allowed = pgIncludeDrafts ? ['draft', 'approved', 'published'] : ['approved', 'published'];
  const tiles = calItems
    .filter((i) => (i.post_type === 'feed' || i.post_type === 'reel') && i.image_path
      && allowed.includes(i.asset_status || i.status))
    .sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date)));

  if (!tiles.length) {
    const hasDrafts = calItems.some((i) => (i.post_type === 'feed' || i.post_type === 'reel')
      && i.image_path && (i.asset_status || i.status) === 'draft');
    holder.innerHTML = `<p class="empty">${!pgIncludeDrafts && hasDrafts
      ? 'No hay piezas aprobadas o publicadas todavía. <br/><button class="btn-ghost btn-sm" style="margin-top:14px;" onclick="pgIncludeDrafts=true; renderProfileGrid()">Ver la grilla con los borradores</button>'
      : 'Todavía no hay piezas de feed/reel generadas para armar la grilla.'}</p>`;
    return;
  }

  const dot = (i) => {
    const st = i.asset_status || i.status;
    if (st === 'published') return '<span class="pg-dot pub" title="Publicado"></span>';
    if (st === 'approved') return '<span class="pg-dot appr" title="Aprobado"></span>';
    return '<span class="pg-dot draft" title="Borrador"></span>';
  };
  const mark = (i) => {
    const slides = parseSlides(i.slides);
    if (slides && slides.length > 1) return `<span class="pg-mark">${icon('grid')}</span>`;
    if (i.post_type === 'reel') return `<span class="pg-mark">${icon('play')}</span>`;
    return '';
  };

  holder.innerHTML = `
    <div class="pg-wrap">
      <div class="pg-head">
        <div class="ig-av">B</div>
        <div><b>blacks.indumentaria</b><span class="hint"> · así queda tu grilla (${tiles.length} piezas)</span></div>
        <label class="pg-toggle"><input type="checkbox" id="pg-drafts" ${pgIncludeDrafts ? 'checked' : ''}/> incluir borradores</label>
      </div>
      <div class="pg-legend"><span class="pg-dot pub"></span> publicado <span class="pg-dot appr"></span> aprobado${pgIncludeDrafts ? ' <span class="pg-dot draft"></span> borrador' : ''}</div>
      <div class="pg-grid">
        ${tiles.map((i, idx) => `
          <div class="pg-tile" data-idx="${idx}" title="${esc(i.theme_title || i.pillar_detail || '')} · ${String(i.scheduled_date).slice(0, 10)}">
            <img src="${esc(i.image_path)}" loading="lazy" alt=""/>
            ${mark(i)}${dot(i)}
          </div>`).join('')}
      </div>
    </div>`;

  holder.querySelectorAll('.pg-tile').forEach((t) =>
    t.addEventListener('click', () => openPreview(tiles[Number(t.dataset.idx)])));
  const tg = holder.querySelector('#pg-drafts');
  if (tg) tg.addEventListener('change', () => { pgIncludeDrafts = tg.checked; renderProfileGrid(); });
}

/**
 * Tira de días pegada arriba de la lista: un chip por día con piezas. Tocás un día
 * y la lista salta ahí (sin scrollear a mano medio mes). Hoy queda resaltado.
 */
function buildDayStrip(keys, groups) {
  const strip = document.createElement('div');
  strip.className = 'day-strip';
  const today = todayKey();
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  strip.innerHTML = keys.map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const n = (groups[k] || []).length;
    return `<button class="day-chip ${k === today ? 'today' : ''}" data-goto="${k}" title="${formatDate(k)} · ${n} pieza${n > 1 ? 's' : ''}">
      <span class="dc-dow">${DIA[date.getDay()]}</span><span class="dc-num">${d}</span><span class="dc-mon">${MES[m - 1]}</span>
    </button>`;
  }).join('');
  strip.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(`day-${b.dataset.goto}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    strip.querySelectorAll('.day-chip').forEach((c) => c.classList.toggle('active', c === b));
  }));
  return strip;
}

function renderCalList(items) {
  const list = document.getElementById('calendar-list');
  if (!items.length) { list.innerHTML = '<p class="empty">No hay piezas que coincidan con los filtros.</p>'; return; }
  const groups = groupByDate(items);
  const keys = Object.keys(groups).sort();
  list.innerHTML = '';
  list.appendChild(buildDayStrip(keys, groups));
  for (const key of keys) {
    const group = groups[key];
    const g = document.createElement('div');
    g.className = 'day-group';
    g.id = `day-${key}`;
    const theme = group.find((x) => x.theme_title)?.theme_title || '';
    g.innerHTML = `<div class="day-head">
      <span class="date">${formatDate(key)}</span>
      ${theme ? `<span class="theme">· ${esc(theme)}</span>` : ''}
      <span class="line"></span></div>`;
    for (const it of group) g.appendChild(renderCard(it));
    list.appendChild(g);
  }
}

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function renderCalGrid(items) {
  const grid = document.getElementById('calendar-grid');
  const groups = groupByDate(items);
  const keys = Object.keys(groupByDate(calItems)).sort();
  if (!keys.length) { grid.innerHTML = '<p class="empty">No hay piezas todavía.</p>'; return; }

  const first = new Date(keys[0] + 'T00:00:00');
  const start = new Date(first);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const todayKey = new Date().toLocaleDateString('sv-SE');

  let html = '<div class="cal-grid"><div class="cal-head">' + DOW.map((d) => `<div>${d}</div>`).join('') + '</div><div class="cal-body">';
  for (let i = 0; i < 28; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toLocaleDateString('sv-SE');
    const dayItems = groups[key] || [];
    const has = dayItems.length > 0;
    const isToday = key === todayKey;
    const dots = dayItems.slice(0, 4).map((it) => {
      const st = statusOf(it);
      const cls = st === 'repost' ? 'muted' : (st === 'published' ? 'pub' : st === 'approved' ? 'appr' : st === 'draft' ? 'draft' : 'pend');
      return `<span class="cal-dot ${cls}"></span>`;
    }).join('');
    html += `<div class="cal-cell ${has ? 'has' : ''} ${isToday ? 'today' : ''}" ${has ? `data-day="${key}"` : ''}>
      <div class="cal-num">${d.getDate()}</div><div class="cal-dots">${dots}</div></div>`;
  }
  html += '</div></div><div class="cal-legend"><span class="cal-dot pend"></span>Sin generar <span class="cal-dot draft"></span>Borrador <span class="cal-dot appr"></span>Aprobado <span class="cal-dot pub"></span>Publicado</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('[data-day]').forEach((c) => c.addEventListener('click', () => openDayDetail(c.dataset.day)));
}

function openDayDetail(key) {
  const groups = groupByDate(calItems);
  const allKeys = Object.keys(groups).sort();
  const idx = allKeys.indexOf(key);
  const prev = idx > 0 ? allKeys[idx - 1] : null;
  const next = idx >= 0 && idx < allKeys.length - 1 ? allKeys[idx + 1] : null;
  const items = groups[key] || [];
  const theme = items.find((x) => x.theme_title)?.theme_title || '';
  // Flechas para pasar al día anterior/siguiente sin cerrar y volver a abrir.
  const nav = `<div class="day-nav">
    <button class="btn-ghost btn-sm" id="dn-prev" ${prev ? '' : 'disabled'}>‹ ${prev ? esc(formatDate(prev)) : 'Anterior'}</button>
    <span class="hint" style="margin:0;">${items.length} pieza${items.length === 1 ? '' : 's'}</span>
    <button class="btn-ghost btn-sm" id="dn-next" ${next ? '' : 'disabled'}>${next ? esc(formatDate(next)) : 'Siguiente'} ›</button>
  </div>`;
  const overlay = showInfoModal(`${formatDate(key)}${theme ? ' · ' + esc(theme) : ''}`, `${nav}<div id="day-detail"></div>`);
  const go = (k) => { overlay.remove(); openDayDetail(k); };
  if (prev) overlay.querySelector('#dn-prev').addEventListener('click', () => go(prev));
  if (next) overlay.querySelector('#dn-next').addEventListener('click', () => go(next));
  const holder = overlay.querySelector('#day-detail');
  if (!items.length) { holder.innerHTML = '<p class="empty">Sin contenido este día.</p>'; return; }
  for (const it of items) holder.appendChild(renderCard(it));
}

function renderPreview(item) {
  const format = item.format || (item.post_type === 'feed' ? 'feed' : 'story');
  const isStory = format === 'story';
  const slides = parseSlides(item.slides);
  const isCarousel = slides && slides.length > 1;
  let media;
  if (item.video_path) media = `<video class="media" src="${esc(item.video_path)}" muted loop playsinline autoplay poster="${esc(item.image_path || '')}"></video>`;
  else if (isCarousel) media = `<div class="carousel">${slides.map((u) => `<img src="${esc(u)}" alt=""/>`).join('')}</div><div class="c-count">${icon('grid')} ${slides.length}</div>`;
  else if (item.image_path) media = `<img class="media" src="${esc(item.image_path)}" alt="" />`;
  else media = `<div class="empty-media">${esc(item.pillar_detail || item.theme_title || 'Sin generar')}</div>`;

  const chrome = isStory ? `<div class="story-chrome">
      <div class="story-bars"><span></span><span></span><span></span></div>
      <div class="story-user"><div class="story-avatar">B</div><div><div class="u">blacks.indumentaria</div></div></div>
      ${item.post_type === 'reel' ? `<div class="reel-play">${icon('play')}</div>` : ''}
    </div>` : '';

  const label = isCarousel ? `CARRUSEL · ${slides.length} · 4:5`
    : isStory ? (item.post_type === 'reel' ? 'REEL · 9:16' : 'HISTORIA · 9:16') : 'FEED · 4:5';
  return `<div class="preview-wrap">
    <div class="phone ${isStory ? 'story' : 'feed'}">${media}${chrome}</div>
    <div class="fmt-label">${icon('pin')} ${label} · <span class="see">${icon('eye')} ver</span></div>
  </div>`;
}

/**
 * Badge de carrusel, a simple vista:
 *  - la pieza YA es carrusel -> "CARRUSEL · N"
 *  - el slot está marcado carrusel pero la pieza generada es simple -> aviso de regenerar
 */
function carouselBadge(item) {
  const slides = parseSlides(item.slides);
  if (slides && slides.length > 1) return `<span class="badge whole">${icon('grid')} Carrusel · ${slides.length}</span>`;
  if (item.carousel && item.asset_id) return `<span class="badge semi" title="Marcaste este slot como carrusel después de generar la pieza. Tocá Regenerar para que salga como carrusel.">${icon('grid')} Carrusel — regenerá para aplicar</span>`;
  if (item.carousel) return `<span class="badge semi">${icon('grid')} Carrusel</span>`;
  return '';
}

function interactionShort(item) {
  const h = (item.interaction_hint || '').toUpperCase();
  if (h.includes('ENCUESTA')) return 'Encuesta';
  if (h.includes('QUIZ')) return 'Quiz';
  if (h.includes('PREGUNTA')) return 'Preguntas';
  return 'Interacción';
}

/* ============ previsualización realista (cómo se publica) ============ */
function openPreview(item) {
  const format = item.format || (item.post_type === 'feed' ? 'feed' : 'story');
  const isStory = format === 'story';
  const isReel = item.post_type === 'reel';
  const img = item.image_path, vid = item.video_path;
  const slides = parseSlides(item.slides);
  const feedMedia = (slides && slides.length > 1)
    ? `<div class="carousel">${slides.map((u) => `<img src="${esc(u)}"/>`).join('')}</div><div class="c-count">${icon('grid')} 1/${slides.length}</div>`
    : (img ? `<img src="${esc(img)}"/>` : '<div class="ig-empty">Sin imagen generada</div>');

  let inner;
  if (!isStory) {
    inner = `<div class="ig-post">
      <div class="ig-head"><div class="ig-av">B</div><div class="ig-user">blacks.indumentaria</div><div class="ig-dots">···</div></div>
      <div class="ig-media feed">${feedMedia}</div>
      <div class="ig-actions"><span>${icon('heart')}</span><span>${icon('comment')}</span><span>${icon('send')}</span><span class="grow"></span><span>${icon('bookmark')}</span></div>
      <div class="ig-likes">A <b>128 personas</b> les gusta esto</div>
      <div class="ig-cap"><b>blacks.indumentaria</b> ${esc(item.caption || '')}</div>
      ${item.hashtags ? `<div class="ig-tags">${esc(item.hashtags)}</div>` : ''}
    </div>`;
  } else {
    const media = vid ? `<video src="${esc(vid)}" controls autoplay loop playsinline></video>`
      : (img ? `<img src="${esc(img)}"/>` : '<div class="ig-empty">Sin imagen generada</div>');
    inner = `<div class="ig-story">
      <div class="ig-story-top"><div class="bars"><span></span></div>
        <div class="who"><div class="ig-av sm">B</div><span class="n">blacks.indumentaria</span><span class="t">1 h</span></div></div>
      ${media}
      ${isReel ? `<div class="ig-rail"><span>${icon('heart')}<i>1.2k</i></span><span>${icon('comment')}<i>44</i></span><span>${icon('send')}</span><span>${icon('bookmark')}</span></div>` : ''}
      <div class="ig-story-bottom">
        ${isReel ? `<div class="ig-reel-cap"><b>blacks.indumentaria</b> ${esc((item.caption || '').slice(0, 110))}</div>`
                 : `<div class="ig-reply">Enviá un mensaje…</div>`}
      </div>
      ${(item.automation_level === 'semi' && item.interaction_hint) ? `<div class="ig-sticker">${esc(interactionShort(item))}</div>` : ''}
    </div>`;
  }

  const note = (isReel && !vid) ? '<div class="preview-note">Este Reel todavía no tiene video: generalo en Gemini/Veo con "Prompt video IA" y subilo. Lo que ves es la imagen base (no se publica así).</div>' : '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay preview-overlay';
  overlay.innerHTML = `<div class="preview-box ${isStory ? 'st' : 'fd'}">
    <div class="preview-top"><span class="fmt-label">${icon('pin')} Así se va a ver en Instagram · ${isReel ? 'Reel' : isStory ? 'Historia' : 'Feed'}</span>
      <button class="btn-close preview-close">${icon('x')}</button></div>
    ${inner}${note}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.preview-close')) overlay.remove(); });
  document.body.appendChild(overlay);

  // Carrusel: flechas para pasar de slide (además del swipe) + contador en vivo.
  const car = overlay.querySelector('.carousel');
  if (car && slides && slides.length > 1) {
    const holder = car.parentElement;
    holder.insertAdjacentHTML('beforeend',
      `<button class="c-nav prev">‹</button><button class="c-nav next">›</button>`);
    const count = holder.querySelector('.c-count');
    const goto = (dir) => car.scrollBy({ left: dir * car.clientWidth, behavior: 'smooth' });
    holder.querySelector('.c-nav.prev').addEventListener('click', (e) => { e.stopPropagation(); goto(-1); });
    holder.querySelector('.c-nav.next').addEventListener('click', (e) => { e.stopPropagation(); goto(1); });
    car.addEventListener('scroll', () => {
      const i = Math.round(car.scrollLeft / car.clientWidth) + 1;
      if (count) count.innerHTML = `${icon('grid')} ${i}/${slides.length}`;
    }, { passive: true });
  }
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  const status = statusOf(item);
  const isSemi = item.automation_level === 'semi';
  const isRepost = status === 'repost';
  const aid = item.asset_id;

  // Sólo se marca la EXCEPCIÓN (semi = requiere acción manual); lo automático es el default.
  const autoBadge = (!isRepost && isSemi)
    ? `<span class="badge semi"><span class="idot amber"></span>Semi · publicás vos</span>` : '';
  const statusBadge = aid ? `<span class="badge status-${item.asset_status || item.status}">${statusLabel(item.asset_status || item.status)}</span>` : '';
  // Qué costó generar ESTA pieza (imágenes IA). 0 = salió gratis (plantilla/copy free tier).
  const pieceCost = Number(item.est_cost_usd || 0);
  const costBadge = aid
    ? `<span class="cost-tag ${pieceCost > 0 ? 'paid' : 'free'}" title="Costo de generación de esta pieza">${pieceCost > 0 ? `US$ ${pieceCost.toFixed(2)}` : 'Gratis'}</span>`
    : '';
  // Groq es el modelo de respaldo (calidad menor): conviene regenerar esos copys.
  const modelBadge = (aid && item.gen_model === 'groq' && status === 'draft')
    ? `<span class="badge qa-warn" title="Se generó con el modelo de respaldo (Gemini falló en ese momento). Si el texto no convence, regenerala.">respaldo</span>` : '';
  const qaBadge = (aid && item.qa_notes && status === 'draft')
    ? `<span class="badge qa-warn" title="${esc(item.qa_notes)}">revisar copy</span>` : '';

  // Mayorista / Minorista a simple vista.
  const commercialBadge = item.pillar === 'mayorista'
    ? `<span class="badge whole">Mayorista</span>`
    : (['producto', 'promo'].includes(item.pillar) ? `<span class="badge retail">Minorista</span>` : '');
  const dateBadges = commercialDatesOf(item).slice(0, 2).map((d) =>
    `<span class="badge commercial" title="${esc(d.angle || '')}">${icon('tag')} ${esc(d.title)}</span>`
  ).join('');

  const regenBtn = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Regenerar</button>`;
  // Siempre disponible si hay imagen/video: para retocar en el celular (stickers,
  // música) o publicar a mano.
  const downloadBtn = (aid && (item.image_path || item.video_path))
    ? `<button class="btn-ghost btn-sm" data-act="download" data-id="${aid}" title="Bajá la imagen o el video para editar en el celular o publicar a mano">${icon('download')} Descargar</button>` : '';
  const videoBtn = (item.post_type === 'reel' && aid)
    ? `<button class="btn-ghost btn-sm" data-act="videoprompt" data-id="${aid}">${icon('film')} Prompt video IA</button>` : '';
  const uploadVideoBtn = (item.post_type === 'reel' && aid)
    ? `<button class="btn-ghost btn-sm" data-act="uploadvideo" data-id="${aid}">${icon('upload')} Subir video</button>` : '';
  const editVideoBtn = (item.post_type === 'reel' && aid && item.video_path)
    ? `<button class="btn-ghost btn-sm" data-act="editvideo" data-id="${aid}">${icon('film')} Subtítulos${item.edit_status === 'done' ? ' ✓' : ''}</button>` : '';
  const planBtn = status !== 'published'
    ? `<button class="btn-ghost btn-sm" data-act="planslot" data-id="${item.id}">${icon('calendar')} Planificar</button>` : '';

  let actions = '';
  if (isRepost) {
    actions = `<span style="color:var(--muted); font-size:13px;">Día de descanso / repost — sin generación automática.</span>${planBtn}`;
  } else if (!aid) {
    // Reels: se genera SOLO el copy + imagen base (el video no se auto-genera nunca;
    // lo hacés en Gemini/Veo con el prompt y lo subís).
    actions = item.post_type === 'reel'
      ? `<button class="btn-primary" data-act="generate" data-id="${item.id}">${icon('bolt')} Generar copy (sin video) ${costTag('Gratis')}</button>
        <button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Con otro tema</button>${planBtn}`
      : `<button class="btn-primary" data-act="generate" data-id="${item.id}">${icon('bolt')} Generar pieza ${costTag(genCostLabel())}</button>
        <button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Con otro tema</button>${planBtn}`;
  } else if (status === 'draft') {
    actions = `<button class="btn-approve" data-act="approve" data-id="${aid}">${icon('check')} Aprobar</button>
      <button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>
      ${regenBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}${downloadBtn}
      <button class="btn-discard btn-sm" data-act="discard" data-id="${aid}">${icon('trash')} Descartar</button>${planBtn}`;
  } else if (status === 'approved') {
    actions = (isSemi
      ? `<button class="btn-manual" data-act="publish" data-id="${aid}">${icon('info')} Cómo publicarla</button>`
      : `<button class="btn-publish" data-act="publish" data-id="${aid}">${icon('send')} Publicar ahora</button>`) +
      `<button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>${regenBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}${downloadBtn}${planBtn}`;
  } else if (status === 'published') {
    actions = `<span class="badge status-published" ${item.meta_post_id ? `title="ID de Instagram: ${esc(item.meta_post_id)}"` : ''}>${icon('check')} Publicada</span>
      ${downloadBtn}
      <button class="btn-ghost btn-sm" data-act="republish" data-id="${aid}" title="Por si la borraste de Instagram o querés volver a publicarla">${icon('refresh')} Republicar</button>`;
  } else if (status === 'discarded') {
    actions = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('refresh')} Regenerar</button>${planBtn}`;
  }

  const interaction = (isSemi && item.interaction_hint && status !== 'published')
    ? `<div class="interaction-box"><b>${icon('alert')} Acción manual:</b> ${esc(item.interaction_hint)}</div>` : '';

  // Reels: el video NUNCA se auto-genera (nada de imagen estática con zoom).
  // El copy y la imagen base salen del panel; el video lo generás en Gemini/Veo.
  const reelNote = (item.post_type === 'reel' && aid && !item.video_path && ['draft', 'approved'].includes(status))
    ? `<div class="reel-note">${icon('film')} Este Reel tiene el copy listo pero <b>le falta el video</b> (no se publica sin él): generalo en Gemini/Veo con <b>Prompt video IA</b> y subilo con <b>Subir video</b>.</div>` : '';

  const caption = item.caption
    ? `<div class="caption">${esc(item.caption)}</div>${item.hashtags ? `<div class="hashtags">${esc(item.hashtags)}</div>` : ''}`
    : `<div class="caption empty">${esc(item.pillar_detail || 'Todavía sin generar.')}</div>`;

  card.innerHTML = `
    <div>${renderPreview(item)}</div>
    <div class="body">
      <div class="meta-row">
        <span class="badge type">${typeLabel(item)}</span>
        ${carouselBadge(item)}
        <span class="badge pillar">${esc(item.pillar)}</span>
        ${item.objective ? `<span class="badge objective" title="Qué busca esta pieza">${esc(item.objective)}</span>` : ''}
        ${commercialBadge}
        ${dateBadges}
        ${item.scheduled_time ? `<span class="badge time">${icon('clock')} ${esc(item.scheduled_time)} hs</span>` : ''}
        ${autoBadge}${statusBadge}${costBadge}${modelBadge}${qaBadge}
      </div>
      ${caption}
      ${interaction}
      ${reelNote}
      <div class="actions">${actions}</div>
    </div>`;

  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id, btn, card, item));
  });
  const ph = card.querySelector('.phone');
  if (ph) { ph.style.cursor = 'zoom-in'; ph.title = 'Ver cómo se publica'; ph.addEventListener('click', () => openPreview(item)); }
  return card;
}

async function handleAction(act, id, btn, card, item) {
  try {
    if (act === 'generate') {
      btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Generando…`;
      await api(`/api/generate/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      toast('Pieza generada', 'ok'); reloadKeepScroll();
    } else if (act === 'approve') {
      await api(`/api/assets/${id}/approve`, { method: 'POST' }); toast('Aprobada', 'ok'); reloadKeepScroll();
    } else if (act === 'discard') {
      await api(`/api/assets/${id}/discard`, { method: 'POST' }); toast('Descartada'); reloadKeepScroll();
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'regen') {
      openRegen(item || calItems.find((x) => String(x.id) === String(id)));
    } else if (act === 'videoprompt') {
      openVideoPrompt(id);
    } else if (act === 'uploadvideo') {
      openVideoUpload(id);
    } else if (act === 'editvideo') {
      openVideoEditor(id);
    } else if (act === 'planslot') {
      openPlanSlot(item || calItems.find((x) => String(x.id) === String(id)));
    } else if (act === 'download') {
      openDownload(item || calItems.find((x) => String(x.asset_id) === String(id)));
    } else if (act === 'publish') {
      await doPublish(id, btn);
    } else if (act === 'republish') {
      const ok = await confirmModal('Republicar pieza',
        'Vuelve a quedar <b>aprobada</b>: sale sola en la próxima pasada automática, o la publicás al instante con "Publicar ahora".', 'Republicar');
      if (!ok) return;
      await api(`/api/assets/${id}/republish`, { method: 'POST' });
      toast('Lista para volver a publicar', 'ok'); reloadKeepScroll();
    }
  } catch (e) {
    toast(e.message, 'err');
    if (btn) btn.disabled = false;
    reloadKeepScroll();
  }
}

/* ============ descargar pieza ============ */
/**
 * Descarga real (no abrir en pestaña): baja el archivo como blob y dispara el
 * guardado con nombre propio. Si el host no permite CORS, cae a abrirlo aparte.
 */
async function saveFile(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (url.split('/').pop() || 'pieza').split('?')[0];
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (_) {
    window.open(url, '_blank'); // último recurso: abrir para guardar a mano
  }
}

/** Descarga la pieza (imagen, video o todas las slides del carrusel). */
function openDownload(item) {
  if (!item) return;
  const slides = parseSlides(item.slides);
  const files = [];
  if (item.video_path) files.push({ url: item.edited_video_path || item.video_path, label: item.edited_video_path ? 'Video con subtítulos' : 'Video del Reel', ext: 'mp4' });
  if (slides && slides.length > 1) slides.forEach((u, i) => files.push({ url: u, label: `Slide ${i + 1} de ${slides.length}`, ext: 'jpg' }));
  else if (item.image_path) files.push({ url: item.image_path, label: item.video_path ? 'Imagen base' : 'Imagen', ext: 'jpg' });
  if (!files.length) { toast('Esta pieza todavía no tiene imagen ni video.'); return; }

  const date = String(item.scheduled_date).slice(0, 10);
  const nameOf = (f, i) => `blacks-${date}-${item.post_type}${files.length > 1 ? `-${i + 1}` : ''}.${f.ext}`;
  if (files.length === 1) { toast('Descargando…'); saveFile(files[0].url, nameOf(files[0], 0)); return; }

  const body = `
    <p class="hint" style="margin-top:0;">Bajá los archivos para retocarlos en el celular (stickers, música) o publicarlos a mano.</p>
    ${files.map((f, i) => `<div class="dl-row"><span>${esc(f.label)}</span>
      <button class="btn-ghost btn-sm" data-dl="${i}">${icon('download')} Descargar</button></div>`).join('')}
    <div style="display:flex; justify-content:flex-end; margin-top:14px;">
      <button class="btn-primary btn-sm" id="dl-all">${icon('download')} Descargar todo</button>
    </div>`;
  const ov = showInfoModal('Descargar pieza', body);
  ov.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.dl);
    saveFile(files[i].url, nameOf(files[i], i));
  }));
  ov.querySelector('#dl-all').addEventListener('click', async () => {
    toast(`Descargando ${files.length} archivos…`);
    for (let i = 0; i < files.length; i += 1) await saveFile(files[i].url, nameOf(files[i], i));
  });
}

/* ============ planificar / editar slots ============ */
function todayKey() {
  return new Date().toLocaleDateString('sv-SE');
}

function planSelect(id, label, options, value) {
  return `<div class="field"><label>${label}</label><select class="input" id="${id}">
    ${options.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}
  </select></div>`;
}

function planText(id, label, value, placeholder = '') {
  return `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" /></div>`;
}

function readPlanForm(overlay) {
  const postType = overlay.querySelector('#plan-post-type').value;
  const format = overlay.querySelector('#plan-format').value || (postType === 'feed' ? 'feed' : 'story');
  const pillar = overlay.querySelector('#plan-pillar').value.trim() || 'producto';
  const status = overlay.querySelector('#plan-status').value;
  return {
    scheduled_date: overlay.querySelector('#plan-date').value,
    scheduled_time: overlay.querySelector('#plan-time').value,
    post_type: postType,
    format,
    pillar,
    pillar_detail: overlay.querySelector('#plan-detail').value.trim(),
    theme_title: overlay.querySelector('#plan-theme').value.trim(),
    automation_level: overlay.querySelector('#plan-auto').value,
    interaction_hint: overlay.querySelector('#plan-hint').value.trim(),
    carousel: overlay.querySelector('#plan-carousel').checked,
    status,
  };
}

function openPlanSlot(item = null) {
  const isNew = !item;
  const body = `
    <p class="hint" style="margin-top:0;">Editá la estrategia del calendario sin regenerar todavía. Si ya hay una pieza creada, estos cambios aplican al slot; usá “Regenerar” para rehacer copy/imagen con el nuevo brief.</p>
    <div class="plan-grid">
      ${planText('plan-date', 'Fecha', item ? String(item.scheduled_date).slice(0, 10) : todayKey(), 'YYYY-MM-DD')}
      ${planText('plan-time', 'Hora ARG', item?.scheduled_time || '18:00', '18:00')}
      ${planSelect('plan-post-type', 'Formato de publicación', [
        { v: 'feed', t: 'Feed' }, { v: 'story', t: 'Historia' }, { v: 'reel', t: 'Reel' },
      ], item?.post_type || 'feed')}
      ${planSelect('plan-format', 'Lienzo', [
        { v: 'feed', t: 'Feed 4:5' }, { v: 'story', t: 'Story/Reel 9:16' },
      ], item?.format || (item?.post_type === 'feed' ? 'feed' : 'story'))}
      ${planSelect('plan-pillar', 'Pilar', [
        { v: 'producto', t: 'Producto' }, { v: 'promo', t: 'Promo' }, { v: 'educativo', t: 'Educativo' },
        { v: 'marca', t: 'Marca' }, { v: 'mayorista', t: 'Mayorista' }, { v: 'ugc', t: 'UGC/testimonio' },
        { v: 'engagement', t: 'Engagement' }, { v: 'repost', t: 'Descanso/repost' },
      ], item?.pillar || 'producto')}
      ${planSelect('plan-auto', 'Automatización', [
        { v: 'auto', t: 'Automática' }, { v: 'semi', t: 'Semi/manual' },
      ], item?.automation_level || 'auto')}
      ${planSelect('plan-status', 'Estado del slot', [
        { v: 'pending', t: 'Pendiente' }, { v: 'skipped', t: 'Pausado/descanso' },
      ], item?.status === 'skipped' ? 'skipped' : 'pending')}
      <label class="check-row"><input type="checkbox" id="plan-carousel" ${item?.carousel ? 'checked' : ''} /> Carrusel</label>
    </div>
    <div class="field"><label>Título interno</label><input class="input" id="plan-theme" value="${esc(item?.theme_title || '')}" placeholder="Ej: Oferta aguinaldo" /></div>
    <div class="field"><label>Brief / detalle del pilar</label><textarea class="input" id="plan-detail" placeholder="Ej: Botines con puntera para construcción">${esc(item?.pillar_detail || '')}</textarea></div>
    <div class="field"><label>Acción manual si es semi</label><textarea class="input" id="plan-hint" placeholder="Ej: Agregá encuesta con dos opciones">${esc(item?.interaction_hint || '')}</textarea></div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="plan-cancel">Cancelar</button>
      <button class="btn-primary" id="plan-save">${icon('check')} ${isNew ? 'Crear slot' : 'Guardar cambios'}</button>
    </div>`;
  const overlay = showInfoModal(isNew ? 'Agregar slot' : 'Planificar slot', body);
  overlay.querySelector('#plan-post-type').addEventListener('change', (e) => {
    overlay.querySelector('#plan-format').value = e.target.value === 'feed' ? 'feed' : 'story';
  });
  overlay.querySelector('#plan-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#plan-save').addEventListener('click', async () => {
    const btn = overlay.querySelector('#plan-save');
    btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Guardando…`;
    try {
      const payload = readPlanForm(overlay);
      await api(isNew ? '/api/calendar' : `/api/calendar/${item.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      overlay.remove();
      toast(isNew ? 'Slot agregado' : 'Slot actualizado', 'ok');
      reloadKeepScroll();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false; btn.innerHTML = `${icon('check')} ${isNew ? 'Crear slot' : 'Guardar cambios'}`;
    }
  });
}

/* ============ regenerar con otro tema ============ */
function openRegen(item) {
  if (!item) return;
  const current = item.pillar_detail || item.theme_title || '';
  const suggestions = {
    educativo: ['Cómo elegir el talle correcto', 'Cuidados para que la ropa dure más', 'Diferencia entre telas de trabajo'],
    producto: ['Lo más vendido de la semana', 'Ideal para el frío', 'Novedad recién llegada'],
    promo: ['Ofertas de temporada', '3 cuotas sin interés', 'Envío gratis desde cierto monto'],
    marca: ['Por qué elegir esta marca', 'Historia de la marca'],
    engagement: ['¿Qué preferís vos?', 'Contanos en qué rubro trabajás'],
  };
  const sugg = (suggestions[item.pillar] || ['Enfoque en beneficios', 'Enfoque en temporada', 'Enfoque en precio']);
  const body = `
    <p class="hint" style="margin-top:0;">Pilar: <b>${esc(item.pillar)}</b> · ${typeLabel(item)}. Cambiá el tema/ángulo y la IA vuelve a generar el texto y la imagen.</p>
    <div class="field">
      <label>Tema / ángulo de esta pieza</label>
      <textarea class="input" id="regen-detail" placeholder="Ej: Botines con puntera para la construcción">${esc(current)}</textarea>
      <div class="chips-suggest">${sugg.map((s) => `<span class="chip-suggest" data-s="${esc(s)}">${esc(s)}</span>`).join('')}</div>
    </div>
    <div class="field">
      <label>Plantilla visual</label>
      <select class="input" id="regen-template">
        <option value="">Automática (según pilar)</option>
        <option value="fullbleed">Full-bleed — foto a sangre + precio</option>
        <option value="minimal">Minimal — estudio claro, evergreen</option>
        <option value="promo">Promo — oscura, % OFF gigante</option>
        <option value="educativo">Educativa — tipográfica clara</option>
        <option value="mayorista">Mayorista — corporativa + presupuesto</option>
      </select>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="regen-cancel">Cancelar</button>
      <button class="btn-primary" id="regen-go">${icon('wand')} Regenerar con IA ${costTag(genCostLabel())}</button>
    </div>`;
  const overlay = showInfoModal('Regenerar pieza', body);
  overlay.querySelectorAll('.chip-suggest').forEach((c) =>
    c.addEventListener('click', () => { overlay.querySelector('#regen-detail').value = c.dataset.s; }));
  overlay.querySelector('#regen-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#regen-go').addEventListener('click', async () => {
    const detail = overlay.querySelector('#regen-detail').value.trim();
    const go = overlay.querySelector('#regen-go');
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Generando…`;
    try {
      await api(`/api/generate/${item.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillarDetail: detail, theme: detail, template: overlay.querySelector('#regen-template').value || undefined }),
      });
      overlay.remove(); toast('Pieza regenerada', 'ok'); reloadKeepScroll();
    } catch (e) { toast(e.message, 'err'); go.disabled = false; go.innerHTML = `${icon('wand')} Regenerar con IA`; }
  });
}

async function openVideoPrompt(assetId) {
  try {
    const d = await api(`/api/assets/${assetId}/video-prompt`);
    const body = `
      <p class="hint" style="margin-top:0;">Para una escena de video a medida (fábrica, calle, obra…) generala a mano en Gemini/Veo con esto:</p>
      <div class="field"><label>Pasos</label>
        <ol style="line-height:1.8; padding-left:20px; font-size:14px; margin:0;">${d.instructions.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
      ${(d.productImages && d.productImages.length) ? `<div class="field"><label>Fotos del producto a mandar (${d.productImages.length}) — subí varias perspectivas</label>
        <div class="vp-imgs">${d.productImages.map((u, i) => `<a href="${esc(u)}" target="_blank" title="foto ${i + 1}"><img src="${esc(u)}"/></a>`).join('')}</div></div>` : ''}
      <div class="field"><label>Prompt (copialo y pegalo)</label>
        <textarea class="input" id="vp-text" readonly style="min-height:200px">${esc(d.prompt)}</textarea></div>
      ${d.platformNote ? `<p class="hint" style="margin:0 0 12px;">${icon('info')} ${esc(d.platformNote)}</p>` : ''}
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn-primary" id="vp-copy">${icon('copy')} Copiar prompt</button></div>`;
    const ov = showInfoModal('Prompt para video con IA', body);
    ov.querySelector('#vp-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(d.prompt).then(() => toast('Prompt copiado', 'ok')));
  } catch (e) { toast(e.message, 'err'); }
}

function openVideoUpload(assetId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'video/*';
  input.addEventListener('change', async () => {
    if (!input.files || !input.files.length) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    toast('Subiendo video… (puede tardar)');
    try {
      await api(`/api/assets/${assetId}/upload-video`, { method: 'POST', body: fd });
      toast('Video cargado. Ahora podés ponerle subtítulos o publicarlo.', 'ok');
      reloadKeepScroll();
    } catch (e) { toast(e.message, 'err'); }
  });
  input.click();
}

/* ============ editor de video (subtítulos) ============ */
function openVideoEditor(assetId) {
  const it = calItems.find((x) => String(x.asset_id) === String(assetId));
  const body = `
    <p class="hint" style="margin-top:0;">Sumá una voz en off (opcional), transcribí para sacar los subtítulos, corregí palabras y generá el Reel con subtítulos quemados.</p>
    ${it && it.video_path ? `<video src="${esc(it.video_path)}" controls playsinline style="width:160px;border-radius:10px;display:block;margin-bottom:14px;"></video>` : ''}

    <div class="field">
      <label>1 · Voz en off (opcional)</label>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button class="btn-ghost btn-sm" id="ve-rec">${icon('mic')} Grabar voz</button>
        <button class="btn-ghost btn-sm" id="ve-vo">${icon('upload')} Subir audio</button>
        <span class="hint" id="ve-vo-st"></span>
      </div>
      <p class="hint" style="margin:6px 0 0;">Grabá con el micrófono o subí un audio (mp3/m4a/wav). Si el video no tiene audio (ej: generado en Gemini), la voz de acá se usa para el audio y los subtítulos.</p>
    </div>

    <div class="field">
      <label>2 · Subtítulos</label>
      <button class="btn-primary btn-sm" id="ve-transcribe">${icon('sparkles')} Transcribir con IA</button>
      <div id="ve-words" style="margin-top:12px;"></div>
    </div>

    <div class="field">
      <label>3 · Estilo de subtítulos</label>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <select class="filter" id="ve-pos"><option value="bottom">Abajo</option><option value="top">Arriba</option></select>
        <select class="filter" id="ve-n"><option value="2">2 palabras</option><option value="3" selected>3 palabras</option><option value="4">4 palabras</option></select>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);"><input type="checkbox" id="ve-upper" checked/> MAYÚSCULAS</label>
      </div>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
      <button class="btn-primary" id="ve-go">${icon('film')} Generar Reel con subtítulos</button>
    </div>
    <div id="ve-st" class="hint" style="margin-top:10px;"></div>`;
  const ov = showInfoModal('Editor de video · subtítulos + voz', body);
  let words = [];

  ov.querySelector('#ve-transcribe').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = `${icon('refresh', 'spin')} Transcribiendo…`;
    try {
      const d = await api(`/api/assets/${assetId}/transcribe`, { method: 'POST' });
      words = d.words || [];
      const wEl = ov.querySelector('#ve-words');
      wEl.innerHTML = words.length
        ? `<label class="fmt-label">Palabras (tocá para corregir errores):</label><div class="ve-grid">${words.map((w, i) => `<input class="ve-w" data-i="${i}" value="${esc(w.word)}"/>`).join('')}</div>`
        : '<p class="hint">No detecté voz. Subí una voz en off arriba y transcribí de nuevo.</p>';
    } catch (err) { toast(err.message, 'err'); }
    finally { b.disabled = false; b.innerHTML = `${icon('sparkles')} Transcribir de nuevo`; }
  });

  ov.querySelector('#ve-vo').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
    inp.addEventListener('change', async () => {
      if (!inp.files || !inp.files.length) return;
      const fd = new FormData(); fd.append('file', inp.files[0]);
      ov.querySelector('#ve-vo-st').textContent = 'Subiendo…';
      try { await api(`/api/assets/${assetId}/upload-voiceover`, { method: 'POST', body: fd }); ov.querySelector('#ve-vo-st').textContent = 'Voz cargada ✓ — ahora tocá "Transcribir con IA"'; }
      catch (e) { toast(e.message, 'err'); ov.querySelector('#ve-vo-st').textContent = ''; }
    });
    inp.click();
  });

  // Grabar voz con el micrófono (MediaRecorder).
  let mediaRecorder = null, recChunks = [], recTimer = null, recSecs = 0;
  ov.querySelector('#ve-rec').addEventListener('click', async () => {
    const btn = ov.querySelector('#ve-rec');
    if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      recChunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        clearInterval(recTimer);
        stream.getTracks().forEach((t) => t.stop());
        btn.innerHTML = `${icon('mic')} Grabar voz`;
        const blob = new Blob(recChunks, { type: 'audio/webm' });
        const fd = new FormData(); fd.append('file', new File([blob], 'grabacion.webm', { type: 'audio/webm' }));
        ov.querySelector('#ve-vo-st').textContent = 'Subiendo grabación…';
        try { await api(`/api/assets/${assetId}/upload-voiceover`, { method: 'POST', body: fd }); ov.querySelector('#ve-vo-st').textContent = 'Voz grabada ✓ — ahora tocá "Transcribir con IA"'; }
        catch (e) { toast(e.message, 'err'); ov.querySelector('#ve-vo-st').textContent = ''; }
      };
      mediaRecorder.start();
      recSecs = 0; btn.innerHTML = `${icon('stop')} Detener (0s)`;
      recTimer = setInterval(() => { recSecs += 1; btn.innerHTML = `${icon('stop')} Detener (${recSecs}s)`; }, 1000);
    } catch (e) { toast('No pude acceder al micrófono. Dale permiso al navegador.', 'err'); }
  });

  ov.querySelector('#ve-go').addEventListener('click', async (e) => {
    const edited = [...ov.querySelectorAll('.ve-w')].map((el) => ({ ...words[Number(el.dataset.i)], word: el.value }));
    const style = { position: ov.querySelector('#ve-pos').value, uppercase: ov.querySelector('#ve-upper').checked, maxWords: Number(ov.querySelector('#ve-n').value) };
    const b = e.currentTarget; b.disabled = true; b.innerHTML = `${icon('refresh', 'spin')} Encolando…`;
    const st = ov.querySelector('#ve-st');
    try {
      await api(`/api/assets/${assetId}/render-edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: edited, style }) });
      st.textContent = 'En cola. Se procesa en la próxima corrida (hasta ~30 min). Cuando esté, el botón "Subtítulos" muestra ✓.';
      b.innerHTML = `${icon('film')} En cola…`;
      pollEdit(assetId, st, b);
    } catch (err) { toast(err.message, 'err'); b.disabled = false; b.innerHTML = `${icon('film')} Generar con subtítulos`; }
  });
}

function pollEdit(assetId, statusEl, btn) {
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    try {
      const d = await api(`/api/assets/${assetId}/edit-status`);
      if (d.edit_status === 'done') {
        clearInterval(timer);
        statusEl.innerHTML = `Listo ✓ · <a href="${esc(d.edited_video_path)}" target="_blank">ver video</a>`;
        toast('Video con subtítulos listo', 'ok'); reloadKeepScroll();
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon('film')} Regenerar`; }
      } else if (d.edit_status === 'error') {
        clearInterval(timer); statusEl.textContent = 'Hubo un error procesando el video. Reintentá.';
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon('film')} Reintentar`; }
      }
    } catch (_) {}
    if (tries > 30) clearInterval(timer); // dejamos de pollear a los ~7 min; igual queda el ✓ al recargar
  }, 15000);
}

/* ============ productos ============ */
async function saveWholesale(e) {
  const b = e.currentTarget; b.disabled = true;
  try {
    await api('/api/wholesale', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        min_qty: document.getElementById('w-min').value,
        discount_note: document.getElementById('w-disc').value,
        conditions: document.getElementById('w-cond').value,
        contact: document.getElementById('w-contact').value,
      }),
    });
    toast('Condiciones mayoristas guardadas', 'ok');
  } catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; }
}

async function loadProducts() {
  const body = document.getElementById('products-body');
  body.innerHTML = skeleton('stats') + skeleton('rows', 6);
  try {
    const [d, w] = await Promise.all([api('/api/products/analytics'), api('/api/wholesale')]);
    const t = d.totals || {};
    const wholesalePanel = `
      <div class="panel" style="margin-bottom:18px;">
        <h3>${icon('tag')} Condiciones mayoristas</h3>
        <p class="hint">Entran al copy de las piezas mayoristas. Los productos "Consultar precio" o de stock infinito aparecen SOLO en piezas mayoristas; el resto es retail.</p>
        <div class="grid-2">
          <div class="field"><label>Cantidad mínima</label><input class="input" id="w-min" type="number" value="${w.min_qty || ''}" placeholder="ej: 10" /></div>
          <div class="field"><label>Descuentos por volumen</label><input class="input" id="w-disc" value="${esc(w.discount_note || '')}" placeholder="ej: 10% desde 20 u., 15% desde 50 u." /></div>
        </div>
        <div class="field"><label>Condiciones / beneficios</label><textarea class="input" id="w-cond" placeholder="ej: personalización con logo, factura A, envío a todo el país">${esc(w.conditions || '')}</textarea></div>
        <div class="field"><label>Cómo pedir presupuesto</label><input class="input" id="w-contact" value="${esc(w.contact || '')}" placeholder="ej: escribinos por WhatsApp" /></div>
        <button class="btn-primary btn-sm" id="w-save">${icon('check')} Guardar condiciones</button>
      </div>`;
    const money = (n) => n ? `$${Number(n).toLocaleString('es-AR')}` : '—';
    // Si hay precio promocional (tachado con descuento en Tiendanube), ESE es el que
    // vale: se muestra la oferta destacada y el regular tachado.
    const priceHtml = (p) => (p.promo_price && p.price && Number(p.promo_price) < Number(p.price))
      ? `<s style="opacity:.55">${money(p.price)}</s> <b style="color:var(--green)">${money(p.promo_price)}</b><span class="tag-ok">oferta</span>`
      : money(p.price);
    // Si el producto no califica para protagonizar contenido (talles incompletos,
    // stock bajo), se muestra el motivo — es la razón por la que el motor no lo elige.
    const contentTag = (p) => {
      if (!p.content) return '';
      if (p.content.ok) return `<span class="tag-ok">en rotación</span>`;
      return `<span class="tag-excl" title="No protagoniza piezas de producto/promo">${esc(p.content.reason)}</span>`;
    };
    const sizesTxt = (p) => (p.sizes_total > 1 ? ` · talles ${p.sizes_in_stock}/${p.sizes_total}` : '');
    const rowsHtml = (arr, right) => (arr && arr.length)
      ? arr.map((p) => `<div class="prod-row">
          <img src="${esc(p.image_url || '')}" onerror="this.style.visibility='hidden'"/>
          <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
            <div class="prod-sub">${esc(p.brand || '')} · stock ${p.stock ?? '—'}${sizesTxt(p)} · ${priceHtml(p)} ${contentTag(p)}</div></div>
          <div class="prod-metric">${right(p)}</div></div>`).join('')
      : '<p class="hint">Sin datos.</p>';
    body.innerHTML = wholesalePanel + `
      <div class="prod-totals">
        <div class="stat"><b>${t.total ?? 0}</b><span>productos</span></div>
        <div class="stat"><b>${t.retail ?? 0}</b><span>minoristas</span></div>
        <div class="stat"><b>${t.mayorista ?? 0}</b><span>mayoristas</span></div>
        <div class="stat"><b>${t.con_ventas ?? 0}</b><span>se vendieron (30d)</span></div>
        <div class="stat"><b>${t.unidades ?? 0}</b><span>unidades vendidas</span></div>
      </div>
      <div class="grid-2" style="margin-top:18px;">
        <div class="panel"><h3>${icon('chart')} Se venden bien (últimos 30 días)</h3>
          <p class="hint">Darle continuidad: destacarlos en historias y feed.</p>${rowsHtml(d.winners, (p) => `<b>${p.sales_30d}</b><span>vendidos</span>`)}</div>
        <div class="panel"><h3>${icon('alert')} A darles visibilidad</h3>
          <p class="hint">Mucho stock y pocas/ninguna venta: conviene mostrarlos más.</p>${rowsHtml(d.needVisibility, (p) => `<b>${p.stock}</b><span>en stock</span>`)}</div>
      </div>
      <div class="panel" style="margin-top:18px;">
        <h3>${icon('list')} Minoristas detectados (${(d.retail || []).length}) — precio y stock</h3>
        <p class="hint">Van con precio a las historias. ¿Falta alguno? Revisá precio y stock en Tiendanube y sincronizá de nuevo.</p>
        ${rowsHtml(d.retail, (p) => `<b>${p.stock}</b><span>stock</span>`)}
      </div>`;
    const ws = document.getElementById('w-save');
    if (ws) ws.addEventListener('click', saveWholesale);
  } catch (e) { body.innerHTML = `<p class="empty">Error: ${esc(e.message)}</p>`; }
}

async function doPublish(id, btn) {
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = `${icon('refresh', 'spin')} Procesando…`;
  const data = await api(`/api/assets/${id}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  if (data && data.manual) { btn.disabled = false; btn.innerHTML = original; openManualPublish(data); return; }
  toast('¡Publicado en redes!', 'ok'); reloadKeepScroll();
}

function openManualPublish(data) {
  const body = `
    <p style="line-height:1.6; margin-top:0;">${esc(data.message)}</p>
    ${data.interaction_hint ? `<div class="interaction-box" style="margin:14px 0;"><b>${icon('alert')} Sticker a agregar:</b> ${esc(data.interaction_hint)}</div>` : ''}
    <ol style="line-height:1.8; padding-left:20px; font-size:14px;">
      <li>Descargá la pieza y abrí Instagram.</li>
      <li>Subí la historia con esa imagen/video.</li>
      <li>Agregá el sticker indicado arriba.</li>
      ${data.link_url ? '<li>Si le ponés sticker de LINK, usá el link con seguimiento de abajo: así después vemos qué pieza trajo visitas y ventas.</li>' : ''}
      <li>Copiá el texto si querés usarlo.</li>
    </ol>
    ${data.link_url ? `<div class="field" style="margin-top:14px;"><label>Link con seguimiento (para el sticker de link)</label>
      <input class="input" id="mp-link" readonly value="${esc(data.link_url)}" /></div>` : ''}
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px;">
      <a class="btn-primary btn-sm" href="${esc(data.video_url || data.image_url)}" target="_blank" download>${icon('download')} Descargar pieza</a>
      <button class="btn-ghost btn-sm" id="copy-caption">${icon('copy')} Copiar texto</button>
      ${data.link_url ? `<button class="btn-ghost btn-sm" id="copy-link">${icon('copy')} Copiar link</button>` : ''}
    </div>`;
  const overlay = showInfoModal('Publicación semiautomatizada', body);
  const copyBtn = overlay.querySelector('#copy-caption');
  if (copyBtn) copyBtn.addEventListener('click', () =>
    navigator.clipboard.writeText(data.caption || '').then(() => toast('Texto copiado', 'ok')));
  const linkBtn = overlay.querySelector('#copy-link');
  if (linkBtn) linkBtn.addEventListener('click', () =>
    navigator.clipboard.writeText(data.link_url).then(() => toast('Link con seguimiento copiado', 'ok')));
}

async function generateAllPending() {
  const pend = calItems.filter((i) => statusOf(i) === 'sin-generar' &&
    String(i.scheduled_date).slice(0, 10) === new Date().toLocaleDateString('sv-SE'));
  if (!pend.length) { toast('No hay pendientes de hoy'); return; }
  toast(`Generando ${pend.length} pieza(s)…`);
  for (const it of pend) {
    try { await api(`/api/generate/${it.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    catch (e) { toast(`Error en un slot: ${e.message}`, 'err'); }
  }
  toast('Listo', 'ok'); reloadKeepScroll();
}

/* Nombre "Julio 2026" a partir de un 'YYYY-MM'. */
function monthName(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/* 'YYYY-MM' del mes actual y del siguiente (para el selector del plan). */
function plannableMonths() {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const next = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`;
  return { cur, next };
}

/* Plan mensual con IA: modal con selector de mes (actual o siguiente). El actual sirve
 * para RE-planificar con la lógica nueva un mes que ya tenía plan viejo. */
async function generateMonthPlan() {
  const { cur, next } = plannableMonths();
  const body = `
    <p class="hint" style="margin-top:0;">La IA arma la rotación del mes con tus fechas comerciales, ventas reales, stock y métricas. Los días ya <b>generados o aprobados no se tocan</b>; se replanifican los pendientes.</p>
    <div class="field">
      <label>¿Qué mes querés planificar?</label>
      <select class="input" id="plan-month">
        <option value="${cur}">${monthName(cur)} — actual (re-planifica con la lógica nueva)</option>
        <option value="${next}" selected>${monthName(next)} — próximo mes</option>
      </select>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="plan-cancel">Cancelar</button>
      <button class="btn-primary" id="plan-go">${icon('calendar')} Generar plan ${costTag('Gratis')}</button>
    </div>`;
  const overlay = showInfoModal('Plan del mes con IA', body);
  overlay.querySelector('#plan-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#plan-go').addEventListener('click', async () => {
    const month = overlay.querySelector('#plan-month').value;
    const go = overlay.querySelector('#plan-go');
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Armando el plan… (~30 seg)`;
    try {
      const r = await api('/api/plan/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }),
      });
      overlay.remove();
      const mix = Object.entries(r.byPillar || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      toast(`Plan de ${monthName(r.month)} listo (${r.days} días). ${mix}`, 'ok');
      // Re-sembrar y estirar la vista hasta el último día del mes planificado, para
      // que un mes futuro (ej. agosto desde julio) quede visible sin recargar.
      const [y, m] = r.month.split('-').map(Number);
      const daysAhead = Math.max(21, Math.ceil((new Date(Date.UTC(y, m, 0)) - new Date()) / 86400000) + 1);
      await api('/api/calendar/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: daysAhead }) }).catch(() => {});
      setCalDays(Math.max(calendarViewDays, daysAhead));
      reloadKeepScroll();
    } catch (e) {
      toast(`No se pudo generar el plan: ${e.message}`, 'err');
      go.disabled = false; go.innerHTML = `${icon('calendar')} Generar plan`;
    }
  });
}

/**
 * Actualiza en lote los borradores viejos (hechos con el código anterior) para que
 * tomen la lógica actual: objetivo por pieza, control de calidad del copy, selección
 * de producto por talles e imágenes didácticas. Nunca toca aprobados/publicados.
 */
async function updateStaleDrafts() {
  let info;
  try { info = await api('/api/regenerate-drafts/preview'); }
  catch (e) { toast(`No pude revisar los borradores: ${e.message}`, 'err'); return; }

  if (!info.total) { toast('No hay borradores pendientes para actualizar.'); return; }
  const stale = info.stale || 0;
  if (!stale) { toast('Tus borradores ya están con la lógica nueva.', 'ok'); return; }

  const cost = (appCfg && appCfg.aiImages)
    ? ` Con imágenes IA activas puede costar hasta US$ ${(stale * Number(appCfg.imageCostUsd || 0.04)).toFixed(2)}.`
    : ' Es gratis (texto + plantillas).';
  const ok = await confirmModal('Actualizar borradores viejos',
    `Hay <b>${stale}</b> borrador(es) hechos con la versión anterior. Se vuelven a generar con la lógica nueva (objetivo, control de calidad del copy, selección por talles, imágenes que enseñan). Los <b>aprobados y publicados no se tocan</b>.${cost}`,
    `Actualizar ${stale}`);
  if (!ok) return;

  toast(`Actualizando ${stale} borrador(es)… puede tardar.`);
  try {
    const r = await api('/api/regenerate-drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'stale' }),
    });
    toast(`Listo: ${r.regenerated} actualizado(s)${r.failed ? `, ${r.failed} con error` : ''}.`, r.failed ? '' : 'ok');
    reloadKeepScroll();
  } catch (e) {
    toast(`No se pudo actualizar: ${e.message}`, 'err');
  }
}

/* ============ estudio creativo ============ */
/**
 * Imágenes/videos de productos aparte del calendario. Elegís 1 producto (simple)
 * o hasta 4 (combo); la imagen se genera acá con IA y el video se genera afuera
 * (Gemini/Veo) con el prompt detallado, y se sube a la biblioteca.
 */
let studioSel = [];       // productos elegidos [{id, name, image_url}]
let studioReady = false;  // listeners ya conectados
let studioLastPrompt = null; // último prompt de video (se guarda con el upload)

function renderStudioSel() {
  const holder = document.getElementById('st-selected');
  if (!holder) return;
  holder.innerHTML = studioSel.length
    ? studioSel.map((p) => `<span class="st-chip"><img src="${esc(p.image_url || '')}" onerror="this.style.display='none'"/> ${esc(p.name.slice(0, 38))}
        <button data-rm="${p.id}" title="Quitar">${icon('x')}</button></span>`).join('')
      + (studioSel.length > 1 ? `<span class="badge whole">Combo · ${studioSel.length}</span>` : '')
    : '<span class="hint" style="margin:0;">Ningún producto elegido todavía.</span>';
  holder.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    studioSel = studioSel.filter((p) => String(p.id) !== String(b.dataset.rm));
    renderStudioSel();
  }));
}

let stSearchTimer;
async function studioSearch(q) {
  const out = document.getElementById('st-results');
  if (!q || q.length < 2) { out.innerHTML = ''; return; }
  try {
    const rows = await api(`/api/products?q=${encodeURIComponent(q)}`);
    out.innerHTML = rows.slice(0, 8).map((p) => `
      <div class="prod-row st-result" data-id="${p.id}" style="cursor:pointer;">
        <img src="${esc(p.image_url || '')}" onerror="this.style.visibility='hidden'"/>
        <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
          <div class="prod-sub">${esc(p.brand || '')} · stock ${p.stock ?? '∞'}</div></div>
        <div class="prod-metric">${icon('plus')}</div>
      </div>`).join('') || '<p class="hint">Sin resultados.</p>';
    out.querySelectorAll('.st-result').forEach((r) => r.addEventListener('click', () => {
      const p = rows.find((x) => String(x.id) === String(r.dataset.id));
      if (!p || studioSel.some((s) => String(s.id) === String(p.id))) return;
      if (studioSel.length >= 4) { toast('Máximo 4 productos por combo.'); return; }
      studioSel.push(p);
      renderStudioSel();
      out.innerHTML = '';
      document.getElementById('st-search').value = '';
    }));
  } catch (e) { out.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}

function studioParams() {
  return {
    productIds: studioSel.map((p) => p.id),
    theme: document.getElementById('st-theme').value.trim() || undefined,
    format: document.getElementById('st-format').value,
  };
}

async function studioGenImage(btn) {
  if (!studioSel.length) { toast('Elegí al menos un producto.'); return; }
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Generando… (~20 s)`;
  try {
    await api('/api/studio/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(studioParams()) });
    toast(studioSel.length > 1 ? 'Imagen del combo generada' : 'Imagen generada', 'ok');
    loadStudioGallery();
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.innerHTML = `${icon('image')} Generar imagen con IA ${costTag(genCostLabel())}`; }
}

async function studioVideoPrompt() {
  if (!studioSel.length) { toast('Elegí al menos un producto.'); return; }
  try {
    const d = await api('/api/studio/video-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(studioParams()) });
    studioLastPrompt = d.prompt;
    const body = `
      <p class="hint" style="margin-top:0;">${studioSel.length > 1 ? `Video del COMBO (${studioSel.length} productos juntos).` : 'Video del producto.'} Generalo en Gemini/Veo y subí el resultado a la biblioteca.</p>
      <div class="field"><label>Pasos</label>
        <ol style="line-height:1.8; padding-left:20px; font-size:14px; margin:0;">${d.instructions.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
      ${(d.productImages && d.productImages.length) ? `<div class="field"><label>Fotos a subir como referencia (${d.productImages.length})</label>
        <div class="vp-imgs">${d.productImages.slice(0, 12).map((u) => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}"/></a>`).join('')}</div></div>` : ''}
      <div class="field"><label>Prompt (copialo y pegalo)</label>
        <textarea class="input" readonly style="min-height:220px">${esc(d.prompt)}</textarea></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn-ghost btn-sm" id="svp-upload">${icon('upload')} Ya lo generé: subir video</button>
        <button class="btn-primary" id="svp-copy">${icon('copy')} Copiar prompt</button>
      </div>`;
    const ov = showInfoModal('Prompt de video · Estudio', body);
    ov.querySelector('#svp-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(d.prompt).then(() => toast('Prompt copiado', 'ok')));
    ov.querySelector('#svp-upload').addEventListener('click', () => { ov.remove(); studioUpload(); });
  } catch (e) { toast(e.message, 'err'); }
}

function studioUpload() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'video/*,image/*';
  input.addEventListener('change', async () => {
    if (!input.files || !input.files.length) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    fd.append('productIds', JSON.stringify(studioSel.map((p) => p.id)));
    fd.append('productNames', studioSel.map((p) => p.name).join(' + '));
    if (studioLastPrompt) fd.append('prompt', studioLastPrompt);
    fd.append('format', document.getElementById('st-format').value);
    toast('Subiendo a la biblioteca…');
    try {
      await api('/api/studio/upload', { method: 'POST', body: fd });
      toast('Guardado en la biblioteca', 'ok');
      loadStudioGallery();
    } catch (e) { toast(e.message, 'err'); }
  });
  input.click();
}

async function loadStudioGallery() {
  const g = document.getElementById('st-gallery');
  if (!g) return;
  try {
    const rows = await api('/api/studio/assets');
    if (!rows.length) { g.innerHTML = '<p class="empty">Todavía no hay nada en la biblioteca.</p>'; return; }
    g.innerHTML = `<div class="st-grid">${rows.map((r) => `
      <div class="st-item">
        ${r.kind === 'video'
          ? `<video src="${esc(r.path)}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video><span class="st-kind">${icon('play')}</span>`
          : `<img src="${esc(r.path)}" loading="lazy"/>`}
        <div class="st-meta">
          <div class="st-name" title="${esc(r.product_names || '')}">${esc((r.product_names || 'Sin producto').slice(0, 40))}</div>
          <div class="st-actions">
            <button class="btn-ghost btn-sm" data-dl="${esc(r.path)}" data-k="${r.kind}" title="Descargar">${icon('download')}</button>
            ${r.prompt ? `<button class="btn-ghost btn-sm" data-pr="${r.id}" title="Ver prompt">${icon('eye')}</button>` : ''}
            <button class="btn-ghost btn-sm" data-del="${r.id}" title="Borrar">${icon('trash')}</button>
          </div>
        </div>
      </div>`).join('')}</div>`;
    g.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () =>
      saveFile(b.dataset.dl, `blacks-estudio-${Date.now()}.${b.dataset.k === 'video' ? 'mp4' : 'jpg'}`)));
    g.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => {
      const r = rows.find((x) => String(x.id) === String(b.dataset.pr));
      showInfoModal('Prompt usado', `<textarea class="input" readonly style="min-height:240px">${esc(r.prompt)}</textarea>`);
    }));
    g.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmModal('Borrar de la biblioteca', 'Se borra el registro de la biblioteca (el archivo puede seguir en el storage).', 'Borrar');
      if (!ok) return;
      try { await api(`/api/studio/assets/${b.dataset.del}`, { method: 'DELETE' }); loadStudioGallery(); }
      catch (e) { toast(e.message, 'err'); }
    }));
  } catch (e) { g.innerHTML = `<p class="empty">Error: ${esc(e.message)}</p>`; }
}

function loadStudio() {
  if (!studioReady) {
    studioReady = true;
    const search = document.getElementById('st-search');
    search.addEventListener('input', () => {
      clearTimeout(stSearchTimer);
      stSearchTimer = setTimeout(() => studioSearch(search.value.trim()), 300);
    });
    const gen = document.getElementById('st-gen-img');
    gen.innerHTML = `${icon('image')} Generar imagen con IA ${costTag(genCostLabel())}`;
    gen.addEventListener('click', () => studioGenImage(gen));
    document.getElementById('st-video').addEventListener('click', studioVideoPrompt);
    document.getElementById('st-upload').addEventListener('click', studioUpload);
    renderStudioSel();
  }
  loadStudioGallery();
}

/* ============ edición ============ */
let editingId = null;
function openEdit(assetId) {
  editingId = assetId;
  const it = calItems.find((x) => String(x.asset_id) === String(assetId));
  document.getElementById('edit-caption').value = (it && it.caption) || '';
  document.getElementById('edit-hashtags').value = (it && it.hashtags) || '';
  document.getElementById('edit-cta').value = (it && it.cta) || '';
  document.getElementById('edit-modal').classList.remove('hidden');
}
function closeEdit() { document.getElementById('edit-modal').classList.add('hidden'); editingId = null; }
async function saveEdit() {
  try {
    await api(`/api/assets/${editingId}/edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: document.getElementById('edit-caption').value,
        hashtags: document.getElementById('edit-hashtags').value,
        cta: document.getElementById('edit-cta').value,
      }),
    });
    toast('Guardado', 'ok'); closeEdit(); reloadKeepScroll();
  } catch (e) { toast(e.message, 'err'); }
}

/* ============ estilo de marca ============ */
async function loadStyle() {
  try {
    const data = await api('/api/style');
    const refs = data.references || [];
    const logos = refs.filter((r) => r.kind === 'logo');
    const images = refs.filter((r) => r.kind !== 'logo');

    document.getElementById('logo-row').innerHTML = logos.length
      ? logos.map((l) => `<div class="logo-thumb"><img src="${esc(l.url)}" alt="logo" /><button class="del" onclick="deleteRef(${l.id})">${icon('x')}</button></div>`).join('')
      : '<span class="hint" style="margin:0;">Todavía no subiste ningún logo.</span>';

    document.getElementById('ref-grid').innerHTML = images.map((r) => `
      <div class="ref-thumb"><img src="${esc(r.url)}" alt="" onerror="this.parentNode.style.opacity=.3" />
        <button class="del" onclick="deleteRef(${r.id})">&times;</button></div>`).join('');

    // Carpetas/orígenes leídos + fecha del último análisis.
    const sum = document.getElementById('style-summary');
    if (sum) {
      const folders = data.folders || [];
      const last = data.profile && data.profile.updated_at
        ? new Date(data.profile.updated_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : null;
      sum.innerHTML = (folders.length || last)
        ? `<div class="voice-out" style="margin-top:12px;">
             ${last ? `<div><b>Último análisis:</b> ${esc(last)}</div>` : ''}
             ${folders.length ? `<div style="margin-top:6px;"><b>Analizado de:</b> ${folders.map((f) => `${esc(f.folder)} <span style="color:var(--muted)">(${f.n})</span>`).join(' · ')}</div>` : ''}
           </div>` : '';
    }

    renderProfile(data.profile);
    const warn = document.getElementById('gemini-warn');
    if (!data.geminiReady && !warn) {
      document.getElementById('analyze-btn').insertAdjacentHTML('afterend',
        '<p class="hint" id="gemini-warn" style="color:var(--muted); margin-top:10px;">Cargá tu GEMINI_API_KEY para poder analizar el estilo.</p>');
    }
  } catch (e) { toast(e.message, 'err'); }
}

function renderProfile(profile) {
  const out = document.getElementById('profile-out');
  if (!profile || (!profile.voice_guide && !profile.style_guide)) { out.innerHTML = ''; return; }
  let sg = profile.style_guide;
  if (sg && typeof sg === 'string') { try { sg = JSON.parse(sg); } catch (_) { sg = null; } }
  let html = '';
  if (sg && Array.isArray(sg.paleta) && sg.paleta.length) {
    html += `<div class="swatch-row">${sg.paleta.map((c) => `<div class="swatch" style="background:${esc(c)}" title="${esc(c)}"></div>`).join('')}</div>`;
  }
  if (profile.voice_guide) html += `<div class="voice-out"><b>Voz aprendida:</b><br>${esc(profile.voice_guide)}</div>`;
  if (sg) {
    const list = (label, arr) => Array.isArray(arr) && arr.length ? `<div class="voice-out"><b>${label}:</b> ${arr.map(esc).join(' · ')}</div>` : '';
    html += list('Hashtags frecuentes', sg.hashtags_frecuentes);
    html += list('Mejores horarios (tu cuenta)', sg.mejores_horarios);
    html += list('Mejores días (tu cuenta)', sg.mejores_dias);
    html += list('CTAs típicos', sg.cta_frecuentes);
    html += list('Temas recurrentes', sg.temas_recurrentes);
    html += list('Hacer', sg.do);
    html += list('Evitar', sg.dont);
    if (sg.composicion) html += `<div class="voice-out"><b>Composición:</b> ${esc(sg.composicion)}</div>`;
  }
  out.innerHTML = html;
}

function setupStyleTab() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  if (dz) {
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => uploadFiles(input.files));
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));
  }
  const logoPick = document.getElementById('logo-pick');
  const logoInput = document.getElementById('logo-input');
  if (logoPick) {
    logoPick.addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', () => uploadLogos(logoInput.files));
  }
}

async function uploadFiles(files) {
  if (!files || !files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  toast('Subiendo…');
  try { await api('/api/style/upload', { method: 'POST', body: fd }); toast('Piezas cargadas', 'ok'); loadStyle(); }
  catch (e) { toast(e.message, 'err'); }
}

async function uploadLogos(files) {
  if (!files || !files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  toast('Subiendo logo…');
  try { await api('/api/style/logo', { method: 'POST', body: fd }); toast('Logo cargado', 'ok'); loadStyle(); }
  catch (e) { toast(e.message, 'err'); }
}

async function addLink() {
  const el = document.getElementById('link-input');
  if (!el.value.trim()) return;
  try { await api('/api/style/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: el.value.trim() }) });
    el.value = ''; toast('Link agregado', 'ok'); loadStyle(); }
  catch (e) { toast(e.message, 'err'); }
}

async function deleteRef(id) {
  try { await api(`/api/style/${id}`, { method: 'DELETE' }); loadStyle(); }
  catch (e) { toast(e.message, 'err'); }
}

async function importDrive() {
  const el = document.getElementById('drive-input');
  const btn = document.getElementById('drive-btn');
  if (!el.value.trim()) { toast('Pegá el link de la carpeta de Drive'); return; }
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Importando…`;
  try {
    const d = await api('/api/style/drive-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: el.value.trim() }),
    });
    document.getElementById('drive-out').innerHTML = `<div class="voice-out">${icon('folder')} Carpeta <b>${esc(d.rootName)}</b> · subcarpetas: ${esc((d.subfolders || []).join(', '))}<br>
      Importadas <b>${d.imported}</b> · ya estaban ${d.skipped} · fallaron ${d.failed} (de ${d.totalFound} encontradas).</div>`;
    toast(`Importadas ${d.imported} piezas de Drive`, 'ok'); loadStyle();
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.innerHTML = `${icon('folder')} Importar Drive`; }
}

async function analyzeStyle() {
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Analizando… (20-40s)`;
  try {
    const includeAccount = document.getElementById('include-account').checked;
    const data = await api('/api/style/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ includeAccount }),
    });
    toast(`Estilo aprendido (${data.analyzedImages} piezas, ${data.analyzedCaptions} textos)`, 'ok');
    renderProfile({ style_guide: data.style_guide, voice_guide: data.voice_guide });
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.innerHTML = `${icon('sparkles')} Analizar y aprender estilo`; }
}

/* ============ métricas ============ */
/* Consumo de imágenes IA del mes (estimado) + proyección. */
async function loadAiUsage() {
  const el = document.getElementById('ai-usage');
  if (!el) return;
  try {
    const u = await api('/api/ai-usage');
    const fmt = (n) => `US$ ${Number(n).toFixed(2)}`;
    el.innerHTML = `
      <div class="stat"><b>${u.images}</b><span>Imágenes IA este mes</span></div>
      <div class="stat"><b>${fmt(u.usd)}</b><span>Gasto estimado (${esc(u.month)})</span></div>
      <div class="stat"><b>${u.projection === null ? '—' : fmt(u.projection)}</b><span>Proyección a fin de mes</span></div>
      <div class="stat"><b>${u.enabled ? 'ON' : 'OFF'}</b><span>Imágenes IA (AI_IMAGES)</span></div>`;
  } catch (_) { el.innerHTML = ''; }
}

/* Google Analytics de la tienda: sesiones, tráfico desde IG y productos más vistos. */
async function loadGaSummary() {
  const el = document.getElementById('ga-summary');
  if (!el) return;
  try {
    const g = await api('/api/analytics/summary');
    if (!g.enabled) { el.innerHTML = ''; return; }
    const money = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');
    const igPct = g.sessions ? Math.round((g.igSessions / g.sessions) * 100) : 0;
    const src = (label) => `<span class="src-tag">${esc(label)}</span>`;
    el.innerHTML = `
      <div class="prod-totals" style="margin-bottom:14px;">
        <div class="stat"><b>${g.sessions.toLocaleString('es-AR')}</b><span>Visitas a la tienda (${g.days} días) ${src('Google Analytics')}</span></div>
        <div class="stat"><b>${g.igSessions.toLocaleString('es-AR')} · ${igPct}%</b><span>Llegaron desde Instagram ${src('Google Analytics')}</span></div>
        <div class="stat"><b>${g.paidTraffic.metaAds.pct}%</b><span>Tráfico de Meta Ads (pauta) ${src('Google Analytics')}</span></div>
        <div class="stat"><b>${g.paidTraffic.googleAds.pct}%</b><span>Tráfico de Google Ads (pauta) ${src('Google Analytics')}</span></div>
      </div>
      <div class="panel" style="margin-bottom:14px;">
        <h3>Lo más visto en la tienda</h3>
        <p class="hint">Vistas según Google Analytics, cruzadas con ventas REALES de Tiendanube. Muchas vistas y pocas ventas = mejor candidato para contenido que empuje la compra.</p>
        ${g.topViewedProducts.map((p) => `
          <div class="prod-row">
            <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
              <div class="prod-sub">${p.realSales30d === null ? 'no está en el catálogo actual' : `${p.realSales30d} vendido(s) en ${g.days} días ${src('Tiendanube')}`}</div></div>
            <div class="prod-metric"><b>${p.views}</b><span>vistas · ${src('GA')}</span></div>
          </div>`).join('')}
      </div>
      <p class="hint" style="margin:0 0 14px;">Ingresos y compras "según Analytics" no se muestran acá porque ese conteo subestima ventas reales. — mirá la pestaña <b>Productos</b> para los números reales de Tiendanube.</p>`;
  } catch (_) { el.innerHTML = ''; }
}

/* Meta Ads: gasto, compras, ROAS y CAC de la pauta (últimos 30 días). */
async function loadAdsSummary() {
  const el = document.getElementById('ads-summary');
  if (!el) return;
  try {
    const a = await api('/api/metrics/ads');
    if (!a.enabled || a.empty) { el.innerHTML = ''; return; }
    const money = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');
    const src = `<span class="src-tag">Meta Ads</span>`;

    // Comparación con el orgánico: GA dice cuánto tráfico es pauta vs. Instagram
    // orgánico (lo que trae este motor gratis). Best-effort: sin GA no se muestra.
    let organicNote = '';
    try {
      const g = await api('/api/analytics/summary');
      if (g.enabled) {
        const organicIg = Math.max(0, (g.igSessions || 0) - ((g.paidTraffic && g.paidTraffic.metaAds.sessions) || 0));
        organicNote = `<p class="hint" style="margin:12px 0 0;">Comparación: en el mismo período, el contenido <b>orgánico</b> de Instagram (este motor, gratis) trajo <b>${organicIg.toLocaleString('es-AR')}</b> visitas a la tienda vs. <b>${((g.paidTraffic && g.paidTraffic.metaAds.sessions) || 0).toLocaleString('es-AR')}</b> de la pauta.</p>`;
      }
    } catch (_) {}

    el.innerHTML = `
      <div class="panel">
        <h3>Pauta en Meta Ads · últimos ${a.days} días</h3>
        <p class="hint">Cuenta: ${esc(a.account)} · lo que gastás en publicidad y qué devuelve, contra el orgánico gratis del motor.</p>
        <div class="prod-totals">
          <div class="stat"><b>${money(a.spend)}</b><span>Gasto en pauta ${src}</span></div>
          <div class="stat"><b>${a.purchases}</b><span>Compras por pauta ${src}</span></div>
          <div class="stat"><b>${a.revenue ? money(a.revenue) : '—'}</b><span>Ingresos por pauta ${src}</span></div>
          <div class="stat"><b>${a.roas !== null ? `${String(a.roas).replace('.', ',')}x` : '—'}</b><span>ROAS (ingresos / gasto)</span></div>
          <div class="stat"><b>${a.cac !== null ? money(a.cac) : '—'}</b><span>Costo por compra (CAC)</span></div>
        </div>
        ${organicNote}
        <div style="margin-top:16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn-primary btn-sm" id="ads-audit-btn">${icon('sparkles')} Auditar campañas con IA ${costTag('Gratis')}</button>
          <button class="btn-ghost btn-sm" id="cat-sync-btn">${icon('refresh')} Revisar catálogo vs stock</button>
          <span class="hint" style="margin:0;">Analiza campañas, anuncios y catálogos (cruzado con tu stock real) y detecta lo que la agencia no ve.</span>
        </div>
        <div id="ads-audit-out"></div>
      </div>`;
    const btn = el.querySelector('#ads-audit-btn');
    btn.addEventListener('click', () => runAdsAudit(btn));
    el.querySelector('#cat-sync-btn').addEventListener('click', (e) => openCatalogSync(e.currentTarget));
    // Si ya hay una auditoría hecha en esta sesión del server, mostrarla al entrar.
    try {
      const cached = await api('/api/ads/audit');
      if (cached && cached.available) renderAdsAudit(cached);
    } catch (_) {}
  } catch (_) { el.innerHTML = ''; }
}

/**
 * Catálogo vs stock real: primero un DRY-RUN (no toca nada) que muestra qué talles
 * están mal en Meta; después, con confirmación, aplica las correcciones por API.
 * Esto arregla el caso "tengo stock del pantalón pero Meta lo muestra agotado".
 */
async function openCatalogSync(btn) {
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Revisando catálogo…`;
  let d;
  try {
    d = await api('/api/catalog/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) });
  } catch (e) {
    toast(`No pude revisar el catálogo: ${e.message}`, 'err');
    btn.disabled = false; btn.innerHTML = `${icon('refresh')} Revisar catálogo vs stock`;
    return;
  }
  btn.disabled = false; btn.innerHTML = `${icon('refresh')} Revisar catálogo vs stock`;

  if (!d.correcciones_necesarias) {
    toast(`Catálogo al día: ${d.matchean_con_tiendanube} variantes revisadas, ninguna desincronizada.`, 'ok');
    return;
  }
  const body = `
    <p class="hint" style="margin-top:0;">Se revisaron <b>${d.items_revisados}</b> items del catálogo (${d.matchean_con_tiendanube} matchean con Tiendanube). Hay <b>${d.correcciones_necesarias}</b> talles con la disponibilidad MAL en Meta:</p>
    <div class="prod-totals" style="margin-bottom:14px;">
      <div class="stat"><b style="color:var(--orange)">${d.a_poner_en_stock}</b><span>Talles CON stock real que Meta esconde (no salen en anuncios)</span></div>
      <div class="stat"><b>${d.a_poner_sin_stock}</b><span>Talles agotados que Meta muestra como disponibles</span></div>
    </div>
    ${(d.ejemplos || []).map((f) => `<div class="dl-row">
      <span title="${esc(f.producto)}">${esc(String(f.producto).slice(0, 46))}</span>
      <span class="hint" style="margin:0; white-space:nowrap;">Meta: ${esc(f.en_meta)} · real: ${esc(String(f.stock_real))} → <b style="color:var(--text)">${esc(f.corregir_a)}</b></span>
    </div>`).join('')}
    ${d.correcciones_necesarias > (d.ejemplos || []).length ? `<p class="hint">…y ${d.correcciones_necesarias - d.ejemplos.length} más.</p>` : ''}
    <p class="hint">La corrección se manda por API al catálogo (sólo el campo disponibilidad). Meta tarda unos minutos en procesarla. El cron la repite solo todos los días a la mañana, después de refrescar el stock.</p>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
      <button class="btn-discard" id="cs-cancel">Ahora no</button>
      <button class="btn-primary" id="cs-apply">${icon('check')} Corregir ${d.correcciones_necesarias} en Meta</button>
    </div>`;
  const ov = showInfoModal('Catálogo de Meta vs stock real', body);
  ov.querySelector('#cs-cancel').addEventListener('click', () => ov.remove());
  ov.querySelector('#cs-apply').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = `${icon('refresh', 'spin')} Corrigiendo…`;
    try {
      const r = await api('/api/catalog/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: true }) });
      ov.remove();
      toast(`Listo: ${r.correcciones_necesarias} correcciones enviadas a Meta (se aplican en unos minutos).`, 'ok');
    } catch (err) {
      toast(`No se pudo corregir: ${err.message}`, 'err');
      b.disabled = false; b.innerHTML = `${icon('check')} Reintentar`;
    }
  });
}

/* Corre la auditoría (30-60 s: Meta + catálogos + Gemini) y la muestra. */
async function runAdsAudit(btn) {
  btn.disabled = true;
  btn.innerHTML = `${icon('refresh', 'spin')} Auditando… (30-60 s)`;
  try {
    const audit = await api('/api/ads/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    renderAdsAudit(audit);
    toast('Auditoría lista', 'ok');
  } catch (e) {
    toast(`No pude auditar: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('sparkles')} Auditar de nuevo ${costTag('Gratis')}`;
  }
}

function renderAdsAudit(audit) {
  const out = document.getElementById('ads-audit-out');
  if (!out || !audit || !audit.analisis) return;
  // La IA a veces mete **markdown** en los strings; acá va texto plano.
  const clean = (v) => typeof v === 'string' ? v.replace(/\*\*/g, '') : v;
  const an = JSON.parse(JSON.stringify(audit.analisis), (k, v) => clean(v));
  const d = audit.datos || {};
  const money = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');
  const list = (title, arr, iconName) => (Array.isArray(arr) && arr.length)
    ? `<div class="an-block"><span class="fmt-label">${icon(iconName)} ${title}</span>
        <ul style="margin:8px 0 0; padding-left:18px; line-height:1.65; font-size:13px;">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  const impact = { alto: 'qa-warn', medio: 'semi', bajo: 'semi' };
  const problems = (an.problemas || []).map((p) => `
    <div class="an-block" style="border-left:3px solid ${p.impacto === 'alto' ? 'var(--orange)' : 'var(--line)'};">
      <b>${esc(p.titulo)}</b> <span class="badge ${impact[p.impacto] || 'semi'}">${esc(p.impacto || '')}</span>
      <div style="margin-top:6px; font-size:13px; line-height:1.55; color:var(--muted);">${esc(p.detalle)}</div>
    </div>`).join('');

  // Datos duros que respaldan el análisis: campañas y hallazgos de catálogo.
  const campRows = (d.campanias || []).map((c) => `<tr>
    <td>${esc(c.nombre)}</td><td>${money(c.gasto)}</td><td>${c.compras}</td>
    <td>${c.roas ? `<b>${String(c.roas).replace('.', ',')}x</b>` : '<span style="color:var(--muted)">0</span>'}</td>
    <td>${c.frecuencia ?? '—'}</td></tr>`).join('');

  const invisibles = (d.catalogos || []).flatMap((c) => c.productos_invisibles_con_stock || []);
  const invisiblesHtml = invisibles.length ? `
    <div class="an-block">
      <span class="fmt-label">${icon('alert')} Productos con stock real INVISIBLES en los anuncios de catálogo</span>
      ${invisibles.slice(0, 10).map((p) => `<div class="prod-row"><div class="prod-info">
        <div class="prod-name">${esc(p.producto)}</div>
        <div class="prod-sub">Meta lo muestra sin stock en todos los talles · stock real en Tiendanube: <b>${p.stock_real_tiendanube}</b></div>
      </div></div>`).join('')}
    </div>` : '';

  const emptySets = (d.conjuntos_usados_por_anuncios || []).filter((s) => !s.productos_en_conjunto);
  const setsHtml = emptySets.length ? `
    <div class="an-block" style="border-left:3px solid var(--orange);">
      <span class="fmt-label">${icon('alert')} Anuncios apuntando a conjuntos de productos VACÍOS</span>
      <div style="margin-top:6px; font-size:13px; color:var(--muted); line-height:1.55;">
        ${emptySets.map((s) => `“${esc(s.conjunto)}”${s.catalogo ? ` (catálogo ${esc(s.catalogo)})` : ''}`).join(' · ')} — esos anuncios no tienen productos para mostrar.
      </div>
    </div>` : '';

  const adIssues = (d.anuncios_con_problemas || []);
  const issuesHtml = adIssues.length ? list(`Anuncios con problemas (${adIssues.length})`, adIssues.map((i) => `${i.anuncio}: ${i.problema}`), 'alert') : '';

  out.innerHTML = `
    <div style="margin-top:18px;">
      <div class="recommendation"><b>Diagnóstico:</b> ${esc(an.diagnostico || '')}</div>
      <div class="analysis">
        ${problems}
        ${setsHtml}
        ${invisiblesHtml}
        ${list('Qué está funcionando', an.funciona, 'check')}
        ${list('Qué está rindiendo mal', an.no_funciona, 'trash')}
        ${list('Acciones para pasarle a la agencia (en orden)', an.acciones, 'send')}
        ${list('Preguntas para hacerle a la agencia', an.preguntas_agencia, 'comment')}
        ${issuesHtml}
        ${campRows ? `<div class="an-block"><span class="fmt-label">${icon('chart')} Campañas (30 días)</span>
          <table class="insights" style="margin-top:8px;"><thead><tr><th>Campaña</th><th>Gasto</th><th>Compras</th><th>ROAS</th><th>Frec.</th></tr></thead>
          <tbody>${campRows}</tbody></table></div>` : ''}
      </div>
      <p class="hint" style="margin:10px 0 0;">Auditoría del ${esc(String(audit.generatedAt).slice(0, 16).replace('T', ' '))} · datos de Meta Ads + catálogos cruzados con stock de Tiendanube · análisis con IA (gratis). Sólo lectura: no toca tus campañas.</p>
    </div>`;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Atribución por pieza: qué posts del motor trajeron visitas/compras (via UTMs + GA). */
async function loadAttribution() {
  const el = document.getElementById('attribution-out');
  if (!el) return;
  try {
    const d = await api('/api/metrics/attribution');
    if (!d.enabled || !d.items || !d.items.length) { el.innerHTML = ''; return; }
    const money = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');
    el.innerHTML = `
      <div class="panel">
        <h3>Qué piezas trajeron tráfico (links con seguimiento)</h3>
        <p class="hint">Visitas y compras registradas por Google Analytics para los links con UTM del motor (sticker de historias, bio). Últimos ${d.days} días.</p>
        ${d.items.slice(0, 10).map((i) => `
          <div class="prod-row">
            <div class="prod-info">
              <div class="prod-name">${esc(i.slot ? (i.slot.theme_title || i.slot.pillar_detail || i.campaign) : i.campaign)}</div>
              <div class="prod-sub">${i.slot ? `${esc(i.slot.pillar)} · ${esc(String(i.slot.scheduled_date).slice(0, 10))} · ` : ''}${i.purchases ? `<b style="color:var(--green)">${i.purchases} compra(s) · ${money(i.revenue)}</b>` : 'sin compras registradas'}</div>
            </div>
            <div class="prod-metric"><b>${i.sessions}</b><span>visitas</span></div>
          </div>`).join('')}
      </div>`;
  } catch (_) { el.innerHTML = ''; }
}

/* ¿Por qué no compran? Auditoría del embudo (GA + Meta + Tiendanube) con IA. */
async function loadConversionAudit() {
  const el = document.getElementById('conversion-out');
  if (!el) return;
  el.innerHTML = `
    <div class="panel">
      <h3>¿Por qué no compran? · Auditoría de conversión</h3>
      <p class="hint">Cruza el embudo de Google Analytics (visitas → carrito → checkout → compra, por dispositivo), el embudo de la pauta y las ventas reales de Tiendanube, y la IA detecta dónde está la fricción.</p>
      <button class="btn-primary btn-sm" id="conv-btn">${icon('sparkles')} Analizar el embudo con IA ${costTag('Gratis')}</button>
      <div id="conv-out"></div>
    </div>`;
  const btn = el.querySelector('#conv-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Analizando… (~30 s)`;
    try {
      const audit = await api('/api/metrics/conversion-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      renderConversionAudit(audit);
      toast('Auditoría de conversión lista', 'ok');
    } catch (e) { toast(`No pude analizar: ${e.message}`, 'err'); }
    finally { btn.disabled = false; btn.innerHTML = `${icon('sparkles')} Analizar de nuevo ${costTag('Gratis')}`; }
  });
  try {
    const cached = await api('/api/metrics/conversion-audit');
    if (cached && cached.available) renderConversionAudit(cached);
  } catch (_) {}
}

function renderConversionAudit(audit) {
  const out = document.getElementById('conv-out');
  if (!out || !audit || !audit.analisis) return;
  const clean = (v) => typeof v === 'string' ? v.replace(/\*\*/g, '') : v;
  const an = JSON.parse(JSON.stringify(audit.analisis), (k, v) => clean(v));

  const stateCls = { bien: 'status-approved', regular: 'semi', mal: 'qa-warn' };
  const funnel = (an.embudo || []).map((e) => `
    <div class="dl-row"><span>${esc(e.etapa)}</span>
      <span style="display:inline-flex; gap:8px; align-items:center;"><b>${esc(String(e.dato))}</b>
      <span class="badge ${stateCls[e.estado] || 'semi'}">${esc(e.estado || '')}</span></span></div>`).join('');

  const fricciones = (an.fricciones || []).map((f) => `
    <div class="an-block" style="border-left:3px solid ${f.impacto === 'alto' ? 'var(--orange)' : 'var(--line)'};">
      <b>${esc(f.titulo)}</b> <span class="badge ${f.impacto === 'alto' ? 'qa-warn' : 'semi'}">${esc(f.impacto || '')}</span>
      <div style="margin-top:6px; font-size:13px; line-height:1.55; color:var(--muted);">
        <b style="color:var(--text)">Evidencia:</b> ${esc(f.evidencia || '')}<br/>
        <b style="color:var(--text)">Hipótesis:</b> ${esc(f.hipotesis || '')}
      </div>
    </div>`).join('');

  const list = (title, arr, ic) => (Array.isArray(arr) && arr.length)
    ? `<div class="an-block"><span class="fmt-label">${icon(ic)} ${title}</span>
        <ul style="margin:8px 0 0; padding-left:18px; line-height:1.65; font-size:13px;">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  out.innerHTML = `
    <div style="margin-top:16px;">
      <div class="recommendation"><b>Diagnóstico:</b> ${esc(an.diagnostico || '')}</div>
      <div class="analysis">
        ${funnel ? `<div class="an-block"><span class="fmt-label">${icon('chart')} Embudo</span><div style="margin-top:6px;">${funnel}</div></div>` : ''}
        ${fricciones}
        ${list('Quick wins (menos de 1 hora)', an.quick_wins, 'bolt')}
        ${list('Acciones priorizadas', an.acciones, 'send')}
      </div>
      <p class="hint" style="margin:10px 0 0;">Auditoría del ${esc(String(audit.generatedAt).slice(0, 16).replace('T', ' '))} · GA (28d) + Meta Ads (30d) + ventas reales Tiendanube.</p>
    </div>`;
}

/* Gráfico de evolución del alcance semanal (Chart.js por CDN, best-effort). */
let reachChart = null;
async function loadReachChart() {
  const holder = document.getElementById('reach-chart-panel');
  if (!holder) return;
  try {
    const weeks = await api('/api/insights/weekly-reach');
    if (!Array.isArray(weeks) || weeks.length < 2 || !window.Chart) { holder.innerHTML = ''; return; }
    holder.innerHTML = `
      <div class="panel chart-panel" style="margin-bottom:20px;">
        <h3>Evolución del alcance</h3>
        <p class="hint">Alcance total por semana de las piezas publicadas (Instagram insights).</p>
        <div style="position:relative; height:260px;"><canvas id="reach-canvas"></canvas></div>
      </div>`;
    const fmtWeek = (w) => {
      const [y, m, d] = String(w).slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    };
    if (reachChart) { reachChart.destroy(); reachChart = null; }
    reachChart = new Chart(document.getElementById('reach-canvas'), {
      type: 'line',
      data: {
        labels: weeks.map((w) => fmtWeek(w.week)),
        datasets: [{
          label: 'Alcance',
          data: weeks.map((w) => w.reach),
          borderColor: '#e85d1b',
          backgroundColor: 'rgba(232, 93, 27, .12)',
          fill: true,
          tension: .35,
          borderWidth: 2,
          pointRadius: 3.5,
          pointBackgroundColor: '#e85d1b',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { afterLabel: (c) => `${weeks[c.dataIndex].posts} post(s) esa semana` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#97979f' } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#97979f', precision: 0 } },
        },
      },
    });
  } catch (_) { holder.innerHTML = ''; }
}

async function loadMetrics() {
  loadGaSummary();
  loadAdsSummary();
  loadConversionAudit();
  loadAttribution();
  loadAiUsage();
  loadReachChart();
  const body = document.getElementById('metrics-body');
  body.innerHTML = skeleton('rows', 4);
  try {
    const data = await api('/api/insights/report');
    let html = `<div class="recommendation"><b>Recomendación:</b> ${esc(data.recommendation)}</div>`;
    if (data.pillars && data.pillars.length) {
      html += `<table class="insights"><thead><tr>
        <th>Pilar</th><th>Posts</th><th>Alcance</th><th>Impres.</th><th>Guardados</th><th>Shares</th></tr></thead><tbody>`;
      for (const p of data.pillars) {
        html += `<tr><td><span class="badge pillar">${esc(p.pillar)}</span></td>
          <td>${p.posts_count}</td><td><b>${p.avg_reach || 0}</b></td>
          <td>${p.avg_impressions || 0}</td><td>${p.avg_saved || 0}</td><td>${p.avg_shares || 0}</td></tr>`;
      }
      html += `</tbody></table>`;
    } else {
      html += `<p class="empty">Todavía no hay publicaciones con métricas recolectadas.</p>`;
    }
    body.innerHTML = html;
  } catch (e) { body.innerHTML = `<p class="empty">Error: ${esc(e.message)}</p>`; }
}

/* ============ análisis de cuenta ============ */
async function analyzeAccount() {
  const btn = document.getElementById('account-btn');
  const out = document.getElementById('account-out');
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Analizando…`;
  try {
    const d = await api('/api/account/analysis');
    const rank = (arr, key, unit) => arr && arr.length
      ? `<div class="rank">${arr.map((x) => `<span class="rank-item"><b>${esc(x[key])}${unit || ''}</b> · ${x.avgEngagement} eng</span>`).join('')}</div>`
      : '<span class="hint">Sin datos suficientes.</span>';
    out.innerHTML = `<div class="analysis">
        <div class="an-block"><span class="fmt-label">Analizadas</span> ${d.analyzed} publicaciones · engagement promedio <b>${d.avgEngagement}</b></div>
        <div class="an-block"><span class="fmt-label">${icon('clock')} Mejores horarios</span>${rank(d.bestHours, 'hour', ' hs')}</div>
        <div class="an-block"><span class="fmt-label">${icon('calendar')} Mejores días</span>${rank(d.bestDays, 'day')}</div>
        <div class="an-block"><span class="fmt-label">${icon('film')} Formato que más rinde</span>${rank(d.byFormat, 'format')}</div>
        <div class="an-block"><span class="fmt-label">${icon('tag')} Hashtags que más rinden</span>${rank(d.topHashtags, 'tag')}</div>
        <div class="an-block hint">${icon('info')} ${esc(d.note)}</div>
      </div>`;
  } catch (e) {
    out.innerHTML = `<p class="hint" style="color:var(--muted)">No pude analizar: ${esc(e.message)} (revisá permisos de Instagram insights).</p>`;
  } finally { btn.disabled = false; btn.innerHTML = `${icon('chart')} Analizar mi cuenta`; }
}

/* ============ init ============ */
hydrateIcons();
loadConfig();
loadCalendar();
setupStyleTab();
pollBgTasks();
setInterval(pollBgTasks, 60 * 1000); // tareas en segundo plano: refresco cada minuto
