---
description: Ciclo RHO — convierte un incidente en una mejora del arnés que pasó el gate.
argument-hint: "<incidente en una línea>"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Task
---

Incidente: **$ARGUMENTS**

Ejecutá el ciclo RHO completo. No pares en la fase 1.

## Fase 1 — Minería

Reconstruí qué pasó de verdad: comando que falló, salida real, cuántos intentos costó,
qué hipótesis fueron falsas. Si el incidente ya está en `docs/harness/gotchas.md`, el
hallazgo es otro: **la regla existía y no frenó nada** → hace falta un mecanismo más fuerte.

## Fase 2 — Codificar en el mecanismo MÁS FUERTE disponible

| Mecanismo | Fuerza | Dónde vive aquí |
|---|---|---|
| Test o validación | máxima | carpetas `__tests__/` junto al módulo de `src/lib` |
| Regla de lint / hook / pre-commit / CI | alta | `scripts/repo-lint.mjs`, `.claude/harness.config.json`, `.githooks/pre-commit` |
| Comando o script | media | `.claude/commands/`, `scripts/` |
| Entrada en memoria | baja | `docs/harness/gotchas.md`, `CLAUDE.md` |

Markdown es el ÚLTIMO recurso, no el primero. Si elegís markdown, escribí explícitamente
por qué la regla no es verificable por máquina.

La entrada de gotcha va en formato fijo: **síntoma → causa → regla → mecanismo**.

## Fase 3 — Validación por regresión (esta fase es el diseño entero)

Corré `npm run gate`. Verde → la mejora queda. Rojo → se revierte y se documenta el intento
fallido. Sin esta fase, "auto-mejora" es el agente reescribiendo sus propias reglas sin control.

Cerrá informando: incidente → mecanismo elegido → comando que ahora falla si alguien lo repite.
