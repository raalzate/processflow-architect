import { describe, it, expect } from "vitest";
import { processGraphData } from "@/lib/graph-processor";
import type { GraphData, GraphNode, GraphLink, Agregado } from "@/lib/types";

// ---- Fixture helpers ---------------------------------------------------

function makeNode(
  overrides: Partial<Omit<GraphNode, "agregado">> & { id: string; nombre: string }
): Omit<GraphNode, "agregado"> {
  return {
    tipo_elemento: "Comando",
    estado_comparativo: "nuevo",
    ...overrides,
  };
}

function makeLink(
  fuente: string,
  destino: string,
  overrides: Partial<Omit<GraphLink, "tipo" | "source" | "target">> = {}
): Omit<GraphLink, "tipo" | "source" | "target"> {
  return {
    fuente,
    destino,
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<Agregado> = {}): Agregado {
  return {
    nombre_agregado: "AgregadoA",
    entidad_raiz: "raiz",
    descripcion: "",
    nodos: [],
    aristas: [],
    ...overrides,
  };
}

function makeGraphData(overrides: Partial<GraphData> = {}): GraphData {
  return {
    nombre_proyecto: "p",
    version: "1",
    fecha_analisis: "2024-01-01",
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    responsables: [],
    notas: "",
    transcript: "",
    ...overrides,
  };
}

// ---- Tests -------------------------------------------------------------

describe("processGraphData", () => {
  describe("input validation", () => {
    it("throws when jsonData is null", () => {
      expect(() => processGraphData(null as unknown as GraphData)).toThrow(
        "El archivo JSON está vacío o es inválido."
      );
    });

    it("throws when jsonData is undefined", () => {
      expect(() => processGraphData(undefined as unknown as GraphData)).toThrow(
        "El archivo JSON está vacío o es inválido."
      );
    });

    it("returns empty results when 'agregados' property is missing", () => {
      // Non-throwing safety net: a missing 'agregados' is coerced to [] so the
      // canvas degrades gracefully instead of erroring.
      const data = makeGraphData();
      delete (data as Partial<GraphData>).agregados;
      const result = processGraphData(data);
      expect(result.nodes).toEqual([]);
      expect(result.aggregates).toEqual([]);
    });

    it("returns empty results when 'agregados' is an empty string (falsy)", () => {
      const data = makeGraphData({ agregados: "" as unknown as Agregado[] });
      const result = processGraphData(data);
      expect(result.nodes).toEqual([]);
      expect(result.aggregates).toEqual([]);
    });
  });

  describe("empty / minimal inputs", () => {
    it("returns empty results for empty agregados array", () => {
      const result = processGraphData(makeGraphData({ agregados: [] }));
      expect(result.nodes).toEqual([]);
      expect(result.links).toEqual([]);
      expect(result.aggregates).toEqual([]);
      expect(result.nodeTree).toEqual({});
    });

    it("includes disconnected nodes via the never-blank safety net", () => {
      // When the connected-only filter would leave the canvas empty, the
      // safety net falls back to including ALL nodes so the graph never
      // renders blank.
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nodos: [makeNode({ id: "n1", nombre: "Lonely" })],
            aristas: [],
          }),
        ],
      });
      const result = processGraphData(data);
      expect(result.nodes.map((n) => n.id)).toEqual(["n1"]);
      expect(result.aggregates).toEqual(["AgregadoA"]);
    });
  });

  describe("happy path: single aggregate with internal link", () => {
    it("includes only connected nodes and builds internal links", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "Pedidos",
            descripcion: "ctx",
            nodos: [
              makeNode({ id: "a", nombre: "Crear", tipo_elemento: "Comando" }),
              makeNode({ id: "b", nombre: "Creado", tipo_elemento: "Evento" }),
              makeNode({ id: "orphan", nombre: "Orphan" }),
            ],
            aristas: [makeLink("a", "b", { descripcion: "produce" })],
          }),
        ],
      });
      const result = processGraphData(data);

      // orphan excluded
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);

      // aggregate name includes description suffix
      expect(result.nodes.every((n) => n.agregado === "Pedidos - ctx")).toBe(
        true
      );

      // link mapped with source/target/tipo
      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toMatchObject({
        fuente: "a",
        destino: "b",
        source: "a",
        target: "b",
        tipo: "interno",
        descripcion: "produce",
      });

      expect(result.aggregates).toEqual(["Pedidos - ctx"]);
    });

    it("aggregate name has no suffix when descripcion is empty", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "Solo",
            descripcion: "",
            nodos: [
              makeNode({ id: "a", nombre: "X" }),
              makeNode({ id: "b", nombre: "Y" }),
            ],
            aristas: [makeLink("a", "b")],
          }),
        ],
      });
      const result = processGraphData(data);
      expect(result.aggregates).toEqual(["Solo"]);
      expect(result.nodes[0].agregado).toBe("Solo");
    });
  });

  describe("nodeTree structure", () => {
    it("groups nodes by aggregate then by tipo_elemento and sorts by nombre", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "Agg",
            descripcion: "",
            nodos: [
              makeNode({ id: "c1", nombre: "Zeta", tipo_elemento: "Comando" }),
              makeNode({ id: "c2", nombre: "Alpha", tipo_elemento: "Comando" }),
              makeNode({ id: "e1", nombre: "Mid", tipo_elemento: "Evento" }),
            ],
            aristas: [makeLink("c1", "e1"), makeLink("c2", "e1")],
          }),
        ],
      });
      const result = processGraphData(data);
      const grupo = result.nodeTree["Agg"];
      // El nombre y la descripción del contenedor son CAMPOS del grupo: el panel
      // ya no parte la clave por " - " (un nombre con guiones perdía su descripción).
      expect(grupo.nombre).toBe("Agg");
      expect(grupo.descripcion).toBe("");
      const tree = grupo.tipos;
      expect(Object.keys(tree).sort()).toEqual(["Comando", "Evento"]);
      // Comandos sorted alphabetically by nombre
      expect(tree["Comando"].map((n) => n.nombre)).toEqual(["Alpha", "Zeta"]);
      expect(tree["Evento"].map((n) => n.nombre)).toEqual(["Mid"]);
    });

    it("sortedNodeTree keys follow the sorted aggregates order", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "Zebra",
            descripcion: "",
            nodos: [
              makeNode({ id: "z1", nombre: "n" }),
              makeNode({ id: "z2", nombre: "m" }),
            ],
            aristas: [makeLink("z1", "z2")],
          }),
          makeAggregate({
            nombre_agregado: "Apple",
            descripcion: "",
            nodos: [
              makeNode({ id: "a1", nombre: "n" }),
              makeNode({ id: "a2", nombre: "m" }),
            ],
            aristas: [makeLink("a1", "a2")],
          }),
        ],
      });
      const result = processGraphData(data);
      expect(Object.keys(result.nodeTree)).toEqual(["Apple", "Zebra"]);
      expect(result.aggregates).toEqual(["Apple", "Zebra"]);
    });
  });

  describe("inter-aggregate policy links", () => {
    it("adds policy links with tipo 'politica' and keeps their endpoints connected", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [makeNode({ id: "evt", nombre: "Event" })],
            aristas: [],
          }),
          makeAggregate({
            nombre_agregado: "B",
            descripcion: "",
            nodos: [makeNode({ id: "cmd", nombre: "Command" })],
            aristas: [],
          }),
        ],
        politicas_inter_agregados: [
          makeLink("evt", "cmd", { descripcion: "dispara" }),
        ],
      });
      const result = processGraphData(data);

      // Both nodes are connected via the policy link, so both included.
      expect(result.nodes.map((n) => n.id).sort()).toEqual(["cmd", "evt"]);

      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toMatchObject({
        source: "evt",
        target: "cmd",
        tipo: "politica",
        descripcion: "dispara",
      });
      expect(result.aggregates).toEqual(["A", "B"]);
    });

    it("handles internal and policy links together", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [
              makeNode({ id: "a1", nombre: "x" }),
              makeNode({ id: "a2", nombre: "y" }),
            ],
            aristas: [makeLink("a1", "a2")],
          }),
          makeAggregate({
            nombre_agregado: "B",
            descripcion: "",
            nodos: [makeNode({ id: "b1", nombre: "z" })],
            aristas: [],
          }),
        ],
        politicas_inter_agregados: [makeLink("a2", "b1")],
      });
      const result = processGraphData(data);
      expect(result.links).toHaveLength(2);
      const internal = result.links.find((l) => l.tipo === "interno");
      const policy = result.links.find((l) => l.tipo === "politica");
      expect(internal).toMatchObject({ source: "a1", target: "a2" });
      expect(policy).toMatchObject({ source: "a2", target: "b1" });
    });
  });

  describe("edge cases and branching", () => {
    it("deduplicates nodes that share the same id across aggregates (first wins)", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "First",
            descripcion: "",
            nodos: [
              makeNode({ id: "shared", nombre: "FromFirst" }),
              makeNode({ id: "other", nombre: "Other" }),
            ],
            aristas: [makeLink("shared", "other")],
          }),
          makeAggregate({
            nombre_agregado: "Second",
            descripcion: "",
            nodos: [makeNode({ id: "shared", nombre: "FromSecond" })],
            aristas: [],
          }),
        ],
      });
      const result = processGraphData(data);
      const shared = result.nodes.filter((n) => n.id === "shared");
      expect(shared).toHaveLength(1);
      // First aggregate wins.
      expect(shared[0].nombre).toBe("FromFirst");
      expect(shared[0].agregado).toBe("First");
    });

    it("handles aggregate with undefined nodos array", () => {
      const agg = makeAggregate({
        nombre_agregado: "NoNodes",
        descripcion: "",
        aristas: [makeLink("x", "y")],
      });
      delete (agg as Partial<Agregado>).nodos;
      const data = makeGraphData({ agregados: [agg] });
      const result = processGraphData(data);
      expect(result.nodes).toEqual([]);
      // Link still produced even though endpoints have no node entries.
      expect(result.links).toHaveLength(1);
    });

    it("handles aggregate with undefined aristas array", () => {
      const agg = makeAggregate({
        nombre_agregado: "NoEdges",
        descripcion: "",
        nodos: [makeNode({ id: "n1", nombre: "n" })],
      });
      delete (agg as Partial<Agregado>).aristas;
      const data = makeGraphData({
        agregados: [agg],
        politicas_inter_agregados: [makeLink("n1", "n1")],
      });
      const result = processGraphData(data);
      expect(result.nodes.map((n) => n.id)).toEqual(["n1"]);
      expect(result.links).toHaveLength(1);
      expect(result.links[0].tipo).toBe("politica");
    });

    it("works when politicas_inter_agregados is absent", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [
              makeNode({ id: "a", nombre: "x" }),
              makeNode({ id: "b", nombre: "y" }),
            ],
            aristas: [makeLink("a", "b")],
          }),
        ],
      });
      // ensure no policies key
      expect(data.politicas_inter_agregados).toBeUndefined();
      const result = processGraphData(data);
      expect(result.links).toHaveLength(1);
      expect(result.links.every((l) => l.tipo === "interno")).toBe(true);
    });

    it("preserves original node fields and adds agregado", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [
              makeNode({
                id: "a",
                nombre: "x",
                descripcion: "desc",
                tags_tecnologia: ["Java"],
                estado_comparativo: "modificado",
              }),
              makeNode({ id: "b", nombre: "y" }),
            ],
            aristas: [makeLink("a", "b")],
          }),
        ],
      });
      const result = processGraphData(data);
      const a = result.nodes.find((n) => n.id === "a")!;
      expect(a).toMatchObject({
        id: "a",
        nombre: "x",
        descripcion: "desc",
        tags_tecnologia: ["Java"],
        estado_comparativo: "modificado",
        agregado: "A",
      });
    });

    it("includes a node connected only to itself (self link)", () => {
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [makeNode({ id: "self", nombre: "S" })],
            aristas: [makeLink("self", "self")],
          }),
        ],
      });
      const result = processGraphData(data);
      expect(result.nodes.map((n) => n.id)).toEqual(["self"]);
      expect(result.links[0]).toMatchObject({ source: "self", target: "self" });
    });

    it("includes a node referenced by a link even if it has no node definition", () => {
      // 'ghost' appears only as a link endpoint, no nodos entry -> not in nodes.
      const data = makeGraphData({
        agregados: [
          makeAggregate({
            nombre_agregado: "A",
            descripcion: "",
            nodos: [makeNode({ id: "real", nombre: "R" })],
            aristas: [makeLink("real", "ghost")],
          }),
        ],
      });
      const result = processGraphData(data);
      // only 'real' has a node entry; 'ghost' is connected but undefined.
      expect(result.nodes.map((n) => n.id)).toEqual(["real"]);
      expect(result.links).toHaveLength(1);
    });
  });
});
