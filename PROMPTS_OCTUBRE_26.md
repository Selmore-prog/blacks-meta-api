# Piezas y videos — Octubre 26 (Meta · cuenta BLACKS INDUMENTARIA)

Sigue a `PROMPTS_PRIMAVERA_26.md`. Todo lo de acá sale de lo que se midió en la cuenta
el 28-sep-2026. Las piezas terminadas están en `~/Desktop/piezas-motor/octubre/`.

## Lo que ya está corriendo (28-sep, noche)

Conjunto **01 · Prospecting amplio · Iniciar pago** ($12.000/día). Cada anuncio lleva
**tres versiones**: 9:16 para historias y reels, 4:5 para feeds y Explorar, 1:1 de repuesto.

| # | Anuncio | Formato | Promete |
|---|---|---|---|
| 12 | Jean Clásico Recto | foto | $36.999 · 24% OFF |
| 13 | Combo Jean + Alpargatas | foto | $61.998 los dos · envío gratis |
| 14 | Bermuda Cargo Cazador | foto | $26.999 · 40% OFF |
| 15 | Cargo Slim Fit ("Cómodo y elastizado") | foto | $58.999 · envío gratis |
| 16 | Chomba Micropique | foto | $26.999 (ojo: sin talle L en ningún color) |
| 17 | Remera Lisa Pampero (4 colores) | foto | $17.999 (ojo: sin talle M en ningún color) |
| 18 | Video · Jean Clásico Recto | video 8 s | $36.999 · 24% OFF |
| 19 | Video · Cargo Ripstop | video 8 s | $59.999 · envío gratis |
| 20 | Video · Jean + Alpargatas | video 8 s | $61.998 los dos · envío gratis |

Campaña **Motor | Remarketing | Catálogo** ($3.000/día, arranca sola el 30-sep 00:00):
catálogo curado a quien visitó o dejó el carrito en 90 días, sin los que compraron.

Pausados por prometer cosas que ya no eran ciertas (precios del 21-sep): jean $32.999,
chomba $24.999, cargo ripstop 30% OFF y "el equipo de primavera".

## Formatos y calidad — leer antes de generar

Verificado con las vistas previas oficiales de Meta el 28-sep:

| Ubicación | Qué versión muestra | Dónde puede ir el texto |
|---|---|---|
| Historias y Reels (FB e IG) | **9:16 · 1080×1920** | entre el **14% y el 65%** del alto: Reels tapa el 35% de abajo con la cuenta, el texto y el botón "Comprar" |
| Feed, Explorar, perfil (FB e IG) | **4:5 · 1080×1350** | dentro del **cuadrado central (10%-90%)**: si una ubicación lo recorta a cuadrado, no se pierde nada |
| Marketplace, columna derecha, búsqueda, Messenger, Audience Network | Meta NO respeta la versión asignada: recorta la 9:16 o la 4:5 al centro | **Quedaron fuera** del conjunto (el 28-sep no tenían entrega: el 100% iba a historias y reels) |

Lo que vos generás tiene que cumplir esto para que salga nítido y sin cortes:

- **Imágenes**: siempre SIN texto (el texto lo pongo yo). Generá cada escena **por separado**
  en 9:16 y en 4:5, en la máxima resolución que ofrezca la herramienta (en Gemini, **2K**),
  y bajala en PNG. El producto entero y centrado; que no quede pegado a los bordes.
- **Videos de Veo / Flow**: 9:16, **1080p** (calidad "Quality"/1080p, no "Fast"), 8 segundos,
  siempre con primer cuadro. Los tres de hoy salieron en 720p (Veo Fast) y están escalados
  a 1080: se ven bien, pero para máxima nitidez los rehago en 1080p (US$3,20 cada uno)
  cuando haya saldo en Gemini.
- **Videos de celular**: vertical, 1080p o 4K, 30 cuadros por segundo, luz de día, celular
  quieto o apoyado. Sin filtros ni texto.
- Las tres versiones (9:16, 4:5 y 1:1) las saco yo del mismo material con
  `scripts/piezas-overlay-anuncios.py` y `scripts/video-anuncio.py`, que fallan solos si un
  texto se sale de la zona segura.

## Seis reglas que salieron de los datos

1. **Vertical primero.** El 100% de la entrega fue a Historias y Reels (mitad y
   mitad); el feed no recibió nada. Se diseña el 9:16 y después el 4:5.
2. **Zona segura de Reels, no la de Historias.** Reels tapa el 35% de abajo (cuenta,
   texto, botón). Todo el texto va entre el 14% y el 65% del alto.
   `scripts/piezas-overlay-anuncios.py` falla si una pieza se sale de ahí.
3. **Una sola foto continua.** Si en el prompt se pide "dejá vacío el 34% de arriba",
   el modelo parte la imagen en dos fotos pegadas (pasó en 3 de 6). Se pide un
   encuadre natural y la posición del texto se decide después, mirando la foto.
4. **Stock antes que pieza.** La **chomba no tiene L** y la **remera lisa no tiene M** en
   ningún color (28-sep). Igual se publicitan porque son de lo más vendido, pero cuando
   vuelvan esos talles van a convertir mejor. Las alpargatas (27 de 27 talles) y el jean
   (40 de 40) son los que mejor aguantan tráfico. `verificar-precios-anuncios.js` avisa
   cuando un talle falta en todos los colores.
5. **Precio que se anuncia, precio que se verifica.** Cada anuncio con precio,
   descuento o envío gratis va en `anuncios/manifiesto-meta.json`. Cuando cambie la
   lista de precios: `node scripts/verificar-precios-anuncios.js`.
6. **Variedad de verdad.** Meta (Andromeda) agrupa creativos parecidos y los trata como
   uno solo. Sirve más cambiar de producto, de escena y de formato (foto / video /
   combo) que cambiar el color de fondo de la misma pieza. El 99% del gasto estaba en
   un solo anuncio: eso es lo que hay que evitar.

---

## A · Videos con el celular (lo que más rinde y lo que más falta)

Un video real de la prenda puesta le gana a cualquier cosa generada: es lo que
responde "¿me va a durar?". No hace falta cara ni actor.

**Cómo grabar**: celular en vertical, 1080p o 4K, luz de día, sin música (Meta la
agrega si hace falta), 10 a 20 segundos por toma, quedate quieto 2 segundos al
principio y al final. Mandame los archivos crudos: el texto, los subtítulos y los
tres formatos (9:16, 4:5 y 1:1) los hago yo con `scripts/video-anuncio.py`.

| Toma | Qué se ve | Para qué |
|---|---|---|
| A1 · Jean caminando | Alguien caminando hacia la cámara con el jean, de la cintura para abajo; se agacha a atarse el cordón y se levanta | Muestra caída y comodidad |
| A2 · Jean de cerca | Primer plano: costura, remaches, cierre, la etiqueta de cuero. Después los 5 colores doblados en fila | "100% algodón, cierre YKK, hecho en Argentina" |
| A3 · Ripstop enganchado | La tela se engancha en un alambre o un clavo y no se rasga. **Sólo si pasa de verdad**: una prueba falsa en un aviso es publicidad engañosa | El único argumento que nadie más muestra |
| A4 · Alpargatas | Caminando por una vereda; primer plano del sol bordado y de la suela de yute | Producto de temporada con todo el stock |
| A5 · Bermuda | Sentado en un banco o muelle; se abre y se cierra el bolsillo con velcro | Verano |

---

## B · Videos con Veo (Gemini / Flow), si querés generarlos vos

Siempre **imagen a video**: el primer cuadro es una escena ya generada con el producto
real (están en `~/Desktop/piezas-motor/octubre/escenas sin texto/`). Sin primer
cuadro, Veo inventa la prenda. Pedilo en **9:16, 8 segundos**; si la herramienta lo
ofrece, calidad **1080p** (los de hoy salieron en 720p).

### B1 · Bermuda en el muelle — primer cuadro `bermuda-cazador_9x16_v2.png`
```
Cinematic advertising clip for BLACKS, an Argentine workwear brand. ONE SINGLE CONTINUOUS TAKE, no cuts.
The first frame shows a man in navy cargo bermuda shorts, a white t-shirt and tan canvas espadrilles standing on a wooden jetty on the Paraná Delta. He walks slowly along the jetty toward the camera and stops, one hand going into the side pocket.
CAMERA: waist height, slow smooth pull-back, framing from the chest down. His face never enters the frame.
PRODUCT: the bermuda and espadrilles are EXACTLY the ones in the first frame for the whole clip — same navy colour, cargo pocket with flap, small label, same length. Zero morphing, nothing added.
LIGHT: bright late-spring morning, sparkles on the water, crisp gentle shadows.
AUDIO: water lapping, birds, footsteps on wood. No music, no voice.
No on-screen text, no logos.
```

### B2 · Cargo slim en la bicicletería — primer cuadro `cargo-slim_9x16_v1.png`
```
Cinematic advertising clip for BLACKS, an Argentine workwear brand. ONE SINGLE CONTINUOUS TAKE, no cuts.
The first frame shows a man kneeling on one knee beside a bicycle in front of a small Buenos Aires bike shop, wearing navy slim-fit stretch cargo trousers. He finishes adjusting the chain, stands up in one fluid movement and wipes his hands; the stretch fabric follows the knee naturally.
CAMERA: static, low angle at knee height. Keep the face turned away or out of frame.
PRODUCT: the trousers are EXACTLY the ones in the first frame — same navy colour, cargo pocket with button flap, small yellow label, back flap pocket. Zero morphing, nothing added.
LIGHT: spring morning, dappled shade from a plane tree.
AUDIO: street ambience, a bicycle freewheel ticking. No music, no voice.
No on-screen text, no logos.
```

### B3 · Alpargatas en la vereda — primero generá la imagen C1 y usala de primer cuadro
```
Cinematic advertising clip for BLACKS, an Argentine workwear brand. ONE SINGLE CONTINUOUS TAKE, no cuts.
The first frame shows a man's feet in off-white canvas espadrilles with a golden embroidered sun on the side, walking on a sunny small-town sidewalk. He walks past the camera at a relaxed pace; the camera follows the feet at ankle height.
PRODUCT: the espadrilles are EXACTLY the ones in the first frame — off-white canvas, golden embroidered sun, small light-blue and white flag label, jute sole. Zero morphing, nothing added.
LIGHT: warm spring afternoon, long soft shadows.
AUDIO: footsteps, distant birds and a passing bicycle bell. No music, no voice.
No on-screen text, no logos.
```

---

## C · Imágenes (Gemini, "Nano Banana Pro")

Pegá **primero el bloque de blindaje** (está en `anuncios/2026-10/prompt-blindaje.txt`,
es el mismo de `PROMPTS_PRIMAVERA_26.md` pero para varias prendas) y abajo la escena.
Adjuntá 2-4 fotos reales de Tiendanube de cada producto (una de cuerpo entero y una de
detalle). Generá **9:16** y **4:5** por separado; en la app, si no aparece 4:5, usá
3:4 y yo lo recorto.

### C1 · Alpargatas en la vereda (sirve de primer cuadro para B3)
Fotos: alpargata crudo de costado + detalle del sol.
```
SCENE: A man's feet and lower legs walking on a sunny sidewalk of a small Argentine town in spring: off-white canvas espadrilles from the references — golden embroidered sun on the outer side facing the camera, small light-blue and white flag label, jute sole — with dark indigo straight jeans. Low camera at ankle height, one foot stepping forward, the other lifting. Background: whitewashed house fronts and a tree casting soft shadows, out of focus.
FRAMING: ONE single continuous photograph taken with one camera in one shot — never a collage, never stacked or split panels, no borders.
```

### C2 · El jean en cinco colores
Fotos: una de cada color (Claro, Medio, Estático, Negro, Azul oscuro).
```
SCENE: The five straight-cut jeans from the references, folded neatly and stacked, seen from a three-quarter angle on a weathered wooden workbench in a sunlit workshop. From top to bottom: light blue, medium blue, static indigo, dark blue, black. The leather back patch of the top one visible. Soft window light from the left, warm tones.
FRAMING: ONE single continuous photograph — never a collage, no borders.
```
Texto que va arriba: **"CINCO COLORES · DEL 40 AL 54"**.

### C3 · Look de verano: bermuda + alpargatas
Fotos: bermuda beige o azul de frente + alpargata tostado.
```
SCENE: Flat lay seen straight from above on sun-bleached wooden deck boards: the cargo bermuda shorts from the references, neatly folded, and the tan canvas espadrilles beside them, a pair of sunglasses as the only prop. Hard late-morning summer sun with crisp shadows, warm bright palette.
FRAMING: ONE single continuous photograph — never a collage, no borders.
```
Ojo: bermuda ($26.999) + alpargatas ($24.999) = **$51.998**, pasa el envío gratis. Pero
no hay categoría de la tienda que tenga a las dos: antes de publicarla hay que decidir a
qué página lleva.

### C4 · Jean + remera ($36.999 + $17.999 = $54.998, envío gratis) → lleva a `/urbano/`, que tiene los dos
Fotos: remera azul marino de frente (la de más stock: L, XL y XXL) + jean claro de cuerpo entero.
```
SCENE: A man leaning with one shoulder against a sun-warmed colourful plaster wall on a quiet cobblestone street of San Telmo, Buenos Aires, on a spring afternoon. He wears the navy blue crew-neck cotton t-shirt from the references (untucked, short sleeves, rib collar) and the light-blue straight-cut jeans from the references, with plain white sneakers. One thumb hooked in the front pocket of the jeans, relaxed, natural stance. Framed from the chin down to the feet: his face is NOT in the frame. Background: the pastel wall, an old wooden door and a wrought-iron balcony softly out of focus. Warm natural afternoon light from the left, soft shadows. The jersey knit of the t-shirt and the denim texture and stitching must stay clearly readable.
FRAMING: ONE single continuous photograph taken with one camera in one shot — never a collage, never stacked or split panels, no borders.
```
Lo intenté generar el 28-sep y la cuenta de Gemini estaba **sin saldo**: queda para cuando se cargue.
Mientras tanto la remera sale sola, con las cuatro fotos reales de la tienda (anuncio 17).

### C5-C7 · Repetir el formato ganador (agregado el 1-oct)
Del 28-sep al 1-oct, **"22 · Jean en 5 Colores" se llevó el 60% del gasto con 3,9% de clics
y 3 compras**: la pila de la misma prenda en todos sus colores funciona. Mismo bloque de
blindaje, misma escena de taller, sólo cambia la prenda. Usá **sólo colores con stock**
(revisados el 1-oct; verificalos el día que generes).

**C5 · Cargo slim en tres colores** — fotos: beige, negro y azul (de cuerpo entero + detalle del bolsillo).
```
SCENE: The three slim-fit stretch cargo trousers from the references, folded neatly and stacked, seen from a three-quarter angle on a weathered wooden workbench in a sunlit workshop. From top to bottom: beige, navy blue, black. The side cargo pocket with its flap visible on the top one. Soft window light from the left, warm tones.
FRAMING: ONE single continuous photograph — never a collage, no borders.
```
Texto que va arriba: **"CARGO SLIM EN 3 COLORES"** + pastilla **$58.999**.

**C6 · Remera lisa en cuatro colores** — fotos: negro, blanco, azul y gris (una de frente de cada una).
```
SCENE: The four plain crew-neck cotton t-shirts from the references, folded neatly and stacked, seen from a three-quarter angle on a weathered wooden workbench in a sunlit workshop. From top to bottom: white, heather grey, navy blue, black. The rib collar of the top one visible. Soft window light from the left, warm tones.
FRAMING: ONE single continuous photograph — never a collage, no borders.
```
Texto que va arriba: **"REMERA LISA · 4 COLORES"** + pastilla **$17.999**.

**C7 · Alpargatas en tres colores** — fotos: tostado, crudo y jean (de costado, con el sol bordado).
```
SCENE: Three pairs of canvas espadrilles from the references lined up side by side on a weathered wooden workbench in a sunlit workshop, seen from a low three-quarter angle: tan, off-white and dark denim. The golden embroidered sun on the outer side and the jute soles clearly visible. Soft window light from the left, warm tones.
FRAMING: ONE single continuous photograph — never a collage, no borders.
```
Texto que va arriba: **"ALPARGATAS RUEDA · 3 COLORES"** + pastilla **$24.999**.

---

## D · Textos base (verificar precios el día que se publica)

| Pieza | Título | Texto feed | Texto historias/reels |
|---|---|---|---|
| Alpargatas | Alpargatas Rueda — $24.999 | Lona y suela de yute natural, con el sol bordado y la bandera. Del 4 al 12, en tres colores. Hasta 6 cuotas sin interés. | Alpargatas de lona y yute con el sol bordado: $24.999. |
| Jean 5 colores | Jean Vaquero Clásico — $36.999 | Cinco colores y todos los talles del 40 al 54. 100% algodón, hecho en Argentina. 24% OFF y hasta 6 cuotas. | Cinco colores, del 40 al 54: $36.999. |
| Bermuda + alpargatas | Bermuda + alpargatas: $51.998 | El look del verano: bermuda cargo de gabardina 100% algodón + alpargatas de yute. Juntas pasan los $45.000 y el envío es gratis. | Bermuda + alpargatas con envío gratis. |

## Cómo me los pasás

Dejalos en `~/Desktop/piezas-motor/octubre/nuevas/` y decime "subilas". Yo les pongo el
texto (`scripts/piezas-overlay-anuncios.py` / `scripts/video-anuncio.py`), los sumo al
manifiesto de precios y los subo con `scripts/subir-anuncios.js`.
