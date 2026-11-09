import { describe, expect, it } from "vitest";
import { MARGEN_SUPERIOR, PASO_FILA, SEPARACION_COLUMNA, fusionarEnLienzo } from "../canvas-merge";

type N = { id: string; nombre: string; x?: number; y?: number; width?: number; metadata?: unknown[] };
type L = { id: string; sourceId: string; targetId: string };
const nodos = (...ns: N[]) => new Map(ns.map((n) => [n.id, n]));
const flechas = (...ls: L[]) => new Map(ls.map((l) => [l.id, l]));

// Spec 027 · T34 (revisión de F5): la mezcla en el lienzo decide en lib/, con prueba.
describe("fusionarEnLienzo", () => {
  const actual = {
    nodes: nodos({ id: "a", nombre: "A", x: 100, y: 50, width: 200 }, { id: "b", nombre: "B", x: 400, y: 50, width: 150 }),
    links: flechas({ id: "l1", sourceId: "a", targetId: "b" }),
  };

  it("lo existente no se mueve; lo nuevo entra en columna a la derecha", () => {
    const r = fusionarEnLienzo(actual, {
      nodes: nodos({ id: "a", nombre: "A", x: 0, y: 0 }, { id: "b", nombre: "B" }, { id: "c", nombre: "C" }, { id: "d", nombre: "D" }),
      links: flechas(),
    });
    expect(r.nodes.get("a")).toEqual(actual.nodes.get("a"));
    expect(r.nodosNuevos).toEqual(["c", "d"]);
    expect(r.nodes.get("c")).toMatchObject({ x: 550 + SEPARACION_COLUMNA, y: MARGEN_SUPERIOR });
    expect(r.nodes.get("d")).toMatchObject({ y: MARGEN_SUPERIOR + PASO_FILA });
  });

  it("a lo existente sólo se le actualiza la metadata", () => {
    const r = fusionarEnLienzo(actual, { nodes: nodos({ id: "a", nombre: "OTRO", x: 0, metadata: [{ clave: "procedencia", valor: "IA" }] }), links: flechas() });
    expect(r.nodes.get("a")).toEqual({ ...actual.nodes.get("a"), metadata: [{ clave: "procedencia", valor: "IA" }] });
  });

  it("un par con flecha no se duplica y se informa; una flecha nueva entra", () => {
    const r = fusionarEnLienzo(actual, {
      nodes: nodos({ id: "c", nombre: "C" }),
      links: flechas({ id: "l1", sourceId: "a", targetId: "b" }, { id: "x", sourceId: "a", targetId: "b" }, { id: "l2", sourceId: "b", targetId: "c" }),
    });
    expect(r.flechasNuevas).toEqual(["l2"]);
    expect(r.omitidas).toEqual(["x"]);
    expect([...r.links.keys()]).toEqual(["l1", "l2"]);
  });

  it("una flecha a un extremo que no existe no entra; no muta la entrada", () => {
    const antes = JSON.stringify([...actual.nodes, ...actual.links]);
    const r = fusionarEnLienzo(actual, { nodes: nodos(), links: flechas({ id: "z", sourceId: "a", targetId: "fantasma" }) });
    expect(r.omitidas).toEqual(["z"]);
    expect(JSON.stringify([...actual.nodes, ...actual.links])).toBe(antes);
  });

  it("lienzo vacío: lo nuevo arranca desde el borde izquierdo", () => {
    const r = fusionarEnLienzo({ nodes: nodos(), links: flechas() }, { nodes: nodos({ id: "c", nombre: "C" }), links: flechas() });
    expect(r.nodes.get("c")).toMatchObject({ x: SEPARACION_COLUMNA, y: MARGEN_SUPERIOR });
  });
});
