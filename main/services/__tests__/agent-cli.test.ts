import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  cancelAgentCli,
  cancelAllAgentCli,
  candidateDirs,
  cliStatus,
  corridasVivas,
  generateWithCli,
  resolveCli,
  resolveCliAsync,
  runAgentCli,
  type Proceso,
  type Spawn,
} from "../agent-cli";

/** Proceso falso: emite lo que el test le diga, registra el kill y lo escrito por stdin. */
function procesoFalso() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdinEscrito: string[] = [];
  const stdin = Object.assign(new EventEmitter(), {
    end: (s?: string) => {
      if (s !== undefined) stdinEscrito.push(s);
    },
  });
  const p = new EventEmitter() as EventEmitter & Proceso & { killed: string[]; stdinEscrito: string[] };
  (p as any).stdout = stdout;
  (p as any).stderr = stderr;
  (p as any).stdin = stdin;
  p.killed = [];
  p.stdinEscrito = stdinEscrito;
  p.kill = (s?: NodeJS.Signals) => {
    p.killed.push(s ?? "SIGTERM");
    return true;
  };
  return { p, stdout, stderr };
}

// `shellLookup` falso por defecto: ningún test lanza la shell de login real.
const deps = (spawn: Spawn, extra: Record<string, unknown> = {}) => ({
  spawn,
  exists: (p: string) => p.endsWith("/.local/bin/claude"),
  home: "/home/u",
  env: { PATH: "/usr/bin", NODE_ENV: "test" } as NodeJS.ProcessEnv,
  shellLookup: async () => null,
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

  // #462: con nvm/fnm/asdf el CLI sólo lo conoce la shell de login.
  it("si no está en las rutas conocidas, lo busca con la shell de login", async () => {
    const lookup = vi.fn(async (c: string) => (c === "codex" ? "/Users/u/.nvm/versions/node/v20/bin/codex" : null));
    expect(await resolveCliAsync("codex", deps(vi.fn() as any, { shellLookup: lookup }))).toBe(
      "/Users/u/.nvm/versions/node/v20/bin/codex"
    );
    expect(lookup).toHaveBeenCalledWith("codex");
    // Lo que está en las rutas conocidas no pregunta a la shell.
    lookup.mockClear();
    expect(await resolveCliAsync("claude", deps(vi.fn() as any, { shellLookup: lookup }))).toBe("/home/u/.local/bin/claude");
    expect(lookup).not.toHaveBeenCalled();
  });
});

// #461: en Windows se busca el `.exe` del instalador nativo y NUNCA un `.cmd`
// (lanzarlo exigiría shell, y el prompt quedaría expuesto a inyección).
describe("resolveCli en Windows", () => {
  it("encuentra claude.exe y no el shim .cmd ni el script sin extensión", () => {
    const win = (existe: (p: string) => boolean) =>
      resolveCli("claude", { exists: existe, home: "/home/u", env: { PATH: "", NODE_ENV: "test" } as NodeJS.ProcessEnv, platform: "win32" });
    expect(win((p) => p.endsWith("/.local/bin/claude.exe"))).toBe("/home/u/.local/bin/claude.exe");
    expect(win((p) => p.endsWith("claude.cmd") || p.endsWith("/claude"))).toBeNull();
  });
});

describe("cliStatus", () => {
  it("reporta instalado con versión y sesión iniciada; no instalado sin binario", async () => {
    const spawn: Spawn = (_c, a) => {
      const { p, stdout } = procesoFalso();
      setTimeout(() => {
        stdout.emit("data", a.includes("auth") ? '{"loggedIn": false, "authMethod": "none"}' : "2.1.293 (Claude Code)\n");
        p.emit("close", 0);
      }, 0);
      return p;
    };
    const s = await cliStatus(deps(spawn));
    expect(s).toEqual([
      { cli: "claude", installed: true, version: "2.1.293 (Claude Code)", loggedIn: false },
      { cli: "codex", installed: false },
    ]);
  });

  // #462: un `--version` colgado dejaba el chat en «Buscando CLI…» para siempre.
  it("un --version colgado no deja esperando: se da por no utilizable y se mata", async () => {
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = () => {
      proc = procesoFalso();
      return proc.p; // nunca emite nada
    };
    const s = await cliStatus(deps(spawn, { shortTimeoutMs: 10, killGraceMs: 10_000 }));
    expect(s[0]).toEqual({ cli: "claude", installed: false });
    expect(proc!.p.killed[0]).toBe("SIGTERM");
  });
});

// Feature 021: el CLI como generador de texto puro para el router.
describe("generateWithCli", () => {
  const input = { cli: "claude" as const, prompt: "P", system: "S" };
  const respuesta = (linea: string, code = 0) => {
    let opts: any;
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = (_c, _a, o) => {
      opts = o;
      proc = procesoFalso();
      const { p, stdout } = proc;
      setTimeout(() => {
        stdout.emit("data", linea);
        p.emit("close", code);
      }, 0);
      return p;
    };
    return { spawn, opts: () => opts, proc: () => proc! };
  };

  it("devuelve el texto y el costo del `result`, con el prompt escrito por stdin", async () => {
    const r = respuesta('{"type":"result","subtype":"success","result":"Hola","total_cost_usd":0.12}\n');
    expect(await generateWithCli(input, deps(r.spawn))).toEqual({ ok: true, text: "Hola", costUsd: 0.12 });
    // #462: el prompt viaja por stdin (sin tope de argv), y se cierra.
    expect(r.opts().stdio[0]).toBe("pipe");
    expect(r.proc().p.stdinEscrito).toEqual(["P"]);
    expect(corridasVivas()).toBe(0);
  });

  it("cwd neutral: el CLI no hereda CLAUDE.md ni hooks del directorio de la app", async () => {
    const r = respuesta('{"type":"result","subtype":"success","result":"x"}');
    await generateWithCli(input, deps(r.spawn));
    expect(r.opts().cwd).toBe(require("node:os").tmpdir());
    await generateWithCli(input, deps(r.spawn, { cwd: "/userdata/agent-cli" }));
    expect(r.opts().cwd).toBe("/userdata/agent-cli");
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
    expect(await generateWithCli(input, deps(spawn))).toEqual({ ok: false, error: "Not logged in" });
  });

  // #462: el timeout es de INACTIVIDAD: un CLI que sigue mandando eventos no se corta.
  it("mientras el CLI escribe no se corta; si se calla, sí", async () => {
    const spawn: Spawn = () => {
      const { p, stdout } = procesoFalso();
      let n = 0;
      const tic = setInterval(() => {
        stdout.emit("data", JSON.stringify({ type: "system", subtype: "status" }) + "\n");
        if (++n === 6) {
          clearInterval(tic);
          stdout.emit("data", JSON.stringify({ type: "result", subtype: "success", result: "tarde" }) + "\n");
          p.emit("close", 0);
        }
      }, 8);
      return p;
    };
    // 6 eventos de a 8 ms = ~48 ms en total, con 20 ms de inactividad permitida.
    expect(await generateWithCli(input, deps(spawn, { idleTimeoutMs: 20 }))).toEqual({ ok: true, text: "tarde" });

    const callado: Spawn = () => procesoFalso().p;
    const r = await generateWithCli(input, deps(callado, { idleTimeoutMs: 15, killGraceMs: 10_000 }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("no respondió") });
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

  it("traduce el stdout a eventos aunque las líneas lleguen cortadas, con el prompt por stdin", async () => {
    let args: string[] = [];
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = (_c, a) => {
      args = a;
      proc = procesoFalso();
      const { p, stdout } = proc;
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
    expect(args).not.toContain("hola");
    expect(proc!.p.stdinEscrito).toEqual(["hola"]);
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

  // #462: un CLI que ignora el SIGTERM quedaba vivo.
  it("si no cierra tras el SIGTERM, recibe SIGKILL", async () => {
    let proc: ReturnType<typeof procesoFalso> | null = null;
    const spawn: Spawn = () => {
      proc = procesoFalso();
      return proc.p;
    };
    const corrida = runAgentCli("r6", input, () => {}, deps(spawn, { killGraceMs: 10 }));
    await new Promise((r) => setTimeout(r, 0));
    cancelAgentCli("r6", { killGraceMs: 10 });
    await new Promise((r) => setTimeout(r, 30));
    expect(proc!.p.killed).toEqual(["SIGTERM", "SIGKILL"]);
    proc!.p.emit("close", null);
    await corrida;
  });

  // #462: al salir de la app no queda ninguna corrida viva.
  it("cancelAllAgentCli mata el chat y las generaciones en curso", async () => {
    const procs: ReturnType<typeof procesoFalso>[] = [];
    const spawn: Spawn = () => {
      const f = procesoFalso();
      procs.push(f);
      return f.p;
    };
    const chat = runAgentCli("r7", input, () => {}, deps(spawn));
    const gen = generateWithCli({ cli: "claude", prompt: "p" }, deps(spawn));
    await new Promise((r) => setTimeout(r, 0));
    expect(corridasVivas()).toBe(2);
    expect(cancelAllAgentCli({ killGraceMs: 10_000 })).toBe(2);
    expect(procs.every((f) => f.p.killed[0] === "SIGTERM")).toBe(true);
    expect(corridasVivas()).toBe(0);
    for (const f of procs) f.p.emit("close", null);
    await Promise.all([chat, gen]);
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
