# STATUS — estado verificado

Lo imprime el hook `SessionStart`. Sirve para no releer el repo entero para responder "¿esto anda?".
Se actualiza cuando cambia el veredicto, no en cada commit. **Sólo va lo verificado con un comando**;
lo que se supone va en "deuda conocida".

- **Fecha del último gate completo:** 2026-08-24
- **Rama:** `main`
- **Veredicto:** VERDE (`npm run gate`)
- **Versión publicada:** 0.6.3 — release publicado con los 3 instaladores
- **Versión en el repo:** 0.6.4 — notas en `docs/releases/0.6.4.md`; 0.6.2 quedó en borrador

## Señales

| Señal | Comando | Resultado |
|---|---|---|
| Ruta SDD en GitHub | `npm run sdd:check` | verde — las 5 features migradas a issues (#1 · #25 · #45 · #62 · #79) con 89 issues de tarea, **todas cerradas**; `specs/` sólo tiene su README y cualquier otro archivo ahí pone el gate en rojo |
| Registros espejados en GitHub | `node scripts/sdd-github.mjs mirror-docs` | verde — 16 gotchas (#95–#110) y el ADR 0001 (#111) tienen su issue cerrado con `Issue: #N` en el archivo; el comando es idempotente y **no** borra archivos (son el mecanismo: regla INCIDENTE + P12) |
| Frontera de red de la suite | `npx vitest run src/lib/__tests__/network-boundary.test.ts` | verde — `fetch` y `http/https.request` revientan dentro de un test (con el destino en el mensaje) y simular la red sigue siendo posible |
| Superficie de extensión de la IA (P5) | `npx vitest run src/lib/ai/__tests__/tasks-registry.test.ts` | verde — barrido por `import *`: toda `AiTask` declarada tiene id kebab único, tier válido, forma de ejecutarse, y el router la rutea en los tres modos sin conocerla |
| Índice del repo (graphify) | `npm run graph:check` | verde — 2 253 nodos / 5 575 aristas / 188 comunidades sobre 334 archivos (262 de código por AST + 51 docs + 8 imágenes por extracción semántica). Mide dos cosas: atraso contra HEAD y encogimiento contra `graph.baseline`; se omite donde no hay índice (CI) |
| Release con instaladores | `node scripts/repo-lint.mjs` (regla RELEASEJOB) | verde — el job que publica baja los artefactos DESPUÉS del checkout y `fail_on_unmatched_files` está en `true`: el borrador vacío de v0.6.3 (checkout limpiando `installers/`) no puede repetirse en verde |
| Notas de release en el repo | `node scripts/repo-lint.mjs --release-check 0.6.1` | verde — `docs/releases/0.6.1.md` con las tres secciones; con una versión inventada el freno RELEASE muerde |
| Self-test del arnés | `node scripts/harness-selftest.mjs` | verde — 7 hooks, 31 frenos probados (incluye DEPSHOOK, TOKENS, SVGFILL, PLATAFORMA, ENRUTADO, RELEASEJOB y «no escribe temporales en `src/`»), el hook `commit-msg` en un repo git temporal, 11 casos de ruteo |
| Link-check de docs | `node scripts/docs-linkcheck.mjs` | verde |
| Lint de convenciones | `node scripts/repo-lint.mjs` | verde |
| Skills sincronizados | `node scripts/sync-skills.mjs --check` | verde — embed de `.claude/skills/**` al día |
| Typecheck | `npm run typecheck` | verde (renderer + electron) |
| Tests | `npm run test:coverage` | verde — 82 archivos, 1332 pruebas, **offline** (`vitest.setup.ts` cierra la red) |
| E2E del MCP (stdio) | script manual contra `mcp-server/index.ts` | verde — arnés completo (ingesta → citas → ambigüedades → calidad → revisión → export → install_skill) |
| Lectura de la app por MCP (modo app) | script manual por CDP contra la app viva | verde — 30 tools registradas; `list_artifacts`, `get_artifact` (con revisión), `list_views`, `get_view` (+`importAs`) y sus errores con opciones, también contra OTRO proyecto |
| Editor de artefactos con documento largo | script manual por CDP contra la app viva | verde — 11 021 caracteres: índice de 49 encabezados con salto, buscar/reemplazar (72 coincidencias), stats, borrador recuperable |
| Integridad del registro de notaciones | `npx vitest run src/lib/__tests__/notations-registry.test.ts` | verde — todo tipo declarado está en la paleta y viceversa, sin repetidos, con icono en `ICON_MAP` y con ayuda |
| Registro de un cambio en el historial | `node scripts/harness-selftest.mjs` | verde — `.githooks/commit-msg` frena un commit que toca código sin `#<issue>` ni línea `sin-issue: <motivo>`; 7 casos en un repo git temporal (docs solo, merge, declaración sin motivo) y la ruta `issue` del router recuerda preguntar antes de tocar producción |
| Contención de contenedores | `npx vitest run src/components/graph/designer/__tests__/containment.test.ts` | verde — una sola regla (mayor solape, mínimo media caja, empate al más chico) aplicada en cada commit de geometría y al abrir; sobre el modelo real las bandas pasan de 1/0/0 nodos a 1/3/6 |
| Manijas de relación y PNG del lienzo | `npx vitest run src/components/graph/designer/__tests__/link-geometry.test.ts src/components/graph/designer/__tests__/geom.test.ts` | verde — las manijas miden lo mismo en pantalla de 0,25× a 3× con 15 px de agarre, y la región del PNG se recorta al contenido sin salirse del viewport |
| Metadatos del proyecto por MCP | `npx vitest run src/lib/mcp/__tests__/diagram-builder.test.ts main/services/__tests__/mcp-tools.test.ts` | verde — hotspots, responsables, notas y read models sobreviven el ciclo `export_to_app → import_diagram → export_to_app`, que antes los vaciaba; las notas del humano no se pisan ni se duplican |
| Relaciones de arista (UML) | `npx vitest run src/lib/__tests__/edge-relations.test.ts` | verde — herencia/realización/composición/agregación/dependencia: marca por punta y trazo; `dashed` a mano gana |
| Autoguardado de la ficha (parche, no borrador) | `npx vitest run src/components/graph/designer/__tests__/inspector-draft.test.ts` | verde — sólo viajan los campos editados: arrastrar el nodo con la ficha abierta ya no lo devuelve a su sitio anterior |
| Portapapeles del lienzo (copiar/pegar) | `npx vitest run src/components/graph/designer/__tests__/clipboard.test.ts` | verde — copia contenedor+contenido, sólo enlaces con ambas puntas, ids/nombres nuevos al pegar, `agregado` reapuntado |
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
