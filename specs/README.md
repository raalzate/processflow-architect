# specs/ — artefactos de las features que arrancaron con SDD

Una carpeta por feature: `specs/<NNN-nombre>/` con `spec.md`, `plan.md`, `checklist.md`,
`tasks.md` y los escenarios de `testify`. El puntero de la feature en curso vive en
`.specify/active-feature` (una línea con el nombre de la carpeta; vacío = ninguna).

**Los artefactos no se borran al entregar.** Son la respuesta a "¿por qué esto es así?" cuando el
código ya no lo dice. Si una feature se cancela, se marca en su `spec.md`, no se elimina la carpeta.

Cuándo arranca una feature por aquí y cuándo no: `docs/harness/sdd.md`.

## Estado

Cuatro features con artefactos acá: `001-layout-legible`, `002-layout-organizar`,
`003-ui-homogenea` y `004-artefactos-versionados` — esta última es la primera con el ciclo
completo (`spec` · `plan` · `checklist` · `testify` · `tasks` · `analyze`).
`scripts/harness-selftest.mjs` valida que el puntero de feature activa resuelva a una carpeta real
(un puntero colgado deja el gate en rojo).
