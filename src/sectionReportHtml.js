/* =========================================================================
 * INFORME DESCARGABLE de una sección (HTML autocontenido, sin CSS ni JS externo).
 * Se manda por mail o se imprime a PDF: la idea es que el equipo comercial pueda
 * leerlo sin entrar al panel y sin saber de Analytics.
 * ========================================================================= */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v) => (typeof v === 'number' ? v.toLocaleString('es-AR') : esc(v));

/** Variación como texto con color: verde/rojo según convenga (más consultas = bueno). */
function deltaHtml(delta, { goodIsUp = true } = {}) {
  if (delta === null || delta === undefined) return '<span class="d new">nuevo</span>';
  if (delta === 0) return '<span class="d flat">=</span>';
  const good = goodIsUp ? delta > 0 : delta < 0;
  return `<span class="d ${good ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}%</span>`;
}

function table(title, cols, rows, note = '') {
  if (!rows || !rows.length) return '';
  return `<h3>${esc(title)}</h3>${note ? `<p class="note">${esc(note)}</p>` : ''}
  <table><thead><tr>${cols.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Gráfico de barras en SVG puro (dos series: sesiones y consultas por día). */
function sparkSvg(daily) {
  if (!daily || daily.length < 2) return '';
  const w = 860; const h = 170; const pad = 28;
  const maxS = Math.max(...daily.map((d) => d.sessions), 1);
  const maxC = Math.max(...daily.map((d) => d.contacts), 1);
  const bw = (w - pad * 2) / daily.length;
  const bars = daily.map((d, i) => {
    const x = pad + i * bw;
    const hs = ((h - pad * 2) * d.sessions) / maxS;
    return `<rect x="${x.toFixed(1)}" y="${(h - pad - hs).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hs.toFixed(1)}" fill="#c1440c" opacity=".55"/>`;
  }).join('');
  const pts = daily.map((d, i) => {
    const x = pad + i * bw + bw / 2;
    const y = h - pad - ((h - pad * 2) * d.contacts) / maxC;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Sesiones y consultas por día">
    ${bars}<polyline points="${pts}" fill="none" stroke="#111" stroke-width="2"/>
    <text x="${pad}" y="16" class="cap">Sesiones por día (barras, máx ${maxS}) · consultas (línea, máx ${maxC})</text>
  </svg>`;
}

function analysisHtml(a) {
  if (!a) return '';
  const list = (title, arr, fmt) => (arr && arr.length ? `<h3>${esc(title)}</h3><ul>${arr.map(fmt).join('')}</ul>` : '');
  return `<section class="ai">
    <h2>Diagnóstico</h2>
    <p class="titular">${esc(a.titular)}</p>
    <p>${esc(a.resumen)}</p>
    ${list('Qué muestran los datos', a.hallazgos, (h) => `<li class="f-${esc(h.tipo || 'neutro')}">${esc(h.texto)}</li>`)}
    ${a.hipotesis && a.hipotesis.length ? `<h3>Hipótesis, de más a menos probable</h3>${a.hipotesis.map((h) => `
      <div class="hyp"><b>${esc(h.titulo)}</b> <span class="prob ${esc(h.probabilidad)}">${esc(h.probabilidad)}</span>
        ${h.evidencia && h.evidencia.length ? `<ul class="pro">${h.evidencia.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${h.contra && h.contra.length ? `<ul class="con">${h.contra.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${h.verificar ? `<p class="check"><b>Cómo verificarlo:</b> ${esc(h.verificar)}</p>` : ''}
        ${h.implica ? `<p class="check"><b>Qué implica:</b> ${esc(h.implica)}</p>` : ''}
      </div>`).join('')}` : ''}
    ${list('Lo que hoy no se puede saber', a.sinMedir, (s) => `<li>${esc(s)}</li>`)}
    ${list('Qué hacer', a.acciones, (x) => `<li><b>${esc(x.titulo)}</b> <span class="tag">impacto ${esc(x.impacto || '-')} · esfuerzo ${esc(x.esfuerzo || '-')}</span><br>${esc(x.detalle || '')}</li>`)}
    ${list('Preguntas para responder internamente', a.preguntas, (p) => `<li>${esc(p)}</li>`)}
  </section>`;
}

/** Lo que cuesta cada consulta según Google Ads. Se omite si no está conectado. */
function adsSection(a) {
  if (!a || !a.enabled) return '';
  const cur = a.currency || 'ARS';
  const conDato = a.campaigns.filter((c) => c.costPerContact !== null);
  const mejor = conDato.length ? Math.min(...conDato.map((c) => c.costPerContact)) : null;
  const peor = conDato.length ? Math.max(...conDato.map((c) => c.costPerContact)) : null;
  return `<h2>Lo que cuesta cada consulta</h2>
    <p class="note">Gasto real de Google Ads cruzado con las sesiones y consultas que cada campaña trajo a la sección.</p>
    <div class="kpis">
      <div class="kpi"><span class="lbl">Gasto del período</span><b>${cur} ${n(a.totals.cost)}</b><span class="prev">antes ${cur} ${n(a.totals.costPrev)}</span></div>
      <div class="kpi"><span class="lbl">Costo por consulta</span><b>${a.costPerContactAvg === null ? '—' : `${cur} ${n(a.costPerContactAvg)}`}</b><span class="prev">${n(a.sectionContactsTotal)} consultas atribuidas</span></div>
      <div class="kpi"><span class="lbl">Clics pagos</span><b>${n(a.totals.clicks)}</b><span class="prev">antes ${n(a.totals.clicksPrev)}</span></div>
    </div>
    ${table('Cada campaña: lo que gasta y lo que trae', [
    { label: 'Campaña', cell: (c) => `${esc(c.name)}<br><span class="tag">${esc(c.channel || '')}</span>` },
    { label: 'Gasto', num: true, cell: (c) => `${cur} ${n(c.cost)}` },
    { label: 'Sesiones', num: true, cell: (c) => n(c.sectionSessions) },
    { label: 'Consultas', num: true, cell: (c) => n(c.sectionContacts) },
    {
      label: 'Costo x consulta',
      num: true,
      cell: (c) => (c.costPerContact === null ? '<span class="tag">sin consultas</span>'
        : `<b style="color:${c.costPerContact === mejor ? '#12805c' : c.costPerContact === peor ? '#c02626' : 'inherit'}">${cur} ${n(c.costPerContact)}</b>`),
    },
    {
      label: 'Subasta',
      num: true,
      cell: (c) => (c.impressionShare === null ? '<span class="tag">n/d</span>'
        : `${c.impressionShare}%<br><span class="tag">pierde ${c.lostToRank}% x ranking · ${c.lostToBudget}% x presupuesto</span>`),
    },
  ], a.campaigns)}
    ${table('Qué tipeó la gente que hizo clic en los avisos', [
    { label: 'Búsqueda real', cell: (t) => esc(t.term) },
    { label: 'Campaña', cell: (t) => `<span class="tag">${esc(t.campaign)}</span>` },
    { label: 'Clics', num: true, cell: (t) => n(t.clicks) },
    { label: 'Gasto', num: true, cell: (t) => `${cur} ${n(t.cost)}` },
  ], (a.searchTerms || []).slice(0, 25), 'Los que más gastan sin traer nada son candidatos a palabra clave negativa.')}`;
}

/** Embudo de contacto (eventos propios del tema). Se omite si todavía no hay datos. */
function leadFunnelSection(le) {
  if (!le || !le.ready || !le.funnel.length) return '';
  const max = Math.max(...le.funnel.map((s) => s.count), 1);
  const steps = le.funnel.map((s) => `<div class="step">
      <div class="step-top"><span>${esc(s.label)}</span><b>${n(s.count)} ${deltaHtml(deltaOf(s.count, s.countPrev))}</b></div>
      <div class="step-bar"><i style="width:${Math.round((s.count / max) * 100)}%"></i></div>
      <span class="note">antes ${n(s.countPrev)}</span>
    </div>`).join('');
  const mini = (title, arr) => (arr && arr.length
    ? `<h3>${esc(title)}</h3><ul>${arr.map((x) => `<li>${esc(x.key)}: <b>${n(x.count)}</b> (antes ${n(x.countPrev)})</li>`).join('')}</ul>` : '');
  return `<h2>Embudo de contacto</h2>
    <p class="note">Medido con los eventos propios de la tienda: muestra en qué paso se cae la gente.</p>
    <div class="steps">${steps}</div>
    ${mini('Consultas por tipo', le.byType)}
    ${mini('De qué botón salieron', le.byChannel)}
    ${mini('Desde qué tipo de página', le.byPage)}`;
}

function deltaOf(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Visibilidad en Google (Search Console). Se omite si no está conectado. */
function searchSection(s) {
  if (!s || !s.enabled) return '';
  const t = s.totals;
  const posCell = (x) => {
    const d = x.positionDelta;
    const tag = d === null ? '<span class="d new">nueva</span>'
      : d === 0 ? '<span class="d flat">=</span>'
        : `<span class="d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${Math.abs(d)}</span>`;
    return `${x.position} ${tag}`;
  };
  const cols = [
    { label: 'Búsqueda', cell: (x) => esc(x.key) },
    { label: 'Apariciones', num: true, cell: (x) => `${n(x.impressions)} ${deltaHtml(x.impressionsDelta)}` },
    { label: 'Clics', num: true, cell: (x) => `${n(x.clicks)} <span class="tag">(antes ${n(x.clicksPrev)})</span>` },
    { label: 'Posición', num: true, cell: posCell },
  ];
  return `<h2>Cómo nos encuentran en Google</h2>
    <p class="note">Sólo búsqueda orgánica, no la pauta. "Posición" es el puesto promedio: menos es mejor.</p>
    <div class="kpis">
      <div class="kpi"><span class="lbl">Clics desde Google</span><b>${n(t.current.clicks)}</b><span class="prev">antes ${n(t.previous.clicks)} ${deltaHtml(s.deltas.clicks)}</span></div>
      <div class="kpi"><span class="lbl">Veces que aparecimos</span><b>${n(t.current.impressions)}</b><span class="prev">antes ${n(t.previous.impressions)} ${deltaHtml(s.deltas.impressions)}</span></div>
      <div class="kpi"><span class="lbl">Nos eligen</span><b>${t.current.ctr}%</b><span class="prev">antes ${t.previous.ctr}% ${deltaHtml(s.deltas.ctr)}</span></div>
      <div class="kpi"><span class="lbl">Posición media</span><b>${t.current.position}</b><span class="prev">antes ${t.previous.position}</span></div>
    </div>
    ${table('Terreno perdido — nos siguen mostrando pero bajamos de puesto', cols, s.lostGround,
    'Lo más parecido a "quién nos está ganando": Google nos sigue mostrando por esa búsqueda, pero alguien nos pasó de lugar.')}
    ${table('Terreno ganado', cols, s.gainedGround)}
    ${table('Nos ven y no nos eligen', cols, s.lowCtr, 'Buena posición y casi sin clics: el problema es el título y la descripción que muestra Google.')}
    ${table('Búsquedas que más nos muestran', cols, s.topQueries)}`;
}

function buildSectionReportHtml(rep, analysis) {
  const kpiCards = rep.kpis.map((k) => {
    // En rebote y en "consultas fuera de la sección" subir no es necesariamente bueno,
    // pero para no mentir con colores sólo pintamos donde el sentido es inequívoco.
    const goodIsUp = !/rebote/i.test(k.label);
    return `<div class="kpi"><span class="lbl">${esc(k.label)}</span>
      <b>${n(k.cur)}${esc(k.unit)}</b>
      <span class="prev">antes ${n(k.prev)}${esc(k.unit)} ${deltaHtml(k.delta, { goodIsUp })}</span>
      ${k.help ? `<span class="help">${esc(k.help)}</span>` : ''}</div>`;
  }).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe ${esc(rep.prefix)} · ${esc(rep.current.label)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #14141a; background: #fff; margin: 0; padding: 32px; max-width: 980px; margin-inline: auto; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #14141a; }
  h3 { font-size: 15px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #55555f; }
  .sub { color: #6b6b76; margin: 0 0 24px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .kpi { border: 1px solid #e3e3e9; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
  .kpi .lbl { font-size: 12px; color: #6b6b76; }
  .kpi b { font-size: 24px; letter-spacing: -.02em; }
  .kpi .prev { font-size: 12px; color: #6b6b76; }
  .kpi .help { font-size: 11px; color: #8a8a94; margin-top: 4px; }
  .d { font-weight: 700; }
  .d.up { color: #12805c; } .d.down { color: #c02626; } .d.flat, .d.new { color: #8a8a94; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 13.5px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #ececf1; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b6b76; background: #fafafc; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; word-break: break-all; }
  .note { font-size: 12.5px; color: #6b6b76; margin: 0 0 6px; }
  .chart { width: 100%; height: auto; margin: 8px 0 20px; }
  .cap { font-size: 11px; fill: #6b6b76; }
  .ai { background: #fbfbfd; border: 1px solid #e3e3e9; border-radius: 12px; padding: 4px 22px 18px; margin-top: 30px; }
  .ai .titular { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
  .ai ul { margin: 6px 0 14px; padding-left: 20px; }
  .ai li { margin-bottom: 5px; }
  li.f-bueno::marker { content: "▲ "; color: #12805c; }
  li.f-malo::marker { content: "▼ "; color: #c02626; }
  .hyp { border-left: 3px solid #c1440c; padding: 2px 0 2px 14px; margin: 12px 0; }
  .prob { font-size: 11px; text-transform: uppercase; border: 1px solid #d5d5dd; border-radius: 20px; padding: 1px 8px; color: #55555f; }
  .prob.alta { border-color: #c02626; color: #c02626; }
  ul.pro li::marker { content: "+ "; color: #12805c; }
  ul.con li::marker { content: "− "; color: #c02626; }
  .check { font-size: 13px; color: #44444d; margin: 4px 0; }
  .tag { font-size: 11px; color: #6b6b76; }
  .warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; }
  .warn li { margin-bottom: 4px; }
  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #ececf1; font-size: 12px; color: #8a8a94; }
  .steps { display: flex; flex-direction: column; gap: 12px; margin: 10px 0 18px; }
  .step-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 14px; }
  .step-bar { height: 8px; background: #ececf1; border-radius: 100px; overflow: hidden; margin: 5px 0 3px; }
  .step-bar i { display: block; height: 100%; background: #c1440c; border-radius: 100px; }
  @media print { body { padding: 0; } .ai, .warn, .step { break-inside: avoid; } h2 { break-after: avoid; } }
</style></head><body>
<h1>Informe de la sección <span class="path">${esc(rep.prefix)}</span></h1>
<p class="sub">${esc(rep.current.label)} comparado con ${esc(rep.previous.label)} · datos de Google Analytics 4 · generado el ${new Date(rep.generatedAt).toLocaleString('es-AR')}</p>

<h2>Los números</h2>
<div class="kpis">${kpiCards}</div>
${sparkSvg(rep.daily)}

${analysisHtml(analysis)}

<h2>De dónde viene la gente</h2>
${table('Fuente, campaña y cuánto consulta cada una', [
    { label: 'Fuente / medio', cell: (r) => esc(r.sourceMedium) },
    { label: 'Campaña', cell: (r) => esc(r.campaign) },
    { label: 'Sesiones', num: true, cell: (r) => `${n(r.sessions)} ${deltaHtml(r.sessionsDelta)}` },
    { label: 'Antes', num: true, cell: (r) => n(r.sessionsPrev) },
    { label: 'Consultas', num: true, cell: (r) => `${n(r.contacts)} <span class="tag">(antes ${n(r.contactsPrev)})</span>` },
    { label: 'Tasa', num: true, cell: (r) => `${r.rate}% <span class="tag">(antes ${r.ratePrev}%)</span>` },
    { label: 'Rebote', num: true, cell: (r) => `${r.bounce}%` },
  ], rep.sources, 'La tasa es cuántas de cada 100 sesiones de esa fuente tocaron el WhatsApp mayorista estando en la sección.')}

<h2>Qué miran adentro</h2>
${table('Páginas de la sección', [
    { label: 'Página', cell: (r) => `<span class="path">${esc(r.key)}</span>` },
    { label: 'Vistas', num: true, cell: (r) => `${n(r.views)} ${deltaHtml(r.viewsDelta)}` },
    { label: 'Antes', num: true, cell: (r) => n(r.viewsPrev) },
    { label: 'Sesiones', num: true, cell: (r) => n(r.sessions) },
    { label: 'Interacción', num: true, cell: (r) => `${r.engagement}%` },
  ], rep.pages)}

${table('Por dónde entran (primera página de la visita)', [
    { label: 'Página de entrada', cell: (r) => `<span class="path">${esc(r.key)}</span>` },
    { label: 'Sesiones', num: true, cell: (r) => `${n(r.sessions)} ${deltaHtml(r.sessionsDelta)}` },
    { label: 'Rebote', num: true, cell: (r) => `${r.bounce}% <span class="tag">(antes ${r.bouncePrev}%)</span>` },
  ], rep.landings)}

${table('Desde qué sitio llegan', [
    { label: 'Origen', cell: (r) => `<span class="path">${esc(r.key)}</span>` },
    { label: 'Vistas', num: true, cell: (r) => `${n(r.views)} ${deltaHtml(r.viewsDelta)}` },
  ], rep.entries)}

${table('A dónde van después de la sección', [
    { label: 'Página destino', cell: (r) => `<span class="path">${esc(r.key)}</span>` },
    { label: 'Vistas', num: true, cell: (r) => `${n(r.views)} ${deltaHtml(r.viewsDelta)}` },
  ], rep.destinations, 'Páginas fuera de la sección a las que se llega desde una página de la sección.')}

<h2>Dónde se generan las consultas</h2>
${table('Páginas de la sección donde se toca el WhatsApp mayorista', [
    { label: 'Página', cell: (r) => `<span class="path">${esc(r.key)}</span>` },
    { label: 'Consultas', num: true, cell: (r) => `${n(r.contacts)} ${deltaHtml(r.contactsDelta)}` },
    { label: 'Antes', num: true, cell: (r) => n(r.contactsPrev) },
  ], rep.contactPages)}

${adsSection(rep.ads)}
${leadFunnelSection(rep.leadEvents)}
${searchSection(rep.search)}

<h2>Quién es esa gente</h2>
${table('Dispositivo', [
    { label: 'Dispositivo', cell: (r) => esc(r.key) },
    { label: 'Sesiones', num: true, cell: (r) => `${n(r.sessions)} ${deltaHtml(r.sessionsDelta)}` },
    { label: 'Interacción', num: true, cell: (r) => `${r.engagement}%` },
  ], rep.devices)}
${table('Provincia / región', [
    { label: 'Región', cell: (r) => esc(r.key) },
    { label: 'Sesiones', num: true, cell: (r) => `${n(r.sessions)} ${deltaHtml(r.sessionsDelta)}` },
  ], rep.regions)}

<h2>Cómo leer esto</h2>
<div class="warn"><b>Qué se está midiendo como "consulta":</b> ${esc(rep.tracking.contactMetric)}.
Mayorista = link al ${esc(rep.tracking.whatsappNumbers.mayorista)} · minorista = ${esc(rep.tracking.whatsappNumbers.minorista)}.
<ul>${rep.tracking.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>

<footer>BLACKS · informe generado automáticamente desde Google Analytics 4. Los porcentajes comparan contra ${esc(rep.previous.label)}.</footer>
</body></html>`;
}

module.exports = { buildSectionReportHtml };
