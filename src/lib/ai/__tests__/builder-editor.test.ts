import { describe, it, expect } from "vitest";
import { planEditorCall } from "../builder-editor";
import { classifyIntent } from "../builder-intent";
import { notationTypes } from "../../notations";
import type { GraphData } from "../../types";

const tipos = notationTypes("c4", { includeContainers: true });
const nodo = (id: string, nombre: string, tipo: string) =>
  ({ id, nombre, tipo_elemento: tipo, estado_comparativo: "nuevo" }) as any;

const vista = (): GraphData =>
  ({
    nombre_proyecto: "Modelo",
    version: "1.0.0",
    notation: "c4",
    fecha_analisis: "2026-09-18",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [nodo("ctrl", "Controlador", "Componente"), nodo("svc", "Servicio", "Componente")],
      aristas: [{ fuente: "ctrl", destino: "svc", descripcion: "llama" }],
    },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  }) as any;

const plan = (mensaje: string, graph: GraphData | null = vista()) =>
  planEditorCall(classifyIntent(mensaje, { elementos: 2, tipos }), graph, mensaje, "Modelo");

describe("planEditorCall · la llamada sale de las consultas, no del modelo", () => {
  it("agregar un elemento nombrado y tipado resuelve en add_view_element", () => {
    const p = plan("agregá un elemento Persona llamado Cliente");
    expect(p.kind).toBe("llamada");
    expect(p.kind === "llamada" && p.call).toEqual({
      tool: "add_view_element",
      args: { name: "Cliente", type: "Persona", view: "Modelo" },
    });
  });

  it("invertir una flecha resuelve en update_view_edge con invert", () => {
    const p = plan("invertí la flecha entre Controlador y Servicio");
    expect(p.kind === "llamada" && p.call).toMatchObject({
      tool: "update_view_edge",
      args: { from: "Controlador", to: "Servicio", invert: true },
    });
  });

  it("eliminar resuelve en la herramienta destructiva correspondiente", () => {
    expect(plan("borrá el Servicio").kind === "llamada").toBe(true);
    const rel = plan("eliminá la relación entre Controlador y Servicio");
    expect(rel.kind === "llamada" && rel.call.tool).toBe("remove_view_edge");
  });

  it("conectar dos cajas resuelve en add_view_edge con la etiqueta dictada", () => {
    const p = plan('conectá Controlador y Servicio con "invoca"');
    expect(p.kind === "llamada" && p.call).toMatchObject({
      tool: "add_view_edge",
      args: { from: "Controlador", to: "Servicio" },
    });
  });
});

describe("planEditorCall · lo que no se decide por el humano (FR-010)", () => {
  it("dos elementos con el mismo nombre se preguntan con opciones", () => {
    const g = vista();
    g.big_picture.nodos.push(nodo("ctrl2", "Controlador", "Contenedor"));
    const p = planEditorCall(
      classifyIntent("borrá Controlador", { elementos: 3, tipos }),
      g,
      "borrá Controlador"
    );
    expect(p.kind).toBe("pregunta");
    expect(p.kind === "pregunta" && p.opciones).toHaveLength(2);
  });

  it("un elemento que no existe se pregunta con los que sí hay", () => {
    const p = plan("borrá el Repositorio");
    expect(p.kind).toBe("pregunta");
    expect(p.kind === "pregunta" && p.opciones.map((o) => o.label)).toContain("Controlador");
  });

  it("una relación que no existe ofrece crearla", () => {
    const g = vista();
    g.big_picture.aristas = [];
    const p = planEditorCall(
      classifyIntent("invertí la flecha entre Controlador y Servicio", { elementos: 2, tipos }),
      g,
      "invertí la flecha entre Controlador y Servicio"
    );
    expect(p.kind).toBe("pregunta");
    expect(p.kind === "pregunta" && p.opciones.map((o) => o.id)).toContain("crear");
  });
});

describe("planEditorCall · cuándo NO hay atajo (sigue el bucle de siempre)", () => {
  it("sin tipo no se inventa uno", () => {
    expect(plan('agregá algo llamado "Cosa"').kind).toBe("sin-plan");
  });

  it("agregar lo que ya está no se repite", () => {
    const p = plan("agregá un Componente llamado Servicio");
    expect(p.kind).toBe("sin-plan");
    expect(p.kind === "sin-plan" && p.motivo).toContain("ya tiene");
  });

  it("sin vista no hay nada que editar", () => {
    expect(plan("borrá el Servicio", null).kind).toBe("sin-plan");
  });

  it("un cambio que el pedido no especifica no se adivina", () => {
    const p = plan("cambiá el Servicio");
    expect(p.kind).toBe("sin-plan");
  });
});
