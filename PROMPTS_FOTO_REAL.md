# Prompts para ambientar FOTOS REALES con IA

Para cuando le subís a la IA una foto real del producto y sólo querés que le
arme el entorno. El producto no se toca.

## Por qué esto en vez de generar la foto entera

Las 6 piezas de la campaña Motor son 100% generadas: el cargo de la imagen no
es el Pampero, es un cargo genérico. Alguien hace clic esperando ese pantalón y
ve otro. En ropa de trabajo, donde se compra por el bolsillo y la costura, eso
cuesta conversión — y es la razón por la que el anuncio de catálogo, que usa
las fotos reales del feed, suele convertir mejor.

## Cómo usarla

1. Subí la foto real del producto (la mejor que tengas, fondo limpio si se
   puede).
2. Pegá el **bloque de blindaje** tal cual, sin cambiar nada.
3. Pegá abajo **una** de las escenas.
4. Pedí 4:5 (1080×1350). Si sale bien, repetí pidiendo 9:16 (1080×1920).

La herramienta tiene que aceptar imagen de referencia (imagen a imagen). Con
texto a imagen no sirve: vuelve a inventar el producto.

---

## BLOQUE DE BLINDAJE — va siempre, sin tocar

> Use the garment in the reference image EXACTLY as it is. This is a real
> product photograph and the garment must be preserved pixel-faithfully.
>
> Do NOT redesign, recolor, restyle or "improve" anything. Preserve exactly:
> the fabric colour and texture, the weave, every pocket and its position and
> shape, all seams and stitching lines and their thread colour, rivets,
> buttons, zips, belt loops, cuffs, hems, labels, logos and any print.
> Do not add pockets, stripes, panels, logos or details that are not in the
> reference. Do not change the cut, the fit or the proportions.
>
> Only generate the environment, the lighting and the atmosphere around the
> garment. Relight it so it sits naturally in the new scene, matching the
> direction, colour temperature and softness of the scene's light, and cast a
> physically correct contact shadow — but without altering the garment itself.
>
> Photorealistic result. No text, no captions, no watermarks, no added logos.

---

## ESCENAS — elegí una

### 1 · Taller rural, luz de mañana

> Place it in the open doorway of a rural workshop at mid-morning. Soft
> daylight entering from the left, tools on a pegboard and a worn wooden
> workbench blurred in the background, dust in the air catching the light.
> Warm, muted, earthy palette. Shallow depth of field.

### 2 · Camino de tierra al atardecer

> Place it on a dirt road in the Argentine Pampas at golden hour. Dry grass, a
> wire fence and a windmill far out of focus behind it, low warm sun creating
> rim light along the edge of the garment. Documentary realism, not a fashion
> shoot.

### 3 · Estudio oscuro, luz dura

> Place it against a deep charcoal seamless background with a single hard key
> light from the upper left and a subtle cool rim light from the right.
> Dramatic, product-forward, high contrast. The fabric texture must stay
> clearly readable in the shadows.

### 4 · Madera gastada, cenital

> Photograph it from directly above, laid flat on weathered grey barn wood.
> Soft diffused daylight from a large window. Generous empty space around the
> garment. Editorial catalogue style, muted natural palette.

### 5 · Obra en construcción

> Place it on a construction site at the end of the day. Scaffolding, concrete
> and a cement bag out of focus behind it, late afternoon light coming in low
> and slightly hazy. Grounded, working, slightly dusty. Nothing staged.

---

## Qué revisar antes de quedártela

La IA falla siempre en lo mismo cuando ambienta una foto real:

- **El producto cambió.** Comparalo contra la foto original al lado. Si movió
  un bolsillo, cambió un tono o inventó una costura, descartala y regenerá.
  No la corrijas: volvé a tirar el mismo prompt.
- **La sombra no apoya.** Si el producto parece pegado encima del fondo en vez
  de estar apoyado, no sirve. Es lo que más delata el montaje.
- **La luz no coincide.** Si el fondo tiene sol de tarde y el producto está
  iluminado de frente y plano, se nota.
- **Texto inventado.** Cualquier cartel, etiqueta o logo que no estaba: fuera.

## Lo que no hay que pedirle nunca

- Que "mejore" el producto.
- Que le agregue una persona usándolo (ahí ya no es tu producto, es una foto
  generada con todos los problemas de antes).
- Promesas absolutas en el texto que le pongas después: "no se rompe",
  "indestructible", "dura para siempre". En Argentina lo que dice un aviso
  obliga (Ley 24.240). Sí se puede decir "tela ripstop antidesgarro", que es
  el nombre que le pone el fabricante.
