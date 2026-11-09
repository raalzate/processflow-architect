import { describe, expect, it } from "vitest";
import { SharedDocument } from "../document";
import { describeEncodedPath, describeMergeConflictPath } from "../field-conflicts";
import { encodeProject } from "../graph-codec";
import type { SharedProject } from "../types";

const baseProject = (): SharedProject => ({
  name: "Proyecto de prueba",
  content: {
    nombre_proyecto: "Proyecto de prueba",
    version: "1",
    fecha_analisis: "",
    responsables: [],
    notas: "Notas iniciales",
    transcript: "",
    read_models: [],
    agregados: [
      {
        id: "agg-1",
        nombre_agregado: "Atención",
        entidad_raiz: "",
        descripcion: "",
        nodos: [
          {
            id: "node-a",
            nombre: "Consulta",
            tipo_elemento: "Comando",
            estado_comparativo: "nuevo",
            descripcion: "Triaje",
            x: 100,
            y: 120,
          },
          {
            id: "node-b",
            nombre: "Paciente",
            tipo_elemento: "Evento",
            estado_comparativo: "nuevo",
            descripcion: "",
            x: 320,
            y: 120,
          },
        ],
        aristas: [{ id: "edge-1", fuente: "node-a", destino: "node-b", descripcion: "Atiende" }],
      },
    ],
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    politicas_inter_agregados: [],
  },
  customViews: [
    {
      id: "view-web",
      name: "App Web",
      kind: "mermaid",
      mermaidCode: "graph TD; A-->B",
      createdAt: "2026-11-02",
    },
  ],
  references: [],
  agent: { versions: [], lineages: [], artifacts: [] },
  analysis: {},
});

function syncedPair() {
  const a = new SharedDocument();
  a.patch({}, baseProject());
  const b = new SharedDocument();
  b.receive(a.update());
  return { a, b };
}

function exchange(a: SharedDocument, b: SharedDocument) {
  const deltaA = a.update(b.vector());
  const deltaB = b.update(a.vector());
  a.receiveRemote(deltaB);
  b.receiveRemote(deltaA);
}

describe("live concurrent field conflict detection and recovery", () => {
  it("reports zero discarded edits for normal sequential edits on the same field", () => {
    const { a, b } = syncedPair();

    const first = structuredClone(a.snapshot());
    first.content.agregados[0].nodos[0].nombre = "Consulta General";
    a.patch(a.snapshot(), first);
    b.receiveRemote(a.update(b.vector()));

    const second = structuredClone(b.snapshot());
    second.content.agregados[0].nodos[0].nombre = "Consulta Especializada";
    b.patch(b.snapshot(), second);
    a.receiveRemote(b.update(a.vector()));

    expect(a.discardedEdits()).toEqual([]);
    expect(b.discardedEdits()).toEqual([]);
  });

  it("detects concurrent edits to the same field and allows restoring the discarded value", () => {
    const { a, b } = syncedPair();

    const beforeA = a.snapshot();
    const nextA = structuredClone(beforeA);
    nextA.content.agregados[0].nodos[0].nombre = "Consulta Urgencias";
    a.patch(beforeA, nextA);

    const beforeB = b.snapshot();
    const nextB = structuredClone(beforeB);
    nextB.content.agregados[0].nodos[0].nombre = "Consulta Externa";
    b.patch(beforeB, nextB);

    exchange(a, b);

    const conflictsA = a.discardedEdits();
    const conflictsB = b.discardedEdits();
    expect(conflictsA).toHaveLength(1);
    expect(conflictsB).toHaveLength(1);

    const conflict = conflictsA[0];
    expect(conflict.scope).toBe("design");
    expect(conflict.previousValue).toBe("Consulta");
    expect(conflict.label).toContain("Modelo");
    expect(conflict.label).toContain("Nombre");
    expect([conflict.currentValue, conflict.discardedValue].sort()).toEqual([
      "Consulta Externa",
      "Consulta Urgencias",
    ]);

    const wantedValue = conflict.discardedValue;
    a.resolveFieldConflict(conflict.id, "discarded");
    exchange(a, b);

    expect(a.snapshot().content.agregados[0].nodos[0].nombre).toBe(wantedValue);
    expect(b.snapshot().content.agregados[0].nodos[0].nombre).toBe(wantedValue);
    expect(a.discardedEdits()).toEqual([]);
    expect(b.discardedEdits()).toEqual([]);
  });

  it("allows keeping the current winning value and clears the conflict across peers", () => {
    const { a, b } = syncedPair();

    const nextA = structuredClone(a.snapshot());
    nextA.customViews[0].mermaidCode = "graph TD; Inicio-->Urgencias";
    a.patch(a.snapshot(), nextA);

    const nextB = structuredClone(b.snapshot());
    nextB.customViews[0].mermaidCode = "graph TD; Inicio-->Triaje";
    b.patch(b.snapshot(), nextB);

    exchange(a, b);

    const [conflict] = a.discardedEdits();
    expect(conflict).toBeDefined();
    expect(conflict.scope).toBe("view:view-web");
    expect(conflict.label).toContain("App Web");

    const winning = a.snapshot().customViews[0].mermaidCode;
    a.resolveFieldConflict(conflict.id, "current");
    exchange(a, b);

    expect(a.snapshot().customViews[0].mermaidCode).toBe(winning);
    expect(b.snapshot().customViews[0].mermaidCode).toBe(winning);
    expect(a.discardedEdits()).toEqual([]);
    expect(b.discardedEdits()).toEqual([]);
  });

  it("ignores transient x/y drag coordinates and tombstoned entities", () => {
    const { a, b } = syncedPair();

    const nextA = structuredClone(a.snapshot());
    nextA.content.agregados[0].nodos[0].x = 400;
    nextA.content.agregados[0].nodos[1].descripcion = "Descripción A";
    a.patch(a.snapshot(), nextA);

    const nextB = structuredClone(b.snapshot());
    nextB.content.agregados[0].nodos[0].x = 520;
    // B deletes node-b concurrently
    nextB.content.agregados[0].nodos = [nextB.content.agregados[0].nodos[0]];
    b.patch(b.snapshot(), nextB);

    exchange(a, b);

    expect(a.discardedEdits()).toEqual([]);
    expect(() => a.resolveFieldConflict("inexistente", "discarded")).toThrow(/ya no está pendiente/);
  });

  it("describes encoded paths for containers, edges, views, and common project fields", () => {
    const encoded = encodeProject(baseProject());
    expect(describeEncodedPath(["name"], encoded)).toEqual({
      scope: "project",
      label: "Datos comunes · Nombre del proyecto",
    });
    expect(describeEncodedPath(["content", "containers", "@agg-1", "nombre_agregado"], encoded)).toEqual({
      scope: "design",
      label: "Modelo · Grupo «Atención» · Nombre",
    });
    expect(describeEncodedPath(["content", "edges", "@edge-1", "descripcion"], encoded)).toEqual({
      scope: "design",
      label: "Modelo · Conexión «Atiende» · Descripción",
    });
    expect(describeEncodedPath(["customViews", "@view-web", "mermaidCode"], encoded)).toEqual({
      scope: "view:view-web",
      label: "Vista «App Web» · Código Mermaid",
    });
    expect(describeEncodedPath(["content", "meta", "notas"], encoded)).toEqual({
      scope: "design",
      label: "Modelo · Notas",
    });
    expect(describeEncodedPath(["references", "@ref-1", "title"], encoded)).toEqual({
      scope: "project",
      label: "Datos comunes · references · ref-1 · Título",
    });
    const project = baseProject();
    expect(describeMergeConflictPath("Modelo / nodes / @node-a / value / nombre", project)).toBe(
      "Modelo · Componente «Consulta» · Nombre",
    );
    expect(describeMergeConflictPath("view:view-web / mermaidCode", project)).toBe(
      "Vista «App Web» · Código Mermaid",
    );
    expect(describeMergeConflictPath("Datos comunes / name", project)).toBe(
      "Datos comunes · Nombre del proyecto",
    );
    expect(describeMergeConflictPath("Texto directo", project)).toBe("Texto directo");
  });
});
