import { describe, expect, it } from "vitest";
import { withStableGraphIds } from "../identity";
import { canvasToGraphData, emptyGraphData, graphDataToCanvas } from "../../../components/graph/designer/serialize";

describe("FR-001 · identidad persistente del tablero", () => {
  const legacy = () => ({
    ...emptyGraphData("Compartido", "2026-11-01"),
    agregados: [{ nombre_agregado: "Ventas", entidad_raiz: "Venta", descripcion: "", nodos: [], aristas: [] }],
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [
      { fuente: "a", destino: "b", descripcion: "primera" },
      { fuente: "a", destino: "b", descripcion: "paralela" },
    ] },
  });

  it("migra sin mutar y no vuelve a generar identidades", () => {
    let n = 0;
    const old = legacy();
    const first = withStableGraphIds(old, () => `uid-${++n}`);
    expect(old.agregados[0]).not.toHaveProperty("id");
    expect(first.agregados[0].id).toBe("agg-Ventas");
    expect(first.big_picture.aristas.map((e) => e.id)).toEqual(["edge-uid-1", "edge-uid-2"]);
    expect(withStableGraphIds(first, () => "must-not-run")).toEqual(first);
    expect(n).toBe(2);
  });

  it("distingue aristas paralelas y conserva IDs al hidratar dos veces", () => {
    const graph = withStableGraphIds(legacy(), (() => { let i = 0; return () => `x${++i}`; })());
    const first = graphDataToCanvas(graph);
    const second = graphDataToCanvas(graph);
    expect([...first.links.keys()]).toEqual([...second.links.keys()]);
    expect(first.links.size).toBe(2);
  });

  it("renombrar un contenedor no cambia su identidad al guardar y reabrir", () => {
    const graph = withStableGraphIds(legacy(), () => "edge");
    const scene = graphDataToCanvas(graph);
    const container = scene.nodes.get("agg-Ventas")!;
    scene.nodes.set(container.id, { ...container, nombre: "Comercial" });
    const saved = canvasToGraphData(scene.nodes, scene.links, graph);
    expect(saved.agregados[0].id).toBe(container.id);
    expect(graphDataToCanvas(saved).nodes.get(container.id)?.nombre).toBe("Comercial");
  });
});
