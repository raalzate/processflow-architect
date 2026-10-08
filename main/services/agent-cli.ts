/**
 * @fileOverview Chat con un agente externo por CLI (Claude Code / Codex) — proceso main.
 * Feature 020 (#444).
 *
 * El renderer manda un mensaje; acá se lanza el CLI en modo headless apuntando
 * al servidor MCP de la app, se traduce su stdout a eventos de chat
 * (`src/lib/agent-cli/parse.ts`) y se reenvían al renderer por IPC a medida que
 * llegan. Cancelar = matar el proceso. Nada de red desde la app: el CLI usa la
 * sesión que el usuario ya tiene en su máquina (§P4).
 *
 * Por qué `spawn` y no `execFile` (como mermaid.ts): la salida es progresiva y
 * el humano la ve escribirse; esperar al final sería un chat mudo.
 *
 * Por qué se busca el binario a mano: una app de escritorio en macOS no hereda
 * el PATH de la shell, y `claude` vive en `~/.local/bin`. Sin esto el CLI
 * «no está instalado» aunque el usuario lo use a diario en la terminal.
 */

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLaunch, type LaunchInput } from "../../src/lib/agent-cli/args";
import { parseLine, splitLines } from "../../src/lib/agent-cli/parse";
import { CLI_IDS, CLI_INFO, type ChatEvent, type CliId, type CliStatus } from "../../src/lib/agent-cli/types";

/** Sin eventos durante este tiempo se da por colgado y se mata. */
export const IDLE_TIMEOUT_MS = 120_000;

/** Lo mínimo del proceso hijo que este módulo usa (para inyectar uno falso en tests). */
export interface Proceso {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(ev: "close", cb: (code: number | null) => void): unknown;
  on(ev: "error", cb: (e: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type Spawn = (command: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => Proceso;

export interface Deps {
  spawn?: Spawn;
  exists?: (p: string) => boolean;
  home?: string;
  env?: NodeJS.ProcessEnv;
  idleTimeoutMs?: number;
}

/** Directorios donde suelen instalarse los CLI y que una app GUI no ve en su PATH. */
export function candidateDirs(home: string, envPath = ""): string[] {
  const propios = [
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".volta", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  const delPath = envPath.split(path.delimiter).filter(Boolean);
  return [...new Set([...delPath, ...propios])];
}

/** Ruta absoluta del binario, o null si no está en ningún directorio candidato. */
export function resolveCli(cli: CliId, deps: Deps = {}): string | null {
  const exists = deps.exists ?? existsSync;
  const home = deps.home ?? os.homedir();
  const env = deps.env ?? process.env;
  const cmd = CLI_INFO[cli].command;
  for (const dir of candidateDirs(home, env.PATH)) {
    const p = path.join(dir, cmd);
    if (exists(p)) return p;
  }
  return null;
}

/** PATH ampliado con los candidatos: el CLI a su vez lanza `node` y otros. */
function envConPath(deps: Deps): NodeJS.ProcessEnv {
  const env = { ...(deps.env ?? process.env) };
  const home = deps.home ?? os.homedir();
  env.PATH = candidateDirs(home, env.PATH).join(path.delimiter);
  return env;
}

/** `<cli> --version` por CLI: instalado o no, y qué versión. */
export async function cliStatus(deps: Deps = {}): Promise<CliStatus[]> {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as Spawn);
  return Promise.all(
    CLI_IDS.map(async (cli): Promise<CliStatus> => {
      const bin = resolveCli(cli, deps);
      if (!bin) return { cli, installed: false };
      try {
        const version = await new Promise<string>((resolve, reject) => {
          const p = spawn(bin, ["--version"], { env: envConPath(deps) });
          let out = "";
          p.stdout?.on("data", (d: Buffer | string) => (out += String(d)));
          p.on("error", reject);
          p.on("close", (code) => (code === 0 ? resolve(out.trim().split("\n")[0]) : reject(new Error(`exit ${code}`))));
        });
        return { cli, installed: true, version };
      } catch {
        return { cli, installed: false };
      }
    })
  );
}

const corridas = new Map<string, Proceso>();

export interface RunResult {
  ok: boolean;
  exitCode: number | null;
  /** stderr del CLI cuando terminó mal: es el mensaje real (p. ej. «no has iniciado sesión»). */
  stderr?: string;
}

/**
 * Lanza el CLI para un mensaje y emite cada evento con `onEvent`. Resuelve al
 * terminar el proceso (nunca rechaza: el fallo viaja como resultado).
 */
export async function runAgentCli(
  runId: string,
  input: LaunchInput,
  onEvent: (e: ChatEvent) => void,
  deps: Deps = {}
): Promise<RunResult> {
  const bin = resolveCli(input.cli, deps);
  if (!bin) {
    onEvent({ type: "error", message: `${CLI_INFO[input.cli].label} no está instalado (no encontré \`${CLI_INFO[input.cli].command}\`).` });
    return { ok: false, exitCode: null };
  }
  const spawn = deps.spawn ?? (nodeSpawn as unknown as Spawn);
  const launch = buildLaunch(input);
  const p = spawn(bin, launch.args, { env: envConPath(deps) });
  corridas.set(runId, p);

  let buffer = "";
  let stderr = "";
  let timer: NodeJS.Timeout | null = null;
  const idle = deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const rearmar = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onEvent({ type: "error", message: `${CLI_INFO[input.cli].label} no respondió en ${Math.round(idle / 1000)} s: se canceló.` });
      p.kill("SIGTERM");
    }, idle);
  };
  rearmar();

  const procesar = (chunk: string) => {
    const r = splitLines(buffer, chunk);
    buffer = r.rest;
    for (const line of r.lines) for (const e of parseLine(input.cli, line)) onEvent(e);
    rearmar();
  };
  p.stdout?.on("data", (d: Buffer | string) => procesar(String(d)));
  p.stderr?.on("data", (d: Buffer | string) => (stderr += String(d)));

  return new Promise<RunResult>((resolve) => {
    const fin = (code: number | null, err?: Error) => {
      if (timer) clearTimeout(timer);
      corridas.delete(runId);
      if (buffer.trim()) for (const e of parseLine(input.cli, buffer)) onEvent(e);
      if (err) onEvent({ type: "error", message: err.message });
      const ok = code === 0 && !err;
      if (!ok && stderr.trim()) onEvent({ type: "error", message: stderr.trim().slice(-2000) });
      resolve({ ok, exitCode: code, ...(stderr.trim() ? { stderr: stderr.trim().slice(-2000) } : {}) });
    };
    p.on("error", (e) => fin(null, e));
    p.on("close", (code) => fin(code));
  });
}

/** Mata la corrida; true si había algo que matar. */
export function cancelAgentCli(runId: string): boolean {
  const p = corridas.get(runId);
  if (!p) return false;
  p.kill("SIGTERM");
  corridas.delete(runId);
  return true;
}
