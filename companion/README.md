# Limen — conector local

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
