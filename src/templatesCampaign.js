/** Avisos fotográficos: geometría explícita, fotos completas y texto fuera del producto.
 * Las coordenadas son fracciones de la zona segura, no de la pantalla de Instagram.
 * Una composición es distinta de su paleta: ambas quedan guardadas en la receta.
 */
const BRAND = require('./config').brand.colors;
const PALETTES = {
  blanco: { paper: '#ffffff', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#eeeeee' },
  tiza: { paper: '#fafafa', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#e8e8e8' },
  cemento: { paper: '#eeeeee', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#dddddd' },
  gris: { paper: '#f3f3f3', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#e2e2e2' },
  papel: { paper: '#f7f7f7', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#e9e9e9' },
  contraste: { paper: '#ffffff', ink: BRAND.black, accent: BRAND.darkOrange, wash: '#dedede' },
};
// Las recetas viejas mantienen su variante guardada, pero usan la identidad vigente.
const OLD_PALETTES = {cal:'blanco',arena:'tiza',salvia:'cemento',cielo:'gris',arcilla:'papel',perla:'contraste'};
function paletteFor(variant) { return PALETTES[variant] || PALETTES[OLD_PALETTES[variant]] || PALETTES.blanco; }

/** Contrato compartido entre fotografía y tipografía: el modelo conoce las zonas
 * ANTES de generar. La escena ocupa todo el lienzo; el sujeto no invade estas zonas.
 */
function scenePlan(template) {
  const count = (LAYOUTS[template] || LAYOUTS.aviso_portada).photos.length;
  if (count > 1) return { side:'left', copy:[0,.02,.40,.42], subject:[.43,.03,.57,.83], extras: count === 2
    ? [[0,.48,.38,.39]] : count === 3 ? [[0,.48,.38,.185],[0,.69,.38,.185]]
    : [[0,.48,.18,.185],[.20,.48,.18,.185],[.10,.69,.18,.185]] };
  if (['aviso_derecha'].includes(template)) return {side:'left',copy:[0,.08,.40,.71],subject:[.43,.03,.57,.85],extras:[]};
  if (['aviso_izquierda','aviso_columna'].includes(template)) return {side:'right',copy:[.60,.08,.40,.71],subject:[0,.03,.57,.85],extras:[]};
  if (['aviso_pie','aviso_contrapunto'].includes(template)) return {side:'bottom',copy:[0,.65,1,.23],subject:[.06,0,.88,.63],extras:[]};
  return {side:'top',copy:[0,0,1,.22],subject:[.05,.24,.90,.64],extras:[]};
}

function sceneDirection(opts = {}) {
  const plan = scenePlan(opts.template);
  const side = {top:'arriba',bottom:'abajo',left:'a la izquierda',right:'a la derecha'}[plan.side];
  const story = opts.format === 'story';
  const W=1080,H=story?1920:1350,X=story?84:60,Y=story?196:54,SW=W-X*2,SH=H-Y-(story?236:54);
  const bounds = r => `x=${Math.round((X+r[0]*SW)/W*100)}–${Math.round((X+(r[0]+r[2])*SW)/W*100)}%, y=${Math.round((Y+r[1]*SH)/H*100)}–${Math.round((Y+(r[1]+r[3])*SH)/H*100)}%`;
  return `${LIGHT_DIRECTION}\nCOMPOSICIÓN INTEGRADA OBLIGATORIA: la fotografía será el fondo de TODO el aviso, sin tarjeta ni márgenes exteriores. Ubicá el producto completo dentro de ${bounds(plan.subject)}, lo más grande posible. Reservá una zona de pared/fondo claro uniforme ${side} (${bounds(plan.copy)}) para el titular negro que se superpone después. La base inferior lleva una línea de compra. El entorno sigue por detrás del texto: no dibujes paneles, recuadros, franjas, marcos ni tipografía.${plan.extras.length ? ' El lateral izquierdo inferior lleva otras vistas reales agregadas después: dejá ese lateral libre de personas y objetos.' : ''}`;
}

// [x, y, ancho, alto]. Los bloques nunca se pisan ni recortan la fotografía.
const LAYOUTS = {
  aviso_portada: { label: 'Portada abierta: titular compacto arriba y foto protagonista', text: [0,0,1,.18], photos: [[0,.20,1,.69]], align: 'left' },
  aviso_pie: { label: 'Afiche de producto: foto grande arriba, titular al pie', text: [0,.67,1,.21], photos: [[0,0,1,.65]] },
  aviso_derecha: { label: 'Producto a la derecha y mensaje lateral a la izquierda', text: [0,.12,.31,.60], photos: [[.34,0,.66,.88]] },
  aviso_izquierda: { label: 'Producto a la izquierda y mensaje lateral a la derecha', text: [.69,.12,.31,.60], photos: [[0,0,.66,.88]] },
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
  const colors = paletteFor(opts.variant);
  const integrated = Boolean(opts.bgImageUrl) && Number(opts.campaignSceneVersion) >= 2;
  const plan = integrated ? scenePlan(opts.template) : null;
  const top = g.safeTop;
  const height = g.h - g.safeTop - g.safeBottom;
  const width = g.w - g.padX * 2;
  const box = ([x,y,w,h]) => `left:${g.padX+x*width}px;top:${top+y*height}px;width:${w*width}px;height:${h*height}px;`;
  const title = clean(opts.overlayTitle || opts.displayTitle);
  // Las características vienen del brief validado, nunca se deducen de las fotos.
  const facts = Array.isArray(opts.specs) && opts.specs.length ? opts.specs : opts.storyPoints;
  const specs = [...new Set((Array.isArray(facts) ? facts : []).map(clean).filter(Boolean))].slice(0,2);
  const detail = clean(opts.deck) || specs.join((integrated ? plan.copy : layout.text)[2] < .45 ? '\n' : ' · ');
  const kicker = clean(opts.badgeText || opts.kicker);
  const textBox = integrated ? plan.copy : layout.text;
  const titleSize = textBox[2] < .45 ? 64 : 80;
  const footer = [.0,.905,1,.095];
  const photoRects = integrated ? [[0,0,1,1], ...plan.extras] : layout.photos;
  const photos = photoRects.slice(0, urls.length).map((rect,i) => `<div class="photo${integrated && i===0 ? ' scene-photo' : ''}" style="${integrated && i===0 ? `left:0;top:0;width:${g.w}px;height:${g.h}px;` : box(rect)}"><img src="${esc(urls[i])}" alt="Vista ${i+1} del producto"/></div>`);
  const safe = { x:g.padX, y:top, w:width, h:height };
  return `${head}<style>
    body {background:${colors.paper}; color:${colors.ink};}
    .canvas{width:${g.w}px;height:${g.h}px;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;}
    .wash{display:none;}
    .edge-extension{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
    .scene-shade{display:none;}
    .copy::before{content:'';width:64px;height:6px;flex-shrink:0;background:${colors.accent};}
    .photo{position:absolute;}
    .photo img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;border:0;}
    .copy>*{flex-shrink:0;}
    .copy{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:16px;text-align:${layout.align || 'left'};overflow:hidden;}
    .kicker{font-size:22px;line-height:1.2;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${colors.accent};}
    h1{font-size:${titleSize}px;line-height:1.03;letter-spacing:-2.5px;font-weight:800;overflow-wrap:normal;text-wrap:balance;}
    .detail{white-space:pre-line;font-size:26px;line-height:1.3;font-weight:500;text-wrap:balance;}
    .footer{position:absolute;display:flex;align-items:center;justify-content:space-between;gap:26px;padding-top:8px;}
    .offer{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;max-width:72%;line-height:1.05;}
    .offer strong{font-size:51px;letter-spacing:-1.5px;}.offer s{font-size:23px;opacity:.65;}
    .discount{font-size:23px;font-weight:800;color:${colors.accent};}.price-label{font-size:17px;}
    .endnote{border-left:4px solid ${colors.accent};padding-left:14px;font-size:22px;line-height:1.4;font-weight:600;max-width:100%;}.offer+.endnote{max-width:28%;text-align:right;}
    .site{font-size:17px;font-weight:400;letter-spacing:.2px;}
  </style></head><body><main class="canvas" data-template="${esc(opts.template)}" data-safe="${esc(JSON.stringify(safe))}" data-integrated="${integrated}" data-side="${plan?.side || ''}"><div class="wash"></div><canvas class="edge-extension" width="${g.w}" height="${g.h}"></canvas>${integrated ? photos[0] + '<div class="scene-shade"></div>' + photos.slice(1).join('') : photos.join('')}
    <section class="copy" style="${box(textBox)}">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<h1>${esc(title)}</h1>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}</section>
    <footer class="footer" style="${box(footer)}">${commercialText(opts)}<div class="endnote">${esc(clean(opts.interactionLabel || opts.ctaLabel || opts.cta))}${opts.couponCode ? `<div class="site">Código: ${esc(clean(opts.couponCode))}</div>` : ''}<div class="site">blacksindumentaria.com.ar</div></div></footer>
  </main></body></html>`;
}

/** Amplía la foto SIN recortarla cuando sus márgenes permiten apoyar allí el texto.
 * El análisis se hace sobre una copia de lectura. Los píxeles de la foto visible
 * nunca se transforman: no se elimina fondo ni se espeja/inventa parte del producto.
 * Fallar CORS, encontrar textura o no tener margen suficiente conserva el layout base.
 */
async function expandPhoto(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.canvas');
    if (!canvas || canvas.dataset.expanded || canvas.dataset.integrated==='true') return;
    const candidates = {
      aviso_derecha: [0,.10,.28,.62],
      aviso_izquierda: [.72,.10,.28,.62],
      aviso_columna: [.72,.04,.28,.70],
      aviso_esquina: [0,0,.64,.20],
      aviso_contrapunto: [.48,.66,.52,.22],
    };
    const candidate = candidates[canvas.dataset.template];
    const visible = canvas.querySelector('.photo img');
    if (!visible || canvas.querySelectorAll('.photo').length !== 1) return;
    try {
      const source = new Image();
      source.crossOrigin='anonymous';
      const loaded = await new Promise(resolve => {
        const timer=setTimeout(()=>resolve(false),1800);
        source.onload=()=>{clearTimeout(timer);resolve(true);};
        source.onerror=()=>{clearTimeout(timer);resolve(false);};
        source.src=visible.src;
      });
      if (!loaded) return;
      const probe=document.createElement('canvas');
      const scale=Math.min(1,360/Math.max(source.naturalWidth,source.naturalHeight));
      probe.width=Math.round(source.naturalWidth*scale);probe.height=Math.round(source.naturalHeight*scale);
      const ctx=probe.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(source,0,0,probe.width,probe.height);
      const {data}=ctx.getImageData(0,0,probe.width,probe.height), W=probe.width,H=probe.height;
      const pixel=(x,y)=>[...data.slice((y*W+x)*4,(y*W+x)*4+3)];
      const corners=[pixel(0,0),pixel(W-1,0),pixel(0,H-1),pixel(W-1,H-1)];
      const base=[0,1,2].map(c=>corners.reduce((sum,p)=>sum+p[c],0)/4);
      if(Math.min(...base)<185 || corners.some(p=>p.some((v,c)=>Math.abs(v-base[c])>20))) return;
      // Continuidad con el fondo REAL del catálogo; no una tarjeta sobre otro color.
      canvas.style.background=`rgb(${base.map(Math.round).join(',')})`;
      if (!candidate) return;
      // Todo píxel que no es fondo amplía la caja protegida, incluidas sombras.
      let x0=W,y0=H,x1=0,y1=0;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
        const k=(y*W+x)*4;
        if([0,1,2].some(c=>Math.abs(data[k+c]-base[c])>14)) {
          x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        }
      }
      if(x0>=x1 || y0>=y1) return;
      const s=JSON.parse(canvas.dataset.safe);
      const photo={x:s.x,y:s.y,w:s.w,h:s.h*.88};
      const ratio=Math.min(photo.w/W,photo.h/H);
      const ix=photo.x+(photo.w-W*ratio)/2,iy=photo.y+(photo.h-H*ratio)/2;
      // 28 px extra de resguardo alrededor de TODO el sujeto, no sólo la prenda oscura.
      const subject={x:ix+x0*ratio-28,y:iy+y0*ratio-28,r:ix+(x1+1)*ratio+28,b:iy+(y1+1)*ratio+28};
      const text={x:s.x+candidate[0]*s.w,y:s.y+candidate[1]*s.h,w:candidate[2]*s.w,h:candidate[3]*s.h};
      if(text.x<subject.r && text.x+text.w>subject.x && text.y<subject.b && text.y+text.h>subject.y) return;
      const place=(el,r)=>Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
      place(visible.parentElement,photo);place(canvas.querySelector('.copy'),text);
      canvas.style.background=`rgb(${base.map(Math.round).join(',')})`;
      canvas.querySelector('.wash').style.opacity='0';
      canvas.dataset.expanded='true';
    } catch (_) { /* Se preserva la foto y la composición original. */ }
  });
}

/** Si el proveedor entrega un ratio levemente distinto, extender sólo los bordes
 * conserva la fotografía entera y evita bandas. Nunca se usa cover sobre el sujeto.
 */
async function extendSceneEdges(page) {
  return page.evaluate(async () => {
    const root=document.querySelector('.canvas[data-integrated="true"]');
    const visible=root?.querySelector('.scene-photo img');
    if(!visible) return;
    try {
      const source=new Image();source.crossOrigin='anonymous';
      if(!await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),1800);source.onload=()=>{clearTimeout(timer);resolve(true)};source.onerror=()=>{clearTimeout(timer);resolve(false)};source.src=visible.src;})) return;
      const canvas=root.querySelector('.edge-extension'),ctx=canvas.getContext('2d');
      const W=canvas.width,H=canvas.height,sw=source.naturalWidth,sh=source.naturalHeight;
      const scale=Math.min(W/sw,H/sh),w=sw*scale,h=sh*scale,x=(W-w)/2,y=(H-h)/2;
      if(x>0){ctx.drawImage(source,0,0,1,sh,0,y,x+1,h);ctx.drawImage(source,sw-1,0,1,sh,x+w-1,y,x+1,h);}
      if(y>0){ctx.drawImage(source,0,0,sw,1,x,0,w,y+1);ctx.drawImage(source,0,sh-1,sw,1,x,y+h-1,w,y+1);}
      // La IA puede acercar el sujeto unos píxeles a la zona de texto. Reducimos
      // la columna antes que velar la prenda con un degradado blanco.
      if(['left','right'].includes(root.dataset.side)) {
        const probe=document.createElement('canvas');probe.width=300;probe.height=Math.round(300*sh/sw);
        const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(source,0,0,probe.width,probe.height);
        const pixels=pc.getImageData(0,0,probe.width,probe.height).data;
        const copy=root.querySelector('.copy'),rect=copy.getBoundingClientRect();
        const start=Math.max(0,Math.floor((rect.top-y)/h*probe.height)),end=Math.min(probe.height,Math.ceil((rect.bottom-y)/h*probe.height));
        let min=probe.width,max=-1,hits=0;
        for(let py=start;py<end;py++)for(let px=0;px<probe.width;px++){
          const k=(py*probe.width+px)*4;
          if(pixels[k]*.299+pixels[k+1]*.587+pixels[k+2]*.114<185){min=Math.min(min,px);max=Math.max(max,px);hits++;}
        }
        if(hits>100) {
          const safe=JSON.parse(root.dataset.safe);
          const available=root.dataset.side==='left' ? x+min/probe.width*w-28-safe.x : safe.x+safe.w-(x+(max+1)/probe.width*w+28);
          if(available>0 && available<rect.width) {
            const fitWidth=Math.max(220,Math.floor(available));
            copy.style.width=fitWidth+'px';
            if(root.dataset.side==='right')copy.style.left=(safe.x+safe.w-fitWidth)+'px';
          }
        }
      }
    } catch (_) { /* El fondo neutro conserva un fallback legible sin cortar la foto. */ }
  });
}

/** Ajusta textos con las métricas de la fuente cargada. No corta palabras ni datos. */
async function fitText(page) {
  await extendSceneEdges(page);
  await expandPhoto(page);
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

const LIGHT_DIRECTION = 'CAMPAÑA BLACKS: blanco, negro y pequeños acentos naranja #C1440C en la composición, manteniendo el color ORIGINAL del producto. Luz natural neutra, sombras abiertas y detalle visible. Fondo blanco, gris neutro o taller auténtico claro; sin fondos pastel, beige, verde ni azul decorativos. El naranja lo agrega el diseño tipográfico: NO dibujar líneas, franjas, paneles, formas gráficas ni acentos naranja artificiales dentro de la fotografía. La persona está de pie SOBRE EL PISO real y continuo, con postura natural y apoyo físicamente creíble. PROHIBIDO poner personas o modelos encima de cajas, cubos, pedestales, plataformas, tarimas o bloques. No agregar calzado protagonista, accesorios, herramientas ni utilería sin función. Mostrar la prenda completa, sin espejar logos ni inventar colores. La imagen continúa de borde a borde; nada de marcos, collage dentro de la foto, paneles ni textos generados.';

module.exports = { LAYOUTS, PALETTES, NAMES, INFO, REQUIREMENTS, isCampaign, photoUrls, resolveLayout, commercialText, buildHtml, expandPhoto, fitText, LIGHT_DIRECTION, paletteFor, scenePlan, sceneDirection };
