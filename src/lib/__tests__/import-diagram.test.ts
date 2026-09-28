import { describe, it, expect } from "vitest";
import {
  parseDiagramJson,
  isJsonFile,
  normalizeImportedGraphData,
} from "../import-diagram";
import type { GraphData } from "../types";

const VALID = JSON.stringify({
  nombre_proyecto: "Ventas",
  big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
  agregados: [],
});

describe("parseDiagramJson", () => {
  it("acepta un GraphData válido y devuelve su nombre", () => {
    const r = parseDiagramJson(VALID, "ventas.json");
    expect(r.name).toBe("Ventas");
    expect(r.content.agregados).toEqual([]);
  });

  it("usa el nombre de archivo si el JSON no trae nombre_proyecto", () => {
    const raw = JSON.stringify({ agregados: [] });
    expect(parseDiagramJson(raw, "mi-diagrama.json").name).toBe("mi-diagrama");
    expect(parseDiagramJson(raw, "").name).toBe("Diagrama importado");
  });

  it("rechaza JSON inválido con mensaje en español", () => {
    expect(() => parseDiagramJson("{no json")).toThrow(/JSON válido/);
  });

  it("rechaza no-objetos y arrays", () => {
    expect(() => parseDiagramJson("42")).toThrow(/objeto/);
    expect(() => parseDiagramJson("[]")).toThrow(/objeto/);
    expect(() => parseDiagramJson("null")).toThrow(/objeto/);
  });

  it("rechaza objetos sin forma de GraphData", () => {
    expect(() => parseDiagramJson(JSON.stringify({ foo: 1 }))).toThrow(/GraphData/);
  });

  it("rechaza agregados que no sean lista", () => {
    expect(() => parseDiagramJson(JSON.stringify({ agregados: {} }))).toThrow(/lista/);
  });
});

describe("normalizeImportedGraphData", () => {
  // Un GraphData completo, como el que produce «Descargar JSON»: incluye los
  // campos opcionales que el import no debe perder (issue #423).
  const FULL: GraphData = {
    nombre_proyecto: "Pagos",
    version: "2.1.0",
    notation: "bpmn",
    defaultRouting: "orthogonal",
    fecha_analisis: "2026-01-15",
    big_picture: { descripcion: "d", hotspots: ["h"], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: ["ana"],
    notas: "n",
    transcript: "t",
    source_docs: [
      { nombre: "docs/contratos/07-pagos.md", origen: "PDF cliente", texto: "cuerpo" },
    ],
  };

  it("conserva TODOS los campos en el round-trip export→import (issue #423)", () => {
    // Export fiel: JSON.stringify del GraphData completo.
    const exported = JSON.stringify(FULL, null, 2);
    const { name, content } = parseDiagramJson(exported, "pagos.json");
    const back = normalizeImportedGraphData(content, name);
    // El enrutado por defecto y los documentos fuente sobreviven al import.
    expect(back.defaultRouting).toBe("orthogonal");
    expect(back.source_docs).toEqual(FULL.source_docs);
    // Y el resto del documento no cambia de forma.
    expect(back).toEqual(FULL);
  });

  it("rellena defaults cuando el contenido es parcial (modelo de IA)", () => {
    // El DomainAnalysis de la IA no trae los escalares del proyecto.
    const parcial = { agregados: [] } as unknown as Partial<GraphData>;
    const back = normalizeImportedGraphData(parcial, "Diseño IA");
    expect(back.nombre_proyecto).toBe("Diseño IA");
    expect(back.version).toBe("1.0.0");
    expect(back.big_picture).toEqual({
      descripcion: "",
      hotspots: [],
      nodos: [],
      aristas: [],
    });
    expect(back.responsables).toEqual([]);
    expect(back.notas).toBe("");
  });
});

describe("isJsonFile", () => {
  it("reconoce por MIME y por extensión (case-insensitive)", () => {
    expect(isJsonFile({ type: "application/json" })).toBe(true);
    expect(isJsonFile({ name: "x.JSON" })).toBe(true);
    expect(isJsonFile({ name: "x.txt", type: "text/plain" })).toBe(false);
  });
});
