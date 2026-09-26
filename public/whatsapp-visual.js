/* Piezas del canal: composición local con fotos reales. Sin llamadas a modelos de imagen. */
(function () {
  const W = 1080;
  const H = 1350;
  const INK = '#18191c';
  const PAPER = '#f7f5f0';
  const ORANGE = '#e85d1b';
  const MUTED = '#696b70';
  const cache = new Map();

  function hash(value) {
    let out = 2166136261;
    for (const char of String(value)) out = Math.imul(out ^ char.charCodeAt(0), 16777619);
    return out >>> 0;
  }
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
  function photo(ctx, image, x, y, w, h, dark = false) {
    rounded(ctx, x, y, w, h, 30, dark ? '#ebe9e4' : '#ffffff');
    if (!image) return;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 30); ctx.clip();
    const scale = Math.min(w / image.width, h / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    ctx.restore();
  }
  function formatMoney(value) {
    return `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  }
  function brand(ctx, dark, audience) {
    text(ctx, 'BLACKS', 68, 84, '900 34px Inter, Arial, sans-serif', dark ? PAPER : INK);
    rounded(ctx, 68, 104, 64, 6, 3, ORANGE);
    ctx.textAlign = 'right';
    text(ctx, audience === 'mayorista' ? 'PARA EMPRESAS' : 'CANAL BLACKS', 1012, 84,
      '700 24px Inter, Arial, sans-serif', dark ? '#d7d7d4' : MUTED);
    ctx.textAlign = 'left';
  }
  function productPhotos(ctx, products, images, bounds, audience) {
    const visible = products.slice(0, Math.min(4, products.length));
    if (visible.length === 1) { photo(ctx, images[0], bounds.x, bounds.y, bounds.w, bounds.h); return; }
    const gap = 12;
    const cols = visible.length === 2 ? 2 : 2;
    const rows = Math.ceil(visible.length / cols);
    const cellW = (bounds.w - gap * (cols - 1)) / cols;
    const cellH = (bounds.h - gap * (rows - 1)) / rows;
    visible.forEach((product, i) => {
      const x = bounds.x + (i % cols) * (cellW + gap);
      const y = bounds.y + Math.floor(i / cols) * (cellH + gap);
      photo(ctx, images[i], x, y, cellW, cellH);
      rounded(ctx, x + 8, y + cellH - 48, cellW - 16, 40, 10, 'rgba(255,255,255,.94)');
      const label = audience === 'minorista' && product.price
        ? `${product.name} · ${formatMoney(product.price)}` : product.name;
      block(ctx, label, x + 18, y + cellH - 44, cellW - 36,
        { size: 18, min: 15, maxLines: 1, weight: 700 });
    });
  }
  function photoLabel(ctx, data, x, y, width, size = 23) {
    if (!data.products.length) return;
    const label = data.products.length === 1 ? data.products[0].name : `${data.products.length} productos del catálogo`;
    rounded(ctx, x, y, width, 48, 12, 'rgba(255,255,255,.94)');
    block(ctx, label, x + 16, y + 7, width - 32,
      { size, min: Math.min(size, 18), maxLines: 1, weight: 700 });
  }
  function firstSentence(body) {
    return String(body || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].slice(0, 170);
  }
  function detailLines(data) {
    if (data.audience === 'mayorista') {
      return data.products.flatMap((product) => product.specs).slice(0, 3);
    }
    if (data.products.length > 1) {
      return data.products.slice(0, 3).map((product) =>
        `${product.name.replace(/\s+/g, ' ').slice(0, 31)}${product.price ? ` · ${formatMoney(product.price)}` : ''}`);
    }
    return data.products[0]?.specs?.slice(0, 2) || [];
  }
  function commerce(ctx, data, top, dark, compact = false) {
    const fg = dark ? PAPER : INK;
    if (data.audience === 'mayorista') {
      text(ctx, 'CONSULTÁ POR TU EQUIPO', 68, top + 40, `800 ${compact ? 29 : 37}px Inter, Arial, sans-serif`, fg);
      text(ctx, 'Consultá talles y cantidades', 68, top + 80, '500 23px Inter, Arial, sans-serif', dark ? '#c5c6c8' : MUTED);
      return;
    }
    const price = data.products.length === 1 ? data.products[0].price : null;
    if (price) {
      text(ctx, formatMoney(price), 68, top + 55, `900 ${compact ? 62 : 82}px Inter, Arial, sans-serif`, fg);
      if (data.installments) text(ctx, data.installments.replace(/[.!]+$/, ''), 68, top + 100,
        '600 27px Inter, Arial, sans-serif', dark ? '#dadbdd' : MUTED);
      if (data.products[0].freeShipping) text(ctx, 'ENVÍO GRATIS', 68, top + 139,
        '800 21px Inter, Arial, sans-serif', ORANGE);
    } else if (data.installments) {
      text(ctx, data.installments.replace(/[.!]+$/, ''), 68, top + 58,
        '700 28px Inter, Arial, sans-serif', fg);
    }
  }
  function finish(ctx, dark) {
    ctx.strokeStyle = dark ? '#53545a' : '#d6d3cc';
    ctx.beginPath(); ctx.moveTo(68, 1284); ctx.lineTo(1012, 1284); ctx.stroke();
    text(ctx, 'BLACKS INDUMENTARIA', 68, 1322, '700 19px Inter, Arial, sans-serif', dark ? '#bcbec2' : MUTED);
    ctx.textAlign = 'right';
    text(ctx, 'blacksindumentaria.com.ar', 1012, 1322, '500 19px Inter, Arial, sans-serif', dark ? '#bcbec2' : MUTED);
    ctx.textAlign = 'left';
  }
  function drawPoll(ctx, data, style) {
    const dark = style === 1;
    ctx.fillStyle = dark ? INK : PAPER; ctx.fillRect(0, 0, W, H);
    brand(ctx, dark, data.audience);
    text(ctx, 'TU OPINIÓN', 68, 215, '800 26px Inter, Arial, sans-serif', ORANGE);
    block(ctx, data.body, 68, 260, 940, { size: 84, min: 62, maxLines: 5, color: dark ? PAPER : INK });
    const options = data.pollOptions.slice(0, 4);
    options.forEach((option, i) => {
      const y = 720 + i * 112;
      rounded(ctx, 68, y, 944, 92, 22, dark ? '#2d2f34' : '#ffffff');
      text(ctx, String(i + 1).padStart(2, '0'), 94, y + 58, '800 26px Inter, Arial, sans-serif', ORANGE);
      block(ctx, option, 158, y + 17, 820, { size: 38, min: 30, maxLines: 1, color: dark ? PAPER : INK });
    });
    finish(ctx, dark);
  }
  function drawProduct(ctx, data, images, style) {
    const dark = style === 1;
    ctx.fillStyle = dark ? INK : PAPER; ctx.fillRect(0, 0, W, H);
    brand(ctx, dark, data.audience);
    const checked = data.checkedAt ? new Date(data.checkedAt).toLocaleDateString('es-AR',
      { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric' }) : '';
    const label = data.audience === 'mayorista' ? 'FICHA PARA EQUIPOS'
      : data.products.some((product) => product.price) && checked ? `PRECIO AL ${checked}` : 'EN EL CATÁLOGO';
    if (style === 0) {
      text(ctx, label, 68, 167, '800 22px Inter, Arial, sans-serif', ORANGE);
      block(ctx, data.topic, 68, 187, 940,
        { size: 64, min: 50, maxLines: 3, color: INK });
      productPhotos(ctx, data.products, images, { x: 68, y: 410, w: 944, h: 540 }, data.audience);
      photoLabel(ctx, data, 88, 880, 810);
      const details = detailLines(data);
      details.slice(0, 2).forEach((line, i) => {
        text(ctx, `0${i + 1}`, 68, 1002 + i * 42, '800 21px Inter, Arial, sans-serif', ORANGE);
        block(ctx, line, 120, 976 + i * 42, 850, { size: 27, min: 22, maxLines: 1 });
      });
      commerce(ctx, data, data.audience === 'mayorista' ? 1120 : 1100, false, true);
    } else if (style === 1) {
      productPhotos(ctx, data.products, images, { x: 68, y: 145, w: 944, h: 600 }, data.audience);
      photoLabel(ctx, data, 88, 675, 810);
      text(ctx, label, 68, 800, '800 22px Inter, Arial, sans-serif', ORANGE);
      block(ctx, data.topic, 68, 830, 940,
        { size: 60, min: 47, maxLines: 3, color: PAPER });
      if (data.audience === 'mayorista') {
        detailLines(data).slice(0, 2).forEach((line, i) =>
          block(ctx, `• ${line}`, 68, 1040 + i * 42, 930,
            { size: 25, min: 21, maxLines: 1, color: '#d7d8da' }));
      }
      commerce(ctx, data, 1110, true, true);
    } else {
      text(ctx, label, 68, 177, '800 22px Inter, Arial, sans-serif', ORANGE);
      productPhotos(ctx, data.products, images, { x: 68, y: 225, w: 510, h: 770 }, data.audience);
      photoLabel(ctx, data, 84, 925, 478, 20);
      block(ctx, data.topic, 615, 248, 385, { size: 62, min: 42, maxLines: 5 });
      const details = detailLines(data);
      details.slice(0, 3).forEach((line, i) => {
        rounded(ctx, 615, 690 + i * 75, 397, 60, 15, '#ffffff');
        block(ctx, line, 635, 699 + i * 75, 355, { size: 23, min: 19, maxLines: 1 });
      });
      const summary = firstSentence(data.body);
      if (summary) block(ctx, summary, 68, 1025, 940, { size: 29, min: 24, maxLines: 2, weight: 500, color: MUTED });
      commerce(ctx, data, 1110, false, true);
    }
    finish(ctx, dark);
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
    await document.fonts.load('800 80px Inter');
    const style = (hash(`${data.id}:${data.topic}`) + version) % 3;
    const images = await Promise.all(data.products.map((product) =>
      product.photoCount ? loadImage(`${product.photoBase}/${version % product.photoCount}`) : null));
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
      if (!entry.data) entry.data = await window.api(`/api/whatsapp-channel/${post.id}/visual-data`);
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
