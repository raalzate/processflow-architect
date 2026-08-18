# analyze · 004 — Consistencia entre artefactos

Fase 06: ¿cada requisito del [spec](spec.md) traza a una tarea de [tasks](tasks.md), a un escenario
de [testify](testify.md) y a un mecanismo real? Verificado con los comandos corridos, no de memoria.

## Trazabilidad FR → tarea → escenario → mecanismo

| FR | Tarea | Escenario | Mecanismo que lo hace cumplir |
|---|---|---|---|
| FR-001 lógica pura | T3 | E1–E3, E11, E12 | `src/lib/artifacts/versioning.ts` + regla PUREZA del lint |
| FR-002 clave de linaje | T3 | E1, E2, E3 | `lineageKey` / `normalizeTitle` con pruebas |
| FR-003 modelo de datos | T1, T9 | — (tipo) | `npm run typecheck` |
| FR-004 ingreso incremental | T4 | E4–E8 | `ingestArtifacts` |
| FR-005 una entrada por linaje | T3, T10 | E6 | `visibleArtifacts` + `ArtifactsPanel` |
| FR-006 histórico abrible | T10 | E6 (datos) + M2 | `lineageHistory` + diálogo de histórico |
| FR-007 append-only | T5 | E9, E10 | prueba de invariante `append-only` |
| FR-008 adjuntar/desprender | T6 | (attach/detach) | `attachToLineage` / `detachArtifact` |
| FR-009 borrar = archivar | T6, T10 | E13, E14 | `archiveLineage` / `purgeLineage` + confirmación en la UI |
| FR-010 contexto vigente | T7, T11 | E15, E16 | `resolveContextRevisions` usado en `AgentContext` y en los chips del chat |
| FR-011 migración | T8, T9 | E17, E18, E19 | `migrateState` en `loadState` |
| FR-012 export con revisión | T12 | E21 | `artifactToMarkdown` + su prueba |
| FR-013 `singleton` en el registry | T2 | E20 | `registry.test.ts` fija los cuatro; nada cablea `kind` fuera |

**Requisitos sin tarea:** ninguno. **Tareas sin requisito:** T13 (gate), que es §P1, no un FR.

## Escenarios de testify → prueba real

| Escenarios | Archivo |
|---|---|
| E1–E19 | `src/lib/artifacts/__tests__/versioning.test.ts` (42 pruebas) |
| E20 | `src/lib/artifacts/__tests__/registry.test.ts` |
| E21 | `src/lib/artifacts/__tests__/to-markdown.test.ts` |
| M1–M5 | verificación manual con `npm run electron-dev` (no hay E2E de UI en el repo) |

Cada escenario de la fase 04 tiene prueba. Cero escenarios huérfanos.

## Criterios de éxito medidos

| SC | Objetivo | Medido | Cómo |
|---|---|---|---|
| SC-001 | 1 tarjeta tras 3 regeneraciones | 1, marcada `v3` | prueba `tres regeneraciones dejan un visible en revisión 3` |
| SC-002 | 3 revisiones recuperables | 3 | misma prueba (`lineageHistory` → `[1,2,3]`) |
| SC-003 | 0 artefactos perdidos al migrar | 0 | pruebas de `migrateState` (4 casos, incluye snapshots distintos) |
| SC-004 | 0 revisiones borradas/mutadas salvo purge | 0 | prueba `append-only` sobre 7 revisiones y 5 operaciones |
| SC-005 | ≥ 95 % stmts del módulo | **99,31 %** stmts · 100 % líneas · 100 % funcs | `vitest --coverage` sobre `src/lib/artifacts/**` |
| SC-006 | 1 versión por linaje al contexto | 1 (la vigente) | prueba `mapea a la vigente y deduplica por linaje` |
| SC-007 | gate verde | verde | `npm run gate` |

## Constitución

| Principio | Veredicto |
|---|---|
| §P1 gate verde | ✓ `npm run gate` |
| §P2 integridad de aserciones | ✓ ninguna aserción existente se debilitó; las pruebas nuevas se agregaron, no se ajustaron |
| §P3 TDD en `src/lib/` | ✓ módulo puro con 42 pruebas; reloj e ids inyectados (`VersioningDeps`) |
| §P4 IA local por defecto | ✓ no se toca el ruteo ni los proveedores |
| §P5 `AiTask` | n/a: no agrega función de IA |
| §P6 agnóstico de notación | ✓ `singleton` vive en el registry; cero `kind` cableado fuera |
| §P7 WebGPU | ✓ intacto |
| §P8 el lienzo nunca en blanco | ✓ `currentRevision` devuelve algo incluso con revisiones empatadas (prueba de estado corrupto) |
| §P9 rutas protegidas | ✓ no se tocaron |
| §P10 acciones amplias | ✓ el borrado definitivo pide confirmación; borrar en el panel es reversible |

## Riesgos que quedan abiertos

| Riesgo | Estado |
|---|---|
| `localStorage` crece con cada revisión | asumido; la purga automática está fuera de alcance por decisión del spec |
| La UI (panel, histórico, chips) no tiene prueba automática | deuda ya declarada en STATUS.md; se verifica con M1–M5 |
| Agrupar por título falla si el agente reescribe el título | salida en producto: adjuntar/desprender (FR-008) |

## Veredicto

Consistente. Sin requisitos huérfanos, sin escenarios sin prueba, sin violaciones de la
constitución. Queda pendiente **sólo** la verificación visual M1–M5 en la app de escritorio.
