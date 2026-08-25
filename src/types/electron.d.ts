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
import type { AppReadRequest, AppReadResult } from "@/lib/mcp/app-read";

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
  onMcpImportDiagram: (
    callback: (data: {
      name: string;
      content: unknown;
      /** Presente cuando llega vía export_as_view: crear vista del proyecto activo. */
      view?: { notation?: string };
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

  // Playground MCP (guía /mcp): probar herramientas sin cliente externo.
  mcpPlaygroundListTools: () => Promise<PlaygroundTool[]>;
  mcpPlaygroundCall: (name: string, args: unknown) => Promise<PlaygroundCallResult>;

  // Información del sistema (Configuración → Sistema).
  systemInfo: () => Promise<SystemInfo>;

  // IA remota (opcional): llaves cifradas en el proceso main + generación de texto.
  setAiKey: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>;
  deleteAiKey: (provider: string) => Promise<{ ok: boolean }>;
  getAiKeyStatus: () => Promise<Record<string, boolean>>;
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
