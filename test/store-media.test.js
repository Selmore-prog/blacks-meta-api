const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _internos } = require('../src/storeMedia');

const { tieneTransparencia, orientacionExif, urlsDeSupabase, cambiarTextos, nombreDe } = _internos;
const S = 'https://znfhimoajvrsrgdaoxbn.supabase.co/storage/v1/object/public/blacks-assets/home-blocks/';

// Cabecera PNG mínima: firma + IHDR con el tipo de color pedido.
function png(tipoColor, extra = '') {
  const b = Buffer.alloc(40 + extra.length);
  b.writeUInt32BE(0x89504e47, 0);
  b.write('IHDR', 12, 'ascii');
  b[25] = tipoColor;
  if (extra) b.write(extra, 33, 'ascii');
  return b;
}

// JPEG con un bloque EXIF que sólo trae la orientación (Motorola o Intel).
function jpegConOrientacion(valor, le) {
  const tiff = Buffer.alloc(26);
  tiff.write(le ? 'II' : 'MM', 0, 'ascii');
  const u16 = (v, o) => (le ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const u32 = (v, o) => (le ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
  u16(42, 2); u32(8, 4); u16(1, 8); u16(0x0112, 10); u16(3, 12); u32(1, 14); u16(valor, 18);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 34]), Buffer.from('Exif\0\0', 'binary'), tiff]);
}

test('una foto con transparencia no se pasa a JPEG', () => {
  assert.equal(tieneTransparencia(png(6)), true); // RGBA
  assert.equal(tieneTransparencia(png(4)), true); // gris con alfa
  assert.equal(tieneTransparencia(png(2)), false); // RGB, como las escenas de la vidriera
  assert.equal(tieneTransparencia(png(3, 'tRNS....IDAT')), true); // paleta con transparencia
  assert.equal(tieneTransparencia(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), false); // JPEG
});

test('lee la orientación EXIF para no acostar fotos de celular', () => {
  assert.equal(orientacionExif(jpegConOrientacion(6, false)), 6);
  assert.equal(orientacionExif(jpegConOrientacion(1, true)), 1);
  assert.equal(orientacionExif(jpegConOrientacion(8, true)), 8);
  assert.equal(orientacionExif(png(2)), 1);
});

test('encuentra y cambia sólo las direcciones de Supabase de los bloques', () => {
  const data = {
    title: 'Ideales para tu día',
    fotos: [
      { image: `${S}a.png`, image_2: `${S}b.png`, url: '/productos/jean/' },
      { image: 'https://acdn-us.mitiendanube.com/stores/339/112/products/x.jpg', image_2: '' },
    ],
  };
  assert.deepEqual([...urlsDeSupabase([data])], [`${S}a.png`, `${S}b.png`]);
  const nuevo = cambiarTextos(data, (s) => (s === `${S}a.png` ? 'https://w.workers.dev/media/home-blocks/a.jpg' : s.startsWith(S) ? '' : s));
  assert.equal(nuevo.fotos[0].image, 'https://w.workers.dev/media/home-blocks/a.jpg');
  assert.equal(nuevo.fotos[0].image_2, '');
  assert.equal(nuevo.fotos[1].image, data.fotos[1].image);
  assert.equal(data.fotos[0].image, `${S}a.png`, 'la config guardada no se toca');
});

test('el nombre en el Worker sale del archivo original, sin extensión', () => {
  assert.equal(nombreDe(`${S}1790706976892-efv5yg.png`), '1790706976892-efv5yg');
  assert.equal(nombreDe(`${S}Foto Linda.JPG`), 'foto-linda');
});
