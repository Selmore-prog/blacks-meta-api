/* Propuestas editables para el canal de WhatsApp. La publicación se hace manualmente. */
(function () {
  const startInput = document.getElementById('wa-start');
  const list = document.getElementById('wa-posts');
  const summary = document.getElementById('wa-summary');
  if (!startInput || !list) return;

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  startInput.value = today;
  let posts = [];
  let allTime = null;
  let selectedProducts = [];
  const dateOnly = (value) => String(value || '').slice(0, 10);
  const attr = (value) => esc(value).replace(/"/g, '&quot;');
  function addDays(date, days) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function labelDate(date) {
    return new Date(`${dateOnly(date)}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  function textForCopy(post) {
    return post.kind === 'encuesta'
      ? `${post.body}\n${(post.poll_options || []).map((x) => `• ${x}`).join('\n')}`
      : post.body;
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); toast('Copiado', 'ok'); }
    catch (err) { toast(`No pude copiar: ${err.message}`, 'err'); }
  }
  function render() {
    const start = startInput.value;
    const byDate = new Map();
    posts.forEach((p) => { const key = dateOnly(p.post_date); if (!byDate.has(key)) byDate.set(key, []); byDate.get(key).push(p); });
    summary.innerHTML = `<b>${byDate.size} de 14 días con propuesta</b><span>${posts.length} mensajes · ${posts.filter((p) => p.kind === 'encuesta').length} encuestas · del ${esc(start)} al ${esc(addDays(start, 13))}</span>${allTime ? `<span>Total guardadas: ${allTime.total} · planificadas: ${allTime.planned || 0}${allTime.due ? ` · listas ahora: ${allTime.due}` : ''}</span>${allTime.next_scheduled_at ? '<button class="btn-ghost btn-sm" id="wa-next-planned">Ver próxima planificada</button>' : ''}` : ''}`;
    summary.querySelector('#wa-next-planned')?.addEventListener('click', () => {
      startInput.value = new Date(allTime.next_scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
      load();
    });
    list.innerHTML = Array.from({ length: 14 }, (_, i) => {
      const date = addDays(start, i);
      const dayPosts = byDate.get(date) || [];
      if (!dayPosts.length) return `<article class="wa-post wa-empty"><div class="wa-post-head"><b>${esc(labelDate(date))}</b><span>Sin propuesta</span></div><button class="btn-ghost btn-sm" data-generate="${date}">Generar este día</button></article>`;
      return dayPosts.map((p) => {
      const options = Array.isArray(p.poll_options) ? p.poll_options : [];
      const chosen = Array.isArray(p.selected_products) && p.selected_products.length ? p.selected_products
        : (p.product_id ? [{ name: p.product_name, image_url: p.product_image_url, stock: p.product_stock,
          published: p.product_published, synced_at: p.product_synced_at }] : []);
      const unavailable = chosen.some((product) => product.published === false ||
        (p.audience !== 'mayorista' && Number(product.stock) <= 0) ||
        (p.audience === 'mayorista' && product.stock != null && Number(product.stock) <= 0) ||
        !product.synced_at || Date.now() - new Date(product.synced_at).getTime() > 36 * 3600000);
      const isCustom = p.source === 'custom';
      const canCreateVisual = p.kind === 'encuesta' || chosen.length > 0;
      const due = p.scheduled_at && new Date(p.scheduled_at).getTime() <= Date.now();
      const when = p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
      const state = p.status === 'published_manual' ? 'Marcada como publicada' :
        (isCustom && p.status === 'planned' ? (due ? 'Lista para publicar' : `Planificada: ${when}`) : 'Borrador');
      return `<article class="wa-post" data-id="${p.id}">
        <div class="wa-post-head"><b>${esc(labelDate(date))}</b><span class="badge ${p.kind === 'encuesta' ? 'semi' : 'objective'}">${p.kind === 'encuesta' ? 'Encuesta' : (isCustom ? `A pedido${p.position > 1 ? ` · ${p.position}` : ''}` : 'Texto')} · ${p.audience === 'mayorista' ? 'Mayorista' : 'Minorista'}</span></div>
        <div class="wa-state">${esc(state)}</div>
        <h3>${esc(p.topic)}</h3><p class="wa-body">${esc(p.body)}</p>
        ${options.length ? `<div class="wa-options">${options.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${chosen.length ? `<div class="wa-product">${chosen[0].image_url ? `<img src="${attr(chosen[0].image_url)}" alt="" loading="lazy">` : ''}<span><b>${esc(chosen.map((x) => x.name).join(' · '))}</b>${unavailable ? '<small>Revisá stock antes de publicar</small>' : '<small>Foto real del catálogo</small>'}${chosen[0].image_url ? `<small><a href="${attr(chosen[0].image_url)}" target="_blank" rel="noopener">Abrir foto</a></small>` : ''}</span></div>` : ''}
        ${p.image_prompt ? `<details class="wa-prompt"><summary>Prompt para imagen</summary><p>${esc(p.image_prompt)}</p><button class="btn-ghost btn-sm" data-copy-prompt="${p.id}">Copiar prompt</button></details>` : ''}
        <div class="wa-actions"><button class="btn-primary btn-sm" data-copy="${p.id}">${icon('copy')} Copiar ${p.kind === 'encuesta' ? 'pregunta y opciones' : 'texto'}</button>
          ${canCreateVisual ? `<button class="btn-ghost btn-sm" data-visual="${p.id}">Crear pieza</button>` : ''}
          <button class="btn-ghost btn-sm" data-edit="${p.id}">${icon('edit')} Editar</button>
          ${p.status === 'published_manual' ? `<button class="btn-ghost btn-sm" data-status="${p.id}" data-next="draft">Volver a pendiente</button>`
            : `<button class="btn-ghost btn-sm" data-status="${p.id}" data-next="published_manual">Marcar publicada</button>`}
          ${isCustom ? '' : `<button class="btn-ghost btn-sm" data-generate="${date}">${icon('refresh')} Regenerar</button>`}
          <button class="btn-discard btn-sm" data-delete="${p.id}">${icon('trash')} Eliminar</button></div>
        ${canCreateVisual ? `<div class="wa-visual" data-visual-container="${p.id}" hidden></div>` : ''}
      </article>`;
      }).join('');
    }).join('');
    list.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.copy);
      if (post) copy(textForCopy(post));
    }));
    list.querySelectorAll('[data-copy-prompt]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.copyPrompt);
      if (post) copy(post.image_prompt);
    }));
    list.querySelectorAll('[data-visual]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.visual);
      const mount = btn.closest('.wa-post')?.querySelector('[data-visual-container]');
      if (post && mount) window.whatsappVisual.open(post, mount, btn);
    }));
    list.querySelectorAll('[data-generate]').forEach((btn) => btn.addEventListener('click', () => generate(btn.dataset.generate, 1, btn)));
    list.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
      try { await api(`/api/whatsapp-channel/${btn.dataset.status}/status`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: btn.dataset.next }) });
        await load(); }
      catch (err) { toast(err.message, 'err'); }
    }));
    list.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.edit);
      if (post) edit(post);
    }));
    list.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', async () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.delete);
      if (!post) return;
      const ok = await confirmModal('Eliminar publicación',
        `Se eliminará sólo <b>${esc(post.topic)}</b> del ${esc(labelDate(post.post_date))}. Esta acción no se puede deshacer.`, 'Eliminar');
      if (!ok) return;
      btn.disabled = true;
      try {
        await api(`/api/whatsapp-channel/${post.id}`, { method: 'DELETE' });
        toast('Publicación eliminada', 'ok');
        await load();
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
    }));
  }

  async function load() {
    if (!startInput.value) startInput.value = today;
    list.innerHTML = '<p class="loading">Cargando propuestas…</p>';
    try {
      [posts, allTime] = await Promise.all([
        api(`/api/whatsapp-channel?from=${encodeURIComponent(startInput.value)}&to=${encodeURIComponent(addDays(startInput.value, 13))}`),
        api('/api/whatsapp-channel/summary'),
      ]);
      render();
    } catch (err) { list.innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
  }
  async function generate(start, count, button) {
    if (button) button.disabled = true;
    try {
      toast(`Generando ${count === 7 ? 'la semana' : 'el día'}…`);
      const result = await api('/api/whatsapp-channel/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, count }),
      });
      toast(`${result.generated} propuesta(s) guardada(s).`, 'ok');
      await load();
    } catch (err) { toast(err.message, 'err'); }
    finally { if (button && button.isConnected) button.disabled = false; }
  }
  function edit(post) {
    const body = `<div class="field"><label>Tipo</label><select class="input" id="wa-edit-kind"><option value="texto" ${post.kind === 'texto' ? 'selected' : ''}>Texto</option><option value="encuesta" ${post.kind === 'encuesta' ? 'selected' : ''}>Encuesta</option></select></div>
      <div class="field"><label>Tema</label><input class="input" id="wa-edit-topic" value="${attr(post.topic)}"></div>
      <div class="field"><label>Texto o pregunta</label><textarea class="input" id="wa-edit-body" rows="6">${esc(post.body)}</textarea></div>
      <div class="field"><label>Opciones de encuesta (una por línea)</label><textarea class="input" id="wa-edit-options" rows="4">${esc((post.poll_options || []).join('\n'))}</textarea></div>
      <div class="field"><label>Prompt para imagen (opcional)</label><textarea class="input" id="wa-edit-prompt" rows="3">${esc(post.image_prompt || '')}</textarea></div>
      <div class="wa-actions"><button class="btn-primary" id="wa-edit-save">Guardar</button></div>`;
    const overlay = showInfoModal(`Editar ${labelDate(post.post_date)}`, body);
    overlay.querySelector('#wa-edit-save').addEventListener('click', async () => {
      const button = overlay.querySelector('#wa-edit-save'); button.disabled = true;
      try {
        await api(`/api/whatsapp-channel/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: overlay.querySelector('#wa-edit-kind').value,
            topic: overlay.querySelector('#wa-edit-topic').value, body: overlay.querySelector('#wa-edit-body').value,
            poll_options: overlay.querySelector('#wa-edit-options').value.split('\n'), image_prompt: overlay.querySelector('#wa-edit-prompt').value }) });
        overlay.remove(); toast('Propuesta guardada', 'ok'); await load();
      } catch (err) { toast(err.message, 'err'); button.disabled = false; }
    });
  }
  const productSearch = document.getElementById('wa-product-search');
  const audienceSelect = document.getElementById('wa-audience');
  const productResults = document.getElementById('wa-product-results');
  const productChosen = document.getElementById('wa-product-chosen');
  function renderChosen() {
    productChosen.innerHTML = selectedProducts.map((p) => `<span class="wa-selected-item">${esc(p.name)} <button type="button" data-remove="${p.id}" aria-label="Quitar ${attr(p.name)}">×</button></span>`).join('');
    productChosen.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
      selectedProducts = selectedProducts.filter((p) => String(p.id) !== btn.dataset.remove);
      renderChosen();
    }));
  }
  let searchTurn = 0;
  audienceSelect.addEventListener('change', () => {
    searchTurn += 1; selectedProducts = []; renderChosen();
    productSearch.value = ''; productResults.innerHTML = '';
  });
  productSearch.addEventListener('input', async () => {
    const q = productSearch.value.trim();
    const turn = ++searchTurn;
    if (q.length < 2) { productResults.innerHTML = ''; return; }
    try {
      const found = await api(`/api/products?q=${encodeURIComponent(q)}`);
      if (turn !== searchTurn) return;
      const eligible = found.filter((p) => audienceSelect.value === 'mayorista'
        ? (p.stock == null || Number(p.stock) > 0)
        : Number(p.stock) > 0 && Number(p.price) > 0).slice(0, 12);
      productResults.innerHTML = eligible.length ? eligible.map((p) => `<button type="button" class="wa-product-result" data-product="${p.id}">
        ${p.image_url ? `<img src="${attr(p.image_url)}" alt="">` : ''}<span>${esc(p.name)} <small>${p.stock == null ? 'Disponibilidad a consultar' : `${Number(p.stock)} u. en catálogo`}</small></span></button>`).join('')
        : '<p class="hint">No encontré productos disponibles para esa búsqueda.</p>';
      productResults.querySelectorAll('[data-product]').forEach((btn) => btn.addEventListener('click', () => {
        const product = eligible.find((p) => String(p.id) === btn.dataset.product);
        if (!product || selectedProducts.some((p) => String(p.id) === String(product.id))) return;
        if (selectedProducts.length >= 4) { toast('Podés elegir hasta 4 productos.', 'err'); return; }
        selectedProducts.push(product); renderChosen(); productSearch.value = ''; productResults.innerHTML = '';
      }));
    } catch (err) { if (turn === searchTurn) productResults.innerHTML = `<p class="hint">${esc(err.message)}</p>`; }
  });
  const timing = document.getElementById('wa-timing');
  const scheduleField = document.getElementById('wa-schedule-field');
  timing.addEventListener('change', () => scheduleField.classList.toggle('hidden', timing.value !== 'later'));
  document.getElementById('wa-generate-idea').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const idea = document.getElementById('wa-idea').value.trim();
    const localTime = document.getElementById('wa-schedule').value;
    if (idea.length < 5) { toast('Contame el tema en al menos cinco caracteres.', 'err'); return; }
    if (timing.value === 'later' && !localTime) { toast('Elegí fecha y hora.', 'err'); return; }
    let scheduledAt = null;
    if (timing.value === 'later') {
      const parsed = new Date(`${localTime}:00-03:00`);
      if (Number.isNaN(parsed.getTime())) { toast('Fecha y hora inválidas.', 'err'); return; }
      scheduledAt = parsed.toISOString();
    }
    button.disabled = true;
    try {
      const result = await api('/api/whatsapp-channel/from-idea', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea, audience: audienceSelect.value,
          productIds: selectedProducts.map((p) => p.id), count: Number(document.getElementById('wa-idea-count').value), scheduledAt }) });
      document.getElementById('wa-idea').value = '';
      selectedProducts = []; renderChosen();
      if (result.posts[0]) startInput.value = dateOnly(result.posts[0].post_date);
      await load();
      toast(`${result.generated} mensaje(s) listos en el plan del canal.`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { button.disabled = false; }
  });
  document.getElementById('wa-day').addEventListener('click', (e) => generate(startInput.value, 1, e.currentTarget));
  document.getElementById('wa-week').addEventListener('click', (e) => generate(startInput.value, 7, e.currentTarget));
  document.getElementById('wa-reload').addEventListener('click', load);
  startInput.addEventListener('change', load);
  window.loadWhatsAppChannel = load;
})();
