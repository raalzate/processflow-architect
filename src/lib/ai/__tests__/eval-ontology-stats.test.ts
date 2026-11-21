import { describe, expect, it } from "vitest";
import { describirNumeros, mcnemarExacto, resumirCorridas } from "../eval-ontology";

const p = (acierto: boolean, inexistentes: string[] = []) => ({ acierto, faltan: [], inexistentes });

// #765: la mejora se afirma con varias corridas y una prueba por pares, no con una sola.
describe("mcnemarExacto", () => {
  it("cuenta sólo los pares discordantes", () => {
    const r = mcnemarExacto([true, true, false, false, true], [true, false, true, true, true]);
    expect(r).toMatchObject({ soloA: 1, soloB: 2 });
  });

  it("sin discordancias no hay evidencia de diferencia (p = 1)", () => {
    expect(mcnemarExacto([true, false], [true, false]).p).toBe(1);
  });

  it("4 a 0 a favor de un modo no alcanza para p < 0,05", () => {
    // Binomial bilateral: 2 · 0,5^4 = 0,125. Es justo el caso de la corrida de #697.
    const a = [false, false, false, false, true];
    const b = [true, true, true, true, true];
    expect(mcnemarExacto(a, b).p).toBeCloseTo(0.125, 6);
  });

  it("10 a 0 sí es significativo", () => {
    const a = Array(10).fill(false);
    const b = Array(10).fill(true);
    expect(mcnemarExacto(a, b).p).toBeCloseTo(2 * 0.5 ** 10, 9);
  });

  it("es simétrica y nunca pasa de 1", () => {
    const a = [true, false, true, false, false, true];
    const b = [false, true, true, true, false, false];
    expect(mcnemarExacto(a, b).p).toBe(mcnemarExacto(b, a).p);
    expect(mcnemarExacto(a, b).p).toBeLessThanOrEqual(1);
  });

  it("rechaza listas de distinto largo: no son pares", () => {
    expect(() => mcnemarExacto([true], [true, false])).toThrow();
  });
});

describe("resumirCorridas", () => {
  it("promedia la exactitud y da el rango entre corridas", () => {
    const r = resumirCorridas([
      [p(true), p(true), p(false), p(false)],
      [p(true), p(true), p(true), p(false)],
    ]);
    expect(r.corridas).toBe(2);
    expect(r.exactitudMedia).toBeCloseTo(0.625, 6);
    expect(r.exactitudMin).toBe(0.5);
    expect(r.exactitudMax).toBe(0.75);
  });

  it("cuenta respuestas con elementos inexistentes por corrida", () => {
    const r = resumirCorridas([[p(true, ["Facturita"]), p(false)], [p(true), p(true)]]);
    expect(r.inexistentesMedia).toBeCloseTo(0.5, 6);
  });

  it("sin corridas devuelve ceros, no NaN", () => {
    expect(resumirCorridas([])).toEqual({ corridas: 0, exactitudMedia: 0, exactitudMin: 0, exactitudMax: 0, inexistentesMedia: 0 });
  });
});

describe("describirNumeros", () => {
  it("da media, mediana y p95", () => {
    const d = describirNumeros([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(d.media).toBe(55);
    expect(d.p50).toBe(50);
    expect(d.p95).toBe(100);
    expect(d.n).toBe(10);
  });

  it("vacío no rompe", () => {
    expect(describirNumeros([])).toEqual({ n: 0, media: 0, p50: 0, p95: 0 });
  });
});
