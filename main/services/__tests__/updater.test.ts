import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/** `electron` y `electron-updater` no existen en la suite: se simulan. */
const electron = {
  app: { isPackaged: true, getVersion: () => "0.8.1" },
  shell: { openExternal: vi.fn(async () => {}) },
};
const autoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowPrerelease: true,
  on: vi.fn(),
  checkForUpdates: vi.fn(async () => ({})),
  downloadUpdate: vi.fn(async () => []),
  quitAndInstall: vi.fn(),
};

vi.mock("electron", () => electron);
vi.mock("electron-updater", () => ({ autoUpdater }));

const cargar = async () => {
  vi.resetModules();
  return import("../updater");
};

/** Respuesta de `releases/latest` con la versión dada. */
const releaseLatest = (tag: string, extra: Record<string, unknown> = {}) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ tag_name: tag, html_url: "https://github.com/o/r/releases/tag/" + tag, ...extra }),
  })) as unknown as typeof fetch;

beforeEach(() => {
  electron.app.isPackaged = true;
  vi.stubGlobal("process", { ...process, platform: "win32" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("checkForUpdates", () => {
  it("ofrece la versión publicada cuando es más nueva", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    const { checkForUpdates } = await cargar();
    const estado = await checkForUpdates();
    expect(estado).toMatchObject({ tipo: "disponible", version: "0.9.0", instalable: true });
  });

  it("no ofrece nada cuando ya está al día", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.8.1"));
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
  });

  it("no ofrece volver atrás si la instalada es más nueva", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.7.0"));
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
  });

  it("un borrador NO se ofrece, aunque el tag sea más nuevo", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.9.0", { draft: true }));
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
  });

  it("un fallo de red queda en silencio para el usuario", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("sin conexión");
    }) as unknown as typeof fetch);
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
  });

  it("una respuesta que no es 200 tampoco alarma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch);
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
  });

  it("en DESARROLLO no consulta la red: actualizar un árbol de fuentes no tiene sentido", async () => {
    electron.app.isPackaged = false;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    const { checkForUpdates } = await cargar();
    expect((await checkForUpdates()).tipo).toBe("al-dia");
    expect(spy).not.toHaveBeenCalled();
  });

  it("en macOS la versión disponible se marca NO instalable", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    const { checkForUpdates } = await cargar();
    expect(await checkForUpdates()).toMatchObject({ tipo: "disponible", instalable: false });
  });
});

describe("downloadUpdate", () => {
  it("en Windows descarga y deja el updater configurado para NO hacer nada solo", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    const { checkForUpdates, downloadUpdate } = await cargar();
    await checkForUpdates();
    await downloadUpdate();
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdater.allowPrerelease).toBe(false);
  });

  it("pulsar dos veces NO lanza dos descargas", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    const { checkForUpdates, downloadUpdate } = await cargar();
    await checkForUpdates();
    await Promise.all([downloadUpdate(), downloadUpdate()]);
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("un fallo de descarga informa el motivo y no toca lo instalado", async () => {
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error("disco lleno"));
    const { checkForUpdates, downloadUpdate } = await cargar();
    await checkForUpdates();
    expect(await downloadUpdate()).toMatchObject({ tipo: "fallo", motivo: "disco lleno" });
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("en macOS NO descarga: abre la página del release", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    vi.stubGlobal("fetch", releaseLatest("v0.9.0"));
    const { checkForUpdates, downloadUpdate } = await cargar();
    await checkForUpdates();
    await downloadUpdate();
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(electron.shell.openExternal).toHaveBeenCalledWith(
      "https://github.com/o/r/releases/tag/v0.9.0"
    );
  });
});

describe("quitAndInstall", () => {
  it("no reinicia si no hay una actualización descargada", async () => {
    const { quitAndInstall } = await cargar();
    await quitAndInstall();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe("openReleasePage", () => {
  it("sólo abre https: un enlace que no lo sea no llega al sistema", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.9.0", html_url: "file:///etc/passwd" }),
    })) as unknown as typeof fetch);
    const { checkForUpdates, openReleasePage } = await cargar();
    await checkForUpdates();
    await openReleasePage();
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
  });
});
