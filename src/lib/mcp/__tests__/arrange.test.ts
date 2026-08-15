import { describe, it, expect } from "vitest";
import { arrangeGraphData, laneNames, laneSummary } from "../arrange";
import { emptyDiagram, addContainer, addNode, addEdge, toGraphData } from "../diagram-builder";
import { typesWithRole } from "../../notations";

const t = (notation: string, role: Parameters<typeof typesWithRole>[1]) =>
  typesWithRole(notation, role)[0];

/** Paisaje C4 con dos límites y sus sistemas, ya serializado como GraphData. */
function paisaje() {
  let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
  for (const banda of ["Alfa", "Beta"]) {
    m = addContainer(m, { nombre: banda, tipo_elemento: t("c4", "boundary") }).model;
    for (let i = 0; i < 3; i++) {
      m = addNode(m, {
        id: `${banda}-${i}`,
        nombre: `${banda} ${i}`,
        tipo_elemento: t("c4", "system"),
        container: banda,
      }).model;
    }
  }
  m = addEdge(m, { fuente: "Alfa-0", destino: "Beta-0", descripcion: "usa [API]" });
  return toGraphData(m);
}

describe("arrangeGraphData", () => {
  it("devuelve posiciones por id de nodo y por nombre de banda", () => {
    const out = arrangeGraphData(paisaje(), "c4");
    expect(Object.keys(out.containers).sort()).toEqual(["Alfa", "Beta"]);
    expect(Object.keys(out.nodes)).toHaveLength(6);
    expect(out.nodes["Alfa-0"]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(out.containers["Alfa"].width).toBeGreaterThan(0);
  });

  it("la densidad cambia la disposición sin cambiar qué hay", () => {
    const g = paisaje();
    const compacto = arrangeGraphData(g, "c4", { density: "compacto" });
    const expandido = arrangeGraphData(g, "c4", { density: "expandido" });
    expect(Object.keys(expandido.nodes)).toEqual(Object.keys(compacto.nodes));
    const anchoDe = (r: ReturnType<typeof arrangeGraphData>) =>
      Math.max(...Object.values(r.containers).map((c) => (c.width ?? 0)));
    expect(anchoDe(expandido)).toBeGreaterThan(anchoDe(compacto));
  });

  it("aplica el orden de bandas propuesto", () => {
    const out = arrangeGraphData(paisaje(), "c4", { laneOrder: ["Beta", "Alfa"] });
    expect(out.containers["Beta"].y).toBeLessThan(out.containers["Alfa"].y);
  });

  it("un orden con nombres inventados no rompe nada", () => {
    const out = arrangeGraphData(paisaje(), "c4", { laneOrder: ["Inventado", "Beta"] });
    expect(Object.keys(out.containers).sort()).toEqual(["Alfa", "Beta"]);
    expect(out.containers["Beta"].y).toBeLessThan(out.containers["Alfa"].y);
  });

  it("laneNames y laneSummary alimentan a la IA con lo que hay", () => {
    const g = paisaje();
    expect(laneNames(g)).toEqual(["Alfa", "Beta"]);
    const resumen = laneSummary(g);
    expect(resumen).toContain("Alfa: Alfa 0");
    expect(resumen).toContain("Beta:");
  });
});
