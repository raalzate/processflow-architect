---
name: sofka-02-plan
description: "Design the implementation of an existing SDD specification using the repository architecture and available dependency contracts."
---

# Plan técnico sobre el código actual

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Lee el spec de la issue madre, la constitución y `docs/architecture/reuse-patterns.md`. Usa los índices disponibles; si faltan, declara la ausencia y busca símbolos con `rg`.

## Trabajo
- Localiza los puntos de edición, persistencia, transporte y presentación que ya existen. Explica qué se reutiliza y qué interfaz nueva resulta necesaria.
- Define datos, identidades, orden de operaciones, recuperación, límites de confianza y compatibilidad. Relaciona cada decisión con los `FR-XXX` que resuelve.
- Consulta declaraciones instaladas y documentación oficial para APIs nuevas. Usa tiles de Tessl si están disponibles; un fallo de búsqueda no demuestra que no existan ni autoriza inventar una API.
- Separa lógica pura, servicios nativos y UI siguiendo las capas actuales. Incluye validaciones significativas por cambio grande y plataformas que se comprobarán.

## Salida y continuación
Produce el plan y sus contratos en el scratchpad y publícalos como comentario de la issue madre mediante `--body-file`, dentro de la autorización del trabajo. Distingue mecanismos implementables de hipótesis por medir. Continúa con `sofka-03-checklist`.
