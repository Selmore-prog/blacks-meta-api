/* Piezas del canal: composición local con fotos reales. Sin llamadas a modelos de imagen. */
(function () {
  const W = 1080;
  const H = 1350;
  const INK = '#18191c';
  const PAPER = '#f7f5f0';
  const ORANGE = '#e85d1b';
  const MUTED = '#696b70';
  const cache = new Map();

  function text(ctx, value, x, y, font, color = INK) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(String(value || ''), x, y);
  }
  function wrap(ctx, value, width, maxLines) {
    const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      while (ctx.measureText(`${lines[maxLines - 1]}…`).width > width && lines[maxLines - 1].includes(' ')) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, lines[maxLines - 1].lastIndexOf(' '));
      }
      lines[maxLines - 1] += '…';
    }
    return lines;
  }
  function block(ctx, value, x, top, width, { size = 72, min = 46, maxLines = 3,
    weight = 800, color = INK, leading = 1.08 } = {}) {
    let lines;
    while (size >= min) {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      lines = wrap(ctx, value, width, maxLines);
      if (!lines.at(-1)?.endsWith('…')) break;
      size -= 4;
    }
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    ctx.fillStyle = color;
    const step = size * leading;
    lines.forEach((line, index) => ctx.fillText(line, x, top + size + index * step));
    return top + size + (lines.length - 1) * step;
  }
  function rounded(ctx, x, y, w, h, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function photo(ctx, image, x, y, w, h) {
    ctx.fillStyle = '#e9e7e2';
    ctx.fillRect(x, y, w, h);
    if (!image) return;
    // Foto de catálogo a sangre: ningún marco, tarjeta ni margen agregado.
    const scale = Math.max(w / image.width, h / image.height);
    const sourceW = w / scale;
    const sourceH = h / scale;
    // La mayoría de las tomas son de cuerpo entero: priorizar cabeza y prenda sobre el recorte inferior.
    ctx.drawImage(image, (image.width - sourceW) / 2, Math.max(0, image.height - sourceH) * 0.08,
      sourceW, sourceH, x, y, w, h);
  }
  function formatMoney(value) {
    return `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  }
  function productPhotos(ctx, products, images, bounds, audience) {
    const visible = products.slice(0, Math.min(4, products.length));
    if (visible.length === 1) { photo(ctx, images[0], bounds.x, bounds.y, bounds.w, bounds.h); return; }
    const cols = 2;
    const rows = Math.ceil(visible.length / cols);
    const cellW = bounds.w / cols;
    const cellH = bounds.h / rows;
    visible.forEach((product, i) => {
      const wideLast = visible.length === 3 && i === 2;
      const x = wideLast ? bounds.x : bounds.x + (i % cols) * cellW;
      const y = bounds.y + Math.floor(i / cols) * cellH;
      const w = wideLast ? bounds.w : cellW;
      photo(ctx, images[i], x, y, w, cellH);
      ctx.fillStyle = 'rgba(24,25,28,.86)';
      ctx.fillRect(x, y + cellH - 92, w, 92);
      block(ctx, product.name, x + 18, y + cellH - 88, w - 36,
        { size: 21, min: 17, maxLines: 1, weight: 700, color: PAPER });
      if (audience === 'minorista' && product.price) {
        text(ctx, formatMoney(product.price), x + 18, y + cellH - 17,
          '800 27px Inter, Arial, sans-serif', PAPER);
        if (product.regularPrice && product.discountPercent) {
          const old = formatMoney(product.regularPrice);
          ctx.font = '500 18px Inter, Arial, sans-serif';
          const oldWidth = ctx.measureText(old).width;
          text(ctx, old, x + 185, y + cellH - 19,
            '500 18px Inter, Arial, sans-serif', '#c9c9c9');
          ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 185, y + cellH - 26);
          ctx.lineTo(x + 185 + oldWidth, y + cellH - 26); ctx.stroke();
          text(ctx, `${product.discountPercent}% OFF`, x + 195 + oldWidth,
            y + cellH - 19, '800 18px Inter, Arial, sans-serif', '#ff8b59');
        }
      }
    });
  }
  function footer(ctx, color) {
    text(ctx, 'blacksindumentaria.com.ar', 68, 1317,
      '500 20px Inter, Arial, sans-serif', color);
  }
  function displayName(value) {
    const name = String(value || '');
    if (name !== name.toLocaleUpperCase('es-AR')) return name;
    const lower = name.toLocaleLowerCase('es-AR').replace(/\bpampero\b/g, 'Pampero');
    return lower.charAt(0).toLocaleUpperCase('es-AR') + lower.slice(1);
  }
  function heading(ctx, data, top, foreground, subtle) {
    text(ctx, data.audience === 'mayorista' ? 'MAYORISTA' : 'MINORISTA',
      68, top + 20, '700 19px Inter, Arial, sans-serif', subtle);
    const title = data.products.length === 1 ? data.products[0].name : data.headline || data.topic;
    block(ctx, displayName(title), 68, top + 38, 944,
      { size: 58, min: 42, maxLines: 2, color: foreground, leading: 1.12 });
    if (data.audience === 'minorista' && data.products.length === 1) {
      const details = (data.products[0].specs || []).slice(0, 2).join(' · ');
      block(ctx, details, 68, top + 183, 944,
        { size: 23, min: 21, maxLines: 1, weight: 500, color: subtle });
    }
  }
  function technicalDetails(ctx, data, top, foreground, subtle) {
    const lines = [...new Set(data.products.flatMap((product) => product.specs || []))].slice(0, 3);
    if (lines.length) {
      text(ctx, 'FICHA TÉCNICA', 68, top + 20, '700 19px Inter, Arial, sans-serif', subtle);
      lines.forEach((line, i) => {
        ctx.fillStyle = ORANGE;
        ctx.fillRect(68, top + 53 + i * 46, 12, 4);
        block(ctx, line, 97, top + 35 + i * 46, 915,
          { size: 28, min: 23, maxLines: 1, weight: 500, color: foreground });
      });
    }
    text(ctx, 'Consultá por talles y cantidades', 68, top + 236,
      '600 25px Inter, Arial, sans-serif', foreground);
  }
  function offer(ctx, data, top, foreground, subtle) {
    const item = data.products.length === 1 ? data.products[0] : null;
    const discounted = item?.regularPrice && item?.discountPercent;
    let benefitsTop = top + 130;
    if (item?.price) {
      text(ctx, 'PRECIO FINAL', 68, top + 18, '700 18px Inter, Arial, sans-serif', subtle);
      if (discounted) {
        const old = formatMoney(item.regularPrice);
        ctx.font = '500 27px Inter, Arial, sans-serif';
        const oldWidth = ctx.measureText(old).width;
        text(ctx, old, 68, top + 58, '500 27px Inter, Arial, sans-serif', subtle);
        ctx.strokeStyle = subtle; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(68, top + 49); ctx.lineTo(68 + oldWidth, top + 49); ctx.stroke();
        const badgeX = 68 + oldWidth + 24;
        rounded(ctx, badgeX, top + 31, 133, 37, 7, ORANGE);
        text(ctx, `${item.discountPercent}% OFF`, badgeX + 13, top + 57,
          '800 21px Inter, Arial, sans-serif', '#ffffff');
      }
      const baseline = top + (discounted ? 147 : 110);
      text(ctx, formatMoney(item.price), 68, baseline, '800 82px Inter, Arial, sans-serif', foreground);
      benefitsTop = baseline + 50;
    }
    if (data.installments) {
      text(ctx, data.installments.replace(/[.!]+$/, ''), 68, benefitsTop,
        '600 26px Inter, Arial, sans-serif', foreground);
    }
    if (data.shippingThreshold) {
      text(ctx, `Envío gratis desde ${formatMoney(data.shippingThreshold)}`,
        68, benefitsTop + 39, '500 23px Inter, Arial, sans-serif', subtle);
    }
  }
  function drawPoll(ctx, data, style) {
    const dark = style === 1;
    ctx.fillStyle = dark ? INK : PAPER; ctx.fillRect(0, 0, W, H);
    text(ctx, 'TU OPINIÓN', 68, 215, '800 26px Inter, Arial, sans-serif', ORANGE);
    block(ctx, data.body, 68, 260, 940, { size: 84, min: 62, maxLines: 5, color: dark ? PAPER : INK });
    const options = data.pollOptions.slice(0, 4);
    options.forEach((option, i) => {
      const y = 720 + i * 112;
      rounded(ctx, 68, y, 944, 92, 22, dark ? '#2d2f34' : '#ffffff');
      text(ctx, String(i + 1).padStart(2, '0'), 94, y + 58, '800 26px Inter, Arial, sans-serif', ORANGE);
      block(ctx, option, 158, y + 17, 820, { size: 38, min: 30, maxLines: 1, color: dark ? PAPER : INK });
    });
    footer(ctx, dark ? '#bcbec2' : MUTED);
  }
  function drawProduct(ctx, data, images, style) {
    const dark = style === 1;
    const foreground = dark ? PAPER : INK;
    const subtle = dark ? '#c8c9cc' : MUTED;
    ctx.fillStyle = dark ? INK : style === 2 ? '#eee9df' : PAPER;
    ctx.fillRect(0, 0, W, H);
    // Las variantes comparten jerarquía y espaciado; sólo cambia la composición.
    if (style === 1) {
      productPhotos(ctx, data.products, images, { x: 0, y: 0, w: W, h: 690 }, data.audience);
      heading(ctx, data, 725, foreground, subtle);
    } else {
      const photoTop = style === 2 ? 250 : 270;
      if (style === 2) {
        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, W, photoTop);
      }
      heading(ctx, data, style === 2 ? 25 : 35,
        style === 2 ? PAPER : INK, style === 2 ? '#c8c9cc' : MUTED);
      productPhotos(ctx, data.products, images, { x: 0, y: photoTop, w: W, h: 950 - photoTop }, data.audience);
    }
    const infoTop = dark ? 962 : 985;
    if (data.audience === 'mayorista') technicalDetails(ctx, data, infoTop, foreground, subtle);
    else offer(ctx, data, infoTop, foreground, subtle);
    footer(ctx, subtle);
  }
  function loadImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }
  async function draw(canvas, data, version) {
    await Promise.all([500, 600, 700, 800].map((weight) => document.fonts.load(`${weight} 80px Inter`)));
    const style = ((data.plannedStyle || 0) + version) % 3;
    const images = await Promise.all(data.products.map(async (product) => {
      for (let offset = 0; offset < Math.min(product.photoCount, 3); offset++) {
        const image = await loadImage(`${product.photoBase}/${(version + offset) % product.photoCount}`);
        if (image) return image;
      }
      return null;
    }));
    if (data.products.length && images.some((image) => !image)) {
      throw new Error('No se pudo cargar una foto del catálogo. Probá de nuevo.');
    }
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (data.kind === 'encuesta') drawPoll(ctx, data, style);
    else drawProduct(ctx, data, images, style);
  }
  function download(canvas, data, version) {
    canvas.toBlob((blob) => {
      if (!blob) { window.toast('No pude preparar el PNG.', 'err'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BLACKS-canal-${data.date}-v${version + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'image/png');
  }
  async function open(post, mount, button) {
    button.disabled = true;
    try {
      const entry = cache.get(String(post.id)) || { version: -1, data: null };
      entry.data = await window.api(`/api/whatsapp-channel/${post.id}/visual-data`);
      entry.version += 1;
      cache.set(String(post.id), entry);
      mount.innerHTML = '<div class="wa-visual-tools"><b>Pieza lista para el canal</b><button class="btn-ghost btn-sm" data-visual-next>Otra versión</button><button class="btn-primary btn-sm" data-visual-download>Descargar PNG</button></div><canvas class="wa-visual-canvas" aria-label="Vista previa de la pieza"></canvas>';
      const canvas = mount.querySelector('canvas');
      await draw(canvas, entry.data, entry.version);
      mount.querySelector('[data-visual-next]').addEventListener('click', () => open(post, mount, button));
      mount.querySelector('[data-visual-download]').addEventListener('click', () => download(canvas, entry.data, entry.version));
      mount.hidden = false;
    } catch (err) {
      if (/precio del texto|cuotas del texto/i.test(err.message) && post.status !== 'published_manual') {
        mount.innerHTML = `<p class="hint">${err.message}</p><button class="btn-ghost btn-sm" data-visual-refresh>Actualizar datos del texto</button>`;
        mount.hidden = false;
        mount.querySelector('[data-visual-refresh]').addEventListener('click', async (event) => {
          const refresh = event.currentTarget;
          refresh.disabled = true;
          try {
            await window.api(`/api/whatsapp-channel/${post.id}/refresh-commerce`, { method: 'POST' });
            cache.delete(String(post.id));
            await window.loadWhatsAppChannel();
            window.toast('Precio y beneficios del texto actualizados. Ya podés crear la pieza.', 'ok');
          } catch (updateError) { window.toast(updateError.message, 'err'); refresh.disabled = false; }
        });
      } else window.toast(err.message, 'err');
    }
    finally { button.disabled = false; }
  }
  window.whatsappVisual = { open, draw };
})();
