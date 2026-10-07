import { describe, it, expect } from "vitest";
import { handoffPrompt } from "../handoff";

describe("handoffPrompt (feature 019)", () => {
  const base = { elementName: "Pagar pedido", viewName: "Modelo", url: "http://127.0.0.1:7331/mcp", hasSpec: false };

  it("nombra la caja, la vista, el servidor y el ciclo completo", () => {
    const p = handoffPrompt(base);
    expect(p).toContain('"Pagar pedido"');
    expect(p).toContain('"Modelo"');
    expect(p).toContain("http://127.0.0.1:7331/mcp");
    for (const tool of ["get_app_state", "get_focused_element", "set_view_element_spec"]) expect(p).toContain(tool);
    expect(p).toContain("needsClarification");
    // La propuesta se muestra antes de escribir: es la regla del arnés.
    expect(p.indexOf("Proponeme")).toBeLessThan(p.indexOf("set_view_element_spec"));
  });

  it("con spec previa pide merge para no pisar lo que escribió el humano", () => {
    expect(handoffPrompt({ ...base, hasSpec: true })).toContain("merge: true");
    expect(handoffPrompt(base)).not.toContain("merge: true");
  });
});
