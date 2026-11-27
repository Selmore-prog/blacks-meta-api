// Cada producto con el logo de muestra en su lugar de verdad, con la misma cuenta
// que la vista previa del bot (cotizador: src/lib/kommoIA/render.js → componer):
// bordado con hilos en gorra y mochila, estampado en el resto.  node renders.mjs
import fs from 'fs';
import path from 'path';
import { createRequire, registerHooks } from 'module';
// Fuera de Next no hay caché (como en las pruebas del cotizador).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/cache') return { url: 'data:text/javascript,export const unstable_cache = (fn) => fn; export const revalidateTag = () => {};', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { componer } = await import('/Users/sebastianelmore/cotizador-blacks/src/lib/kommoIA/render.js');
const require = createRequire('/Users/sebastianelmore/cotizador-blacks/package.json');
const sharp = require('sharp');
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { productos } = JSON.parse(fs.readFileSync(path.join(AQUI, 'productos.json'), 'utf8'));
const datos = [];
for (const p of productos) {
  const ficha = JSON.parse(fs.readFileSync(path.join(AQUI, 'fichas', `ficha-${p.id}.json`), 'utf8')).producto;
  const lugar = ficha.lugares.find((l) => l.nombre.replace(/\s+/g, ' ').trim().toUpperCase() === p.lugar.toUpperCase());
  const color = ficha.colores.find((c) => c.nombre === p.color);
  const url = color?.lugares?.[lugar.id] || lugar.foto;
  const foto = Buffer.from(await (await fetch(url)).arrayBuffer());
  let logo = fs.readFileSync(path.join(AQUI, 'logos', `${p.logo}.png`));
  if (p.girar) logo = await sharp(logo).rotate(-90).png().toBuffer();
  // El lugar en la escala de 400 px; con "ocupa" el logo queda más chico, centrado (cuadernos, mochilas).
  let [x, y, w, h] = lugar.caja;
  const k = (p.ocupa || 0.75) / 0.75;
  if (k !== 1) { x += (w * (1 - k)) / 2; y += (h * (1 - k)) / 2; w *= k; h *= k; }
  const jpg = await componer(foto, logo, { x, y, ancho_px: w, alto_px: h }, { bordado: p.bordado });
  fs.writeFileSync(path.join(AQUI, 'renders', `${p.clave}.jpg`), jpg);
  fs.writeFileSync(path.join(AQUI, 'renders', `${p.clave}-sin-logo.jpg`), foto);
  datos.push({ ...p, nombre: ficha.nombre, foto: `renders/${p.clave}.jpg`, link: `https://www.blacksindumentaria.com.ar/merchandising/#producto-${p.id}` });
  console.log(p.clave, ficha.nombre, url.slice(-50));
}
fs.writeFileSync(path.join(AQUI, 'renders', 'renders.json'), JSON.stringify(datos, null, 2));
