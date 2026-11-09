import { BrowserWindow } from "electron";
import { getAppState, getAppTarget } from "./mcp-app-state";
import { aiBranchPolicy } from "../../src/lib/mcp/branch-policy";
/** Inventario, lectura y acciones usan la misma ventana del editor, nunca DevTools. */
export function mcpAppWindow(preferredId?: number) {
  const windows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && !w.webContents.getURL().startsWith("devtools:"));
  if (preferredId !== undefined) return windows.find(w => w.webContents.id === preferredId);
  const focused = BrowserWindow.getFocusedWindow();
  return windows.find(w => w === focused) ?? windows.find(w => w.webContents.id === getAppTarget()) ?? windows[0];
}
export function assertAiWindowWritable(win: Electron.BrowserWindow) {
  const state = getAppState(win.webContents.id), policy = aiBranchPolicy(state?.collaboration);
  if (!policy.allowed) throw new Error(policy.error);
  return state;
}
