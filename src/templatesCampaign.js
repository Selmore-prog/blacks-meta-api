/** Avisos fotográficos: geometría explícita, fotos completas y texto fuera del producto.
 * Las coordenadas son fracciones de la zona segura, no de la pantalla de Instagram.
 * Una composición es distinta de su paleta: ambas quedan guardadas en la receta.
 */
const PALETTES = {
  cal: { paper: '#f6f5f1', ink: '#252825', accent: '#bd4b24', wash: '#e7e4dc' },
  arena: { paper: '#f2eade', ink: '#34302a', accent: '#a64626', wash: '#e5d5bd' },
  salvia: { paper: '#eef1e9', ink: '#29372f', accent: '#496851', wash: '#dce5d7' },
  cielo: { paper: '#edf2f5', ink: '#263743', accent: '#42677e', wash: '#d6e3eb' },
  arcilla: { paper: '#f6ece6', ink: '#402e28', accent: '#b04a30', wash: '#eed8cc' },
  perla: { paper: '#f0f0f3', ink: '#32313b', accent: '#635e7d', wash: '#e0dfea' },
};

// [x, y, ancho, alto]. Los bloques nunca se pisan ni recortan la fotografía.
const LAYOUTS = {
  aviso_portada: { label: 'Portada abierta: titular arriba y una foto grande debajo', text: [0,0,1,.21], photos: [[0,.23,1,.65]], align: 'left' },
  aviso_pie: { label: 'Afiche de producto: foto grande arriba, titular al pie', text: [0,.67,1,.21], photos: [[0,0,1,.65]] },
  aviso_derecha: { label: 'Producto a la derecha y mensaje lateral a la izquierda', text: [0,.12,.36,.60], photos: [[.39,0,.61,.88]] },
  aviso_izquierda: { label: 'Producto a la izquierda y mensaje lateral a la derecha', text: [.64,.12,.36,.60], photos: [[0,0,.61,.88]] },
  aviso_esquina: { label: 'Titular en esquina superior izquierda y foto amplia desplazada abajo', text: [0,0,.70,.22], photos: [[.14,.24,.86,.64]] },
  aviso_contrapunto: { label: 'Titular en esquina inferior derecha y foto desplazada arriba', text: [.26,.67,.74,.21], photos: [[0,0,.86,.65]] },
  aviso_columna: { label: 'Columna editorial estrecha derecha y foto de altura completa a la izquierda', text: [.71,.04,.29,.78], photos: [[0,0,.68,.88]] },
  aviso_cartel: { label: 'Titular central de gran ancho con foto centrada debajo', text: [.06,0,.88,.24], photos: [[.08,.26,.84,.62]], align: 'center' },
  aviso_duo: { label: 'Dos vistas grandes lado a lado, encabezado superior', text: [0,0,1,.21], photos: [[0,.23,.49,.65],[.51,.23,.49,.65]] },
  aviso_duo_pie: { label: 'Dos vistas lado a lado, titular horizontal abajo', text: [0,.67,1,.21], photos: [[0,0,.49,.65],[.51,0,.49,.65]] },
  aviso_diptico: { label: 'Vista principal a la derecha, segunda vista y titular apilados a la izquierda', text: [0,0,.40,.34], photos: [[.43,0,.57,.88],[0,.37,.40,.51]] },
  aviso_diptico_inverso: { label: 'Vista principal a la izquierda, segunda vista arriba y mensaje abajo a la derecha', text: [.60,.54,.40,.34], photos: [[0,0,.57,.88],[.60,0,.40,.51]] },
  aviso_secuencia: { label: 'Dos vistas en vertical a la derecha de una columna de texto', text: [0,.10,.35,.67], photos: [[.39,0,.61,.43],[.39,.45,.61,.43]] },
  aviso_trio: { label: 'Tres fotos en una misma fila bajo un titular abierto', text: [0,0,1,.21], photos: [[0,.23,.32,.65],[.34,.23,.32,.65],[.68,.23,.32,.65]] },
  aviso_galeria: { label: 'Foto protagonista a la izquierda y dos vistas menores a la derecha', text: [0,0,1,.21], photos: [[0,.23,.65,.65],[.68,.23,.32,.315],[.68,.565,.32,.315]] },
  aviso_galeria_inversa: { label: 'Foto protagonista a la derecha y dos vistas menores a la izquierda, título al pie', text: [0,.67,1,.21], photos: [[.35,0,.65,.65],[0,0,.32,.315],[0,.335,.32,.315]] },
  aviso_mosaico: { label: 'Cuatro fotos reales en mosaico de dos por dos, encabezado breve', text: [0,0,1,.21], photos: [[0,.23,.49,.315],[.51,.23,.49,.315],[0,.565,.49,.315],[.51,.565,.49,.315]] },
  aviso_riel: { label: 'Foto hero grande a la derecha, tres vistas pequeñas en un riel izquierdo', text: [0,0,1,.21], photos: [[.29,.23,.71,.65],[0,.23,.26,.20],[0,.455,.26,.20],[0,.68,.26,.20]] },
};
const NAMES = Object.keys(LAYOUTS);
const INFO = Object.fromEntries(NAMES.map(name => [name, `Aviso claro, moderno, sin marcos. ${LAYOUTS[name].label}. Requiere ${LAYOUTS[name].photos.length} foto(s) distintas; producto completo, poca información y copy complementario.`]));
const REQUIREMENTS = Object.fromEntries(NAMES.map(name => [name, { minImages: LAYOUTS[name].photos.length }]));
const isCampaign = template => Object.hasOwn(LAYOUTS, template);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = value => String(value || '').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();

function photoUrls(opts) {
  return [...new Set([opts.bgImageUrl || opts.productImageUrl, ...(opts.productImageUrls || [])].filter(u => typeof u === 'string' && /^(https?:|data:image\/)/i.test(u)))];
}

function resolveLayout(template, count) {
  const requested = LAYOUTS[template] || LAYOUTS.aviso_portada;
  if (count >= requested.photos.length) return requested;
  // Correcciones con menos fotos conservan una pieza completa; jamás duplican la foto.
  return count >= 3 ? LAYOUTS.aviso_galeria : count >= 2 ? LAYOUTS.aviso_duo : LAYOUTS.aviso_portada;
}

function commercialText(opts) {
  const regular = Number(opts.price);
  const promo = Number(opts.promoPrice);
  const valid = value => Number.isFinite(value) && value > 0;
  const discount = valid(regular) && valid(promo) && promo < regular;
  const final = discount ? promo : valid(regular) ? regular : valid(promo) ? promo : null;
  const money = value => '$' + Math.round(value).toLocaleString('es-AR');
  if (!final) return '';
  return `<div class="offer">${discount ? `<span class="discount">${Math.round((1-promo/regular)*100)}% OFF</span><s>${money(regular)}</s>` : ''}<strong>${money(final)}</strong><span class="price-label">Precio final</span></div>`;
}

function buildHtml(opts, g, head) {
  const urls = photoUrls(opts);
  const layout = resolveLayout(opts.template, urls.length);
  const colors = PALETTES[opts.variant] || PALETTES.cal;
  const top = g.safeTop;
  const height = g.h - g.safeTop - g.safeBottom;
  const width = g.w - g.padX * 2;
  const box = ([x,y,w,h]) => `left:${g.padX+x*width}px;top:${top+y*height}px;width:${w*width}px;height:${h*height}px;`;
  const title = clean(opts.overlayTitle || opts.displayTitle);
  // Las características vienen del brief validado, nunca se deducen de las fotos.
  const specs = [...new Set((opts.specs || []).map(clean).filter(Boolean))].slice(0,2);
  const detail = clean(opts.deck) || specs.join(' · ');
  const kicker = clean(opts.badgeText || opts.kicker);
  const titleSize = layout.text[2] < .45 ? 60 : 76;
  const footer = [.0,.905,1,.095];
  const photos = layout.photos.slice(0, urls.length).map((rect,i) => `<div class="photo" style="${box(rect)}"><img src="${esc(urls[i])}" alt="Vista ${i+1} del producto"/></div>`).join('');
  return `${head}<style>
    body {background:${colors.paper}; color:${colors.ink};}
    .canvas{width:${g.w}px;height:${g.h}px;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;}
    .wash{position:absolute;inset:0;pointer-events:none;background:linear-gradient(${layout.photos[0][0] > .2 ? 120 : 240}deg,transparent 58%,${colors.wash} 58%);opacity:.55;}
    .photo{position:absolute;}
    .photo img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;border:0;}
    .copy{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:16px;text-align:${layout.align || 'left'};overflow:hidden;}
    .kicker{font-size:22px;line-height:1.2;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${colors.accent};}
    h1{font-size:${titleSize}px;line-height:1.03;letter-spacing:-2.5px;font-weight:800;overflow-wrap:anywhere;text-wrap:balance;}
    .detail{font-size:26px;line-height:1.3;font-weight:500;text-wrap:balance;}
    .footer{position:absolute;display:flex;align-items:center;justify-content:space-between;gap:26px;border-top:2px solid ${colors.wash};padding-top:12px;}
    .offer{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;max-width:72%;line-height:1.05;}
    .offer strong{font-size:51px;letter-spacing:-1.5px;}.offer s{font-size:23px;opacity:.65;}
    .discount{font-size:23px;font-weight:800;color:${colors.accent};}.price-label{font-size:17px;}
    .endnote{font-size:22px;line-height:1.4;font-weight:600;max-width:100%;}.offer+.endnote{max-width:28%;text-align:right;}
    .site{font-size:17px;font-weight:400;letter-spacing:.2px;}
  </style></head><body><main class="canvas"><div class="wash"></div>${photos}
    <section class="copy" style="${box(layout.text)}">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<h1>${esc(title)}</h1>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}</section>
    <footer class="footer" style="${box(footer)}">${commercialText(opts)}<div class="endnote">${esc(clean(opts.ctaLabel || opts.cta))}<div class="site">blacksindumentaria.com.ar</div></div></footer>
  </main></body></html>`;
}

/** Ajusta textos con las métricas de la fuente cargada. No corta palabras ni datos. */
async function fitText(page) {
  return page.evaluate(() => {
    const copy = document.querySelector('.canvas .copy');
    if (!copy) return;
    const children = [...copy.children];
    for (let n=0;n<42 && (copy.scrollHeight>copy.clientHeight+1 || copy.scrollWidth>copy.clientWidth+1);n++) {
      for (const el of children) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        const min = el.tagName === 'H1' ? 34 : 20;
        if (size>min) el.style.fontSize = Math.max(min,size-1)+'px';
      }
    }
    const foot = document.querySelector('.canvas .footer');
    if (foot) for (let n=0;n<18 && (foot.scrollHeight>foot.clientHeight+1 || foot.scrollWidth>foot.clientWidth+1);n++) {
      for (const el of foot.querySelectorAll('strong,s,span,.endnote,.site')) {
        const size=parseFloat(getComputedStyle(el).fontSize);
        if(size>16) el.style.fontSize=Math.max(16,size-1)+'px';
      }
    }
  });
}

const LIGHT_DIRECTION = 'CAMPAÑA CLARA: luz diurna difusa y exposición luminosa; fondo de estudio marfil, arena, gris perla o taller claro, sin viñetas negras ni contraste dramático. Mostrar el producto completo y grande, con sus extremos dentro de cuadro. Respetar el ángulo de la foto real, sin espejar logos ni inventar colores. No imprimir textos: el aviso se compone después con tipografía real fuera de la fotografía.';

module.exports = { LAYOUTS, PALETTES, NAMES, INFO, REQUIREMENTS, isCampaign, photoUrls, resolveLayout, commercialText, buildHtml, fitText, LIGHT_DIRECTION };
