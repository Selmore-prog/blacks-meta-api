/* =========================================================================
 * BLOQUES DE CONTENIDO DEL HOME — panel.
 *
 * Va aparte de dashboard.js (que ya tiene 6.700 líneas) pero corre en la misma
 * página y usa sus ayudantes: api(), esc(), toast(), tip(), hydrateIcons().
 *
 * QUÉ HACE
 * Arma el formulario de cada bloque SOLO, leyendo los campos que declara el
 * motor en /api/home/blocks. Si mañana se agrega un tipo de bloque o un campo
 * nuevo, acá no se toca nada.
 *
 * LA PREVIA ES REAL, NO UNA MAQUETA
 * El iframe muestra el HTML que devuelve el motor (el mismo que va a recibir la
 * tienda) con el mismo CSS y el mismo JS. Por eso arranca en ancho de celular:
 * es de donde viene la mayoría de las visitas y es donde se rompen las cosas.
 * ========================================================================= */

/* eslint-disable no-unused-vars */

let hbState = {
  catalogo: null,      // tipos + campos, como los declara el motor
  bloques: [],         // la config que se está editando
  abierto: null,       // índice del bloque abierto en el editor
  device: 'mobile',    // ancho de la previa
  sucio: false,        // hay cambios que la tienda todavía no vio
  avisos: [],
  faltantes: {},       // por hueco: qué le falta al bloque para poder publicarse
  previa: null,        // { blocks, css, js }
  timer: null,
  buscando: null,      // resultados del buscador de productos, por ruta
};

const HB_ANCHOS = { mobile: 390, desktop: 1180 };

/* Escapado para ATRIBUTOS: esc() de dashboard.js no escapa las comillas y acá
   todo termina dentro de value="…" y de onclick="…". */
function hbAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------- esquemas (wireframes) --
 * Un dibujito por tipo, para entender la ESTRUCTURA antes de elegirlo. Es lo
 * que faltaba en el panel de diseño de Tiendanube: ahí los nombres ("Magazine",
 * "Metro Tiles") no decían nada de cómo se iba a ver.                        */
const HB_ESQUEMAS = {
  portada: '<rect x="1" y="1" width="78" height="46" rx="2"/><rect x="7" y="26" width="30" height="4" rx="1" class="f"/><rect x="7" y="33" width="44" height="7" rx="1" class="f"/><rect x="7" y="43" width="16" height="0" rx="1"/>',
  media_texto: '<rect x="1" y="4" width="36" height="40" rx="2" class="f"/><rect x="43" y="12" width="26" height="5" rx="1" class="f"/><rect x="43" y="21" width="34" height="3" rx="1"/><rect x="43" y="27" width="30" height="3" rx="1"/><rect x="43" y="35" width="18" height="6" rx="1" class="f"/>',
  atributos: '<rect x="1" y="14" width="18" height="20" rx="2"/><rect x="21" y="14" width="18" height="20" rx="2"/><rect x="41" y="14" width="18" height="20" rx="2"/><rect x="61" y="14" width="18" height="20" rx="2"/><circle cx="6" cy="20" r="2" class="f"/><circle cx="26" cy="20" r="2" class="f"/><circle cx="46" cy="20" r="2" class="f"/><circle cx="66" cy="20" r="2" class="f"/>',
  editorial: '<rect x="1" y="4" width="44" height="40" rx="2" class="f"/><rect x="49" y="4" width="30" height="19" rx="2" class="f"/><rect x="49" y="25" width="30" height="19" rx="2" class="f"/>',
  video: '<rect x="1" y="4" width="78" height="40" rx="2" class="f"/><circle cx="40" cy="24" r="7" class="w"/><path d="M38 21l5 3-5 3z" class="k"/>',
  productos: '<rect x="1" y="6" width="18" height="24" rx="2" class="f"/><rect x="21" y="6" width="18" height="24" rx="2" class="f"/><rect x="41" y="6" width="18" height="24" rx="2" class="f"/><rect x="61" y="6" width="18" height="24" rx="2" class="f"/><rect x="1" y="33" width="12" height="3" rx="1"/><rect x="21" y="33" width="12" height="3" rx="1"/><rect x="41" y="33" width="12" height="3" rx="1"/><rect x="61" y="33" width="12" height="3" rx="1"/>',
  cinta: '<rect x="1" y="17" width="78" height="14" rx="1" class="f"/><rect x="6" y="22" width="14" height="4" rx="1" class="w"/><rect x="26" y="22" width="18" height="4" rx="1" class="w"/><rect x="50" y="22" width="12" height="4" rx="1" class="w"/>',
  preguntas: '<rect x="1" y="6" width="78" height="10" rx="1"/><rect x="1" y="18" width="78" height="10" rx="1"/><rect x="1" y="30" width="78" height="10" rx="1"/><rect x="70" y="10" width="5" height="2" rx="1" class="f"/><rect x="70" y="22" width="5" height="2" rx="1" class="f"/><rect x="70" y="34" width="5" height="2" rx="1" class="f"/>',
  rubros: '<rect x="1" y="4" width="18" height="40" rx="2" class="f"/><rect x="21" y="4" width="18" height="40" rx="2" class="f"/><rect x="41" y="4" width="18" height="40" rx="2" class="f"/><rect x="61" y="4" width="18" height="40" rx="2" class="f"/>',
};

function hbEsquema(tipo, alto = 54) {
  return `<svg class="hb-sk" viewBox="0 0 80 48" width="100%" height="${alto}" aria-hidden="true">${HB_ESQUEMAS[tipo] || ''}</svg>`;
}

/* ------------------------------------------------------------- utilidades */

function hbTipo(id) {
  return (hbState.catalogo && hbState.catalogo.types.find((t) => t.id === id)) || null;
}

/** Título legible de un bloque para la lista (cae al tipo si no hay texto). */
function hbNombre(b) {
  const d = b.data || {};
  const t = d.title || d.kicker
    || (Array.isArray(d.items) && d.items[0] && (d.items[0].title || d.items[0].q || d.items[0].text))
    || (Array.isArray(d.tiles) && d.tiles[0] && d.tiles[0].title);
  const tipo = hbTipo(b.type);
  return t || (tipo ? tipo.label : b.type);
}

/** Lee/escribe por ruta ("0.data.items.2.text") sobre hbState.bloques. */
function hbGet(ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), hbState.bloques);
}
function hbSet(ruta, valor) {
  const partes = ruta.split('.');
  const ultima = partes.pop();
  const destino = partes.reduce((o, k) => o[k], hbState.bloques);
  destino[ultima] = valor;
  hbState.sucio = true;
  hbMarcarSucio();
  hbPediPrevia();
}

function hbMarcarSucio() {
  const b = document.getElementById('hb-publicar');
  if (b) {
    b.classList.toggle('btn-primary', hbState.sucio);
    b.classList.toggle('btn-ghost', !hbState.sucio);
  }
  const p = document.getElementById('hb-estado');
  if (p) p.textContent = hbState.sucio ? 'Hay cambios sin publicar' : 'Todo publicado';
}

/* ========================================================== carga y armado */

async function loadHomeBlocks() {
  const cont = document.getElementById('hs-bloques');
  cont.innerHTML = '<p class="loading">Cargando bloques…</p>';
  try {
    const d = await api('/api/home/blocks');
    hbState.catalogo = d;
    hbState.bloques = (d.config && d.config.blocks) || [];
    hbState.abierto = hbState.bloques.length ? 0 : null;
    hbState.sucio = false;
    hbState.primeraPrevia = true;
    renderHomeBlocks();
    hbPediPrevia();
  } catch (err) {
    cont.innerHTML = `<p class="hint">No pude cargar los bloques: ${esc(err.message)}</p>`;
  }
}

function renderHomeBlocks() {
  const cont = document.getElementById('hs-bloques');
  const libres = hbState.catalogo.slots.length - hbState.bloques.length;

  cont.innerHTML = `
    <div class="hb-top">
      <div class="hb-top-izq">
        <button class="btn-primary btn-sm" onclick="hbAbrirGaleria()" ${libres <= 0 ? 'disabled title="Ya usaste los 6 huecos"' : ''}>
          <span data-ic="plus"></span> Agregar bloque
        </button>
        <span class="hb-libres">${hbState.bloques.length} de ${hbState.catalogo.slots.length} huecos usados</span>
      </div>
      <div class="hb-top-der">
        <span class="hb-estado" id="hb-estado">Todo publicado</span>
        <button class="btn-ghost btn-sm" id="hb-publicar" onclick="hbPublicar()">
          <span data-ic="check"></span> Publicar en la tienda
        </button>
      </div>
    </div>

    <p class="hint hb-explica">
      Cada bloque ocupa uno de los seis huecos <b>"◆ Bloque 1-6"</b> que ponés en el orden de la
      página de inicio, desde el panel de diseño de Tiendanube. Acá elegís <b>qué hay adentro</b>;
      allá elegís <b>en qué lugar de la página</b> aparece. ${tip('El motor no puede leer ni cambiar el orden de las secciones: el panel de diseño de Tiendanube no tiene API. Por eso el lugar se elige allá una sola vez y el contenido se cambia todas las veces que quieras desde acá.')}
    </p>

    <div class="hb-layout">
      <div class="hb-col-edit" id="hb-editor"></div>
      <div class="hb-col-previa">
        <div class="hb-previa-barra">
          <div class="hb-dev">
            <button class="hb-dev-b ${hbState.device === 'mobile' ? 'on' : ''}" onclick="hbDevice('mobile')">Celular</button>
            <button class="hb-dev-b ${hbState.device === 'desktop' ? 'on' : ''}" onclick="hbDevice('desktop')">Escritorio</button>
          </div>
          <span class="hb-previa-tit">Vista previa real</span>
        </div>
        <div class="hb-avisos" id="hb-avisos"></div>
        <div class="hb-marco hb-marco--${hbState.device}">
          <iframe id="hb-iframe" title="Vista previa de los bloques"></iframe>
        </div>
      </div>
    </div>`;

  hbRenderEditor();
  hbMarcarSucio();
  hydrateIcons();
}

/* --------------------------------------------------------------- editor -- */

function hbRenderEditor() {
  const box = document.getElementById('hb-editor');
  if (!box) return;

  if (!hbState.bloques.length) {
    box.innerHTML = `<div class="hb-vacio">
      <p><b>Todavía no hay bloques.</b></p>
      <p class="hint">Agregá el primero para empezar a decorar el home: una portada con foto o video,
      una tira con las razones para comprar, un editorial de tres mundos, un video, preguntas frecuentes…</p>
      <button class="btn-primary btn-sm" onclick="hbAbrirGaleria()"><span data-ic="plus"></span> Agregar bloque</button>
    </div>`;
    hydrateIcons();
    return;
  }

  box.innerHTML = hbState.bloques.map((b, i) => {
    const tipo = hbTipo(b.type);
    const abierto = hbState.abierto === i;
    return `<div class="hb-card ${abierto ? 'abierta' : ''} ${b.enabled === false ? 'apagada' : ''}">
      <div class="hb-card-head" onclick="hbAbrir(${i})">
        <div class="hb-card-sk">${hbEsquema(b.type, 34)}</div>
        <div class="hb-card-txt">
          <span class="hb-card-tipo">${esc(tipo ? tipo.label : b.type)} · ${esc(b.slot.replace('block_', 'Bloque '))}${b.enabled === false ? ' <b class="hb-borrador-tag">borrador</b>' : ''}${hbState.faltantes[b.slot] ? ' <b class="hb-falta-tag">falta algo</b>' : ''}</span>
          <span class="hb-card-nombre">${esc(hbNombre(b))}</span>
        </div>
        <div class="hb-card-acc" onclick="event.stopPropagation()">
          <button class="hb-ib" title="Subir" onclick="hbMover(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="hb-ib" title="Bajar" onclick="hbMover(${i}, 1)" ${i === hbState.bloques.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="hb-ib ${b.enabled === false ? 'off' : 'on'}" title="${b.enabled === false ? 'Está oculto: mostrar' : 'Se está mostrando: ocultar'}" onclick="hbToggle(${i})">${b.enabled === false ? '○' : '●'}</button>
          <button class="hb-ib rojo" title="Eliminar" onclick="hbBorrar(${i})">✕</button>
        </div>
      </div>
      ${abierto ? `<div class="hb-card-body">${hbFormulario(b, i)}</div>` : ''}
    </div>`;
  }).join('');
  hydrateIcons();
}

/** Los campos generales que tiene TODO bloque, sea del tipo que sea. */
function hbFormulario(b, i) {
  const tipo = hbTipo(b.type);
  if (!tipo) return '<p class="hint">Este tipo de bloque ya no existe.</p>';

  const sugerencias = tipo.sugerencias && tipo.sugerencias.length
    ? `<div class="hb-sug">
         <span>Textos sugeridos para esta tienda:</span>
         ${tipo.sugerencias.map((s, k) => `<button class="hb-chip" onclick="hbUsarSugerencia(${i}, ${k})">${esc(s.title || s.kicker || (s.items && s.items[0] && (s.items[0].title || s.items[0].q)) || 'Ejemplo ' + (k + 1))}</button>`).join('')}
       </div>`
    : '';

  const campos = tipo.fields.map((c) => hbCampo(c, b.data[c.key], `${i}.data.${c.key}`, b.data)).join('');

  const opciones = (llave, lista, etiquetas) => `
    <label class="hb-f">
      <span class="hb-f-lab">${etiquetas.titulo}</span>
      <select onchange="hbSetOpcion(${i}, '${llave}', this.value)">
        ${lista.map((v) => `<option value="${hbAttr(v)}" ${b[llave] === v ? 'selected' : ''}>${esc(etiquetas.map[v] || v)}</option>`).join('')}
      </select>
    </label>`;

  const falta = hbState.faltantes[b.slot]
    ? `<p class="hb-aviso hb-aviso--falta">${esc(hbState.faltantes[b.slot])}</p>` : '';

  return `
    <p class="hb-para">${esc(tipo.para)}</p>
    ${falta}
    ${sugerencias}
    <div class="hb-campos">${campos}</div>

    <details class="hb-avanzado">
      <summary>Presentación del bloque</summary>
      <div class="hb-campos">
        ${opciones('theme', hbState.catalogo.themes, { titulo: 'Fondo', map: { claro: 'Claro', oscuro: 'Oscuro', arena: 'Arena', acento: 'Color de acento' } })}
        ${opciones('width', hbState.catalogo.widths, { titulo: 'Ancho', map: { contenido: 'Centrado (como el resto)', completo: 'De borde a borde' } })}
        ${opciones('spacing', hbState.catalogo.spacings, { titulo: 'Aire alrededor', map: { compacto: 'Compacto', normal: 'Normal', amplio: 'Amplio' } })}
        ${opciones('device', hbState.catalogo.devices, { titulo: 'Dónde se ve', map: { todos: 'Celular y computadora', mobile: 'Sólo en celular', desktop: 'Sólo en computadora' } })}
        <label class="hb-f">
          <span class="hb-f-lab">Color de acento</span>
          <span class="hb-color">
            <input type="color" value="${hbAttr(b.accent || '#E2571F')}" onchange="hbSetOpcion(${i}, 'accent', this.value)">
            <button class="hb-mini" onclick="hbSetOpcion(${i}, 'accent', '')">Usar el de la tienda</button>
          </span>
          <span class="hb-f-help">Pinta la volanta, las viñetas y el cartel de descuento. Vacío = hereda el color de la tienda.</span>
        </label>
      </div>
    </details>`;
}

/* ------------------------------------------------------------ un campo --- */

function hbVisible(campo, data) {
  const w = campo.when;
  if (!w) return true;
  const actual = data[w.key];
  // `lleno` = mostrar sólo si el otro campo tiene algo cargado. Lo usan las
  // opciones de video, que ahora dependen de que haya una URL y no de un
  // desplegable de tipo (ver VIDEO_FIELDS en src/homeBlocks.js).
  if (w.lleno !== undefined) {
    const tiene = Array.isArray(actual) ? actual.length > 0 : !!(actual && String(actual).trim());
    return w.lleno ? tiene : !tiene;
  }
  if (w.is !== undefined) return actual === w.is;
  if (w.not !== undefined) return actual !== w.not;
  return true;
}

function hbCampo(campo, valor, ruta, data) {
  if (!hbVisible(campo, data)) return '';
  const lab = `<span class="hb-f-lab">${esc(campo.label)}</span>`;
  const help = campo.help ? `<span class="hb-f-help">${esc(campo.help)}</span>` : '';
  // Cambiar este campo puede mostrar u ocultar otros: hay que redibujar.
  // Cambiar esto muestra u oculta otros campos, así que hay que redibujar.
  // El campo 'video' entra porque de su URL dependen loop, sonido y autoplay.
  const redibuja = campo.type === 'opciones' || campo.type === 'switch' || campo.type === 'video';
  const alCambiar = redibuja ? 'hbSetYRedibuja' : 'hbSet';

  switch (campo.type) {
    case 'texto':
    case 'url':
      return `<label class="hb-f">${lab}
        <input type="text" value="${hbAttr(valor || '')}" ${campo.max ? `maxlength="${campo.max}"` : ''}
               placeholder="${hbAttr(campo.placeholder || '')}" oninput="hbSet('${ruta}', this.value)">
        ${help}</label>`;

    case 'textarea':
      return `<label class="hb-f">${lab}
        <textarea rows="3" ${campo.max ? `maxlength="${campo.max}"` : ''}
                  placeholder="${hbAttr(campo.placeholder || '')}" oninput="hbSet('${ruta}', this.value)">${esc(valor || '')}</textarea>
        ${help}</label>`;

    case 'imagen':
    case 'video':
      return hbCampoArchivo(campo, valor, ruta, lab, help);

    case 'opciones':
      return `<label class="hb-f">${lab}
        <select onchange="${alCambiar}('${ruta}', this.value)">
          ${(campo.options || []).map((o) => `<option value="${hbAttr(o.value)}" ${valor === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>${help}</label>`;

    case 'switch':
      return `<label class="hb-f hb-f--sw">
        <input type="checkbox" ${valor ? 'checked' : ''} onchange="${alCambiar}('${ruta}', this.checked)">
        <span><span class="hb-f-lab">${esc(campo.label)}</span>${help}</span></label>`;

    case 'numero':
      return `<label class="hb-f">${lab}
        <span class="hb-rango">
          <input type="range" min="${campo.min || 0}" max="${campo.max || 100}" value="${Number(valor) || 0}"
                 oninput="this.nextElementSibling.textContent = this.value; hbSet('${ruta}', this.value)">
          <output>${Number(valor) || 0}</output>
        </span>${help}</label>`;

    case 'productos':
      return hbCampoProductos(campo, valor || [], ruta, lab, help);

    case 'lista':
      return hbCampoLista(campo, valor || [], ruta, lab, help);

    default:
      return '';
  }
}

/* Indicación de foto que dejó el esquema ideal para ESTE campo: qué mostrar, en
   qué formato y qué evitar. Se muestra pegada al campo, que es donde hace falta
   —en el momento de ir a buscar la imagen— y no en otra pantalla. */
function hbNota(ruta, clave) {
  const i = Number(ruta.split('.')[0]);
  const b = hbState.bloques[i];
  const n = b && (b.notas || []).find((x) => x.campo === clave);
  if (!n || !n.que) return '';
  return `<div class="hb-nota"><b>Foto sugerida:</b> ${esc(n.que)}
    ${n.formato || n.encuadre ? `<span>${esc([n.formato, n.encuadre].filter(Boolean).join(' · '))}</span>` : ''}
    ${n.evitar ? `<span>Evitar: ${esc(n.evitar)}</span>` : ''}</div>`;
}

function hbCampoArchivo(campo, valor, ruta, lab, help) {
  const esVideo = campo.type === 'video';
  const previa = valor
    ? (esVideo && /\.(mp4|webm|mov)(\?|$)/i.test(valor)
      ? `<video src="${hbAttr(valor)}" class="hb-mini-prev" muted playsinline preload="metadata"></video>`
      : (!esVideo ? `<img src="${hbAttr(valor)}" class="hb-mini-prev" alt="">` : ''))
    : '';
  return `<label class="hb-f">${lab}
    <span class="hb-archivo">
      ${previa}
      <input type="text" value="${hbAttr(valor || '')}" placeholder="${esVideo ? 'Pegá el link o subí un MP4' : 'Pegá la URL o subí la foto'}"
             oninput="hbSet('${ruta}', this.value)">
      <button class="hb-mini" onclick="hbSubir('${ruta}', ${esVideo})">Subir</button>
      <button class="hb-mini" onclick="hbPrompt('${ruta}', '${hbAttr(campo.key)}')" title="Escribir el prompt para generar ${esVideo ? 'este video' : 'esta foto'} con IA">✨ Prompt</button>
      ${valor ? `<button class="hb-mini rojo" onclick="hbSetYRedibuja('${ruta}', '')">Quitar</button>` : ''}
    </span>${help}${valor ? '' : hbNota(ruta, campo.key)}${hbPromptCaja(ruta)}</label>`;
}

/* PROMPT A PEDIDO PARA ESTE HUECO.
   El esquema ideal deja notas sólo para los bloques que él propone. Para los que
   el dueño arma a mano —o para un video que agregó por su cuenta— el prompt se
   pide desde acá, y sale mirando lo que YA escribió en ese bloque. */
function hbPromptCaja(ruta) {
  const p = (hbState.prompts || {})[ruta];
  if (!p) return '';
  if (p.cargando) return '<div class="hb-prompt-caja"><span class="loading">Escribiendo el prompt…</span></div>';
  if (p.error) return `<div class="hb-prompt-caja hb-prompt-error">${esc(p.error)}</div>`;
  return `<div class="hb-prompt-caja">
    <p class="hb-prompt-que"><b>${p.tipo === 'video' ? 'Video' : 'Foto'}:</b> ${esc(p.que)}</p>
    <p class="hb-f-help">${esc([p.formato, p.encuadre].filter(Boolean).join(' · '))}</p>
    ${p.evitar ? `<p class="hb-f-help">Evitar: ${esc(p.evitar)}</p>` : ''}
    ${p.producto_de_referencia ? `<p class="hb-prompt-ref">Adjuntá la foto de <b>${esc(p.producto_de_referencia)}</b> para que la prenda sea la real.</p>` : ''}
    <textarea readonly rows="5">${esc(p.prompt_ia)}</textarea>
    <span class="hb-prompt-acc">
      <button class="hb-mini" onclick="hbCopiarPrompt('${ruta}', this)">Copiar</button>
      <button class="hb-mini" onclick="hbPrompt('${ruta}', '${hbAttr(p.campo)}')">Otra versión</button>
      <button class="hb-mini rojo" onclick="hbCerrarPrompt('${ruta}')">Cerrar</button>
    </span>
  </div>`;
}

async function hbPrompt(ruta, clave) {
  const i = Number(ruta.split('.')[0]);
  const b = hbState.bloques[i];
  if (!b) return;
  hbState.prompts = hbState.prompts || {};
  // El campo que se manda es la ruta DENTRO del bloque (sin el índice del bloque),
  // para que el motor sepa si el hueco vive adentro de una lista.
  const campo = ruta.split('.').slice(2).join('.') || clave;
  hbState.prompts[ruta] = { cargando: true, campo };
  hbRenderEditor();
  try {
    const r = await api('/api/home/blocks/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: b.type, data: b.data, campo }),
    });
    hbState.prompts[ruta] = { ...r, campo };
  } catch (err) {
    hbState.prompts[ruta] = { error: `No pude escribir el prompt: ${err.message}`, campo };
  }
  hbRenderEditor();
}

async function hbCopiarPrompt(ruta, btn) {
  const p = (hbState.prompts || {})[ruta];
  if (!p || !p.prompt_ia) return;
  try {
    await navigator.clipboard.writeText(p.prompt_ia);
    const antes = btn.textContent;
    btn.textContent = 'Copiado';
    setTimeout(() => { btn.textContent = antes; }, 1600);
  } catch (_) {
    const ta = btn.closest('.hb-prompt-caja').querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
  }
}

function hbCerrarPrompt(ruta) {
  if (hbState.prompts) delete hbState.prompts[ruta];
  hbRenderEditor();
}

function hbCampoProductos(campo, ids, ruta, lab, help) {
  const elegidos = (hbState.buscando && hbState.buscando.elegidos) || {};
  const chips = ids.map((id, k) => {
    const p = elegidos[id];
    return `<span class="hb-prod-chip">
      ${p && p.image ? `<img src="${hbAttr(p.image)}" alt="">` : ''}
      <span>${esc(p ? p.name : 'Producto #' + id)}</span>
      ${p && p.stock === 0 ? '<b class="hb-sin">sin stock</b>' : ''}
      <button onclick="hbQuitarProducto('${ruta}', ${k})" title="Sacar">✕</button>
    </span>`;
  }).join('');

  const lista = (hbState.buscando && hbState.buscando.ruta === ruta && hbState.buscando.resultados) || [];
  return `<div class="hb-f">${lab}
    <div class="hb-prods-elegidos">${chips || '<span class="hb-f-help">Todavía no elegiste ninguno.</span>'}</div>
    ${ids.length < (campo.max || 6) ? `
      <input type="search" class="hb-buscar" placeholder="Buscar en el catálogo…" value="${hbAttr((hbState.buscando && hbState.buscando.ruta === ruta && hbState.buscando.q) || '')}"
             oninput="hbBuscarProductos('${ruta}', this.value)">
      ${lista.length ? `<div class="hb-result">${lista.map((p) => `
        <button class="hb-result-item" onclick="hbAgregarProducto('${ruta}', ${p.id})">
          ${p.image ? `<img src="${hbAttr(p.image)}" alt="">` : '<span class="hb-result-nofoto"></span>'}
          <span class="hb-result-txt"><b>${esc(p.name)}</b><small>${p.stock === null ? 'sin dato de stock' : p.stock + ' en stock'}</small></span>
        </button>`).join('')}</div>` : ''}
    ` : '<span class="hb-f-help">Llegaste al máximo de ' + (campo.max || 6) + '.</span>'}
    ${help}</div>`;
}

function hbCampoLista(campo, items, ruta, lab, help) {
  const filas = items.map((it, k) => `
    <div class="hb-item">
      <div class="hb-item-head">
        <span>${esc(campo.label.replace(/s$/, ''))} ${k + 1}</span>
        <span class="hb-item-acc">
          <button class="hb-ib" onclick="hbMoverItem('${ruta}', ${k}, -1)" ${k === 0 ? 'disabled' : ''}>↑</button>
          <button class="hb-ib" onclick="hbMoverItem('${ruta}', ${k}, 1)" ${k === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="hb-ib rojo" onclick="hbBorrarItem('${ruta}', ${k})">✕</button>
        </span>
      </div>
      <div class="hb-campos">${(campo.item || []).map((sub) => hbCampo(sub, it[sub.key], `${ruta}.${k}.${sub.key}`, it)).join('')}</div>
    </div>`).join('');

  const puedeMas = items.length < (campo.max || 6);
  return `<div class="hb-f hb-f--lista">${lab}
    ${filas || '<span class="hb-f-help">Vacío.</span>'}
    ${puedeMas ? `<button class="hb-mini" onclick="hbAgregarItem('${ruta}')">+ Agregar</button>` : `<span class="hb-f-help">Máximo ${campo.max}.</span>`}
    ${help}</div>`;
}

/* ------------------------------------------------------------- acciones -- */

function hbSetYRedibuja(ruta, valor) {
  hbSet(ruta, valor);
  hbRenderEditor();
}

function hbSetOpcion(i, llave, valor) {
  hbState.bloques[i][llave] = valor;
  hbState.sucio = true;
  hbMarcarSucio();
  hbPediPrevia();
}

function hbAbrir(i) {
  hbState.abierto = hbState.abierto === i ? null : i;
  hbRenderEditor();
  hbEnfocarPrevia(i);
}

function hbMover(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= hbState.bloques.length) return;
  const [b] = hbState.bloques.splice(i, 1);
  hbState.bloques.splice(j, 0, b);
  hbReasignarHuecos();
  if (hbState.abierto === i) hbState.abierto = j;
  hbState.sucio = true;
  hbRenderEditor();
  hbMarcarSucio();
  hbPediPrevia();
}

function hbToggle(i) {
  hbState.bloques[i].enabled = hbState.bloques[i].enabled === false;
  hbState.sucio = true;
  hbRenderEditor();
  hbMarcarSucio();
  hbPediPrevia();
}

function hbBorrar(i) {
  if (!confirm(`¿Borrar el bloque "${hbNombre(hbState.bloques[i])}"? No se puede deshacer.`)) return;
  hbState.bloques.splice(i, 1);
  hbReasignarHuecos();
  hbState.abierto = null;
  hbState.sucio = true;
  hbRenderEditor();
  hbMarcarSucio();
  hbPediPrevia();
}

/* El orden de la lista define qué hueco ocupa cada bloque: el primero va al
   "Bloque 1", el segundo al "Bloque 2"… Así el dueño ordena arrastrando acá y
   en Tiendanube pone los seis huecos una sola vez, donde quiera. */
function hbReasignarHuecos() {
  hbState.bloques.forEach((b, k) => { b.slot = hbState.catalogo.slots[k]; });
}

function hbMoverItem(ruta, k, dir) {
  const lista = hbGet(ruta);
  const j = k + dir;
  if (j < 0 || j >= lista.length) return;
  const [x] = lista.splice(k, 1);
  lista.splice(j, 0, x);
  hbSet(ruta, lista);
  hbRenderEditor();
}

function hbBorrarItem(ruta, k) {
  const lista = hbGet(ruta);
  lista.splice(k, 1);
  hbSet(ruta, lista);
  hbRenderEditor();
}

function hbAgregarItem(ruta) {
  const lista = hbGet(ruta) || [];
  // El campo declara los subcampos: se arma un ítem vacío con sus valores por defecto.
  const partes = ruta.split('.');
  const clave = partes[partes.length - 1];
  const bloque = hbState.bloques[Number(partes[0])];
  const campo = hbTipo(bloque.type).fields.find((f) => f.key === clave);
  const nuevo = {};
  (campo.item || []).forEach((sub) => { nuevo[sub.key] = sub.default !== undefined ? sub.default : (sub.type === 'switch' ? false : ''); });
  lista.push(nuevo);
  hbSet(ruta, lista);
  hbRenderEditor();
}

function hbUsarSugerencia(i, k) {
  const tipo = hbTipo(hbState.bloques[i].type);
  const s = tipo.sugerencias[k];
  if (!s) return;
  if (!confirm('Esto reemplaza los textos del bloque por el ejemplo sugerido. Las fotos y los videos no se tocan. ¿Seguimos?')) return;
  Object.keys(s).forEach((llave) => { hbState.bloques[i].data[llave] = JSON.parse(JSON.stringify(s[llave])); });
  hbState.sucio = true;
  hbRenderEditor();
  hbMarcarSucio();
  hbPediPrevia();
}

/* ------------------------------------------------------------- productos - */

let hbBuscarTimer = null;
function hbBuscarProductos(ruta, q) {
  hbState.buscando = { ...(hbState.buscando || {}), ruta, q, resultados: [] };
  clearTimeout(hbBuscarTimer);
  hbBuscarTimer = setTimeout(async () => {
    try {
      const r = await api(`/api/home/blocks/search?q=${encodeURIComponent(q)}`);
      const elegidos = (hbState.buscando && hbState.buscando.elegidos) || {};
      r.forEach((p) => { elegidos[p.id] = p; });
      hbState.buscando = { ruta, q, resultados: r, elegidos };
      hbRenderEditor();
      // El input se redibujó: hay que devolverle el foco y el cursor al final.
      const inp = document.querySelector('.hb-buscar');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    } catch (err) { toast(err.message, 'error'); }
  }, 300);
}

function hbAgregarProducto(ruta, id) {
  const ids = hbGet(ruta) || [];
  if (!ids.includes(id)) ids.push(id);
  hbSet(ruta, ids);
  hbState.buscando = { ...(hbState.buscando || {}), q: '', resultados: [] };
  hbRenderEditor();
}

function hbQuitarProducto(ruta, k) {
  const ids = hbGet(ruta);
  ids.splice(k, 1);
  hbSet(ruta, ids);
  hbRenderEditor();
}

/* --------------------------------------------------------------- subidas - */

function hbSubir(ruta, esVideo) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = esVideo ? 'video/mp4,video/webm,image/*' : 'image/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const mb = f.size / (1024 * 1024);
    if (!esVideo && mb > 10) { toast('La imagen pesa ' + mb.toFixed(1) + ' MB. El máximo es 10 MB.', 'error'); return; }
    if (mb > 120) { toast('El archivo pesa ' + mb.toFixed(0) + ' MB. El máximo es 120 MB.', 'error'); return; }
    if (esVideo && mb > 12) {
      if (!confirm(`El video pesa ${mb.toFixed(1)} MB. Se sube igual, pero un video de fondo arriba de ~10 MB hace lenta la página en celular. ¿Seguimos?`)) return;
    }
    toast('Subiendo…');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api('/api/home/blocks/upload', { method: 'POST', body: fd });
      hbSet(ruta, r.url);
      hbRenderEditor();
      toast('Listo, ya está arriba.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };
  inp.click();
}

/* --------------------------------------------------------------- galería - */

function hbAbrirGaleria() {
  if (hbState.bloques.length >= hbState.catalogo.slots.length) {
    toast('Ya usaste los 6 huecos. Borrá o desactivá uno para agregar otro.', 'error');
    return;
  }
  const html = `<div class="modal-overlay" onclick="if(event.target===this) this.remove()">
    <div class="modal hb-modal">
      <div class="modal-header">
        <h2>¿Qué querés agregar?</h2>
        <button class="btn-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p class="hint">El dibujito muestra la estructura: dónde va la foto, dónde el texto y cuántas piezas tiene.</p>
        <div class="hb-galeria">
          ${hbState.catalogo.types.map((t) => `
            <button class="hb-gal-item" onclick="hbCrear('${hbAttr(t.id)}'); this.closest('.modal-overlay').remove()">
              <span class="hb-gal-sk">${hbEsquema(t.id, 64)}</span>
              <b>${esc(t.label)}</b>
              <small>${esc(t.resumen)}</small>
              <em>${esc(t.para)}</em>
            </button>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

/** Bloque nuevo con todos los campos en su valor por defecto. */
function hbCrear(tipoId) {
  const tipo = hbTipo(tipoId);
  const data = {};
  tipo.fields.forEach((c) => {
    if (c.default !== undefined) data[c.key] = c.default;
    else if (c.type === 'switch') data[c.key] = false;
    else if (c.type === 'lista' || c.type === 'productos') data[c.key] = [];
    else if (c.type === 'numero') data[c.key] = c.min || 0;
    else if (c.type === 'opciones') data[c.key] = (c.options[0] || {}).value;
    else data[c.key] = '';
  });
  // Arranca con la primera sugerencia cargada: un bloque en blanco no se
  // entiende, y con texto de ejemplo se ve enseguida qué forma tiene.
  if (tipo.sugerencias && tipo.sugerencias[0]) {
    Object.keys(tipo.sugerencias[0]).forEach((k) => { data[k] = JSON.parse(JSON.stringify(tipo.sugerencias[0][k])); });
  }
  // La lista mínima no puede quedar vacía: se completan los ítems que falten.
  tipo.fields.filter((c) => c.type === 'lista' && c.min).forEach((c) => {
    while ((data[c.key] || []).length < c.min) {
      const it = {};
      (c.item || []).forEach((sub) => { it[sub.key] = sub.default !== undefined ? sub.default : ''; });
      data[c.key] = (data[c.key] || []).concat([it]);
    }
  });

  hbState.bloques.push({
    slot: hbState.catalogo.slots[hbState.bloques.length],
    type: tipoId, enabled: true, theme: 'claro', width: 'contenido',
    spacing: 'normal', device: 'todos', accent: '', notas: [], data,
  });
  hbState.abierto = hbState.bloques.length - 1;
  hbState.sucio = true;
  renderHomeBlocks();
  hbPediPrevia();
}

/* ---------------------------------------------------------------- previa - */

function hbDevice(d) {
  hbState.device = d;
  document.querySelectorAll('.hb-dev-b').forEach((b) => b.classList.toggle('on', b.textContent.trim() === (d === 'mobile' ? 'Celular' : 'Escritorio')));
  const marco = document.querySelector('.hb-marco');
  if (marco) marco.className = `hb-marco hb-marco--${d}`;
  hbPintarPrevia();
}

/** Pide la previa al motor, con freno para no pegarle en cada tecla. */
function hbPediPrevia() {
  clearTimeout(hbState.timer);
  hbState.timer = setTimeout(async () => {
    const avisos = document.getElementById('hb-avisos');
    try {
      const r = await api('/api/home/blocks/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: hbState.bloques }),
      });
      hbState.previa = r;
      hbState.avisos = r.avisos || [];
      // Nombres y fotos de los productos ya elegidos, para las pastillas.
      if (r.productos) {
        hbState.buscando = hbState.buscando || {};
        hbState.buscando.elegidos = Object.assign({}, hbState.buscando.elegidos, r.productos);
      }
      const faltaba = JSON.stringify(hbState.faltantes);
      hbState.faltantes = {};
      (r.faltantes || []).forEach((f) => { hbState.faltantes[f.slot] = f.mensaje; });
      if (avisos) {
        avisos.innerHTML = (r.faltantes || []).map((f) => `<p class="hb-aviso hb-aviso--falta">${esc(f.mensaje)}</p>`).join('')
          + hbState.avisos.map((a) => `<p class="hb-aviso">${esc(a)}</p>`).join('');
      }
      // La lista sólo se redibuja si cambió qué falta: si no, se perdería el
      // foco del campo que se está tipeando.
      if (JSON.stringify(hbState.faltantes) !== faltaba || hbState.primeraPrevia) {
        hbState.primeraPrevia = false;
        hbRenderEditor();
      }
      hbPintarPrevia();
    } catch (err) {
      if (avisos) avisos.innerHTML = `<p class="hb-aviso hb-aviso--falta">No pude armar la vista previa: ${esc(err.message)}</p>`;
    }
  }, 420);
}

function hbPintarPrevia() {
  const marco = document.getElementById('hb-iframe');
  if (!marco || !hbState.previa) return;
  const p = hbState.previa;
  // Los borradores (apagados) también se pintan: si no, no se pueden terminar
  // de escribir. Van marcados para que no se confundan con lo publicado.
  const cuerpo = hbState.bloques
    .filter((b) => p.blocks[b.slot])
    .map((b) => (b.enabled === false
      ? `<div class="hb-borrador"><span>Borrador — todavía no se ve en la tienda</span>${p.blocks[b.slot].html}</div>`
      : p.blocks[b.slot].html))
    .join('\n');

  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    color:#111214;-webkit-font-smoothing:antialiased;}
  /* Marca de dónde termina cada bloque, sólo en la previa. */
  .hb + .hb{box-shadow:0 -1px 0 rgba(127,127,127,.28);}
  .hb-foco{outline:2px dashed #E2571F; outline-offset:-2px;}
  .hb-borrador{position:relative; opacity:.62; filter:grayscale(.35);}
  .hb-borrador > span{position:absolute; z-index:5; top:8px; left:8px; background:#E2571F; color:#fff;
    font:600 10px/1 -apple-system,sans-serif; letter-spacing:.06em; text-transform:uppercase;
    padding:5px 9px; border-radius:4px;}
  ${p.css}
</style></head><body>
${cuerpo || '<p style="padding:40px 20px;color:#888;font-size:14px;text-align:center">Agregá un bloque para verlo acá.</p>'}
<script>${p.js}<\/script>
</body></html>`;

  marco.srcdoc = doc;
  marco.onload = () => hbEnfocarPrevia(hbState.abierto);
}

/** Resalta y trae a la vista el bloque que se está editando. */
function hbEnfocarPrevia(i) {
  const f = document.getElementById('hb-iframe');
  if (!f || i == null || !f.contentDocument) return;
  const b = hbState.bloques[i];
  if (!b) return;
  f.contentDocument.querySelectorAll('.hb-foco').forEach((e) => e.classList.remove('hb-foco'));
  const el = f.contentDocument.querySelector(`[data-hb-slot="${b.slot}"]`);
  if (el) { el.classList.add('hb-foco'); el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}

/* ------------------------------------------------------------- publicar -- */

async function hbPublicar() {
  const btn = document.getElementById('hb-publicar');
  const antes = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Publicando…';
  try {
    const r = await api('/api/home/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: hbState.bloques }),
    });
    hbState.bloques = r.config.blocks;
    hbState.sucio = false;
    hbMarcarSucio();
    toast('Publicado. La tienda lo toma en menos de un minuto.', 'ok');
    if (r.avisos && r.avisos.length) r.avisos.forEach((a) => toast(a, 'error'));
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = antes;
    hydrateIcons();
  }
}

// Aviso al cerrar con cambios sin publicar: el bloque queda sólo en la pantalla.
window.addEventListener('beforeunload', (e) => {
  if (!hbState.sucio) return;
  e.preventDefault();
  e.returnValue = '';
});
