# STATUS — estado verificado

Lo imprime el hook `SessionStart`. Sirve para no releer el repo entero para responder "¿esto anda?".
Se actualiza cuando cambia el veredicto, no en cada commit. **Sólo va lo verificado con un comando**;
lo que se supone va en "deuda conocida".

- **Fecha del último gate completo:** 2026-08-18
- **Rama:** `main`
- **Veredicto:** VERDE (`npm run gate`)
- **Versión publicada:** 0.4.0 (tag `v0.4.0` → instaladores por `release-build.yml`)

## Señales

| Señal | Comando | Resultado |
|---|---|---|
| Self-test del arnés | `node scripts/harness-selftest.mjs` | verde — 7 hooks, 22 frenos probados (incluye DEPSHOOK, TOKENS, SVGFILL, PLATAFORMA y «no escribe temporales en `src/`»), 8 casos de ruteo |
| Link-check de docs | `node scripts/docs-linkcheck.mjs` | verde |
| Lint de convenciones | `node scripts/repo-lint.mjs` | verde |
| Skills sincronizados | `node scripts/sync-skills.mjs --check` | verde — embed de `.claude/skills/**` al día |
| Typecheck | `npm run typecheck` | verde (renderer + electron) |
| Tests | `npm run test:coverage` | verde — 68 archivos, 1094 pruebas (cobertura `src/lib` 97,3 % stmts; `ai/agent-run.ts` 98,8 %, `ai/litert-engine.ts` 98,2 %, `ai/litert-agent.ts` 93,2 %) |
| E2E del MCP (stdio) | script manual contra `mcp-server/index.ts` | verde — 20 tools; arnés completo (ingesta → citas → ambigüedades → calidad → revisión → export → install_skill) |
| Build de producción | `npm run build` | verde |

Pre-commit instalado: sí (`core.hooksPath=.githooks`). CI corre el mismo gate.

## Deuda conocida

| Deuda | Dónde | Nota |
|---|---|---|
| 16 archivos cablean literales de notación | `.claude/harness.config.json` → `notation.allow` | la regla NOTACION bloquea lo nuevo; la lista sólo puede achicarse |
| SDD ruteado pero no bloqueante | `docs/harness/sdd.md` §Estado | ya hay una feature con artefactos: `specs/001-layout-legible/` |
| El lienzo se verifica a ojo | — | no hay test de render; la simbología se cubre por el registro (`notation-symbols`, `notation-contrast`) y la geometría por `link-geom` |
| Sin test de frontera de red | — | nada prueba que los tests no hagan llamadas externas |
| Sin dobles de prueba para LiteRT ni E2E del lienzo | — | la UI se verifica a mano (`npm run electron-dev`) |
| Modo app del MCP sin probar end-to-end | `main/services/mcp-http.ts` | el arnés está probado por stdio y por unidad; `get_app_state` con la app viva, `export_as_view` y la banda vacía en el lienzo se verifican a mano |
| `onnxruntime-node` sigue en `overrides` | `package.json` | no se usa para generar (crash nativo con Gemma); ver `docs/harness/gotchas.md` |
| Cobertura acotada a `src/lib/**` | `vitest.config.ts` | `main/`, `mcp-server/` y la UI no tienen cobertura exigida |

## Trabajo en curso

Nada abierto. **005** (el agente recupera el contexto por partes y consulta al humano) entró en
`main` y salió en `v0.3.0`. En `v0.4.0` salieron los créditos de Sofka + marca beta, el pedido
explícito de artefacto (menú «+»), el riel de artefactos del panel colapsado con iconos por tipo,
y los arreglos del motor local (una sola conversación viva por engine, JSON con comillas sueltas,
plan de rescate).

Pendiente de medición, no de código (declarado en `analyze.md` §Deuda):
cuántos turnos gasta un **Gemma real** hasta proponer un plan usable, y el ciclo completo en modo
`hybrid`/`remote` (es agnóstico del motor y no se tocó el ruteo, pero nadie lo corrió contra nube).

**Artefactos versionados (spec 004) — CON ruta SDD, ciclo completo.**
`specs/004-artefactos-versionados/` tiene las seis fases (`spec` · `plan` · `checklist` ·
`testify` · `tasks` · `analyze`) y las 13 tareas marcadas. Cada artefacto tiene ahora su propio
linaje: regenerar incrementa la revisión en vez de duplicar la tarjeta, el histórico es
append-only (restaurar crea una revisión nueva), borrar en el panel archiva y el borrado
definitivo pide confirmación. Toda la lógica vive en `src/lib/artifacts/versioning.ts`
(42 pruebas, 99,3 % stmts) y el estado guardado antes de 004 se migra al cargar, sin perder
artefactos. **Pendiente:** la verificación visual M1–M5 de `testify.md` en la app de escritorio
(no hay E2E de UI).

**Una sola piel (spec 003) — CON ruta SDD.** `specs/003-ui-homogenea/` cubre el rediseño de la
piel: app siempre oscura, tokens de estado y de código, `CodeBlock` único, escala tipográfica y
regla TOKENS en el lint. Las 11 tareas quedaron marcadas con su comando. No cambia la
disposición de la interfaz: eso, si se quiere, es otra spec.

**Simbología por notación — ruta SDD SALTADA, declarado.** El cambio no abrió una
carpeta nueva bajo `specs/`: entra por el registro (`src/lib/notations.ts` declara tamaño de nodo,
rotulado, trazo y forma; el resto obedece) y queda cubierto por pruebas —
`notation-symbols`, `notation-contrast`, `layout-radial`, `layout-node-size`,
`edge-label` y `link-geometry`. Desborda `specs/002-layout-organizar`, que sólo cubre
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
