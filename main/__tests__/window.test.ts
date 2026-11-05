import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ focused: null as any, windows: [] as any[], menu: [] as any[] }));
vi.mock("electron", () => {
  const BrowserWindow = Object.assign(vi.fn(function () {
    const window = { on: vi.fn(), isDestroyed: vi.fn(() => false), loadURL: vi.fn(), webContents: {
      send: vi.fn(), openDevTools: vi.fn(), setWindowOpenHandler: vi.fn(),
      session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
    } }; state.windows.push(window); return window;
  }), { getFocusedWindow: () => state.focused, getAllWindows: () => state.windows });
  return { BrowserWindow, Menu: { buildFromTemplate: (items: any[]) => { state.menu = items; return {}; }, setApplicationMenu: vi.fn() }, shell: { openExternal: vi.fn() } };
});
vi.mock("../config", () => ({ isDev: true }));
vi.mock("../services/updater", () => ({ initUpdater: vi.fn(), checkForUpdates: vi.fn() }));
import { createMainWindow } from "../window";
describe("native menu with multiple project windows", () => {
  beforeEach(() => { state.focused = null; state.windows = []; state.menu = []; });
  it("sends editing actions and navigation to the focused window instead of the last created one", () => {
    const first = createMainWindow(), second = createMainWindow(); state.focused = first;
    state.menu.find(item => item.label === "Diseño").submenu.find((item: any) => item.label === "Eliminar selección").click();
    state.menu.find(item => item.label === "Archivo").submenu.find((item: any) => item.label === "Configuración").click();
    expect(first.webContents.send).toHaveBeenCalledWith("designer-action", "delete");
    expect(first.webContents.send).toHaveBeenCalledWith("navigate", "/settings");
    expect(second.webContents.send).not.toHaveBeenCalled();
  });
  it("opens a secondary window bound to the requested project", () => {
    const window = createMainWindow("project with spaces");
    expect(window.loadURL).toHaveBeenCalledWith("http://localhost:3000/?project=project+with+spaces");
  });
});
