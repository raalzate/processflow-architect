/**
 * Motor del agente constructor (014, #308).
 *
 * El pedido del humano fue explícito: el constructor usa el modo de IA VIGENTE,
 * no fuerza la nube. Para no inventar una segunda política de ruteo, el turno del
 * constructor es una `AiTask` (§P5) y quien decide sigue siendo el router. Lo que
 * se prueba acá es la consecuencia: local en modo local, nube en modo remoto, y
 * el aviso ANTES de arrancar cuando el pedido no le entra al motor local.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chooseProvider } from "@/lib/ai/router";
import { builderTurnTask } from "@/lib/ai/tasks";
import {
  BUILDER_LOCAL_MAX_CHARS,
  avisoPedidoGrande,
  cabeEnMotorLocal,
} from "@/lib/ai/agent-engine";
import { publicarEstadoIaLocal, resetEstadoIaLocal } from "@/lib/ai/local-capability";

beforeEach(() => {
  vi.stubGlobal("window", {
    electronAPI: { litertGenerate: vi.fn(), remoteGenerate: vi.fn() },
    navigator: { gpu: {} },
  });
  publicarEstadoIaLocal("disponible");
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetEstadoIaLocal();
});

describe("ruteo del turno del constructor", () => {
  it("modo local: no sale a la nube", () => {
    expect(chooseProvider(builderTurnTask, 500, { mode: "local" }).provider).toBe("local");
  });

  it("modo remoto: va a la nube", () => {
    expect(chooseProvider(builderTurnTask, 500, { mode: "remote" }).provider).toBe("remote");
  });

  it("modo híbrido: un turno chico se resuelve local", () => {
    expect(chooseProvider(builderTurnTask, 500, { mode: "hybrid" }).provider).toBe("local");
  });

  it("modo híbrido: un turno grande se va a la nube", () => {
    const grande = BUILDER_LOCAL_MAX_CHARS + 1;
    expect(chooseProvider(builderTurnTask, grande, { mode: "hybrid" }).provider).toBe("remote");
  });

  it("el turno es una tarea declarada, con prompt propio y salida en texto", () => {
    expect(builderTurnTask.id).toBe("builder-turn");
    const { prompt, system } = builderTurnTask.buildPrompt!({ prompt: "hola", system: "sos X" });
    expect(prompt).toBe("hola");
    expect(system).toBe("sos X");
    expect(builderTurnTask.parse!(" respuesta ")).toBe("respuesta");
  });
});

describe("presupuesto del motor local", () => {
  it("un pedido chico cabe", () => {
    expect(cabeEnMotorLocal(100, 4096)).toBe(true);
  });

  it("un pedido que desborda la ventana no cabe", () => {
    expect(cabeEnMotorLocal(500_000, 4096)).toBe(false);
  });

  it("el aviso dice qué hacer, no sólo que falló", () => {
    const aviso = avisoPedidoGrande();
    expect(aviso).toMatch(/parti|dividi|nube/i);
  });
});
