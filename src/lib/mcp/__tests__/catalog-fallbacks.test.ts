import { describe, it, expect } from "vitest";
import { toCatalogNotation } from "../catalog";
import type { Notation } from "../../notations";

// Notación sintética: un elemento SIN shape y un tipo que NO está en ningún
// paletteGroup → ejercita los fallbacks `?? "rounded"` y `?? "Otros"`.
const synthetic: Notation = {
  id: "ddd" as any,
  label: "Sintética",
  description: "d",
  aiGuidance: "g",
  paletteGroups: [{ label: "Grupo A", types: ["ConGrupo"] }],
  elements: [
    { type: "ConGrupo", icon: "Box", shape: "rect", bg: "", border: "", text: "" },
    { type: "SinShapeNiGrupo", icon: "Box", bg: "", border: "", text: "" }, // sin shape, sin grupo
  ],
};

describe("toCatalogNotation — fallbacks", () => {
  it("aplica rounded por defecto y 'Otros' cuando faltan shape/grupo", () => {
    const cat = toCatalogNotation(synthetic);
    const conGrupo = cat.elements.find((e) => e.type === "ConGrupo")!;
    const sin = cat.elements.find((e) => e.type === "SinShapeNiGrupo")!;
    expect(conGrupo.shape).toBe("rect");
    expect(conGrupo.group).toBe("Grupo A");
    expect(sin.shape).toBe("rounded"); // fallback
    expect(sin.group).toBe("Otros"); // fallback
    expect(sin.container).toBe(false); // Boolean(undefined)
  });
});
