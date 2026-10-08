/**
 * @fileOverview Chat con un agente externo por CLI (feature 020, #444) — tipos.
 *
 * Claude Code y Codex tienen modo headless: un proceso que recibe el mensaje,
 * trabaja con las herramientas MCP de la app y escribe eventos JSON por línea.
 * En el chat de la ficha el CLI es un agente ajeno (no pasa por el router). El
 * mismo CLI es además el motor `cli` del router (feature 021), como generador
 * de texto puro: ver `args.ts` (`buildGenerateLaunch`) y `ai/providers.ts`.
 * La app no autentica ni guarda nada: el CLI usa la sesión que el usuario ya
 * tiene en su máquina (§P4: sin SDKs de nube, sin llaves).
 */

export type CliId = "claude" | "codex";

export const CLI_IDS: readonly CliId[] = ["claude", "codex"] as const;

/** Cómo se ve cada CLI en la UI y cómo se instala si falta. */
export const CLI_INFO: Record<CliId, { label: string; command: string; installUrl: string }> = {
  claude: { label: "Claude Code", command: "claude", installUrl: "https://code.claude.com/docs/en/setup" },
  codex: { label: "Codex", command: "codex", installUrl: "https://developers.openai.com/codex/cli" },
};

/** Nombre con el que el CLI ve el servidor MCP de la app (prefijo `mcp__<nombre>__`). */
export const MCP_SERVER_NAME = "processflow";

/**
 * Evento del chat, común a los dos CLI. Es lo que viaja main → renderer y lo
 * que el panel dibuja; el formato propio de cada CLI muere en `parse.ts`.
 */
export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; text: string }
  | { type: "result"; ok: boolean; text: string; turns?: number; costUsd?: number; sessionId?: string }
  | { type: "error"; message: string };

/** Estado de un CLI en esta máquina. */
export interface CliStatus {
  cli: CliId;
  installed: boolean;
  version?: string;
  /** ¿Hay sesión iniciada? (sólo Claude, por `claude auth status`; #462). Ausente = no se sabe. */
  loggedIn?: boolean;
}
