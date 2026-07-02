# PLAN MAESTRO — BLACKS Content Engine → "Agencia de marketing virtual" (100% gratis)

## Estado de implementación al 2026-07-02

Checklist acumulado:

- [x] A2 — Login simple del dashboard con `DASHBOARD_PASSWORD` y cookie firmada. Commit `91a8e17`.
- [x] A5 — `GET /api/cron/has-pending-renders` + job liviano en GitHub Actions para no gastar minutos si no hay videos pendientes. Commit `91a8e17`.
- [x] A4 — Cola `publish_queue` con reintentos, backoff y segunda pasada diaria de publicación. Implementada en la ronda posterior a `91a8e17`.
- [x] A4 extra — `GET /api/publish-queue` para auditar cola/fallos desde panel o notificador.
- [x] B1 parcial — Calendario editable por API y UI mínima: crear slot, editar fecha/hora/pilar/brief/formato/estado/carrusel.
- [x] B3 — Tabla `commercial_dates`, seed de fechas argentinas, badges en calendario e inyección del contexto comercial en el prompt de copy.
- [ ] A1 — Modularizar `src/server.js` en routers.
- [ ] A3 — Migraciones versionadas con `schema_migrations`.
- [ ] B1 pendiente — Vista mensual con drag & drop real y acciones rápidas por celda.
- [ ] B2 — Planner mensual IA (`rotation_plans`) usando métricas, stock, ventas y fechas comerciales.
- [ ] B4 — Campañas coordinadas.
- [ ] C — Multi-plantilla visual y grilla preview.
- [ ] D2/D3 — Historias de refuerzo y mejor horario por datos.
- [ ] E — Dashboard de métricas completo, feedback loop y Telegram.
- [ ] F — Inbox de comentarios y respuestas sugeridas.
- [ ] G — Rediseño del panel con navegación lateral/mobile-first.

Ver también `TRASPASO_FABLE_5.md` para detalle de archivos tocados, pruebas y decisiones de esta sesión.

> **Cómo usar este documento:** dáselo a Claude Opus como prompt inicial y pedile que ejecute
> **una fase por sesión** (o una "ronda" por commit, como se venía trabajando: `git log` muestra
> Ronda 1–11). Cada fase termina con: código funcionando verificado localmente, commit, y una
> nota de qué configurar a mano (secrets, UI de terceros) con pasos concretos.

---

## 1. Contexto: qué existe hoy (no re-descubrir, ya está auditado)

**Stack:** Node 22 + Express (`src/server.js`), Postgres en Supabase (`src/db.js`),
Supabase Storage para assets (`src/storage.js`), Puppeteer para renderizar piezas desde
`templates/post-template.html` (`src/imageRenderer.js`), ffmpeg para Reels y editor de video
con subtítulos Whisper-Groq (`src/videoRenderer.js`, `src/videoEditor.js`, `src/transcribe.js`),
publicación a Instagram vía Meta Graph API (`src/metaPublisher.js`, `src/publishService.js`),
catálogo desde Tiendanube (`src/tiendanube.js`), copy con Gemini 2.5 Flash (gratis) con
fallback a Groq Llama 3.3 (`src/ai.js`), perfil de marca aprendido de fotos/cuenta
(`src/styleService.js`, `src/accountAnalyzer.js`, `src/brandProfile.js`).

**Infra gratuita actual:** Render Free (512 MB — por eso Puppeteer/ffmpeg corren en GitHub
Actions, ver `.github/workflows/cron.yml`), Supabase Free, GitHub Actions como cron,
Gemini free tier, Groq free tier. **Regla de oro: toda propuesta debe seguir siendo $0.**

**Flujo actual:** cron siembra calendario (rotación fija de 14 días en `src/calendar.js`) →
genera copy+imagen → panel de revisión (`public/dashboard.html`, vanilla JS, ~1000 líneas en
`dashboard.js`) → aprobar/editar/descartar → publicación automática a IG a las 08:00 ARG →
insights semanales (`src/insights.js`).

**Preferencias del dueño (Sebastián):** reproducir localmente antes de dar por arreglado,
arreglar la causa raíz (no parches), y cuando algo requiere pasos en una UI externa
(Render, Meta, Supabase, GitHub) explicarlos click por click. Idioma: español rioplatense.

---

## 2. Visión: qué hace una agencia que la app todavía no hace

| Rol de agencia | Estado hoy | Gap |
|---|---|---|
| Estrategia mensual | Rotación fija de 14 días hardcodeada | No hay planificación por objetivos, campañas ni fechas comerciales |
| Diseño | 1 sola plantilla HTML | Sin variedad visual; una agencia entrega 4–6 sistemas visuales |
| Copywriting | Muy bueno (voz de marca en `ai.js`) | Sin variantes A/B, sin aprendizaje de los posts que funcionaron |
| Calendario / planificación | Lista por fecha, sin edición | No se puede arrastrar, reprogramar ni planificar un mes visualmente |
| Publicación | Solo Instagram | Falta Facebook Page (¡ya hay token!), y opcionalmente TikTok/YouTube Shorts |
| Reporting | `analyzePerformance()` básico, comparación de 2 pilares | Sin informe periódico legible, sin evolución temporal, sin mejor horario |
| Community management | Nada | No lee comentarios/DMs ni sugiere respuestas |
| Optimización continua | Recomendación de texto que nadie ejecuta | El insight no retroalimenta ni el calendario ni el copy |

---

## 3. Fases de implementación (en orden — cada una es autocontenida)

### FASE A — Cimientos técnicos (hacer primero, habilita todo lo demás)

1. **Modularizar `src/server.js` (410 líneas) en routers**: `src/routes/calendar.js`,
   `routes/assets.js`, `routes/style.js`, `routes/products.js`, `routes/cron.js`.
   Sin cambiar comportamiento. Facilita todo lo que sigue.
2. **Proteger el dashboard con login simple**: hoy `dashboard.html` y toda la API están
   abiertas al público en Render. Un middleware con `DASHBOARD_PASSWORD` (env var) +
   cookie firmada alcanza. Gratis y cierra un agujero real (cualquiera puede aprobar/publicar).
3. **Migraciones versionadas**: `src/migrate.js` es un script único; pasarlo a carpeta
   `migrations/NNN_*.sql` con tabla `schema_migrations`, para que las fases siguientes
   puedan agregar tablas sin miedo.
4. **Cola de publicación robusta**: tabla `publish_queue` con reintentos y backoff
   (hoy si Meta falla a las 08:00, el post se pierde hasta el día siguiente).
   `publish-daily` procesa la cola en vez de "lo de hoy".
5. **Optimizar el cron `render-reels`** (`*/30 * * * *` = ~48 runs/día ≈ 300+ min/mes de
   Actions): primero pegarle a un endpoint liviano `GET /api/cron/has-pending-renders`
   y salir en 10 segundos si no hay nada, o bajar la frecuencia a cada 2 h fuera del
   horario 06–12 ARG. Cuida el límite gratuito de 2000 min/mes en repos privados.

### FASE B — Planificador estratégico (el "director de cuentas")

1. **Calendario editable en el panel**: vista mensual tipo grilla; cada celda muestra el
   slot (pilar, formato, hora). Acciones: mover de día (drag & drop o botón "reprogramar"),
   cambiar pilar/tema, agregar slot manual, pausar un día. Persistir en `content_calendar`
   (ya tiene `scheduled_date/time/pillar/...`; solo faltan endpoints PATCH).
2. **Generador de estrategia mensual con IA**: reemplazar la rotación fija de
   `src/calendar.js` por un planner: una vez por mes, Gemini recibe (a) informe de insights
   por pilar, (b) top productos por ventas (`sync-sales` ya existe), (c) fechas comerciales
   del mes, (d) stock disponible, y devuelve la rotación del mes en JSON (mismo shape que
   `ROTATION`). Guardarla en una tabla `rotation_plans` con botón "regenerar plan" y
   edición manual en el panel. La rotación actual queda como fallback.
3. **Calendario comercial argentino**: tabla `commercial_dates` sembrada con Hot Sale,
   CyberMonday, Día del Trabajador, Día del Padre, invierno/vuelta al frío, fin de año,
   aguinaldo (junio/diciembre — clave para el rubro), etc. El planner y el copy las usan
   ("se viene el aguinaldo, renovate los borcegos").
4. **Campañas**: entidad `campaigns` (nombre, objetivo, rango de fechas, productos,
   descuento). Una campaña genera N slots coordinados (anuncio → recordatorio → último día)
   con copy coherente entre sí. Es LO más parecido a contratar una agencia.

### FASE C — Sistema visual (el "director de arte")

1. **Multi-plantilla**: hoy todo sale de `templates/post-template.html`. Crear 4–5
   plantillas más (misma técnica Puppeteer, gratis): `promo-agresiva` (precio gigante,
   tachado), `minimal-producto` (foto full-bleed, logo chico), `educativo-carrusel`
   (slides numerados), `testimonio/mayorista`, `fecha-comercial`. Registrarlas en una
   tabla `templates` y que el planner/generador elija por pilar, con override manual
   en el panel ("regenerar con otra plantilla").
2. **Previsualización fiel en el panel**: mock de feed de IG (grilla 3xN con las piezas
   aprobadas + las ya publicadas) para ver cómo queda el perfil antes de aprobar.
   Una agencia siempre muestra "la grilla".
3. **Variantes**: botón "dame 3 opciones" que genera 3 combinaciones plantilla+copy para
   un slot y deja elegir. Reutiliza `POST /api/generate/:calendarId` con parámetro `variant`.

### FASE D — Distribución multi-canal (el "media buyer" sin pauta)

1. **Facebook Page**: `META_PAGE_ACCESS_TOKEN` y `META_PAGE_ID` ya están configurados.
   Extender `src/metaPublisher.js` para cross-postear el feed a la página de Facebook
   (`/{page-id}/photos` y `/videos`). Es el quick-win más barato del plan.
2. **Historias automáticas de refuerzo**: cuando un post de feed se publica, generar
   automáticamente una historia "nuevo post" 9:16 que lo levanta (la API de IG permite
   publicar stories de imagen/video, no stickers — eso ya está contemplado con
   `automation_level: 'semi'`).
3. **Mejor horario por datos**: guardar en `post_insights` la hora de publicación y,
   con ≥20 posts, ajustar `scheduled_time` sugerido por pilar según alcance real.
4. **(Opcional, evaluar costo/beneficio) TikTok y YouTube Shorts**: ambas APIs de
   publicación son gratuitas (TikTok Content Posting API, YouTube Data API) y los Reels
   ya renderizados sirven tal cual. Requiere apps/OAuth de cada plataforma — documentar
   los pasos de consola click por click.

### FASE E — Analytics y aprendizaje continuo (el "analista")

1. **Dashboard de métricas en el panel**: pestaña "Resultados" con evolución semanal de
   alcance/likes/saves por pilar (Chart.js desde CDN, gratis), top 5 posts, y la
   recomendación de `analyzePerformance()` renderizada como tarjeta accionable con botón
   "aplicar al plan del mes que viene".
2. **Feedback loop al copy**: los 5 posts con mejor engagement se inyectan como few-shot
   en el prompt de `src/ai.js` ("estos posts funcionaron, imitá su estructura").
   Los descartados/editados en el panel también enseñan: guardar el diff entre copy
   generado y copy editado y resumirlo cada semana en `brand_profile` (ya existe la
   infraestructura de `styleService`/`analyze-style`).
3. **Informe semanal automático por Telegram**: un bot de Telegram (gratis, sin servidor
   extra: `sendMessage` vía HTTPS desde el cron `sync-insights`) manda cada lunes el
   resumen: qué se publicó, qué funcionó, qué se planificó, qué requiere aprobación.
   Alternativa email: Resend free tier (100/día). Telegram es más simple y más visto.
4. **Alertas operativas**: el mismo bot avisa si un cron falló, si hay piezas esperando
   aprobación hace >24 h, o si un producto planificado se quedó sin stock.

### FASE F — Community management asistido (el "community manager")

1. **Inbox de comentarios**: cron cada 2 h que trae comentarios nuevos de los posts
   publicados (`GET /{media-id}/comments`, incluido en el token actual) a una tabla
   `comments`, con pestaña "Comentarios" en el panel.
2. **Respuestas sugeridas**: para cada comentario, Gemini propone una respuesta con la
   voz de marca de `ai.js` (incluye precios/stock reales del catálogo si preguntan).
   Un click para aprobar → responde vía `POST /{comment-id}/replies`. Nunca responder
   automático sin aprobación (riesgo de marca).
3. **Detección de intención de compra**: clasificar comentarios/preguntas ("¿tenés talle
   43?", "¿precio mayorista?") y destacarlos arriba — eso es plata directa.

### FASE G — UI/UX del panel (paralelo, cuando las fases B/E agreguen pestañas)

El panel es vanilla JS y está bien que lo siga siendo (cero build, deploy simple en Render).
Pero con calendario + métricas + comentarios va a necesitar:
1. Layout con navegación lateral persistente en vez de tabs horizontales.
2. Estados vacíos y de carga consistentes, toasts para acciones (aprobar/publicar).
3. Mobile-first real: Sebastián aprueba desde el teléfono.
4. Modo oscuro (la marca es negra — queda natural).
Si `dashboard.js` supera ~1500 líneas, partirlo en módulos ES (`public/js/calendar.js`,
`js/assets.js`, etc.) con `<script type="module">` — sin bundler.

---

## 4. Orden recomendado y quick wins

**Semana 1 (quick wins):** A2 (login), D1 (Facebook cross-post), A5 (ahorro de Actions),
E3 (bot de Telegram con informe semanal). Impacto inmediato, riesgo bajo.

**Después:** A1+A3+A4 → B (planner) → C (plantillas) → E1+E2 → F → D2–D4 → G continuo.

---

## 5. Herramientas para la sesión con Opus (skills / conectores / MCP)

- **Claude in Chrome / preview tools**: usar SIEMPRE para verificar el dashboard después
  de cada cambio de UI (hay `.claude/launch.json`). No dar por hecho nada sin verlo.
- **Skill de frontend design** (marketplace `anthropics/skills`, plugin `frontend-design`):
  instalarla antes de la Fase G/C para que las plantillas y el panel salgan con criterio
  de diseño y no "a ojo". Instalación: `/plugin` → marketplace anthropics/skills.
- **Supabase MCP server** (opcional): permite inspeccionar tablas/policies desde Claude
  (`claude mcp add supabase -- npx -y @supabase/mcp-server-supabase --read-only`).
  Alternativa gratis y suficiente: seguir usando `psql $DATABASE_URL` desde Bash.
- **`gh` CLI** (ya disponible): para editar secrets y disparar workflows
  (`gh workflow run cron.yml -f job=generate-daily`) sin pasar por la web.
- **No hay MCP oficial de Meta/Tiendanube** — se sigue con las APIs REST ya integradas.

## 6. Reglas para Opus durante la implementación

1. Todo debe seguir corriendo en los planes gratuitos: Render 512 MB (nada pesado en el
   servicio web — Puppeteer/ffmpeg van a GitHub Actions), Supabase Free (500 MB DB,
   1 GB storage — cuidar acumulación de videos: agregar limpieza de assets descartados
   de >30 días), Gemini free tier (respetar rate limits, mantener el fallback a Groq).
2. Una fase por vez, commit por ronda con mensaje descriptivo en español (formato
   "Ronda N: ..." como el historial existente).
3. Reproducir y verificar localmente antes de dar por terminado; si algo solo se puede
   probar en producción, decirlo explícitamente.
4. Cada vez que haga falta tocar Render/Meta/Supabase/GitHub a mano, terminar la ronda
   con la lista de pasos click por click.
5. Migraciones de DB siempre aditivas (nunca DROP de datos existentes).
6. Mantener la voz de marca de `src/ai.js` intacta salvo para agregarle el feedback loop.
