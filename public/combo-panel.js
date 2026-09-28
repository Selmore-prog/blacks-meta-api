/* =========================================================================
 * PANEL DEL "COMBO FRECUENTE" (Home de la tienda → Combos)
 *
 * Un solo número: el % que se descuenta solo cuando el cliente lleva dos
 * productos que se compran juntos. Al guardar, el motor se lo manda al Worker
 * de descuentos de Cloudflare, que lo aplica en el checkout y lo sirve al modal
 * de la ficha. Sin publicar el tema ni esperar al cron.
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, tip, icon,
 * hydrateIcons, skeleton). Backend: src/comboDiscount.js + /api/combo-discount.
 * ========================================================================= */

const cbState = { data: null, valor: null, guardando: false, recienGuardado: false };

// Atajos. El 0 es "sin descuento": el modal deja de ofrecer el combo.
const CB_ATAJOS = [0, 5, 8, 10, 15];

// Precios de ejemplo de la vista previa: la ficha + el complemento sugerido.
const CB_EJEMPLO = { ficha: 30000, complemento: 25000 };

async function comboCargar() {
  const cont = document.getElementById('hs-combos');
  if (!cont) return;
  cont.innerHTML = '<div class="panel">' + skeleton('rows', 3) + '</div>';
  try {
    cbState.data = await api('/api/combo-discount');
    cbState.valor = cbState.data.crosssell.percent;
    cbState.recienGuardado = false;
    comboRender();
  } catch (err) {
    cont.innerHTML = `<div class="panel">${panelHead('Combo frecuente')}
      <p class="error" style="margin:0">${esc(err.message)}</p>
      <div class="nav-acciones" style="margin-top:14px"><button class="btn-ghost btn-sm" onclick="comboCargar()">Reintentar</button></div>
    </div>`;
  }
}

function cbPesos(n) {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}

// "28/09 a las 09:50". A mano: toLocaleTimeString('es-AR') devuelve "09:50 a. m."
// según el navegador, y pegado al punto final quedaba "a. m..".
function cbFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function comboRender() {
  const cont = document.getElementById('hs-combos');
  if (!cont || !cbState.data) return;
  const cs = cbState.data.crosssell;
  const max = cbState.data.maxPercent || 40;
  const actual = cs.percent;

  const origen = cs.percentSource === 'panel'
    ? `Guardado desde este panel${cs.percentUpdatedAt ? ' el ' + esc(cbFecha(cs.percentUpdatedAt)) : ''}.`
    : 'Viene del campo viejo del admin del tema. Al guardar acá, pasa a mandar este panel.';

  const avisos = [];
  if (!cs.enabled) {
    avisos.push('El combo está <b>apagado</b> en el admin del tema (Editar diseño → Detalle de producto → Cross-selling inteligente). '
      + 'Mientras siga apagado, el modal no aparece y este % no se usa.');
  }
  if (!cs.promotionReady) {
    avisos.push('El Worker no tiene creada la promoción del combo, así que el checkout no puede aplicar nada. Hay que correr <code>/setup</code> en el Worker.');
  }

  cont.innerHTML = `
  <div class="panel combo-panel">
    ${panelHead('Combo frecuente', 'El descuento automático que se aplica cuando el cliente lleva dos productos que la gente ya compró junta. Lo ofrece el modal que aparece al agregar un producto al carrito, y el checkout lo descuenta solo (en el carrito figura como "Combo frecuente").')}

    <div class="combo-hoy">
      <div class="combo-hoy-num">${actual}%</div>
      <div class="combo-hoy-txt">
        <b>${actual > 0 ? 'Es el descuento que se aplica hoy' : 'Hoy no hay descuento de combo'}</b>
        <span>${origen}</span>
      </div>
    </div>

    ${avisos.map((a) => `<div class="flash-banner warn"><span data-ic="info"></span><div>${a}</div></div>`).join('')}

    <div class="field">
      <label>Nuevo descuento ${tip(`Número entero entre 0 y ${max}. 0 = sin descuento: el modal deja de ofrecer el combo (salvo para avisar cuánto falta para el envío gratis).`)}</label>
      <div class="combo-atajos">
        ${CB_ATAJOS.map((n) => `<button type="button" class="combo-atajo${n === cbState.valor ? ' activo' : ''}" onclick="comboElegir(${n})">${n === 0 ? 'Sin descuento' : n + '%'}</button>`).join('')}
      </div>
      <div class="combo-fila">
        <div class="combo-input">
          <input class="input" id="combo-pct" type="number" min="0" max="${max}" step="1" inputmode="numeric"
                 value="${cbState.valor}" oninput="comboTipeo(this.value)" onkeydown="if(event.key==='Enter')comboGuardar()">
          <span>%</span>
        </div>
        <button class="btn-primary" id="combo-guardar" onclick="comboGuardar()"></button>
      </div>
      <p class="combo-estado" id="combo-estado"></p>
    </div>

    <h5 class="nav-grupo-tit">Así lo va a ver el cliente</h5>
    <div id="combo-previa"></div>

    ${comboLooksHtml()}
  </div>`;

  hydrateIcons(cont);
  comboActualizar();
}

// Lo que depende del número tipeado: botón, estado y vista previa. Separado de
// comboRender() para no redibujar el input mientras se escribe (perdería el foco).
function comboActualizar() {
  const cs = cbState.data.crosssell;
  const max = cbState.data.maxPercent || 40;
  const v = cbState.valor;
  const valido = Number.isInteger(v) && v >= 0 && v <= max;
  const igual = valido && v === cs.percent;

  const btn = document.getElementById('combo-guardar');
  if (btn) {
    btn.disabled = cbState.guardando || !valido || igual;
    btn.innerHTML = cbState.guardando
      ? 'Guardando…'
      : `${icon('check')} ${igual ? 'Ya está en ' + v + '%' : 'Guardar y aplicar'}`;
  }

  const est = document.getElementById('combo-estado');
  if (est) {
    if (!valido) {
      est.className = 'combo-estado error';
      est.textContent = `Tiene que ser un número entero entre 0 y ${max}.`;
    } else if (cbState.recienGuardado && igual) {
      est.className = 'combo-estado ok';
      est.textContent = 'Listo. El checkout ya lo aplica en el próximo cambio de carrito; el modal de la ficha lo muestra en 1 o 2 minutos.';
    } else if (!igual) {
      est.className = 'combo-estado';
      est.textContent = v === 0
        ? `Apaga el descuento del combo (hoy está en ${cs.percent}%). No hace falta publicar el tema.`
        : `Pasa de ${cs.percent}% a ${v}%. No hace falta publicar el tema.`;
    } else {
      est.className = 'combo-estado';
      est.textContent = '';
    }
  }

  document.querySelectorAll('.combo-atajo').forEach((b) => {
    const n = b.textContent === 'Sin descuento' ? 0 : parseInt(b.textContent, 10);
    b.classList.toggle('activo', n === v);
  });

  const previa = document.getElementById('combo-previa');
  if (previa) previa.innerHTML = valido ? comboPreviaHtml(v) : '';
}

/* Réplica chica del modal real (snipplets/product/cross-sell.tpl) con los
   mismos textos: si allá cambian, cambiarlos acá. */
function comboPreviaHtml(pct) {
  if (pct <= 0) {
    return `<div class="combo-previa combo-previa--off">
      Sin descuento: el modal no ofrece el combo y el carrito no descuenta nada.
    </div>`;
  }
  const base = CB_EJEMPLO.ficha + CB_EJEMPLO.complemento;
  const ahorro = Math.round(base * pct / 100);
  return `<div class="combo-previa">
    <div class="combo-previa-modal">
      <div class="cpm-titulo">¡Agregaste el producto al carrito!</div>
      <div class="cpm-sub">Sumá uno de estos y se te aplica <b>${pct}% OFF</b> automático en el carrito.</div>
      <div class="cpm-card">
        <div class="cpm-foto"><span class="cpm-badge">−${pct}%</span></div>
        <div class="cpm-info">
          <div class="cpm-nombre">Producto sugerido</div>
          <div class="cpm-precio">${cbPesos(CB_EJEMPLO.complemento)}</div>
          <div class="cpm-ahorro">Ahorrás ${cbPesos(ahorro)}</div>
        </div>
      </div>
    </div>
    <div class="combo-previa-carrito">
      <div class="cpc-fila"><span>Subtotal</span><span>${cbPesos(base)}</span></div>
      <div class="cpc-fila cpc-desc"><span>Combo frecuente</span><span>−${cbPesos(ahorro)}</span></div>
      <div class="cpc-fila cpc-total"><span>Total</span><span>${cbPesos(base - ahorro)}</span></div>
      <p class="hint" style="margin:8px 0 0">Ejemplo con un producto de ${cbPesos(CB_EJEMPLO.ficha)} + uno sugerido de ${cbPesos(CB_EJEMPLO.complemento)}.
        El % se aplica a los dos.</p>
    </div>
  </div>`;
}

// Los combos del lookbook son OTRO descuento (looks armados a mano, 10% hoy) y
// se cargan en el admin del tema. Se muestran para que no se confundan los dos.
function comboLooksHtml() {
  const looks = cbState.data.lookbook || [];
  if (!looks.length) return '';
  return `<div class="combo-looks">
    <h5 class="nav-grupo-tit">Los otros combos: looks del lookbook ${tip('Son un descuento aparte: los looks armados a mano (todos los productos del look juntos). No se tocan desde acá: se cargan en Editar diseño → Lookbook interactivo, en el admin del tema. Si un producto ya tiene el descuento de un look, el combo frecuente no se le suma encima.')}</h5>
    <div class="combo-looks-lista">
      ${looks.map((l) => `<span class="combo-look">Look ${esc(l.look)} · <b>${esc(l.percent)}%</b> · ${esc(l.products)} productos</span>`).join('')}
    </div>
  </div>`;
}

function comboElegir(n) {
  cbState.valor = n;
  cbState.recienGuardado = false;
  const input = document.getElementById('combo-pct');
  if (input) input.value = n;
  comboActualizar();
}

function comboTipeo(raw) {
  const s = String(raw).trim();
  cbState.valor = s === '' ? NaN : Number(s);
  cbState.recienGuardado = false;
  comboActualizar();
}

async function comboGuardar() {
  const v = cbState.valor;
  const btn = document.getElementById('combo-guardar');
  if (cbState.guardando || !btn || btn.disabled) return;
  cbState.guardando = true;
  comboActualizar();
  try {
    cbState.data = await api('/api/combo-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percent: v }),
    });
    cbState.valor = cbState.data.crosssell.percent;
    cbState.recienGuardado = true;
    toast(v > 0 ? `Combo frecuente en ${v}%.` : 'Descuento de combo apagado.', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    cbState.guardando = false;
    comboRender();
  }
}
