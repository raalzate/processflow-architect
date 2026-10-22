import { describe, it, expect } from "vitest";
import {
  MARGEN_S,
  PRIMERA_MAX,
  debeArrancar,
  inicioDelSiguiente,
  primeraCorta,
  ritmoDeSintesis,
  segundosPorCaracter,
} from "../cola-voz";

describe("primeraCorta", () => {
  it("deja igual una primera frase corta", () => {
    expect(primeraCorta(["Hola.", "Segunda."])).toEqual(["Hola.", "Segunda."]);
  });

  it("parte la primera por la última coma antes del máximo y conserva el resto", () => {
    const larga = "Revisé las tres vistas del dominio, el flujo de pagos y la conciliación bancaria del cierre mensual.";
    const out = primeraCorta([larga, "Otra."]);
    expect(out[0]).toBe("Revisé las tres vistas del dominio,");
    expect(out[0].length).toBeLessThanOrEqual(PRIMERA_MAX);
    expect(out.slice(1)).toEqual(["el flujo de pagos y la conciliación bancaria del cierre mensual.", "Otra."]);
    // No se pierde ni se duplica texto.
    expect(out.slice(0, 2).join(" ")).toBe(larga);
  });

  it("sin comas, parte por el último espacio", () => {
    const larga = "palabra ".repeat(20).trim();
    const out = primeraCorta([larga], 30);
    expect(out[0].length).toBeLessThanOrEqual(30);
    expect(out.join(" ")).toBe(larga);
  });

  it("sin dónde partir, no rompe la palabra", () => {
    const una = "x".repeat(120);
    expect(primeraCorta([una])).toEqual([una]);
  });

  it("una lista vacía sigue vacía", () => {
    expect(primeraCorta([])).toEqual([]);
  });
});

describe("ritmo y estimación", () => {
  it("sin muestras asume ritmo 1 y habla a ~15 car/s", () => {
    expect(ritmoDeSintesis([])).toBe(1);
    expect(segundosPorCaracter([])).toBeCloseTo(1 / 15);
  });

  it("la primera muestra no cuenta para el ritmo: lleva el arranque del motor", () => {
    expect(ritmoDeSintesis([{ caracteres: 40, sintesisS: 9, audioS: 2 }])).toBe(1);
  });

  it("promedia ponderando por audio, no por frase", () => {
    const m = [
      { caracteres: 30, sintesisS: 1, audioS: 2 },
      { caracteres: 90, sintesisS: 5, audioS: 6 },
    ];
    expect(segundosPorCaracter(m)).toBeCloseTo(8 / 120);
    const arranque = { caracteres: 20, sintesisS: 9, audioS: 1 };
    expect(ritmoDeSintesis([arranque, ...m])).toBeCloseTo(6 / 8);
  });
});

describe("debeArrancar", () => {
  it("sin nada en cola, no suena", () => {
    expect(debeArrancar(0, 10, 0.5)).toBe(false);
  });

  it("síntesis más rápida que el audio: suena con la primera frase", () => {
    expect(debeArrancar(1.5, 30, 0.6)).toBe(true);
  });

  it("síntesis lenta: espera a juntar lo que cubre lo que falta", () => {
    // ritmo 1.5 → lo que falta (20 s) tarda 30 s: hacen falta 10 s en cola.
    expect(debeArrancar(4, 20, 1.5)).toBe(false);
    expect(debeArrancar(10, 20, 1.5)).toBe(true);
  });

  it("si ya no falta sintetizar nada, suena aunque el ritmo sea malo", () => {
    expect(debeArrancar(2, 0, 5)).toBe(true);
  });
});

describe("inicioDelSiguiente", () => {
  it("encadena justo donde termina el anterior: sin hueco", () => {
    expect(inicioDelSiguiente(10, 12.4)).toBe(12.4);
  });

  it("si el anterior ya terminó, arranca ya con margen", () => {
    expect(inicioDelSiguiente(10, 9)).toBe(10 + MARGEN_S);
  });
});
