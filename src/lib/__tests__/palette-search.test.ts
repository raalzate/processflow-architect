import { describe, expect, it } from "vitest";
import { MIN_PALETTE_QUERY, filtrarPaleta } from "../palette-search";
import { getNotation } from "../notations";
import type { ElementHelp } from "../notation-help";

const GRUPOS = [
  { label: "Estructura (Clases)", types: ["Clase", "Interfaz", "Enumeración"] },
  { label: "Componentes y Despliegue", types: ["Componente", "Puerto"] },
];

const HELP: Record<string, ElementHelp> = {
  Clase: { description: "Plantilla de objetos con atributos.", example: "Cliente en un CRM." },
  Puerto: { description: "Punto de conexión de un componente.", example: "El puerto REST." },
};

describe("filtrarPaleta", () => {
  it("sin consulta devuelve la paleta completa y no marca filtrado", () => {
    const r = filtrarPaleta(GRUPOS, "", HELP);
    expect(r.filtrando).toBe(false);
    expect(r.grupos).toHaveLength(2);
    expect(r.total).toBe(5);
  });

  it("por debajo del mínimo no filtra", () => {
    const q = "c".repeat(MIN_PALETTE_QUERY - 1);
    expect(filtrarPaleta(GRUPOS, q, HELP).filtrando).toBe(false);
    expect(filtrarPaleta(GRUPOS, q, HELP).total).toBe(5);
  });

  it("encuentra por nombre del tipo y descarta los grupos sin coincidencia", () => {
    const r = filtrarPaleta(GRUPOS, "interfaz", HELP);
    expect(r.filtrando).toBe(true);
    expect(r.grupos).toEqual([{ label: "Estructura (Clases)", types: ["Interfaz"] }]);
    expect(r.total).toBe(1);
  });

  it("ignora acentos y mayúsculas", () => {
    const r = filtrarPaleta(GRUPOS, "ENUMERACION", HELP);
    expect(r.grupos[0].types).toEqual(["Enumeración"]);
  });

  it("la etiqueta del grupo trae la sección entera", () => {
    const r = filtrarPaleta(GRUPOS, "despliegue", HELP);
    expect(r.grupos).toEqual([{ label: "Componentes y Despliegue", types: ["Componente", "Puerto"] }]);
  });

  it("encuentra por el texto de ayuda cuando no se recuerda el nombre", () => {
    const r = filtrarPaleta(GRUPOS, "punto de conexion", HELP);
    expect(r.grupos).toEqual([{ label: "Componentes y Despliegue", types: ["Puerto"] }]);
  });

  it("sin coincidencias devuelve vacío pero marcado como filtrado", () => {
    const r = filtrarPaleta(GRUPOS, "zzzz", HELP);
    expect(r.grupos).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.filtrando).toBe(true);
  });

  it("no muta los grupos de la notación (el registro es la fuente de verdad)", () => {
    const uml = getNotation("uml");
    const antes = JSON.stringify(uml.paletteGroups);
    const r = filtrarPaleta(uml.paletteGroups, "", HELP);
    r.grupos[0].types.push("Inventado");
    expect(JSON.stringify(uml.paletteGroups)).toBe(antes);
  });

  it("funciona contra el catálogo real de ayuda por defecto", () => {
    const uml = getNotation("uml");
    const r = filtrarPaleta(uml.paletteGroups, "clase");
    expect(r.total).toBeGreaterThan(0);
    expect(r.grupos.flatMap((g) => g.types)).toContain("Clase Abstracta");
  });
});
