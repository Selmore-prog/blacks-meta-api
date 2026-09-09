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

const navState = { campos: [], fuentes: [], badges: [], grupos: [], items: [], reglas: [], abierta: null, sucio: false, menu: [], vista: 'desktop', abierto: null };

/* Campos de los que DEPENDEN otros (los que aparecen en algún `when`). Sólo al
   cambiar uno de estos hay que rehacer el formulario, porque cambia QUÉ campos
   se muestran. Para todo lo demás, tocar el DOM es un error — ver navSet(). */
function navDisparanRedibujo() {
  return new Set(navState.campos.filter((c) => c.when && c.when.key).map((c) => c.when.key));
}

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
    navState.menu = (d.menu && d.menu.items) || [];
    navState.reglas = (d.config && d.config.reglas) || [];
    navRender();
    navSucio(false);
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
      <button class="btn" onclick="navImportar()">Importar lo que ya está puesto</button>
      <button class="btn btn-primary" id="nav-publicar" onclick="navPublicar()">Publicar en la tienda</button>
      <span class="nav-sucio hidden" id="nav-sucio">Hay cambios sin publicar</span>
    </div>
    <div class="nav-previa">
      <h4>Así se va a ver</h4>
      <div class="nav-previa-caja" id="nav-previa"></div>
    </div>`;
  navPrevia();
}

function navNombreDe(r) {
  const item = navState.items.find((o) => o.value === r.match);
  return item ? item.label : (r.match_text || r.match || 'Sin elegir');
}

function navQueHace(r) {
  return [
    r.badge_text ? `globito "${r.badge_text}"` : '',
    r.bg ? 'fondo' : '', r.color ? 'color' : '',
    r.image ? 'imagen' : '', r.font ? r.font : '', r.hide ? 'escondido' : '',
    r.thumb ? 'miniatura' : '', r.mega_image ? 'foto en el desplegable' : '',
  ].filter(Boolean).join(' · ') || 'sin nada todavía';
}

function navFila(r, i) {
  const abierta = navState.abierta === i;
  const nombre = navNombreDe(r);
  const que = navQueHace(r);

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
/**
 * Guarda un valor y actualiza lo MÍNIMO de la pantalla.
 *
 * ⚠️ Antes esto llamaba a navRender(), que rehace todo el HTML del panel. Era un
 * bug feo y silencioso: los <input> guardan con `onchange`, que dispara cuando
 * el campo pierde el foco — o sea, JUSTO al hacer clic en "Publicar". El DOM se
 * rehacía entre el mousedown y el mouseup, el botón dejaba de existir y **el
 * clic nunca llegaba**. Se editaba, se apretaba Publicar y no pasaba nada.
 * (Verificado: después del change, document.contains(botón) === false.)
 * De paso se perdía el foco en cada tecla y el selector de color, que usa
 * `oninput`, rehacía la pantalla en cada píxel del arrastre.
 */
function navSet(i, k, v) {
  const antes = navState.reglas[i][k];
  navState.reglas[i][k] = v;
  navSucio(true);

  // Rehacer el formulario sólo si aparecen o desaparecen campos.
  if (navDisparanRedibujo().has(k) && (!antes !== !v)) { navRender(); return; }

  navPrevia();
  navResumen(i);
}

/** Refresca sólo la línea de resumen de una regla, sin tocar su formulario. */
function navResumen(i) {
  const cab = document.querySelectorAll('.nav-regla')[i];
  if (!cab) return;
  const r = navState.reglas[i];
  const nom = cab.querySelector('strong');
  const que = cab.querySelector('.nav-regla-que');
  if (nom) nom.textContent = navNombreDe(r);
  if (que) que.textContent = navQueHace(r);
}

/** Marca que hay cambios sin publicar, y lo dice — si no, se pierden al salir. */
function navSucio(v) {
  navState.sucio = v;
  const aviso = document.getElementById('nav-sucio');
  if (aviso) aviso.classList.toggle('hidden', !v);
  const btn = document.getElementById('nav-publicar');
  if (btn) btn.classList.toggle('nav-pendiente', !!v);
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

/**
 * Trae a reglas lo que hoy está configurado a mano en el theme. Es el paso
 * previo a apagar los sistemas viejos: sin esto, apagarlos borraría fotos y
 * miniaturas que hay que rehacer de memoria.
 * No publica solo: deja las reglas cargadas para revisar.
 */
async function navImportar() {
  if (navState.reglas.length && !confirm(
    'Voy a leer el menú de tu tienda y agregar una regla por cada globito, miniatura y foto '
    + 'que ya tengas puestos. Las reglas que ya cargaste se conservan. ¿Sigo?')) return;
  try {
    const r = await api('/api/nav/menu/importar');
    if (!r.ok) { toast(r.error || 'No se pudo leer la tienda.', 'error'); return; }
    if (!r.reglas.length) { toast('No encontré nada configurado para importar.', 'ok'); return; }

    // No se pisan las reglas que ya existen para el mismo ítem: lo cargado a
    // mano gana sobre lo que se lee de la tienda.
    const yaEstan = new Set(navState.reglas.map((x) => x.match).filter(Boolean));
    const nuevas = r.reglas.filter((x) => !yaEstan.has(x.match));
    navState.reglas = navState.reglas.concat(nuevas);
    navRender();
    navSucio(true);
    const s = r.resumen;
    toast(`Importadas ${nuevas.length}: ${s.badges} globitos, ${s.miniaturas} miniaturas, `
      + `${s.placas} foto(s) de desplegable. Revisá y publicá.`, 'ok');
  } catch (err) { toast(err.message, 'error'); }
}

async function navPublicar() {
  try {
    const r = await api('/api/nav/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reglas: navState.reglas }),
    });
    navState.reglas = r.config.reglas;
    navSucio(false);
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
/**
 * VISTA PREVIA — el menú real de la tienda con las reglas puestas.
 *
 * Antes dibujaba cuatro ítems inventados en una fila. Servía para ver un color
 * y nada más: no se veía cómo queda el globito AL LADO de los ítems que
 * realmente están al lado, ni cómo entra la placa en el desplegable de esa
 * categoría, ni qué pasa en el celular. Ahora usa la estructura real
 * (navState.menu, leída del HTML de la tienda) y tiene las dos vistas.
 */
function navPrevia() {
  const caja = document.getElementById('nav-previa');
  if (!caja) return;

  if (!navState.menu.length) {
    caja.innerHTML = '<p class="np-vacio">No pude leer el menú de la tienda para la vista previa. '
      + 'Las reglas igual se publican bien.</p>';
    return;
  }

  const esCel = navState.vista === 'mobile';
  caja.className = 'nav-previa-caja' + (esCel ? ' np-cel' : '');
  caja.innerHTML = `
    <div class="np-switch">
      <button class="np-tab ${!esCel ? 'on' : ''}" onclick="navVista('desktop')">Computadora</button>
      <button class="np-tab ${esCel ? 'on' : ''}" onclick="navVista('mobile')">Celular</button>
      ${!esCel ? '<span class="np-ayuda">Tocá un ítem con flechita para abrir su desplegable</span>' : ''}
    </div>
    ${esCel ? navPreviaCel() : navPreviaDesk()}`;
}

function navVista(v) { navState.vista = v; navState.abierto = null; navPrevia(); }
function navAbrirPrevia(u) { navState.abierto = navState.abierto === u ? null : u; navPrevia(); }

/** La regla que aplica a un ítem, respetando el filtro de dispositivo. */
function navReglaDe(url, nombre) {
  const cel = navState.vista === 'mobile';
  return navState.reglas.find((r) => {
    if (r.enabled === false) return false;
    if (r.device === 'mobile' && !cel) return false;
    if (r.device === 'desktop' && cel) return false;
    return (r.match && r.match === url)
      || (!r.match && r.match_text && r.match_text.toLowerCase() === String(nombre).toLowerCase());
  });
}

/** Un ítem del menú con su regla aplicada, igual que lo hace el theme. */
function navItemHtml(it, { chico = false } = {}) {
  const r = navReglaDe(it.url, it.nombre);
  if (r && r.hide) return '';
  const est = [];
  if (r && r.color) est.push(`color:${esc(r.color)}`);
  if (r && r.bg) est.push(`background:${esc(r.bg)};padding:4px 10px;border-radius:4px;color:${navContraste(r.bg)}`);
  if (r && r.font) { est.push(`font-family:'${esc(r.font)}',Inter,sans-serif`); navPedirFuente(r.font); }

  let cuerpo;
  if (r && r.image) {
    cuerpo = `<img src="${esc(r.image)}" alt="" style="height:${Number(r.image_h) || 22}px;vertical-align:middle">`;
  } else if (r && r.thumb) {
    cuerpo = `<img class="np-thumb" src="${esc(r.thumb)}" alt="">${esc(it.nombre)}`;
  } else {
    cuerpo = esc(it.nombre);
  }
  const badge = r && r.badge_text
    ? `<span class="np-badge" data-fx="${esc(r.badge_style || 'sale')}">${esc(r.badge_text)}</span>` : '';
  return `<span class="np-item ${chico ? 'np-sub' : ''}" style="${est.join(';')}">${cuerpo}${badge}</span>`;
}

/** Blanco o negro según el fondo, igual que en la tienda. */
function navContraste(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#111' : '#fff';
}

function navPreviaDesk() {
  const fila = navState.menu.map((it) => {
    const item = navItemHtml(it);
    if (!item) return '';
    const tiene = it.hijos.length > 0;
    const abierto = navState.abierto === it.url;
    return `<button class="np-nav-btn ${abierto ? 'on' : ''}" ${tiene ? `onclick="navAbrirPrevia('${esc(it.url)}')"` : 'disabled'}>
      ${item}${tiene ? '<span class="np-chev"></span>' : ''}</button>`;
  }).join('');

  const abierta = navState.menu.find((it) => it.url === navState.abierto);
  let desplegable = '';
  if (abierta) {
    const r = navReglaDe(abierta.url, abierta.nombre);
    const subs = abierta.hijos.map((h) => navItemHtml(h, { chico: true })).filter(Boolean).join('');
    const placa = r && r.mega_image ? `
      <div class="np-placa-caja"><a class="np-placa">
        <img src="${esc(r.mega_image)}" alt="">
        <span class="np-placa-body">
          ${r.mega_kicker ? `<span class="np-placa-kicker">${esc(r.mega_kicker)}</span>` : ''}
          <span class="np-placa-tit">${esc(r.mega_title || abierta.nombre)}</span>
          ${r.mega_text ? `<span class="np-placa-txt">${esc(r.mega_text)}</span>` : ''}
          ${r.mega_cta ? `<span class="np-placa-cta">${esc(r.mega_cta)} →</span>` : ''}
        </span></a></div>` : '';
    desplegable = `<div class="np-drop"><div class="np-drop-subs">${subs || '<span class="np-vacio">Sin subcategorías</span>'}</div>${placa}</div>`;
  }
  return `<div class="np-barra">${fila}</div>${desplegable}`;
}

function navPreviaCel() {
  const filas = navState.menu.map((it) => {
    const item = navItemHtml(it);
    if (!item) return '';
    const tiene = it.hijos.length > 0;
    const abierto = navState.abierto === it.url;
    const subs = abierto
      ? `<div class="np-cel-subs">${it.hijos.map((h) => {
          const x = navItemHtml(h, { chico: true });
          return x ? `<div class="np-cel-sub">${x}</div>` : '';
        }).join('')}</div>` : '';
    return `<div class="np-cel-fila ${abierto ? 'on' : ''}" ${tiene ? `onclick="navAbrirPrevia('${esc(it.url)}')"` : ''}>
        ${item}${tiene ? '<span class="np-chev"></span>' : ''}
      </div>${subs}`;
  }).join('');
  return `<div class="np-cel-caja"><div class="np-cel-top">Menú</div>${filas}</div>`;
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
