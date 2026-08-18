# plan · 004 — Artefactos versionados por tipo, con histórico

Diseño técnico de [spec.md](spec.md). **Sin dependencias nuevas**: toda la lógica es pura y vive en
`src/lib/artifacts/`, que es lo único con cobertura exigida (CONSTITUTION §P3). El contexto y la UI
sólo orquestan.

## Superficie de cambio

| Archivo | Qué cambia |
|---|---|
| `src/lib/artifacts/` (módulo nuevo `versioning.ts`) | **todo el comportamiento**: clave de linaje, ingreso, revisión vigente, histórico, restaurar, archivar, adjuntar/desprender, migración |
| `src/lib/agent-types.ts` | tipo `ArtifactLineage`; `Artifact` gana `lineageId`, `revision`, `supersededBy?`, `restoredFrom?` |
| `src/lib/artifacts/registry.ts` | campo opcional `singleton` + marcado en `drivers`, `constraints`, `proposal`, `roadmap` |
| `src/lib/artifacts/to-markdown.ts` | el encabezado incluye `· vN` cuando `revision > 1` |
| `src/context/AgentContext.tsx` | `lineages` en el estado persistido; ingreso vía `ingestArtifacts`; `visibleArtifacts`; acciones nuevas; migración al cargar |
| `src/components/ai-panel/ArtifactsPanel.tsx` | lista por linaje con badge `vN`, diálogo de histórico, borrar = archivar |
| `src/components/ai-panel/AgentChatPanel.tsx` | el contexto se resuelve a la revisión vigente del linaje |

## Modelo de datos

Dos ejes **independientes**, ambos vigentes (FR-003):

```
ArtifactVersion (snapshot, ya existía)   ── eje horizontal: "el conjunto en el momento T"
ArtifactLineage (nuevo)                  ── eje vertical:   "la historia de UN artefacto"
```

```ts
/** Historia de un artefacto: agrupa sus revisiones. */
export interface ArtifactLineage {
  id: string;
  key: string;          // clave de linaje normalizada (ver D1)
  kind: string;
  versionId: string;    // snapshot al que pertenece el linaje
  createdAt: string;
  archivedAt?: string;  // borrado = archivado (FR-009)
}

export interface Artifact {
  /* ...campos actuales... */
  lineageId: string;      // a qué historia pertenece
  revision: number;       // 1, 2, 3… entero ≥ 1
  supersededBy?: string;  // id de la revisión que la reemplazó
  restoredFrom?: string;  // id de la revisión que se restauró para crear esta
}
```

`AgentState` persistido pasa a `{ versions, lineages, artifacts, messages, activeVersionId }`.
El estado viejo (sin `lineages`) entra por la migración (D5) — misma clave de `localStorage`,
sin bump de formato: la migración es idempotente y no necesita versionar el esquema.

## Decisiones

### D1 · La clave de linaje sale del registry, no de una lista de `kind`

```
singleton en el registry  →  key = kind
resto                     →  key = kind + "::" + normalizeTitle(title)
```

`normalizeTitle`: minúsculas, `NFD` + quitar diacríticos, no-alfanumérico → espacio, espacios
colapsados, trim. Determinista y probada (FR-002).

Marcar `singleton: true` en el registry —y no un `if (kind === "drivers")` en el contexto— es lo
que mantiene el arnés agnóstico: añadir un artefacto sigue siendo añadir una entrada (§P6, FR-013).

### D2 · El ingreso es una función pura, no un `map` en el contexto

Hoy `sendMessage` construye los `Artifact` a mano (`AgentContext.tsx:333`). Pasa a:

```ts
ingestArtifacts(state, incoming: AgentArtifact[], meta, deps) → { lineages, artifacts, created }
```

- `state` = `{ lineages, artifacts }` · `meta` = `{ versionId, sourceMessageId, contextArtifactIds }`
- `deps` = `{ uid, now }` — inyectados para que la función sea determinista en test (nada de
  `crypto.randomUUID()` ni `new Date()` dentro de `lib/`).
- Por cada entrante: busca linaje **no archivado** con la misma `key` en el `versionId`; si existe,
  `revision = max(revisions) + 1` y la anterior queda con `supersededBy`; si no, crea linaje con
  `revision = 1`.
- Devuelve `created` para que el mensaje del chat siga citando `producedArtifactIds`.

Un artefacto que llega a un linaje **archivado** lo revive (`archivedAt` se limpia): el usuario
volvió a pedirlo, esconderlo sería peor.

### D3 · Vigente = mayor `revision` sin `supersededBy`

`currentRevision(artifacts, lineageId)` ordena por `revision` y toma la última. `supersededBy` es
redundante con eso *a propósito*: es el rastro de la cadena para el histórico y para detectar
estados corruptos en test. Si hubiera empate de `revision` (estado corrupto), gana el `createdAt`
más nuevo — el lienzo nunca se queda sin artefacto por un dato malo (misma filosofía que §P8).

### D4 · Restaurar es avanzar

`restoreRevision(state, artifactId, deps)` crea una revisión **nueva** con el payload de la
restaurada, `revision = max + 1`, `restoredFrom = artifactId`. Ninguna función del módulo muta ni
elimina revisiones salvo `purgeLineage` (borrado definitivo, FR-009). Se prueba con una aserción de
append-only: tras cualquier secuencia de operaciones, los ids previos siguen presentes (SC-004).

### D5 · Migración pura e idempotente

```ts
migrateState(state, deps) → state
```

Recorre los artefactos **en orden de `createdAt`** y los pasa por el mismo agrupador de `ingest`:
el primero de una clave queda `revision = 1`, los siguientes incrementan (los duplicados de hoy
se convierten en el histórico que el usuario esperaba tener). Si el artefacto ya trae `lineageId`
válido, se respeta. Corre en `loadState` (FR-011) y su idempotencia se prueba:
`migrate(migrate(s)) === migrate(s)`.

### D6 · Qué expone el contexto

| Selector | Qué es | Quién lo usa |
|---|---|---|
| `artifacts` | todas las revisiones | paleta ⌘K (busca por nombre), export |
| `versionArtifacts` | todas las del snapshot activo | se conserva por compatibilidad |
| `visibleArtifacts` | **una por linaje**: la vigente, linaje no archivado | `ArtifactsPanel` (FR-005) |
| `lineageHistory(id)` | revisiones de un linaje, ascendente | diálogo de histórico (FR-006) |

Acciones nuevas: `restoreArtifactRevision`, `archiveArtifact` (lo que hace el botón de borrar),
`purgeArtifactLineage` (definitivo, con confirmación), `attachToLineage`, `detachArtifact`.

`deleteArtifact` **se conserva** como alias de `archiveArtifact` para no romper llamadas existentes,
con comentario de por qué.

### D7 · El contexto del chat se resuelve al enviar

`contextArtifactIds` sigue guardando ids de revisión (lo que el usuario tocó). Al enviar,
`sendMessage` los pasa por `resolveContextRevisions(artifacts, ids)`: mapea cada id a la revisión
vigente de su linaje y **deduplica por linaje** (FR-010, SC-006). Así marcar la v2 y que llegue la
v3 es lo correcto, no un bug.

## Riesgos técnicos y cómo se acotan

| Riesgo | Acotación |
|---|---|
| Tamaño de `localStorage` (cada revisión guarda su payload) | el `catch` de cuota ya existe (`AgentContext.tsx:187`); la purga queda fuera de alcance por decisión del spec |
| La migración corre en cada carga | pura, idempotente y O(n) sobre artefactos de un proyecto; probada |
| `useMemo` de `visibleArtifacts` recalcula por render | depende de `[artifacts, lineages, activeVersionId]`, igual que el actual |

## Pruebas (P3)

`src/lib/artifacts/__tests__/versioning.test.ts` cubre: normalización de títulos · clave singleton
vs. compuesta · ingreso que incrementa · ingreso que crea · revivir linaje archivado · vigente con
estado corrupto · histórico ordenado · restaurar como revisión nueva · append-only tras secuencia
mixta · archivar/purgar · adjuntar/desprender · migración de estado real y su idempotencia ·
resolución de contexto deduplicada. Objetivo ≥ 95 % stmts del módulo (SC-005).

`registry.test.ts` gana la aserción de que los cuatro `singleton` están marcados y que ningún otro
`kind` lo está por accidente. `to-markdown.test.ts`, el encabezado con `· vN`.
