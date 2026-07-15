import { describe, it, expect } from "vitest";
import {
  updateEdgesForMerge,
  cleanupDuplicateEdges,
} from "@/app/merger/components/helpers";
import type { GraphLink } from "@/lib/types";

// The module's internal Edge type is Omit<GraphLink, "source" | "target" | "tipo">.
// Valid fields we can build from: fuente, destino, descripcion, estado_comparativo.
type Edge = Omit<GraphLink, "source" | "target" | "tipo">;

const makeEdge = (
  fuente: string,
  destino: string,
  descripcion?: string
): Edge => {
  const e: Edge = { fuente, destino };
  if (descripcion !== undefined) e.descripcion = descripcion;
  return e;
};

describe("updateEdgesForMerge", () => {
  it("returns undefined and does nothing when edges is undefined", () => {
    expect(updateEdgesForMerge(undefined, "primary", new Set(["a"]))).toBeUndefined();
  });

  it("handles an empty edges array without error", () => {
    const edges: Edge[] = [];
    expect(() => updateEdgesForMerge(edges, "primary", new Set(["a"]))).not.toThrow();
    expect(edges).toEqual([]);
  });

  it("rewrites fuente when it matches a secondary id", () => {
    const edges = [makeEdge("sec1", "x")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1"]));
    expect(edges[0].fuente).toBe("primary");
    expect(edges[0].destino).toBe("x");
  });

  it("rewrites destino when it matches a secondary id", () => {
    const edges = [makeEdge("x", "sec1")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1"]));
    expect(edges[0].fuente).toBe("x");
    expect(edges[0].destino).toBe("primary");
  });

  it("rewrites both fuente and destino when both match secondary ids", () => {
    const edges = [makeEdge("sec1", "sec2")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1", "sec2"]));
    expect(edges[0].fuente).toBe("primary");
    expect(edges[0].destino).toBe("primary");
  });

  it("leaves edges untouched when no endpoint matches", () => {
    const edges = [makeEdge("a", "b")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1"]));
    expect(edges[0].fuente).toBe("a");
    expect(edges[0].destino).toBe("b");
  });

  it("mutates the array in place across multiple edges", () => {
    const edges = [
      makeEdge("sec1", "node2"),
      makeEdge("node3", "sec2"),
      makeEdge("node4", "node5"),
    ];
    updateEdgesForMerge(edges, "P", new Set(["sec1", "sec2"]));
    expect(edges[0]).toMatchObject({ fuente: "P", destino: "node2" });
    expect(edges[1]).toMatchObject({ fuente: "node3", destino: "P" });
    expect(edges[2]).toMatchObject({ fuente: "node4", destino: "node5" });
  });

  it("does nothing when secondaryIds is empty", () => {
    const edges = [makeEdge("a", "b")];
    updateEdgesForMerge(edges, "primary", new Set());
    expect(edges[0]).toMatchObject({ fuente: "a", destino: "b" });
  });

  it("can collapse an edge into a self-loop when both ends are secondaries pointing to same primary", () => {
    const edges = [makeEdge("sec1", "sec2")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1", "sec2"]));
    // both become primary -> self loop (cleanup would remove later)
    expect(edges[0].fuente).toBe(edges[0].destino);
  });

  it("preserves unrelated fields like descripcion", () => {
    const edges = [makeEdge("sec1", "x", "calls")];
    updateEdgesForMerge(edges, "primary", new Set(["sec1"]));
    expect(edges[0].descripcion).toBe("calls");
  });
});

describe("cleanupDuplicateEdges", () => {
  it("returns an empty array when edges is undefined", () => {
    expect(cleanupDuplicateEdges(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty input array", () => {
    expect(cleanupDuplicateEdges([])).toEqual([]);
  });

  it("keeps a single unique edge", () => {
    const result = cleanupDuplicateEdges([makeEdge("a", "b")]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fuente: "a", destino: "b" });
  });

  it("removes self-loops (fuente === destino)", () => {
    const result = cleanupDuplicateEdges([makeEdge("a", "a")]);
    expect(result).toEqual([]);
  });

  it("removes exact duplicate edges keeping the first occurrence", () => {
    const first = makeEdge("a", "b", "calls");
    const second = makeEdge("a", "b", "calls");
    const result = cleanupDuplicateEdges([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
  });

  it("treats edges with different descripcion as distinct", () => {
    const result = cleanupDuplicateEdges([
      makeEdge("a", "b", "calls"),
      makeEdge("a", "b", "notifies"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("treats missing descripcion and empty-string descripcion as the same key", () => {
    const withUndefined = makeEdge("a", "b");
    const withEmpty = makeEdge("a", "b", "");
    const result = cleanupDuplicateEdges([withUndefined, withEmpty]);
    // key uses (descripcion || "") so both collapse to "a-b-"
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(withUndefined);
  });

  it("distinguishes edges by direction (a->b differs from b->a)", () => {
    const result = cleanupDuplicateEdges([
      makeEdge("a", "b"),
      makeEdge("b", "a"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("preserves insertion order of unique edges", () => {
    const result = cleanupDuplicateEdges([
      makeEdge("a", "b"),
      makeEdge("c", "d"),
      makeEdge("e", "f"),
    ]);
    expect(result.map((e) => `${e.fuente}-${e.destino}`)).toEqual([
      "a-b",
      "c-d",
      "e-f",
    ]);
  });

  it("handles a mix of duplicates, self-loops, and unique edges", () => {
    const edges = [
      makeEdge("a", "b", "x"),
      makeEdge("a", "b", "x"), // dup
      makeEdge("c", "c"), // self-loop
      makeEdge("a", "c"),
      makeEdge("a", "b", "y"), // distinct desc
    ];
    const result = cleanupDuplicateEdges(edges);
    expect(result).toHaveLength(3);
    const keys = result.map((e) => `${e.fuente}-${e.destino}-${e.descripcion || ""}`);
    expect(keys).toEqual(["a-b-x", "a-c-", "a-b-y"]);
  });

  it("does not mutate the input array", () => {
    const edges = [makeEdge("a", "b"), makeEdge("a", "b")];
    const snapshotLength = edges.length;
    cleanupDuplicateEdges(edges);
    expect(edges).toHaveLength(snapshotLength);
  });

  it("returns a new array distinct from the input", () => {
    const edges = [makeEdge("a", "b")];
    const result = cleanupDuplicateEdges(edges);
    expect(result).not.toBe(edges);
  });
});

describe("integration: merge then cleanup", () => {
  it("merging secondaries can create self-loops/dups that cleanup removes", () => {
    const edges = [
      makeEdge("sec1", "sec2"), // becomes primary->primary (self loop)
      makeEdge("sec1", "node"), // becomes primary->node
      makeEdge("primary", "node"), // duplicate of above after merge
    ];
    updateEdgesForMerge(edges, "primary", new Set(["sec1", "sec2"]));
    const cleaned = cleanupDuplicateEdges(edges);
    // self loop removed, the two primary->node collapse to one
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toMatchObject({ fuente: "primary", destino: "node" });
  });
});
