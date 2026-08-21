/**
 * Estilo de las relaciones en lote (issue #128). Lo que se rompe al aplicar a
 * muchas aristas no es el campo que se pide: es el trabajo manual que se lleva
 * puesto de paso (anclas, quiebres, corrimiento de la etiqueta).
 */
import { describe, expect, it } from "vitest";
import { styleLinks, styleLinksSummary } from "../link-style";
import type { DesignerLink } from "../serialize";

const arista = (id: string, extra: Partial<DesignerLink> = {}): DesignerLink => ({
  id,
  sourceId: "a",
  targetId: "b",
  descripcion: "invoca",
  sourceAnchor: { x: 0.9, y: 0.5 },
  targetAnchor: { x: 0.1, y: 0.5 },
  midpoints: [{ x: 10, y: 20 }],
  labelOffset: { x: 0, y: -12 },
  ...extra,
});

const mapa = (...ls: DesignerLink[]) => new Map(ls.map((l) => [l.id, l]));

describe("styleLinks", () => {
  it("sólo cambia los campos del parche: anclas, quiebres y etiqueta quedan", () => {
    const antes = arista("e1");
    const res = styleLinks(mapa(antes), ["e1"], { routing: "orthogonal" });
    const despues = res.links.get("e1")!;
    expect(despues.routing).toBe("orthogonal");
    expect(despues.sourceAnchor).toEqual(antes.sourceAnchor);
    expect(despues.targetAnchor).toEqual(antes.targetAnchor);
    expect(despues.midpoints).toEqual(antes.midpoints);
    expect(despues.labelOffset).toEqual(antes.labelOffset);
    expect(res.changed).toEqual(["e1"]);
  });

  it("`all` aplica a toda la vista y los ids que no son aristas se ignoran", () => {
    const res = styleLinks(mapa(arista("e1"), arista("e2")), "all", { dashed: true });
    expect(res.changed.sort()).toEqual(["e1", "e2"]);
    expect([...res.links.values()].every((l) => l.dashed)).toBe(true);
    // La selección del lienzo mezcla nodos y aristas: los nodos no molestan.
    const conNodos = styleLinks(mapa(arista("e1")), ["e1", "nodo-1"], { arrow: "both" });
    expect(conNodos.changed).toEqual(["e1"]);
  });

  it("pisar un enrutado puesto a mano se INFORMA, no pasa en silencio", () => {
    const res = styleLinks(
      mapa(arista("e1", { routing: "curved" }), arista("e2")),
      "all",
      { routing: "straight" }
    );
    expect(res.overridden).toEqual(["e1"]);
    expect(styleLinksSummary(res)).toMatch(/se pisó el enrutado puesto a mano en 1/);
  });

  it("aplicar lo que ya estaba no toca el estado (mismo mapa, sin aviso)", () => {
    const links = mapa(arista("e1", { routing: "curved" }));
    const res = styleLinks(links, "all", { routing: "curved" });
    expect(res.links).toBe(links);
    expect(res.changed).toEqual([]);
    expect(styleLinksSummary(res)).toBeNull();
  });

  it("un parche de varios campos viaja completo en una sola operación", () => {
    const res = styleLinks(mapa(arista("e1")), "all", {
      routing: "curved",
      dashed: true,
      arrow: "none",
      color: "#ff0000",
    });
    const l = res.links.get("e1")!;
    expect([l.routing, l.dashed, l.arrow, l.color]).toEqual(["curved", true, "none", "#ff0000"]);
    expect(res.changed).toEqual(["e1"]);
  });
});
