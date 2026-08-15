# tasks · 001 — Layout legible de diagramas exportados por MCP

Orden de dependencias. Cada tarea entra con su prueba (P3: TDD en `src/lib/`), y ninguna se
da por hecha sin `npm run gate:fast` verde; la entrega final exige `npm run gate`.

| # | Tarea | Requisitos | Verificación |
|---|---|---|---|
| T1 | Sonda de geometría reutilizable sobre los 5 modelos reales (medir antes/después) | SC-001…SC-004 | script en scratchpad, números en el informe |
| T2 | Test rojo: un mensaje `dashed` entre Pools no altera el rango del Pool vecino | FR-002 | `diagram-builder.test.ts` |
| T3 | Test rojo: cada contenedor arranca en su columna 0 y su ancho depende de sus propios elementos | FR-001, FR-003 | idem |
| T4 | Test rojo: `start` en la primera columna, `end` en la última de su contenedor | FR-004 | idem |
| T5 | Implementar `rankByFlow` por grupo + exclusión de aristas de mensaje + anclaje start/end | FR-001, FR-002, FR-004 | T2–T4 en verde |
| T6 | Implementar ancho de banda por grupo | FR-003 | T3 en verde |
| T7 | Test rojo + implementación de `layoutPorRol` para notaciones sin roles de flujo | FR-005 | filas por rol, sin filas de 1 |
| T8 | Ancho de nodo variable + `MAX_NAME_CHARS` derivado | FR-006, FR-007 | test de umbral y de ancho |
| T9 | Regla de calidad `ETIQUETA-LARGA` | FR-008 | `quality.test.ts` |
| T10 | `routing: "orthogonal"` para aristas entre contenedores al serializar | FR-009 | test de `toGraphData` |
| T11 | Test de no-regresión semántica: mismo modelo antes/después salvo geometría | FR-010 | `diagram-builder.test.ts` |
| T12 | Actualizar los dos SKILL.md con los límites reales + `npm run skills:sync` | FR-006, FR-008 | test de sincronía |
| T13 | Correr la sonda de T1 sobre los 5 modelos y comparar contra los criterios de éxito | SC-001…SC-006 | informe con números |
| T14 | `npm run gate` + actualizar `STATUS.md` | SC-007 | gate verde |
| T15 | Re-exportar a la app y validar visualmente (US-1…US-6) | todas | revisión humana |

| T16 | Agrupar hallazgos repetidos de la misma regla en `formatFindings` (58 líneas no se leen) | descubierta en T13 | `quality.test.ts` |
| T17 | `relayout_diagram` + `relayout` en `import_diagram`: los modelos viejos traen geometría y `layout()` la respeta | FR-011 | `diagram-builder.test.ts`, `mcp-tools.test.ts` |
| T18 | Bandas de ancho uniforme (dejaban un escalonado que se lee como cajas sueltas) | FR-014 | `diagram-builder.test.ts` |
| T19 | Halo de la etiqueta de arista dimensionado al texto + acotado con tooltip | FR-012, FR-013 | verificación visual (renderer sin cobertura exigida) |
| T20 | Badge de notación en la pestaña del modelo del proyecto | FR-015 | verificación visual |
| T21 | `update_element` / `update_edge` / `remove_edge`: corregir sin destruir | FR-016 | `diagram-builder.test.ts`, `mcp-tools.test.ts` |
| T22 | Pase de legibilidad sobre los 5 modelos reales (101 nombres, 56 etiquetas) | SC-005, SC-006 | `validate_diagram` sin hallazgos de nombre/etiqueta |
| T23 | Correcciones de modelado en los modelos reales: Carriles→Pool en los 3 BPMN; 4 políticas cerradas con su comando y su hecho | contenido | `validate_diagram` limpio en 5/5 |

## Estado

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 · [x] T8
- [x] T9 · [x] T10 · [x] T11 · [x] T12 · [x] T13 · [x] T14 · [ ] T15 · [x] T16
- [x] T17 · [x] T18 · [x] T19 · [x] T20 · [x] T21 · [x] T22 · [x] T23

**T15 (validación visual en el lienzo) es lo único abierto**: exige re-exportar los 5 modelos
a la app y mirarlos. Los criterios se midieron por geometría (T13); falta el juicio humano
sobre US-1…US-6.

## Lo que cambió sobre el plan

- **FR-007 descartado** tras leer el renderer: los nodos se dibujan con ancho fijo
  (`DesignerCanvas.tsx:725`), así que ensancharlos en el modelo no tendría efecto. El ajuste
  se hizo por umbral (FR-006). Registrado en la Clarificación 3 del spec.
- **T16 apareció durante la verificación**: al calibrar bien los umbrales, el DDD pasó de 11 a
  58 hallazgos. Todos ciertos, pero un informe de 58 líneas no se lee — el mismo problema de
  carga cognitiva que motivó el paquete de revisión.
- **SC-001 y SC-004 no se cumplieron**; la razón y por qué no se fuerza están en el spec.
