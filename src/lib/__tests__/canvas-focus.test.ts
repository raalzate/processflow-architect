import { describe, it, expect } from "vitest";
import { OPACIDAD_ATENUADA, atenuado, focoEn, opacidadEnFoco } from "../canvas-focus";

// a → b → c, d → b, e suelto; b y c viven en el agregado «agg-Pagos».
const edges = [
  { id: "ab", sourceId: "a", targetId: "b" },
  { id: "bc", sourceId: "b", targetId: "c" },
  { id: "db", sourceId: "d", targetId: "b" },
  { id: "ce", sourceId: "c", targetId: "e" },
];
const contenedor: Record<string, string> = { b: "agg-Pagos", c: "agg-Pagos" };
const contenedorDe = (id: string) => contenedor[id];

describe("focoEn (#617)", () => {
  it("deja visibles la caja, sus entradas y salidas, y las aristas entre ellos", () => {
    const f = focoEn("b", edges);
    expect([...f.nodes].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...f.edges].sort()).toEqual(["ab", "bc", "db"]);
    expect(f.centro).toBe("b");
  });

  it("un vecino de un vecino queda atenuado: el foco es a un salto", () => {
    const f = focoEn("b", edges);
    expect(atenuado("e", f)).toBe(true);
    expect(atenuado("ce", f)).toBe(true);
  });

  it("el contenedor de algo visible no se atenúa", () => {
    const f = focoEn("a", edges, contenedorDe);
    // a → b, y b vive en agg-Pagos.
    expect(f.nodes.has("agg-Pagos")).toBe(true);
    expect(atenuado("agg-Pagos", f)).toBe(false);
  });

  it("una caja sin aristas se enfoca sola, sin romper", () => {
    const f = focoEn("x", edges);
    expect([...f.nodes]).toEqual(["x"]);
    expect(f.edges.size).toBe(0);
  });
});

describe("atenuar, nunca ocultar (P8)", () => {
  it("sin foco nada se atenúa", () => {
    expect(atenuado("a", null)).toBe(false);
    expect(opacidadEnFoco("a", null)).toBe(1);
  });

  it("lo atenuado sigue viéndose", () => {
    expect(OPACIDAD_ATENUADA).toBeGreaterThan(0);
    const f = focoEn("b", edges);
    expect(opacidadEnFoco("e", f)).toBe(OPACIDAD_ATENUADA);
    expect(opacidadEnFoco("b", f)).toBe(1);
  });
});
