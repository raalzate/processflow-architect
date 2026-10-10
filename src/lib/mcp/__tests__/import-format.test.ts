import { describe, it, expect } from "vitest";
import { interpretarImportacion } from "../import-format";
import { fromGraphData, toGraphData } from "../diagram-builder";
import type { DiagramModel } from "../diagram-builder";

/** Un diagrama tal como lo guarda el workspace del MCP (`saveModel`). */
const delWorkspace = (): DiagramModel => ({
  meta: { nombre_proyecto: "Cobros", notation: "bpmn" },
  nodes: [
    { id: "pool", nombre: "Cobros", tipo_elemento: "Pool" },
    { id: "t1", nombre: "Validar pago", tipo_elemento: "Tarea", container: "pool" },
    { id: "t2", nombre: "Emitir recibo", tipo_elemento: "Tarea", container: "pool" },
  ],
  edges: [{ fuente: "t1", destino: "t2" }],
});

describe("interpretarImportacion · import_diagram (#533)", () => {
  it("acepta el formato del workspace ({meta, nodes, edges}): antes importaba 0 elementos", () => {
    const r = interpretarImportacion(delWorkspace());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formato).toBe("workspace");
    expect(r.model.nodes).toHaveLength(3);
    expect(r.model.edges).toHaveLength(1);
    expect(r.model.meta.notation).toBe("bpmn");
  });

  it("la notación explícita manda sobre la del archivo", () => {
    const r = interpretarImportacion(delWorkspace(), "ddd");
    expect(r.ok && r.model.meta.notation).toBe("ddd");
  });

  it("sigue aceptando el GraphData de la app", () => {
    const graph = toGraphData(fromGraphData(toGraphData(delWorkspace() as DiagramModel), "bpmn"));
    const r = interpretarImportacion(graph);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formato).toBe("graphdata");
    expect(r.model.nodes.length).toBeGreaterThan(0);
  });

  it("un formato desconocido falla diciendo qué esperaba y qué encontró", () => {
    const r = interpretarImportacion({ elementos: [], relaciones: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/agregados/);
    expect(r.error).toMatch(/meta.*nodes.*edges/);
    expect(r.error).toMatch(/elementos, relaciones/);
  });

  it("nunca «importado» con 0 elementos: es un error con la razón", () => {
    const vacio = { ...delWorkspace(), nodes: [], edges: [] };
    const r = interpretarImportacion(vacio);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/0 elementos/);
  });

  it("un nodo del workspace sin los campos mínimos falla nombrando cuál y qué falta", () => {
    const roto = { ...delWorkspace(), nodes: [{ id: "x", nombre: "Sin tipo" }] };
    const r = interpretarImportacion(roto);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/"x"/);
    expect(r.error).toMatch(/tipo_elemento/);
  });

  it("lo que no es un objeto JSON se rechaza", () => {
    expect(interpretarImportacion([]).ok).toBe(false);
    expect(interpretarImportacion(null).ok).toBe(false);
  });
});
