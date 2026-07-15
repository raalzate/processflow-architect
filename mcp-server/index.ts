#!/usr/bin/env node
/**
 * @fileOverview Servidor MCP de Processflow Architect — transporte stdio (dev).
 *
 * Modo DESARROLLO: requiere el repo clonado; Claude Code lo lanza vía
 * `npx tsx mcp-server/index.ts` (ver .mcp.json). Para usuarios de la app
 * empaquetada existe el modo HTTP embebido: se activa en Ajustes → Servidor MCP
 * y expone las MISMAS herramientas en http://127.0.0.1:<puerto>/mcp.
 *
 * Las herramientas viven en `main/services/mcp-tools.ts` (compartidas por ambos
 * transportes); la lógica de diagramas es pura y testeada en `src/lib/mcp`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerProcessflowTools } from "../main/services/mcp-tools";

// Workspace: donde se guardan los modelos en curso y las exportaciones.
// Configurable por env; por defecto el cwd (Claude Code corre en la raíz del repo).
const WORKSPACE = process.env.PROCESSFLOW_WORKSPACE || process.cwd();

async function main() {
  const server = new McpServer({ name: "processflow-architect", version: "0.1.0" });
  registerProcessflowTools(server, { workspace: WORKSPACE });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // No escribir en stdout: es el canal del protocolo. Los logs van a stderr.
  process.stderr.write(`[processflow-mcp] listo (stdio). Workspace: ${WORKSPACE}\n`);
}

main().catch((e) => {
  process.stderr.write(`[processflow-mcp] error fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
