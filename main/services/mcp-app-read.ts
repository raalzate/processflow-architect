/**
 * @fileOverview Puente de LECTURA de la app para las herramientas MCP.
 *
 * El inventario (`mcp-app-state.ts`) se publica: renderer → main, barato y siempre
 * fresco. El CONTENIDO no se puede publicar igual —serían todos los artefactos y
 * todos los grafos de todos los proyectos cacheados en el main para nada—, así que
 * acá sí se le pregunta al renderer bajo demanda.
 *
 * Lo que hacía inviable preguntar era esperar a una ventana que puede estar
 * cerrada; se resuelve con un TIMEOUT corto y un error legible: la herramienta
 * MCP contesta "la app no respondió" en vez de colgar la sesión del cliente.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { AppReadRequest, AppReadResult } from "../../src/lib/mcp/app-read";

/** Más allá de esto se asume que el renderer no va a contestar. */
const TIMEOUT_MS = 2500;

let seq = 0;
const pendientes = new Map<number, (r: AppReadResult) => void>();

/** Registra el canal de respuesta. Lo llama `registerIpc` una sola vez. */
export function initAppReadBridge(): void {
  ipcMain.on("mcp-app-read-reply", (_e, payload: { id: number; result: AppReadResult }) => {
    const resolver = pendientes.get(payload?.id);
    if (!resolver) return; // llegó tarde (timeout) o duplicada
    pendientes.delete(payload.id);
    resolver(payload.result);
  });
}

/** Pide contenido al renderer. Nunca rechaza: el fallo viaja como resultado. */
export function readFromApp(request: AppReadRequest): Promise<AppReadResult> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) {
    return Promise.resolve({
      ok: false,
      error:
        "La app no está abierta (o este servidor corre en modo repo/stdio): no hay proyecto del que leer. Pedile al usuario que abra Processflow Architect con el servidor MCP activo.",
    });
  }
  const id = ++seq;
  return new Promise<AppReadResult>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      resolve({
        ok: false,
        error: `La app no respondió en ${TIMEOUT_MS} ms. Puede estar cargando un proyecto grande: reintentá.`,
      });
    }, TIMEOUT_MS);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("mcp-app-read", { id, request });
  });
}
