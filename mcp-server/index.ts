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

/** Valor de `--flag <valor>` (o `--flag=valor`) en los argumentos del proceso. */
function argumento(nombre: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${nombre}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const pegado = args.find((a) => a.startsWith(`--${nombre}=`));
  return pegado?.slice(nombre.length + 3) || undefined;
}

/**
 * Diagrama por defecto del servidor: se declara en `.mcp.json`
 * (`"args": ["tsx", "mcp-server/index.ts", "--diagram", "<id>"]`) o por env.
 * Ata la sesión a un diagrama sin repetir `diagramId` en cada llamada; lo pisan
 * `use_diagram` y el `diagramId` explícito.
 */
const DEFAULT_DIAGRAM = argumento("diagram") || process.env.PROCESSFLOW_DIAGRAM || undefined;

/**
 * Proyecto de la APP al que van las entregas (`--project "Enrollment v2"` en
 * `.mcp.json`, o `PROCESSFLOW_PROJECT`). Con esto `export_to_app` actualiza ese
 * proyecto en vez de crear uno nuevo por entrega. Sólo tiene efecto con la app
 * conectada (modo HTTP); en stdio la entrega es un `.json`.
 */
const DEFAULT_PROJECT = argumento("project") || process.env.PROCESSFLOW_PROJECT || undefined;

/**
 * Organización por defecto (`--org "acme"` en `.mcp.json`, o `PROCESSFLOW_ORG`).
 * Agrupa los diagramas en `.processflow/orgs/<slug>/diagrams/` y AÍSLA la sesión: con
 * ella puesta, el agente no ve los diagramas de otras organizaciones. La pisan
 * `use_org` y el `org` explícito de cada llamada.
 */
const DEFAULT_ORG = argumento("org") || process.env.PROCESSFLOW_ORG || undefined;

async function main() {
  const server = new McpServer({ name: "processflow-architect", version: "0.1.0" });
  registerProcessflowTools(server, {
    workspace: WORKSPACE,
    defaultDiagramId: DEFAULT_DIAGRAM,
    defaultProject: DEFAULT_PROJECT,
    defaultOrg: DEFAULT_ORG,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // No escribir en stdout: es el canal del protocolo. Los logs van a stderr.
  process.stderr.write(
    `[processflow-mcp] listo (stdio). Workspace: ${WORKSPACE}${
      DEFAULT_ORG ? ` · organización: ${DEFAULT_ORG}` : ""
    }${DEFAULT_DIAGRAM ? ` · diagrama por defecto: ${DEFAULT_DIAGRAM}` : ""}\n`
  );
}

main().catch((e) => {
  process.stderr.write(`[processflow-mcp] error fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
