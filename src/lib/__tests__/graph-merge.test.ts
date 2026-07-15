import { describe, it, expect } from "vitest";
import {
  collectMergeNodes,
  mergeNodesInGraph,
  deleteNodeFromGraph,
  updateNodeInGraph,
  collectMergeNodesMulti,
  mergeNodesAcrossGraphs,
  deleteNodeAcrossGraphs,
  updateNodeAcrossGraphs,
  BIG_PICTURE_GROUP,
  type NamedGraph,
} from "../graph-merge";
import type { GraphData } from "../types";

/** Grafo de prueba: 1 agregado con 2 actores duplicados + 1 actor suelto en big_picture. */
function makeGraph(): GraphData {
  return {
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-07-02",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [
        { id: "bp-actor", nombre: "cliente", tipo_elemento: "Actor", estado_comparativo: "nuevo", descripcion: "suelto", tags_tecnologia: ["web"] } as any,
      ],
      aristas: [
        { fuente: "bp-actor", destino: "a1", descripcion: "usa" } as any,
      ],
    },
    agregados: [
      {
        nombre_agregado: "Ventas",
        entidad_raiz: "Venta",
        descripcion: "",
        nodos: [
          { id: "a1", nombre: "Cliente", tipo_elemento: "Actor", estado_comparativo: "nuevo", descripcion: "principal", tags_tecnologia: ["crm"] } as any,
          { id: "a2", nombre: "Usuario Cliente", tipo_elemento: "Actor", estado_comparativo: "nuevo", descripcion: "duplicado" } as any,
          { id: "c1", nombre: "Comprar", tipo_elemento: "Comando", estado_comparativo: "nuevo" } as any,
        ],
        aristas: [
          { fuente: "a2", destino: "c1", descripcion: "ejecuta" } as any,
          { fuente: "a1", destino: "c1", descripcion: "ejecuta" } as any,
        ],
      },
    ],
    read_models: [],
    politicas_inter_agregados: [
      { fuente: "a2", destino: "bp-actor", descripcion: "es" } as any,
    ],
    responsables: [],
    notas: "",
    transcript: "",
  };
}

describe("collectMergeNodes", () => {
  it("incluye nodos de agregados Y del big_picture", () => {
    const map = collectMergeNodes(makeGraph());
    expect(map.size).toBe(4); // a1, a2, c1, bp-actor
    expect(map.get("a1")?.agregado).toBe("Ventas");
    expect(map.get("bp-actor")?.agregado).toBe(BIG_PICTURE_GROUP);
  });
});

describe("mergeNodesInGraph", () => {
  it("fusiona un nodo del big_picture en uno de agregado, re-apunta TODAS las aristas", () => {
    const g = mergeNodesInGraph(makeGraph(), "a1", ["a2", "bp-actor"], "Cliente Final");

    // Nodos fusionados eliminados de ambos lugares.
    expect(g.agregados[0].nodos.find((n) => n.id === "a2")).toBeUndefined();
    expect(g.big_picture.nodos.length).toBe(0);

    // Principal renombrado, descripciones combinadas, tags unidos.
    const primary = g.agregados[0].nodos.find((n) => n.id === "a1")!;
    expect(primary.nombre).toBe("Cliente Final");
    expect(primary.descripcion).toContain("principal");
    expect(primary.descripcion).toContain("duplicado");
    expect(primary.descripcion).toContain("suelto");
    expect(primary.tags_tecnologia).toEqual(["crm", "web"]);

    // a2→c1 y a1→c1 misma descripción → deduplicadas en una.
    const aristasAgg = g.agregados[0].aristas;
    expect(aristasAgg.filter((e) => e.fuente === "a1" && e.destino === "c1").length).toBe(1);

    // big_picture: bp-actor→a1 se volvió self-loop a1→a1 → eliminada.
    expect(g.big_picture.aristas.length).toBe(0);

    // política a2→bp-actor se volvió a1→a1 (ambos extremos fusionados) → eliminada.
    expect(g.politicas_inter_agregados!.length).toBe(0);
  });

  it("no muta el grafo original y lanza si el principal no existe", () => {
    const original = makeGraph();
    mergeNodesInGraph(original, "a1", ["a2"]);
    expect(original.agregados[0].nodos.length).toBe(3); // intacto
    expect(() => mergeNodesInGraph(original, "zzz", ["a2"])).toThrow(/principal/);
  });
});

describe("deleteNodeFromGraph", () => {
  it("borra un nodo del big_picture con sus aristas en las tres listas", () => {
    const g = deleteNodeFromGraph(makeGraph(), "bp-actor");
    expect(g.big_picture.nodos.length).toBe(0);
    expect(g.big_picture.aristas.length).toBe(0); // bp-actor→a1 fuera
    expect(g.politicas_inter_agregados!.length).toBe(0); // a2→bp-actor fuera
    expect(g.agregados[0].nodos.length).toBe(3); // el resto intacto
  });
});

/** Segundo grafo (una "vista custom") que también contiene el duplicado a2. */
function makeViewGraph(): GraphData {
  const g = makeGraph();
  g.nombre_proyecto = "Vista Pagos";
  g.agregados = [];
  g.big_picture.nodos = [
    { id: "a2", nombre: "Usuario Cliente", tipo_elemento: "Actor", estado_comparativo: "nuevo", descripcion: "en vista" } as any,
    { id: "v1", nombre: "Pagar", tipo_elemento: "Comando", estado_comparativo: "nuevo" } as any,
  ];
  g.big_picture.aristas = [{ fuente: "a2", destino: "v1", descripcion: "ejecuta" } as any];
  g.politicas_inter_agregados = [];
  return g;
}

function makeNamed(): NamedGraph[] {
  return [
    { key: "design", label: "Modelo", graph: makeGraph() },
    { key: "v-pagos", label: "Vista Pagos", graph: makeViewGraph() },
  ];
}

describe("multi-grafo (Modelo + vistas custom)", () => {
  it("collectMergeNodesMulti une nodos de todos los grafos, prefijando el origen", () => {
    const map = collectMergeNodesMulti(makeNamed());
    // a1,a2,c1,bp-actor del Modelo + v1 de la vista (a2 repetido gana el del Modelo).
    expect(map.size).toBe(5);
    expect(map.get("a1")?.agregado).toBe("Modelo · Ventas");
    expect(map.get("v1")?.agregado).toBe(`Vista Pagos · ${BIG_PICTURE_GROUP}`);
  });

  it("mergeNodesAcrossGraphs fusiona donde está el principal y elimina el duplicado en las demás vistas", () => {
    const [modelo, vista] = mergeNodesAcrossGraphs(makeNamed(), "a1", ["a2"]);
    // Modelo: fusión completa.
    expect(modelo.graph.agregados[0].nodos.find((n) => n.id === "a2")).toBeUndefined();
    expect(modelo.graph.agregados[0].nodos.find((n) => n.id === "a1")?.descripcion).toContain("duplicado");
    // Vista sin el principal: el duplicado y sus aristas desaparecen (sin aristas rotas).
    expect(vista.graph.big_picture.nodos.map((n) => n.id)).toEqual(["v1"]);
    expect(vista.graph.big_picture.aristas.length).toBe(0);
  });

  it("mergeNodesAcrossGraphs lanza si el principal no existe en ningún grafo", () => {
    expect(() => mergeNodesAcrossGraphs(makeNamed(), "zzz", ["a2"])).toThrow(/principal/);
  });

  it("deleteNodeAcrossGraphs borra en todos los grafos donde aparece", () => {
    const [modelo, vista] = deleteNodeAcrossGraphs(makeNamed(), "a2");
    expect(modelo.graph.agregados[0].nodos.find((n) => n.id === "a2")).toBeUndefined();
    expect(vista.graph.big_picture.nodos.find((n) => n.id === "a2")).toBeUndefined();
  });

  it("updateNodeAcrossGraphs actualiza en todos y devuelve null si no existe", () => {
    const updated = updateNodeAcrossGraphs(makeNamed(), "a2", { nombre: "Cliente" })!;
    expect(updated[0].graph.agregados[0].nodos.find((n) => n.id === "a2")!.nombre).toBe("Cliente");
    expect(updated[1].graph.big_picture.nodos.find((n) => n.id === "a2")!.nombre).toBe("Cliente");
    expect(updateNodeAcrossGraphs(makeNamed(), "zzz", { nombre: "X" })).toBeNull();
  });
});

describe("updateNodeInGraph", () => {
  it("actualiza un nodo esté en agregado o en big_picture", () => {
    const g1 = updateNodeInGraph(makeGraph(), "a1", { nombre: "Nuevo" })!;
    expect(g1.agregados[0].nodos.find((n) => n.id === "a1")!.nombre).toBe("Nuevo");

    const g2 = updateNodeInGraph(makeGraph(), "bp-actor", { descripcion: "editado" })!;
    expect(g2.big_picture.nodos.find((n) => n.id === "bp-actor")!.descripcion).toBe("editado");
  });

  it("devuelve null si el nodo no existe", () => {
    expect(updateNodeInGraph(makeGraph(), "zzz", { nombre: "X" })).toBeNull();
  });
});
