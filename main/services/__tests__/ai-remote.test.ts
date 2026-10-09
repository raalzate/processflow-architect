import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * `electron` no existe en la suite. `safeStorage` se simula con un cifrado
 * reversible trivial: lo que se prueba es QUÉ sale hacia el proveedor, no el
 * llavero del sistema.
 */
let userData = "";
vi.mock("electron", () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ""),
  },
}));

import { aiKeyStatus, remoteGenerate, setAiKey } from "../ai-remote";

const fetchMock = vi.fn();

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "ai-remote-"));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(userData, { recursive: true, force: true });
});

const respuestaChat = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe("OpenRouter", () => {
  it("acepta guardar su llave y la reporta configurada sin exponerla", () => {
    expect(setAiKey("openrouter", " sk-or-123 ")).toEqual({ ok: true });
    expect(aiKeyStatus().openrouter).toBe(true);
    // La llave en disco va cifrada, nunca en claro.
    expect(fs.readFileSync(path.join(userData, "ai-keys.json"), "utf8")).not.toContain("sk-or-123");
  });

  it("llama al endpoint compatible con OpenAI con la llave y el modelo tal cual", async () => {
    setAiKey("openrouter", "sk-or-123");
    fetchMock.mockResolvedValue(respuestaChat("  hola  "));

    const out = await remoteGenerate({
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      prompt: "p",
      system: "s",
    });

    expect(out).toBe("hola");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer sk-or-123");
    expect(JSON.parse(init.body)).toEqual({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "p" },
      ],
    });
  });

  it("un error del proveedor se lanza con su nombre y estado", async () => {
    setAiKey("openrouter", "sk-or-123");
    fetchMock.mockResolvedValue({ ok: false, status: 402, text: async () => "sin crédito" });
    await expect(
      remoteGenerate({ provider: "openrouter", model: "x/y", prompt: "p" }),
    ).rejects.toThrow("OpenRouter 402: sin crédito");
  });

  it("sin llave no sale ninguna petición", async () => {
    await expect(
      remoteGenerate({ provider: "openrouter", model: "x/y", prompt: "p" }),
    ).rejects.toThrow("No hay llave configurada para openrouter");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("OpenAI tras extraer el cuerpo compartido", () => {
  it("sigue mandando el mismo cuerpo, sin system si no hay", async () => {
    setAiKey("openai", "sk-1");
    fetchMock.mockResolvedValue(respuestaChat("ok"));
    await remoteGenerate({ provider: "openai", model: "gpt-4o-mini", prompt: "p" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "p" }],
    });
  });
});
