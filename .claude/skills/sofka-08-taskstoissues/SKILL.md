---
name: sofka-08-taskstoissues
description: "Publish or inspect the tasks of an existing authorized SDD feature using the repository GitHub task command."
---

# Tareas del plan en GitHub

Implementación original del kit local de Processflow. El nombre conserva compatibilidad con el arnés; no contiene ni representa el kit privado Sofka. Lee las convenciones compartidas en [SDD local](../../../docs/harness/sdd.md).

## Entrada y trabajo
Lee el número de issue madre, el archivo de tareas y `sdd.github.repo` en la configuración. Comprueba que ese destino coincide con la autorización del usuario.

Usa `npm run sdd:tasks <issue> <tasks.md>` para el formato de tabla de la fase 05. Antes de repetir una publicación, lee las tareas existentes y verifica la idempotencia del comando para ese caso; no dupliques issues por un fallo de red ambiguo. Conserva las URLs y comprueba los labels reales de la respuesta.

## Salida
Entrega el mapa Tn → issue y cualquier fallo real. `npm run sdd:status` consulta el estado. Cerrar issues requiere evidencia de la verificación prevista; crear tareas no las completa. Esta skill no autoriza mensajes a servicios o personas ajenos al trabajo pedido.
