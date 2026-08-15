# STATUS — estado verificado

Lo imprime el hook `SessionStart`. Sirve para no releer el repo entero para responder "¿esto anda?".
Se actualiza cuando cambia el veredicto, no en cada commit. **Sólo va lo verificado con un comando**;
lo que se supone va en "deuda conocida".

- **Fecha del último gate completo:** 2026-08-14
- **Rama:** `feat/bpmn-notation-layout`
- **Veredicto:** VERDE (`npm run gate`)

## Señales

| Señal | Comando | Resultado |
|---|---|---|
| Self-test del arnés | `node scripts/harness-selftest.mjs` | verde — 7 hooks, 65 regex, 17 frenos probados, 8 casos de ruteo |
| Link-check de docs | `node scripts/docs-linkcheck.mjs` | verde |
| Lint de convenciones | `node scripts/repo-lint.mjs` | verde |
| Skills sincronizados | `node scripts/sync-skills.mjs --check` | verde — embed de `.claude/skills/**` al día |
| Typecheck | `npm run typecheck` | verde (renderer + electron) |
| Tests | `npm run test:coverage` | verde — 51 archivos, 748 pruebas |
| E2E del MCP (stdio) | script manual contra `mcp-server/index.ts` | verde — 20 tools; arnés completo (ingesta → citas → ambigüedades → calidad → revisión → export → install_skill) |
| Build de producción | `npm run build` | verde |

Pre-commit instalado: sí (`core.hooksPath=.githooks`). CI corre el mismo gate.

## Deuda conocida

| Deuda | Dónde | Nota |
|---|---|---|
| 16 archivos cablean literales de notación | `.claude/harness.config.json` → `notation.allow` | la regla NOTACION bloquea lo nuevo; la lista sólo puede achicarse |
| SDD ruteado pero no bloqueante | `docs/harness/sdd.md` §Estado | ya hay una feature con artefactos: `specs/001-layout-legible/` |
| Nodos de ancho fijo en el lienzo | `DesignerCanvas.tsx:725` | el nombre se acota por umbral (~21 car.), no por geometría; ver `specs/001-layout-legible` Clarificación 3 |
| Sin test de frontera de red | — | nada prueba que los tests no hagan llamadas externas |
| Sin dobles de prueba para LiteRT ni E2E del lienzo | — | la UI se verifica a mano (`npm run electron-dev`) |
| Modo app del MCP sin probar end-to-end | `main/services/mcp-http.ts` | el arnés está probado por stdio y por unidad; `get_app_state` con la app viva, `export_as_view` y la banda vacía en el lienzo se verifican a mano |
| `onnxruntime-node` sigue en `overrides` | `package.json` | no se usa para generar (crash nativo con Gemma); ver `docs/harness/gotchas.md` |
| Cobertura acotada a `src/lib/**` | `vitest.config.ts` | `main/`, `mcp-server/` y la UI no tienen cobertura exigida |

## Trabajo en curso

Rama `feat/bpmn-notation-layout`: simbología canónica de eventos BPMN, layout de swimlanes dirigido
por flujo y la notación viajando con el modelo. Hay cambios sin commitear en el working tree.

**Arnés MCP para agentes externos** (mismo working tree): los skills se instalan desde el propio
servidor (`list_skills` / `install_skill`, con la configuración del transporte inyectada) y el
ciclo de diseño quedó cerrado por herramientas — `get_app_state` (ingesta antes de exportar),
`source` por elemento (trazabilidad a la fuente), `record_ambiguity` / `resolve_ambiguity`,
`validate_diagram` con reglas de calidad por ROL semántico (`notations.ts`), `suggest_views` y
`review_diagram` (paquete de revisión humana). Ruta SDD saltada y declarada: cambio incremental
sobre `src/lib/mcp` con TDD.
