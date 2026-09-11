const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

/**
 * Redimensiona un buffer de imagen a un ancho máximo (sin agrandar) y lo devuelve
 * como JPEG. Usa el ffmpeg que ya trae el proyecto (sirve para achicar las fotos
 * gigantes de Drive antes de mandarlas a Gemini o guardarlas).
 */
function resizeImage(buffer, maxWidth = 1080, quality = 3) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `img-in-${id}`);
    const outPath = path.join(os.tmpdir(), `img-out-${id}.jpg`);
    fs.writeFileSync(inPath, buffer);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} try { fs.unlinkSync(outPath); } catch (_) {} };
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale='min(iw,${maxWidth})':-2`, '-q:v', String(quality), outPath],
      (err) => {
        if (err) { clean(); return reject(err); }
        try {
          const out = fs.readFileSync(outPath);
          clean();
          resolve(out);
        } catch (e) { clean(); reject(e); }
      }
    );
  });
}

/**
 * Detecta si el LOGO (imagen con transparencia) está dibujado en tinta oscura o clara,
 * mirando solo los píxeles OPACOS (ignora el fondo transparente, que sesgaría el promedio).
 * Devuelve 'dark' (va bien sobre fondos CLAROS) o 'light' (va bien sobre fondos OSCUROS).
 */
function detectLogoVariant(buffer) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `logo-in-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    fs.writeFileSync(inPath, buffer);
    const SIZE = 48;
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${SIZE}:${SIZE}`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || stdout.length < SIZE * SIZE * 4) return resolve('dark'); // sin datos: asumimos oscuro (el caso más común)
        let sum = 0;
        let opaquePixels = 0;
        for (let i = 0; i < stdout.length; i += 4) {
          const alpha = stdout[i + 3];
          if (alpha < 200) continue; // ignoramos transparente/semi-transparente
          const lum = 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
          sum += lum;
          opaquePixels += 1;
        }
        // Sin transparencia detectable (ej. logo con fondo sólido, no PNG transparente):
        // usamos el promedio de TODA la imagen como aproximación.
        if (opaquePixels < 20) {
          let total = 0;
          for (let i = 0; i < stdout.length; i += 4) {
            total += 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
          }
          const avg = total / (stdout.length / 4);
          return resolve(avg < 128 ? 'dark' : 'light');
        }
        const avg = sum / opaquePixels;
        resolve(avg < 128 ? 'dark' : 'light');
      }
    );
  });
}

/**
 * Mide la CAJA DE TINTA de una imagen con transparencia (típicamente el logo): el
 * rectángulo mínimo que contiene los píxeles dibujados, en coordenadas normalizadas
 * 0..1 sobre la imagen entera, más el aspect ratio (ancho/alto) de la imagen.
 *
 * ¿Por qué? Los PNG de logo suelen venir con un margen transparente enorme alrededor
 * de la marca. Al renderizarlos con `height:150px` el navegador escala TODA la imagen
 * (margen incluido), así que la marca visible queda mucho más chica que los 150px
 * pedidos — de ahí el "el logo aparece muy chico" del dueño, que no se arreglaba
 * subiendo el número. Con esta medición el renderer puede encuadrar SOLO la tinta y
 * mostrarla al tamaño real que se pidió.
 *
 * Devuelve { x0, y0, x1, y1, aspect, coverage } o null si no se pudo medir.
 */
function measureInkBox(buffer) {
  return new Promise((resolve) => {
    const W = 128; // grilla de análisis: suficiente precisión, costo despreciable
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `ink-in-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(
      ffmpegPath,
      // scale=W:-2 mantiene el aspect: del largo del buffer deducimos el alto real.
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        clean();
        if (err || !stdout || !stdout.length) return resolve(null);
        const H = Math.floor(stdout.length / (W * 4));
        if (H < 8) return resolve(null);

        // ¿La imagen tiene transparencia real? Si no (logo con fondo sólido), la "tinta"
        // se define por contraste contra el color de las esquinas (el fondo).
        let hasAlpha = false;
        for (let i = 3; i < stdout.length; i += 4) {
          if (stdout[i] < 250) { hasAlpha = true; break; }
        }
        const cornerLum = (x, y) => {
          const i = (y * W + x) * 4;
          return 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
        };
        const bgLum = (cornerLum(0, 0) + cornerLum(W - 1, 0) + cornerLum(0, H - 1) + cornerLum(W - 1, H - 1)) / 4;

        let minX = W; let minY = H; let maxX = -1; let maxY = -1; let inkPixels = 0;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 4;
            const alpha = stdout[i + 3];
            let isInk;
            if (hasAlpha) {
              isInk = alpha > 40;
            } else {
              const lum = 0.299 * stdout[i] + 0.587 * stdout[i + 1] + 0.114 * stdout[i + 2];
              isInk = Math.abs(lum - bgLum) > 28;
            }
            if (!isInk) continue;
            inkPixels += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        if (maxX < 0 || maxY < 0) return resolve(null);
        const box = {
          x0: minX / W,
          y0: minY / H,
          x1: (maxX + 1) / W,
          y1: (maxY + 1) / H,
          aspect: W / H,
          coverage: inkPixels / (W * H),
        };
        // Caja degenerada o que ya ocupa casi todo: no hay nada que compensar.
        if (box.x1 - box.x0 < 0.05 || box.y1 - box.y0 < 0.05) return resolve(null);
        resolve(box);
      }
    );
  });
}

/**
 * Saca las BARRAS NEGRAS (letterbox) de una imagen generada por IA.
 *
 * Los modelos de imagen suelen devolver un cuadrado y "dibujar" adentro una escena
 * panorámica con bandas negras arriba y abajo (pasó con la escena de liquidación: volvió
 * 1024x1024 con dos franjas muertas). Pedir el ratio correcto lo evita casi siempre, pero
 * cuando no, esas bandas entran a la pieza como zonas negras. Acá se detectan las filas
 * uniformes y muy oscuras de los bordes y se recorta.
 *
 * Devuelve el buffer recortado, o el original si no hay barras (o si algo falla).
 */
function trimLetterbox(buffer) {
  return new Promise((resolve) => {
    const W = 64;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `lb-in-${id}`);
    const outPath = path.join(os.tmpdir(), `lb-out-${id}.jpg`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(buffer); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.length) { clean(); return resolve(buffer); }
        const H = Math.floor(stdout.length / (W * 3));
        if (H < 16) { clean(); return resolve(buffer); }
        // Una fila es "barra" si TODOS sus píxeles son casi negros.
        const isBar = (y) => {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 3;
            if (stdout[i] > 26 || stdout[i + 1] > 26 || stdout[i + 2] > 26) return false;
          }
          return true;
        };
        let top = 0; while (top < H && isBar(top)) top += 1;
        let bottom = 0; while (bottom < H - top && isBar(H - 1 - bottom)) bottom += 1;
        const keep = H - top - bottom;
        // Barras despreciables: no vale la pena tocar la imagen.
        const minBar = Math.max(2, Math.round(H * 0.02));
        if (top < minBar && bottom < minBar) { clean(); return resolve(buffer); }
        // Tiene que quedar una franja de contenido REAL. El corte no se decide por un
        // porcentaje fijo (un letterbox de 21:9 dentro de un cuadrado se come el 57% y es
        // legítimo) sino por lo que queda: banda suficiente y claramente más clara que
        // las barras. Si la imagen entera es casi negra, es una foto oscura a propósito.
        if (keep < H * 0.3) { clean(); return resolve(buffer); }
        let sum = 0;
        for (let y = top; y < H - bottom; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 3;
            sum += Math.max(stdout[i], stdout[i + 1], stdout[i + 2]);
          }
        }
        if (sum / (keep * W) < 30) { clean(); return resolve(buffer); }
        const topFrac = top / H;
        const keepFrac = (H - top - bottom) / H;
        execFile(
          ffmpegPath,
          ['-y', '-loglevel', 'error', '-i', inPath,
            '-vf', `crop=iw:ih*${keepFrac.toFixed(5)}:0:ih*${topFrac.toFixed(5)}`, '-q:v', '2', outPath],
          (err2) => {
            if (err2) { clean(); return resolve(buffer); }
            let out = buffer;
            try { out = fs.readFileSync(outPath); } catch (_) { /* queda el original */ }
            clean(); try { fs.unlinkSync(outPath); } catch (_) {}
            resolve(out);
          }
        );
      }
    );
  });
}

/**
 * Saca el MARCO uniforme de los cuatro bordes de una imagen generada.
 *
 * Es el primo claro de trimLetterbox, que sólo se ocupa de las barras NEGRAS de arriba y
 * abajo. El modelo de imagen también devuelve, de a ratos, la foto "montada" adentro de un
 * margen liso —gris claro, blanco o beige— en cualquiera de los cuatro lados. Eso pasó
 * inadvertido mientras las escenas generadas eran fondos que iban tapados por recortes;
 * en la tira generativa, donde la foto ES la pieza, el margen entra al cuadro como una
 * franja gris contra el borde y se ve como un error de maquetado (pasó en la primera
 * tira real del 11/09).
 *
 * Criterio: una fila (o columna) es marco si TODOS sus píxeles son casi del mismo color
 * entre sí — sin importar cuál — y ese color se parece al de la esquina. Se corta como
 * mucho el 8% de cada lado: más que eso ya no es un marco, es parte de la foto (un cielo
 * plano, una pared lisa) y recortarla sería peor.
 *
 * Devuelve el buffer recortado, o el original si no hay marco (o si algo falla).
 */
function trimFlatEdges(buffer) {
  return new Promise((resolve) => {
    const W = 96;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `fe-in-${id}`);
    const outPath = path.join(os.tmpdir(), `fe-out-${id}.jpg`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(buffer); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.length) { clean(); return resolve(buffer); }
        const H = Math.floor(stdout.length / (W * 3));
        if (H < 24) { clean(); return resolve(buffer); }
        const px = (x, y) => { const i = (y * W + x) * 3; return [stdout[i], stdout[i + 1], stdout[i + 2]]; };
        const cerca = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
        // Color de referencia: el promedio de las cuatro esquinas. Si las esquinas no se
        // parecen entre sí no hay marco que valga y se corta la evaluación de una.
        const esquinas = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
        const ref = [0, 1, 2].map((c) => Math.round(esquinas.reduce((a, e) => a + e[c], 0) / 4));
        if (!esquinas.every((e) => cerca(e, ref, 22))) { clean(); return resolve(buffer); }
        const filaPlana = (y) => { for (let x = 0; x < W; x += 1) if (!cerca(px(x, y), ref, 18)) return false; return true; };
        const colPlana = (x) => { for (let y = 0; y < H; y += 1) if (!cerca(px(x, y), ref, 18)) return false; return true; };
        const maxY = Math.floor(H * 0.08);
        const maxX = Math.floor(W * 0.08);
        let top = 0; while (top < maxY && filaPlana(top)) top += 1;
        let bottom = 0; while (bottom < maxY && filaPlana(H - 1 - bottom)) bottom += 1;
        let left = 0; while (left < maxX && colPlana(left)) left += 1;
        let right = 0; while (right < maxX && colPlana(W - 1 - right)) right += 1;
        if (top + bottom + left + right === 0) { clean(); return resolve(buffer); }
        // Un píxel de más de cada lado: el borde del marco suele venir difuminado.
        const x0 = left ? (left + 1) / W : 0;
        const y0 = top ? (top + 1) / H : 0;
        const wF = 1 - x0 - (right ? (right + 1) / W : 0);
        const hF = 1 - y0 - (bottom ? (bottom + 1) / H : 0);
        if (wF < 0.8 || hF < 0.8) { clean(); return resolve(buffer); }
        execFile(
          ffmpegPath,
          ['-y', '-loglevel', 'error', '-i', inPath,
            '-vf', `crop=iw*${wF.toFixed(5)}:ih*${hF.toFixed(5)}:iw*${x0.toFixed(5)}:ih*${y0.toFixed(5)}`, '-q:v', '2', outPath],
          (err2) => {
            if (err2) { clean(); return resolve(buffer); }
            let outBuf = buffer;
            try { outBuf = fs.readFileSync(outPath); } catch (_) { /* queda el original */ }
            clean(); try { fs.unlinkSync(outPath); } catch (_) {}
            resolve(outBuf);
          }
        );
      }
    );
  });
}

/**
 * BARRAS DE CINE (letterbox) que el modelo de imagen agrega por su cuenta.
 *
 * Por qué no alcanza con `trimFlatEdges`: ése está pensado para un MARCO fino de galería
 * y por eso tiene tres candados que acá juegan en contra — corta como mucho el 8% de cada
 * lado, exige que el recorte deje el 80% de la imagen, y arranca comparando las cuatro
 * esquinas entre sí. Una tira panorámica del 11-sep vino con barras negras del 14% arriba
 * y abajo, y con un degradado claro en la esquina superior izquierda: los tres candados
 * saltaron y las barras quedaron dentro de la pieza.
 *
 * Acá se mira SÓLO el alto y el ancho por separado, fila por fila, con dos criterios que
 * aguantan esa suciedad:
 *   · la fila se compara consigo misma (contra su propia mediana), no contra las esquinas,
 *     así un degradado en un extremo no invalida la fila entera;
 *   · alcanza con que el 92% de los píxeles de la fila sean del mismo tono oscuro, que es
 *     lo que hace una barra de verdad; una fila de foto real nunca da eso.
 *
 * Corta hasta el 25% de cada lado. Es mucho a propósito: una barra sin cortar entra a la
 * pieza como una franja negra a lo ancho de todos los cuadros, que es un defecto visible;
 * el precio de recortar de más es perder un poco de encuadre, que no se nota.
 *
 * Best-effort: ante cualquier duda devuelve el buffer original.
 */
function trimBars(buffer, { maxFrac = 0.25 } = {}) {
  return new Promise((resolve) => {
    const W = 96;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `bar-in-${id}`);
    const outPath = path.join(os.tmpdir(), `bar-out-${id}.jpg`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(buffer); }
    execFile(
      ffmpegPath,
      ['-y', '-loglevel', 'error', '-i', inPath, '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.length) { clean(); return resolve(buffer); }
        const H = Math.floor(stdout.length / (W * 3));
        if (H < 24) { clean(); return resolve(buffer); }
        const lum = (x, y) => {
          const i = (y * W + x) * 3;
          return (stdout[i] * 299 + stdout[i + 1] * 587 + stdout[i + 2] * 114) / 1000;
        };
        const mediana = (v) => { const o = [...v].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
        /** ¿Es una barra? Oscura y pareja: el 92% de la línea dentro de ±10 de su mediana. */
        const esBarra = (valores) => {
          const m = mediana(valores);
          if (m > 62) return false; // una barra de cine es oscura; una foto clara no lo es
          const dentro = valores.filter((v) => Math.abs(v - m) <= 10).length;
          return dentro / valores.length >= 0.92;
        };
        const fila = (y) => Array.from({ length: W }, (_, x) => lum(x, y));
        const col = (x) => Array.from({ length: H }, (_, y) => lum(x, y));

        const maxY = Math.floor(H * maxFrac);
        const maxX = Math.floor(W * maxFrac);
        let top = 0; while (top < maxY && esBarra(fila(top))) top += 1;
        let bottom = 0; while (bottom < maxY && esBarra(fila(H - 1 - bottom))) bottom += 1;
        let left = 0; while (left < maxX && esBarra(col(left))) left += 1;
        let right = 0; while (right < maxX && esBarra(col(W - 1 - right))) right += 1;

        /*
         * Una barra de 1-2 líneas a esta escala (≈2% del alto) es un borde de compresión,
         * no una barra: recortarla no arregla nada y mueve el encuadre. Se ignora.
         */
        const MIN = Math.max(2, Math.round(H * 0.03));
        if (top < MIN) top = 0;
        if (bottom < MIN) bottom = 0;
        if (left < Math.max(2, Math.round(W * 0.03))) left = 0;
        if (right < Math.max(2, Math.round(W * 0.03))) right = 0;
        if (!top && !bottom && !left && !right) { clean(); return resolve(buffer); }

        // Una línea de más de cada lado: el borde de la barra suele venir difuminado.
        const x0 = left ? (left + 1) / W : 0;
        const y0 = top ? (top + 1) / H : 0;
        const wF = 1 - x0 - (right ? (right + 1) / W : 0);
        const hF = 1 - y0 - (bottom ? (bottom + 1) / H : 0);
        if (wF < 0.45 || hF < 0.45) { clean(); return resolve(buffer); }
        execFile(
          ffmpegPath,
          ['-y', '-loglevel', 'error', '-i', inPath,
            '-vf', `crop=iw*${wF.toFixed(5)}:ih*${hF.toFixed(5)}:iw*${x0.toFixed(5)}:ih*${y0.toFixed(5)}`, '-q:v', '2', outPath],
          (err2) => {
            if (err2) { clean(); return resolve(buffer); }
            let outBuf = buffer;
            try { outBuf = fs.readFileSync(outPath); } catch (_) { /* queda el original */ }
            clean(); try { fs.unlinkSync(outPath); } catch (_) {}
            resolve(outBuf);
          }
        );
      }
    );
  });
}

/**
 * Ancho y alto reales de una imagen, leídos de la salida de ffmpeg (en el paquete no viene
 * ffprobe). Devuelve { w, h, aspect } o null. Hace falta cuando la proporción de la imagen
 * cambia el maquetado y no alcanza con object-fit — ver la tira generativa, donde una foto
 * más apaisada que la tira tiene que apoyarse arriba en vez de recortarse por los costados.
 */
function imageSize(buffer) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const inPath = path.join(os.tmpdir(), `sz-${id}`);
    const clean = () => { try { fs.unlinkSync(inPath); } catch (_) {} };
    try { fs.writeFileSync(inPath, buffer); } catch (_) { return resolve(null); }
    execFile(ffmpegPath, ['-hide_banner', '-i', inPath], (_err, _out, stderr) => {
      clean();
      const m = String(stderr || '').match(/,\s(\d{2,5})x(\d{2,5})[,\s]/);
      if (!m) return resolve(null);
      const w = Number(m[1]); const h = Number(m[2]);
      resolve(w > 0 && h > 0 ? { w, h, aspect: w / h } : null);
    });
  });
}

module.exports = { resizeImage, detectLogoVariant, measureInkBox, trimLetterbox, trimFlatEdges, trimBars, imageSize };
