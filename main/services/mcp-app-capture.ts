/**
 * @fileOverview Puente de CAPTURA de la vista para `get_view_image` (#670).
 *
 * Mismo patrón que `mcp-app-read.ts` (petición por id, respuesta por canal), con
 * dos diferencias a propósito: un solo intento, porque reintentar una captura
 * vuelve a mover el zoom del humano, y un timeout largo, porque encuadrar,
 * esperar dos cuadros y capturar un lienzo grande tarda más que leer.
 */

import { ipcMain } from "electron";
import { mcpAppWindow } from "./mcp-app-window";
import { CAPTURA_TIMEOUT_MS, type CapturaVista } from "../../src/lib/mcp/view-image";

let seq = 0;
const pendientes = new Map<number, (r: CapturaVista) => void>();
const origins = new Map<number, number>();

/** Registra el canal de respuesta. Lo llama `registerIpc` una sola vez. */
export function initAppCaptureBridge(): void {
  ipcMain.on("mcp-app-capture-reply", (_e, payload: { id: number; result: CapturaVista }) => {
    const resolver = origins.get(payload?.id) === _e.sender.id ? pendientes.get(payload?.id) : undefined;
    if (!resolver) return; // llegó tarde, o la contestó otro lienzo montado
    pendientes.delete(payload.id);
    origins.delete(payload.id);
    resolver(payload.result);
  });
}

/** Pide al lienzo abierto una imagen de la vista. Nunca rechaza. */
export function captureFromApp(windowId?: number): Promise<CapturaVista> {
  const win = mcpAppWindow(windowId);
  if (!win) {
    return Promise.resolve({
      ok: false,
      error: "La app no está abierta: no hay vista que capturar. Pedile al usuario que abra Processflow Architect.",
    });
  }
  const id = ++seq;
  return new Promise<CapturaVista>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      origins.delete(id);
      resolve({
        ok: false,
        error:
          "La app no devolvió la imagen. Sólo se captura una vista de lienzo (no Mermaid ni la pantalla de bienvenida): pedile al humano que abra la vista en el lienzo y volvé a llamar.",
      });
    }, CAPTURA_TIMEOUT_MS);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    origins.set(id, win.webContents.id);
    win.webContents.send("mcp-app-capture", { id });
  });
}
