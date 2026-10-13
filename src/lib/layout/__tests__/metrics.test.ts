import { describe, expect, it } from "vitest";

import {
  costeDeDisposicion,
  hayProblemaDeLegibilidad,
  medirLegibilidad,
  puntoDeEtiqueta,
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
    expect(l).toEqual({
      cruces: 0,
      solape: 0,
      sobreCaja: 0,
      sinRuta: 0,
      anclajesCompartidos: 0,
      etiquetasTapadas: 0,
      relaciones: 1,
    });
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
      anclajesCompartidos: 0,
      etiquetasTapadas: 0,
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
  const base = { cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, anclajesCompartidos: 0, etiquetasTapadas: 0, relaciones: 10 };

  it("pondera el paso sobre caja por debajo del cruce, pero no lo ignora", () => {
    expect(costeDeDisposicion({ ...base, cruces: 1 })).toBe(1);
    expect(costeDeDisposicion({ ...base, sobreCaja: 1 })).toBeCloseTo(0.6);
  });

  it("#392 · dos relaciones encimadas cuestan como un cruce", () => {
    expect(costeDeDisposicion({ ...base, solape: 1 })).toBe(1);
  });
});

// Reglas de conector de diagram-design (ADR 0006 · #538): cada punta con su
// anclaje, y ninguna etiqueta debajo de una caja ajena.
describe("reglas de conector", () => {
  it("cuenta el par de relaciones que salen por el mismo punto de una caja", () => {
    // b y c están en línea con a: las dos rectas nacen en el mismo punto del
    // borde derecho de a.
    const cajas = [caja("a", 0, 0), caja("b", 400, 0), caja("c", 800, 0)];
    const rels: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a", destino: "c" },
    ];
    expect(medirLegibilidad(cajas, rels).anclajesCompartidos).toBe(1);
  });

  it("dos puntas separadas por más de DISTANCIA_ANCLAJE en la misma caja no cuentan", () => {
    const cajas = [caja("a", 0, 0), caja("b", 400, -200), caja("c", 400, 200)];
    const rels: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a", destino: "c" },
    ];
    expect(medirLegibilidad(cajas, rels).anclajesCompartidos).toBe(0);
  });

  it("dos puntas cercanas en el plano pero de cajas distintas no comparten anclaje", () => {
    // a y a2 son vecinas pegadas; cada una manda una relación a b desde su
    // propio borde. Las puntas quedan a pocos px, pero en cajas distintas.
    const cajas = [caja("a", 0, 0), caja("a2", 0, 62), caja("b", 400, 31)];
    const rels: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a2", destino: "b" },
    ];
    // En b sí llegan juntas (mismo destino, casi misma dirección): ese par cuenta.
    expect(medirLegibilidad(cajas, rels).anclajesCompartidos).toBeLessThanOrEqual(1);
  });

  it("cuenta la etiqueta que cae dentro de una caja ajena", () => {
    const cajas = [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0)];
    const conEtiqueta: Relacion = { id: "e0", fuente: "a", destino: "b", etiquetada: true };
    expect(medirLegibilidad(cajas, [conEtiqueta]).etiquetasTapadas).toBe(1);
    // Sin etiqueta no hay nada que tapar, aunque la línea pise la caja.
    expect(medirLegibilidad(cajas, [{ ...conEtiqueta, etiquetada: false }]).etiquetasTapadas).toBe(0);
  });

  it("la etiqueta se mide a mitad de RECORRIDO, no de cuerda: un rodeo la saca de la caja", () => {
    const cajas = [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0)];
    const rodeo: Relacion = {
      id: "e0",
      fuente: "a",
      destino: "b",
      etiquetada: true,
      puntos: [
        { x: 100, y: 30 },
        { x: 100, y: 200 },
        { x: 600, y: 200 },
        { x: 600, y: 30 },
      ],
    };
    expect(puntoDeEtiqueta(rodeo.puntos!)).toEqual({ x: 350, y: 200 });
    expect(medirLegibilidad(cajas, [rodeo]).etiquetasTapadas).toBe(0);
  });

  it("las dos reglas pesan en el coste y disparan el hallazgo", () => {
    const base = { cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, anclajesCompartidos: 0, etiquetasTapadas: 0, relaciones: 4 };
    expect(costeDeDisposicion({ ...base, etiquetasTapadas: 1 })).toBeGreaterThan(costeDeDisposicion(base));
    expect(costeDeDisposicion({ ...base, anclajesCompartidos: 1 })).toBeGreaterThan(costeDeDisposicion(base));
    // El anclaje pesa menos que un cruce: separar dos puntas no justifica una X.
    expect(costeDeDisposicion({ ...base, anclajesCompartidos: 1 })).toBeLessThan(costeDeDisposicion({ ...base, cruces: 1 }));
    expect(hayProblemaDeLegibilidad({ ...base, etiquetasTapadas: 1 })).toBe(true);
    expect(hayProblemaDeLegibilidad({ ...base, anclajesCompartidos: 1 })).toBe(true);
  });
});

describe("hayProblemaDeLegibilidad", () => {
  const base = { cruces: 0, solape: 0, sobreCaja: 0, sinRuta: 0, anclajesCompartidos: 0, etiquetasTapadas: 0, relaciones: 40 };

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
