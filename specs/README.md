# specs/ — los artefactos SDD viven en GitHub

**Acá no va nada más que este archivo.** Una feature ya no es una carpeta de markdown: es un
**árbol de issues** en [raalzate/processflow-architect](https://github.com/raalzate/processflow-architect/issues?q=label%3Asdd%3Afeature).

```
#N  [sdd] NNN · <título>        ← issue MADRE: el spec en el cuerpo;
 │                                 plan · checklist · testify · analyze como comentarios
 ├─ #N+1  NNN · T1 — <tarea>    ← un issue por TAREA: asignable, cerrable, con su verificación
 └─ …                             labels: `sdd:feature` | `sdd:task` · `feature:NNN`
```

## Por qué se movió

Un plan versionado junto al código no se puede asignar, no tiene estado propio y sólo lo lee
quien ya clonó el repo. En issues, cada tarea tiene dueño, historial y cierre — y el avance se
ve sin `git pull`. Lo que sí sigue en el repo es lo que explica **el código**: decisiones
(`docs/decisions/`), arnés (`docs/harness/`) e incidentes (`docs/harness/gotchas.md`).

## Cómo se abre una feature nueva

```bash
/sofka-01-specify …                       # el skill escribe el markdown en el scratchpad, no acá
npm run sdd:new <scratchpad>/spec.md      # abre la issue madre con ese spec
npm run sdd:tasks <issue> <tasks.md>      # crea un issue por tarea y los enlaza a la madre
npm run sdd:status                        # avance por feature
```

El plan, el checklist y los escenarios de testify se pegan como **comentarios** de la issue
madre (`gh issue comment <issue> --body-file plan.md`).

## Lo que impide volver atrás

`node scripts/sdd-github.mjs check` corre en `npm run gate` y **falla** si aparece cualquier
archivo bajo `specs/` que no sea este README. Sin ese freno, la próxima feature volvería a
nacer en el repo por costumbre. La lista de lo permitido vive en `.claude/harness.config.json`
→ `sdd.github.allowedInRepo`.

## Las cinco features migradas

| Feature | Issue | Estado |
|---|---|---|
| 001 · Layout legible de diagramas exportados por MCP | [#1](https://github.com/raalzate/processflow-architect/issues/1) | abierta (queda la validación visual) |
| 002 · Organizar el layout desde el lienzo | [#25](https://github.com/raalzate/processflow-architect/issues/25) | abierta |
| 003 · Una sola piel: la app entera oscura | [#45](https://github.com/raalzate/processflow-architect/issues/45) | entregada |
| 004 · Artefactos versionados por tipo | [#62](https://github.com/raalzate/processflow-architect/issues/62) | entregada |
| 005 · Contexto por partes + human-in-the-loop | [#79](https://github.com/raalzate/processflow-architect/issues/79) | entregada |

Cuándo una tarea arranca por esta ruta y cuándo no: [`docs/harness/sdd.md`](../docs/harness/sdd.md).
