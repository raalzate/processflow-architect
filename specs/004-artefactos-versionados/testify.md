# testify · 004 — Escenarios ejecutables

Escenarios **antes del código** (fase 04). En este repo no hay runner de Gherkin: el mecanismo real
es **vitest**, así que cada escenario declara el test que lo implementa. Escenario sin test es
escenario no cumplido — eso lo verifica [analyze.md](analyze.md).

Las aserciones de esta página son el contrato: si un test rojo refleja un cambio *intencional* se
actualiza acá y en el test, en un commit aparte con el motivo (CONSTITUTION §P2).

Archivo de pruebas: `src/lib/artifacts/__tests__/versioning.test.ts` (salvo donde se indique otro).

---

## Feature: clave de linaje

```gherkin
Escenario: E1 · Títulos equivalentes son el mismo linaje
  Dado un artefacto kind "adr" titulado "Decisión: usar Postgres"
  Y otro kind "adr" titulado "  decision   USAR  postgres  "
  Cuando se calcula su clave de linaje
  Entonces ambas claves son iguales
```
→ `lineageKey · normaliza acentos, mayúsculas, puntuación y espacios`

```gherkin
Escenario: E2 · Dos ADR distintos son linajes distintos
  Dado un artefacto kind "adr" titulado "Usar Postgres"
  Y otro kind "adr" titulado "Usar Kafka"
  Cuando se calculan sus claves
  Entonces son distintas
```
→ `lineageKey · mismo kind con títulos distintos ⇒ claves distintas`

```gherkin
Escenario: E3 · Los singleton ignoran el título
  Dado un artefacto kind "roadmap" titulado "Roadmap 2026"
  Y otro kind "roadmap" titulado "Plan de entregas"
  Cuando se calculan sus claves
  Entonces son iguales, porque "roadmap" es singleton en el registry
```
→ `lineageKey · kind singleton usa sólo el kind`

---

## Feature: ingreso incremental (US-1, FR-004)

```gherkin
Escenario: E4 · Regenerar incrementa la revisión
  Dado un estado con "Drivers de Arquitectura" en revisión 1
  Cuando ingresa un artefacto kind "drivers" del agente
  Entonces la revisión nueva es 2
  Y comparte lineageId con la revisión 1
  Y la revisión 1 queda con supersededBy = id de la revisión 2
```
→ `ingestArtifacts · misma clave ⇒ revision + 1 y supersede la anterior`

```gherkin
Escenario: E5 · Un artefacto nuevo abre linaje
  Dado un estado con sólo "drivers"
  Cuando ingresa un kind "adr" titulado "Usar Postgres"
  Entonces se crea un linaje nuevo con revisión 1
```
→ `ingestArtifacts · clave nueva ⇒ linaje nuevo en revisión 1`

```gherkin
Escenario: E6 · Tres regeneraciones dejan una tarjeta y tres revisiones (SC-001, SC-002)
  Dado un estado vacío
  Cuando ingresan tres artefactos kind "drivers" en secuencia
  Entonces los artefactos visibles son 1, marcado revisión 3
  Y el histórico del linaje tiene 3 revisiones
```
→ `visibleArtifacts · una entrada por linaje` + `lineageHistory · devuelve las 3 en orden ascendente`

```gherkin
Escenario: E7 · Pedir de nuevo algo archivado lo revive
  Dado un linaje archivado de "drivers"
  Cuando ingresa un kind "drivers"
  Entonces el linaje deja de estar archivado
  Y la revisión nueva continúa la numeración (no vuelve a 1)
```
→ `ingestArtifacts · un linaje archivado revive y continúa la numeración`

```gherkin
Escenario: E8 · Los snapshots siguen aislados
  Dado un linaje de "drivers" en el snapshot v1
  Cuando ingresa un kind "drivers" con el snapshot v2 activo
  Entonces se crea un linaje nuevo en revisión 1
  Y el linaje de v1 queda intacto
```
→ `ingestArtifacts · el linaje no cruza snapshots`

---

## Feature: histórico y restaurar (US-2, US-3, FR-006, FR-007)

```gherkin
Escenario: E9 · Restaurar crea una revisión nueva
  Dado un linaje en revisión 3
  Cuando se restaura la revisión 2
  Entonces existe una revisión 4
  Y su payload es igual al de la revisión 2
  Y su restoredFrom apunta a la revisión 2
  Y las revisiones 1, 2 y 3 siguen existiendo
```
→ `restoreRevision · crea revisión nueva con el payload restaurado`

```gherkin
Escenario: E10 · Append-only tras una secuencia mixta (SC-004)
  Dado un estado con 3 linajes y 7 revisiones
  Cuando se ingresa, restaura, archiva, adjunta y desprende en cualquier orden
  Entonces los 7 ids originales siguen presentes con su payload sin mutar
```
→ `append-only · ninguna operación salvo purge elimina o muta revisiones`

```gherkin
Escenario: E11 · La vigente es la última no superada
  Dado un linaje con revisiones 1, 2 y 3
  Cuando se pide la revisión vigente
  Entonces es la 3
```
→ `currentRevision · devuelve la mayor revisión no superada`

```gherkin
Escenario: E12 · Estado corrupto no deja al panel sin artefacto (§P8)
  Dado un linaje con dos revisiones número 2 (estado corrupto)
  Cuando se pide la revisión vigente
  Entonces devuelve la de createdAt más nuevo, no undefined
```
→ `currentRevision · con revisiones empatadas gana la más nueva`

---

## Feature: borrar es retirar (US-4, FR-009)

```gherkin
Escenario: E13 · Archivar saca de la lista y conserva
  Dado un linaje visible con 2 revisiones
  Cuando se archiva
  Entonces no aparece en los artefactos visibles
  Y sus 2 revisiones siguen en el estado
```
→ `archiveLineage · oculta el linaje sin borrar revisiones`

```gherkin
Escenario: E14 · Purgar es lo único que borra
  Dado un linaje archivado con 2 revisiones
  Cuando se purga
  Entonces sus revisiones y su linaje desaparecen del estado
  Y los otros linajes quedan intactos
```
→ `purgeLineage · borra sólo el linaje pedido`

---

## Feature: contexto del chat (US-5, FR-010)

```gherkin
Escenario: E15 · Se inyecta la vigente, una sola vez
  Dado un linaje con revisiones 1, 2 y 3
  Y el usuario marcó como contexto la revisión 1 y la revisión 2
  Cuando se resuelven las revisiones de contexto
  Entonces se obtiene un único artefacto: la revisión 3
```
→ `resolveContextRevisions · mapea a la vigente y deduplica por linaje`

```gherkin
Escenario: E16 · Un id que ya no existe no rompe el envío
  Dado un contexto que referencia un id purgado
  Cuando se resuelven las revisiones
  Entonces ese id se ignora y el resto se resuelve
```
→ `resolveContextRevisions · ignora ids inexistentes`

---

## Feature: migración (US-6, FR-011)

```gherkin
Escenario: E17 · Estado viejo: un linaje por artefacto
  Dado un estado guardado sin lineages, con 4 artefactos de kinds distintos
  Cuando se migra
  Entonces hay 4 linajes, cada uno con revisión 1
  Y no se pierde ningún artefacto
```
→ `migrateState · un linaje por artefacto sin duplicados`

```gherkin
Escenario: E18 · Estado viejo con duplicados: el más viejo es v1 (SC-003)
  Dado un estado sin lineages con tres "drivers" creados en t1 < t2 < t3
  Cuando se migra
  Entonces los tres comparten linaje con revisiones 1, 2 y 3 en ese orden
```
→ `migrateState · agrupa duplicados por clave respetando createdAt`

```gherkin
Escenario: E19 · Migrar dos veces da lo mismo
  Dado cualquier estado
  Cuando se migra y se vuelve a migrar
  Entonces el resultado es idéntico
```
→ `migrateState · es idempotente`

---

## Feature: registry y export (FR-012, FR-013)

```gherkin
Escenario: E20 · Los singleton están marcados en el registry
  Dado el registry de artefactos
  Cuando se listan los kind con singleton = true
  Entonces son exactamente drivers, constraints, proposal y roadmap
```
→ `registry.test.ts · los kind singleton son exactamente los cuatro declarados`

```gherkin
Escenario: E21 · El export dice la revisión
  Dado un artefacto en revisión 3
  Cuando se exporta a markdown
  Entonces el encabezado incluye "· v3"
  Y en revisión 1 el encabezado no lleva sufijo
```
→ `to-markdown.test.ts · el encabezado incluye la revisión cuando es > 1`

---

## Verificación manual (no automatizable hoy)

La UI no tiene E2E en este repo (deuda declarada en STATUS.md). Se verifica a mano con
`npm run electron-dev`:

| # | Qué mirar |
|---|---|
| M1 | Regenerar drivers dos veces: una tarjeta con badge `v3` (US-1) |
| M2 | Abrir el histórico y leer la v1 en el visor (US-2) |
| M3 | Restaurar la v2 y ver que aparece `v4` (US-3) |
| M4 | Borrar: sale de la lista; el borrado definitivo pide confirmación (US-4) |
| M5 | Marcar una revisión vieja como contexto y confirmar que el artefacto producido cita la vigente (US-5) |
