import { describe, it, expect } from "vitest";
import {
  listNotations,
  describeNotation,
  validTypesFor,
  isContainerType,
} from "../catalog";

describe("catalog", () => {
  it("expone las cuatro notaciones con sus tipos y guía", () => {
    const all = listNotations();
    expect(all.map((n) => n.id).sort()).toEqual(["bpmn", "c4", "ddd", "uml"]);
    for (const n of all) {
      expect(n.elements.length).toBeGreaterThan(0);
      expect(n.aiGuidance.length).toBeGreaterThan(0);
    }
  });

  it("describe una notación puntual y marca contenedores", () => {
    const ddd = describeNotation("ddd");
    const agg = ddd.elements.find((e) => e.type === "Agregado");
    expect(agg?.container).toBe(true);
    const cmd = ddd.elements.find((e) => e.type === "Comando");
    expect(cmd?.container).toBe(false);
  });

  it("cae a DDD ante una notación desconocida", () => {
    expect(describeNotation("no-existe").id).toBe("ddd");
  });

  it("validTypesFor devuelve el set de tipos de la notación", () => {
    const bpmn = validTypesFor("bpmn");
    expect(bpmn.has("Tarea")).toBe(true);
    expect(bpmn.has("Comando")).toBe(false);
  });

  it("isContainerType reconoce contenedores de cualquier notación", () => {
    expect(isContainerType("Pool")).toBe(true); // BPMN
    expect(isContainerType("Límite de Sistema")).toBe(true); // C4
    expect(isContainerType("Comando")).toBe(false);
  });
});
