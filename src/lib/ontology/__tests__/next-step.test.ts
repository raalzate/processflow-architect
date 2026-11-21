import { describe, expect, it } from "vitest";
import { rotuloDeterminista, rotulosAdmitidos, siguientesPosibles } from "../next-step";

// #766: lo que el reglamento ya decide no se le pregunta al modelo.
describe("siguientesPosibles", () => {
  it("desde un Evento del Event Storming sólo se activa una Política", () => {
    expect(siguientesPosibles("Evento", "ddd")).toEqual([{ tipo: "Política", predicado: "activa", etiqueta: "activa" }]);
  });

  it("un Comando dispara un Evento o llama a un Sistema Externo", () => {
    expect(siguientesPosibles("Comando", "ddd").map((p) => `${p.predicado}→${p.tipo}`)).toEqual([
      "dispara→Evento",
      "llama_a→Sistema Externo",
    ]);
  });

  it("no repite el mismo tipo destino por dos predicados: gana el primero declarado", () => {
    const tipos = siguientesPosibles("Persona", "c4").map((p) => p.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it("sin predicados específicos (notación general) no hay nada que decir", () => {
    expect(siguientesPosibles("Rectángulo", "general")).toEqual([]);
  });

  it("un tipo desconocido no rompe", () => {
    expect(siguientesPosibles("NoExiste", "ddd")).toEqual([]);
  });
});

describe("rotuloDeterminista", () => {
  it("Comando → Evento sólo admite «dispara»", () => {
    expect(rotuloDeterminista("Comando", "Evento", "ddd")).toBe("dispara");
  });

  it("si el par admite más de un significado, decide el modelo (null)", () => {
    // Persona → Base de Datos: «lee de» o «escribe en».
    expect(rotuloDeterminista("Persona", "Base de Datos", "c4")).toBeNull();
  });

  it("si el par no admite ningún predicado específico, decide el modelo (null)", () => {
    expect(rotuloDeterminista("Rectángulo", "Elipse", "general")).toBeNull();
  });
});

describe("rotulosAdmitidos", () => {
  it("lista los rótulos de los predicados específicos que admite el par", () => {
    expect(rotulosAdmitidos("Persona", "Base de Datos", "c4")).toEqual(["lee de", "escribe en"]);
  });

  it("vacío si el par no tiene predicados específicos", () => {
    expect(rotulosAdmitidos("Rectángulo", "Elipse", "general")).toEqual([]);
  });
});
