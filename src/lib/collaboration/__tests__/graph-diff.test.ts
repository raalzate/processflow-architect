import { describe, expect, it } from "vitest";
import { computeGraphDiff } from "../graph-diff";
import type { GraphData } from "../../types";

function sampleGraph(): GraphData {
  return {
    nombre_proyecto: "Proyecto de prueba",
    version: "1.0.0",
    fecha_analisis: "2026-11-02",
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [
        {
          id: "n-keep",
          nombre: "Portal Pacientes",
          tipo_elemento: "Aplicación",
          descripcion: "Acceso web",
          estado_comparativo: "existente",
          x: 100,
          y: 120,
        },
        {
          id: "n-del",
          nombre: "Servicio Legacy",
          tipo_elemento: "Servicio",
          descripcion: "SOAP antiguo",
          estado_comparativo: "existente",
          x: 360,
          y: 120,
        },
        {
          id: "n-mod",
          nombre: "Motor Citas",
          tipo_elemento: "Servicio",
          descripcion: "Agenda médica",
          estado_comparativo: "existente",
          x: 100,
          y: 300,
        },
        {
          id: "n-move",
          nombre: "Base Clínica",
          tipo_elemento: "Base de Datos",
          descripcion: "Historias clínicas",
          estado_comparativo: "existente",
          x: 360,
          y: 300,
        },
      ],
      aristas: [
        { id: "e-keep", fuente: "n-keep", destino: "n-mod", descripcion: "Consulta citas" },
        { id: "e-del", fuente: "n-keep", destino: "n-del", descripcion: "Invoca SOAP" },
      ],
    },
  };
}

describe("computeGraphDiff", () => {
  it("diferencia elementos nuevos, borrados, modificados y movidos entre Antes y Después", () => {
    const before = sampleGraph();
    const after = structuredClone(before);

    after.big_picture.nodos = after.big_picture.nodos.filter(n => n.id !== "n-del");
    after.big_picture.aristas = after.big_picture.aristas.filter(e => e.id !== "e-del");

    const modNode = after.big_picture.nodos.find(n => n.id === "n-mod")!;
    modNode.descripcion = "Agenda médica y teleconsulta";

    const moveNode = after.big_picture.nodos.find(n => n.id === "n-move")!;
    moveNode.x = 640;
    moveNode.y = 340;

    after.big_picture.nodos.push({
      id: "n-new",
      nombre: "Pasarela Pagos",
      tipo_elemento: "Sistema Externo",
      descripcion: "Cobros en línea",
      estado_comparativo: "nuevo",
      x: 640,
      y: 120,
    });
    after.big_picture.aristas.push({
      id: "e-new",
      fuente: "n-mod",
      destino: "n-new",
      descripcion: "Procesa copago",
    });

    const diff = computeGraphDiff(before, after);

    expect(diff.beforeNodes.get("n-keep")).toBeUndefined();
    expect(diff.beforeNodes.get("n-del")?.kind).toBe("removed");
    expect(diff.beforeNodes.get("n-mod")).toMatchObject({
      kind: "modified",
      fields: ["Descripción"],
    });
    expect(diff.beforeNodes.get("n-move")?.kind).toBe("moved");
    expect(diff.beforeLinks.get("e-del")?.kind).toBe("removed");
    expect(diff.beforeLinks.get("e-keep")).toBeUndefined();

    expect(diff.afterNodes.get("n-keep")).toBeUndefined();
    expect(diff.afterNodes.get("n-new")?.kind).toBe("added");
    expect(diff.afterNodes.get("n-mod")).toMatchObject({
      kind: "modified",
      fields: ["Descripción"],
    });
    expect(diff.afterNodes.get("n-move")?.kind).toBe("moved");
    expect(diff.afterLinks.get("e-new")?.kind).toBe("added");

    expect(diff.counts).toEqual({
      added: 2,
      removed: 2,
      modified: 1,
      moved: 1,
    });
  });
});
