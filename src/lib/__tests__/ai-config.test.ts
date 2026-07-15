import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEN_CONFIG_STORAGE,
  DEFAULT_GEN_CONFIG,
  getGenerationConfig,
  setGenerationConfig,
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
