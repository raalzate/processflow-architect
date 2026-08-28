# Gotchas — lo que ya nos costó horas

Formato fijo: **síntoma observable → causa raíz → regla → mecanismo que la hace fallar**.
Se escribe en el momento en que se paga, no "cuando haya tiempo" (`/lesson <incidente>`).

Higiene: si un test o un hook ya garantiza la regla, la entrada se recorta a una línea que apunta
al mecanismo. La prosa duplicada sólo gasta contexto.

Cada entrada está **espejada** en un issue cerrado (`Issue: #N`, label `gotcha`) para poder citarla
desde un PR o una discusión. El archivo sigue siendo la fuente: es lo que exige la regla INCIDENTE
del lint y lo que viaja con el clon. Espejar uno nuevo: `node scripts/sdd-github.mjs mirror-docs --apply`.

---

### GOTCHA: el motor local no arranca en el binario empaquetado

Issue: #95

Síntoma: la IA local funciona en `npm run electron-dev` y en el `.dmg` no; el renderer no ve `navigator.gpu`.
Causa:   WebGPU viene `disabled_off` en Electron, y los schemes privilegiados (`app://`,
         `litert-model://`) tienen que registrarse una sola vez y como `secure`, o el binario
         empaquetado no expone WebGPU.
Regla:   `main.ts` conserva `enable-unsafe-webgpu` y `enable-features: WebGPU`; jamás se reactiva
         `app.disableHardwareAcceleration()`; los schemes se registran una vez y `secure: true`.
Mecanismo: regla WEBGPU de `scripts/repo-lint.mjs` (los switches y la prohibición); el resto es
         `CONSTITUTION.md` §P7 + review.

### GOTCHA: `onnxruntime-node` mata el proceso al generar con Gemma

Issue: #96

Síntoma: el proceso muere sin excepción de JS (crash nativo) al pedir generación.
Causa:   `onnxruntime-node` no soporta ese modelo; no es un error de configuración, no hay flag que
         lo arregle.
Regla:   el motor local es `@litert-lm/core` sobre WebGPU **en el renderer**. No se vuelve a
         intentar generar desde el proceso main con onnxruntime.
Mecanismo: ninguno ejecutable — memoria y `CLAUDE.md`. La dependencia sigue en `overrides` por otras
         rutas del árbol, así que la trampa está viva: candidato a regla de lint si reaparece.

### GOTCHA: editás el agente local y la app sigue con el código viejo

Issue: #97

Síntoma: cambios en `src/lib/ai/litert-agent.ts` o en el motor no tienen ningún efecto; ni error, ni
         comportamiento nuevo.
Causa:   Fast Refresh de Next no re-evalúa esos módulos (viven detrás del arranque del motor).
Regla:   tras tocar el agente o el motor, **matar y relanzar** `npm run electron-dev`. Si el cambio
         "no hizo nada", primero relanzar y recién después dudar del cambio.
Mecanismo: ninguno ejecutable (es del entorno de desarrollo, no del artefacto). Memoria pura.

### GOTCHA: el servidor MCP no encuentra las herramientas exportadas por un barrel

Issue: #98

Síntoma: `npx tsx mcp-server/index.ts` arranca pero faltan herramientas, o el import resuelve `undefined`.
Causa:   un `export *` (barrel) no sobrevive la resolución de `tsx` en ese entry point.
Regla:   en `mcp-server/`, importar cada módulo por su ruta concreta; nada de barrels.
Mecanismo: ninguno ejecutable — memoria. Se nota al arrancar el servidor.

### GOTCHA: `vitest run` verde y el build roto igual

Issue: #99

Síntoma: tests verdes, `npm run build` falla por un import inválido o un tipo.
Causa:   vitest transpila por archivo y **no** hace type-check del proyecto; dev y prod además
         resuelven módulos distinto (y el empaquetado de Electron agrega asar).
Regla:   nada se entrega con una sola señal. El entregable es `npm run gate`.
Mecanismo: `scripts/gate.sh`, el hook `Stop` (`.claude/hooks/gate-stop.mjs`) y el job `gate` de CI.

### GOTCHA (RESUELTA): correr el gate completo con la app abierta rompía el dev server

Issue: #100

Síntoma: la ventana de Electron mostraba `Runtime Error · Cannot find module './1331.js'` con un
         require stack que apuntaba a `.next/server/webpack-runtime.js`.
Causa:   `npm run gate` incluye `npm run build`, y `next build` reescribía `.next/` — el MISMO
         directorio desde el que servía `next dev`. El dev server quedaba pidiendo chunks que
         ya no existían.
Regla:   ya no aplica: el gate se puede correr con la app abierta.
Mecanismo: `next.config.ts` da al dev server su propio `distDir` (`.next-dev/`), así el build de
         producción no lo pisa. El aviso que traía `gate.sh` se retiró porque describía un
         problema que dejó de existir.

### GOTCHA: la app lanzada por el agente muere al terminar la tarea

Issue: #101

Síntoma: la ventana de Electron se cierra sola; el log termina en `exited with signal SIGTERM`
         sin ninguna línea de crash.
Causa:   se lanzó como proceso HIJO de una tarea en segundo plano del agente; al detenerse la
         tarea, el hijo recibe SIGTERM.
Regla:   lanzarla desprendida (`nohup … & disown`) para que su ciclo de vida no dependa del
         agente. El trabajo del MCP no se pierde igual (cada `add_node`/`add_edge` persiste en
         `<workspace>/.processflow/diagrams`), pero la conexión del agente sí se corta.
Mecanismo: ninguno ejecutable — memoria.

### GOTCHA: cablear un tipo de componente rompe las otras notaciones

Issue: #102

Síntoma: una vista BPMN o C4 pierde iconos/colores, o un contenedor deja de comportarse como tal,
         después de un cambio que "sólo tocaba DDD".
Causa:   el tipo se comparó contra un literal (`tipo_elemento === "Contexto Delimitado"`) en vez de
         derivarse del registro de notaciones.
Regla:   `src/lib/notations.ts` es la única fuente de verdad. Los archivos que ya lo violan son
         deuda declarada y esa lista sólo baja.
Mecanismo: regla NOTACION de `scripts/repo-lint.mjs` + allowlist en `.claude/harness.config.json`.

### GOTCHA: `ENOENT __harness-selftest-tmp.tsx` en el build de Next

Issue: #103

Síntoma: correr el gate con `next dev`/`electron-dev` vivo deja el navegador en
         `Build Error — ENOENT: no such file or directory, stat '…/__harness-selftest-tmp.tsx'`,
         reportado sobre `globals.css`. Recargar lo arregla y vuelve al gate siguiente.
Causa:   el self-test probaba los frenos del lint **escribiendo archivos temporales dentro de
         `src/`** y borrándolos al instante. El watcher de Next y el escaneo de contenido de
         Tailwind los alcanzaban a ver; cuando iban a leerlos ya no existían.
Regla:   el arnés no escribe nunca en el árbol de fuentes. Para probar un freno del lint se le pasa
         el contenido por stdin y la ruta sólo elige las reglas:
         `node scripts/repo-lint.mjs --file <ruta virtual> --stdin`.
Mecanismo: `--stdin` en `scripts/repo-lint.mjs` + el helper `lintVirtual`/`frenoDelLint` del
         self-test, y un caso del propio self-test que falla si vuelve a quedar un
         `__selftest*` dentro de `src/`.

### GOTCHA: gate verde en local, rojo en CI por el link-check de docs

Issue: #104

Síntoma: `npm run gate` verde en la máquina y `GATE ROJO — señales fallidas: link-check de docs`
         en GitHub Actions, con `AGENTS.md: enlace rota → .tessl/RULES.md` y cuatro punteros más.
Causa:   `docs-linkcheck.mjs` medía la existencia contra el **disco** (`fs.existsSync`). `.tessl/`
         la genera `tessl install` y está gitignored: existe acá y no en el clon del runner. La
         señal dependía de la máquina, que es la peor variante de señal.
Regla:   una ruta citada "existe" si la tiene el CLON, no si la tiene tu disco. Lo que produce una
         herramienta externa fuera del control de versiones se **declara** en
         `.claude/harness.config.json` → `docs.externalPaths`; no se tapa el error.
Mecanismo: `docs-linkcheck.mjs` mide contra `git ls-files` (un archivo nuevo sin `git add` vale;
         uno gitignored, no, y el mensaje lo dice), más dos casos del self-test: uno que escribe un
         cebo gitignored y exige que el link-check lo cace, y otro que exige que `externalPaths`
         se respete. Modo virtual para probarlo sin escribir en fuentes:
         `node scripts/docs-linkcheck.mjs --file <ruta virtual> --stdin`.

### GOTCHA: el índice de graphify «atrasado 0 minutos» (frescura medida por reloj)

Issue: #105

Síntoma: `GATE ROJO — señales fallidas: self-test del arnés índice del repo`, y
         `graph-check: el índice es más viejo que HEAD (0 min de atraso)` justo después de un
         commit cuyo post-commit había dicho «índice de graphify actualizado».
Causa:   la señal comparaba el **mtime** de `graphify-out/graph.json` contra la fecha de HEAD.
         `graphify update` **no reescribe** el archivo cuando no encontró nada nuevo, así que un
         commit sin cambios indexables (o dos commits seguidos) dejaba el mtime del commit
         anterior: más viejo que HEAD por segundos, y rojo sin que nada estuviera desactualizado.
Regla:   la frescura de un derivado se mide por **contenido**, no por reloj. El productor deja
         escrito PARA QUÉ commit produjo; el verificador compara eso, y sólo se queja si entre
         ambos cambió algo que el índice sabe leer.
Mecanismo: `.githooks/post-commit` sella `graphify-out/.indexed-head` con el sha indexado (también
         cuando no hubo cambios indexables: el índice sigue valiendo para ese commit) y
         `scripts/graph-check.mjs` compara sello vs HEAD y, si difieren, mira si el diff entre
         ambos toca `*.ts|tsx|js|mjs|md`. Un caso del self-test exige que el sello sea el de HEAD.

### GOTCHA: el release existe pero `gh` no lo ve (borrador + token sin permiso de escritura)

Issue: #106

Síntoma: se empuja el tag `v0.2.0`, los tres builds salen verdes y
         `gh release list` / `gh api repos/:owner/:repo/releases` sólo muestran el release
         anterior. `gh api …/releases/<id>` del release que el log nombra devuelve `404`.
Causa:   `release-build.yml` publica con `draft: true`, y **un borrador sólo lo ve un token con
         permiso de escritura** en el repo. Acá `gh auth status` está logueado con una cuenta que
         tiene `permissions.push=false` (los `git push` andan por SSH, con otra identidad): para
         ese token el borrador no existe. El release estaba creado y con sus tres instaladores.
Regla:   "no aparece en `gh release list`" no es "no se creó". Antes de rehacer un release, leer el
         log del job de publicación (`⬆️ Uploading` / `✅ Uploaded` / `🎉 Release ready at …`) y
         comprobar `gh api repos/:owner/:repo --jq .permissions`. Un `404` con `push=false` es
         falta de permiso, no ausencia del objeto.
Mecanismo: sólo prosa: ningún comando del repo puede ver lo que el token del humano no ve. Lo que
         sí se arregló es el ruido que llevó al diagnóstico equivocado — los tres jobs de la matriz
         creaban y borraban borradores duplicados del mismo tag; ahora publica un job único
         (`release`) después de la matriz.

### GOTCHA: la burbuja del chat se sale del panel y corta el texto

Issue: #107

Síntoma: una respuesta del agente con un bloque de código (o cualquier línea larga) se ve cortada
         a la derecha: los párrafos siguen fuera del panel y no hay scroll horizontal.
Causa:   la burbuja es un ítem flex con `max-w-[85%]`, pero un ítem flex arranca con
         `min-width:auto` = el ancho de su contenido más terco (la línea del `<pre>`), y en CSS
         **`min-width` gana sobre `max-width`**. La burbuja crecía más que el panel y el panel,
         con `overflow-y-auto`, recortaba en horizontal.
Regla:   toda burbuja/tarjeta con `max-w-*` dentro de un flex lleva `min-w-0`, y el `<pre>` de
         Markdown envuelve (`whitespace-pre-wrap break-words`) porque vive en paneles angostos.
Mecanismo: prosa + el ejemplo en `AgentChatPanel.tsx` (comentario en la burbuja). No hay test de
         layout en el repo; se verifica a ojo con `npm run electron-dev`.

### GOTCHA: el chat muestra el JSON del protocolo en vez de una respuesta

Issue: #108

Síntoma: el mensaje del agente es un bloque `{"thought":"…","action":"read_view","args":{…}}` y la
         corrida se corta ahí (la traza queda en 2 pasos).
Causa:   el modelo local escribe **comillas dobles sin escapar** dentro de un string del JSON
         (`… (ej. "Publica productos", "Busca productos") …`). `JSON.parse` falla y el fallback
         mostraba el crudo — que en un turno de herramienta es el protocolo, no una respuesta.
Regla:   un turno de PROTOCOLO nunca se le muestra al usuario. Si el JSON no parsea pero trae
         `"action"`/`"plan"`/`"question"`/`"final"`, se rescatan los campos (`repairProtocolJson`);
         si no se puede, se le pide repetir el paso y a la tercera se cierra con un mensaje humano.
Mecanismo: `repairProtocolJson` + `looksLikeProtocol` en `src/lib/ai/litert-agent.ts`, con el JSON
         real del incidente como caso de prueba en `litert-agent.test.ts` (y el nivel de bucle en
         `litert-agent-run.test.ts`: rescata y sigue · irrecuperable no se imprime · la prosa sí).
         Además el prompt pide comillas simples dentro de los textos: baja la frecuencia del fallo,
         no lo elimina — el freno es el rescate.

### GOTCHA: `RET_CHECK !HasProcessedContext()` al lanzar una segunda tarea de IA

Issue: #109

Síntoma: con el chat del agente abierto, pedir un artefacto (o cualquier tarea suelta) muere con
         `RET_CHECK failure (…/context_handler.h:182) !HasProcessedContext() The processed context
         is already set`. Después de eso, la IA local queda muerta hasta reiniciar la app.
Causa:   el engine de LiteRT-LM guarda el contexto procesado (el preface prefillado) en **un solo
         slot**. Se abría una conversación por tarea sin cerrar la anterior, así que la segunda
         chocaba contra el slot ocupado.
Regla:   UNA conversación viva por engine. Crear una libera la anterior (`cancel()` + `delete()`),
         las creaciones van en serie, y una tarea suelta cierra la suya al terminar. Si a alguien le
         roban el slot en el medio, la conversación se reabre con el mismo preface y reenvía su hilo
         (el KV-cache se pierde, la conversación no).
Mecanismo: `activeConversation` + cola en `src/lib/ai/litert-engine.ts`, con `litert-engine.test.ts`
         cubriendo los cinco casos (libera la anterior · la tarea suelta cierra · reapertura con
         historial · retry recreando el engine si el RET_CHECK igual salta · error ajeno se propaga).
         «Limpiar» del chat llama `releaseLitertContext()`.

### GOTCHA: el tooltip queda por debajo del panel (Radix sin Portal)

Issue: #110

Síntoma: en el riel del sidebar colapsado el globo del tooltip no se lee: aparece recortado o
         tapado por la barra.
Causa:   `TooltipContent` se renderizaba DENTRO del trigger, y `SidebarContent` oculta el desborde
         en modo icono (`group-data-[collapsible=icon]:overflow-hidden`). No era z-index: era clipping.
Regla:   todo contenido flotante de Radix va en su `Portal` (al `body`), no dentro del trigger.
Mecanismo: `TooltipPrimitive.Portal` en `src/components/ui/tooltip.tsx` (+ `z-[60]`). Vale para
         cualquier tooltip dentro de un contenedor con desborde oculto.

### GOTCHA: cuatro arreglos terminados sin una sola issue abierta

Issue: #141

Síntoma: una sesión entregó cuatro cambios de producción (manijas de relación, PNG sucio,
         contención de contenedores, metadatos del proyecto en el MCP) con el gate verde y **sin
         registro**: el humano preguntó «¿estamos reportando esto?» y el historial de issues estaba
         vacío. El registro se hizo de memoria al final, con el riesgo de perder el porqué.
Causa:   la ruta SDD y el hook `sdd-router` sólo hablaban cuando el pedido usaba palabras de
         feature o de bug. Un pedido en prosa —«se vuelve difícil mover las flechas»— no casaba con
         ningún patrón, así que nadie recordó preguntar; y nada frenaba el commit sin issue: el
         freno protegía el *dónde* de los artefactos, no el *si* del registro.
Regla:   un cambio de código llega al historial con una issue referenciada (`#123`) o con una línea
         `sin-issue: <motivo>`. Antes de tocar producción se le pregunta al humano si se registra.
Mecanismo: `.githooks/commit-msg` (bloqueante: mira el diff staged y el mensaje) + ruta `issue` del
         `sdd-router`, que se desactiva sola en lo trivial (ruta `none`). Probados por
         `scripts/harness-selftest.mjs`: 7 casos del hook en un repo git temporal y 3 de ruteo.

### GOTCHA: el issue se crea sin labels y el script pasa en verde

Issue: #158

Síntoma: `npm run sdd:new 006-organizaciones.md` imprimió la URL de la issue madre #157 y terminó
         en verde, pero el issue quedó **sin labels**: ni `sdd:feature` ni `feature:006`, aunque el
         script los pasa en `--label` y el label `feature:006` sí quedó creado. El timeline de #157
         no tiene un solo evento `labeled`. Igual pasó con un `gh issue create --label bug` a mano.
Causa:   la cuenta activa de `gh` era `doctiling`, que puede ABRIR issues en el repo pero no
         etiquetar (`AddLabelsToLabelable` pide triage/write). GitHub descarta los labels y crea el
         issue igual. Peor: `gh issue edit --add-label` imprime «failed to update 1 issue» y **sale
         con código 0**, así que ni el reintento falla solo. Las features viejas (#1, #25) están
         etiquetadas porque las creó la cuenta dueña.
Regla:   todo issue nace etiquetado (`tracker.labels` mapea el tipo → label), y quien crea issues
         por script VERIFICA releyendo la API: ni `--label` ni el exit code son evidencia.
Mecanismo: `exigirLabels()` en `scripts/sdd-github.mjs` — relee los labels del issue recién creado,
         reintenta con `issue edit` y, si faltan, muere (exit 1) nombrando la cuenta activa y el
         remedio (`gh auth switch -u <dueño>`). La directriz la imprime el hook `sdd-router` con los
         nombres del config, y el self-test exige que ese recordatorio siga saliendo.

### GOTCHA: la feature nueva nace con un número de otra

Issue: #172

Síntoma: `npm run sdd:new 006-organizaciones.md` abrió la issue madre con la etiqueta `feature:006`,
         que ya era de #113 («Metadatos y referencias en la caja», 12 tareas). Corregir a 007 chocó
         con #133. Terminó en 008 después de renombrar **8 issues a mano**, dos veces.
Causa:   `nuevaFeature()` sacaba el `NNN` del NOMBRE DEL ARCHIVO y no lo contrastaba con nada. El
         número lo elegía quien escribía el spec, y el tablero no opinaba.
Regla:   una feature nueva no nace con un número usado; si el número está tomado, el comando para y
         dice cuál es el primero libre. Sin número en el nombre, tampoco arranca.
Mecanismo: `scripts/sdd-github.mjs` (`new`) consulta las etiquetas `feature:*` del repo antes de
         crear nada y sale con código 1 nombrando el primer libre. Probado a mano contra el repo:
         `003` (usado) y un archivo sin número frenan; el mensaje trae la lista de usados.

### GOTCHA: el panel lateral bajado por la barra de título se sale de la ventana

Issue: #188

Síntoma: con la barra de título propia, el pie de la ficha de elemento —«Siguiente paso» y
         «Cerrar»— quedaba **debajo del borde de la ventana**, tapado por el Dock en macOS y sin
         forma de pulsarlo. Medido en la app viva: `innerHeight` 994, la ficha de `top: 40` a
         `bottom: 1034`, el pie de 961 a 1034 → 40 px afuera.
Causa:   `globals.css` baja el panel (`body[data-titlebar="on"] .fixed.inset-y-0 { top:
         var(--titlebar-h) }`) para no dibujarse sobre los controles de ventana, pero no descontaba
         esa altura: el drawer lleva `h-full` (100 % del viewport), así que arrancaba 40 px más
         abajo y seguía midiendo lo mismo. `h-screen`/`h-svh` ya tenían el descuento unas líneas
         más arriba; al panel lateral le faltó.
Regla:   lo que se corre para dejar libre la barra de título se **acorta** en la misma medida, y la
         corrección vive en `globals.css`, no en cada pantalla.
Mecanismo: `src/lib/__tests__/window-chrome.test.ts` lee `globals.css` y exige que la regla de
         `.fixed.inset-y-0` fije `top: var(--titlebar-h)` **y** `height: calc(100% -
         var(--titlebar-h))`. Quitar el descuento pone el gate en rojo.

### GOTCHA: el registro de tiles describía un package.json que ya no existe

Issue: #224

Síntoma: la auditoría del arnés (2026-08-28) encontró `tessl.json` divergido de `package.json` en
         las dos direcciones: 13 tiles huérfanos de deps ya removidas (recharts, webpack,
         date-fns, react-markdown…) y 30 deps sin tile — entre ellas las tres de API más exótica,
         exactamente donde el agente escribe de memoria: `@litert-lm/core` (el motor de IA),
         `electron-updater` (la feature activa #208) y `@modelcontextprotocol/sdk`. Todo en verde:
         ningún comando fallaba al divergir. Es la forma «cero fuentes registradas → el agente
         escribe APIs de memoria» del §6 de buenas-practicas.md.
Causa:   `tessl.json` sólo cambia cuando alguien corre `tessl install`/`uninstall`, pero las deps
         entran y salen por `npm` sin tocarlo. Sin un freno que compare los dos archivos, el
         registro describe el package.json de hace meses y nadie lo nota, porque los tiles no se
         ejecutan: sólo informan (o desinforman) al agente.
Regla:   el registro de tiles lista dependencias reales: ni tiles huérfanos, ni dep sin tile fuera
         de la deuda declarada (`tiles.allow` en harness.config.json, que sólo baja y cuya salida
         es `tessl search` + `tessl install`).
Mecanismo: regla TILES de `scripts/repo-lint.mjs` (config `tiles`), en el gate y en el hook
         PostToolUse. Las dos direcciones están probadas en el self-test con registros inventados
         por stdin. Los 13 huérfanos se quitaron con `tessl uninstall`; las 30 deps sin tile
         quedaron como deuda declarada en `tiles.allow`.
