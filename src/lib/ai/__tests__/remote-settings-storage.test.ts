import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadAiSettings,
  saveAiSettings,
  normalizeSettings,
  providerInfo,
  DEFAULT_AI_SETTINGS,
} from "@/lib/ai/remote-settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeSettings — modo híbrido y proveedor por defecto", () => {
  it("reconoce el modo hybrid", () => {
    expect(normalizeSettings({ mode: "hybrid" }).mode).toBe("hybrid");
  });
  it("ignora models que no es objeto", () => {
    expect(normalizeSettings({ models: "no" }).models).toEqual({});
  });
});

describe("providerInfo", () => {
  it("cae al primer proveedor con id inválido", () => {
    expect(providerInfo("no-existe" as any).id).toBe("gemini");
  });
});

describe("loadAiSettings / saveAiSettings", () => {
  it("devuelve el default cuando no hay localStorage", () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("no hace nada al guardar sin localStorage", () => {
    expect(() => saveAiSettings(DEFAULT_AI_SETTINGS)).not.toThrow();
  });

  it("lee y normaliza lo persistido", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify({ mode: "remote", provider: "openai", models: { openai: "gpt-4o" } })),
      setItem: vi.fn(),
    });
    const s = loadAiSettings();
    expect(s.mode).toBe("remote");
    expect(s.provider).toBe("openai");
    expect(s.models.openai).toBe("gpt-4o");
  });

  it("default cuando localStorage está vacío", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("default si el JSON persistido está corrupto", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => "{no-json"), setItem: vi.fn() });
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("persiste serializando a JSON", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: vi.fn() });
    saveAiSettings({ mode: "remote", provider: "gemini", models: {} });
    expect(setItem).toHaveBeenCalledWith(
      "ai_remote_settings",
      JSON.stringify({ mode: "remote", provider: "gemini", models: {} })
    );
  });

  it("traga el error de cuota al guardar", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: vi.fn(),
    });
    expect(() => saveAiSettings(DEFAULT_AI_SETTINGS)).not.toThrow();
  });
});
