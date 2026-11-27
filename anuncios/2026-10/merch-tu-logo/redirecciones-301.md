# Redirecciones 301: fichas viejas de merch → sección nueva

Armado el 27-oct-2026. Cada destino se probó contra la búsqueda de la sección nueva y trae productos de Zecat.
Se carga en el admin de Tiendanube: **Configuración → Redireccionamientos 301**. Los dos campos van sin el dominio y empiezan con `/`.

**No se redirige** `/productos/pelota-antiestres-personalizada/`: Zecat no tiene pelotas antiestrés y la búsqueda quedaría vacía.

## Orden para cargarlas

1. Probá primero con una sola, por ejemplo la del paraguas.
2. Despublicá ese producto en Tiendanube. Según la ayuda de Tiendanube, la "Vieja URL" tiene que ser una dirección que ya no funciona; con la ficha publicada, la tienda puede seguir mostrándola.
3. Cargá la redirección y abrí la URL vieja en el navegador. Tiene que llevarte a `/merchandising/?buscar=paraguas` con los paraguas a la vista.
4. Si Tiendanube no acepta el `?buscar=…` en "Nueva URL", usá `/merchandising/` en todas.
5. Con la prueba bien, seguí con el resto.

## Productos (32)

| # | Vieja URL | Nueva URL | Visitas en 30 días |
|---|---|---|---|
| 1 | `/productos/paraguas-personalizado/` | `/merchandising/?buscar=paraguas` | 39 |
| 2 | `/productos/vasos-termicos-personalizados/` | `/merchandising/?buscar=vaso` | 48 |
| 3 | `/productos/gorras-personalizadas/` | `/merchandising/?buscar=gorra` | 47 |
| 4 | `/productos/mochilas-personalizadas/` | `/merchandising/?buscar=mochila` | 31 |
| 5 | `/productos/gorra-gabardina-personalizada/` | `/merchandising/?buscar=gabardina` | 20 |
| 6 | `/productos/gorra-snapback-personalizada/` | `/merchandising/?buscar=gorra` | 18 |
| 7 | `/productos/gorra-trucker-personalizada/` | `/merchandising/?buscar=trucker` | 17 |
| 8 | `/productos/gorras-pampero-personalizadas/` | `/merchandising/?buscar=gorro+pampero` | 17 |
| 9 | `/productos/botellas-personalizadas/` | `/merchandising/?buscar=botella` | 16 |
| 10 | `/productos/bolso-viaje-personalizado/` | `/merchandising/?buscar=bolso` | 9 |
| 11 | `/productos/gorro-lana-personalizado/` | `/merchandising/` | 8 |
| 12 | `/productos/auriculares-bluetooth-personalizados/` | `/merchandising/?buscar=auricular` | 7 |
| 13 | `/productos/termos-personalizados/` | `/merchandising/?buscar=termo` | 6 |
| 14 | `/productos/mochilas-saco-personalizadas/` | `/merchandising/?buscar=mochila` | 3 |
| 15 | `/productos/set-vino-personalizado/` | `/merchandising/?buscar=vino` | 3 |
| 16 | `/productos/bolsas-personalizadas/` | `/merchandising/?buscar=bolsa` | 2 |
| 17 | `/productos/mochilas-pampero-personalizadas/` | `/merchandising/?buscar=mochila+pampero` | 2 |
| 18 | `/productos/vasos-termicos-pampero-personalizados/` | `/merchandising/?buscar=jarro+pampero` | 2 |
| 19 | `/productos/cargador-portatil-personalizado/` | `/merchandising/?buscar=power+bank` | 1 |
| 20 | `/productos/materas-personalizadas/` | `/merchandising/?buscar=matera` | 1 |
| 21 | `/productos/mates-eco-cuero-personalizados/` | `/merchandising/?buscar=mate` | 1 |
| 22 | `/productos/parlante-bluetooth-personalizado/` | `/merchandising/?buscar=parlante` | 1 |
| 23 | `/productos/mates-personalizados/` | `/merchandising/?buscar=mate` | 0 |
| 24 | `/productos/tazas-personalizadas/` | `/merchandising/?buscar=taza` | 0 |
| 25 | `/productos/llaveros-personalizados/` | `/merchandising/?buscar=llavero` | 0 |
| 26 | `/productos/mousepad-personalizados/` | `/merchandising/?buscar=mousepad` | 0 |
| 27 | `/productos/boligrafos-personalizados/` | `/merchandising/?buscar=boligrafo` | 0 |
| 28 | `/productos/cuadernos-personalizados/` | `/merchandising/?buscar=cuaderno` | 0 |
| 29 | `/productos/auriculares-personalizados/` | `/merchandising/?buscar=auricular` | 0 |
| 30 | `/productos/termos-pampero-personalizados1/` | `/merchandising/?buscar=termo+pampero` | 0 |
| 31 | `/productos/materas-pampero-personalizadas/` | `/merchandising/?buscar=pampero` | 0 |
| 32 | `/productos/mates-pampero-personalizados/` | `/merchandising/?buscar=mate+pampero` | 0 |

Notas:
- **Gorro de lana (11)** va a la portada de la sección: Zecat no tiene gorros de lana. Si buscás "gorra", sólo salen gorras con visera.
- **Gorra Pampero (8)** trae un solo resultado (Gorro Santa Fe Mesh). Si querés mostrar toda la línea Pampero, poné `/merchandising/?buscar=pampero`.
- Las de 0 visitas no son urgentes, pero conviene cargarlas igual: Google todavía las tiene indexadas.

## Subcategorías viejas (opcional)

`/mayorista/merchandising/` ya muestra el catálogo nuevo: **esa no se toca**. Las subcategorías siguen vivas, pero tienen pocas visitas. Para redirigirlas hay que ocultarlas primero.

| Vieja URL | Nueva URL | Visitas en 30 días |
|---|---|---|
| `/mayorista/merchandising/mates/` | `/merchandising/?buscar=mate` | 17 |
| `/mayorista/merchandising/botellas/` | `/merchandising/?buscar=botella` | 7 |
| `/mayorista/merchandising/gorros/` | `/merchandising/?buscar=gorra` | 7 |
| `/mayorista/merchandising/mochilas/` | `/merchandising/?buscar=mochila` | 3 |
| `/mayorista/merchandising/insumos/` | `/merchandising/` | — |

Fuera de la lista a propósito: las gorras de EPP (textil ignífuga y polar), que también están en Merchandising pero son productos de seguridad, y `/merchandising-empresarial/`.
