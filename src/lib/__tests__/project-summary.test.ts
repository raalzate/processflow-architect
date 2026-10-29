import { describe, expect, it } from "vitest";
import { resumirProyecto, resumirProyectos } from "../project-summary";
import type { GraphData, SavedFile } from "../types";

const nodo = (id: string, tipo: string) => ({
  id,
  nombre: id,
  tipo_elemento: tipo,
  estado_comparativo: "nuevo" as const,
});

function archivo(id: string, content: Partial<GraphData> = {}, orgId?: string): SavedFile {
  return {
    id,
    name: id,
    orgId,
    content: {
      nombre_proyecto: `Proyecto ${id}`,
      version: "1",
      fecha_analisis: "2026-10-01",
      big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
      agregados: [],
      read_models: [],
      responsables: [],
      notas: "",
      transcript: "",
      ...content,
    },
  };
}

describe("resumirProyecto", () => {
  it("cuenta elementos de la big picture y de los contenedores, y las relaciones de todos lados", () => {
    const r = resumirProyecto(
      archivo("a", {
        notation: "c4",
        big_picture: {
          descripcion: "Portal de pagos",
          hotspots: ["¿quién aprueba?"],
          nodos: [nodo("p", "Persona"), nodo("s", "Sistema")],
          aristas: [{ id: "e1" } as any],
        },
        agregados: [
          {
            nombre_agregado: "Core",
            entidad_raiz: "",
            descripcion: "",
            nodos: [nodo("c1", "Contenedor"), nodo("c2", "Contenedor")],
            aristas: [{ id: "e2" } as any, { id: "e3" } as any],
          },
        ],
        politicas_inter_agregados: [{ id: "e4" } as any],
        responsables: ["Ana", "Luis"],
      })
    );
    expect(r.elementos).toBe(4);
    expect(r.contenedores).toBe(1);
    expect(r.relaciones).toBe(4);
    expect(r.hotspots).toBe(1);
    expect(r.responsables).toEqual(["Ana", "Luis"]);
    expect(r.notacion).toBe("C4 (Arquitectura)");
    expect(r.descripcion).toBe("Portal de pagos");
  });

  it("ordena los tipos más usados de mayor a menor y se queda con los tres primeros", () => {
    const r = resumirProyecto(
      archivo("a", {
        big_picture: {
          descripcion: "",
          hotspots: [],
          nodos: [
            nodo("1", "Evento"),
            nodo("2", "Evento"),
            nodo("3", "Evento"),
            nodo("4", "Comando"),
            nodo("5", "Comando"),
            nodo("6", "Actor"),
            nodo("7", "Política"),
          ],
          aristas: [],
        },
      })
    );
    expect(r.tiposPrincipales).toEqual([
      { tipo: "Evento", cantidad: 3 },
      { tipo: "Comando", cantidad: 2 },
      { tipo: "Actor", cantidad: 1 },
    ]);
  });

  it("sin descripción cae a las notas, y corta un texto largo con «…»", () => {
    expect(resumirProyecto(archivo("a", { notas: "  Notas sueltas  " })).descripcion).toBe("Notas sueltas");
    const largo = "x".repeat(400);
    const d = resumirProyecto(archivo("a", { big_picture: { descripcion: largo, hotspots: [], nodos: [], aristas: [] } }))
      .descripcion;
    expect(d!.length).toBeLessThanOrEqual(180);
    expect(d!.endsWith("…")).toBe(true);
  });

  it("un proyecto vacío o a medio guardar no rompe: todo en cero y sin descripción", () => {
    const r = resumirProyecto({ id: "v", name: "v", content: { nombre_proyecto: "" } as any });
    expect(r).toMatchObject({ elementos: 0, relaciones: 0, contenedores: 0, hotspots: 0, descripcion: null });
    expect(r.nombre).toBe("v");
  });
});

describe("resumirProyectos", () => {
  it("ordena por fecha de análisis, el más reciente primero", () => {
    const r = resumirProyectos([
      archivo("viejo", { fecha_analisis: "2025-01-01" }),
      archivo("nuevo", { fecha_analisis: "2026-09-30" }),
    ]);
    expect(r.map((p) => p.id)).toEqual(["nuevo", "viejo"]);
  });
});
