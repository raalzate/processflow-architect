import { describe, it, expect } from "vitest";
import {
  collectMergeNodes,
  collectMergeNodesMulti,
  mergeNodesInGraph,
  mergeNodesAcrossGraphs,
  deleteNodeFromGraph,
  deleteNodeAcrossGraphs,
  updateNodeInGraph,
  updateNodeAcrossGraphs,
  cleanupDuplicateEdges,
  updateEdgesForMerge,
  BIG_PICTURE_GROUP,
  type NamedGraph,
} from "@/lib/graph-merge";

const node = (id: string, extra: any = {}) => ({
  id,
  nombre: id,
  tipo_elemento: "Comando",
  descripcion: "",
  estado_comparativo: "nuevo",
  ...extra,
});

/** Grafo mínimo con nodos en agregados y/o big_picture. */
function makeGraph(opts: {
  agg?: { nombre: string; nodos: any[]; aristas?: any[] }[];
  bp?: any[];
  bpAristas?: any[];
  politicas?: any[];
} = {}): any {
  return {
    nombre_proyecto: "t",
    agregados: opts.agg?.map((a) => ({
      nombre_agregado: a.nombre,
      entidad_raiz: "",
      descripcion: "",
      nodos: a.nodos,
      aristas: a.aristas ?? [],
    })),
    big_picture: opts.bp ? { descripcion: "", hotspots: [], nodos: opts.bp, aristas: opts.bpAristas ?? [] } : undefined,
    politicas_inter_agregados: opts.politicas,
  };
}

describe("cleanupDuplicateEdges / updateEdgesForMerge — bordes", () => {
  it("undefined edges → [] y no-op", () => {
    expect(cleanupDuplicateEdges(undefined)).toEqual([]);
    expect(updateEdgesForMerge(undefined, "p", new Set())).toBeUndefined();
  });
  it("descarta self-loops y duplicados por clave", () => {
    const edges = [
      { fuente: "a", destino: "a", descripcion: "self" },
      { fuente: "a", destino: "b", descripcion: "x" },
      { fuente: "a", destino: "b", descripcion: "x" },
    ] as any;
    expect(cleanupDuplicateEdges(edges)).toHaveLength(1);
  });
});

describe("collectMergeNodes — fallbacks", () => {
  it("agregados/nodos ausentes y big_picture ausente", () => {
    expect(collectMergeNodes(makeGraph({}) as any).size).toBe(0);
  });
  it("nodo del big_picture ya presente en agregado no se duplica", () => {
    const g = makeGraph({
      agg: [{ nombre: "A", nodos: [node("n1")] }],
      bp: [node("n1"), node("n2")],
    });
    const m = collectMergeNodes(g as any);
    expect(m.size).toBe(2);
    expect(m.get("n1")!.agregado).toBe("A"); // gana el del agregado
    expect(m.get("n2")!.agregado).toBe(BIG_PICTURE_GROUP);
  });
});

describe("mergeNodesInGraph", () => {
  it("lanza si el principal no existe", () => {
    expect(() => mergeNodesInGraph(makeGraph({ bp: [node("x")] }) as any, "nope", [])).toThrow(
      /nodo principal/
    );
  });

  it("hereda descripciones/tags, renombra y re-apunta aristas", () => {
    const g = makeGraph({
      agg: [
        {
          nombre: "A",
          nodos: [
            node("p", { descripcion: "d1", tags_tecnologia: ["ts"] }),
            node("s", { descripcion: "d2", tags_tecnologia: ["go"] }),
          ],
          aristas: [{ fuente: "s", destino: "p", descripcion: "e" }],
        },
      ],
      bp: [node("q")],
      bpAristas: [{ fuente: "q", destino: "s", descripcion: "" }],
      politicas: [{ fuente: "s", destino: "q", descripcion: "" }],
    });
    const out = mergeNodesInGraph(g as any, "p", ["s"], "  Fusionado  ");
    const p = out.agregados![0].nodos.find((n: any) => n.id === "p")!;
    expect(p.nombre).toBe("Fusionado");
    expect(p.descripcion).toContain("d1");
    expect(p.descripcion).toContain("d2");
    expect(p.tags_tecnologia).toEqual(["go", "ts"]);
    // "s" eliminado, aristas re-apuntadas a "p" (y self-loop s→p→ p→p descartado).
    expect(out.agregados![0].nodos.find((n: any) => n.id === "s")).toBeUndefined();
  });

  it("sin tags conserva el valor previo (null) y newName vacío no renombra", () => {
    const g = makeGraph({ agg: [{ nombre: "A", nodos: [node("p"), node("s")] }] });
    const out = mergeNodesInGraph(g as any, "p", ["s"], "   ");
    const p = out.agregados![0].nodos.find((n: any) => n.id === "p")!;
    expect(p.nombre).toBe("p"); // no renombrado
    expect(p.tags_tecnologia ?? null).toBeNull();
  });
});

describe("deleteNodeFromGraph / updateNodeInGraph", () => {
  it("borra de big_picture y agregados y limpia aristas", () => {
    const g = makeGraph({
      agg: [{ nombre: "A", nodos: [node("a")], aristas: [{ fuente: "a", destino: "b", descripcion: "" }] }],
      bp: [node("b")],
    });
    const out = deleteNodeFromGraph(g as any, "b");
    expect(out.big_picture!.nodos).toHaveLength(0);
    expect(out.agregados![0].aristas).toHaveLength(0);
  });

  it("deleteNodeFromGraph tolera big_picture ausente", () => {
    const g = makeGraph({ agg: [{ nombre: "A", nodos: [node("a")] }] });
    expect(() => deleteNodeFromGraph(g as any, "a")).not.toThrow();
  });

  it("updateNodeInGraph aplica patch o devuelve null", () => {
    const g = makeGraph({ bp: [node("a")] });
    expect(updateNodeInGraph(g as any, "a", { nombre: "Z" })!.big_picture!.nodos[0].nombre).toBe("Z");
    expect(updateNodeInGraph(g as any, "no", { nombre: "Z" })).toBeNull();
  });
});

describe("operaciones multi-grafo", () => {
  const graphs = (): NamedGraph[] => [
    { key: "design", label: "Modelo", graph: makeGraph({ agg: [{ nombre: "A", nodos: [node("p"), node("s")] }] }) as any },
    { key: "v1", label: "Vista", graph: makeGraph({ bp: [node("s"), node("z")] }) as any },
  ];

  it("collectMergeNodesMulti prefija por grafo y respeta prioridad", () => {
    const m = collectMergeNodesMulti(graphs());
    expect(m.get("p")!.agregado).toBe("Modelo · A");
    expect(m.get("s")!.agregado).toBe("Modelo · A"); // primera aparición gana
    expect(m.get("z")!.agregado).toBe("Vista · Big Picture");
  });

  it("mergeNodesAcrossGraphs fusiona donde está el principal y borra el resto", () => {
    const out = mergeNodesAcrossGraphs(graphs(), "p", ["s"]);
    // En el Modelo se fusionó (s desaparece); en la Vista se borró s.
    expect(out[0].graph.agregados![0].nodos.find((n: any) => n.id === "s")).toBeUndefined();
    expect(out[1].graph.big_picture!.nodos.find((n: any) => n.id === "s")).toBeUndefined();
    expect(out[1].graph.big_picture!.nodos.find((n: any) => n.id === "z")).toBeDefined();
  });

  it("mergeNodesAcrossGraphs deja intacto el grafo sin cambios", () => {
    // Principal en Modelo, secundario inexistente en la Vista → Vista sin tocar.
    const gs = graphs();
    const out = mergeNodesAcrossGraphs(gs, "p", ["noexiste"]);
    expect(out[1]).toBe(gs[1]); // misma referencia (no clonó)
  });

  it("mergeNodesAcrossGraphs lanza si el principal no existe en ninguno", () => {
    expect(() => mergeNodesAcrossGraphs(graphs(), "fantasma", ["s"])).toThrow(/nodo principal/);
  });

  it("deleteNodeAcrossGraphs borra solo donde aparece", () => {
    const gs = graphs();
    const out = deleteNodeAcrossGraphs(gs, "z");
    expect(out[0]).toBe(gs[0]); // Modelo no tenía z → intacto
    expect(out[1].graph.big_picture!.nodos.find((n: any) => n.id === "z")).toBeUndefined();
  });

  it("updateNodeAcrossGraphs actualiza donde exista o null si en ninguno", () => {
    const ok = updateNodeAcrossGraphs(graphs(), "s", { nombre: "SS" });
    expect(ok).not.toBeNull();
    expect(updateNodeAcrossGraphs(graphs(), "nada", { nombre: "X" })).toBeNull();
  });
});
