import { describe, expect, it } from "vitest";
import { canvasToGraphData, graphDataToCanvas } from "@/components/graph/designer/serialize";
import { vistasPedidos } from "@/lib/ontology/__tests__/fixtures/pedidos";

// Spec 027 · T10: el predicado confirmado viaja con la arista por el lienzo, y
// un proyecto que no lo tiene no gana el campo (FR-013, SC-008).
const base = (g: ReturnType<typeof vistasPedidos>[number]["graph"]) => ({
  nombre_proyecto: g!.nombre_proyecto,
  fecha_analisis: g!.fecha_analisis,
  notation: g!.notation,
});

describe("predicado en el lienzo", () => {
  it("ida y vuelta conserva el predicado confirmado", () => {
    const g = vistasPedidos()[0].graph!;
    const { nodes, links } = graphDataToCanvas(g);
    const l = [...links.values()].find((x) => x.sourceId === "pagar")!;
    links.set(l.id, { ...l, predicado: "dispara" });
    const guardado = canvasToGraphData(nodes, links, base(g));
    const vuelta = graphDataToCanvas(guardado);
    expect([...vuelta.links.values()].find((x) => x.sourceId === "pagar")?.predicado).toBe("dispara");
    expect([...vuelta.links.values()].find((x) => x.sourceId === "cliente")?.predicado).toBeUndefined();
  });

  it("Q12 · un tablero sin predicados sale igual que entró: sin el campo y estable", () => {
    const g = vistasPedidos()[2].graph!;
    const uno = graphDataToCanvas(g);
    const primero = canvasToGraphData(uno.nodes, uno.links, base(g));
    const dos = graphDataToCanvas(primero);
    const segundo = canvasToGraphData(dos.nodes, dos.links, base(g));
    expect(JSON.stringify(primero)).not.toContain("predicado");
    expect(JSON.stringify(segundo)).toBe(JSON.stringify(primero));
  });
});
