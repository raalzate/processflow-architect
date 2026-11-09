import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { CollaborationCommand, CollaborationResult } from "../../src/lib/collaboration/types";
import type { WorkerRequest, WorkerResponse } from "./collaboration/worker";

let worker: Worker | undefined;
let stopped: Promise<void> | undefined;
export function registerCollaboration() {
  const background = new Worker(join(__dirname, "collaboration", "worker.js"), {
    workerData: { root: join(app.getPath("userData"), "collaboration") },
  });
  worker = background;
  const pending = new Map<number, (result: CollaborationResult) => void>();
  let sequence = 0;
  background.on("message", (message: WorkerResponse) => {
    if (message.type === "result") {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    } else {
      for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed()) window.webContents.send("collaboration-event", message.event);
    }
  });
  background.on("error", error => console.error("Collaboration worker:", error));
  stopped = new Promise(resolve => {
    background.once("exit", () => {
      worker = undefined;
      for (const finish of pending.values()) finish({ error: "El servicio de colaboración se cerró." });
      pending.clear();
      resolve();
    });
  });
  ipcMain.handle("collaboration-command", async (_event, command: CollaborationCommand) => {
    try {
      if (worker !== background) return { error: "El servicio de colaboración no está disponible." };
      const id = ++sequence;
      const result = await new Promise<CollaborationResult>((resolve, reject) => {
        pending.set(id, resolve);
        try {
          background.postMessage({ type: "command", id, command } satisfies WorkerRequest);
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
      // Una ventana compartida debe seguir proyectando cambios y animando
      // presencia cuando otra aplicación gana el foco. Restaurar el ahorro al salir.
      if (
        !result.error &&
        ["open", "create", "join", "leave"].includes(command.type) &&
        !_event.sender.isDestroyed()
      ) {
        _event.sender.setBackgroundThrottling(!result.status);
      }
      return result;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.on("collaboration-presence", (_event, fileId: string, presence: unknown) =>
    worker?.postMessage({ type: "presence", fileId, presence } satisfies WorkerRequest),
  );
}
export async function closeCollaboration() {
  const background = worker;
  worker = undefined;
  background?.postMessage({ type: "close" } satisfies WorkerRequest);
  await stopped;
}
