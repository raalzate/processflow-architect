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
  releaseLitertContext,
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

/**
 * El engine C++ guarda UN solo contexto procesado: abrir una conversación sin
 * cerrar la anterior moría con `RET_CHECK ... !HasProcessedContext()`. Pasaba al
 * lanzar una tarea suelta (p.ej. «Extrae los drivers») con el chat del agente
 * abierto. Estas pruebas son el freno de ese incidente.
 */
describe("un solo contexto vivo por engine", () => {
  /** Conversación falsa: cuenta sus delete y responde algo fijo. */
  const fakeConvo = (text = "ok") => ({
    sendMessageStreaming: vi.fn((_msg: string) => fakeStream([text])),
    cancel: vi.fn(),
    delete: vi.fn(async () => {}),
  });

  it("crear una conversación libera la anterior", async () => {
    const primera = fakeConvo();
    const segunda = fakeConvo();
    createConversation.mockResolvedValueOnce(primera).mockResolvedValueOnce(segunda);

    await createLitertConversation("m.litertlm", "SYS A");
    await createLitertConversation("m.litertlm", "SYS B");

    expect(primera.delete).toHaveBeenCalledTimes(1);
    expect(segunda.delete).not.toHaveBeenCalled();
  });

  it("una tarea suelta (litertGenerate) cierra su conversación al terminar", async () => {
    const suelta = fakeConvo("resp");
    createConversation.mockResolvedValue(suelta);
    await litertGenerate("m.litertlm", [{ role: "user", content: "hola" }]);
    expect(suelta.delete).toHaveBeenCalledTimes(1);
  });

  it("si le roban el slot, la conversación se reabre y reenvía el historial", async () => {
    const chat1 = fakeConvo("primera respuesta");
    const suelta = fakeConvo("artefacto");
    const chat2 = fakeConvo("segunda respuesta");
    createConversation
      .mockResolvedValueOnce(chat1)
      .mockResolvedValueOnce(suelta)
      .mockResolvedValueOnce(chat2);

    const convo = await createLitertConversation("m.litertlm", "SYS");
    expect(await convo.send("primer turno")).toBe("primera respuesta");

    // En medio del bucle, una generación suelta toma el engine.
    await litertGenerate("m.litertlm", [{ role: "user", content: "generá" }]);

    // El siguiente envío NO explota: reabre con el mismo preface y lleva el hilo.
    expect(await convo.send("segundo turno")).toBe("segunda respuesta");
    expect(createConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ preface: { messages: [{ role: "system", content: "SYS" }] } })
    );
    const enviado = chat2.sendMessageStreaming.mock.calls[0][0];
    expect(enviado).toContain("primer turno");
    expect(enviado).toContain("primera respuesta");
    expect(enviado.endsWith("segundo turno")).toBe(true);
  });

  it("releaseLitertContext libera la conversación viva sin recrear el engine", async () => {
    const viva = fakeConvo();
    createConversation.mockResolvedValue(viva);
    await createLitertConversation("m.litertlm", "SYS");
    releaseLitertContext();
    await new Promise((r) => setTimeout(r, 0)); // la cola es asíncrona
    expect(viva.delete).toHaveBeenCalledTimes(1);
    expect(EngineCreate).toHaveBeenCalledTimes(1); // el modelo sigue cargado
  });

  it("si el RET_CHECK del contexto igual salta, recrea el engine y reintenta", async () => {
    const buena = fakeConvo();
    createConversation
      .mockRejectedValueOnce(
        new Error("RET_CHECK failure (context_handler.h:182) !HasProcessedContext()")
      )
      .mockResolvedValueOnce(buena);

    const convo = await createLitertConversation("m.litertlm", "SYS");
    expect(await convo.send("hola")).toBe("ok");
    expect(EngineCreate).toHaveBeenCalledTimes(2); // engine recreado tras el RET_CHECK
  });

  it("un error de creación que NO es del contexto se propaga", async () => {
    createConversation.mockRejectedValueOnce(new Error("out of memory"));
    await expect(createLitertConversation("m.litertlm")).rejects.toThrow("out of memory");
  });
});
