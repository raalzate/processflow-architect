---
name: sofka-04-testify
description: "Create acceptance scenarios and regression tests before implementation, then freeze their exact contents for later integrity verification."
---

# Escenarios e integridad de pruebas

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Lee FR/SC, checklist y contratos. Los escenarios describen resultados que podría observar un usuario, no los nombres de funciones que planeas escribir.

## Trabajo
1. Escribe Gherkin en el scratchpad y pruebas offline significativas en las ubicaciones del proyecto. Relaciona cada escenario con sus FR/SC.
2. Ejecuta las nuevas pruebas y registra el fallo real. Si pasan sin cambiar producción, comprueba que ejercitan el comportamiento nuevo.
3. Captura una referencia de integridad con el ayudante Node, que congela el contenido completo, incluidas las aserciones:

```sh
node scripts/sdd-integrity.mjs capture <scratchpad>/integrity.json <pruebas...>
node scripts/sdd-integrity.mjs verify <scratchpad>/integrity.json
```

Los archivos son relativos al workspace seleccionado. Para incluir código y escenarios de un scratchpad externo, usa `--root <directorio-común>` y rutas relativas a ese directorio. El manifiesto no se sobrescribe: un contrato corregido requiere una referencia nueva y una justificación revisable. Guarda el manifiesto junto a los escenarios en la issue madre; no publiques rutas privadas ni secretos.

## Salida y continuación
Entrega escenarios, pruebas rojas, comando/resultado y referencia SHA-256. Normalizar CRLF/LF permite comprobar la misma referencia en Windows, macOS y Linux. La referencia detecta cambios: no demuestra que el contrato sea correcto ni sustituye su revisión. Continúa con `sofka-05-tasks`.
