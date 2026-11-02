---
name: sofka-07-implement
description: "Execute traceable SDD tasks with red-to-green tests, integrity checks, independent review and the repository full gate."
---

# Implementación con evidencia

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada
Usa las tareas registradas, el plan, las pruebas rojas y su referencia de integridad. Respeta el repositorio y la rama autorizados; un remoto upstream de lectura no es un destino de publicación.

## Trabajo
1. Ejecuta en orden de dependencia. Para lógica pura conserva el ciclo rojo → verde → refactor. Prueba cada cambio grande antes del siguiente.
2. Verifica la referencia con `node scripts/sdd-integrity.mjs verify <manifest.json> [--root <workspace>]`. Un fallo exige explicar qué cambió. Una corrección legítima del contrato lleva commit separado y referencia nueva revisable.
3. Mantén la arquitectura y los límites de privacidad del plan. Usa los métodos existentes de edición para que los cambios de UI y agentes lleguen al mismo estado.
4. Ejecuta las verificaciones de integración y plataformas que afirman las tareas. Solicita la revisión independiente prevista por el arnés y corrige hallazgos materiales.
5. Ejecuta `npm run gate` completo. Si falla, lee la causa real y corrígela dentro del alcance; no omitas señales ni falsifiques CI. No repitas pruebas ya verdes sin un cambio, fallo o incertidumbre nueva.

## Salida y cierre
Actualiza tareas y PR con resultados reales y límites pendientes. No cierres una tarea que todavía depende de una prueba necesaria. El usuario recibe el resultado concreto, su ubicación y evidencia, no sólo un plan. Publicar o desplegar usa la autorización de la sesión; esta skill no concede permisos adicionales.
