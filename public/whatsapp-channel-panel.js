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
    const byDate = new Map(posts.map((p) => [dateOnly(p.post_date), p]));
    summary.innerHTML = `<b>${posts.length} de 14 días con propuesta</b><span>${posts.filter((p) => p.kind === 'encuesta').length} encuestas · ${posts.filter((p) => p.kind === 'texto').length} textos · del ${esc(start)} al ${esc(addDays(start, 13))}</span>${allTime ? `<span>Total guardadas: ${allTime.total}</span>` : ''}`;
    list.innerHTML = Array.from({ length: 14 }, (_, i) => {
      const date = addDays(start, i);
      const p = byDate.get(date);
      if (!p) return `<article class="wa-post wa-empty"><div class="wa-post-head"><b>${esc(labelDate(date))}</b><span>Sin propuesta</span></div><button class="btn-ghost btn-sm" data-generate="${date}">Generar este día</button></article>`;
      const options = Array.isArray(p.poll_options) ? p.poll_options : [];
      const unavailable = p.product_id && (p.product_published === false || Number(p.product_stock) <= 0 ||
        !p.product_synced_at || Date.now() - new Date(p.product_synced_at).getTime() > 36 * 3600000);
      return `<article class="wa-post" data-id="${p.id}">
        <div class="wa-post-head"><b>${esc(labelDate(date))}</b><span class="badge ${p.kind === 'encuesta' ? 'semi' : 'objective'}">${p.kind === 'encuesta' ? 'Encuesta' : 'Texto'}</span></div>
        <h3>${esc(p.topic)}</h3><p class="wa-body">${esc(p.body)}</p>
        ${options.length ? `<div class="wa-options">${options.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${p.product_name ? `<div class="wa-product">${p.product_image_url ? `<img src="${attr(p.product_image_url)}" alt="" loading="lazy">` : ''}<span><b>${esc(p.product_name)}</b>${unavailable ? '<small>Revisá stock antes de publicar</small>' : '<small>Foto real del catálogo</small>'}${p.product_image_url ? `<small><a href="${attr(p.product_image_url)}" target="_blank" rel="noopener">Abrir foto</a></small>` : ''}</span></div>` : ''}
        ${p.image_prompt ? `<details class="wa-prompt"><summary>Prompt para imagen</summary><p>${esc(p.image_prompt)}</p><button class="btn-ghost btn-sm" data-copy-prompt="${p.id}">Copiar prompt</button></details>` : ''}
        <div class="wa-actions"><button class="btn-primary btn-sm" data-copy="${p.id}">${icon('copy')} Copiar ${p.kind === 'encuesta' ? 'pregunta y opciones' : 'texto'}</button>
          <button class="btn-ghost btn-sm" data-edit="${p.id}">${icon('edit')} Editar</button>
          <button class="btn-ghost btn-sm" data-generate="${date}">${icon('refresh')} Regenerar</button></div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.copy);
      if (post) copy(textForCopy(post));
    }));
    list.querySelectorAll('[data-copy-prompt]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.copyPrompt);
      if (post) copy(post.image_prompt);
    }));
    list.querySelectorAll('[data-generate]').forEach((btn) => btn.addEventListener('click', () => generate(btn.dataset.generate, 1, btn)));
    list.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const post = posts.find((p) => String(p.id) === btn.dataset.edit);
      if (post) edit(post);
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
  document.getElementById('wa-day').addEventListener('click', (e) => generate(startInput.value, 1, e.currentTarget));
  document.getElementById('wa-week').addEventListener('click', (e) => generate(startInput.value, 7, e.currentTarget));
  document.getElementById('wa-reload').addEventListener('click', load);
  startInput.addEventListener('change', load);
  window.loadWhatsAppChannel = load;
})();
