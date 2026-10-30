/**
 * Motor del agente constructor (014, #308 · #666).
 *
 * El constructor escribe sobre el modelo del humano y lo que publica no se
 * deshace solo: el motor local chico no lo hace (#666). Corre con el arnés (el
 * CLI del usuario, modo `cli`) o con la API remota. En modo `local` no corre:
 * los CLI también mandan el prompt a la nube de su proveedor, y el modo local
 * promete que nada sale de la máquina (§P4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chooseProvider } from "@/lib/ai/router";
import { builderTurnTask, creativeDiagramTask } from "@/lib/ai/tasks";
import { motorDelConstructor, avisoSinMotor } from "@/lib/ai/agent-engine";
import { AI_MODES } from "@/lib/ai/remote-settings";
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

describe("ruteo de las tareas del constructor", () => {
  it("modo remoto: va a la nube", () => {
    expect(chooseProvider(builderTurnTask, 500, { mode: "remote" }).provider).toBe("remote");
  });

  it("modo híbrido: ni un turno chico se resuelve local", () => {
    expect(chooseProvider(builderTurnTask, 500, { mode: "hybrid" }).provider).toBe("remote");
    expect(chooseProvider(creativeDiagramTask, 500, { mode: "hybrid" }).provider).toBe("remote");
  });

  it("el turno es una tarea declarada, con prompt propio y salida en texto", () => {
    expect(builderTurnTask.id).toBe("builder-turn");
    const { prompt, system } = builderTurnTask.buildPrompt!({ prompt: "hola", system: "sos X" });
    expect(prompt).toBe("hola");
    expect(system).toBe("sos X");
    expect(builderTurnTask.parse!(" respuesta ")).toBe("respuesta");
  });
});

describe("motor del constructor (#666)", () => {
  it("ningún modo, con o sin CLI, corre el constructor con la IA local", () => {
    for (const mode of AI_MODES) {
      for (const cli of [true, false]) {
        const m = motorDelConstructor(mode, { cli });
        if (m.kind === "ok") expect(m.mode, `${mode} cli=${cli}`).not.toBe("local");
      }
    }
  });

  it("modo local: no arranca, ni siquiera con un CLI instalado (también sale a la nube)", () => {
    expect(motorDelConstructor("local", { cli: true }).kind).toBe("bloqueado");
    expect(motorDelConstructor("local", { cli: false }).kind).toBe("bloqueado");
  });

  it("modo CLI con CLI instalado: razona el arnés", () => {
    expect(motorDelConstructor("cli", { cli: true })).toMatchObject({ kind: "ok", mode: "cli" });
  });

  it("modo CLI sin CLI instalado: no cae al local en silencio", () => {
    expect(motorDelConstructor("cli", { cli: false }).kind).toBe("bloqueado");
  });

  it("híbrido y remoto: la nube ya es opt-in, corre con la API", () => {
    expect(motorDelConstructor("hybrid", { cli: false })).toMatchObject({ kind: "ok", mode: "remote" });
    expect(motorDelConstructor("remote", { cli: true })).toMatchObject({ kind: "ok", mode: "remote" });
  });

  it("el aviso dice cómo destrabarlo, no sólo que no se puede", () => {
    expect(avisoSinMotor()).toMatch(/CLI/);
    expect(avisoSinMotor()).toMatch(/remota/);
    expect(avisoSinMotor()).toMatch(/Ajustes/);
  });
});
