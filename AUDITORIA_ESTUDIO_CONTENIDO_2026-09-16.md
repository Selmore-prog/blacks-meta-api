# Auditoría del Estudio y las piezas de contenido — 16/09/2026

## Punto de retorno

- Estado original: rama `codex/backup-content-studio-20260916`.
- Trabajo de esta mejora: rama `codex/content-studio-refresh`.
- Al iniciar, `main` estaba limpio; el backup apunta exactamente al estado anterior a estos cambios.

## Diagnóstico

El motor ya tenía buenas defensas internas: memoria de errores, anti-repetición de plantillas y arranques, dirección creativa, control factual, carruseles continuos, corrección puntual e historial de imágenes. La oportunidad principal estaba en la experiencia de uso:

1. El Estudio pedía producto + una idea libre, pero no diferenciaba intención comercial ni lenguaje visual. Eso hacía que pedidos distintos terminaran pareciéndose entre sí.
2. Editar copy, corregir imagen, regenerar y volver a una versión anterior vivían en lugares diferentes. Era difícil entender qué acción conservaba la pieza y cuál la rehacía.
3. Las variantes de copy usaban tres recetas fijas. No recibían la secuencia editorial reciente, aunque la generación principal sí tenía parte de ese contexto.
4. La biblioteca servía como descarga, pero no como memoria de trabajo para retomar una dirección anterior.
5. La interfaz explicaba capacidades técnicas, pero no guiaba una decisión creativa.

## Cambios aplicados

### Estudio creativo

- Nuevo constructor por pasos: producto, dirección creativa, formato y salida.
- Objetivos: venta, catálogo, marca, educativo y mayorista.
- Lenguajes visuales: automático, hero, uso real, técnico, bodegón e industrial.
- Presets rápidos de escena y selector visual de 4:5 / 9:16.
- Los objetivos y lenguajes ahora llegan al prompt de imagen y cambian la composición pedida.
- Biblioteca con filtros por foto/video y acción “Reusar” para recuperar el brief y el formato.

### Mesa de edición

- Preview, metadatos, copy y herramientas reunidos en un panel ancho.
- Acciones separadas por impacto: ajustar imagen, crear un concepto nuevo o recuperar versiones.
- Contador de caracteres y edición conjunta de caption, CTA y hashtags.
- Contexto visible de continuidad: qué pieza viene antes y cuál viene después.
- Laboratorio de copy con enfoques seleccionables: beneficio, uso, objeción, prueba, comunidad y B2B.
- Campo de indicación libre para pedir tono o restricciones sin regenerar la imagen.

### Continuidad y variedad

- Las alternativas reciben hasta 10 piezas recientes y los arranques usados.
- El prompt exige que la nueva opción funcione como un capítulo siguiente sin repetir tema, estructura o conclusión.
- Cada familia de enfoque contiene tres dinámicas distintas, en vez de una única terna fija para todos los casos.

## Formatos

Se mantienen como formatos principales 4:5 para feed y 9:16 para historias/reels. Son los dos lienzos que el renderer ya controla con zonas seguras y aprovechan mejor la pantalla que un cuadrado. Para Reels, el sistema conserva el flujo de video vertical con audio/edición posterior; para una imagen de feed, 4:5 sigue siendo el formato de trabajo más útil del proyecto.

## Próximas mejoras recomendadas

1. Guardar `goal`, `style` y el brief como columnas propias de `studio_assets` para reusar una pieza con fidelidad total, no sólo recuperar su texto.
2. Crear series editoriales persistentes (por ejemplo, “Lo que miramos antes de elegir”, “Producto en contexto”, “Equipos BLACKS”) con número de episodio y arco de 3–5 piezas.
3. Medir resultados por dinámica creativa, no sólo por pilar: hook, escena, densidad de texto, producto hero vs. uso real y CTA.
4. Agregar comparación A/B lado a lado antes de elegir una variante de imagen. Conviene hacerlo sólo cuando el costo por generación y la tasa de aprobación estén medidos.
5. Actualizar el README general: todavía describe una Fase 1, aunque el proyecto ya incluye publicación, video, analítica y varias etapas posteriores.

