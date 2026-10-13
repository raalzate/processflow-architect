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
  request: AppActionRequest,
  timeoutMs: number
): Promise<AppActionResult | null> {
  const id = ++seq;
  return new Promise<AppActionResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      resolve(null);
    }, timeoutMs);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("mcp-app-action", { id, request });
  });
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cómo esperar. Lo que NO es idempotente (crear un proyecto, #534) va con un solo
 * intento: reintentar ante una app lenta crearía el proyecto dos veces.
 */
export interface OpcionesAccion {
  intentos?: number;
  timeoutMs?: number;
}

/** Pide una acción al renderer. Nunca rechaza: el fallo viaja como resultado. */
export async function actOnApp(request: AppActionRequest, opciones: OpcionesAccion = {}): Promise<AppActionResult> {
  const intentos = opciones.intentos ?? INTENTOS;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  for (let intento = 1; intento <= intentos; intento++) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) {
      return {
        ok: false,
        error:
          "La app no está abierta (o este servidor corre en modo repo/stdio): no hay proyecto sobre el que actuar. Pedile al usuario que abra Processflow Architect con el servidor MCP activo.",
      };
    }
    const r = await intentar(win, request, timeoutMs);
    if (r) return r;
    if (intento < intentos) await esperar(BACKOFF_MS * 2 ** (intento - 1));
  }
  // Con un solo intento la app pudo haberlo hecho igual, tarde: decir «no se
  // cambió nada» sería mentir y el reintento duplicaría.
  return {
    ok: false,
    error:
      intentos === 1
        ? `La app no confirmó en ${timeoutMs} ms. Puede que lo haya hecho igual: mirá get_app_state (o list_projects) antes de reintentar, para no duplicar.`
        : `La app no respondió tras ${intentos} intentos de ${timeoutMs} ms. No se cambió nada: traé la ventana al frente y volvé a intentar.`,
  };
}
