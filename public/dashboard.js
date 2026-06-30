async function loadCalendar() {
  const list = document.getElementById('calendar-list');
  list.innerHTML = '<p class="loading">Cargando calendario...</p>';

  const res = await fetch('/api/calendar?days=14');
  const items = await res.json();

  if (!items.length) {
    list.innerHTML = '<p class="loading">No hay slots en el calendario todavía.</p>';
    return;
  }

  list.innerHTML = '';
  for (const item of items) {
    list.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  if (item.video_path) {
    const video = document.createElement('video');
    video.className = 'preview';
    video.src = item.video_path;
    video.controls = true;
    video.poster = item.image_path || '';
    card.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.className = 'preview';
    img.src = item.image_path || '';
    img.alt = '';
    if (!item.image_path) img.style.display = 'none';
    card.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'body';

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = `
    <span class="pill">${item.pillar}</span>
    <span>${item.scheduled_date} · ${item.post_type}</span>
    <span class="status-${item.asset_status || 'pending'}">${item.asset_status || item.status}</span>
  `;
  body.appendChild(meta);

  if (item.caption) {
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = item.caption;
    body.appendChild(caption);

    const hashtags = document.createElement('div');
    hashtags.className = 'hashtags';
    hashtags.textContent = item.hashtags || '';
    body.appendChild(hashtags);
  } else {
    const empty = document.createElement('div');
    empty.className = 'caption';
    empty.style.opacity = 0.5;
    empty.textContent = item.pillar_detail || 'Sin generar todavía.';
    body.appendChild(empty);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';

  if (!item.asset_id) {
    const genBtn = document.createElement('button');
    genBtn.className = 'btn-generate';
    genBtn.textContent = 'Generar';
    genBtn.onclick = async () => {
      genBtn.textContent = 'Generando...';
      genBtn.disabled = true;
      await fetch(`/api/generate/${item.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      loadCalendar();
    };
    actions.appendChild(genBtn);
  } else if (item.asset_status === 'draft') {
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn-approve';
    approveBtn.textContent = 'Aprobar';
    approveBtn.onclick = async () => {
      await fetch(`/api/assets/${item.asset_id}/approve`, { method: 'POST' });
      loadCalendar();
    };
    actions.appendChild(approveBtn);

    const discardBtn = document.createElement('button');
    discardBtn.className = 'btn-discard';
    discardBtn.textContent = 'Descartar';
    discardBtn.onclick = async () => {
      await fetch(`/api/assets/${item.asset_id}/discard`, { method: 'POST' });
      loadCalendar();
    };
    actions.appendChild(discardBtn);
  } else if (item.asset_status === 'approved') {
    const publishBtn = document.createElement('button');
    publishBtn.className = 'btn-publish';
    publishBtn.textContent = 'Publicar en Redes';
    publishBtn.onclick = async () => {
      if (!confirm('¿Estás seguro de publicar esta pieza en redes sociales ahora mismo?')) return;
      publishBtn.textContent = 'Publicando...';
      publishBtn.disabled = true;
      const res = await fetch(`/api/assets/${item.asset_id}/publish`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert('Error al publicar en Meta: ' + data.error);
        publishBtn.textContent = 'Publicar en Redes';
        publishBtn.disabled = false;
      } else {
        alert('¡Publicado con éxito en redes!');
        loadCalendar();
      }
    };
    actions.appendChild(publishBtn);
  } else if (item.asset_status === 'published') {
    const publishedTag = document.createElement('span');
    publishedTag.className = 'published-badge';
    publishedTag.innerHTML = `✓ Publicado ${item.meta_post_id ? `(ID: ${item.meta_post_id})` : ''}`;
    actions.appendChild(publishedTag);
  }

  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

async function showInsightsModal() {
  const modal = document.getElementById('insights-modal');
  const body = document.getElementById('insights-body');
  modal.style.display = 'flex';
  body.innerHTML = '<p class="loading">Cargando reporte de métricas...</p>';

  try {
    const res = await fetch('/api/insights/report');
    const data = await res.json();

    let html = `<div class="recommendation-box"><strong>Recomendación automática:</strong><br>${data.recommendation}</div>`;

    if (data.pillars && data.pillars.length > 0) {
      html += `<table class="insights-table">
        <thead>
          <tr>
            <th>Pilar</th>
            <th>Posts</th>
            <th>Alcance Prom.</th>
            <th>Impresiones</th>
            <th>Guardados</th>
            <th>Shares</th>
          </tr>
        </thead>
        <tbody>`;
      for (const p of data.pillars) {
        html += `<tr>
          <td><span class="pill">${p.pillar}</span></td>
          <td>${p.posts_count}</td>
          <td><strong>${p.avg_reach || 0}</strong></td>
          <td>${p.avg_impressions || 0}</td>
          <td>${p.avg_saved || 0}</td>
          <td>${p.avg_shares || 0}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    } else {
      html += `<p class="empty-insights">Aún no hay publicaciones con métricas recolectadas.</p>`;
    }

    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p class="error">Error cargando métricas: ${err.message}</p>`;
  }
}

function closeInsightsModal() {
  document.getElementById('insights-modal').style.display = 'none';
}

loadCalendar();
