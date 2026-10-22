import { describe, it, expect } from "vitest";
import {
  MARGEN_S,
  PESO_DEL_RITMO_PREVIO_S,
  PRIMERA_MAX,
  debeArrancar,
  decidirSonar,
  inicioDelSiguiente,
  primeraCorta,
  ritmoDeSintesis,
  segundosPorCaracter,
  seQuedaSinAudio,
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

describe("ritmo recordado entre lecturas (#637)", () => {
  it("sin muestras usa el ritmo que se midió antes, no 1", () => {
    expect(ritmoDeSintesis([], 2.5)).toBeCloseTo(2.5);
    // Sin previo sigue siendo 1: es la primera lectura de la sesión.
    expect(ritmoDeSintesis([{ caracteres: 40, sintesisS: 9, audioS: 2 }])).toBe(1);
  });

  it("con un ritmo previo el motor ya estaba caliente: la primera muestra sí cuenta", () => {
    // Previo 1 con peso de 5 s de audio; la muestra dice 3 s de síntesis por 1 s de audio.
    const r = ritmoDeSintesis([{ caracteres: 20, sintesisS: 3, audioS: 1 }], 1);
    expect(r).toBeCloseTo((3 + 1 * PESO_DEL_RITMO_PREVIO_S) / (1 + PESO_DEL_RITMO_PREVIO_S));
  });

  it("lo medido pesa más a medida que hay más audio", () => {
    const muchas = Array.from({ length: 20 }, () => ({ caracteres: 40, sintesisS: 4, audioS: 2 }));
    expect(ritmoDeSintesis(muchas, 1)).toBeGreaterThan(1.8);
  });

  it("con ritmo lento conocido no arranca con la primera frase sola", () => {
    // 2 s de audio en cola, faltan 20 s y la síntesis va al doble del habla.
    expect(debeArrancar(2, 20, 2)).toBe(false);
    expect(debeArrancar(20, 20, 2)).toBe(true);
  });
});

describe("seQuedaSinAudio (#637)", () => {
  it("avisa cuando lo programado ya terminó o termina antes del margen", () => {
    expect(seQuedaSinAudio(10, 9.9)).toBe(true);
    expect(seQuedaSinAudio(10, 10 + MARGEN_S / 2)).toBe(true);
    expect(seQuedaSinAudio(10, 12)).toBe(false);
  });

  it("antes de programar nada no hay corte: todavía no empezó a sonar", () => {
    expect(seQuedaSinAudio(10, 0)).toBe(false);
  });
});

/**
 * Lectura SIMULADA en tiempo determinista: el worker sintetiza en serie a un ritmo
 * fijo y cada frase se decide con `decidirSonar`, igual que en `useLeerEnVoz`.
 * Mide los silencios entre frases después de que empezó a sonar.
 */
function simular(opts: { frases: number; audioS: number; ritmoReal: number; previo?: number }) {
  const muestras: { caracteres: number; sintesisS: number; audioS: number }[] = [];
  let reloj = 0; // reloj de síntesis (cuándo termina cada frase)
  let fin = 0; // fin de lo programado en el reloj de audio
  let sonando = false;
  let enCola: number[] = [];
  const tramos: Array<{ inicio: number; fin: number }> = [];
  for (let i = 0; i < opts.frases; i++) {
    const sintesisS = opts.audioS * opts.ritmoReal;
    reloj += sintesisS;
    muestras.push({ caracteres: 40, sintesisS, audioS: opts.audioS });
    enCola.push(opts.audioS);
    const faltaS = (opts.frases - i - 1) * opts.audioS;
    sonando = decidirSonar({
      sonando,
      ahora: reloj,
      fin,
      enColaS: enCola.reduce((s, x) => s + x, 0),
      faltaS,
      fraseMaxS: faltaS > 0 ? opts.audioS : 0,
      ritmo: ritmoDeSintesis(muestras, opts.previo),
    });
    if (!sonando) continue;
    for (const d of enCola) {
      const t = inicioDelSiguiente(reloj, fin, 0);
      tramos.push({ inicio: t, fin: t + d });
      fin = t + d;
    }
    enCola = [];
  }
  const silencios = tramos.slice(1).filter((t, k) => t.inicio - tramos[k].fin > 1e-9).length;
  return { silencios, arranque: tramos[0]?.inicio ?? 0, tramos: tramos.length };
}

describe("decidirSonar · la lectura no suena a saltos (#637)", () => {
  it("con el ritmo lento ya aprendido, después de arrancar no hay ningún silencio", () => {
    const r = simular({ frases: 12, audioS: 3, ritmoReal: 2, previo: 2 });
    expect(r.tramos).toBe(12);
    expect(r.silencios).toBe(0);
  });

  it("la primera lectura de la sesión, sin ritmo previo, a lo sumo se detiene UNA vez a juntar audio", () => {
    const r = simular({ frases: 12, audioS: 3, ritmoReal: 2 });
    expect(r.tramos).toBe(12);
    expect(r.silencios).toBeLessThanOrEqual(1);
  });

  it("si la síntesis va más rápido que el habla, arranca con la primera frase y no corta", () => {
    const r = simular({ frases: 12, audioS: 3, ritmoReal: 0.5, previo: 0.5 });
    expect(r.arranque).toBeCloseTo(1.5);
    expect(r.silencios).toBe(0);
  });

  it("sigue sonando mientras no se quede sin audio, aunque el colchón ya no alcance", () => {
    expect(decidirSonar({ sonando: true, ahora: 1, fin: 5, enColaS: 0.1, faltaS: 100, ritmo: 3 })).toBe(true);
    // Se quedó sin audio y lo que hay no alcanza: vuelve a juntar.
    expect(decidirSonar({ sonando: true, ahora: 6, fin: 5, enColaS: 0.1, faltaS: 100, ritmo: 3 })).toBe(false);
  });
});

describe("debeArrancar cuenta la frase entera (#637)", () => {
  it("con ritmo 2, no alcanza un colchón igual a lo que falta: falta además la última frase", () => {
    expect(debeArrancar(18, 18, 2, 3)).toBe(false);
    expect(debeArrancar(21, 18, 2, 3)).toBe(true);
  });

  it("con síntesis rápida alcanza con cubrir lo que tarda la frase más larga", () => {
    expect(debeArrancar(1, 30, 0.5, 3)).toBe(false);
    expect(debeArrancar(1.5, 30, 0.5, 3)).toBe(true);
  });
});
