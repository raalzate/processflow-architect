import { describe, it, expect } from "vitest";
import { mergeProjectMeta, describeMetaAgregada } from "../project-meta";
import type { GraphData } from "../../types";

/** Proyecto mínimo con los campos de metadatos que sólo viven a nivel proyecto. */
function proyecto(over: Partial<GraphData> = {}): GraphData {
  return {
    nombre_proyecto: "Seguros",
    version: "1.0.0",
    fecha_analisis: "2026-08-24",
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

describe("mergeProjectMeta · una vista trae metadatos que son del PROYECTO", () => {
  it("suma hotspots, responsables y notas al proyecto activo", () => {
    const activo = proyecto({ notas: "Nota del humano." });
    const vista = proyecto({
      big_picture: { descripcion: "", hotspots: ["¿Quién cobra?"], nodos: [], aristas: [] },
      responsables: ["Ana"],
      notas: "Pendiente: definir el cobro.",
    });

    const r = mergeProjectMeta(activo, vista);
    expect(r.cambio).toBe(true);
    expect(r.graph.big_picture.hotspots).toEqual(["¿Quién cobra?"]);
    expect(r.graph.responsables).toEqual(["Ana"]);
    // Lo del humano NO se pisa: se conserva y lo del agente se anexa.
    expect(r.graph.notas).toContain("Nota del humano.");
    expect(r.graph.notas).toContain("Pendiente: definir el cobro.");
    expect(describeMetaAgregada(r.agregado)).toBe("1 hotspot · 1 responsable · notas");
  });

  it("no duplica lo que ya estaba y no toca el proyecto si no hay nada nuevo", () => {
    const activo = proyecto({
      big_picture: { descripcion: "", hotspots: ["¿Quién cobra?"], nodos: [], aristas: [] },
      responsables: ["Ana"],
      notas: "Pendiente: definir el cobro.",
    });
    const vista = proyecto({
      big_picture: { descripcion: "", hotspots: ["¿Quién cobra?"], nodos: [], aristas: [] },
      responsables: ["Ana"],
      notas: "Pendiente: definir el cobro.",
    });

    const r = mergeProjectMeta(activo, vista);
    expect(r.cambio).toBe(false);
    expect(r.graph).toBe(activo);
    expect(describeMetaAgregada(r.agregado)).toBe("");
  });

  it("una vista sin metadatos deja el proyecto intacto", () => {
    const activo = proyecto({ responsables: ["Ana"], notas: "Nota." });
    const r = mergeProjectMeta(activo, proyecto());
    expect(r.cambio).toBe(false);
    expect(r.graph.responsables).toEqual(["Ana"]);
  });

  it("descarta vacíos y repetidos de la lista entrante", () => {
    const r = mergeProjectMeta(
      proyecto(),
      proyecto({ responsables: ["  Ana  ", "Ana", "", "Beto"] })
    );
    expect(r.graph.responsables).toEqual(["Ana", "Beto"]);
  });
});
