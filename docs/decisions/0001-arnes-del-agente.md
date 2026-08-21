# ADR 0001 — Arnés del agente sobre el repo, no un modelo más grande

Issue: #111

- **Fecha:** 2026-08-14
- **Estado:** aceptado
- **Contexto previo:** `docs/harness/buenas-practicas.md` (guía agnóstica de stack)

## Contexto

El repo tenía memoria (`CLAUDE.md`) y dos señales (`npm run typecheck`, `npm test`) corriendo en
CI, pero ningún eslabón que **hiciera fallar** las reglas escritas: sin hooks del ciclo del agente,
sin pre-commit (`.git/hooks/` sólo con `.sample`), sin subagentes, sin comandos, sin un gate único
y sin evidencia de estado verificado. Es el caso de manual de "instalado y muerto": reglas en prosa
que sólo se cumplen si alguien se acuerda.

## Decisión

Montar el arnés como infraestructura del repo:

1. **Un gate único** (`scripts/gate.sh`) que corren el humano, el agente y CI con el mismo comando,
   con seis señales: self-test del arnés, link-check de docs, lint de convenciones, typecheck,
   tests con cobertura y build de producción.
2. **Hooks del ciclo del agente** en `.claude/settings.json`, genéricos, con **toda** la
   especificidad del repo en `.claude/harness.config.json`. Portar el arnés a otro repo es cambiar
   ese único archivo.
3. **Lint propio sin dependencias** (`scripts/repo-lint.mjs`) en vez de ESLint: las reglas que hacen
   falta aquí (pureza de `src/lib/`, agnosticismo de notación, invariantes de WebGPU, prohibición de
   SDKs de nube) no las cubre ninguna config estándar, y el bundle ya es pesado
   (Electron + Puppeteer + Mermaid). Ver *Alternativas*.
4. **Self-test del arnés** (`scripts/harness-selftest.mjs`): ejecuta cada hook con payloads reales y
   verifica que bloquee lo que dice bloquear. Un hook roto falla en silencio; ninguna otra señal lo ve.
5. **Constitución versionada** (`CONSTITUTION.md`) donde cada principio declara su fuerza y su
   mecanismo, y **`STATUS.md`** como evidencia de estado verificado.
6. **Subagentes** (`explorer`, `reviewer`, `gate-runner`) y **comandos** (`/gate`, `/lesson`,
   `/harness-audit`) para aislar contexto y no re-tipear flujos.

## Alternativas consideradas

- **ESLint + `eslint-config-next`.** Cubre estilo, no los invariantes de este proyecto, y agrega
  dependencias pesadas contra la regla de `CLAUDE.md`. Si algún día entra, `repo-lint` sigue siendo
  necesario para las reglas de dominio: son señales complementarias, no sustitutas.
- **Dejar el gate en CI solamente.** Descartado: el feedback llega después del push, cuando el
  contexto de la decisión ya se perdió, y el agente no puede cerrar el bucle.
- **Reglas sólo en `CLAUDE.md`.** Es el estado que se quería corregir: una regla sin comando que la
  haga fallar es una sugerencia.

## Consecuencias

- El agente no puede cerrar una tarea con código editado y gate rojo (hook `Stop`).
- Cada edición de código paga el costo del lint del archivo (milisegundos); el typecheck completo
  queda en el gate porque por edición es demasiado lento.
- La deuda queda **explícita**: los archivos que hoy cablean literales de notación viven en un
  allowlist que sólo puede achicarse, y eso lo mira el review.
- Añadir una regla nueva es editar JSON (config) o agregar un caso a `repo-lint`, no escribir prosa.
