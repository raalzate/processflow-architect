---
name: sofka-05-tasks
description: "Break an approved SDD plan into independently verifiable tasks linked to requirements and actual repository integration points."
---

# Tareas con dependencias

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Lee spec, plan, checklist y escenarios. Evita tareas genéricas como «implementar todo» o «añadir pruebas» sin comportamiento verificable.

## Trabajo
Ordena por dependencias: identidades/contratos, lógica pura, persistencia/servicio, integración de UI y verificación, adaptándolo al proyecto real. Cada tarea debe indicar FR/SC, archivos o símbolos probables, dependencia y una comprobación observable.

Usa el formato que ya consume `scripts/sdd-github.mjs`:

```markdown
| Tarea | Descripción | Requisitos | Verificación |
|---|---|---|---|
| T1 | Cambio concreto | FR-001 / SC-001 | Comando y resultado esperado |

- [ ] T1
```

Marca terminada sólo una tarea verificada, no una promesa o una prueba todavía pendiente. Incluye revisión independiente y gate completo antes de entregar. Una prueba sobre otra plataforma debe ejecutarse allí o quedar declarada pendiente.

## Salida y continuación
Guarda `tasks.md` en el scratchpad. Registra las tareas con `sofka-08-taskstoissues` cuando esté autorizado y conserva sus URLs. Continúa con `sofka-06-analyze` antes de tocar la implementación del plan.
