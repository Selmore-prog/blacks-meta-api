# Piezas — Campaña Primavera 26 (Meta)

Prompts para las 4 piezas del conjunto `01 · Prospecting amplio · Iniciar pago`.

## Método: FOTO REAL ambientada, no imagen generada

Mismo criterio que `PROMPTS_FOTO_REAL.md`: se sube **la foto real del producto** y la IA
sólo genera el entorno. Las 6 piezas viejas de la campaña Motor eran 100% generadas y el
pantalón de la imagen no era el Pampero — alguien hace clic esperando esa prenda y ve otra.
En ropa de trabajo, que se compra por el bolsillo y la costura, eso cuesta conversión.

La herramienta tiene que aceptar **imagen de referencia** (imagen a imagen). Con texto a
imagen no sirve: reinventa el producto.

## Medidas

| Formato | Ratio | Píxeles | Dónde |
|---|---|---|---|
| Feed cuadrado | **1:1** | 1080×1080 | Feed de FB e IG |
| Feed vertical | **4:5** | 1080×1350 | El que mejor rinde en feed |
| Stories / Reels | **9:16** | 1080×1920 | Stories, Reels, Explorar |

⚠️ **El ratio se elige en la herramienta, NO se escribe en el prompt.** Los modelos de
imagen de Gemini ignoran el ratio escrito dentro del texto (por eso los banners volvían
con cualquier forma hasta sep-2026). 1:1 y 9:16 son ratios nativos. **4:5 no lo es**:
generá en **3:4** y recortá arriba y abajo hasta 1080×1350.

Mínimo por pieza: **1:1 + 9:16**. Si podés, sumá la 4:5.

---

## BLOQUE DE BLINDAJE — va siempre primero, sin tocar

```
Use the garment in the reference image EXACTLY as it is. This is a real product
photograph and the garment must be preserved pixel-faithfully.

Do NOT redesign, recolor, restyle or "improve" anything. Preserve exactly: the fabric
colour and texture, the weave, every pocket and its position and shape, all seams and
stitching lines and their thread colour, rivets, buttons, zips, belt loops, cuffs, hems,
labels, logos and any print. Do not add pockets, stripes, panels, logos or details that
are not in the reference. Do not change the cut, the fit or the proportions.

Only generate the environment, the lighting and the atmosphere around the garment.
Relight it so it sits naturally in the new scene, matching the direction, colour
temperature and softness of the scene's light, and cast a physically correct contact
shadow — but without altering the garment itself.

Photorealistic result.
No text, no letters, no numbers, no captions, no watermarks.
No logos and no invented brand marks of any kind.
No plastic or waxy skin, no airbrushed retouching.
No oversaturated colours, no HDR glow.
No perfect symmetry, no studio catalogue pose, no stock-photo smile.
No rendered, CGI or 3D look, no illustration.
```

> Las prohibiciones van **una por una y siempre**. Hasta sep-2026 eran un párrafo único
> que se agregaba sólo si el prompt no decía ya "no text" — y como el prompt de banners
> arrancaba con "no text", se salteaba el negativo entero.

---

# PIEZA 1 · Jean Vaquero Clásico Recto — $32.999

**El mejor producto del catálogo para publicitar hoy:** 39 de 40 talles con stock,
**269 unidades**, vendió $1.450.824 en 90 días y **viene subiendo** ($350.991 → $539.984
en los últimos 30 días, 16 unidades).

- Ficha: `/productos/pantalones-jean-vaquero-clasico-recto-original/`
- Colores con stock: Claro, Medio, Estático, Negro, Azul oscuro
- Talles con stock: 40 al 54 (los ocho)
- **Foto a subir:** la del jean Claro de cuerpo entero (tiene 18 fotos, elegí la de fondo limpio)

### Escena (pegar debajo del blindaje)

```
Place it in a sunlit suburban backyard in Buenos Aires in early spring, late morning.
Young grass, a low brick wall and a jasmine in bloom softly out of focus behind it. Clean
high-key daylight, light coming from the upper right, gentle shadows. Fresh, bright,
optimistic palette with plenty of green and warm brick tones. Shallow depth of field.
The denim texture and the stitching must stay clearly readable.
```

### Copy

- **Titular:** `El jean de trabajo que no se rinde`
- **Texto primario:** `Corte clásico recto, algodón resistente. Del 40 al 54, cinco colores y todos los talles disponibles. Hasta 6 cuotas sin interés y 10% OFF pagando por transferencia.`
- **Descripción:** `Envío gratis a todo el país superando los $45.000`
- **CTA:** Comprar

---

# PIEZA 2 · Chomba Micropique — $24.999

**Lo que más está subiendo:** de $26.299 hace tres meses a **$329.985 en los últimos 30
días** (15 unidades). 20 de 24 variantes con stock, 118 unidades. Es la prenda de primavera
del catálogo.

- Ficha: `/productos/chomba-micropique-pampero/`
- Colores con stock: Gris, Negro, Azul, Blanco
- Talles con stock: S al XXXL (los seis)
- **Foto a subir:** la chomba Azul o Gris sobre persona (tiene 13 fotos)

### Escena

```
Place it at a roadside country bar in the Argentine interior at mid-morning in spring.
Whitewashed wall, an old wooden bench and eucalyptus leaves throwing dappled light. Warm
clean daylight from the left, dappled shade across the background but the garment fully
lit. Relaxed documentary realism, not a fashion shoot. Shallow depth of field. The pique
knit texture must stay clearly readable.
```

### Copy

- **Titular:** `Fresca, con cuello, para todos los días`
- **Texto primario:** `Chomba micropique Pampero: transpira, no se deforma y aguanta el uso diario. Cuatro colores, del S al XXXL. 29% OFF.`
- **Descripción:** `Llevá dos y te llevás el envío gratis`  ← válido desde el 21-sep-2026: 2 × $24.999 = $49.998, supera los $45.000
- **CTA:** Comprar

---

# PIEZA 3 · Cargo Ripstop Antidesgarro — $59.999

**El único que cierra el envío gratis solo.** Sigue siendo el #1 absoluto del catálogo
($2.639.956 en 90 días), aunque viene bajando. 78 unidades, la mitad de los talles.

- Ficha: `/productos/pantalon-cargo-ripstop-antidesgarro-pampero/`
- **Foto a subir:** el cargo Beige o Negro de cuerpo entero
- ⚠️ Antes de lanzar esta pieza, **fijate qué talles quedan**. Con la mitad agotados, el
  anuncio funciona pero la ficha frustra.

### Escena

```
Place it in the open doorway of a rural workshop at mid-morning in spring. Soft daylight
entering from the left, tools on a pegboard and a worn wooden workbench blurred in the
background, dust in the air catching the light. Warm, muted, earthy palette with a hint of
green from outside the door. Shallow depth of field. The ripstop weave grid must stay
clearly visible in the fabric.
```

### Copy

- **Titular:** `Tela ripstop: no se desgarra`
- **Texto primario:** `El cargo que más vendemos. Tejido antidesgarro, bolsillos reforzados, para la obra y para el día a día.`
- **Descripción:** `Envío gratis — este pantalón solo ya supera los $45.000`
- **CTA:** Comprar

---

# PIEZA 4 · La dupla — Jean + Chomba = $57.998

La pieza que resuelve el envío gratis. Los dos productos tienen stock casi completo y
los dos vienen subiendo.

✅ **Resuelto el 21-sep-2026:** el umbral bajó a $45.000 y la chomba pasó a $24.999, así
que la dupla suma **$57.998** y supera el mínimo con holgura. La pieza dice "envío gratis"
y es cierto.

- **Fotos a subir:** las dos fichas, jean Claro + chomba Azul. Si la herramienta acepta
  una sola imagen de referencia, armá primero un collage de las dos fotos reales y subí eso.

### Escena

```
Place both garments laid out together as a flat lay on weathered light wood, seen straight
from above, in clean natural spring daylight from the upper left. The jeans folded on the
left, the polo shirt folded on the right, a leather belt and a pair of sunglasses as small
props in the empty corner. Soft even light, gentle shadows, no harsh contrast. Warm neutral
palette. Both fabric textures must stay clearly readable.
```

### Copy

- **Titular:** `El equipo de primavera`
- **Texto primario:** `Jean clásico recto + chomba micropique. Los dos con todos los talles. Sumá los dos y te llevás el envío gratis a todo el país.`
- **Descripción:** `10% OFF pagando por transferencia`
- **CTA:** Comprar

---

## Qué NO poner en las piezas

Medido sobre ventas reales de los últimos 30 días:

| Producto | Por qué no |
|---|---|
| Buzo Polar Medio Cierre | De $725.978 a $246.442 en tres meses. Prenda de invierno en retirada. |
| **Pack X2 Buzo Polar** | **$0 en los últimos 30 días.** |
| **Campera Polar Pampero** | **$0 en los últimos 30 días.** |
| **Faja Seguridad Lumbar** | **$0 en los últimos 30 días.** |
| Pack X2 Remera Lisa | Sólo 29% de talles con stock. |
| Cualquier cosa de `/combos/` | Es Pack X2 de la misma prenda, no conjuntos. |

## Suplentes, si hacen falta más piezas

- **Pack X2 Chomba Micropique** — $42.999, 18/24 talles, 55 u., subiendo. Con una Remera
  Lisa ($15.999) da $58.998 y cierra el envío gratis.
- **Jean Vaquero Regular Elastizado** — $40.999, 162 u., subiendo. Con una chomba da $62.998.
- **Alpargatas Rueda Yute Clásica** — $24.999, 27/27 talles, **283 unidades**. Muy de
  temporada. Ojo: es `/productos/alpargatas-rueda-yute-clasica-argentina-original-lbbwl/`,
  **no** la "Alpargata Rueda Yute Con Elástico", que está en cero.
- **Camisa Trabajo Pampero** — $31.999, subiendo, pero sólo 8 de 50 variantes con stock.
  Sirve para reponer, no para publicitar.
