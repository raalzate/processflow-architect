import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock del paquete @litert-lm/core (se importa por CDN con webpackIgnore). Vitest
// intercepta por especificador, así que evitamos el fetch real.
const createConversation = vi.fn();
const engineDelete = vi.fn();
const EngineCreate = vi.fn(async () => ({ createConversation, delete: engineDelete }));
vi.mock("https://cdn.jsdelivr.net/npm/@litert-lm/core@0.13.1/+esm", () => ({
  Engine: { create: EngineCreate },
}));

// Config de generación real no importa aquí; forzamos un maxTokens estable.
vi.mock("@/lib/ai-config", () => ({ getGenerationConfig: () => ({ maxTokens: 2048 }) }));

import {
  webgpuAvailable,
  resetLitertEngine,
  getEngine,
  createLitertConversation,
  litertGenerate,
} from "../litert-engine";

/** Stream falso: emite chunks con la forma { content: [{type:"text", text}] }. */
function fakeStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const t of chunks) yield { content: [{ type: "text", text: t }] };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLitertEngine();
  EngineCreate.mockResolvedValue({ createConversation, delete: engineDelete });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webgpuAvailable", () => {
  it("false si no hay navigator.gpu", async () => {
    vi.stubGlobal("navigator", {});
    expect(await webgpuAvailable()).toBe(false);
  });

  it("false si requestAdapter no devuelve adapter", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => null } });
    expect(await webgpuAvailable()).toBe(false);
  });

  it("true si hay adapter", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({}) } });
    expect(await webgpuAvailable()).toBe(true);
  });

  it("false si requestAdapter lanza", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: async () => {
          throw new Error("no gpu");
        },
      },
    });
    expect(await webgpuAvailable()).toBe(false);
  });
});

describe("getEngine", () => {
  it("crea el engine con el protocolo litert-model:// y cachea por archivo", async () => {
    const e1 = await getEngine("modelo.litertlm");
    const e2 = await getEngine("modelo.litertlm");
    expect(e1).toBe(e2); // mismo archivo → singleton, no recrea
    expect(EngineCreate).toHaveBeenCalledTimes(1);
    expect(EngineCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "litert-model://m/modelo.litertlm" })
    );
  });

  it("recrea (y libera) al cambiar de modelo", async () => {
    await getEngine("a.litertlm");
    await getEngine("b.litertlm");
    expect(EngineCreate).toHaveBeenCalledTimes(2);
    expect(engineDelete).toHaveBeenCalled(); // liberó el anterior
  });

  it("si la creación falla, permite reintentar en la próxima llamada", async () => {
    EngineCreate.mockRejectedValueOnce(new Error("no gpu"));
    await expect(getEngine("f.litertlm")).rejects.toThrow("no gpu");
    // Tras el fallo, enginePromise se reseteó → el próximo intento vuelve a crear.
    EngineCreate.mockResolvedValueOnce({ createConversation, delete: engineDelete });
    const e = await getEngine("f.litertlm");
    expect(e).toBeTruthy();
    expect(EngineCreate).toHaveBeenCalledTimes(2);
  });
});

describe("filtro de logs del runtime WASM", () => {
  it("silencia INFO/[*.cc] y deja pasar los errores reales", async () => {
    const realError = vi.fn();
    const realWarn = vi.fn();
    // window definido → installLitertLogFilter envuelve console al cargar la lib.
    vi.stubGlobal("window", {});
    vi.stubGlobal("console", { error: realError, warn: realWarn, log: vi.fn() });
    await getEngine("filtro.litertlm"); // dispara loadLib → instala el filtro
    console.error("INFO: [environment.cc:30] Creating LiteRT environment");
    console.error("[foo.cc:12] otro log del runtime");
    console.error("Error real de la app");
    console.warn("WARNING: benigno");
    console.warn("warn real");
    expect(realError).toHaveBeenCalledTimes(1);
    expect(realError).toHaveBeenCalledWith("Error real de la app");
    expect(realWarn).toHaveBeenCalledTimes(1);
    expect(realWarn).toHaveBeenCalledWith("warn real");
  });
});

describe("resetLitertEngine", () => {
  it("libera el engine actual", async () => {
    await getEngine("x.litertlm");
    resetLitertEngine();
    // Tras reset, el próximo getEngine crea uno nuevo.
    await getEngine("x.litertlm");
    expect(EngineCreate).toHaveBeenCalledTimes(2);
  });
});

describe("createLitertConversation / litertGenerate", () => {
  it("createLitertConversation pasa el system como preface y acumula el stream", async () => {
    const send = { sendMessageStreaming: vi.fn(() => fakeStream(["Hola ", "mundo"])) };
    createConversation.mockResolvedValue(send);
    const convo = await createLitertConversation("m.litertlm", "sos un asistente");
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ preface: { messages: [{ role: "system", content: "sos un asistente" }] } })
    );
    const tokens: string[] = [];
    const out = await convo.send("hola", (c) => tokens.push(c));
    expect(out).toBe("Hola mundo");
    expect(tokens.join("")).toBe("Hola mundo");
  });

  it("sin system → createConversation recibe undefined", async () => {
    createConversation.mockResolvedValue({ sendMessageStreaming: () => fakeStream(["ok"]) });
    await createLitertConversation("m.litertlm");
    expect(createConversation).toHaveBeenCalledWith(undefined);
  });

  it("litertGenerate extrae system + último user del array de mensajes", async () => {
    const sendMessageStreaming = vi.fn(() => fakeStream(["resp"]));
    createConversation.mockResolvedValue({ sendMessageStreaming });
    const out = await litertGenerate("m.litertlm", [
      { role: "system", content: "SYS" },
      { role: "user", content: "primer" },
      { role: "assistant", content: "medio" },
      { role: "user", content: "último" },
    ]);
    expect(out).toBe("resp");
    // El último turno de usuario es el prompt enviado.
    expect(sendMessageStreaming).toHaveBeenCalledWith("último");
    // El system se fijó como preface.
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ preface: { messages: [{ role: "system", content: "SYS" }] } })
    );
  });
});
