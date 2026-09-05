# Bloques de contenido del home

Secciones que armás vos desde el panel — portadas con foto o video, informativos,
editoriales, preguntas frecuentes — con **vista previa real en celular y en
escritorio antes de publicar**.

Reemplazan a los ocho "layouts modernos" que estaban en el theme (Hero Split,
Magazine, Parallax Slider…), que sólo sabían mostrar productos y no aceptaban ni
una foto propia.

---

## Cómo se usa, la primera vez

1. **En el panel de diseño de Tiendanube** (Mi tienda → Diseño → Página de
   inicio), arrastrá los huecos **"◆ Bloque de contenido 1"** a **"6"** al lugar
   de la página donde querés que aparezcan. Esto se hace **una sola vez**: son
   posiciones vacías, no contenido.
2. **En este panel** (Home de la tienda → Bloques de contenido), tocá
   *Agregar bloque*, elegí el tipo, completá y **Publicar en la tienda**.

El orden de la lista del panel decide qué hueco ocupa cada bloque: el primero de
la lista va al "◆ Bloque 1", el segundo al "◆ Bloque 2", y así.

> **Por qué está partido en dos lugares:** el panel de diseño de Tiendanube no
> tiene API. Nadie puede leer ni cambiar desde afuera en qué orden están las
> secciones del home. Por eso el *lugar* se elige allá una vez, y el *contenido*
> se cambia todas las veces que quieras desde acá, sin tocar el theme.

## Los nueve tipos

| Tipo | Para qué |
|---|---|
| **Portada** | Foto o video a todo lo ancho con título grande y botones. El de más impacto. |
| **Imagen y texto** | Explicar algo: una norma, un material, por qué conviene una línea. |
| **Tira de atributos** | Factura A, envío, talles, certificación. Las razones para comprar acá. |
| **Editorial** | Una foto grande y dos chicas, cada una a su categoría. Aire de revista. |
| **Video** | Video solo o con texto al costado. Carga liviana. |
| **Productos elegidos** | Hasta seis productos con precio y stock reales del catálogo. |
| **Cinta de texto** | Franja con frases que se desplazan. Corta entre dos secciones pesadas. |
| **Preguntas frecuentes** | Las dudas que hoy llegan por WhatsApp. |
| **¿Qué necesitás?** | Tarjetas por rubro (obra, industria, gastronomía…) a su categoría. |

Cada tipo trae **textos sugeridos** escritos para esta tienda: se cargan con un
clic y después los editás.

## Videos: qué hace cada opción

- **Arrancar solo** — sólo aplica al MP4 propio y siempre **sin sonido**: es lo
  único que dejan los navegadores. El video arranca cuando el bloque entra en
  pantalla y se pausa cuando sale.
- No arranca solo, y en su lugar se ve la foto con un botón de play, si el
  visitante tiene **datos limitados**, está en 2G, o pidió **reducir el
  movimiento** en su teléfono.
- **YouTube y Vimeo** nunca cargan de entrada: se muestra la foto de portada y el
  reproductor recién se crea al tocar play. Un embed de YouTube pesa ~800 KB; la
  foto, 40. Con diez visitas que no lo tocan, son 8 MB que no se bajan.
- Para un video de fondo, **hasta 10 MB**. Arriba de eso el panel avisa.

## Fotos

- Cargá una **foto de celular** aparte siempre que puedas: encuadra mejor y pesa
  menos. La mayoría de las visitas de la tienda son de celular.
- Todo se sirve con `loading="lazy"` y con la proporción declarada, así la página
  no salta cuando cargan las imágenes.
- Sólo la foto de la **Portada puesta en el Bloque 1** se pide con prioridad, por
  si es lo primero que se ve.

---

## Cómo está hecho (para retomarlo después)

```
src/homeBlocks.js         catálogo de tipos + campos, validación, config, payload
src/homeBlocksRender.js   arma el HTML de cada bloque  ← única fuente
src/homeBlocksAssets.js   CSS + comportamiento (video, acordeón)  ← única fuente
public/home-blocks-panel.js  el panel: arma los formularios solo desde los campos
scripts/export-theme-blocks.js   copia CSS y JS al theme
```

**El HTML lo arma el motor, no el theme.** Así la vista previa del panel y lo que
ve el cliente salen de la misma función: si el theme lo armara por su cuenta
habría dos implementaciones para mantener iguales y la previa mentiría.

**El CSS va embebido en el theme, no se baja de Render.** Si el motor está
dormido (plan gratis), el home tiene que pintar igual. Por eso
`snipplets/home/home-content-blocks-assets.tpl` **es un archivo generado**: se
escribe con `npm run export:theme` y no se edita a mano — el próximo export lo
pisa y además la previa del panel deja de coincidir.

```bash
npm run export:theme            # escribe en ../tiendanube-tpl
npm run export:theme -- <ruta>  # otra copia del theme
```

El export aborta si el CSS o el JS traen un `{{`, un `{%` o un `{#`: Twig los
tomaría como código y rompería el home en silencio.

### Endpoints

| Método | Ruta | Quién |
|---|---|---|
| GET | `/api/home/rails` | **La tienda.** Público. Trae rieles + ofertas flash + `blocks` ya renderizados, en **un solo pedido**. |
| GET | `/api/home/products?handles=` | **La tienda.** Público. Foto, nombre y precio para los layouts viejos. |
| GET | `/api/home/blocks` | Panel. Catálogo de tipos + config guardada. |
| POST | `/api/home/blocks/preview` | Panel. Tolerante: un bloque a medio cargar se dibuja igual y lo que falta viaja en `faltantes`. |
| POST | `/api/home/blocks` | Panel. Publicar. **Estricto**: no deja publicar un bloque incompleto. |
| GET | `/api/home/blocks/search?q=` | Panel. Buscador del catálogo. |
| POST | `/api/home/blocks/upload` | Panel. Foto o MP4 → Supabase Storage. |

### Lo que se arregló de paso

Los ocho layouts viejos del theme se bajaban la **página HTML completa de cada
producto** (~175 KB) para sacarle la foto y el precio con `DOMParser`. Medido en
producción, entre esa sección, el lookbook y los carruseles, el home descargaba
**2.095 KB de 2.536 KB (83%)** sólo para eso. Ahora piden todos los handles
juntos a `/api/home/products` y reciben ~2 KB. Quedaron en el panel de diseño
marcados como **"(viejo)"** por si alguno está en uso, pero conviene reemplazarlos
por bloques.

También se sacó un mensaje interno que veía el cliente en la tienda cuando una de
esas secciones estaba sin configurar ("Falta configurar productos… en el panel de
diseño"): ahora la sección simplemente no se muestra.

### Límites conocidos

- Los bloques se dibujan con JavaScript, después de que carga la página. Google
  los indexa igual (ejecuta JS), pero para texto que tenga que posicionar en
  buscadores conviene una página propia, no un bloque del home.
- **La primera visita** de cada sesión mueve un poco la página cuando llegan los
  bloques. De la segunda en adelante no: quedan en la caché de la sesión y se
  pintan en el mismo parseo.
- Si el motor no contesta en 8 segundos, los bloques no se muestran y el resto
  del home anda igual.
