# Limen — conector local

Versión **1.1.0**. Añade apertura libre, preparación de atención abierta, exploración configurable y composición trazable por visor.

## Actualizar desde una versión anterior

1. Espera a que termine cualquier sesión activa. Detén el proceso anterior con **Ctrl+C** y cierra sus ventanas del navegador.
2. Descomprime el paquete 1.1.0 y reemplaza los archivos de la carpeta del conector anterior. Incluye el nuevo `viewer-flow.mjs`. Conserva `node_modules`; no hay dependencias nuevas.
3. Desde esa carpeta, ejecuta de nuevo `npm start -- --site https://limen-rv.zeros.chatgpt.site`.
4. Confirma que la terminal muestra **Limen 1.1.0**. Recarga el Site y pulsa **Abrir conector**. La cuenta ya autorizada se conserva; autoriza de nuevo sólo si el conector lo solicita.

No necesitas reinstalar Node.js ni borrar la carpeta de datos y credenciales. Si extrajiste el paquete a una carpeta nueva sin `node_modules`, ejecuta `npm install` una vez antes de iniciarlo. Los registros anteriores permanecen intactos. El protocolo revisado se aplica a nuevas ejecuciones; una sesión cerrada no se reejecuta por actualizar.

## Qué hace el visor IA

Cada ejecución asocia el código del operador a un UUID aleatorio, mostrado en Trazabilidad. Los visores reciben ese identificador, las instrucciones de su fase y exclusivamente sus propios registros previos. El código original, el target, sus archivos, el feedback y los registros de otros visores no entran en sus prompts.

En modo **Neutral** (predeterminado, también para preferencias antiguas sin selección explícita) no se envían categorías ni instrucciones libres. El modo **Personalizado** permite esas orientaciones, que pueden sesgar la respuesta y no deben contener pistas del target. Ningún modo elimina los sesgos que trae un modelo de su entrenamiento.

El flujo empieza con **apertura libre**, que registra fragmentos sin categorías ni puntuaciones. Sigue con **una a tres exploraciones** (dos por defecto), donde puede haber muchas impresiones distintas de la misma categoría o sin clasificar. No hay cuotas mínimas. El máximo configurable de 10–60 impresiones por pasada, 40 por defecto, es un techo y no una meta. Las categorías e instrucciones personalizadas sólo se envían en la exploración; nunca en la apertura.

La **atención abierta** repite una pauta de preparación antes de cada etapa de recogida: suspender expectativas, registrar fragmentos sin exigirles un origen verificable y apartar asociaciones identificativas. Es una adaptación experimental de una práctica contemplativa, no una meditación humana medida ni una garantía de precisión. Puedes seleccionar preparación directa para comparar. No se modifica el nivel de razonamiento, no se simula respiración y no se añade una espera artificial.

En el flujo completo, **estructura** agrupa las impresiones y propone relaciones; **composición** produce una descripción integrada con elementos, disposición, alternativas y aspectos sin resolver. Ambas usan sólo registros propios, citados por ID, y no añaden percepciones. Las asociaciones apartadas no se pasan como contexto. Una repetición literal se conserva, pero los jueces no la vuelven a puntuar dentro de ese visor. Las coincidencias entre visores no se consideran evidencia independiente por el mero hecho de repetirse.

El flujo completo usa hasta cinco llamadas por visor con los valores predeterminados: apertura + dos exploraciones + estructura + composición. Una apertura vacía no cierra la sesión: se completan las exploraciones. Si toda la recogida está vacía, el visor cierra como **Sin impresiones** por defecto. Puedes elegir continuar; aun así no se introducen impresiones nuevas durante la síntesis. Ninguna abstención se reemplaza por texto inventado por el conector. Los errores conservan su respuesta bruta y no se reintentan automáticamente.

Las IA ejecutan todas las fases sin pedir impresiones humanas. La evidencia sólo se aporta a los jueces después del cierre. El programa no contiene una fuente adicional de información del target ni certifica percepción extrasensorial. Cada fase conserva prompt, respuesta y hashes; los registros anteriores permanecen intactos. La composición es textual y no genera una imagen con detalles añadidos.

## Instalar por primera vez

Requiere Node.js 22.13 o posterior. El conector usa el OAuth oficial de ChatGPT para aplicaciones de código abierto. No solicita una API key ni un secreto de cliente.

1. Descomprime esta carpeta y abre una terminal dentro de ella.
2. Ejecuta `npm install` (o `npm ci` si tienes el archivo de bloqueo).
3. Ejecuta `npm start -- --site https://limen-rv.zeros.chatgpt.site`.
4. Abre el Site → Conexión → Abrir conector → Continuar con ChatGPT.
5. Autoriza tu plan, vuelve al Site y selecciona los modelos de tu cuenta.

Mantén la terminal y la ventana del conector abiertas. Las inferencias continúan en el proceso local si cierras el Site. Al volver a abrirlo, conecta el mismo equipo y abre la sesión para sincronizar. Un reinicio del proceso conserva las fases completas, marca la ejecución interrumpida y no vuelve a consumir automáticamente.

## Opciones

- `--port 1455`: puerto de loopback. Usa el mismo puerto en el Site.
- `--site https://...`: único origen web autorizado, sin ruta.
- `--data /ruta/privada`: carpeta de datos. Predeterminado: `~/.config/limen-rv`.
- `LIMEN_DATA_DIR`: alternativa a `--data`.

No publiques ni sincronices `accounts.json`: contiene credenciales de acceso y renovación. Los archivos usan permisos 0600 y el directorio 0700 en sistemas POSIX; no sustituyen el cifrado de disco ni una cuenta de sistema segura. Para desconectar, utiliza el botón de la ventana local. Si la revocación remota falla, revisa las aplicaciones autorizadas en ChatGPT.

Las llamadas consumen los límites de tu plan. El catálogo y las capacidades dependen de la cuenta. No se muestran saldos inventados ni se convierten tokens en créditos. Los parámetros que un modelo rechace producen un error visible; no se reintentan automáticamente. Una interrupción puede consumir uso aunque no se reciba el resultado completo.

## Verificación

`npm test` ejecuta pruebas sin credenciales y sin llamadas reales a OpenAI. La autenticación real requiere tu consentimiento en el navegador. El conector nunca entrega access tokens, refresh tokens o ID tokens al Site.
