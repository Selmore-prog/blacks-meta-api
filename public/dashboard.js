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
const filters = { status: 'all', format: 'all', pillar: 'all', auto: 'all', q: '' };

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
    `<input class="filter-search" id="f-q" placeholder="Buscar en el texto…" value="${esc(filters.q)}" oninput="onFilter('f-q', this.value)" />` +
    `<span class="filter-count" id="f-count"></span>`;
}

function onFilter(id, val) {
  const map = { 'f-status': 'status', 'f-format': 'format', 'f-pillar': 'pillar', 'f-auto': 'auto', 'f-q': 'q' };
  filters[map[id]] = val;
  renderCalView();
}

async function loadCalendar() {
  const list = document.getElementById('calendar-list');
  list.innerHTML = '<p class="loading">Cargando calendario...</p>';
  try {
    calItems = await api('/api/calendar?days=21');
    document.getElementById('next-plan').innerHTML =
      `${icon('bot')} <b>Automático:</b> genera piezas todos los días a las <b>07:00 ARG</b> y auto-publica lo aprobado a las <b>08:00</b>. El resto lo revisás y publicás vos desde acá.`;
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
  renderCalView();
}

function renderCalView() {
  const list = document.getElementById('calendar-list');
  const grid = document.getElementById('calendar-grid');
  list.classList.toggle('hidden', calView !== 'list');
  grid.classList.toggle('hidden', calView !== 'grid');
  const items = getFiltered();
  const countEl = document.getElementById('f-count');
  if (countEl) countEl.textContent = `${items.length} de ${calItems.length} piezas`;
  if (calView === 'list') renderCalList(items); else renderCalGrid(items);
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
  const media = item.video_path
    ? `<video class="media" src="${esc(item.video_path)}" muted loop playsinline autoplay poster="${esc(item.image_path || '')}"></video>`
    : item.image_path
      ? `<img class="media" src="${esc(item.image_path)}" alt="" />`
      : `<div class="empty-media">${esc(item.pillar_detail || item.theme_title || 'Sin generar')}</div>`;

  const chrome = isStory ? `<div class="story-chrome">
      <div class="story-bars"><span></span><span></span><span></span></div>
      <div class="story-user"><div class="story-avatar">B</div><div><div class="u">blacks.indumentaria</div></div></div>
      ${item.post_type === 'reel' ? `<div class="reel-play">${icon('play')}</div>` : ''}
    </div>` : '';

  const label = isStory ? (item.post_type === 'reel' ? 'REEL · 9:16' : 'HISTORIA · 9:16') : 'FEED · 4:5';
  return `<div class="preview-wrap">
    <div class="phone ${isStory ? 'story' : 'feed'}">${media}${chrome}</div>
    <div class="fmt-label">${icon('pin')} ${label} · <span class="see">${icon('eye')} ver</span></div>
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

  let inner;
  if (!isStory) {
    inner = `<div class="ig-post">
      <div class="ig-head"><div class="ig-av">B</div><div class="ig-user">blacks.indumentaria</div><div class="ig-dots">···</div></div>
      <div class="ig-media feed">${img ? `<img src="${esc(img)}"/>` : '<div class="ig-empty">Sin imagen generada</div>'}</div>
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

  const regenBtn = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Regenerar</button>`;

  let actions = '';
  if (isRepost) {
    actions = `<span style="color:var(--muted); font-size:13px;">Día de descanso / repost — sin generación automática.</span>`;
  } else if (!aid) {
    actions = `<button class="btn-primary" data-act="generate" data-id="${item.id}">${icon('bolt')} Generar pieza</button>
      <button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('wand')} Con otro tema</button>`;
  } else if (status === 'draft') {
    actions = `<button class="btn-approve" data-act="approve" data-id="${aid}">${icon('check')} Aprobar</button>
      <button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>
      ${regenBtn}
      <button class="btn-discard btn-sm" data-act="discard" data-id="${aid}">${icon('trash')} Descartar</button>`;
  } else if (status === 'approved') {
    actions = (isSemi
      ? `<button class="btn-manual" data-act="publish" data-id="${aid}">${icon('info')} Cómo publicarla</button>`
      : `<button class="btn-publish" data-act="publish" data-id="${aid}">${icon('send')} Publicar ahora</button>`) +
      `<button class="btn-ghost btn-sm" data-act="edit" data-id="${aid}">${icon('edit')} Editar</button>${regenBtn}`;
  } else if (status === 'published') {
    actions = `<span class="badge status-published">${icon('check')} Publicado ${item.meta_post_id ? `· ${esc(item.meta_post_id)}` : ''}</span>`;
  } else if (status === 'discarded') {
    actions = `<button class="btn-ghost btn-sm" data-act="regen" data-id="${item.id}">${icon('refresh')} Regenerar</button>`;
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
        <span class="badge pillar">${esc(item.pillar)}</span>
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
      toast('Pieza generada', 'ok'); loadCalendar();
    } else if (act === 'approve') {
      await api(`/api/assets/${id}/approve`, { method: 'POST' }); toast('Aprobada', 'ok'); loadCalendar();
    } else if (act === 'discard') {
      await api(`/api/assets/${id}/discard`, { method: 'POST' }); toast('Descartada'); loadCalendar();
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'regen') {
      openRegen(item || calItems.find((x) => String(x.id) === String(id)));
    } else if (act === 'publish') {
      await doPublish(id, btn);
    }
  } catch (e) {
    toast(e.message, 'err');
    if (btn) btn.disabled = false;
    loadCalendar();
  }
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
        body: JSON.stringify({ pillarDetail: detail, theme: detail }),
      });
      overlay.remove(); toast('Pieza regenerada', 'ok'); loadCalendar();
    } catch (e) { toast(e.message, 'err'); go.disabled = false; go.innerHTML = `${icon('wand')} Regenerar con IA`; }
  });
}

async function doPublish(id, btn) {
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = `${icon('refresh', 'spin')} Procesando…`;
  const data = await api(`/api/assets/${id}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  if (data && data.manual) { btn.disabled = false; btn.innerHTML = original; openManualPublish(data); return; }
  toast('¡Publicado en redes!', 'ok'); loadCalendar();
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
  toast('Listo', 'ok'); loadCalendar();
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
    toast('Guardado', 'ok'); closeEdit(); loadCalendar();
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

    renderProfile(data.profile);
    const warn = document.getElementById('gemini-warn');
    if (!data.geminiReady && !warn) {
      document.getElementById('analyze-btn').insertAdjacentHTML('afterend',
        '<p class="hint" id="gemini-warn" style="color:var(--amber); margin-top:10px;">Cargá tu GEMINI_API_KEY para poder analizar el estilo.</p>');
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
async function loadMetrics() {
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
    out.innerHTML = `<p class="hint" style="color:var(--amber)">No pude analizar: ${esc(e.message)} (revisá permisos de Instagram insights).</p>`;
  } finally { btn.disabled = false; btn.innerHTML = `${icon('chart')} Analizar mi cuenta`; }
}

/* ============ init ============ */
hydrateIcons();
loadConfig();
loadCalendar();
setupStyleTab();
