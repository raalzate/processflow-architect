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
    // Dice lo que hace hoy: actualizar fusionando, no reemplazar (#533).
    expect(out).toContain("ACTUALIZA el proyecto activo");
    expect(out).not.toContain("REEMPLAZA");
    expect(out).toContain("Proceso de pago");
    expect(out).toContain("1/50");
    expect(out).toContain("Beta");
  });

  // Feature 019: el agente externo tiene que saber qué caja tiene abierta el
  // humano para que «pulí esta caja» no necesite dictarle el nombre.
  it("publica la ficha abierta con vista, elemento y tab", () => {
    const s = describeAppState({
      graph: graph("Aurora"),
      views: [...BUILTIN_VIEWS, vista()],
      viewsLimit: MAX_CUSTOM_VIEWS,
      now: "x",
      focus: { viewId: "v1", viewName: "Proceso de pago", elementId: "b", elementName: "B", tab: "spec" },
    });
    expect(s.focus).toEqual({ viewId: "v1", viewName: "Proceso de pago", elementId: "b", elementName: "B", tab: "spec" });
    const out = formatAppState(s);
    expect(out).toContain('"B"');
    expect(out).toContain('"Proceso de pago"');
    expect(out).toContain("tab spec");
    expect(out).toContain("get_focused_element");
    expect(out).toContain("set_view_element_spec");
  });

  it("sin ficha abierta lo dice en vez de callarse", () => {
    const s = describeAppState({ graph: graph("Aurora"), views: [], viewsLimit: 50, now: "x" });
    expect(s.focus).toBeNull();
    expect(formatAppState(s)).toContain("Ficha abierta: ninguna");
  });

  it("sin proyecto activo dice que export_as_view no tiene dónde colgar", () => {
    const out = formatAppState(
      describeAppState({ graph: null, views: [], viewsLimit: 50, now: "x" })
    );
    expect(out).toContain("NINGUNO");
    expect(out).toContain("export_as_view");
  });
});

describe("organizaciones visibles en get_app_state (#534)", () => {
  const base = {
    views: [...BUILTIN_VIEWS],
    viewsLimit: MAX_CUSTOM_VIEWS,
    now: "2026-10-10T10:00:00.000Z",
    savedFiles: [
      { name: "EMMA · Conversación.json", orgId: "proyecto-integrador" },
      { name: "Seguros.json", orgId: "bupa" },
      { name: "Suelto.json" },
    ],
  };

  it("publica la org del selector, la del proyecto activo y TODOS los proyectos con su org", () => {
    const s = describeAppState({ ...base, graph: graph("EMMA · Conversación"), org: "bupa", projectOrg: "proyecto-integrador" });
    expect(s.appOrg).toBe("bupa");
    expect(s.projectOrg).toBe("proyecto-integrador");
    // `projects` sigue filtrado (lo que el humano ve); el catálogo es completo.
    expect(s.projects).toEqual(["Seguros.json"]);
    expect(s.catalog).toEqual([
      { name: "EMMA · Conversación.json", org: "proyecto-integrador" },
      { name: "Seguros.json", org: "bupa" },
      { name: "Suelto.json", org: null },
    ]);
  });

  it("el texto dice qué org mira el humano, cuál fijó el MCP, y avisa si difieren", () => {
    const s = describeAppState({ ...base, graph: graph("EMMA · Conversación"), org: "bupa", projectOrg: "proyecto-integrador" });
    const out = formatAppState(s, { mcpOrg: "proyecto-integrador" });
    expect(out).toContain('en la app el selector está en la organización "bupa"');
    expect(out).toContain('el MCP tiene fijada la organización "proyecto-integrador"');
    expect(out).toMatch(/⚠️.*no lo va a ver/);
    expect(out).toContain('Proyecto activo: "EMMA · Conversación" en la organización "proyecto-integrador"');
  });

  it("los proyectos guardados se listan agrupados por organización, no filtrados en silencio", () => {
    const s = describeAppState({ ...base, graph: graph("Suelto"), org: "bupa" });
    const out = formatAppState(s);
    expect(out).toContain('"bupa": Seguros');
    expect(out).toContain('"proyecto-integrador": EMMA · Conversación');
    expect(out).toContain("sin organización: Suelto");
  });

  it("con el selector en «Todas» no hay aviso", () => {
    const s = describeAppState({ ...base, graph: graph("Seguros"), projectOrg: "bupa" });
    expect(formatAppState(s, { mcpOrg: "bupa" })).not.toContain("⚠️");
  });
});
