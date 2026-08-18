import { describe, it, expect } from "vitest";
import {
  clampPanelWidth,
  isAtLimit,
  readPanelWidth,
  TOOLBOX_LIMITS,
  type PanelLimits,
} from "@/lib/panel-size";

const L: PanelLimits = { min: 100, max: 300, default: 200 };

describe("clampPanelWidth", () => {
  it("deja pasar un ancho dentro de los topes", () => {
    expect(clampPanelWidth(180, L)).toBe(180);
  });

  it("recorta por debajo del mínimo y por encima del máximo", () => {
    expect(clampPanelWidth(10, L)).toBe(L.min);
    expect(clampPanelWidth(9999, L)).toBe(L.max);
  });

  it("redondea a píxeles enteros", () => {
    expect(clampPanelWidth(180.6, L)).toBe(181);
  });

  it("un valor no finito cae al default", () => {
    expect(clampPanelWidth(NaN, L)).toBe(L.default);
    expect(clampPanelWidth(Infinity, L)).toBe(L.default);
  });
});

describe("readPanelWidth", () => {
  it("lee el ancho guardado", () => {
    expect(readPanelWidth("240", L)).toBe(240);
  });

  it("aplica los topes a lo guardado (una versión vieja pudo guardar otra cosa)", () => {
    expect(readPanelWidth("5000", L)).toBe(L.max);
    expect(readPanelWidth("1", L)).toBe(L.min);
  });

  it("sin valor, vacío o basura ⇒ default", () => {
    expect(readPanelWidth(null, L)).toBe(L.default);
    expect(readPanelWidth(undefined, L)).toBe(L.default);
    expect(readPanelWidth("   ", L)).toBe(L.default);
    expect(readPanelWidth("ancho", L)).toBe(L.default);
  });
});

describe("isAtLimit", () => {
  it("avisa cuando el panel no da más para ningún lado", () => {
    expect(isAtLimit(L.min, L)).toBe("min");
    expect(isAtLimit(L.max, L)).toBe("max");
    expect(isAtLimit(L.default, L)).toBeNull();
  });
});

describe("TOOLBOX_LIMITS", () => {
  it("el default está dentro de sus propios topes", () => {
    expect(TOOLBOX_LIMITS.min).toBeLessThan(TOOLBOX_LIMITS.default);
    expect(TOOLBOX_LIMITS.default).toBeLessThan(TOOLBOX_LIMITS.max);
    expect(clampPanelWidth(TOOLBOX_LIMITS.default, TOOLBOX_LIMITS)).toBe(TOOLBOX_LIMITS.default);
  });
});
