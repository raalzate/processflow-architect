# spec · 004 — Artefactos versionados por tipo, con histórico

**Estado:** propuesta · **Creada:** 2026-08-18 · **Toca:** `src/lib/artifacts/`,
`src/lib/agent-types.ts`, `src/context/AgentContext.tsx`, `src/components/ai-panel/ArtifactsPanel.tsx`

## Problema

Hoy existe versionado, pero es del **conjunto**, no del artefacto. `ArtifactVersion`
(`src/lib/agent-types.ts:59`) es un *snapshot* que el usuario crea a mano (`createVersion`,
`src/context/AgentContext.tsx:203`) y cada artefacto queda atado a él por `versionId`. De ahí salen
tres problemas concretos:

1. **Regenerar un artefacto no lo versiona: lo duplica.** `sendMessage` siempre hace
   `id: uid()` y empuja al final (`AgentContext.tsx:333`). Pedirle al agente «rehacé los drivers»
   deja dos tarjetas «Drivers de Arquitectura» en el panel, indistinguibles salvo por `createdAt`,
   y el panel muestra las dos (`ArtifactsPanel.tsx:55`). Nada dice cuál es la buena.
2. **No hay histórico por artefacto.** No se puede ver la v1 de un ADR ni comparar con la v3.
   La única forma de "guardar el anterior" es que el usuario se acuerde de crear una versión del
   conjunto *antes* de pedir la regeneración.
3. **Borrar es destruir.** `deleteArtifact` (`AgentContext.tsx:217`) saca el artefacto del arreglo
   y no queda rastro. El histórico que el usuario cree tener no existe.

El pedido: **el artefacto se versiona solo, según su tipo, incrementando el número y guardando el
histórico.**

## Usuarios y valor

- **Quien itera con el agente**: pide «mejorá esta propuesta» tres veces y ve `v3`, no tres
  tarjetas iguales. El panel muestra el estado actual; el histórico está a un clic.
- **Quien presenta el análisis**: puede mostrar cómo evolucionó una decisión (v1 → v3) sin abrir
  archivos ni recordar el orden.
- **Quien programa acá**: la regla de qué versión es cuál vive en `src/lib/` con pruebas, no
  repartida en el contexto y el panel.

## Decisión de diseño: qué es "el mismo artefacto"

«Versionado según sea el tipo» necesita una clave de linaje. Un `kind` pelado no alcanza: dos ADR
distintos en el mismo archivo son dos artefactos, no dos versiones del mismo.

**La clave de linaje es `kind` + título normalizado** (minúsculas, sin acentos, sin puntuación,
espacios colapsados). Consecuencias asumidas y declaradas:

- Regenerar «Drivers de Arquitectura» → v2 del mismo linaje. ✅ lo que se pide.
- Dos ADR con títulos distintos → dos linajes. ✅ correcto.
- Regenerar un ADR y que el agente le cambie el título → arranca linaje nuevo. ⚠️ límite conocido;
  se resuelve con la acción manual de FR-008 (adjuntar a un linaje existente).

Los `kind` **singleton por definición** (`drivers`, `constraints`, `proposal`, `roadmap`: hay uno
por proyecto) usan sólo `kind` como clave, marcados en el registry con `singleton: true`. Así
«rehacé el roadmap con otro nombre» sigue siendo v2 del roadmap.

## Historias

### US-1 · Regenerar incrementa, no duplica

**Given** un artefacto «Drivers de Arquitectura» en `v1`
**When** el usuario pide al agente que lo regenere o lo mejore
**Then** el panel sigue mostrando **una** tarjeta de drivers, ahora marcada `v2`, y la v1 queda en
el histórico del linaje — no visible en la lista principal, no perdida.

### US-2 · El histórico se puede abrir

**Given** un artefacto con varias versiones
**When** el usuario abre su histórico
**Then** ve la lista de versiones (número, fecha, y el mensaje del chat que la produjo) y puede
leer cualquiera de ellas en el visor.

### US-3 · Volver atrás sin perder nada

**Given** un artefacto en `v3` cuya `v2` era mejor
**When** el usuario restaura la v2
**Then** la versión vigente pasa a ser una **v4 con el contenido de la v2** — el histórico nunca
se reescribe ni se poda hacia atrás.

### US-4 · Borrar es retirar, no destruir

**Given** un artefacto con histórico
**When** el usuario lo borra desde el panel
**Then** desaparece de la lista y su linaje queda archivado y recuperable en la sesión; el borrado
definitivo es una acción aparte y explícita.

### US-5 · El contexto del agente usa la versión vigente

**Given** un artefacto en `v3` marcado como contexto para el chat
**When** el usuario envía un mensaje
**Then** se inyecta el contenido de la **v3** (una sola vez), no todas las versiones, y el
artefacto producido cita como contexto la versión exacta que se usó.

### US-6 · Lo que ya existe no se rompe

**Given** un archivo guardado con el estado anterior (artefactos sin linaje, versiones-snapshot)
**When** se abre con la app nueva
**Then** cada artefacto existente se convierte en la `v1` de su propio linaje, las
versiones-snapshot actuales se preservan, y no se pierde ni un artefacto.

## Requisitos funcionales

| Id | Requisito |
|---|---|
| **FR-001** | Un módulo nuevo `versioning.ts` bajo `src/lib/artifacts/` (**puro**, sin React ni Electron) es la única fuente de verdad del linaje: clave de linaje, siguiente número, cuál es la versión vigente, restaurar y archivar. El contexto y la UI sólo lo consumen. |
| **FR-002** | Clave de linaje = `kind` + título normalizado; para `kind` con `singleton: true` en el registry, sólo `kind`. La normalización es determinista y probada. |
| **FR-003** | El modelo persistido gana un `ArtifactLineage` (`id`, `key`, `kind`, `archivedAt?`) y cada `Artifact` gana `lineageId`, `revision` (entero ≥ 1) y `supersededBy?`. `versionId` (snapshot) **se conserva**: son dos ejes distintos y ambos siguen valiendo. |
| **FR-004** | Al ingresar un artefacto del agente: si su clave de linaje ya existe en la versión-snapshot activa, se crea con `revision = max + 1` y la anterior queda marcada `supersededBy`. Si no existe, se crea el linaje con `revision = 1`. |
| **FR-005** | La lista de artefactos del panel muestra **una entrada por linaje**: la revisión vigente (la de mayor `revision` no superada), con su badge `vN`. |
| **FR-006** | Cada entrada con `revision > 1` ofrece abrir el histórico: revisiones ordenadas, con fecha, `sourceMessageId` y acceso al visor de cada una. |
| **FR-007** | Restaurar una revisión anterior **crea una revisión nueva** con ese contenido (`restoredFrom` apunta a la original). El histórico es append-only: ninguna operación de la UI borra ni reescribe una revisión. |
| **FR-008** | Existe una acción para **adjuntar** un artefacto a un linaje existente (resuelve el caso del título cambiado) y para **desprenderlo** a un linaje propio. |
| **FR-009** | Borrar desde el panel **archiva el linaje** (`archivedAt`): sale de la lista, sigue en el estado. El borrado definitivo es una acción explícita y separada, con confirmación. |
| **FR-010** | El contexto para el chat referencia **linaje + revisión vigente**: se inyecta una sola versión por linaje. El artefacto producido registra en `contextArtifactIds` los ids de revisión concretos. |
| **FR-011** | **Migración al cargar:** el estado sin linajes se normaliza en memoria — un linaje por artefacto (`revision = 1`), agrupando por clave de linaje dentro de cada snapshot cuando ya hay duplicados (el más viejo queda v1). La migración es una función pura y probada, y no pierde artefactos. |
| **FR-012** | El export a markdown (`src/lib/artifacts/to-markdown.ts`) incluye la revisión en el encabezado del artefacto. |
| **FR-013** | El registry (`src/lib/artifacts/registry.ts`) gana el campo opcional `singleton`, marcado en `drivers`, `constraints`, `proposal` y `roadmap`. Añadir un artefacto sigue siendo añadir una entrada: **no** se cablea ningún `kind` fuera del registry (P6). |

## Criterios de éxito

| Id | Medida | Objetivo |
|---|---|---|
| **SC-001** | Tarjetas visibles tras regenerar 3 veces el mismo artefacto | 1 (marcada `v3`) |
| **SC-002** | Revisiones recuperables de ese artefacto | 3 |
| **SC-003** | Artefactos perdidos al abrir un archivo del formato anterior | 0 (test de migración con estado real) |
| **SC-004** | Revisiones borradas o mutadas por cualquier acción de la UI salvo el borrado definitivo | 0 (append-only, probado) |
| **SC-005** | Cobertura del módulo nuevo de versionado (FR-001) | ≥ 95 % stmts |
| **SC-006** | Versiones inyectadas al contexto por linaje marcado | 1 (la vigente) |
| **SC-007** | `npm run gate` | verde |

## Fuera de alcance

- **Diff entre revisiones.** Ver v2 y v3 lado a lado, o resaltar cambios, es otra spec. Acá se
  puede *abrir* cada revisión, no compararlas.
- **Persistencia fuera del archivo/localStorage.** El histórico vive donde ya vive el estado del
  agente (`agent_state_<fileId>`); no se agrega backend ni base de datos.
- **Versionar las vistas del diseñador.** Este spec es de artefactos. Las vistas (`ViewsContext`)
  tienen su propio ciclo.
- **Rediseñar los snapshots (`ArtifactVersion`).** Se mantienen tal cual: FR-003 agrega un eje, no
  reemplaza el existente.
- **Purga automática del histórico.** Nada expira ni se poda por tamaño. Si el estado crece
  demasiado, se mide primero y se decide en otra spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El estado en `localStorage` crece con cada revisión (payloads markdown/mermaid completos) | Medir en SC; el payload de una revisión es texto, no binario. Purga = otra spec, con datos. |
| La clave por título agrupa mal si el agente reescribe títulos | FR-008 (adjuntar/desprender manual) + `singleton` para los cuatro tipos donde más duele. |
| La migración corre en cada carga y toca todos los artefactos | Función pura, idempotente y probada con estados reales (FR-011, SC-003). |
