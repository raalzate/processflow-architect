---
name: sofka-00-constitution
description: "Evaluate repository principles and constraints before planning a new feature or an explicitly requested constitution change."
---

# Principios de la implementación

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Lee el pedido, `AGENTS.md`, `CLAUDE.md` y [CONSTITUTION.md](../../../CONSTITUTION.md). Identifica qué principios afectan el comportamiento solicitado y dónde tienen mecanismos ejecutables.

## Trabajo
- Conserva la constitución existente. No conviertas una preferencia del agente en una regla del proyecto.
- Relaciona los requisitos con sus límites reales: capas, estado privado, identidad, permisos, IA local y verificación, según corresponda al pedido.
- Si el pedido entra en conflicto con un principio, explica el conflicto concreto y comprueba la autorización ya existente antes de preguntar. No modifiques el principio para ocultar un fallo.
- Una enmienda autorizada lleva versión, motivo y commit propio, como exige la constitución.

## Salida y continuación
Produce una tabla breve de principio, requisito afectado, mecanismo y evidencia pendiente. La evaluación acompaña la issue madre; la constitución permanece en su archivo canónico. Continúa con `sofka-01-specify` cuando el alcance esté definido.
