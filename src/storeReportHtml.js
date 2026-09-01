/* =========================================================================
 * INFORME DESCARGABLE DE LA TIENDA (HTML autocontenido, sin CSS ni JS externo).
 *
 * Es el archivo que se manda por mail o se imprime a PDF para que otro lo analice:
 * tiene que poder leerse sin entrar al panel y sin saber de Analytics. Por eso cada
 * bloque dice DE DÓNDE sale el número, y los gráficos son SVG dibujado a mano —
 * ninguna librería, ninguna imagen: un solo archivo que se abre en cualquier lado.
 * Mismo criterio (y misma estética) que src/sectionReportHtml.js.
 * ========================================================================= */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }));
const money = (v) => (v === null || v === undefined ? '—' : `$${Math.round(Number(v)).toLocaleString('es-AR')}`);
const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`);

/** Variación con color. `goodIsUp=false` para métricas donde subir es malo. */
function deltaHtml(delta, { goodIsUp = true } = {}) {
  if (delta === null || delta === undefined) return '<span class="d new">sin base</span>';
  if (delta === 0) return '<span class="d flat">igual</span>';
  const bien = goodIsUp ? delta > 0 : delta < 0;
  return `<span class="d ${bien ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}%</span>`;
}

function tabla(titulo, cols, filas, nota = '') {
  if (!filas || !filas.length) return '';
  return `<h3>${esc(titulo)}</h3>${nota ? `<p class="note">${esc(nota)}</p>` : ''}
  <table><thead><tr>${cols.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${filas.map((f) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.cell(f)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/**
 * Barras de visitas por día + línea de pedidos, en una sola escena. Van juntas a
 * propósito: la pregunta que se hace todo el mundo mirando este informe es si los
 * días de más visitas son los días de más pedidos.
 */
function graficoDiario(porDia) {
  if (!porDia || porDia.length < 2) return '';
  const w = 900; const h = 210; const padX = 34; const padY = 26;
  const maxS = Math.max(...porDia.map((d) => d.sesiones), 1);
  const maxP = Math.max(...porDia.map((d) => d.pedidos), 1);
  const bw = (w - padX * 2) / porDia.length;
  const barras = porDia.map((d, i) => {
    const x = padX + i * bw;
    const alto = ((h - padY * 2) * d.sesiones) / maxS;
    return `<rect x="${x.toFixed(1)}" y="${(h - padY - alto).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${alto.toFixed(1)}" fill="#c1440c" opacity=".5"><title>${esc(d.fecha)}: ${d.sesiones} visitas</title></rect>`;
  }).join('');
  const puntos = porDia.map((d, i) => {
    const x = padX + i * bw + bw / 2;
    const y = h - padY - ((h - padY * 2) * d.pedidos) / maxP;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const primera = porDia[0].fecha.slice(5);
  const ultima = porDia[porDia.length - 1].fecha.slice(5);
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Visitas y pedidos por día">
    ${barras}<polyline points="${puntos}" fill="none" stroke="#14141a" stroke-width="2"/>
    <text x="${padX}" y="14" class="cap">Visitas por día (barras, máximo ${maxS}) · pedidos (línea, máximo ${maxP})</text>
    <text x="${padX}" y="${h - 6}" class="cap">${esc(primera)}</text>
    <text x="${w - padX}" y="${h - 6}" class="cap" text-anchor="end">${esc(ultima)}</text>
  </svg>`;
}

/** Facturación por día: barras solas, que es lo que se mira para cerrar el mes. */
function graficoFacturacion(porDia) {
  const conPlata = (porDia || []).filter((d) => d.ingresos > 0);
  if (conPlata.length < 2) return '';
  const w = 900; const h = 160; const padX = 34; const padY = 26;
  const max = Math.max(...porDia.map((d) => d.ingresos), 1);
  const bw = (w - padX * 2) / porDia.length;
  const barras = porDia.map((d, i) => {
    const x = padX + i * bw;
    const alto = ((h - padY * 2) * d.ingresos) / max;
    return `<rect x="${x.toFixed(1)}" y="${(h - padY - alto).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${alto.toFixed(1)}" fill="#12805c" opacity=".65"><title>${esc(d.fecha)}: ${money(d.ingresos)}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Facturación por día">
    ${barras}<text x="${padX}" y="14" class="cap">Facturación por día (máximo ${money(max)})</text>
  </svg>`;
}

/** El embudo como escalones: cada paso con su barra y cuánto se cae del anterior. */
function embudoHtml(embudo) {
  if (!embudo || !embudo.length) return '';
  return `<div class="steps">${embudo.map((p, i) => `
    <div class="step">
      <div class="step-top"><b>${esc(p.label)}</b><span>${num(p.sesiones)} · ${pct(p.pctDelTotal)} de las visitas</span></div>
      <div class="step-bar"><i style="width:${Math.max(0.4, p.pctDelTotal)}%"></i></div>
      <div class="tag">${i === 0 ? 'punto de partida' : `siguieron ${pct(p.retencion)} de los del paso anterior · se cayó ${pct(p.retencion === null ? null : Math.round((100 - p.retencion) * 10) / 10)}`} — ${esc(p.fuente)}</div>
      ${p.nota ? `<div class="tag">${esc(p.nota)}</div>` : ''}
    </div>`).join('')}</div>`;
}

function buildStoreReportHtml(rep, { todos = false } = {}) {
  const kpis = rep.resumen.map((k) => {
    const fmt = k.moneda ? money : (k.pct ? pct : num);
    return `<div class="kpi">
      <span class="lbl">${esc(k.label)}</span>
      <b>${fmt(k.valor)}</b>
      <span class="prev">${k.previo === null ? 'sin comparación' : `antes ${fmt(k.previo)} ${deltaHtml(k.delta)}`}</span>
      <span class="help">${esc(k.ayuda)}</span>
      <span class="src">${esc(k.fuente)}</span>
    </div>`;
  }).join('');

  // En el informe no entran los 357 productos del catálogo: van los que tuvieron
  // movimiento (visitas o ventas), que es lo que alguien puede leer. El panel sí
  // muestra la lista completa, con buscador.
  const productos = (todos ? rep.productos : rep.productos.filter((p) => p.vistas > 0 || p.unidades > 0));
  const seg = rep.segmentos;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estadísticas de la tienda · ${esc(rep.rango.from)} a ${esc(rep.rango.to)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #14141a; background: #fff; margin: 0 auto; padding: 32px; max-width: 1000px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #14141a; }
  h3 { font-size: 15px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #55555f; }
  .sub { color: #6b6b76; margin: 0 0 6px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 14px; }
  .kpi { border: 1px solid #e3e3e9; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
  .kpi .lbl { font-size: 12px; color: #6b6b76; }
  .kpi b { font-size: 23px; letter-spacing: -.02em; }
  .kpi .prev { font-size: 12px; color: #6b6b76; }
  .kpi .help { font-size: 11px; color: #8a8a94; margin-top: 4px; }
  .kpi .src { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #a9a9b3; margin-top: 3px; }
  .d { font-weight: 700; }
  .d.up { color: #12805c; } .d.down { color: #c02626; } .d.flat, .d.new { color: #8a8a94; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 13.5px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #ececf1; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b6b76; background: #fafafc; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .note { font-size: 12.5px; color: #6b6b76; margin: 0 0 6px; }
  .chart { width: 100%; height: auto; margin: 8px 0 20px; }
  .cap { font-size: 11px; fill: #6b6b76; }
  .steps { display: flex; flex-direction: column; gap: 12px; margin: 10px 0 18px; }
  .step-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 14px; }
  .step-bar { height: 8px; background: #ececf1; border-radius: 100px; overflow: hidden; margin: 5px 0 3px; }
  .step-bar i { display: block; height: 100%; background: #c1440c; border-radius: 100px; }
  .tag { font-size: 11.5px; color: #6b6b76; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
  .warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 12px 16px 12px 30px; font-size: 13.5px; }
  .warn li { margin-bottom: 4px; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0 18px; }
  .seg > div { border: 1px solid #e3e3e9; border-radius: 10px; padding: 12px 14px; }
  .seg b { font-size: 20px; display: block; }
  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #ececf1; font-size: 12px; color: #8a8a94; }
  @media print { body { padding: 0; } table, .step, .kpi { break-inside: avoid; } h2 { break-after: avoid; } .cols { display: block; } }
  @media (max-width: 720px) { .cols, .seg { grid-template-columns: 1fr; } }
</style></head><body>

<h1>Estadísticas de la tienda</h1>
<p class="sub"><b>${esc(rep.rango.label)}</b> · del ${esc(rep.rango.from)} al ${esc(rep.rango.to)} (${rep.rango.dias} días)${rep.comparado ? ` — comparado contra el ${esc(rep.comparado.label)}: ${esc(rep.comparado.from)} a ${esc(rep.comparado.to)}` : ''}</p>
<p class="sub">Visitas y comportamiento: <b>Google Analytics</b>. Pedidos, facturación y clientes: <b>Tiendanube</b> (pedidos reales, sin los cancelados).</p>

<div class="kpis">${kpis}</div>

${rep.avisos && rep.avisos.length ? `<h2>Para leer bien estos números</h2>
<div class="warn"><ul>${rep.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}

<h2>Día por día</h2>
${graficoDiario(rep.porDia)}
${graficoFacturacion(rep.porDia)}

${rep.embudo && rep.embudo.length ? `<h2>El camino hasta la compra</h2>
<p class="note">Cada escalón son SESIONES: personas distintas que llegaron hasta ahí. Se lee de arriba hacia abajo — donde el porcentaje se desploma, ahí está el problema.</p>
${embudoHtml(rep.embudo)}` : ''}

<h2>De dónde viene la gente</h2>
<div class="cols">
<div>${tabla('Origen del tráfico', [
    { label: 'Fuente', cell: (f) => esc(f.nombre) },
    { label: 'Visitas', num: true, cell: (f) => num(f.sesiones) },
    { label: 'Var.', num: true, cell: (f) => deltaHtml(f.delta) },
  ], (rep.trafico && rep.trafico.fuentes) || [], 'Cómo llegó cada visita. "cpc" y "paid" son campañas pagas.')}</div>
<div>${tabla('Con qué entran', [
    { label: 'Dispositivo', cell: (d) => esc(d.nombre) },
    { label: 'Visitas', num: true, cell: (d) => num(d.sesiones) },
    { label: 'Var.', num: true, cell: (d) => deltaHtml(d.delta) },
  ], (rep.trafico && rep.trafico.dispositivos) || [])}</div>
</div>

${tabla('Por dónde entran al sitio', [
    { label: 'Página de entrada', cell: (l) => esc(l.pagina) },
    { label: 'Visitas', num: true, cell: (l) => num(l.sesiones) },
    { label: 'Interés', num: true, cell: (l) => pct(l.engagement) },
  ], ((rep.trafico && rep.trafico.landings) || []).slice(0, 15),
  'La primera página que vieron. "Interés" = qué porcentaje se quedó a mirar en vez de rebotar.')}

<h2>Minorista y mayorista</h2>
<div class="seg">
  <div><span class="tag">MINORISTA (con precio publicado)</span>
    <b>${num(seg.minorista.vistas)} visitas a productos</b>
    <span class="tag">${pct(seg.minorista.pctVistas)} de las vistas · ${num(seg.minorista.unidades)} prendas vendidas · ${money(seg.minorista.ingresos)}</span></div>
  <div><span class="tag">MAYORISTA (sin precio, "consultar")</span>
    <b>${num(seg.mayorista.vistas)} visitas a productos</b>
    <span class="tag">${pct(seg.mayorista.pctVistas)} de las vistas · no se compra online: termina en consulta</span></div>
</div>
<p class="note">Mayorista no tiene carrito: su resultado son las ${num(rep.consultas.total)} consultas de WhatsApp del período (${num(rep.consultas.mayorista)} mayoristas, ${num(rep.consultas.minorista)} minoristas).</p>

<h2>Productos</h2>
${tabla(`Todos los productos con movimiento (${productos.length})`, [
    { label: 'Producto', cell: (p) => `${esc(p.nombre)}${p.comparteNombre ? ' <span class="tag">(comparte nombre)</span>' : ''}` },
    { label: 'Segmento', cell: (p) => esc(p.segmento) },
    { label: 'Visitas', num: true, cell: (p) => num(p.vistas) },
    { label: 'Al carrito', num: true, cell: (p) => num(p.carritos) },
    { label: 'Vendidas', num: true, cell: (p) => num(p.unidades) },
    { label: 'Facturó', num: true, cell: (p) => money(p.ingresos) },
    { label: 'Conversión', num: true, cell: (p) => pct(p.conversion) },
    { label: 'Stock', num: true, cell: (p) => (p.stock === null ? '—' : num(p.stock)) },
  ], productos,
  'Visitas de Analytics; vendidas y facturado, de los pedidos reales. Conversión = de cada 100 que lo miraron, cuántos lo compraron.')}

<h2>Cómo compran</h2>
<div class="cols">
<div>${tabla('Medios de pago', [
    { label: 'Medio', cell: (m) => esc(m.nombre) },
    { label: 'Pedidos', num: true, cell: (m) => num(m.pedidos) },
    { label: 'Monto', num: true, cell: (m) => money(m.monto) },
  ], rep.ventas.medios)}</div>
<div>${tabla('Formas de envío', [
    { label: 'Envío', cell: (e) => esc(e.nombre) },
    { label: 'Pedidos', num: true, cell: (e) => num(e.pedidos) },
  ], rep.ventas.envios)}</div>
</div>
<div class="cols">
<div>${tabla('A qué provincias', [
    { label: 'Provincia', cell: (p) => esc(p.nombre) },
    { label: 'Pedidos', num: true, cell: (p) => num(p.pedidos) },
    { label: 'Monto', num: true, cell: (p) => money(p.monto) },
  ], rep.ventas.provincias)}</div>
<div>${tabla('Cupones usados', [
    { label: 'Cupón', cell: (c) => esc(c.nombre) },
    { label: 'Pedidos', num: true, cell: (c) => num(c.pedidos) },
    { label: 'Descuento', num: true, cell: (c) => money(c.descuento) },
  ], rep.ventas.cupones, 'Cuánto se resignó en descuentos y cuántos pedidos trajo cada cupón.')}</div>
</div>

<h2>Clientes</h2>
<p class="note">De los ${num(rep.ventas.compradores)} que compraron en el período,
  <b>${num(rep.ventas.clientes.nuevos)}</b> compraron por primera vez y
  <b>${num(rep.ventas.clientes.repiten)}</b> ya habían comprado antes.
  Promedio de ${num(rep.ventas.unidadesPorPedido)} prendas por pedido.</p>

<footer>
  Informe generado el ${new Date(rep.generado).toLocaleString('es-AR')} por el motor de contenido de BLACKS.<br>
  Pedidos guardados: ${num(rep.catalogo.pedidosGuardados)} desde el ${esc(rep.catalogo.desde || '—')}.
  Última sincronización con Tiendanube: ${rep.catalogo.sincronizado ? new Date(rep.catalogo.sincronizado).toLocaleString('es-AR') : '—'}.
</footer>
</body></html>`;
}

module.exports = { buildStoreReportHtml };
