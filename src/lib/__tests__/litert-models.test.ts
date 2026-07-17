import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LITERT_MODELS,
  DEFAULT_LITERT_MODEL_ID,
  LITERT_MODEL_STORAGE,
  getLitertModelMeta,
  getSelectedLitertModelId,
  setSelectedLitertModelId,
  getSelectedLitertModelFile,
} from "@/lib/litert-models";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LITERT_MODELS catálogo", () => {
  it("tiene los dos modelos Gemma con metadatos completos", () => {
    expect(LITERT_MODELS.map((m) => m.id).sort()).toEqual(["gemma-e2b", "gemma-e4b"]);
    for (const m of LITERT_MODELS) {
      expect(m.file).toMatch(/\.litertlm$/);
      expect(m.url).toMatch(/^https:\/\//);
      expect(m.approxGB).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("getLitertModelMeta", () => {
  it("devuelve el modelo pedido por id", () => {
    expect(getLitertModelMeta("gemma-e2b").id).toBe("gemma-e2b");
  });
  it("cae al modelo por defecto con id desconocido/nulo", () => {
    expect(getLitertModelMeta("no-existe").id).toBe(DEFAULT_LITERT_MODEL_ID);
    expect(getLitertModelMeta(null).id).toBe(DEFAULT_LITERT_MODEL_ID);
    expect(getLitertModelMeta(undefined).id).toBe(DEFAULT_LITERT_MODEL_ID);
  });
});

describe("selección persistida (localStorage)", () => {
  it("getSelected devuelve el default sin localStorage", () => {
    expect(getSelectedLitertModelId()).toBe(DEFAULT_LITERT_MODEL_ID);
  });

  it("lee un id válido guardado", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "gemma-e2b"),
      setItem: vi.fn(),
    });
    expect(getSelectedLitertModelId()).toBe("gemma-e2b");
  });

  it("ignora un id inválido guardado → default", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "basura"),
      setItem: vi.fn(),
    });
    expect(getSelectedLitertModelId()).toBe(DEFAULT_LITERT_MODEL_ID);
  });

  it("getSelected tolera un localStorage que lanza", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("boom");
      },
    });
    expect(getSelectedLitertModelId()).toBe(DEFAULT_LITERT_MODEL_ID);
  });

  it("setSelected persiste con la clave correcta", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: vi.fn() });
    setSelectedLitertModelId("gemma-e2b");
    expect(setItem).toHaveBeenCalledWith(LITERT_MODEL_STORAGE, "gemma-e2b");
  });

  it("setSelected traga el error de un localStorage roto", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => setSelectedLitertModelId("gemma-e4b")).not.toThrow();
  });

  it("getSelectedLitertModelFile devuelve el archivo del modelo elegido", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => "gemma-e2b"), setItem: vi.fn() });
    expect(getSelectedLitertModelFile()).toBe(getLitertModelMeta("gemma-e2b").file);
  });
});
