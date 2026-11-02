import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { CollaborationEngine } from "./collaboration/engine";
import type { CollaborationCommand } from "../../src/lib/collaboration/types";

let engine: CollaborationEngine | undefined;
export function registerCollaboration() {
  engine = new CollaborationEngine(join(app.getPath("userData"), "collaboration"), event => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("collaboration-event", event);
  });
  const ready = engine.start();
  ipcMain.handle("collaboration-command", async (_event, command: CollaborationCommand) => {
    try { await ready; return await engine!.command(command); }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.on("collaboration-presence", (_event, fileId: string, presence: unknown) => engine?.presence(fileId, presence));
  // Surface initialization failure through the command response, avoiding an
  // unhandled rejection before the first window has opened.
  void ready.catch(error => console.error("Collaboration initialization:", error instanceof Error ? error.message : "failed"));
}
export async function closeCollaboration() { await engine?.close(); }
