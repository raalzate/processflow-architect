import { describe, it, expect } from "vitest";
import {
  MERMAID_TEMPLATES,
  DEFAULT_MERMAID_CODE,
  getMermaidTemplate,
} from "../templates";

describe("plantillas Mermaid", () => {
  it("tiene ids únicos y código no vacío que empieza por su palabra clave", () => {
    const ids = MERMAID_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // ids únicos

    const firstToken: Record<string, string> = {
      sequence: "sequenceDiagram",
      flowchart: "flowchart",
      class: "classDiagram",
      state: "stateDiagram-v2",
      er: "erDiagram",
      gantt: "gantt",
    };
    for (const t of MERMAID_TEMPLATES) {
      expect(t.code.trim().length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
      // La primera línea del código arranca con la palabra clave del tipo.
      expect(t.code.trim().startsWith(firstToken[t.id])).toBe(true);
    }
  });

  it("el código por defecto es la plantilla de secuencia", () => {
    expect(DEFAULT_MERMAID_CODE).toBe(getMermaidTemplate("sequence")!.code);
    // Usa ids seguros (no la palabra reservada 'actor' como identificador).
    expect(DEFAULT_MERMAID_CODE).not.toMatch(/\bactor actor\b/);
  });

  it("getMermaidTemplate devuelve la plantilla o undefined", () => {
    expect(getMermaidTemplate("flowchart")?.label).toBe("Flujo");
    expect(getMermaidTemplate("no-existe")).toBeUndefined();
  });
});
