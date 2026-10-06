/* =========================================================================
 * CARRITOS ABANDONADOS (pestaña "Carritos")
 *
 * Los avisos los manda el Worker de Cloudflare (repo del theme,
 * backend/lookbook-discounts/worker.js) cada hora, desde el número de WhatsApp
 * de la empresa, y crea el lead en Kommo. Esta pantalla muestra lo mismo que
 * mostraba Nuby y dos cosas que Nuby no tenía: quién respondió (eventos de
 * Kommo) y si la compra fue de ESE carrito o de otra cosa.
 *
 * De dónde sale cada número (lo calcula el Worker, acá sólo se dibuja):
 * - Enviados / fallidos: registro de envíos del Worker.
 * - Entregados / leídos / clics: estadísticas de la plantilla en Meta. Son
 *   totales por día con unas horas de demora y no se pueden ver por mensaje.
 * - Compras: pedidos de Tiendanube hasta 7 días después del aviso, del mismo
 *   carrito o de la misma persona (email o celular).
 *
 * Depende de los helpers de dashboard.js (api, esc, toast, tip, icon, skeleton).
 * Backend: src/cartRecovery.js → /api/carritos/stats y /api/carritos/modo.
 * ========================================================================= */

const crState = { data: null, filtro: 'todos', cambiandoModo: false };
window.crCargado = false;

const crMoney = (n) => (n === null || n === undefined ? '—' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`);
const crNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR'));
const crPct = (a, b) => (a === null || a === undefined || !b ? null : Math.round((a / b) * 100));

function crDos(n) { return String(n).padStart(2, '0'); }

// "06/10 15:42". A mano: toLocaleString('es-AR') agrega "a. m." según el navegador.
function crFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${crDos(d.getDate())}/${crDos(d.getMonth() + 1)} ${crDos(d.getHours())}:${crDos(d.getMinutes())}`;
}

function crHace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return `el ${crFechaHora(ms)}`;
}

function crDemora(horas) {
  if (horas < 1) return 'menos de 1 h';
  if (horas < 24) return `${horas} h`;
  const d = Math.floor(horas / 24);
  const h = horas % 24;
  return `${d} día${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`;
}

function crRango() {
  const v = document.getElementById('cr-periodo').value;
  const hoy = new Date();
  const ymd = (d) => d.toLocaleDateString('sv-SE');
  if (v === 'mes_actual') return { desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: ymd(hoy) };
  if (v === 'mes_pasado') {
    return { desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  }
  const dias = Number(v) || 30;
  return { desde: ymd(new Date(hoy.getTime() - (dias - 1) * 864e5)), hasta: ymd(hoy) };
}

async function carritosCargar() {
  const body = document.getElementById('carritos-body');
  if (!body) return;
  window.crCargado = true;
  body.innerHTML = skeleton('stats') + skeleton('rows', 4);
  const { desde, hasta } = crRango();
  try {
    crState.data = await api(`/api/carritos/stats?desde=${desde}&hasta=${hasta}`);
    crRender();
  } catch (err) {
    window.crCargado = false;
    body.innerHTML = `<div class="panel"><p class="error" style="margin:0">${esc(err.message)}</p>
      <div style="margin-top:12px"><button class="btn-ghost btn-sm" onclick="carritosCargar()">Reintentar</button></div></div>`;
  }
}

async function carritosModo(modo) {
  if (crState.cambiandoModo) return;
  const pregunta = modo === 'activo'
    ? '¿Activar el envío automático?\n\nDesde ahora, cada hora le llega un WhatsApp a quien abandone un carrito. '
      + 'Apagá el aviso de carrito abandonado de Nuby para que no reciban dos mensajes.'
    : '¿Pausar los avisos?\n\nNo sale ningún WhatsApp hasta que lo vuelvas a activar.';
  if (!window.confirm(pregunta)) return;
  crState.cambiandoModo = true;
  try {
    await api('/api/carritos/modo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo }),
    });
    toast(modo === 'activo' ? 'Avisos activados: el próximo sale en la revisión de la hora en punto.' : 'Avisos pausados.', 'ok');
    await carritosCargar();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    crState.cambiandoModo = false;
  }
}

function carritosFiltrar(valor) {
  crState.filtro = valor;
  crPintarMensajes();
}

/* ---------------- piezas ---------------- */

function crKpi(label, valor, sub, ayuda) {
  return `<div class="st-kpi">
    <span class="st-kpi-lbl">${esc(label)} ${tip(ayuda)}</span>
    <b>${valor}</b>
    <span class="st-kpi-prev">${sub || '&nbsp;'}</span>
  </div>`;
}

function crBadgePago(estado) {
  return estado === 'pagado'
    ? '<span class="badge status-approved">Pagado</span>'
    : '<span class="badge cr-pend">Pendiente</span>';
}

function crEstadoPanel(e) {
  const activo = e.modo === 'activo';
  const uc = e.ultima_corrida;
  let detalle = activo ? `Activo desde el ${esc(crFechaHora(e.activo_desde))}.` : 'No sale ningún aviso hasta que lo actives.';
  if (activo && uc) {
    detalle += ` Última revisión ${esc(crHace(uc.ts * 1000))}: ${uc.creados} aviso${uc.creados === 1 ? '' : 's'}`
      + `${uc.errores ? `, ${uc.errores} con error` : ''}.`;
  } else if (activo) {
    detalle += ' Todavía no revisó: lo hace a cada hora en punto.';
  }
  const error = uc && uc.error ? `<p class="error" style="margin:8px 0 0;">La última revisión falló: ${esc(uc.error)}</p>` : '';
  return `<div class="panel cr-estado">
    <div class="cr-estado-txt">
      <span class="cr-dot ${activo ? 'on' : ''}"></span>
      <div>
        <b>${activo ? 'Envío automático activo' : 'Envío automático pausado'}
          ${tip(`Cada hora se toman los carritos abandonados hace entre 1 y 24 horas, con productos, de gente que aceptó recibir novedades y no compró después. A cada uno le llega la plantilla "${e.plantilla}" desde el número de la empresa, con un botón que abre SU carrito, y se crea el lead en Kommo (etapa CARRITO ABANDONADO TN). A un mismo celular, un aviso cada 7 días.`)}</b>
        <span class="hint">${detalle}</span>
        ${error}
      </div>
    </div>
    <button class="${activo ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="carritosModo('${activo ? 'apagado' : 'activo'}')">
      ${activo ? 'Pausar envíos' : 'Activar envíos'}</button>
  </div>`;
}

/* Barras = avisos enviados por día; línea = compras recuperadas por día. */
function crChart(porDia) {
  if (!porDia || !porDia.some((d) => d.enviados || d.compras)) {
    return '<p class="hint" style="margin:6px 0 0;">Sin avisos en este período.</p>';
  }
  const w = 1000; const h = 180; const padX = 8; const padY = 20;
  const maxE = Math.max(...porDia.map((d) => d.enviados), 1);
  const maxC = Math.max(...porDia.map((d) => d.compras), 1);
  const tope = Math.max(maxE, maxC); // misma escala: son cantidades de la misma gente
  const bw = (w - padX * 2) / porDia.length;
  const alto = (v) => ((h - padY * 2) * v) / tope;
  const barras = porDia.map((d, i) => `<rect x="${(padX + i * bw).toFixed(1)}" y="${(h - padY - alto(d.enviados)).toFixed(1)}"
      width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, alto(d.enviados)).toFixed(1)}" rx="1.5" fill="var(--orange)" opacity=".45">
      <title>${esc(d.fecha)}
${d.enviados} aviso(s) · ${d.compras} compra(s) · ${crMoney(d.ingresos)} cobrado</title></rect>`).join('');
  const pts = porDia.map((d, i) => `${(padX + i * bw + bw / 2).toFixed(1)},${(h - padY - alto(d.compras)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="st-chart" preserveAspectRatio="none" role="img" aria-label="Avisos y compras por día">
      ${barras}<polyline points="${pts}" fill="none" stroke="var(--green)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="st-chart-legend">
      <span><i class="sw-bar"></i> Avisos enviados (máx ${crNum(maxE)} por día)</span>
      <span><i class="sw-line"></i> Compras recuperadas (máx ${crNum(maxC)} por día)</span>
      <span class="st-chart-dates">${esc(porDia[0].fecha)} → ${esc(porDia[porDia.length - 1].fecha)}</span>
    </div>`;
}

function crTablaVentas(ventas) {
  if (!ventas.length) return '';
  const filas = ventas.map((v) => `<tr>
    <td><b>${esc(v.comprador || '—')}</b></td>
    <td><a href="${esc(v.admin_url)}" target="_blank" rel="noopener">#${esc(v.numero)} ↗</a></td>
    <td class="num">${crMoney(v.total)}</td>
    <td>${crBadgePago(v.estado)}</td>
    <td class="cr-nowrap">${esc(crFechaHora(v.fecha))}<span class="st-prod-sub cr-sub">${esc(crDemora(v.horas_despues))} después del aviso</span></td>
    <td>${v.mismo_carrito ? 'Ese mismo carrito' : 'Otra compra'}</td>
    <td>${v.lead_url ? `<a href="${esc(v.lead_url)}" target="_blank" rel="noopener">Kommo ↗</a>` : ''}</td>
  </tr>`).join('');
  return `<div class="panel" style="margin-bottom:18px;">
    ${panelHead('Ventas recuperadas', 'Pedidos que llegaron hasta 7 días después del aviso, del mismo carrito o de la misma persona (mismo email o celular). Si una persona recibió dos avisos, la compra se le cuenta al más reciente. Los pedidos anulados no cuentan.')}
    <div class="st-block"><table class="st-table cr-table">
      <thead><tr><th>Comprador</th><th>Pedido</th><th class="num">Total</th><th>Pago</th><th>Cuándo</th><th>Qué compró</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
  </div>`;
}

const CR_FILTROS = {
  todos: { label: 'Todos', ok: () => true },
  compraron: { label: 'Compraron', ok: (m) => !!m.compra },
  respondieron: { label: 'Respondieron', ok: (m) => !!m.respondio },
  nada: { label: 'Sin respuesta ni compra', ok: (m) => m.wa === 'enviado' && !m.prueba && !m.respondio && !m.compra },
  fallidos: { label: 'Fallaron', ok: (m) => m.wa === 'error' },
  pruebas: { label: 'Pruebas', ok: (m) => m.prueba },
};

function crPintarMensajes() {
  const cont = document.getElementById('cr-mensajes');
  if (!cont || !crState.data) return;
  const filtro = CR_FILTROS[crState.filtro] || CR_FILTROS.todos;
  const lista = crState.data.mensajes.filter(filtro.ok);
  if (!lista.length) {
    cont.innerHTML = `<p class="hint" style="margin:8px 0 0;">${crState.data.mensajes.length ? 'Ningún aviso con ese filtro.' : 'Todavía no hay avisos en este período.'}</p>`;
    return;
  }
  const wa = (m) => {
    if (m.prueba) return '<span class="badge type">Prueba</span>';
    if (m.wa === 'enviado') return '<span class="badge status-approved">Enviado</span>';
    if (m.wa === 'error') return `<span class="badge cr-err" title="${esc(m.error || '')}">Falló</span>`;
    return '<span class="badge type">Sin enviar</span>';
  };
  const filas = lista.map((m) => `<tr>
    <td><b>${esc(m.nombre || '—')}</b><span class="st-prod-sub cr-sub">${esc(m.tel || '')}</span></td>
    <td class="num" title="${esc(m.productos || '')}">${crMoney(m.total)}<span class="st-prod-sub cr-sub">${crNum(m.items)} producto${m.items === 1 ? '' : 's'}</span></td>
    <td class="cr-nowrap">${esc(crFechaHora(m.ts))}</td>
    <td>${wa(m)}${m.wa === 'error' && m.error ? `<span class="st-prod-sub cr-sub cr-err-txt">${esc(m.error)}</span>` : ''}</td>
    <td>${m.respondio ? `Sí · ${esc(crFechaHora(m.respondio))}` : '<span class="cr-muted">—</span>'}</td>
    <td>${m.compra
      ? `<a href="${esc(m.compra.admin_url)}" target="_blank" rel="noopener">#${esc(m.compra.numero)}</a> ${crMoney(m.compra.total)} ${crBadgePago(m.compra.estado)}`
      : '<span class="cr-muted">—</span>'}</td>
    <td>${m.lead_url ? `<a href="${esc(m.lead_url)}" target="_blank" rel="noopener">Kommo ↗</a>` : ''}</td>
  </tr>`).join('');
  cont.innerHTML = `<div class="st-block"><table class="st-table cr-table">
    <thead><tr><th>Cliente</th><th class="num">Carrito</th><th>Aviso</th><th>WhatsApp</th><th>Respondió</th><th>Compró</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
  ${crState.data.mensajes.length >= 300 ? '<p class="hint" style="margin:8px 0 0;">Se muestran los 300 avisos más nuevos del período.</p>' : ''}`;
}

/* --------------------------------- pintar todo --------------------------------- */
function crRender() {
  const d = crState.data;
  const body = document.getElementById('carritos-body');
  if (!body || !d) return;
  const k = d.kpis;
  const meta = d.meta || {};
  const srcMeta = '<span class="src-tag">Meta</span>';

  const avisos = [];
  if (meta.error) avisos.push(`No pude leer las estadísticas de la plantilla en Meta (entregados, leídos, clics): ${meta.error}`);
  if (d.error_ordenes) avisos.push(`No pude leer los pedidos de Tiendanube, así que las compras pueden faltar: ${d.error_ordenes}`);

  const pctEntregados = crPct(k.entregados, meta.sent);
  const pctLeidos = crPct(k.leidos, k.entregados);
  const pctResp = crPct(k.respondieron, k.enviados);

  const mensajes = [
    crKpi('Enviados', crNum(k.enviados), 'avisos de carrito abandonado',
      'WhatsApps que salieron sin error en el período. No cuenta los envíos de prueba.'),
    crKpi('Entregados', crNum(k.entregados), pctEntregados === null ? srcMeta : `${pctEntregados}% de los enviados ${srcMeta}`,
      'Según Meta: llegaron al celular. Meta los informa por día, con algunas horas de demora, y suma también los envíos de prueba.'),
    crKpi('Leídos', crNum(k.leidos), pctLeidos === null ? srcMeta : `${pctLeidos}% de los entregados ${srcMeta}`,
      'Según Meta. Quien tiene apagada la confirmación de lectura (los tildes azules) no aparece acá aunque lo haya leído: este número siempre se queda corto.'),
    crKpi('Abrieron su carrito', crNum(k.clics),
      `${k.toques && k.toques > k.clics ? `${crNum(k.toques)} toques en total` : 'tocaron "Ver carrito"'} ${srcMeta}`,
      'Según Meta: personas distintas que tocaron el botón "Ver carrito" del mensaje. Si alguien lo toca varias veces, cuenta una; el total de toques va abajo.'),
    crKpi('Fallidos', crNum(k.fallidos), k.fallidos ? 'ver el motivo en la tabla' : 'ninguno',
      'Avisos que WhatsApp rechazó al enviarlos (número inválido, plantilla pausada, etc.). El lead en Kommo se crea igual.'),
  ].join('');

  const resultados = [
    crKpi('Respondieron', crNum(k.respondieron), pctResp === null ? 'en Kommo' : `${pctResp}% de los avisos · en Kommo`,
      'Clientes que escribieron después del aviso, según Kommo. Cuenta los mensajes que Kommo engancha al lead o al contacto del aviso, hasta 7 días después.'),
    crKpi('Compraron', crNum(k.compras), k.compras ? `${k.mismo_carrito} ${k.mismo_carrito === 1 ? 'terminó' : 'terminaron'} ese mismo carrito` : '&nbsp;',
      'Pedidos hasta 7 días después del aviso, de la misma persona (email o celular). "Ese mismo carrito" = el pedido es el carrito que se avisó.'),
    crKpi('Recuperado', crMoney(k.ingresos), k.ingresos_pendientes ? `+ ${crMoney(k.ingresos_pendientes)} pendiente de pago` : 'pedidos pagados',
      'Plata cobrada de esas compras. Lo que está pendiente (transferencia sin acreditar, por ejemplo) va aparte hasta que se pague.'),
    crKpi('Conversión', k.tasa === null ? '—' : `${Number(k.tasa).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
      'de los avisos terminó en compra', 'Personas que compraron dividido avisos enviados.'),
  ].join('');

  body.innerHTML = `
    ${crEstadoPanel(d.estado)}

    <div class="st-range"><b>${esc(d.rango.desde)} → ${esc(d.rango.hasta)}</b><span>${d.rango.dias} días</span></div>

    ${avisos.length ? `<div class="st-avisos"><b>${icon('info')} Ojo con estos números</b>
      <ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}

    <h4 class="cr-h">Mensajes</h4>
    <div class="st-kpis">${mensajes}</div>
    <h4 class="cr-h">Resultados</h4>
    <div class="st-kpis">${resultados}</div>

    <div class="panel" style="margin-bottom:18px;">
      ${panelHead('Día por día', 'Las barras son los avisos que salieron cada día; la línea, las compras recuperadas de esos avisos, en el día en que se hizo el pedido.')}
      ${crChart(d.por_dia)}
    </div>

    ${crTablaVentas(d.ventas)}

    <div class="panel">
      ${panelHead('Avisos enviados', 'Uno por carrito abandonado. "Kommo" abre el lead, donde está la conversación si la persona respondió.',
        `<select class="input cr-filtro" onchange="carritosFiltrar(this.value)">
          ${Object.entries(CR_FILTROS).map(([id, f]) => `<option value="${id}"${crState.filtro === id ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
        </select>`)}
      <div id="cr-mensajes"></div>
    </div>`;
  crPintarMensajes();
}

window.carritosCargar = carritosCargar;
