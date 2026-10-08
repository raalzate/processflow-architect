/**
 * #462: el motor `cli` respeta el tope de gasto de la sesión y suma lo que
 * informa el CLI (también en una llamada que falló: igual se cobró).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("@/lib/ai/litert-engine", () => ({ litertGenerate: vi.fn() }));

import { runCli } from "@/lib/ai/providers";
import { gastoSesion, guardarTope, resetGasto, sumarGasto } from "@/lib/agent-cli/cost";

const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe("runCli y el tope de gasto", () => {
  beforeEach(() => resetGasto());
  afterEach(() => vi.unstubAllGlobals());

  it("suma el costo de cada llamada, también de las que fallan", async () => {
    const gen = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: " hola ", costUsd: 0.1 })
      .mockResolvedValueOnce({ ok: false, error: "Not logged in", costUsd: 0.02 });
    vi.stubGlobal("window", { electronAPI: { agentCliGenerate: gen } });
    vi.stubGlobal("localStorage", storage());
    expect(await runCli("P", "S")).toBe("hola");
    await expect(runCli("P")).rejects.toThrow("Not logged in");
    expect(gastoSesion()).toBeCloseTo(0.12);
  });

  it("con lo gastado en el tope no llama al CLI y explica por qué", async () => {
    const gen = vi.fn();
    const s = storage();
    vi.stubGlobal("window", { electronAPI: { agentCliGenerate: gen } });
    vi.stubGlobal("localStorage", s);
    guardarTope(s, 0.5);
    sumarGasto(0.5);
    await expect(runCli("P")).rejects.toThrow(/tope de gasto/);
    expect(gen).not.toHaveBeenCalled();
    // Sin tope, sigue.
    guardarTope(s, null);
    gen.mockResolvedValue({ ok: true, text: "x" });
    expect(await runCli("P")).toBe("x");
  });
});
