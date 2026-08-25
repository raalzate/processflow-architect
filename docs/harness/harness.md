# Arnés del agente — cómo está montado aquí

Aplicación concreta de `docs/harness/buenas-practicas.md` a este repo (Electron + Next + vitest).
La regla que manda: **una regla sin un comando que la haga fallar es una sugerencia.** Cada fila de
este documento nombra el comando que falla si alguien la viola.

## El gate

```
npm run gate        # self-test · link-check de docs · lint · typecheck · tests con cobertura · build
npm run gate:fast   # igual sin el build (señal de desarrollo, NO entregable)
```

`scripts/gate.sh` es la única definición del gate. Lo corren tres actores con el mismo comando:
el humano, el agente (subagente `gate-runner`) y CI (job `gate` en `.github/workflows/ci.yml`).
Al terminar en verde borra `.git/gate-dirty`, que es lo que mira el hook `Stop`.

| Señal | Qué prueba | Por qué no la cubre otra |
|---|---|---|
| `node scripts/harness-selftest.mjs` | que los hooks bloquean lo que dicen bloquear y que ninguna ruta del config apunta a la nada | un hook roto o un config inválido fallan en silencio: ninguna otra señal los ve |
| `node scripts/docs-linkcheck.mjs` | que ninguna referencia a un doc o a una ruta del repo apunte a la nada | mover un archivo rompe punteros que ninguna otra señal mira |
| `node scripts/repo-lint.mjs` | convenciones que el compilador no ve: pureza de `src/lib/`, agnosticismo de notación, invariantes de WebGPU, SDKs de nube prohibidos, `.only(` olvidado, dependencias de hook que leen la notación, tokens del tema en la UI, `fill` en los `<text>` de SVG, detección de plataforma en un solo módulo, notas de release en `docs/releases/<versión>.md`, el router sin conocer tareas de IA por nombre y todo gotcha con su `Mecanismo:` | barato, atrapa clases enteras de error; ver ADR `docs/decisions/0001-arnes-del-agente.md` sobre por qué no es ESLint |
| `node scripts/graph-check.mjs` | que el índice de graphify no contesta con el repo de antes del último commit | ninguna otra señal mira los derivados; un índice viejo miente con cara de dato |
| `npm run typecheck` | que el proyecto compila completo (renderer + electron) | vitest transpila por archivo y **no** type-checkea: un import inválido pasa los tests y rompe el build |
| `npm run test:coverage` | comportamiento de `src/lib/` con la misma cobertura que exige CI, **offline**: `vitest.setup.ts` revienta si un test sale a la red | no ve tipos ni empaquetado |
| `npm run build` | que el artefacto publicable se genera (`next build` + `tsc` de electron + `move-out`) | dev y prod difieren (tree-shaking, resolución de módulos, asar) |

> **El kit de SDD.** Las skills `sofka-0x` viven en el entorno del desarrollador, no en el repo.
> El self-test las exige en una máquina de desarrollo —que es donde el ruteo SDD ocurre— y en CI
> (`$CI`) reporta la ausencia como *omitido* en vez de fallar. El "omitido" se imprime siempre:
> nunca se confunde con "pasó". Ver `docs/harness/sdd.md`.

> **El arnés no escribe en el árbol de fuentes.** Para probar un freno del lint se le pasa el
> contenido por stdin y la ruta sólo elige las reglas:
> `node scripts/repo-lint.mjs --file <ruta virtual> --stdin`. Escribir temporales dentro de `src/`
> rompía el watcher de Next (ver `docs/harness/gotchas.md`); un caso del self-test falla si vuelven.

**Test verde ≠ compila ≠ entregable.** Reportar "listo" sin un gate verde es una violación, no un descuido.

### Fuera del gate: las capturas del README

```bash
npm run screenshots                              # levanta next dev, captura y lo apaga
BASE=http://localhost:3000 npm run screenshots   # contra un servidor ya vivo
```

`scripts/screenshots.ts` rehace `docs/screenshots/*` contra el renderer real (Puppeteer,
1440×900 @2x) con `window.electronAPI` simulado —contrato de `preload.ts`— y un proyecto
de ejemplo construido con el constructor del MCP (`src/lib/mcp/diagram-builder.ts`), no a mano.
Existe porque las capturas envejecen en silencio: estuvieron un mes mostrando una UI
anterior al rediseño. **No está en el gate**: ninguna máquina juzga si una captura se ve
bien; se corre cuando la UI cambia y el humano mira el diff.

## Hooks del ciclo del agente (`.claude/settings.json`)

Los hooks son genéricos: **todo lo específico del repo** (rutas protegidas, reglas de bash,
catálogo de reuso, comando del gate, marcador, allowlist de notación, ruteo SDD) vive en
`.claude/harness.config.json`, y `.claude/hooks/harness.mjs` es la plomería compartida
(stdin → config → decisión). Cambiar una regla es editar JSON, no código; y portar el arnés a otro
repo es cambiar ese único archivo.

| Momento | Hook | Qué hace |
|---|---|---|
| `UserPromptSubmit` | `sdd-router.mjs` | clasifica el pedido: tamaño feature → ruta SDD, falla concreta → bugfix, cambio de IA → `AiTask` y llaves fuera del renderer; se calla en lo trivial |
| `UserPromptSubmit` | `graph-first.mjs` | si hay índice de graphify construido, empuja a consultarlo (`graphify query`) antes de abrir archivos; callado si el grafo no existe o el pedido no es una pregunta de código |
| `SessionStart` | `session-start.mjs` | imprime rama, HEAD, cambios sin commitear y `STATUS.md`; avisa si el pre-commit no está instalado o si hay gate pendiente |
| `PreToolUse` Write\|Edit | `protected-paths.mjs` | deniega editar `.env*`, `package-lock.json`, `.git/`, `build/`, `dist/`, `.next/`, `coverage/`, `node_modules/` |
| `PreToolUse` Write\|Edit | `reuse-guard.mjs` | bloquea boilerplate que ya tiene abstracción (`docs/architecture/reuse-patterns.md`) |
| `PreToolUse` Bash | `bash-guard.mjs` | deniega `--no-verify`, `--force`, `reset --hard`, `git add .`, `git clean -f`, `sed -i` masivo sobre fuente, `rm -rf` de directorios fuente, `find -delete` |
| `PostToolUse` Write\|Edit | `post-edit-check.mjs` | corre `repo-lint` sobre el archivo tocado (devuelve el error real) y marca `.git/gate-dirty` |
| `Stop` | `gate-stop.mjs` | impide cerrar la tarea si se editó código y el gate no quedó verde |

En el repo, además: `.githooks/pre-commit` (rutas protegidas + `repo-lint` de los archivos staged),
`.githooks/commit-msg` (un commit que toca código referencia su issue —`#123`— o declara
`sin-issue: <motivo>`; los patrones salen de `tracker` + `commitMsg` del config, no del bash) y `.githooks/post-commit` (reindexa con `graphify update`), instalados con
`npm run hooks:install` —
`core.hooksPath` debe valer `.githooks`; `.git/hooks/` sólo tiene `.sample` a propósito.

## El índice del repo (graphify)

*Consultar antes de leer*: la regla de `buenas-practicas.md` §1 acá tiene mecanismo.

```bash
/graphify .                        # construye el índice (AST del código + extracción semántica de docs)
npm run graph:query "<pregunta>"   # devuelve un subgrafo, no el árbol de archivos
npm run graph:update               # reindexa lo que cambió
npm run graph:check                # la señal del gate, suelta
```

| Pieza | Qué hace |
|---|---|
| `graphify-out/` | el índice: `graph.json` + `GRAPH_REPORT.md`. **Gitignorado**: es derivado y por máquina |
| `.githooks/commit-msg` | el trabajo no entra al historial sin quedar registrado: si el diff staged toca código (`commitMsg.codePattern`), el mensaje lleva la referencia de la issue (`tracker.issuePattern`) o una línea `sin-issue: <motivo>` con motivo. Merge/revert/fixup quedan fuera. **No conoce GitHub**: con `AB#123` o `PROJ-123` en el config funciona igual. Lo prueban 9 casos del self-test en repos git temporales, dos de ellos con la config de otra forja |
| `.githooks/post-commit` | reindexa después de cada commit. **No** se instala con `graphify hook install`: ese comando escribe en `.git/hooks/`, que git ignora porque `core.hooksPath=.githooks` |
| `.claude/hooks/graph-first.mjs` | pone el índice en el camino del agente cuando el pedido es «dónde está X», «quién usa Y», «cómo funciona Z» |
| `node scripts/graph-check.mjs` | señal del gate: mide las **dos** formas en que un índice miente (abajo); **omitida** donde no existe (CI) |

Las dos mentiras que se miden, y por qué así:

1. **Estar viejo** — se mide por **contenido**: el post-commit sella en
   `graphify-out/.indexed-head` el sha que indexó, y la señal compara ese sello con HEAD; si
   difieren, sólo es rojo cuando entre ambos cambió un archivo indexable (`*.ts|tsx|js|mjs|md`).
   Medir por reloj daba falsos rojos (ver el gotcha «atrasado 0 minutos»), y medir contra el
   working tree pondría el gate en rojo con cada edición sin reindexar: un freno que estorba a
   mitad de desarrollo termina desactivado a mano.
2. **Haberse encogido** — un reindexado a medias (extracción caída, corpus mal detectado, un
   `update` que falló silencioso) deja un grafo más chico que **igual contesta**: con menos verdad
   y sin avisar. El tamaño tiene línea base declarada en `.claude/harness.config.json`
   (`graph.baseline` + `graph.shrinkTolerance`); bajarla es un cambio que se declara en su commit,
   igual que la allowlist de notación.

**Las aristas «colgantes» del reporte no son corrupción.** Son imports a paquetes que graphify no
nodifica: `ref_react`, `ref_vitest`, `ref_lucide_react`, `ref_node_path`, `ref_electron` y demás
(el ~80 % de las ocurrencias), más re-exports de barriles. El grafo las descarta al construir; no
afectan a las consultas de código, donde el AST es la mayoría de los nodos.

Convive con Serena (índice de símbolos) y con el subagente `explorer`: el grafo agrega las
relaciones entre docs, specs y código que un índice de símbolos no tiene.

## Subagentes (`.claude/agents/`)

| Subagente | Para qué | Por qué aislado |
|---|---|---|
| `explorer` | búsqueda amplia, índice de símbolos antes que lectura de archivos | la exploración contamina el contexto principal |
| `reviewer` | revisa el diff contra los principios BLOCKING de `CONSTITUTION.md` | el review no lo hace quien escribió el código |
| `gate-runner` | corre el gate y reporta veredicto + error real | miles de líneas de log no entran al contexto principal |

## Comandos (`.claude/commands/`)

| Comando | Flujo que evita re-tipear |
|---|---|
| `/gate [fast]` | correr el gate aislado e interpretar el resultado sin reintento ciego |
| `/lesson <incidente>` | ciclo RHO: minar la causa → codificar en el mecanismo más fuerte → validar con el gate |
| `/harness-audit` | prueba de vida: ¿qué comando falla si se viola cada regla? |

## Rutas protegidas

`.env*` (llave del reino, nunca se edita — regla del owner) · `package-lock.json` (se regenera con
`npm install`) · `.git/` · los derivados `build/`, `dist/`, `.next/`, `coverage/`, `node_modules/`
(se regeneran; parchear dependencias es con `patch-package`). Excepción legítima: la pide el humano
explícitamente y el cambio lo hace él, no el agente.

## Memoria

| Archivo | Contenido | Carga |
|---|---|---|
| `CLAUDE.md` | reglas operativas, convenciones, dominio | siempre |
| `CONSTITUTION.md` | principios versionados con su fuerza y su mecanismo | siempre (vía CLAUDE.md / fases) |
| `docs/harness/gotchas.md` | síntoma → causa → regla → mecanismo | bajo demanda / `/lesson` |
| `STATUS.md` | estado verificado + deuda conocida | `SessionStart` |
| `docs/decisions/` | ADRs: por qué, no qué | bajo demanda |
| `docs/README.md` | índice por categorías de toda la documentación | bajo demanda |
| `docs/harness/sdd.md` | cuándo el trabajo arranca con spec y cuándo no | bajo demanda / `sdd-router` |
| `docs/harness/buenas-practicas.md` | la guía origen, agnóstica de stack | bajo demanda / `/harness-audit` |

Recuperación selectiva: índice de símbolos vía Serena (`find_symbol`, `get_symbols_overview`,
`find_referencing_symbols`) **antes** de abrir archivos; ese es el trabajo del subagente `explorer`.
Catálogo de abstracciones ya existentes: `docs/architecture/reuse-patterns.md`.

Documentación de dependencias: tiles de Tessl declarados en `tessl.json` y vendorizados en
`.tessl/plugins/` (`tessl install` los reinstala). Se consultan **antes** de escribir contra una
librería, no después de que falle.

## Frontera de herramientas

`.mcp.json` nombra los servidores MCP permitidos: `tessl` (documentación de librerías) y
`processflow-architect` (diseño de diagramas contra el propio producto). No hay acceso libre.
La IA de la app corre local por defecto; el proveedor de nube es opt-in, con la llave cifrada en el
proceso main y las peticiones HTTP saliendo sólo de ahí.

## Conducta ante el error

- Integridad de aserciones: jamás se ajusta una aserción para que pase el test. Si el test es
  correcto, se arregla producción; si el test es incorrecto, se corrige en un commit aparte con
  justificación.
- Prohibido `--no-verify` (bloqueado por `bash-guard.mjs`). Si el gate estorba, se arregla el gate.
- Leer la salida real (archivo, línea, mensaje) antes de reintentar. Reintento sólo con hipótesis nueva.
- Presupuesto: 2 intentos sobre el mismo error; al tercero se para y se escala con el diagnóstico.

## Deuda conocida del arnés

- **SDD ruteado, no bloqueante.** `sdd-router` informa el criterio y el self-test cuida el
  clasificador y el puntero de feature activa, pero nada impide entregar una feature grande sin
  spec salvo el review. Ver `docs/harness/sdd.md` §Estado.
- **Notación: allowlist de deuda.** 16 archivos cablean literales de tipo fuera de
  `src/lib/notations.ts` (`.claude/harness.config.json` → `notation.allow`). La regla bloquea lo
  nuevo; la lista sólo puede achicarse.
- **Sin test de frontera de red.** Nada prueba que los tests no hagan llamadas externas.
- **`post-edit-check.mjs` corre lint, no `tsc`** (el type-check completo es demasiado lento por
  edición); el typecheck vive en el gate.
- **Sin sandbox de UI.** No hay dobles de prueba para el motor LiteRT ni verificación E2E del
  lienzo: `src/lib/` está cubierto, la UI se verifica a mano (`npm run electron-dev`).
