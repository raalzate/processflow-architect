# Privacidad — qué datos salen de tu equipo

Processflow Architect es una aplicación de escritorio. **No tiene cuenta de usuario, ni servidor
propio, ni telemetría**: la app no envía analítica, ni reportes de uso, ni errores a nadie. Tus
proyectos, modelos descargados, llaves de IA y registros se guardan en tu equipo.

Algunas funciones necesitan red. Todas, salvo dos que se indican, se activan sólo cuando las
usas, y ninguna le manda datos al autor de la app.

| Función | Cuándo pasa | Qué sale | A quién |
|---|---|---|---|
| **Buscar actualizaciones** | Al abrir la app y desde Ajustes → Actualizaciones | Tu dirección IP y la versión instalada (en la petición HTTP) | GitHub (`api.github.com`, descarga del release) |
| **Descargar modelos de IA local** | Al pulsar «Descargar» en Ajustes | Tu dirección IP y la petición del archivo | Hugging Face (`huggingface.co`) |
| **Cargar las bibliotecas de IA y de lectura de documentos** | La primera vez que se usa la IA local, la voz o la lectura de PDF/imágenes | Tu dirección IP y la petición de la biblioteca | jsDelivr (`cdn.jsdelivr.net`) |
| **IA remota** (apagada por defecto) | Sólo si la activas en Ajustes y cargas tu propia llave | El texto de la pregunta y el contexto del proyecto que la tarea necesita | El proveedor que elijas: Google (Gemini), OpenAI, Anthropic u OpenRouter |
| **Agente por CLI** (opcional) | Sólo si eliges ese motor en Ajustes | Lo mismo que la IA remota, a través de la herramienta de línea de comandos que tengas instalada | El proveedor de esa herramienta |
| **Leer la marca de un sitio web** | Sólo cuando escribes la dirección de un sitio en Ajustes → Marca | La petición de esa página | El sitio que indicaste |
| **Colaboración en tiempo real** (apagada por defecto) | Sólo cuando vinculas un proyecto o aceptas una invitación | Tu nombre visible, el identificador de tu equipo, tu dirección IP y el proyecto compartido, cifrado de extremo a extremo | Los equipos de las personas de la sala. Si no hay ruta directa, un relay de transporte: los públicos de n0 o el tuyo ([ADR 0008](docs/decisions/0008-colaboracion-red-y-relay.md)). El relay ve los metadatos de la conexión, pero no puede leer el proyecto |

El servidor MCP de la app escucha **sólo en tu equipo** (`127.0.0.1`) y no acepta conexiones de
otras máquinas.

## Tus llaves y tus datos

- Las llaves de los proveedores de IA se guardan **cifradas con el llavero del sistema**
  (`safeStorage`). Nunca llegan a la interfaz ni a los registros, y se envían sólo al proveedor
  correspondiente, desde el proceso principal de la app.
- Con IA remota o con el agente por CLI, lo que envías queda sujeto a la **política de privacidad
  y a los términos del proveedor** que elegiste, con tu propia cuenta. Revísalos antes de mandar
  información sensible. La IA local, que es la opción por defecto, no envía nada.
- En la colaboración, cada participante guarda su propia copia del proyecto. Quien recibe una
  invitación puede ver y, según su permiso, editar el proyecto compartido.

## Cómo borrar tus datos

Todo lo que guarda la app está en su carpeta de datos. En macOS es
`~/Library/Application Support/Processflow-Architect`; en Windows, `%APPDATA%\Processflow-Architect`;
en Linux, `~/.config/Processflow-Architect`. Para borrarlo todo, cierra la app y elimina esa
carpeta.

## Marco legal

El autor de la app no recolecta, no almacena y no trata datos personales de quienes la usan: no
recibe ninguna de las conexiones de la tabla. Este documento cumple el deber de **informar con
transparencia** qué datos salen del equipo y hacia quién, en el espíritu de la Ley 1581 de 2012 y
el Decreto 1377 de 2013 de Colombia, y del Reglamento General de Protección de Datos (GDPR) de la
Unión Europea. Las solicitudes sobre datos tratados por un proveedor de IA, por GitHub, por
Hugging Face o por un relay se dirigen a ese proveedor.

Si una versión nueva agrega una conexión de red, este documento se actualiza en el mismo cambio.
Preguntas o reportes: [issues del repositorio](https://github.com/raalzate/processflow-architect/issues).

_Última actualización: 10 de noviembre de 2026 (versión 0.23.0)._
