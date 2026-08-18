/**
 * Escenarios de specs/004-artefactos-versionados/testify.md (E1–E19).
 * El invariante duro es append-only: sólo `purgeLineage` borra revisiones.
 */

import { describe, it, expect } from "vitest";
import type { AgentArtifact, Artifact, ArtifactLineage } from "@/lib/agent-types";
import {
  archiveLineage,
  attachToLineage,
  currentRevision,
  detachArtifact,
  ingestArtifacts,
  lineageHistory,
  lineageKey,
  lineageOf,
  migrateState,
  nextRevision,
  normalizeTitle,
  purgeLineage,
  resolveContextRevisions,
  restoreRevision,
  unarchiveLineage,
  visibleArtifacts,
  type VersionedState,
  type VersioningDeps,
} from "../versioning";

const V1 = "snapshot-1";

/** Deps deterministas: ids incrementales y reloj que avanza un segundo por llamada. */
function deps(): VersioningDeps {
  let n = 0;
  let t = 0;
  return {
    uid: () => `id-${++n}`,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString(),
  };
}

const empty = (): VersionedState => ({ lineages: [], artifacts: [] });

function agentArtifact(kind: string, title: string, markdown = "x"): AgentArtifact {
  return { kind, render: "markdown", title, payload: { markdown } };
}

/** Ingresa una lista de artefactos del agente sobre un estado. */
function ingest(state: VersionedState, incoming: AgentArtifact[], d: VersioningDeps, versionId = V1) {
  const r = ingestArtifacts(state, incoming, { versionId, sourceMessageId: "msg" }, d);
  return { state: { lineages: r.lineages, artifacts: r.artifacts }, created: r.created };
}

describe("lineageKey", () => {
  it("normaliza acentos, mayúsculas, puntuación y espacios", () => {
    // E1
    expect(normalizeTitle("Decisión: usar Postgres")).toBe("decision usar postgres");
    expect(lineageKey("adr", "Decisión: usar Postgres")).toBe(
      lineageKey("adr", "  decision   USAR  postgres  ")
    );
  });

  it("tolera un título vacío o ausente", () => {
    expect(normalizeTitle(undefined as unknown as string)).toBe("");
    expect(lineageKey("adr", "")).toBe("adr::");
  });

  it("mismo kind con títulos distintos ⇒ claves distintas", () => {
    // E2
    expect(lineageKey("adr", "Usar Postgres")).not.toBe(lineageKey("adr", "Usar Kafka"));
  });

  it("kind singleton usa sólo el kind", () => {
    // E3
    expect(lineageKey("roadmap", "Roadmap 2026")).toBe("roadmap");
    expect(lineageKey("roadmap", "Plan de entregas")).toBe("roadmap");
    expect(lineageKey("drivers", "cualquiera")).toBe("drivers");
  });

  it("un kind inventado por el agente NO es singleton", () => {
    expect(lineageKey("kind-inventado", "A")).not.toBe(lineageKey("kind-inventado", "B"));
  });
});

describe("ingestArtifacts", () => {
  it("clave nueva ⇒ linaje nuevo en revisión 1", () => {
    // E5
    const d = deps();
    const { state } = ingest(empty(), [agentArtifact("drivers", "Drivers")], d);
    expect(state.lineages).toHaveLength(1);
    expect(state.artifacts[0].revision).toBe(1);
    expect(state.artifacts[0].lineageId).toBe(state.lineages[0].id);
  });

  it("misma clave ⇒ revision + 1 y supersede la anterior", () => {
    // E4
    const d = deps();
    const uno = ingest(empty(), [agentArtifact("drivers", "Drivers")], d);
    const dos = ingest(uno.state, [agentArtifact("drivers", "Drivers rehechos")], d);

    expect(dos.state.lineages).toHaveLength(1);
    expect(dos.created[0].revision).toBe(2);
    expect(dos.created[0].lineageId).toBe(uno.created[0].lineageId);
    const anterior = dos.state.artifacts.find((a) => a.id === uno.created[0].id)!;
    expect(anterior.supersededBy).toBe(dos.created[0].id);
  });

  it("tres regeneraciones dejan un visible en revisión 3 y tres en el histórico", () => {
    // E6 · SC-001 · SC-002
    const d = deps();
    let s = empty();
    for (let i = 1; i <= 3; i++) s = ingest(s, [agentArtifact("drivers", `Drivers ${i}`)], d).state;

    const visibles = visibleArtifacts(s, V1);
    expect(visibles).toHaveLength(1);
    expect(visibles[0].revision).toBe(3);
    expect(lineageHistory(s.artifacts, s.lineages[0].id).map((a) => a.revision)).toEqual([1, 2, 3]);
  });

  it("un linaje archivado revive y continúa la numeración", () => {
    // E7
    const d = deps();
    let s = ingest(empty(), [agentArtifact("drivers", "Drivers")], d).state;
    s = archiveLineage(s, s.lineages[0].id, d);
    expect(visibleArtifacts(s, V1)).toHaveLength(0);

    const r = ingest(s, [agentArtifact("drivers", "Drivers otra vez")], d);
    expect(r.state.lineages[0].archivedAt).toBeUndefined();
    expect(r.created[0].revision).toBe(2);
    expect(visibleArtifacts(r.state, V1)).toHaveLength(1);
  });

  it("el linaje no cruza snapshots", () => {
    // E8
    const d = deps();
    const uno = ingest(empty(), [agentArtifact("drivers", "Drivers")], d);
    const dos = ingest(uno.state, [agentArtifact("drivers", "Drivers")], d, "snapshot-2");

    expect(dos.state.lineages).toHaveLength(2);
    expect(dos.created[0].revision).toBe(1);
    expect(dos.state.artifacts.find((a) => a.id === uno.created[0].id)!.supersededBy).toBeUndefined();
    expect(visibleArtifacts(dos.state, V1)).toHaveLength(1);
    expect(visibleArtifacts(dos.state, "snapshot-2")).toHaveLength(1);
  });

  it("varios artefactos del mismo turno con la misma clave se encadenan", () => {
    const d = deps();
    const { state, created } = ingest(
      empty(),
      [agentArtifact("adr", "Usar Postgres"), agentArtifact("adr", "usar postgres")],
      d
    );
    expect(state.lineages).toHaveLength(1);
    expect(created.map((a) => a.revision)).toEqual([1, 2]);
  });

  it("propaga los ids de contexto usados y el mensaje de origen", () => {
    const d = deps();
    const r = ingestArtifacts(
      empty(),
      [agentArtifact("adr", "A")],
      { versionId: V1, sourceMessageId: "m1", contextArtifactIds: ["ctx-1"] },
      d
    );
    expect(r.created[0].contextArtifactIds).toEqual(["ctx-1"]);
    expect(r.created[0].sourceMessageId).toBe("m1");
  });

  it("sin ids de contexto no guarda un arreglo vacío", () => {
    const d = deps();
    const r = ingestArtifacts(
      empty(),
      [agentArtifact("adr", "A")],
      { versionId: V1, contextArtifactIds: [] },
      d
    );
    expect(r.created[0].contextArtifactIds).toBeUndefined();
  });
});

describe("currentRevision · nextRevision", () => {
  it("devuelve la mayor revisión del linaje", () => {
    // E11
    const d = deps();
    let s = empty();
    for (let i = 1; i <= 3; i++) s = ingest(s, [agentArtifact("drivers", "D")], d).state;
    const lid = s.lineages[0].id;
    expect(currentRevision(s.artifacts, lid)!.revision).toBe(3);
    expect(nextRevision(s.artifacts, lid)).toBe(4);
  });

  it("con revisiones empatadas gana la más nueva (estado corrupto, §P8)", () => {
    // E12
    const lineage: ArtifactLineage = {
      id: "L1",
      key: "drivers",
      kind: "drivers",
      versionId: V1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const base: Omit<Artifact, "id" | "createdAt"> = {
      versionId: V1,
      kind: "drivers",
      render: "markdown",
      title: "D",
      payload: { markdown: "x" },
      lineageId: "L1",
      revision: 2,
    };
    const s: VersionedState = {
      lineages: [lineage],
      artifacts: [
        { ...base, id: "a", createdAt: "2026-01-01T00:00:01.000Z" },
        { ...base, id: "b", createdAt: "2026-01-01T00:00:09.000Z" },
      ],
    };
    expect(currentRevision(s.artifacts, "L1")!.id).toBe("b");
    expect(visibleArtifacts(s, V1)).toHaveLength(1);
  });

  it("un linaje sin revisiones no aparece como visible", () => {
    const s: VersionedState = {
      lineages: [{ id: "L1", key: "k", kind: "k", versionId: V1, createdAt: "2026-01-01" }],
      artifacts: [],
    };
    expect(currentRevision(s.artifacts, "L1")).toBeUndefined();
    expect(visibleArtifacts(s, V1)).toEqual([]);
    expect(nextRevision(s.artifacts, "L1")).toBe(1);
  });

  it("una revisión sin número se cuenta como 1", () => {
    const s: VersionedState = {
      lineages: [{ id: "L1", key: "k", kind: "k", versionId: V1, createdAt: "2026-01-01" }],
      artifacts: [
        {
          id: "a",
          versionId: V1,
          kind: "k",
          render: "markdown",
          title: "t",
          payload: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          lineageId: "L1",
        },
      ],
    };
    expect(nextRevision(s.artifacts, "L1")).toBe(2);
  });
});

describe("lineageOf", () => {
  it("resuelve el linaje de un artefacto y tolera ids inexistentes", () => {
    const d = deps();
    const { state, created } = ingest(empty(), [agentArtifact("adr", "A")], d);
    expect(lineageOf(state, created[0].id)!.id).toBe(created[0].lineageId);
    expect(lineageOf(state, "no-existe")).toBeUndefined();
  });
});

describe("restoreRevision", () => {
  it("crea revisión nueva con el payload restaurado y no toca el histórico", () => {
    // E9
    const d = deps();
    let s = empty();
    for (const t of ["A", "B", "C"]) {
      s = ingest(s, [agentArtifact("drivers", `Drivers ${t}`, t)], d).state;
    }
    const v2 = lineageHistory(s.artifacts, s.lineages[0].id)[1];
    const r = restoreRevision(s, v2.id, d);

    expect(r.created!.revision).toBe(4);
    expect(r.created!.payload).toEqual(v2.payload);
    expect(r.created!.restoredFrom).toBe(v2.id);
    expect(r.created!.supersededBy).toBeUndefined();
    expect(lineageHistory(r.artifacts, s.lineages[0].id).map((a) => a.revision)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(currentRevision(r.artifacts, s.lineages[0].id)!.id).toBe(r.created!.id);
  });

  it("restaurar en un linaje archivado lo revive", () => {
    const d = deps();
    const { state, created } = ingest(empty(), [agentArtifact("drivers", "D")], d);
    const archivado = archiveLineage(state, state.lineages[0].id, d);
    const r = restoreRevision(archivado, created[0].id, d);
    expect(r.lineages[0].archivedAt).toBeUndefined();
  });

  it("un id inexistente devuelve el estado sin cambios", () => {
    const d = deps();
    const { state } = ingest(empty(), [agentArtifact("drivers", "D")], d);
    expect(restoreRevision(state, "no-existe", d)).toBe(state);
  });

  it("una revisión sin linaje devuelve el estado sin cambios", () => {
    const s: VersionedState = {
      lineages: [],
      artifacts: [
        {
          id: "suelto",
          versionId: V1,
          kind: "adr",
          render: "markdown",
          title: "t",
          payload: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(restoreRevision(s, "suelto", deps())).toBe(s);
  });
});

describe("archivar · purgar", () => {
  it("archivar oculta el linaje sin borrar revisiones", () => {
    // E13
    const d = deps();
    let s = empty();
    s = ingest(s, [agentArtifact("drivers", "D1")], d).state;
    s = ingest(s, [agentArtifact("drivers", "D2")], d).state;
    const archivado = archiveLineage(s, s.lineages[0].id, d);

    expect(visibleArtifacts(archivado, V1)).toEqual([]);
    expect(archivado.artifacts).toHaveLength(2);
    expect(archivado.lineages[0].archivedAt).toBeTruthy();
  });

  it("archivar dos veces conserva la fecha original", () => {
    const d = deps();
    const { state } = ingest(empty(), [agentArtifact("drivers", "D")], d);
    const uno = archiveLineage(state, state.lineages[0].id, d);
    const dos = archiveLineage(uno, state.lineages[0].id, d);
    expect(dos.lineages[0].archivedAt).toBe(uno.lineages[0].archivedAt);
  });

  it("desarchivar devuelve el linaje a la lista", () => {
    const d = deps();
    const { state } = ingest(empty(), [agentArtifact("drivers", "D")], d);
    const s = unarchiveLineage(archiveLineage(state, state.lineages[0].id, d), state.lineages[0].id);
    expect(visibleArtifacts(s, V1)).toHaveLength(1);
  });

  it("purgar borra sólo el linaje pedido", () => {
    // E14
    const d = deps();
    let s = ingest(empty(), [agentArtifact("drivers", "D")], d).state;
    s = ingest(s, [agentArtifact("adr", "Usar Postgres")], d).state;
    const objetivo = s.lineages[0].id;

    const purgado = purgeLineage(s, objetivo);
    expect(purgado.lineages.map((l) => l.id)).not.toContain(objetivo);
    expect(purgado.artifacts.every((a) => a.lineageId !== objetivo)).toBe(true);
    expect(purgado.artifacts).toHaveLength(1);
  });
});

describe("attachToLineage · detachArtifact", () => {
  it("adjuntar convierte el artefacto en la revisión siguiente del destino", () => {
    // FR-008
    const d = deps();
    let s = ingest(empty(), [agentArtifact("adr", "Usar Postgres")], d).state;
    const destino = s.lineages[0].id;
    const r = ingest(s, [agentArtifact("adr", "Usar Postgres v2 (otro título)")], d);
    s = r.state;
    expect(s.lineages).toHaveLength(2);

    const adjuntado = attachToLineage(s, r.created[0].id, destino);
    expect(adjuntado.lineages).toHaveLength(1); // el linaje huérfano se elimina
    expect(lineageHistory(adjuntado.artifacts, destino).map((a) => a.revision)).toEqual([1, 2]);
    expect(visibleArtifacts(adjuntado, V1)).toHaveLength(1);
  });

  it("adjuntar es un no-op con ids inválidos o si ya está en el destino", () => {
    const d = deps();
    const { state, created } = ingest(empty(), [agentArtifact("adr", "A")], d);
    const lid = state.lineages[0].id;
    expect(attachToLineage(state, "no-existe", lid)).toBe(state);
    expect(attachToLineage(state, created[0].id, "no-existe")).toBe(state);
    expect(attachToLineage(state, created[0].id, lid)).toBe(state);
  });

  it("adjuntar conserva el linaje origen si le quedan revisiones", () => {
    const d = deps();
    let s = ingest(empty(), [agentArtifact("adr", "Destino")], d).state;
    const destino = s.lineages[0].id;
    let r = ingest(s, [agentArtifact("adr", "Origen")], d);
    s = r.state;
    const origen = r.created[0].lineageId!;
    r = ingest(s, [agentArtifact("adr", "Origen")], d); // origen queda con 2 revisiones
    s = r.state;

    const adjuntado = attachToLineage(s, r.created[0].id, destino);
    expect(adjuntado.lineages.map((l) => l.id)).toContain(origen);
    expect(lineageHistory(adjuntado.artifacts, origen)).toHaveLength(1);
  });

  it("desprender abre linaje propio y corta la cadena", () => {
    const d = deps();
    let s = ingest(empty(), [agentArtifact("drivers", "D1")], d).state;
    const r = ingest(s, [agentArtifact("drivers", "D2")], d);
    s = r.state;
    const original = s.lineages[0].id;

    const suelto = detachArtifact(s, r.created[0].id, d);
    expect(suelto.lineages).toHaveLength(2);
    expect(lineageHistory(suelto.artifacts, original)).toHaveLength(1);
    expect(suelto.artifacts.find((a) => a.lineageId === original)!.supersededBy).toBeUndefined();
    expect(visibleArtifacts(suelto, V1)).toHaveLength(2);
  });

  it("desprender un id inexistente es un no-op", () => {
    const d = deps();
    const { state } = ingest(empty(), [agentArtifact("adr", "A")], d);
    expect(detachArtifact(state, "no-existe", d)).toBe(state);
  });
});

describe("append-only", () => {
  it("ninguna operación salvo purgar elimina ni muta revisiones", () => {
    // E10 · SC-004
    const d = deps();
    let s = empty();
    s = ingest(s, [agentArtifact("drivers", "D1", "uno")], d).state;
    s = ingest(s, [agentArtifact("drivers", "D2", "dos")], d).state;
    s = ingest(s, [agentArtifact("adr", "Usar Postgres", "pg")], d).state;
    s = ingest(s, [agentArtifact("adr", "Usar Kafka", "kafka")], d).state;
    s = ingest(s, [agentArtifact("roadmap", "Roadmap", "rm")], d).state;
    s = ingest(s, [agentArtifact("roadmap", "Plan", "rm2")], d).state;
    s = ingest(s, [agentArtifact("adr", "Usar Kafka", "kafka2")], d).state;

    const antes = s.artifacts.map((a) => ({ id: a.id, payload: a.payload, revision: a.revision }));
    expect(antes).toHaveLength(7);

    const driversLineage = s.lineages[0].id;
    s = restoreRevision(s, lineageHistory(s.artifacts, driversLineage)[0].id, d);
    s = archiveLineage(s, s.lineages[1].id, d);
    const kafka = s.lineages.find((l) => l.key.includes("kafka"))!;
    s = attachToLineage(s, lineageHistory(s.artifacts, driversLineage)[1].id, kafka.id);
    s = detachArtifact(s, lineageHistory(s.artifacts, kafka.id)[0].id, d);
    s = ingest(s, [agentArtifact("drivers", "D otra vez", "tres")], d).state;

    for (const original of antes) {
      const actual = s.artifacts.find((a) => a.id === original.id);
      expect(actual, `la revisión ${original.id} sigue existiendo`).toBeTruthy();
      expect(actual!.payload).toEqual(original.payload);
    }
    expect(s.artifacts.length).toBeGreaterThan(antes.length);
  });
});

describe("resolveContextRevisions", () => {
  it("mapea a la vigente y deduplica por linaje", () => {
    // E15 · SC-006
    const d = deps();
    let s = empty();
    const creados: Artifact[] = [];
    for (const t of ["A", "B", "C"]) {
      const r = ingest(s, [agentArtifact("drivers", `D ${t}`, t)], d);
      s = r.state;
      creados.push(r.created[0]);
    }
    const resuelto = resolveContextRevisions(s.artifacts, [creados[0].id, creados[1].id]);
    expect(resuelto).toHaveLength(1);
    expect(resuelto[0].revision).toBe(3);
  });

  it("ignora ids inexistentes y conserva el resto", () => {
    // E16
    const d = deps();
    let s = ingest(empty(), [agentArtifact("drivers", "D")], d).state;
    const r = ingest(s, [agentArtifact("adr", "Usar Postgres")], d);
    s = r.state;
    const resuelto = resolveContextRevisions(s.artifacts, ["purgado", r.created[0].id]);
    expect(resuelto.map((a) => a.kind)).toEqual(["adr"]);
  });

  it("un artefacto sin linaje se devuelve tal cual", () => {
    const suelto: Artifact = {
      id: "suelto",
      versionId: V1,
      kind: "adr",
      render: "markdown",
      title: "t",
      payload: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(resolveContextRevisions([suelto], ["suelto", "suelto"])).toEqual([suelto]);
  });
});

describe("migrateState", () => {
  /** Estado como el que hay hoy en localStorage: sin linajes ni revisiones. */
  function viejo(entradas: { id: string; kind: string; title: string; t: string }[]): VersionedState {
    return {
      lineages: [],
      artifacts: entradas.map((e) => ({
        id: e.id,
        versionId: V1,
        kind: e.kind,
        render: "markdown" as const,
        title: e.title,
        payload: { markdown: e.id },
        createdAt: e.t,
      })),
    };
  }

  it("un linaje por artefacto sin duplicados", () => {
    // E17
    const s = migrateState(
      viejo([
        { id: "a", kind: "drivers", title: "Drivers", t: "2026-01-01T00:00:01.000Z" },
        { id: "b", kind: "constraints", title: "Riesgos", t: "2026-01-01T00:00:02.000Z" },
        { id: "c", kind: "adr", title: "Usar Postgres", t: "2026-01-01T00:00:03.000Z" },
        { id: "d", kind: "adr", title: "Usar Kafka", t: "2026-01-01T00:00:04.000Z" },
      ]),
      deps()
    );
    expect(s.lineages).toHaveLength(4);
    expect(s.artifacts).toHaveLength(4);
    expect(s.artifacts.every((a) => a.revision === 1 && a.lineageId)).toBe(true);
    expect(visibleArtifacts(s, V1)).toHaveLength(4);
  });

  it("agrupa duplicados por clave respetando createdAt", () => {
    // E18 · SC-003
    const s = migrateState(
      viejo([
        { id: "t3", kind: "drivers", title: "Drivers C", t: "2026-01-01T00:00:03.000Z" },
        { id: "t1", kind: "drivers", title: "Drivers A", t: "2026-01-01T00:00:01.000Z" },
        { id: "t2", kind: "drivers", title: "Drivers B", t: "2026-01-01T00:00:02.000Z" },
      ]),
      deps()
    );
    expect(s.lineages).toHaveLength(1);
    const history = lineageHistory(s.artifacts, s.lineages[0].id);
    expect(history.map((a) => a.id)).toEqual(["t1", "t2", "t3"]);
    expect(history.map((a) => a.revision)).toEqual([1, 2, 3]);
    expect(history[0].supersededBy).toBe("t2");
    expect(history[2].supersededBy).toBeUndefined();
    expect(visibleArtifacts(s, V1).map((a) => a.id)).toEqual(["t3"]);
  });

  it("es idempotente", () => {
    // E19
    const base = viejo([
      { id: "a", kind: "drivers", title: "D1", t: "2026-01-01T00:00:01.000Z" },
      { id: "b", kind: "drivers", title: "D2", t: "2026-01-01T00:00:02.000Z" },
      { id: "c", kind: "adr", title: "Usar Postgres", t: "2026-01-01T00:00:03.000Z" },
    ]);
    const una = migrateState(base, deps());
    const dos = migrateState(una, deps());
    expect(dos).toEqual(una);
  });

  it("no pierde artefactos de snapshots distintos", () => {
    const base: VersionedState = {
      lineages: [],
      artifacts: [
        ...viejo([{ id: "a", kind: "drivers", title: "D", t: "2026-01-01T00:00:01.000Z" }]).artifacts,
        {
          id: "b",
          versionId: "snapshot-2",
          kind: "drivers",
          render: "markdown",
          title: "D",
          payload: {},
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      ],
    };
    const s = migrateState(base, deps());
    expect(s.lineages).toHaveLength(2);
    expect(s.artifacts.map((a) => a.revision)).toEqual([1, 1]);
  });

  it("un estado vacío migra a un estado vacío", () => {
    expect(migrateState(empty(), deps())).toEqual({ lineages: [], artifacts: [] });
  });

  it("respeta linajes ya migrados y adopta los artefactos sueltos", () => {
    const d = deps();
    const conLinaje = ingest(empty(), [agentArtifact("drivers", "D")], d).state;
    const mezclado: VersionedState = {
      lineages: conLinaje.lineages,
      artifacts: [
        ...conLinaje.artifacts,
        {
          id: "suelto",
          versionId: V1,
          kind: "drivers",
          render: "markdown",
          title: "Drivers nuevos",
          payload: {},
          createdAt: "2027-01-01T00:00:00.000Z",
        },
      ],
    };
    const s = migrateState(mezclado, d);
    expect(s.lineages).toHaveLength(1); // misma clave singleton ⇒ mismo linaje
    expect(lineageHistory(s.artifacts, s.lineages[0].id).map((a) => a.revision)).toEqual([1, 2]);
  });

  it("un artefacto con lineageId colgado se readopta", () => {
    const base: VersionedState = {
      lineages: [],
      artifacts: [
        {
          id: "a",
          versionId: V1,
          kind: "adr",
          render: "markdown",
          title: "A",
          payload: {},
          createdAt: "2026-01-01T00:00:01.000Z",
          lineageId: "linaje-que-no-existe",
          revision: 7,
        },
      ],
    };
    const s = migrateState(base, deps());
    expect(s.lineages).toHaveLength(1);
    expect(s.artifacts[0].lineageId).toBe(s.lineages[0].id);
    expect(s.artifacts[0].revision).toBe(1);
  });
});
