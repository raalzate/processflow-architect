import { describe, it, expect } from "vitest";
import { plano, tipoParecido, normalizarTipo } from "../tipo-notacion";
import { notationTypes } from "../../notations";

const C4 = notationTypes("c4", { includeContainers: true });

describe("plano · cómo se comparan dos tipos escritos por manos distintas", () => {
  it("baja mayúsculas, quita acentos y recorta", () => {
    expect(plano("  Límite de Sistema ")).toBe("limite de sistema");
    expect(plano("")).toBe("");
  });
});

describe("normalizarTipo · lo que se corrige solo", () => {
  it("el tipo exacto pasa tal cual", () => {
    expect(normalizarTipo("Persona", C4)).toEqual({ tipo: "Persona" });
  });

  it("mayúsculas y acentos los arregla el arnés", () => {
    expect(normalizarTipo("limite de sistema", C4)).toEqual({ tipo: "Límite de Sistema" });
    expect(normalizarTipo("PERSONA", C4)).toEqual({ tipo: "Persona" });
  });

  it("lo que no calza NO se sustituye solo: se rechaza con la sugerencia", () => {
    // El error de idioma que mató una corrida entera (#331).
    expect(normalizarTipo("Container", C4)).toEqual({ error: "desconocido", sugerido: "Contenedor" });
  });

  it("un tipo que no se parece a nada se rechaza sin sugerencia", () => {
    expect(normalizarTipo("Agregado", C4)).toEqual({ error: "desconocido", sugerido: undefined });
  });
});

describe("tipoParecido · el umbral que decide qué es «parecido»", () => {
  it("un tipo mal escrito se reconoce", () => {
    expect(tipoParecido("Componente ", ["Componente", "Contenedor"])).toBe("Componente");
    expect(tipoParecido("componnte", ["Componente", "Contenedor"])).toBe("Componente");
  });

  it("no sugiere cuando el arranque no coincide: «Sistema» no es respuesta de cualquier cosa", () => {
    expect(tipoParecido("Base", ["Sistema", "Persona"])).toBeUndefined();
    expect(tipoParecido("Kafka", C4)).toBeUndefined();
  });

  it("una diferencia mayor al 40% no es un parecido", () => {
    expect(tipoParecido("Com", ["Componente"])).toBeUndefined();
  });

  it("entre dos candidatos gana el más cercano", () => {
    expect(tipoParecido("Contenedo", ["Contenedor", "Contexto Delimitado"])).toBe("Contenedor");
  });

  it("un tipo vacío no sugiere nada", () => {
    expect(tipoParecido("   ", C4)).toBeUndefined();
  });
});
