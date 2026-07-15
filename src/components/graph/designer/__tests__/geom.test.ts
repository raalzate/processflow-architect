import { describe, it, expect } from "vitest";
import { minimapScale, viewportRect, miniPointToCanvas } from "../minimap-geom";
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
