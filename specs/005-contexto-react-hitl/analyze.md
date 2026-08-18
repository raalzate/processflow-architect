# analyze · 005 — Consistencia entre artefactos

Fase 06: que [spec.md](spec.md) ↔ [plan.md](plan.md) ↔ [testify.md](testify.md) ↔ [tasks.md](tasks.md)
digan lo mismo, y que lo que dicen esté **verificado con un comando**, no de memoria.

## Veredicto

```
Consistencia: 10/10
  FR con tarea que los implementa:      18 de 18        ✓
  FR con escenario o verificación:      18 de 18        ✓
  Escenarios con test que los cubre:    32 de 32        ✓
  SC medidos con un comando:            10 de 10        ✓
  Decisiones del plan aplicadas:        12 de 12        ✓
  Fuera de alcance respetado:           6 de 6          ✓
```

## FR → tarea → prueba

| FR | Tarea | Prueba / verificación |
|---|---|---|
| FR-001 (módulo de lectura puro) | T2–T5 | `agent-retrieval.test.ts` · 98,27 % stmts |
| FR-002 (inventario con conteos) | T2 | E1–E3 + «una vista mermaid con código no está vacía» |
| FR-003 (leer en TOON, nombre tolerante) | T3, T4 | E4, E6–E9 |
| FR-004 (búsqueda con vista de origen) | T5 | E10–E12 |
| FR-005 (sólo lectura) | T2–T5 | ninguna función del módulo recibe setters; el catálogo entra por valor |
| FR-006 (corrida reanudable) | T6–T9 | `agent-run.test.ts` · 97,9 % stmts + E28 (ida y vuelta a JSON) |
| FR-007 (presupuesto) | T6 | E13, E14 + «sin presupuesto la observación empuja a consolidar» |
| FR-008 (plan aprobable) | T7 | E16–E20 + E30 (bucle) |
| FR-009 (pregunta una vez, «no sé» avanza) | T8 | E21–E23 + E31 |
| FR-010 (notas atribuidas = progreso) | T6, T9, T12 | E24 + pasos `read`/`search` con `source` en E29 |
| FR-011 (citas validadas + cobertura) | T9, T10 | E25, E26, E27 + «una cita a una fuente que nunca se leyó no sobrevive» |
| FR-012 (un hecho, varias fuentes) | T9 | instrucción explícita en `consolidationPrompt` (E24) |
| FR-013 (agotarse ⇒ consolidar) | T9, T10 | «al agotar los turnos consolida en vez de cerrar con las manos vacías» |
| FR-014 (local/hybrid/remote sin tocar el router) | T10 | SC-009: `git diff --stat` sobre `router.ts`/`providers.ts` = 0 |
| FR-015 (sin intención de generar no hay bucle) | T10 | «conversa sin artefactos y respeta el streaming» (suite previa, sigue verde) |
| FR-016 (corrida persistida o cancelada con motivo) | T11 | validación al reanudar (`unknownPlanSources`, 6 pruebas) + M4 |
| FR-017 (pineadas no se releen) | T6, T11 | «una vista pineada no se relee» |
| FR-018 (traza distingue los pasos nuevos) | T1, T12 | `AgentStepSchema` + `StepIcon` sin `switch` exhaustivo; E29 cuenta pasos por tipo |

**Huérfanos:** ninguno. FR-005 y FR-012 no tienen test numérico propio y está declarado arriba
(invariante estructural y instrucción de prompt).

## SC medidos

| SC | Medida | Resultado |
|---|---|---|
| SC-001 | vistas alcanzables sin pinear | todas: `list_views` + `read_view` recorren el catálogo completo (E1, E29) |
| SC-002 | artefactos sin cobertura ni fuentes | 0 — `withCoverageFooter` la agrega si el modelo la omite (E «aprobar el plan… con cobertura declarada») |
| SC-003 | artefactos generados sin aprobar el plan | 0 (E16, «no genera sin plan») |
| SC-004 | preguntas repetidas por corrida | 0 (E22) |
| SC-005 | relecturas que gastan presupuesto | 0 (E13) |
| SC-006 | corridas colgadas tras recargar | 0 — al reanudar se valida y, si el proyecto cambió, se cancela con motivo (FR-016) |
| SC-007 | cobertura de los módulos nuevos | `agent-retrieval.ts` 98,27 % · `agent-run.ts` 97,90 % (objetivo ≥ 95 %) |
| SC-008 | nombres resueltos con acentos/mayúsculas | 100 % de los casos probados (E8 + 4 casos extra) |
| SC-009 | cambios en `router.ts` / `providers.ts` | 0 |
| SC-010 | `npm run gate` | verde |

## Decisiones del plan, aplicadas

| Decisión | Dónde quedó |
|---|---|
| D1 catálogo plano, no contexto de React | `Catalog`/`ViewEntry` en `agent-retrieval.ts`; lo arma `AgentContext` con `useMemo` |
| D2 un solo `ToolResult` | las tres herramientas devuelven `{ok,text,cost,note}` o `{ok:false,error,suggestions}` |
| D3 resolución tolerante aparte | `resolveViewName` + `normalizeName` |
| D4 presupuesto en caracteres | `RUN_BUDGET = 24 000`, `VIEW_READ_MAX = 6 000` |
| D5 el bucle no decide | toda transición vive en `agent-run.ts`; `litert-agent.ts` sólo adapta el modelo |
| D6 plan como turno con contrato | `{"plan":{…}}` + `registerPlan` valida fuentes contra el catálogo (E17) |
| D7 pregunta con supuesto por defecto | `registerQuestion` + `answerQuestion` con `UNKNOWN_ANSWER` |
| D8 citas validadas, 1 reintento y stripping | `validateCitations` + `stripInvalidCitations` en el turno de generación |
| D9 techos y consolidación forzada | `MAX_EXPLORE_TURNS = 12`, `MAX_TOOL_TURNS = 8`, red de seguridad al salir del bucle |
| D10 sin tocar el router | SC-009 |
| D11 `resumeRun`/`cancelRun` en el contexto | `AgentContext` + tarjetas en `AgentChatPanel`; validación **al reanudar** (corregido tras M4) |
| D12 no se persiste el TOON | sólo `notes` viajan en `AgentRunState` |

## Riesgos: estado

| Riesgo del spec | Estado |
|---|---|
| El modelo no emite el JSON del plan | cubierto por el rescate off-contract ya existente + observación accionable; **pendiente de medir con el modelo real** |
| Corridas lentas | mitigado por diseño (inventario con conteos, presupuesto); **sin medición en máquina modesta** |
| Interrupciones tediosas | un solo punto de control + dedupe de preguntas (E22) |
| Citas inventadas | cerrado (validación + stripping) |
| `localStorage` inflado | cerrado (D12) |

## Hallazgos de la verificación manual (M1–M4)

| # | Hallazgo | Estado |
|---|---|---|
| H-1 | El chequeo de la corrida al CARGAR cancelaba corridas válidas: corría antes de que las vistas del proyecto estuvieran en el catálogo | corregido — se valida al reanudar (plan D11 actualizado) |
| H-2 | Dos definiciones de "fuente válida" (contexto vs. `registerPlan`): un plan que citaba `PCI.pdf` se cancelaba solo | corregido — `unknownPlanSources` es la única regla, con 6 pruebas |
| M1–M3 | Pasos de lectura en la traza, tarjeta de plan (Aprobar / Ajustar / Cancelar) y tarjeta de pregunta (opciones + «No sé, seguí») | verificados con estado sembrado y captura |
| M4 | Reanudar tras recargar | verificado en sus dos ramas: con el proyecto intacto reanuda; con la vista ausente cancela con motivo visible |

## Deuda declarada de esta feature

1. **La UI se verifica a mano** (M1–M4): no hay runner de componentes en el repo — deuda ya declarada
   en `STATUS.md`, no nueva.
2. **El comportamiento con el modelo real no está medido**: cuántos turnos gasta un Gemma E4B antes de
   proponer un plan usable. Es lo primero a mirar en la verificación manual.
3. **`hybrid`/`remote` no ejercitados end-to-end**: el ciclo es agnóstico del motor y no se tocó el
   router, pero nadie corrió la exploración contra un proveedor de nube.
