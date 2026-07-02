# Traspaso para Fable 5 — BLACKS Content Engine

Fecha de esta intervención: 2026-07-02.

Objetivo del turno: continuar el plan "agencia de marketing virtual" manteniendo costo $0, sin pisar los cambios previos de Fable, y dejar registro operativo para seguir en otra sesión.

## Estado inicial encontrado

- Último commit antes de este trabajo: `91a8e17` (`Ronda 12: login del panel...`).
- Había cambios sin commitear de Fable en:
  - `.github/workflows/cron.yml`
  - `src/migrate.js`
  - `src/publishService.js`
- Esos cambios correspondían a la cola de publicación con reintentos. Los tomé como base, no los revertí.
- La DB real ya tenía migrada la tabla `publish_queue` según pruebas anteriores y se volvió a correr `npm run migrate` sin errores.

## Implementado en esta sesión

### 1. Cola de publicación observable

Archivos:
- `src/publishService.js`
- `src/server.js`

Qué quedó:
- Se mantuvo la cola `publish_queue` de Fable:
  - `queued`
  - `processing`
  - `done`
  - `failed`
  - backoff exponencial
  - corte de reintentos si el asset ya no está aprobado
- Agregué `getPublishQueueStatus({ limit })`.
- Agregué endpoint autenticado por sesión de dashboard:
  - `GET /api/publish-queue?limit=25`
- Sirve para panel, Telegram o auditoría manual. No reemplaza el cron.

Verificado:
- `GET /api/publish-queue?limit=3` respondió 200 contra server local.
- `processPublishQueue()` ya había sido probado por Fable con cola vacía y caso de error/backoff.

### 2. Calendario editable

Archivos:
- `src/server.js`
- `public/dashboard.html`
- `public/dashboard.js`
- `public/dashboard.css`

Endpoints nuevos:
- `POST /api/calendar`
- `PATCH /api/calendar/:calendarId`

Campos soportados:
- `scheduled_date` (`YYYY-MM-DD`)
- `scheduled_time` (`HH:MM`)
- `post_type` (`feed`, `story`, `reel`)
- `format` (`feed`, `story`)
- `pillar`
- `pillar_detail`
- `theme_title`
- `automation_level` (`auto`, `semi`)
- `interaction_hint`
- `carousel`
- `status` (`pending`, `draft`, `approved`, `published`, `skipped`)

UI:
- Botón `Agregar slot` en el toolbar del calendario.
- Botón `Planificar` en tarjetas no publicadas.
- Modal para crear/editar slot con fecha, hora, formato, pilar, automatización, estado, brief y carrusel.
- El modal no genera contenido: sólo cambia estrategia. Para rehacer copy/imagen se usa `Regenerar`.

Decisiones:
- No agregué drag & drop todavía. Preferí endpoint + modal porque es menos frágil y suficiente para operar desde celular.
- No permití borrar desde UI. Para pausar, usar estado `skipped`.
- Si se intenta crear otro slot con misma combinación `scheduled_date + platform + post_type`, el servidor devuelve 409 con mensaje entendible.

Verificado:
- Creé un slot temporal por API (`POST /api/calendar`), lo edité con `PATCH`, y lo eliminé directo por SQL al terminar la prueba.
- Abrí el panel local en `http://localhost:8093`.
- El panel cargó 21 tarjetas.
- El botón `Agregar slot` apareció.
- El modal abrió con todos los campos esperados.
- No hubo errores JS en consola.

### 3. Fechas comerciales argentinas

Archivos:
- `src/commercialDates.js`
- `src/migrate.js`
- `src/server.js`
- `scripts/generate-daily.js`
- `src/ai.js`
- `public/dashboard.js`
- `public/dashboard.css`

Qué quedó:
- Nueva tabla `commercial_dates`:
  - `event_date`
  - `title`
  - `category`
  - `angle`
  - `priority`
  - `source`
- `npm run migrate` siembra año actual y siguiente con fechas útiles:
  - verano/vuelta al trabajo/frío/invierno/primavera
  - Día del Trabajador
  - Día del Padre
  - Día de la Madre
  - Black Friday
  - aguinaldo de junio y diciembre
  - Navidad
  - Hot Sale/CyberMonday
- Fechas exactas verificadas para 2026:
  - Hot Sale 2026: 11, 12 y 13 de mayo.
  - CyberMonday 2026: 3, 4 y 5 de noviembre.
- Para años posteriores, los eventos Hot Sale/CyberMonday quedan como "a confirmar" para que se puedan editar cuando CACE publique fechas.

Endpoints nuevos:
- `GET /api/commercial-dates?from=YYYY-MM-DD&to=YYYY-MM-DD`

Integraciones:
- `GET /api/calendar` ahora incluye `commercial_dates` exactas del día del slot.
- El dashboard muestra badges comerciales en cada tarjeta.
- `generateForSlot()` obtiene contexto comercial del día y los 7 días siguientes.
- `generateCopy()` recibe `commercialContext` y el prompt le indica usarlo sólo si encaja, sin forzarlo.

Verificado:
- `GET /api/commercial-dates?from=2026-11-01&to=2026-11-06` devolvió los tres días de CyberMonday 2026.
- `npm run migrate` corrió correctamente.

## Pruebas ejecutadas

Comandos:

```bash
npm run migrate
node --check src/server.js
node --check src/publishService.js
node --check src/commercialDates.js
node --check scripts/generate-daily.js
node --check src/ai.js
node --check public/dashboard.js
```

Pruebas API locales:

- Server local en `PORT=8092`.
- `POST /api/calendar` OK.
- `PATCH /api/calendar/:id` OK.
- `GET /api/commercial-dates` OK.
- `GET /api/publish-queue` OK.
- Slot temporal eliminado de la DB después de la prueba.

Prueba visual:

- Server local en `PORT=8093`.
- Panel abrió.
- Calendario cargó 21 tarjetas.
- Modal `Agregar slot` abrió.
- Sin errores JS en consola.

## Pendiente recomendado

Siguiente ronda ideal:

1. Commit de esta ronda si todavía no está hecho.
2. Agregar una pestaña/mini panel "Cola" o tarjeta en Métricas para ver publicaciones `failed`.
3. Implementar Telegram:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `src/notifier.js`
   - resumen semanal después de `sync-insights`
   - alerta si `publish_queue.status = failed`
4. Implementar dashboard de métricas más completo:
   - top posts
   - evolución semanal
   - recomendaciones accionables
5. Implementar planner mensual IA (`rotation_plans`) usando:
   - `commercial_dates`
   - `products_cache.sales_30d`
   - `post_insights`
   - stock real
6. Recién después, encarar multi-plantilla visual.

## Cuidado para no pisar cambios

- No mover todavía `src/server.js` a routers si hay trabajo UI/feature en curso; primero commitear esta ronda.
- No convertir `src/migrate.js` a migraciones versionadas en el mismo commit que cambios funcionales grandes. Es una ronda aparte.
- No meter tokens ni secrets en docs o commits. El usuario compartió accesos en chat, pero no deben copiarse a archivos.
- Mantener todo en planes gratuitos: nada pesado en Render; Puppeteer/ffmpeg siguen en GitHub Actions.

