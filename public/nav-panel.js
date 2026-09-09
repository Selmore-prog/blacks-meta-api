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

const navState = { campos: [], fuentes: [], badges: [], grupos: [], iconos: {}, items: [], reglas: [], abierta: null, tienda: null, previaModo: 'desktop', previaAbierto: false, sucio: false, menu: [], vista: 'desktop', abierto: null };

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
    navState.iconos = d.iconos || {};
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
    r.icono ? 'ícono' : '', r.bg2 ? 'degradado' : '', r.animacion ? 'con movimiento' : '',
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
      /* Buscador en vez de un <select>: son 105 categorías y en una lista
         desplegable hay que scrollear a ciegas. Se escribe y se filtra. */
      const elegida = navState.items.find((o) => o.value === v);
      control = `<div class="nav-busca" data-i="${i}">
        <input type="text" class="nav-busca-inp" placeholder="Escribí para buscar…"
          value="${esc(elegida ? elegida.label : '')}"
          oninput="navBuscar(${i}, this.value)"
          onfocus="navBuscar(${i}, '')"
          autocomplete="off">
        ${v ? `<button class="btn btn-sm nav-busca-x" onclick="navElegir(${i}, '')" title="Sacar">×</button>` : ''}
        <div class="nav-busca-lista hidden" id="nav-busca-${i}"></div>
      </div>`;
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
      // El botón de prompt sólo va en la que reemplaza la palabra: es la única
      // que hay que MANDAR A HACER (la miniatura y la foto del desplegable son
      // fotos de producto, no lettering).
      const conPrompt = c.key === 'image';
      control = `<div class="nav-img">
        ${v ? `<img src="${esc(v)}" alt="">` : '<span class="nav-img-vacia">Sin imagen</span>'}
        <button class="btn btn-sm" onclick="navSubir(${i},'${c.key}')">${v ? 'Cambiar' : 'Subir PNG o GIF'}</button>
        ${v ? `<button class="btn btn-sm" onclick="navSet(${i},'${c.key}','')">Sacar</button>` : ''}
        ${conPrompt ? `<button class="btn btn-sm" onclick="navPrompt(${i})">✨ Pedirle el diseño a la IA</button>` : ''}
      </div>${conPrompt ? `<div id="nav-prompt-${i}"></div>` : ''}`;
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

/* --------------------------------------------------- buscar categorías - */

/**
 * Filtra las categorías mientras se escribe. Sin acentos y por PALABRAS
 * sueltas: buscando "invierno chal" tiene que aparecer
 * "SALE INVIERNO › Chalecos", que con un `includes` pelado no aparecería.
 */
function navBuscar(i, texto) {
  const caja = document.getElementById('nav-busca-' + i);
  if (!caja) return;
  const limpia = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const partes = limpia(texto).split(/\s+/).filter(Boolean);

  const halla = navState.items.filter((o) => {
    if (!partes.length) return true;
    const h = limpia(o.label + ' ' + o.value);
    return partes.every((p) => h.includes(p));
  }).slice(0, 40);

  if (!halla.length) {
    caja.innerHTML = '<p class="nav-busca-nada">No hay ninguna categoría con eso.</p>';
    caja.classList.remove('hidden');
    return;
  }
  caja.innerHTML = halla.map((o) => {
    const dato = o.productos ? `${o.productos} productos` : 'vacía';
    return `<button type="button" class="nav-busca-op" onclick="navElegir(${i}, '${esc(o.value)}')">
      <span>${esc(o.label)}</span><em>${esc(dato)}</em></button>`;
  }).join('');
  caja.classList.remove('hidden');
}

function navElegir(i, valor) {
  const caja = document.getElementById('nav-busca-' + i);
  if (caja) caja.classList.add('hidden');
  navSet(i, 'match', valor);
  navRender();   // el nombre elegido cambia el título de la regla
}

// Un clic afuera cierra la lista: si no, queda abierta tapando los campos.
document.addEventListener('click', (ev) => {
  if (ev.target.closest && ev.target.closest('.nav-busca')) return;
  document.querySelectorAll('.nav-busca-lista').forEach((l) => l.classList.add('hidden'));
});

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

  navRefrescarPrevia();
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

/**
 * Arma el pedido para que Gemini o ChatGPT dibuje la palabra del ítem.
 * Lo que aporta no es "pedir una imagen" —eso lo hace cualquiera— sino las
 * restricciones que hacen que la pieza SIRVA en un menú: fondo transparente,
 * trazo grueso porque se ve a 22 px, y sólo esa palabra (los modelos suelen
 * agregar "SALE" o un porcentaje por su cuenta).
 */
async function navPrompt(i) {
  const r = navState.reglas[i];
  const caja = document.getElementById('nav-prompt-' + i);
  if (!caja) return;
  const nombre = navNombreDe(r);
  caja.innerHTML = '<p class="hint" style="margin:8px 0 0">Armando el pedido…</p>';
  try {
    const d = await api('/api/nav/menu/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: r.match_text || nombre,
        // Se le pasan los colores que ya eligió para el ítem, así la pieza sale
        // de la misma gama y no hay que retocarla después.
        colores: [r.bg, r.bg2, r.color, r.badge_c1].filter(Boolean),
        sobreFondo: 'oscuro',
        estilo: 'condensada',
      }),
    });
    caja.innerHTML = `
      <div class="nav-prompt">
        <div class="nav-prompt-cab">
          <strong>Pegale esto a Gemini o a ChatGPT</strong>
          <button class="btn btn-sm" onclick="navCopiar(${i})">Copiar</button>
        </div>
        <textarea id="nav-prompt-txt-${i}" rows="9" readonly></textarea>
        <p class="nav-help">Pedile el PNG con fondo transparente. Cuando lo tengas, subilo con el botón de arriba.</p>
      </div>`;
    // El texto va por propiedad, nunca dentro del HTML: tiene comillas y saltos.
    document.getElementById('nav-prompt-txt-' + i).value = d.prompt;
  } catch (err) {
    caja.innerHTML = `<p class="error" style="margin:8px 0 0">${esc(err.message)}</p>`;
  }
}

function navCopiar(i) {
  const t = document.getElementById('nav-prompt-txt-' + i);
  if (!t) return;
  t.select();
  navigator.clipboard.writeText(t.value)
    .then(() => toast('Copiado. Pegalo en Gemini o ChatGPT.', 'ok'))
    .catch(() => toast('No pude copiarlo solo: seleccionalo y copialo a mano.', 'error'));
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
 * LA PREVIA ES EL MENÚ DE VERDAD.
 *
 * Antes acá se dibujaba un menú inventado ("Inicio · Urbano · Industria") con
 * HTML propio. Por eso el ítem "Tienda" no se parecía en nada al de la tienda
 * real y la previa no servía para probar: mentía sobre tipografías, tamaños,
 * separaciones y desplegables.
 *
 * Ahora se pide el marcado REAL (/api/nav/menu/tienda) y se mete en un iframe
 * junto con el CSS de la tienda y con el CSS y el JS de navAssets.js — los
 * mismos que corren en producción. Adentro se stubea fetch() para que ese JS
 * reciba las reglas que se están editando en vez de las publicadas.
 */
const NAV_ANCHOS = { desktop: 1280, mobile: 390 };

/**
 * Arma el documento del iframe UNA sola vez con los DOS menús adentro.
 *
 * Antes se rearmaba el srcdoc entero en cada clic. Con medio mega de CSS de la
 * tienda, cambiar de "Computadora" a "Celular" tardaba segundos y parecía que
 * el botón no andaba. Ahora el srcdoc sólo se rehace cuando cambian las REGLAS;
 * cambiar de modo es poner una clase y el ancho, y es instantáneo.
 */
function navDocPrevia() {
  const t = navState.tienda;
  const estilo = JSON.stringify({
    v: 1,
    reglas: navState.reglas
      .filter((r) => r.enabled !== false && (r.match || r.match_text))
      // `icono_d` (el path del SVG) lo resuelve el motor en validarRegla, y las
      // reglas en edición no pasaron por ahí: sin esto el ícono se ve en la
      // tienda pero no en la previa, que es lo que esta previa vino a evitar.
      .map((r) => ({ ...r, icono_d: (navState.iconos[r.icono || ''] || {}).d || '' })),
    fuentes: [...new Set(navState.reglas.map((r) => r.font).filter(Boolean))],
  });

  return `<!doctype html><html><head><meta charset="utf-8">
<!-- ⚠️ SIN ESTE <base> EL MENÚ SE VE EN TIMES.
     El CSS del theme trae @font-face con rutas relativas, y un iframe armado
     con srcdoc no tiene URL propia contra la cual resolverlas: las fuentes (y
     las imágenes) no cargaban y todo caía al serif del navegador. -->
<base href="${esc((navState.tienda && navState.tienda.url) || 'https://blacksindumentaria.com.ar/')}">
<!-- Las hojas del theme (la base, el header y la tipografía Inter) van ANTES
     del CSS propio, en el mismo orden que en la tienda. -->
${(t.hojas || []).map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join('')}
<style>${t.css || ''}</style>
<style>${t.css_fx || ''}</style>
<style>
  html, body { margin:0; padding:0; }
  body { padding:18px; }
  /* Los dos menús viven juntos y se muestra uno según la clase del body: así
     cambiar de modo no obliga a rearmar el documento entero. */
  /* El header de escritorio trae su propio fondo; el árbol del hamburguesa va
     sobre blanco, como en el modal de la tienda. */
  body.m-desktop { background:#111; padding:0; }
  body.m-mobile { background:#fff; padding:0; }
  /* El header real es sticky/fixed: en la previa eso lo saca del flujo y el
     iframe mide cero. Acá se lo devuelve al flujo normal. */
  body.m-desktop #main-header { position: static !important; }

  /* El hamburguesa vive dentro de un modal con scroll propio: acá tiene que
     poder crecer todo lo que necesite, o la previa lo corta y no se ve lo que
     se está por publicar. */
  body.m-mobile .modal-nav-hamburger,
  body.m-mobile .nav-primary,
  body.m-mobile .nav-list {
    max-height: none !important; height: auto !important; overflow: visible !important;
    position: static !important; transform: none !important;
    display: block !important; width: 100% !important;
  }
  #np-desktop, #np-mobile { display:none; }
  body.m-desktop #np-desktop { display:block; }
  body.m-mobile #np-mobile { display:block; }

  /* Los desplegables arrancan CERRADOS. Sin el JS del theme (que los abre al
     pasar el mouse) algunas reglas los dejaban visibles, y como son
     position:absolute no cuentan para el alto: el iframe se cortaba y se veía
     todo encimado. */
  .js-desktop-dropdown, .nav-mega-wrapper, .mobile-dropdown-list {
    display: none !important;
  }
  /* ⚠️ Se abre UNO SOLO, el que se está mirando: abrirlos todos los apilaba
     unos encima de otros.
     ⚠️ Y se lo deja en su posición NATURAL (absolute). Forzarlo a
     position:static lo sacaba de su lugar y desarmaba el mega menú — se veía
     un panel blanco encimado y el resto de los ítems cortados. El alto del
     iframe se resuelve MIDIENDO el desplegable, no moviéndolo. */
  body.abierto .np-abierto .js-desktop-dropdown,
  body.abierto .np-abierto .nav-mega-wrapper {
    display:block !important; opacity:1 !important; visibility:visible !important;
    pointer-events:auto !important;
  }
  /* ⚠️ En celular NO alcanza con el display: el acordeón del theme se abre con
     la clase 'open' en el <ul> (navigation-nav-list.tpl lo hace por onclick).
     Sin ella la lista quedaba visible pero con alto 0, así que la previa no se
     estiraba y parecía que el botón no hacía nada. La clase la pone
     navMarcarAbierto(); esto es sólo el respaldo por si el theme cambia.
     ⚠️⚠️ Y OJO CON LOS BACKTICKS ACÁ ADENTRO: este comentario vive DENTRO del
     template literal que arma el documento del iframe. Un backtick lo cierra y
     el srcdoc sale vacío — la previa queda en negro. Pasó con este mismo texto. */
  body.abierto .np-abierto > .mobile-dropdown-list { display:block !important; }
</style>
</head><body class="m-desktop">
<div id="np-desktop">${t.desktop || '<p style="color:#888;font:14px sans-serif">No se encontró el menú de escritorio.</p>'}</div>
<!-- ⚠️ El menú de celular VA ENVUELTO en .modal-nav-hamburger > .nav-primary.
     Casi todo su estilo cuelga de esa clase (style-async.scss: alto de fila,
     tipografía, separadores). Suelto, el CSS no aplicaba y las opciones se
     acomodaban en DOS COLUMNAS, apretadas — que es como se veía. -->
<div id="np-mobile"><div class="modal-nav-hamburger"><div class="nav-primary">
${t.mobile || '<p style="color:#888;font:14px sans-serif">No se encontró el menú de celular.</p>'}
</div></div></div>
<script>
  // El JS de la tienda pide las reglas por fetch: acá se las damos escritas.
  window.fetch = function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(${estilo}); } });
  };
  try { sessionStorage.clear(); } catch (e) {}
<\/script>
<script>${t.js_fx || ''}<\/script>
</body></html>`;
}

function navPrevia() {
  const caja = document.getElementById('nav-previa');
  if (!caja) return;
  if (!navState.tienda) { navPediTienda(); return; }
  if (navState.tienda.error) {
    caja.innerHTML = `<p class="hint">No se pudo leer el menú de la tienda: ${esc(navState.tienda.error)}.
      <button class="btn btn-sm" onclick="navPediTienda(true)">Reintentar</button></p>`;
    return;
  }

  const modo = navState.previaModo || 'desktop';
  // La barra se dibuja una sola vez; después sólo se actualizan los botones.
  if (!document.getElementById('np-iframe')) {
    caja.innerHTML = `
      <div class="np-barra">
        <button class="btn btn-sm" data-modo="desktop" onclick="navPreviaModo('desktop')">Computadora</button>
        <button class="btn btn-sm" data-modo="mobile" onclick="navPreviaModo('mobile')">Celular</button>
        <button class="btn btn-sm" id="np-abrir" onclick="navPreviaAbrir()">Abrir el desplegable</button>
        <select class="np-sel" id="np-cual" onchange="navPreviaCual(this.value)"></select>
        <button class="btn btn-sm" onclick="navPediTienda(true)">Recargar</button>
        <span class="np-nota">Es el menú real de tu tienda, con el mismo código que corre en producción.</span>
      </div>
      <div class="np-marco" id="np-marco"><iframe id="np-iframe" title="Vista previa del menú"></iframe></div>`;
    const f = document.getElementById('np-iframe');
    f.onload = () => { navPreviaSync(); navLlenarCual(); };
    f.srcdoc = navDocPrevia();
  }
  navPreviaSync();
}

/** Refresca sólo lo que cambia: el ancho, la clase del body y los botones. */
function navPreviaSync() {
  const f = document.getElementById('np-iframe');
  const marco = document.getElementById('np-marco');
  if (!f || !marco) return;
  const modo = navState.previaModo || 'desktop';

  document.querySelectorAll('.np-barra .btn[data-modo]').forEach((b) => {
    b.dataset.on = String(b.dataset.modo === modo);
  });
  const abrir = document.getElementById('np-abrir');
  if (abrir) {
    abrir.dataset.on = String(!!navState.previaAbierto);
    abrir.textContent = navState.previaAbierto ? 'Cerrar el desplegable' : 'Abrir el desplegable';
  }
  const sel = document.getElementById('np-cual');
  if (sel) sel.classList.toggle('hidden', !navState.previaAbierto);

  f.style.width = NAV_ANCHOS[modo] + 'px';

  const d = f.contentDocument;
  if (d && d.body) {
    d.body.className = 'm-' + modo + (navState.previaAbierto ? ' abierto' : '');
    navMarcarAbierto(d);
  }
  navEscalarPrevia();
}

/** Marca UNO solo para abrir: el elegido, o el primero que tenga desplegable. */
function navMarcarAbierto(d) {
  d.querySelectorAll('.np-abierto').forEach((e) => e.classList.remove('np-abierto'));
  if (!navState.previaAbierto) return;
  const modo = navState.previaModo || 'desktop';
  const raiz = d.getElementById(modo === 'mobile' ? 'np-mobile' : 'np-desktop');
  if (!raiz) return;
  const conHijos = [...raiz.querySelectorAll('li')].filter((li) =>
    li.querySelector('.js-desktop-dropdown, .nav-mega-wrapper, .mobile-dropdown-list'));
  if (!conHijos.length) return;
  const i = Math.min(navState.previaCual || 0, conHijos.length - 1);
  const elegido = conHijos[i];
  elegido.classList.add('np-abierto');

  // El acordeón de celular vive de la clase `.open` (la pone el onclick del
  // theme). Se la damos a mano, que es lo que realmente lo despliega.
  d.querySelectorAll('.mobile-dropdown-list.open').forEach((u) => u.classList.remove('open'));
  const lista = elegido.querySelector(':scope > .mobile-dropdown-list');
  if (lista) lista.classList.add('open');
}

/** Llena el desplegable "cuál abrir" con los ítems que tienen subcategorías. */
function navLlenarCual() {
  const sel = document.getElementById('np-cual');
  const f = document.getElementById('np-iframe');
  if (!sel || !f || !f.contentDocument) return;
  const modo = navState.previaModo || 'desktop';
  const raiz = f.contentDocument.getElementById(modo === 'mobile' ? 'np-mobile' : 'np-desktop');
  if (!raiz) return;
  const conHijos = [...raiz.querySelectorAll('li')].filter((li) =>
    li.querySelector('.js-desktop-dropdown, .nav-mega-wrapper, .mobile-dropdown-list'));
  sel.innerHTML = conHijos.map((li, i) => {
    const a = li.querySelector('.nav-list-link');
    const nombre = a ? a.textContent.trim().slice(0, 26) : 'Ítem ' + (i + 1);
    return `<option value="${i}"${i === (navState.previaCual || 0) ? ' selected' : ''}>${esc(nombre)}</option>`;
  }).join('');
}

/**
 * El iframe se muestra a TAMAÑO REAL (1280 o 390), nunca escalado.
 *
 * Antes se achicaba con transform:scale() para que entrara en la columna del
 * panel. Dos problemas, los dos reportados: en computadora el contenido
 * quedaba amontonado y cortado a la derecha, y en celular —donde 390 px entran
 * de sobra— el iframe ocupaba su ancho real y el resto del marco quedaba como
 * un rectángulo negro enorme al costado.
 *
 * Ahora: ancho real siempre, el marco scrollea en horizontal si no entra, y el
 * iframe se centra cuando sobra lugar. El alto se MIDE (incluyendo los
 * desplegables, que son position:absolute y no cuentan en scrollHeight), así
 * la caja se estira sola al abrir uno.
 */
function navEscalarPrevia() {
  const marco = document.getElementById('np-marco');
  const f = document.getElementById('np-iframe');
  if (!marco || !f) return;

  const ancho = NAV_ANCHOS[navState.previaModo || 'desktop'];
  f.style.width = ancho + 'px';
  f.style.transform = 'none';
  // Centrado cuando sobra lugar (celular), pegado a la izquierda cuando falta.
  marco.classList.toggle('np-centrado', marco.clientWidth > ancho);

  let alto = 240;
  try {
    const d = f.contentDocument;
    if (d && d.body) {
      let piso = d.body.scrollHeight;
      /* Los desplegables abiertos son position:absolute: NO suman a
         scrollHeight, así que el alto salía corto y el panel quedaba cortado
         justo donde empezaba lo que se quería mirar. Se mide su borde inferior
         a mano y se toma el más bajo. */
      d.querySelectorAll('.np-abierto .js-desktop-dropdown, .np-abierto .nav-mega-wrapper, .np-abierto .mobile-dropdown-list')
        .forEach((e) => {
          const r = e.getBoundingClientRect();
          const fin = r.bottom + (d.documentElement.scrollTop || 0);
          if (r.height && fin > piso) piso = fin;
        });
      // En celular el que manda es el árbol del hamburguesa: el body puede
      // medir poco porque el modal del theme le pone su propio alto.
      const arbol = d.querySelector('body.m-mobile #np-mobile');
      if (arbol) {
        const r = arbol.getBoundingClientRect();
        if (r.bottom > piso) piso = r.bottom;
      }
      alto = Math.max(180, Math.min(Math.ceil(piso) + 20, 3000));
    }
  } catch (e) { /* todavía no cargó */ }

  f.style.height = alto + 'px';
  marco.style.height = alto + 'px';
}

function navPreviaModo(m) { navState.previaModo = m; navPreviaSync(); navLlenarCual(); }
function navPreviaAbrir() {
  navState.previaAbierto = !navState.previaAbierto;
  navPreviaSync();
  // El desplegable tarda un cuadro en ocupar su lugar: medirlo antes da el
  // alto de cuando todavía estaba cerrado.
  setTimeout(navEscalarPrevia, 60);
}
function navPreviaCual(i) {
  navState.previaCual = Number(i) || 0;
  navPreviaSync();
  setTimeout(navEscalarPrevia, 60);
}

/** Rehace el documento del iframe. Sólo cuando cambian las REGLAS. */
let navRedibujoPendiente = null;
function navRefrescarPrevia() {
  const f = document.getElementById('np-iframe');
  if (!f || !navState.tienda || navState.tienda.error) { navPrevia(); return; }
  // Se agrupan los cambios: escribir en un campo dispara uno por tecla y
  // rearmar un srcdoc de casi un mega en cada una traba el panel.
  clearTimeout(navRedibujoPendiente);
  navRedibujoPendiente = setTimeout(() => { f.srcdoc = navDocPrevia(); }, 350);
}

async function navPediTienda(force) {
  const caja = document.getElementById('nav-previa');
  if (caja && !navState.tienda) caja.innerHTML = '<p class="loading">Leyendo el menú de tu tienda…</p>';
  try {
    navState.tienda = await api('/api/nav/menu/tienda' + (force ? '?force=1' : ''));
  } catch (err) {
    navState.tienda = { error: err.message };
  }
  navPrevia();
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
