import { describe, expect, it } from "vitest";
import { NUDGE_FINE, isNudgeKey, nudgeForKey } from "@/lib/canvas-nudge";

const GRID = 20;

describe("qué teclas mueven (#257)", () => {
  it("las cuatro flechas mueven; nada más", () => {
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(isNudgeKey(k)).toBe(true);
      expect(nudgeForKey(k, {}, GRID)).not.toBeNull();
    }
    // Teclas que el diseñador ya usa para otra cosa: no se las roba el nudge.
    for (const k of ["Enter", "Delete", "Backspace", "Escape", "a", "z", " "]) {
      expect(isNudgeKey(k)).toBe(false);
      expect(nudgeForKey(k, {}, GRID)).toBeNull();
    }
  });

  it("una tecla desconocida no mueve: el handler no hace preventDefault de más", () => {
    expect(isNudgeKey("ArrowLeftLeft")).toBe(false);
    expect(nudgeForKey("", {}, GRID)).toBeNull();
    // `in` sobre un objeto ve la cadena de prototipos: no se cuela un método.
    expect(isNudgeKey("toString")).toBe(false);
    expect(isNudgeKey("constructor")).toBe(false);
  });
});

describe("cuánto mueve", () => {
  it("sin modificador, el paso es la cuadrícula", () => {
    expect(nudgeForKey("ArrowRight", {}, GRID)).toEqual({ dx: GRID, dy: 0 });
    expect(nudgeForKey("ArrowLeft", {}, GRID)).toEqual({ dx: -GRID, dy: 0 });
    expect(nudgeForKey("ArrowDown", {}, GRID)).toEqual({ dx: 0, dy: GRID });
    expect(nudgeForKey("ArrowUp", {}, GRID)).toEqual({ dx: 0, dy: -GRID });
  });

  it("con Shift el paso es fino: es el ajuste que el mouse no da", () => {
    expect(nudgeForKey("ArrowRight", { shiftKey: true }, GRID)).toEqual({
      dx: NUDGE_FINE,
      dy: 0,
    });
    expect(nudgeForKey("ArrowUp", { shiftKey: true }, GRID)).toEqual({
      dx: 0,
      dy: -NUDGE_FINE,
    });
    expect(NUDGE_FINE).toBeLessThan(GRID);
  });

  it("las flechas mueven en un solo eje: no hay diagonal accidental", () => {
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      const n = nudgeForKey(k, {}, GRID)!;
      expect(n.dx === 0 || n.dy === 0).toBe(true);
      expect(n.dx !== 0 || n.dy !== 0).toBe(true);
    }
  });

  it("una cuadrícula inservible cae al paso fino, no deja la flecha muerta", () => {
    // Que el paso salga chico se ve y se corrige; que la tecla no haga nada
    // se lee como un bug.
    for (const g of [0, -20, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(nudgeForKey("ArrowRight", {}, g)).toEqual({ dx: NUDGE_FINE, dy: 0 });
    }
  });

  it("una cuadrícula fraccionaria da un paso entero: el lienzo no queda a medio píxel", () => {
    expect(nudgeForKey("ArrowRight", {}, 20.6)).toEqual({ dx: 21, dy: 0 });
  });
});
