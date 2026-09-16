# Renovación del calendario social — 16/09/2026

## Objetivo

Reducir la cantidad de controles visibles, dar prioridad al trabajo diario y sumar una lectura editorial que ayude a evitar semanas repetitivas antes de generar contenido.

## Punto de restauración

- Estado anterior: commit `37edee8`.
- Rama de respaldo: `codex/backup-calendar-refresh-20260916`.
- Rama de trabajo: `codex/calendar-ux-refresh`.

Para volver exactamente al estado anterior se puede desplegar el commit o la rama de respaldo. No se modificaron tablas, migraciones ni datos existentes.

## Cambios aplicados

### Cabecera y creación

- Nueva cabecera de “Calendario de contenido” con jerarquía visual alineada al Estudio.
- Las vistas Lista, Calendario y Perfil permanecen siempre accesibles.
- “Generar hoy” conserva prioridad y sigue mostrando el costo estimado.
- “Desde una idea”, “Planificar una pieza” y “Plan del mes con IA” se agruparon en **Nueva**.
- Actualizar calendario y actualizar borradores anteriores se agruparon en el menú de opciones.

### Pulso editorial

- Analiza localmente los próximos siete días, sin consumir IA.
- Resume cantidad de piezas, pilares, formatos y piezas listas.
- Advierte cuando domina demasiado un pilar, cuando sólo se usa un formato o cuando la semana está muy liviana.
- Permite filtrar de un toque las piezas pendientes de generación.

### Bandeja y filtros

- Estados diarios convertidos en tarjetas de acción: Para aprobar, Con alerta, Sin generar y Programadas.
- Búsqueda, Estado y Formato quedan como controles principales.
- Período, Pilar, Publicación y Audiencia pasan a **Más filtros**.
- Se agregó una acción clara para limpiar filtros activos.

### Acciones de cada pieza

- Cada estado muestra solamente las acciones principales.
- Regenerar, planificar, descargar, descartar y utilidades de video quedan disponibles en **Más**.
- No se eliminaron acciones ni se cambió el flujo de aprobación/publicación.

### Adaptación móvil

- Cabecera operativa apilada y botones con área táctil completa.
- Menús convertidos en paneles inferiores para evitar que salgan de pantalla.
- Filtros y resumen editorial reorganizados sin desplazamiento horizontal.

## Validación realizada

- `node --check public/dashboard.js`
- `git diff --check`
- Carga local contra la base configurada y `/api/health` correcto.
- Prueba automatizada de Lista, Calendario, Perfil, menú Nueva, Más filtros y menú Más de una pieza.
- Capturas en 1600 px y 390 px de ancho.
- No se dispararon generaciones ni publicaciones durante la validación.

