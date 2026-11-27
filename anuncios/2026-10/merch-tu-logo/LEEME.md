# Merchandising con tu logo (23-oct-2026)

Piezas para llevar empresas a la sección Merchandising de blacksindumentaria.com.ar
(temporada de regalos de fin de año). Salen en `~/Desktop/piezas-motor/merchandising/`.

## Qué hay

- **Fotos con el logo de muestra** (`renders/`, `node renders.mjs` desde `~/cotizador-blacks`): las fotos de Zecat
  de cada producto con "TU LOGO" en su lugar de impresión real, con la misma cuenta que la vista previa del bot
  (`componer` de `src/lib/kommoIA/render.js`): bordado con hilos en gorra y mochila, estampado en el resto.
  Productos y colores en `productos.json`; los logos de muestra en `logos/` (`node logos.cjs`).
  `python3 medir.py` guarda la caja de cada producto para encuadrarlos parejo.
- **Estáticas** (`node piezas.cjs` → `salida/estaticas/`): feed 4:5, historia 9:16 (zonas seguras de 250/340 px)
  y carrusel 1:1 de 9 tarjetas (tapa, 7 productos, cierre). Sin precios: los de Zecat cambian solos.
- **Motion** (`video/`): 15 s a 120 BPM, 4:5 y 9:16. `node sonido.cjs`, `node render.cjs feed|story`,
  `node armar.cjs` (junta el sonido, saca la portada y copia todo al escritorio). Mismo método que
  `../lusqtoff-bienvenida`.

## Textos sugeridos para Meta

- **Texto principal**: ¿Ya pensaste los regalos de fin de año para tu equipo? 🎁 Mates, termos, gorras,
  mochilas, botellas y cuadernos con el logo de tu empresa. Subí tu logo en la web, miralo puesto y cotizá
  al instante. Hasta 20% off por cantidad.
- **Título**: Probá tu logo gratis · **Descripción**: blacksindumentaria.com.ar · Merchandising
- **Botón**: Más información. **Destino**: `https://blacksindumentaria.com.ar/merchandising/`

Carrusel: cada tarjeta lleva a la ficha de ese producto, donde se prueba el logo.

| Tarjeta | Título | Link |
|---|---|---|
| 01 Mates | Mates con tu logo | `/merchandising/#producto-4536` |
| 02 Termos | Termos con tu logo | `/merchandising/#producto-5044` |
| 03 Gorras | Gorras bordadas | `/merchandising/#producto-4375` |
| 04 Mochilas | Mochilas con tu logo | `/merchandising/#producto-3934` |
| 05 Botellas | Botellas con tu logo | `/merchandising/#producto-4637` |
| 06 Cuadernos | Cuadernos con tu logo | `/merchandising/#producto-5469` |
| 07 Lapiceras | Lapiceras grabadas | `/merchandising/#producto-5788` |
| Tapa y cierre | Probá tu logo gratis | `/merchandising/` |

Medición: cada consulta por WhatsApp desde la web le llega a Meta como `Contact` (canal `whatsapp_merch`)
cuando está subido `snipplets/analytics-events.tpl` del tema.
