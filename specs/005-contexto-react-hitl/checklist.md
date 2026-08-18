# checklist · 005 — Calidad del spec

Puntuación de [spec.md](spec.md) antes de escribir código. Cada ítem apunta al FR/SC/H concreto;
un ítem en ⚠ no bloquea, pero queda dicho.

## Puntuación

```
Calidad del spec: 9/10
  Requisitos:             18 FR-XXX                       ✓
  Criterios medibles:     10 de 10 SC con objetivo         ✓
  Clarificaciones:        0 pendientes (3 decisiones cerradas con el humano) ✓
  Cobertura de historias: 5 de 5 con Given/When/Then       ✓
  Referencias cruzadas:   0 requisitos huérfanos           ✓
  Ambigüedad residual:    1 (¿cuándo una duda "cambia el resultado"?) ⚠
```

## Completitud

| # | Ítem | Estado | Dónde |
|---|---|---|---|
| C1 | Cada historia tiene escenarios Given/When/Then | ✓ | H1…H5 |
| C2 | Cada FR traza a una historia | ✓ | tabla de trazabilidad |
| C3 | Cada SC tiene número o umbral, no adjetivo | ✓ | SC-001…010 |
| C4 | El comportamiento actual que se reemplaza está citado con archivo:línea | ✓ | §Problema (`litert-agent.ts:280`, `:389`, `:507`, `views-types.ts:42`, `AgentContext.tsx:401,435`) |
| C5 | Fuera de alcance explícito, con motivo | ✓ | 6 ítems |
| C6 | Riesgos con mitigación | ✓ | 5 riesgos |
| C7 | Casos borde escritos (no sólo el camino feliz) | ✓ | 8 casos, incluye recarga y techo de turnos |
| C8 | La ruta de abandono/fallo está definida | ✓ | FR-016 (reconstruir o cancelar con motivo) |

## Claridad

| # | Ítem | Estado | Nota |
|---|---|---|---|
| C9 | «Recuperar por partes» está definido sin ambigüedad | ✓ | tres herramientas de lectura con contrato (FR-002…004) |
| C10 | «Human-in-the-loop» está definido | ✓ | dos puntos: plan aprobable (FR-008) y pregunta de opciones (FR-009) |
| C11 | «Consolidar con trazabilidad» está definido | ✓ | notas atribuidas (FR-010) → citas validadas contra las notas (FR-011) |
| C12 | El presupuesto es una regla, no una intención | ✓ | FR-007 + SC-005; agotado ⇒ consolidar y declarar cobertura |
| C13 | ¿Cuándo el agente DEBE preguntar? | ⚠ | criterio: la decisión cambia el resultado (FR-009). Es un juicio del modelo; el freno duro es «una vez por corrida» y que «no sé» avance |
| C14 | El spec no decide dónde corre la IA | ✓ | FR-014: mismo ciclo en local/hybrid/remote, sin tocar el ruteo |
| C15 | El spec no describe implementación (nombres de función, firmas) | ✓ | nombra módulos y contratos, no APIs |

## Consistencia con la constitución

| # | Principio | Cómo lo cumple |
|---|---|---|
| C16 | §P1 gate verde | SC-010 |
| C17 | §P3 TDD en `src/lib/` | FR-001 y FR-006 (módulos puros) + SC-007 (≥ 95 %) |
| C18 | §P4 IA local por defecto | FR-014: la exploración corre igual sin nube; nada obliga a activar remoto |
| C19 | §P5 añadir IA = declarar `AiTask` | SC-009: cero cambios en `router.ts` / `providers.ts` |
| C20 | §P6 agnóstico de notación | `list_views` reporta la notación desde el registro; ninguna herramienta cablea tipos DDD |
| C21 | §P11 conducta ante el error | herramienta inexistente o nombre no resuelto ⇒ observación accionable con sugerencias, sin reintento ciego |

## Trazabilidad FR → H → SC

| FR | H | SC |
|---|---|---|
| FR-001 | H1 | SC-007 |
| FR-002 | H1 | SC-001 |
| FR-003 | H1 | SC-008 |
| FR-004 | H1 | SC-001 |
| FR-005 | H1 | — (invariante; se prueba por escenario) |
| FR-006 | H2, H3 | SC-006, SC-007 |
| FR-007 | H1 | SC-005 |
| FR-008 | H2 | SC-003 |
| FR-009 | H3 | SC-004 |
| FR-010 | H4 | SC-002 |
| FR-011 | H5 | SC-002 |
| FR-012 | H5 | — (se prueba por escenario) |
| FR-013 | H1, H5 | SC-002 |
| FR-014 | H1 | SC-009 |
| FR-015 | H2 | SC-003 |
| FR-016 | H2, H3 | SC-006 |
| FR-017 | H1 | SC-005 |
| FR-018 | H4 | — (se prueba por escenario) |

**Huérfanos:** ninguno. FR-005, FR-012 y FR-018 no tienen SC numérico propio: son invariantes o
comportamiento de UI y se verifican por escenario en `testify`. Queda declarado en vez de inventar
una métrica.

## Veredicto

Apto para pasar a `plan`. La ambigüedad residual (C13) es de juicio del modelo, no del spec: está
acotada por dos frenos duros —una pregunta por tema y por corrida, y «no sé» siempre avanza— así que
no amerita `/sofka-clarify`.
