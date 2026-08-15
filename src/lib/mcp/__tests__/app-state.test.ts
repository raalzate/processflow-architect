import { describe, it, expect } from "vitest";
import { describeAppState, formatAppState } from "../app-state";
import { MAX_CUSTOM_VIEWS, BUILTIN_VIEWS, type DesignView } from "../../views-types";
import type { GraphData } from "../../types";

const graph = (nombre: string): GraphData => ({
  nombre_proyecto: nombre,
  version: "1.0.0",
  notation: "bpmn",
  fecha_analisis: "2026-08-14",
  big_picture: { descripcion: "", hotspots: [], nodos: [{ id: "a", nombre: "A", tipo_elemento: "Tarea" } as any], aristas: [{ fuente: "a", destino: "b", descripcion: "" } as any] },
  agregados: [
    {
      nombre_agregado: "Ventas",
      entidad_raiz: "Ventas",
      descripcion: "",
      nodos: [{ id: "b", nombre: "B", tipo_elemento: "Tarea" } as any],
      aristas: [],
    },
  ],
  read_models: [],
  politicas_inter_agregados: [],
  responsables: [],
  notas: "",
  transcript: "",
});

const vista = (over: Partial<DesignView> = {}): DesignView => ({
  id: "v1",
  name: "Proceso de pago",
  kind: "graph",
  notation: "bpmn",
  createdAt: "2026-08-14",
  ...over,
});

describe("describeAppState", () => {
  it("cuenta contenedores, nodos y aristas del proyecto activo", () => {
    const s = describeAppState({
      graph: graph("Aurora"),
      views: [...BUILTIN_VIEWS, vista()],
      viewsLimit: MAX_CUSTOM_VIEWS,
      now: "2026-08-14T10:00:00.000Z",
    });
    expect(s.projectName).toBe("Aurora");
    expect(s.notation).toBe("bpmn");
    expect(s.counts).toEqual({ containers: 1, nodes: 2, edges: 1 });
    expect(s.views.map((v) => v.name)).toEqual(["Modelo", "Proceso de pago"]);
  });

  it("sin proyecto abierto deja projectName en null y conteos en cero", () => {
    const s = describeAppState({ graph: null, views: [], viewsLimit: 50, now: "x" });
    expect(s.projectName).toBeNull();
    expect(s.counts).toEqual({ containers: 0, nodes: 0, edges: 0 });
  });
});

describe("formatAppState", () => {
  it("sin estado publicado explica que export_as_view no está disponible", () => {
    const out = formatAppState(null);
    expect(out).toContain("export_as_view");
    expect(out).toContain("stdio");
  });

  it("avisa de que export_to_app reemplaza el proyecto activo", () => {
    const out = formatAppState(
      describeAppState({
        graph: graph("Aurora"),
        views: [...BUILTIN_VIEWS, vista()],
        savedFiles: [{ name: "Aurora" }, { name: "Beta" }],
        viewsLimit: MAX_CUSTOM_VIEWS,
        now: "2026-08-14T10:00:00.000Z",
      })
    );
    expect(out).toContain("REEMPLAZA");
    expect(out).toContain("Proceso de pago");
    expect(out).toContain("1/50");
    expect(out).toContain("Beta");
  });

  it("sin proyecto activo dice que export_as_view no tiene dónde colgar", () => {
    const out = formatAppState(
      describeAppState({ graph: null, views: [], viewsLimit: 50, now: "x" })
    );
    expect(out).toContain("NINGUNO");
    expect(out).toContain("export_as_view");
  });
});
