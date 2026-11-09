import { describe, expect, it } from "vitest";
import {
  KB,
  PF,
  expandir,
  iriElemento,
  iriGeneral,
  iriPredicado,
  iriRol,
  iriTipo,
  literal,
  esLiteral,
  valorLiteral,
  slugTipo,
} from "../iri";

// T3 · FR-009: la identidad de un elemento es su id, no su nombre ni su lugar.
describe("IRIs estables", () => {
  it("el IRI del elemento depende sólo de proyecto, vista e id", () => {
    const a = iriElemento("p1", "v1", "n7");
    expect(a).toBe("kb:p1/v1/n7");
    // Renombrar o mover la caja no cambia nada de lo que forma el IRI.
    expect(iriElemento("p1", "v1", "n7")).toBe(a);
  });

  it("escapa lo que rompería el IRI (espacios, barras, acentos)", () => {
    const iri = iriElemento("mi proyecto", "v/1", "agg-Pagos ñ");
    expect(iri.startsWith("kb:")).toBe(true);
    expect(iri.split("/")).toHaveLength(3);
    expect(iri).not.toContain(" ");
  });

  it("slug determinista del tipo, sin acentos", () => {
    expect(slugTipo("Compuerta Exclusiva")).toBe("compuerta-exclusiva");
    expect(slugTipo("Jerarquía (ISA)")).toBe("jerarquia-isa");
    expect(slugTipo("Jerarquía (ISA)")).toBe(slugTipo("Jerarquía (ISA)"));
  });

  it("términos de la TBox bajo pf:", () => {
    expect(iriTipo("bpmn", "Compuerta Exclusiva")).toBe("pf:bpmn/compuerta-exclusiva");
    expect(iriRol("gateway")).toBe("pf:rol/gateway");
    expect(iriGeneral("NodoDeFlujo")).toBe("pf:NodoDeFlujo");
    expect(iriPredicado("dispara")).toBe("pf:dispara");
  });

  it("expande prefijos a IRIs completas", () => {
    expect(expandir("pf:dispara")).toBe(`${PF}dispara`);
    expect(expandir("kb:p1/v1/n7")).toBe(`${KB}p1/v1/n7`);
    expect(expandir("rdf:type")).toBe("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    expect(expandir("https://x.org/a")).toBe("https://x.org/a");
  });

  it("literales: se distinguen de los IRIs y conservan el texto", () => {
    const l = literal('Pagar "ya"');
    expect(esLiteral(l)).toBe(true);
    expect(esLiteral("pf:dispara")).toBe(false);
    expect(valorLiteral(l)).toBe('Pagar "ya"');
  });
});
