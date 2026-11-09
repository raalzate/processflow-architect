/**
 * @fileOverview Playground MCP: ejecuta herramientas del servidor embebido SIN HTTP.
 *
 * La guía MCP (/mcp) ofrece un playground para probar las herramientas a mano.
 * En vez de abrir el puerto (y pelear con CORS — que el servidor HTTP bloquea a
 * propósito), se conecta un cliente MCP por transporte EN MEMORIA a un servidor
 * recién construido por llamada (mismo modelo stateless que mcp-http). Comparte
 * workspace con los otros transportes, así que los diagramas creados aquí también
 * los ven Claude Code (stdio/HTTP) y viceversa.
 */

import path from "node:path";
import { app } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerProcessflowTools } from "./mcp-tools";
import { getAppState } from "./mcp-app-state";
import { readFromApp } from "./mcp-app-read";
import { actOnApp } from "./mcp-app-action";
import { mcpAppWindow } from "./mcp-app-window";
import { deliverMcpDiagram } from "./mcp-app-delivery";

/** Mismo workspace que el servidor HTTP embebido (estado compartido en disco). */
function appWorkspace(): string {
  return path.join(app.getPath("userData"), "mcp-workspace");
}

/** Cliente conectado a un servidor nuevo por par de transportes en memoria. */
async function connectedClient(preferredWindow?: number): Promise<{ client: Client; close: () => Promise<void> }> {
  const windowId = mcpAppWindow(preferredWindow)?.webContents.id;
  const server = new McpServer({ name: "processflow-architect", version: "0.1.0" });
  registerProcessflowTools(server, {
    workspace: appWorkspace(),
    exportToApp: (name, graph, target) => deliverMcpDiagram({ name, content: graph, target }, windowId),
    exportViewToApp: (name, graph, notation, replace) => deliverMcpDiagram({ name, content: graph, view: { notation, replace } }, windowId),
    exportMermaidToApp: (name, code) => deliverMcpDiagram({ name, content: code, mermaid: true }, windowId),
    getAppState: () => getAppState(windowId),
    readApp: request => readFromApp(request, windowId),
    actOnApp: (request, options) => actOnApp(request, { ...options, windowId }),
    // El playground corre DENTRO de la app: mismas capacidades que el modo HTTP.
    transport: "http",
  });
  const client = new Client({ name: "processflow-playground", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export interface PlaygroundTool {
  name: string;
  description: string;
  /** JSON Schema de los argumentos (para prellenar el editor del playground). */
  inputSchema: unknown;
}

export async function playgroundListTools(): Promise<PlaygroundTool[]> {
  const { client, close } = await connectedClient();
  try {
    const res = await client.listTools();
    return res.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema,
    }));
  } finally {
    await close();
  }
}

export interface PlaygroundCallResult {
  ok: boolean;
  /** Bloques de texto devueltos por la herramienta (o el mensaje de error). */
  blocks: string[];
  isError: boolean;
}

export async function playgroundCallTool(name: string, args: unknown, windowId?: number): Promise<PlaygroundCallResult> {
  try {
    const { client, close } = await connectedClient(windowId);
    try {
      const res = await client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> });
      const blocks = ((res.content ?? []) as Array<{ type: string; text?: string }>)
        .map((c) => (c.type === "text" && c.text ? c.text : `[bloque ${c.type}]`));
      return { ok: true, blocks: blocks.length ? blocks : ["(sin salida)"], isError: Boolean(res.isError) };
    } finally {
      await close();
    }
  } catch (e: any) {
    return { ok: false, blocks: [String(e?.message ?? e)], isError: true };
  }
}
