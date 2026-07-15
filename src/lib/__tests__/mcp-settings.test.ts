import { describe, it, expect } from "vitest";
import {
  clientConfigJson,
  mcpUrl,
  readMcpPrefs,
  MCP_DEFAULT_PORT,
  MCP_ENABLED_KEY,
  MCP_PORT_KEY,
} from "../mcp-settings";

describe("mcp-settings", () => {
  it("genera la URL y el bloque de configuración del cliente", () => {
    expect(mcpUrl(7331)).toBe("http://127.0.0.1:7331/mcp");
    const cfg = JSON.parse(clientConfigJson(8000));
    expect(cfg.mcpServers["processflow-architect"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:8000/mcp",
    });
  });

  it("readMcpPrefs lee enabled y puerto válido", () => {
    const store = new Map<string, string>([
      [MCP_ENABLED_KEY, "1"],
      [MCP_PORT_KEY, "9000"],
    ]);
    expect(readMcpPrefs({ getItem: (k) => store.get(k) ?? null })).toEqual({
      enabled: true,
      port: 9000,
    });
  });

  it("readMcpPrefs cae a defaults ante valores inválidos o storage roto", () => {
    expect(
      readMcpPrefs({ getItem: () => "no-numero" })
    ).toEqual({ enabled: false, port: MCP_DEFAULT_PORT });
    expect(
      readMcpPrefs({ getItem: (k) => (k === MCP_PORT_KEY ? "80" : "0") }) // puerto <1024
    ).toEqual({ enabled: false, port: MCP_DEFAULT_PORT });
    expect(
      readMcpPrefs({
        getItem: () => {
          throw new Error("boom");
        },
      })
    ).toEqual({ enabled: false, port: MCP_DEFAULT_PORT });
  });
});
