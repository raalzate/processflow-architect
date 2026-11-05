import { ipcMain } from "electron";
import { assertAiWindowWritable, mcpAppWindow } from "./mcp-app-window";
import { getAppState } from "./mcp-app-state";
interface Delivery { name: string; content: unknown; view?: { notation?: string; replace?: boolean }; mermaid?: boolean; target?: { project: string } }
let initialized = false, sequence = 0;
const pending = new Map<number, { sender: number; resolve: (r: { ok: boolean; error?: string }) => void }>();
/** Una entrega se confirma después de aplicar el cambio, no después de enviarlo a otra ventana. */
export async function deliverMcpDiagram(payload: Delivery, windowId?: number): Promise<boolean> {
  const win = mcpAppWindow(windowId); if (!win) return false;
  const editsCurrent = !!(payload.view || payload.mermaid || payload.target);
  if (editsCurrent) assertAiWindowWritable(win);
  if (!initialized) { initialized = true; ipcMain.on("mcp-import-reply", (event, message: { id: number; ok: boolean; error?: string }) => { const call = pending.get(message.id); if (call?.sender === event.sender.id) { pending.delete(message.id); call.resolve(message); } }); }
  const id = ++sequence, state = getAppState(win.webContents.id);
  const result = await new Promise<{ ok: boolean; error?: string }>(resolve => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: "La ventana no confirmó la entrega. Consulta get_app_state antes de repetirla." }); }, 5000);
    pending.set(id, { sender: win.webContents.id, resolve: r => { clearTimeout(timer); resolve(r); } });
    win.webContents.send("mcp-import-diagram", { ...payload, id, expectedContext: { projectId: state?.projectId, branchId: state?.collaboration?.branchId } });
  });
  if (!result.ok) throw new Error(result.error ?? "La ventana rechazó el cambio.");
  return true;
}
