# Índice de documentación

Punto de entrada. Cada archivo aparece una sola vez, en la categoría donde alguien lo buscaría.
`node scripts/docs-linkcheck.mjs` (señal del gate) verifica que ningún puntero de aquí —ni de
ningún otro `.md`— apunte a la nada.

## Reglas que se cargan siempre

| Archivo | Qué es |
|---|---|
| `CLAUDE.md` | reglas operativas, convenciones y dominio; se carga en toda sesión |
| `CONSTITUTION.md` | principios versionados, con su fuerza (BLOCKING / REVIEW) |
| `STATUS.md` | estado verificado + deuda conocida; lo imprime el hook `SessionStart` |
| `AGENTS.md` | puntero al kit de Tessl (`.tessl/RULES.md`) |

## Arnés del agente

| Archivo | Qué es |
|---|---|
| `docs/harness/harness.md` | cómo está montado el arnés **en este repo**: gate, hooks, subagentes, comandos |
| `docs/harness/buenas-practicas.md` | la guía origen, agnóstica de stack (fuente de los criterios) |
| `docs/harness/gotchas.md` | síntoma → causa → regla → mecanismo. Se escribe con `/lesson` |
| `docs/harness/sdd.md` | cuándo el trabajo arranca con especificación y cuándo no |

## Arquitectura

| Archivo | Qué es |
|---|---|
| `docs/ARCHITECTURE.md` | estructura de la app (Electron + Next + IA local) |
| `docs/architecture/reuse-patterns.md` | catálogo de abstracciones ya existentes (consultar antes de escribir) |
| `docs/architecture/mcp.md` | el servidor MCP por dentro: las 26 herramientas, los tres transportes, cómo se extiende |
| `docs/compresion-toon.md` | por qué el grafo viaja en TOON hacia la IA |
| `docs/decisions/` | ADRs: por qué se decidió, no qué se hizo |

## Operación

| Archivo | Qué es |
|---|---|
| `docs/RELEASE.md` | empaquetado, firma y publicación |
