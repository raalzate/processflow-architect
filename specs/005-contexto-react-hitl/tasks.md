# tasks · 005 — Contexto por partes + human-in-the-loop

Orden por dependencia: primero los tipos, después los dos módulos puros con sus pruebas (TDD, §P3),
después el adaptador del modelo, después el contexto, después la UI, y el gate al final.

Entrega con `npm run gate` verde (§P1). Escenarios en [testify.md](testify.md); diseño en
[plan.md](plan.md).

| # | Tarea | Requisitos | Verificación |
|---|---|---|---|
| T1 | Tipos de la corrida en `src/lib/agent-types.ts`: `AgentNote`, `AgentPause`, `AgentRunState`; pasos nuevos en `AgentStepSchema`; `run?` en `ChatMessage` | FR-006, FR-018 | typecheck |
| T2 | `agent-retrieval.ts`: `listViews` | FR-002 | E1–E3 |
| T3 | `agent-retrieval.ts`: `resolveViewName` (tolerante + sugerencias) | FR-003 | E8, E9 |
| T4 | `agent-retrieval.ts`: `readView` (TOON, recorte, costo, nota) | FR-003, FR-007 | E4–E7 |
| T5 | `agent-retrieval.ts`: `searchModel` (orden determinista, tope, vista de origen) | FR-004 | E10–E12 |
| T6 | `agent-run.ts`: estado inicial, `applyToolCall`, presupuesto y relectura | FR-006, FR-007, FR-017 | E13–E15 |
| T7 | `agent-run.ts`: plan (`registerPlan`, `needsPlan`, `approvePlan`, `adjustPlan`, `cancelRun`) | FR-008, FR-015 | E16–E20 |
| T8 | `agent-run.ts`: preguntas (`registerQuestion`, `answerQuestion`, dedupe, supuesto) | FR-009 | E21–E23 |
| T9 | `agent-run.ts`: `consolidationPrompt`, `validateCitations`, `coverageOf`, serialización | FR-010, FR-011, FR-012, FR-013 | E24–E28 |
| T10 | `litert-agent.ts`: herramientas de lectura en el protocolo, `MAX_TURNS`→12 + `MAX_TOOL_TURNS`, plan/pregunta, consolidación forzada al agotarse | FR-013, FR-014, FR-015 | E29–E32 |
| T11 | `AgentContext`: catálogo desde `ViewsContext` + `graphData`, corrida persistida en el mensaje, `resumeRun`/`cancelRun`, validación al cargar | FR-016, FR-017 | typecheck + M1–M4 |
| T12 | `AgentChatPanel`: tarjeta de plan (aprobar/ajustar/cancelar), tarjeta de pregunta (opciones + «no sé»), pasos de progreso con fuente | FR-008, FR-009, FR-010, FR-018 | M1–M4 |
| T13 | `npm run gate` verde + `STATUS.md` al día | SC-010 | gate |

## Verificación manual (no hay runner de componentes)

| Id | Qué se prueba a mano con `npm run electron-dev` |
|---|---|
| M1 | Pedir un artefacto sin pinear vistas: aparecen pasos de lectura y luego el plan |
| M2 | Aprobar el plan genera el artefacto; ajustar vuelve a pedir aprobación; cancelar no deja nada |
| M3 | Una pregunta con opciones se responde desde el chat y la decisión queda en la traza |
| M4 | Recargar con una corrida en espera: se reanuda o se cancela con motivo visible |

## Paralelizable

T2–T5 son independientes entre sí (mismo módulo, funciones separadas). T6–T9 son secuenciales sobre
`agent-run.ts`. T10 depende de T6–T9; T11 de T10; T12 de T11.

## Estado

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 · [x] T8 · [x] T9 · [x] T10 · [x] T11 · [x] T12 · [x] T13

| Tarea | Verificado con |
|---|---|
| T1 · T11 · T12 | `npm run typecheck` verde (renderer + electron) |
| T2–T5 | `src/lib/ai/__tests__/agent-retrieval.test.ts` — 24 pruebas; 98,27 % stmts del módulo |
| T6–T9 | `src/lib/ai/__tests__/agent-run.test.ts` — 38 pruebas; 97,90 % stmts del módulo |
| T10 | `src/lib/ai/__tests__/litert-agent-run.test.ts` — 9 pruebas nuevas del ciclo completo (explorar · plan · pregunta · cancelar · agotamiento · cita inventada) |
| T13 | `npm run gate` verde · 983 pruebas · cobertura global `src/lib` 97,59 % |

M1–M4 (las tarjetas del chat) quedan **pendientes de verificación manual** con `npm run electron-dev`:
no hay runner de componentes en el repo.

Se marca con el comando corrido al lado, no de memoria.
