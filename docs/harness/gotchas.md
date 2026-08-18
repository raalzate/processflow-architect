# Gotchas — lo que ya nos costó horas

Formato fijo: **síntoma observable → causa raíz → regla → mecanismo que la hace fallar**.
Se escribe en el momento en que se paga, no "cuando haya tiempo" (`/lesson <incidente>`).

Higiene: si un test o un hook ya garantiza la regla, la entrada se recorta a una línea que apunta
al mecanismo. La prosa duplicada sólo gasta contexto.

---

### GOTCHA: el motor local no arranca en el binario empaquetado

Síntoma: la IA local funciona en `npm run electron-dev` y en el `.dmg` no; el renderer no ve `navigator.gpu`.
Causa:   WebGPU viene `disabled_off` en Electron, y los schemes privilegiados (`app://`,
         `litert-model://`) tienen que registrarse una sola vez y como `secure`, o el binario
         empaquetado no expone WebGPU.
Regla:   `main.ts` conserva `enable-unsafe-webgpu` y `enable-features: WebGPU`; jamás se reactiva
         `app.disableHardwareAcceleration()`; los schemes se registran una vez y `secure: true`.
Mecanismo: regla WEBGPU de `scripts/repo-lint.mjs` (los switches y la prohibición); el resto es
         `CONSTITUTION.md` §P7 + review.

### GOTCHA: `onnxruntime-node` mata el proceso al generar con Gemma

Síntoma: el proceso muere sin excepción de JS (crash nativo) al pedir generación.
Causa:   `onnxruntime-node` no soporta ese modelo; no es un error de configuración, no hay flag que
         lo arregle.
Regla:   el motor local es `@litert-lm/core` sobre WebGPU **en el renderer**. No se vuelve a
         intentar generar desde el proceso main con onnxruntime.
Mecanismo: ninguno ejecutable — memoria y `CLAUDE.md`. La dependencia sigue en `overrides` por otras
         rutas del árbol, así que la trampa está viva: candidato a regla de lint si reaparece.

### GOTCHA: editás el agente local y la app sigue con el código viejo

Síntoma: cambios en `src/lib/ai/litert-agent.ts` o en el motor no tienen ningún efecto; ni error, ni
         comportamiento nuevo.
Causa:   Fast Refresh de Next no re-evalúa esos módulos (viven detrás del arranque del motor).
Regla:   tras tocar el agente o el motor, **matar y relanzar** `npm run electron-dev`. Si el cambio
         "no hizo nada", primero relanzar y recién después dudar del cambio.
Mecanismo: ninguno ejecutable (es del entorno de desarrollo, no del artefacto). Memoria pura.

### GOTCHA: el servidor MCP no encuentra las herramientas exportadas por un barrel

Síntoma: `npx tsx mcp-server/index.ts` arranca pero faltan herramientas, o el import resuelve `undefined`.
Causa:   un `export *` (barrel) no sobrevive la resolución de `tsx` en ese entry point.
Regla:   en `mcp-server/`, importar cada módulo por su ruta concreta; nada de barrels.
Mecanismo: ninguno ejecutable — memoria. Se nota al arrancar el servidor.

### GOTCHA: `vitest run` verde y el build roto igual

Síntoma: tests verdes, `npm run build` falla por un import inválido o un tipo.
Causa:   vitest transpila por archivo y **no** hace type-check del proyecto; dev y prod además
         resuelven módulos distinto (y el empaquetado de Electron agrega asar).
Regla:   nada se entrega con una sola señal. El entregable es `npm run gate`.
Mecanismo: `scripts/gate.sh`, el hook `Stop` (`.claude/hooks/gate-stop.mjs`) y el job `gate` de CI.

### GOTCHA (RESUELTA): correr el gate completo con la app abierta rompía el dev server

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

Síntoma: la ventana de Electron se cierra sola; el log termina en `exited with signal SIGTERM`
         sin ninguna línea de crash.
Causa:   se lanzó como proceso HIJO de una tarea en segundo plano del agente; al detenerse la
         tarea, el hijo recibe SIGTERM.
Regla:   lanzarla desprendida (`nohup … & disown`) para que su ciclo de vida no dependa del
         agente. El trabajo del MCP no se pierde igual (cada `add_node`/`add_edge` persiste en
         `<workspace>/.processflow/diagrams`), pero la conexión del agente sí se corta.
Mecanismo: ninguno ejecutable — memoria.

### GOTCHA: cablear un tipo de componente rompe las otras notaciones

Síntoma: una vista BPMN o C4 pierde iconos/colores, o un contenedor deja de comportarse como tal,
         después de un cambio que "sólo tocaba DDD".
Causa:   el tipo se comparó contra un literal (`tipo_elemento === "Contexto Delimitado"`) en vez de
         derivarse del registro de notaciones.
Regla:   `src/lib/notations.ts` es la única fuente de verdad. Los archivos que ya lo violan son
         deuda declarada y esa lista sólo baja.
Mecanismo: regla NOTACION de `scripts/repo-lint.mjs` + allowlist en `.claude/harness.config.json`.

### GOTCHA: `ENOENT __harness-selftest-tmp.tsx` en el build de Next

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

### GOTCHA: el release existe pero `gh` no lo ve (borrador + token sin permiso de escritura)

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
