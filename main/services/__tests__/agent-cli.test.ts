import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { candidateDirs, cancelAgentCli, cliStatus, generateWithCli, resolveCli, runAgentCli, type Proceso, type Spawn } from "../agent-cli";

/** Proceso falso: emite lo que el test le diga y registra el kill. */
function procesoFalso() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const p = new EventEmitter() as EventEmitter & Proceso & { killed: string[] };
  (p as any).stdout = stdout;
  (p as any).stderr = stderr;
  p.killed = [];
  p.kill = (s?: NodeJS.Signals) => {
    p.killed.push(s ?? "SIGTERM");
    return true;
  };
  return { p: p as EventEmitter & Proceso & { killed: string[] }, stdout, stderr };
}

const deps = (spawn: Spawn, extra: Record<string, unknown> = {}) => ({
  spawn,
  exists: (p: string) => p.endsWith("/.local/bin/claude"),
  home: "/home/u",
  env: { PATH: "/usr/bin", NODE_ENV: "test" } as NodeJS.ProcessEnv,
  ...extra,
});

describe("resolveCli / candidateDirs", () => {
  it("busca en el PATH y en los directorios donde se instalan los CLI que una app GUI no ve", () => {
    const dirs = candidateDirs("/home/u", "/a:/b");
    expect(dirs.slice(0, 2)).toEqual(["/a", "/b"]);
    expect(dirs).toContain("/home/u/.local/bin");
    expect(dirs).toContain("/opt/homebrew/bin");
    expect(resolveCli("claude", deps(vi.fn() as any))).toBe("/home/u/.local/bin/claude");
    expect(resolveCli("codex", deps(vi.fn() as any))).toBeNull();
  });
});

describe("cliStatus", () => {
  it("reporta instalado con versión, y no instalado sin binario", async () => {
    const spawn: Spawn = (_c, _a) => {
      const { p, stdout } = procesoFalso();
      setTimeout(() => {
        stdout.emit("data", "2.1.293 (Claude Code)\n");
        p.emit("close", 0);
      }, 0);
      return p;
    };
    const s = await cliStatus(deps(spawn));
    expect(s).toEqual([
      { cli: "claude", installed: true, version: "2.1.293 (Claude Code)" },
      { cli: "codex", installed: false },
    ]);
  });
});

// Feature 021: el CLI como generador de texto puro para el router.
describe("generateWithCli", () => {
  const input = { cli: "claude" as const, prompt: "P", system: "S" };

  it("devuelve el texto del `result` cuando el proceso termina bien", async () => {
    let args: string[] = [];
    const spawn: Spawn = (_c, a) => {
      args = a;
      const { p, stdout } = procesoFalso();
      setTimeout(() => {
        stdout.emit("data", '{"type":"result","subtype":"success","result":"Hola"}\n');
        p.emit("close", 0);
      }, 0);
      return p;
    };
    const r = await generateWithCli(input, deps(spawn));
    expect(r).toEqual({ ok: true, text: "Hola" });
    expect(args).toContain("--no-session-persistence");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
  });

  it("lanza con stdin cerrado y un aviso en stderr no tapa la respuesta", async () => {
    let opts: any;
    const spawn: Spawn = (_c, _a, o) => {
      opts = o;
      const { p, stdout, stderr } = procesoFalso();
      setTimeout(() => {
        stderr.emit("data", "Warning: no stdin data received in 3s\n");
        stdout.emit("data", '{"type":"result","subtype":"success","result":"Hola"}');
        p.emit("close", 0);
      }, 0);
      return p;
    };
    expect(await generateWithCli(input, deps(spawn))).toEqual({ ok: true, text: "Hola" });
    expect(opts.stdio[0]).toBe("ignore");
    // cwd neutral: el CLI no hereda CLAUDE.md ni hooks del directorio de la app.
    expect(opts.cwd).toBe(require("node:os").tmpdir());
  });

  it("con respuesta de error, manda el motivo del CLI y no el aviso de stderr", async () => {
    const spawn: Spawn = () => {
      const { p, stdout, stderr } = procesoFalso();
      setTimeout(() => {
        stderr.emit("data", "Warning: algo\n");
        stdout.emit("data", JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "" }));
        p.emit("close", 1);
      }, 0);
      return p;
    };
    expect(await generateWithCli(input, deps(spawn))).toEqual({ ok: false, error: "Claude Code terminó con error_max_turns." });
  });

  it("con el CLI roto, el stderr es el error", async () => {
    const spawn: Spawn = () => {
      const { p, stderr } = procesoFalso();
      setTimeout(() => {
        stderr.emit("data", "Not logged in\n");
        p.emit("close", 1);
      }, 0);
      return p;
    };
    const r = await generateWithCli(input, deps(spawn));
    expect(r).toEqual({ ok: false, error: "Not logged in" });
  });

  it("sin binario no lanza nada", async () => {
    const spawn = vi.fn();
    const r = await generateWithCli({ ...input, cli: "codex" }, deps(spawn as any));
    expect(r.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("runAgentCli", () => {
  const input = { cli: "claude" as const, prompt: "hola", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "S" };

  it("traduce el stdout a eventos aunque las líneas lleguen cortadas y resuelve al cerrar", async () => {
    let args: string[] = [];
    const spawn: Spawn = (_c, a) => {
      args = a;
      const { p, stdout } = procesoFalso();
      setTimeout(() => {
        stdout.emit("data", '{"type":"system","subtype":"init","session_id":"s1"}\n{"type":"stream_event","event":{"delta":{"type":"text_del');
        stdout.emit("data", 'ta","text":"Hola"}}}\n{"type":"result","subtype":"success","result":"Hola","num_turns":1}\n');
        p.emit("close", 0);
      }, 0);
      return p;
    };
    const eventos: any[] = [];
    const r = await runAgentCli("r1", input, (e) => eventos.push(e), deps(spawn));
    expect(r).toEqual({ ok: true, exitCode: 0 });
    expect(eventos.map((e) => e.type)).toEqual(["session", "text", "result"]);
    expect(eventos[1].delta).toBe("Hola");
    expect(args).toContain("--append-system-prompt");
  });

  // #460: una carpeta adjunta que ya no existe no lanza al agente a ciegas.
  it("con carpetas adjuntas: las válidas van como --add-dir; una inexistente frena con aviso", async () => {
    let args: string[] = [];
    const spawn: Spawn = (_c, a) => {
      args = a;
      const { p } = procesoFalso();
      setTimeout(() => p.emit("close", 0), 0);
      return p;
    };
    const isDir = (p: string) => p === "/repo";
    const ok = await runAgentCli("d1", { ...input, dirs: ["/repo"] }, () => {}, deps(spawn, { isDir }));
    expect(ok.ok).toBe(true);
    expect(args[args.indexOf("--add-dir") + 1]).toBe("/repo");

    const nada = vi.fn() as unknown as Spawn;
    const eventos: any[] = [];
    const mal = await runAgentCli("d2", { ...input, dirs: ["/repo", "/se-borro"] }, (e) => eventos.push(e), deps(nada, { isDir }));
    expect(mal.ok).toBe(false);
    expect(eventos[0]).toMatchObject({ type: "error", message: expect.stringContaining("«/se-borro»") });
    expect(nada).not.toHaveBeenCalled();
  });

  it("sin binario emite error y no lanza nada", async () => {
    const spawn = vi.fn();
    const eventos: any[] = [];
    const r = await runAgentCli("r2", { ...input, cli: "codex" }, (e) => eventos.push(e), deps(spawn as any));
    expect(r.ok).toBe(false);
    expect(eventos[0]).toMatchObject({ type: "error", message: expect.stringContaining("Codex no está instalado") });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("si el CLI termina mal, el stderr llega como error (es el mensaje real, p. ej. sin sesión)", async () => {
    const spawn: Spawn = () => {
      const { p, stderr } = procesoFalso();
      setTimeout(() => {
        stderr.emit("data", "Not logged in. Run `claude` to log in.\n");
        p.emit("close", 1);
      }, 0);
      return p;
    };
    const eventos: any[] = [];
    const r = await runAgentCli("r3", input, (e) => eventos.push(e), deps(spawn));
    expect(r.ok).toBe(false);
    expect(eventos[0]).toMatchObject({ type: "error", message: expect.stringContaining("Not logged in") });
  });

  it("cancelar mata el proceso y la promesa resuelve al cerrar", async () => {
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = () => {
      proc = procesoFalso();
      return proc.p;
    };
    const corrida = runAgentCli("r4", input, () => {}, deps(spawn));
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelAgentCli("r4")).toBe(true);
    expect(proc!.p.killed).toEqual(["SIGTERM"]);
    proc!.p.emit("close", null);
    const r = await corrida;
    expect(r.ok).toBe(false);
    expect(cancelAgentCli("r4")).toBe(false);
  });

  it("sin eventos durante el tiempo de gracia se cancela con aviso", async () => {
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = () => {
      proc = procesoFalso();
      proc.p.kill = (s) => {
        proc!.p.killed.push(s ?? "SIGTERM");
        setTimeout(() => proc!.p.emit("close", null), 0);
        return true;
      };
      return proc.p;
    };
    const eventos: any[] = [];
    const r = await runAgentCli("r5", input, (e) => eventos.push(e), deps(spawn, { idleTimeoutMs: 10 }));
    expect(r.ok).toBe(false);
    expect(eventos[0]).toMatchObject({ type: "error", message: expect.stringContaining("no respondió") });
    expect(proc!.p.killed).toEqual(["SIGTERM"]);
  });
});
