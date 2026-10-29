/**
 * @fileOverview Chat con un agente externo por CLI (feature 020, #444) — tipos.
 *
 * Claude Code, Codex y Antigravity (`agy`) tienen modo headless: un proceso que recibe el mensaje,
 * trabaja con las herramientas MCP de la app y escribe eventos JSON por línea.
 * En el chat de la ficha el CLI es un agente ajeno (no pasa por el router). El
 * mismo CLI es además el motor `cli` del router (feature 021), como generador
 * de texto puro: ver `args.ts` (`buildGenerateLaunch`) y `ai/providers.ts`.
 * La app no autentica ni guarda nada: el CLI usa la sesión que el usuario ya
 * tiene en su máquina (§P4: sin SDKs de nube, sin llaves).
 */

export type CliId = "claude" | "codex" | "agy";

export const CLI_IDS: readonly CliId[] = ["claude", "codex", "agy"] as const;

/**
 * CLIs que sólo sirven de MOTOR de la app (generación de texto, feature 021) y no
 * entran al chat de la ficha: ahí el agente escribe por MCP, y sin una allowlist
 * de tools verificada no hay barrera contra una tool destructiva (#461).
 */
export const CLIS_SOLO_MOTOR: readonly CliId[] = ["agy"] as const;

/** Cómo se ve cada CLI en la UI y cómo se instala si falta. */
export const CLI_INFO: Record<CliId, { label: string; command: string; installUrl: string }> = {
  claude: { label: "Claude Code", command: "claude", installUrl: "https://code.claude.com/docs/en/setup" },
  codex: { label: "Codex", command: "codex", installUrl: "https://developers.openai.com/codex/cli" },
  agy: { label: "Antigravity", command: "agy", installUrl: "https://antigravity.google/download" },
};

/**
 * Modelos que el humano puede elegir para el chat de la ficha (#643). Son los
 * ALIAS que el CLI resuelve a su versión vigente (`claude --model sonnet`), no
 * ids fechados: así la lista no envejece con cada lanzamiento. El vacío es «el
 * que tengas configurado» y no manda `--model`. Es también la allowlist con la
 * que `validarLaunch` rechaza lo que no sea uno de estos.
 */
export const CLI_MODELOS: Record<CliId, readonly { id: string; label: string; hint: string }[]> = {
  claude: [
    { id: "", label: "Modelo: el tuyo", hint: "el que tenga configurado Claude Code" },
    { id: "sonnet", label: "Sonnet", hint: "equilibrado: el indicado para pulir una caja" },
    { id: "opus", label: "Opus", hint: "el más capaz, para specs largas o ambiguas; más caro" },
    { id: "haiku", label: "Haiku", hint: "rápido y barato, para cambios chicos" },
  ],
  codex: [{ id: "", label: "Modelo: el tuyo", hint: "el que tenga configurado Codex" }],
  agy: [{ id: "", label: "Modelo: el tuyo", hint: "el que tenga configurado Antigravity" }],
};

/** true si `modelo` es uno de los que ofrece la app para ese CLI (vacío = el del usuario). */
export const esModeloDe = (cli: CliId, modelo: string): boolean =>
  CLI_MODELOS[cli].some((m) => m.id === modelo);

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
