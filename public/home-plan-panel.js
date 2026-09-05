/* =========================================================================
 * ESQUEMA IDEAL DEL HOME — panel.
 *
 * Muestra tres cosas y en ese orden, que es el orden en que se decide:
 *   1. Qué está mal hoy, con el número que lo prueba.
 *   2. Cómo está la página ahora contra cómo convendría que esté, lado a lado.
 *   3. Qué hay que hacer: los bloques nuevos (que se crean desde acá) y los
 *      movimientos a mano en el panel de diseño de Tiendanube.
 *
 * El orden actual NO es una suposición: se lee del HTML de la tienda en vivo.
 * ========================================================================= */

/* eslint-disable no-unused-vars */

let hpState = { plan: null, copys: {}, escribiendo: null };

const HP_NIVEL = { alto: 'Urgente', medio: 'Conviene', bajo: 'Detalle' };
const HP_ESTADO = {
  queda: { txt: 'Ya está donde va', cls: 'ok' },
  mover: { txt: 'Hay que moverla', cls: 'mover' },
  agregar: { txt: 'Falta agregarla', cls: 'nuevo' },
  encender: { txt: 'Está apagada', cls: 'nuevo' },
  sacar: { txt: 'Conviene sacarla', cls: 'sacar' },
  sobra: { txt: 'No entra en el plan', cls: 'sobra' },
};

async function loadHomePlan(force = false) {
  const cont = document.getElementById('hs-plan');
  if (!hpState.plan) cont.innerHTML = skeleton('rows', 5);
  try {
    hpState.plan = await api(`/api/home/plan${force ? '?force=1' : ''}`);
    renderHomePlan();
  } catch (err) {
    cont.innerHTML = `<p class="hint">No pude armar el esquema: ${esc(err.message)}</p>`;
  }
}

function hpHace(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}

function renderHomePlan() {
  const p = hpState.plan;
  const s = p.senales;
  const home = s.home;
  const bloques = p.plan.filter((x) => x.tipo === 'bloque');

  document.getElementById('hs-plan').innerHTML = `
    <div class="hp-top">
      <div class="hp-lectura">
        ${home.disponible
    ? `Leído de <b>${esc(home.url.replace(/^https?:\/\//, ''))}</b> ${hpHace(home.leido)} · ${home.visibles} secciones a la vista, ${home.ocultas} apagadas · ${home.peso_kb} KB`
    : `<span class="hp-mal">No pude leer la tienda (${esc(home.error || 'sin respuesta')}). El esquema se arma igual, pero sin comparar contra lo que hay hoy.</span>`}
      </div>
      <button class="btn-ghost btn-sm" onclick="loadHomePlan(true)"><span data-ic="refresh"></span> Volver a leer</button>
    </div>

    <div class="hp-contexto">
      <span class="hp-pill">Entra <b>${esc(s.estacion.nombre)}</b></span>
      ${s.catTemporada ? `<span class="hp-pill">Empujar <b>${esc(s.catTemporada.ruta)}</b> · ${s.catTemporada.productos} productos</span>` : ''}
      ${s.catSaliente ? `<span class="hp-pill hp-pill--alerta">Liquidar <b>${esc(s.catSaliente.ruta)}</b> · ${s.catSaliente.stock} u.</span>` : ''}
      ${s.evento ? `<span class="hp-pill">${esc(s.evento.titulo)} en ${s.evento.dias} días</span>` : ''}
      <span class="hp-pill">${s.leads.pct_mayorista}% de consultas mayoristas</span>
    </div>

    ${hpDiagnostico(p.diagnostico)}
    ${hpComparacion(p)}
    ${hpBloques(bloques)}
    ${hpMovimientos(p.movimientos)}
  `;
  hydrateIcons();
}

/* ------------------------------------------------------------ diagnóstico */
function hpDiagnostico(d) {
  if (!d.length) return '';
  return `<section class="hp-sec">
    ${panelHead('Qué está frenando la página', 'Cada punto sale de un número real del catálogo, de las consultas por WhatsApp o del HTML de la tienda. Si el dato no existe, el punto no aparece.')}
    <div class="hp-diags">
      ${d.map((x) => `<div class="hp-diag hp-diag--${esc(x.nivel)}">
        <span class="hp-nivel">${esc(HP_NIVEL[x.nivel] || x.nivel)}</span>
        <div>
          <b>${esc(x.titulo)}</b>
          <p>${esc(x.detalle)}</p>
          ${x.dato ? `<p class="hp-dato">${esc(x.dato)}</p>` : ''}
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

/* ------------------------------------------------------------ comparación */
function hpComparacion(p) {
  const filas = Math.max(p.hoy.length, p.plan.length);
  const cel = (x, lado) => {
    if (!x) return '<div class="hp-cel hp-cel--vacia"></div>';
    const e = HP_ESTADO[x.estado] || { txt: '', cls: '' };
    const nombre = lado === 'hoy'
      ? x.nombre
      : (x.tipo === 'bloque' ? `◆ ${hpNombreBloque(x.bloque)}` : x.nombre || hpNombreSeccion(x.id));
    return `<div class="hp-cel hp-cel--${e.cls}">
      <span class="hp-pos">${x.pos}</span>
      <span class="hp-nom">${esc(nombre)}${x.vacia ? ' <i>(vacía)</i>' : ''}</span>
      <span class="hp-est">${lado === 'hoy' && x.destino && x.destino !== x.pos ? `→ ${x.destino}` : esc(e.txt)}</span>
    </div>`;
  };

  return `<section class="hp-sec">
    ${panelHead('Cómo está hoy y cómo convendría', 'La columna de la izquierda es lo que hay realmente en tu página de inicio, leído del HTML. La de la derecha es la propuesta.')}
    <div class="hp-cmp">
      <div class="hp-col"><h4>Hoy</h4>${Array.from({ length: filas }, (_, i) => cel(p.hoy[i], 'hoy')).join('')}</div>
      <div class="hp-col"><h4>Propuesto</h4>${Array.from({ length: filas }, (_, i) => cel(p.plan[i], 'plan')).join('')}</div>
    </div>
  </section>`;
}

const HP_BLOQUES = {
  portada: 'Portada', media_texto: 'Imagen y texto', atributos: 'Tira de atributos',
  editorial: 'Editorial', video: 'Video', productos: 'Productos elegidos',
  cinta: 'Cinta de texto', preguntas: 'Preguntas frecuentes', rubros: '¿Qué necesitás?',
};
const hpNombreBloque = (t) => HP_BLOQUES[t] || t;
const hpNombreSeccion = (id) => ({
  slider: 'Carrusel de imágenes', rail_1: '★ Riel automático 1', rail_2: '★ Riel automático 2',
  rail_3: '★ Riel automático 3', rail_4: '★ Riel automático 4', flash_sale: '★ Ofertas flash',
  lookbook: 'Lookbook interactivo', brands: 'Marcas', newsletter: 'Newsletter',
}[id] || id);

/* --------------------------------------------------------- bloques nuevos */
function hpBloques(bloques) {
  if (!bloques.length) return '';
  return `<section class="hp-sec">
    ${panelHead('Los bloques que faltan', 'Se crean desde acá, apagados, con los textos ya escritos. Los prendés cuando les cargues la foto. Lo que escribe la IA sale de tus datos: las URLs de los botones son categorías que existen y los números salen del catálogo.')}
    <div class="hp-bloques">
      ${bloques.map((b, i) => {
    const copy = hpState.copys[b.pos];
    return `<div class="hp-bloque">
        <div class="hp-bloque-head">
          <div>
            <span class="hp-bloque-tipo">◆ ${esc(hpNombreBloque(b.bloque))}${b.slot ? ` · ${esc(b.slot.replace('block_', 'Bloque '))}` : ''}</span>
            <b>Posición ${b.pos}</b>
          </div>
          <div class="hp-bloque-acc">
            <button class="btn-ghost btn-sm" onclick="hpEscribir(${b.pos})" ${hpState.escribiendo === b.pos ? 'disabled' : ''}>
              <span data-ic="sparkles"></span> ${copy ? 'Escribir otra versión' : 'Escribir con IA'}
            </button>
            ${copy ? `<button class="btn-primary btn-sm" onclick="hpCrear(${b.pos})"><span data-ic="plus"></span> Crear el bloque</button>` : ''}
          </div>
        </div>
        <p class="hp-que">${esc(b.que)}</p>
        <p class="hp-porque">${esc(b.porQue)}</p>
        ${b.dato ? `<p class="hp-dato">${esc(b.dato)}</p>` : ''}
        ${hpState.escribiendo === b.pos ? '<p class="loading">Escribiendo…</p>' : ''}
        ${copy ? hpCopy(copy) : ''}
      </div>`;
  }).join('')}
    </div>
  </section>`;
}

function hpCopy(c) {
  const campos = Object.entries(c.data)
    .filter(([, v]) => v && (typeof v === 'string' ? v.trim() : v.length))
    .map(([k, v]) => {
      const valor = Array.isArray(v)
        ? `<ul>${v.map((it) => `<li>${esc(Object.values(it).filter((x) => x && String(x).length > 2).join(' — '))}</li>`).join('')}</ul>`
        : esc(v);
      return `<div class="hp-campo"><span>${esc(k)}</span><div>${valor}</div></div>`;
    }).join('');

  const visuales = (c.visuales || []).map((v) => `<div class="hp-visual">
      <b>${esc(v.campo)}</b>
      <p>${esc(v.que)}</p>
      <p class="hp-dato">${esc(v.formato)} · ${esc(v.encuadre)}</p>
      <p class="hp-evitar">Evitar: ${esc(v.evitar)}</p>
    </div>`).join('');

  return `<div class="hp-resultado">
    ${c.porQue ? `<p class="hp-porque-ia">${esc(c.porQue)}</p>` : ''}
    <div class="hp-campos">${campos}</div>
    ${visuales ? `<div class="hp-visuales"><h5>Qué foto o video conseguir</h5>${visuales}</div>` : ''}
  </div>`;
}

async function hpEscribir(pos) {
  const b = hpState.plan.plan.find((x) => x.pos === pos);
  if (!b) return;
  hpState.escribiendo = pos;
  renderHomePlan();
  try {
    const s = hpState.plan.senales;
    const copy = await api('/api/home/plan/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: b.bloque,
        rol: { que: b.que, porQue: b.porQue, dato: b.dato },
        extra: {
          estacion: s.estacion,
          evento: s.evento,
          categoria: s.catTemporada || s.topCategoria || null,
        },
      }),
    });
    hpState.copys[pos] = copy;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hpState.escribiendo = null;
    renderHomePlan();
  }
}

/** Crea el bloque como BORRADOR (apagado) y abre el constructor con él. */
async function hpCrear(pos) {
  const b = hpState.plan.plan.find((x) => x.pos === pos);
  const copy = hpState.copys[pos];
  if (!b || !copy) return;

  if (!hbState.catalogo) await loadHomeBlocks();
  /* switchHomePane() carga cada panel la PRIMERA vez que se abre, y esa carga
     relee la config guardada. Si el bloque nuevo se agrega antes, la recarga lo
     pisa y el botón parece no hacer nada. Se marca como ya cargado. */
  hsCargados.add('bloques');
  if (hbState.bloques.length >= hbState.catalogo.slots.length) {
    toast('Ya usaste los 6 huecos de bloque. Borrá uno para crear este.', 'error');
    return;
  }

  // Se parte del bloque en blanco (con todos los valores por defecto) y se le
  // pisan encima los textos que escribió la IA: así los campos que la IA no
  // toca —interruptores, proporciones— quedan con su valor sano.
  const tipo = hbTipo(b.bloque);
  const data = {};
  tipo.fields.forEach((c) => {
    if (c.default !== undefined) data[c.key] = c.default;
    else if (c.type === 'switch') data[c.key] = false;
    else if (c.type === 'lista' || c.type === 'productos') data[c.key] = [];
    else if (c.type === 'numero') data[c.key] = c.min || 0;
    else if (c.type === 'opciones') data[c.key] = (c.options[0] || {}).value;
    else data[c.key] = '';
  });
  Object.entries(copy.data).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    if (Array.isArray(v) && !v.length) return;
    data[k] = v;
  });

  const libres = hbState.catalogo.slots.filter((sl) => !hbState.bloques.some((x) => x.slot === sl));
  hbState.bloques.push({
    slot: libres[0],
    type: b.bloque,
    enabled: false, // borrador: le falta la foto
    theme: 'claro', width: 'contenido', spacing: 'normal', device: 'todos', accent: '',
    notas: copy.visuales || [],
    data,
  });
  hbState.abierto = hbState.bloques.length - 1;
  hbState.sucio = true;

  switchHomePane('bloques');
  renderHomeBlocks();
  hbPediPrevia();
  toast('Bloque creado como borrador. Cargale la foto y prendelo.', 'ok');
}

/* ------------------------------------------------------------ movimientos */
function hpMovimientos(movs) {
  if (!movs.length) {
    return `<section class="hp-sec"><div class="hp-listo">La página ya está en el orden propuesto. No hay nada que mover.</div></section>`;
  }
  const texto = movs.map((m, i) => `${i + 1}. ${m.texto}`).join('\n');
  return `<section class="hp-sec">
    ${panelHead('Qué mover en Tiendanube', 'Esto no lo puede hacer el motor: el panel de diseño de Tiendanube no tiene forma de recibir cambios desde afuera. Es una sola vez — después el contenido de los bloques se cambia desde acá.',
    `<button class="btn-ghost btn-sm" onclick="hpCopiar()"><span data-ic="copy"></span> Copiar la lista</button>`)}
    <p class="hint">En Tiendanube: <b>Mi tienda → Diseño → Página de inicio</b>.</p>
    <ol class="hp-movs">
      ${movs.map((m) => `<li class="hp-mov hp-mov--${esc(m.tipo)}">${esc(m.texto)}</li>`).join('')}
    </ol>
    <textarea id="hp-copiar" class="hp-oculto" readonly>${esc(texto)}</textarea>
  </section>`;
}

function hpCopiar() {
  const t = document.getElementById('hp-copiar');
  t.classList.remove('hp-oculto');
  t.select();
  try { document.execCommand('copy'); toast('Lista copiada.', 'ok'); } catch (_) { toast('No pude copiar: seleccionala a mano.', 'error'); }
  t.classList.add('hp-oculto');
}
