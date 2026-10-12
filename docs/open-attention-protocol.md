# Apertura, atención y composición

Conector 1.1.0 · protocolo `open-attention-v4` · 12 de octubre de 2026.

## Propósito y fuentes

Esta revisión separa la recogida libre de la clasificación y permite ampliar un registro antes de componerlo. Las instrucciones humanas consultadas describen preparación relajada, progresión por etapas, separación de interpretaciones y un resumen de los componentes registrados. Se toma su organización como inspiración, sin asumir que exista un equivalente demostrado de meditación o percepción extrasensorial en un modelo.

- [CRV Manual, Structure — Remote Viewing Instructional Services](https://rviewer.com/introduction-to-the-controlled-coordinate-remote-viewing-manual/crv-structure-coordinate-controlled-remote-viewing-manual/): progresión de información y separación de la interpretación analítica.
- [Open Source CRV v3 — Daz Smith, 2012](https://www.remoteviewed.com/open%20source_v3.0.pdf): preparación en pp. 5–6, organización de datos en pp. 18–20 y resumen del visor en p. 32.
- [Remote Viewing Methodologies — IRVA](https://www.irva.org/remote-viewing-methodologies): panorama de métodos y preparación del participante humano.

Son fuentes de prácticas de RV, no ensayos que validen este procedimiento con IA. No se implementa literalmente un ejercicio fisiológico ni una duración humana de meditación.

| Principio utilizado | Adaptación en Limen |
| --- | --- |
| Preparación sin expectativas | Instrucción de atención abierta antes de cada etapa de recogida, sin ejemplos de contenido |
| Registro antes de interpretar | Apertura que sólo devuelve textos, sin etiquetas ni puntuaciones |
| Separación de asociaciones | Campo de asociaciones en exploración, archivado y excluido de las siguientes llamadas |
| Progresión hacia el conjunto | Exploraciones, grupos, relaciones y composición con referencias a registros propios |
| Conservar incertidumbres | Alternativas e incógnitas explícitas; ninguna obligación de identificar un objeto |

## Recorrido y contratos

La sesión recibe un UUID aleatorio asociado al código del operador. El UUID no se deriva del target. No se envían el código original, referencia, archivos, feedback, registros de otros visores ni historial. No hay herramientas, búsquedas o conversaciones enlazadas del proveedor.

1. **Apertura libre (`opening`).** La salida contiene `perceptions`, una lista de textos en orden, y `abstention`. No se pide tipo sensorial, categoría, intensidad o confianza. El conector asigna IDs y la marca interna `Sin clasificar`, que no es una instrucción al visor.
2. **Exploración (`capture`, `capture2`, `capture3`).** Cada impresión contiene `text`, `category` nullable y `basedOn`. Este último queda vacío para un fragmento nuevo o cita impresiones anteriores que se amplían. Las categorías se asignan después del texto; varias impresiones pueden tener la misma. `associations` conserva explicaciones apartadas, sin usarlas en llamadas posteriores.
3. **Estructura (`structure`).** `groups` organiza impresiones con etiquetas tentativas e IDs. Cada relación cita al menos dos IDs distintos de impresiones del visor; `uncertainties` conserva cuestiones abiertas. No se admiten nuevas impresiones.
4. **Composición (`compose`).** `overview`, `elements`, `layout` y `alternatives` describen el conjunto, sus componentes, relaciones e interpretaciones. Cada afirmación cita al menos un ID propio de impresión o relación. `unresolved` conserva lo que no se pudo determinar. No se agregan percepciones; no se genera una ilustración que rellene huecos.

Cada llamada recibe sólo su tarea, no las instrucciones de las fases futuras. El contexto contiene únicamente impresiones y, cuando existe, estructura propia. Excluye respuestas brutas, asociaciones, texto de abstención y metadatos. Una abstención de apertura no detiene las exploraciones; después de la última, si no hay impresiones en ninguna etapa de recogida, se omite la síntesis salvo elección explícita de continuar.

La atención abierta se incorpora en apertura y exploración. Pide suspender expectativas, no descifrar el código, dejar de desarrollar explicaciones anticipadas y anotar fragmentos sin exigir acreditar su origen. No solicita una narración de meditación, una cadena de pensamiento privada, respiración, espera artificial ni un estado fisiológico. La preparación directa omite ese párrafo para permitir comparaciones. No se cambian modelo ni nivel de razonamiento.

## Configuración

| Parámetro | Valores | Predeterminado |
| --- | --- | --- |
| `attentionMode` | `open`, `direct` | `open` |
| `capturePasses` | 1–3 | 2 |
| `maxImpressions` | 10–60 por etapa de recogida | 40 |
| `phases` | `capture` (apertura y exploración), `structured` (flujo completo) | `structured` |
| `viewerGuidance` | `neutral`, `custom` | `neutral` |
| `stopOnEmpty` | Cerrar tras recogida vacía o continuar | Cerrar |

El máximo es un techo, nunca una cuota. No existía una restricción de una impresión por categoría: el anterior prompt pedía brevedad y tenía un máximo de 20 impresiones totales. La revisión retira esa preferencia por descriptores breves, conserva matices y añade oportunidades de exploración. No garantiza más impresiones o mayor precisión.

Con flujo completo hay `1 + capturePasses + 2` llamadas por visor: 4–6, normalmente 5. Sin síntesis son `1 + capturePasses`: 2–4. Errores, cancelación y recogida totalmente vacía pueden reducirlas. Las evaluaciones añaden uso. Se mantienen los límites de tokens y tiempo existentes; una respuesta truncada o inválida se registra como error, sin reintento automático.

Las orientaciones personalizadas sólo se envían durante la exploración. La apertura siempre está libre de listas de categorías e instrucciones opcionales del operador. Esas orientaciones pueden introducir sesgos; el modo neutral no elimina los sesgos aprendidos del modelo.

## Repeticiones, contraste y trazabilidad

Una repetición literal dentro de un visor se conserva con `duplicateOf`. Para compararla se normalizan mayúsculas, Unicode, espacios y puntuación; no se emplea similitud semántica. Una percepción parecida pero diferente permanece separada. Los jueces reciben una sola vez cada texto repetido de ese visor; los registros de diferentes visores siguen separados. La repetición entre agentes no prueba independencia estadística.

La composición y las asociaciones no se añaden a la lista de percepciones evaluadas. Los jueces sólo reciben feedback tras el cierre; éste no reescribe registros ni entrena pesos del modelo.

Cada fase conserva su entrada completa, respuesta bruta, salida estructurada, uso y hashes. El motor y el Site comparten la construcción del prompt y el parser. El Site reconstruye la entrada esperada y vuelve a interpretar el texto bruto: rechaza prompts alterados, referencias ajenas o datos estructurados distintos de la respuesta original. Los IDs acreditan procedencia dentro del registro, no que una frase esté semánticamente justificada ni sea verdadera. Esa revisión sigue siendo necesaria.

Las sesiones v1–v3 conservan configuración, contratos y hashes. La actualización no reejecuta sesiones cerradas. Cambiar los prompts o contratos de v4 en una versión futura exige una versión de protocolo nueva y conservar el validador histórico.

## Verificación y alcance

41 pruebas deterministas: 24 del conector y 17 del Site. Cubren apertura libre, múltiples percepciones por categoría, configuración de pasadas, contexto aislado, asociaciones excluidas, repeticiones, composición con IDs, vacío y cancelación, errores sin reintentos, transporte, OAuth y puente. La integración ejecuta el motor con respuestas simuladas y valida cada instantánea como lo hace el Site, incluyendo protocolos históricos. Se comprueban TypeScript y la compilación de producción.

No se consumieron créditos ni se probaron respuestas reales de un modelo para validar eficacia. No se realizó verificación visual en navegador en este entorno. La actualización requiere descargar el conector 1.1.0 completo; incluye `viewer-flow.mjs` y no cambia dependencias.

Estas medidas hacen el recorrido más explícito y auditable. No demuestran un estado meditativo de IA, ausencia de sesgos, independencia entre modelos o eficacia de RV. Para comparar preparaciones hacen falta condiciones fijadas antes de ejecutar, evaluación ciega y criterios que no premien simplemente producir más frases.
