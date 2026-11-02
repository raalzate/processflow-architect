---
name: sofka-core
description: "Locate the active SDD feature and choose the next applicable local phase without changing product scope or creating duplicate issues."
---

# Estado del flujo SDD

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Trabajo
Lee `sdd` en `.claude/harness.config.json`, el puntero configurado y [el flujo SDD](../../../docs/harness/sdd.md). `npm run sdd:status` muestra las features del repositorio autorizado; si falta red, informa el fallo y usa los artefactos locales existentes sin inventar su estado remoto.

Para una feature nueva comienza con las fases 00/01; para una existente elige la fase que resuelva el hueco observado. Un bug acotado usa `sofka-bugfix`; una pregunta informativa se responde sin editar producción. El puntero contiene `#N`, no una ruta a artefactos versionados.

## Salida
Indica la issue activa, evidencia disponible y siguiente fase útil. Cambia el puntero sólo como parte de seleccionar la feature autorizada. No inicialices otro repositorio ni una nueva arquitectura para resolver la ausencia de un archivo local.
