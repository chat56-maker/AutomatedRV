# Auditoría del flujo de visores · 12 de octubre de 2026

**Documento histórico.** El flujo vigente está descrito en [open-attention-protocol.md](open-attention-protocol.md). Los hallazgos de esta auditoría se conservan para interpretar sesiones anteriores.

Versión del conector: 1.0.3. Protocolo: `blind-phase-isolation-v3`.

## Hallazgos y cambios

| Recorrido | Antes | Ahora |
| --- | --- | --- |
| Referencia y adjuntos → visor | No se enviaban; `start` sólo seleccionaba ID, código y configuración | Se mantiene; prueba con marcadores de referencia, imágenes y feedback |
| Código del operador → modelo | Se enviaba literalmente, con instrucción de no interpretarlo | UUID aleatorio asociado a la ejecución; código original sólo en administración |
| Categorías y texto libre | Se enviaban a todos los visores | Excluidos en modo neutral; envío sólo en modo personalizado explícito |
| Instrucciones de fases futuras | Incluidas desde la captura | Cada fase recibe únicamente su tarea y contrato de salida |
| Nuevas impresiones en fases posteriores | Permitidas | Rechazadas, conservando la respuesta como fallo auditable |
| Contexto anterior | Sólo fases propias, incluyendo abstención e hipótesis | Lista explícita de impresiones y relaciones propias; sin texto de abstención, metadatos o fases futuras |
| Llamadas a modelos | Sin herramientas, conversaciones enlazadas ni respuestas anteriores del proveedor | Se mantiene y comprueba en los cuerpos HTTP construidos por el motor |
| Inspección de entrada | Hash del prompt | Prompt completo, hash y versión; interfaz y exportación |
| Feedback | Sólo jueces tras el cierre | Se mantiene; prueba con imagen y texto, sin alterar la captura ni contaminar la siguiente sesión |

## Contrato de cada fase

- **Captura:** código opaco y tarea de captura; cero registros anteriores. Puede producir hasta 20 descriptores de categoría libre o abstenerse; no hay mínimo. Sin relaciones ni hipótesis.
- **Estructura:** código y captura propia. Puede proponer relaciones; no agrega impresiones ni identidades.
- **Interpretación:** código, captura y estructura propias. Las hipótesis deben citar IDs de impresiones del mismo visor. No añade impresiones ni relaciones.

Se conservan modelos, nivel de razonamiento, concurrencia, límite de tokens y tiempos elegidos por el usuario. No se añade una etapa de meditación, validación subjetiva del origen de los descriptores, incentivos por acertar ni reintentos hasta obtener contenido.

Las preferencias antiguas se conservan. Sin `viewerGuidance: "custom"`, sus categorías e instrucciones no se envían en nuevas ejecuciones. Las sesiones históricas conservan código, configuración, resultados y hashes originales. Los prompts que no se guardaron en versiones anteriores no se reconstruyen como si fueran evidencia registrada.

## Verificación

Pruebas locales sin consumo del plan:

- 18 pruebas del conector: transporte, OAuth y motor. Incluyen inspección del cuerpo real construido para `/v1/responses` usando un servidor simulado, marcadores de contaminación, aislamiento paralelo y entre sesiones, y errores de fase.
- 16 pruebas del Site: integridad y sincronización, preferencias y reconexión. Incluyen aceptar todas las instantáneas de una ejecución real del motor con respuestas simuladas, en modo neutral y personalizado, y rechazar alteraciones de prompt, código o contexto.
- Comprobación de TypeScript y compilación de producción.

No se ejecutaron inferencias reales ni se consumieron créditos. La prueba de contenido es determinista: confirma qué envía nuestro código; no establece cómo responderá cada modelo. No se realizó una prueba visual en navegador en este entorno.

## Límites

Un prompt siempre condiciona a un modelo. Estas medidas eliminan rutas concretas de información y sugerencias evitables; no prueban ausencia absoluta de sesgos, independencia estadística, percepción extrasensorial ni protección infalible frente a instrucciones adversarias incrustadas en datos. El modo personalizado puede introducir pistas: queda señalado y no debe usarse para afirmar ausencia de orientación.

Los jueces conocen la evidencia al evaluar. Sus etiquetas no sustituyen una comparación ciega con señuelos ni una prueba estadística. Mostrar feedback no entrena los pesos del modelo ni introduce memoria entre sesiones.

Los hashes permiten revisar consistencia e inmutabilidad respecto de registros ya recibidos, pero no son una atestación del proveedor ni un sello de tiempo externo.
