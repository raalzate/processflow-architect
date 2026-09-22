import { describe, expect, it } from "vitest";

import { claveDeRelacion } from "@/lib/layout/modelo";
import { aplicarRecorridos } from "../link-arrange";
import type { DesignerLink } from "../serialize";

const link = (id: string, sourceId: string, targetId: string, extra: Partial<DesignerLink> = {}): DesignerLink => ({
  id,
  sourceId,
  targetId,
  descripcion: "",
  ...extra,
});

const mapa = (...ls: DesignerLink[]) => new Map(ls.map((l) => [l.id, l]));

const quiebres = [{ x: 10, y: 20 }];

describe("aplicarRecorridos", () => {
  it("TS-011 · aplica el recorrido calculado al enlace de ese par", () => {
    const out = aplicarRecorridos(mapa(link("l1", "a", "b")), {
      [claveDeRelacion("a", "b", 0)]: { midpoints: quiebres, routing: "orthogonal" },
    });
    expect(out.get("l1")).toMatchObject({
      midpoints: quiebres,
      routing: "orthogonal",
      geometriaAuto: true,
    });
  });

  it("TS-012 · el enlace que ajustó una persona se queda como está", () => {
    const aMano = link("l1", "a", "b", { midpoints: [{ x: 1, y: 1 }], routing: "orthogonal" });
    const out = aplicarRecorridos(mapa(aMano), {
      [claveDeRelacion("a", "b", 0)]: { midpoints: quiebres, routing: "orthogonal" },
    });
    expect(out.get("l1")).toBe(aMano);
  });

  it("TS-013 · el recorrido calculado que ya no hace falta desaparece", () => {
    const auto = link("l1", "a", "b", {
      midpoints: quiebres,
      routing: "orthogonal",
      geometriaAuto: true,
    });
    const out = aplicarRecorridos(mapa(auto), {});
    expect(out.get("l1")!.midpoints).toBeUndefined();
    expect(out.get("l1")!.routing).toBeUndefined();
    expect(out.get("l1")!.geometriaAuto).toBeUndefined();
  });

  it("dos relaciones entre el mismo par reciben cada una su recorrido", () => {
    const out = aplicarRecorridos(mapa(link("l1", "a", "b"), link("l2", "a", "b")), {
      [claveDeRelacion("a", "b", 1)]: { midpoints: quiebres, routing: "orthogonal" },
    });
    expect(out.get("l1")!.midpoints).toBeUndefined();
    expect(out.get("l2")!.midpoints).toEqual(quiebres);
  });

  it("el enlace sin recorrido ni marca no se toca", () => {
    const suelto = link("l1", "a", "b", { routing: "curved" });
    expect(aplicarRecorridos(mapa(suelto), {}).get("l1")).toBe(suelto);
  });
});
