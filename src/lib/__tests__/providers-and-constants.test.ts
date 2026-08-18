import { afterEach, describe, expect, it, vi } from "vitest";

// La inferencia local corre en el renderer (LiteRT-LM/WebGPU). En el test mockeamos
// el motor para verificar que runLocal delega correctamente sin tocar WebGPU/CDN.
vi.mock("@/lib/ai/litert-engine", () => ({
  litertGenerate: vi.fn(),
}));
import { litertGenerate } from "@/lib/ai/litert-engine";

import {
  localAvailable,
  remoteAvailable,
  runLocal,
  runRemoteFlow,
} from "@/lib/ai/providers";
import {
  nodeTypeColors,
  nodeTypeColor,
  STORAGE_API_KEY,
  STORAGE_MODEL,
  STORAGE_SAVED_FILES,
  STORAGE_LAST_FILE_ID,
  STORAGE_TOKEN_USAGE,
  STORAGE_TOKEN_LIMIT,
} from "@/lib/graph-constants";
import {
  BUILTIN_VIEWS,
  MAX_CUSTOM_VIEWS,
  MAX_INJECTED_VIEWS,
  type DesignView,
} from "@/lib/views-types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Helper to build a localStorage stub. providers.remoteAvailable() reads
// localStorage.getItem("gemini_api_key").
function makeLocalStorage(value: string | null) {
  return {
    getItem: vi.fn((key: string) =>
      key === "gemini_api_key" ? value : null,
    ),
  };
}

// =============================================================================
// providers.ts
// =============================================================================
describe("providers", () => {
  describe("localAvailable", () => {
    it("returns false when window is undefined", () => {
      // No window stubbed -> api() returns undefined in node env.
      expect(localAvailable()).toBe(false);
    });

    it("returns false when window has no electronAPI", () => {
      vi.stubGlobal("window", {});
      expect(localAvailable()).toBe(false);
    });

    it("returns true when electronAPI is present (LiteRT corre en el renderer)", () => {
      vi.stubGlobal("window", { electronAPI: {} });
      expect(localAvailable()).toBe(true);
    });
  });

  describe("remoteAvailable", () => {
    it("returns false when window is undefined", () => {
      expect(remoteAvailable()).toBe(false);
    });

    it("returns false when electronAPI lacks runGenkit", () => {
      vi.stubGlobal("window", { electronAPI: { generateText: vi.fn() } });
      vi.stubGlobal("localStorage", makeLocalStorage("a-key"));
      expect(remoteAvailable()).toBe(false);
    });

    // "remote" ahora = generación por proveedor de nube (Gemini/OpenAI/Anthropic),
    // expuesta por el main como `remoteGenerate`. Basta con esa capacidad presente.
    it("returns true when remoteGenerate is exposed by the main process", () => {
      vi.stubGlobal("window", { electronAPI: { remoteGenerate: vi.fn() } });
      vi.stubGlobal("localStorage", makeLocalStorage(null));
      expect(remoteAvailable()).toBe(true);
    });

    it("returns false when remoteGenerate is absent", () => {
      vi.stubGlobal("window", { electronAPI: { runGenkit: vi.fn() } });
      vi.stubGlobal("localStorage", makeLocalStorage(null));
      expect(remoteAvailable()).toBe(false);
    });
  });

  describe("runLocal", () => {
    const mockGen = vi.mocked(litertGenerate);

    it("delega en litertGenerate con system+user y devuelve texto recortado", async () => {
      mockGen.mockResolvedValueOnce("  hola mundo  ");
      const out = await runLocal("prompt-text", "system-text");
      expect(mockGen).toHaveBeenCalledWith(
        expect.any(String), // archivo del modelo LiteRT seleccionado
        [
          { role: "system", content: "system-text" },
          { role: "user", content: "prompt-text" },
        ]
      );
      expect(out).toBe("hola mundo");
    });

    it("omite el system cuando no se provee", async () => {
      mockGen.mockResolvedValueOnce("x");
      await runLocal("only-prompt");
      expect(mockGen).toHaveBeenCalledWith(expect.any(String), [
        { role: "user", content: "only-prompt" },
      ]);
    });

    it("devuelve cadena vacía si el motor resuelve vacío", async () => {
      mockGen.mockResolvedValueOnce("" as any);
      expect(await runLocal("p")).toBe("");
    });

    it("propaga el error del motor", async () => {
      mockGen.mockRejectedValueOnce(new Error("boom"));
      await expect(runLocal("p")).rejects.toThrow("boom");
    });
  });

  describe("runRemoteFlow", () => {
    it("throws when remote engine unavailable (no electronAPI)", async () => {
      vi.stubGlobal("window", {});
      await expect(runRemoteFlow("flowA", {})).rejects.toThrow(
        "IA local (flujos) no disponible.",
      );
    });

    it("throws when runGenkit missing", async () => {
      vi.stubGlobal("window", { electronAPI: {} });
      await expect(runRemoteFlow("flowA", {})).rejects.toThrow(
        "IA local (flujos) no disponible.",
      );
    });

    it("calls electronAPI.runGenkit with flow + input and returns its result", async () => {
      const result = { ok: true, data: [1, 2, 3] };
      const runGenkit = vi.fn().mockResolvedValue(result);
      vi.stubGlobal("window", { electronAPI: { runGenkit } });
      const input = { foo: "bar" };
      const out = await runRemoteFlow("architectFlow", input);
      expect(runGenkit).toHaveBeenCalledWith("architectFlow", input);
      expect(out).toBe(result);
    });

    it("propagates rejection from runGenkit", async () => {
      const runGenkit = vi.fn().mockRejectedValue(new Error("remote-fail"));
      vi.stubGlobal("window", { electronAPI: { runGenkit } });
      await expect(runRemoteFlow("f", {})).rejects.toThrow("remote-fail");
    });
  });
});

// =============================================================================
// graph-constants.ts
// =============================================================================
describe("graph-constants", () => {
  it("nodeTypeColors has entries with string (tailwind class) values", () => {
    const keys = Object.keys(nodeTypeColors);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(typeof nodeTypeColors[k]).toBe("string");
      expect(nodeTypeColors[k]).toMatch(/^bg-/);
    }
  });

  it("cubre los tipos de TODAS las notaciones, no solo los de DDD", () => {
    for (const key of [
      "Comando",
      "Evento",
      "Actor",
      "Agregado",
      // BPMN / C4 / UML: antes salían sin color en los paneles del visor.
      "Tarea",
      "Compuerta Exclusiva",
      "Contenedor",
      "Clase",
      "Estado",
    ]) {
      expect(nodeTypeColors).toHaveProperty(key);
    }
  });

  it("nodeTypeColor cae a gris para un tipo fuera del registro", () => {
    expect(nodeTypeColor("Comando")).toMatch(/^bg-/);
    // Cambio intencional (spec 003): el gris de caída sale del tema, no de la
    // paleta de Tailwind, para que respete el modo oscuro como el resto.
    expect(nodeTypeColor("TipoLibreDelUsuario")).toBe("bg-muted-foreground");
  });

  it("STORAGE_* constants have expected values", () => {
    expect(STORAGE_API_KEY).toBe("gemini_api_key");
    expect(STORAGE_MODEL).toBe("gemini_model");
    expect(STORAGE_SAVED_FILES).toBe("saved_json_files");
    expect(STORAGE_LAST_FILE_ID).toBe("last_opened_file_id");
    expect(STORAGE_TOKEN_USAGE).toBe("token_usage");
    expect(STORAGE_TOKEN_LIMIT).toBe("token_limit");
  });

  it("STORAGE_API_KEY matches the key remoteAvailable reads", () => {
    // remoteAvailable() reads localStorage.getItem("gemini_api_key").
    expect(STORAGE_API_KEY).toBe("gemini_api_key");
  });
});

// =============================================================================
// views-types.ts
// =============================================================================
describe("views-types", () => {
  it("MAX_CUSTOM_VIEWS === 50", () => {
    expect(MAX_CUSTOM_VIEWS).toBe(50);
  });

  it("MAX_INJECTED_VIEWS === 10", () => {
    expect(MAX_INJECTED_VIEWS).toBe(10);
  });

  it("BUILTIN_VIEWS is a non-empty array", () => {
    expect(Array.isArray(BUILTIN_VIEWS)).toBe(true);
    expect(BUILTIN_VIEWS.length).toBeGreaterThan(0);
  });

  it("every BUILTIN_VIEW has a valid DesignView shape", () => {
    for (const v of BUILTIN_VIEWS) {
      expect(typeof v.id).toBe("string");
      expect(v.id.length).toBeGreaterThan(0);
      expect(typeof v.name).toBe("string");
      expect(v.name.length).toBeGreaterThan(0);
      expect(["design", "graph"]).toContain(v.kind);
      expect(typeof v.createdAt).toBe("string");
    }
  });

  it("builtin views are flagged builtin === true", () => {
    for (const v of BUILTIN_VIEWS) {
      expect(v.builtin).toBe(true);
    }
  });

  it("a custom-view fixture conforms to the DesignView type", () => {
    const custom: DesignView = {
      id: "custom-1",
      name: "Mi Vista",
      kind: "graph",
      description: "vista custom de prueba",
      createdAt: new Date().toISOString(),
      graph: { nodes: [], edges: [] } as any,
    };
    expect(custom.kind).toBe("graph");
    expect(custom.builtin).toBeUndefined();
  });
});
