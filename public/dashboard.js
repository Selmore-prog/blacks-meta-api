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
async function loadCalendar() {
  const list = document.getElementById('calendar-list');
  list.innerHTML = '<p class="loading">Cargando calendario...</p>';
  try {
    const items = await api('/api/calendar?days=14');
    if (!items.length) { list.innerHTML = '<p class="empty">No hay slots todavía.</p>'; return; }

    const groups = {};
    for (const it of items) {
      const key = String(it.scheduled_date).slice(0, 10);
      (groups[key] = groups[key] || []).push(it);
    }

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
  } catch (e) {
    list.innerHTML = `<p class="empty">Error cargando el calendario: ${esc(e.message)}</p>`;
  }
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
      <div class="story-user">
        <div class="story-avatar">B</div>
        <div><div class="u">blacks.indumentaria</div></div>
      </div>
      ${item.post_type === 'reel' ? '<div class="reel-play">▶</div>' : ''}
    </div>` : '';

  const label = isStory ? (item.post_type === 'reel' ? 'REEL · 9:16' : 'HISTORIA · 9:16') : 'FEED · 4:5';
  return `<div class="preview-wrap">
    <div class="phone ${isStory ? 'story' : 'feed'}">${media}${chrome}</div>
    <div class="fmt-label">📍 ${label}</div>
  </div>`;
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  const status = item.asset_status || item.status;
  const isSemi = item.automation_level === 'semi';
  const isRepost = item.pillar === 'repost' || item.status === 'skipped';

  const autoBadge = isRepost ? '' : (isSemi
    ? `<span class="badge semi">🟡 Semi · publicás vos</span>`
    : `<span class="badge auto">🟢 Automática</span>`);

  const statusBadge = item.asset_id ? `<span class="badge status-${status}">${status}</span>` : '';

  // acciones
  let actions = '';
  if (isRepost) {
    actions = `<span style="color:var(--muted); font-size:13px;">Día de descanso / repost — sin generación automática.</span>`;
  } else if (!item.asset_id) {
    actions = `<button class="btn-primary" data-act="generate" data-id="${item.id}">⚡ Generar pieza</button>`;
  } else if (status === 'draft') {
    actions = `<button class="btn-approve" data-act="approve" data-id="${item.asset_id}">✓ Aprobar</button>
      <button class="btn-ghost btn-sm" data-act="edit" data-id="${item.asset_id}">✎ Editar</button>
      <button class="btn-discard btn-sm" data-act="discard" data-id="${item.asset_id}">Descartar</button>`;
  } else if (status === 'approved') {
    actions = isSemi
      ? `<button class="btn-manual" data-act="publish" data-id="${item.asset_id}">📲 Cómo publicarla</button>
         <button class="btn-ghost btn-sm" data-act="edit" data-id="${item.asset_id}">✎ Editar</button>`
      : `<button class="btn-publish" data-act="publish" data-id="${item.asset_id}">🚀 Publicar ahora</button>
         <button class="btn-ghost btn-sm" data-act="edit" data-id="${item.asset_id}">✎ Editar</button>`;
  } else if (status === 'published') {
    actions = `<span class="badge status-published">✓ Publicado ${item.meta_post_id ? `· ${esc(item.meta_post_id)}` : ''}</span>`;
  } else if (status === 'discarded') {
    actions = `<button class="btn-ghost btn-sm" data-act="generate" data-id="${item.id}">↻ Regenerar</button>`;
  }

  const interaction = (isSemi && item.interaction_hint && status !== 'published')
    ? `<div class="interaction-box"><b>👉 Acción manual:</b> ${esc(item.interaction_hint)}</div>` : '';

  const caption = item.caption
    ? `<div class="caption">${esc(item.caption)}</div>${item.hashtags ? `<div class="hashtags">${esc(item.hashtags)}</div>` : ''}`
    : `<div class="caption empty">${esc(item.pillar_detail || 'Todavía sin generar.')}</div>`;

  card.innerHTML = `
    <div>${renderPreview(item)}</div>
    <div class="body">
      <div class="meta-row">
        <span class="badge type">${typeLabel(item)}</span>
        <span class="badge pillar">${esc(item.pillar)}</span>
        ${item.scheduled_time ? `<span class="badge time">🕐 ${esc(item.scheduled_time)} hs</span>` : ''}
        ${autoBadge}
        ${statusBadge}
      </div>
      ${caption}
      ${interaction}
      <div class="actions">${actions}</div>
    </div>`;

  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id, btn));
  });
  return card;
}

async function handleAction(act, id, btn) {
  try {
    if (act === 'generate') {
      btn.disabled = true; btn.textContent = 'Generando… (puede tardar)';
      await api(`/api/generate/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      toast('Pieza generada', 'ok'); loadCalendar();
    } else if (act === 'approve') {
      await api(`/api/assets/${id}/approve`, { method: 'POST' });
      toast('Aprobada', 'ok'); loadCalendar();
    } else if (act === 'discard') {
      await api(`/api/assets/${id}/discard`, { method: 'POST' });
      toast('Descartada'); loadCalendar();
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'publish') {
      await doPublish(id, btn);
    }
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; }
    loadCalendar();
  }
}

async function doPublish(id, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Procesando…';
  const data = await api(`/api/assets/${id}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });

  if (data && data.manual) {
    btn.disabled = false; btn.textContent = original;
    openManualPublish(data);
    return;
  }
  toast('¡Publicado en redes! 🚀', 'ok');
  loadCalendar();
}

function openManualPublish(data) {
  const body = `
    <p style="line-height:1.6; margin-top:0;">${esc(data.message)}</p>
    ${data.interaction_hint ? `<div class="interaction-box" style="margin:14px 0;"><b>👉 Sticker a agregar:</b> ${esc(data.interaction_hint)}</div>` : ''}
    <ol style="line-height:1.8; padding-left:20px; font-size:14px;">
      <li>Descargá la pieza y abrí Instagram.</li>
      <li>Subí la historia con esa imagen/video.</li>
      <li>Agregá el sticker indicado arriba.</li>
      <li>Copiá el texto si querés usarlo.</li>
    </ol>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px;">
      <a class="btn-primary btn-sm" href="${esc(data.video_url || data.image_url)}" target="_blank" download>⬇ Descargar pieza</a>
      <button class="btn-ghost btn-sm" id="copy-caption">📋 Copiar texto</button>
    </div>`;
  const overlay = showInfoModal('Publicación semiautomatizada', body);
  const copyBtn = overlay.querySelector('#copy-caption');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(data.caption || '').then(() => toast('Texto copiado', 'ok'));
  });
}

async function generateAllPending() {
  const items = await api('/api/calendar?days=1').catch(() => []);
  const pend = items.filter((i) => !i.asset_id && i.pillar !== 'repost' && i.status !== 'skipped');
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
async function openEdit(assetId) {
  editingId = assetId;
  const items = await api('/api/calendar?days=30');
  const it = items.find((x) => String(x.asset_id) === String(assetId));
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
    const grid = document.getElementById('ref-grid');
    grid.innerHTML = (data.references || []).map((r) => `
      <div class="ref-thumb">
        <img src="${esc(r.url)}" alt="" onerror="this.parentNode.style.opacity=.3" />
        <button class="del" onclick="deleteRef(${r.id})">&times;</button>
      </div>`).join('');
    renderProfile(data.profile);
    if (!data.geminiReady) {
      document.getElementById('analyze-btn').insertAdjacentHTML('afterend',
        '<p class="hint" style="color:var(--amber); margin-top:10px;">⚠ Cargá tu GEMINI_API_KEY para poder analizar el estilo.</p>');
    }
  } catch (e) { toast(e.message, 'err'); }
}

function renderProfile(profile) {
  const out = document.getElementById('profile-out');
  if (!profile || (!profile.voice_guide && !profile.style_guide)) {
    out.innerHTML = ''; return;
  }
  let html = '';
  const sg = profile.style_guide;
  if (sg && sg.paleta && sg.paleta.length) {
    html += `<div class="swatch-row">${sg.paleta.map((c) => `<div class="swatch" style="background:${esc(c)}" title="${esc(c)}"></div>`).join('')}</div>`;
  }
  if (profile.voice_guide) html += `<div class="voice-out"><b>Voz aprendida:</b><br>${esc(profile.voice_guide)}</div>`;
  if (sg && sg.composicion) html += `<div class="voice-out"><b>Composición:</b> ${esc(sg.composicion)}</div>`;
  out.innerHTML = html;
}

function setupStyleTab() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  if (!dz) return;
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles(input.files));
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));
}

async function uploadFiles(files) {
  if (!files || !files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  toast('Subiendo…');
  try { await api('/api/style/upload', { method: 'POST', body: fd }); toast('Piezas cargadas', 'ok'); loadStyle(); }
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

async function analyzeStyle() {
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true; btn.textContent = '🧠 Analizando… (puede tardar 20-40s)';
  try {
    const includeAccount = document.getElementById('include-account').checked;
    const data = await api('/api/style/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ includeAccount }),
    });
    toast(`Estilo aprendido (${data.analyzedImages} piezas, ${data.analyzedCaptions} textos)`, 'ok');
    renderProfile({ style_guide: data.style_guide, voice_guide: data.voice_guide });
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '🧠 Analizar y aprender estilo'; }
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

/* ============ init ============ */
loadConfig();
loadCalendar();
setupStyleTab();
