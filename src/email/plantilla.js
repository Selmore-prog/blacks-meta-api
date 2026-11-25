/* =========================================================================
 * EMAIL MARKETING — de bloques a HTML de mail
 *
 * Un mail es una lista de bloques (título, foto, texto, botón, productos…) y un
 * tema (claro o negro). Este archivo los convierte en el HTML que entienden los
 * programas de correo: tablas, estilos en línea y 600 px de ancho. No toca la
 * base ni la red, así se puede probar entero (test/email-marketing.test.js).
 *
 * TRES MODOS
 *  · vista: lo que se ve en el panel y lo que se baja como archivo.
 *  · envio: cada link pasa por el motor (/e/c/…) para saber quién lo tocó, y va
 *    la imagen invisible que avisa la apertura (/e/o/…). %%TOKEN%% y %%NOMBRE%%
 *    se reemplazan por persona en envio.js: el HTML se arma una sola vez.
 *  · calor: igual que vista, con los clics reales dibujados sobre cada link.
 *
 * LOS LINKS LLEVAN SU DESTINO FIRMADO adentro (?u=…&s=…): el redireccionador no
 * depende de la base y nadie puede usarlo para mandar a otro sitio.
 * ========================================================================= */

const crypto = require('crypto');

const TEMAS = {
  claro: {
    fondo: '#f3f2ef', hoja: '#ffffff', tinta: '#17181c', suave: '#62646b', linea: '#e6e5e1',
    acento: '#c2410c', boton: '#17181c', sobreBoton: '#ffffff', caja: '#f7f6f3', bordeBoton: '#5a5b62',
  },
  negro: {
    fondo: '#000000', hoja: '#0f0f11', tinta: '#ffffff', suave: '#b4b5bb', linea: '#2c2c31',
    acento: '#ff8a4c', boton: '#ffffff', sobreBoton: '#0f0f11', caja: '#18181b', bordeBoton: '#85868d',
  },
};

// El logo va en una banda negra SIN transparencia: en modo oscuro Gmail da vuelta los
// fondos y las letras pero no las imágenes, y un logo calado se pierde con el fondo nuevo.

const LETRA = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const TIPOS = ['titulo', 'imagen', 'texto', 'boton', 'estrella', 'productos', 'foto_texto', 'banda', 'lista', 'pasos', 'beneficios', 'cupon', 'separador', 'firma'];

const escapar = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plata = (n) => `$${Math.round(Number(n)).toLocaleString('es-AR')}`;

const urlValida = (u) => /^(https?:\/\/|mailto:|tel:)/i.test(String(u || '').trim());

function conUtm(url, campania) {
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    // Sólo en la tienda propia: a un WhatsApp o a Instagram no le sirven.
    if (!/(^|\.)blacksindumentaria\.com\.ar$/i.test(u.hostname)) return url;
    u.searchParams.set('utm_source', 'email');
    u.searchParams.set('utm_medium', 'email');
    u.searchParams.set('utm_campaign', campania || 'email');
    return u.toString();
  } catch (_) { return url; }
}

const firmar = (texto, secreto) => crypto.createHmac('sha256', String(secreto)).update(texto).digest('base64url').slice(0, 16);

const empaquetar = (url) => Buffer.from(url, 'utf8').toString('base64url');

/** Devuelve el destino de un link de seguimiento o null si la firma no da. */
function abrirLink(u, s, secreto) {
  if (!u || !s) return null;
  let url;
  try { url = Buffer.from(String(u), 'base64url').toString('utf8'); } catch (_) { return null; }
  const esperada = firmar(url, secreto);
  const a = Buffer.from(String(s));
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return urlValida(url) ? url : null;
}

/** "{nombre}" → marca por persona. El espacio de adelante va adentro: sin nombre queda "Hola,". */
const conNombre = (s) => String(s || '').replace(/\s?\{nombre\}/gi, '%%NOMBRE%%');

/** Texto simple con **negrita** y [links](https://…). Todo lo demás se escapa. */
function parrafos(texto, enlazar, estilo, colorLink) {
  return conNombre(texto).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const html = escapar(p)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g, (_, t, u) => `<a href="${enlazar(u.replace(/&amp;/g, '&'), t)}" style="color:${colorLink};text-decoration:underline;">${t}</a>`)
      .replace(/\n/g, '<br>');
    return `<p style="${estilo}">${html}</p>`;
  }).join('');
}

const textoPlano = (texto) => conNombre(texto)
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1: $2');

/** Las fichas mayoristas vienen en MAYÚSCULAS: en el mail se leen como el resto. */
function nombreDe(p) {
  const n = String(p.name || '');
  if (n !== n.toUpperCase() || !/\p{Lu}{4}/u.test(n)) return n;
  return n.toLowerCase().replace(/(^|\s)(\p{Ll})(?=\p{Ll}{3})/gu, (_, a, l) => a + l.toUpperCase()).replace(/^\p{Ll}/u, (l) => l.toUpperCase());
}

function precios(p, descuentoTransferencia) {
  const lista = Number(p.price) || 0;
  const oferta = Number(p.promo_price) || 0;
  const final = oferta && oferta < lista ? oferta : lista;
  return {
    final,
    tachado: final && final < lista ? lista : 0,
    off: final && final < lista ? Math.round((1 - final / lista) * 100) : 0,
    transferencia: final && descuentoTransferencia ? Math.floor(final * (1 - descuentoTransferencia / 100)) : 0,
  };
}

/**
 * @param campania   { asunto, preheader, tema, bloques, utm, descuento_transferencia }
 * @param opciones   { productos: Map(id → producto), modo, base, secreto, conteos, sitio, empresa }
 * @returns { html, texto, links: [{ i, url, etiqueta, bloque }], avisos: [] }
 */
function renderizar(campania, opciones = {}) {
  const t = TEMAS[campania.tema] || TEMAS.claro;
  const modo = opciones.modo || 'vista';
  const productos = opciones.productos || new Map();
  const sitio = (opciones.sitio || 'https://blacksindumentaria.com.ar').replace(/\/+$/, '');
  const base = String(opciones.base || '').replace(/\/+$/, '');
  const conteos = opciones.conteos || {};
  const totalClics = Object.values(conteos).reduce((a, b) => a + Number(b || 0), 0);
  const maxClics = Math.max(1, ...Object.values(conteos).map(Number));
  const links = [];
  const avisos = [];
  const plano = [];
  let bloqueActual = 0;

  // Cada link se anota en orden. En "envio" apunta al motor; en el resto, directo.
  function enlazar(url, etiqueta) {
    const limpia = String(url || '').trim();
    if (!urlValida(limpia)) { avisos.push(`Bloque ${bloqueActual + 1}: falta el link de "${etiqueta}".`); return escapar(sitio); }
    const destino = conUtm(limpia, campania.utm);
    const i = links.length;
    links.push({ i, url: destino, etiqueta: String(etiqueta || '').slice(0, 80), bloque: bloqueActual });
    if (modo === 'envio') return escapar(`${base}/e/c/%%TOKEN%%/${i}?u=${empaquetar(destino)}&s=${firmar(destino, opciones.secreto)}`);
    return escapar(destino);
  }

  // Sólo en el mapa de calor: cuántos clics tuvo el último link creado.
  function calor() {
    if (modo !== 'calor') return '';
    const n = Number(conteos[links.length - 1] || 0);
    const pct = totalClics ? Math.round((n / totalClics) * 100) : 0;
    const fuerza = n / maxClics;
    const color = !n ? '#9ca3af' : fuerza > 0.66 ? '#dc2626' : fuerza > 0.33 ? '#ea580c' : '#ca8a04';
    return `<div style="margin:6px 0 0;"><span style="display:inline-block;background:${color};color:#ffffff;font:700 12px/1 ${LETRA};padding:5px 9px;border-radius:99px;">${n} ${n === 1 ? 'clic' : 'clics'} · ${pct}%</span></div>`;
  }

  const fila = (contenido, relleno = '0 32px', extra = '') => `<tr><td class="px" style="padding:${relleno};${extra}">${contenido}</td></tr>`;

  function boton(texto, url, { ancho = false, chico = false, fondo = t.boton, tinta = t.sobreBoton, borde = fondo === t.boton ? t.bordeBoton : fondo, izquierda = false } = {}) {
    const href = enlazar(url, texto);
    const alto = chico ? '11px 18px' : '15px 30px';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${ancho ? ' width="100%"' : izquierda ? '' : ' align="center" style="margin:0 auto;"'}><tr><td align="center" bgcolor="${fondo}" style="background:${fondo};border:1px solid ${borde};border-radius:6px;"><a href="${href}" target="_blank" style="display:block;padding:${alto};font-family:${LETRA};font-size:${chico ? 14 : 16}px;font-weight:700;line-height:1.2;color:${tinta};text-decoration:none;border-radius:6px;">${escapar(texto)}</a></td></tr></table>${calor()}`;
  }

  function foto(src, alt, ancho, href) {
    if (!src) return '';
    const img = `<img src="${escapar(src)}" alt="${escapar(alt)}" width="${ancho}" style="display:block;width:100%;max-width:${ancho}px;height:auto;border:0;border-radius:8px;">`;
    return href ? `<a href="${href}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
  }

  const urlProducto = (p) => (/^https?:\/\//i.test(p.permalink || '') ? p.permalink : `${sitio}/productos/${p.permalink || ''}`);

  function bloquePrecio(p, grande) {
    const pr = precios(p, campania.descuento_transferencia);
    if (!pr.final) return '';
    return `<p style="margin:6px 0 0;font-family:${LETRA};font-size:${grande ? 26 : 18}px;line-height:1.25;font-weight:800;color:${t.tinta};">${plata(pr.final)}${pr.tachado ? ` <span style="font-size:${grande ? 16 : 13}px;font-weight:400;color:${t.suave};text-decoration:line-through;">${plata(pr.tachado)}</span>` : ''}</p>`
      + (pr.transferencia ? `<p style="margin:2px 0 0;font-family:${LETRA};font-size:${grande ? 15 : 13}px;line-height:1.35;color:${t.acento};font-weight:600;">${plata(pr.transferencia)} por transferencia</p>` : '');
  }

  function producto(id, sinPrecio = false) {
    const p = productos.get(Number(id));
    if (!p) { avisos.push(`Bloque ${bloqueActual + 1}: un producto ya no está publicado.`); return null; }
    if (p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0) avisos.push(`${p.name}: sin stock.`);
    if (!sinPrecio && !Number(p.price)) avisos.push(`${p.name}: sin precio (¿es la ficha mayorista?).`);
    return p;
  }

  const DIBUJAR = {
    titulo(b) {
      plano.push([b.antetitulo, b.titulo, b.bajada].filter(Boolean).map(textoPlano).join('\n'));
      return fila(
        (b.antetitulo ? `<p style="margin:0 0 10px;font-family:${LETRA};font-size:13px;line-height:1.4;font-weight:600;color:${t.acento};">${escapar(conNombre(b.antetitulo))}</p>` : '')
        + `<h1 class="h1" style="margin:0;font-family:${LETRA};font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-0.6px;color:${t.tinta};">${escapar(conNombre(b.titulo)).replace(/\n/g, '<br>')}</h1>`
        + (b.bajada ? `<p style="margin:14px 0 0;font-family:${LETRA};font-size:17px;line-height:1.5;color:${t.suave};">${escapar(conNombre(b.bajada)).replace(/\n/g, '<br>')}</p>` : ''),
        '28px 32px 8px', `text-align:${b.alinear === 'izquierda' ? 'left' : 'center'};`,
      );
    },
    imagen(b) {
      const deProducto = b.id ? productos.get(Number(b.id)) : null;
      if (deProducto) b = { ...b, src: b.src || deProducto.image_url, url: b.url || urlProducto(deProducto), alt: b.alt || deProducto.name };
      if (!b.src) { avisos.push(`Bloque ${bloqueActual + 1}: falta la foto.`); return ''; }
      const href = b.url ? enlazar(b.url, b.alt || 'Foto') : '';
      return fila(foto(b.src, b.alt || '', b.aSangre ? 600 : 536, href) + (href ? calor() : ''), b.aSangre ? '16px 0 0' : '16px 32px 0');
    },
    texto(b) {
      plano.push(textoPlano(b.texto || ''));
      return fila(parrafos(b.texto, enlazar, `margin:0 0 14px;font-family:${LETRA};font-size:16px;line-height:1.6;color:${t.tinta};`, t.acento), '14px 32px 0', `text-align:${b.alinear === 'centro' ? 'center' : 'left'};`);
    },
    boton(b) {
      const html = boton(b.texto || 'Ver más', b.url);
      plano.push(`${b.texto || 'Ver más'}: ${(links[links.length - 1] || {}).url || ''}`);
      return fila(html, '18px 32px 10px', 'text-align:center;');
    },
    estrella(b) {
      const p = producto(b.id, b.sinPrecio);
      if (!p) return '';
      const href = enlazar(urlProducto(p), p.name);
      const img = foto(b.src || p.image_url, p.name, 536, href) + calor();
      const pr = precios(p, campania.descuento_transferencia);
      plano.push(`${b.nombre || p.name}${b.sinPrecio ? '' : ` — ${plata(pr.final)}`}\n${urlProducto(p)}`);
      return fila(img, '18px 32px 0')
        + fila(
          `<h2 style="margin:0;font-family:${LETRA};font-size:22px;line-height:1.25;font-weight:700;color:${t.tinta};">${escapar(b.nombre || nombreDe(p))}</h2>${b.sinPrecio ? '' : bloquePrecio(p, true)}`
          + (b.detalle ? `<p style="margin:10px 0 0;font-family:${LETRA};font-size:15px;line-height:1.5;color:${t.suave};">${escapar(b.detalle).replace(/\n/g, '<br>')}</p>` : ''),
          '18px 32px 0', 'text-align:center;',
        )
        + fila(boton(b.boton || 'Comprar', urlProducto(p)), '18px 32px 12px', 'text-align:center;');
    },
    productos(b) {
      const lista = (b.ids || []).map((x) => producto(x, b.sinPrecio)).filter(Boolean);
      if (!lista.length) { avisos.push(`Bloque ${bloqueActual + 1}: no hay productos elegidos.`); return ''; }
      const columnas = Math.min(3, Math.max(1, Number(b.columnas) || 2));
      const ancho = Math.floor((536 - (columnas - 1) * 16) / columnas);
      const cuanto = (p) => (b.sinPrecio ? '' : bloquePrecio(p, false));
      const enPlano = (p) => plano.push(`${p.name}${b.sinPrecio ? '' : ` — ${plata(precios(p, 0).final)}`}\n${urlProducto(p)}`);
      // Uno por fila: la foto a la izquierda y los datos al lado.
      if (columnas === 1) {
        const filas1 = lista.map((p) => {
          const href = enlazar(urlProducto(p), p.name);
          const img = foto(p.image_url, p.name, 190, href) + calor();
          enPlano(p);
          return `<tr><td class="col" width="190" valign="top" style="width:190px;padding:0 22px 26px 0;">${img}</td><td class="col" valign="middle" style="padding:0 0 26px;"><p style="margin:0;font-family:${LETRA};font-size:17px;line-height:1.35;font-weight:700;color:${t.tinta};">${escapar(nombreDe(p))}</p>${cuanto(p)}<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>${boton(b.boton || 'Comprar', urlProducto(p), { chico: true, izquierda: true })}</td></tr>`;
        });
        return (b.titulo ? fila(`<h2 style="margin:0;font-family:${LETRA};font-size:20px;line-height:1.3;font-weight:700;color:${t.tinta};">${escapar(b.titulo)}</h2>`, '24px 32px 0') : '')
          + fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas1.join('')}</table>`, '18px 32px 0');
      }
      const celda = (p) => {
        const href = enlazar(urlProducto(p), p.name);
        const img = foto(p.image_url, p.name, ancho, href) + calor();
        enPlano(p);
        return `${img}<p style="margin:12px 0 0;font-family:${LETRA};font-size:15px;line-height:1.35;font-weight:600;color:${t.tinta};">${escapar(nombreDe(p))}</p>${cuanto(p)}<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>${boton(b.boton || 'Comprar', urlProducto(p), { ancho: true, chico: true })}`;
      };
      const filas = [];
      for (let i = 0; i < lista.length; i += columnas) {
        const grupo = lista.slice(i, i + columnas);
        const celdas = grupo.map((p, j) => `<td class="col" width="${ancho}" valign="top" style="width:${ancho}px;padding:0 ${j < columnas - 1 ? 16 : 0}px 28px 0;">${celda(p)}</td>`);
        while (celdas.length < columnas) celdas.push(`<td class="col" width="${ancho}" style="width:${ancho}px;">&nbsp;</td>`);
        filas.push(`<tr>${celdas.join('')}</tr>`);
      }
      return (b.titulo ? fila(`<h2 style="margin:0;font-family:${LETRA};font-size:20px;line-height:1.3;font-weight:700;color:${t.tinta};">${escapar(b.titulo)}</h2>`, '24px 32px 0') : '')
        + fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas.join('')}</table>`, '18px 32px 0');
    },
    beneficios(b) {
      const items = (b.items || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4);
      if (!items.length) return '';
      plano.push(items.map((x) => `· ${x}`).join('\n'));
      const celdas = items.map((x) => `<td class="col" width="${Math.floor(100 / items.length)}%" valign="top" align="center" style="padding:14px 8px;font-family:${LETRA};font-size:14px;line-height:1.4;font-weight:600;color:${t.tinta};">${escapar(x)}</td>`).join('');
      return fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${t.linea};border-bottom:1px solid ${t.linea};"><tr>${celdas}</tr></table>`, '20px 32px 0');
    },
    cupon(b) {
      plano.push(`${b.texto || ''} ${b.codigo || ''}`.trim());
      return fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.caja};border-radius:8px;"><tr><td align="center" style="padding:22px 20px;">${b.texto ? `<p style="margin:0 0 8px;font-family:${LETRA};font-size:15px;line-height:1.4;color:${t.suave};">${escapar(b.texto)}</p>` : ''}<p style="margin:0;font-family:${LETRA};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:1px;color:${t.tinta};">${escapar(b.codigo || '')}</p></td></tr></table>`, '20px 32px 0');
    },
    foto_texto(b) {
      const p = b.id ? productos.get(Number(b.id)) : null;
      const src = b.src || (p && p.image_url);
      const url = b.url || (p && urlProducto(p)) || '';
      if (!src) avisos.push(`Bloque ${bloqueActual + 1}: falta la foto.`);
      const href = url && src ? enlazar(url, b.titulo || b.alt || 'Foto') : '';
      const img = (src ? foto(src, b.alt || b.titulo || '', 256, href) : '') + (href ? calor() : '');
      plano.push([b.titulo, b.texto].filter(Boolean).map(textoPlano).join('\n'));
      const datos = (b.titulo ? `<h2 style="margin:0 0 8px;font-family:${LETRA};font-size:22px;line-height:1.25;font-weight:700;color:${t.tinta};">${escapar(conNombre(b.titulo))}</h2>` : '')
        + parrafos(b.texto, enlazar, `margin:0 0 12px;font-family:${LETRA};font-size:15px;line-height:1.55;color:${t.suave};`, t.acento)
        + (b.boton && url ? boton(b.boton, url, { chico: true, izquierda: true }) : '');
      const celda = (html, extra, clase = 'col') => `<td class="${clase}" width="268" valign="middle" style="width:268px;${extra}">${html}</td>`;
      // En el celular va siempre la foto arriba: por eso se escribe primero aunque se vea a la derecha.
      const partes = b.lado === 'derecha'
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>${celda(`<div dir="ltr">${img}</div>`, 'padding:0 0 16px 0;')}${celda(`<div dir="ltr" style="text-align:left;">${datos}</div>`, 'padding:0 24px 16px 0;', 'col dato')}</tr></table>`
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${celda(img, 'padding:0 0 16px 0;')}${celda(datos, 'padding:0 0 16px 24px;', 'col dato')}</tr></table>`;
      return fila(partes, '24px 32px 0');
    },
    banda(b) {
      const [fondo, tinta, botonFondo, botonTinta] = {
        acento: ['#c2410c', '#ffffff', '#ffffff', '#17181c'],
        tinta: [t.boton, t.sobreBoton, t.sobreBoton, t.boton],
        suave: [t.caja, t.tinta, t.boton, t.sobreBoton],
      }[b.color] || [t.caja, t.tinta, t.boton, t.sobreBoton];
      plano.push([b.titulo, b.texto].filter(Boolean).map(textoPlano).join('\n'));
      const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${fondo}" style="background:${fondo};border-radius:10px;"><tr><td align="center" style="padding:30px 26px;">`
        + (b.titulo ? `<h2 style="margin:0;font-family:${LETRA};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.3px;color:${tinta};">${escapar(conNombre(b.titulo)).replace(/\n/g, '<br>')}</h2>` : '')
        + (b.texto ? `<p style="margin:10px 0 0;font-family:${LETRA};font-size:16px;line-height:1.5;color:${tinta};">${escapar(conNombre(b.texto)).replace(/\n/g, '<br>')}</p>` : '')
        + (b.boton ? `<div style="height:18px;line-height:18px;font-size:18px;">&nbsp;</div>${boton(b.boton, b.url, { fondo: botonFondo, tinta: botonTinta })}` : '')
        + '</td></tr></table>';
      return fila(html, '24px 32px 0');
    },
    lista(b) {
      const items = (b.items || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8);
      if (!items.length) return '';
      plano.push(items.map((x) => `· ${textoPlano(x)}`).join('\n'));
      const filas = items.map((x) => `<tr><td width="22" valign="top" style="width:22px;padding:5px 0;font-family:${LETRA};font-size:16px;line-height:1.5;font-weight:700;color:${t.acento};">•</td><td valign="top" style="padding:5px 0;font-family:${LETRA};font-size:16px;line-height:1.5;color:${t.tinta};">${escapar(conNombre(x)).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</td></tr>`).join('');
      return fila((b.titulo ? `<h2 style="margin:0 0 8px;font-family:${LETRA};font-size:20px;line-height:1.3;font-weight:700;color:${t.tinta};">${escapar(b.titulo)}</h2>` : '')
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>`, '20px 32px 0');
    },
    pasos(b) {
      const items = (b.items || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5);
      if (!items.length) return '';
      plano.push(items.map((x, i) => `${i + 1}. ${textoPlano(x)}`).join('\n'));
      const filas = items.map((x, i) => `<tr><td width="46" valign="top" style="width:46px;padding:8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="32" height="32" bgcolor="${t.boton}" style="width:32px;height:32px;background:${t.boton};border-radius:16px;font-family:${LETRA};font-size:15px;font-weight:700;color:${t.sobreBoton};">${i + 1}</td></tr></table></td><td valign="middle" style="padding:8px 0;font-family:${LETRA};font-size:16px;line-height:1.5;color:${t.tinta};">${escapar(conNombre(x)).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</td></tr>`).join('');
      return fila((b.titulo ? `<h2 style="margin:0 0 8px;font-family:${LETRA};font-size:20px;line-height:1.3;font-weight:700;color:${t.tinta};">${escapar(b.titulo)}</h2>` : '')
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>`, '20px 32px 0');
    },
    separador() {
      return fila(`<div style="border-top:1px solid ${t.linea};height:1px;line-height:1px;font-size:1px;">&nbsp;</div>`, '24px 32px 4px');
    },
    firma(b) {
      plano.push(textoPlano(b.texto || ''));
      return fila(parrafos(b.texto, enlazar, `margin:0;font-family:${LETRA};font-size:16px;line-height:1.5;color:${t.tinta};`, t.acento), '10px 32px 0');
    },
  };

  const bloques = Array.isArray(campania.bloques) ? campania.bloques : [];
  bloqueActual = -1;
  const hrefLogo = enlazar(sitio, 'Logo');
  const cuerpo = bloques.map((b, i) => {
    bloqueActual = i;
    const f = DIBUJAR[b && b.tipo];
    return f ? f(b) : '';
  }).join('\n');
  if (!bloques.length) avisos.push('El mail no tiene bloques.');
  bloqueActual = bloques.length;

  const empresa = opciones.empresa || 'BLACKS Indumentaria · Av. Directorio 7320, Ciudad Autónoma de Buenos Aires';
  const motivo = opciones.motivo || 'Recibís este mail porque compraste o dejaste tu mail en blacksindumentaria.com.ar.';
  const bajaHref = modo === 'envio' ? `${base}/e/b/%%TOKEN%%` : '#';
  // En el panel se ve desde donde se está mirando; en el mail, siempre con dirección completa.
  const logoSrc = `${opciones.baseLogo === undefined ? base : opciones.baseLogo}/e/logo-banda.png`;
  const pixel = modo === 'envio' ? `<img src="${base}/e/o/%%TOKEN%%.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : '';
  const pre = escapar(conNombre(campania.preheader || ''));

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="${campania.tema === 'negro' ? 'dark' : 'light'}"><title>${escapar(conNombre(campania.asunto || 'BLACKS')).replace(/%%NOMBRE%%/g, '')}</title>
<style>@media only screen and (max-width:620px){.hoja{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.col{display:block!important;width:100%!important;padding-right:0!important}.col img{max-width:100%!important;width:100%!important}.dato{padding-left:0!important}.h1{font-size:30px!important}}a{text-decoration:none}</style></head>
<body style="margin:0;padding:0;background:${t.fondo};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${t.fondo};">${pre}${'&#8199;&#65279;&#847; '.repeat(pre ? 30 : 0)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.fondo}" style="background:${t.fondo};"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" class="hoja" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.hoja}" style="width:600px;max-width:600px;background:${t.hoja};border-radius:10px;">
<tr><td align="center" bgcolor="${t.hoja}" style="padding:0;background:${t.hoja};border-radius:10px 10px 0 0;font-size:0;line-height:0;"><a href="${hrefLogo}" target="_blank"><img src="${escapar(logoSrc)}" alt="BLACKS" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:10px 10px 0 0;font-family:${LETRA};font-size:22px;line-height:56px;font-weight:800;color:${t.tinta};text-align:center;"></a></td></tr>
${cuerpo}
<tr><td style="height:32px;line-height:32px;font-size:1px;">&nbsp;</td></tr>
</table>
<table role="presentation" class="hoja" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;"><tr><td align="center" class="px" style="padding:22px 32px 8px;font-family:${LETRA};font-size:12px;line-height:1.6;color:${t.suave};">${escapar(empresa)}<br>${escapar(motivo)}<br><a href="${bajaHref}" target="_blank" style="color:${t.suave};text-decoration:underline;">No quiero recibir más mails</a></td></tr></table>
${pixel}</td></tr></table></body></html>`;

  const texto = `${plano.filter(Boolean).join('\n\n')}\n\n${empresa}\n${motivo}\nNo quiero recibir más mails: ${modo === 'envio' ? bajaHref : ''}`.trim();

  return { html, texto, links, avisos: [...new Set(avisos)] };
}

/** Punto de partida de cada diseño. Los textos son de ejemplo y se editan. */
const PLANTILLAS = [
  {
    clave: 'oferta', nombre: 'Oferta con productos', para: 'minorista', tema: 'claro',
    detalle: 'Título grande y productos con precio y botón Comprar.',
    bloques: [
      { tipo: 'titulo', antetitulo: 'Esta semana', titulo: 'Bajamos los precios', bajada: 'Elegimos lo más vendido y le bajamos el precio por unos días.' },
      { tipo: 'boton', texto: 'Ver las ofertas', url: 'https://blacksindumentaria.com.ar/' },
      { tipo: 'productos', titulo: '', ids: [], columnas: 2, boton: 'Comprar' },
      { tipo: 'beneficios', items: ['Envío gratis desde $45.000', '3 y 6 cuotas sin interés', '10% OFF por transferencia'] },
    ],
  },
  {
    clave: 'evento', nombre: 'Evento en negro', para: 'minorista', tema: 'negro',
    detalle: 'Para Black Friday y fechas fuertes: fondo negro y un producto al frente.',
    bloques: [
      { tipo: 'titulo', antetitulo: 'Del 27 al 30 de noviembre', titulo: 'Black Friday', bajada: 'Cuatro días de precios especiales, sólo online.' },
      { tipo: 'estrella', id: null, boton: 'Comprar' },
      { tipo: 'productos', titulo: 'También en oferta', ids: [], columnas: 2, boton: 'Comprar' },
      { tipo: 'beneficios', items: ['3 y 6 cuotas sin interés', '10% OFF por transferencia'] },
    ],
  },
  {
    clave: 'estrella', nombre: 'Un solo producto', para: 'minorista', tema: 'claro',
    detalle: 'Una foto grande, el precio y un botón. El que mejor se lee en el celular.',
    bloques: [
      { tipo: 'titulo', antetitulo: '', titulo: 'Volvió en todos los talles', bajada: '' },
      { tipo: 'estrella', id: null, boton: 'Elegir mi talle' },
      { tipo: 'beneficios', items: ['Cambios dentro de los 30 días', '3 y 6 cuotas sin interés'] },
    ],
  },
  {
    clave: 'seleccion', nombre: 'Selección con foto', para: 'minorista', tema: 'claro',
    detalle: 'Foto de temporada arriba y tres productos abajo.',
    bloques: [
      { tipo: 'imagen', src: '', alt: '', url: 'https://blacksindumentaria.com.ar/', aSangre: true },
      { tipo: 'titulo', antetitulo: '', titulo: 'Lo que se usa este verano', bajada: '', alinear: 'izquierda' },
      { tipo: 'productos', titulo: '', ids: [], columnas: 3, boton: 'Ver' },
    ],
  },
  {
    clave: 'mayorista', nombre: 'Empresas', para: 'mayorista', tema: 'claro',
    detalle: 'Para pedir presupuesto: sin precios, con botón a WhatsApp.',
    bloques: [
      { tipo: 'titulo', antetitulo: 'Para tu empresa', titulo: 'Uniformes con tu logo', bajada: 'Bordados o estampados, con muestra digital antes de producir.' },
      { tipo: 'imagen', src: '', alt: 'Uniformes con logo', url: '', aSangre: false },
      { tipo: 'texto', texto: 'Hola {nombre}, armamos la ropa de trabajo de tu equipo desde 10 unidades surtidas: podés mezclar modelos, talles y colores. Emitimos Factura A.' },
      { tipo: 'boton', texto: 'Pedir presupuesto por WhatsApp', url: 'https://wa.me/5491153248230?text=Hola!%20Quiero%20cotizar%20ropa%20de%20trabajo%20para%20mi%20empresa.' },
      { tipo: 'beneficios', items: ['Logo bordado o estampado', 'Factura A', 'Desde 10 unidades'] },
    ],
  },
  {
    clave: 'carta', nombre: 'Carta corta', para: 'todos', tema: 'claro',
    detalle: 'Como un mail escrito a mano. Sirve para retomar presupuestos o avisar algo.',
    bloques: [
      { tipo: 'texto', texto: 'Hola {nombre},\n\nEscribí acá tu mensaje.' },
      { tipo: 'boton', texto: 'Responder por WhatsApp', url: 'https://wa.me/5491153248230' },
      { tipo: 'firma', texto: 'Equipo BLACKS' },
    ],
  },
];

module.exports = { TEMAS, TIPOS, PLANTILLAS, renderizar, abrirLink, firmar, empaquetar, conUtm, precios, conNombre, escapar };
