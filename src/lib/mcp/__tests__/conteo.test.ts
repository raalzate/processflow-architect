import { describe, it, expect } from "vitest";
import { contarModelo, marcasDiagrama, textoConteo } from "../conteo";
import { countGraph } from "../app-state";
import { toGraphData, type DiagramModel } from "../diagram-builder";

const bpmn: DiagramModel = {
  meta: { nombre_proyecto: "Cobros", notation: "bpmn" },
  nodes: [
    { id: "pool", nombre: "Cobros", tipo_elemento: "Pool" },
    { id: "t1", nombre: "Validar pago", tipo_elemento: "Tarea", container: "pool" },
    { id: "t2", nombre: "Emitir recibo", tipo_elemento: "Tarea", container: "pool" },
    { id: "ev", nombre: "Pago recibido", tipo_elemento: "Evento de Inicio" },
  ],
  edges: [{ fuente: "t1", destino: "t2" }],
};

describe("conteo único de un diagrama (#533)", () => {
  it("es el MISMO número que get_app_state y list_views: los contenedores van aparte", () => {
    const c = contarModelo(bpmn);
    expect(c).toEqual(countGraph(toGraphData(bpmn)));
    expect(c.containers).toBe(1);
    expect(c.nodes).toBe(3);
  });

  it("el texto dice qué cuenta: elementos y contenedores por separado", () => {
    expect(textoConteo({ containers: 1, nodes: 3, edges: 1 })).toBe("3 elementos + 1 contenedor");
    expect(textoConteo({ containers: 0, nodes: 1, edges: 0 })).toBe("1 elemento");
    expect(textoConteo({ containers: 2, nodes: 0, edges: 0 })).toBe("0 elementos + 2 contenedores");
  });
});

describe("marcasDiagrama · qué limpiar del workspace (#534)", () => {
  it("un diagrama sin nada se marca vacío", () => {
    expect(marcasDiagrama({ meta: { nombre_proyecto: "X", notation: "ddd" }, nodes: [], edges: [] })).toEqual(["vacío"]);
  });

  it("una copia traída con importAs dice de qué vista y proyecto salió", () => {
    const copia = { ...bpmn, meta: { ...bpmn.meta, importadoDe: { proyecto: "Seguros", vista: "Cobros" } } };
    expect(marcasDiagrama(copia)).toEqual(['copia de la vista "Cobros" de "Seguros"']);
  });

  it("un diagrama normal no lleva marcas", () => {
    expect(marcasDiagrama(bpmn)).toEqual([]);
  });
});
