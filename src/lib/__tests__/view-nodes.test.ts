import { describe, it, expect } from "vitest";
import { collectGraphNodes } from "../view-nodes";
import type { GraphData } from "../types";

const graph = (partial: Partial<GraphData>): GraphData =>
  ({
    nombre_proyecto: "t",
    version: "1",
    fecha_analisis: "",
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    responsables: [],
    notas: "",
    transcript: "",
    ...partial,
  }) as GraphData;

describe("collectGraphNodes", () => {
  it("devuelve vacío para grafos nulos o sin nodos", () => {
    expect(collectGraphNodes(undefined)).toEqual([]);
    expect(collectGraphNodes(null)).toEqual([]);
    expect(collectGraphNodes(graph({}))).toEqual([]);
  });

  it("aplana big picture y contenedores, marcando el agregado de origen", () => {
    const g = graph({
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [
          { id: "a1", nombre: "Actor X", tipo_elemento: "Actor", descripcion: "", estado_comparativo: "nuevo" } as any,
        ],
        aristas: [],
      },
      agregados: [
        {
          nombre_agregado: "Ventas",
          entidad_raiz: "",
          descripcion: "",
          nodos: [
            { id: "t1", nombre: "Tarea 1", tipo_elemento: "Tarea", descripcion: "", estado_comparativo: "eliminado" } as any,
          ],
          aristas: [],
        },
      ],
    });
    const nodes = collectGraphNodes(g);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: "a1", agregado: "" });
    expect(nodes[1]).toMatchObject({ id: "t1", agregado: "Ventas", estado_comparativo: "eliminado" });
  });
});
