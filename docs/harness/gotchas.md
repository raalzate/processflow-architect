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

### GOTCHA: correr el gate completo con la app abierta rompe el dev server

Síntoma: la ventana de Electron muestra `Runtime Error · Cannot find module './1331.js'` con un
         require stack que apunta a `.next/server/webpack-runtime.js`.
Causa:   `npm run gate` incluye `npm run build`, y `next build` reescribe `.next/` — el MISMO
         directorio desde el que sirve `next dev`. El dev server queda pidiendo chunks que ya
         no existen.
Regla:   mientras desarrollás con la app abierta, la señal es `npm run gate:fast` (sin build).
         El gate completo, antes de entregar y con la app cerrada; si igual lo corrés, relanzá
         `next dev` y la app después.
Mecanismo: `scripts/gate.sh` avisa si detecta un `next dev` corriendo antes de lanzar el build.

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
