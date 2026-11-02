---
name: sofka-bugfix
description: "Reproduce and fix a concrete defect in existing behavior with a meaningful regression test and the repository checks."
---

# Reproducción y corrección acotada

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Trabajo
Localiza el comportamiento actual y reproduce la causa con una prueba que falle antes del arreglo. Para errores de UI prueba el resultado visible o el servicio real necesario; un mock que inventa el contrato roto no prueba el defecto.

Corrige la causa conservando compatibilidad y alcance. Si el contrato de una aserción era incorrecto, justifica su corrección en un commit separado como exige P2; no reduzcas la prueba para ocultar el fallo. Convierte un incidente costoso en la comprobación más fuerte disponible.

## Salida
Entrega el arreglo, reproducción, prueba de regresión y gate completo. Una ampliación de producto durante el arreglo vuelve a la ruta specify/plan; no escondas una migración dentro de un bugfix. El registro en GitHub se hace sólo dentro de la autorización del trabajo y con el destino configurado.
