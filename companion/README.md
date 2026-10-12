# Limen — conector local

Versión **1.0.3**. Separa las instrucciones por fase, usa orientación neutral por defecto y conserva los prompts completos para auditoría.

## Actualizar desde una versión anterior

1. Espera a que termine cualquier sesión activa. Detén el proceso anterior con **Ctrl+C** y cierra sus ventanas del navegador.
2. Descomprime el paquete 1.0.3 y reemplaza los archivos de la carpeta del conector anterior. Conserva `node_modules`; no hay dependencias nuevas.
3. Desde esa carpeta, ejecuta de nuevo `npm start -- --site https://limen-rv.zeros.chatgpt.site`.
4. Confirma que la terminal muestra **Limen 1.0.3**. Recarga el Site y pulsa **Abrir conector**. La cuenta ya autorizada se conserva; autoriza de nuevo sólo si el conector lo solicita.

No necesitas reinstalar Node.js ni borrar la carpeta de datos y credenciales. Si extrajiste el paquete a una carpeta nueva sin `node_modules`, ejecuta `npm install` una vez antes de iniciarlo. Los registros anteriores permanecen intactos. El protocolo revisado se aplica a nuevas ejecuciones; una sesión cerrada no se reejecuta por actualizar.

## Qué hace el visor IA

Cada ejecución asocia el código del operador a un UUID aleatorio, mostrado en Trazabilidad. Los visores reciben ese identificador, las instrucciones de su fase y exclusivamente sus propios registros previos. El código original, el target, sus archivos, el feedback y los registros de otros visores no entran en sus prompts.

En modo **Neutral** (predeterminado, también para preferencias antiguas sin selección explícita) no se envían categorías ni instrucciones libres. El modo **Personalizado** permite esas orientaciones, que pueden sesgar la respuesta y no deben contener pistas del target. Ningún modo elimina los sesgos que trae un modelo de su entrenamiento.

La captura propone descriptores tentativos de cualquier tipo, sin exigir acreditar su origen antes de registrarlos, sin ejemplos de contenidos y sin cuotas. Estructura sólo relaciona esos descriptores; interpretación sólo propone hipótesis con IDs propios. No pueden añadir impresiones nuevas. El incumplimiento se registra como error, conserva el texto bruto y no causa un reintento automático. Las instrucciones de tareas futuras no se envían a las fases anteriores.

La evidencia sólo se aporta a los jueces después del cierre. Las IA ejecutan todas las fases sin pedir impresiones humanas. El programa no contiene una fuente adicional de información del target ni certifica percepción extrasensorial.

Una captura totalmente vacía se conserva como **Sin impresiones** y cierra ese visor por defecto. Puedes elegir continuar en los parámetros del protocolo; aun así las etapas posteriores no añaden impresiones. Una abstención nunca se reemplaza por texto inventado por el conector. No hay reintentos para forzar impresiones ni evaluaciones de registros sin afirmaciones. Cada nueva ejecución conserva la versión del protocolo, el prompt completo y su hash en cada fase y en las llamadas fallidas. Puedes inspeccionarlos desde los registros de cada visor y en la exportación JSON. Los registros anteriores permanecen intactos.

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
