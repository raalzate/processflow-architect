import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addContainer,
  addNode,
  validate,
  fromGraphData,
  toGraphData,
  type DiagramModel,
} from "../diagram-builder";

const meta = { nombre_proyecto: "P", notation: "ddd" as const };

describe("uniqueId — colisiones múltiples", () => {
  it("sufija -2, -3… ante nombres repetidos", () => {
    let m = emptyDiagram(meta);
    const a = addNode(m, { nombre: "Pago", tipo_elemento: "Comando" });
    m = a.model;
    const b = addNode(m, { nombre: "Pago", tipo_elemento: "Evento" });
    m = b.model;
    const c = addNode(m, { nombre: "Pago", tipo_elemento: "Vista" });
    expect([a.id, b.id, c.id]).toEqual(["pago", "pago-2", "pago-3"]);
  });
});

describe("addContainer — id explícito duplicado", () => {
  it("lanza si el id ya existe", () => {
    let m = emptyDiagram(meta);
    m = addContainer(m, { id: "A", nombre: "A", tipo_elemento: "Agregado" }).model;
    expect(() => addContainer(m, { id: "A", nombre: "Otro", tipo_elemento: "Agregado" })).toThrow(/id/);
  });
});

describe("validate — errores sobre modelo construido a mano", () => {
  it("detecta id duplicado, contenedor inexistente y aristas colgantes", () => {
    const model: DiagramModel = {
      meta,
      nodes: [
        { id: "dup", nombre: "N1", tipo_elemento: "Comando" },
        { id: "dup", nombre: "N2", tipo_elemento: "Evento" }, // id duplicado
        { id: "hijo", nombre: "Hijo", tipo_elemento: "Comando", container: "NoExiste" },
      ],
      edges: [{ fuente: "dup", destino: "fantasma" }], // destino inexistente
    };
    const r = validate(model);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Id duplicado/.test(e))).toBe(true);
    expect(r.errors.some((e) => /contenedor inexistente/.test(e))).toBe(true);
    expect(r.errors.some((e) => /destino inexistente/.test(e))).toBe(true);
  });

  it("avisa cuando el diagrama no tiene nodos", () => {
    const r = validate(emptyDiagram(meta));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /no tiene nodos/.test(w))).toBe(true);
  });
});

describe("fromGraphData — fallbacks", () => {
  it("usa 'Agregado' cuando tipo_contenedor falta o no es contenedor, y tolera arrays ausentes", () => {
    const data: any = {
      nombre_proyecto: "P",
      version: "1",
      agregados: [
        { nombre_agregado: "SinTipo", descripcion: "d", nodos: [], aristas: [] },
        { nombre_agregado: "TipoRaro", tipo_contenedor: "Comando", nodos: [], aristas: [] },
      ],
      // big_picture y politicas ausentes → deben tolerarse.
    };
    const model = fromGraphData(data);
    const sinTipo = model.nodes.find((n) => n.nombre === "SinTipo")!;
    const raro = model.nodes.find((n) => n.nombre === "TipoRaro")!;
    expect(sinTipo.tipo_elemento).toBe("Agregado");
    expect(raro.tipo_elemento).toBe("Agregado"); // "Comando" no es contenedor → fallback
  });

  it("reconstruye aristas del big_picture y de políticas inter-agregados", () => {
    const data: any = {
      nombre_proyecto: "P",
      version: "1",
      agregados: [],
      big_picture: {
        descripcion: "bp",
        nodos: [{ id: "x", nombre: "X", tipo_elemento: "Actor" }],
        aristas: [{ fuente: "x", destino: "y", descripcion: "bp-edge" }],
      },
      politicas_inter_agregados: [{ fuente: "a", destino: "b", descripcion: "pol", dashed: true }],
    };
    const model = fromGraphData(data);
    expect(model.edges).toHaveLength(2);
    expect(model.edges.some((e) => e.descripcion === "bp-edge")).toBe(true);
    expect(model.edges.some((e) => e.dashed === true)).toBe(true);
  });
});

describe("toGraphData — arista entre contenedor y nodo suelto", () => {
  it("clasifica como big picture cuando un extremo no tiene contenedor", () => {
    let m = emptyDiagram(meta);
    m = addContainer(m, { id: "A", nombre: "A", tipo_elemento: "Agregado" }).model;
    const g = toGraphData(m);
    expect(g.agregados).toHaveLength(1);
    expect(g.agregados[0].tipo_contenedor).toBe("Agregado");
  });
});
