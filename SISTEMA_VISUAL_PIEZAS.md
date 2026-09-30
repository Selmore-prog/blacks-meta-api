# Sistema visual de las piezas del calendario — "Estudio BLACKS"

Sep-2026. Reemplaza, para todas las piezas automáticas (feed, historias, portadas de
Reels, carruseles y guías), la mezcla de ~35 plantillas que había. Las plantillas
viejas siguen existiendo: las piezas ya hechas conservan la suya y se pueden pedir a
mano, pero el generador ya no las elige solo.

## Qué problema resuelve

Lo que se veía en las piezas reales (septiembre):

- **Sin crédito en Gemini la pieza se caía al peor caso**: la foto de catálogo metida en
  una tarjeta blanca o flotando chica en el medio, con el rectángulo de la foto a la
  vista. "Vacíos, espacios en blanco", "que no sea fluido".
- **Afiches negros vacíos** cuando no había producto (sólo un titular sobre negro).
- **Texto tapado** por la prenda en las plantillas de recorte.
- **Cada pieza con otra estética**: la variedad era azar, no diseño. El feed no tenía
  una línea reconocible.
- **Textos con oraciones que arrancaban en minúscula** ("…es ripstop. esa malla…") y
  tuteo colado ("Lava la prenda"): lo escribe el modelo de texto y nadie lo corregía.
- **Piezas que no hablaban de lo que decía el calendario**: "Ripstop: ¿por qué es tan
  resistente?" salió con un buzo polar; "¿Jean o Cargo?" con una campera.

## Cómo funciona

### 1. La foto real, puesta en escena (sin IA)

`src/photoStage.js` mide cada foto del catálogo (ffmpeg, ~40 ms, gratis):

- si el fondo es de **estudio liso** (gris cálido o blanco) o es una foto de ambiente;
- la **caja de la prenda**;
- por qué **bordes viene cortada** (un pantalón fotografiado de la cintura para abajo
  toca el borde de arriba; una campera de cuerpo entero, el de abajo);
- el **color del fondo fila por fila** (la pared que se oscurece hacia el piso).

Con eso `src/templatesStudio.js` pone la foto "en escena": pinta el lienzo entero con el
mismo degradado del estudio, agranda la **prenda** (no la foto) hasta llenar su zona,
apoya en el borde del cuadro los lados por donde la foto viene cortada y desvanece los
demás bordes. No hay tarjetas ni rectángulos: se ve como una foto de estudio hecha para
esa pieza. Se usa la foto **original de Tiendanube en 2000 px** (antes, la de 1024).

Las fotos sobre blanco puro se llevan al gris de la casa (`#EEECE8`), así todo el feed
comparte el mismo papel.

### 2. Pocas composiciones, un solo sistema

| Composición | Cuándo |
|---|---|
| `estudio_lado` | Texto en columna, prenda grande al costado. Prendas altas (pantalones, cuerpo entero). |
| `estudio_abajo` | Prenda arriba (sale por el borde si viene cortada), texto abajo. |
| `estudio_arriba` | Titular arriba, prenda abajo. Calzado, accesorios, prendas anchas. |
| `estudio_escena` | Foto a sangre: escena generada con IA, foto de ambiente o una foto que llena el cuadro (se funde en el papel). |
| `estudio_linea` | 2 a 4 fotos juntas: colores de un modelo, un pack, un ranking o una comparación (numeradas). |
| `estudio_titular` | Afiche tipográfico (oscuro o claro) con una franja de productos reales abajo. Preguntas, marca, tapas de guías, cierres de carrusel. |

La foto decide qué composiciones sostiene (`composiciones()`): un pantalón cortado en la
cintura nunca va con el titular arriba. El director creativo elige sólo entre las que la
foto sostiene, y la memoria de diseño (`src/artDirection.js`) rota composición y lado.

Todo comparte: **Archivo** condensada para los titulares, en mayúscula y con tildes
(los nombres del catálogo vienen sin tildes: `conTildes()`); **Inter** en oración para
el resto; los mismos márgenes; el naranja de marca; grano de foto. Titular = el gancho
corto del copy, y abajo el nombre de la prenda (`nombreCorto()`: "Pantalon Cargo Ripstop
Antidesgarro Pampero" → "Pantalón Cargo Ripstop"; la marca va en la volanta).

El texto se mide con la tipografía real en una primera pasada (después de achicar el
titular a lo ancho) y la foto se lleva todo el resto del cuadro (`renderOnPage`). En
historias, nada de texto en las zonas de la interfaz de Instagram (arriba 250 px, abajo
330 px). Una palabra de una letra ("a", "y") nunca queda sola en un renglón del titular.

### Varias fotos juntas: línea o mosaico

`filaDeFotos()` elige entre dos armados, midiendo:

- **Línea sin costuras**: el mismo producto en colores o vistas, fotografiado igual (mismo
  corte, mismo tono de estudio). Una fila a la misma escala, pisando el mismo piso.
- **Mosaico**: prendas distintas o fotos de sesiones distintas. Cada foto es su propio
  cuadro de estudio (su fondo extendido, la prenda grande, los cortes contra el borde),
  separados por una calle fina. Se prueban varias distribuciones (columnas, una grande y
  dos chicas, 2×2) y gana la que deja a cada prenda más grande. El alto pesa más que el
  ancho: el aire a los costados se ve natural, el aire arriba se ve como un pozo.

Así el ranking "¿Tu favorito?" sale con la 1 grande y la 2 y la 3 apiladas, "¿Jean o
cargo?" con las dos prendas lado a lado y numeradas, y cuatro remeras en 2×2.

### El afiche no deja pozos

La franja de fotos del afiche se lleva lo que el texto no usa (entre el 30% y el 58% del
alto). Las fotos de la franja son las de la prenda que nombra el tema, por la palabra más
específica ("ripstop" antes que "pantalón") y, si faltan, más fotos de esas mismas
prendas: nunca otro rubro. Los más vendidos quedan para temas que no nombran ninguna.

### Guías en carrusel (educativo y mayorista)

- Tapa en negro con el gancho, el índice de los pasos y la franja de prendas.
- Cada paso con su número grande y una **foto real** distinta: las prendas altas al costado
  del texto, las anchas arriba. Sin fotos, lámina tipográfica con el titular que crece
  hasta llenar el cuadro.
- Si el texto arranca directo en el ítem 1 ("Ventaja 1 — …"), se le agrega la tapa adelante.
- Cada cuadro guarda su receta (`shotType: 'paso'`): corregir el texto de un paso desde el
  panel lo vuelve a dibujar igual, con su número y su foto. Antes lo convertía en otra cosa.

### 3. Con y sin Gemini

- **Con crédito**: si la pieza pide escena generada, se le pide al modelo con la zona de
  texto reservada abajo (`sceneBrief()`) y va a sangre con el mismo sistema tipográfico;
  el velo es claro u oscuro según la luz real de la foto donde va el texto.
- **Sin crédito (plan B)**: la misma pieza sale con la foto real puesta en escena. Es el
  camino de todos los días cuando Gemini no responde: gratis e igual de prolijo.
- Sin crédito, el primer error pausa Gemini (texto 30 min, imágenes 1 h) y el texto sale
  por Groq. Groq tiene tope POR MODELO (8.000 tokens por minuto, ~200.000 por día), así
  que se encadenan tres: `gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b`. Si uno agotó el
  día, queda afuera hasta que se libere; si está saturado más de unos segundos, se usa
  el siguiente en vez de esperar. En la prueba real, las piezas pasaron de 100-140 s a
  20-60 s, y el cupo diario se triplica.

### 4. Controles de contenido (en código, no en el prompt)

- **Mayúscula al empezar cada oración y voseo** en todo texto de IA
  (`capitalizarOraciones()` en `src/textUtils.js`), también en la corrección factual.
- **El producto tiene que ser del tema**: si el título nombra una prenda o una tela del
  catálogo y el director eligió otra cosa, se reemplaza (`productoCoherenteConTema`).
- **Comparaciones** ("¿Jean o Cargo?"): se muestran los dos productos, numerados, y el
  copy lo sabe (`productosDeComparacion`).
- **Rankings** ("lo más vendido", "tu favorito"): los más vendidos, numerados.
- **Datos de la ficha sólo cuando la pieza es sobre esa prenda**: en una pieza de marca
  la prenda es fondo y no se imprimen sus características.
- **Guías en carrusel**: sin prefijos numerados repetidos sobre el número del diseño
  ("Paso 2 —", "Ventaja 3:", "Consejo 1 -", "Error 4."), en voseo desde la primera palabra.
- **Voseo con criterio**: "Evalúa" → "Evaluá", "dinos" → "decinos"; pero "Seca rápido",
  "Lleva bolsillos" o "Mide 70 cm" describen la prenda y no se tocan (los verbos dudosos
  sólo se pasan a voseo si la oración le habla al lector: "Usá tu talle").
- **Nombres propios y abreviaturas**: "Grafa 70", "Buenos Aires", "WhatsApp" no se bajan a
  minúscula (sólo se baja un texto escrito como título, como las fichas del catálogo);
  "10 und. y 20%" no pasa a "und. Y"; "talla" → "talle"; "volúmen" → "volumen".

## Video desde una idea

Calendario → **Nueva → Video desde una idea**. Una frase ("quiero hacer un video del
ripstop") y sale el guion grabable completo: la idea, el gancho, qué grabar en cada toma,
qué decir, qué texto va en pantalla, la portada, la música, el texto de la publicación y
el cierre. El producto se busca en el catálogo real (se puede cambiar por otro) y tolera
errores de tipeo: "un video de riptop" encuentra el ripstop (cada palabra que no está en
ningún nombre se corrige contra las palabras reales del catálogo). El texto del guion
pasa por las mismas reglas que las piezas (voseo, mayúsculas, tildes de los nombres) y
las expresiones acartonadas que la IA no corrige se cambian por la forma natural en vez
de cortar con un error. "Copiar guion" lo deja listo para mandar por WhatsApp; "Agregar
al calendario" crea el Reel con el guion adentro. Ver `briefFromIdea` /
`createReelFromIdea` en `src/reelBrief.js`.

## Para probar sin tocar producción

`test/studio-pieces.test.js` arma fotos de estudio en memoria y verifica medición,
composiciones, zonas seguras, que no haya tarjetas, línea vs mosaico y que el afiche no
deje pozos. `test/text-fallback.test.js` simula que Groq agota el cupo del día y verifica
que el texto sale por el modelo siguiente, y los casos de voseo. Para mirar piezas con fotos reales:
renderizar con `studio.renderOnPage` sobre una página de Puppeteer (no sube nada).
