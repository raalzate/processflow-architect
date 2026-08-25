/**
 * @fileOverview Puente de LECTURA de la app para las herramientas MCP.
 *
 * El inventario (`mcp-app-state.ts`) se publica: renderer → main, barato y siempre
 * fresco. El CONTENIDO no se puede publicar igual —serían todos los artefactos y
 * todos los grafos de todos los proyectos cacheados en el main para nada—, así que
 * acá sí se le pregunta al renderer bajo demanda.
 *
 * Lo que hacía inviable preguntar era esperar a una ventana que puede estar
 * cerrada; se resuelve con un TIMEOUT corto POR INTENTO, unos pocos reintentos
 * con backoff (la app puede estar cargando un proyecto grande) y, sólo al
 * agotarlos, un error legible: la herramienta MCP contesta "la app no respondió"
 * en vez de colgar la sesión del cliente.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { AppReadRequest, AppReadResult } from "../../src/lib/mcp/app-read";

/** Más allá de esto se asume que el renderer no va a contestar (por intento). */
const TIMEOUT_MS = 2500;
/**
 * Intentos antes de rendirse. Es la llamada de INGESTA del paso 0: fallar ahí
 * empuja al agente a saltarse la reutilización y modelar a ciegas. El mensaje
 * viejo decía «puede estar cargando un proyecto grande: reintentá» — que lo haga
 * la herramienta, no el humano.
 */
const INTENTOS = 3;
/** Espera entre intentos (backoff): 300 ms, 600 ms. */
const BACKOFF_MS = 300;

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

/** Un intento: manda la petición y espera hasta `TIMEOUT_MS`. `null` = no contestó. */
function intentar(
  win: Electron.BrowserWindow,
  request: AppReadRequest
): Promise<AppReadResult | null> {
  const id = ++seq;
  return new Promise<AppReadResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pendientes.delete(id);
      resolve(null);
    }, TIMEOUT_MS);
    pendientes.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("mcp-app-read", { id, request });
  });
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Pide contenido al renderer, con reintentos. Nunca rechaza: el fallo viaja
 * como resultado, y sólo después de agotar los intentos.
 */
export async function readFromApp(request: AppReadRequest): Promise<AppReadResult> {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    // La ventana se busca en CADA intento: puede aparecer mientras esperamos
    // (arranque de la app) o irse en el medio.
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) {
      return {
        ok: false,
        error:
          "La app no está abierta (o este servidor corre en modo repo/stdio): no hay proyecto del que leer. Pedile al usuario que abra Processflow Architect con el servidor MCP activo.",
      };
    }
    const r = await intentar(win, request);
    if (r) return r;
    if (intento < INTENTOS) await esperar(BACKOFF_MS * 2 ** (intento - 1));
  }
  return {
    ok: false,
    error: `La app no respondió tras ${INTENTOS} intentos de ${TIMEOUT_MS} ms. Puede estar cargando un proyecto muy grande o la ventana estar bloqueada: pedile al usuario que la traiga al frente y volvé a llamar.`,
  };
}
