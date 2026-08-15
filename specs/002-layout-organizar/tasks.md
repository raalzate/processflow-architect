# tasks · 002 — Organizar el layout desde el lienzo

TDD en `src/lib/` (P3). Cada tarea con su prueba; entrega con `npm run gate` verde.

| # | Tarea | Requisitos | Verificación |
|---|---|---|---|
| T1 | Registro de presets de densidad y estrategias en `src/lib/mcp/layout-presets.ts` | FR-001, FR-002 | test del registro (valores crecientes, ids estables) |
| T2 | `layout(model, opts)` con preset y estrategia; default `comodo` + estrategia por roles | FR-003, FR-004 | `diagram-builder.test.ts`: expandido ≥ 1,6× compacto |
| T3 | El modelo recuerda preset/estrategia aplicados | FR-005 | test de round-trip |
| T4 | No-regresión semántica al cambiar preset/estrategia | FR-010 | test sobre los 5 modelos reales (sonda) |
| T5 | `relayout_diagram` acepta `preset` y `strategy` | FR-009 | `mcp-tools.test.ts` |
| T6 | `AiTask` de organización: devuelve orden de bandas y agrupación, validada contra el modelo | FR-008 | `tasks.test.ts` + test de saneamiento |
| T7 | Aplicar la propuesta de la IA sobre el layout determinista | FR-008 | test: nombres inventados se descartan |
| T8 | Botón «Organizar» con menú en la barra del diseñador, con el preset actual marcado | FR-006 | verificación visual |
| T9 | Reorganizar entra en el historial de deshacer | FR-007 | verificación visual |
| T10 | Medir SC-001…SC-003 con la sonda sobre los modelos de Geiser | SC-001…SC-003 | informe con números |
| T11 | Skills al día (los presets también los usa el agente) + `skills:sync` | FR-009 | test de sincronía |
| T12 | `npm run gate` + STATUS | SC-005 | gate verde |

## Estado

- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8 · [ ] T9 · [ ] T10 · [ ] T11 · [ ] T12
