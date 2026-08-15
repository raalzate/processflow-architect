import { describe, it, expect } from "vitest";
import {
  isContainerType,
  canvasToGraphData,
  graphDataToCanvas,
  findIsolatedNodes,
  emptyGraphData,
  computeContentBounds,
  type DesignerNode,
  type DesignerLink,
} from "@/components/graph/designer/serialize";
import {
  CONTAINER_ELEMENT_TYPES,
  type GraphData,
  type Agregado,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Helpers para construir fixtures válidos a partir de los tipos exportados.
// -----------------------------------------------------------------------------

function makeNode(over: Partial<DesignerNode> & { id: string }): DesignerNode {
  return {
    nombre: over.nombre ?? over.id,
    tipo_elemento: "Comando",
    estado_comparativo: "nuevo",
    x: 0,
    y: 0,
    ...over,
  };
}

function makeLink(
  over: Partial<DesignerLink> & { id: string; sourceId: string; targetId: string }
): DesignerLink {
  return {
    descripcion: "",
    ...over,
  };
}

function nodesMap(...ns: DesignerNode[]): Map<string, DesignerNode> {
  return new Map(ns.map((n) => [n.id, n]));
}

function linksMap(...ls: DesignerLink[]): Map<string, DesignerLink> {
  return new Map(ls.map((l) => [l.id, l]));
}

const BASE = { nombre_proyecto: "Proj", fecha_analisis: "2026-01-01" };

// -----------------------------------------------------------------------------
// isContainerType
// -----------------------------------------------------------------------------

describe("isContainerType", () => {
  it("returns true for every declared container type", () => {
    for (const t of CONTAINER_ELEMENT_TYPES) {
      expect(isContainerType(t)).toBe(true);
    }
  });

  it("returns true specifically for Agregado, Contexto Delimitado, Subdominio", () => {
    expect(isContainerType("Agregado")).toBe(true);
    expect(isContainerType("Contexto Delimitado")).toBe(true);
    expect(isContainerType("Subdominio")).toBe(true);
  });

  it("returns false for non-container element types", () => {
    expect(isContainerType("Comando")).toBe(false);
    expect(isContainerType("Evento")).toBe(false);
    expect(isContainerType("Actor")).toBe(false);
    expect(isContainerType("Entidad")).toBe(false);
  });

  it("returns false for unknown / empty strings", () => {
    expect(isContainerType("")).toBe(false);
    expect(isContainerType("Nope")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// emptyGraphData
// -----------------------------------------------------------------------------

describe("emptyGraphData", () => {
  it("produces a minimal valid GraphData with the given metadata", () => {
    const g = emptyGraphData("MyProj", "2026-06-22");
    expect(g.nombre_proyecto).toBe("MyProj");
    expect(g.fecha_analisis).toBe("2026-06-22");
    expect(g.version).toBe("1.0.0");
  });

  it("initializes every collection empty", () => {
    const g = emptyGraphData("X", "Y");
    expect(g.big_picture).toEqual({
      descripcion: "",
      hotspots: [],
      nodos: [],
      aristas: [],
    });
    expect(g.agregados).toEqual([]);
    expect(g.read_models).toEqual([]);
    expect(g.politicas_inter_agregados).toEqual([]);
    expect(g.responsables).toEqual([]);
    expect(g.notas).toBe("");
    expect(g.transcript).toBe("");
  });

  it("returns a fresh object each call (no shared references)", () => {
    const a = emptyGraphData("a", "a");
    const b = emptyGraphData("b", "b");
    a.agregados.push({} as Agregado);
    expect(b.agregados).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// canvasToGraphData
// -----------------------------------------------------------------------------

describe("canvasToGraphData", () => {
  it("handles empty canvas", () => {
    const g = canvasToGraphData(new Map(), new Map(), BASE);
    expect(g.agregados).toEqual([]);
    expect(g.big_picture.nodos).toEqual([]);
    expect(g.big_picture.aristas).toEqual([]);
    expect(g.politicas_inter_agregados).toEqual([]);
  });

  it("uses base metadata and falls back to defaults", () => {
    const g = canvasToGraphData(new Map(), new Map(), BASE);
    expect(g.nombre_proyecto).toBe("Proj");
    expect(g.fecha_analisis).toBe("2026-01-01");
    expect(g.version).toBe("1.0.0"); // default
    expect(g.big_picture.descripcion).toBe("");
    expect(g.big_picture.hotspots).toEqual([]);
    expect(g.read_models).toEqual([]);
    expect(g.responsables).toEqual([]);
    expect(g.notas).toBe("");
    expect(g.transcript).toBe("");
  });

  it("preserves base metadata when provided", () => {
    const g = canvasToGraphData(new Map(), new Map(), {
      ...BASE,
      version: "2.5.0",
      big_picture: {
        descripcion: "desc",
        hotspots: ["h1"],
        nodos: [],
        aristas: [],
      },
      read_models: [
        {
          nombre: "rm",
          descripcion: "",
          proyecta: [],
          ui_policies: [],
          tecnologias: [],
        },
      ],
      responsables: ["alice"],
      notas: "n",
      transcript: "t",
    });
    expect(g.version).toBe("2.5.0");
    expect(g.big_picture.descripcion).toBe("desc");
    expect(g.big_picture.hotspots).toEqual(["h1"]);
    expect(g.read_models).toHaveLength(1);
    expect(g.responsables).toEqual(["alice"]);
    expect(g.notas).toBe("n");
    expect(g.transcript).toBe("t");
  });

  it("converts container nodes into agregados with geometry and tipo_contenedor", () => {
    const container = makeNode({
      id: "c1",
      nombre: "Pedidos",
      tipo_elemento: "Agregado",
      descripcion: "raiz-desc",
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
    const g = canvasToGraphData(nodesMap(container), new Map(), BASE);
    expect(g.agregados).toHaveLength(1);
    const agg = g.agregados[0];
    expect(agg.nombre_agregado).toBe("Pedidos");
    expect(agg.entidad_raiz).toBe("raiz-desc");
    expect(agg.descripcion).toBe("raiz-desc");
    expect(agg.x).toBe(10);
    expect(agg.y).toBe(20);
    expect(agg.width).toBe(300);
    expect(agg.height).toBe(200);
    expect(agg.tipo_contenedor).toBe("Agregado");
    expect(agg.nodos).toEqual([]);
    expect(agg.aristas).toEqual([]);
  });

  it("entidad_raiz falls back to the container name when descripcion is empty/whitespace", () => {
    const c1 = makeNode({
      id: "c1",
      nombre: "Sin Desc",
      tipo_elemento: "Agregado",
      descripcion: "   ",
    });
    const c2 = makeNode({
      id: "c2",
      nombre: "NoDesc",
      tipo_elemento: "Contexto Delimitado",
    });
    const g = canvasToGraphData(nodesMap(c1, c2), new Map(), BASE);
    const byName = new Map(g.agregados.map((a) => [a.nombre_agregado, a]));
    expect(byName.get("Sin Desc")!.entidad_raiz).toBe("Sin Desc");
    expect(byName.get("Sin Desc")!.descripcion).toBe("   "); // descripcion keeps raw value
    expect(byName.get("NoDesc")!.entidad_raiz).toBe("NoDesc");
    expect(byName.get("NoDesc")!.descripcion).toBe("");
  });

  it("maps each container element type to the right tipo_contenedor", () => {
    const ag = makeNode({ id: "a", nombre: "A", tipo_elemento: "Agregado" });
    const cd = makeNode({
      id: "b",
      nombre: "B",
      tipo_elemento: "Contexto Delimitado",
    });
    const sd = makeNode({ id: "c", nombre: "C", tipo_elemento: "Subdominio" });
    const g = canvasToGraphData(nodesMap(ag, cd, sd), new Map(), BASE);
    const byName = new Map(g.agregados.map((a) => [a.nombre_agregado, a]));
    expect(byName.get("A")!.tipo_contenedor).toBe("Agregado");
    expect(byName.get("B")!.tipo_contenedor).toBe("Contexto Delimitado");
    expect(byName.get("C")!.tipo_contenedor).toBe("Subdominio");
  });

  it("places domain nodes inside their parent agregado", () => {
    const container = makeNode({
      id: "c1",
      nombre: "Pedidos",
      tipo_elemento: "Agregado",
    });
    const dom = makeNode({
      id: "n1",
      nombre: "CrearPedido",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
      descripcion: "d",
      tags_tecnologia: ["ts"],
      x: 5,
      y: 6,
      width: 100,
      height: 40,
    });
    const g = canvasToGraphData(nodesMap(container, dom), new Map(), BASE);
    expect(g.big_picture.nodos).toEqual([]);
    expect(g.agregados[0].nodos).toHaveLength(1);
    const node = g.agregados[0].nodos[0];
    expect(node.id).toBe("n1");
    expect(node.nombre).toBe("CrearPedido");
    expect(node.tipo_elemento).toBe("Comando");
    expect(node.descripcion).toBe("d");
    expect(node.tags_tecnologia).toEqual(["ts"]);
    expect(node.x).toBe(5);
    expect(node.y).toBe(6);
    expect(node.width).toBe(100);
    expect(node.height).toBe(40);
    // toDomainNode strips `agregado`.
    expect("agregado" in node).toBe(false);
  });

  it("places domain nodes with no/empty agregado in the big picture", () => {
    const orphan = makeNode({
      id: "o1",
      nombre: "Orphan",
      tipo_elemento: "Evento",
    });
    const emptyAgg = makeNode({
      id: "o2",
      nombre: "EmptyAgg",
      tipo_elemento: "Evento",
      agregado: "",
    });
    const g = canvasToGraphData(nodesMap(orphan, emptyAgg), new Map(), BASE);
    expect(g.big_picture.nodos).toHaveLength(2);
    expect(g.agregados).toEqual([]);
  });

  it("places domain nodes whose agregado does not match any container in big picture", () => {
    const dom = makeNode({
      id: "n1",
      nombre: "Lost",
      tipo_elemento: "Comando",
      agregado: "Nonexistent",
    });
    const g = canvasToGraphData(nodesMap(dom), new Map(), BASE);
    expect(g.big_picture.nodos).toHaveLength(1);
    expect(g.agregados).toEqual([]);
  });

  it("defaults estado_comparativo to 'nuevo' and tags to null in domain nodes", () => {
    const dom = makeNode({
      id: "n1",
      nombre: "N",
      tipo_elemento: "Comando",
      // simulate falsy estado_comparativo
      estado_comparativo: "" as unknown as DesignerNode["estado_comparativo"],
    });
    const g = canvasToGraphData(nodesMap(dom), new Map(), BASE);
    const node = g.big_picture.nodos[0];
    expect(node.estado_comparativo).toBe("nuevo");
    expect(node.tags_tecnologia).toBeNull();
  });

  it("preserves viewRef (embedded sub-process) on a domain node round-trip", () => {
    const dom = makeNode({
      id: "n1",
      nombre: "Facturación",
      tipo_elemento: "Comando",
      viewRef: "view-abc",
    });
    const g = canvasToGraphData(nodesMap(dom), new Map(), BASE);
    expect((g.big_picture.nodos[0] as { viewRef?: string }).viewRef).toBe("view-abc");

    const { nodes } = graphDataToCanvas(g);
    expect(nodes.get("n1")?.viewRef).toBe("view-abc");
  });

  it("preserves link routing and arrow direction on round-trip", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const link = makeLink({
      id: "l1",
      sourceId: "a",
      targetId: "b",
      descripcion: "fluye",
      routing: "curved",
      arrow: "both",
    });
    const g = canvasToGraphData(nodesMap(a, b), linksMap(link), BASE);
    const arista = g.big_picture.aristas[0] as { routing?: string; arrow?: string };
    expect(arista.routing).toBe("curved");
    expect(arista.arrow).toBe("both");

    const { links } = graphDataToCanvas(g);
    const restored = Array.from(links.values())[0];
    expect(restored.routing).toBe("curved");
    expect(restored.arrow).toBe("both");
  });

  it("preserves link endpoint anchors on round-trip", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const link = makeLink({
      id: "l1",
      sourceId: "a",
      targetId: "b",
      descripcion: "x",
      sourceAnchor: { x: 1, y: 0.5 },
      targetAnchor: { x: 0, y: 0.25 },
    });
    const g = canvasToGraphData(nodesMap(a, b), linksMap(link), BASE);
    const { links } = graphDataToCanvas(g);
    const restored = Array.from(links.values())[0];
    expect(restored.sourceAnchor).toEqual({ x: 1, y: 0.5 });
    expect(restored.targetAnchor).toEqual({ x: 0, y: 0.25 });
  });

  it("preserves link waypoints (midpoints) on round-trip", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const link = makeLink({
      id: "l1",
      sourceId: "a",
      targetId: "b",
      descripcion: "x",
      routing: "orthogonal",
      midpoints: [
        { x: 100, y: 200 },
        { x: 100, y: 400 },
      ],
    });
    const g = canvasToGraphData(nodesMap(a, b), linksMap(link), BASE);
    const { links } = graphDataToCanvas(g);
    const restored = Array.from(links.values())[0];
    expect(restored.midpoints).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 400 },
    ]);
  });

  it("migrates a legacy single midpoint to midpoints[] on load", () => {
    const g = canvasToGraphData(
      nodesMap(
        makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" }),
        makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" })
      ),
      new Map(),
      BASE
    );
    // Simula un grafo viejo con `midpoint` en la arista del big picture.
    (g.big_picture.aristas as any).push({ fuente: "a", destino: "b", descripcion: "x", midpoint: { x: 5, y: 6 } });
    const { links } = graphDataToCanvas(g);
    const restored = Array.from(links.values())[0];
    expect(restored.midpoints).toEqual([{ x: 5, y: 6 }]);
  });

  it("classifies an intra-aggregate link as an internal arista", () => {
    const container = makeNode({
      id: "c1",
      nombre: "Pedidos",
      tipo_elemento: "Agregado",
    });
    const a = makeNode({
      id: "a",
      nombre: "A",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
    });
    const b = makeNode({
      id: "b",
      nombre: "B",
      tipo_elemento: "Evento",
      agregado: "Pedidos",
    });
    const link = makeLink({
      id: "l1",
      sourceId: "a",
      targetId: "b",
      descripcion: "emits",
    });
    const g = canvasToGraphData(
      nodesMap(container, a, b),
      linksMap(link),
      BASE
    );
    expect(g.agregados[0].aristas).toEqual([
      { fuente: "a", destino: "b", descripcion: "emits" },
    ]);
    expect(g.politicas_inter_agregados).toEqual([]);
    expect(g.big_picture.aristas).toEqual([]);
  });

  it("classifies a cross-aggregate link as an inter-aggregate policy", () => {
    const c1 = makeNode({ id: "c1", nombre: "Pedidos", tipo_elemento: "Agregado" });
    const c2 = makeNode({ id: "c2", nombre: "Pagos", tipo_elemento: "Agregado" });
    const a = makeNode({
      id: "a",
      nombre: "A",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
    });
    const b = makeNode({
      id: "b",
      nombre: "B",
      tipo_elemento: "Evento",
      agregado: "Pagos",
    });
    const link = makeLink({ id: "l1", sourceId: "a", targetId: "b" });
    const g = canvasToGraphData(nodesMap(c1, c2, a, b), linksMap(link), BASE);
    expect(g.politicas_inter_agregados).toEqual([
      { fuente: "a", destino: "b", descripcion: "" },
    ]);
    expect(g.agregados[0].aristas).toEqual([]);
    expect(g.agregados[1].aristas).toEqual([]);
    expect(g.big_picture.aristas).toEqual([]);
  });

  it("classifies a link touching the big picture as a big_picture arista", () => {
    const c1 = makeNode({ id: "c1", nombre: "Pedidos", tipo_elemento: "Agregado" });
    const inAgg = makeNode({
      id: "a",
      nombre: "A",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
    });
    const orphan = makeNode({ id: "o", nombre: "O", tipo_elemento: "Actor" });
    const link = makeLink({ id: "l1", sourceId: "o", targetId: "a" });
    const g = canvasToGraphData(nodesMap(c1, inAgg, orphan), linksMap(link), BASE);
    expect(g.big_picture.aristas).toEqual([
      { fuente: "o", destino: "a", descripcion: "" },
    ]);
    expect(g.politicas_inter_agregados).toEqual([]);
    expect(g.agregados[0].aristas).toEqual([]);
  });

  it("treats a link between two big-picture nodes as a big_picture arista", () => {
    const o1 = makeNode({ id: "o1", nombre: "O1", tipo_elemento: "Actor" });
    const o2 = makeNode({ id: "o2", nombre: "O2", tipo_elemento: "Evento" });
    const link = makeLink({ id: "l1", sourceId: "o1", targetId: "o2" });
    const g = canvasToGraphData(nodesMap(o1, o2), linksMap(link), BASE);
    expect(g.big_picture.aristas).toEqual([
      { fuente: "o1", destino: "o2", descripcion: "" },
    ]);
  });

  it("treats a link whose endpoint is a container itself as belonging to that aggregate", () => {
    // aggregateOf returns the container's own name for a container id.
    const c1 = makeNode({ id: "c1", nombre: "Pedidos", tipo_elemento: "Agregado" });
    const inAgg = makeNode({
      id: "a",
      nombre: "A",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
    });
    const link = makeLink({ id: "l1", sourceId: "c1", targetId: "a" });
    const g = canvasToGraphData(nodesMap(c1, inAgg), linksMap(link), BASE);
    // both endpoints resolve to "Pedidos" -> internal arista
    expect(g.agregados[0].aristas).toEqual([
      { fuente: "c1", destino: "a", descripcion: "" },
    ]);
  });

  it("skips links whose endpoints are not present in the nodes map", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const danglingSource = makeLink({ id: "l1", sourceId: "ghost", targetId: "a" });
    const danglingTarget = makeLink({ id: "l2", sourceId: "a", targetId: "ghost" });
    const g = canvasToGraphData(
      nodesMap(a),
      linksMap(danglingSource, danglingTarget),
      BASE
    );
    expect(g.big_picture.aristas).toEqual([]);
    expect(g.politicas_inter_agregados).toEqual([]);
  });

  it("defaults link descripcion to empty string when missing", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const link = makeLink({
      id: "l1",
      sourceId: "a",
      targetId: "b",
      descripcion: undefined as unknown as string,
    });
    const g = canvasToGraphData(nodesMap(a, b), linksMap(link), BASE);
    expect(g.big_picture.aristas[0].descripcion).toBe("");
  });
});

// -----------------------------------------------------------------------------
// graphDataToCanvas
// -----------------------------------------------------------------------------

describe("graphDataToCanvas", () => {
  it("returns empty maps for null/undefined content", () => {
    const fromNull = graphDataToCanvas(null);
    const fromUndef = graphDataToCanvas(undefined);
    expect(fromNull.nodes.size).toBe(0);
    expect(fromNull.links.size).toBe(0);
    expect(fromUndef.nodes.size).toBe(0);
    expect(fromUndef.links.size).toBe(0);
  });

  it("returns empty maps for an empty GraphData", () => {
    const { nodes, links } = graphDataToCanvas(emptyGraphData("p", "f"));
    expect(nodes.size).toBe(0);
    expect(links.size).toBe(0);
  });

  it("rebuilds a container node (agg-prefixed id) and preserves persisted geometry", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "Pedidos",
          entidad_raiz: "raiz",
          descripcion: "desc",
          nodos: [],
          aristas: [],
          x: 11,
          y: 22,
          width: 333,
          height: 244,
          tipo_contenedor: "Contexto Delimitado",
        },
      ],
    };
    const { nodes } = graphDataToCanvas(content);
    const container = nodes.get("agg-Pedidos")!;
    expect(container).toBeDefined();
    expect(container.id).toBe("agg-Pedidos");
    expect(container.nombre).toBe("Pedidos");
    expect(container.tipo_elemento).toBe("Contexto Delimitado");
    expect(container.descripcion).toBe("desc");
    expect(container.agregado).toBe("Pedidos");
    expect(container.estado_comparativo).toBe("nuevo");
    expect(container.x).toBe(11);
    expect(container.y).toBe(22);
    expect(container.width).toBe(333);
    expect(container.height).toBe(244);
  });

  it("falls back to entidad_raiz for container descripcion when descripcion empty", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "A",
          entidad_raiz: "RootEntity",
          descripcion: "",
          nodos: [],
          aristas: [],
        },
      ],
    };
    const { nodes } = graphDataToCanvas(content);
    expect(nodes.get("agg-A")!.descripcion).toBe("RootEntity");
    // missing tipo_contenedor -> default "Agregado"
    expect(nodes.get("agg-A")!.tipo_elemento).toBe("Agregado");
  });

  it("maps Subdominio tipo_contenedor back to a Subdominio container", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "S",
          entidad_raiz: "S",
          descripcion: "",
          nodos: [],
          aristas: [],
          tipo_contenedor: "Subdominio",
        },
      ],
    };
    const { nodes } = graphDataToCanvas(content);
    expect(nodes.get("agg-S")!.tipo_elemento).toBe("Subdominio");
  });

  it("assigns default layout geometry to agregados without x/y (two-column grid)", () => {
    const mkAgg = (name: string): Agregado => ({
      nombre_agregado: name,
      entidad_raiz: name,
      descripcion: "",
      nodos: [],
      aristas: [],
    });
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [mkAgg("A"), mkAgg("B"), mkAgg("C")],
    };
    const { nodes } = graphDataToCanvas(content);
    // col = cursor % 2, row = floor(cursor/2); AGG_W=500, AGG_H=400, gap 80
    expect(nodes.get("agg-A")!).toMatchObject({ x: 60, y: 60 }); // cursor 0
    expect(nodes.get("agg-B")!).toMatchObject({ x: 640, y: 60 }); // cursor 1: col1
    expect(nodes.get("agg-C")!).toMatchObject({ x: 60, y: 540 }); // cursor 2: row1
    // default width/height applied
    expect(nodes.get("agg-A")!.width).toBe(500);
    expect(nodes.get("agg-A")!.height).toBe(400);
  });

  it("rebuilds domain nodes inside an aggregate preserving persisted geometry and the agregado link", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "Pedidos",
          entidad_raiz: "Pedidos",
          descripcion: "",
          nodos: [
            {
              id: "n1",
              nombre: "CrearPedido",
              tipo_elemento: "Comando",
              descripcion: "d",
              estado_comparativo: "modificado",
              tags_tecnologia: ["ts"],
              x: 5,
              y: 6,
              width: 100,
              height: 40,
            },
          ],
          aristas: [],
          x: 0,
          y: 0,
        },
      ],
    };
    const { nodes } = graphDataToCanvas(content);
    const n = nodes.get("n1")!;
    expect(n).toBeDefined();
    expect(n.agregado).toBe("Pedidos");
    expect(n.tipo_elemento).toBe("Comando");
    expect(n.descripcion).toBe("d");
    expect(n.estado_comparativo).toBe("modificado");
    expect(n.tags_tecnologia).toEqual(["ts"]);
    expect(n.x).toBe(5);
    expect(n.y).toBe(6);
    expect(n.width).toBe(100);
    expect(n.height).toBe(40);
  });

  it("applies incremental layout to aggregate nodes lacking geometry", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "Pedidos",
          entidad_raiz: "Pedidos",
          descripcion: "",
          nodos: [
            {
              id: "n1",
              nombre: "A",
              tipo_elemento: "Comando",
              estado_comparativo: "nuevo",
            } as any,
          ],
          aristas: [],
          x: 100,
          y: 200,
          width: 500,
        },
      ],
    };
    const { nodes } = graphDataToCanvas(content);
    const n = nodes.get("n1")!;
    // perRow = max(1, floor((500-40)/(160+24))) = floor(460/184)=2; index 0
    // x = containerPos.x + 24 + 0 ; y = containerPos.y + 60 + 0
    expect(n.x).toBe(124);
    expect(n.y).toBe(260);
    expect(n.estado_comparativo).toBe("nuevo");
    expect(n.tags_tecnologia).toBeNull();
  });

  it("rebuilds big picture nodes (no agregado) with incremental layout when geometry missing", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [
          { id: "b1", nombre: "B1", tipo_elemento: "Actor", estado_comparativo: "nuevo" } as any,
        ],
        aristas: [],
      },
    };
    const { nodes } = graphDataToCanvas(content);
    const b = nodes.get("b1")!;
    expect(b.agregado).toBe("");
    // bigPicture branch: index 0 -> x = 60, y = 60
    expect(b.x).toBe(60);
    expect(b.y).toBe(60);
  });

  it("rebuilds links from internal aristas, big picture aristas and policies", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      agregados: [
        {
          nombre_agregado: "Pedidos",
          entidad_raiz: "Pedidos",
          descripcion: "",
          nodos: [],
          aristas: [{ fuente: "a", destino: "b", descripcion: "internal" } as any],
        },
      ],
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [],
        aristas: [{ fuente: "x", destino: "y", descripcion: "big" } as any],
      },
      politicas_inter_agregados: [
        { fuente: "p1", destino: "p2", descripcion: "policy" } as any,
      ],
    };
    const { links } = graphDataToCanvas(content);
    expect(links.size).toBe(3);
    const all = Array.from(links.values());
    expect(all).toContainEqual(
      expect.objectContaining({ sourceId: "a", targetId: "b", descripcion: "internal" })
    );
    expect(all).toContainEqual(
      expect.objectContaining({ sourceId: "x", targetId: "y", descripcion: "big" })
    );
    expect(all).toContainEqual(
      expect.objectContaining({ sourceId: "p1", targetId: "p2", descripcion: "policy" })
    );
    // generated ids follow the link-<fuente>-<destino>-<uuid> convention
    for (const l of all) {
      expect(l.id.startsWith(`link-${l.sourceId}-${l.targetId}-`)).toBe(true);
    }
  });

  it("defaults link descripcion to empty string when arista has none", () => {
    const content: GraphData = {
      ...emptyGraphData("p", "f"),
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [],
        aristas: [{ fuente: "a", destino: "b" } as any],
      },
    };
    const { links } = graphDataToCanvas(content);
    expect(Array.from(links.values())[0].descripcion).toBe("");
  });
});

// -----------------------------------------------------------------------------
// Round-trip canvas <-> graph
// -----------------------------------------------------------------------------

describe("round-trip canvas <-> graph", () => {
  it("preserves aggregate geometry, domain nodes and internal aristas through canvas->graph->canvas", () => {
    const container = makeNode({
      id: "agg-Pedidos",
      nombre: "Pedidos",
      tipo_elemento: "Agregado",
      descripcion: "raiz",
      x: 100,
      y: 200,
      width: 500,
      height: 400,
    });
    const dom1 = makeNode({
      id: "n1",
      nombre: "Crear",
      tipo_elemento: "Comando",
      agregado: "Pedidos",
      x: 10,
      y: 20,
    });
    const dom2 = makeNode({
      id: "n2",
      nombre: "Creado",
      tipo_elemento: "Evento",
      agregado: "Pedidos",
      x: 30,
      y: 40,
    });
    const link = makeLink({
      id: "l1",
      sourceId: "n1",
      targetId: "n2",
      descripcion: "emits",
    });

    const graph = canvasToGraphData(
      nodesMap(container, dom1, dom2),
      linksMap(link),
      BASE
    );
    const { nodes, links } = graphDataToCanvas(graph);

    // container reconstructed under stable id
    const c = nodes.get("agg-Pedidos")!;
    expect(c.tipo_elemento).toBe("Agregado");
    expect(c.x).toBe(100);
    expect(c.y).toBe(200);
    expect(c.width).toBe(500);
    expect(c.height).toBe(400);

    // domain nodes reconstructed with their aggregate + geometry
    expect(nodes.get("n1")!.agregado).toBe("Pedidos");
    expect(nodes.get("n1")!.x).toBe(10);
    expect(nodes.get("n1")!.y).toBe(20);
    expect(nodes.get("n2")!.agregado).toBe("Pedidos");

    // internal link reconstructed
    expect(links.size).toBe(1);
    const l = Array.from(links.values())[0];
    expect(l.sourceId).toBe("n1");
    expect(l.targetId).toBe("n2");
    expect(l.descripcion).toBe("emits");
  });

  it("preserves big-picture nodes and inter-aggregate policies through a round trip", () => {
    const c1 = makeNode({ id: "agg-A", nombre: "A", tipo_elemento: "Agregado", x: 0, y: 0 });
    const c2 = makeNode({ id: "agg-B", nombre: "B", tipo_elemento: "Agregado", x: 0, y: 0 });
    const na = makeNode({ id: "na", nombre: "Na", tipo_elemento: "Comando", agregado: "A", x: 1, y: 1 });
    const nb = makeNode({ id: "nb", nombre: "Nb", tipo_elemento: "Evento", agregado: "B", x: 2, y: 2 });
    const orphan = makeNode({ id: "orp", nombre: "Orp", tipo_elemento: "Actor", x: 3, y: 3 });
    const policy = makeLink({ id: "pl", sourceId: "na", targetId: "nb", descripcion: "pol" });

    const graph = canvasToGraphData(
      nodesMap(c1, c2, na, nb, orphan),
      linksMap(policy),
      BASE
    );
    expect(graph.politicas_inter_agregados).toHaveLength(1);
    expect(graph.big_picture.nodos.map((n) => n.id)).toContain("orp");

    const { nodes, links } = graphDataToCanvas(graph);
    expect(nodes.get("orp")!.agregado).toBe("");
    expect(links.size).toBe(1);
    const l = Array.from(links.values())[0];
    expect(l.sourceId).toBe("na");
    expect(l.targetId).toBe("nb");
  });
});

// -----------------------------------------------------------------------------
// findIsolatedNodes
// -----------------------------------------------------------------------------

describe("findIsolatedNodes", () => {
  it("returns empty array when there are no nodes", () => {
    expect(findIsolatedNodes(new Map(), new Map())).toEqual([]);
  });

  it("returns all non-container nodes when there are no links", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    expect(findIsolatedNodes(nodesMap(a, b), new Map())).toEqual(["A", "B"]);
  });

  it("ignores container nodes even when isolated", () => {
    const container = makeNode({
      id: "c",
      nombre: "Cont",
      tipo_elemento: "Agregado",
    });
    const dom = makeNode({ id: "d", nombre: "Dom", tipo_elemento: "Comando" });
    expect(findIsolatedNodes(nodesMap(container, dom), new Map())).toEqual([
      "Dom",
    ]);
  });

  it("excludes nodes that participate in a link (as source or target)", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const c = makeNode({ id: "c", nombre: "C", tipo_elemento: "Actor" });
    const link = makeLink({ id: "l", sourceId: "a", targetId: "b" });
    expect(findIsolatedNodes(nodesMap(a, b, c), linksMap(link))).toEqual(["C"]);
  });

  it("returns node names (not ids)", () => {
    const a = makeNode({ id: "node-1", nombre: "Friendly Name", tipo_elemento: "Comando" });
    expect(findIsolatedNodes(nodesMap(a), new Map())).toEqual(["Friendly Name"]);
  });

  it("returns empty when every non-container node is connected", () => {
    const a = makeNode({ id: "a", nombre: "A", tipo_elemento: "Comando" });
    const b = makeNode({ id: "b", nombre: "B", tipo_elemento: "Evento" });
    const link = makeLink({ id: "l", sourceId: "a", targetId: "b" });
    expect(findIsolatedNodes(nodesMap(a, b), linksMap(link))).toEqual([]);
  });
});

describe("computeContentBounds", () => {
  it("devuelve null si no hay nodos", () => {
    expect(computeContentBounds(new Map())).toBeNull();
  });

  it("usa el tamaño por defecto de nodo simple cuando falta width/height", () => {
    // Comando (no contenedor) sin geometría → 160x60 por defecto.
    const a = makeNode({ id: "a", x: 100, y: 200 });
    const b = computeContentBounds(nodesMap(a))!;
    expect(b.minX).toBe(100);
    expect(b.minY).toBe(200);
    expect(b.maxX).toBe(260); // 100 + 160
    expect(b.maxY).toBe(260); // 200 + 60
    expect(b.width).toBe(160);
    expect(b.height).toBe(60);
  });

  it("envuelve varios nodos y respeta width/height explícitos", () => {
    const a = makeNode({ id: "a", x: 0, y: 0, width: 100, height: 100 });
    const c = makeNode({ id: "c", x: 400, y: 300, width: 200, height: 50 });
    const b = computeContentBounds(nodesMap(a, c))!;
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(600); // 400 + 200
    expect(b.maxY).toBe(350); // 300 + 50
  });
});

describe("notación en el round-trip", () => {
  it("canvasToGraphData conserva la notación del documento", () => {
    // Sin esto, el primer autoguardado del lienzo borraba `notation` y la vista
    // volvía a DDD aunque el proyecto se hubiera creado en BPMN.
    const out = canvasToGraphData(new Map(), new Map(), {
      nombre_proyecto: "P",
      fecha_analisis: "2026-08-05",
      notation: "bpmn",
    });
    expect(out.notation).toBe("bpmn");
  });

  it("emptyGraphData sella la notación con la que nace el proyecto", () => {
    expect(emptyGraphData("P", "2026-08-05", "c4").notation).toBe("c4");
    expect(emptyGraphData("P", "2026-08-05").notation).toBeUndefined();
  });
});
