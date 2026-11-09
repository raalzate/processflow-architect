import { describe, expect, it } from "vitest";
import { crearStore } from "../store";

// T4 · el store indexado: cualquier combinación de huecos se responde por
// índice, y agregar un hecho repetido no lo duplica.
describe("TripleStore", () => {
  const base = () => {
    const s = crearStore();
    s.add({ s: "a", p: "p", o: "b", origen: "explicito", vista: "v1" });
    s.add({ s: "a", p: "q", o: "c", origen: "explicito" });
    s.add({ s: "b", p: "p", o: "c", origen: "deducido" }, { regla: "transitiva", premisas: [["a", "p", "b"]], ronda: 1 });
    return s;
  };

  it("add duplicado devuelve false y no cambia el tamaño", () => {
    const s = base();
    expect(s.size).toBe(3);
    expect(s.add({ s: "a", p: "p", o: "b", origen: "deducido" })).toBe(false);
    expect(s.size).toBe(3);
    // Un explícito repetido conserva su origen original.
    expect(s.match("a", "p", "b")[0].origen).toBe("explicito");
  });

  it("match con todas las combinaciones de huecos", () => {
    const s = base();
    const t = (hs: { s: string; p: string; o: string }[]) => hs.map((h) => `${h.s} ${h.p} ${h.o}`).sort();
    expect(t(s.match())).toEqual(["a p b", "a q c", "b p c"]);
    expect(t(s.match("a"))).toEqual(["a p b", "a q c"]);
    expect(t(s.match(undefined, "p"))).toEqual(["a p b", "b p c"]);
    expect(t(s.match(undefined, undefined, "c"))).toEqual(["a q c", "b p c"]);
    expect(t(s.match("a", "p"))).toEqual(["a p b"]);
    expect(t(s.match(undefined, "p", "c"))).toEqual(["b p c"]);
    expect(t(s.match("a", undefined, "c"))).toEqual(["a q c"]);
    expect(t(s.match("a", "p", "b"))).toEqual(["a p b"]);
    expect(s.match("zz")).toEqual([]);
    expect(s.match("a", "p", "zz")).toEqual([]);
  });

  it("guarda la justificación del deducido y el origen", () => {
    const s = base();
    expect(s.justificacion(["b", "p", "c"])?.regla).toBe("transitiva");
    expect(s.justificacion(["a", "p", "b"])).toBeUndefined();
    expect(s.has(["a", "q", "c"])).toBe(true);
    expect(s.has(["c", "q", "a"])).toBe(false);
    expect(s.match(undefined, undefined, undefined).filter((h) => h.origen === "deducido")).toHaveLength(1);
  });
});
