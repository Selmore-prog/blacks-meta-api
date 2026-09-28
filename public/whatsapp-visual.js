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
    while (true) {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      lines = wrap(ctx, value, width, maxLines);
      if (!lines.at(-1)?.endsWith('…') || size <= min) break;
      size = Math.max(min, size - 4);
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
  // Nunca recortar, estirar ni tapar una parte del producto con una tarjeta.
  function fitImage(width, height, bounds) {
    const scale = Math.min(bounds.w / width, bounds.h / height);
    return { x: bounds.x + (bounds.w - width * scale) / 2,
      y: bounds.y + (bounds.h - height * scale) / 2, w: width * scale, h: height * scale };
  }
  function photo(ctx, image, bounds) {
    const fit = fitImage(image.width, image.height, bounds);
    ctx.drawImage(image, fit.x, fit.y, fit.w, fit.h);
    return fit;
  }
  function palette(image) {
    const sample = document.createElement('canvas'); sample.width = sample.height = 32;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 32, 32);
    const points = [[1, 1], [30, 1], [1, 30], [30, 30]];
    const colors = points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
    const color = [0, 1, 2].map((i) => colors.map((c) => c[i]).sort((a, b) => a - b)[1]);
    const dark = color[0] * .299 + color[1] * .587 + color[2] * .114 < 125;
    return { background: `rgb(${color.join(',')})`, foreground: dark ? PAPER : INK,
      subtle: dark ? '#dedede' : '#575a5d', rgb: color };
  }
  function emptyPhotoArea(image, bounds, area) {
    const fit = fitImage(image.width, image.height, bounds);
    if (area.x < fit.x || area.y < fit.y || area.x + area.w > fit.x + fit.w || area.y + area.h > fit.y + fit.h) return false;
    const sample = document.createElement('canvas'); sample.width = sample.height = 48;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, (area.x - fit.x) / fit.w * image.width, (area.y - fit.y) / fit.h * image.height,
      area.w / fit.w * image.width, area.h / fit.h * image.height, 0, 0, 48, 48);
    const pixels = ctx.getImageData(0, 0, 48, 48).data;
    const base = palette(image).rgb;
    // Sólo escribir sobre fondo uniforme: cualquier textura o silueta hace usar otra composición.
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(...base.map((v, channel) => Math.abs(v - pixels[i + channel]))) > 24) return false;
    }
    return true;
  }
  function bottomOccupancy(image) {
    const sample = document.createElement('canvas'); sample.width = sample.height = 48;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 48, 48);
    const pixels = ctx.getImageData(0, 45, 48, 3).data;
    const base = palette(image).rgb;
    let occupied = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(...base.map((v, channel) => Math.abs(v - pixels[i + channel]))) > 35) occupied++;
    }
    // Favorecer tomas más abiertas sobre primeros planos que llegan al borde inferior.
    return occupied / (pixels.length / 4);
  }
  function formatMoney(value) {
    return `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
  }
  function displayName(value) {
    const name = String(value || '');
    if (name !== name.toLocaleUpperCase('es-AR')) return name;
    const lower = name.toLocaleLowerCase('es-AR').replace(/\bpampero\b/g, 'Pampero');
    return lower.charAt(0).toLocaleUpperCase('es-AR') + lower.slice(1);
  }
  function gallery(product) {
    return product.gallery || Array.from({ length: product.photoCount || 0 }, (_, index) => ({ index, colors: [] }));
  }
  function heroGallery(product) {
    return gallery(product).filter((photo) => !product.heroPhotoIndices || product.heroPhotoIndices.includes(photo.index));
  }
  function colorPhotos(product) {
    return (product.colors || []).flatMap((color) => {
      const index = color.photoIndices.find((i) => gallery(product).find((p) => p.index === i)?.colors?.length === 1);
      return index == null ? [] : [{ index, label: color.name }];
    });
  }
  function slides(data) {
    if (data.kind === 'encuesta') return [{ type: 'poll', label: 'Encuesta' }];
    const result = [{ type: 'hero', label: 'Aviso principal' }];
    data.products.forEach((product, productIndex) => {
      const colors = colorPhotos(product);
      const colorIds = new Set(colors.map((p) => p.index));
      const views = gallery(product).filter((p) => !colorIds.has(p.index) &&
        (gallery(product).length > 1 || p.index !== product.primaryPhoto))
        .map((p) => ({ index: p.index, label: p.colors?.length === 1 ? p.colors[0] : 'Otra vista' }));
      for (const [type, items] of [['colors', colors], ['views', views]]) {
        for (let offset = 0; offset < items.length; offset += 4) {
          result.push({ type, productIndex, items: items.slice(offset, offset + 4),
            label: `${type === 'colors' ? 'Colores' : 'Fotos'} · ${displayName(product.name)} · ${1 + offset / 4}` });
        }
      }
    });
    return result;
  }
  function footer(ctx, p, shippingThreshold) {
    text(ctx, 'blacksindumentaria.com.ar', 60, 1310, '500 19px Inter, Arial, sans-serif', p.subtle);
    if (shippingThreshold) {
      ctx.textAlign = 'right';
      text(ctx, `Envío gratis desde ${formatMoney(shippingThreshold)}`, 1020, 1310,
        '500 19px Inter, Arial, sans-serif', p.subtle);
      ctx.textAlign = 'left';
    }
  }
  function title(ctx, data, p, { x = 60, y = 46, width = 960, size = 66, lines = 2 } = {}) {
    text(ctx, data.campaign?.label || (data.audience === 'mayorista' ? 'PEDIDOS MAYORISTAS' : 'EN EL CATÁLOGO'),
      x, y + 20, '800 20px Inter, Arial, sans-serif', ORANGE);
    const name = data.products.length === 1 ? data.products[0].name : data.topic || data.headline;
    return block(ctx, displayName(name), x, y + 42, width,
      { size, min: 36, maxLines: lines, weight: 800, color: p.foreground });
  }
  function price(ctx, data, product, p, x, y, width = 460, compact = false) {
    if (data.audience === 'mayorista') {
      block(ctx, 'Consultá por tu pedido', x, y, width,
        { size: compact ? 36 : 43, min: 29, maxLines: 2, color: p.foreground });
      return;
    }
    if (!product.price) return;
    const discount = product.regularPrice && product.discountPercent;
    if (discount) {
      const old = formatMoney(product.regularPrice);
      ctx.font = '500 25px Inter, Arial, sans-serif';
      const w = ctx.measureText(old).width;
      text(ctx, old, x, y + 23, '500 25px Inter, Arial, sans-serif', p.subtle);
      ctx.strokeStyle = p.subtle; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 15); ctx.lineTo(x + w, y + 15); ctx.stroke();
      text(ctx, `${product.discountPercent}% OFF`, x + w + 20, y + 23,
        '800 24px Inter, Arial, sans-serif', ORANGE);
    } else text(ctx, 'PRECIO FINAL', x, y + 21, '700 18px Inter, Arial, sans-serif', p.subtle);
    block(ctx, formatMoney(product.price), x, y + 33, width,
      { size: compact ? 60 : 83, min: 43, maxLines: 1, color: p.foreground });
    if (data.installments) block(ctx, data.installments, x, y + (compact ? 112 : 132), width,
      { size: compact ? 22 : 25, min: 20, maxLines: compact ? 2 : 1, weight: 600, color: p.foreground });
  }
  function colorNote(ctx, product, p, x, y, width) {
    const colors = product.colors || [];
    if (!colors.length) return;
    const uncertain = colors.some((c) => c.catalogOnly);
    text(ctx, uncertain ? 'COLORES DE CATÁLOGO' : 'COLORES CON STOCK', x, y + 20,
      '700 18px Inter, Arial, sans-serif', p.subtle);
    const end = block(ctx, colors.map((c) => c.name).join(' · '), x, y + 34, width,
      { size: 26, min: 21, maxLines: 2, weight: 600, color: p.foreground });
    text(ctx, uncertain ? 'Consultá disponibilidad y talles' : 'Talles y detalles en el mensaje', x, end + 34,
      '500 19px Inter, Arial, sans-serif', p.subtle);
  }
  function selectedHero(product, version) {
    const options = colorPhotos(product).map((p) => p.index);
    if (options.length) return options[version % options.length];
    const all = heroGallery(product);
    return all.find((p) => p.index === product.primaryPhoto)?.index ?? all[0]?.index;
  }
  const imageCache = new Map();
  async function loadPhoto(product, index) {
    const metadata = gallery(product).find((p) => p.index === index);
    const url = `${product.photoBase}/${index}${metadata?.key ? `?key=${encodeURIComponent(metadata.key)}` : ''}`;
    if (!imageCache.has(url)) imageCache.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { imageCache.delete(url); reject(new Error('No se pudo cargar una foto del catálogo. Volvé a crear la pieza.')); };
      image.src = url;
    }));
    return imageCache.get(url);
  }
  async function drawHero(ctx, data, version) {
    if (data.products.length > 1) return drawCollection(ctx, data, version);
    const product = data.products[0];
    let heroIndex = selectedHero(product, version);
    if (heroIndex == null) throw new Error('No hay fotos de variantes disponibles para esta pieza.');
    let hero = await loadPhoto(product, heroIndex);
    const style = ((data.plannedStyle || 0) + version) % 3;
    const fullPhoto = { x: 0, y: 0, w: W, h: 1080 };
    const overlayArea = { x: 45, y: 35, w: 350, h: 345 };
    if (style === 2 || bottomOccupancy(hero) > .35) {
      const available = heroGallery(product).filter((view) => view.index !== heroIndex);
      const choices = [...new Set([0, .33, .66, 1].map((part) => available[Math.floor(part * (available.length - 1))]?.index))]
        .filter((index) => index != null);
      const alternatives = await Promise.allSettled(choices.map((index) => loadPhoto(product, index)));
      const candidates = [{ index: heroIndex, image: hero }, ...alternatives.flatMap((result, i) =>
        result.status === 'fulfilled' ? [{ index: choices[i], image: result.value }] : [])]
        .filter((candidate) => style !== 2 || emptyPhotoArea(candidate.image, fullPhoto, overlayArea))
        .sort((a, b) => bottomOccupancy(a.image) - bottomOccupancy(b.image));
      if (candidates.length) { hero = candidates[0].image; heroIndex = candidates[0].index; }
    }
    const p = palette(hero);
    ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H);
    const colorEntries = colorPhotos(product).slice(0, 4);
    const alternate = heroGallery(product).find((view) => view.index !== heroIndex);
    if (style === 1 && (colorEntries.length > 1 || alternate)) {
      title(ctx, data, p, { size: 62 });
      photo(ctx, hero, { x: 350, y: 260, w: 730, h: 740 });
      const feature = product.specs?.[version % Math.max(1, product.specs.length)];
      if (feature) block(ctx, feature, 60, 295, 270,
        { size: 34, min: 26, maxLines: 3, weight: 500, color: p.foreground });
      price(ctx, data, product, p, 60, 520, 280, true);
      const entries = colorEntries.length > 1 ? colorEntries :
        heroGallery(product).filter((view) => view.index !== heroIndex).slice(0, 3).map((view) => ({ index: view.index, label: 'Otra vista' }));
      const photos = await Promise.all(entries.map((entry) => loadPhoto(product, entry.index)));
      const label = colorEntries.length > 1 ? ((product.colors || []).some((c) => c.catalogOnly)
        ? 'COLORES DE CATÁLOGO · CONSULTÁ DISPONIBILIDAD' : 'ELEGÍ TU COLOR · TALLES EN EL MENSAJE') : 'OTRAS VISTAS DEL PRODUCTO';
      text(ctx, label, 60, 1030, '700 19px Inter, Arial, sans-serif', p.subtle);
      const cell = 960 / entries.length;
      entries.forEach((entry, i) => {
        photo(ctx, photos[i], { x: 60 + cell * i, y: 1055, w: cell - 18, h: 170 });
        block(ctx, entry.label, 60 + cell * i, 1233, cell - 18,
          { size: 21, min: 18, maxLines: 1, weight: 600, color: p.foreground });
      });
    } else if (style === 2 && emptyPhotoArea(hero, fullPhoto, overlayArea)) {
      photo(ctx, hero, fullPhoto);
      title(ctx, data, p, { width: 320, size: 47, lines: 4, y: 40 });
      price(ctx, data, product, p, 60, 1090);
      colorNote(ctx, product, p, 600, 1110, 420);
    } else if (style === 2 && alternate) {
      title(ctx, data, p);
      const second = await loadPhoto(product, alternate.index);
      photo(ctx, second, { x: 40, y: 370, w: 325, h: 550 });
      photo(ctx, hero, { x: 390, y: 245, w: 660, h: 775 });
      if (alternate.colors?.length === 1) text(ctx, alternate.colors[0], 60, 954, '500 23px Inter, Arial, sans-serif', p.subtle);
      const selected = gallery(product).find((view) => view.index === heroIndex);
      if (selected?.colors?.length === 1) text(ctx, selected.colors[0], 430, 1050, '500 23px Inter, Arial, sans-serif', p.subtle);
      price(ctx, data, product, p, 60, 1090);
      colorNote(ctx, product, p, 600, 1110, 420);
    } else {
      title(ctx, data, p);
      photo(ctx, hero, { x: 0, y: 260, w: W, h: 800 });
      price(ctx, data, product, p, 60, 1090);
      colorNote(ctx, product, p, 600, 1110, 420);
    }
    footer(ctx, p, data.audience === 'minorista' ? data.shippingThreshold : null);
  }
  async function drawGallery(ctx, data, slide) {
    const product = data.products[slide.productIndex];
    const photos = await Promise.all(slide.items.map((item) => loadPhoto(product, item.index)));
    const p = palette(photos[0]);
    ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H);
    text(ctx, slide.type === 'colors' ? 'ELEGÍ TU COLOR' : 'MIRALO DE CERCA', 60, 62,
      '800 22px Inter, Arial, sans-serif', ORANGE);
    block(ctx, displayName(product.name), 60, 90, 960, { size: 52, min: 38, maxLines: 2, color: p.foreground });
    const rows = slide.items.length > 2 ? 2 : 1;
    const cols = slide.items.length === 1 ? 1 : 2;
    const cellW = 960 / cols, cellH = 920 / rows;
    slide.items.forEach((item, i) => {
      const x = 60 + i % cols * cellW, y = 250 + Math.floor(i / cols) * cellH;
      photo(ctx, photos[i], { x, y, w: cellW - 22, h: cellH - 64 });
      block(ctx, item.label, x + 8, y + cellH - 54, cellW - 38,
        { size: 27, min: 21, maxLines: 1, weight: 600, color: p.foreground });
    });
    const uncertain = product.colors?.some((c) => c.catalogOnly);
    text(ctx, slide.type === 'views' ? 'Fotos de catálogo. Colores y talles disponibles en el mensaje.'
      : uncertain ? 'Colores de catálogo. Consultá disponibilidad y talles.' : 'Consultá los talles de cada color en el mensaje.',
      60, 1246, '500 23px Inter, Arial, sans-serif', p.subtle);
    footer(ctx, p);
  }
  async function drawCollection(ctx, data, version) {
    const photos = await Promise.all(data.products.map((product) => loadPhoto(product, selectedHero(product, version))));
    const p = palette(photos[0]); ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H);
    title(ctx, data, p, { size: 52 });
    const cols = 2, rows = Math.ceil(data.products.length / cols), cellW = 480, cellH = 960 / rows;
    data.products.forEach((product, i) => {
      const x = 60 + i % cols * cellW, y = 245 + Math.floor(i / cols) * cellH;
      photo(ctx, photos[i], { x, y, w: cellW - 24, h: cellH - 135 });
      const bottom = y + cellH - 130;
      block(ctx, displayName(product.name), x, bottom, cellW - 32, { size: 25, min: 20, maxLines: 2, weight: 700, color: p.foreground });
      if (data.audience === 'minorista' && product.price) {
        text(ctx, `${formatMoney(product.price)}${product.discountPercent ? ` · ${product.discountPercent}% OFF` : ''}`,
          x, y + cellH - 28, '800 29px Inter, Arial, sans-serif', p.foreground);
      }
    });
    footer(ctx, p);
  }
  function drawPoll(ctx, data) {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    text(ctx, 'TE LEEMOS', 60, 120, '800 24px Inter, Arial, sans-serif', ORANGE);
    block(ctx, data.body, 60, 180, 960, { size: 74, min: 48, maxLines: 5 });
    data.pollOptions.slice(0, 4).forEach((option, i) => {
      const y = 700 + i * 115;
      rounded(ctx, 60, y, 960, 92, 14, '#e9e6de');
      block(ctx, `${i + 1}. ${option}`, 90, y + 17, 900, { size: 36, min: 27, maxLines: 1 });
    });
    footer(ctx, { subtle: MUTED });
  }
  async function draw(canvas, data, version, slideIndex = 0) {
    await Promise.all([500, 600, 700, 800].map((weight) => document.fonts.load(`${weight} 80px Inter`)));
    const pages = slides(data);
    const slide = pages[slideIndex];
    if (!slide) throw new Error('No existe esa pieza.');
    // Dibujar fuera de pantalla y reemplazar sólo cuando están todas las fotos.
    const render = document.createElement('canvas'); render.width = W; render.height = H;
    const ctx = render.getContext('2d');
    if (slide.type === 'poll') drawPoll(ctx, data);
    else if (slide.type === 'hero') await drawHero(ctx, data, version);
    else await drawGallery(ctx, data, slide);
    canvas.width = W; canvas.height = H;
    canvas.getContext('2d').drawImage(render, 0, 0);
    return pages;
  }
  function download(canvas, data, version, slideIndex = 0) {
    canvas.toBlob((blob) => {
      if (!blob) { window.toast('No pude preparar el PNG.', 'err'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BLACKS-canal-${data.date}-v${version + 1}-pieza${slideIndex + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'image/png');
  }
  async function open(post, mount, button) {
    button.disabled = true;
    try {
      const entry = cache.get(String(post.id)) || { version: -1, data: null };
      entry.data = await window.api(`/api/whatsapp-channel/${post.id}/visual-data`);
      const caption = entry.data.caption || post.body;
      if (entry.captionSource !== caption) { entry.captionSource = caption; entry.captionDraft = caption; }
      entry.version += 1;
      cache.set(String(post.id), entry);
      mount.innerHTML = '<div class="wa-visual-tools"><b>Aviso + fotos para el canal</b><button class="btn-ghost btn-sm" data-visual-next>Otra composición</button><button class="btn-primary btn-sm" data-visual-download>Descargar PNG</button><select data-visual-slide aria-label="Elegir pieza"></select></div><canvas class="wa-visual-canvas" aria-label="Vista previa de la pieza"></canvas><div class="wa-visual-caption"><label>Copy para acompañar<textarea rows="7" data-visual-caption></textarea></label><button class="btn-ghost btn-sm" data-copy-caption>Copiar copy</button></div>';
      const canvas = mount.querySelector('canvas');
      const selector = mount.querySelector('[data-visual-slide]');
      const pages = await draw(canvas, entry.data, entry.version);
      pages.forEach((page, index) => {
        const option = document.createElement('option'); option.value = index;
        option.textContent = `${index + 1}/${pages.length} · ${page.label}`; selector.appendChild(option);
      });
      let displayedSlide = 0;
      selector.disabled = pages.length < 2;
      selector.addEventListener('change', async () => {
        const buttons = mount.querySelectorAll('button, select'); buttons.forEach((b) => { b.disabled = true; });
        try { await draw(canvas, entry.data, entry.version, Number(selector.value)); displayedSlide = Number(selector.value); }
        catch (error) { selector.value = displayedSlide; window.toast(error.message, 'err'); }
        finally { buttons.forEach((b) => { b.disabled = false; }); }
      });
      mount.querySelector('[data-visual-caption]').value = entry.captionDraft;
      mount.querySelector('[data-visual-caption]').addEventListener('input', (event) => { entry.captionDraft = event.target.value; });
      mount.querySelector('[data-copy-caption]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(mount.querySelector('[data-visual-caption]').value); window.toast('Copy copiado.', 'ok'); }
        catch (_) { window.toast('No pude copiar el texto. Podés seleccionarlo y copiarlo.', 'err'); }
      });
      mount.querySelector('[data-visual-next]').addEventListener('click', () => open(post, mount, button));
      mount.querySelector('[data-visual-download]').addEventListener('click', () => download(canvas, entry.data, entry.version, displayedSlide));
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
  window.whatsappVisual = { open, draw, slides, fitImage };
})();
