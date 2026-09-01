export interface LitertModelStatus {
  id: string;
  label: string;
  file: string;
  url: string;
  approxGB: number;
  blurb: string;
  downloaded: boolean;
  sizeBytes: number;
}

import type { AppState } from "@/lib/mcp/app-state";
import type { EstadoUpdate } from "@/lib/update-check";
import type { AppReadRequest, AppReadResult } from "@/lib/mcp/app-read";
import type { AppActionRequest, AppActionResult } from "@/lib/mcp/app-actions";

export interface McpServerStatus {
  running: boolean;
  port: number;
  url: string;
}

// Espejo de main/services/mcp-playground.ts (viaja por IPC).
export interface PlaygroundTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface PlaygroundCallResult {
  ok: boolean;
  blocks: string[];
  isError: boolean;
}

// Espejo de main/services/system-info.ts (viaja por IPC).
export interface SystemInfo {
  osName: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  diskTotalGB: number | null;
  diskFreeGB: number | null;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  userDataPath: string;
}

export interface ElectronAPI {
  generatePdf: (markdown: string) => Promise<any>;
  navigate: (callback: (event: any, ...args: any[]) => void) => void;
  onDesignerAction: (callback: (action: string) => void) => () => void;
  copyToClipboard: (text: string) => Promise<boolean>;
  /** Rasteriza una región de la página (px del viewport) y devuelve un data URL PNG. */
  captureCanvas: (rect: { x: number; y: number; width: number; height: number }) => Promise<string>;

  // Modelos LiteRT-LM (.litertlm) — la inferencia corre en el renderer (WebGPU).
  litertModelsList: () => Promise<{ totalRamGB: number; models: LitertModelStatus[] }>;
  litertModelDownload: (id: string) => Promise<{ ok: boolean; error?: string }>;
  litertModelDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  litertModelReveal: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onLitertModelProgress: (callback: (data: { id: string; percent: number }) => void) => () => void;

  // Servidor MCP embebido (HTTP, opt-in): Claude Code/Codex se conectan a la app.
  mcpServerStart: (port?: number) => Promise<McpServerStatus & { error?: string }>;
  mcpServerStop: () => Promise<McpServerStatus>;
  mcpServerStatus: () => Promise<McpServerStatus>;
  /** Organizaciones del workspace del MCP y cuál ve el agente (para el chip del header). */
  /** Abre el menú de la app (Windows/Linux, donde el marco con el menú está oculto). */
  windowMenuPopup?: (x?: number, y?: number) => void;
  mcpOrgsStatus?: () => Promise<{ pinned: string | null; orgs: { slug: string; nombre: string }[] }>;
  /** Crea una organización en el workspace del MCP; devuelve su slug. */
  mcpOrgCreate?: (nombre: string) => Promise<{ ok: boolean; slug?: string; error?: string }>;
  mcpOrgRename?: (slug: string, nombre: string) => Promise<{ ok: boolean; error?: string }>;
  /** Elimina una organización SOLTANDO sus diagramas (no los borra). */
  mcpOrgDelete?: (slug: string) => Promise<{ ok: boolean; movidos?: string[]; error?: string }>;
  onMcpImportDiagram: (
    callback: (data: {
      name: string;
      content: unknown;
      /**
       * Presente cuando llega vía export_as_view: vista del proyecto activo.
       * `replace` ⇒ actualizar la pestaña que ya se llama así, no agregar otra.
       */
      view?: { notation?: string; replace?: boolean };
      /** true cuando llega vía export_mermaid_view: crear vista Mermaid (content = código). */
      mermaid?: boolean;
      /**
       * Presente cuando `export_to_app` ACTUALIZA un proyecto existente (por
       * nombre) en vez de crear otro. Ver `src/lib/mcp/project-update.ts`.
       */
      target?: { project: string };
    }) => void
  ) => () => void;

  /**
   * Publica el estado del lienzo (proyecto activo, notación, vistas) para que la
   * herramienta MCP `get_app_state` lo sirva al agente externo. Fire-and-forget.
   */
  mcpPublishAppState: (state: AppState | null) => void;
  /** El main pide contenido de la app (artefactos, vistas, otro proyecto). */
  onMcpAppRead: (
    handler: (payload: { id: number; request: AppReadRequest }) => void
  ) => () => void;
  mcpAppReadReply: (id: number, result: AppReadResult) => void;
  /**
   * El main pide una ACCIÓN sobre el proyecto (borrar o renombrar una vista).
   * A diferencia de la lectura, esto cambia el trabajo del humano: el renderer
   * contesta si ocurrió (`src/lib/mcp/app-actions.ts`).
   */
  onMcpAppAction: (
    handler: (payload: { id: number; request: AppActionRequest }) => void
  ) => () => void;
  mcpAppActionReply: (id: number, result: AppActionResult) => void;

  // Playground MCP (guía /mcp): probar herramientas sin cliente externo.
  mcpPlaygroundListTools: () => Promise<PlaygroundTool[]>;
  mcpPlaygroundCall: (name: string, args: unknown) => Promise<PlaygroundCallResult>;

  // Información del sistema (Configuración → Sistema).
  systemInfo: () => Promise<SystemInfo>;

  // IA remota (opcional): llaves cifradas en el proceso main + generación de texto.
  setAiKey: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>;
  deleteAiKey: (provider: string) => Promise<{ ok: boolean }>;
  getAiKeyStatus: () => Promise<Record<string, boolean>>;
  // --- Actualizaciones de la app (#208). Ver `src/lib/update-check.ts`. ---
  getUpdateStatus?: () => Promise<EstadoUpdate>;
  checkForUpdates?: () => Promise<EstadoUpdate>;
  downloadUpdate?: () => Promise<EstadoUpdate>;
  installUpdate?: () => Promise<void>;
  openReleasePage?: () => Promise<void>;
  /** Muestra en el explorador el instalador que la app bajó a Descargas (#231). */
  revealUpdate?: () => Promise<void>;
  /** Suscribe al estado del updater; devuelve la función para desuscribirse. */
  onUpdateStatus?: (cb: (estado: EstadoUpdate) => void) => () => void;
  /** Estado de la GPU según Chromium (lo mismo que `chrome://gpu`). Ver `gpu-status.ts`. */
  getGpuFeatureStatus?: () => Promise<Record<string, string>>;
  remoteGenerate: (args: {
    provider: string;
    model: string;
    prompt: string;
    system?: string;
  }) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
