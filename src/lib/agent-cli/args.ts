/**
 * @fileOverview Argumentos con los que se lanza cada CLI (PURO). Feature 020.
 *
 * Verificado en vivo con Claude Code 2.1.293 el 2026-10-07 contra el MCP de la
 * app: `-p` + `stream-json` + `--mcp-config` (http) + `--allowedTools` conecta
 * el servidor y restringe al agente a las tools de la app. Codex sigue el
 * contrato documentado de `codex exec --json`; no se verificó en vivo (no está
 * instalado en la máquina de desarrollo), y queda declarado.
 */

import { MCP_SERVER_NAME, type CliId } from "./types";

export interface LaunchInput {
  cli: CliId;
  /** Mensaje del humano. */
  prompt: string;
  /** URL del servidor MCP de la app (`http://127.0.0.1:<puerto>/mcp`). */
  mcpUrl: string;
  /** Contexto de la caja, añadido al prompt de sistema del CLI. */
  systemPrompt: string;
  /** Sesión previa para continuar la conversación. */
  sessionId?: string;
  /** Tope de turnos por mensaje: un agente que se va de tema no corre sin fin. */
  maxTurns?: number;
  /**
   * Carpetas que el humano adjuntó como contexto (#460): rutas ABSOLUTAS. El
   * agente las puede LEER (Read, Glob, Grep) y nada más.
   */
  dirs?: string[];
}

/** Herramientas de sólo lectura que se habilitan cuando hay carpetas adjuntas (#460). */
export const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"] as const;

/** Lo que el agente nunca puede hacer en una carpeta adjunta: escribir ni ejecutar. */
export const DENIED_TOOLS = ["Bash", "Write", "Edit", "NotebookEdit"] as const;

/**
 * Carpetas utilizables: absolutas, sin repetir. Una relativa dependería del cwd
 * del CLI (que es neutral a propósito) y una que empieza con «-» la leería el CLI
 * como un flag: las dos se descartan acá y no llegan al lanzamiento.
 */
export function carpetasValidas(dirs: readonly string[] | undefined): string[] {
  const absolutas = (dirs ?? []).map((d) => d.trim()).filter((d) => /^(\/|[A-Za-z]:[\\/])/.test(d));
  return [...new Set(absolutas)];
}

export interface Launch {
  command: string;
  args: string[];
  /**
   * Lo que se escribe por stdin y se cierra (#462). Claude recibe el PROMPT por
   * acá, no como argumento: un argumento tiene tope (Linux 128 KiB, Windows
   * 32 KiB por la línea entera) y un prompt con el grafo en TOON lo pasaba
   * (`E2BIG`). Por stdin además no hay forma de que el texto se lea como flag.
   * Verificado en vivo con Claude Code 2.1.293.
   */
  stdin?: string;
}

export const DEFAULT_MAX_TURNS = 25;

/**
 * Sin ajustes de usuario ni de proyecto. Verificado en vivo (2026-10-07): lanzado
 * desde un repo con hooks de Claude Code (un `Stop` que bloquea el cierre), el
 * CLI hacía un segundo turno y terminaba en `error_max_turns`. La app no puede
 * depender de lo que el usuario tenga configurado en su ~/.claude ni en el repo
 * desde donde se abrió: la sesión (login) sigue funcionando sin ellos.
 */
export const SIN_AJUSTES_AJENOS = ["--setting-sources", ""] as const;

/**
 * Lanzamiento de TEXTO PURO (feature 021): el CLI como generador para el router
 * de la app. Sin tools, sin MCP, un turno, sin persistir sesión: lo que piensa
 * vuelve como texto y la app decide qué hacer con él (sus tools, su ciclo).
 * Medido con Claude Code 2.1.293: ~3 s de pared, ~US$ 0,10 por llamada.
 */
export interface GenerateInput {
  cli: CliId;
  prompt: string;
  system?: string;
}

/**
 * Codex (sin verificar en vivo) sigue recibiendo el prompt como argumento:
 * SIEMPRE al final, detrás de `--` (#461). Como argumento suelto, un mensaje que
 * empieza con «-» lo leía el CLI como un flag. Claude lo recibe por stdin (#462).
 */
const finDeFlags = (prompt: string): string[] => ["--", prompt];

export function buildGenerateLaunch(input: GenerateInput): Launch {
  if (input.cli === "claude") {
    return {
      command: "claude",
      // Prompt por stdin (#462). `stream-json`: el CLI escribe eventos mientras
      // trabaja, así el timeout mide INACTIVIDAD y no el total, y el `result`
      // trae el costo para el tope de gasto.
      stdin: input.prompt,
      args: [
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "1",
        "--tools",
        "",
        "--mcp-config",
        JSON.stringify({ mcpServers: {} }),
        "--strict-mcp-config",
        "--no-session-persistence",
        ...SIN_AJUSTES_AJENOS,
        ...(input.system ? ["--append-system-prompt", input.system] : []),
        "-p",
      ],
    };
  }
  // Codex no tiene prompt de sistema por flag: va dentro del mensaje.
  const prompt = input.system ? `${input.system}\n\n---\n\n${input.prompt}` : input.prompt;
  return { command: "codex", args: ["exec", "--json", "--skip-git-repo-check", ...finDeFlags(prompt)] };
}

/**
 * Tools del MCP de la app que el agente del chat puede usar SIN preguntar
 * (#461). Antes era `mcp__processflow__*`, y en modo `-p` todo lo permitido se
 * aprueba solo: un archivo de una carpeta adjunta podía inducirlo a llamar
 * `delete_view` o `set_view_graph`. Ahora: leer la caja y su contexto, y
 * escribir SÓLO la spec de una caja. Lo demás queda denegado.
 */
export const CHAT_MCP_TOOLS = [
  "get_app_state",
  "get_focused_element",
  "get_view",
  "list_views",
  "list_element_docs",
  "read_element_doc",
  "search_docs",
  "set_view_element_spec",
] as const;

export const chatMcpAllowlist = (): string[] => CHAT_MCP_TOOLS.map((t) => `mcp__${MCP_SERVER_NAME}__${t}`);

/** Config MCP inline que entiende `claude --mcp-config`. */
export function claudeMcpConfig(mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpUrl } } });
}

export function buildLaunch(input: LaunchInput): Launch {
  const maxTurns = String(input.maxTurns ?? DEFAULT_MAX_TURNS);
  const dirs = carpetasValidas(input.dirs);
  if (input.cli === "claude") {
    return {
      command: "claude",
      stdin: input.prompt, // #462: por stdin, sin tope de argv ni riesgo de flag
      args: [
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--mcp-config",
        claudeMcpConfig(input.mcpUrl),
        // Sólo el MCP de la app: lo que el usuario tenga en su ~/.claude no entra.
        "--strict-mcp-config",
        ...SIN_AJUSTES_AJENOS,
        // Carpetas adjuntas (#460): acceso de LECTURA y nada más. `--add-dir` es
        // variádico; cada ruta va con su propio flag para no tragarse lo que sigue.
        ...dirs.flatMap((d) => ["--add-dir", d]),
        "--allowedTools",
        ...chatMcpAllowlist(),
        ...(dirs.length ? READ_ONLY_TOOLS : []),
        "--disallowedTools",
        ...DENIED_TOOLS,
        "--append-system-prompt",
        input.systemPrompt,
        "--max-turns",
        maxTurns,
        ...(input.sessionId ? ["--resume", input.sessionId] : []),
        "-p",
      ],
    };
  }
  // Codex: el MCP se pasa como override de config (no hay flag inline de JSON).
  const mcp = ["-c", `mcp_servers.${MCP_SERVER_NAME}.url="${input.mcpUrl}"`];
  // Codex lee desde su directorio de trabajo (sandbox de sólo lectura por defecto
  // en `exec`): la primera carpeta adjunta es ese directorio. Sin verificar en vivo.
  const comunes = ["--json", ...mcp, ...(dirs[0] ? ["-C", dirs[0], "--sandbox", "read-only"] : [])];
  return {
    command: "codex",
    args: input.sessionId
      ? ["exec", "resume", input.sessionId, ...comunes, ...finDeFlags(input.prompt)]
      : ["exec", ...comunes, ...finDeFlags(input.prompt)],
  };
}
