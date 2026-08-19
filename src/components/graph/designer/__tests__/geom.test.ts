import { describe, it, expect } from "vitest";
import {
  minimapScale,
  viewportRect,
  miniPointToCanvas,
  canvasWorldSize,
  canvasPixelSize,
} from "../minimap-geom";
import { croppedViewBox } from "../export-canvas";

describe("minimapScale", () => {
  it("elige el factor que hace caber el lienzo en la caja (el menor)", () => {
    // 2000 de lienzo en 168x120 → limita el alto: 120/2000.
    expect(minimapScale(2000, 168, 120)).toBeCloseTo(120 / 2000, 6);
  });
});

describe("viewportRect", () => {
  it("convierte scroll(px)→lienzo (÷zoom) y luego escala al mini", () => {
    const s = 0.06;
    const r = viewportRect({ left: 200, top: 100, w: 800, h: 600 }, 2, s);
    // left/zoom = 100 → *s
    expect(r.x).toBeCloseTo(100 * s, 6);
    expect(r.y).toBeCloseTo(50 * s, 6);
    expect(r.w).toBeCloseTo(400 * s, 6);
    expect(r.h).toBeCloseTo(300 * s, 6);
  });
});

describe("miniPointToCanvas", () => {
  it("deshace la escala (mini px → coord de lienzo)", () => {
    const s = 0.06;
    expect(miniPointToCanvas(6, 3, s)).toEqual({ x: 6 / s, y: 3 / s });
  });
});

describe("croppedViewBox", () => {
  it("rodea el contenido con el margen dado por ambos lados", () => {
    const vb = croppedViewBox(
      { minX: 100, minY: 50, maxX: 300, maxY: 250, width: 200, height: 200 },
      40
    );
    expect(vb).toEqual({ x: 60, y: 10, w: 280, h: 280 });
  });
});

// Bug real: el mundo del lienzo era una constante de 2000 y los diagramas
// grandes (un BPMN cómodo mide ~3300×1700) quedaban dibujados PERO fuera del
// área por la que se puede desplazar: no había forma de llegar al final.
describe("canvasWorldSize", () => {
  it("crece con el contenido y deja margen para arrastrar más allá", () => {
    const { width, height } = canvasWorldSize({ maxX: 3294, maxY: 1699 }, 2000, 400);
    expect(width).toBe(3694);
    expect(height).toBe(2099);
  });

  it("nunca baja del mínimo, ni con un diagrama chico o vacío", () => {
    expect(canvasWorldSize({ maxX: 300, maxY: 200 }, 2000)).toEqual({ width: 2000, height: 2000 });
    expect(canvasWorldSize(null, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("el diagrama SIEMPRE cabe dentro del mundo (invariante del bug)", () => {
    for (const [maxX, maxY] of [[100, 100], [2000, 2000], [5000, 900], [900, 5000]]) {
      const w = canvasWorldSize({ maxX, maxY }, 2000);
      expect(w.width).toBeGreaterThanOrEqual(maxX);
      expect(w.height).toBeGreaterThanOrEqual(maxY);
    }
  });
});

describe("canvasPixelSize", () => {
  it("el lienzo nunca es más chico que el viewport (la franja partida en dos tonos)", () => {
    // Mundo 2000 al 25 % = 500 px, pero la ventana mide 1400: manda la ventana.
    const r = canvasPixelSize({ width: 2000, height: 2000 }, 0.25, { w: 1400, h: 900 });
    expect(r.w).toBe(1400);
    expect(r.h).toBe(900);
  });

  it("con el mundo más grande que el viewport manda el mundo (hay scroll)", () => {
    const r = canvasPixelSize({ width: 3000, height: 2000 }, 1, { w: 1400, h: 900 });
    expect(r.w).toBe(3000);
    expect(r.h).toBe(2000);
  });

  it("el viewBox deshace el zoom: las coordenadas del lienzo no se estiran", () => {
    const r = canvasPixelSize({ width: 2000, height: 1000 }, 2, { w: 800, h: 600 });
    expect(r.w).toBe(4000);
    expect(r.viewBox).toBe("0 0 2000 1000");
  });

  it("un viewport sin medir (0) no rompe el cálculo", () => {
    const r = canvasPixelSize({ width: 1000, height: 800 }, 1, { w: 0, h: 0 });
    expect([r.w, r.h]).toEqual([1000, 800]);
  });

  it("zoom inválido cae a 1 en vez de producir Infinity en el viewBox", () => {
    expect(canvasPixelSize({ width: 100, height: 100 }, 0, { w: 0, h: 0 }).viewBox).toBe("0 0 100 100");
  });
});
