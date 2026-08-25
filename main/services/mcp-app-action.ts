/**
 * @fileOverview Puente de ACCIONES de la app para las herramientas MCP.
 *
 * Gemelo de `mcp-app-read.ts`: mismo patrón de petición con id, misma espera con
 * timeout y reintentos, misma promesa que nunca rechaza. La diferencia es que
 * esto CAMBIA algo en el proyecto del humano (borrar o renombrar una pestaña),
 * así que la respuesta del renderer no es opcional: el agente tiene que saber si
 * ocurrió, no suponerlo (issue #150).
 */

import { BrowserWindow, ipcMain } from "electron";
import type { AppActionRequest, AppActionResult } from "../../src/lib/mcp/app-actions";

/** Por intento. Una acción es más corta que una lectura: no arma payloads grandes. */
const TIMEOUT_MS = 2500;
const INTENTOS = 3;
const BACKOFF_MS = 300;

let seq = 0;
const pendientes = new Map<number, (r: AppActionResult) => void>();

/** Registra el canal de respuesta. Lo llama `registerIpc` una sola vez. */
export function initAppActionBridge(): void {
  ipcMain.on("mcp-app-action-reply", (_e, payload: { id: number; result: AppActionResult }) => {
    const resolver = pendientes.get(payload?.id);
    if (!resolver) return; // llegó tarde (timeout) o duplicada
    pendientes.delete(payload.id);
    resolver(payload.result);
  });
}

function intentar(
  win: Electron.BrowserWindow,
  request: AppActionRequest
): Promise<AppActionResult | null> {
  const id = ++seq;
  return new Promise<AppActionResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      resolve(null);
    }, TIMEOUT_MS);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("mcp-app-action", { id, request });
  });
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pide una acción al renderer. Nunca rechaza: el fallo viaja como resultado. */
export async function actOnApp(request: AppActionRequest): Promise<AppActionResult> {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) {
      return {
        ok: false,
        error:
          "La app no está abierta (o este servidor corre en modo repo/stdio): no hay proyecto sobre el que actuar. Pedile al usuario que abra Processflow Architect con el servidor MCP activo.",
      };
    }
    const r = await intentar(win, request);
    if (r) return r;
    if (intento < INTENTOS) await esperar(BACKOFF_MS * 2 ** (intento - 1));
  }
  return {
    ok: false,
    error: `La app no respondió tras ${INTENTOS} intentos de ${TIMEOUT_MS} ms. No se cambió nada: traé la ventana al frente y volvé a intentar.`,
  };
}
