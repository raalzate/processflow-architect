import { describe, it, expect } from "vitest";
import { collectGraphNodes } from "../view-nodes";
import { collectViewRefs, buildEmbedMap, wouldCreateCycle } from "../view-embeds";

describe("collectGraphNodes — fallbacks de estructura", () => {
  it("tolera big_picture ausente y agregados sin nodos", () => {
    const g: any = { agregados: [{ nombre_agregado: "A" /* sin nodos */ }] };
    expect(collectGraphNodes(g)).toEqual([]);
  });
});

describe("collectViewRefs", () => {
  it("null/undefined → []", () => {
    expect(collectViewRefs(null)).toEqual([]);
    expect(collectViewRefs(undefined)).toEqual([]);
  });

  it("recolecta viewRef de big_picture y agregados, ignora nodos sin ref", () => {
    const g: any = {
      big_picture: { nodos: [{ viewRef: "v1" }, { nombre: "sin ref" }] },
      agregados: [{ nodos: [{ viewRef: "v2" }] }, { /* sin nodos */ }],
    };
    expect(collectViewRefs(g).sort()).toEqual(["v1", "v2"]);
  });

  it("grafo sin arrays → []", () => {
    expect(collectViewRefs({} as any)).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  const views = [
    { id: "A", graph: { big_picture: { nodos: [{ viewRef: "B" }] } } as any },
    { id: "B", graph: { big_picture: { nodos: [{ viewRef: "C" }] } } as any },
    { id: "C", graph: null },
  ];
  const embeds = buildEmbedMap(views);

  it("auto-enlace es ciclo", () => {
    expect(wouldCreateCycle(embeds, "A", "A")).toBe(true);
  });

  it("cierra un lazo alcanzable (C → A, con A→B→C)", () => {
    // Enlazar C→A: A ya alcanza a C (A→B→C), así que cerraría el lazo.
    expect(wouldCreateCycle(embeds, "C", "A")).toBe(true);
  });

  it("enlace seguro no crea ciclo", () => {
    // A→B ya existe; B no alcanza a A, así que reforzarlo no cierra lazo.
    expect(wouldCreateCycle(embeds, "A", "B")).toBe(false);
  });

  it("tolera nodos repetidos en el recorrido (rama ya vista)", () => {
    // D y E se embeben mutuamente en el mapa → fuerza el branch `seen.has(cur)`.
    const m = new Map<string, Set<string>>([
      ["D", new Set(["E"])],
      ["E", new Set(["D"])],
    ]);
    expect(wouldCreateCycle(m, "X", "D")).toBe(false);
  });
});
