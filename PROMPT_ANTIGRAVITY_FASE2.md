# Prompt para Antigravity — BLACKS Content Engine, Fase 2 y 3

Pegá esto como instrucción inicial en Antigravity, con el repo de `blacks-content-engine` (Fase 1) ya cargado como contexto.

---

## Contexto

Ya existe un servicio Node.js/Express + PostgreSQL (`blacks-content-engine`) que:
- Sincroniza el catálogo de Tiendanube a `products_cache`.
- Genera copy (vía API de Claude) e imagen (HTML/CSS + Puppeteer, en JPEG 1080x1350) para slots de un calendario de contenido (`content_calendar` / `generated_assets`).
- Tiene un dashboard simple (`/dashboard.html`) donde se puede generar, ver, aprobar o descartar cada pieza.

Lo que falta es: **publicar automáticamente** lo aprobado en Instagram y Facebook, agregar generación de **Reels/video**, y cerrar el loop con **métricas**.

## Fase 2 — Publicación automática vía Meta Graph API

### 2.1 Setup previo (esto lo hace Sebastián manualmente, no es código)
1. Crear una app en developers.facebook.com, agregar el producto "Instagram Graph API".
2. Vincular la cuenta de Instagram profesional de @blacks.indumentaria a la Página de Facebook de BLACKS.
3. Agregar a Sebastián (o el usuario que corresponda) con rol Admin/Developer en la app de Meta — mientras la app esté en modo desarrollo y todos los que la usan tengan un rol en ella, **se puede publicar en las cuentas propias sin pasar por el proceso completo de App Review**. Esto puede cambiar según política de Meta — si al conectar la app pide review igual, hay que iniciarlo (puede tardar 2-4 semanas) y mientras tanto seguir con aprobación manual vía dashboard.
4. Generar un token de Página de larga duración (60 días) y el ID de usuario de Instagram (`IG_USER_ID`) — completar en `.env`.
5. Los permisos/scopes correctos hoy son `instagram_business_content_publish` (reemplazó a `instagram_basic`/`instagram_content_publish`, deprecados). Verificar el nombre exacto vigente en la documentación de Meta al momento de implementar, porque cambian con cierta frecuencia.

### 2.2 Lo que hay que construir

**`src/storage.js`** — subir la imagen generada a un storage público (Cloudflare R2, S3, o un endpoint propio servido por Express con HTTPS de Railway) y devolver la URL pública. La Instagram Graph API necesita poder hacer `curl` a esa URL — no acepta upload directo de archivo.

**`src/metaPublisher.js`** con dos funciones:
- `publishToInstagram({ imageUrl, caption })`:
  1. `POST https://graph.facebook.com/v21.0/{IG_USER_ID}/media` con `image_url`, `caption`, access token → devuelve `creation_id`.
  2. Poll `GET /{creation_id}?fields=status_code` cada ~5-10s hasta `FINISHED` (timeout a los 5 minutos, máximo recomendado por Meta).
  3. `POST /{IG_USER_ID}/media_publish` con `creation_id` → devuelve `media_id` publicado.
- `publishToFacebook({ imageUrl, caption })`:
  - `POST /{PAGE_ID}/photos` con `url` + `caption` (más simple, sin container/polling).

Importante:
- Las imágenes deben ser JPEG (ya está resuelto en Fase 1).
- Límite: 100 publicaciones por API por cuenta cada 24hs (ventana móvil). No es un problema con el volumen de este proyecto, pero dejar un chequeo básico antes de publicar en loop.
- Si el publish falla, dejar el asset en estado `approved` (no `published`) y loguear el error — nunca reintentar automáticamente más de 1-2 veces.

**Modificar `src/server.js`**:
- Nuevo endpoint `POST /api/assets/:assetId/publish` que toma un asset en estado `approved`, sube la imagen a storage público si hace falta, llama a `publishToInstagram` (y opcionalmente `publishToFacebook`), guarda `meta_post_id` y pasa el estado a `published`.
- Nuevo botón "Publicar" en el dashboard para assets `approved`.

**Cron de publicación programada** (Railway Cron Jobs o `node-cron` dentro del proceso):
- Un job diario que recorre los `generated_assets` en estado `approved` con `scheduled_date` de hoy y los publica automáticamente — para que una vez aprobado, no haya que tocar nada más.
- Mantené esto como **opt-in por pilar**: por ejemplo, arrancar publicando automático solo para `pillar = 'promo'` y `'producto'`, y dejar `'marca'`/`'educativo'` en aprobación manual unas semanas hasta confiar en la calidad del copy generado.

### 2.3 Stories
Las Stories no usan el mismo container que el feed — `media_type=STORIES`, sin caption visible (el texto va dentro de la imagen, ya generada). El flujo de container/publish es el mismo. Implementar como una variante de `publishToInstagram` con `media_type: 'STORIES'`.

---

## Fase 3 — Video y métricas

### 3.1 Reels simples (Ken Burns)
- `src/videoRenderer.js`: tomar la imagen JPEG ya generada y aplicar un efecto de zoom/pan lento con `ffmpeg` (instalar `fluent-ffmpeg` + verificar que el binario de ffmpeg esté disponible en el contenedor de Railway, o usar la imagen Docker con ffmpeg preinstalado).
- Exportar a MP4 vertical 9:16, entre 5 y 90 segundos (rango válido para que cuente como Reel vía API), H.264, máx. 8MB si se usa como cover, sin límite estricto de tamaño para el video en sí salvo el de la API.
- Publicar como Reel: `media_type=REELS`, mismo patrón de container → poll → publish, pero el polling de video puede tardar más (30 seg a 2 min).

### 3.2 Métricas e insights
- `src/insights.js`: `GET /{ig-media-id}/insights?metric=reach,impressions,saved,shares` para posts ya publicados (vía `meta_post_id` guardado).
- Guardar resultados en una tabla `post_insights` con un job semanal.
- Lógica simple de ajuste: si los Reels de pilar `producto` tienen mejor alcance promedio que los de `educativo`, aumentar la proporción de slots `producto` en la rotación del próximo ciclo (esto puede ser tan simple como un script que sugiere cambios a `ROTATION` en `calendar.js`, revisado por Sebastián antes de aplicar — no hace falta que sea 100% automático).

---

## Criterio de "listo"

- Fase 2 lista cuando: aprobar un asset en el dashboard y tocar "Publicar" hace que aparezca efectivamente en el feed/stories de @blacks.indumentaria sin pasos manuales adicionales.
- Fase 3 lista cuando: hay al menos un Reel generado automáticamente publicado con éxito, y un reporte semanal (aunque sea un log o email simple) con qué pilares tuvieron mejor desempeño.

No avances a Fase 3 hasta que Fase 2 esté publicando de forma confiable durante al menos 1-2 semanas — es preferible un sistema simple que funciona todos los días a uno ambicioso que falla silenciosamente.
