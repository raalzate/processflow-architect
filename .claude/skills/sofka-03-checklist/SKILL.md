---
name: sofka-03-checklist
description: "Assess specification completeness and readiness using traceable acceptance evidence, without assigning a passing score to missing information."
---

# Completitud del requisito

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Usa spec, plan y criterios de éxito de la issue activa.

## Trabajo
Construye una tabla de criterios relevantes con `FR/SC`, comprobación prevista, estado y justificación. Revisa comportamiento observable, límites de datos, errores, compatibilidad, permisos y verificación de plataforma sólo cuando correspondan al flujo.

Usa estados `completo`, `parcial`, `ausente` o `no aplica` con una razón. Si se pide puntuación, informa completos sobre aplicables y muestra ambos números; un desconocido nunca cuenta como completo. No conviertas una tabla puntuada en evidencia de pruebas ejecutadas.

Un requisito obligatorio ausente o contradictorio vuelve a specify/plan. Para una duda menor que no bloquea el trabajo, registra la suposición y continúa con las tareas independientes. No exijas aprobaciones de fase que el pedido ya autoriza.

## Salida y continuación
Publica el checklist trazable en la issue madre. Indica los huecos concretos y la evidencia necesaria para cerrarlos. Cuando el contrato pueda probarse, continúa con `sofka-04-testify`.
