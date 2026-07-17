import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/ai/litert-engine", () => ({ litertGenerate: vi.fn() }));

import { remoteGenerateText } from "@/lib/ai/providers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remoteGenerateText", () => {
  it("lanza si el main no expone remoteGenerate", async () => {
    vi.stubGlobal("window", { electronAPI: {} });
    await expect(remoteGenerateText("openai", "gpt-4o", "hola")).rejects.toThrow(
      "IA remota no disponible."
    );
  });

  it("lanza sin window", async () => {
    await expect(remoteGenerateText("openai", "gpt-4o", "hola")).rejects.toThrow(
      "IA remota no disponible."
    );
  });

  it("delega en electronAPI.remoteGenerate con el payload y devuelve su texto", async () => {
    const remoteGenerate = vi.fn().mockResolvedValue("respuesta nube");
    vi.stubGlobal("window", { electronAPI: { remoteGenerate } });
    const out = await remoteGenerateText("anthropic", "claude-x", "prompt", "sistema");
    expect(remoteGenerate).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-x",
      prompt: "prompt",
      system: "sistema",
    });
    expect(out).toBe("respuesta nube");
  });
});
