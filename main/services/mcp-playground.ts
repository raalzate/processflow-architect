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
import { app, BrowserWindow } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerProcessflowTools } from "./mcp-tools";
import { getAppState } from "./mcp-app-state";
import { readFromApp } from "./mcp-app-read";
import type { GraphData } from "../../src/lib/types";
import type { NotationId } from "../../src/lib/notations";

/** Mismo workspace que el servidor HTTP embebido (estado compartido en disco). */
function appWorkspace(): string {
  return path.join(app.getPath("userData"), "mcp-workspace");
}

/** Igual que en mcp-http: entrega el diagrama exportado al lienzo del renderer. */
async function exportToApp(name: string, graph: GraphData): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  win.webContents.send("mcp-import-diagram", { name, content: graph });
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Igual que en mcp-http: entrega el diagrama como VISTA del proyecto activo. */
async function exportViewToApp(name: string, graph: GraphData, notation: NotationId): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  win.webContents.send("mcp-import-diagram", { name, content: graph, view: { notation } });
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Igual que en mcp-http: entrega código Mermaid como VISTA Mermaid del proyecto activo. */
async function exportMermaidToApp(name: string, code: string): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  win.webContents.send("mcp-import-diagram", { name, content: code, mermaid: true });
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Cliente conectado a un servidor nuevo por par de transportes en memoria. */
async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = new McpServer({ name: "processflow-architect", version: "0.1.0" });
  registerProcessflowTools(server, {
    workspace: appWorkspace(),
    exportToApp,
    exportViewToApp,
    exportMermaidToApp,
    getAppState,
    readApp: readFromApp,
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

export async function playgroundCallTool(name: string, args: unknown): Promise<PlaygroundCallResult> {
  try {
    const { client, close } = await connectedClient();
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
