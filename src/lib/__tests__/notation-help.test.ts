import { describe, it, expect } from "vitest";
import { NOTATION_HELP } from "@/lib/notation-help";

describe("NOTATION_HELP", () => {
  it("cubre elementos de las cuatro notaciones (DDD/BPMN/C4/UML)", () => {
    for (const key of [
      "Comando", // DDD
      "Evento",
      "Agregado",
      "Pool", // BPMN
      "Tarea",
      "Compuerta Exclusiva",
      "Sistema", // C4
      "Contenedor",
      "Clase", // UML
      "Caso de Uso",
      "Estado Inicial",
    ]) {
      expect(NOTATION_HELP, key).toHaveProperty(key);
    }
  });

  it("cada entrada tiene descripción y ejemplo no vacíos", () => {
    const entries = Object.entries(NOTATION_HELP);
    expect(entries.length).toBeGreaterThan(40);
    for (const [key, help] of entries) {
      expect(typeof help.description, key).toBe("string");
      expect(help.description.length, key).toBeGreaterThan(20);
      expect(typeof help.example, key).toBe("string");
      expect(help.example.length, key).toBeGreaterThan(10);
    }
  });
});
