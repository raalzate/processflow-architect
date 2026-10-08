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
}

export interface Launch {
  command: string;
  args: string[];
}

export const DEFAULT_MAX_TURNS = 25;

/** Config MCP inline que entiende `claude --mcp-config`. */
export function claudeMcpConfig(mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpUrl } } });
}

export function buildLaunch(input: LaunchInput): Launch {
  const maxTurns = String(input.maxTurns ?? DEFAULT_MAX_TURNS);
  if (input.cli === "claude") {
    return {
      command: "claude",
      args: [
        "-p",
        input.prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--mcp-config",
        claudeMcpConfig(input.mcpUrl),
        // Sólo el MCP de la app: lo que el usuario tenga en su ~/.claude no entra.
        "--strict-mcp-config",
        "--allowedTools",
        `mcp__${MCP_SERVER_NAME}__*`,
        "--append-system-prompt",
        input.systemPrompt,
        "--max-turns",
        maxTurns,
        ...(input.sessionId ? ["--resume", input.sessionId] : []),
      ],
    };
  }
  // Codex: el MCP se pasa como override de config (no hay flag inline de JSON).
  const mcp = ["-c", `mcp_servers.${MCP_SERVER_NAME}.url="${input.mcpUrl}"`];
  const comunes = ["--json", ...mcp];
  return {
    command: "codex",
    args: input.sessionId
      ? ["exec", "resume", input.sessionId, ...comunes, input.prompt]
      : ["exec", ...comunes, input.prompt],
  };
}
