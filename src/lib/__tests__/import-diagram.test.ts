import { describe, it, expect } from "vitest";
import { parseDiagramJson, isJsonFile } from "../import-diagram";

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

describe("isJsonFile", () => {
  it("reconoce por MIME y por extensión (case-insensitive)", () => {
    expect(isJsonFile({ type: "application/json" })).toBe(true);
    expect(isJsonFile({ name: "x.JSON" })).toBe(true);
    expect(isJsonFile({ name: "x.txt", type: "text/plain" })).toBe(false);
  });
});
