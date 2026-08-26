# STATUS — estado verificado

Lo imprime el hook `SessionStart`. Sirve para no releer el repo entero para responder "¿esto anda?".
Se actualiza cuando cambia el veredicto, no en cada commit. **Sólo va lo verificado con un comando**;
lo que se supone va en "deuda conocida".

- **Fecha del último gate completo:** 2026-08-26
- **Rama:** `main`
- **Veredicto:** VERDE (`npm run gate`)
- **Versión publicada:** 0.6.6 — sigue siendo la última **publicada** (Latest)
- **Versión en el repo:** 0.7.0 — `v0.7.0` etiquetada y empaquetada: el release existe en **BORRADOR** con los tres instaladores adjuntos (`Processflow-Architect-0.7.0-arm64.dmg` 260 MB · `Processflow-Architect.Setup.0.7.0.exe` 206 MB · `Processflow-Architect-0.7.0.AppImage` 283 MB). El workflow lo deja así a propósito (`draft: true`): publicarlo es un paso humano (`gh release edit v0.7.0 --draft=false`), y hasta que ocurra esta línea NO cambia
- **Sin verificar:** la barra de título propia (0.7.0) sólo se ejercitó en **macOS**. En Windows y Linux los controles de ventana son los nativos del sistema (overlay), pero el arrastre, el botón de menú y el overlay no los vio nadie

## Señales

| Señal | Comando | Resultado |
|---|---|---|
| Ruta SDD en GitHub | `npm run sdd:status` (usa red) | verde — las 5 features migradas a issues (#1 · #25 · #45 · #62 · #79) con 89 issues de tarea, **todas cerradas**. `specs/` se borró y con él el freno del gate que lo vigilaba (#156): que un spec no vuelva al repo ya **no** lo verifica ningún comando |
| Registros espejados en GitHub | `node scripts/sdd-github.mjs mirror-docs` | verde — 16 gotchas (#95–#110) y el ADR 0001 (#111) tienen su issue cerrado con `Issue: #N` en el archivo; el comando es idempotente y **no** borra archivos (son el mecanismo: regla INCIDENTE + P12) |
| Frontera de red de la suite | `npx vitest run src/lib/__tests__/network-boundary.test.ts` | verde — `fetch` y `http/https.request` revientan dentro de un test (con el destino en el mensaje) y simular la red sigue siendo posible |
| Superficie de extensión de la IA (P5) | `npx vitest run src/lib/ai/__tests__/tasks-registry.test.ts` | verde — barrido por `import *`: toda `AiTask` declarada tiene id kebab único, tier válido, forma de ejecutarse, y el router la rutea en los tres modos sin conocerla |
| Índice del repo (graphify) | `npm run graph:check` | verde — 2 253 nodos / 5 575 aristas / 188 comunidades sobre 334 archivos (262 de código por AST + 51 docs + 8 imágenes por extracción semántica). Mide dos cosas: atraso contra HEAD y encogimiento contra `graph.baseline`; se omite donde no hay índice (CI) |
| Release con instaladores | `node scripts/repo-lint.mjs` (regla RELEASEJOB) | verde — el job que publica baja los artefactos DESPUÉS del checkout y `fail_on_unmatched_files` está en `true`: el borrador vacío de v0.6.3 (checkout limpiando `installers/`) no puede repetirse en verde |
| Notas de release en el repo | `node scripts/repo-lint.mjs --release-check 0.6.1` | verde — `docs/releases/0.6.1.md` con las tres secciones; con una versión inventada el freno RELEASE muerde |
| No se actúa sobre una pregunta | incluido en el self-test | verde — 7 pedidos reales de este repo por las dos direcciones; `ask-first` marca el turno informativo y `action-guard` deniega toda edición dentro del repo hasta el próximo pedido del humano |
| El trabajo entra a `main` por PR | `gh api repos/…/branches/main/protection` | verde — **verificado el 2026-08-25**: PR obligatorio, 0 aprobaciones requeridas, check «Gate (arnés · docs · lint · typecheck · tests · build)» exigido, aplica a admins, force-push deshabilitado. El gate **no** verifica esto (necesita red y permisos): es una señal verificada a mano |
| Freno local del push directo | incluido en el self-test | verde — `pre-push` frena `main` y deja pasar una rama de feature |
| Self-test del arnés | `node scripts/harness-selftest.mjs` | verde — 7 hooks, 24 frenos probados (se fue el de `specs/` con el directorio, #156; entró la directriz de labels, #158) (incluye DEPSHOOK, TOKENS, SVGFILL, PLATAFORMA, «no escribe temporales en `src/`» y los 9 casos de `commit-msg`, dos de ellos con la config de OTRA forja), 8 casos de ruteo |
| Directriz de labels | incluido en el self-test | verde — `sdd-router` nombra los labels de `tracker.labels` al pedir el registro, y `exigirLabels()` de `scripts/sdd-github.mjs` relee la API tras crear un issue: #157 nació sin labels y el script pasó en verde porque la cuenta activa de `gh` no tenía permiso de triage (#158) |
| Organizaciones (aislamiento del MCP) | `npx vitest run src/lib/mcp/__tests__/orgs.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — 22 + 87 pruebas: el slug no puede salir del workspace (`..`, `a/b`), `list_diagrams` no ve otra org, los ids son únicos POR org, y **eliminar una organización suelta sus diagramas a la carpeta plana** en vez de borrarlos (se niega si pisaría uno) |
| CRUD de organizaciones contra la app viva | script manual por CDP + IPC | verde — crear, renombrar y eliminar desde el header; una org con un diagrama adentro se eliminó y el diagrama quedó en `.processflow/diagrams/`, con `active.json` sin `org` |
| Barra de título propia | `npx vitest run src/lib/__tests__/window-chrome.test.ts` | verde — 6 pruebas: **ninguna plataforma dibuja sus propios controles de ventana** (semáforos en macOS, overlay nativo en Windows/Linux), así que un fallo nuestro no deja la ventana atrapada. El arrastre REAL sólo se verificó en macOS y a mano |
| Menú y barra ofrecen lo mismo | `npx vitest run src/lib/__tests__/designer-actions.test.ts` | verde — catálogo único; el diseñador implementa `Record<DesignerActionId, …>`, así que un id sin manejador **no compila** |
| Freno de numeración SDD | manual: `node scripts/sdd-github.mjs new <NNN-…>` con un NNN usado | verde — sale 1 nombrando el primer libre; sin `NNN` en el nombre tampoco arranca (#172) |
| Link-check de docs | `node scripts/docs-linkcheck.mjs` | verde |
| Lint de convenciones | `node scripts/repo-lint.mjs` | verde |
| Skills sincronizados | `node scripts/sync-skills.mjs --check` | verde — embed de `.claude/skills/**` al día |
| Typecheck | `npm run typecheck` | verde (renderer + electron) |
| Tests | `npm run test:coverage` | verde — 82 archivos, 1332 pruebas, **offline** (`vitest.setup.ts` cierra la red) |
| E2E del MCP (stdio) | script manual contra `mcp-server/index.ts` | verde — arnés completo (ingesta → citas → ambigüedades → calidad → revisión → export → install_skill) |
| Lectura de la app por MCP (modo app) | script manual por CDP contra la app viva | verde — 43 tools registradas; `list_artifacts`, `get_artifact` (con revisión), `list_views`, `get_view` (+`importAs`) y sus errores con opciones, también contra OTRO proyecto |
| Editor de artefactos con documento largo | script manual por CDP contra la app viva | verde — 11 021 caracteres: índice de 49 encabezados con salto, buscar/reemplazar (72 coincidencias), stats, borrador recuperable |
| Integridad del registro de notaciones | `npx vitest run src/lib/__tests__/notations-registry.test.ts` | verde — todo tipo declarado está en la paleta y viceversa, sin repetidos, con icono en `ICON_MAP` y con ayuda |
| Registro de un cambio en el historial | `node scripts/harness-selftest.mjs` | verde — `.githooks/commit-msg` frena un commit que toca código sin `#<issue>` ni línea `sin-issue: <motivo>`; 7 casos en un repo git temporal (docs solo, merge, declaración sin motivo) y la ruta `issue` del router recuerda preguntar antes de tocar producción |
| Contención de contenedores | `npx vitest run src/components/graph/designer/__tests__/containment.test.ts` | verde — una sola regla (mayor solape, mínimo media caja, empate al más chico) aplicada en cada commit de geometría y al abrir; sobre el modelo real las bandas pasan de 1/0/0 nodos a 1/3/6 |
| Manijas de relación y PNG del lienzo | `npx vitest run src/components/graph/designer/__tests__/link-geometry.test.ts src/components/graph/designer/__tests__/geom.test.ts` | verde — las manijas miden lo mismo en pantalla de 0,25× a 3× con 15 px de agarre, y la región del PNG se recorta al contenido sin salirse del viewport |
| Metadatos del proyecto por MCP | `npx vitest run src/lib/mcp/__tests__/diagram-builder.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — hotspots, responsables, notas y read models sobreviven el ciclo `export_to_app → import_diagram → export_to_app`, que antes los vaciaba; las notas del humano no se pisan ni se duplican |
| Relaciones de arista (UML) | `npx vitest run src/lib/__tests__/edge-relations.test.ts` | verde — herencia/realización/composición/agregación/dependencia: marca por punta y trazo; `dashed` a mano gana |
| Autoguardado de la ficha (parche, no borrador) | `npx vitest run src/components/graph/designer/__tests__/inspector-draft.test.ts` | verde — sólo viajan los campos editados: arrastrar el nodo con la ficha abierta ya no lo devuelve a su sitio anterior |
| Portapapeles del lienzo (copiar/pegar) | `npx vitest run src/components/graph/designer/__tests__/clipboard.test.ts` | verde — copia contenedor+contenido, sólo enlaces con ambas puntas, ids/nombres nuevos al pegar, `agregado` reapuntado |
| Estado comparativo por MCP (#144 A) | `npx vitest run main/services/__tests__/mcp-tools.test.ts` | verde — `estado` en `add_node`/`add_container`/`update_element` sobrevive `add → export → import → export`; sin declararlo sigue siendo `nuevo` |
| Metadatos del proyecto al recibir una vista (#144 B) | `npx vitest run src/lib/mcp/__tests__/project-meta.test.ts` | verde — notas, hotspots y responsables de `export_as_view` se suman al proyecto activo sin pisar lo del humano ni duplicar lo que ya estaba |
| Botón sólo-icono con nombre accesible (#143) | `node scripts/repo-lint.mjs` (regla BOTONMUDO) | verde — un `<Button size="icon">` sin `aria-label` ni `sr-only` pone el gate en rojo; el patrón único es `IconAction` (tooltip y `aria-label` del mismo texto) |
| Vocabulario de acciones de la UI (#143) | `npx vitest run src/lib/__tests__/action-labels.test.ts` | verde — un verbo por acción en `src/lib/action-labels.ts`; «Añadir»/«Crear» ya no vuelven como sinónimos |
| Panel y lienzo leen el mismo modelo (#142) | `npx vitest run src/lib/__tests__/graph-processor-sueltos.test.ts` | verde — con bandas pobladas Y `big_picture.nodos` el panel ya no pierde los sueltos ni sus aristas; invariante `entrada === salida + descartados` y contrato contra `graphDataToCanvas` |
| Diagrama de trabajo fijado | `npx vitest run src/lib/mcp/__tests__/active-diagram.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — `diagramId` es opcional: manda el explícito, después `use_diagram` (persistido en el workspace, el HTTP es stateless), después la configuración (`--diagram`/`PROCESSFLOW_DIAGRAM`), después el único que haya; con varios, el error los lista |
| Actualizar el proyecto de la app | `npx vitest run src/lib/mcp/__tests__/project-update.test.ts` | verde — `export_to_app` funde sobre el proyecto existente: conserva la geometría que el humano movió, fusiona sus notas y cuenta nuevos/conservados/quitados; un `project` inexistente avisa en vez de crear una copia |
| Actualizar una vista por MCP (#147) | `npx vitest run src/lib/mcp/__tests__/project-update.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — `export_as_view` con `replace` actualiza la pestaña existente (conserva geometría, no consume cupo); una vista inexistente o del sistema avisa con las opciones y no entrega |
| Decisión sobre el anidamiento (ADR 0002) | `npx vitest run src/lib/mcp/__tests__/diagram-builder.test.ts` | verde — anidar contenedores se rechaza con el mensaje que enseña la salida (otra vista + `viewRef`); si el mensaje deja de decirlo, la prueba muerde |
| Ids llamables y borrados reales (#149) | `npx vitest run src/lib/mcp/__tests__/mermaid-ids.test.ts` | verde — un id copiado del Mermaid (guiones bajos) resuelve al real y la arista guarda el real; `remove_element` con id inexistente falla con las opciones en vez de decir «eliminado» |
| Borrar y renombrar vistas por MCP (#150) | `npx vitest run src/lib/mcp/__tests__/app-actions.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — `delete_view`/`rename_view` por nombre exacto, sin coincidencia parcial ni vistas del sistema; el renderer contesta si ocurrió (canal `mcp-app-action`, con reintentos) |
| Proyecto destino fijado sin CLI (#148) | `npx vitest run main/services/__tests__/mcp-tools.test.ts` | verde — `use_project` persiste junto al diagrama fijado y no lo pisa; precedencia llamada → fijado → configuración → proyecto abierto; la guía `/mcp` de la app documenta ambos transportes |
| Filtros del lienzo | script manual (Puppeteer) sobre el renderer | verde — ocultan nodos y sus aristas con aviso del conteo; el menú sigue la notación de la VISTA (Pool en BPMN, Límite de Sistema en C4) y el filtro es por vista |
| Enrutado efectivo de una arista | `npx vitest run src/components/graph/designer/__tests__/link-geometry.test.ts` | verde — `routingOf` es la única función que lo resuelve: lo que resalta la ficha es lo que dibuja el lienzo (issue #112). La regla ENRUTADO del lint rechaza un `routing ??` a mano en `src/components/**` |
| Estilo de relaciones en lote | `npx vitest run src/components/graph/designer/__tests__/link-style.test.ts` | verde — sólo viajan los campos del parche (anclas, quiebres y etiqueta corrida sobreviven) y pisar un enrutado puesto a mano se informa, no pasa en silencio |
| Reapuntar una relación | `npx vitest run src/components/graph/designer/__tests__/link-reconnect.test.ts` | verde — cambia sólo el extremo, rechaza el self-loop, y con cajas anidadas el destino bajo el cursor es el hijo, no el contenedor |
| Renombrar el proyecto | `npx vitest run src/lib/__tests__/project-rename.test.ts` | verde — mueve juntos `nombre_proyecto` y `name`; version, notas, notación y grafo quedan intactos |
| Build de producción | `npm run build` | verde |

Pre-commit instalado: sí (`core.hooksPath=.githooks`). CI corre el mismo gate.

## Deuda conocida

| Deuda | Dónde | Nota |
|---|---|---|
| 16 archivos cablean literales de notación | `.claude/harness.config.json` → `notation.allow` | la regla NOTACION bloquea lo nuevo; la lista sólo puede achicarse |
| SDD ruteado pero no bloqueante | `docs/harness/sdd.md` §Estado | el gate protege el *dónde* (los artefactos no vuelven al repo), no el *si*: nada obliga a abrir la issue madre antes de tocar producción |
| El lienzo se verifica a ojo | — | no hay test de render; la simbología se cubre por el registro (`notation-symbols`, `notation-contrast`) y la geometría por `link-geom` |
| ~535 aristas colgantes en el índice de graphify | `graphify-out/GRAPH_REPORT.md` | **diagnosticado: no es corrupción.** Son imports a paquetes que graphify no nodifica (`ref_react` 83, `ref_vitest` 76, `ref_lucide_react` 45, `ref_node_path`, `ref_electron`…) más re-exports de barriles. El grafo las descarta al construir; las consultas de código no se ven afectadas |
| Sin dobles de prueba para LiteRT ni E2E del lienzo | — | la UI se verifica a mano (`npm run electron-dev`) |
| Transporte HTTP del MCP sin probar end-to-end | `main/services/mcp-http.ts` | el registro y la LECTURA ya se probaron contra la app viva por el transporte en memoria (playground); el puerto HTTP, `export_as_view` y la banda vacía en el lienzo se verifican a mano |
| El puente IPC de lectura no se prueba con Electron vivo | `main/services/mcp-app-read.ts` | timeout y ventana cerrada están cubiertos por unidad con un `readApp` falso |
| `onnxruntime-node` sigue en `overrides` | `package.json` | no se usa para generar (crash nativo con Gemma); ver `docs/harness/gotchas.md` |
| Cobertura acotada a `src/lib/**` | `vitest.config.ts` | `main/`, `mcp-server/` y la UI no tienen cobertura exigida |

## Trabajo en curso

Nada abierto: el tablero de GitHub quedó en cero (0 issues abiertas). Las 6 tareas que quedaban
—validación visual de 001 y la IA de organización + medición de 002— se cerraron como *no
planificadas* al pasar la ruta SDD a GitHub; si se retoman, se abre una feature nueva.

**005** (el agente recupera el contexto por partes y consulta al humano) entró en
`main` y salió en `v0.3.0`. En `v0.4.0` salieron los créditos de Sofka + marca beta, el pedido
explícito de artefacto (menú «+»), el riel de artefactos del panel colapsado con iconos por tipo,
y los arreglos del motor local (una sola conversación viva por engine, JSON con comillas sueltas,
plan de rescate).

Pendiente de medición, no de código (declarado en `analyze.md` §Deuda):
cuántos turnos gasta un **Gemma real** hasta proponer un plan usable, y el ciclo completo en modo
`hybrid`/`remote` (es agnóstico del motor y no se tocó el ruteo, pero nadie lo corrió contra nube).

**Artefactos versionados (spec 004) — CON ruta SDD, ciclo completo.**
La feature ([#62](https://github.com/raalzate/processflow-architect/issues/62)) tiene las seis fases (`spec` · `plan` · `checklist` ·
`testify` · `tasks` · `analyze`) y las 13 tareas marcadas. Cada artefacto tiene ahora su propio
linaje: regenerar incrementa la revisión en vez de duplicar la tarjeta, el histórico es
append-only (restaurar crea una revisión nueva), borrar en el panel archiva y el borrado
definitivo pide confirmación. Toda la lógica vive en `src/lib/artifacts/versioning.ts`
(42 pruebas, 99,3 % stmts) y el estado guardado antes de 004 se migra al cargar, sin perder
artefactos. **Pendiente:** la verificación visual M1–M5 de `testify.md` en la app de escritorio
(no hay E2E de UI).

**Una sola piel (spec 003) — CON ruta SDD.** [#45](https://github.com/raalzate/processflow-architect/issues/45) cubre el rediseño de la
piel: app siempre oscura, tokens de estado y de código, `CodeBlock` único, escala tipográfica y
regla TOKENS en el lint. Las 11 tareas quedaron marcadas con su comando. No cambia la
disposición de la interfaz: eso, si se quiere, es otra spec.

**Simbología por notación — ruta SDD SALTADA, declarado.** El cambio no abrió una
issue madre: entra por el registro (`src/lib/notations.ts` declara tamaño de nodo,
rotulado, trazo y forma; el resto obedece) y queda cubierto por pruebas —
`notation-symbols`, `notation-contrast`, `layout-radial`, `layout-node-size`,
`edge-label` y `link-geometry`. Desborda [#25](https://github.com/raalzate/processflow-architect/issues/25), que sólo cubre
densidad y estrategia: acá hay además layout radial para DDD, ficha C4, elipses y
contenedores blob en DDD, etiquetas de relación en dos renglones, paleta homogénea y
lienzo siempre oscuro. Si alguna de esas decisiones se discute, se abre la spec.

Rama `feat/bpmn-notation-layout`: simbología canónica de eventos BPMN, layout de swimlanes dirigido
por flujo y la notación viajando con el modelo. Todo commiteado y fusionado a `main`.

**Arnés MCP para agentes externos** (misma rama): los skills se instalan desde el propio
servidor (`list_skills` / `install_skill`, con la configuración del transporte inyectada) y el
ciclo de diseño quedó cerrado por herramientas — `get_app_state` (ingesta antes de exportar),
`source` por elemento (trazabilidad a la fuente), `record_ambiguity` / `resolve_ambiguity`,
`validate_diagram` con reglas de calidad por ROL semántico (`notations.ts`), `suggest_views` y
`review_diagram` (paquete de revisión humana). Ruta SDD saltada y declarada: cambio incremental
sobre `src/lib/mcp` con TDD.
