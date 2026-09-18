import { describe, it, expect } from "vitest";
import {
  collectViewRefs,
  buildEmbedMap,
  wouldCreateCycle,
  buildParentMap,
  childrenOf,
  originsOf,
  rootViewIds,
  rootAncestorOf,
  pathToView,
  openTabIds,
  viewAfterClosing,
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

// --- Jerarquía de la tira de pestañas (issue #349) ---------------------------

/** Vista mínima con un grafo cuyos nodos embeben `refs`. */
function view(id: string, refs: string[] = [], builtin = false) {
  return { id, graph: refs.length ? graph({ big: refs }) : null, builtin };
}

describe("buildParentMap", () => {
  it("maps each child to the views that embed it", () => {
    const p = buildParentMap([view("A", ["B"]), view("B"), view("C", ["B"])]);
    expect(p.get("B")).toEqual(new Set(["A", "C"]));
    expect(p.get("A")).toBeUndefined();
  });

  it("ignores dangling viewRefs (target view no longer exists)", () => {
    const p = buildParentMap([view("A", ["ghost"])]);
    expect(p.size).toBe(0);
  });

  it("ignores a self reference", () => {
    const p = buildParentMap([view("A", ["A"])]);
    expect(p.size).toBe(0);
  });
});

describe("childrenOf", () => {
  it("returns direct children in views order", () => {
    const views = [view("A", ["C", "B"]), view("B"), view("C")];
    expect(childrenOf(views, "A")).toEqual(["B", "C"]);
  });

  it("returns empty for a leaf or unknown view", () => {
    expect(childrenOf([view("A")], "A")).toEqual([]);
    expect(childrenOf([view("A")], "zz")).toEqual([]);
  });
});

describe("originsOf", () => {
  it("reports the parent view and the node that embeds it", () => {
    const views = [view("A", ["B"]), view("B")];
    expect(originsOf(views, "B")).toEqual([
      { parentViewId: "A", nodeId: "b0", nodeName: "b0", viewRef: "B" },
    ]);
  });
});

describe("rootViewIds", () => {
  it("hides an embedded view from the strip (criterio 1)", () => {
    expect(rootViewIds([view("A", ["B"]), view("B")])).toEqual(["A"]);
  });

  it("hides a view embedded from two parents, both keep it as child (criterio 4)", () => {
    const views = [view("A", ["C"]), view("B", ["C"]), view("C")];
    expect(rootViewIds(views)).toEqual(["A", "B"]);
    expect(childrenOf(views, "A")).toEqual(["C"]);
    expect(childrenOf(views, "B")).toEqual(["C"]);
  });

  it("brings the view back as root when the viewRef disappears (criterio 5)", () => {
    expect(rootViewIds([view("A"), view("B")])).toEqual(["A", "B"]);
  });

  it("never leaves the strip empty on a cycle A↔B (criterio 6)", () => {
    const roots = rootViewIds([view("A", ["B"]), view("B", ["A"])]);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots).toEqual(["A"]);
  });

  it("keeps every view reachable: a cycle next to a root is promoted", () => {
    const views = [view("R"), view("A", ["B"]), view("B", ["A"])];
    expect(rootViewIds(views)).toEqual(["R", "A"]);
  });

  it("never hides a builtin view (criterio 7)", () => {
    const views = [view("A", ["design"]), { ...view("design"), builtin: true }];
    expect(rootViewIds(views)).toEqual(["A", "design"]);
  });

  it("keeps the views order", () => {
    const views = [view("A"), view("B"), view("C")];
    expect(rootViewIds(views)).toEqual(["A", "B", "C"]);
  });
});

describe("rootAncestorOf", () => {
  it("returns the view itself when it is a root", () => {
    expect(rootAncestorOf([view("A", ["B"]), view("B")], "A")).toBe("A");
  });

  it("returns the root ancestor of a nested view (criterio 2 y 3)", () => {
    const views = [view("A", ["B"]), view("B", ["C"]), view("C")];
    expect(rootAncestorOf(views, "C")).toBe("A");
  });

  it("returns null for an unknown view", () => {
    expect(rootAncestorOf([view("A")], "zz")).toBeNull();
  });

  it("does not hang on a cycle", () => {
    const views = [view("R"), view("A", ["B"]), view("B", ["A"])];
    expect(rootAncestorOf(views, "B")).toBe("A");
  });
});

describe("pathToView", () => {
  it("returns just the view when it is a root", () => {
    expect(pathToView([view("A", ["B"]), view("B")], "A")).toEqual(["A"]);
  });

  it("returns the full drill path of a nested view (breadcrumb A › B › C)", () => {
    const views = [view("A", ["B"]), view("B", ["C"]), view("C")];
    expect(pathToView(views, "C")).toEqual(["A", "B", "C"]);
  });

  it("prefers the first root in views order when two parents embed it", () => {
    const views = [view("A", ["C"]), view("B", ["C"]), view("C")];
    expect(pathToView(views, "C")).toEqual(["A", "C"]);
  });

  it("returns empty for an unknown view", () => {
    expect(pathToView([view("A")], "zz")).toEqual([]);
  });

  it("does not hang on a cycle", () => {
    const views = [view("R"), view("A", ["B"]), view("B", ["A"])];
    expect(pathToView(views, "B")).toEqual(["A", "B"]);
  });
});

describe("originsOf (más orígenes)", () => {
  it("reports one origin per parent view", () => {
    const views = [view("A", ["C"]), view("B", ["C"]), view("C")];
    expect(originsOf(views, "C").map((o) => o.parentViewId)).toEqual(["A", "B"]);
  });

  it("finds the embedding node inside an aggregate", () => {
    const views = [{ id: "A", graph: graph({ agg: ["B"] }) }, view("B")];
    expect(originsOf(views, "B")).toEqual([
      { parentViewId: "A", nodeId: "a0", nodeName: "a0", viewRef: "B" },
    ]);
  });

  it("returns empty when nothing embeds the view", () => {
    expect(originsOf([view("A"), view("B")], "B")).toEqual([]);
  });
});

// --- Pestañas virtuales (issue #351) ----------------------------------------

describe("openTabIds", () => {
  it("keeps an embedded view that the user opened", () => {
    expect(openTabIds([view("A", ["B"]), view("B")], ["B"])).toEqual(["B"]);
  });

  it("drops a view that is a root again (criterio 6)", () => {
    expect(openTabIds([view("A"), view("B")], ["B"])).toEqual([]);
  });

  it("drops a view that no longer exists (criterio 6)", () => {
    expect(openTabIds([view("A", ["B"]), view("B")], ["B", "ghost"])).toEqual(["B"]);
  });

  it("drops duplicates and keeps the open order", () => {
    const views = [view("A", ["B", "C"]), view("B"), view("C")];
    expect(openTabIds(views, ["C", "B", "C"])).toEqual(["C", "B"]);
  });

  it("returns empty when nothing is open", () => {
    expect(openTabIds([view("A", ["B"]), view("B")], [])).toEqual([]);
  });
});

describe("viewAfterClosing", () => {
  it("falls back to the parent the subprocess hangs from (criterio 4)", () => {
    expect(viewAfterClosing([view("A", ["B"]), view("B")], ["B"], "B")).toBe("A");
  });

  it("falls back to another open tab when there is no parent", () => {
    const views = [view("A", ["B"]), view("B"), view("C")];
    expect(viewAfterClosing(views, ["C", "B"], "C")).toBe("B");
  });

  it("falls back to the first root when the view has no parent", () => {
    const views = [view("R"), view("S")];
    expect(viewAfterClosing(views, [], "S")).toBe("R");
  });

  it("prefers the parent over a root, even inside a cycle", () => {
    const views = [view("R"), view("A", ["B"]), view("B", ["A"])];
    expect(viewAfterClosing(views, [], "B")).toBe("A");
  });

  it("never returns the view being closed", () => {
    const views = [view("A", ["B"]), view("B")];
    expect(viewAfterClosing(views, ["B"], "B")).not.toBe("B");
  });

  it("returns null when there is no view left", () => {
    expect(viewAfterClosing([], [], "B")).toBeNull();
  });
});
