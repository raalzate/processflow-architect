import { describe, it, expect, afterEach, vi } from "vitest";
import {
  capacidadesHost,
  capacidadesDe,
  hostBridge,
  hostKind,
  setHostBridge,
  SIN_CAPACIDADES,
} from "@/lib/host-bridge";

afterEach(() => {
  setHostBridge(null);
  vi.unstubAllGlobals();
});

describe("hostBridge", () => {
  it("sin window (SSR, tests de Node) no hay puente", () => {
    expect(hostBridge()).toBeUndefined();
    expect(hostKind()).toBe("none");
  });

  it("en el navegador sin Electron ni adaptador tampoco hay puente", () => {
    vi.stubGlobal("window", {});
    expect(hostBridge()).toBeUndefined();
    expect(hostKind()).toBe("none");
  });

  it("dentro de Electron devuelve el puente del preload", () => {
    const electronAPI = { copyToClipboard: vi.fn() };
    vi.stubGlobal("window", { electronAPI });
    expect(hostBridge()).toBe(electronAPI);
    expect(hostKind()).toBe("desktop");
  });

  it("lee el puente en cada llamada: el preload puede llegar después del import", () => {
    vi.stubGlobal("window", {});
    expect(hostBridge()).toBeUndefined();
    const electronAPI = { systemInfo: vi.fn() };
    vi.stubGlobal("window", { electronAPI });
    expect(hostBridge()).toBe(electronAPI);
  });

  it("un adaptador inyectado manda sobre el preload y marca el host como web", () => {
    vi.stubGlobal("window", { electronAPI: { copyToClipboard: vi.fn() } });
    const web = { remoteGenerate: vi.fn() };
    setHostBridge(web);
    expect(hostBridge()).toBe(web);
    expect(hostKind()).toBe("web");
  });

  it("quitar el adaptador vuelve al preload", () => {
    const electronAPI = { copyToClipboard: vi.fn() };
    vi.stubGlobal("window", { electronAPI });
    setHostBridge({ remoteGenerate: vi.fn() });
    setHostBridge(null);
    expect(hostBridge()).toBe(electronAPI);
    expect(hostKind()).toBe("desktop");
  });
});

describe("capacidadesDe", () => {
  it("sin puente no hay ninguna capacidad", () => {
    expect(capacidadesDe(undefined)).toEqual(SIN_CAPACIDADES);
  });

  it("cada capacidad depende sólo de que su método exista", () => {
    const c = capacidadesDe({
      remoteGenerate: vi.fn(),
      copyToClipboard: vi.fn(),
    });
    expect(c.iaRemota).toBe(true);
    expect(c.portapapeles).toBe(true);
    expect(c.modelosLocales).toBe(false);
    expect(c.mcpServidor).toBe(false);
    expect(c.mcpPlayground).toBe(false);
    expect(c.updater).toBe(false);
    expect(c.chatCli).toBe(false);
    expect(c.motorCli).toBe(false);
    expect(c.pdf).toBe(false);
    expect(c.captura).toBe(false);
    expect(c.sistema).toBe(false);
    expect(c.menuNativo).toBe(false);
  });

  it("el escritorio completo tiene todas", () => {
    const todo = {
      litertModelsList: vi.fn(),
      mcpServerStart: vi.fn(),
      mcpServerStatus: vi.fn(),
      mcpPlaygroundCall: vi.fn(),
      mcpPlaygroundListTools: vi.fn(),
      checkForUpdates: vi.fn(),
      agentCliGenerate: vi.fn(),
      agentCliSend: vi.fn(),
      agentCliStatus: vi.fn(),
      remoteGenerate: vi.fn(),
      generatePdf: vi.fn(),
      captureCanvas: vi.fn(),
      copyToClipboard: vi.fn(),
      systemInfo: vi.fn(),
      windowMenuPopup: vi.fn(),
    };
    expect(Object.values(capacidadesDe(todo)).every(Boolean)).toBe(true);
  });

  it("cada capacidad pide TODOS los métodos que usa su pantalla, no uno representativo", () => {
    // El botón de entrega consulta el estado y arranca: con sólo arrancar quedaría roto.
    expect(capacidadesDe({ mcpServerStart: vi.fn() }).mcpServidor).toBe(false);
    expect(capacidadesDe({ mcpPlaygroundCall: vi.fn() }).mcpPlayground).toBe(false);
    // La pestaña «Agente» lanza y consulta; un host que sólo genera texto no la sostiene.
    expect(capacidadesDe({ agentCliSend: vi.fn() }).chatCli).toBe(false);
  });

  it("el CLI como motor del router y el chat con el CLI son capacidades separadas", () => {
    const soloMotor = capacidadesDe({ agentCliGenerate: vi.fn() });
    expect(soloMotor.motorCli).toBe(true);
    expect(soloMotor.chatCli).toBe(false);
  });

  it("capacidadesHost usa el puente vigente", () => {
    setHostBridge({ remoteGenerate: vi.fn() });
    expect(capacidadesHost().iaRemota).toBe(true);
    expect(capacidadesHost().modelosLocales).toBe(false);
  });
});
