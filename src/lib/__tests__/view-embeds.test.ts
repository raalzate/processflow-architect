import { describe, it, expect } from "vitest";
import {
  collectViewRefs,
  buildEmbedMap,
  wouldCreateCycle,
  type EmbedMap,
} from "@/lib/view-embeds";
import type { GraphData } from "@/lib/types";

function graph(refs: { big?: string[]; agg?: string[] }): GraphData {
  return {
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-01-01",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: (refs.big || []).map((r, i) => ({
        id: `b${i}`,
        nombre: `b${i}`,
        tipo_elemento: "Comando" as any,
        estado_comparativo: "nuevo",
        viewRef: r,
      })),
      aristas: [],
    },
    agregados: [
      {
        nombre_agregado: "A",
        entidad_raiz: "A",
        descripcion: "",
        nodos: (refs.agg || []).map((r, i) => ({
          id: `a${i}`,
          nombre: `a${i}`,
          tipo_elemento: "Comando" as any,
          estado_comparativo: "nuevo",
          viewRef: r,
        })),
        aristas: [],
      },
    ],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  };
}

describe("collectViewRefs", () => {
  it("returns empty for null/empty graph", () => {
    expect(collectViewRefs(null)).toEqual([]);
    expect(collectViewRefs(undefined)).toEqual([]);
  });

  it("collects viewRefs from big picture and aggregate nodes", () => {
    const g = graph({ big: ["v1"], agg: ["v2", "v3"] });
    expect(collectViewRefs(g).sort()).toEqual(["v1", "v2", "v3"]);
  });

  it("ignores nodes without viewRef", () => {
    const g = graph({ big: [], agg: [] });
    expect(collectViewRefs(g)).toEqual([]);
  });
});

describe("buildEmbedMap", () => {
  it("maps each view id to its set of direct embeds", () => {
    const m = buildEmbedMap([
      { id: "A", graph: graph({ big: ["B"] }) },
      { id: "B", graph: graph({ agg: ["C"] }) },
      { id: "C", graph: null },
    ]);
    expect(m.get("A")).toEqual(new Set(["B"]));
    expect(m.get("B")).toEqual(new Set(["C"]));
    expect(m.get("C")).toEqual(new Set());
  });
});

describe("wouldCreateCycle", () => {
  const embeds: EmbedMap = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["C"])],
    ["C", new Set<string>()],
  ]);

  it("detects a self-link as a cycle", () => {
    expect(wouldCreateCycle(embeds, "A", "A")).toBe(true);
  });

  it("detects a direct back-link (B already reaches A? no; A→B exists, link B→A closes it)", () => {
    // A → B exists. Linking B → A: is A reachable from A's target chain? from=B, to=A.
    // reachable(A) = {B, C}. Does it contain B? yes → cycle.
    expect(wouldCreateCycle(embeds, "B", "A")).toBe(true);
  });

  it("detects a transitive cycle (C → A closes A→B→C)", () => {
    expect(wouldCreateCycle(embeds, "C", "A")).toBe(true);
  });

  it("allows a safe forward link (A → C does not cycle)", () => {
    expect(wouldCreateCycle(embeds, "A", "C")).toBe(false);
  });

  it("allows linking to an unrelated view", () => {
    const m: EmbedMap = new Map([
      ["A", new Set<string>()],
      ["X", new Set<string>()],
    ]);
    expect(wouldCreateCycle(m, "A", "X")).toBe(false);
  });
});
