# CHECKLIST DE MEJORAS DE ARQUITECTURA Y MOTORES IA (PARA CLAUDE / EQUIPO DEV)
**Proyecto:** Blacks Content Engine (`blacks-content-engine`)
**Estado:** En Proceso de Mejora Continua (Actualizado julio 2026)
**Objetivo:** Elevar las salidas visuales y de video al estándar de **Director de Arte Senior + Fotografía de Estudio High-End**, reemplazando o potenciando modelos con alternativas súper realistas y económicas/gratuitas.

---

## 📋 1. RESUMEN EJECUTIVO PARA CLAUDE (O PRÓXIMO AGENTE DEV)

Si estás leyendo este documento como **Claude** (o como programador asistiendo al usuario), ten en cuenta el contexto de este repositorio:
1. **Pila Actual:** Node.js, Express, Puppeteer (renderizado HTML $\rightarrow$ PNG de plantillas `fullbleed`, `minimal`, `promo`, `educativo`, `mayorista`), FFmpeg (subtítulos ASS con karaoke estilo reel y edición de video), y Gemini API (`@google/genai` / `fetch` al endpoint REST `v1beta`).
2. **Rol de la IA Visual en `src/ai.js`:** La IA genera **únicamente el fondo fotográfico o la escena del producto en contexto** (`generateBackground`, `generateProductScene`, `generateStudioScene`). El diseño gráfico tipográfico (titulares, precios, cupones, badges, logos y dominio) lo superpone **después** `imageRenderer.js` a través de plantillas HTML sobre ese fondo.
3. **Pilar Fundamental ("Product-in-Context" e Impecabilidad de Marca):** Nunca se debe pedir a un motor `Text-to-Image` o `Text-to-Video` que invente el calzado de seguridad o indumentaria del cliente desde cero. Siempre se le debe pasar la foto real del producto de Tiendanube como referencia y exigir que no deforme ni alucine geometrías, costuras, punteras ni etiquetas.

---

## ✅ 2. CHECKLIST DE MEJORAS IMPLEMENTADAS (LO QUE YA SE HIZO)

- [x] **Creación del Documento Maestro (`PROMPT_ARQUITECTURA_VISUAL_CLAUDE.md`):**
  - Contiene todas las reglas de dirección de arte, composición con *negative space*, zonas seguras para IG Stories (`9:16`) e IG Feed (`4:5`), prohibición de adjetivos basura (`4k, fotorrealista`) y reemplazo por óptica fotográfica (`Hasselblad H6D-100c, 85mm f/1.8 prime lens, softbox diffused lighting, Kodak Portra 400`).
- [x] **Actualización del Catálogo de Precios y Modelos en `src/ai.js` (`IMAGE_PRICE_USD`):**
  - Se añadieron los identificadores oficiales y costos referenciales de **Imagen 3 (`imagen-3.0-generate-002`, `imagen-3.0-fast-generate-001`, `imagen-3.0-generate-001`)** y **FLUX.1 (`flux-schnell`)** para que el sistema pueda registrar consumos exactos en la base de datos sin fallas.
- [x] **Reingeniería de Prompts en `src/ai.js` (`generateBackground`):**
  - Se modificó el prompt de generación de fondos para exigir óptica de lente `50mm/85mm f/1.8`, luz comercial motivada (softbox cenital + sol bajo de galpón), ciencia de color Kodak Portra 400 y **amplio espacio negativo limpio/desenfocado** en el tercio superior e inferior (*Text Safe Areas*).
- [x] **Reingeniería de Prompts en `src/ai.js` (`generateProductScene` & `generateStudioScene`):**
  - Se reescribieron las instrucciones que reciben la imagen de referencia del producto o combos mayoristas para imponer **fidelidad absoluta del modelo original (sin rediseños ni alucinaciones)**, iluminación de estudio con *rim lighting* para contornear el producto contra fondos oscuros (#1c1c1e), y texturas realistas de desgaste en el entorno (nunca en la prenda/calzado).
- [x] **Reingeniería y Estándar Oro en Vídeos (`videoCameraRules`, `buildStudioVideoPrompt`, `buildVideoPrompt` en `src/ai.js`):**
  - Se optimizaron las reglas cinemáticas para exigir **dolly push-in lento y estable, luz volumétrica con partículas de polvo flotando en 24fps y cero morphing de producto**.
  - Se configuró la recomendación explícita para el usuario en el dashboard imponiendo **Image-to-Video (`i2v` en Runway Gen-3 / Kling / Veo) como Estándar Oro** partiendo del render fotográfico estático (`Frame 0`), con la alternativa *Reference-to-Video* de Gemini Veo subiendo múltiples perspectivas.

---

## 🚀 3. RECOMENDACIONES TÉCNICAS Y MODELOS PARA SUPER REALISMO (ECONÓMICOS / GRATUITOS)

Para cuando quieras reemplazar o variar las llamadas en `config.gemini.imageModel` u orquestar videos, esta es la guía recomendada para integrar con costo casi cero:

### A. Generación y Edición de Imágenes (Fidelidad Fotográfica)

1. **Imagen 4 (`imagen-4.0-generate-001`) y el ecosistema Imagen 3 (vía Gemini API) — ¡RECOMENDADO TOP PARA E-COMMERCE!**
   - **Por qué Imagen 4 es SUPERIOR y MÁS BARATO que `gemini-3.1-flash-image`:** Como confirman las tarifas oficiales en tu panel, `gemini-3.1-flash-image` cuesta **$0.0672 USD** por imagen. En cambio, **Imagen 4 (`imagen-4.0-generate-001`) cuesta $0.04 USD** (casi **40% más barato**) y su motor es de pura difusión fotográfica con calidad general y texturas muy superiores (*"significantly better overall image quality"*).
   - **Opciones exactas en tu `.env`:**
     - **Máxima Calidad Comercial / Estándar Top:** `GEMINI_IMAGE_MODEL=imagen-4.0-generate-001` ($0.04/foto)
     - **Opción Súper Económica de Alta Velocidad:** `GEMINI_IMAGE_MODEL=imagen-3.0-fast-generate-001` ($0.015/foto)
     - **Calidad Ultra:** `GEMINI_IMAGE_MODEL=imagen-4.0-ultra-generate-001` ($0.06/foto)

2. **FLUX.1 [schnell] / [dev] (Open Source - Ultra Realismo a Costo Ínfimo):**
   - **Por qué usarlo:** FLUX.1 es actualmente el rey indiscutido del hiperrealismo fotográfico (superando a Midjourney en texturas de piel, iluminación de estudio y telas laborales) sin ese brillo plástico típico de SDXL/DALL-E 3.
   - **Opción 100% GRATIS (Para prototipos/pruebas rápidas):** API pública de **Pollinations.ai**. Puedes hacer `fetch("https://image.pollinations.ai/prompt/" + encodeURIComponent(promptMaster) + "?width=1080&height=1350&model=flux")` y obtener imágenes fotográficas gratis en formato JPEG al instante.
   - **Opción Económica de Producción (Replicate / Together AI / Fal.ai):** Usar el modelo `black-forest-labs/flux-schnell` (genera en 4 pasos por menos de **$0.003 USD por foto** — un 90% más barato que DALL-E 3 o Midjourney).

---

### B. Generación de Video Cinematográfico (`Image-to-Video` - i2v)

**⚠️ REGLA DE ORO PUBLICITARIA:** **NUNCA** utilices `Text-to-Video` (texto a video directo) para productos de indumentaria o calzado e-commerce, porque el modelo inventará el producto e introducirá alucinaciones (*morphing* de costuras, logos deformados). Siempre debes partir de la imagen estática perfecta generada por `generateProductScene` (`Frame 0`) y aplicar `Image-to-Video (`i2v`)`.

1. **Replicate (`fal-ai/fast-svd` o `cogvideox` / `luma/dream-machine`):**
   - **Costo:** ~$0.01 a $0.03 USD por clip de 4 segundos.
   - **Flujo en código (`src/videoEditor.js` / servicio de video):**
     ```javascript
     // 1. Tomamos el buffer del render estático perfecto (con o sin texto)
     // 2. Lo enviamos como input_image a Replicate con el prompt cinemático de Claude:
     const promptVideo = "Slow and steady smooth camera push-in towards the hero product. Subtle floating dust motes catching the volumetric light, gentle ambient motion. The hero product remains 100% stable and razor-sharp with zero warping.";
     ```
2. **Google Veo (en tu Plan Gemini Pro / Advanced / AI Studio) — ¡TU MEJOR OPCIÓN Y YA PAGADA!**
   - **Por qué usarlo:** Si ya tienes la suscripción **Gemini Pro (Advanced / Google One AI Premium con Veo)** o usas Google AI Studio / Vertex, **Google Veo ya está a tu disposición sin pagar ni un centavo extra a otras plataformas**.
   - **Cómo lograr Image-to-Video (`i2v`):** En la interfaz de Gemini Pro o AI Studio, en vez de escribir solo texto, adjuntas el PNG maestro renderizado (`generateProductScene` o foto integrada en el taller) como referencia inicial (`Image-to-Video`) y pegas el prompt cinemático (*"Slow and steady smooth camera push-in..."*). Obtendrás el reel en alta definición sin marcas de agua ni costos añadidos.
3. **Kling AI (`klingai.com`) — Opción Externa 100% Gratis Diario:**
   - **Créditos gratis:** Te regala **66 créditos diarios gratis** al iniciar sesión cada día, lo cual alcanza para generar entre **2 y 6 videos diarios sin pagar absolutamente nada** (ideal para los 1-2 Reels diarios de Blacks).
   - *Nota:* El tier gratuito añade una pequeña marca de agua (`Kling AI`) en la esquina inferior derecha que puede recortarse ligeramente.
4. **Runway Gen-3 Alpha (`runwayml.com`) — Opción Externa de Pago:**
   - **Créditos:** Solo da 125 créditos gratis por única vez al registrarte para probar. Luego de eso no se renuevan y requiere suscripción de pago ($12-$15 USD/mes) o pago por crédito. Recomendado solo si se busca un efecto muy específico de paneo complejo.

---

## 🛠️ 4. CHECKLIST DE PRÓXIMOS PASOS RECOMENDADOS (PARA IMPLEMENTAR CON CLAUDE SI LO DESEAS)

- [ ] **Módulo Proveedor FLUX / Pollinations (`src/imageGenService.js`):**
  - Crear un adaptador modular que permita elegir en el `.env` (`AI_IMAGE_PROVIDER=gemini | flux-replicate | pollinations-free`) y que llame automáticamente a FLUX si se quiere hiperrealismo de estudio a $0.003 USD.
- [ ] **Módulo `i2v` Cinematográfico en `src/videoEditor.js`:**
  - Agregar un endpoint en `server.js` (`/api/animate-piece`) que tome la imagen generada por `imageRenderer.js` y la envíe a un modelo `Image-to-Video` económico (como Fast-SVD / Luma en Replicate) con el prompt cinemático para exportar un Reel MP4 animado listo para Meta Ads.
- [ ] **Refinamiento CSS de Scrim en Plantillas (`src/imageRenderer.js`):**
  - Revisar si se desea añadir un degradé radial sutil en la zona central del calzado para separar aún más el producto oscuro de los fondos de taller.

---
*Fin del Checklist de Arquitectura y Motores IA para el Equipo Dev / Claude.*
