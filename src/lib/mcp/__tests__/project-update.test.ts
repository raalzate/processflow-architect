import { describe, it, expect } from "vitest";
import { mergeProjectGraph, resolveProjectRef, resolveViewRef, vistaInexistente } from "../project-update";
import type { GraphData } from "../../types";

const nodo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nombre: id,
  tipo_elemento: "Comando",
  estado_comparativo: "nuevo" as const,
  ...extra,
});

function proyecto(over: Partial<GraphData> = {}): GraphData {
  return {
    nombre_proyecto: "Seguros",
    version: "1.0.0",
    fecha_analisis: "2026-08-25",
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
    ...over,
  } as GraphData;
}

describe("mergeProjectGraph · actualizar un proyecto sin pisar al humano", () => {
  it("conserva la geometría que el humano movió y coloca lo nuevo con la del diseño", () => {
    const actual = proyecto({
      big_picture: { descripcion: "", hotspots: [], nodos: [nodo("cobrar", { x: 900, y: 700 })], aristas: [] },
    });
    const entrante = proyecto({
      nombre_proyecto: "Diseño MCP",
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [nodo("cobrar", { x: 0, y: 0 }), nodo("anular", { x: 240, y: 0 })],
        aristas: [],
      },
    });

    const { graph, resumen } = mergeProjectGraph(actual, entrante);
    const porId = Object.fromEntries(graph.big_picture.nodos.map((n) => [n.id, n]));
    expect(porId.cobrar.x).toBe(900);
    expect(porId.cobrar.y).toBe(700);
    expect(porId.anular.x).toBe(240);
    expect(resumen).toEqual({ agregados: 1, quitados: 0, conservados: 1 });
  });

  it("el proyecto conserva su nombre: actualizar no es renombrar", () => {
    const { graph } = mergeProjectGraph(proyecto(), proyecto({ nombre_proyecto: "Otro" }));
    expect(graph.nombre_proyecto).toBe("Seguros");
  });

  it("la geometría de los contenedores también sobrevive, y sus hijos", () => {
    const actual = proyecto({
      agregados: [
        {
          nombre_agregado: "Pólizas",
          entidad_raiz: "",
          descripcion: "",
          x: 500,
          y: 400,
          width: 800,
          height: 300,
          nodos: [nodo("cobrar", { x: 520, y: 460 })],
          aristas: [],
        } as any,
      ],
    });
    const entrante = proyecto({
      agregados: [
        {
          nombre_agregado: "Pólizas",
          entidad_raiz: "",
          descripcion: "",
          x: 0,
          y: 0,
          width: 400,
          height: 200,
          nodos: [nodo("cobrar", { x: 20, y: 60 }), nodo("anular", { x: 260, y: 60 })],
          aristas: [],
        } as any,
      ],
    });

    const { graph } = mergeProjectGraph(actual, entrante);
    const agg = graph.agregados[0];
    expect([agg.x, agg.y, agg.width, agg.height]).toEqual([500, 400, 800, 300]);
    expect(agg.nodos.find((n) => n.id === "cobrar")!.x).toBe(520);
    expect(agg.nodos.find((n) => n.id === "anular")!.x).toBe(260);
  });

  it("cuenta lo que el humano perdería: los elementos que el diseño nuevo ya no trae", () => {
    const actual = proyecto({
      big_picture: { descripcion: "", hotspots: [], nodos: [nodo("viejo"), nodo("cobrar")], aristas: [] },
    });
    const entrante = proyecto({
      big_picture: { descripcion: "", hotspots: [], nodos: [nodo("cobrar")], aristas: [] },
    });
    expect(mergeProjectGraph(actual, entrante).resumen).toEqual({
      agregados: 0,
      quitados: 1,
      conservados: 1,
    });
  });

  it("las notas, hotspots y responsables se fusionan (no se pisan)", () => {
    const actual = proyecto({
      big_picture: { descripcion: "", hotspots: ["¿Quién cobra?"], nodos: [], aristas: [] },
      responsables: ["Ana"],
      notas: "Nota del humano.",
    });
    const entrante = proyecto({
      big_picture: { descripcion: "", hotspots: ["¿Y la mora?"], nodos: [], aristas: [] },
      responsables: ["Beto"],
      notas: "Pendiente: definir mora.",
    });

    const { graph } = mergeProjectGraph(actual, entrante);
    expect(graph.big_picture.hotspots).toEqual(["¿Quién cobra?", "¿Y la mora?"]);
    expect(graph.responsables).toEqual(["Ana", "Beto"]);
    expect(graph.notas).toContain("Nota del humano.");
    expect(graph.notas).toContain("Pendiente: definir mora.");
  });
});

describe("resolveProjectRef · a qué proyecto se entrega", () => {
  const estado = { activo: "Seguros", proyectos: ["Seguros", "Enrollment v2"] };

  it("sin referencia (o con «activo») apunta al proyecto abierto", () => {
    expect(resolveProjectRef(undefined, estado)).toBe("Seguros");
    expect(resolveProjectRef("activo", estado)).toBe("Seguros");
  });

  it("resuelve por nombre, incluso si el agente lo escribe en otra caja", () => {
    expect(resolveProjectRef("Enrollment v2", estado)).toBe("Enrollment v2");
    expect(resolveProjectRef("enrollment v2", estado)).toBe("Enrollment v2");
  });

  it("un nombre que no existe devuelve las opciones y la salida", () => {
    expect(() => resolveProjectRef("Fantasma", estado)).toThrow(/"Enrollment v2"/);
    expect(() => resolveProjectRef("Fantasma", estado)).toThrow(/mode="new"/);
  });

  it("sin proyecto abierto y sin referencia, lo dice", () => {
    expect(() => resolveProjectRef(undefined, { activo: null, proyectos: [] })).toThrow(
      /No hay un proyecto abierto/
    );
  });
});

describe("resolveViewRef · a qué pestaña se entrega (#147)", () => {
  const vistas = [
    { name: "Modelo", builtin: true },
    { name: "Proceso de alta", builtin: false },
  ];

  it("reconoce una vista existente, aunque el nombre venga en otra caja", () => {
    expect(resolveViewRef("Proceso de alta", vistas)).toEqual({ name: "Proceso de alta", existe: true });
    expect(resolveViewRef("proceso de alta", vistas)).toEqual({ name: "Proceso de alta", existe: true });
  });

  it("un nombre nuevo no es un error: dice que no existe y deja decidir", () => {
    expect(resolveViewRef("Otra", vistas)).toEqual({ name: "Otra", existe: false });
  });

  it("las vistas del sistema no se reemplazan", () => {
    expect(resolveViewRef("Modelo", vistas).existe).toBe(false);
  });

  it("el aviso lista las pestañas reemplazables y la salida", () => {
    const msg = vistaInexistente("Otra", vistas);
    expect(msg).toContain('"Proceso de alta"');
    expect(msg).not.toContain('"Modelo"');
    expect(msg).toContain("replace");
  });
});
