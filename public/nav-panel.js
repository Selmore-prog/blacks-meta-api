/* =========================================================================
 * PANEL DEL MENÚ — la pantalla para personalizar los ítems de navegación.
 *
 * Sale de que cada ítem especial del menú estaba escrito a mano en el theme
 * (un `if` por "Looks", otro por "Combos"), así que para poner una
 * "SUPERLIQUIDACIÓN" había que editar Twig y volver a subir el theme.
 *
 * Depende de los helpers que provee dashboard.js: api, esc, toast, panelHead,
 * tip. Los mismos que usa home-blocks-panel.js.
 * Backend: src/navMenu.js + las rutas /api/nav/* de src/server.js.
 * ========================================================================= */

const navState = { campos: [], fuentes: [], badges: [], grupos: [], items: [], reglas: [], abierta: null };

/* --------------------------------------------------------------- cargar - */

async function navCargar() {
  const cont = document.getElementById('hs-menu');
  if (!cont) return;
  try {
    const d = await api('/api/nav/menu');
    navState.campos = d.fields || [];
    navState.fuentes = d.fuentes || [];
    navState.badges = d.badges || [];
    navState.grupos = d.grupos || [];
    navState.items = d.items || [];
    navState.reglas = (d.config && d.config.reglas) || [];
    navRender();
  } catch (err) {
    cont.innerHTML = `<p class="error">No se pudo cargar: ${esc(err.message)}</p>`;
  }
}

/* --------------------------------------------------------------- render - */

function navRender() {
  const cont = document.getElementById('hs-menu');
  if (!cont) return;

  const filas = navState.reglas.length
    ? navState.reglas.map((r, i) => navFila(r, i)).join('')
    : `<p class="hint" style="margin:0 0 16px">Todavía no hay ninguna regla. Agregá una para ponerle un globito,
       un color o una imagen a un ítem del menú.</p>`;

  cont.innerHTML = `
    <p class="hint" style="margin:0 0 16px">
      Los ítems del menú se siguen creando en <b>Tiendanube</b>, con sus productos y su URL.
      Acá les ponés el <b>aspecto</b>: un globito, un color, un fondo que salte a la vista,
      o directamente una imagen o un GIF en lugar de la palabra.
      Los cambios se ven en la tienda apenas publicás.
    </p>
    <div class="nav-reglas">${filas}</div>
    <div class="nav-acciones">
      <button class="btn" onclick="navAgregar()">+ Agregar una regla</button>
      <button class="btn btn-primary" onclick="navPublicar()">Publicar en la tienda</button>
    </div>
    <div class="nav-previa">
      <h4>Así se va a ver</h4>
      <div class="nav-previa-caja" id="nav-previa"></div>
    </div>`;
  navPrevia();
}

function navFila(r, i) {
  const abierta = navState.abierta === i;
  const item = navState.items.find((o) => o.value === r.match);
  const nombre = item ? item.label : (r.match_text || r.match || 'Sin elegir');
  const que = [
    r.badge_text ? `globito "${r.badge_text}"` : '',
    r.bg ? 'fondo' : '', r.color ? 'color' : '',
    r.image ? 'imagen' : '', r.font ? r.font : '', r.hide ? 'escondido' : '',
    r.thumb ? 'miniatura' : '', r.mega_image ? 'foto en el desplegable' : '',
  ].filter(Boolean).join(' · ') || 'sin nada todavía';

  return `
    <div class="nav-regla ${abierta ? 'abierta' : ''} ${r.enabled === false ? 'apagada' : ''}">
      <div class="nav-regla-cab" onclick="navAbrir(${i})">
        <div>
          <strong>${esc(nombre)}</strong>
          <span class="nav-regla-que">${esc(que)}</span>
        </div>
        <div class="nav-regla-btns">
          <button class="btn btn-sm" onclick="event.stopPropagation();navToggle(${i})">${r.enabled === false ? 'Activar' : 'Pausar'}</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();navBorrar(${i})">Borrar</button>
        </div>
      </div>
      ${abierta ? `<div class="nav-regla-cuerpo">${navCampos(r, i)}</div>` : ''}
    </div>`;
}

function navCampos(r, i) {
  // Partido en grupos: dieciocho controles en una lista corrida no se leen.
  // Cada grupo contesta una pregunta — a qué ítem, cómo se ve, qué fotos lleva.
  const grupos = navState.grupos.length ? navState.grupos : [{ id: null, label: '' }];
  return grupos.map((g) => {
    const campos = navState.campos.filter((c) => (g.id ? c.grupo === g.id : true));
    const html = navUnCampo(campos, r, i);
    if (!html.trim()) return '';
    return `<div class="nav-grupo">
      ${g.label ? `<h5 class="nav-grupo-tit">${esc(g.label)}</h5>` : ''}
      <div class="nav-grupo-campos">${html}</div>
    </div>`;
  }).join('');
}

function navUnCampo(campos, r, i) {
  return campos.map((c) => {
    // `when` esconde el campo si el otro no está puesto (mismo criterio que los
    // bloques del home): no tiene sentido preguntar el color del globito si no
    // hay globito.
    if (c.when && c.when.lleno && !r[c.when.key]) return '';
    const v = r[c.key] == null ? (c.default == null ? '' : c.default) : r[c.key];
    const ayuda = c.help ? `<span class="nav-help">${esc(c.help)}</span>` : '';
    let control = '';

    if (c.type === 'categoria') {
      const ops = navState.items.map((o) => {
        const dato = o.productos ? ` (${o.productos} productos${o.stock ? '' : ', sin stock'})` : ' (vacía)';
        return `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}${esc(dato)}</option>`;
      }).join('');
      control = `<select onchange="navSet(${i},'${c.key}',this.value)">
        <option value="">— Elegí una categoría —</option>${ops}</select>`;
    } else if (c.type === 'opciones') {
      control = `<select onchange="navSet(${i},'${c.key}',this.value)">${
        (c.options || []).map((o) => `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')
      }</select>`;
    } else if (c.type === 'switch') {
      control = `<label class="nav-sw"><input type="checkbox" ${v ? 'checked' : ''}
        onchange="navSet(${i},'${c.key}',this.checked)"> <span>Sí</span></label>`;
    } else if (c.type === 'color') {
      control = `<div class="nav-color">
        <input type="color" value="${esc(v || '#FF6B00')}" oninput="navSet(${i},'${c.key}',this.value)">
        <input type="text" value="${esc(v)}" placeholder="#FF6B00" onchange="navSet(${i},'${c.key}',this.value)">
        ${v ? `<button class="btn btn-sm" onclick="navSet(${i},'${c.key}','')">Sacar</button>` : ''}
      </div>`;
    } else if (c.type === 'imagen') {
      control = `<div class="nav-img">
        ${v ? `<img src="${esc(v)}" alt="">` : '<span class="nav-img-vacia">Sin imagen</span>'}
        <button class="btn btn-sm" onclick="navSubir(${i},'${c.key}')">${v ? 'Cambiar' : 'Subir PNG o GIF'}</button>
        ${v ? `<button class="btn btn-sm" onclick="navSet(${i},'${c.key}','')">Sacar</button>` : ''}
      </div>`;
    } else if (c.type === 'numero') {
      control = `<input type="number" value="${esc(v)}" min="${c.min || 0}" max="${c.max || 999}"
        onchange="navSet(${i},'${c.key}',this.value)">`;
    } else {
      control = `<input type="text" value="${esc(v)}" maxlength="${c.max || 60}"
        placeholder="${esc(c.placeholder || '')}" onchange="navSet(${i},'${c.key}',this.value)">`;
    }
    return `<label class="nav-campo"><span class="nav-label">${esc(c.label)}</span>${control}${ayuda}</label>`;
  }).join('');
}

/* ------------------------------------------------------------- acciones - */

function navAbrir(i) { navState.abierta = navState.abierta === i ? null : i; navRender(); }
function navAgregar() {
  navState.reglas.push({ device: 'todos', badge_style: 'sale', image_h: 22, enabled: true });
  navState.abierta = navState.reglas.length - 1;
  navRender();
}
function navBorrar(i) {
  if (!confirm('¿Borrar esta regla? El ítem del menú no se toca, sólo se le saca el estilo.')) return;
  navState.reglas.splice(i, 1);
  if (navState.abierta === i) navState.abierta = null;
  navRender();
}
function navToggle(i) {
  navState.reglas[i].enabled = navState.reglas[i].enabled === false;
  navRender();
}
function navSet(i, k, v) {
  navState.reglas[i][k] = v;
  navRender();
}

function navSubir(i, k) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/gif,image/webp,image/svg+xml,image/jpeg';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const mb = f.size / (1024 * 1024);
    if (mb > 10) { toast(`Pesa ${mb.toFixed(1)} MB y el máximo es 10 MB.`, 'error'); return; }
    // Un ítem del menú mide 22 px de alto: un archivo de más de 300 KB ahí es
    // siempre un GIF sin optimizar, y lo paga cada visita.
    if (f.size > 300 * 1024) {
      const sigue = confirm(`El archivo pesa ${Math.round(f.size / 1024)} KB. En el menú se ve a unos 22 px de alto, `
        + 'así que con menos de 100 KB alcanza y sobra. Se sube igual si querés. ¿Seguimos?');
      if (!sigue) return;
    }
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api('/api/home/blocks/upload', { method: 'POST', body: fd });
      navSet(i, k, r.url);
      toast('Listo, ya está arriba.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };
  inp.click();
}

async function navPublicar() {
  try {
    const r = await api('/api/nav/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reglas: navState.reglas }),
    });
    navState.reglas = r.config.reglas;
    navRender();
    toast('Publicado. En la tienda se ve al recargar.', 'ok');
  } catch (err) { toast(err.message, 'error'); }
}

/* --------------------------------------------------------------- previa - */

/**
 * Dibuja un menú de mentira con las reglas puestas. No pide nada al servidor:
 * aplica lo mismo que aplica la tienda, para que lo que se ve acá sea lo que
 * va a pasar allá.
 */
function navPrevia() {
  const caja = document.getElementById('nav-previa');
  if (!caja) return;

  const activas = navState.reglas.filter((r) => r.enabled !== false && !r.hide);
  const base = ['Inicio', 'Urbano', 'Industria', 'Calzado'];
  const propios = activas.map((r) => {
    const it = navState.items.find((o) => o.value === r.match);
    return { nombre: it ? it.label : (r.match_text || 'Ítem'), r };
  });

  const html = base.map((n) => `<span class="np-item">${esc(n)}</span>`).join('')
    + propios.map(({ nombre, r }) => {
      const est = [];
      if (r.color) est.push(`color:${esc(r.color)}`);
      if (r.bg) est.push(`background:${esc(r.bg)};padding:4px 10px;border-radius:4px`);
      if (r.font) { est.push(`font-family:'${esc(r.font)}',Inter,sans-serif`); navPedirFuente(r.font); }
      const cuerpo = r.image
        ? `<img src="${esc(r.image)}" alt="" style="height:${Number(r.image_h) || 22}px;vertical-align:middle">`
        : (r.thumb
          ? `<img class="np-thumb" src="${esc(r.thumb)}" alt="">${esc(nombre)}`
          : esc(nombre));
      const badge = r.badge_text
        ? `<span class="np-badge" data-fx="${esc(r.badge_style || 'sale')}">${esc(r.badge_text)}</span>` : '';
      return `<span class="np-item" style="${est.join(';')}">${cuerpo}${badge}</span>`;
    }).join('');

  const escondidos = navState.reglas.filter((r) => r.enabled !== false && r.hide).length;

  // Las placas del desplegable se muestran aparte: en la tienda sólo se ven al
  // pasar el mouse por su ítem, así que en la previa no pueden estar en la fila.
  const conPlaca = activas.filter((r) => r.mega_image);
  const placas = conPlaca.length ? `
    <div class="np-placas">
      <p class="np-placas-tit">Al abrir el desplegable (sólo en computadora)</p>
      <div class="np-placas-fila">${conPlaca.map((r) => {
        const it = navState.items.find((o) => o.value === r.match);
        return `<a class="np-placa">
          <img src="${esc(r.mega_image)}" alt="">
          <span class="np-placa-body">
            ${r.mega_kicker ? `<span class="np-placa-kicker">${esc(r.mega_kicker)}</span>` : ''}
            <span class="np-placa-tit">${esc(r.mega_title || (it ? it.label : 'Título'))}</span>
            ${r.mega_text ? `<span class="np-placa-txt">${esc(r.mega_text)}</span>` : ''}
            ${r.mega_cta ? `<span class="np-placa-cta">${esc(r.mega_cta)} →</span>` : ''}
          </span></a>`;
      }).join('')}</div>
    </div>` : '';

  caja.innerHTML = `<div class="np-menu">${html}</div>` + placas
    + (escondidos ? `<p class="np-nota">Además se esconden ${escondidos} ítem(s).</p>` : '');
}

const navFuentesPedidas = {};
function navPedirFuente(nombre) {
  if (!nombre || navFuentesPedidas[nombre]) return;
  navFuentesPedidas[nombre] = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(nombre).replace(/%20/g, '+') + '&display=swap';
  document.head.appendChild(l);
}
