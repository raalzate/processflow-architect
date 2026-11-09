import { describe, expect, it } from "vitest";
import { validTypesFor } from "@/lib/mcp/catalog";
import { fromGraphData } from "@/lib/mcp/diagram-builder";
import { VINCULOS_PEDIDOS, vistasPedidos } from "./fixtures/pedidos";

// T1 · el proyecto de referencia carga como vistas válidas: si el fixture se
// rompe, todas las pruebas de la ontología mienten a la vez.
describe("fixture «Pedidos»", () => {
  const vistas = vistasPedidos();

  it("son tres vistas de grafo, una por notación", () => {
    expect(vistas.map((v) => v.notation)).toEqual(["ddd", "bpmn", "c4"]);
    for (const v of vistas) {
      expect(v.kind).toBe("graph");
      expect(v.graph?.notation).toBe(v.notation);
    }
  });

  it("cada caja usa un tipo válido de su notación y toda arista une cajas que existen", () => {
    for (const v of vistas) {
      const m = fromGraphData(v.graph!, v.notation);
      const tipos = validTypesFor(v.notation);
      const ids = new Set(m.nodes.map((n) => n.id));
      for (const n of m.nodes) expect(tipos.has(n.tipo_elemento), `${v.id}: ${n.tipo_elemento}`).toBe(true);
      for (const e of m.edges) {
        expect(ids.has(e.fuente)).toBe(true);
        expect(ids.has(e.destino)).toBe(true);
      }
    }
  });

  it("«Cancelar» no dispara nada y los vínculos apuntan a cajas reales", () => {
    const es = fromGraphData(vistas[0].graph!, "ddd");
    expect(es.edges.some((e) => e.fuente === "cancelar")).toBe(false);
    const porVista = new Map(vistas.map((v) => [v.id, new Set(fromGraphData(v.graph!, v.notation).nodes.map((n) => n.id))]));
    for (const l of VINCULOS_PEDIDOS) {
      expect(porVista.get(l.a.vista)?.has(l.a.nodo)).toBe(true);
      expect(porVista.get(l.b.vista)?.has(l.b.nodo)).toBe(true);
    }
  });
});
