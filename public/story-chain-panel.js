/* =========================================================================
 * CADENA DE HISTORIAS (Calendario → Nueva → Cadena de historias)
 *
 * Varias historias seguidas, una por producto, con la foto real, el % OFF y el
 * precio (como la historia de "20% OFF" del Black Friday). Se eligen los productos
 * de una categoría de la tienda (Black Friday, Cyber…) o a mano con el buscador,
 * y queda UNA tarjeta en el calendario con todas las historias adentro.
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, icon, hydrateIcons,
 * showInfoModal, todayKey, markGenerating, reloadKeepScroll, catalogProductSearch).
 * Backend: src/storyChain.js + /api/story-chain.
 * ========================================================================= */

const SC_MAX = 15;
const scAttr = (s) => esc(s).replace(/"/g, '&quot;');
const scMoney = (v) => `$${Math.round(Number(v)).toLocaleString('es-AR')}`;

/** Config guardada en el slot (story_chain), con los mismos valores por defecto del server. */
function scConfigDe(item) {
  let c = item && item.story_chain;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = null; } }
  return c && typeof c === 'object' ? c : null;
}

/**
 * Abre el armador. Sin `item` crea una cadena nueva; con `item` (una tarjeta que ya es
 * cadena) la edita: mismos productos y textos, y al guardar se rehace.
 */
async function openStoryChain(item = null) {
  const cfg = scConfigDe(item) || {};
  const editando = Boolean(item && scConfigDe(item));
  const st = {
    categoria: cfg.categoria_id || null,
    productos: [],          // [{ id, name, image_url, price, promo_price, off, stock, publicable, elegido }]
    nombreTocado: Boolean(cfg.nombre),
    volantaTocada: Boolean(cfg.volanta),
  };

  const body = `
    <p class="hint" style="margin-top:0;">Una historia por producto, con la foto real, el % OFF y el precio tachado, una atrás de la otra. Queda <b>una tarjeta</b> en el calendario con todas adentro, en el lugar de la historia de ese día.</p>
    <div class="field">
      <label>Productos de la categoría</label>
      <select class="input" id="sc-cat"><option value="">Cargando categorías…</option></select>
    </div>
    <div id="sc-prods" class="sc-prods"></div>
    <div class="field" style="margin-top:10px;">
      <label>Sumar otro producto</label>
      <input class="input" id="sc-search" placeholder="Buscá por nombre, marca o link" autocomplete="off" />
      <div id="sc-search-results"></div>
    </div>
    <div class="plan-grid" style="margin-top:6px;">
      <div class="field"><label>Nombre de la cadena</label><input class="input" id="sc-nombre" maxlength="40" value="${scAttr(cfg.nombre || '')}" placeholder="Black Friday" /></div>
      <div class="field"><label>Texto chico de arriba</label><input class="input" id="sc-volanta" maxlength="32" value="${scAttr(cfg.volanta || '')}" placeholder="BLACK FRIDAY" /></div>
      <div class="field"><label>Titular grande</label>
        <select class="input" id="sc-titulo-modo">
          <option value="descuento" ${cfg.titulo_modo !== 'texto' ? 'selected' : ''}>El % OFF de cada producto</option>
          <option value="texto" ${cfg.titulo_modo === 'texto' ? 'selected' : ''}>Un texto igual para todas</option>
        </select></div>
      <div class="field" id="sc-titulo-wrap"><label>Texto del titular</label><input class="input" id="sc-titulo" maxlength="34" value="${scAttr(cfg.titulo || '')}" placeholder="Últimas horas" /></div>
      <div class="field"><label>Botón</label><input class="input" id="sc-cta" maxlength="30" value="${scAttr(cfg.cta || 'Comprá en la web')}" /></div>
      <div class="field"><label>Imagen</label>
        <select class="input" id="sc-arte">
          <option value="foto" ${cfg.arte !== 'ia' ? 'selected' : ''}>Foto real del catálogo · gratis</option>
          <option value="ia" ${cfg.arte === 'ia' ? 'selected' : ''}>Escena con IA · ${scAttr(scCostoIa())} c/u</option>
        </select></div>
      <div class="field"><label>Día</label><input class="input" id="sc-fecha" type="date" value="${scAttr(item ? String(item.scheduled_date).slice(0, 10) : todayKey())}" /></div>
      <div class="field"><label>Hora (para publicar sola)</label><input class="input" id="sc-hora" type="time" value="${scAttr((item && item.scheduled_time) || '')}" /></div>
    </div>
    <label class="check-row" style="margin-bottom:10px;"><input type="checkbox" id="sc-portada" ${cfg.portada === false ? '' : 'checked'} /> Sumar una portada al principio (nombre de la cadena, descuento máximo y las prendas)</label>
    <div class="field">
      <label>Cómo se publica</label>
      <select class="input" id="sc-pub">
        <option value="semi" ${!item || item.automation_level !== 'auto' ? 'selected' : ''}>La subo yo, con el link de cada producto (recomendado)</option>
        <option value="auto" ${item && item.automation_level === 'auto' ? 'selected' : ''}>Que se publique sola a su hora, sin link</option>
      </select>
      <p class="hint" id="sc-pub-hint" style="margin:6px 0 0;"></p>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:14px;">
      <span class="hint" id="sc-resumen" style="margin:0 auto 0 0;"></span>
      <button class="btn-discard" id="sc-cancel">Cancelar</button>
      <button class="btn-primary" id="sc-go">${icon('bolt')} ${editando ? 'Rehacer cadena' : 'Crear cadena'}</button>
    </div>`;
  const overlay = showInfoModal(editando ? 'Editar cadena de historias' : 'Cadena de historias', body);
  overlay.querySelector('.modal').classList.add('sc-modal');
  const $ = (sel) => overlay.querySelector(sel);

  const elegidos = () => st.productos.filter((p) => p.elegido);
  const resumen = () => {
    const n = elegidos().length;
    const portada = $('#sc-portada').checked && n > 1 ? 1 : 0;
    const ia = $('#sc-arte').value === 'ia';
    $('#sc-resumen').textContent = n
      ? `${n + portada} historia${n + portada === 1 ? '' : 's'}${ia ? ` · hasta ${scCostoIa(n)}` : ' · gratis'}`
      : 'Elegí al menos un producto';
    $('#sc-go').disabled = !n;
  };
  const pubHint = () => {
    $('#sc-pub-hint').textContent = $('#sc-pub').value === 'auto'
      ? 'Instagram no deja poner el sticker de link por API: salen en orden a la hora elegida, sin link.'
      : 'Al aprobarla, "Cómo publicarla" te da cada historia con el link de su producto listo para copiar al sticker.';
  };
  const tituloModo = () => { $('#sc-titulo-wrap').style.display = $('#sc-titulo-modo').value === 'texto' ? '' : 'none'; };

  /* ---- lista de productos: tildar, ordenar con flechas, sacar ---- */
  function pintarProductos() {
    const cont = $('#sc-prods');
    if (!st.productos.length) {
      cont.innerHTML = '<p class="hint" style="margin:4px 0;">Elegí una categoría o buscá productos abajo.</p>';
      resumen();
      return;
    }
    cont.innerHTML = st.productos.map((p, i) => {
      const precio = p.price ? (p.off ? `<b>${scMoney(p.promo_price)}</b> <s>${scMoney(p.price)}</s> <span class="sc-off">-${p.off}%</span>` : `<b>${scMoney(p.price)}</b> · sin descuento`) : 'sin precio';
      const motivo = !p.publicable ? `<span class="sc-warn">${!p.image_url ? 'sin foto' : (p.stock !== null && p.stock <= 0) ? 'sin stock' : 'sin precio'} · no entra</span>` : '';
      return `<div class="prod-row sc-row${p.elegido ? '' : ' off'}" data-i="${i}">
        <input type="checkbox" class="sc-chk" ${p.elegido ? 'checked' : ''} ${p.publicable ? '' : 'disabled'} title="Incluir en la cadena" />
        <img src="${scAttr(p.image_url || '')}" onerror="this.style.visibility='hidden'" alt=""/>
        <div class="prod-info"><div class="prod-name">${esc(p.name)}</div>
          <div class="prod-sub">${precio}${p.stock !== null ? ` · stock ${p.stock}` : ''} ${motivo}</div></div>
        <div class="sc-move">
          <button type="button" class="btn-ghost btn-sm sc-up" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-ghost btn-sm sc-down" title="Bajar" ${i === st.productos.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>`;
    }).join('') + `<div class="sc-bulk"><button type="button" class="btn-ghost btn-sm" id="sc-all">Tildar todos</button><button type="button" class="btn-ghost btn-sm" id="sc-none">Destildar todos</button></div>`;
    cont.querySelectorAll('.sc-row').forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector('.sc-chk').addEventListener('change', (e) => {
        if (e.target.checked && elegidos().length >= SC_MAX) { e.target.checked = false; toast(`Hasta ${SC_MAX} productos por cadena.`, 'err'); return; }
        st.productos[i].elegido = e.target.checked; pintarProductos();
      });
      const mover = (d) => { const j = i + d; [st.productos[i], st.productos[j]] = [st.productos[j], st.productos[i]]; pintarProductos(); };
      row.querySelector('.sc-up').addEventListener('click', () => mover(-1));
      row.querySelector('.sc-down').addEventListener('click', () => mover(1));
    });
    $('#sc-all').addEventListener('click', () => {
      let n = 0;
      st.productos.forEach((p) => { p.elegido = p.publicable && n < SC_MAX; if (p.elegido) n += 1; });
      pintarProductos();
    });
    $('#sc-none').addEventListener('click', () => { st.productos.forEach((p) => { p.elegido = false; }); pintarProductos(); });
    resumen();
  }

  function sumar(lista, { elegir = true } = {}) {
    const ya = new Set(st.productos.map((p) => String(p.id)));
    let n = elegidos().length;
    lista.forEach((p) => {
      if (ya.has(String(p.id))) return;
      const elegido = elegir && p.publicable && n < SC_MAX;
      if (elegido) n += 1;
      st.productos.push({ ...p, elegido });
    });
  }

  async function cargarCategoria(id) {
    st.categoria = id || null;
    if (!id) { pintarProductos(); return; }
    $('#sc-prods').innerHTML = skeleton('rows', 3);
    try {
      const r = await api(`/api/story-chain/products?category=${encodeURIComponent(id)}`);
      // Los que se sumaron a mano y están tildados se quedan; lo demás se reemplaza.
      st.productos = st.productos.filter((p) => p.elegido && p.manual);
      sumar(r.productos || []);
      // Nombre y volanta sugeridos desde la categoría, mientras el dueño no los escribió.
      const nombre = $('#sc-cat').selectedOptions[0]?.dataset.nombre || '';
      if (!st.nombreTocado && nombre) $('#sc-nombre').value = nombre;
      if (!st.volantaTocada && nombre) $('#sc-volanta').value = nombre.toUpperCase();
    } catch (err) {
      toast(`No pude traer los productos: ${err.message}`, 'err');
    }
    pintarProductos();
  }

  // Eventos de los campos.
  $('#sc-cancel').addEventListener('click', () => overlay.remove());
  $('#sc-nombre').addEventListener('input', () => {
    st.nombreTocado = true;
    if (!st.volantaTocada) $('#sc-volanta').value = $('#sc-nombre').value.toUpperCase();
  });
  $('#sc-volanta').addEventListener('input', () => { st.volantaTocada = true; });
  $('#sc-titulo-modo').addEventListener('change', tituloModo);
  $('#sc-arte').addEventListener('change', resumen);
  $('#sc-portada').addEventListener('change', resumen);
  $('#sc-pub').addEventListener('change', pubHint);
  $('#sc-cat').addEventListener('change', (e) => cargarCategoria(e.target.value));
  let busqueda;
  $('#sc-search').addEventListener('input', (e) => {
    clearTimeout(busqueda);
    const q = e.target.value.trim();
    busqueda = setTimeout(() => catalogProductSearch(overlay, q, async (p) => {
      $('#sc-search').value = '';
      $('#sc-search-results').innerHTML = '';
      try {
        const r = await api(`/api/story-chain/products?ids=${p.id}`);
        const fila = (r.productos || [])[0];
        if (!fila) return;
        if (!fila.publicable) toast('Ese producto no tiene stock, foto o precio: no entra en la cadena.', 'err');
        sumar([{ ...fila, manual: true }]);
        pintarProductos();
      } catch (err) { toast(err.message, 'err'); }
    }, 'sc-search-results'), 250);
  });
  tituloModo(); pubHint(); pintarProductos();

  // Categorías (y, si se está editando, los productos guardados en su orden).
  try {
    const [cats, guardados] = await Promise.all([
      api('/api/story-chain/categories'),
      editando ? api(`/api/story-chain/products?ids=${scIdsDe(item).join(',')}`) : Promise.resolve(null),
    ]);
    const sel = $('#sc-cat');
    sel.innerHTML = `<option value="">— Elegí una categoría —</option>` + (cats.categorias || []).map((c) =>
      `<option value="${c.id}" data-nombre="${scAttr(c.nombre)}">${esc(c.nombre)} · ${c.productos} producto${c.productos === 1 ? '' : 's'}${c.en_oferta ? `, ${c.en_oferta} en oferta` : ''}</option>`).join('');
    if (guardados) {
      sumar((guardados.productos || []).map((p) => ({ ...p, manual: true })));
      if (st.categoria) sel.value = String(st.categoria);
      pintarProductos();
    } else if (cats.sugerida) {
      sel.value = String(cats.sugerida);
      await cargarCategoria(cats.sugerida);
    }
  } catch (err) {
    $('#sc-cat').innerHTML = '<option value="">No pude traer las categorías</option>';
    toast(err.message, 'err');
  }

  /* ---- crear / rehacer ---- */
  async function enviar(reemplazar = false) {
    const ids = elegidos().map((p) => p.id);
    if (!ids.length) { toast('Elegí al menos un producto.', 'err'); return; }
    if ($('#sc-titulo-modo').value === 'texto' && !$('#sc-titulo').value.trim()) { toast('Escribí el texto del titular.', 'err'); return; }
    const go = $('#sc-go');
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} Armando…`;
    try {
      const r = await fetch('/api/story-chain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: editando ? item.id : null,
          reemplazar,
          fecha: $('#sc-fecha').value,
          hora: $('#sc-hora').value,
          productos: ids,
          categoria_id: st.categoria,
          nombre: $('#sc-nombre').value.trim(),
          volanta: $('#sc-volanta').value.trim(),
          titulo_modo: $('#sc-titulo-modo').value,
          titulo: $('#sc-titulo').value.trim(),
          cta: $('#sc-cta').value.trim(),
          arte: $('#sc-arte').value,
          portada: $('#sc-portada').checked,
          publicacion: $('#sc-pub').value,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409 && data.conflicto) {
        const c = data.conflicto;
        const ok = window.confirm(`El ${$('#sc-fecha').value} ya tiene una historia: “${c.tema}”.${c.tiene_pieza ? ' Ya está generada.' : ''}\n\nEl calendario tiene un solo lugar de historia por día. ¿La reemplazo por la cadena? (la pieza anterior queda en el historial)`);
        if (ok) return enviar(true);
        return;
      }
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      overlay.remove();
      toast(`Armando ${ids.length + ($('#sc-portada').checked && ids.length > 1 ? 1 : 0)} historias en segundo plano…`, 'ok');
      markGenerating(data.slot.id);
      reloadKeepScroll();
    } catch (err) {
      toast(`No pude crear la cadena: ${err.message}`, 'err');
    } finally {
      if (document.body.contains(go)) { go.disabled = false; go.innerHTML = `${icon('bolt')} ${editando ? 'Rehacer cadena' : 'Crear cadena'}`; }
    }
  }
  $('#sc-go').addEventListener('click', () => enviar(false));
}

function scIdsDe(item) {
  let ids = item && item.forced_product_ids;
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (_) { ids = null; } }
  return (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
}

/** Costo estimado de las escenas con IA (el precio por imagen lo da /api/config). */
function scCostoIa(n = 1) {
  const usd = Number((typeof appCfg !== 'undefined' && appCfg && appCfg.imageCostUsd) || 0.04) * n;
  return `US$ ${usd.toFixed(2).replace('.', ',')}`;
}

/** ¿La tarjeta es una cadena de historias? */
function isStoryChain(item) {
  return Boolean(item && (scConfigDe(item) || item.template === 'cadena'));
}

/** La receta de cada historia de la cadena (producto, link), en orden. */
function storyChainShots(item) {
  let m = item && item.slides_meta;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = null; } }
  return m && m.mode === 'cadena' && Array.isArray(m.shots) ? m.shots : [];
}

/**
 * "Cómo publicarla" de una cadena: cada historia con su imagen, para bajarla, y el link
 * de su producto para el sticker de link, en el orden en que hay que subirlas.
 */
function openChainManualPublish(data) {
  const stories = data.stories || [];
  const body = `
    <p style="line-height:1.6; margin-top:0;">Subilas <b>en este orden</b> desde Instagram. A cada una ponele el <b>sticker de link</b> con el link de su producto (tiene seguimiento: después vemos qué historia trajo visitas y ventas).</p>
    <div class="sc-pub-list">
      ${stories.map((s, i) => `<div class="sc-pub-row">
        <img src="${scAttr(s.image_url)}" alt="" loading="lazy"/>
        <div class="sc-pub-info">
          <div class="prod-name">${i + 1}. ${esc(s.name)}</div>
          ${s.link_url ? `<input class="input" readonly value="${scAttr(s.link_url)}" />` : ''}
          <div class="sc-pub-actions">
            <button class="btn-ghost btn-sm" data-dl="${i}">${icon('download')} Bajar</button>
            ${s.link_url ? `<button class="btn-ghost btn-sm" data-link="${i}">${icon('copy')} Copiar link</button>` : ''}
          </div>
        </div>
      </div>`).join('')}
    </div>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
      <button class="btn-primary btn-sm" id="sc-dl-all">${icon('download')} Bajar todas</button>
    </div>`;
  const ov = showInfoModal(`Cadena · ${stories.length} historias para subir`, body);
  const nombre = (i) => `historia-${String(i + 1).padStart(2, '0')}.jpg`;
  ov.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => saveFile(stories[Number(b.dataset.dl)].image_url, nombre(Number(b.dataset.dl)))));
  ov.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () =>
    navigator.clipboard.writeText(stories[Number(b.dataset.link)].link_url).then(() => toast(`Link de la historia ${Number(b.dataset.link) + 1} copiado`, 'ok'))));
  ov.querySelector('#sc-dl-all').addEventListener('click', async () => {
    toast(`Bajando ${stories.length} historias…`);
    for (let i = 0; i < stories.length; i += 1) await saveFile(stories[i].image_url, nombre(i));
  });
}

/* ---------------------------------------------------------------------------
 * CORREGIR UNA HISTORIA DE LA CADENA (pedido del 27-nov: "la primera foto quedó
 * rara, con mucho espacio en blanco; poner algo para corregir esas cosas en la
 * pieza de la cadena"). Rehace SÓLO esa historia: cómo se acomoda la foto, otra
 * foto del producto, otro titular o escena con IA. Queda guardada la anterior
 * (Volver atrás) y el ajuste se respeta si después se rehace la cadena entera.
 * ------------------------------------------------------------------------- */
const SC_COMPOSICIONES = [
  { v: '', t: 'Automática', d: 'La elige el sistema según cómo viene cortada la foto' },
  { v: 'estudio_abajo', t: 'Foto arriba, texto abajo', d: 'La prenda arriba y el precio abajo' },
  { v: 'estudio_arriba', t: 'Texto arriba, foto abajo', d: 'Para calzado, remeras y prendas anchas' },
  { v: 'estudio_escena', t: 'Foto grande, fundida', d: 'A todo el ancho, se funde con el fondo del texto' },
  { v: 'estudio_lado', t: 'Texto al costado', d: 'Sólo para prendas largas y angostas' },
];

async function openChainStoryFix(item, index, onDone) {
  const shots = storyChainShots(item);
  const shot = shots[index] || {};
  const slides = parseSlides(item.slides) || [];
  const portada = shot.kind === 'portada';
  const previo = shot.ajustes || {};
  const st = { composicion: previo.composicion || '', foto: previo.foto || '', fotos: [] };

  const body = `
    <div class="sc-fix">
      <img class="sc-fix-actual" src="${scAttr(slides[index] || '')}" alt="Historia actual"/>
      <div class="sc-fix-form">
        <p class="hint" style="margin-top:0;">Historia ${index + 1} de ${slides.length} · <b>${esc(shot.name || '')}</b>. Se rehace sólo ésta; la de ahora queda guardada en <b>Volver atrás</b>.</p>
        ${portada ? '' : `
        <div class="field"><label>Cómo se acomoda la foto</label>
          <p class="hint" id="scf-comp-hint" style="margin:0 0 6px;"></p>
          <div class="sc-comp">${SC_COMPOSICIONES.map((c) => `<button type="button" class="sc-comp-opt${c.v === st.composicion ? ' on' : ''}" data-v="${c.v}"><b>${esc(c.t)}</b><small>${esc(c.d)}</small></button>`).join('')}</div>
        </div>
        <div class="field"><label>Foto del producto</label><div class="sc-fotos" id="scf-fotos">${skeleton('rows', 1)}</div></div>`}
        <div class="field"><label>Titular ${portada ? '' : '(vacío = el de la cadena)'}</label>
          <input class="input" id="scf-titulo" maxlength="34" value="${scAttr(previo.titulo || '')}" placeholder="${portada ? 'BLACK FRIDAY' : (shot.off ? `${shot.off}% OFF` : 'Titular')}" /></div>
        ${portada ? '' : `<label class="check-row"><input type="checkbox" id="scf-ia" ${previo.arte === 'ia' ? 'checked' : ''}/> Escena con IA sólo para esta historia · ${scAttr(scCostoIa())}</label>`}
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
          <button class="btn-discard" id="scf-cancel">Cancelar</button>
          <button class="btn-primary" id="scf-go">${icon('wand')} Rehacer esta historia</button>
        </div>
      </div>
    </div>`;
  const ov = showInfoModal('Corregir esta historia', body);
  ov.querySelector('.modal').classList.add('sc-modal');
  const $ = (sel) => ov.querySelector(sel);
  $('#scf-cancel').addEventListener('click', () => ov.remove());
  const marcarComp = () => ov.querySelectorAll('.sc-comp-opt').forEach((x) => x.classList.toggle('on', x.dataset.v === st.composicion));
  ov.querySelectorAll('.sc-comp-opt').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    st.composicion = b.dataset.v;
    marcarComp();
  }));

  /* Cada foto admite algunas composiciones y no otras (una foto cortada en la cintura no
     puede ir con el texto arriba: el pantalón queda encima del titular). Se mide la foto
     elegida y se apagan las que no van; el servidor igual lo controla. */
  let pedido = 0;
  async function revisarComposiciones() {
    if (portada || !shot.product_id) return;
    const n = ++pedido;
    const hint = $('#scf-comp-hint');
    hint.textContent = 'Mirando cómo viene la foto…';
    try {
      const r = await api(`/api/story-chain/composiciones?product=${shot.product_id}${st.foto ? `&url=${encodeURIComponent(st.foto)}` : ''}`);
      if (n !== pedido) return;
      const validas = new Set(r.validas || []);
      ov.querySelectorAll('.sc-comp-opt').forEach((b) => {
        const ok = !b.dataset.v || validas.has(b.dataset.v);
        b.disabled = !ok;
        b.title = ok ? '' : `No va con esta foto${r.corte ? ` (${r.corte})` : ''}`;
      });
      if (st.composicion && !validas.has(st.composicion)) { st.composicion = ''; marcarComp(); }
      const auto = SC_COMPOSICIONES.find((c) => c.v === r.automatica);
      hint.textContent = !r.estudio ? 'Esta foto no es de estudio: va a sangre, con el texto encima.'
        : `${r.corte ? `La foto ${r.corte}. ` : ''}${auto ? `Automática = ${auto.t.toLowerCase()}. ` : ''}Las apagadas no van con esta foto.`;
    } catch (_) {
      if (n === pedido) hint.textContent = '';
    }
  }

  // Fotos del producto: la elegida (o la principal) marcada.
  if (!portada && shot.product_id) {
    try {
      const r = await api(`/api/story-chain/products?ids=${shot.product_id}`);
      st.fotos = ((r.productos || [])[0] || {}).fotos || [];
    } catch (_) { st.fotos = []; }
    const cont = $('#scf-fotos');
    if (cont) {
      const actual = st.foto || st.fotos[0];
      cont.innerHTML = st.fotos.length
        ? st.fotos.map((u) => `<button type="button" class="sc-foto${u === actual ? ' on' : ''}" data-u="${scAttr(u)}"><img src="${scAttr(u)}" alt="" loading="lazy"/></button>`).join('')
        : '<p class="hint">Este producto tiene una sola foto.</p>';
      cont.querySelectorAll('.sc-foto').forEach((b) => b.addEventListener('click', () => {
        st.foto = b.dataset.u === st.fotos[0] ? '' : b.dataset.u; // la principal = sin ajuste
        cont.querySelectorAll('.sc-foto').forEach((x) => x.classList.toggle('on', x === b));
        revisarComposiciones();
      }));
    }
    revisarComposiciones();
  }

  $('#scf-go').addEventListener('click', async () => {
    const go = $('#scf-go');
    const ia = !portada && $('#scf-ia').checked;
    go.disabled = true; go.innerHTML = `${icon('refresh', 'spin')} ${ia ? 'Generando la escena (hasta 30 s)…' : 'Rehaciendo…'}`;
    try {
      const r = await api(`/api/assets/${item.asset_id}/chain-story`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index,
          composicion: portada ? '' : st.composicion,
          foto: portada ? '' : st.foto,
          titulo: $('#scf-titulo').value.trim(),
          arte: ia ? 'ia' : '',
        }),
      });
      ov.remove();
      toast(`Historia ${index + 1} rehecha`, 'ok');
      if (onDone) onDone(r);
    } catch (err) {
      toast(`No pude rehacerla: ${err.message}`, 'err');
      go.disabled = false; go.innerHTML = `${icon('wand')} Rehacer esta historia`;
    }
  });
}
