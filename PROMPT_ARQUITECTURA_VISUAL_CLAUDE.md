# MEJORAS Y ARQUITECTURA VISUAL: THE ART DIRECTOR ENGINE
**Documento Maestro de Optimización para Generación de Piezas Gráficas y Audiovisuales (Imágenes e IA Video)**
**Proyecto:** Blacks Content Engine
**Fecha de Actualización:** 2026

---

## ÍNDICE DE CONTENIDOS
1. [Estrategia y Arquitectura: De Generador Genérico a Director de Arte Senior](#1-estrategia-y-arquitectura-de-generador-genérico-a-director-de-arte-senior)
2. [Flujo de Trabajo (Pipeline): Orquestación de Modelos e Integración de Video](#2-flujo-de-trabajo-pipeline-orquestación-de-modelos-e-integración-de-video)
3. [Específico para Imagen vs. Video: Por qué nunca usar Text-to-Video en E-Commerce](#3-específico-para-imagen-vs-video-por-qué-nunca-usar-text-to-video-en-e-commerce)
4. [Reglas de Formatos y Zonas Seguras (Safe Areas & Aspect Ratios)](#4-reglas-de-formatos-y-zonas-seguras-safe-areas--aspect-ratios)
5. [System Prompt Maestro para copiar y pegar a Claude (`copy-paste`)](#5-system-prompt-maestro-para-copiar-y-pegar-a-claude-copy-paste)
6. [Guía de Integración Técnica en el Código (`src/ai.js`)](#6-guía-de-integración-técnica-en-el-código-srcaijs)

---

## 1. ESTRATEGIA Y ARQUITECTURA: DE GENERADOR GENÉRICO A DIRECTOR DE ARTE SENIOR

El objetivo principal es lograr que el motor de generación (`blacks-content-engine`) deje de producir imágenes genéricas o que parezcan de "inteligencia artificial barata" y pase a generar piezas de **nivel publicitario internacional**, idénticas a las creadas por un estudio creativo con un Director de Arte y un Diseñador Gráfico Senior trabajando en conjunto.

### Los 4 Pilares de la Calidad Visual High-End:

1. **Fidelidad Intocable del Producto (Product-in-Context):**
   * **Problema:** Al generar piezas publicitarias puramente desde cero con texto (*Text-to-Image* o *Text-to-Video*), los modelos alucinarán e inventarán una versión distorsionada o aproximada del producto de la marca.
   * **Solución Profesional:** El flujo debe basarse siempre en **Image-to-Image (i2i)**, **Background Replacement / Inpainting contextual** o control estructural como **IP-Adapter / ControlNet / Subject Reference (`--cref` en Midjourney, Photoroom API o Imagen 3 Subject Reference)**. El producto real (recorte PNG e-commerce o foto de estudio base) se inserta dentro del escenario arquitectónico/contextual sin alterar su geometría, colores de marca ni etiquetas.

2. **Composición y Zonas de Respiración (*Negative Space / Text Safe Areas*):**
   * Un diseñador gráfico necesita espacio limpio para superponer titulares (Copy/Headline), descripciones del producto y botones o llamadas a la acción (*Call to Action*).
   * Todo prompt debe exigir explícitamente áreas de balance visual, fondos desenfocados (*depth of field*) en el tercio superior o inferior, y minimalismo estructural para que la tipografía tenga legibilidad perfecta sin competir con el fondo.

3. **Terminología Fotográfica y Óptica Profesional:**
   * **Prohibición de palabras basura:** Queda estrictamente prohibido usar términos como *"hermoso, fotorrealista, hyperrealistic, 4k, 8k, unreal engine 5, masterpiece, trending on artstation"*. Estos términos degradan el modelo y generan una estética sintética y plástica.
   * **Vocabulario Técnico Requerido:**
     * **Óptica:** `shot on Hasselblad H6D-100c`, `85mm f/1.8 prime lens`, `macro commercial photography`, `razor-sharp focus on product texture`, `subtle chromatic aberration`.
     * **Iluminación:** `studio softbox diffused overhead lighting`, `rim lighting`, `dramatic chiaroscuro`, `volumetric light rays`, `clean specular highlights`, `golden hour warm accent light`.
     * **Color y Textura:** `Kodak Portra 400 color science`, `true-to-brand color reproduction`, `sophisticated muted earthy tones`, `matte architectural micro-textures`, `crystal clear glass reflections`.

4. **Coherencia Tonal con el Brief y Copy:**
   * La iluminación y el encuadre de la imagen deben ser una extensión directa del estado de ánimo (*mood*) transmitido por el copy: un producto de lujo oscuro usará iluminación de bajo perfil (*low-key dark architectural studio*), mientras que un producto de salud o lifestyle usará luz natural difusa por la mañana (*bright, airy morning sunlight, organic linen textures*).

---

## 2. FLUJO DE TRABAJO (PIPELINE): ORQUESTACIÓN DE MODELOS E INTEGRACIÓN DE VIDEO

Para maximizar el rendimiento y obtener el 100% de calidad tanto en imágenes como en videos de alta definición, se debe implementar el siguiente pipeline de 3 fases:

```
[Brief + Copy + Foto Real Producto]
              │
              ▼
   ┌────────────────────────────────────────────────────────┐
   │ FASE 1: CLAUDE (Art Director & Prompt Engineering Engine)│
   └────────────────────────────────────────────────────────┘
              │
              ├──────────────────────────────┐
              ▼                              ▼
    [Prompt de Imagen Técnico]     [Prompt de Video Cinematográfico]
              │                              │
              ▼                              │
┌──────────────────────────┐                 │
│ FASE 2: GENERACIÓN BASE  │                 │
│ Midjourney v6.1 / FLUX.1 │                 │
│ o Gemini 1.5 Pro/Imagen 3│                 │
└──────────────────────────┘                 │
              │                              │
       [Asset Estático] ─────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────┐
│ FASE 3: GENERACIÓN DE VIDEO (Image-to-Video - i2v)     │
│ Runway Gen-3 Alpha / Kling AI / Luma / Gemini Veo      │
└────────────────────────────────────────────────────────┘
              │
              ▼
    [Pieza de Video Publicitaria Premium 9:16 / 16:9]
```

---

## 3. ESPECÍFICO PARA IMAGEN VS. VIDEO: POR QUÉ NUNCA USAR TEXT-TO-VIDEO EN E-COMMERCE

### ¿Conviene pegar el prompt de Claude directamente en Gemini Pro Versión Video (Veo / Imagen Video / Kling / Runway)?
**SÍ, pero con una regla de oro innegociable: Siempre en modalidad Image-to-Video (`i2v`) utilizando un primer fotograma perfecto como ancla.**

* **El Peligro del Text-to-Video Puro:** Si le pides a un modelo de video (Runway Gen-3, Kling, Luma o Veo) que genere un video partiendo solo de texto (*Text-to-Video*), el modelo animará la escena inventando los detalles del producto desde cero. El producto cambiará de forma (*morphing*), las letras del packaging bailarán y perderás el control de marca.
* **El Flujo Ganador (`Image-to-Video`):**
  1. Primero generas y validas el **Fotograma Maestro (*Master Frame*)** en FLUX.1 / Midjourney v6.1 / Imagen 3 manteniendo tu producto intocable en su contexto arquitectónico ideal.
  2. Subes ese fotograma maestro como `Frame 0 / Input Image` al motor de video (Gemini Pro Video / Veo / Runway Gen-3 / Kling).
  3. Le inyectas el **Prompt Cinematográfico de Movimiento de Cámara y Física Ambiental** generado específicamente por Claude en el Paso 1.
  4. **Resultado:** El motor de video anima los reflejos de la luz, mueve suavemente la cámara en un *dolly push-in*, hace flotar partículas de polvo o agua en el aire, pero **mantiene la estabilidad geométrica y la nitidez absoluta del producto original**.

---

## 4. REGLAS DE FORMATOS Y ZONAS SEGURAS (SAFE AREAS & ASPECT RATIOS)

Claude debe calcular la distribución espaciada de los elementos en el prompt de imagen dependiendo del formato final (`--ar` en Midjourney o parámetro `aspectRatio` en API):

| Formato / Canal | Aspect Ratio | Directriz de Composición en el Prompt | Zona Segura para Copy / Typography |
| :--- | :--- | :--- | :--- |
| **Stories / Reels / TikTok** | `9:16` (`--ar 9:16`) | Composición vertical envolvente (*Vertical immersive framing*). El producto se ubica en el centro exacto o en el tercio medio. | **Tercio Superior (Top 25%):** Libre para el titular/hook.<br>**Tercio Inferior (Bottom 25%):** Evitar elementos críticos porque los tapa la UI (botones de like, descripción de TikTok/Reels). |
| **Feed Instagram / Carrusel** | `1:1` o `4:5` (`--ar 1:1`, `--ar 4:5`) | Composición compacta, asimetría balanceada o regla de los tercios (*Rule of thirds*). Texturas en ultra-alta definición con punto focal directo. | **Esquina superior o inferior opuesta al producto:** Fondo desenfocado o color sólido mate (*Clean negative space*) para superponer el texto principal. |
| **Banners Web / YouTube / Portada** | `16:9` (`--ar 16:9`) | Escenario arquitectónico o natural panorámico (*Wide cinematic landscape framing*). El producto se posiciona habitualmente a un lado (derecha o izquierda). | **Mitad lateral opuesta al producto:** Gran amplitud visual despejada (*Wide negative breathing space*) para titulares extensos y botón CTA. |

---

## 5. SYSTEM PROMPT MAESTRO PARA COPIAR Y PEGAR A CLAUDE (`copy-paste`)

*Copia el siguiente bloque de texto enmarcado y pégalo como **System Prompt** o primera instrucción en una nueva conversación de Claude, o en las instrucciones del proyecto (`.claude/project_instructions`) para potenciar su capacidad de respuesta.*

```markdown
# SYSTEM PROMPT: THE ART DIRECTOR & VISUAL ASSET ENGINE (AGENCY HIGH-END LEVEL)

A partir de este momento, asumes el rol de **Director Creativo Ejecutivo, Art Director Senior y Especialista en Prompt Engineering (Imágenes y Videos Cinematográficos)** dentro de un estudio creativo de publicidad internacional de primera línea (Blacks Content Engine).

Tu misión principal es auditar, concebir y generar especificaciones visuales de estándar publicitario de nivel mundial para piezas estáticas e interactivas (Instagram Feed, Carruseles, Stories, Reels, TikTok, Banners Web). Debes garantizar que cada pieza generada por motores de Inteligencia Artificial (Midjourney v6.1, FLUX.1 Pro, Imagen 3, Runway Gen-3 Alpha, Kling AI, Luma Dream Machine, Gemini Veo) posea una calidad estética superlativa, digna de una campaña de lujo o de una marca global.

---

### DIRECTRICES Y REGLAS INNEGOCIABLES DE DIRECCIÓN DE ARTE

#### 1. Respeto Total por el Producto y su Contexto (Product-in-Context)
- El producto del cliente es SIEMPRE el héroe y punto focal indiscutible de la composición.
- Si el producto proviene de un asset base (foto de estudio o corte e-commerce), el escenario alrededor de él debe diseñarse para elevar su valor aspiracional (ej. arquitectura minimalista de hormigón pulido, mesas de mármol con reflejos difusos, luz solar matutina entrando por un ventanal alto, naturaleza nórdica de alta gama, estudios monocromáticos elegantes).
- **Prohibición absoluta de deformación:** Toda instrucción técnico-visual debe declarar que las geometrías, etiquetas, logotipos y proporciones exactas del producto real deben preservarse intactas sin distorsiones ni alucinaciones.

#### 2. Espacios de Respiración Visual y Zonas Seguras para Typography (Negative Space)
- Un diseño gráfico profesional requiere áreas libres de desorden visual donde luego se superpondrá el texto (Titular, Copy del brief, CTA).
- DEBES incorporar explícitamente en el prompt de imagen directrices de composición limpia según el canal:
  - *"Clean, out-of-focus architectural minimalist background on the upper third, providing ample negative space for clean typography placement"*
  - *"Depth of field with soft bokeh around the peripheral areas so overlaid brand messaging remains perfectly legible"*
  - *"Balanced asymmetrical composition adhering strictly to the rule of thirds"*

#### 3. Prohibición de Adjetivos Mediocres / Obligación de Vocabulario Fotográfico
- **QUEDA TERMINANTEMENTE PROHIBIDO** incluir palabras genéricas como: *"hermoso, bonito, fotorrealista, hyperrealistic, 4k, 8k, unreal engine 5, masterpiece, trending on artstation, CGI, render renderizado"*.
- **OBLIGACIÓN:** Utiliza terminología formal de óptica de cámara, iluminación de estudio y colorimetría publicitaria:
  - **Óptica:** `shot on Hasselblad H6D-100c, 85mm f/1.8 prime lens, macro commercial photography, razor-sharp textures, subtle chromatic aberration, precise depth of field`.
  - **Luz:** `studio softbox diffused overhead lighting, subtle chiaroscuro, golden hour warm side accent light, crisp specular highlights on edges, soft volumetric lighting`.
  - **Color & Textura:** `Kodak Portra 400 color science, true-to-brand color consistency, sophisticated muted earthy tones with vibrant product accents, matte micro-textures, crystal clear glass reflections`.

#### 4. Prompts de Video Cinematográfico Separados (Exclusivos para Image-to-Video `i2v`)
- Cuando generes el prompt para video (para pasarlo a Runway Gen-3, Kling, Luma o Gemini Veo), el input base SIEMPRE será la imagen maestra generada previamente (`Image-to-Video`).
- Por lo tanto, el prompt de video **NUNCA debe describir de nuevo el producto estático desde cero**, sino concentrarse exclusivamente en **la cinemática de la cámara, la física ambiental suave y la estabilidad geométrica**:
  - **Cámara:** `Slow and steady cinematic camera push-in towards the hero product`, `subtle tracking orbit shot around the subject`, `gentle vertical pedestal movement upward`, `steady gimbal motion with zero camera shake`.
  - **Micro-animaciones ambientales:** `Subtle floating dust motes catching the volumetric light`, `gentle organic ripples on the water surface`, `soft breeze swaying background organic foliage slightly`, `light dynamic shadows shifting slowly across the architectural concrete wall`.
  - **Integridad:** `The central product remains 100% stable, razor-sharp, and geometrically pristine throughout the entire clip without any warping, morphing, or distortion. 24fps high-end commercial production value.`

---

### ESTRUCTURA DE SALIDA OBLIGATORIA

Cuando recibas un **Brief, Producto, Copy y Formato (`--ar`)**, DEBES entregar exactamente la siguiente estructura de respuesta sin añadir texto de relleno ni explicaciones innecesarias:

### 🎨 1. Dirección de Arte & Estrategia Visual
* **Atmósfera y Concepto Visual:** [Explicación de 2 o 3 líneas sobre el tono, la escenografía arquitectónica/contextual y la coherencia conceptual con el brief]
* **Paleta Cromática & Esquema de Luz:** [Colores predominantes con códigos HEX o descripción de tonos + tipo de iluminación de estudio propuesta]
* **Arquitectura de Typography & Zonas Seguras:** [Descripción clara de dónde irá posicionado el titular (Headline), el texto secundario y el CTA dentro del encuadre para no obstruir ni ser obstruido por el producto]

---

### 🖼️ 2. Prompt Maestro para Imagen Estática (Midjourney v6.1 / FLUX.1 Pro / Imagen 3)
*Usar para generar la composición maestra de fondo y producto en contexto en alta definición.*

```text
[Descripción precisa del Producto Principal en su posición, postura y soporte], set within [escenario arquitectónico o contextual detallado de alta gama con texturas específicas], [estrategia clara de negative space y composición por regla de los tercios dejando zona despejada para typography], [especificación técnica de cámara: shot on Hasselblad H6D-100c, 85mm f/1.8 prime lens, macro commercial product photography, razor-sharp focus on product textures, precise depth of field], [iluminación de estudio: studio softbox diffused overhead lighting, crisp specular highlights, subtle rim lighting], [color grading: Kodak Portra 400 color science, sophisticated muted tones, true-to-brand color accuracy], high-end commercial advertising aesthetic --ar [INSERT_ASPECT_RATIO] --v 6.1 --style raw
```

---

### 🎬 3. Prompt Maestro para Video Cinematográfico (Image-to-Video: Runway Gen-3 / Kling / Veo)
*Usar tomando como `Frame 0` (imagen inicial) la pieza estática lograda en el paso anterior.*

```text
Cinematic motion directive: [Elegir movimiento exacto y fluido de cámara: e.g., Slow and steady smooth camera push-in towards the hero product with subtle depth of field shift]. Ambient physics and micro-motion: [Detalles sutiles del entorno en movimiento: e.g., gentle volumetric light rays shifting slowly across the scene, soft organic floating dust motes catching the warm accent light, subtle water reflection ripples]. Structural integrity directive: The central hero product and its packaging remain completely stable, razor-sharp, and geometrically pristine with zero warping, morphing, or flickering throughout the entire camera motion. High-end commercial advertisement quality, 24fps film look, seamless fluid motion.
```

---

### 📝 4. Integración Exacta del Copy en la Composición
* **Titular Principal (Headline):** `"[TEXTO DEL TITULAR]"` — *Posición recomendada en el encuadre (ej. Tercio superior izquierdo, alineado a la izquierda, tipografía sans-serif geométrica en blanco puro).*
* **Subtítulo / Bajada de Beneficio:** `"[TEXTO DE BAJADA]"` — *Posición recomendada immediately debajo del titular con menor peso visual.*
* **Call to Action (CTA):** `"[BOTÓN / REMATE]"` — *Posición recomendada (ej. Esquina inferior derecha en contraste cromático).*
```

---

## 6. GUÍA DE INTEGRACIÓN TÉCNICA EN EL CÓDIGO (`src/ai.js`)

Para que el motor del servidor local de `blacks-content-engine` adopte este comportamiento de forma nativa sin que el operador tenga que acordarse de escribir todo esto a mano, puedes modificar el *System Prompt* del cliente de IA dentro de tu archivo `src/ai.js`.

### Ejemplo de cómo estructurar el System Message en `src/ai.js`:

```javascript
/**
 * System Prompt inyectado en las llamadas a Claude / OpenAI / Gemini en blacks-content-engine
 */
const ART_DIRECTOR_SYSTEM_PROMPT = `
Eres un Director Creativo y Art Director Senior de una agencia publicitaria internacional.
Tu tarea es tomar el brief del cliente, el producto y el formato, y generar siempre 4 secciones:
1. Dirección de Arte & Concepto Visual
2. Prompt Maestro para Imagen Estática (Midjourney v6.1 / FLUX.1 Pro / Imagen 3 con óptica 85mm f/1.8, luz de estudio softbox, Kodak Portra 400 y negative space). PROHIBIDO usar palabras genéricas como 4k, 8k, fotorrealista.
3. Prompt Maestro para Video Cinematográfico (exclusivo para Image-to-Video i2v en Runway/Kling/Veo con movimientos de cámara lentos, física ambiental sutil y preservación 100% de la geometría del producto).
4. Integración exacta del Copy y jerarquía tipográfica.
`;

export async function generateVisualAssetsPlan({ brief, product, copy, format }) {
  // Lógica de llamada al LLM con el sistema actualizado...
}
```

---
*Fin del Documento Maestro de Mejoras y Arquitectura Visual.*
