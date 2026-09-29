/* Propuestas editables para el canal de WhatsApp. La publicación se hace manualmente. */
(function () {
  const startInput = document.getElementById('wa-start');
  const list = document.getElementById('wa-posts');
  const summary = document.getElementById('wa-summary');
  if (!startInput || !list) return;

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  startInput.value = today;
  let posts = [];
  let calendarView = 'month';
  let loadTurn = 0;
  let generating = false;
  let loadedRange = null;
  const calendar = document.getElementById('wa-calendar');
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
  function visibleRange() {
    const selected = startInput.value || today;
    const first = calendarView === 'month' ? `${selected.slice(0, 7)}-01` : selected;
    const monday = addDays(first, -(new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7);
    if (calendarView === 'week') return { from: monday, to: addDays(monday, 6), days: 7 };
    const next = new Date(`${first}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = addDays(next.toISOString().slice(0, 10), -1);
    const days = Math.ceil((Math.round((new Date(last) - new Date(monday)) / 86400000) + 1) / 7) * 7;
    return { from: monday, to: addDays(monday, days - 1), days };
  }
  function shiftPeriod(direction) {
    if (calendarView === 'week') startInput.value = addDays(startInput.value, direction * 7);
    else {
      const current = new Date(`${startInput.value}T12:00:00Z`);
      const day = current.getUTCDate();
      current.setUTCDate(1);
      current.setUTCMonth(current.getUTCMonth() + direction);
      const last = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
      current.setUTCDate(Math.min(day, last));
      startInput.value = current.toISOString().slice(0, 10);
    }
    load();
  }
  function selectDate(date) {
    startInput.value = date;
    const range = visibleRange();
    const hadCalendarFocus = calendar.contains(document.activeElement);
    const restoreFocus = () => { if (hadCalendarFocus) calendar.querySelector(`[data-date="${date}"]`)?.focus({ preventScroll: true }); };
    if (loadedRange?.from === range.from && loadedRange?.to === range.to) { render(); restoreFocus(); }
    else load().then(restoreFocus);
  }
  function renderCalendar(byDate) {
    const range = visibleRange();
    const selected = startInput.value;
    const monthLabel = new Date(`${selected}T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    document.getElementById('wa-period').textContent = calendarView === 'month' ? monthLabel
      : `${labelDate(range.from)} — ${labelDate(range.to)}`;
    document.getElementById('wa-prev').setAttribute('aria-label', calendarView === 'month' ? 'Mes anterior' : 'Semana anterior');
    document.getElementById('wa-next').setAttribute('aria-label', calendarView === 'month' ? 'Mes siguiente' : 'Semana siguiente');
    document.querySelectorAll('[data-wa-view]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.waView === calendarView)));
    calendar.innerHTML = `<div class="wa-weekdays" aria-hidden="true">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="wa-calendar-days">${Array.from({ length: range.days }, (_, i) => {
        const date = addDays(range.from, i);
        const items = byDate.get(date) || [];
        const pending = items.filter(p => p.status !== 'published_manual').length;
        const state = items.length ? (pending ? 'pending' : 'published') : 'empty';
        return `<button type="button" class="wa-calendar-day ${date.slice(0,7) !== selected.slice(0,7) ? 'outside' : ''} ${date === today ? 'is-today' : ''}"
          data-date="${date}" aria-pressed="${date === selected}" aria-label="${attr(labelDate(date))}${date === today ? ', hoy' : ''}: ${items.length} mensajes, ${pending} pendientes">
          <span class="wa-date-number">${Number(date.slice(-2))}</span>
          ${items.length ? `<span class="wa-day-topic">${esc(items[0].topic || 'Mensaje')}</span><span class="wa-day-count ${state}"><i></i>${items.length}<span class="wa-count-label"> ${items.length === 1 ? 'mensaje' : 'mensajes'}${pending ? ` · ${pending} pend.` : ' · publicado'}</span></span>` : '<span class="wa-day-topic wa-day-empty">Sin propuesta</span>'}
        </button>`;
      }).join('')}</div>`;
    calendar.querySelectorAll('[data-date]').forEach(btn => {
      btn.addEventListener('click', () => selectDate(btn.dataset.date));
      btn.addEventListener('keydown', event => {
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!delta) return;
        const target = calendar.querySelector(`[data-date="${addDays(btn.dataset.date, delta)}"]`);
        if (target) { event.preventDefault(); target.focus(); }
      });
    });
    const count = (byDate.get(selected) || []).length;
    document.getElementById('wa-selected-title').textContent = labelDate(selected);
    document.getElementById('wa-selected-count').textContent = count ? `${count} ${count === 1 ? 'mensaje' : 'mensajes'}` : 'Sin propuestas todavía';
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
    const inPeriod = calendarView === 'month' ? posts.filter(p => dateOnly(p.post_date).slice(0,7) === start.slice(0,7)) : posts;
    const pending = inPeriod.filter(p => p.status !== 'published_manual').length;
    summary.innerHTML = `<b>${inPeriod.length} mensajes ${calendarView === 'month' ? 'este mes' : 'esta semana'}</b><span>${pending} pendientes · ${inPeriod.length - pending} publicados</span>${allTime?.next_scheduled_at ? '<button class="btn-ghost btn-sm" id="wa-next-planned">Ver próxima planificada</button>' : ''}`;
    renderCalendar(byDate);
    summary.querySelector('#wa-next-planned')?.addEventListener('click', () => {
      startInput.value = new Date(allTime.next_scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
      load();
    });
    list.innerHTML = [start].map(date => {
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
    updateGenerationButtons();
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
    list.querySelectorAll('[data-generate]').forEach((btn) => btn.addEventListener('click', () => generate(btn.dataset.generate, 1)));
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
    const turn = ++loadTurn;
    loadedRange = null;
    const range = visibleRange();
    calendar.setAttribute('aria-busy', 'true');
    calendar.inert = true;
    list.innerHTML = '<p class="loading">Cargando propuestas…</p>';
    try {
      const result = await Promise.all([
        api(`/api/whatsapp-channel?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
        api('/api/whatsapp-channel/summary'),
      ]);
      if (turn !== loadTurn) return;
      [posts, allTime] = result;
      loadedRange = range;
      render();
    } catch (err) {
      if (turn !== loadTurn) return;
      loadedRange = null;
      calendar.innerHTML = '';
      summary.textContent = '';
      list.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    } finally {
      if (turn === loadTurn) { calendar.setAttribute('aria-busy', 'false'); calendar.inert = false; }
    }
  }
  function updateGenerationButtons() {
    document.querySelectorAll('#wa-day, #wa-week, #wa-posts [data-generate]').forEach(btn => { btn.disabled = generating; });
  }
  async function generate(start, count) {
    if (generating) return;
    generating = true;
    updateGenerationButtons();
    try {
      toast(`Generando ${count === 7 ? 'la semana' : 'el día'}…`);
      const result = await api('/api/whatsapp-channel/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, count }),
      });
      toast(`${result.generated} propuesta(s) guardada(s).`, 'ok');
      await load();
    } catch (err) { toast(err.message, 'err'); }
    finally { generating = false; updateGenerationButtons(); }
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
  document.getElementById('wa-prev').addEventListener('click', () => shiftPeriod(-1));
  document.getElementById('wa-next').addEventListener('click', () => shiftPeriod(1));
  document.getElementById('wa-today').addEventListener('click', () => selectDate(today));
  document.querySelectorAll('[data-wa-view]').forEach(btn => btn.addEventListener('click', () => {
    calendarView = btn.dataset.waView; load();
  }));
  document.getElementById('wa-day').addEventListener('click', () => generate(startInput.value, 1));
  document.getElementById('wa-week').addEventListener('click', () => generate(startInput.value, 7));
  document.getElementById('wa-reload').addEventListener('click', load);
  startInput.addEventListener('change', load);
  window.loadWhatsAppChannel = load;
})();
