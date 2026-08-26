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
import {
  isValidOrgSlug,
  orgSlug,
  orgDirRel,
  diagramsDirRel,
  planOrgDeletion,
  conflictoBorrado,
} from "../../src/lib/mcp/orgs";
import { promises as fsp } from "node:fs";
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
    defaultOrg: process.env.PROCESSFLOW_ORG || undefined,
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

/**
 * Organizaciones del workspace del MCP y cuál está FIJADA para el agente.
 *
 * El renderer no toca disco, y sin esto el header no puede mostrar el sufijo «·MCP»:
 * el humano vería una organización en la app mientras el agente escribe en otra, sin
 * ninguna señal de la divergencia. Es lectura, no configuración.
 */
export async function mcpOrgsStatus(): Promise<{ pinned: string | null; orgs: { slug: string; nombre: string }[] }> {
  const raiz = path.join(appWorkspace(), ".processflow");
  let pinned: string | null = null;
  try {
    const activo = JSON.parse(await fsp.readFile(path.join(raiz, "active.json"), "utf8"));
    if (typeof activo?.org === "string") pinned = activo.org;
  } catch {
    /* sin fijado: el agente trabaja en la carpeta plana */
  }
  const orgs: { slug: string; nombre: string }[] = [];
  try {
    for (const e of await fsp.readdir(path.join(raiz, "orgs"), { withFileTypes: true })) {
      if (!e.isDirectory() || !isValidOrgSlug(e.name)) continue;
      let nombre = e.name;
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(raiz, "orgs", e.name, "org.json"), "utf8"));
        if (typeof meta?.nombre === "string" && meta.nombre.trim()) nombre = meta.nombre;
      } catch {
        /* carpeta sin org.json: el slug alcanza */
      }
      orgs.push({ slug: e.name, nombre });
    }
  } catch {
    /* todavía no hay organizaciones */
  }
  return { pinned, orgs: orgs.sort((a, b) => a.slug.localeCompare(b.slug)) };
}

/**
 * CRUD de organizaciones desde la UI. La app no puede hablar con sus propias tools MCP
 * (el transporte es para agentes externos), así que estas operaciones tocan el MISMO
 * workspace con las MISMAS reglas puras: el slug se valida, y eliminar SUELTA los
 * diagramas a la carpeta plana en vez de borrarlos.
 */
export async function mcpOrgCreate(nombre: string): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const slug = orgSlug(nombre);
  if (!slug) return { ok: false, error: `"${nombre}" no deja un nombre de carpeta usable.` };
  const raiz = path.join(appWorkspace(), ".processflow");
  const dir = path.join(raiz, orgDirRel(slug));
  try {
    await fsp.access(dir);
    return { ok: false, error: `Ya existe una organización "${slug}".` };
  } catch {
    /* no existe: se crea */
  }
  await fsp.mkdir(path.join(raiz, diagramsDirRel(slug)), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "org.json"),
    JSON.stringify({ nombre, createdAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return { ok: true, slug };
}

export async function mcpOrgRename(slug: string, nombre: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidOrgSlug(slug)) return { ok: false, error: "Organización inválida." };
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };
  const metaPath = path.join(appWorkspace(), ".processflow", orgDirRel(slug), "org.json");
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  } catch {
    /* carpeta sin org.json: se escribe uno */
  }
  try {
    await fsp.writeFile(metaPath, JSON.stringify({ ...meta, nombre: limpio }, null, 2), "utf8");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo renombrar." };
  }
}

export async function mcpOrgDelete(slug: string): Promise<{ ok: boolean; movidos?: string[]; error?: string }> {
  if (!isValidOrgSlug(slug)) return { ok: false, error: "Organización inválida." };
  const raiz = path.join(appWorkspace(), ".processflow");
  const listar = async (rel: string) => {
    try {
      return (await fsp.readdir(path.join(raiz, rel)))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  };
  const plan = planOrgDeletion(await listar(diagramsDirRel(slug)), await listar(diagramsDirRel(null)));
  if (plan.conflictos.length) return { ok: false, error: conflictoBorrado(slug, plan.conflictos) };

  if (plan.aMover.length) await fsp.mkdir(path.join(raiz, diagramsDirRel(null)), { recursive: true });
  for (const id of plan.aMover) {
    await fsp.rename(
      path.join(raiz, diagramsDirRel(slug), `${id}.json`),
      path.join(raiz, diagramsDirRel(null), `${id}.json`)
    );
  }
  await fsp.rm(path.join(raiz, orgDirRel(slug)), { recursive: true, force: true });
  // Un fijado colgado haría fallar toda llamada del agente con «ya no existe».
  const activeFile = path.join(raiz, "active.json");
  try {
    const activo = JSON.parse(await fsp.readFile(activeFile, "utf8"));
    if (activo?.org === slug) {
      delete activo.org;
      await fsp.writeFile(activeFile, JSON.stringify(activo, null, 2), "utf8");
    }
  } catch {
    /* sin fijados */
  }
  return { ok: true, movidos: plan.aMover };
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
