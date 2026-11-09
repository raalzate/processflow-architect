import { describe, expect, it } from "vitest";
import { describeNotation, ontologyMarkdown } from "@/lib/mcp/catalog";
import { tboxDe, tboxMarkdown } from "@/lib/ontology/tbox";

// Spec 027 · T7: el agente externo lee el mismo reglamento que la app (FR-007, FR-030).
describe("catálogo con ontología", () => {
  it("describeNotation lista los predicados con dominio y rango legibles", () => {
    const ddd = describeNotation("ddd");
    const dispara = ddd.predicados.find((p) => p.id === "dispara")!;
    expect(dispara.dominio).toContain("Comando");
    expect(dispara.rango).toContain("Evento");
    expect(ddd.predicados.some((p) => p.id === "relacionado_con")).toBe(true);
  });

  it("ontologyMarkdown es el markdown de la TBox (get_ontology responde igual)", () => {
    const md = ontologyMarkdown("bpmn");
    expect(md).toBe(tboxMarkdown(tboxDe("bpmn")));
    expect(md).toContain("Compuerta Exclusiva");
    expect(md).toContain("**flujo_a**");
  });
});
