import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEN_CONFIG_STORAGE,
  DEFAULT_GEN_CONFIG,
  getGenerationConfig,
  setGenerationConfig,
  nextWindow,
  WINDOW_MAX,
} from "@/lib/ai-config";

function makeLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ai-config · GenerationConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  it("getGenerationConfig devuelve los defaults sin almacenamiento", () => {
    expect(getGenerationConfig()).toEqual(DEFAULT_GEN_CONFIG);
  });

  it("hace merge de lo persistido sobre los defaults", () => {
    vi.stubGlobal(
      "localStorage",
      makeLocalStorage({ [GEN_CONFIG_STORAGE]: JSON.stringify({ maxTokens: 2048 }) })
    );
    const cfg = getGenerationConfig();
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.systemPrompt).toBe(DEFAULT_GEN_CONFIG.systemPrompt);
  });

  it("tolera JSON corrupto y cae a defaults", () => {
    vi.stubGlobal("localStorage", makeLocalStorage({ [GEN_CONFIG_STORAGE]: "{not-json" }));
    expect(getGenerationConfig()).toEqual(DEFAULT_GEN_CONFIG);
  });

  it("sin localStorage (SSR/main) devuelve los defaults", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getGenerationConfig()).toEqual(DEFAULT_GEN_CONFIG);
  });

  it("setGenerationConfig no lanza sin localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => setGenerationConfig({ maxTokens: 1, systemPrompt: "" })).not.toThrow();
  });

  it("setGenerationConfig persiste como JSON", () => {
    const ls = makeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    setGenerationConfig({ maxTokens: 1024, systemPrompt: "hola" });
    expect(ls.setItem).toHaveBeenCalledWith(
      GEN_CONFIG_STORAGE,
      JSON.stringify({ maxTokens: 1024, systemPrompt: "hola" })
    );
  });
});

describe("ai-config · ampliar la ventana (#358)", () => {
  it("el siguiente escalón duplica la ventana", () => {
    expect(nextWindow(4096)).toBe(8192);
    expect(nextWindow(2048)).toBe(4096);
  });

  it("nunca pasa del tope del motor", () => {
    expect(nextWindow(6000)).toBe(WINDOW_MAX);
    expect(nextWindow(WINDOW_MAX)).toBeNull();
    expect(nextWindow(99999)).toBeNull();
  });

  it("sin valor asume el default (la ventana que el usuario no tocó)", () => {
    expect(nextWindow(undefined)).toBe(8192);
  });
});
