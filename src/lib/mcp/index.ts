/**
 * @fileOverview Punto de entrada de la lógica PURA del MCP.
 *
 * El servidor stdio (`mcp-server/`) importa desde aquí; la app y vitest también.
 * Todo lo exportado es puro (sin React/Electron) para poder testearse y correr
 * en el proceso del MCP.
 */

export * from "./catalog";
export * from "./diagram-builder";
export * from "./to-mermaid";
