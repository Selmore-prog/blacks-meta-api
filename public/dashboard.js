/* ============ iconos (SVG inline, sin emojis) ============ */
const ICONS = {
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
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
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
};
function icon(name, extra = '') {
  const fill = name === 'play' ? 'currentColor' : 'none';
  return `<svg class="ic ${extra}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
/* ==========================================================================
 * COMPONENTES DE LECTURA COMPARTIDOS
 *
 * `tip()` reemplaza a los párrafos de ayuda: la explicación vive en un ⓘ y el
 * panel muestra el número, que es a lo que se entra. `panelHead()` unifica el
 * encabezado (título + ⓘ + acciones a la derecha) para que las tres pantallas
 * de análisis se vean iguales.
 * ========================================================================== */

/** ⓘ con explicación. `pos='tip-end'` cuando está pegado al borde derecho. */
function tip(text, pos = '') {
  if (!text) return '';
  return `<span class="tip ${pos}" tabindex="0" role="note" data-tip="${esc(text)}">i</span>`;
}

/** Encabezado de panel: <h3> + ⓘ opcional + acciones opcionales a la derecha. */
function panelHead(title, tipText = '', actions = '') {
  return `<div class="p-head"><h3>${title}${tip(tipText)}</h3>${
    actions ? `<div class="p-actions">${actions}</div>` : ''}</div>`;
}

/* Abrir/cerrar el globo al tocar. Delegado en document para que valga también
   para los ⓘ que se crean después (los paneles se renderizan por innerHTML). */
document.addEventListener('click', (e) => {
  const t = e.target.closest ? e.target.closest('.tip') : null;
  document.querySelectorAll('.tip.tip-open').forEach((x) => { if (x !== t) x.classList.remove('tip-open'); });
  if (t) { t.classList.toggle('tip-open'); e.stopPropagation(); }
});

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
  if (view === 'home') { loadHomeRails(); loadFlash(); }
  if (view === 'studio') loadStudio();
  if (view === 'analysis') setupAnalysis();
  if (view === 'ads') loadAdsPerformance();
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

/* ============ generación en segundo plano ============ */
// Slots que estamos generando: el panel no se bloquea, muestra "generando" en la
// tarjeta y poolea /api/generating hasta que termina (o falla).
const generatingIds = new Set();
let generatingPollTimer = null;

function markGenerating(calendarId) {
  generatingIds.add(String(calendarId));
  const card = document.querySelector(`.card [data-id="${calendarId}"]`)?.closest('.card');
  applyGeneratingChip(calendarId, card);
  startGeneratingPoll();
}

function applyGeneratingChip(calendarId, card) {
  if (!card) return;
  const actions = card.querySelector('.actions');
  if (actions && !actions.querySelector('.gen-chip')) {
    actions.innerHTML = `<span class="badge semi gen-chip">${icon('refresh', 'spin')} Generando en segundo plano…</span>`;
  }
}

function startGeneratingPoll() {
  if (generatingPollTimer) return;
  generatingPollTimer = setInterval(async () => {
    if (!generatingIds.size) { clearInterval(generatingPollTimer); generatingPollTimer = null; return; }
    let data;
    try { data = await api('/api/generating'); } catch (_) { return; }
    const stillGenerating = new Set((data.ids || []).map(String));
    const errors = data.errors || {};
    let anyDone = false;
    for (const id of [...generatingIds]) {
      if (errors[id]) {
        toast(`No se pudo generar la pieza: ${errors[id]}`, 'err');
        generatingIds.delete(id); anyDone = true;
      } else if (!stillGenerating.has(id)) {
        generatingIds.delete(id); anyDone = true;
      }
    }
    if (anyDone) { toast('Pieza generada', 'ok'); reloadKeepScroll(); }
  }, 4000);
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
// Piezas cuyo video está generándose en Veo ahora mismo (para el chip en la tarjeta).
const videoRunningIds = new Set();
async function pollBgTasks() {
  const btn = document.getElementById('bg-tasks');
  if (!btn) return;
  try {
    bgTasksData = await api('/api/background-tasks');
    const before = videoRunningIds.size;
    videoRunningIds.clear();
    (bgTasksData.videos || []).forEach((v) => {
      if (!v.asset_id) return;
      videoRunningIds.add(String(v.asset_id));
      watchVideoJob(v.asset_id); // sobrevive a un F5: retoma el seguimiento solo
    });
    if (before !== videoRunningIds.size && calItems.length) renderCalView();
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
// Días para atrás que se piden junto con el calendario (nada se borra: una pieza que
// no se publicó a tiempo sigue en la base, sólo hay que pedirla). 0 = sólo hoy en
// adelante (comportamiento de siempre). Se persiste para no tener que re-elegirlo.
function loadCalBack() {
  const saved = Number(localStorage.getItem('calBackDays'));
  return [0, 3, 7, 14, 30].includes(saved) ? saved : 0;
}
let calBackDays = loadCalBack();
function setCalBack(n) {
  calBackDays = n;
  localStorage.setItem('calBackDays', String(calBackDays));
}
const filters = { status: 'all', format: 'all', pillar: 'all', auto: 'all', comercial: 'all', q: '', focus: 'all' };
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

/**
 * Descartar con motivo OPCIONAL: si el usuario cuenta por qué, el motivo queda como
 * lección aprendida y el sistema evita repetir ese error en las próximas piezas.
 * Devuelve el motivo ('' si no puso nada) o null si canceló.
 */
function discardReasonModal() {
  return new Promise((resolve) => {
    const overlay = showInfoModal('Descartar pieza', `
      <p style="margin:0 0 10px; color:var(--muted); font-size:14px; line-height:1.5;">¿Por qué la descartás? <b>Opcional</b> — si lo contás, el sistema lo aprende y no lo repite.</p>
      <textarea id="dm-reason" class="input" rows="2" placeholder="Ej: el producto no tiene relación con el tema / el título salió cortado…" style="width:100%; margin-bottom:14px; resize:vertical;"></textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn-discard" id="dm-cancel">Cancelar</button>
        <button class="btn-primary" id="dm-yes">Descartar</button>
      </div>`);
    const done = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('#dm-cancel').addEventListener('click', () => done(null));
    overlay.querySelector('#dm-yes').addEventListener('click', () => done(overlay.querySelector('#dm-reason').value.trim()));
  });
}

/* ============ BANDEJA DE REVISIÓN ============
 * El calendario muestra todo, pero lo que importa a diario es poco: qué falta
 * aprobar, qué tiene una alerta, qué no se generó todavía. Estos "focos" son
 * filtros de un toque sobre esas 4 preguntas, con el número al lado.
 */
function needsAttention(it) {
  return Boolean(it.asset_id && statusOf(it) === 'draft' && (it.qa_notes || it.gen_model === 'groq'))
    || Boolean(it.asset_id && it.queue_status === 'failed' && statusOf(it) !== 'published')
    // Un Reel aprobado sin video no se puede publicar: es una alerta real.
    || Boolean(it.post_type === 'reel' && it.asset_id && !it.video_path && ['draft', 'approved'].includes(statusOf(it)));
}

const FOCUS_DEFS = {
  revisar: { label: 'Para aprobar', match: (it) => statusOf(it) === 'draft' },
  alerta: { label: 'Con alerta', match: needsAttention },
  'sin-generar': { label: 'Sin generar', match: (it) => statusOf(it) === 'sin-generar' },
  esperando: { label: 'Aprobadas esperando su horario', match: (it) => statusOf(it) === 'approved' },
};

function focusCounts() {
  const out = {};
  for (const key of Object.keys(FOCUS_DEFS)) out[key] = calItems.filter(FOCUS_DEFS[key].match).length;
  return out;
}

function renderFocusBar() {
  const host = document.getElementById('focus-bar');
  if (!host) return;
  const counts = focusCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) { host.innerHTML = ''; return; }
  host.innerHTML = Object.keys(FOCUS_DEFS).map((key) => {
    const n = counts[key];
    if (!n) return '';
    const on = filters.focus === key;
    return `<button class="focus-chip ${key} ${on ? 'on' : ''}" data-focus="${key}">
      <b>${n}</b> ${esc(FOCUS_DEFS[key].label)}</button>`;
  }).join('');
  host.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => {
    filters.focus = filters.focus === b.dataset.focus ? 'all' : b.dataset.focus;
    renderCalView();
  }));
}

function getFiltered() {
  return calItems.filter((it) => {
    if (filters.focus !== 'all' && !FOCUS_DEFS[filters.focus].match(it)) return false;
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
  const backSel = `<select class="filter" id="f-back" title="Piezas de días anteriores: no se borran, sólo se ocultan por defecto" onchange="onCalBack(this.value)">
    <option value="0" ${calBackDays === 0 ? 'selected' : ''}>Desde hoy</option>
    <option value="3" ${calBackDays === 3 ? 'selected' : ''}>+ 3 días atrás</option>
    <option value="7" ${calBackDays === 7 ? 'selected' : ''}>+ 7 días atrás</option>
    <option value="14" ${calBackDays === 14 ? 'selected' : ''}>+ 14 días atrás</option>
    <option value="30" ${calBackDays === 30 ? 'selected' : ''}>+ 30 días atrás</option>
  </select>`;
  bar.innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700;">${icon('filter')} Filtros</span>` +
    backSel +
    sel('f-status', 'Estado', [
      { v: 'sin-generar', t: 'Sin generar' }, { v: 'draft', t: 'Borrador' },
      { v: 'approved', t: 'Aprobado' }, { v: 'published', t: 'Publicado' }, { v: 'repost', t: 'Descanso' },
    ], filters.status) +
    sel('f-format', 'Formato', [{ v: 'feed', t: 'Feed' }, { v: 'story', t: 'Historia' }, { v: 'reel', t: 'Reel' }], filters.format) +
    sel('f-pillar', 'Pilar', pillars.map((p) => ({ v: p, t: p })), filters.pillar) +
    sel('f-auto', 'Tipo', [{ v: 'auto', t: 'Automática' }, { v: 'semi', t: 'Semi' }], filters.auto) +
    sel('f-comercial', 'Venta', [{ v: 'minorista', t: 'Minorista' }, { v: 'mayorista', t: 'Mayorista' }], filters.comercial) +
    `<input class="filter-search" id="f-q" placeholder="Buscar en el texto…" value="${esc(filters.q)}" oninput="onFilter('f-q', this.value)" />` +
    `<button class="filter-sel" id="f-selall" onclick="selectAllVisible()" title="Marcar todas las piezas que se ven, para aprobarlas o descartarlas juntas">Seleccionar todo</button>` +
    `<span class="filter-count" id="f-count"></span>`;
}

function onCalBack(val) {
  setCalBack(Number(val) || 0);
  loadCalendar();
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
    calItems = await api(`/api/calendar?days=${calendarViewDays}&back=${calBackDays}`);
    // Sincroniza qué slots siguen generándose (por si recargaste con una generación en curso).
    try {
      const g = await api('/api/generating');
      generatingIds.clear();
      (g.ids || []).forEach((gid) => generatingIds.add(String(gid)));
      if (generatingIds.size) startGeneratingPoll();
    } catch (_) {}
    document.getElementById('next-plan').innerHTML =
      `${icon('bot')} Los borradores se generan solos a las <b>07:00 ARG</b>. Lo que apruebes sale <b>en su horario</b>; las <b>Semi</b> las subís vos con su sticker. Para que algo no salga: <b>Descartar</b> la pieza o pausar el slot desde <b>Planificar</b>.`;
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
  renderFocusBar();
  if (calView === 'list') renderCalList(items);
  else if (calView === 'grid') renderCalGrid(items);
  else renderProfileGrid();
  renderCalMore();
  refreshPubTimers();
  renderBulkBar();
}

/* ============ SELECCIÓN MÚLTIPLE (acciones en lote) ============
 * Aprobar de a una es lo que más tiempo come cuando hay 10 piezas al día.
 * Con el check de cada tarjeta se juntan varias y se aprueban/descartan/generan
 * todas juntas desde la barra de abajo.
 */
const selectedSlots = new Set();

function selectedItems() {
  return calItems.filter((it) => selectedSlots.has(String(it.id)));
}

function toggleSelect(id, on) {
  if (on) selectedSlots.add(String(id)); else selectedSlots.delete(String(id));
  renderBulkBar();
}

function clearSelection() {
  selectedSlots.clear();
  document.querySelectorAll('.card-check input').forEach((c) => { c.checked = false; });
  renderBulkBar();
}

function selectAllVisible() {
  getFiltered().filter(selectableItem).forEach((it) => selectedSlots.add(String(it.id)));
  document.querySelectorAll('.card-check input').forEach((c) => { c.checked = selectedSlots.has(c.dataset.slot); });
  renderBulkBar();
}

/** Sólo tiene sentido seleccionar lo que todavía se puede tocar. */
function selectableItem(it) {
  const st = statusOf(it);
  return ['draft', 'approved', 'sin-generar'].includes(st);
}

function renderBulkBar() {
  let bar = document.getElementById('bulk-bar');
  const items = selectedItems();
  if (!items.length) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulk-bar';
    bar.className = 'bulk-bar';
    document.body.appendChild(bar);
  }
  const drafts = items.filter((it) => statusOf(it) === 'draft');
  const pend = items.filter((it) => statusOf(it) === 'sin-generar');
  const killable = items.filter((it) => ['draft', 'approved'].includes(statusOf(it)));
  bar.innerHTML = `
    <span class="bb-count"><b>${items.length}</b> seleccionada${items.length > 1 ? 's' : ''}</span>
    ${drafts.length ? `<button class="btn-approve btn-sm" id="bb-approve">${icon('check')} Aprobar ${drafts.length}</button>` : ''}
    ${pend.length ? `<button class="btn-primary btn-sm" id="bb-gen">${icon('bolt')} Generar ${pend.length}</button>` : ''}
    ${killable.length ? `<button class="btn-discard btn-sm" id="bb-discard">${icon('trash')} Descartar ${killable.length}</button>` : ''}
    <button class="btn-ghost btn-sm" id="bb-clear">Deseleccionar</button>`;

  bar.querySelector('#bb-clear').addEventListener('click', clearSelection);
  const approveBtn = bar.querySelector('#bb-approve');
  if (approveBtn) approveBtn.addEventListener('click', () => runBulk(approveBtn, drafts,
    (it) => api(`/api/assets/${it.asset_id}/approve`, { method: 'POST' }), 'Aprobadas'));
  const genBtn = bar.querySelector('#bb-gen');
  if (genBtn) genBtn.addEventListener('click', () => runBulk(genBtn, pend, async (it) => {
    await api(`/api/generate/${it.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    markGenerating(it.id);
  }, 'Generándose en segundo plano'));
  const disBtn = bar.querySelector('#bb-discard');
  if (disBtn) disBtn.addEventListener('click', async () => {
    const ok = await confirmModal('Descartar piezas',
      `Se descartan <b>${killable.length}</b> piezas. No se borran: quedan guardadas y podés regenerar el slot cuando quieras.`, 'Descartar');
    if (!ok) return;
    runBulk(disBtn, killable, (it) => api(`/api/assets/${it.asset_id}/discard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '' }),
    }), 'Descartadas');
  });
}

/**
 * Corre una acción sobre varias piezas de a 3 por vez (no de a 30 juntas: el
 * servidor de Render es chico) y avisa cuántas salieron bien y cuántas no.
 */
async function runBulk(btn, items, fn, doneLabel) {
  const original = btn.innerHTML;
  btn.disabled = true;
  let done = 0; let failed = 0;
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      btn.innerHTML = `${icon('refresh', 'spin')} ${done + 1}/${items.length}`;
      try { await fn(it); done += 1; } catch (_) { failed += 1; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  btn.disabled = false;
  btn.innerHTML = original;
  toast(failed ? `${doneLabel}: ${done} · fallaron ${failed}` : `${doneLabel}: ${done}`, failed ? 'err' : 'ok');
  clearSelection();
  reloadKeepScroll();
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
  else if (isCarousel) media = `<div class="carousel">${slides.map((u) => `<img src="${esc(u)}" loading="lazy" alt=""/>`).join('')}</div><div class="c-count">${icon('grid')} ${slides.length}</div>`;
  else if (item.image_path) media = `<img class="media" src="${esc(item.image_path)}" loading="lazy" alt="" />`;
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

/**
 * Especificación exacta del sticker (generada con el copy): pregunta, opciones a
 * tipear tal cual y respuesta correcta si es quiz. Devuelve '' si no hay spec.
 */
function stickerSpecHtml(sticker) {
  let s = sticker;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch (_) { s = null; } }
  if (!s || !s.question) return '';
  const typeLabels = { encuesta: 'ENCUESTA', quiz: 'QUIZ', pregunta: 'PREGUNTA ABIERTA', slider: 'SLIDER DE EMOJI' };
  const opts = Array.isArray(s.options) ? s.options : [];
  const optsHtml = opts.length
    ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">${opts.map((o, i) => {
        const correct = s.type === 'quiz' && Number(s.correct_index) === i;
        return `<span style="padding:5px 12px; border-radius:999px; font-size:13px; font-weight:600; border:1px solid ${correct ? '#3fb950' : 'rgba(255,255,255,.25)'}; ${correct ? 'background:rgba(63,185,80,.15); color:#3fb950;' : 'color:rgba(255,255,255,.9);'}">${esc(o)}${correct ? ' ✓ correcta' : ''}</span>`;
      }).join('')}</div>` : '';
  return `<div style="margin-top:10px; padding:10px 12px; background:rgba(0,0,0,.25); border-radius:10px;">
      <div style="font-size:12px; font-weight:800; letter-spacing:.4px; color:#FF8B4D;">STICKER: ${esc(typeLabels[s.type] || String(s.type || '').toUpperCase())}</div>
      <div style="font-size:14px; font-weight:700; margin-top:4px;">“${esc(s.question)}”</div>
      ${optsHtml}
      <div style="font-size:12px; color:rgba(255,255,255,.55); margin-top:8px;">Copiá la pregunta y las opciones tal cual al sticker de Instagram.</div>
    </div>`;
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
  let currentSlide = 0;
  if (car && slides && slides.length > 1) {
    const holder = car.parentElement;
    holder.insertAdjacentHTML('beforeend',
      `<button class="c-nav prev">‹</button><button class="c-nav next">›</button>`);
    const count = holder.querySelector('.c-count');
    const goto = (dir) => car.scrollBy({ left: dir * car.clientWidth, behavior: 'smooth' });
    holder.querySelector('.c-nav.prev').addEventListener('click', (e) => { e.stopPropagation(); goto(-1); });
    holder.querySelector('.c-nav.next').addEventListener('click', (e) => { e.stopPropagation(); goto(1); });
    car.addEventListener('scroll', () => {
      currentSlide = Math.round(car.scrollLeft / car.clientWidth);
      if (count) count.innerHTML = `${icon('grid')} ${currentSlide + 1}/${slides.length}`;
    }, { passive: true });

    // Botón para CORREGIR/REGENERAR sólo el slide visible (sin rehacer el resto).
    if (item.asset_id) {
      const box = overlay.querySelector('.preview-box');
      box.insertAdjacentHTML('beforeend',
        `<div class="slide-fix-bar"><button class="btn-ghost btn-sm slide-fix-btn">${icon('wand')} Corregir esta imagen</button></div>`);
      box.querySelector('.slide-fix-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openSlideFix(item, currentSlide, car);
      });
    }
  }

  // Pieza SIMPLE (no carrusel): botón para corregir con lenguaje natural sólo lo pedido,
  // reusando la misma imagen (no toca el resto). Reels quedan afuera (su imagen es base).
  if (item.asset_id && (!slides || slides.length <= 1) && img && !isReel) {
    const box = overlay.querySelector('.preview-box');
    box.insertAdjacentHTML('beforeend',
      `<div class="slide-fix-bar"><button class="btn-ghost btn-sm piece-fix-btn">${icon('wand')} Corregir la historia</button></div>`);
    box.querySelector('.piece-fix-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPieceCorrect(item, overlay);
    });
  }
}

/** Corrige una pieza simple con lenguaje natural: aplica SÓLO lo pedido sobre la misma imagen. */
function openPieceCorrect(item, previewOverlay) {
  const body = `
    <p class="hint" style="margin-top:0;">Escribí <b>qué corregir</b> y la IA lo aplica <b>sólo a eso</b>, sobre la misma imagen (no cambia el resto). Ej: «cambiá friza por frisa», «sacá el precio», «título más corto», «poné el botón: Escribinos por WhatsApp».</p>
    <div class="field"><label>¿Qué hay que corregir?</label>
      <textarea class="input" id="pc-inst" rows="3" placeholder="Ej: corregí la palabra friza y en el segundo punto poné Abrigo de invierno"></textarea></div>
    <div class="field">
      <label>Imagen <span class="hint" style="font-weight:400;">(opcional — dejala igual o cambiá el arte)</span></label>
      <select class="input" id="pc-art">
        <option value="">Dejar la misma imagen (gratis)</option>
        <option value="generativa">Rehacerla con imagen generativa (IA)</option>
        <option value="foto">Volver a la foto real del producto</option>
        <option value="tipografica">Sin foto — afiche de diseño</option>
      </select>
      <p class="hint" id="pc-art-hint" style="margin-top:6px;">La corrección de textos no toca la foto. Si querés otra imagen, elegila acá.</p>
    </div>
    <div class="field" id="pc-artbrief-wrap" style="display:none;">
      <label>Indicación para la imagen <span class="hint" style="font-weight:400;">(opcional)</span></label>
      <textarea class="input" id="pc-artbrief" rows="2" placeholder="Ej: obra en construcción al amanecer, contraluz naranja, mucho polvo en el aire"></textarea>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="pc-cancel">Cancelar</button>
      <button class="btn-primary" id="pc-go">${icon('wand')} Corregir</button>
    </div>`;
  const ov = showInfoModal('Corregir la historia', body);
  ov.querySelector('#pc-cancel').addEventListener('click', () => ov.remove());
  const pcArt = ov.querySelector('#pc-art');
  const pcHint = ov.querySelector('#pc-art-hint');
  const PC_HINTS = {
    '': 'La corrección de textos no toca la foto. Si querés otra imagen, elegila acá.',
    generativa: 'Genera arte nuevo con IA para esta pieza (tiene costo). El texto se estampa después con la tipografía de la marca; a la IA nunca se le pide escribir.',
    foto: 'Vuelve a la foto real del producto en el catálogo. Sin costo.',
    tipografica: 'Cambia la pieza a afiche de diseño sin foto. Sin costo.',
  };
  const syncPcArt = () => {
    ov.querySelector('#pc-artbrief-wrap').style.display = pcArt.value === 'generativa' ? '' : 'none';
    pcHint.textContent = PC_HINTS[pcArt.value] || PC_HINTS[''];
  };
  pcArt.addEventListener('change', syncPcArt);
  syncPcArt();
  ov.querySelector('#pc-go').addEventListener('click', async () => {
    const go = ov.querySelector('#pc-go');
    const instruction = ov.querySelector('#pc-inst').value.trim();
    const artMode = pcArt.value || '';
    if (!instruction && !artMode) { toast('Escribí qué corregir o elegí otra imagen', 'err'); return; }
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Corrigiendo…`;
    try {
      const r = await api(`/api/assets/${item.asset_id}/correct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          artMode: artMode || undefined,
          artBrief: artMode === 'generativa' ? (ov.querySelector('#pc-artbrief').value.trim() || undefined) : undefined,
        }),
      });
      // Actualizá la imagen del preview en vivo (cache-bust) sin recargar todo.
      if (r.image_path && previewOverlay) {
        const imgEl = previewOverlay.querySelector('.ig-media img, .ig-story > img');
        if (imgEl) imgEl.src = `${r.image_path}?t=${Date.now()}`;
      }
      ov.remove();
      toast(r.note || 'Historia corregida', 'ok');
      reloadKeepScroll();
    } catch (e) {
      toast(e.message, 'err');
      go.disabled = false; go.innerHTML = `${icon('wand')} Corregir`;
    }
  });
}

/** Corrige/regenera UN slide del carrusel: texto exacto y/o indicación para la imagen. */
function openSlideFix(item, index, carEl) {
  // Texto que HOY tiene impreso ese slide (viene de la receta guardada): el campo va
  // precargado para que se vea qué dice, y sólo se manda si el dueño lo edita —así una
  // corrección escrita ("que diga Conseguilos") no queda pisada por el campo.
  const meta = Array.isArray(item.slides_meta) ? item.slides_meta : null;
  const currentOverlay = (meta && meta[index] && meta[index].overlay) ? String(meta[index].overlay) : '';
  const body = `
    <p class="hint" style="margin-top:0;">Regenerás <b>sólo el slide ${index + 1}</b> (los demás quedan igual). Pedí en castellano lo que quieras de este slide: la IA cambia el texto, la foto o el tipo de toma según lo que digas.</p>
    <div class="field"><label>Texto en la imagen (dejalo vacío para no poner texto)</label>
      <input class="input" id="sf-overlay" placeholder="Ej: Etiqueta argentina" /></div>
    <div class="field"><label>¿Qué querés que cambie en este slide?</label>
      <textarea class="input" id="sf-inst" placeholder="Ej: mostrá todos los colores disponibles · que diga Conseguilos en la web · mostrá más de cerca el bolsillo"></textarea></div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="sf-cancel">Cancelar</button>
      <button class="btn-primary" id="sf-go">${icon('wand')} Regenerar slide ${index + 1}</button>
    </div>`;
  const ov = showInfoModal(`Corregir slide ${index + 1}`, body);
  // Por propiedad y no como atributo: el texto puede traer comillas.
  ov.querySelector('#sf-overlay').value = currentOverlay;
  ov.querySelector('#sf-cancel').addEventListener('click', () => ov.remove());
  ov.querySelector('#sf-go').addEventListener('click', async () => {
    const go = ov.querySelector('#sf-go');
    const overlayText = ov.querySelector('#sf-overlay').value;
    const instructions = ov.querySelector('#sf-inst').value.trim();
    if (!instructions && overlayText === currentOverlay) {
      toast('Escribí qué querés que cambie (o editá el texto de la imagen)', 'err'); return;
    }
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Regenerando…`;
    try {
      const r = await api(`/api/assets/${item.asset_id}/regenerate-slide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `overlay` sólo viaja si el dueño tocó el campo (si no, manda la corrección escrita).
        body: JSON.stringify({ index, instructions, ...(overlayText === currentOverlay ? {} : { overlay: overlayText }) }),
      });
      // Reemplazá la imagen del slide en vivo (con cache-bust) sin recargar todo.
      if (carEl && r.slides && r.slides[index]) {
        const imgEl = carEl.querySelectorAll('img')[index];
        if (imgEl) imgEl.src = `${r.slides[index]}?t=${Date.now()}`;
      }
      ov.remove();
      // La nota dice QUÉ se cambió (y si algo no se pudo, por qué): ej. cuántos colores
      // hay realmente en Tiendanube.
      toast(r.note || 'Slide regenerado', 'ok');
      reloadKeepScroll();
    } catch (e) {
      toast(e.message, 'err');
      go.disabled = false; go.innerHTML = `${icon('wand')} Regenerar slide ${index + 1}`;
    }
  });
}

/* ============ timer de auto-publicación ============ */
// Instante exacto de publicación (hora ARG = GMT-3, sin horario de verano).
function scheduledInstant(item) {
  const date = String(item.scheduled_date).slice(0, 10);
  const time = /^\d{2}:\d{2}$/.test(item.scheduled_time || '') ? item.scheduled_time : '12:00';
  const t = new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * Chip con la cuenta regresiva de auto-publicación. Sólo para piezas APROBADAS,
 * automáticas (no semi) y que se puedan publicar (los reels necesitan su video).
 */
function pubTimerHtml(item, status) {
  if (status !== 'approved' || item.automation_level === 'semi') return '';
  if (item.post_type === 'reel' && !item.video_path) return '';
  const t = scheduledInstant(item);
  if (!t) return '';
  return `<div class="pub-timer" data-when="${t.toISOString()}">${icon('clock')} <span class="pt-text">Calculando…</span></div>`;
}

function pubCountdownParts(target) {
  const ms = target.getTime() - Date.now();
  const mins = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const rel = d > 0 ? `${d}d ${h}h` : (h > 0 ? `${h}h ${m}m` : `${m} min`);
  return { past: ms <= 0, rel };
}

// Refresca todos los timers de la página (corre en un intervalo global).
function refreshPubTimers() {
  document.querySelectorAll('.pub-timer').forEach((el) => {
    const target = new Date(el.dataset.when);
    const txt = el.querySelector('.pt-text');
    if (!txt || Number.isNaN(target.getTime())) return;
    const { past, rel } = pubCountdownParts(target);
    el.classList.toggle('imminent', past);
    // La cola corre cada hora en punto: una pieza a las 17:30 sale en la corrida de
    // las 18:00. Por eso, una vez pasado el horario, avisamos "próxima corrida".
    txt.textContent = past ? 'Se publica en la próxima corrida (cada hora)' : `Se publica sola en ${rel}`;
  });
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
  // La pieza sigue existiendo (nada se borra): esto avisa que no salió en su horario
  // (venció la ventana de publicación) y quedó para republicar a mano si todavía sirve.
  const missedBadge = (aid && item.queue_status === 'failed' && status !== 'published')
    ? `<span class="badge qa-warn" title="${esc(item.queue_error || 'No se publicó a tiempo.')}">${icon('alert')} no se publicó a tiempo</span>` : '';
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
  const forcedProductBadge = item.forced_product_id
    ? `<span class="badge objective" title="El generador usa exactamente este producto, no elige automático">${icon('tag')} ${esc(item.forced_product_name || 'producto fijado')}</span>` : '';
  const dateBadges = commercialDatesOf(item).slice(0, 2).map((d) =>
    `<span class="badge commercial" title="${esc(d.angle || '')}">${icon('tag')} ${esc(d.title)}</span>`
  ).join('');

  const regenBtn = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Regenerar</button>`;
  // Siempre disponible si hay imagen/video: para retocar en el celular (stickers,
  // música) o publicar a mano.
  const downloadBtn = (aid && (item.image_path || item.video_path))
    ? `<button class="btn-ghost btn-sm" data-act="download" data-id="${aid}" title="Bajá la imagen o el video para editar en el celular o publicar a mano">${icon('download')} Descargar</button>` : '';
  // Video con IA de verdad (Veo): sólo si al Reel le falta el video.
  const genVideoBtn = (item.post_type === 'reel' && aid && !item.video_path)
    ? (videoRunningIds.has(String(aid))
      ? `<span class="badge semi gen-chip">${icon('refresh', 'spin')} Generando el video…</span>`
      : `<button class="btn-video" data-act="genvideo" data-id="${aid}">${icon('film')} Generar video con IA</button>`)
    : '';
  const videoBtn = (item.post_type === 'reel' && aid)
    ? `<button class="btn-ghost btn-sm" data-act="videoprompt" data-id="${aid}" title="Para generarlo a mano en Gemini/Veo">${icon('copy')} Prompt a mano</button>` : '';
  const uploadVideoBtn = (item.post_type === 'reel' && aid)
    ? `<button class="btn-ghost btn-sm" data-act="uploadvideo" data-id="${aid}">${icon('upload')} Subir video</button>` : '';
  const editVideoBtn = (item.post_type === 'reel' && aid && item.video_path)
    ? `<button class="btn-ghost btn-sm" data-act="editvideo" data-id="${aid}">${icon('film')} Subtítulos${item.edit_status === 'done' ? ' ✓' : ''}</button>` : '';
  const planBtn = status !== 'published'
    ? `<button class="btn-ghost btn-sm" data-act="planslot" data-id="${item.id}">${icon('calendar')} Planificar</button>` : '';

  let actions = '';
  if (generatingIds.has(String(item.id))) {
    // Pieza generándose en segundo plano: el chip reemplaza los botones hasta terminar.
    actions = `<span class="badge semi gen-chip">${icon('refresh', 'spin')} Generando en segundo plano…</span>`;
  } else if (isRepost) {
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
      ${regenBtn}${genVideoBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}${downloadBtn}
      <button class="btn-discard btn-sm" data-act="discard" data-id="${aid}">${icon('trash')} Descartar</button>${planBtn}`;
  } else if (status === 'approved') {
    actions = (isSemi
      ? `<button class="btn-manual" data-act="publish" data-id="${aid}">${icon('info')} Cómo publicarla</button>`
      : `<button class="btn-publish" data-act="publish" data-id="${aid}">${icon('send')} Publicar ahora</button>`) +
      `<button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>${regenBtn}${genVideoBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}${downloadBtn}${planBtn}`;
  } else if (status === 'published') {
    actions = `<span class="badge status-published" ${item.meta_post_id ? `title="ID de Instagram: ${esc(item.meta_post_id)}"` : ''}>${icon('check')} Publicada</span>
      ${downloadBtn}
      <button class="btn-ghost btn-sm" data-act="republish" data-id="${aid}" title="Por si la borraste de Instagram o querés volver a publicarla">${icon('refresh')} Republicar</button>`;
  } else if (status === 'discarded') {
    actions = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('refresh')} Regenerar</button>${planBtn}`;
  }

  const stickerSpec = (isSemi && status !== 'published') ? stickerSpecHtml(item.sticker) : '';
  const interaction = (isSemi && (item.interaction_hint || stickerSpec) && status !== 'published')
    ? `<div class="interaction-box" style="background: linear-gradient(135deg, rgba(232,93,27,.14) 0%, rgba(255,139,77,.06) 100%); border: 1.5px solid #FF6B1A; border-radius: 14px; padding: 16px 20px; margin: 16px 0; color: #fff;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:800; color:#FF8B4D; font-size:15px; margin-bottom:6px;">
          ${icon('alert')} PUBLICÁS VOS · STICKER MANUAL
        </div>
        ${stickerSpec || `<div style="font-size:14px; line-height:1.5; color:rgba(255,255,255,.92); font-weight:500;">${esc(item.interaction_hint)}</div>
        <div style="font-size:12px; color:rgba(255,255,255,.6); margin-top:8px;">Al subir la historia, tocá el ícono de stickers y agregá lo indicado. Regenerá la pieza para que la IA te deje la pregunta y las opciones exactas.</div>`}
      </div>` : '';

  // Reels: el video NUNCA se auto-genera (nada de imagen estática con zoom).
  // El copy y la imagen base salen del panel; el video lo generás en Gemini/Veo.
  const reelNote = (item.post_type === 'reel' && aid && !item.video_path && ['draft', 'approved'].includes(status))
    ? `<div class="reel-note">${icon('film')} Este Reel tiene el copy listo pero <b>le falta el video</b> (no se publica sin él): tocá <b>Generar video con IA</b> y en 1-4 minutos queda solo. Si preferís hacerlo a mano, están el <b>prompt</b> y <b>Subir video</b>.</div>` : '';

  const caption = item.caption
    ? `<div class="caption">${esc(item.caption)}</div>${item.hashtags ? `<div class="hashtags">${esc(item.hashtags)}</div>` : ''}`
    : `<div class="caption empty">${esc(item.pillar_detail || 'Todavía sin generar.')}</div>`;

  // Check para las acciones en lote: sólo en lo que todavía se puede tocar.
  const checkbox = selectableItem(item)
    ? `<label class="card-check" title="Seleccionar para aprobar/descartar en lote">
        <input type="checkbox" data-slot="${item.id}" ${selectedSlots.has(String(item.id)) ? 'checked' : ''}/></label>`
    : '';

  card.innerHTML = `
    ${checkbox}
    <div>${renderPreview(item)}</div>
    <div class="body">
      <div class="meta-row">
        <span class="badge type">${typeLabel(item)}</span>
        ${carouselBadge(item)}
        <span class="badge pillar">${esc(item.pillar)}</span>
        ${item.objective ? `<span class="badge objective" title="Qué busca esta pieza">${esc(item.objective)}</span>` : ''}
        ${commercialBadge}
        ${forcedProductBadge}
        ${dateBadges}
        ${item.scheduled_time ? `<span class="badge time">${icon('clock')} ${esc(item.scheduled_time)} hs</span>` : ''}
        ${autoBadge}${statusBadge}${missedBadge}${costBadge}${modelBadge}${qaBadge}
      </div>
      ${caption}
      ${interaction}
      ${reelNote}
      ${pubTimerHtml(item, status)}
      <div class="actions">${actions}</div>
    </div>`;

  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id, btn, card, item));
  });
  const chk = card.querySelector('.card-check input');
  if (chk) chk.addEventListener('change', () => toggleSelect(chk.dataset.slot, chk.checked));
  const ph = card.querySelector('.phone');
  if (ph) { ph.style.cursor = 'zoom-in'; ph.title = 'Ver cómo se publica'; ph.addEventListener('click', () => openPreview(item)); }
  return card;
}

async function handleAction(act, id, btn, card, item) {
  try {
    if (act === 'generate') {
      btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Generando…`;
      // Segundo plano: el server responde ya y genera atrás; el panel muestra el chip
      // "generando" y refresca solo al terminar. Podés seguir usando el resto mientras.
      await api(`/api/generate/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      toast('Generando en segundo plano… seguí usando el panel', 'ok');
      markGenerating(id);
    } else if (act === 'approve') {
      await api(`/api/assets/${id}/approve`, { method: 'POST' }); toast('Aprobada', 'ok'); reloadKeepScroll();
    } else if (act === 'discard') {
      const reason = await discardReasonModal();
      if (reason === null) return; // canceló
      await api(`/api/assets/${id}/discard`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      toast(reason ? 'Descartada — el sistema lo aprende' : 'Descartada'); reloadKeepScroll();
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'regen') {
      openRegen(item || calItems.find((x) => String(x.id) === String(id)));
    } else if (act === 'genvideo') {
      openVideoGenerate(id);
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

/** Búsqueda de producto real de Tiendanube para fijarlo a un slot de pilar 'producto'. */
async function planProductSearch(overlay, q, onPick) {
  const out = overlay.querySelector('#plan-product-results');
  if (!out) return;
  if (!q || q.length < 2) { out.innerHTML = ''; return; }
  try {
    const rows = await api(`/api/products?q=${encodeURIComponent(q)}`);
    out.innerHTML = rows.slice(0, 8).map((p) => `
      <div class="prod-row plan-prod-result" data-id="${p.id}" style="cursor:pointer;">
        <img src="${esc(p.image_url || '')}" onerror="this.style.visibility='hidden'"/>
        <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
          <div class="prod-sub">${esc(p.brand || '')} · stock ${p.stock ?? '∞'}</div></div>
      </div>`).join('') || '<p class="hint">Sin resultados.</p>';
    out.querySelectorAll('.plan-prod-result').forEach((r) => r.addEventListener('click', () => {
      const p = rows.find((x) => String(x.id) === String(r.dataset.id));
      if (p) onPick(p);
    }));
  } catch (e) { out.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}

function openPlanSlot(item = null) {
  const isNew = !item;
  // Producto fijado a mano (si el slot ya lo tenía). Elegirlo acá hace que el
  // generador use EXACTAMENTE este producto (foto real de Tiendanube en modo
  // estudio profesional) en vez de la selección automática.
  let chosenProduct = (item && item.forced_product_id)
    ? { id: item.forced_product_id, name: item.forced_product_name, image_url: item.forced_product_image_url }
    : null;
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
    <div class="field" id="plan-product-field">
      <label>Producto (opcional)</label>
      <input class="input" id="plan-product-search" placeholder="Buscar producto real de Tiendanube por nombre…" autocomplete="off" />
      <div id="plan-product-results"></div>
      <div id="plan-product-chosen"></div>
      <p class="hint" style="margin:6px 0 0;">Si elegís uno, el generador usa EXACTAMENTE ese producto (con sus fotos reales, en escena de estudio profesional) en vez de elegir uno automático. Sin elegir ninguno, sigue como hasta ahora.</p>
      <p class="hint" style="margin:4px 0 0;">¿No aparece un producto que acabás de cargar en Tiendanube? <a href="#" id="plan-product-sync-link">Sincronizalo ahora</a> (tarda ~20-30 s).</p>
    </div>
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

  const renderChosenProduct = () => {
    const el = overlay.querySelector('#plan-product-chosen');
    if (!chosenProduct) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="prod-row">
      <img src="${esc(chosenProduct.image_url || '')}" onerror="this.style.visibility='hidden'"/>
      <div class="prod-info"><div class="prod-name">${esc(chosenProduct.name || '')}</div><div class="prod-sub">Fijado para esta pieza</div></div>
      <button class="btn-ghost btn-sm" id="plan-product-clear" type="button">${icon('x')} Quitar</button>
    </div>`;
    el.querySelector('#plan-product-clear').addEventListener('click', () => { chosenProduct = null; renderChosenProduct(); });
  };
  renderChosenProduct();

  let planProductTimer;
  overlay.querySelector('#plan-product-search').addEventListener('input', (e) => {
    clearTimeout(planProductTimer);
    const q = e.target.value.trim();
    planProductTimer = setTimeout(() => planProductSearch(overlay, q, (p) => {
      chosenProduct = p;
      renderChosenProduct();
      overlay.querySelector('#plan-product-search').value = '';
      overlay.querySelector('#plan-product-results').innerHTML = '';
    }), 300);
  });
  overlay.querySelector('#plan-product-sync-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const link = e.target;
    const original = link.textContent;
    link.textContent = 'Sincronizando… (~20-30 s)';
    try {
      const d = await api('/api/products/sync', { method: 'POST' });
      toast(`Catálogo sincronizado: ${d.count} producto(s)`, 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally { link.textContent = original; }
  });

  // El selector de producto sólo tiene sentido para el pilar 'producto'.
  const pillarSel = overlay.querySelector('#plan-pillar');
  const productField = overlay.querySelector('#plan-product-field');
  const syncProductField = () => { productField.style.display = pillarSel.value === 'producto' ? '' : 'none'; };
  pillarSel.addEventListener('change', syncProductField);
  syncProductField();

  overlay.querySelector('#plan-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#plan-save').addEventListener('click', async () => {
    const btn = overlay.querySelector('#plan-save');
    btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Guardando…`;
    try {
      const payload = readPlanForm(overlay);
      payload.product_id = chosenProduct ? chosenProduct.id : null;
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
const REGEN_FALLBACK = {
  educativo: ['Cómo elegir el talle correcto', 'Cuidados para que la ropa dure más', 'Diferencia entre telas de trabajo'],
  producto: ['Lo más vendido de la semana', 'Ideal para el frío', 'Novedad recién llegada'],
  promo: ['Ofertas de temporada', '3 cuotas sin interés', 'Envío gratis desde cierto monto'],
  marca: ['Por qué elegir esta marca', 'Historia de la marca'],
  engagement: ['¿Qué preferís vos?', 'Contanos en qué rubro trabajás'],
};

/**
 * Sugerencias INTELIGENTES para regenerar: se arman con la fecha comercial de ese
 * día (festivo/ángulo), los productos reales que conviene mostrar (ventas/stock) y
 * el tema que el plan del mes tenía para ese día. Fallback fijo si no hay datos.
 */
async function regenSuggestions(item) {
  const out = [];
  // 1) Fecha comercial de ESE día (ej: Día de la Independencia -> su ángulo).
  for (const d of commercialDatesOf(item)) {
    if (d.angle) out.push(String(d.angle).slice(0, 90));
    else if (d.title) out.push(`Aprovechá: ${d.title}`);
  }
  // 2) Productos reales según el pilar (los que el motor puede protagonizar).
  if (['producto', 'promo', 'marca'].includes(item.pillar)) {
    try {
      const d = await api('/api/products/analytics');
      (d.winners || []).slice(0, 2).forEach((p) => out.push(`Destacá ${p.name}`));
      (d.needVisibility || []).slice(0, 1).forEach((p) => out.push(`Dale salida a ${p.name} (mucho stock, pocas ventas)`));
    } catch (_) {}
  }
  // 3) Lo que el plan del mes tenía pensado para ese día.
  try {
    const month = String(item.scheduled_date).slice(0, 7);
    const plan = await api(`/api/plan?month=${month}`);
    const planArr = Array.isArray(plan.plan) ? plan.plan : [];
    const day = String(item.scheduled_date).slice(0, 10);
    const slot = planArr.find((s) => s.date === day);
    if (slot && slot.pillar_detail && slot.pillar_detail !== item.pillar_detail) out.push(String(slot.pillar_detail).slice(0, 90));
  } catch (_) {}
  // 4) Fallback por pilar si quedó corto.
  if (out.length < 3) out.push(...(REGEN_FALLBACK[item.pillar] || ['Enfoque en beneficios', 'Enfoque en temporada', 'Enfoque en precio']));
  return [...new Set(out.filter(Boolean))].slice(0, 6);
}

function openRegen(item) {
  if (!item) return;
  const current = item.pillar_detail || item.theme_title || '';
  // Chips iniciales: el fallback instantáneo; después se reemplazan por los inteligentes.
  const initial = REGEN_FALLBACK[item.pillar] || ['Enfoque en beneficios', 'Enfoque en temporada'];
  const body = `
    <p class="hint" style="margin-top:0;">Pilar: <b>${esc(item.pillar)}</b> · ${typeLabel(item)}. Cambiá el tema/ángulo y la IA vuelve a generar el texto y la imagen.</p>
    <div class="field">
      <label>Tema / ángulo de esta pieza</label>
      <textarea class="input" id="regen-detail" placeholder="Ej: Botines con puntera para la construcción">${esc(current)}</textarea>
      <div class="chips-suggest" id="regen-chips">${initial.map((s) => `<span class="chip-suggest" data-s="${esc(s)}">${esc(s)}</span>`).join('')}
        <span class="chip-suggest loading" style="pointer-events:none; opacity:.6;">${icon('refresh', 'spin')} recomendaciones…</span></div>
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
        <option value="grid">Grid — bento de varias fotos reales</option>
        <option value="overlap">Overlap — fotos superpuestas estilo moodboard</option>
        <option value="specsheet">Ficha técnica — specs reales pineados</option>
        <option value="splitscreen">Splitscreen — bloque de color + foto</option>
        <option value="blueprint">Blueprint — plano técnico/manual</option>
        <option value="magazine">Magazine — portada editorial</option>
        <option value="stackedcards">Bento cards — tarjetas apiladas</option>
        <option value="polaroidstrip">Polaroids — tira de instantáneas (historias)</option>
        <option value="poster">Afiche — sin foto, con el descuento en grande</option>
      </select>
      <p class="hint" style="margin-top:6px;"><b>Para promos y fechas comerciales (Black Friday, liquidación) elegí “Afiche”:</b> es la única que trata el número del descuento como pieza gráfica gigante. Las que se apoyan en la foto (full-bleed, minimal, grid) quedan vacías si la pieza no tiene un producto puntual que mostrar.</p>
    </div>
    <div class="field">
      <label>Imagen de la pieza</label>
      <select class="input" id="regen-art">
        <option value="">Automática — la decide el director creativo</option>
        <option value="generativa">Generativa (IA) — foto de campaña creada para esta pieza</option>
        <option value="foto">Sólo fotos reales del catálogo</option>
        <option value="tipografica">Sin foto — afiche de diseño (recomendado para promos)</option>
      </select>
      <p class="hint" id="regen-art-hint" style="margin-top:6px;">La decide el director creativo según el mensaje. Si la pieza no tiene un producto puntual (promo de toda la tienda, fecha comercial), va a elegir el afiche.</p>
    </div>
    <div class="field" id="regen-artbrief-wrap" style="display:none;">
      <label>Indicación para la imagen <span class="hint" style="font-weight:400;">(opcional)</span></label>
      <textarea class="input" id="regen-artbrief" placeholder="Ej: taller mecánico de noche, luz naranja de contraluz, mucho humo y chispas"></textarea>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn-discard" id="regen-cancel">Cancelar</button>
      <button class="btn-primary" id="regen-go">${icon('wand')} Regenerar con IA ${costTag(genCostLabel())}</button>
    </div>`;
  const overlay = showInfoModal('Regenerar pieza', body);
  const wireChips = () => overlay.querySelectorAll('.chip-suggest:not(.loading)').forEach((c) =>
    c.addEventListener('click', () => { overlay.querySelector('#regen-detail').value = c.dataset.s; }));
  wireChips();
  // Reemplazar por las sugerencias inteligentes cuando lleguen.
  regenSuggestions(item).then((sugg) => {
    const box = overlay.querySelector('#regen-chips');
    if (!box || !sugg.length) { const l = box && box.querySelector('.loading'); if (l) l.remove(); return; }
    box.innerHTML = sugg.map((s) => `<span class="chip-suggest" data-s="${esc(s)}" title="${esc(s)}">${esc(s.length > 42 ? s.slice(0, 40) + '…' : s)}</span>`).join('');
    wireChips();
  }).catch(() => { const l = overlay.querySelector('#regen-chips .loading'); if (l) l.remove(); });
  overlay.querySelector('#regen-cancel').addEventListener('click', () => overlay.remove());
  // La indicación para la imagen sólo tiene sentido si la imagen se va a generar.
  const artSel = overlay.querySelector('#regen-art');
  const artBriefWrap = overlay.querySelector('#regen-artbrief-wrap');
  const artHint = overlay.querySelector('#regen-art-hint');
  const ART_HINTS = {
    '': 'La decide el director creativo según el mensaje. Si la pieza no tiene un producto puntual (promo de toda la tienda, fecha comercial), va a elegir el afiche.',
    generativa: 'La IA crea la FOTO de campaña (luz, composición, profundidad) y deja libre la zona donde va el texto; el titular, el descuento y el botón se estampan después con la tipografía de la marca. A la IA nunca se le pide escribir: lo escribe mal y no se puede corregir. Cuesta ~US$0,04 por imagen y tarda 1-2 min.',
    foto: 'Usa sólo fotos reales del catálogo de Tiendanube. Si la pieza no tiene un producto asociado, va a quedar sin foto. Gratis.',
    tipografica: 'Afiche de diseño: trama de marca, banda de acento y el número del descuento impreso gigante. Es la mejor opción para promos de toda la tienda y fechas comerciales. Gratis e instantáneo.',
  };
  const syncArt = () => {
    artBriefWrap.style.display = artSel.value === 'generativa' ? '' : 'none';
    artHint.textContent = ART_HINTS[artSel.value] || ART_HINTS[''];
  };
  artSel.addEventListener('change', syncArt);
  syncArt();
  overlay.querySelector('#regen-go').addEventListener('click', async () => {
    const detail = overlay.querySelector('#regen-detail').value.trim();
    const go = overlay.querySelector('#regen-go');
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Generando…`;
    try {
      await api(`/api/generate/${item.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pillarDetail: detail, theme: detail,
          template: overlay.querySelector('#regen-template').value || undefined,
          artMode: artSel.value || undefined,
          artBrief: artSel.value === 'generativa' ? (overlay.querySelector('#regen-artbrief').value.trim() || undefined) : undefined,
        }),
      });
      // Segundo plano: cerramos el modal ya y el panel muestra "generando" hasta que
      // termina (el director de arte + varias escenas de IA puede tardar 1-3 min).
      overlay.remove();
      toast('Generando en segundo plano… seguí usando el panel', 'ok');
      markGenerating(item.id);
    } catch (e) { toast(e.message, 'err'); go.disabled = false; go.innerHTML = `${icon('wand')} Regenerar con IA`; }
  });
}

/** Convierte cualquier blob de imagen a PNG (máxima compatibilidad del portapapeles). */
async function imageBlobToPng(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir la imagen'))), 'image/png'));
}

/** Copia varias fotos al portapapeles de una (como si las copiaras del Finder) para pegarlas en Gemini Omni. */
async function copyImagesToClipboard(urls) {
  const items = [];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No pude descargar la foto (${res.status})`);
    const png = await imageBlobToPng(await res.blob());
    items.push(new ClipboardItem({ 'image/png': png }));
  }
  await navigator.clipboard.write(items);
}

async function openVideoPrompt(assetId) {
  try {
    const d = await api(`/api/assets/${assetId}/video-prompt`);
    // Compat: si el server viejo devuelve un solo prompt, lo envolvemos como un estilo.
    const styles = Array.isArray(d.styles) && d.styles.length
      ? d.styles
      : [{ id: 'default', label: 'Estándar', desc: '', prompt: d.prompt }];
    const firstImgs = (d.productImages || []).slice(0, 3);
    const body = `
      <p class="hint" style="margin-top:0;">Elegí un <b>estilo de video</b> y generalo en Gemini/Veo con el prompt. Los estilos <b>sin persona</b> (producto solo, macro, flat-lay, percha) son los que menos se rompen.</p>
      <div class="field"><label>Estilo de video</label>
        <select class="input" id="vp-style">${styles.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join('')}</select>
        <p class="hint" id="vp-style-desc" style="margin:6px 0 0;">${esc(styles[0].desc || '')}</p></div>
      <div class="field"><label>Pasos</label>
        <ol style="line-height:1.8; padding-left:20px; font-size:14px; margin:0;">${(d.instructions || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
      ${(d.productImages && d.productImages.length) ? `<div class="field"><label>Fotos del producto a mandar (${d.productImages.length}) — subí varias perspectivas</label>
        <div class="vp-imgs">${d.productImages.map((u, i) => `<a href="${esc(u)}" target="_blank" title="foto ${i + 1}"><img src="${esc(u)}"/></a>`).join('')}</div>
        <p class="hint" style="margin:6px 0 0;">1) Copiá las fotos y pegalas en Gemini Omni. 2) Copiá el prompt y pegalo en el chat. No se pueden pegar juntas en una sola acción — el portapapeles sólo lleva un tipo de contenido a la vez.</p></div>` : ''}
      <div class="field"><label>Prompt (copialo y pegalo)</label>
        <textarea class="input" id="vp-text" readonly style="min-height:200px">${esc(styles[0].prompt)}</textarea></div>
      ${d.platformNote ? `<p class="hint" style="margin:0 0 12px;">${icon('info')} ${esc(d.platformNote)}</p>` : ''}
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
        ${firstImgs.length ? `<button class="btn-ghost" id="vp-copy-imgs">${icon('copy')} Copiar ${firstImgs.length} foto${firstImgs.length > 1 ? 's' : ''}</button>` : ''}
        <button class="btn-primary" id="vp-copy">${icon('copy')} Copiar prompt</button></div>`;
    const ov = showInfoModal('Prompt para video con IA', body);
    const sel = ov.querySelector('#vp-style');
    const ta = ov.querySelector('#vp-text');
    const descEl = ov.querySelector('#vp-style-desc');
    sel.addEventListener('change', () => {
      const s = styles[Number(sel.value)] || styles[0];
      ta.value = s.prompt;
      if (descEl) descEl.textContent = s.desc || '';
    });
    ov.querySelector('#vp-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(ta.value).then(() => toast('Prompt copiado', 'ok')));
    const imgsBtn = ov.querySelector('#vp-copy-imgs');
    if (imgsBtn) imgsBtn.addEventListener('click', async () => {
      const original = imgsBtn.innerHTML;
      imgsBtn.disabled = true; imgsBtn.innerHTML = `${icon('refresh', 'spin')} Copiando…`;
      try {
        await copyImagesToClipboard(firstImgs);
        toast(`${firstImgs.length} foto${firstImgs.length > 1 ? 's' : ''} copiada${firstImgs.length > 1 ? 's' : ''} — pegalas en Gemini Omni`, 'ok');
      } catch (e) {
        toast('No pude copiarlas automático (bloqueo del navegador). Hacé click derecho sobre cada miniatura → "Copiar imagen".', 'err');
      } finally { imgsBtn.disabled = false; imgsBtn.innerHTML = original; }
    });
  } catch (e) { toast(e.message, 'err'); }
}

/* ============ VIDEO CON IA (Veo) ============
 * Genera el video de verdad desde el panel: elegís estilo, calidad y desde qué
 * foto arranca, y el motor lo genera solo (1-4 min) y lo deja enganchado a la
 * pieza. Antes había que ir a Gemini/Veo a mano y volver a subirlo.
 * El costo se muestra SIEMPRE antes de gastar (Veo se cobra por segundo).
 */
const videoJobPolls = new Map();

async function openVideoGenerate(assetId, studio = null) {
  let opt;
  try {
    opt = await api(`/api/video/options?duration=8${assetId ? `&assetId=${assetId}` : ''}`);
  } catch (e) { toast(e.message, 'err'); return; }
  if (!opt.available) {
    showInfoModal('Video con IA', '<p class="hint">Falta configurar <b>GEMINI_API_KEY</b> en el servidor: sin eso no se puede generar video con IA. Mientras tanto podés usar <b>Prompt video IA</b> y generarlo a mano.</p>');
    return;
  }

  const frames = opt.frames || [];
  // Ojo: div y no label — `.field label` del panel pisa el display:flex de .q-card.
  const qCards = (dur) => opt.qualities.map((q) => `
    <div class="q-card ${q.id === 'fast' ? 'sel' : ''}" data-q="${q.id}">
      <b>${esc(q.label)}</b>
      <span class="q-price" data-persec="${q.usdPerSec}">US$ ${(q.usdPerSec * dur).toFixed(2)}</span>
      <span class="q-desc">${esc(q.desc)} · ${q.resolution}</span>
    </div>`).join('');

  const destino = studio
    ? 'Queda guardado en la biblioteca del Estudio, listo para descargar.'
    : 'Queda pegado a la pieza, listo para publicar.';
  const body = `
    <p class="hint" style="margin-top:0;">El video se genera con <b>Veo 3.1</b> arrancando desde una foto real (así el producto no se deforma). Tarda 1 a 4 minutos. ${destino}</p>
    ${(studio ? studio.name : opt.productName) ? `<p class="hint" style="margin:0 0 12px;">${icon('tag')} <b>${esc(studio ? studio.name : opt.productName)}</b></p>` : ''}

    <div class="grid-2">
      <div class="field"><label>Estilo</label>
        <select class="input" id="vg-style">${(opt.styles || []).map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Duración</label>
        <select class="input" id="vg-dur">${(opt.durations || [8]).map((d) => `<option value="${d}" ${d === 8 ? 'selected' : ''}>${d} segundos</option>`).join('')}</select></div>
    </div>

    <div class="field"><label>Calidad (esto es lo que define el precio)</label>
      <div class="q-cards" id="vg-qs">${qCards(8)}</div></div>

    ${frames.length ? `<div class="field"><label>Primer fotograma — de acá arranca el video</label>
      <div class="vg-frames" id="vg-frames">
        ${frames.map((f, i) => `<button class="vg-frame ${i === 0 ? 'sel' : ''}" data-frame="${esc(f.id)}" title="${esc(f.label)}">
          <img src="${esc(f.url)}" loading="lazy" alt=""/><span>${esc(f.label)}</span></button>`).join('')}
      </div></div>`
      : `<p class="hint">${studio ? 'Arranca desde la primera foto del producto elegido.' : 'Esta pieza no tiene foto de producto: el video sale sólo del texto (menos fiel).'}</p>`}

    <p class="hint" style="margin:4px 0 14px;">${icon('info')} Gasto de video de hoy: <b>US$ ${Number(opt.spentTodayUsd).toFixed(2)}</b> de US$ ${Number(opt.budgetUsd).toFixed(2)} (tope diario).</p>

    <div id="vg-status"></div>
    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
      <button class="btn-ghost" id="vg-manual">${icon('copy')} Prefiero el prompt a mano</button>
      <button class="btn-primary" id="vg-go">${icon('film')} Generar video · <span id="vg-cost">US$ 0,80</span></button>
    </div>`;

  const ov = showInfoModal('Generar el video con IA', body);
  const durSel = ov.querySelector('#vg-dur');
  const costEl = ov.querySelector('#vg-cost');
  const goBtn = ov.querySelector('#vg-go');
  let quality = 'fast';
  let frame = frames.length ? frames[0].id : null;

  const refreshCost = () => {
    const dur = Number(durSel.value) || 8;
    ov.querySelectorAll('.q-card').forEach((c) => {
      const p = c.querySelector('.q-price');
      p.textContent = `US$ ${(Number(p.dataset.persec) * dur).toFixed(2)}`;
    });
    const sel = ov.querySelector('.q-card.sel .q-price');
    if (costEl && sel) costEl.textContent = sel.textContent;
  };
  durSel.addEventListener('change', refreshCost);
  ov.querySelectorAll('.q-card').forEach((c) => c.addEventListener('click', () => {
    ov.querySelectorAll('.q-card').forEach((x) => x.classList.remove('sel'));
    c.classList.add('sel');
    quality = c.dataset.q;
    refreshCost();
  }));
  ov.querySelectorAll('.vg-frame').forEach((b) => b.addEventListener('click', () => {
    ov.querySelectorAll('.vg-frame').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    frame = b.dataset.frame;
  }));
  refreshCost();

  ov.querySelector('#vg-manual').addEventListener('click', () => {
    ov.remove();
    if (studio) studioVideoPrompt(); else openVideoPrompt(assetId);
  });

  goBtn.addEventListener('click', async () => {
    const dur = Number(durSel.value) || 8;
    goBtn.disabled = true;
    goBtn.innerHTML = `${icon('refresh', 'spin')} Arrancando…`;
    const payload = { quality, duration: dur, style: ov.querySelector('#vg-style').value, frame };
    try {
      const r = studio
        ? await api('/api/studio/video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...studioParams(), ...payload }),
        })
        : await api(`/api/assets/${assetId}/generate-video`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      ov.querySelector('#vg-status').innerHTML =
        `<div class="vg-run">${icon('refresh', 'spin')} Generando el video… tarda 1 a 4 minutos. Podés cerrar esta ventana y seguir trabajando: cuando esté listo ${studio ? 'aparece en la biblioteca' : 'aparece en la pieza'}.</div>`;
      goBtn.classList.add('hidden');
      toast(r.already ? 'Ya había un video generándose para esta pieza' : 'Video en camino', 'ok');
      if (studio) watchStudioVideoJob(r.job && r.job.id, ov); else watchVideoJob(assetId, ov);
      pollBgTasks();
    } catch (e) {
      toast(e.message, 'err');
      goBtn.disabled = false;
      goBtn.innerHTML = `${icon('film')} Reintentar`;
    }
  });
}

/** Igual que watchVideoJob pero para el Estudio (el resultado va a la biblioteca). */
function watchStudioVideoJob(jobId, ov = null) {
  if (!jobId || videoJobPolls.has(`studio-${jobId}`)) return;
  const timer = setInterval(async () => {
    try {
      const jobs = await api('/api/studio/video-jobs');
      const job = (jobs || []).find((j) => j.id === jobId);
      if (!job || job.status === 'running') return;
      clearInterval(timer);
      videoJobPolls.delete(`studio-${jobId}`);
      if (job.status === 'done') {
        toast('¡Video listo! Ya está en la biblioteca.', 'ok');
        if (ov && document.body.contains(ov)) {
          ov.querySelector('#vg-status').innerHTML =
            `<video src="${esc(job.video_path)}" controls playsinline style="width:180px;border-radius:12px;margin-bottom:12px;"></video>`;
        }
        loadStudioGallery();
      } else {
        toast(`El video falló: ${job.error || 'error desconocido'}`, 'err');
        if (ov && document.body.contains(ov)) {
          ov.querySelector('#vg-status').innerHTML = `<div class="vg-run err">${icon('alert')} ${esc(job.error || 'Error generando el video')}</div>`;
        }
      }
      pollBgTasks();
    } catch (_) { /* reintenta */ }
  }, 8000);
  videoJobPolls.set(`studio-${jobId}`, timer);
}

/** Sigue el estado del video hasta que está listo (o falla) y refresca el panel. */
function watchVideoJob(assetId, ov = null) {
  if (videoJobPolls.has(String(assetId))) return;
  const timer = setInterval(async () => {
    try {
      const job = await api(`/api/assets/${assetId}/video-job`);
      if (!job || job.status === 'running') return;
      clearInterval(timer);
      videoJobPolls.delete(String(assetId));
      if (job.status === 'done') {
        toast('¡Video listo! Ya quedó en la pieza.', 'ok');
        if (ov && document.body.contains(ov)) {
          ov.querySelector('#vg-status').innerHTML =
            `<video src="${esc(job.video_path)}" controls playsinline style="width:180px;border-radius:12px;margin-bottom:12px;"></video>`;
        }
      } else {
        toast(`El video falló: ${job.error || 'error desconocido'}`, 'err');
        if (ov && document.body.contains(ov)) {
          ov.querySelector('#vg-status').innerHTML = `<div class="vg-run err">${icon('alert')} ${esc(job.error || 'Error generando el video')}</div>`;
        }
      }
      reloadKeepScroll();
      pollBgTasks();
    } catch (_) { /* reintenta en el próximo tick */ }
  }, 8000);
  videoJobPolls.set(String(assetId), timer);
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

/** Trae el catálogo completo de Tiendanube ahora mismo (no espera al cron diario). */
async function syncProductsFromTiendanube() {
  const btn = document.getElementById('products-sync-btn');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Sincronizando… (~20-30 s)`;
  try {
    const d = await api('/api/products/sync', { method: 'POST' });
    toast(`Catálogo sincronizado: ${d.count} producto(s)`, 'ok');
    loadProducts();
  } catch (e) {
    toast(e.message, 'err');
  } finally { btn.disabled = false; btn.innerHTML = original; }
}

async function loadProducts() {
  loadInterest(); // termómetro de interés: carga en paralelo, no bloquea la lista
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
  const stickerSpec = stickerSpecHtml(data.sticker);
  const body = `
    <p style="line-height:1.6; margin-top:0;">${esc(data.message)}</p>
    ${stickerSpec ? `<div class="interaction-box" style="margin:14px 0;"><b>${icon('alert')} Sticker a agregar (tal cual):</b>${stickerSpec}</div>`
      : (data.interaction_hint ? `<div class="interaction-box" style="margin:14px 0;"><b>${icon('alert')} Sticker a agregar:</b> ${esc(data.interaction_hint)}</div>` : '')}
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
      ${stickerSpec ? `<button class="btn-ghost btn-sm" id="copy-sticker">${icon('copy')} Copiar sticker</button>` : ''}
      ${data.link_url ? `<button class="btn-ghost btn-sm" id="copy-link">${icon('copy')} Copiar link</button>` : ''}
    </div>`;
  const overlay = showInfoModal('Publicación semiautomatizada', body);
  const copyBtn = overlay.querySelector('#copy-caption');
  if (copyBtn) copyBtn.addEventListener('click', () =>
    navigator.clipboard.writeText(data.caption || '').then(() => toast('Texto copiado', 'ok')));
  const stickerBtn = overlay.querySelector('#copy-sticker');
  if (stickerBtn) stickerBtn.addEventListener('click', () => {
    let s = data.sticker;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (_) { s = null; } }
    const txt = s ? [s.question, ...(s.options || []).map((o, i) =>
      `${i + 1}. ${o}${s.type === 'quiz' && Number(s.correct_index) === i ? ' (correcta)' : ''}`)].join('\n') : '';
    navigator.clipboard.writeText(txt).then(() => toast('Sticker copiado', 'ok'));
  });
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
    const styles = Array.isArray(d.styles) && d.styles.length
      ? d.styles
      : [{ id: 'default', label: 'Estándar', desc: '', prompt: d.prompt }];
    studioLastPrompt = styles[0].prompt;
    const body = `
      <p class="hint" style="margin-top:0;">${studioSel.length > 1 ? `Video del COMBO (${studioSel.length} productos juntos).` : 'Video del producto.'} Elegí un <b>estilo</b>, generalo en Gemini/Veo y subí el resultado. Los estilos <b>sin persona</b> son los que menos se rompen.</p>
      <div class="field"><label>Estilo de video</label>
        <select class="input" id="svp-style">${styles.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join('')}</select>
        <p class="hint" id="svp-style-desc" style="margin:6px 0 0;">${esc(styles[0].desc || '')}</p></div>
      <div class="field"><label>Pasos</label>
        <ol style="line-height:1.8; padding-left:20px; font-size:14px; margin:0;">${(d.instructions || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ol></div>
      ${(d.productImages && d.productImages.length) ? `<div class="field"><label>Fotos a subir como referencia (${d.productImages.length})</label>
        <div class="vp-imgs">${d.productImages.slice(0, 12).map((u) => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}"/></a>`).join('')}</div></div>` : ''}
      <div class="field"><label>Prompt (copialo y pegalo)</label>
        <textarea class="input" id="svp-text" readonly style="min-height:220px">${esc(styles[0].prompt)}</textarea></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn-ghost btn-sm" id="svp-upload">${icon('upload')} Ya lo generé: subir video</button>
        ${(d.productImages && d.productImages.length) ? `<button class="btn-ghost" id="svp-copy-imgs">${icon('copy')} Copiar ${Math.min(d.productImages.length, 3)} foto${Math.min(d.productImages.length, 3) > 1 ? 's' : ''}</button>` : ''}
        <button class="btn-primary" id="svp-copy">${icon('copy')} Copiar prompt</button>
      </div>`;
    const ov = showInfoModal('Prompt de video · Estudio', body);
    const svpSel = ov.querySelector('#svp-style');
    const svpTa = ov.querySelector('#svp-text');
    const svpDesc = ov.querySelector('#svp-style-desc');
    svpSel.addEventListener('change', () => {
      const s = styles[Number(svpSel.value)] || styles[0];
      svpTa.value = s.prompt; studioLastPrompt = s.prompt;
      if (svpDesc) svpDesc.textContent = s.desc || '';
    });
    ov.querySelector('#svp-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(svpTa.value).then(() => toast('Prompt copiado', 'ok')));
    const svpImgsBtn = ov.querySelector('#svp-copy-imgs');
    if (svpImgsBtn) svpImgsBtn.addEventListener('click', async () => {
      const original = svpImgsBtn.innerHTML;
      svpImgsBtn.disabled = true; svpImgsBtn.innerHTML = `${icon('refresh', 'spin')} Copiando…`;
      try {
        await copyImagesToClipboard(d.productImages.slice(0, 3));
        toast('Fotos copiadas — pegalas en Gemini Omni', 'ok');
      } catch (e) {
        toast('No pude copiarlas automático. Hacé click derecho sobre cada miniatura → "Copiar imagen".', 'err');
      } finally { svpImgsBtn.disabled = false; svpImgsBtn.innerHTML = original; }
    });
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
    document.getElementById('st-gen-video').addEventListener('click', () => {
      if (!studioSel.length) { toast('Elegí al menos un producto.'); return; }
      openVideoGenerate(null, { name: studioSel.map((p) => p.name).join(' + ') });
    });
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
function closeEdit() {
  document.getElementById('edit-modal').classList.add('hidden');
  const box = document.getElementById('edit-variants');
  if (box) box.innerHTML = '';
  editingId = null;
}

/**
 * "Probar otras 3 versiones": pide 3 captions alternativos para la MISMA imagen.
 * Es texto (gratis) — a diferencia de "Regenerar", que vuelve a pagar la escena.
 * Tocás una y se carga en el formulario; después guardás normalmente.
 */
async function loadCopyVariants(btn) {
  const box = document.getElementById('edit-variants');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${icon('refresh', 'spin')} Escribiendo 3 versiones…`;
  box.innerHTML = '';
  try {
    const d = await api(`/api/assets/${editingId}/copy-variants`, { method: 'POST' });
    box.innerHTML = `<label>Otras versiones — tocá una para usarla</label>` + d.variants.map((v, i) => `
      <div class="cv-card" data-i="${i}">
        <div class="cv-head"><b>${esc(v.angle || `Versión ${i + 1}`)}</b>
          ${(v.problems || []).length ? `<span class="badge qa-warn" title="${esc((v.problems || []).join(' · '))}">revisar</span>` : ''}
          <span class="cv-use">Usar esta</span></div>
        <div class="cv-cap">${esc(v.caption)}</div>
        ${v.hashtags ? `<div class="cv-tags">${esc(v.hashtags)}</div>` : ''}
      </div>`).join('');
    box.querySelectorAll('.cv-card').forEach((c) => c.addEventListener('click', () => {
      const v = d.variants[Number(c.dataset.i)];
      document.getElementById('edit-caption').value = v.caption;
      if (v.hashtags) document.getElementById('edit-hashtags').value = v.hashtags;
      if (v.cta) document.getElementById('edit-cta').value = v.cta;
      box.querySelectorAll('.cv-card').forEach((x) => x.classList.toggle('sel', x === c));
      toast('Cargada en el formulario — dale a Guardar si te convence', 'ok');
    }));
  } catch (e) {
    box.innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  } finally { btn.disabled = false; btn.innerHTML = original; }
}
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
      ? logos.map((l) => `<div class="logo-thumb"><img src="${esc(l.url)}" loading="lazy" alt="logo" /><button class="del" onclick="deleteRef(${l.id})">${icon('x')}</button></div>`).join('')
      : '<span class="hint" style="margin:0;">Todavía no subiste ningún logo.</span>';

    document.getElementById('ref-grid').innerHTML = images.map((r) => `
      <div class="ref-thumb"><img src="${esc(r.url)}" loading="lazy" alt="" onerror="this.parentNode.style.opacity=.3" />
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
    loadCompanyInfo();
  } catch (e) { toast(e.message, 'err'); }
}

/** Datos verificados de la empresa (leídos de la web oficial). */
async function loadCompanyInfo() {
  const el = document.getElementById('company-facts');
  if (!el) return;
  try {
    const d = await api('/api/company-info');
    if (!d.facts_summary) {
      el.innerHTML = '<p class="hint" style="margin:12px 0 0;">Todavía no se leyeron los datos de la web. Tocá “Actualizar datos de la web ahora”.</p>';
      return;
    }
    const last = d.updated_at
      ? new Date(d.updated_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    const facts = String(d.facts_summary).split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
    const noData = Array.isArray(d.no_data) ? d.no_data : [];
    el.innerHTML = `<div class="voice-out" style="margin-top:12px;">
        ${last ? `<div style="margin-bottom:8px;"><b>Última lectura:</b> ${esc(last)}</div>` : ''}
        <ul style="margin:0; padding-left:18px; line-height:1.6;">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        ${noData.length ? `<div style="margin-top:10px; color:var(--muted); font-size:12px;"><b>No figura en la web (la IA NO lo inventa):</b> ${noData.map(esc).join(', ')}.</div>` : ''}
      </div>`;
  } catch (e) { el.innerHTML = `<p class="hint" style="margin:12px 0 0; color:var(--muted);">No pude cargar los datos: ${esc(e.message)}</p>`; }
}

async function syncCompanyInfo() {
  const btn = document.getElementById('company-sync-btn');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Leyendo la web… (~20-40s)`;
  try {
    const d = await api('/api/company-info/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    toast(`Datos actualizados: ${d.facts_count} dato(s) de ${d.pages_read}/${d.pages_total} página(s)`, 'ok');
    loadCompanyInfo();
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.innerHTML = original; }
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
    // Tope diario: cuánto va gastado HOY contra el techo (al llegar, sigue con plantilla gratis).
    const budget = u.daily_budget_usd
      ? `<div class="stat"><b style="${u.budget_reached ? 'color:var(--orange,#ff6b1a);' : ''}">${fmt(u.today_usd || 0)} / ${fmt(u.daily_budget_usd)}</b><span>Gasto de hoy vs tope diario${u.budget_reached ? ' — tope alcanzado: hoy sale con plantilla' : ''}</span></div>`
      : '';
    el.innerHTML = `
      <div class="stat"><b>${u.images}</b><span>Imágenes IA este mes</span></div>
      <div class="stat"><b>${fmt(u.usd)}</b><span>Gasto estimado (${esc(u.month)})</span></div>
      <div class="stat"><b>${u.projection === null ? '—' : fmt(u.projection)}</b><span>Proyección a fin de mes</span></div>
      ${budget}
      <div class="stat"><b>${u.enabled ? 'ON' : 'OFF'}</b><span>Imágenes IA (AI_IMAGES)</span></div>`;
  } catch (_) { el.innerHTML = ''; }
}

/* Lecciones aprendidas (memoria de errores): errores ya cometidos — detectados por el
   QA o marcados por el usuario — que el sistema ahora evita en cada pieza nueva. */
async function loadLessons() {
  const el = document.getElementById('lessons-panel');
  if (!el) return;
  try {
    const { lessons } = await api('/api/lessons');
    if (!lessons || !lessons.length) { el.innerHTML = ''; return; }
    const SRC = {
      lint: 'QA de copy', factual: 'auditoría factual', image: 'QA de imagen',
      render: 'QA visual', user_edit: 'corrección tuya', user_discard: 'descarte tuyo',
    };
    el.innerHTML = `<div class="panel" style="margin-bottom:20px;">
      <h3>Lecciones aprendidas (memoria de errores)</h3>
      <p class="hint">Errores que el sistema ya cometió y ahora evita en cada pieza nueva. Vienen del control de calidad automático y de tus correcciones/descartes. Apagá las que ya no apliquen.</p>
      ${lessons.slice(0, 30).map((l) => `
        <div class="prod-row" style="${l.active ? '' : 'opacity:.45;'}">
          <div class="prod-info"><div class="prod-name" style="font-weight:500;">${esc(l.lesson)}</div>
            <div class="prod-sub">${esc(SRC[l.source] || l.source)} · ${esc(l.scope)}${l.times_seen > 1 ? ` · pasó ${l.times_seen} veces` : ''}</div></div>
          <button class="btn-discard btn-sm" onclick="toggleLesson(${Number(l.id)}, ${l.active ? 'false' : 'true'})">${l.active ? 'Apagar' : 'Reactivar'}</button>
        </div>`).join('')}
    </div>`;
  } catch (_) { el.innerHTML = ''; }
}

/**
 * Calidad de las imágenes: elegir el modelo desde acá (antes era una variable de
 * entorno y había que redeployar). El precio por pieza cambia según cuál elijas,
 * por eso vive en la pestaña de Costos.
 */
async function loadImageModel() {
  const el = document.getElementById('image-model-panel');
  if (!el) return;
  try {
    const d = await api('/api/settings/image-model');
    el.innerHTML = `<div class="panel" style="margin-bottom:20px;">
      <h3>Calidad de las imágenes generadas</h3>
      <p class="hint">Con qué modelo se generan las escenas de las piezas. Más calidad = más costo por pieza. El cambio aplica desde la próxima generación, sin redeploy.</p>
      <div class="q-cards" id="im-cards">
        ${d.options.map((o) => `<div class="q-card ${o.id === d.current ? 'sel' : ''}" data-model="${esc(o.id)}">
          <b>${esc(o.label)}</b>
          <span class="q-price">US$ ${o.usd.toFixed(3)}</span>
          <span class="q-desc">${esc(o.desc)}</span>
        </div>`).join('')}
      </div>
      <p class="hint" style="margin:10px 0 0;">Precio por imagen. Una pieza simple usa 1; un carrusel, entre 1 y 3.</p>
    </div>`;
    el.querySelectorAll('[data-model]').forEach((c) => c.addEventListener('click', async () => {
      if (c.classList.contains('sel')) return;
      try {
        await api('/api/settings/image-model', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: c.dataset.model }),
        });
        toast('Listo: las próximas piezas usan ese modelo', 'ok');
        loadImageModel();
        loadConfig();
      } catch (e) { toast(e.message, 'err'); }
    }));
  } catch (_) { el.innerHTML = ''; }
}

async function toggleLesson(id, active) {
  try {
    await api(`/api/lessons/${id}/toggle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    loadLessons();
  } catch (e) { toast(e.message, 'err'); }
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

/* Vistas de producto (GA) desglosadas Mayorista vs Minorista. */
async function loadSegmentViews() {
  const el = document.getElementById('segment-views');
  if (!el) return;
  try {
    const s = await api('/api/analytics/views-by-segment');
    if (!s.enabled) { el.innerHTML = ''; return; }
    const src = (label) => `<span class="src-tag">${esc(label)}</span>`;
    const row = (p) => `
      <div class="prod-row">
        <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
          <div class="prod-sub">${p.sales_30d ? `${p.sales_30d} vendido(s) ${src('Tiendanube')}` : 'sin ventas registradas'}</div></div>
        <div class="prod-metric"><b>${p.views}</b><span>vistas · ${src('GA')}</span></div>
      </div>`;
    el.innerHTML = `
      <div class="panel">
        <h3>Vistas por sección: Mayorista vs Minorista</h3>
        <p class="hint">Mayorista = productos sin precio público ("Consultar precio") en Tiendanube. Sirve para ver si el público mira más lo corporativo o lo minorista, y ajustar cuánto contenido de cada uno conviene generar.</p>
        <div class="prod-totals" style="margin-bottom:14px;">
          <div class="stat"><b>${s.minorista.views.toLocaleString('es-AR')} · ${s.minorista.pct}%</b><span>Vistas Minorista (${s.days} días) ${src('GA')}</span></div>
          <div class="stat"><b>${s.mayorista.views.toLocaleString('es-AR')} · ${s.mayorista.pct}%</b><span>Vistas Mayorista (${s.days} días) ${src('GA')}</span></div>
        </div>
        ${s.minorista.top.length ? `<h4 style="margin:16px 0 6px; font-size:14px; color:var(--muted);">Más vistos · Minorista</h4>${s.minorista.top.slice(0, 5).map(row).join('')}` : ''}
        ${s.mayorista.top.length ? `<h4 style="margin:16px 0 6px; font-size:14px; color:var(--muted);">Más vistos · Mayorista</h4>${s.mayorista.top.slice(0, 5).map(row).join('')}` : ''}
      </div>`;
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
  loadSegmentViews();
  loadAdsSummary();
  loadConversionAudit();
  loadAttribution();
  loadAiUsage();
  loadImageModel();
  loadLessons();
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

/* ============ PAUTA: Meta Ads vs Google Ads ============
 * La pregunta que contesta esta pantalla es una sola: ¿a dónde conviene mover
 * la plata? Por eso todo está medido con la MISMA vara (Analytics) y lo que
 * cada plataforma se atribuye a sí misma se muestra aparte, nunca mezclado.
 */
const adsMoney = (n) => (n === null || n === undefined ? '—' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`);
const adsCount = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)).toLocaleString('es-AR'));
const adsRoas = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(2).replace('.', ',')}x`);

/** Semáforo del ROAS: por debajo de 1 la campaña se está comiendo la plata. */
function roasClass(r) {
  if (r === null || r === undefined) return 'nd';
  if (r >= 3) return 'top';
  if (r >= 1.5) return 'ok';
  if (r >= 1) return 'mid';
  return 'bad';
}

let adsPerfData = null;

async function loadAdsPerformance(fresh = false) {
  const host = document.getElementById('ads-perf');
  if (!host) return;
  const days = Number((document.getElementById('ads-days') || {}).value) || 30;
  host.innerHTML = skeleton('rows', 4);
  try {
    const d = await api(`/api/ads/performance?days=${days}${fresh === true ? '&fresh=1' : ''}`);
    if (!d.ok) { host.innerHTML = `<div class="panel"><p class="hint" style="margin:0;">${esc(d.error)}</p></div>`; return; }
    adsPerfData = d;
    renderAdsPerformance(d);
  } catch (e) {
    host.innerHTML = `<div class="panel"><p class="hint" style="margin:0;">No pude traer los datos de pauta: ${esc(e.message)}</p></div>`;
  }
  loadRecentLeads();
}

/**
 * Consultas de WhatsApp recientes con su campaña de origen.
 * Analytics dice CUÁNTAS consultas trajo cada campaña; esto dice CUÁL fue cada
 * una. Como el mensaje del cliente ya no lleva ningún código escrito, la forma
 * de identificar un chat es por la hora: mirás a qué hora te entró el mensaje y
 * lo buscás acá. Con una o dos consultas por día no hay confusión posible.
 */
async function loadRecentLeads() {
  const host = document.getElementById('ads-leads');
  if (!host) return;
  try {
    const d = await api('/api/leads/recent?days=14');
    if (!d.items || !d.items.length) {
      host.innerHTML = `<div class="panel">
        ${panelHead('Consultas de WhatsApp por campaña',
    'Cada vez que alguien toca WhatsApp en la tienda queda anotado con la campaña de la que vino.')}
        <p class="hint" style="margin:0;">Todavía no se registró ninguna consulta. Empiezan a aparecer acá en cuanto alguien toque el botón de WhatsApp en la tienda.</p>
      </div>`;
      return;
    }
    const fecha = (iso) => {
      const dt = new Date(iso);
      return dt.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };
    const origen = (i) => {
      if (!i.campaign && !i.source) return '<span class="lead-org">Directo / orgánico</span>';
      const canal = /google/i.test(i.source || '') ? 'google' : (/meta|fb|ig/i.test(i.source || '') ? 'meta' : '');
      return `<span class="ch-dot ${canal}"></span>${esc(i.campaign || i.source)}`;
    };
    host.innerHTML = `<div class="panel">
      ${panelHead('Consultas de WhatsApp por campaña',
    'Cada vez que alguien toca WhatsApp en la tienda queda anotado con la campaña de la que vino. Cuando te entra un mensaje, buscá la hora en esta lista y ya sabés qué campaña te lo trajo, sin escribirle ningún código al cliente.')}
      <div class="ads-table-wrap">
        <table class="ads-table">
          <thead><tr><th>Cuándo</th><th>Vino de</th><th>Tipo</th><th>Estaba mirando</th><th>Botón</th></tr></thead>
          <tbody>
            ${d.items.slice(0, 40).map((i) => `<tr>
              <td class="c-name">${esc(fecha(i.created_at))}</td>
              <td>${origen(i)}</td>
              <td><span class="verd ${i.lead_type === 'mayorista' ? 'escalar' : 'mantener'}">${esc(i.lead_type || '—')}</span></td>
              <td class="c-type">${esc(i.item_name || i.page_path || '—')}</td>
              <td class="c-type">${esc(String(i.contact_channel || '').replace(/^whatsapp_/, '').replace(/_/g, ' '))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint" style="margin:12px 0 0;">Últimos 14 días · ${d.items.length} consulta(s).</p>
    </div>`;
  } catch (e) {
    host.innerHTML = '';
  }
}

/** Placeholder para una sub-pestaña sin datos, para no dejarla en blanco. */
function vacio(msg) {
  return `<div class="panel"><p class="hint" style="margin:0;">${icon('info')} ${esc(msg)}</p></div>`;
}

function renderAdsPerformance(d) {
  const host = document.getElementById('ads-perf');
  const t = d.totales;
  const resultadoPos = t.resultado >= 0;

  /* --- 1. El resumen de plata: lo que entra contra lo que sale --- */
  const resumen = `
    <div class="panel ads-hero">
      <div class="ads-kpis">
        <div class="ads-kpi"><span>Invertido en pauta</span><b>${adsMoney(t.gasto)}</b><i>últimos ${d.days} días</i></div>
        <div class="ads-kpi"><span>Ventas atribuidas</span><b>${adsMoney(t.ingresos)}</b><i>${adsCount(t.compras)} compras</i></div>
        <div class="ads-kpi ${roasClass(t.roas)}"><span>ROAS</span><b>${adsRoas(t.roas)}</b><i>vuelve por cada $1</i></div>
        <div class="ads-kpi ${resultadoPos ? 'top' : 'bad'}"><span>Diferencia</span><b>${adsMoney(t.resultado)}</b><i>facturación menos pauta</i></div>
        <div class="ads-kpi"><span>Costo por venta</span><b>${adsMoney(t.cac)}</b><i>promedio de los dos</i></div>
      </div>
      <p class="hint" style="margin:14px 0 0;">${icon('info')} Además, <b>${adsMoney(d.organico.ingresos)}</b> de facturación (${d.organico.pctIngresos}% del total del sitio) llegó <b>sin pasar por la pauta</b>: orgánico, directo y referidos.</p>
    </div>`;

  /* --- 2. Canal contra canal, con la misma vara --- */
  const canalCard = (c) => `
    <div class="panel ads-channel ${c.id}">
      <div class="ac-head">
        <div><h3 style="margin:0;">${esc(c.nombre)}</h3><p class="hint" style="margin:2px 0 0;">${esc(c.detalle)}</p></div>
        <div class="ac-roas ${roasClass(c.roas)}"><b>${adsRoas(c.roas)}</b><span>ROAS</span></div>
      </div>
      <div class="ac-bar"><i style="width:${c.pctGasto}%"></i></div>
      <p class="hint" style="margin:6px 0 14px;">Se lleva el <b>${c.pctGasto}%</b> del presupuesto (${adsMoney(c.gasto)})</p>
      <div class="ac-grid">
        <div><span>Ventas</span><b>${adsMoney(c.ingresos)}</b></div>
        <div><span>Compras</span><b>${adsCount(c.compras)}</b></div>
        <div><span>Costo por venta</span><b>${adsMoney(c.cac)}</b></div>
        <div><span>Visitas al sitio</span><b>${adsCount(c.sesiones)}</b></div>
        <div><span>Costo por clic</span><b>${adsMoney(c.cpc)}</b></div>
        <div><span>Compran</span><b>${c.convPct !== null && c.convPct !== undefined ? `${String(c.convPct).replace('.', ',')}%` : '—'}</b></div>
      </div>
      ${c.propio ? `<div class="ac-self">
        <b>Lo que ${esc(c.nombre)} dice de sí mismo:</b> ${adsCount(c.propio.compras)} compras · ${adsMoney(c.propio.ingresos)} · ROAS ${adsRoas(c.propio.roas)}${c.propio.mensajes ? ` · ${c.propio.mensajes} charlas de WhatsApp` : ''}.
        <span class="hint" style="display:block;margin-top:4px;">Se atribuye toda venta de alguien que vio un anuncio, aunque haya entrado por Google. El de arriba (${adsRoas(c.roas)}) es el comparable.</span>
      </div>` : ''}
      ${c.consultas ? `<p class="hint" style="margin:10px 0 0;">${c.consultas} sesión(es) abrieron una consulta de WhatsApp o el cotizador (mayorista).</p>` : ''}
    </div>`;

  const canales = `<div class="grid-2">${d.canales.map(canalCard).join('')}</div>`;

  /* --- 2b. LOS DOS NEGOCIOS: la tienda mayorista no tiene carrito --- */
  const SEG_LABEL = {
    minorista: { t: 'Van a la tienda (se compra online)', d: 'Se miden por ventas y ROAS.' },
    mayorista: { t: 'Van a la sección mayorista', d: 'Ahí no hay carrito: la conversión es la consulta, no la compra.' },
    mixta: { t: 'Mixtas', d: 'Mandan tráfico a las dos secciones.' },
  };
  const lv = d.leadValue || { valor: 0 };
  const segmentos = (d.porSegmento && d.porSegmento.length > 1) ? `
    <div class="panel">
      ${panelHead('Tus dos negocios, medidos como corresponde',
    'En /mayorista los productos dicen "Consultar precio" y no tienen carrito: por definición nunca van a generar una compra online. Esas campañas se miden por consultas y por lo que cuesta cada una.')}
      <div class="grid-2">
        ${d.porSegmento.map((s) => `
          <div class="seg-card ${s.segmento}">
            <div class="seg-head"><b>${esc(SEG_LABEL[s.segmento].t)}</b><span class="seg-n">${s.campanas} campaña${s.campanas > 1 ? 's' : ''}</span></div>
            <p class="hint" style="margin:0 0 12px;">${esc(SEG_LABEL[s.segmento].d)}</p>
            <div class="ac-grid">
              <div><span>Invertido</span><b>${adsMoney(s.gasto)}</b></div>
              <div><span>${s.pctGasto}% del total</span><b>${adsCount(s.sesiones)} visitas</b></div>
              ${s.segmento === 'mayorista'
    ? `<div><span>Consultas</span><b>${adsCount(s.consultas)}</b></div>
                 <div><span>Costo por consulta</span><b class="${s.cpl && s.cpl > 40000 ? 'neg' : ''}">${adsMoney(s.cpl)}</b></div>`
    : `<div><span>Ventas</span><b>${adsMoney(s.ingresos)}</b></div>
                 <div><span>ROAS</span><b class="roas ${roasClass(s.roas)}">${adsRoas(s.roas)}</b></div>
                 <div><span>Compras</span><b>${adsCount(s.compras)}</b></div>
                 <div><span>Consultas</span><b>${adsCount(s.consultas)}</b></div>`}
            </div>
          </div>`).join('')}
      </div>
      <div class="lead-value">
        <div>
          <b>${lv.valor ? `Hoy una consulta mayorista vale ${adsMoney(lv.valor)}` : '¿Cuánto vale para vos una consulta mayorista?'}</b>
          <p class="hint" style="margin:4px 0 0;">${lv.valor
    ? 'Con ese número las campañas mayoristas se comparan contra las de venta en la misma escala.'
    : 'Sin este dato no hay forma de saber si una consulta a $16.000 es buen negocio o no. Poné tu ticket mayorista promedio y cada cuántas consultas cerrás una.'}</p>
        </div>
        <div class="lv-form">
          <label>Ticket mayorista promedio<input class="input" id="lv-ticket" type="number" placeholder="350000" value="${lv.ticket || ''}"/></label>
          <label>De cada 100 consultas, ¿cuántas cierran?<input class="input" id="lv-cierre" type="number" placeholder="20" value="${lv.cierrePct || ''}"/></label>
          <button class="btn-primary btn-sm" id="lv-save">Guardar</button>
        </div>
      </div>
    </div>` : '';

  /* --- 3. Dónde va la plata vs. de dónde vuelve --- */
  const maxGasto = Math.max(...d.canales.map((c) => c.gasto), 1);
  const maxIng = Math.max(...d.canales.map((c) => c.ingresos), 1);
  const reparto = `
    <div class="panel">
      ${panelHead('Dónde va la plata y de dónde vuelve',
    'Si la barra naranja (lo invertido) es más larga que la verde (lo que volvió), ese canal consume más de lo que devuelve.')}
      ${d.canales.map((c) => `
        <div class="ads-split">
          <div class="as-name">${esc(c.nombre)}</div>
          <div class="as-bars">
            <div class="as-row"><span>Invertido</span><div class="as-bar spend"><i style="width:${(c.gasto / maxGasto) * 100}%"></i></div><b>${adsMoney(c.gasto)}</b></div>
            <div class="as-row"><span>Volvió</span><div class="as-bar rev"><i style="width:${(c.ingresos / maxIng) * 100}%"></i></div><b>${adsMoney(c.ingresos)}</b></div>
          </div>
        </div>`).join('')}
    </div>`;

  /* --- 4. Qué TIPO de campaña rinde mejor --- */
  const maxTipo = Math.max(...d.tipos.map((x) => x.gasto), 1);
  const tipos = `
    <div class="panel">
      ${panelHead('Qué tipo de campaña rinde mejor',
    'Ordenado por cuánta plata se lleva cada tipo. El ROAS de la derecha dice si esa plata vuelve.')}
      <div class="ads-types">
        ${d.tipos.map((x) => `
          <div class="at-row">
            <div class="at-name">${esc(x.tipo)}<span class="hint"> · ${x.campanas} campaña${x.campanas > 1 ? 's' : ''}</span></div>
            <div class="at-bar"><i class="${roasClass(x.roas)}" style="width:${Math.max((x.gasto / maxTipo) * 100, 2)}%"></i></div>
            <div class="at-spend">${adsMoney(x.gasto)}<span>${x.pctGasto}% del total</span></div>
            <div class="at-roas ${roasClass(x.roas)}">${adsRoas(x.roas)}</div>
            <div class="at-cac">${x.cac ? `${adsMoney(x.cac)}<span>por venta</span>` : '<span>sin ventas</span>'}</div>
          </div>`).join('')}
      </div>
    </div>`;

  /* --- 5. Campaña por campaña, con veredicto --- */
  const VERD = { escalar: 'Escalar', mantener: 'Mantener', ajustar: 'Revisar', revisar: 'Revisar', apagar: 'Apagar', 'sin-datos': 'Sin datos' };
  const campanas = `
    <div class="panel">
      ${panelHead('Campaña por campaña',
    'Las campañas marcadas Mayorista mandan a la sección sin carrito: ahí el ROAS no aplica y se juzgan por consultas y por lo que cuesta cada una. "Apagar" sólo aparece cuando una campaña no trajo ni ventas ni consultas.')}
      <div class="ads-table-wrap">
        <table class="ads-table">
          <thead><tr>
            <th>Campaña</th><th>Destino</th><th class="r">Invertido</th><th class="r">Visitas</th>
            <th class="r">Compras</th><th class="r">Ventas</th><th class="r">ROAS</th>
            <th class="r">Consultas</th><th class="r">c/consulta</th><th>Qué hacer</th>
          </tr></thead>
          <tbody>
            ${d.campanas.map((c) => `<tr>
              <td class="c-name"><span class="ch-dot ${c.canal}"></span>${esc(c.campana)}${c.frecuencia && c.frecuencia >= 3 ? ` <span class="badge qa-warn" title="Cada persona vio el anuncio ${String(c.frecuencia).replace('.', ',')} veces: pasando de 3 se quema la audiencia">frec. ${String(c.frecuencia).replace('.', ',')}</span>` : ''}</td>
              <td class="c-type"><span class="seg-tag ${c.segmento}" title="${c.segmento === 'mayorista' ? 'Manda a /mayorista: ahí no hay carrito, se mide por consultas' : c.segmento === 'mixta' ? `Manda tráfico a las dos secciones (${c.pctMayorista}% a mayorista)` : 'Manda a la tienda: se mide por ventas'}">${c.segmento === 'mayorista' ? 'Mayorista' : c.segmento === 'mixta' ? 'Mixta' : 'Tienda'}</span>
                <span class="c-type-sub">${esc(String(c.tipo).replace(/^(Meta|Google) · /, ''))}</span></td>
              <td class="r">${adsMoney(c.gasto)}</td>
              <td class="r">${adsCount(c.sesiones)}</td>
              <td class="r">${adsCount(c.compras)}</td>
              <td class="r">${adsMoney(c.ingresos)}${c.ingresosEstimados ? '<span class="est" title="Repartido según el gasto: Analytics no identifica esta campaña">~</span>' : ''}</td>
              <td class="r roas ${c.segmento === 'mayorista' ? 'nd' : roasClass(c.roas)}">${c.segmento === 'mayorista' ? '<span class="na" title="En la sección mayorista no hay carrito: el ROAS no aplica">n/a</span>' : adsRoas(c.roas)}</td>
              <td class="r">${c.consultas ? adsCount(c.consultas) : '—'}</td>
              <td class="r">${adsMoney(c.cpl)}</td>
              <td><span class="verd ${c.veredicto.nivel}" title="${esc(c.veredicto.texto)}">${VERD[c.veredicto.nivel] || c.veredicto.nivel}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  /* --- 6. Embudo comparado --- */
  const embudoCol = (e) => {
    if (!e || !e.steps || !e.steps.length) return '';
    const top = e.steps[0].valor || 1;
    return `<div class="fn-col">
      <div class="fn-title">${esc(e.label)}</div>
      ${e.steps.map((s) => `
        <div class="fn-step ${e.peor && e.peor.key === s.key ? 'fn-worst' : ''}">
          <div class="fn-head"><span class="fn-label">${esc(s.label)}</span>
            <span class="fn-val"><b>${adsCount(s.valor)}</b> ${s.pctDelAnterior !== null ? (s.noSecuencial
      ? `<span class="fn-tag" title="No es una fuga: se puede llegar acá sin pasar por el paso anterior">atajo</span>`
      : `<span class="fn-tag ${s.pctDelAnterior < 10 ? 'bad' : ''}">${String(s.pctDelAnterior).replace('.', ',')}%</span>`) : ''}</span></div>
          <div class="fn-bar"><i style="width:${Math.min((s.valor / top) * 100, 100)}%"></i></div>
        </div>`).join('')}
      ${e.peor ? `<div class="fn-foot">Peor fuga: <b>${esc(e.peor.label)}</b> — se cae el ${String(e.peor.caida).replace('.', ',')}% de los que venían.</div>` : ''}
    </div>`;
  };
  const embudos = `
    <div class="panel">
      ${panelHead('El recorrido de cada canal',
    'De los que tocan el anuncio, cuántos llegan, agregan al carrito, arrancan el checkout y compran. Sirve para saber si el problema es el anuncio o el sitio.')}
      <div class="fn-grid">${embudoCol(d.embudos.meta)}${embudoCol(d.embudos.google)}</div>
    </div>`;

  const embudoMay = d.embudoMayorista ? `
    <div class="panel">
      ${panelHead('El recorrido del negocio mayorista',
    'Este embudo NO termina en una compra (en /mayorista no hay carrito) sino en una consulta.')}
      ${d.embudoMayorista.cpl ? `<p class="hint">Hoy cada consulta sale <b>${adsMoney(d.embudoMayorista.cpl)}</b>.</p>` : ''}
      <div class="fn-grid">${embudoCol(d.embudoMayorista)}</div>
    </div>` : '';

  /* --- 7. La cuenta de la reasignación --- */
  const r = d.reasignacion;
  const reasignacion = r ? `
    <div class="panel ads-move">
      ${panelHead(`${icon('bolt')} Si movés el presupuesto`,
    'Cuenta del sistema, todavía sin IA: sacarle a lo que pierde plata y darle a lo que rinde, sin cambiar el presupuesto total.')}
      <div class="mv-head">
        <div class="mv-amount"><b>${adsMoney(r.monto)}</b><span>a mover — la mitad de lo que hoy gastan las campañas en rojo</span></div>
        <div class="mv-arrow">→</div>
        <div class="mv-gain"><b>+${adsMoney(r.ingresosExtra)}</b><span>de facturación estimada, con el mismo gasto total</span></div>
      </div>
      <div class="grid-2" style="margin-top:16px;">
        <div><h4 class="mv-h">Sacar de acá <span class="hint">· ROAS ${adsRoas(r.roasOrigen)}</span></h4>
          ${r.desde.map((c) => `<div class="mv-row bad"><span class="ch-dot ${c.canal}"></span><span class="mv-nm">${esc(c.campana)}</span><b>${adsMoney(c.gasto)}</b></div>`).join('')}</div>
        <div><h4 class="mv-h">Poner acá <span class="hint">· ROAS ${adsRoas(r.roasDestino)}</span></h4>
          ${r.hacia.map((c) => `<div class="mv-row good"><span class="ch-dot ${c.canal}"></span><span class="mv-nm">${esc(c.campana)}</span><b>${adsRoas(c.roas)}</b></div>`).join('')}</div>
      </div>
      <p class="hint" style="margin:14px 0 0;">${icon('alert')} ${esc(r.supuesto)} Y son <b>ventas</b>, no ganancia neta: falta descontar el costo de la mercadería.</p>
    </div>` : '';

  /* --- 8. Diagnóstico con IA --- */
  const ia = `
    <div class="panel">
      ${panelHead(`${icon('sparkles')} Diagnóstico y recomendaciones con IA`,
    'Lee todos los números de las otras pestañas y arma el plan: qué tocar, cuánta plata mover y qué esperar.')}
      <div class="field">
        <label>Contexto que los números no saben <span class="hint" style="font-weight:400;">(opcional)</span></label>
        <textarea class="input" id="ads-ai-ctx" rows="2" placeholder="Ej: la campaña de calzados apunta a un producto que quedamos sin stock; en julio subimos el presupuesto de Google"></textarea>
      </div>
      <button class="btn-primary" id="ads-ai-btn">${icon('sparkles')} Analizar la pauta con IA ${costTag('Gratis')}</button>
      <div id="ads-ai-out"></div>
    </div>`;

  const avisos = (d.avisos && d.avisos.length) ? `
    <div class="panel">
      ${panelHead('Qué tener en cuenta de la medición',
    'Límites de la medición que conviene conocer antes de tomar decisiones con estos números.')}
      <ul class="an-warn-list">${d.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <p class="hint" style="margin:10px 0 0;">${esc(d.metodologia)}</p>
    </div>` : `<div class="panel"><p class="hint" style="margin:0;">${icon('info')} ${esc(d.metodologia)}</p></div>`;

  /* --- Armado final: sub-pestañas en vez de 12 paneles apilados ---------------
     Antes esto era un scroll de 12 paneles seguidos: para llegar a la tabla de
     campañas había que pasar por el reparto, los tipos y los embudos. Ahora cada
     grupo responde una pregunta distinta y se entra directo a la que interesa.
     Los avisos de metodología van al final de "Resumen", que es donde se leen
     los totales que esos avisos matizan. -------------------------------------- */
  const panes = [
    { id: 'resumen', label: 'Resumen', html: resumen + canales + reparto + avisos },
    { id: 'negocios', label: 'Mayorista vs. tienda', html: segmentos || vacio('Todavía no hay campañas suficientes para separar los dos negocios.') },
    { id: 'campanas', label: 'Campañas', html: tipos + campanas },
    { id: 'embudos', label: 'Embudos', html: embudos + embudoMay },
    { id: 'plan', label: 'Qué hacer', html: (reasignacion || '') + ia },
    // La tabla de consultas la llena loadRecentLeads() DESPUÉS de este render.
    // Vive acá adentro y no suelta abajo de todo como antes, donde sumaba casi
    // 3.000 px de scroll a una pantalla que ya era larga.
    { id: 'consultas', label: 'Consultas', html: '<div id="ads-leads"></div>' },
  ];

  host.innerHTML = `
    <div class="mt-tabs ads-tabs">
      ${panes.map((p, i) => `<button class="mtab ${i === 0 ? 'active' : ''}" data-adspane="${p.id}">${p.label}</button>`).join('')}
    </div>
    <div class="sub-panes">
      ${panes.map((p, i) => `<div class="sub-pane ${i === 0 ? '' : 'hidden'}" id="ads-pane-${p.id}">${p.html}</div>`).join('')}
    </div>`;

  host.querySelectorAll('[data-adspane]').forEach((b) => {
    b.addEventListener('click', () => {
      host.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('active', x === b));
      host.querySelectorAll('.sub-pane').forEach((x) => x.classList.toggle('hidden', x.id !== `ads-pane-${b.dataset.adspane}`));
    });
  });

  hydrateIcons(host);
  const btn = host.querySelector('#ads-ai-btn');
  if (btn) btn.addEventListener('click', () => runAdsAiAnalysis(btn, d.days));
  const lvBtn = host.querySelector('#lv-save');
  if (lvBtn) lvBtn.addEventListener('click', async () => {
    const ticket = Number(host.querySelector('#lv-ticket').value) || 0;
    const cierrePct = Number(host.querySelector('#lv-cierre').value) || 0;
    if (!ticket || !cierrePct) { toast('Cargá el ticket y el porcentaje de cierre', 'err'); return; }
    lvBtn.disabled = true;
    try {
      const r = await api('/api/ads/lead-value', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, cierrePct }),
      });
      toast(`Listo: cada consulta vale ${adsMoney(r.valor)}`, 'ok');
      loadAdsPerformance(true);
    } catch (e) { toast(e.message, 'err'); lvBtn.disabled = false; }
  });
}

async function runAdsAiAnalysis(btn, days) {
  const out = document.getElementById('ads-ai-out');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${icon('refresh', 'spin')} Analizando la inversión…`;
  out.innerHTML = '';
  try {
    const a = await api('/api/ads/performance/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, contexto: document.getElementById('ads-ai-ctx').value }),
    });
    const recs = (a.recomendaciones || []).slice().sort((x, y) => (x.prioridad || 9) - (y.prioridad || 9));
    out.innerHTML = `
      <div class="ads-ai">
        <div class="ai-titular">${esc(a.titular || '')}</div>
        <p class="ai-p">${esc(a.diagnostico || '')}</p>
        ${a.donde_esta_la_plata ? `<p class="ai-p"><b>Dónde está la plata:</b> ${esc(a.donde_esta_la_plata)}</p>` : ''}
        ${a.tipo_de_campana_que_mejor_rinde ? `<div class="ai-best">${icon('check')}<span><b>El tipo de campaña que mejor rinde:</b> ${esc(a.tipo_de_campana_que_mejor_rinde)}</span></div>` : ''}
        ${(a.hallazgos || []).length ? `<h4 class="ai-h">Lo que encontró</h4>
          ${a.hallazgos.map((h) => `<div class="ai-find ${esc(h.gravedad || 'media')}">
            <b>${esc(h.titulo)}</b><span>${esc(h.detalle)}</span></div>`).join('')}` : ''}
        ${recs.length ? `<h4 class="ai-h">Qué hacer, por orden de impacto</h4>
          ${recs.map((x, i) => `<div class="ai-rec">
            <div class="ai-rec-n">${i + 1}</div>
            <div><b>${esc(x.accion)}</b>
              <div class="ai-rec-where">${esc(x.donde || '')}${x.monto ? ` · <b>${esc(x.monto)}</b>` : ''}</div>
              <div class="ai-rec-why">${esc(x.por_que)}</div>
              <div class="ai-rec-imp">${icon('bolt')} ${esc(x.impacto_esperado)}</div>
            </div></div>`).join('')}` : ''}
        ${(a.riesgos || []).length ? `<h4 class="ai-h">Riesgos</h4><ul class="an-warn-list">${a.riesgos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(a.que_medir_mejor || []).length ? `<h4 class="ai-h">Qué falta medir para decidir mejor</h4><ul class="an-warn-list">${a.que_medir_mejor.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>`;
    hydrateIcons(out);
  } catch (e) {
    out.innerHTML = `<p class="hint">No pude analizar: ${esc(e.message)}</p>`;
  } finally { btn.disabled = false; btn.innerHTML = original; }
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

/* ============ ANÁLISIS WEB (secciones del sitio) ============
 * Radiografía de una ruta del sitio comparando dos períodos. Existe porque el panel
 * mostraba totales y no dejaba contestar la pregunta del negocio: "/mayorista tuvo el
 * doble de visitas que en mayo y menos consultas, ¿por qué?". */

let anReport = null;      // último informe cargado (para exportar sin volver a pedirlo)
let anAnalysis = null;    // último diagnóstico de la IA

const anEl = (id) => document.getElementById(id);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthStart = (y, m) => new Date(y, m, 1);
const monthEnd = (y, m) => new Date(y, m + 1, 0);

/** Rellena las 4 fechas según el preset elegido. */
function applyAnalysisPreset() {
  const preset = anEl('an-preset').value;
  const today = new Date();
  const set = (from, to, cmpFrom, cmpTo) => {
    anEl('an-from').value = ymd(from); anEl('an-to').value = ymd(to);
    anEl('an-cmp-from').value = ymd(cmpFrom); anEl('an-cmp-to').value = ymd(cmpTo);
  };
  const y = today.getFullYear();
  const m = today.getMonth();
  if (preset === 'month-prev') set(monthStart(y, m - 1), monthEnd(y, m - 1), monthStart(y, m - 2), monthEnd(y, m - 2));
  else if (preset === 'jul-may') set(monthStart(y, 6), monthEnd(y, 6), monthStart(y, 4), monthEnd(y, 4));
  else if (preset === 'last30') {
    const to = new Date(today); to.setDate(to.getDate() - 1);
    const from = new Date(to); from.setDate(from.getDate() - 29);
    const cmpTo = new Date(from); cmpTo.setDate(cmpTo.getDate() - 1);
    const cmpFrom = new Date(cmpTo); cmpFrom.setDate(cmpFrom.getDate() - 29);
    set(from, to, cmpFrom, cmpTo);
  } else if (preset === 'year') set(monthStart(y, m - 1), monthEnd(y, m - 1), monthStart(y - 1, m - 1), monthEnd(y - 1, m - 1));
}

let anReady = false;
function setupAnalysis() {
  if (anReady) return;
  anReady = true;
  anEl('an-preset').addEventListener('change', applyAnalysisPreset);
  ['an-from', 'an-to', 'an-cmp-from', 'an-cmp-to'].forEach((id) =>
    anEl(id).addEventListener('change', () => { anEl('an-preset').value = 'custom'; }));
  applyAnalysisPreset();
  loadSectionAnalysis();
}

/** Parámetros de la consulta, con los nombres de período que se muestran en el informe. */
function analysisParams() {
  const monthName = (a, b) => {
    const d1 = new Date(`${a}T12:00:00`); const d2 = new Date(`${b}T12:00:00`);
    const fmt = (d) => d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    // Un mes calendario completo se nombra por su mes; si no, se muestran las fechas.
    if (d1.getDate() === 1 && d2.getMonth() === d1.getMonth() && d2.getDate() === new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate()) {
      return fmt(d1).replace(/^\w/, (c) => c.toUpperCase());
    }
    return `${d1.toLocaleDateString('es-AR')} a ${d2.toLocaleDateString('es-AR')}`;
  };
  const from = anEl('an-from').value; const to = anEl('an-to').value;
  const cmpFrom = anEl('an-cmp-from').value; const cmpTo = anEl('an-cmp-to').value;
  return {
    prefix: anEl('an-prefix').value.trim() || '/mayorista',
    from, to, cmpFrom, cmpTo,
    label: monthName(from, to), cmpLabel: monthName(cmpFrom, cmpTo),
  };
}

const anQuery = () => new URLSearchParams(analysisParams()).toString();

/** Variación coloreada. `goodIsUp=false` para métricas donde subir es malo (rebote). */
function anDelta(delta, goodIsUp = true) {
  if (delta === null || delta === undefined) return '<span class="an-d new">nuevo</span>';
  if (!delta) return '<span class="an-d flat">=</span>';
  const good = goodIsUp ? delta > 0 : delta < 0;
  return `<span class="an-d ${good ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}%</span>`;
}

const anNum = (v) => (typeof v === 'number' ? v.toLocaleString('es-AR') : v);

function anTable(title, cols, rows, note) {
  if (!rows || !rows.length) return '';
  return `<div class="panel an-panel"><h3>${title}</h3>${note ? `<p class="hint">${esc(note)}</p>` : ''}
    <div class="an-scroll"><table class="insights an-table"><thead><tr>${cols.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

async function loadSectionAnalysis() {
  const out = anEl('an-out');
  const btn = anEl('an-run');
  const p = analysisParams();
  if (!p.from || !p.to || !p.cmpFrom || !p.cmpTo) { toast('Elegí las fechas de los dos períodos', 'err'); return; }
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Consultando Analytics…`;
  out.innerHTML = skeleton('rows', 4);
  try {
    anReport = await api(`/api/analysis/section?${anQuery()}`);
    anAnalysis = null;
    renderSectionAnalysis();
  } catch (e) {
    out.innerHTML = `<div class="panel"><p class="empty">No pude traer el informe: ${esc(e.message)}</p></div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('search')} Ver informe`;
  }
}

function renderSectionAnalysis() {
  const r = anReport;
  if (!r) return;
  const kpis = r.kpis.map((k) => `<div class="an-kpi" title="${esc(k.help || '')}">
      <span class="an-lbl">${esc(k.label)}</span>
      <b>${anNum(k.cur)}${esc(k.unit)}</b>
      <span class="an-prev">antes ${anNum(k.prev)}${esc(k.unit)} ${anDelta(k.delta)}</span>
    </div>`).join('');

  const html = `
    <div class="panel an-panel">
      <h3>${icon('chart')} ${esc(r.prefix)} · ${esc(r.current.label)} vs ${esc(r.previous.label)}</h3>
      <div class="an-kpis">${kpis}</div>
      <!-- Alto FIJO en el contenedor: con maintainAspectRatio:false, un canvas suelto
           crece sin techo hasta dejar la página con miles de píxeles en blanco. -->
      <div style="position:relative; height:260px; margin-top:16px;"><canvas id="an-chart"></canvas></div>
      <p class="hint" style="margin-top:6px;">Barras: sesiones por día en la sección. Línea: consultas al WhatsApp mayorista en todo el sitio.</p>
    </div>

    <div id="an-ai-out"></div>

    ${anTable(`${icon('route')} De dónde viene la gente y cuánto consulta`, [
    { label: 'Fuente / medio', cell: (x) => esc(x.sourceMedium) },
    { label: 'Campaña', cell: (x) => `<span class="an-dim">${esc(x.campaign)}</span>` },
    { label: 'Sesiones', num: true, cell: (x) => `${anNum(x.sessions)} ${anDelta(x.sessionsDelta)}<br><span class="an-dim">antes ${anNum(x.sessionsPrev)}</span>` },
    { label: 'Consultas', num: true, cell: (x) => `${anNum(x.contacts)}<br><span class="an-dim">antes ${anNum(x.contactsPrev)}</span>` },
    { label: 'Tasa', num: true, cell: (x) => `<b>${x.rate}%</b><br><span class="an-dim">antes ${x.ratePrev}%</span>` },
    { label: 'Rebote', num: true, cell: (x) => `${x.bounce}%` },
  ], r.sources, 'Tasa = de cada 100 sesiones de esa fuente, cuántas tocaron el WhatsApp mayorista estando en la sección. Es la métrica que separa tráfico bueno de tráfico inflado.')}

    ${anTable(`${icon('list')} Páginas de la sección`, [
    { label: 'Página', cell: (x) => `<span class="an-path">${esc(x.key)}</span>` },
    { label: 'Vistas', num: true, cell: (x) => `${anNum(x.views)} ${anDelta(x.viewsDelta)}` },
    { label: 'Antes', num: true, cell: (x) => anNum(x.viewsPrev) },
    { label: 'Sesiones', num: true, cell: (x) => anNum(x.sessions) },
    { label: 'Interacción', num: true, cell: (x) => `${x.engagement}%` },
  ], r.pages)}

    ${anTable(`${icon('pin')} Por dónde entran`, [
    { label: 'Primera página de la visita', cell: (x) => `<span class="an-path">${esc(x.key)}</span>` },
    { label: 'Sesiones', num: true, cell: (x) => `${anNum(x.sessions)} ${anDelta(x.sessionsDelta)}` },
    { label: 'Rebote', num: true, cell: (x) => `${x.bounce}% <span class="an-dim">(antes ${x.bouncePrev}%)</span>` },
  ], r.landings)}

    ${anTable(`${icon('send')} A dónde van después`, [
    { label: 'Página destino (fuera de la sección)', cell: (x) => `<span class="an-path">${esc(x.key)}</span>` },
    { label: 'Vistas', num: true, cell: (x) => `${anNum(x.views)} ${anDelta(x.viewsDelta)}` },
  ], r.destinations, 'Adónde sigue la navegación desde una página de la sección.')}

    ${anTable(`${icon('comment')} Dónde se generan las consultas`, [
    { label: 'Página de la sección', cell: (x) => `<span class="an-path">${esc(x.key)}</span>` },
    { label: 'Consultas', num: true, cell: (x) => `${anNum(x.contacts)} ${anDelta(x.contactsDelta)}` },
    { label: 'Antes', num: true, cell: (x) => anNum(x.contactsPrev) },
  ], r.contactPages)}

    ${anAdsHtml(r.ads)}
    ${anLeadFunnelHtml(r.leadEvents)}
    ${anSearchHtml(r.search)}

    ${anTable(`${icon('user')} Dispositivo`, [
    { label: 'Dispositivo', cell: (x) => esc(x.key) },
    { label: 'Sesiones', num: true, cell: (x) => `${anNum(x.sessions)} ${anDelta(x.sessionsDelta)}` },
    { label: 'Interacción', num: true, cell: (x) => `${x.engagement}%` },
  ], r.devices)}

    ${anTable(`${icon('pin')} Provincias`, [
    { label: 'Región', cell: (x) => esc(x.key) },
    { label: 'Sesiones', num: true, cell: (x) => `${anNum(x.sessions)} ${anDelta(x.sessionsDelta)}` },
  ], r.regions)}

    <div class="panel an-panel an-warn">
      <h3>${icon('info')} Cómo leer esto</h3>
      <p class="hint" style="margin-top:0;">Se cuenta como <b>consulta</b> el ${esc(r.tracking.contactMetric)}. Mayorista = link al ${esc(r.tracking.whatsappNumbers.mayorista)}; minorista = ${esc(r.tracking.whatsappNumbers.minorista)}.</p>
      <ul class="an-warn-list">${r.tracking.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>`;

  anEl('an-out').innerHTML = html;
  drawAnalysisChart(r);
}

let anChart = null;
/**
 * Embudo de contacto con los eventos propios del tema (WhatsApp, cotizador,
 * formulario…). Mientras el tema con la medición nueva no esté publicado, no hay
 * datos: en vez de una tabla vacía se explica qué falta para tenerlos.
 */
function anLeadFunnelHtml(le) {
  if (!le) return '';
  if (!le.ready) {
    return `<div class="panel an-panel an-warn">
      <h3>${icon('route')} Embudo de contacto</h3>
      <p class="hint" style="margin-top:0;">Todavía no llegan los eventos propios de la tienda (<code>generate_lead</code> y compañía).
      Cuando publiques el tema con la medición nueva, acá vas a ver cuánta gente ve la propuesta mayorista, cuánta abre el botón de WhatsApp
      y cuánta termina consultando — y de qué botón sale cada consulta. Hasta entonces el informe usa el clic saliente, que ya funciona.</p>
    </div>`;
  }
  const max = Math.max(...le.funnel.map((s) => s.count), 1);
  const steps = le.funnel.map((s) => {
    const pctBar = Math.round((s.count / max) * 100);
    const d = s.countPrev ? Math.round(((s.count - s.countPrev) / s.countPrev) * 1000) / 10 : null;
    return `<div class="an-step">
      <div class="an-step-top"><span>${esc(s.label)}</span><b>${anNum(s.count)} ${anDelta(d)}</b></div>
      <div class="an-step-bar"><i style="width:${pctBar}%"></i></div>
      <span class="an-dim">antes ${anNum(s.countPrev)} · evento <code>${esc(s.event)}</code></span>
    </div>`;
  }).join('');
  const mini = (title, arr) => (arr && arr.length ? `<div class="an-block"><span class="fmt-label">${title}</span>
    <ul class="an-list">${arr.map((x) => `<li>${esc(x.key)}: <b>${anNum(x.count)}</b> <span class="an-dim">(antes ${anNum(x.countPrev)})</span></li>`).join('')}</ul></div>` : '');
  return `<div class="panel an-panel">
    <h3>${icon('route')} Embudo de contacto</h3>
    <p class="hint" style="margin-top:0;">Medido con los eventos propios de la tienda: dice en qué paso se cae la gente, no sólo cuántos llegaron.</p>
    <div class="an-steps">${steps}</div>
    ${le.dimensionsReady ? '' : `<p class="hint">Para abrir las consultas por tipo y por botón falta registrar las dimensiones personalizadas en GA4 (<code>lead_type</code>, <code>contact_channel</code>, <code>page_type</code>, <code>info_type</code>).</p>`}
    ${mini('Consultas por tipo', le.byType)}
    ${mini('De qué botón salieron', le.byChannel)}
    ${mini('Desde qué tipo de página', le.byPage)}
  </div>`;
}

/** Plata: cuánto cuesta cada consulta en cada campaña (Google Ads). */
function anAdsHtml(a) {
  if (!a) return '';
  if (!a.enabled) {
    return `<div class="panel an-panel an-warn">
      <h3>${icon('bolt')} Costo por consulta (Google Ads)</h3>
      <p class="hint" style="margin-top:0;">Sin conectar todavía: ${esc(a.reason || 'falta configurar Google Ads.')}</p>
      ${a.missing && a.missing.length ? `<ul class="an-warn-list">${a.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }
  const cur = a.currency || 'ARS';
  const plata = (v) => (v === null || v === undefined ? '<span class="an-dim">sin datos</span>' : `${cur} ${anNum(v)}`);
  // El costo por consulta es LA métrica de esta tabla: se ordena y se resalta.
  const conDato = a.campaigns.filter((c) => c.costPerContact !== null);
  const mejor = conDato.length ? Math.min(...conDato.map((c) => c.costPerContact)) : null;
  const peor = conDato.length ? Math.max(...conDato.map((c) => c.costPerContact)) : null;
  return `<div class="panel an-panel">
      <h3>${icon('bolt')} Costo por consulta (Google Ads)</h3>
      <p class="hint" style="margin-top:0;">Cruza el gasto real de cada campaña con las sesiones y consultas que esa misma campaña trajo a la sección. Es la comparación que decide dónde poner la plata.</p>
      <div class="an-kpis">
        <div class="an-kpi"><span class="an-lbl">Gasto del período</span><b>${cur} ${anNum(a.totals.cost)}</b><span class="an-prev">antes ${cur} ${anNum(a.totals.costPrev)} ${anDelta(a.totals.costPrev ? Math.round(((a.totals.cost - a.totals.costPrev) / a.totals.costPrev) * 1000) / 10 : null, false)}</span></div>
        <div class="an-kpi"><span class="an-lbl">Costo por consulta (promedio)</span><b>${a.costPerContactAvg === null ? '—' : `${cur} ${anNum(a.costPerContactAvg)}`}</b><span class="an-prev">${anNum(a.sectionContactsTotal)} consultas atribuidas</span></div>
        <div class="an-kpi"><span class="an-lbl">Clics pagos</span><b>${anNum(a.totals.clicks)}</b><span class="an-prev">antes ${anNum(a.totals.clicksPrev)}</span></div>
        <div class="an-kpi"><span class="an-lbl">Conversiones que cuenta Ads</span><b>${anNum(a.totals.conversions)}</b><span class="an-prev">antes ${anNum(a.totals.conversionsPrev)}</span></div>
      </div>
    </div>
    ${anTable(`${icon('chart')} Cada campaña: lo que gasta y lo que trae`, [
    { label: 'Campaña', cell: (c) => `${esc(c.name)}<br><span class="an-dim">${esc(c.channel || '')}</span>` },
    { label: 'Gasto', num: true, cell: (c) => `${cur} ${anNum(c.cost)}<br><span class="an-dim">antes ${anNum(c.costPrev)}</span>` },
    { label: 'Sesiones', num: true, cell: (c) => anNum(c.sectionSessions) },
    { label: 'Consultas', num: true, cell: (c) => anNum(c.sectionContacts) },
    {
      label: 'Costo x consulta',
      num: true,
      cell: (c) => (c.costPerContact === null ? '<span class="an-dim">sin consultas</span>'
        : `<b class="${c.costPerContact === mejor ? 'an-best' : c.costPerContact === peor ? 'an-worst' : ''}">${plata(c.costPerContact)}</b>`),
    },
    {
      label: 'Subasta',
      num: true,
      cell: (c) => (c.impressionShare === null ? '<span class="an-dim">n/d</span>'
        : `${c.impressionShare}%<br><span class="an-dim">pierde ${c.lostToRank}% x ranking · ${c.lostToBudget}% x presupuesto</span>`),
    },
  ], a.campaigns, 'Cuota de subasta: de todas las veces que tu aviso podía aparecer, en cuántas apareció. Perder por RANKING es que te ganan con mejor oferta o calidad; perder por PRESUPUESTO es que te quedaste sin plata.')}
    ${anTable(`${icon('search')} Qué tipeó la gente que hizo clic en tus avisos`, [
    { label: 'Búsqueda real', cell: (t) => esc(t.term) },
    { label: 'Campaña', cell: (t) => `<span class="an-dim">${esc(t.campaign)}</span>` },
    { label: 'Clics', num: true, cell: (t) => anNum(t.clicks) },
    { label: 'Gasto', num: true, cell: (t) => `${cur} ${anNum(t.cost)}` },
    { label: 'Conversiones', num: true, cell: (t) => anNum(t.conversions) },
  ], a.searchTerms, 'Los términos que más gastan sin traer nada son candidatos a palabra clave negativa.')}`;
}

/** Qué pasa en Google ANTES del clic: visibilidad, posición y terreno perdido. */
function anSearchHtml(s) {
  if (!s) return '';
  if (!s.enabled) {
    return `<div class="panel an-panel an-warn">
      <h3>${icon('search')} Cómo nos encuentran en Google</h3>
      <p class="hint" style="margin-top:0;">Sin conectar todavía: ${esc(s.reason || 'falta configurar Search Console.')}</p>
    </div>`;
  }
  const t = s.totals;
  const posDelta = (x) => (x.positionDelta === null ? '<span class="an-d new">nueva</span>'
    : x.positionDelta === 0 ? '<span class="an-d flat">=</span>'
      : `<span class="an-d ${x.positionDelta > 0 ? 'up' : 'down'}">${x.positionDelta > 0 ? '↑' : '↓'} ${Math.abs(x.positionDelta)}</span>`);
  const qCols = [
    { label: 'Búsqueda', cell: (x) => esc(x.key) },
    { label: 'Apariciones', num: true, cell: (x) => `${anNum(x.impressions)} ${anDelta(x.impressionsDelta)}` },
    { label: 'Clics', num: true, cell: (x) => `${anNum(x.clicks)} <span class="an-dim">(antes ${anNum(x.clicksPrev)})</span>` },
    { label: 'Posición', num: true, cell: (x) => `${x.position} ${posDelta(x)}<br><span class="an-dim">antes ${x.positionPrev || '-'}</span>` },
  ];
  return `<div class="panel an-panel">
      <h3>${icon('search')} Cómo nos encuentran en Google</h3>
      <p class="hint" style="margin-top:0;">Sólo búsqueda orgánica (no la pauta). "Posición" es el puesto promedio en el que aparecemos: <b>menos es mejor</b>.</p>
      <div class="an-kpis">
        <div class="an-kpi"><span class="an-lbl">Clics desde Google</span><b>${anNum(t.current.clicks)}</b><span class="an-prev">antes ${anNum(t.previous.clicks)} ${anDelta(s.deltas.clicks)}</span></div>
        <div class="an-kpi"><span class="an-lbl">Veces que aparecimos</span><b>${anNum(t.current.impressions)}</b><span class="an-prev">antes ${anNum(t.previous.impressions)} ${anDelta(s.deltas.impressions)}</span></div>
        <div class="an-kpi"><span class="an-lbl">Nos eligen</span><b>${t.current.ctr}%</b><span class="an-prev">antes ${t.previous.ctr}% ${anDelta(s.deltas.ctr)}</span></div>
        <div class="an-kpi"><span class="an-lbl">Posición media</span><b>${t.current.position}</b><span class="an-prev">antes ${t.previous.position} <span class="an-d ${s.deltas.position > 0 ? 'up' : s.deltas.position < 0 ? 'down' : 'flat'}">${s.deltas.position > 0 ? 'mejoró' : s.deltas.position < 0 ? 'empeoró' : '='} ${Math.abs(s.deltas.position)}</span></span></div>
      </div>
    </div>
    ${anTable(`${icon('alert')} Terreno perdido — nos siguen mostrando pero bajamos de puesto`, qCols, s.lostGround,
    'Lo más parecido a "quién nos está ganando": Google nos sigue mostrando por esa búsqueda, pero alguien nos pasó de lugar.')}
    ${anTable(`${icon('check')} Terreno ganado`, qCols, s.gainedGround)}
    ${anTable(`${icon('eye')} Nos ven y no nos eligen`, qCols, s.lowCtr,
    'Estamos en la primera página pero casi nadie entra: ahí el problema es el título y la descripción que muestra Google, no el posicionamiento.')}
    ${anTable(`${icon('list')} Búsquedas que más nos muestran`, qCols, s.topQueries)}`;
}

function drawAnalysisChart(r) {
  const el = anEl('an-chart');
  if (!el || typeof Chart === 'undefined' || !r.daily || !r.daily.length) return;
  const labels = r.daily.map((d) => d.date.slice(5));
  if (anChart) { anChart.destroy(); anChart = null; } // sin esto cada informe deja su gráfico atrás
  anChart = new Chart(el.getContext('2d'), {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Sesiones en la sección', data: r.daily.map((d) => d.sessions), backgroundColor: 'rgba(193,68,12,.55)', yAxisID: 'y' },
        { type: 'line', label: 'Consultas mayoristas', data: r.daily.map((d) => d.contacts), borderColor: '#f5f5f7', backgroundColor: '#f5f5f7', tension: .3, pointRadius: 2, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#97979f', boxWidth: 12 } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#97979f', maxTicksLimit: 12 } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#97979f', precision: 0 } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#97979f', precision: 0 } },
      },
    },
  });
}

async function explainSectionAnalysis() {
  const btn = anEl('an-ai');
  const out = anEl('an-ai-out');
  if (!anReport) { toast('Primero cargá el informe', 'err'); return; }
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Analizando…`;
  if (out) out.innerHTML = `<div class="panel an-panel"><p class="loading">La IA está leyendo el informe…</p></div>`;
  try {
    const body = { ...analysisParams(), businessContext: anEl('an-context').value.trim() };
    const r = await api('/api/analysis/section/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    anAnalysis = r.analysis;
    renderSectionAiAnalysis();
  } catch (e) {
    if (out) out.innerHTML = `<div class="panel an-panel"><p class="empty">No pude analizarlo: ${esc(e.message)}</p></div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('sparkles')} Explicar con IA`;
  }
}

function renderSectionAiAnalysis() {
  const a = anAnalysis;
  const out = anEl('an-ai-out');
  if (!a || !out) return;
  const list = (title, arr, fmt) => (arr && arr.length ? `<div class="an-block"><span class="fmt-label">${title}</span><ul class="an-list">${arr.map(fmt).join('')}</ul></div>` : '');
  out.innerHTML = `<div class="panel an-panel an-ai">
    <h3>${icon('sparkles')} Diagnóstico</h3>
    <p class="an-titular">${esc(a.titular)}</p>
    <p class="an-resumen">${esc(a.resumen)}</p>
    ${list('Qué muestran los datos', a.hallazgos, (h) => `<li class="an-f ${esc(h.tipo || 'neutro')}">${esc(h.texto)}</li>`)}
    ${a.hipotesis && a.hipotesis.length ? `<div class="an-block"><span class="fmt-label">Hipótesis, de más a menos probable</span>
      ${a.hipotesis.map((h) => `<div class="an-hyp">
        <div class="an-hyp-head"><b>${esc(h.titulo)}</b><span class="an-prob ${esc(h.probabilidad)}">${esc(h.probabilidad)}</span></div>
        ${(h.evidencia || []).length ? `<ul class="an-list pro">${h.evidencia.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${(h.contra || []).length ? `<ul class="an-list con">${h.contra.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${h.verificar ? `<p class="hint"><b>Cómo verificarlo:</b> ${esc(h.verificar)}</p>` : ''}
        ${h.implica ? `<p class="hint"><b>Qué implica:</b> ${esc(h.implica)}</p>` : ''}
      </div>`).join('')}</div>` : ''}
    ${list('Lo que hoy no se puede saber', a.sinMedir, (s) => `<li>${esc(s)}</li>`)}
    ${list('Qué hacer', a.acciones, (x) => `<li><b>${esc(x.titulo)}</b> <span class="an-tag">impacto ${esc(x.impacto || '-')} · esfuerzo ${esc(x.esfuerzo || '-')}</span><br><span class="an-dim">${esc(x.detalle || '')}</span></li>`)}
    ${list('Para responder internamente', a.preguntas, (p) => `<li>${esc(p)}</li>`)}
  </div>`;
}

/** Estado de las tres fuentes del informe, con el paso que falta en cada una. */
async function checkAnalysisSources() {
  const btn = anEl('an-diag');
  const out = anEl('an-diag-out');
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Probando…`;
  out.innerHTML = '';
  try {
    const d = await api('/api/analysis/conexiones');
    const fila = (nombre, x, ayuda) => `<li class="an-conn ${x.ok ? 'ok' : 'bad'}">
      <b>${x.ok ? '✔' : '✕'} ${esc(nombre)}</b> — ${esc(x.detalle)}
      ${!x.ok && ayuda ? `<br><span class="an-dim">${ayuda}</span>` : ''}</li>`;
    out.innerHTML = `<ul class="an-conn-list">
      ${fila('Google Analytics', d.analytics)}
      ${fila('Search Console', d.searchConsole, 'Se habilita en el proyecto de Google Cloud <b>durable-pipe-396712</b> y se le da acceso de lectura a la cuenta de servicio en Search Console.')}
      ${fila('Google Ads', d.googleAds, 'Necesita developer token del API Center + client id/secret + refresh token (<code>node scripts/google-ads-token.js</code>).')}
    </ul>`;
  } catch (e) {
    out.innerHTML = `<p class="hint">No pude probar: ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('bolt')} Probar conexiones`;
  }
}

/**
 * Diccionario de eventos: qué mide la tienda, qué está entrando AHORA y qué
 * significa cada uno. La vista en vivo es la clave: los eventos recién puestos
 * tardan hasta 48 h en salir en los informes normales de Analytics, y sin esto
 * parece que no funcionan cuando en realidad ya están llegando.
 */
async function loadEventCatalog() {
  const btn = anEl('an-ev');
  const out = anEl('an-events-out');
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Consultando…`;
  out.innerHTML = `<div class="panel an-panel"><p class="loading">Preguntando a Analytics qué está llegando…</p></div>`;
  try {
    const d = await api('/api/analysis/eventos?days=7');
    if (!d.enabled) { out.innerHTML = `<div class="panel an-panel"><p class="empty">${esc(d.reason)}</p></div>`; return; }

    const r = d.resumen;
    const estado = r.llegandoAhora > 0
      ? `<div class="an-ev-state ok">${icon('check')} <b>Está midiendo.</b> En los últimos 30 minutos llegaron ${r.llegandoAhora} de los ${r.propios} eventos propios.
         ${r.esperandoConsolidacion ? ' Todavía no aparecen en los informes por fecha: Analytics tarda hasta 48 h en consolidarlos. Es normal y no hay nada que arreglar.' : ''}</div>`
      : `<div class="an-ev-state bad">${icon('alert')} <b>No está llegando nada.</b> Si ya publicaste el tema con la medición nueva, entrá a la tienda, tocá un botón de WhatsApp y volvé a probar en un minuto.</div>`;

    const dims = d.dimensiones.ok
      ? `<div class="an-ev-state ok">${icon('check')} Las dimensiones personalizadas están registradas: las consultas se pueden abrir por tipo y por botón.</div>`
      : `<div class="an-ev-state warn">${icon('alert')} <b>Faltan registrar las dimensiones personalizadas.</b> Los eventos se cuentan igual, pero sin esto no se puede saber si una consulta fue mayorista o minorista, ni de qué botón salió.
          <ul class="an-warn-list">${d.dimensiones.lista.map((x) => `<li><code>${esc(x.param)}</code> — ${esc(x.label)} <span class="an-dim">(${esc(x.valores)})</span></li>`).join('')}</ul>
          <p class="hint">${esc(d.dimensiones.comoRegistrar)}</p></div>`;

    const fila = (e) => `<tr class="${e.propio ? 'an-ev-own' : ''}">
        <td>
          <b>${esc(e.label)}</b>${e.destacado ? ' <span class="an-ev-star">clave</span>' : ''}<br>
          <code class="an-ev-code">${esc(e.event)}</code>
          ${e.propio ? '<span class="an-ev-tag own">nuestro</span>' : '<span class="an-ev-tag auto">automático</span>'}
        </td>
        <td>${esc(e.significa)}<br><span class="an-dim">Dónde: ${esc(e.donde)}</span>
          <br><span class="an-dim">Para qué: ${esc(e.paraQue)}</span>
          ${e.ojo ? `<br><span class="an-ev-ojo">Ojo: ${esc(e.ojo)}</span>` : ''}</td>
        <td class="num">${e.ahora === null ? '<span class="an-dim">—</span>' : (e.ahora ? `<b class="an-ev-live">${anNum(e.ahora)}</b>` : '<span class="an-dim">0</span>')}</td>
        <td class="num">${e.periodo ? anNum(e.periodo) : '<span class="an-dim">0</span>'}</td>
      </tr>`;

    out.innerHTML = `<div class="panel an-panel">
      <h3>${icon('list')} Qué se está midiendo</h3>
      ${estado}
      ${dims}
      <div class="an-scroll"><table class="insights an-table an-ev-table">
        <thead><tr><th>Evento</th><th>Qué significa</th><th class="num">Ahora<br><span class="an-dim">30 min</span></th><th class="num">Últimos<br>${d.ventana.dias} días</th></tr></thead>
        <tbody>${d.eventos.map(fila).join('')}</tbody>
      </table></div>
      <p class="hint">"Ahora" es la vista en vivo de Analytics (últimos 30 minutos, sin demora). "Últimos ${d.ventana.dias} días" sale de los informes por fecha, que se consolidan con retraso.</p>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div class="panel an-panel"><p class="empty">No pude consultarlo: ${esc(e.message)}</p></div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('list')} Qué se está midiendo`;
  }
}

function exportSectionAnalysis() {
  if (!anReport) { toast('Primero cargá el informe', 'err'); return; }
  const params = new URLSearchParams(analysisParams());
  // Si ya se pidió el diagnóstico, el informe descargado lo incluye.
  if (anAnalysis) { params.set('ai', '1'); params.set('context', anEl('an-context').value.trim().slice(0, 500)); }
  window.open(`/api/analysis/section/export?${params.toString()}`, '_blank');
}

/* ============ EMBUDOS (mayorista / minorista) ============
 * El informe de sección contesta "qué pasó"; el embudo contesta "en qué paso se
 * rompe". Se dibuja como escalera: el ancho de cada barra es el % sobre el total
 * de sesiones, así la caída se ve de un vistazo sin leer un solo número. */
async function loadFunnels() {
  const out = anEl('an-funnel-out');
  const btn = anEl('an-funnel-btn');
  const p = analysisParams();
  if (!p.from || !p.to) { toast('Elegí las fechas primero', 'err'); return; }
  btn.disabled = true; btn.innerHTML = `${icon('refresh', 'spin')} Calculando…`;
  out.innerHTML = skeleton('rows', 3);
  try {
    const f = await api(`/api/analysis/embudo?${anQuery()}`);
    renderFunnels(f);
  } catch (e) {
    out.innerHTML = `<p class="empty">No pude armar el embudo: ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('refresh')} Ver embudo`;
  }
}

function renderFunnelSteps(e) {
  return e.steps.map((s, i) => {
    if (s.sinDatos) {
      return `<div class="fn-step fn-nodata">
        <div class="fn-head"><span class="fn-label">${i + 1}. ${esc(s.label)}</span><span class="fn-tag">todavía no se medía</span></div>
        <div class="fn-bar"><i style="width:0"></i></div>
        <div class="fn-note">${esc(s.medida)}</div>
      </div>`;
    }
    // El "salto" (más gente que en el paso anterior) se marca aparte: no es una
    // caída negativa, es gente que entró directo por otro lado.
    const flujo = i === 0 ? '<span class="fn-tag">punto de partida</span>'
      : s.noSecuencial
        ? `<span class="fn-tag up">+${anNum(s.entranDirecto)} entraron directo</span>`
        : `<span class="fn-tag ${s.lostPct > 60 ? 'bad' : ''}">sigue el ${s.pctOfPrev}% · se caen ${anNum(s.lost)}</span>`;
    const esPeor = e.peor && e.peor.key === s.key;
    // Un paso "impreciso" mide algo más ancho de lo que dice (ej: la ficha
    // minorista todavía cuenta las mayoristas). Se avisa en la barra misma para
    // que nadie saque conclusiones de un número que sabemos que está sucio.
    const marcaImprecisa = s.impreciso ? ' <span class="fn-tag warn">⚠ incluye mayoristas</span>' : '';
    return `<div class="fn-step${esPeor ? ' fn-worst' : ''}${s.impreciso ? ' fn-fuzzy' : ''}" title="${esc(s.help || '')}">
      <div class="fn-head">
        <span class="fn-label">${i + 1}. ${esc(s.label)}</span>
        <span class="fn-val"><b>${anNum(s.sessions)}</b> <span class="an-dim">${s.pctOfTop}%</span> ${anDelta(s.delta)}</span>
      </div>
      <div class="fn-bar"><i style="width:${Math.max(1.5, s.pctOfTop)}%"></i></div>
      <div class="fn-note">${flujo} · <span class="an-dim">${esc(s.medida)}</span>${marcaImprecisa}${esPeor ? ' <b class="fn-worst-tag">← la peor fuga</b>' : ''}</div>
    </div>`;
  }).join('');
}

function renderFunnels(f) {
  const col = (e, extra = '') => `<div class="fn-col">
      <div class="fn-title">${esc(e.titulo)}</div>
      <p class="hint" style="margin:2px 0 12px;">${esc(e.subtitulo)}</p>
      ${renderFunnelSteps(e)}
      <div class="fn-foot">
        Conversión final: <b>${e.conversionFinal}%</b> <span class="an-dim">(antes ${e.conversionFinalPrev}%)</span>
        ${e.peor ? `<br><span class="an-dim">Peor fuga: ${esc(e.peor.label)} — se cae el ${e.peor.lostPct}%</span>` : ''}
        ${extra}
      </div>
    </div>`;

  const m = f.medicion || {};
  const aviso = m.periodoIncompleto
    ? `<div class="fn-alert">${icon('alert')} <span>La medición de los pasos nuevos arrancó el <b>${esc(m.desde)}</b> y el período elegido incluye días anteriores: esos escalones se ven más bajos de lo que realmente son. Para leerlo bien, poné el período desde el ${esc(m.desde)}.</span></div>`
    : '';

  anEl('an-funnel-out').innerHTML = `
    ${aviso}
    <div class="fn-grid">
      ${col(f.mayorista)}
      ${col(f.minorista, f.minorista.consultasWhatsapp
    ? `<br><span class="an-dim">Además, ${anNum(f.minorista.consultasWhatsapp.sessions)} sesiones consultaron por WhatsApp minorista ${anDelta(f.minorista.consultasWhatsapp.delta)}</span>` : '')}
    </div>
    <ul class="an-warn-list" style="margin-top:14px;">${(f.avisos || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
}

/* ============ atajos de teclado ============
 * Escape cierra lo que esté abierto (modal, panel de edición) y, si no hay nada,
 * limpia la selección múltiple. Antes había que buscar la X con el mouse.
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlays = document.querySelectorAll('.modal-overlay:not(.hidden)');
  const dynamic = [...overlays].filter((o) => o.id !== 'edit-modal');
  if (dynamic.length) { dynamic[dynamic.length - 1].remove(); return; }
  if (!document.getElementById('edit-modal').classList.contains('hidden')) { closeEdit(); return; }
  if (selectedSlots.size) clearSelection();
});

/* ============ init ============ */
hydrateIcons();
loadConfig();
loadCalendar();
setupStyleTab();
pollBgTasks();
setInterval(pollBgTasks, 60 * 1000); // tareas en segundo plano: refresco cada minuto
setInterval(refreshPubTimers, 30 * 1000); // cuenta regresiva de auto-publicación

/* =========================================================================
 * HOME DE LA TIENDA — qué muestra cada carrusel automático.
 *
 * El theme tiene CUATRO huecos fijos (rail_1..rail_4) que el dueño ubica donde
 * quiera dentro del orden de la página de inicio, desde el panel de diseño de
 * Tiendanube. Acá se decide el CONTENIDO de cada hueco: con qué regla se eligen
 * los productos, cuántos, con qué título y con qué layout.
 *
 * Arrastrar una tarjeta NO mueve el riel en la página (eso es cosa de
 * Tiendanube): intercambia el contenido entre huecos. Está aclarado en la UI
 * porque es la confusión obvia.
 * ========================================================================= */

let homeState = { rules: [], slots: [], layouts: [], config: null, preview: null };

async function loadHomeRails() {
  const body = document.getElementById('home-body');
  body.innerHTML = skeleton('rows', 4);
  try {
    const d = await api('/api/home/rules');
    homeState = { rules: d.rules || [], slots: d.slots || [], layouts: d.layouts || [], config: d.config, preview: null, catalogo: d.catalogo || {} };
    renderHomeRails();
    previewHomeRails({ silent: true });
    loadHomeLayout();
  } catch (err) {
    body.innerHTML = `<p class="hint">No pude cargar la configuración: ${esc(err.message)}</p>`;
  }
}

function ruleHelp(id) {
  const r = homeState.rules.find((x) => x.id === id);
  return r ? r.help : '';
}

function renderHomeRails() {
  const cfg = homeState.config;
  const body = document.getElementById('home-body');
  const usados = cfg.rails.map((r) => r.id);
  const libres = homeState.slots.filter((s) => !usados.includes(s));

  const cards = cfg.rails.map((r, i) => {
    const opciones = homeState.rules
      .map((x) => `<option value="${esc(x.id)}" ${x.id === r.rule ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    const layouts = homeState.layouts
      .map((l) => `<option value="${l}" ${l === r.layout ? 'selected' : ''}>${l === 'grid' ? 'Grilla' : 'Carrusel'}</option>`).join('');
    const fijos = r.rule === 'fijos'
      ? `<div class="field"><label>Productos elegidos (ids separados por coma)</label>
           <input class="input" data-hr="product_ids" data-i="${i}" value="${esc((r.product_ids || []).join(', '))}"
                  placeholder="ej: 12345, 67890" /></div>` : '';

    return `<div class="hr-card" draggable="true" data-i="${i}">
      <div class="hr-head">
        <span class="hr-grip" title="Arrastrar para intercambiar con otro hueco">⠿</span>
        <span class="hr-slot">Hueco ${i + 1}<small>${esc(r.id)}</small></span>
        <button class="btn-ghost btn-sm" onclick="removeHomeRail(${i})" title="Sacar este riel del home">${icon('trash')}</button>
      </div>
      <div class="grid-2">
        <div class="field"><label>Título que ve el cliente</label>
          <input class="input" data-hr="title" data-i="${i}" value="${esc(r.title)}" maxlength="80" /></div>
        <div class="field"><label>Regla</label>
          <select class="input" data-hr="rule" data-i="${i}">${opciones}</select></div>
      </div>
      <p class="hint hr-help">${esc(ruleHelp(r.rule))}</p>
      ${fijos}
      <div class="grid-2">
        <div class="field"><label>Cuántos productos</label>
          <input class="input" type="number" min="3" max="24" data-hr="limit" data-i="${i}" value="${r.limit}" /></div>
        <div class="field"><label>Formato</label>
          <select class="input" data-hr="layout" data-i="${i}">${layouts}</select></div>
      </div>
      <div class="field"><label>Link del botón "Ver todos" (opcional)</label>
        <input class="input" data-hr="url" data-i="${i}" value="${esc(r.url || '')}" placeholder="ej: /productos" /></div>
      <div class="hr-preview" id="hr-preview-${i}"></div>
    </div>`;
  }).join('');

  // Las tarjetas muestran el precio guardado en el catálogo, no el que tiene
  // Tiendanube en este segundo. Si acabás de cambiar un precio, esto avisa que
  // todavía no entró y deja forzarlo sin ir a la pestaña Productos.
  const cat = homeState.catalogo || {};
  const mins = cat.minutos;
  const viejo = mins !== null && mins !== undefined && mins > 75;
  const cuando = (mins === null || mins === undefined) ? 'nunca'
    : mins < 2 ? 'recién'
      : mins < 60 ? `hace ${mins} min`
        : `hace ${Math.floor(mins / 60)} h ${mins % 60} min`;
  const frescura = `
    <div class="hr-fresh ${viejo ? 'stale' : ''}">
      <span class="hr-fresh-dot"></span>
      <div>
        <b>Precios y stock actualizados ${cuando}</b>
        ${tip('Los rieles muestran lo que está guardado en el catálogo, no lo que tiene Tiendanube en este instante. Se refresca solo cada hora; si acabás de cambiar un precio y lo querés ver ya, usá el botón.')}
        <p class="hint" style="margin:2px 0 0;">${viejo
    ? 'Hace rato que no se sincroniza: puede que alguna tarjeta muestre un precio viejo.'
    : 'Se sincroniza solo cada hora.'}</p>
      </div>
      <button class="btn-ghost btn-sm" id="hr-sync" onclick="syncCatalogFromHome(this)">${icon('refresh')} Actualizar ahora</button>
    </div>`;

  body.innerHTML = frescura + `
    <div class="panel" style="margin-bottom:18px;">
      <h3>${icon('filter')} Reglas generales</h3>
      <div class="grid-2">
        <div class="field">
          <label><input type="checkbox" id="hr-dedupe" ${cfg.dedupe !== false ? 'checked' : ''} />
            No repetir un producto en dos rieles</label>
          <p class="hint">Recomendado: de tu catálogo sólo entran unos 44 productos a los rieles, así que sin esto el mismo pantalón sale en tres carruseles.</p>
        </div>
        <div class="field">
          <label>Descuento por transferencia (%)</label>
          <input class="input" type="number" min="0" max="99" id="hr-transfer"
                 value="${cfg.transfer_discount_pct || ''}" placeholder="vacío = no mostrarlo" />
          <p class="hint">Si lo cargás, las fichas muestran el precio con transferencia. Ojo: tiene que coincidir con la promoción real de Tiendanube, porque el motor no puede leerla.</p>
        </div>
      </div>
    </div>
    <div class="hr-list" id="hr-list">${cards || '<p class="hint">No hay ningún riel configurado.</p>'}</div>
    ${libres.length ? `<button class="btn-ghost" style="margin-top:12px;" onclick="addHomeRail()">${icon('plus')} Agregar riel (quedan ${libres.length} huecos)</button>` : ''}
    <div class="panel" id="hr-summary" style="margin-top:18px;"><p class="hint">Previsualizando...</p></div>`;

  hydrateIcons(body);
  bindHomeRailInputs();
  bindHomeRailDrag();
}

/** Lee los inputs y actualiza homeState.config sin re-renderizar (no perder foco). */
function bindHomeRailInputs() {
  document.querySelectorAll('[data-hr]').forEach((el) => {
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const i = Number(el.dataset.i);
      const campo = el.dataset.hr;
      const rail = homeState.config.rails[i];
      if (campo === 'limit') rail.limit = Number(el.value) || 12;
      else if (campo === 'product_ids') {
        rail.product_ids = el.value.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      } else rail[campo] = el.value;
      // Cambiar la regla cambia la ayuda y puede sumar el campo de productos fijos.
      if (campo === 'rule') renderHomeRails();
    });
  });
  const dedupe = document.getElementById('hr-dedupe');
  if (dedupe) dedupe.addEventListener('change', () => { homeState.config.dedupe = dedupe.checked; });
  const transfer = document.getElementById('hr-transfer');
  if (transfer) transfer.addEventListener('input', () => {
    homeState.config.transfer_discount_pct = transfer.value ? Number(transfer.value) : null;
  });
}

/** Arrastrar intercambia el CONTENIDO entre huecos (los ids quedan en orden). */
function bindHomeRailDrag() {
  const list = document.getElementById('hr-list');
  if (!list) return;
  let origen = null;
  list.querySelectorAll('.hr-card').forEach((card) => {
    card.addEventListener('dragstart', () => { origen = Number(card.dataset.i); card.classList.add('hr-dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('hr-dragging'));
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('hr-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('hr-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('hr-over');
      const destino = Number(card.dataset.i);
      if (origen === null || origen === destino) return;
      const rails = homeState.config.rails;
      const [movido] = rails.splice(origen, 1);
      rails.splice(destino, 0, movido);
      // Los huecos son posicionales: se reasignan según el orden nuevo.
      rails.forEach((r, i) => { r.id = homeState.slots[i]; });
      renderHomeRails();
      previewHomeRails({ silent: true });
    });
  });
}

function addHomeRail() {
  const usados = homeState.config.rails.map((r) => r.id);
  const libre = homeState.slots.find((s) => !usados.includes(s));
  if (!libre) return;
  homeState.config.rails.push({ id: libre, rule: 'mas_vendidos', title: 'Los que más se venden', layout: 'carousel', limit: 12, url: null });
  renderHomeRails();
  previewHomeRails({ silent: true });
}

function removeHomeRail(i) {
  homeState.config.rails.splice(i, 1);
  homeState.config.rails.forEach((r, n) => { r.id = homeState.slots[n]; });
  renderHomeRails();
  previewHomeRails({ silent: true });
}

async function previewHomeRails({ silent = false } = {}) {
  const summary = document.getElementById('hr-summary');
  if (!summary) return;
  if (!silent) summary.innerHTML = '<p class="loading">Calculando...</p>';
  try {
    const data = await api('/api/home/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(homeState.config),
    });
    homeState.preview = data;
    pintarPreviewHome(data);
    if (!silent) toast('Vista previa actualizada.');
  } catch (err) {
    summary.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
  }
}

function pintarPreviewHome(data) {
  const rails = data.rails || [];
  const total = rails.reduce((a, r) => a + r.products.length, 0);
  const distintos = new Set(rails.flatMap((r) => r.products.map((p) => p.id))).size;
  const peso = (JSON.stringify(data).length / 1024).toFixed(1);

  // Miniaturas dentro de cada tarjeta de riel.
  homeState.config.rails.forEach((cfgRail, i) => {
    const cont = document.getElementById(`hr-preview-${i}`);
    if (!cont) return;
    const r = rails.find((x) => x.id === cfgRail.id);
    if (!r) {
      cont.innerHTML = '<p class="hint hr-empty">Con esta regla no llegan a 3 productos, así que el riel no se va a mostrar.</p>';
      return;
    }
    cont.innerHTML = `<div class="hr-thumbs">${r.products.map((p) => `
      <div class="hr-thumb" title="${esc(p.name)}">
        <img src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'" />
        ${p.discount_pct ? `<span class="hr-off">${p.discount_pct}%</span>` : ''}
      </div>`).join('')}</div>
      <p class="hint hr-count">${r.products.length} productos</p>`;
  });

  const summary = document.getElementById('hr-summary');
  const configuradosSinSalir = homeState.config.rails.filter((c) => !rails.some((r) => r.id === c.id));
  // Dos huecos con la MISMA regla: con "no repetir" activado el segundo se come
  // las sobras del primero y suele quedar vacío. La causa no es obvia mirando la
  // pantalla, así que se dice.
  const reglasRepetidas = [...new Set(
    homeState.config.rails.map((r) => r.rule)
      .filter((v, i, a) => a.indexOf(v) !== i)
  )].map((id) => (homeState.rules.find((x) => x.id === id) || {}).label || id);
  summary.innerHTML = `
    <h3>${icon('eye')} Lo que va a ver el cliente</h3>
    <div class="prod-totals">
      <div class="stat"><b>${rails.length}</b><span>rieles se muestran</span></div>
      <div class="stat"><b>${total}</b><span>fichas en total</span></div>
      <div class="stat"><b>${distintos}</b><span>productos distintos</span></div>
      <div class="stat"><b>${peso} KB</b><span>pesa la respuesta</span></div>
    </div>
    ${configuradosSinSalir.length ? `<p class="hint" style="margin-top:12px;">
      No se van a mostrar: ${configuradosSinSalir.map((c) => esc(c.title)).join(', ')} — la regla no junta 3 productos elegibles.</p>` : ''}
    ${reglasRepetidas.length ? `<p class="hint" style="margin-top:12px;">
      Tenés dos huecos con la misma regla (${reglasRepetidas.map(esc).join(', ')}). Con "no repetir"
      activado, el segundo sólo recibe lo que sobró del primero y puede quedar vacío.</p>` : ''}
    ${total !== distintos ? `<p class="hint" style="margin-top:12px;">Hay productos repetidos entre rieles. Activá "no repetir" si no lo querés.</p>` : ''}`;
  hydrateIcons(summary);
}

async function publishHomeRails() {
  const btn = document.getElementById('home-save-btn');
  btn.disabled = true;
  try {
    const r = await api('/api/home/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(homeState.config),
    });
    homeState.config = r.config;
    toast(`Publicado: ${r.rails.length} riel(es) en la tienda.`, 'ok');
    renderHomeRails();
    pintarPreviewHome({ rails: r.rails });
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* =========================================================================
 * TERMÓMETRO DE INTERÉS POR PRODUCTO
 *
 * Cuatro cuadrantes que separan dos problemas que se parecen y se arreglan
 * distinto: "no se vende porque nadie lo ve" (falta pauta y lugar en el home)
 * y "lo ven y no compran" (falla el precio, la foto o los talles).
 *
 * Los cortes son las medianas del propio catálogo, no números fijos, así que
 * se acomodan solos cuando cambia el tráfico.
 * ========================================================================= */

let interestState = null;
let interestFiltro = 'miran_no_compran'; // el cuadrante accionable arranca abierto

async function loadInterest({ force = false } = {}) {
  const box = document.getElementById('interest-body');
  if (!box) return;
  box.innerHTML = skeleton('stats') + skeleton('rows', 4);
  try {
    interestState = await api(`/api/products/interest?days=28${force ? '&force=1' : ''}`);
    renderInterest();
  } catch (err) {
    box.innerHTML = `<div class="panel"><h3>Termómetro de interés</h3>
      <p class="hint">No pude calcularlo: ${esc(err.message)}</p></div>`;
    hydrateIcons(box);
  }
}

function renderInterest() {
  const d = interestState;
  const box = document.getElementById('interest-body');
  const t = d.totales;
  const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
  const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

  const conteo = {};
  d.productos.forEach((p) => { conteo[p.cuadrante] = (conteo[p.cuadrante] || 0) + 1; });

  // Aviso de fuentes: qué se pudo medir y qué no. Va arriba y sin vueltas,
  // porque interpretar la pantalla depende de saberlo.
  const nombreFuente = { google_ads: 'Google Ads', meta_ads: 'Meta Ads', analytics: 'Analytics' };
  const avisos = `<div class="int-fuentes">${Object.entries(d.fuentes).map(([k, v]) =>
    `<div class="int-fuente ${v.ok ? 'ok' : 'off'}">
       <b>${v.ok ? '\u25CF' : '\u25CB'} ${nombreFuente[k] || k}</b>
       ${v.detalle ? `<span>${esc(v.detalle)}</span>` : '<span>Conectado.</span>'}
     </div>`).join('')}</div>`;

  const chips = Object.entries(d.cuadrantes).map(([id, c]) => `
    <button class="int-chip ${interestFiltro === id ? 'active' : ''}" onclick="setInterestFiltro('${id}')">
      ${esc(c.label)} <b>${conteo[id] || 0}</b>
    </button>`).join('');

  const lista = d.productos.filter((p) => p.cuadrante === interestFiltro);
  const filas = lista.length ? lista.slice(0, 40).map((p) => `
    <div class="prod-row">
      <img src="${esc(p.image_url || '')}" onerror="this.style.visibility='hidden'" />
      <div class="prod-info">
        <div class="prod-name">${p.permalink
          ? `<a href="https://blacksindumentaria.com.ar/productos/${esc(p.permalink)}/" target="_blank" rel="noopener">${esc(p.name)}</a>`
          : esc(p.name)}</div>
        <div class="prod-sub">
          stock ${p.stock ?? '—'}${p.sizes_total > 1 ? ` · talles ${p.sizes_in_stock}/${p.sizes_total}` : ''}
          · ${money(p.promo_price || p.price)}
          ${!p.elegible ? `<span class="tag-excl" title="No entra a los rieles del home">${esc(p.motivo_no_elegible || '')}</span>` : ''}
        </div>
      </div>
      <div class="int-metrics">
        <span title="Personas que vieron la ficha (Analytics)"><b>${p.views}</b>vistas</span>
        <span title="Veces que lo agregaron al carrito (Analytics)"><b>${p.carts}</b>carrito</span>
        <span title="Unidades vendidas según las órdenes reales de Tiendanube"><b>${p.sales}</b>ventas</span>
        <span title="Pauta en ESTE producto: Meta ${money(p.ad_spend_meta || 0)} + Google ${money(p.ad_spend_google || 0)}"><b>${p.ad_spend ? money(p.ad_spend) : '—'}</b>pauta</span>
      </div>
    </div>`).join('') : '<p class="hint">No hay productos en este grupo.</p>';

  // El hallazgo más caro primero: pauta corriendo hacia fichas que no se pueden
  // comprar (talles rotos, o la versión mayorista sin precio).
  const w = d.desperdicio || {};
  const alerta = w.gasto > 0 ? `
    <div class="int-alert">
      <div class="int-alert-num">${money(w.gasto)}</div>
      <div>
        <b>Pauta yendo a fichas que no se pueden comprar bien.</b>
        Son ${w.productos} de los ${w.con_pauta} productos con pauta activa —el
        <b>${w.porcentaje}% de lo que gastaste en pauta</b>— con la curva de talles rota o sin precio
        cargado. La visita se paga igual y no puede terminar en compra.
        <div class="int-alert-list">${w.detalle.slice(0, 5).map((x) =>
          `<span><b>${money(x.ad_spend)}</b> ${esc(x.name)} <i>${esc(x.motivo || '')}</i></span>`).join('')}</div>
      </div>
    </div>` : '';

  box.innerHTML = `
    <div class="panel">
      <h3>${icon('chart')} Termómetro de interés — últimos ${d.dias} días</h3>
      <p class="hint">
        Cruza las visitas y los carritos de Analytics con las ventas reales de Tiendanube y el
        gasto de pauta por producto (Meta + Google Shopping/Performance Max). Sirve para no
        confundir dos problemas distintos: que no lo vea nadie, o que lo vean y no les convenza.
      </p>
      <div class="prod-totals" style="margin-bottom:16px;">
        <div class="stat"><b>${t.vistas.toLocaleString('es-AR')}</b><span>vistas de producto</span></div>
        <div class="stat"><b>${t.carritos.toLocaleString('es-AR')}</b><span>agregados al carrito</span></div>
        <div class="stat"><b>${t.ventas}</b><span>unidades vendidas</span></div>
        <div class="stat"><b>${money(t.gasto_pauta ?? t.gasto_meta)}</b><span>pauta (Meta + Google)</span></div>
      </div>
      ${alerta}
      <div class="int-chips">${chips}</div>
      <p class="hint int-accion">${esc(d.cuadrantes[interestFiltro].accion)}</p>
      <div class="int-list">${filas}</div>
      ${lista.length > 40 ? `<p class="hint">Se muestran los 40 primeros de ${lista.length}.</p>` : ''}
      <p class="hint" style="margin-top:14px;">
        Los cortes se recalculan solos con tu catálogo: es "mucho interés" a partir de
        <b>${d.cortes.views} vistas</b> y "convierte" arriba de <b>${pct(d.cortes.conv)}</b> de conversión.
      </p>
      ${avisos}
      <button class="btn-ghost btn-sm" style="margin-top:12px;" onclick="loadInterest({force:true})">
        ${icon('refresh')} Recalcular ahora</button>
    </div>`;
  hydrateIcons(box);
}

function setInterestFiltro(id) {
  interestFiltro = id;
  renderInterest();
}


/** Fuerza el sync del catálogo desde la pestaña Home y rearma la vista previa. */
async function syncCatalogFromHome(btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${icon('refresh', 'spin')} Actualizando…`;
  try {
    // Este endpoint ya invalida la caché de los rieles al terminar.
    await api('/api/products/sync', { method: 'POST' });
    toast('Catálogo actualizado.', 'ok');
    await loadHomeRails();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = original;
  }
}


/* =========================================================================
 * ESQUEMA RECOMENDADO DEL HOME
 * En qué orden conviene poner las secciones de la landing. Cada bloque trae el
 * número real que justifica su posición: la idea es poder discutir la
 * recomendación, no creerla de memoria.
 * ========================================================================= */

async function loadHomeLayout() {
  const box = document.getElementById('home-layout');
  if (!box) return;
  box.innerHTML = skeleton('rows', 4);
  try {
    const d = await api('/api/home/layout');
    const ICONO = {
      hero: 'image', confianza: 'check', riel: 'grid', b2b: 'bolt',
      navegacion: 'list', contenido: 'film', cierre: 'send',
    };
    const bloques = d.bloques.map((b) => `
      <div class="hl-row ${b.destacado ? 'hl-key' : ''}">
        <span class="hl-pos">${b.pos}</span>
        <div class="hl-box">
          <div class="hl-name">${icon(ICONO[b.tipo] || 'list')} ${esc(b.seccion)}
            ${b.titulo ? `<span class="hl-sub">${esc(b.titulo)}</span>` : ''}
            ${b.destacado ? '<span class="hl-flag">el cambio más importante</span>' : ''}
          </div>
          <p class="hl-que">${esc(b.que)}</p>
          <p class="hl-why">${esc(b.porQue)}</p>
          ${b.dato ? `<p class="hl-dato">${icon('chart')} ${esc(b.dato)}</p>` : ''}
        </div>
      </div>`).join('');

    box.innerHTML = `
      <div class="panel">
        ${panelHead(`${icon('route')} Cómo ordenar tu página de inicio`,
    'Propuesta de orden usando las secciones reales de tu theme y los datos de tu cuenta. El orden se cambia en Tiendanube; acá se explica por qué conviene cada posición.')}
        <div class="hl-legend">
          <span><b>${d.señales.pctMayorista ?? '—'}%</b> de tus consultas son mayoristas</span>
          <span><b>${d.señales.elegibles}</b> productos entran a los rieles</span>
          <span><b>${d.señales.ofertas}</b> con precio promocional</span>
        </div>
        <div class="hl-list">${bloques}</div>
        <ul class="hl-notes">${d.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>`;
    hydrateIcons(box);
  } catch (err) {
    box.innerHTML = `<div class="panel"><p class="hint" style="margin:0;">No pude armar el esquema: ${esc(err.message)}</p></div>`;
  }
}

/* ==========================================================================
 * OFERTAS FLASH (pestaña Home)
 *
 * El dueño elige productos MINORISTAS con el buscador predictivo, les pone un %
 * y una fecha de fin. "Guardar" persiste la config; "Activar" hace que el motor
 * escriba el precio de oferta REAL en Tiendanube (una escritura por variante) y
 * "Terminar" restaura los precios. Cuando está activa no se pueden cambiar los
 * productos (habría precios escritos sin su libreta de restauración): primero se
 * termina. Ver src/flashSale.js.
 * ========================================================================== */
let flashState = { cfg: null, chosen: [], searchTimer: null, busy: false };

function flashMoney(n) {
  if (n === null || n === undefined || n === '') return '';
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
function flashDefaultPct() { return Number(flashState.cfg && flashState.cfg.default_pct) || 20; }
function flashEffPct(it) {
  const p = Number(it.pct);
  return Number.isFinite(p) && p >= 1 && p <= 90 ? p : flashDefaultPct();
}
function flashBase(it) {
  const cfg = flashState.cfg || {};
  const price = Number(it.price) || 0;
  const promo = Number(it.promo_now);
  if (cfg.discount_base === 'regular') return price;
  // 'current' (default): si hay oferta vigente, el % se aplica sobre ESA (se stackea).
  return (Number.isFinite(promo) && promo > 0 && promo < price) ? promo : price;
}
function flashFinal(it) {
  // Con la oferta ACTIVA el precio ya está escrito: es el promo vigente del cache.
  if (flashState.cfg && flashState.cfg.active) {
    const p = Number(it.promo_now);
    return (Number.isFinite(p) && p > 0) ? p : (Number(it.price) || 0);
  }
  return Math.round(flashBase(it) * (1 - flashEffPct(it) / 100));
}
/* % REAL respecto del precio regular (lo que ve el cliente tachado). */
function flashRealPct(it) {
  const price = Number(it.price) || 0;
  const final = flashFinal(it);
  return price > 0 && final < price ? Math.round(((price - final) / price) * 100) : flashEffPct(it);
}
/* Línea de precio del chip (misma en el render y al tipear el %). */
function flashPriceLineHtml(it) {
  const final = flashFinal(it);
  const active = !!(flashState.cfg && flashState.cfg.active);
  const promoNow = Number(it.promo_now);
  const warn = (!active && Number.isFinite(promoNow) && promoNow > 0 && final >= promoNow)
    ? ' <span style="color:var(--orange);font-weight:600;">⚠ no baja del precio actual</span>' : '';
  return `<span class="fc-final">${flashMoney(final)}</span> <s>${flashMoney(it.price)}</s> · -${flashRealPct(it)}%${warn}`;
}
/* ISO (UTC) -> valor para <input type="datetime-local"> en hora LOCAL. */
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function localInputToIso(val) {
  if (!val) return null;
  const d = new Date(val); // el navegador lo interpreta en hora local
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function flashTimeLeft(iso) {
  if (!iso) return '';
  let left = new Date(iso).getTime() - Date.now();
  if (left <= 0) return 'vencida';
  const d = Math.floor(left / 86400000); left -= d * 86400000;
  const h = Math.floor(left / 3600000); left -= h * 3600000;
  const m = Math.floor(left / 60000);
  return (d ? d + 'd ' : '') + h + 'h ' + m + 'm';
}

async function loadFlash() {
  const box = document.getElementById('flash-panel');
  if (!box) return;
  box.innerHTML = '<div class="panel">' + skeleton('rows', 3) + '</div>';
  try {
    const cfg = await api('/api/flash');
    flashState.cfg = cfg;
    // La lista elegida se hidrata con el detalle que trae el backend.
    flashState.chosen = (cfg.items_detail || []).filter((x) => !x.missing).map((x) => ({
      id: x.id, name: x.name, image: x.image, price: x.price, promo_now: x.promo_now || null, stock: x.stock, pct: x.pct || null,
    }));
    renderFlash();
  } catch (err) {
    box.innerHTML = `<div class="panel"><p class="hint">No pude cargar las ofertas flash: ${esc(err.message)}</p></div>`;
  }
}

function renderFlash() {
  const cfg = flashState.cfg || {};
  const active = !!cfg.active;
  const box = document.getElementById('flash-panel');

  const banner = active
    ? `<div class="flash-banner"><span data-ic="bolt"></span>
         <div><b>Oferta activa</b> — ${flashState.chosen.length} productos con precio de oferta escrito en Tiendanube.
         ${cfg.ends_at ? `Termina en <b>${esc(flashTimeLeft(cfg.ends_at))}</b>.` : 'Sin fecha de fin.'}</div>
         <button class="btn-ghost btn-sm" onclick="flashEnd()" style="margin-left:auto;">${icon('trash')} Terminar y restaurar precios</button>
       </div>`
    : `<div class="flash-banner warn"><span data-ic="info"></span>
         <div>Inactiva. Elegí productos, revisá los precios y tocá <b>Activar</b>: recién ahí se escribe el descuento real en la tienda.</div>
       </div>`;

  const metaDisabled = ''; // el título/fecha se pueden editar aún activa
  const editDisabled = active ? 'disabled' : '';

  box.innerHTML = `
  <div class="panel flash-panel">
    <div class="p-head">
      <h3>${icon('bolt')} Ofertas flash ${tip('Sección de ofertas con contador para el home. Al activar, el motor le pone el precio de oferta NATIVO a cada producto elegido, así el tachado aparece en toda la tienda y el descuento aplica de verdad en el checkout. Al terminar (o cuando vence el contador) restaura los precios.')}</h3>
      <span class="flash-status ${active ? 'on' : 'off'}">${active ? 'Activa' : 'Inactiva'}</span>
    </div>

    ${banner}

    <div class="grid-2">
      <div class="field"><label>Título que ve el cliente</label>
        <input class="input" id="flash-title" maxlength="80" value="${esc(cfg.title || 'Ofertas flash')}" /></div>
      <div class="field"><label>Subtítulo (opcional)</label>
        <input class="input" id="flash-subtitle" maxlength="160" value="${esc(cfg.subtitle || '')}" placeholder="ej: Sólo por hoy, hasta agotar stock" /></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Termina el ${tip('Cuando llega esta fecha/hora, la sección desaparece del home y los precios se restauran solos.')}</label>
        <input class="input" id="flash-ends" type="datetime-local" value="${isoToLocalInput(cfg.ends_at)}" /></div>
      <div class="field"><label>Descuento por defecto (%) ${tip('Se aplica a los productos que no tengan un % propio. Podés pisarlo producto por producto en la lista.')}</label>
        <input class="input" id="flash-default-pct" type="number" min="1" max="90" ${editDisabled} value="${cfg.default_pct || 20}" /></div>
    </div>
    <div class="field"><label>Link del botón "Ver todas" (opcional)</label>
      <input class="input" id="flash-url" value="${esc(cfg.url || '/productos')}" placeholder="/productos" /></div>

    <div class="grid-2">
      <div class="field"><label>Calcular el % sobre ${tip('Elegí sobre qué precio se aplica el descuento. "Precio actual": si el producto ya tiene una oferta, el % se suma sobre esa (nunca sube el precio que se ve). "Precio real": siempre sobre el precio sin descuento — ojo, si el producto ya tenía una oferta mayor, esto podría dejar un precio más alto que el actual.')}</label>
        <select class="input" id="flash-base" ${editDisabled}>
          <option value="current" ${(cfg.discount_base || 'current') !== 'regular' ? 'selected' : ''}>El precio actual (con descuento vigente)</option>
          <option value="regular" ${cfg.discount_base === 'regular' ? 'selected' : ''}>El precio real (sin descuento)</option>
        </select></div>
      <div class="field"><label>Color del contador ${tip('Color de las pastillas del contador en el home. Se puede cambiar aunque la oferta esté activa.')}</label>
        <input class="input" id="flash-accent" type="color" value="${esc(cfg.accent || '#111111')}" style="height:42px; padding:4px; cursor:pointer;" /></div>
    </div>

    <div class="field">
      <label>Productos en oferta ${tip('Buscá por nombre. Sólo aparecen productos minoristas (con precio y stock). El orden en que los agregás es el orden en que se ven en el home.')}</label>
      ${active
        ? '<p class="hint">Para cambiar los productos o los %, primero <b>Terminá</b> la oferta.</p>'
        : `<div class="flash-search">
             <input class="input" id="flash-search-input" placeholder="Buscar producto para agregar…" autocomplete="off" />
             <div class="flash-results" id="flash-results"></div>
           </div>`}
      <div class="flash-chosen" id="flash-chosen"></div>
      ${!active && flashState.chosen.length > 1 ? '<p class="flash-order-hint">Se muestran en este orden en el home.</p>' : ''}
    </div>

    <div class="flash-actions">
      ${active
        ? `<button class="btn-primary btn-sm" onclick="flashSave(true)">${icon('check')} Guardar cambios (título / fecha)</button>`
        : `<button class="btn-ghost btn-sm" onclick="flashSave(false)">${icon('save')} Guardar borrador</button>
           <button class="btn-primary btn-sm" onclick="flashActivate()">${icon('bolt')} Activar oferta real</button>`}
    </div>
  </div>`;

  hydrateIcons(box);
  renderFlashChosen();
  bindFlashInputs();
}

function renderFlashChosen() {
  const wrap = document.getElementById('flash-chosen');
  if (!wrap) return;
  const active = !!(flashState.cfg && flashState.cfg.active);
  if (!flashState.chosen.length) {
    wrap.innerHTML = '<p class="hint" style="margin:6px 2px;">Todavía no elegiste productos.</p>';
    return;
  }
  wrap.innerHTML = flashState.chosen.map((it, i) => {
    const final = flashFinal(it);
    const pctVal = it.pct ? it.pct : '';
    return `<div class="flash-chip ${active ? 'dim' : ''}">
      ${it.image ? `<img src="${esc(it.image)}" alt="">` : ''}
      <div class="fc-info">
        <div class="fc-name">${esc(it.name || ('#' + it.id))}</div>
        <div class="fc-price">${flashPriceLineHtml(it)}</div>
      </div>
      <div class="fc-pct">
        <input class="input" type="number" min="1" max="90" data-flash-pct="${i}" value="${pctVal}"
               placeholder="${flashDefaultPct()}" ${active ? 'disabled' : ''} title="% para este producto (vacío = usa el general)" />
        <span>%</span>
      </div>
      ${active ? '' : `<button class="fc-remove" onclick="flashRemove(${i})" title="Quitar">&times;</button>`}
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-flash-pct]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.flashPct);
      const v = Number(el.value);
      flashState.chosen[i].pct = (Number.isFinite(v) && v >= 1 && v <= 90) ? Math.round(v) : null;
      // Actualiza sólo el precio final de esa fila (sin re-render, no perder foco).
      const chip = el.closest('.flash-chip');
      const meta = chip && chip.querySelector('.fc-price');
      if (meta) meta.innerHTML = flashPriceLineHtml(flashState.chosen[i]);
    });
  });
}

function bindFlashInputs() {
  const cfg = flashState.cfg;
  const bind = (id, key, num) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { cfg[key] = num ? Number(el.value) : el.value; });
  };
  bind('flash-title', 'title');
  bind('flash-subtitle', 'subtitle');
  bind('flash-url', 'url');
  bind('flash-default-pct', 'default_pct', true);
  const ends = document.getElementById('flash-ends');
  if (ends) ends.addEventListener('input', () => { cfg.ends_at = localInputToIso(ends.value); });
  const dp = document.getElementById('flash-default-pct');
  if (dp) dp.addEventListener('input', renderFlashChosen); // el % general cambia los precios preview
  const baseSel = document.getElementById('flash-base');
  if (baseSel) baseSel.addEventListener('change', () => { cfg.discount_base = baseSel.value; renderFlashChosen(); });
  const accent = document.getElementById('flash-accent');
  if (accent) accent.addEventListener('input', () => { cfg.accent = accent.value; });

  const input = document.getElementById('flash-search-input');
  const results = document.getElementById('flash-results');
  if (input && results) {
    input.addEventListener('input', () => {
      clearTimeout(flashState.searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.classList.remove('open'); results.innerHTML = ''; return; }
      flashState.searchTimer = setTimeout(() => flashDoSearch(q), 250);
    });
    input.addEventListener('focus', () => { if (results.innerHTML) results.classList.add('open'); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.flash-search')) results.classList.remove('open');
    });
  }
}

async function flashDoSearch(q) {
  const results = document.getElementById('flash-results');
  if (!results) return;
  try {
    const rows = await api('/api/flash/search?q=' + encodeURIComponent(q));
    const chosenIds = new Set(flashState.chosen.map((c) => c.id));
    const avail = rows.filter((r) => !chosenIds.has(r.id));
    if (!avail.length) {
      results.innerHTML = '<div class="flash-empty">Sin resultados minoristas nuevos para "' + esc(q) + '".</div>';
    } else {
      results.innerHTML = avail.map((r) => `
        <div class="flash-result" onclick='flashAdd(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
          ${r.image ? `<img src="${esc(r.image)}" alt="">` : ''}
          <div class="fr-info">
            <div class="fr-name">${esc(r.name)}</div>
            <div class="fr-meta">${flashMoney(r.price)}${r.stock != null ? ' · ' + r.stock + ' en stock' : ''}</div>
          </div>
          <span class="fr-add">+</span>
        </div>`).join('');
    }
    results.classList.add('open');
  } catch (err) {
    results.innerHTML = `<div class="flash-empty">${esc(err.message)}</div>`;
    results.classList.add('open');
  }
}

function flashAdd(prod) {
  if (flashState.chosen.some((c) => c.id === prod.id)) return;
  if (flashState.chosen.length >= 12) { toast('La sección admite hasta 12 productos.', 'warn'); return; }
  flashState.chosen.push({ id: prod.id, name: prod.name, image: prod.image, price: prod.price, promo_now: prod.promo_price || null, stock: prod.stock, pct: null });
  const input = document.getElementById('flash-search-input');
  const results = document.getElementById('flash-results');
  if (input) input.value = '';
  if (results) { results.classList.remove('open'); results.innerHTML = ''; }
  renderFlashChosen();
}

function flashRemove(i) {
  flashState.chosen.splice(i, 1);
  renderFlashChosen();
}

function flashPayload() {
  const cfg = flashState.cfg || {};
  return {
    title: cfg.title,
    subtitle: cfg.subtitle,
    url: cfg.url,
    ends_at: cfg.ends_at || null,
    default_pct: Number(cfg.default_pct) || 20,
    discount_base: cfg.discount_base === 'regular' ? 'regular' : 'current',
    accent: cfg.accent || '#111111',
    items: flashState.chosen.map((c) => (c.pct ? { id: c.id, pct: c.pct } : { id: c.id })),
  };
}

async function flashSave(silent) {
  try {
    await api('/api/flash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flashPayload()) });
    toast(silent ? 'Cambios guardados.' : 'Borrador guardado.', 'ok');
    await loadFlash();
  } catch (err) { toast(err.message, 'warn'); }
}

async function flashActivate() {
  if (!flashState.chosen.length) { toast('Elegí al menos un producto.', 'warn'); return; }
  if (!flashState.cfg.ends_at) { toast('Poné una fecha de fin para el contador.', 'warn'); return; }
  const n = flashState.chosen.length;
  if (!confirm(`Vas a escribir el precio de oferta REAL en Tiendanube para ${n} producto(s).\n\nEl tachado y el precio nuevo van a aparecer en toda la tienda. Al terminar (o cuando venza el contador) se restauran solos.\n\n¿Activar ahora?`)) return;
  const btn = (typeof window !== 'undefined' && window.event && window.event.target) ? window.event.target.closest('button') : null;
  if (btn) { btn.disabled = true; btn.innerHTML = 'Aplicando precios… no cierres esta pestaña'; }
  try {
    await api('/api/flash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flashPayload()) });
    const r = await api('/api/flash/activate', { method: 'POST' });
    if (r.errores && r.errores.length) {
      toast(`Activada con ${r.errores.length} error(es). Revisá los precios.`, 'warn');
      console.warn('[flash] errores al activar:', r.errores);
    } else {
      toast(`Oferta activa: ${r.variantes_escritas} precios escritos en ${r.productos} productos.`, 'ok');
    }
    await loadFlash();
    if (typeof previewHomeRails === 'function') previewHomeRails({ silent: true });
  } catch (err) {
    toast(err.message, 'warn');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Activar oferta real'; }
  }
}

async function flashEnd() {
  if (!confirm('¿Terminar la oferta y restaurar los precios anteriores en Tiendanube?')) return;
  try {
    const r = await api('/api/flash/end', { method: 'POST' });
    toast(`Oferta terminada: ${r.restauradas} precios restaurados.`, 'ok');
    await loadFlash();
    if (typeof previewHomeRails === 'function') previewHomeRails({ silent: true });
  } catch (err) { toast(err.message, 'warn'); }
}
