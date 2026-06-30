# BLACKS Content Engine — Fase 1

Motor de generación automática de contenido (copy + imagen) para Instagram/Facebook, a partir del catálogo de Tiendanube. Esta fase **genera y deja todo listo para revisar en un panel**, todavía no publica solo en redes (eso es la Fase 2 — ver `PROMPT_ANTIGRAVITY_FASE2.md`).

## Qué hace

1. `npm run sync` — trae tu catálogo de Tiendanube y lo guarda en Postgres.
2. `npm run generate:daily` — siembra el calendario (rotación de 14 días, ver `src/calendar.js`) y genera copy + imagen para los slots de hoy.
3. `npm start` — levanta el servidor con el panel de revisión en `http://localhost:8080/dashboard.html`.

Desde el panel podés ver cada pieza generada, **aprobarla, editarla o descartarla**, y por ahora publicarla vos mismo a mano (copiás el caption y descargás la imagen).

## Instalación

```bash
npm install
cp .env.example .env
# completá .env con tus credenciales (ver abajo)
npm run migrate
npm run sync
npm run generate:daily
npm start
```

Después abrí `http://localhost:8080/dashboard.html`.

## Variables de entorno necesarias

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Te la da Railway al crear un servicio de PostgreSQL |
| `TIENDANUBE_STORE_ID` | Lo ves en la URL de tu admin de Tiendanube |
| `TIENDANUBE_ACCESS_TOKEN` | Creando una app propia/privada en tu panel de Tiendanube (Configuración → Apps → Crear app privada), con scope `read_products` |
| `TIENDANUBE_USER_AGENT` | Cualquier string con el nombre de tu app + tu email (la API lo exige) |
| `ANTHROPIC_API_KEY` | Tu API key de la Anthropic Console (console.anthropic.com) — distinta de tu login de Claude.ai |

`META_PAGE_ACCESS_TOKEN` e `IG_USER_ID` quedan vacíos por ahora — se usan en la Fase 2.

## Sobre los colores y la plantilla

`templates/post-template.html` tiene los 3 colores de marca como variables (`COLOR_BLACK`, `COLOR_WHITE`, `COLOR_ORANGE`) seteadas en `src/config.js`. Ajustá `darkOrange` al hex exacto de tu manual de marca si lo tenés a mano — quedó en `#C1440C` como aproximación.

Es un único componente HTML/CSS por lo que cualquier ajuste de diseño (tipografía, tamaños, posición del logo) se hace en ese único archivo y aplica a todas las piezas generadas — así te asegurás consistencia entre piezas sin tener que retocar cada una a mano.

## Sobre Puppeteer en Railway

Puppeteer descarga Chromium (~300 MB) al instalar. Railway lo soporta, pero si el build falla por memoria/tamaño, la alternativa es cambiar a `puppeteer-core` + el paquete `@sparticuz/chromium` (pensado para entornos serverless/contenedores livianos). Te lo dejo marcado en el prompt de Antigravity como ajuste a evaluar si hace falta.

## Qué NO hace todavía (queda para Fase 2/3)

- No publica automáticamente en Instagram/Facebook (Graph API).
- No genera Reels/video — solo imagen estática.
- No trae métricas de Instagram para retroalimentar qué pilar reforzar.

Ver `PROMPT_ANTIGRAVITY_FASE2.md` para continuar con esto.
