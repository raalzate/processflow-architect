import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  removeNode,
  validate,
  layout,
  toGraphData,
  fromGraphData,
  slugify,
} from "../diagram-builder";
import { processGraphData } from "../../graph-processor";

const base = { nombre_proyecto: "Ventas", notation: "ddd" as const };

describe("slugify", () => {
  it("normaliza acentos, mayúsculas y símbolos", () => {
    expect(slugify("Crear Pedido")).toBe("crear-pedido");
    expect(slugify("Política de Envío")).toBe("politica-de-envio");
    expect(slugify("   ")).toBe("nodo");
  });
});

describe("construcción", () => {
  it("autogenera ids únicos a partir del nombre", () => {
    let m = emptyDiagram(base);
    const a = addNode(m, { nombre: "Pago", tipo_elemento: "Comando" });
    m = a.model;
    const b = addNode(m, { nombre: "Pago", tipo_elemento: "Evento" });
    expect(a.id).toBe("pago");
    expect(b.id).toBe("pago-2");
  });

  it("rechaza usar un contenedor como nodo y viceversa", () => {
    const m = emptyDiagram(base);
    expect(() => addNode(m, { nombre: "X", tipo_elemento: "Agregado" })).toThrow();
    expect(() => addContainer(m, { nombre: "X", tipo_elemento: "Comando" })).toThrow();
  });

  it("rechaza un nodo en un contenedor inexistente", () => {
    const m = emptyDiagram(base);
    expect(() =>
      addNode(m, { nombre: "Cmd", tipo_elemento: "Comando", container: "NoExiste" })
    ).toThrow(/no existe/);
  });

  it("rechaza aristas con extremos inexistentes e ids duplicados", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { id: "a", nombre: "A", tipo_elemento: "Comando" }).model;
    expect(() => addEdge(m, { fuente: "a", destino: "zzz" })).toThrow();
    expect(() => addNode(m, { id: "a", nombre: "otro", tipo_elemento: "Evento" })).toThrow(/id/);
  });

  it("removeNode borra un contenedor y libera a sus hijos y aristas", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Agg", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "c", nombre: "C", tipo_elemento: "Comando", container: "Agg" });
    m = a.model;
    const b = addNode(m, { id: "e", nombre: "E", tipo_elemento: "Evento", container: "Agg" });
    m = b.model;
    m = addEdge(m, { fuente: "c", destino: "e" });
    m = removeNode(m, "c");
    expect(m.nodes.find((n) => n.id === "c")).toBeUndefined();
    expect(m.edges.length).toBe(0); // la arista que tocaba c desapareció
    m = removeNode(m, m.nodes.find((n) => n.nombre === "Agg")!.id);
    expect(m.nodes.find((n) => n.id === "e")!.container).toBe("");
  });
});

describe("validate", () => {
  it("avisa (warning) de nodos aislados que el lienzo descartaría", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { nombre: "Suelto", tipo_elemento: "Comando" }).model;
    const r = validate(m);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("Suelto"))).toBe(true);
  });

  it("avisa de tipos ajenos a la notación", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "t", nombre: "Tarea BPMN", tipo_elemento: "Tarea" }).model;
    const r = validate(m);
    expect(r.warnings.some((w) => w.includes("Tarea"))).toBe(true);
  });
});

describe("toGraphData", () => {
  it("clasifica aristas en internas / políticas / big picture", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "A", tipo_elemento: "Agregado" }).model;
    m = addContainer(m, { nombre: "B", tipo_elemento: "Agregado" }).model;
    const c1 = addNode(m, { id: "a1", nombre: "A1", tipo_elemento: "Comando", container: "A" });
    m = c1.model;
    const e1 = addNode(m, { id: "a2", nombre: "A2", tipo_elemento: "Evento", container: "A" });
    m = e1.model;
    const c2 = addNode(m, { id: "b1", nombre: "B1", tipo_elemento: "Comando", container: "B" });
    m = c2.model;
    const free = addNode(m, { id: "f1", nombre: "F1", tipo_elemento: "Actor" });
    m = free.model;
    m = addEdge(m, { fuente: "a1", destino: "a2" }); // interna A
    m = addEdge(m, { fuente: "a2", destino: "b1" }); // política A→B
    m = addEdge(m, { fuente: "f1", destino: "a1" }); // big picture (extremo suelto)

    const g = toGraphData(m);
    const aggA = g.agregados.find((a) => a.nombre_agregado === "A")!;
    expect(aggA.aristas.length).toBe(1);
    expect(g.politicas_inter_agregados!.length).toBe(1);
    expect(g.big_picture.aristas.length).toBe(1);
    expect(aggA.tipo_contenedor).toBe("Agregado");
  });

  it("asigna geometría y produce un GraphData que el procesador del grafo acepta", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Pedidos", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "cmd", nombre: "Crear", tipo_elemento: "Comando", container: "Pedidos" });
    m = a.model;
    const b = addNode(m, { id: "evt", nombre: "Creado", tipo_elemento: "Evento", container: "Pedidos" });
    m = b.model;
    m = addEdge(m, { fuente: "cmd", destino: "evt" });

    const g = toGraphData(m);
    const agg = g.agregados[0];
    expect(typeof agg.x).toBe("number");
    expect(agg.nodos.every((n) => typeof n.x === "number" && typeof n.y === "number")).toBe(true);

    // El procesador del grafo de la app debe cargar ambos nodos (conectados).
    const processed = processGraphData(g);
    expect(processed.nodes.map((n) => n.id).sort()).toEqual(["cmd", "evt"]);
  });

  it("layout respeta coordenadas ya presentes", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { id: "x", nombre: "X", tipo_elemento: "Actor", x: 123, y: 456 }).model;
    const laid = layout(m);
    const n = laid.nodes.find((n) => n.id === "x")!;
    expect(n.x).toBe(123);
    expect(n.y).toBe(456);
  });

});

describe("fromGraphData (round-trip)", () => {
  it("reconstruye un modelo editable desde un GraphData exportado", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Pedidos", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "cmd", nombre: "Crear", tipo_elemento: "Comando", container: "Pedidos" });
    m = a.model;
    const b = addNode(m, { id: "evt", nombre: "Creado", tipo_elemento: "Evento", container: "Pedidos" });
    m = b.model;
    m = addEdge(m, { fuente: "cmd", destino: "evt" });

    const g = toGraphData(m);
    const back = fromGraphData(g, "ddd");
    // El contenedor + 2 nodos vuelven; la arista interna se recupera.
    expect(back.nodes.filter((n) => n.tipo_elemento === "Comando").length).toBe(1);
    expect(back.edges.length).toBe(1);
    const cmd = back.nodes.find((n) => n.id === "cmd")!;
    expect(cmd.container).toBe("Pedidos");
  });

  it("preserva el estilo de arista (dashed/arrow) al re-importar por el builder", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { id: "A", nombre: "A", tipo_elemento: "Agregado" }).model;
    m = addContainer(m, { id: "B", nombre: "B", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "a1", nombre: "A1", tipo_elemento: "Comando", container: "A" });
    m = a.model;
    const b = addNode(m, { id: "b1", nombre: "B1", tipo_elemento: "Evento", container: "B" });
    m = b.model;
    // Arista entre contenedores distintos → política inter-agregados, con estilo.
    m = addEdge(m, { fuente: "a1", destino: "b1", descripcion: "resp", dashed: true, arrow: "both" });

    const back = fromGraphData(toGraphData(m), "ddd");
    const arista = back.edges.find((e) => e.descripcion === "resp")!;
    expect(arista.dashed).toBe(true);
    expect(arista.arrow).toBe("both");
  });
});
