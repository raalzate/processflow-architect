// preload.ts — API expuesta al renderer. La IA local corre en el renderer
// (LiteRT-LM / WebGPU); aquí solo: navegación, PDF, portapapeles y gestión de
// modelos .litertlm (descarga/estado/borrado, servidos por litert-model://).
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  generatePdf: (markdown: string) => ipcRenderer.invoke('convert-md-to-pdf', markdown),
  navigate: (callback: any) => ipcRenderer.on('navigate', callback),
  onDesignerAction: (callback: (action: string) => void) => {
    const listener = (_e: any, action: string) => callback(action);
    ipcRenderer.on('designer-action', listener);
    return () => ipcRenderer.removeListener('designer-action', listener);
  },
  copyToClipboard: (text: string): Promise<boolean> => ipcRenderer.invoke('copy-to-clipboard', text),
  captureCanvas: (rect: { x: number; y: number; width: number; height: number }): Promise<string> =>
    ipcRenderer.invoke('capture-canvas', rect),

  // --- Modelos LiteRT-LM (.litertlm) ---
  litertModelsList: (): Promise<{ totalRamGB: number; models: any[] }> =>
    ipcRenderer.invoke('litert-models-list'),
  litertModelDownload: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('litert-model-download', id),
  litertModelDelete: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('litert-model-delete', id),
  litertModelReveal: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('litert-model-reveal', id),
  onLitertModelProgress: (callback: (data: { id: string; percent: number }) => void) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('litert-model-progress', listener);
    return () => ipcRenderer.removeListener('litert-model-progress', listener);
  },

  // --- Servidor MCP embebido (HTTP): activar/estado + diagramas entrantes ---
  mcpServerStart: (port?: number): Promise<{ running: boolean; port: number; url: string; error?: string }> =>
    ipcRenderer.invoke('mcp-server-start', port),
  mcpServerStop: (): Promise<{ running: boolean; port: number; url: string }> =>
    ipcRenderer.invoke('mcp-server-stop'),
  mcpServerStatus: (): Promise<{ running: boolean; port: number; url: string }> =>
    ipcRenderer.invoke('mcp-server-status'),
  /** Abre el menú de la app desde la barra de título propia. */
  windowMenuPopup: (x?: number, y?: number): void => ipcRenderer.send('window-menu-popup', x, y),
  mcpOrgsStatus: (): Promise<{ pinned: string | null; orgs: { slug: string; nombre: string }[] }> =>
    ipcRenderer.invoke('mcp-orgs-status'),
  mcpOrgCreate: (nombre: string): Promise<{ ok: boolean; slug?: string; error?: string }> =>
    ipcRenderer.invoke('mcp-org-create', nombre),
  mcpOrgRename: (slug: string, nombre: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp-org-rename', slug, nombre),
  mcpOrgDelete: (slug: string): Promise<{ ok: boolean; movidos?: string[]; error?: string }> =>
    ipcRenderer.invoke('mcp-org-delete', slug),
  onMcpImportDiagram: (
    callback: (data: {
      name: string;
      content: any;
      view?: { notation?: string; replace?: boolean };
      mermaid?: boolean;
      target?: { project: string };
    }) => void
  ) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('mcp-import-diagram', listener);
    return () => ipcRenderer.removeListener('mcp-import-diagram', listener);
  },

  // Lectura bajo demanda: el main pide contenido (artefactos, vistas, otro
  // proyecto) y el renderer contesta por el canal de respuesta con el mismo id.
  // Acciones sobre el proyecto pedidas por MCP (borrar/renombrar una vista): el
  // main pide, el renderer aplica y contesta por el canal de respuesta.
  onMcpAppAction: (
    handler: (payload: { id: number; request: any }) => void
  ) => {
    const listener = (_e: any, payload: any) => handler(payload);
    ipcRenderer.on('mcp-app-action', listener);
    return () => ipcRenderer.removeListener('mcp-app-action', listener);
  },
  mcpAppActionReply: (id: number, result: any) =>
    ipcRenderer.send('mcp-app-action-reply', { id, result }),

  onMcpAppRead: (
    handler: (payload: { id: number; request: any }) => void
  ) => {
    const listener = (_e: any, payload: any) => handler(payload);
    ipcRenderer.on('mcp-app-read', listener);
    return () => ipcRenderer.removeListener('mcp-app-read', listener);
  },
  mcpAppReadReply: (id: number, result: unknown): void => {
    ipcRenderer.send('mcp-app-read-reply', { id, result });
  },

  // Publica el estado del lienzo (proyecto activo, notación, vistas) para que las
  // herramientas MCP lo lean. Fire-and-forget: nunca debe frenar el render.
  mcpPublishAppState: (state: unknown): void => {
    ipcRenderer.send('mcp-app-state', state);
  },

  // --- Playground MCP (guía /mcp) ---
  mcpPlaygroundListTools: (): Promise<any[]> => ipcRenderer.invoke('mcp-playground-list-tools'),
  mcpPlaygroundCall: (name: string, args: unknown): Promise<any> =>
    ipcRenderer.invoke('mcp-playground-call', name, args),

  // --- Información del sistema (Configuración → Sistema) ---
  systemInfo: (): Promise<any> => ipcRenderer.invoke('system-info'),

  // --- IA remota (opcional): llaves cifradas en el main + generación de texto ---
  setAiKey: (provider: string, key: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('ai-key-set', provider, key),
  deleteAiKey: (provider: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('ai-key-delete', provider),
  getAiKeyStatus: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('ai-key-status'),
  /** Estado de la GPU tal como lo ve Chromium (lo mismo que `chrome://gpu`). */
  getGpuFeatureStatus: (): Promise<Record<string, string>> => ipcRenderer.invoke('gpu-feature-status'),
  remoteGenerate: (args: {
    provider: string;
    model: string;
    prompt: string;
    system?: string;
  }): Promise<string> => ipcRenderer.invoke('ai-remote-generate', args),
});
