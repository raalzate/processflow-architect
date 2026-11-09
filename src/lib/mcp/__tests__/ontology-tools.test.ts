import { describe, expect, it } from "vitest";
import { setEdgePredicate } from "@/lib/mcp/ontology-tools";
import { modeloES } from "@/lib/ontology/__tests__/fixtures/pedidos";

// Spec 027 · T13: el agente externo fija el significado de una flecha, y el
// reglamento no le deja fijar uno que no corresponde (FR-012).
describe("setEdgePredicate", () => {
  it("fija un predicado compatible y lo persiste en la arista", () => {
    const r = setEdgePredicate(modeloES(), "pagar", "pago-realizado", "dispara");
    expect(r.model.edges.find((e) => e.fuente === "pagar")?.predicado).toBe("dispara");
  });

  it("rechaza dominio/rango incumplido nombrando los compatibles", () => {
    expect(() => setEdgePredicate(modeloES(), "cliente", "pagar", "dispara")).toThrow(/invoca/);
    expect(() => setEdgePredicate(modeloES(), "cliente", "pagar", "volar")).toThrow(/no es un predicado/);
  });

  it("null quita el predicado (vuelve a proponerse en memoria)", () => {
    const con = setEdgePredicate(modeloES(), "pagar", "pago-realizado", "dispara").model;
    const sin = setEdgePredicate(con, "pagar", "pago-realizado", null).model;
    expect("predicado" in sin.edges.find((e) => e.fuente === "pagar")!).toBe(false);
  });

  it("la relación inexistente falla como en update_edge", () => {
    expect(() => setEdgePredicate(modeloES(), "pagar", "cancelar", "dispara")).toThrow(/No existe una relación/);
  });

  it("resuelve los extremos con el id como se dibuja en Mermaid", () => {
    const r = setEdgePredicate(modeloES(), "facturar_pedido", "factura_emitida", "dispara");
    expect(r.model.edges.find((e) => e.fuente === "facturar-pedido")?.predicado).toBe("dispara");
  });
});
