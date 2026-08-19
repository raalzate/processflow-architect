/**
 * Duración del indicador «El agente está razonando…». Nació de una corrida real
 * que pasó de los dos minutos: sin número, el usuario no sabe si esperar.
 */
import { describe, it, expect } from "vitest";
import { formatElapsed } from "../duration";

describe("formatElapsed", () => {
  it("bajo el minuto muestra segundos sueltos", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(9_400)).toBe("9s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("pasado el minuto, los segundos van con dos dígitos (el ancho no salta)", () => {
    expect(formatElapsed(60_000)).toBe("1m 00s");
    expect(formatElapsed(127_000)).toBe("2m 07s");
    expect(formatElapsed(3_599_000)).toBe("59m 59s");
  });

  it("pasada la hora se corta en minutos", () => {
    expect(formatElapsed(3_600_000)).toBe("1h 00m");
    expect(formatElapsed(3_780_000)).toBe("1h 03m");
    expect(formatElapsed(7_200_000)).toBe("2h 00m");
  });

  it("entradas raras no rompen el indicador", () => {
    expect(formatElapsed(-5)).toBe("0s");
    expect(formatElapsed(NaN)).toBe("0s");
    expect(formatElapsed(undefined as unknown as number)).toBe("0s");
  });
});
