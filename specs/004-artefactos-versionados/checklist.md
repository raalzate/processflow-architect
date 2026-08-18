# checklist · 004 — Calidad del spec

Puntuación de [spec.md](spec.md) antes de escribir código. Cada ítem apunta al FR/SC/US concreto;
un ítem en ⚠ no bloquea, pero queda dicho.

## Puntuación

```
Calidad del spec: 9/10
  Requisitos:            13 FR-XXX                       ✓
  Criterios medibles:    7 de 7 SC con objetivo numérico ✓
  Clarificaciones:       0 pendientes                    ✓
  Cobertura de historias: 6 de 6 con Given/When/Then     ✓
  Referencias cruzadas:  0 requisitos huérfanos          ✓
  Ambigüedad residual:   1 (clave de linaje por título)  ⚠
```

## Completitud

| # | Ítem | Estado | Dónde |
|---|---|---|---|
| C1 | Cada historia tiene escenario Given/When/Then | ✓ | US-1…US-6 |
| C2 | Cada FR traza a una historia | ✓ | FR-001…013 (ver tabla de trazabilidad) |
| C3 | Cada SC tiene número, no adjetivo | ✓ | SC-001…007 |
| C4 | El estado anterior tiene ruta de migración declarada | ✓ | US-6, FR-011, SC-003 |
| C5 | Fuera de alcance explícito | ✓ | 5 ítems, con motivo |
| C6 | Riesgos con mitigación | ✓ | tabla de riesgos |
| C7 | La decisión ambigua está *decidida*, no diferida | ✓ | §«Decisión de diseño» + FR-002 |

## Claridad

| # | Ítem | Estado | Nota |
|---|---|---|---|
| C8 | «Versionar según el tipo» está definido sin ambigüedad | ✓ | clave = `kind` + título normalizado; `singleton` sólo `kind` |
| C9 | «Guardar el histórico» está definido | ✓ | append-only (FR-007), archivar en vez de borrar (FR-009) |
| C10 | «Incrementar» está definido | ✓ | `revision = max + 1` (FR-004) |
| C11 | El límite conocido está escrito, no escondido | ⚠→✓ | título cambiado ⇒ linaje nuevo; salida manual en FR-008 |
| C12 | El spec no decide dónde corre la IA | ✓ | no toca el ruteo (§P4) |

## Consistencia con la constitución

| # | Principio | Cómo lo cumple |
|---|---|---|
| C13 | §P1 gate verde | SC-007 |
| C14 | §P3 TDD en `src/lib/` | FR-001 (lógica pura) + SC-005 (≥ 95 %) |
| C15 | §P6 agnóstico de notación | FR-013: `singleton` en el registry, cero `kind` cableado fuera |
| C16 | §P8 el lienzo nunca en blanco | D3 del plan: estado corrupto ⇒ igual devuelve una revisión vigente |
| C17 | §P2 integridad de aserciones | los tests de append-only (SC-004) no se debilitan: si fallan, se arregla el módulo |

## Trazabilidad FR → US → SC

| FR | US | SC |
|---|---|---|
| FR-001, FR-002 | US-1 | SC-005 |
| FR-003, FR-004 | US-1 | SC-001 |
| FR-005 | US-1 | SC-001 |
| FR-006 | US-2 | SC-002 |
| FR-007 | US-3 | SC-004 |
| FR-008 | US-1 (límite de clave) | — |
| FR-009 | US-4 | SC-004 |
| FR-010 | US-5 | SC-006 |
| FR-011 | US-6 | SC-003 |
| FR-012 | US-2 | — |
| FR-013 | US-1 | SC-005 |

**Huérfanos:** ninguno. FR-008 y FR-012 no tienen SC numérico propio: se verifican por escenario
(ver [testify.md](testify.md)), y eso queda declarado en vez de inventar una métrica.

## Veredicto

Apto para pasar a `tasks`. La única ambigüedad residual (C11) está decidida en el spec y tiene
salida de emergencia en el producto (FR-008); no amerita `/sofka-clarify`.
