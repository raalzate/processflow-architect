/**
 * @fileOverview Versionado de artefactos por linaje: cada artefacto tiene su
 * propia historia (revisión 1, 2, 3…) y el histórico es **append-only**.
 *
 * Dos ejes conviven y son independientes:
 *  - `ArtifactVersion` (snapshot): "el conjunto en el momento T". Ya existía.
 *  - `ArtifactLineage` (linaje):   "la historia de UN artefacto". Este módulo.
 *
 * Todo acá es puro: el reloj y los ids se inyectan (`VersioningDeps`) para que
 * las pruebas sean deterministas y `lib/` no toque `crypto` ni `Date` (§P3).
 * Ninguna función elimina ni muta revisiones salvo `purgeLineage`, que es el
 * borrado definitivo y explícito.
 *
 * Spec: specs/004-artefactos-versionados/
 */

import type { AgentArtifact, Artifact, ArtifactLineage } from "../agent-types";
import { isSingletonKind } from "./registry";

/** Estado versionado mínimo con el que trabaja el módulo. */
export interface VersionedState {
  lineages: ArtifactLineage[];
  artifacts: Artifact[];
}

/** Reloj e ids inyectados: mantiene las funciones puras y testeables. */
export interface VersioningDeps {
  uid: () => string;
  now: () => string;
}

/** Metadatos del turno que produjo los artefactos. */
export interface IngestMeta {
  versionId: string;
  sourceMessageId?: string;
  contextArtifactIds?: string[];
}

/* -------------------------------------------------------------------------- */
/* Clave de linaje                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza un título para comparar linajes: minúsculas, sin diacríticos, sin
 * puntuación y con espacios colapsados. "Decisión: usar Postgres" y
 * "  decision   USAR  postgres " son el mismo artefacto.
 */
export function normalizeTitle(title: string): string {
  return (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clave de linaje. Los `kind` singleton del registry ignoran el título (hay uno
 * por proyecto); el resto lo incluyen, porque dos ADR distintos son dos
 * artefactos y no dos versiones del mismo.
 */
export function lineageKey(kind: string, title: string): string {
  if (isSingletonKind(kind)) return kind;
  return `${kind}::${normalizeTitle(title)}`;
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                  */
/* -------------------------------------------------------------------------- */

function revisionOf(a: Artifact): number {
  return typeof a.revision === "number" && a.revision >= 1 ? a.revision : 1;
}

/** Revisiones de un linaje, ascendente por revisión (y por fecha si empatan). */
export function lineageHistory(artifacts: Artifact[], lineageId: string): Artifact[] {
  return artifacts
    .filter((a) => a.lineageId === lineageId)
    .sort((x, y) => revisionOf(x) - revisionOf(y) || x.createdAt.localeCompare(y.createdAt));
}

/**
 * Revisión vigente: la de mayor número. Si un estado corrupto trae dos con el
 * mismo número, gana la más nueva — el panel nunca se queda sin artefacto por
 * un dato malo (misma filosofía que §P8: el lienzo nunca queda en blanco).
 */
export function currentRevision(artifacts: Artifact[], lineageId: string): Artifact | undefined {
  const history = lineageHistory(artifacts, lineageId);
  return history[history.length - 1];
}

/** Siguiente número de revisión del linaje (1 si no tiene ninguna). */
export function nextRevision(artifacts: Artifact[], lineageId: string): number {
  const last = currentRevision(artifacts, lineageId);
  return last ? revisionOf(last) + 1 : 1;
}

/**
 * Lo que ve el panel: UNA entrada por linaje no archivado del snapshot dado —
 * su revisión vigente. Orden: el del linaje (antigüedad de creación).
 */
export function visibleArtifacts(state: VersionedState, versionId: string): Artifact[] {
  return state.lineages
    .filter((l) => l.versionId === versionId && !l.archivedAt)
    .map((l) => currentRevision(state.artifacts, l.id))
    .filter((a): a is Artifact => !!a);
}

/** Linaje de un artefacto, si existe. */
export function lineageOf(state: VersionedState, artifactId: string): ArtifactLineage | undefined {
  const art = state.artifacts.find((a) => a.id === artifactId);
  if (!art) return undefined;
  return state.lineages.find((l) => l.id === art.lineageId);
}

/**
 * Resuelve los ids marcados como contexto a la revisión **vigente** de su
 * linaje, deduplicando por linaje: marcar la v1 y la v2 del mismo artefacto
 * inyecta una sola vez la v3. Los ids que ya no existen se ignoran.
 */
export function resolveContextRevisions(artifacts: Artifact[], ids: string[]): Artifact[] {
  const out: Artifact[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const art = artifacts.find((a) => a.id === id);
    if (!art) continue;
    const key = art.lineageId ?? art.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const vigente = art.lineageId ? currentRevision(artifacts, art.lineageId) : art;
    out.push(vigente ?? art);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Mutaciones (devuelven estado nuevo; nunca mutan el recibido)               */
/* -------------------------------------------------------------------------- */

/** Marca `supersededBy` en la revisión anterior de un linaje. */
function supersede(artifacts: Artifact[], previousId: string, byId: string): Artifact[] {
  return artifacts.map((a) => (a.id === previousId ? { ...a, supersededBy: byId } : a));
}

/**
 * Ingresa los artefactos que emitió el agente. Si su clave de linaje ya existe
 * en el snapshot, la revisión incrementa; si no, abre linaje en la revisión 1.
 * Un linaje archivado revive (el usuario lo volvió a pedir) y **continúa** la
 * numeración: el histórico no se reinicia.
 */
export function ingestArtifacts(
  state: VersionedState,
  incoming: AgentArtifact[],
  meta: IngestMeta,
  deps: VersioningDeps
): { lineages: ArtifactLineage[]; artifacts: Artifact[]; created: Artifact[] } {
  let lineages = [...state.lineages];
  let artifacts = [...state.artifacts];
  const created: Artifact[] = [];

  for (const inc of incoming) {
    const key = lineageKey(inc.kind, inc.title);
    const existing = lineages.find((l) => l.versionId === meta.versionId && l.key === key);

    let lineageId: string;
    if (existing) {
      lineageId = existing.id;
      // Revive el linaje archivado: pedirlo otra vez es quererlo de vuelta.
      if (existing.archivedAt) {
        lineages = lineages.map((l) =>
          l.id === existing.id ? { ...l, archivedAt: undefined } : l
        );
      }
    } else {
      const lineage: ArtifactLineage = {
        id: deps.uid(),
        key,
        kind: inc.kind,
        versionId: meta.versionId,
        createdAt: deps.now(),
      };
      lineages = [...lineages, lineage];
      lineageId = lineage.id;
    }

    const previous = currentRevision(artifacts, lineageId);
    const art: Artifact = {
      id: deps.uid(),
      versionId: meta.versionId,
      kind: inc.kind,
      render: inc.render,
      title: inc.title,
      payload: inc.payload,
      createdAt: deps.now(),
      sourceMessageId: meta.sourceMessageId,
      contextArtifactIds: meta.contextArtifactIds?.length ? meta.contextArtifactIds : undefined,
      lineageId,
      revision: previous ? revisionOf(previous) + 1 : 1,
    };
    artifacts = previous ? supersede([...artifacts, art], previous.id, art.id) : [...artifacts, art];
    created.push(art);
  }

  return { lineages, artifacts, created };
}

/**
 * Restaurar es **avanzar**: crea una revisión nueva con el payload de la
 * restaurada. El histórico nunca se reescribe (FR-007).
 */
export function restoreRevision(
  state: VersionedState,
  artifactId: string,
  deps: VersioningDeps
): VersionedState & { created?: Artifact } {
  const source = state.artifacts.find((a) => a.id === artifactId);
  if (!source || !source.lineageId) return state;

  const previous = currentRevision(state.artifacts, source.lineageId);
  const art: Artifact = {
    ...source,
    id: deps.uid(),
    createdAt: deps.now(),
    revision: previous ? revisionOf(previous) + 1 : 1,
    supersededBy: undefined,
    restoredFrom: source.id,
  };
  const artifacts = previous
    ? supersede([...state.artifacts, art], previous.id, art.id)
    : [...state.artifacts, art];

  // Restaurar en un linaje archivado también lo revive.
  const lineages = state.lineages.map((l) =>
    l.id === source.lineageId && l.archivedAt ? { ...l, archivedAt: undefined } : l
  );
  return { lineages, artifacts, created: art };
}

/** Archiva un linaje: sale de la lista, sigue en el estado (FR-009). */
export function archiveLineage(
  state: VersionedState,
  lineageId: string,
  deps: VersioningDeps
): VersionedState {
  return {
    lineages: state.lineages.map((l) =>
      l.id === lineageId ? { ...l, archivedAt: l.archivedAt ?? deps.now() } : l
    ),
    artifacts: state.artifacts,
  };
}

/** Deshace el archivado. */
export function unarchiveLineage(state: VersionedState, lineageId: string): VersionedState {
  return {
    lineages: state.lineages.map((l) =>
      l.id === lineageId ? { ...l, archivedAt: undefined } : l
    ),
    artifacts: state.artifacts,
  };
}

/**
 * Borrado definitivo: lo ÚNICO que elimina revisiones. Va detrás de una
 * confirmación en la UI.
 */
export function purgeLineage(state: VersionedState, lineageId: string): VersionedState {
  return {
    lineages: state.lineages.filter((l) => l.id !== lineageId),
    artifacts: state.artifacts.filter((a) => a.lineageId !== lineageId),
  };
}

/**
 * Adjunta un artefacto a un linaje existente: la salida cuando el agente
 * cambió el título y abrió un linaje nuevo sin querer (FR-008). El artefacto
 * pasa a ser la revisión siguiente del linaje destino; su linaje original se
 * elimina si queda vacío.
 */
export function attachToLineage(
  state: VersionedState,
  artifactId: string,
  targetLineageId: string
): VersionedState {
  const art = state.artifacts.find((a) => a.id === artifactId);
  const target = state.lineages.find((l) => l.id === targetLineageId);
  if (!art || !target || art.lineageId === targetLineageId) return state;

  const previous = currentRevision(state.artifacts, targetLineageId);
  let artifacts = state.artifacts.map((a) =>
    a.id === artifactId
      ? {
          ...a,
          lineageId: targetLineageId,
          revision: previous ? revisionOf(previous) + 1 : 1,
          supersededBy: undefined,
        }
      : a
  );
  if (previous) artifacts = supersede(artifacts, previous.id, artifactId);

  const origen = art.lineageId;
  const quedanEnOrigen = artifacts.some((a) => a.lineageId === origen);
  const lineages = quedanEnOrigen ? state.lineages : state.lineages.filter((l) => l.id !== origen);
  return { lineages, artifacts };
}

/**
 * Desprende una revisión a un linaje propio (lo inverso de `attachToLineage`):
 * era otro artefacto, no una versión de este.
 */
export function detachArtifact(
  state: VersionedState,
  artifactId: string,
  deps: VersioningDeps
): VersionedState {
  const art = state.artifacts.find((a) => a.id === artifactId);
  if (!art) return state;

  const lineage: ArtifactLineage = {
    id: deps.uid(),
    key: lineageKey(art.kind, art.title),
    kind: art.kind,
    versionId: art.versionId,
    createdAt: deps.now(),
  };
  // La revisión anterior deja de estar superada por esta: la cadena se corta acá.
  const artifacts = state.artifacts.map((a) => {
    if (a.id === artifactId) {
      return { ...a, lineageId: lineage.id, revision: 1, supersededBy: undefined };
    }
    if (a.supersededBy === artifactId) return { ...a, supersededBy: undefined };
    return a;
  });
  return { lineages: [...state.lineages, lineage], artifacts };
}

/* -------------------------------------------------------------------------- */
/* Migración del estado anterior a 004                                        */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza un estado guardado sin linajes: agrupa por clave de linaje dentro
 * de cada snapshot, en orden de `createdAt`, así los duplicados de hoy se
 * convierten en el histórico que el usuario creía tener (el más viejo queda
 * revisión 1). Idempotente: `migrate(migrate(s))` === `migrate(s)`.
 */
export function migrateState(state: VersionedState, deps: VersioningDeps): VersionedState {
  const lineages: ArtifactLineage[] = [];
  const byKey = new Map<string, ArtifactLineage>();

  // Los linajes ya existentes se respetan tal cual (idempotencia).
  for (const l of state.lineages) {
    lineages.push(l);
    byKey.set(`${l.versionId}::${l.key}`, l);
  }

  const conteo = new Map<string, number>();
  // Semilla del contador con las revisiones ya asignadas de cada linaje válido.
  const conLinaje = new Set(lineages.map((l) => l.id));
  for (const a of state.artifacts) {
    if (a.lineageId && conLinaje.has(a.lineageId)) {
      conteo.set(a.lineageId, Math.max(conteo.get(a.lineageId) ?? 0, revisionOf(a)));
    }
  }

  const ordenados = [...state.artifacts].sort(
    (x, y) => x.createdAt.localeCompare(y.createdAt) || revisionOf(x) - revisionOf(y)
  );
  const migrados = new Map<string, Artifact>();

  for (const a of ordenados) {
    // Ya tiene linaje válido y revisión: nada que hacer.
    if (a.lineageId && conLinaje.has(a.lineageId) && typeof a.revision === "number") {
      migrados.set(a.id, a);
      continue;
    }
    const key = lineageKey(a.kind, a.title);
    const mapKey = `${a.versionId}::${key}`;
    let lineage = byKey.get(mapKey);
    if (!lineage) {
      lineage = {
        id: deps.uid(),
        key,
        kind: a.kind,
        versionId: a.versionId,
        createdAt: a.createdAt,
      };
      lineages.push(lineage);
      byKey.set(mapKey, lineage);
    }
    const revision = (conteo.get(lineage.id) ?? 0) + 1;
    conteo.set(lineage.id, revision);
    migrados.set(a.id, { ...a, lineageId: lineage.id, revision });
  }

  // Reconstruye la cadena `supersededBy` por linaje, en orden de revisión.
  const artifacts = state.artifacts.map((a) => migrados.get(a.id) ?? a);
  const porLinaje = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    if (!a.lineageId) continue;
    porLinaje.set(a.lineageId, [...(porLinaje.get(a.lineageId) ?? []), a]);
  }
  const superseded = new Map<string, string | undefined>();
  for (const [id] of porLinaje) {
    const history = lineageHistory(artifacts, id);
    history.forEach((a, i) => superseded.set(a.id, history[i + 1]?.id));
  }

  return {
    lineages,
    artifacts: artifacts.map((a) =>
      a.lineageId ? { ...a, supersededBy: superseded.get(a.id) } : a
    ),
  };
}
