/* =========================================================================
 * PANEL "PRECIOS A LA VISTA" (Productos → Precios a la vista)
 *
 * El dueño tilda categorías mayoristas (con sus subcategorías) y le pone el
 * precio a cada producto. La tienda lo muestra en la ficha y en las tarjetas,
 * pero el producto NO se puede comprar: en Tiendanube sigue sin precio. La
 * consulta va por WhatsApp o mail, con el precio ya escrito en el mensaje.
 *
 * El precio también se puede cargar en Tiendanube, en el campo personalizado
 * "Precio a la vista" del producto (no en "Precio": ése lo vuelve comprable).
 * Si está cargado allá, gana sobre el de acá.
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, tip, panelHead,
 * hydrateIcons, skeleton). Backend: src/precioVista.js + /api/precio-vista/panel.
 * ========================================================================= */

const pvState = { data: null, categorias: [], precios: {}, guardando: false, creando: false, sucio: false };

async function pvCargar(force = false) {
  const box = document.getElementById('precio-vista-tools');
  if (!box) return;
  if (!pvState.data) box.innerHTML = '<div class="panel">' + skeleton('rows', 4) + '</div>';
  try {
    pvState.data = await api('/api/precio-vista/panel' + (force ? '?force=1' : ''));
    pvTomar(pvState.data);
    pvRender();
  } catch (err) {
    box.innerHTML = `<div class="panel">${panelHead('Precios a la vista')}
      <p class="error" style="margin:0">${esc(err.message)}</p>
      <div class="nav-acciones" style="margin-top:14px"><button class="btn-ghost btn-sm" onclick="pvCargar(true)">Reintentar</button></div>
    </div>`;
  }
}

function pvTomar(data) {
  pvState.categorias = (data.config.categorias || []).map((c) => ({ ...c }));
  pvState.precios = {};
  (data.productos || []).forEach((p) => { if (p.precio) pvState.precios[p.id] = String(p.precio); });
  pvState.sucio = false;
}

const pvPesos = (n) => '$ ' + Math.round(n).toLocaleString('es-AR');
// "289.999" o "289999" → 289999. Vacío → null.
function pvNumero(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : NaN;
}

// Lo que se ve en el campo: con punto de miles si es un número válido; si no,
// lo que escribió la persona tal cual (para que lo corrija).
function pvMostrar(v) {
  const n = pvNumero(v);
  return n ? n.toLocaleString('es-AR') : (v == null ? '' : String(v));
}

function pvRender() {
  const box = document.getElementById('precio-vista-tools');
  const d = pvState.data;
  if (!box || !d) return;
  const porId = new Map(d.arbol.map((c) => [c.id, c]));
  const elegidas = new Set(pvState.categorias.map((c) => c.id));
  const productos = d.productos || [];
  const editables = productos.filter((p) => !(p.precioTN > 0));
  const conPrecioTN = productos.filter((p) => p.precioTN > 0);
  const visibles = editables.filter((p) => p.seVe).length;
  const desdeTN = editables.filter((p) => p.precioCampo).length;
  const raros = editables.filter((p) => p.campoRaro && !p.precioCampo);

  const badge = document.getElementById('pt-pv-count');
  if (badge) { badge.textContent = visibles; badge.classList.toggle('hidden', !visibles); }

  const opciones = d.arbol.filter((c) => !elegidas.has(c.id))
    .map((c) => `<option value="${c.id}">${esc(c.ruta)}${c.productos ? ` (${c.productos})` : ''}${c.minorista ? ' · minorista' : ''}</option>`).join('');

  box.innerHTML = `<div class="panel pv-panel">
    ${panelHead('Precios a la vista, sin compra',
      'Para productos mayoristas: el precio se ve en la tienda (ficha y tarjetas), pero NO se puede comprar online. La persona consulta por WhatsApp o mail y el mensaje ya sale con el precio. El precio se carga acá o en Tiendanube, en el campo "Precio a la vista" del producto. El campo "Precio" de Tiendanube dejalo vacío: con precio ahí, el producto se vuelve comprable.',
      `<button class="btn-ghost btn-sm" onclick="pvCargar(true)"><span data-ic="refresh"></span> Refrescar</button>`)}

    ${d.error ? `<div class="flash-banner warn"><span data-ic="info"></span><div>${esc(d.error)}</div></div>` : ''}

    <h4 class="pv-h">1. Categorías ${tip('Al tildar una categoría quedan incluidas sus subcategorías. Quitarla vuelve sus productos a "mayorista sin precio" enseguida; los precios cargados quedan guardados por si la volvés a agregar.')}</h4>
    <div class="pv-cats">
      ${pvState.categorias.length ? pvState.categorias.map((c, i) => {
        const cat = porId.get(c.id);
        return `<div class="pv-cat">
          <div class="pv-cat-nombre"><b>${esc(cat ? cat.ruta : 'Categoría ' + c.id)}</b>${cat && cat.minorista ? '<span class="pv-aviso-min">es minorista</span>' : ''}</div>
          <label class="pv-op">Compra mínima
            <input class="input pv-min" type="number" min="1" max="9999" value="${c.minimo}" onchange="pvOpcion(${i}, 'minimo', this.value)"> u.
          </label>
          <label class="pv-op pv-check"><input type="checkbox" ${c.descuentos ? 'checked' : ''} onchange="pvOpcion(${i}, 'descuentos', this.checked)">
            Descuentos por cantidad ${tip('Los de la ficha mayorista: -10% desde 10 u., -15% desde 20, -18% desde 30, -20% desde 50 y 10% extra con pago anticipado. Destildado, la ficha no los muestra.')}</label>
          <label class="pv-op">El precio que cargo es
            <select class="input" onchange="pvOpcion(${i}, 'iva', this.value)">
              <option value="incluido" ${c.iva !== 'mas' ? 'selected' : ''}>Final, con IVA</option>
              <option value="mas" ${c.iva === 'mas' ? 'selected' : ''}>Sin IVA (se ve "+ IVA")</option>
            </select>
          </label>
          <button class="btn-ghost btn-sm" onclick="pvQuitar(${i})">Quitar</button>
        </div>`;
      }).join('') : '<p class="hint" style="margin:0">Todavía no elegiste ninguna. Todos los mayoristas se ven como siempre: sin precio.</p>'}
    </div>
    <div class="pv-agregar">
      <select class="input" id="pv-nueva"><option value="">Elegí una categoría…</option>${opciones}</select>
      <button class="btn-ghost btn-sm" onclick="pvAgregar()"><span data-ic="plus"></span> Agregar</button>
    </div>

    ${pvCampoHtml(d, desdeTN, raros)}

    <h4 class="pv-h">2. Precios ${tip('El precio por unidad que se muestra. Vacío = el producto se sigue viendo sin precio. Se puede escribir con punto de miles: 289.999. Si el producto tiene cargado "Precio a la vista" en Tiendanube, vale ése y acá no se puede cambiar.')}</h4>
    ${pvState.categorias.length ? `
      <p class="hint" style="margin:0 0 10px">${editables.length
        ? `<b>${visibles}</b> de ${editables.length} producto${editables.length === 1 ? '' : 's'} con el precio a la vista.`
        : 'Las categorías elegidas no tienen productos sin precio.'}
        ${d.guardadosFuera ? ` · ${d.guardadosFuera} precio${d.guardadosFuera === 1 ? '' : 's'} guardado${d.guardadosFuera === 1 ? '' : 's'} de categorías que quitaste.` : ''}</p>
      <div class="pv-lista">
        ${editables.map((p) => pvFilaHtml(p)).join('')}
      </div>
      ${conPrecioTN.length ? `<div class="flash-banner warn" style="margin-top:14px"><span data-ic="info"></span><div>
        <b>${conPrecioTN.length} producto${conPrecioTN.length === 1 ? '' : 's'} de estas categorías ya tiene${conPrecioTN.length === 1 ? '' : 'n'} precio en Tiendanube</b> y se compra${conPrecioTN.length === 1 ? '' : 'n'} online con su botón de siempre: acá no se tocan.
        Si alguno tendría que ser sólo consulta, borrale el precio en Tiendanube y cargalo acá.
        <div class="pv-tn">${conPrecioTN.slice(0, 8).map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.nombre)} · ${pvPesos(p.precioTN)}</a>`).join('')}${conPrecioTN.length > 8 ? `<span>y ${conPrecioTN.length - 8} más</span>` : ''}</div>
      </div></div>` : ''}
    ` : '<p class="hint" style="margin:0">Agregá una categoría para ver sus productos.</p>'}

    <div class="pv-pie">
      <button class="btn-primary" id="pv-guardar" onclick="pvGuardar()" ${pvState.guardando ? 'disabled' : ''}><span data-ic="check"></span> ${pvState.guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      <span class="hint" id="pv-sucio">${pvState.sucio ? 'Hay cambios sin guardar.' : 'La tienda toma los cambios en 1 a 5 minutos.'}</span>
    </div>
  </div>`;
  hydrateIcons(box);
}

// Una fila de producto. Con "Precio a la vista" cargado en Tiendanube, el campo
// de acá se apaga y muestra el de allá.
function pvFilaHtml(p) {
  const tn = p.precioCampo;
  let estado;
  if (tn) {
    estado = `${p.seVe ? `Se ve a ${pvPesos(tn)}` : `${pvPesos(tn)}`} · cargado en Tiendanube` +
      (p.precio && p.precio !== tn ? ` · el de acá (${pvPesos(p.precio)}) vuelve si lo borrás allá` : '');
  } else {
    estado = p.seVe ? `Se ve a ${pvPesos(p.precio)}` : p.precio ? 'Precio guardado (se ve al guardar)' : 'Sin precio: se ve como mayorista';
  }
  if (p.campoRaro && !tn) estado += ` · <b class="pv-raro">En Tiendanube dice «${esc(p.campoRaro)}»: no parece un precio, no se usa</b>`;
  return `<div class="pv-fila${p.publicado ? '' : ' pv-oculto'}">
    ${p.imagen ? `<img src="${esc(p.imagen)}" alt="" loading="lazy">` : '<span class="pv-sinfoto"></span>'}
    <div class="pv-prod">
      <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.nombre)}</a>
      <span class="pv-estado">${estado}${p.publicado ? '' : ' · no publicado'}</span>
    </div>
    <div class="pv-precio${tn ? ' pv-de-tn' : ''}">${tn ? '<em>Tiendanube</em>' : ''}<span>$</span>${tn
      ? `<input class="input" value="${esc(pvMostrar(tn))}" disabled title="Se cambia en Tiendanube: campo «Precio a la vista» del producto">`
      : `<input class="input" inputmode="numeric" placeholder="Sin precio" value="${esc(pvMostrar(pvState.precios[p.id]))}" oninput="pvPrecio('${p.id}', this.value)">`}</div>
  </div>`;
}

// Estado del campo "Precio a la vista" de Tiendanube.
function pvCampoHtml(d, desdeTN, raros) {
  if (!pvState.categorias.length) return '';
  const nombre = esc(d.campoNombre || 'Precio a la vista');
  if (d.campoError && !d.campo) {
    return `<div class="flash-banner warn pv-campo"><span data-ic="info"></span><div>No se pudo leer el campo «${nombre}» de Tiendanube: ${esc(d.campoError)}. Quedan los precios de acá.</div></div>`;
  }
  if (!d.campo) {
    return `<div class="pv-campo pv-campo-no">
      <div><b>¿Preferís cargar los precios desde Tiendanube?</b>
        Se puede con un campo personalizado del producto llamado «${nombre}» (como «Canal» o «Entrega»). El «Precio» de Tiendanube queda vacío, así que sigue sin poder comprarse.</div>
      <div class="nav-acciones"><button class="btn-ghost btn-sm" id="pv-crear-campo" onclick="pvCrearCampo()" ${pvState.creando ? 'disabled' : ''}><span data-ic="plus"></span> ${pvState.creando ? 'Creando…' : 'Crear el campo en Tiendanube'}</button></div>
    </div>`;
  }
  return `<div class="pv-campo pv-campo-si"><span data-ic="check"></span><div>
    <b>Se puede cargar desde Tiendanube</b>: en la edición del producto, campo personalizado «${esc(d.campo.nombre)}». Escribí el precio como acá (50.000). Si está cargado allá, vale ése; si no, el de acá. El «Precio» de Tiendanube dejalo vacío.
    <span class="pv-campo-dato">${desdeTN ? `${desdeTN} producto${desdeTN === 1 ? '' : 's'} toma${desdeTN === 1 ? '' : 'n'} el precio de Tiendanube.` : 'Todavía ningún producto de estas categorías lo tiene cargado.'}${d.campoFuera ? ` ${d.campoFuera} producto${d.campoFuera === 1 ? '' : 's'} lo tiene${d.campoFuera === 1 ? '' : 'n'} cargado pero no está${d.campoFuera === 1 ? '' : 'n'} en una categoría elegida: no se ve${d.campoFuera === 1 ? '' : 'n'}.` : ''}${raros.length ? ` <b class="pv-raro">${raros.length} con un valor que no parece precio (revisalo en la lista).</b>` : ''}${d.campoError ? ` <b class="pv-raro">La última lectura falló (${esc(d.campoError)}): se muestran los valores anteriores.</b>` : ''}</span>
  </div></div>`;
}

async function pvCrearCampo() {
  if (pvState.creando) return;
  pvState.creando = true;
  pvRender();
  try {
    const data = await api('/api/precio-vista/panel/campo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    pvState.data = data;
    pvTomar(data);
    toast('Campo creado en Tiendanube. Ya podés cargar el precio en cada producto.', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    pvState.creando = false;
    pvRender();
  }
}

function pvMarcarSucio() {
  pvState.sucio = true;
  const s = document.getElementById('pv-sucio');
  if (s) s.textContent = 'Hay cambios sin guardar.';
}

function pvOpcion(i, campo, valor) {
  const c = pvState.categorias[i];
  if (!c) return;
  if (campo === 'minimo') c.minimo = Math.max(1, Math.min(9999, Math.round(Number(valor)) || 1));
  else if (campo === 'descuentos') c.descuentos = !!valor;
  else if (campo === 'iva') c.iva = valor === 'mas' ? 'mas' : 'incluido';
  pvMarcarSucio();
}

function pvPrecio(id, valor) {
  pvState.precios[id] = valor;
  pvMarcarSucio();
}

// Agregar o quitar una categoría guarda enseguida: así aparecen (o se van) sus
// productos sin un paso más. Agregar no cambia nada en la tienda hasta que se
// carguen precios; quitar vuelve sus productos a "sin precio".
function pvAgregar() {
  const sel = document.getElementById('pv-nueva');
  const id = Number(sel && sel.value);
  if (!id) { toast('Elegí una categoría de la lista.', 'err'); return; }
  // Defaults: la ficha mayorista de siempre. Se cambian en la tarjeta.
  pvState.categorias.push({ id, minimo: 10, descuentos: true, iva: 'incluido' });
  pvGuardar();
}

function pvQuitar(i) {
  pvState.categorias.splice(i, 1);
  pvGuardar();
}

async function pvGuardar() {
  if (pvState.guardando) return;
  const precios = {};
  const malos = [];
  (pvState.data.productos || []).forEach((p) => {
    // Los que vienen de Tiendanube no se mandan: el del motor queda como estaba.
    if (p.precioTN > 0 || p.precioCampo || !(p.id in pvState.precios)) return;
    const n = pvNumero(pvState.precios[p.id]);
    if (Number.isNaN(n)) malos.push(p.nombre);
    else precios[p.id] = n;
  });
  if (malos.length) { toast(`Revisá el precio de: ${malos.slice(0, 3).join(', ')}`, 'err'); return; }
  pvState.guardando = true;
  pvRender();
  try {
    const data = await api('/api/precio-vista/panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorias: pvState.categorias, precios }),
    });
    pvState.data = data;
    pvTomar(data);
    toast('Guardado. La tienda lo muestra en 1 a 5 minutos.', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    pvState.guardando = false;
    pvRender();
  }
}
