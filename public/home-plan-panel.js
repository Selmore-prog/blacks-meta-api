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

let hpState = {
  plan: null, copys: {}, escribiendo: null,
  // 'boceto' (la página dibujada) o 'lista' (la tabla). Se recuerda entre visitas.
  vista: (() => { try { return localStorage.getItem('hpVista') || 'boceto'; } catch (_) { return 'boceto'; } })(),
};

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

  /* "Volver a leer" no daba NINGUNA señal: con el esquema ya en pantalla no se
     dibuja el esqueleto, así que se apretaba el botón y durante unos segundos
     no pasaba nada visible — parecía que no funcionaba. Ahora el botón se
     bloquea y avisa mientras vuelve a bajar la tienda. */
  const btn = document.querySelector('[onclick*="loadHomePlan(true)"]');
  const antes = btn ? btn.innerHTML : null;
  if (btn && force) { btn.disabled = true; btn.textContent = 'Leyendo la tienda…'; }

  try {
    hpState.plan = await api(`/api/home/plan${force ? '?force=1' : ''}`);
    renderHomePlan();
  } catch (err) {
    /* Si ya había un esquema en pantalla NO se borra: se avisa arriba y se deja
       lo anterior. Antes un error dejaba la pestaña vacía y había que salir y
       volver a entrar para recuperar lo que ya estaba calculado. */
    if (hpState.plan) {
      const aviso = document.createElement('p');
      aviso.className = 'hint hp-mal';
      aviso.textContent = `No pude volver a leer la tienda: ${err.message}`;
      cont.prepend(aviso);
      setTimeout(() => aviso.remove(), 8000);
    } else {
      cont.innerHTML = `<p class="hint">No pude armar el esquema: ${esc(err.message)}</p>`;
    }
  } finally {
    // renderHomePlan() redibuja el botón, así que se vuelve a buscar.
    const b = document.querySelector('[onclick*="loadHomePlan(true)"]');
    if (b) { b.disabled = false; if (antes && b.innerHTML !== antes) b.innerHTML = antes; }
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

/* ------------------------------------------------------------ comparación
 * Dos vistas de lo mismo:
 *   BOCETO — la página dibujada, sección por sección, como se apila en un
 *            celular. Es la que se entiende de un vistazo: no dice "riel", se
 *            ve una fila de tarjetas. Se dibuja en mobile porque es de donde
 *            viene la mayoría de las visitas.
 *   LISTA  — la misma información en tabla, para leer rápido las posiciones.
 * ----------------------------------------------------------------------- */

/* Cada sección se dibuja con la forma que realmente tiene en la página. Son
   divs vacíos con borde: no se busca fidelidad, se busca que la silueta se
   reconozca (una fila de tarjetas se ve como una fila de tarjetas). */
function hpSilueta(id, tipo, bloque) {
  const clave = tipo === 'bloque' ? bloque : id;
  const rep = (n, cls) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('');

  switch (clave) {
    case 'slider':
    case 'portada':
      return `<div class="sk-hero">${rep(3, 'sk-dot')}</div>`;
    case 'trust_badges':
    case 'atributos':
      return `<div class="sk-fila sk-fila--chips">${rep(4, 'sk-chip')}</div>`;
    case 'rail_1': case 'rail_2': case 'rail_3': case 'rail_4':
    case 'products': case 'new': case 'sale': case 'promotion': case 'best_seller':
      return `<div class="sk-titulo"></div><div class="sk-fila sk-fila--cards">${rep(4, 'sk-card')}</div>`;
    // Bloque "Productos elegidos": grilla, no riel — no se desliza.
    case 'productos':
      return `<div class="sk-titulo"></div><div class="sk-grilla">${rep(4, 'sk-card')}</div>`;
    case 'flash_sale':
      return `<div class="sk-titulo"></div><div class="sk-fila sk-fila--pills">${rep(3, 'sk-pill')}</div>
              <div class="sk-fila sk-fila--cards">${rep(4, 'sk-card')}</div>`;
    case 'editorial':
      return `<div class="sk-edit"><i class="sk-big"></i><div>${rep(2, 'sk-small')}</div></div>`;
    case 'media_texto':
      return `<div class="sk-split"><i class="sk-img"></i><div class="sk-lineas">${rep(4, 'sk-linea')}</div></div>`;
    case 'video':
      return `<div class="sk-video"><i class="sk-play"></i></div>`;
    case 'preguntas':
      return `<div class="sk-faq">${rep(3, 'sk-faq-row')}</div>`;
    case 'rubros':
      return `<div class="sk-fila sk-fila--tiles">${rep(4, 'sk-tile')}</div>`;
    case 'cinta':
      return `<div class="sk-cinta"></div>`;
    case 'lookbook':
      return `<div class="sk-look">${rep(3, 'sk-pin')}</div>`;
    case 'brands':
      return `<div class="sk-fila sk-fila--logos">${rep(5, 'sk-logo')}</div>`;
    case 'newsletter':
      return `<div class="sk-news"><i class="sk-input"></i><i class="sk-btn"></i></div>`;
    case 'promotional': case 'categories': case 'news_banners':
      return `<div class="sk-banners">${rep(2, 'sk-banner')}</div>`;
    case 'about_strip': case 'guarantees': case 'institutional': case 'welcome':
      return `<div class="sk-lineas sk-lineas--sueltas">${rep(3, 'sk-linea')}</div>`;
    case 'main_categories': case 'atajos':
      return `<div class="sk-fila sk-fila--circ">${rep(5, 'sk-circ')}</div>`;
    default:
      return '<div class="sk-generico"></div>';
  }
}

const HP_TIPO_ETQ = {
  nativa: 'Tiendanube', riel: 'automático', bloque: 'bloque nuevo',
  fija: 'fija en el theme',
};

/* Una tarjeta del boceto: nombre + silueta + qué le pasa. */
function hpBocetoItem(x, lado) {
  const e = HP_ESTADO[x.estado] || { txt: '', cls: '' };
  const tipo = x.tipo || (x.fija ? 'fija' : 'nativa');
  const nombre = lado === 'hoy'
    ? x.nombre
    : (x.tipo === 'bloque' ? `◆ ${hpNombreBloque(x.bloque)}` : x.nombre || hpNombreSeccion(x.id));

  // En la columna "hoy", el destino; en la propuesta, de dónde viene.
  let nota = '';
  if (lado === 'hoy' && x.destino && x.destino !== x.pos) nota = `va a la ${x.destino}`;
  else if (lado === 'hoy' && !x.destino) nota = 'no entra en el plan';
  else if (lado === 'plan' && x.estado === 'mover') nota = `hoy está en la ${x.posActual}`;
  else if (lado === 'plan' && x.estado === 'agregar') nota = 'hay que agregarla';
  else if (lado === 'plan' && x.estado === 'encender') nota = 'está apagada';

  return `<div class="sk-sec sk-sec--${esc(e.cls || 'ok')} ${x.vacia ? 'sk-sec--vacia' : ''}">
    <div class="sk-cab">
      <span class="sk-pos">${x.pos}</span>
      <span class="sk-nom">${esc(nombre)}</span>
      <span class="sk-tipo sk-tipo--${esc(tipo)}">${esc(HP_TIPO_ETQ[tipo] || tipo)}</span>
    </div>
    <div class="sk-cuerpo">${hpSilueta(x.id, x.tipo, x.bloque)}</div>
    ${nota || x.vacia ? `<div class="sk-nota">${x.vacia ? 'Está puesta pero no muestra nada. ' : ''}${esc(nota)}</div>` : ''}
  </div>`;
}

function hpBocetoCol(items, lado, titulo, sub) {
  return `<div class="sk-col">
    <div class="sk-col-cab"><h4>${esc(titulo)}</h4><span>${esc(sub)}</span></div>
    <div class="sk-tel">
      <div class="sk-barra"><i></i><i></i></div>
      ${items.map((x) => hpBocetoItem(x, lado)).join('')}
      <div class="sk-pie">pie de página</div>
    </div>
  </div>`;
}

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

  const vista = hpState.vista || 'boceto';
  return `<section class="hp-sec">
    ${panelHead('Cómo está hoy y cómo convendría',
    'La columna de la izquierda es lo que hay realmente en tu página de inicio, leído del HTML de la tienda. La de la derecha es la propuesta. El boceto está dibujado como se ve en un celular.',
    `<div class="hp-vista">
        <button class="hp-vbtn ${vista === 'boceto' ? 'is-on' : ''}" onclick="hpVista('boceto')">Boceto</button>
        <button class="hp-vbtn ${vista === 'lista' ? 'is-on' : ''}" onclick="hpVista('lista')">Lista</button>
      </div>`)}

    ${vista === 'boceto' ? `
      <div class="sk-wrap">
        ${hpBocetoCol(p.hoy, 'hoy', 'Hoy', `${p.hoy.length} secciones a la vista`)}
        ${hpBocetoCol(p.plan, 'plan', 'Propuesto', `${p.plan.length} secciones`)}
      </div>
      <div class="sk-ref">
        <span><i class="sk-ref-c sk-ref-c--ok"></i> queda donde está</span>
        <span><i class="sk-ref-c sk-ref-c--mover"></i> cambia de lugar</span>
        <span><i class="sk-ref-c sk-ref-c--nuevo"></i> hay que agregarla</span>
        <span><i class="sk-ref-c sk-ref-c--sobra"></i> no entra en el plan</span>
      </div>`
    : `<div class="hp-cmp">
        <div class="hp-col"><h4>Hoy</h4>${Array.from({ length: filas }, (_, i) => cel(p.hoy[i], 'hoy')).join('')}</div>
        <div class="hp-col"><h4>Propuesto</h4>${Array.from({ length: filas }, (_, i) => cel(p.plan[i], 'plan')).join('')}</div>
      </div>`}
  </section>`;
}

function hpVista(v) {
  hpState.vista = v;
  try { localStorage.setItem('hpVista', v); } catch (_) { /* modo privado */ }
  renderHomePlan();
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
  promotional: 'Banners promocionales', categories: 'Banners de categorías',
  news_banners: 'Banners de novedades', main_categories: 'Categorías principales',
  products: 'Productos destacados', informatives: 'Información de envíos y pagos',
  // Las tres franjas escritas a mano en el theme (ver src/storeHome.js → FIJAS).
  trust_badges: 'Franja de confianza (envío, cuotas, retiro, cambios)',
  about_strip: 'Franja "quiénes somos"',
  guarantees: '"¿Por qué elegir BLACKS?"',
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

  const visuales = (c.visuales || []).map((v, i) => {
    // El prompt se guarda en el estado y NO en un atributo del botón: llevarlo
    // por HTML obliga a escapar comillas y saltos y se rompe con cualquier
    // apóstrofo del texto.
    hpState.prompts = hpState.prompts || {};
    const id = `p${Date.now().toString(36)}${i}`;
    hpState.prompts[id] = v.prompt_ia || '';
    return `<div class="hp-visual">
      <b>${esc(v.campo)}</b>
      <p>${esc(v.que)}</p>
      <p class="hp-dato">${esc(v.formato)} · ${esc(v.encuadre)}</p>
      <p class="hp-evitar">Evitar: ${esc(v.evitar)}</p>
      ${v.prompt_ia ? `<details class="hp-prompt">
        <summary>Generarla con IA${v.producto_de_referencia ? ` · adjuntá la foto de "${esc(v.producto_de_referencia)}"` : ''}</summary>
        <textarea readonly rows="5">${esc(v.prompt_ia)}</textarea>
        <button class="btn-ghost btn-sm" onclick="hpCopiarPrompt('${id}', this)">Copiar el prompt</button>
        <p class="hp-dato">Pegalo en Gemini${v.producto_de_referencia ? ', adjuntando la foto del producto para que la prenda sea la real' : ''}. Está escrito para que la foto no parezca generada.</p>
      </details>` : ''}
    </div>`;
  }).join('');

  return `<div class="hp-resultado">
    ${c.porQue ? `<p class="hp-porque-ia">${esc(c.porQue)}</p>` : ''}
    <div class="hp-campos">${campos}</div>
    ${c.respaldo ? `<div class="hp-respaldo"><h5>Con qué productos se sostiene</h5><p>${esc(c.respaldo)}</p></div>` : ''}
    ${visuales ? `<div class="hp-visuales"><h5>Qué foto o video conseguir</h5>${visuales}</div>` : ''}
  </div>`;
}

async function hpCopiarPrompt(id, btn) {
  const txt = (hpState.prompts || {})[id] || '';
  if (!txt) return;
  try {
    await navigator.clipboard.writeText(txt);
    const antes = btn.textContent;
    btn.textContent = 'Copiado';
    setTimeout(() => { btn.textContent = antes; }, 1600);
  } catch (_) {
    // Sin permiso de portapapeles: se selecciona para copiar a mano.
    const ta = btn.parentElement.querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
    toast('Copialo con Ctrl+C: el navegador no me dejó hacerlo solo.', 'warn');
  }
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
