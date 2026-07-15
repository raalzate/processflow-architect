/**
 * @fileOverview Preferencias del servidor MCP embebido (claves + config cliente).
 *
 * Puro: constantes de localStorage y generación del bloque de configuración
 * que el usuario pega en su cliente MCP (Claude Code / Codex). El estado real
 * del servidor vive en el proceso main (mcp-http.ts).
 */

/** localStorage: "1" si el usuario dejó el servidor activado (auto-arranque). */
export const MCP_ENABLED_KEY = "mcp_server_enabled";
/** localStorage: puerto elegido. */
export const MCP_PORT_KEY = "mcp_server_port";
export const MCP_DEFAULT_PORT = 7331;

/** URL del endpoint MCP para un puerto dado. */
export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

/** Bloque .mcp.json listo para pegar en el cliente (transporte HTTP). */
export function clientConfigJson(port: number): string {
  return JSON.stringify(
    {
      mcpServers: {
        "processflow-architect": { type: "http", url: mcpUrl(port) },
      },
    },
    null,
    2
  );
}

/** Lee la preferencia persistida (enabled + puerto validado). */
export function readMcpPrefs(storage: Pick<Storage, "getItem">): {
  enabled: boolean;
  port: number;
} {
  let enabled = false;
  let port = MCP_DEFAULT_PORT;
  try {
    enabled = storage.getItem(MCP_ENABLED_KEY) === "1";
    const p = parseInt(storage.getItem(MCP_PORT_KEY) || "", 10);
    if (Number.isFinite(p) && p >= 1024 && p <= 65535) port = p;
  } catch {
    /* storage no disponible */
  }
  return { enabled, port };
}
