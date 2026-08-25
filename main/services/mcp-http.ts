/**
 * @fileOverview Servidor MCP embebido en la app — transporte HTTP (Streamable).
 *
 * Se activa desde Ajustes → «Servidor MCP» (apagado por defecto, coherente con
 * la filosofía opt-in del proyecto). Mientras corre, cualquier cliente MCP
 * (Claude Code, Codex, …) se conecta a http://127.0.0.1:<puerto>/mcp y obtiene
 * las mismas herramientas del modo stdio, con una diferencia clave:
 * `export_to_app` INYECTA el diagrama directo al lienzo (vía IPC al renderer)
 * en lugar de requerir importación manual del .json.
 *
 * Seguridad:
 *  - Escucha SOLO en 127.0.0.1 (loopback): nada expuesto a la red.
 *  - Modo stateless del transporte: un servidor MCP nuevo por petición, sin
 *    sesiones que gestionar; el estado real (diagramas) vive en disco
 *    (userData/mcp-workspace) y sobrevive reinicios.
 *  - Un POST cross-origin desde un navegador con `content-type: application/json`
 *    dispara preflight CORS que este servidor no responde → bloqueado.
 */

import http from "node:http";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerProcessflowTools } from "./mcp-tools";
import { getAppState } from "./mcp-app-state";
import { readFromApp } from "./mcp-app-read";
import { actOnApp } from "./mcp-app-action";
import type { GraphData } from "../../src/lib/types";
import type { NotationId } from "../../src/lib/notations";

export const MCP_DEFAULT_PORT = 7331;

let httpServer: http.Server | null = null;
let currentPort = 0;

/** Workspace de la app: userData/mcp-workspace (diagramas en curso + exports). */
function appWorkspace(): string {
  return path.join(app.getPath("userData"), "mcp-workspace");
}

/** Entrega un diagrama exportado al renderer para cargarlo en el lienzo. */
async function exportToApp(
  name: string,
  graph: GraphData,
  target?: { project: string }
): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  // `target` presente ⇒ ACTUALIZAR ese proyecto; ausente ⇒ proyecto nuevo.
  win.webContents.send("mcp-import-diagram", { name, content: graph, target });
  // Traer la app al frente para que el usuario vea el diagrama llegar.
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Entrega un diagrama al renderer como VISTA custom del proyecto activo. */
async function exportViewToApp(
  name: string,
  graph: GraphData,
  notation: NotationId,
  replace?: boolean
): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  win.webContents.send("mcp-import-diagram", { name, content: graph, view: { notation, replace } });
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Entrega código Mermaid al renderer como VISTA Mermaid del proyecto activo. */
async function exportMermaidToApp(name: string, code: string): Promise<boolean> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return false;
  win.webContents.send("mcp-import-diagram", { name, content: code, mermaid: true });
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/** Construye un servidor MCP con las herramientas registradas (uno por petición). */
function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "processflow-architect", version: "0.1.0" });
  registerProcessflowTools(server, {
    workspace: appWorkspace(),
    // En la app empaquetada no hay línea de comandos: el default sale del
    // entorno, y lo normal es fijar el diagrama con `use_diagram`.
    defaultDiagramId: process.env.PROCESSFLOW_DIAGRAM || undefined,
    defaultProject: process.env.PROCESSFLOW_PROJECT || undefined,
    exportToApp,
    exportViewToApp,
    exportMermaidToApp,
    getAppState,
    readApp: readFromApp,
    actOnApp,
    // El skill que instale el agente debe describir ESTE transporte, no el del repo.
    transport: "http",
    serverUrl: () => `http://127.0.0.1:${currentPort}/mcp`,
  });
  return server;
}

/** Lee y parsea el body JSON de la petición (undefined si falta o es inválido). */
function readJsonBody(req: http.IncomingMessage): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${currentPort}`);
  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" }).end(
      JSON.stringify({ error: "Usa POST /mcp (Model Context Protocol)." })
    );
    return;
  }
  if (req.method !== "POST") {
    // Modo stateless: sin stream de servidor (GET) ni sesiones que borrar (DELETE).
    res.writeHead(405, { "content-type": "application/json", allow: "POST" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Método no permitido: servidor MCP stateless (solo POST)." },
        id: null,
      })
    );
    return;
  }

  // Un servidor+transporte NUEVO por petición (stateless): sin estado en memoria
  // compartido entre clientes; el estado persistente vive en disco.
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    const body = await readJsonBody(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e: any) {
    console.error("[mcp-http] error atendiendo petición:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Error interno del servidor MCP." },
          id: null,
        })
      );
    }
  }
}

export interface McpHttpStatus {
  running: boolean;
  port: number;
  url: string;
}

export function mcpHttpStatus(): McpHttpStatus {
  const running = Boolean(httpServer?.listening);
  return {
    running,
    port: running ? currentPort : 0,
    url: running ? `http://127.0.0.1:${currentPort}/mcp` : "",
  };
}

export async function startMcpHttp(port = MCP_DEFAULT_PORT): Promise<McpHttpStatus & { error?: string }> {
  if (httpServer?.listening) {
    if (currentPort === port) return mcpHttpStatus();
    await stopMcpHttp(); // cambio de puerto: reinicia
  }
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => void handleRequest(req, res));
    server.once("error", (e: NodeJS.ErrnoException) => {
      httpServer = null;
      resolve({
        running: false,
        port: 0,
        url: "",
        error:
          e.code === "EADDRINUSE"
            ? `El puerto ${port} está ocupado. Elige otro.`
            : e.message,
      });
    });
    // SOLO loopback: el servidor no es accesible desde la red.
    server.listen(port, "127.0.0.1", () => {
      httpServer = server;
      currentPort = port;
      console.log(`[mcp-http] escuchando en http://127.0.0.1:${port}/mcp`);
      resolve(mcpHttpStatus());
    });
  });
}

export async function stopMcpHttp(): Promise<McpHttpStatus> {
  const server = httpServer;
  httpServer = null;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log("[mcp-http] detenido");
  }
  return mcpHttpStatus();
}
