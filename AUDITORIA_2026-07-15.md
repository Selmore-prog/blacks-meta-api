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

---

# RONDA 2 (mismo día): FLUJO DE PENSAMIENTO FOTOGRÁFICO PROFESIONAL

## 6. DIRECTOR DE FOTOGRAFÍA para piezas simples — `planHeroShot()` en ai.js

Hasta ahora sólo los carruseles miraban las fotos reales; las piezas simples (la mayoría) usaban a ciegas la PRIMERA foto de Tiendanube con una toma genérica, y el copy iba por otro camino. Ahora el flujo por pieza es el de un profesional:

1. Director creativo decide QUÉ es la pieza y el producto exacto (ya existía).
2. **NUEVO — el sistema VE todas las fotos del producto** (visión: qué muestra cada una, si es detalle, color) y lee la ficha técnica real.
3. **NUEVO — elige LA foto y LA toma**: si el ángulo habla de la suela y hay una foto de la suela → toma 'detalle' de ESA foto (verificado en vivo con el caso "suela de yute" → eligió la foto correcta con overlay respaldado). Si ninguna foto muestra el detalle, NO lo fuerza (verificado: "forro térmico" inexistente → hero).
4. **NUEVO — el copy se escribe DESPUÉS**, recibiendo `imageContext` (qué muestra exactamente la imagen elegida): overlay y caption hablan de ESO, prohibido destacar lo que no se ve.
5. Render: toma 'detalle'/'flatlay' = **foto real a pantalla completa (GRATIS, cero riesgo de alucinación IA)**; 'hero'/'contexto' = escena IA dirigida por la spec de la toma (como los carruseles).
6. QA visual final (ronda 1).

Bonus: los carruseles reutilizan el análisis de fotos ya hecho (una sola llamada de visión por pieza).

## 7. FIN DE LAS "IMÁGENES DE CUALQUIER COSA" — visual `fondo_ambiental` explícito

El fondo IA ambiental se generaba POR DEFECTO en toda pieza sin foto (incluso con el director caído) → escenas genéricas sin relación con el mensaje. Ahora es una decisión EXPLÍCITA del cerebro: nuevo tratamiento visual `fondo_ambiental` que exige una `image_note` concreta (qué escena, qué transmite). Sin esa dirección → tarjeta tipográfica de marca (gratis y coherente). Director caído → nunca más una escena random.

## 8. HISTORIAS: todo el mensaje EN la pieza

El caption de una historia casi nadie lo ve. Ahora la pieza se cuenta sola: overlay (gancho) + `story_points` (datos reales) + **CTA impreso como botón** sobre la imagen (fullbleed y minimal; si la pieza es semi, el chip de interacción manda y no se duplica). El prompt del copy lo exige ("lo que no esté en la imagen, no existe") y pide CTAs cortos accionables. También: con precio y sin foto, el titular y el checklist llenan la pieza (antes quedaba un hueco).

## Verificado (ronda 2)

- planHeroShot en vivo: caso suela ✓, venta general → hero ✓, detalle inexistente → no lo fuerza ✓
- Render de historia con CTA + puntos + precio: completo, sin pisarse, y el QA visual lo aprueba ✓
- `node --check` + cadena de requires ✓

## Para el deploy en Render

1. `npm run migrate` corre solo si está en el build/start command (ya crea `qa_lessons`).
2. Variable nueva opcional: `AI_IMAGE_DAILY_BUDGET_USD` (default 3; `0` = sin tope).
