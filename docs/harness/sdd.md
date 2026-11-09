# SDD — cuándo el trabajo arranca con spec

Spec-Driven Development **no es el modo por defecto** de este repo: es la ruta para el trabajo que
crea superficie nueva (una notación, una pantalla, un flujo, un handler IPC, un formato de export).

El kit que se usa aquí son las skills **`sofka-0x`** del entorno del desarrollador
(`~/.claude/skills/sofka-*`), un fork del Intent Integrity Kit de Tessl. **No están versionadas en
el repo**: el self-test las exige en una máquina de desarrollo —que es donde el ruteo SDD ocurre— y
en CI reporta la ausencia como *omitido*, nunca como "pasó". Si algún día se instala el kit de Tessl
en `.tessl/plugins/`, se cambia `sdd.kit` y `sdd.skillRoots` en `.claude/harness.config.json` y nada
más: el hook sólo evalúa la config.

La decisión la toma el agente principal al leer el pedido; el hook `sdd-router` (UserPromptSubmit)
le pone el criterio delante, y si el pedido es ambiguo la instrucción es **preguntar una sola cosa
antes de tocar archivos**.

## La decisión

| Señal en el pedido | Ruta |
|---|---|
| Feature/módulo/pantalla/vista/notación nueva, epic, MVP, historias de usuario | **SDD completo** |
| Handler IPC, servicio del main o formato de intercambio nuevo | **SDD completo** |
| Migración, rearquitectura, reescritura | **SDD completo** |
| Falla concreta sobre algo que ya existe | `/sofka-bugfix` (o test rojo primero) |
| Requisito ambiguo antes de arrancar | `/sofka-clarify` |
| Copy, i18n, typo, tooltip | sin SDD |
| Renombrar, formatear, mover, documentar | sin SDD |
| Pregunta, auditoría, explicación | sin SDD |
| Cambio acotado y reversible sin superficie nueva | sin SDD, **declarando en una línea por qué no aplica** |

La regla dura: **saltarse SDD es una decisión que se declara, no un silencio.** Si el agente no
declara nada y editó producción en algo de tamaño feature, eso es un hallazgo de review.

## Las fases

```
sofka-00-constitution   principios (ya existe: CONSTITUTION.md, v1.0.0)
sofka-01-specify        user stories Given/When/Then, FR-XXX, criterios de éxito
sofka-02-plan           diseño técnico, modelo de datos, contratos (tiles de Tessl para librerías)
sofka-03-checklist      completitud del spec, puntuada y ligada a FR-XXX/SC-XXX
sofka-04-testify        escenarios Gherkin con hash de integridad de aserciones — antes del código
sofka-05-tasks          desglose en orden de dependencias
sofka-06-analyze        consistencia: cada requisito traza a una tarea y a la constitución
sofka-07-implement      ejecutar tasks.md verificando aserciones + gate
sofka-08-taskstoissues  exportar tareas a GitHub Issues (lo hace `npm run sdd:tasks`)
```

Los artefactos **no se quedan en el repo**: van a GitHub (siguiente sección). El puntero de la
feature en curso, `.specify/active-feature`, guarda el **número de la issue madre** (`#25`) o queda
vacío. `/sofka-core` inicializa, selecciona feature y muestra el estado.

## Dónde viven los artefactos: GitHub, no el repo

Una feature es un **árbol de issues** en `raalzate/processflow-architect`:

```
#N  [sdd] NNN · <título>        ← issue MADRE: spec en el cuerpo; plan · checklist ·
 │                                testify · analyze como comentarios
 ├─ #N+1  NNN · T1 — <tarea>    ← un issue por TAREA: asignable, cerrable, con su verificación
 └─ …                             labels: `sdd:feature` | `sdd:task` · `feature:NNN`
```

**Por qué se movió.** Un plan versionado junto al código no se puede asignar, no tiene estado
propio y sólo lo lee quien ya clonó. En issues cada tarea tiene dueño, historial y cierre, y el
avance se ve sin `git pull`. Lo que sigue en el repo es lo que explica **el código**: decisiones
(`docs/decisions/`), arnés (`docs/harness/`) e incidentes (`gotchas.md`).

El flujo, de punta a punta:

```bash
/sofka-01-specify …                          # el skill escribe el markdown en el SCRATCHPAD
npm run sdd:new <scratchpad>/spec.md         # issue madre con el spec en el cuerpo
gh issue comment <issue> --body-file plan.md # plan · checklist · testify · analyze
npm run sdd:tasks <issue> <tasks.md>         # un issue por tarea, enlazado a la madre
npm run sdd:status                           # avance por feature
```

`scripts/sdd-github.mjs` es el único que habla con GitHub (`gh` con `--repo` fijo); la config
—repo, labels, orden de artefactos, qué se permite en el repo— vive en
`.claude/harness.config.json` → `sdd.github`. El comando `check` **no toca la red**: por eso puede
correr en el gate y en CI.

**La cadena BDD es el aporte propio del kit**: `04-testify` genera los escenarios y les calcula un
hash de integridad; `07-implement` lo verifica. Ese hash es la versión ejecutable de "jamás se
ajusta una aserción para que pase el test" (`CONSTITUTION.md` §P2).

## Cómo convive con las otras reglas del repo

- **La IA local manda.** Un spec de producto no decide dónde corre la inferencia: el default es
  `local` y no se cambia sin pedirlo el usuario (`CONSTITUTION.md` §P4). Una función nueva de IA es
  una `AiTask` en `src/lib/ai/tasks.ts`, tenga spec o no.
- **TDD sigue mandando.** `sofka-04-testify` produce los escenarios; el ciclo rojo → verde →
  refactor no se salta por tener spec.
- **El gate no cambia.** Con o sin SDD, nada se entrega sin `npm run gate` verde.
- **Tiles antes que memoria.** En la fase de plan, las librerías se documentan con tiles de Tessl
  (`tessl.json`, `.tessl/plugins/`) en vez de escribir APIs de memoria.

## Qué es ejecutable y qué no

| Regla | Mecanismo |
|---|---|
| El pedido de tamaño feature debe rutearse o declararse | `sdd-router` inyecta el criterio en cada prompt que dispara (informa, no bloquea: la intención no es verificable por máquina) |
| El kit nombrado existe de verdad | self-test: cada fase debe corresponder a una skill instalada en `sdd.skillRoots` (omitido en CI) |
| El clasificador no se degrada | 8 casos de ruteo en `scripts/harness-selftest.mjs`, paso 4 del gate |
| El puntero de feature activa resuelve | self-test: puntero colgado = gate rojo |
| Los artefactos SDD no vuelven al repo | **nada**: `specs/` se borró y con él el freno del gate que lo vigilaba (#156). Es convención escrita, y el próximo spec que nazca como archivo no lo va a frenar ningún comando |
| Todo issue **creado por script** nace etiquetado | `exigirLabels()` en `scripts/sdd-github.mjs`: relee los labels del issue recién creado, reintenta y muere con exit 1 nombrando la cuenta activa y el remedio. Ni `--label` ni el código de salida son evidencia (#158) |
| El agente recuerda el label al pedir el registro | el hook `sdd-router` imprime `tracker.labels` (bug · enhancement · documentation); el self-test exige que esos nombres sigan saliendo. Para un issue hecho **a mano** no hay más que esto: es directriz, no freno |
| Los artefactos no se pierden al entregar | son issues: se cierran, no se borran, y quedan enlazadas desde el commit |
| El commit de código queda registrado | `.githooks/commit-msg`: referencia (`tracker.issuePattern`) o `sin-issue: <motivo>`. Los patrones viven en el config, así que el freno no está atado a GitHub |

## Estado

- **Las cinco features vividas están migradas a issues** (2026-08-21): `#1` 001, `#25` 002, `#45`
  003, `#62` 004, `#79` 005, con 89 issues de tarea (83 cerradas al migrar, según el checklist de
  cada `tasks.md`). `specs/` se borró entero, índice incluido: el índice es la lista de issues con la etiqueta `sdd:feature` (`npm run sdd:status`).
  Las skills `sofka-0x` no están versionadas en el repo, así que las fases se ejecutaron siguiendo
  su contrato con las herramientas del repo (vitest en lugar de un runner de Gherkin).
- **El registro ya no depende del criterio** (2026-08-24): `.githooks/commit-msg` frena cualquier
  commit que toque código sin una issue referenciada (`#123`) o sin una línea `sin-issue: <motivo>`,
  y la ruta `issue` del `sdd-router` recuerda **preguntarle al humano** si se registra antes de tocar
  producción —incluso cuando el pedido viene en prosa y no nombra «feature» ni «bug»—, callándose en
  lo trivial. Lo prueban 7 casos del self-test en un repo git temporal y 3 de ruteo. Nació de un
  incidente: cuatro arreglos terminados sin una sola issue (`docs/harness/gotchas.md`).
- **El freno dejó de estar atado a GitHub** (2026-08-25): `.githooks/commit-msg` lee `tracker` y
  `commitMsg` del config en vez de tener los patrones en el bash. Este repo sigue en GitHub y nada
  cambia para quien commitea; lo que cambia es que el mismo hook sirve con Azure Boards (`AB#123`)
  o Jira (`PROJ-123`) editando una línea. Dos casos nuevos del self-test lo prueban con la config
  de otra forja —acepta `AB#77`, rechaza `#77`—, así que si alguien vuelve a cablear los patrones,
  el gate se pone rojo.
- Deuda que queda: el freno pide *un* registro, no el registro *correcto*. Que una feature grande
  vaya con issue madre y tareas en vez de un `bug` suelto sigue siendo criterio del agente y del
  `reviewer`.
