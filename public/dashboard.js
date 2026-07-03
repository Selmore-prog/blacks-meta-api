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
async function loadConfig() {
  try {
    const c = await api('/api/config');
    const chips = document.getElementById('status-chips');
    const ai = c.geminiReady ? `<span class="chip ok"><span class="dot"></span>IA: Gemini</span>`
      : `<span class="chip warn"><span class="dot"></span>IA: Groq (cargá Gemini)</span>`;
    const img = c.aiImages ? `<span class="chip ok"><span class="dot"></span>Imágenes IA</span>` : '';
    const meta = c.metaReady ? `<span class="chip ok"><span class="dot"></span>Meta conectado</span>`
      : `<span class="chip warn"><span class="dot"></span>Meta sin conectar</span>`;
    chips.innerHTML = ai + img + meta;
  } catch (e) { /* silencioso */ }
}

/* ============ calendario ============ */
let calItems = [];
let calView = 'list';
// Horizonte de días que pedimos al calendario. Arranca en 30 para cubrir un mes
// completo de entrada (antes eran 21 y "Plan del mes" quedaba con la cola cortada
// en el calendario visible aunque el plan en sí tuviera los 31 días guardados).
// Generar el plan mensual lo puede subir más si hace falta (ver generateMonthPlan).
let calendarViewDays = 30;
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
  list.innerHTML = '<p class="loading">Cargando calendario...</p>';
  try {
    calItems = await api(`/api/calendar?days=${calendarViewDays}`);
    document.getElementById('next-plan').innerHTML =
      `${icon('bot')} <b>Automático:</b> genera piezas todos los días a las <b>07:00 ARG</b> y publica lo aprobado <b>en el horario programado de cada pieza</b>. Los posts de feed salen con su historia de refuerzo. El resto lo revisás y publicás vos desde acá.`;
    renderFilters();
    renderCalView();
  } catch (e) {
    list.innerHTML = `<p class="empty">Error cargando el calendario: ${esc(e.message)}</p>`;
  }
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
}

/**
 * Vista "Perfil": cómo va a quedar la grilla de Instagram con lo planificado.
 * Sólo lo que aparece en la grilla real (feed y reels), del más nuevo al más viejo,
 * ignorando los filtros (la grilla se evalúa completa).
 */
function renderProfileGrid() {
  const holder = document.getElementById('calendar-profile');
  const tiles = calItems
    .filter((i) => (i.post_type === 'feed' || i.post_type === 'reel') && i.image_path
      && ['draft', 'approved', 'published'].includes(i.asset_status || i.status))
    .sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date)));

  if (!tiles.length) {
    holder.innerHTML = '<p class="empty">Todavía no hay piezas de feed/reel generadas para armar la grilla.</p>';
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
        <div><b>blacks.indumentaria</b><span class="hint"> · así queda tu grilla con lo planificado (${tiles.length} piezas)</span></div>
      </div>
      <div class="pg-legend"><span class="pg-dot pub"></span> publicado <span class="pg-dot appr"></span> aprobado <span class="pg-dot draft"></span> borrador</div>
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
}

function renderCalList(items) {
  const list = document.getElementById('calendar-list');
  if (!items.length) { list.innerHTML = '<p class="empty">No hay piezas que coincidan con los filtros.</p>'; return; }
  const groups = groupByDate(items);
  list.innerHTML = '';
  for (const key of Object.keys(groups).sort()) {
    const group = groups[key];
    const g = document.createElement('div');
    g.className = 'day-group';
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
  const items = groupByDate(calItems)[key] || [];
  const theme = items.find((x) => x.theme_title)?.theme_title || '';
  const overlay = showInfoModal(`${formatDate(key)}${theme ? ' · ' + esc(theme) : ''}`, '<div id="day-detail"></div>');
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

  const note = (isReel && !vid) ? '<div class="preview-note">El video del Reel se renderiza en el proceso automático (cada 30 min). Por ahora ves la imagen base.</div>' : '';
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

  const autoBadge = isRepost ? '' : (isSemi
    ? `<span class="badge semi"><span class="idot amber"></span>Semi · publicás vos</span>`
    : `<span class="badge auto"><span class="idot green"></span>Automática</span>`);
  const statusBadge = aid ? `<span class="badge status-${item.asset_status || item.status}">${item.asset_status || item.status}</span>` : '';

  // Mayorista / Minorista a simple vista.
  const commercialBadge = item.pillar === 'mayorista'
    ? `<span class="badge whole">Mayorista</span>`
    : (['producto', 'promo'].includes(item.pillar) ? `<span class="badge retail">Minorista</span>` : '');
  const dateBadges = commercialDatesOf(item).slice(0, 2).map((d) =>
    `<span class="badge commercial" title="${esc(d.angle || '')}">${icon('tag')} ${esc(d.title)}</span>`
  ).join('');

  const regenBtn = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Regenerar</button>`;
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
    actions = `<button class="btn-primary" data-act="generate" data-id="${item.id}">${icon('bolt')} Generar pieza</button>
      <button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Con otro tema</button>${planBtn}`;
  } else if (status === 'draft') {
    actions = `<button class="btn-approve" data-act="approve" data-id="${aid}">${icon('check')} Aprobar</button>
      <button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>
      ${regenBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}
      <button class="btn-discard btn-sm" data-act="discard" data-id="${aid}">${icon('trash')} Descartar</button>${planBtn}`;
  } else if (status === 'approved') {
    actions = (isSemi
      ? `<button class="btn-manual" data-act="publish" data-id="${aid}">${icon('info')} Cómo publicarla</button>`
      : `<button class="btn-publish" data-act="publish" data-id="${aid}">${icon('send')} Publicar ahora</button>`) +
      `<button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>${regenBtn}${videoBtn}${uploadVideoBtn}${editVideoBtn}${planBtn}`;
  } else if (status === 'published') {
    actions = `<span class="badge status-published">${icon('check')} Publicado ${item.meta_post_id ? `· ${esc(item.meta_post_id)}` : ''}</span>
      <button class="btn-ghost btn-sm" data-act="republish" data-id="${aid}" title="Por si la borraste de Instagram o querés volver a publicarla">${icon('refresh')} Republicar</button>`;
  } else if (status === 'discarded') {
    actions = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('refresh')} Regenerar</button>${planBtn}`;
  }

  const interaction = (isSemi && item.interaction_hint && status !== 'published')
    ? `<div class="interaction-box"><b>${icon('alert')} Acción manual:</b> ${esc(item.interaction_hint)}</div>` : '';

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
        ${commercialBadge}
        ${dateBadges}
        ${item.scheduled_time ? `<span class="badge time">${icon('clock')} ${esc(item.scheduled_time)} hs</span>` : ''}
        ${autoBadge}${statusBadge}
      </div>
      ${caption}
      ${interaction}
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
    } else if (act === 'publish') {
      await doPublish(id, btn);
    } else if (act === 'republish') {
      if (!confirm('¿Republicar esta pieza? Queda como "aprobada" de nuevo — sale sola en la próxima pasada automática, o la publicás ahora mismo con el botón "Publicar ahora".')) return;
      await api(`/api/assets/${id}/republish`, { method: 'POST' });
      toast('Lista para volver a publicar', 'ok'); reloadKeepScroll();
    }
  } catch (e) {
    toast(e.message, 'err');
    if (btn) btn.disabled = false;
    reloadKeepScroll();
  }
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
    engagement: ['¿Qué preferís vos?', 'Contanos en qué laburás'],
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
      <button class="btn-primary" id="regen-go">${icon('wand')} Regenerar con IA</button>
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
  body.innerHTML = '<p class="loading">Cargando productos...</p>';
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
    const rowsHtml = (arr, right) => (arr && arr.length)
      ? arr.map((p) => `<div class="prod-row">
          <img src="${esc(p.image_url || '')}" onerror="this.style.visibility='hidden'"/>
          <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
            <div class="prod-sub">${esc(p.brand || '')} · stock ${p.stock ?? '—'} · ${money(p.promo_price || p.price)}</div></div>
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
        <p class="hint">Estos son los que van con precio a las historias. Si falta alguno que debería estar acá, revisá que en Tiendanube tenga precio y stock cargado, y volvé a sincronizar.</p>
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
      <li>Copiá el texto si querés usarlo.</li>
    </ol>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px;">
      <a class="btn-primary btn-sm" href="${esc(data.video_url || data.image_url)}" target="_blank" download>${icon('download')} Descargar pieza</a>
      <button class="btn-ghost btn-sm" id="copy-caption">${icon('copy')} Copiar texto</button>
    </div>`;
  const overlay = showInfoModal('Publicación semiautomatizada', body);
  const copyBtn = overlay.querySelector('#copy-caption');
  if (copyBtn) copyBtn.addEventListener('click', () =>
    navigator.clipboard.writeText(data.caption || '').then(() => toast('Texto copiado', 'ok')));
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

/* Plan mensual con IA: arma la rotación del mes (fechas comerciales + ventas + métricas). */
async function generateMonthPlan() {
  const btn = document.getElementById('btn-month-plan');
  if (!confirm('¿Generar el plan del mes con IA? Usa tus fechas comerciales, ventas y métricas. Los días ya generados/aprobados no se tocan; los pendientes se replanifican.')) return;
  btn.disabled = true;
  toast('Armando el plan del mes… (puede tardar ~30 seg)');
  try {
    const r = await api('/api/plan/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const mix = Object.entries(r.byPillar || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    toast(`Plan de ${r.month} listo (${r.days} días). ${mix}`, 'ok');
    // Re-sembrar el calendario hasta el ÚLTIMO día del mes planificado (si no, el default
    // de 14-21 días dejaba el plan "cortado" a mitad de mes en el calendario visible).
    const [y, m] = r.month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0));
    const today = new Date();
    const daysAhead = Math.max(21, Math.ceil((lastDay - today) / 86400000) + 1);
    await api('/api/calendar/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: daysAhead }) }).catch(() => {});
    calendarViewDays = Math.max(calendarViewDays, daysAhead);
    reloadKeepScroll();
  } catch (e) {
    toast(`No se pudo generar el plan: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
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

async function loadMetrics() {
  loadGaSummary();
  loadAiUsage();
  const body = document.getElementById('metrics-body');
  body.innerHTML = '<p class="loading">Cargando métricas...</p>';
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
