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
import { mcpAppWindow, assertAiWindowWritable } from "./mcp-app-window";
import { getAppState } from "./mcp-app-state";

/** Por intento. Una acción es más corta que una lectura: no arma payloads grandes. */
const TIMEOUT_MS = 2500;
const INTENTOS = 3;
const BACKOFF_MS = 300;

let seq = 0;
const pendientes = new Map<number, (r: AppActionResult) => void>();
const origins = new Map<number, number>();

/** Registra el canal de respuesta. Lo llama `registerIpc` una sola vez. */
export function initAppActionBridge(): void {
  ipcMain.on("mcp-app-action-reply", (_e, payload: { id: number; result: AppActionResult }) => {
    const resolver = origins.get(payload?.id) === _e.sender.id ? pendientes.get(payload?.id) : undefined;
    if (!resolver) return; // llegó tarde (timeout) o duplicada
    pendientes.delete(payload.id);
    origins.delete(payload.id);
    resolver(payload.result);
  });
}

function intentar(
  win: Electron.BrowserWindow,
  request: AppActionRequest,
  timeoutMs: number
): Promise<AppActionResult | null> {
  const id = ++seq;
  const state = request.kind === "collaboration" ? getAppState(win.webContents.id) : request.kind === "export-project" && request.mode === "new" ? undefined : assertAiWindowWritable(win);
  return new Promise<AppActionResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      origins.delete(id);
      resolve(null);
    }, timeoutMs);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    origins.set(id, win.webContents.id);
    win.webContents.send("mcp-app-action", { id, request, expectedContext: { projectId: state?.projectId, branchId: state?.collaboration?.branchId } });
  });
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cómo esperar. Lo que NO es idempotente (crear un proyecto, #534) va con un solo
 * intento: reintentar ante una app lenta crearía el proyecto dos veces.
 */
export interface OpcionesAccion {
  windowId?: number;
  intentos?: number;
  timeoutMs?: number;
}

/** Pide una acción al renderer. Nunca rechaza: el fallo viaja como resultado. */
export async function actOnApp(request: AppActionRequest, opciones: OpcionesAccion = {}): Promise<AppActionResult> {
  const intentos = opciones.intentos ?? INTENTOS;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  const selectedId = opciones.windowId ?? mcpAppWindow()?.webContents.id;
  for (let intento = 1; intento <= intentos; intento++) {
    const win = mcpAppWindow(selectedId);
    if (!win) {
      return {
        ok: false,
        error:
          "La app no está abierta (o este servidor corre en modo repo/stdio): no hay proyecto sobre el que actuar. Pedile al usuario que abra Processflow Architect con el servidor MCP activo.",
      };
    }
    let r: AppActionResult | null;
    try { r = await intentar(win, request, timeoutMs); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
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
