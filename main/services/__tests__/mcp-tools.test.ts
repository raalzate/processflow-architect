import { describe, it, expect } from "vitest";
import { registerProcessflowTools } from "../mcp-tools";

/** Server MCP falso: captura las herramientas registradas (nombre → handler). */
function fakeServer() {
  const tools = new Map<string, { def: any; handler: (args: any) => Promise<any> }>();
  return {
    server: { registerTool: (name: string, def: any, handler: any) => tools.set(name, { def, handler }) } as any,
    tools,
  };
}

describe("registerProcessflowTools · export_mermaid_view", () => {
  it("NO registra la herramienta si falta exportMermaidToApp", () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x" });
    expect(tools.has("export_mermaid_view")).toBe(false);
  });

  it("registra la herramienta y entrega el código Mermaid al callback", async () => {
    const { server, tools } = fakeServer();
    let captured: { name: string; code: string } | null = null;
    registerProcessflowTools(server, {
      workspace: "/tmp/x",
      exportMermaidToApp: async (name, code) => {
        captured = { name, code };
        return true;
      },
    });

    expect(tools.has("export_mermaid_view")).toBe(true);
    const res = await tools.get("export_mermaid_view")!.handler({
      name: "Demo",
      code: "sequenceDiagram\n  U->>S: hola",
    });
    expect(captured).toEqual({ name: "Demo", code: "sequenceDiagram\n  U->>S: hola" });
    expect(res.content[0].text).toContain("✅");
    expect(res.isError).toBeUndefined();
  });

  it("falla (isError) si el código está vacío", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x", exportMermaidToApp: async () => true });
    const res = await tools.get("export_mermaid_view")!.handler({ name: "X", code: "   " });
    expect(res.isError).toBe(true);
  });

  it("devuelve error si la ventana no está disponible (callback → false)", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x", exportMermaidToApp: async () => false });
    const res = await tools.get("export_mermaid_view")!.handler({ name: "X", code: "flowchart TD\n A-->B" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("ventana activa");
  });
});
