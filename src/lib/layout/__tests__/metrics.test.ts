import { describe, expect, it } from "vitest";

import {
  costeDeDisposicion,
  hayProblemaDeLegibilidad,
  medirLegibilidad,
  recortarABorde,
  segmentoPisaCaja,
  type Caja,
  type Relacion,
} from "../metrics";

const caja = (id: string, x: number, y: number, extra: Partial<Caja> = {}): Caja => ({
  id,
  x,
  y,
  width: 100,
  height: 60,
  ...extra,
});

describe("medirLegibilidad", () => {
  it("TS-017 · informa cruces, paso sobre caja y relaciones sin ruta", () => {
    const l = medirLegibilidad([caja("a", 0, 0), caja("b", 400, 0)], [
      { id: "e0", fuente: "a", destino: "b" },
    ]);
    expect(l).toEqual({ cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, relaciones: 1 });
  });

  it("cuenta la X de dos relaciones que se cortan", () => {
    const cajas = [caja("a", 0, 0), caja("b", 600, 0), caja("c", 0, 400), caja("d", 600, 400)];
    const rels: Relacion[] = [
      { id: "e0", fuente: "a", destino: "d" },
      { id: "e1", fuente: "c", destino: "b" },
    ];
    expect(medirLegibilidad(cajas, rels).cruces).toBe(1);
  });

  it("dos relaciones que comparten un extremo no se cruzan: se tocan en el nodo", () => {
    const cajas = [caja("a", 0, 0), caja("b", 600, 0), caja("c", 600, 400)];
    const rels: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a", destino: "c" },
    ];
    expect(medirLegibilidad(cajas, rels).cruces).toBe(0);
  });

  it("cuenta la relación que atraviesa una caja ajena", () => {
    const cajas = [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0)];
    const l = medirLegibilidad(cajas, [{ id: "e0", fuente: "a", destino: "b" }]);
    expect(l.sobreCaja).toBe(1);
  });

  it("TS-005 · el contenedor de los extremos no cuenta como obstáculo", () => {
    const cajas = [
      caja("banda", 0, 0, { width: 800, height: 300, esContenedor: true }),
      caja("a", 40, 100, { container: "banda" }),
      caja("b", 600, 100, { container: "banda" }),
    ];
    expect(medirLegibilidad(cajas, [{ id: "e0", fuente: "a", destino: "b" }]).sobreCaja).toBe(0);
  });

  it("TS-021 · la medida usa el recorrido real: una ruta que rodea no pisa la caja", () => {
    const cajas = [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0)];
    const rodeo: Relacion = {
      id: "e0",
      fuente: "a",
      destino: "b",
      puntos: [
        { x: 100, y: 30 },
        { x: 100, y: 200 },
        { x: 600, y: 200 },
        { x: 600, y: 30 },
      ],
    };
    expect(medirLegibilidad(cajas, [rodeo]).sobreCaja).toBe(0);
  });

  it("TS-022 · un diagrama sin relaciones mide cero", () => {
    expect(medirLegibilidad([caja("a", 0, 0)], [])).toEqual({
      cruces: 0,
      solape: 0,
      sobreCaja: 0,
      sinRuta: 0,
      relaciones: 0,
    });
  });

  it("TS-022 · la auto-relación no se cuenta", () => {
    const cajas = [caja("a", 0, 0), caja("b", 400, 0)];
    const l = medirLegibilidad(cajas, [
      { id: "e0", fuente: "a", destino: "a" },
      { id: "e1", fuente: "a", destino: "b" },
    ]);
    expect(l.relaciones).toBe(1);
    expect(l.cruces).toBe(0);
  });

  it("una relación con un extremo ausente no se mide", () => {
    const l = medirLegibilidad([caja("a", 0, 0)], [{ id: "e0", fuente: "a", destino: "fantasma" }]);
    expect(l.relaciones).toBe(0);
  });
});

describe("costeDeDisposicion", () => {
  const base = { cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, relaciones: 10 };

  it("pondera el paso sobre caja por debajo del cruce, pero no lo ignora", () => {
    expect(costeDeDisposicion({ ...base, cruces: 1 })).toBe(1);
    expect(costeDeDisposicion({ ...base, sobreCaja: 1 })).toBeCloseTo(0.6);
  });

  it("#392 · dos relaciones encimadas cuestan como un cruce", () => {
    expect(costeDeDisposicion({ ...base, solape: 1 })).toBe(1);
  });
});

describe("hayProblemaDeLegibilidad", () => {
  const base = { cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, relaciones: 40 };

  it("C2 · cualquier relación sobre caja dispara hallazgo", () => {
    expect(hayProblemaDeLegibilidad({ ...base, sobreCaja: 1 })).toBe(true);
  });

  it("#392 · dos relaciones encimadas también: esconden una relación entera", () => {
    expect(hayProblemaDeLegibilidad({ ...base, solape: 1 })).toBe(true);
  });

  it("C2 · los cruces disparan hallazgo por encima del 10% de las relaciones", () => {
    expect(hayProblemaDeLegibilidad({ ...base, cruces: 2, relaciones: 10 })).toBe(true);
    expect(hayProblemaDeLegibilidad({ ...base, cruces: 1, relaciones: 10 })).toBe(false);
  });
});

describe("geometría auxiliar", () => {
  it("recortarABorde deja el punto en el contorno de la caja", () => {
    const p = recortarABorde(caja("a", 0, 0), { x: 500, y: 30 });
    expect(p).toEqual({ x: 100, y: 30 });
  });

  it("segmentoPisaCaja detecta el segmento que entra y no el que pasa de largo", () => {
    const c = caja("m", 300, 0);
    expect(segmentoPisaCaja([{ x: 0, y: 30 }, { x: 600, y: 30 }], c)).toBe(true);
    expect(segmentoPisaCaja([{ x: 0, y: 300 }, { x: 600, y: 300 }], c)).toBe(false);
  });
});
