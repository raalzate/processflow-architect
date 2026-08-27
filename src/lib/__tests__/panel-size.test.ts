import { describe, it, expect } from "vitest";
import {
  clampPanelWidth,
  isAtLimit,
  readPanelWidth,
  TOOLBOX_LIMITS,
  type PanelLimits,
  INSPECTOR_WIDTHS,
  inspectorMaxWidth,
  nextInspectorWidth,
  readInspectorWidth,
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

// -----------------------------------------------------------------------------
// Ancho de la ficha de elemento (#187)
// -----------------------------------------------------------------------------

describe("anchos de la ficha de elemento", () => {
  it("son tres, en orden, y el primero es el de hoy", () => {
    expect(INSPECTOR_WIDTHS.map((w) => w.id)).toEqual(["normal", "ancho", "casi-completa"]);
    expect(INSPECTOR_WIDTHS[0].maxWidth).toBe("28rem");
  });

  it("cada ancho declara su clase y su rótulo (no hay números en el componente)", () => {
    for (const w of INSPECTOR_WIDTHS) {
      expect(w.maxWidth).toMatch(/^(\d+(\.\d+)?rem|\d+vw)$/);
      expect(w.label.length).toBeGreaterThan(0);
    }
  });

  it("el ciclo avanza y vuelve al principio", () => {
    expect(nextInspectorWidth("normal")).toBe("ancho");
    expect(nextInspectorWidth("ancho")).toBe("casi-completa");
    expect(nextInspectorWidth("casi-completa")).toBe("normal");
  });

  it("un id que no existe cae en el ancho de partida", () => {
    expect(nextInspectorWidth("gigante" as never)).toBe("ancho");
    expect(readInspectorWidth("gigante")).toBe("normal");
    expect(readInspectorWidth(null)).toBe("normal");
    expect(readInspectorWidth("  ")).toBe("normal");
  });

  it("lee lo guardado cuando es uno de los tres", () => {
    expect(readInspectorWidth("ancho")).toBe("ancho");
    expect(readInspectorWidth("casi-completa")).toBe("casi-completa");
  });

  it("resuelve el ancho a aplicar sin que el componente sepa la medida", () => {
    expect(inspectorMaxWidth("normal")).toBe("28rem");
    expect(inspectorMaxWidth("casi-completa")).toBe(
      INSPECTOR_WIDTHS[2].maxWidth
    );
    // Un id inválido no deja la ficha sin ancho.
    expect(inspectorMaxWidth("nada" as never)).toBe("28rem");
  });
});
