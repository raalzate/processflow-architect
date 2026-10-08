/**
 * @fileOverview Chat con un agente externo por CLI (Claude Code / Codex) — proceso main.
 * Feature 020 (#444), endurecido en #461 y #462.
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
 * el PATH de la shell, y `claude` vive en `~/.local/bin` (o, con nvm/fnm/asdf,
 * en una ruta que sólo conoce la shell de login: #462).
 */

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildGenerateLaunch,
  buildLaunch,
  carpetasValidas,
  type GenerateInput,
  type Launch,
  type LaunchInput,
} from "../../src/lib/agent-cli/args";
import { parseLine, resultText, splitLines } from "../../src/lib/agent-cli/parse";
import { parseAuthStatus, rutaDesdeShell } from "../../src/lib/agent-cli/status";
import { CLI_IDS, CLI_INFO, type ChatEvent, type CliId, type CliStatus } from "../../src/lib/agent-cli/types";

/** Sin eventos durante este tiempo se da por colgado y se mata. */
export const IDLE_TIMEOUT_MS = 120_000;
/** `--version`, `auth status` y la búsqueda en la shell: comandos cortos (#462). */
export const SHORT_TIMEOUT_MS = 5_000;
/** Tras un SIGTERM, cuánto se espera antes del SIGKILL (#462). */
export const KILL_GRACE_MS = 5_000;

/** ¿Directorio existente? Nunca lanza: una ruta rara es «no». */
function esDirectorio(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Lo mínimo del proceso hijo que este módulo usa (para inyectar uno falso en tests). */
export interface Proceso {
  stdin?: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(ev: "close", cb: (code: number | null) => void): unknown;
  on(ev: "error", cb: (e: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type Stdio = ["ignore" | "pipe", "pipe", "pipe"];

export type Spawn = (command: string, args: string[], opts: { env: NodeJS.ProcessEnv; stdio: Stdio; cwd: string }) => Proceso;

export interface Deps {
  spawn?: Spawn;
  exists?: (p: string) => boolean;
  /** ¿La ruta es un directorio existente? (para las carpetas adjuntas, #460). */
  isDir?: (p: string) => boolean;
  home?: string;
  env?: NodeJS.ProcessEnv;
  idleTimeoutMs?: number;
  shortTimeoutMs?: number;
  killGraceMs?: number;
  /** Directorio de trabajo del CLI. El main pasa uno propio en userData (#462). */
  cwd?: string;
  /** Plataforma (para las pruebas de Windows). */
  platform?: NodeJS.Platform;
  /** Búsqueda en la shell de login (#462); inyectable para las pruebas. */
  shellLookup?: (comando: string) => Promise<string | null>;
}

/**
 * - stdin: CERRADO si no hay nada que mandarle (con stdin abierto y vacío,
 *   `claude -p` espera 3 s y lo avisa por stderr); con prompt, se escribe y se
 *   cierra (#462).
 * - cwd NEUTRAL: el CLI lee el CLAUDE.md y los hooks del directorio donde
 *   arranca. Verificado en vivo con 2.1.293 el 2026-10-07.
 */
const opciones = (deps: Deps, conStdin = false) => ({
  env: envConPath(deps),
  stdio: [conStdin ? "pipe" : "ignore", "pipe", "pipe"] as Stdio,
  cwd: deps.cwd ?? os.tmpdir(),
});

function lanzar(bin: string, launch: Launch, deps: Deps): Proceso {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as Spawn);
  const p = spawn(bin, launch.args, opciones(deps, launch.stdin !== undefined));
  if (launch.stdin !== undefined) {
    // Un EPIPE (el CLI murió antes de leer) no debe tumbar el proceso main.
    p.stdin?.on("error", () => {});
    p.stdin?.end(launch.stdin);
  }
  return p;
}

/**
 * Termina un proceso: SIGTERM y, si no cerró en el tiempo de gracia, SIGKILL
 * (#462). Un CLI que ignora el SIGTERM quedaba vivo, escribiendo en el lienzo
 * sin nadie mirando.
 */
function terminar(p: Proceso, deps: Deps): void {
  try {
    p.kill("SIGTERM");
  } catch {
    /* ya estaba muerto */
  }
  const t = setTimeout(() => {
    try {
      p.kill("SIGKILL");
    } catch {
      /* ya estaba muerto */
    }
  }, deps.killGraceMs ?? KILL_GRACE_MS);
  (t as any).unref?.();
  p.on("close", () => clearTimeout(t));
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
  // Windows (#461): el instalador nativo deja `claude.exe`. Los shims `.cmd` de
  // npm global NO se buscan: lanzarlos exige `shell: true`, y eso abriría
  // inyección por el prompt. Sin `.exe`, el CLI figura «no instalado».
  const nombres = (deps.platform ?? process.platform) === "win32" ? [`${CLI_INFO[cli].command}.exe`] : [CLI_INFO[cli].command];
  for (const dir of candidateDirs(home, env.PATH)) {
    for (const nombre of nombres) {
      const p = path.join(dir, nombre);
      if (exists(p)) return p;
    }
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

/**
 * Corre un comando corto y devuelve su salida, o null si falló o se colgó
 * (#462): un `--version` colgado dejaba el chat en «Buscando CLI…» para siempre.
 */
function ejecutarCorto(bin: string, args: string[], deps: Deps): Promise<{ code: number | null; stdout: string } | null> {
  return new Promise((resolve) => {
    let listo = false;
    const fin = (r: { code: number | null; stdout: string } | null) => {
      if (listo) return;
      listo = true;
      resolve(r);
    };
    let p: Proceso;
    try {
      p = lanzar(bin, { command: bin, args }, deps);
    } catch {
      return fin(null);
    }
    let out = "";
    const t = setTimeout(() => {
      terminar(p, deps);
      fin(null);
    }, deps.shortTimeoutMs ?? SHORT_TIMEOUT_MS);
    p.stdout?.on("data", (d: Buffer | string) => (out += String(d)));
    p.on("error", () => {
      clearTimeout(t);
      fin(null);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      fin({ code, stdout: out });
    });
  });
}

const enShell = new Map<string, string | null>();

/**
 * Busca el comando con la shell de LOGIN del usuario (#462): es la única que
 * conoce el PATH de nvm/fnm/asdf. Una vez por comando y por sesión de la app.
 * El comando es una constante (`claude`/`codex`), nunca texto del usuario.
 */
async function buscarEnShell(cli: CliId, deps: Deps): Promise<string | null> {
  const comando = CLI_INFO[cli].command;
  if ((deps.platform ?? process.platform) === "win32") return null;
  if (deps.shellLookup) return deps.shellLookup(comando);
  if (enShell.has(comando)) return enShell.get(comando) ?? null;
  const shell = (deps.env ?? process.env).SHELL || "/bin/zsh";
  const r = await ejecutarCorto(shell, ["-ilc", `command -v ${comando}`], deps);
  const ruta = r && r.code === 0 ? rutaDesdeShell(r.stdout, comando) : null;
  const valida = ruta && (deps.exists ?? existsSync)(ruta) ? ruta : null;
  enShell.set(comando, valida);
  return valida;
}

/** Ruta del binario: primero las rutas conocidas y, si no, la shell de login. */
export async function resolveCliAsync(cli: CliId, deps: Deps = {}): Promise<string | null> {
  return resolveCli(cli, deps) ?? (await buscarEnShell(cli, deps));
}

/**
 * Qué CLI hay: instalado, versión y —para Claude— si hay sesión iniciada
 * (#462): «instalado» no implica poder usarlo, y sin sesión cada llamada
 * fallaba con «Not logged in».
 */
export async function cliStatus(deps: Deps = {}): Promise<CliStatus[]> {
  return Promise.all(
    CLI_IDS.map(async (cli): Promise<CliStatus> => {
      const bin = await resolveCliAsync(cli, deps);
      if (!bin) return { cli, installed: false };
      const v = await ejecutarCorto(bin, ["--version"], deps);
      if (!v || v.code !== 0) return { cli, installed: false };
      const version = v.stdout.trim().split("\n")[0];
      if (cli !== "claude") return { cli, installed: true, version };
      const a = await ejecutarCorto(bin, ["auth", "status"], deps);
      const loggedIn = a ? parseAuthStatus(a.stdout) : undefined;
      return { cli, installed: true, version, ...(loggedIn !== undefined ? { loggedIn } : {}) };
    })
  );
}

/** Corridas vivas: chat y generación, para poder cancelarlas (y matarlas al salir). */
const corridas = new Map<string, Proceso>();
let seqGen = 0;

export interface RunResult {
  ok: boolean;
  exitCode: number | null;
  /** stderr del CLI cuando terminó mal: es el mensaje real (p. ej. «no has iniciado sesión»). */
  stderr?: string;
}

const noInstalado = (cli: CliId) =>
  `${CLI_INFO[cli].label} no está instalado (no encontré \`${CLI_INFO[cli].command}\`).`;

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
  const bin = await resolveCliAsync(input.cli, deps);
  if (!bin) {
    onEvent({ type: "error", message: noInstalado(input.cli) });
    return { ok: false, exitCode: null };
  }
  // Carpetas adjuntas (#460): que existan y sean directorios.
  const isDir = deps.isDir ?? esDirectorio;
  const pedidas = carpetasValidas(input.dirs);
  const faltan = pedidas.filter((d) => !isDir(d));
  if (faltan.length) {
    onEvent({
      type: "error",
      message: `No encuentro ${faltan.length === 1 ? "la carpeta" : "las carpetas"} ${faltan.map((d) => `«${d}»`).join(", ")}. Quitala del chat o volvé a adjuntarla.`,
    });
    return { ok: false, exitCode: null };
  }
  const p = lanzar(bin, buildLaunch({ ...input, dirs: pedidas }), deps);
  corridas.set(runId, p);

  let buffer = "";
  let stderr = "";
  let timer: NodeJS.Timeout | null = null;
  const idle = deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const rearmar = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onEvent({ type: "error", message: `${CLI_INFO[input.cli].label} no respondió en ${Math.round(idle / 1000)} s: se canceló.` });
      terminar(p, deps);
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
    let listo = false;
    const fin = (code: number | null, err?: Error) => {
      if (listo) return;
      listo = true;
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

export type GenerateResult = { ok: true; text: string; costUsd?: number } | { ok: false; error: string; costUsd?: number };

/**
 * Generación de TEXTO PURO para el router de la app (feature 021): el CLI
 * piensa, la app actúa. Un proceso por llamada, sin tools ni MCP. Desde #462 se
 * rastrea (se mata al salir de la app), el timeout es de INACTIVIDAD y devuelve
 * el costo que informa el CLI para el tope de gasto.
 */
export async function generateWithCli(input: GenerateInput, deps: Deps = {}): Promise<GenerateResult> {
  const bin = await resolveCliAsync(input.cli, deps);
  if (!bin) return { ok: false, error: noInstalado(input.cli) };
  const id = `gen-${++seqGen}`;
  const idle = deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  return new Promise((resolve) => {
    let listo = false;
    const fin = (r: GenerateResult) => {
      if (listo) return;
      listo = true;
      if (timer) clearTimeout(timer);
      corridas.delete(id);
      resolve(r);
    };
    const p = lanzar(bin, buildGenerateLaunch(input), deps);
    corridas.set(id, p);
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | null = null;
    const rearmar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        terminar(p, deps);
        fin({ ok: false, error: `${CLI_INFO[input.cli].label} no respondió en ${Math.round(idle / 1000)} s.` });
      }, idle);
    };
    rearmar();
    p.stdout?.on("data", (d: Buffer | string) => {
      stdout += String(d);
      rearmar();
    });
    p.stderr?.on("data", (d: Buffer | string) => (stderr += String(d)));
    p.on("error", (e) => fin({ ok: false, error: e.message }));
    p.on("close", (code) => {
      const r = resultText(input.cli, stdout);
      const costo = r.costUsd !== undefined ? { costUsd: r.costUsd } : {};
      // Si el CLI escribió una respuesta, ésa manda: stderr puede traer avisos.
      if ("text" in r) return fin({ ok: true, text: r.text, ...costo });
      // Con stdout que dice POR QUÉ falló, ese motivo manda sobre stderr; si no
      // hubo respuesta, stderr es lo único que hay (p. ej. «Not logged in»).
      const hayRespuesta = stdout.trim().length > 0;
      const motivo = hayRespuesta ? r.error : stderr.trim().slice(-2000) || r.error;
      fin({ ok: false, error: motivo || `${CLI_INFO[input.cli].label} terminó con código ${code}.`, ...costo });
    });
  });
}

/** Mata la corrida; true si había algo que matar. */
export function cancelAgentCli(runId: string, deps: Deps = {}): boolean {
  const p = corridas.get(runId);
  if (!p) return false;
  terminar(p, deps);
  corridas.delete(runId);
  return true;
}

/**
 * Mata TODO lo que esté corriendo (#462). Lo llama el main al salir de la app:
 * sin esto, una corrida del agente seguía viva escribiendo en un servidor MCP
 * que ya no existía, y una generación quedaba huérfana.
 */
export function cancelAllAgentCli(deps: Deps = {}): number {
  const n = corridas.size;
  for (const p of corridas.values()) terminar(p, { ...deps, killGraceMs: deps.killGraceMs ?? 1_000 });
  corridas.clear();
  return n;
}

/** Corridas vivas (para las pruebas y el diagnóstico). */
export const corridasVivas = (): number => corridas.size;
