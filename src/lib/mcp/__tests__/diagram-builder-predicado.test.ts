import { describe, expect, it } from "vitest";
import { addEdge, fromGraphData, toGraphData, updateEdge } from "@/lib/mcp/diagram-builder";
import { modeloES } from "@/lib/ontology/__tests__/fixtures/pedidos";

// Spec 027 · T10: el constructor del MCP conserva el predicado de la arista en
// los dos sentidos; sin él, un `export_to_app` borraría lo que confirmó el humano.
describe("predicado en el constructor", () => {
  it("toGraphData → fromGraphData conserva el predicado", () => {
    const m = updateEdge(modeloES(), "pagar", "pago-realizado", { predicado: "dispara" });
    const vuelta = fromGraphData(toGraphData(m), "ddd");
    expect(vuelta.edges.find((e) => e.fuente === "pagar")?.predicado).toBe("dispara");
    expect(vuelta.edges.find((e) => e.fuente === "cliente")?.predicado).toBeUndefined();
  });

  it("una arista sin predicado no escribe el campo", () => {
    const g = toGraphData(addEdge(modeloES(), { fuente: "cancelar", destino: "pago-realizado" }));
    expect(JSON.stringify(g)).not.toContain("predicado");
  });
});
