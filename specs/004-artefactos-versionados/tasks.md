# tasks · 004 — Artefactos versionados por tipo

Orden por dependencia: primero el tipo y el registry, después el módulo puro con sus pruebas
(TDD, §P3), después el contexto, después la UI, y el gate al final.

Entrega con `npm run gate` verde (§P1). Escenarios en [testify.md](testify.md).

| # | Tarea | Requisitos | Verificación |
|---|---|---|---|
| T1 | `ArtifactLineage` + campos `lineageId`/`revision`/`supersededBy`/`restoredFrom` en `Artifact` (`src/lib/agent-types.ts`) | FR-003 | typecheck |
| T2 | Campo `singleton` en el registry, marcado en `drivers`, `constraints`, `proposal`, `roadmap` | FR-013 | E20 (`registry.test.ts`) |
| T3 | Módulo puro de versionado: `lineageKey`, `normalizeTitle`, `currentRevision`, `lineageHistory`, `visibleArtifacts` | FR-001, FR-002, FR-005 | E1–E3, E6, E11, E12 |
| T4 | `ingestArtifacts` (incrementa, crea, revive, respeta snapshots) con `deps = { uid, now }` | FR-004 | E4, E5, E7, E8 |
| T5 | `restoreRevision` + invariante append-only | FR-007 | E9, E10 |
| T6 | `archiveLineage`, `purgeLineage`, `attachToLineage`, `detachArtifact` | FR-008, FR-009 | E13, E14, E10 |
| T7 | `resolveContextRevisions` (vigente + dedup por linaje + ids inexistentes) | FR-010 | E15, E16 |
| T8 | `migrateState` pura e idempotente | FR-011 | E17, E18, E19 |
| T9 | `AgentContext`: `lineages` en el estado persistido, migración en `loadState`, ingreso vía T4, `visibleArtifacts`, acciones nuevas, `deleteArtifact` = archivar | FR-003…FR-010 | typecheck + M1–M5 |
| T10 | `ArtifactsPanel`: lista por linaje con badge `vN`, diálogo de histórico, restaurar, borrado definitivo con confirmación | FR-005, FR-006, FR-007, FR-009 | M1–M4 |
| T11 | `AgentChatPanel`: el contexto se resuelve con T7 | FR-010 | M5 |
| T12 | Encabezado del export con `· vN` | FR-012 | E21 (`to-markdown.test.ts`) |
| T13 | `npm run gate` + STATUS.md al día | SC-007 | gate verde |

## Paralelizable

T1 y T2 son independientes. T3→T8 son secuenciales sobre el mismo módulo. T10, T11 y T12 pueden ir
en paralelo una vez cerrado T9.

## Estado

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 · [x] T8 · [x] T9 · [x] T10 · [x] T11 · [x] T12 · [x] T13

Marcado con el comando corrido al lado, no de memoria:

| Tarea | Verificado con |
|---|---|
| T1 · T9 | `npm run typecheck` verde (renderer + electron) |
| T2 | `src/lib/artifacts/__tests__/registry.test.ts` — los cuatro singleton, ningún otro |
| T3–T8 | `src/lib/artifacts/__tests__/versioning.test.ts` — 42 pruebas; 99,31 % stmts / 100 % líneas del módulo |
| T12 | `src/lib/artifacts/__tests__/to-markdown.test.ts` — encabezado con `· vN` |
| T10 · T11 | verificación visual pendiente del usuario (M1–M5); no hay E2E de UI en el repo |
| T13 | `npm run gate` verde |
