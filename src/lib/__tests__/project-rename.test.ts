/**
 * Renombrar el proyecto (issue #127). El riesgo del renombrado no es el nombre:
 * es lo que se lleva puesto de paso —version, notas, notación, el grafo— porque
 * el nombre vive en dos campos que tienen que moverse juntos.
 */
import { describe, expect, it } from "vitest";
import {
  PROJECT_NAME_MAX,
  normalizeProjectName,
  projectFileName,
  renameSavedFile,
} from "../project-rename";
import type { SavedFile } from "../types";

const archivo = (nombre: string): SavedFile => ({
  id: "f1",
  name: `${nombre}.json`,
  content: {
    nombre_proyecto: nombre,
    version: "1.2.0",
    fecha_analisis: "2026-08-21",
    notas: "algo que no se toca",
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
  } as any,
});

describe("normalizeProjectName", () => {
  it("recorta los bordes y colapsa los espacios de adentro", () => {
    expect(normalizeProjectName("  Enrollment   v2  ")).toEqual({ ok: true, nombre: "Enrollment v2" });
  });

  it("vacío o sólo espacios no es un nombre, y dice por qué", () => {
    for (const raw of ["", "   ", "\t\n", undefined, null]) {
      const res = normalizeProjectName(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.motivo).toMatch(/vacío/i);
    }
  });

  it("pasado el tope no se guarda, y el motivo dice cuál es el tope", () => {
    const res = normalizeProjectName("x".repeat(PROJECT_NAME_MAX + 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toContain(String(PROJECT_NAME_MAX));
    expect(normalizeProjectName("x".repeat(PROJECT_NAME_MAX)).ok).toBe(true);
  });
});

describe("renameSavedFile", () => {
  it("mueve el nombre del documento Y el del archivo, y nada más", () => {
    const antes = archivo("Viejo");
    const despues = renameSavedFile(antes, "  Nuevo  ")!;
    expect(despues.content.nombre_proyecto).toBe("Nuevo");
    expect(despues.name).toBe(projectFileName("Nuevo"));
    expect(despues.id).toBe(antes.id);
    // El resto del documento queda intacto: sólo cambia `nombre_proyecto`.
    expect({ ...despues.content, nombre_proyecto: "Viejo" }).toEqual(antes.content);
  });

  it("un nombre inválido no renombra: devuelve null y el proyecto queda como estaba", () => {
    const antes = archivo("Viejo");
    expect(renameSavedFile(antes, "   ")).toBeNull();
    expect(antes.content.nombre_proyecto).toBe("Viejo");
  });

  it("renombrar a lo mismo no reescribe el estado", () => {
    const antes = archivo("Igual");
    expect(renameSavedFile(antes, " Igual ")).toBe(antes);
  });
});
