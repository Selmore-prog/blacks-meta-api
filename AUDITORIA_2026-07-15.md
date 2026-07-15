# 🔍 AUDITORÍA E IMPLEMENTACIÓN — 15 jul 2026

Auditoría completa del pipeline de generación (director creativo → copy → render → publicación) y de los bugs de "formatos/estilos que se pisan". Resultado: el spec de `MEJORAS_PARA_DECIRLE_A_FABLE_5.md` ya estaba implementado en un ~80% (búsqueda híbrida de candidatos, bloqueo del fallback ciego, auditoría factual, lint de copy). Lo que faltaba — y se implementó en esta ronda — es lo de abajo.

## 1. MEMORIA DE ERRORES (aprendizaje persistente) — `src/learning.js` + tabla `qa_lessons`

El sistema ya corregía errores en el momento, pero cada corrección se perdía al terminar el proceso. Ahora **todo error detectado queda registrado como lección** y las más frecuentes/recientes se inyectan en los prompts del director creativo y del copywriter.

Fuentes de lecciones:
- `lint` — el QA de copy rechazó y el reintento tampoco salió limpio
- `factual` — la auditoría factual corrigió un dato inventado
- `image` — una imagen IA se descartó por texto/logo horneado (plata tirada)
- `render` — el QA visual encontró la pieza rota
- `user_edit` — **editaste un caption a mano**: una IA deriva la regla general del diff
- `user_discard` — **descartaste una pieza con motivo** (nuevo modal en el panel)

Gestión: panel → Métricas → Costos IA → "Lecciones aprendidas" (se pueden apagar/reactivar). API: `GET /api/lessons`, `POST /api/lessons/:id/toggle`.

## 2. QA VISUAL POST-RENDER + SELF-HEALING — fase final del pipeline

Nadie miraba la pieza TERMINADA antes de aprobar. Ahora un director de arte IA (visión, gratis) revisa el render final: texto cortado, elementos pisados, ilegibilidad, fotos rotas.
- Pieza simple rota → **se re-renderiza sola** con plantilla `fullbleed` **reusando la escena IA ya pagada** (cero gasto extra).
- Si ni así queda bien → `qa_notes` (el badge del panel la marca y `AUTO_APPROVE` no la publica).
- Carruseles: se revisa la portada; si está rota queda marcada para "regenerar slide".
- Calibrado contra falsos positivos (regla de oro: ante la duda, aprueba — verificado con pieza sana y pieza rota reales).

## 3. TOPE DE GASTO DIARIO EN IMÁGENES — `AI_IMAGE_DAILY_BUDGET_USD` (default US$3)

Al llegar al tope del día (día calendario ARG, medido contra `ai_usage`), el resto de las piezas sale con plantilla (gratis). **La generación nunca se corta, sólo el gasto.** El Estudio (acción manual tuya) no pasa por el tope. Visible en el panel: "Gasto de hoy vs tope diario".

## 4. BUGS DE FORMATOS/ESTILOS CORREGIDOS

1. **Carrusel fotográfico etiquetado 'educativo'**: todo carrusel se guardaba con `template='educativo'` aunque sus slides fueran fullbleed/grid. Ahora la etiqueta refleja lo renderizado.
2. **`story_points` perdidos con precio**: en `fullbleed`, los puntos con datos reales desaparecían justo cuando la pieza llevaba precio (historias de producto/promo). Ahora conviven.
3. **Plan ↔ plantilla sin validación dura**: el director podía elegir una plantilla que el producto elegido no sostenía (ej. `grid` con 1 foto) y se corregía silenciosamente al renderizar, divergiendo plan y diseño. `TEMPLATE_REQUIREMENTS` ahora vive en `imageRenderer.js` (única fuente de verdad) y `planPiece()` valida su elección contra las fotos/descripción reales del producto y el formato.

## 5. VERIFICADO

- `node --check` en todos los archivos tocados + sintaxis de `dashboard.js`
- `npm run migrate` corrido (crea `qa_lessons`, idempotente)
- Smoke test completo del módulo de aprendizaje contra la DB real
- QA visual: aprueba pieza sana, rechaza pieza rota (probado con renders reales)
- `deriveLessonFromEdit` produce reglas generales sensatas
- Panel verificado en el navegador: modal de descarte con motivo, panel de lecciones con toggle, stat de presupuesto

## Para el deploy en Render

1. `npm run migrate` corre solo si está en el build/start command (ya crea `qa_lessons`).
2. Variable nueva opcional: `AI_IMAGE_DAILY_BUDGET_USD` (default 3; `0` = sin tope).
