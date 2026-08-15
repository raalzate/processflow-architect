/**
 * @fileOverview Caché del estado de la app para las herramientas MCP.
 *
 * El agente externo necesita saber qué hay en el lienzo ANTES de exportar
 * (proyecto activo, notación, vistas existentes). Ese estado sólo existe en el
 * renderer, así que el renderer lo PUBLICA por IPC cada vez que cambia y aquí se
 * guarda el último retrato; `get_app_state` lo sirve.
 *
 * Sentido del flujo: renderer → main. No se le pregunta al renderer bajo demanda
 * (una petición MCP no puede esperar un round-trip a una ventana que puede estar
 * cerrada); si nadie publicó nada, el estado es `null` y la herramienta lo dice.
 */

import type { AppState } from "../../src/lib/mcp/app-state";

let current: AppState | null = null;

/** Guarda el retrato publicado por el renderer. */
export function setAppState(state: AppState | null): void {
  current = state;
}

/** Último retrato conocido (null si la app nunca publicó: modo stdio o app cerrada). */
export function getAppState(): AppState | null {
  return current;
}
