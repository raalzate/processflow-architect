import { ipcMain, IpcMainInvokeEvent, clipboard, BrowserWindow } from 'electron';
import { handleMdToPdf } from './services/pdf';
import { popupAppMenu } from './window';
import {
  listLitertModels,
  downloadLitertModel,
  deleteLitertModel,
  revealLitertModel,
} from './services/litert-models';
import {
  setAiKey,
  deleteAiKey,
  aiKeyStatus,
  remoteGenerate,
  type RemoteProvider,
  type RemoteGenerateArgs,
} from './services/ai-remote';
import {
  startMcpHttp,
  stopMcpHttp,
  mcpHttpStatus,
  mcpOrgsStatus,
  mcpOrgCreate,
  mcpOrgRename,
  mcpOrgDelete,
} from './services/mcp-http';
import { setAppState } from './services/mcp-app-state';
import { initAppReadBridge } from './services/mcp-app-read';
import { initAppActionBridge } from './services/mcp-app-action';
import type { AppState } from '../src/lib/mcp/app-state';
import { getSystemInfo } from './services/system-info';
import { playgroundListTools, playgroundCallTool } from './services/mcp-playground';

/**
 * IPC del proceso main. La IA local corre en el RENDERER (LiteRT-LM / WebGPU);
 * aquí solo quedan: gestión de modelos .litertlm (descarga/estado/borrado),
 * exportación a PDF y portapapeles.
 */
export function registerIpcHandlers() {
  ipcMain.handle('convert-md-to-pdf', handleMdToPdf);

  // --- Modelos LiteRT-LM (.litertlm): listado, descarga, borrado, revelar ---
  ipcMain.handle('litert-models-list', async () => listLitertModels());
  ipcMain.handle('litert-model-download', async (event: IpcMainInvokeEvent, id: string) =>
    downloadLitertModel(id as any, (percent) =>
      event.sender.send('litert-model-progress', { id, percent })
    )
  );
  ipcMain.handle('litert-model-delete', async (_e, id: string) => deleteLitertModel(id));
  ipcMain.handle('litert-model-reveal', async (_e, id: string) => revealLitertModel(id));

  // --- IA remota (llaves cifradas + generación) ---
  ipcMain.handle('ai-key-set', async (_e, provider: RemoteProvider, key: string) =>
    setAiKey(provider, key)
  );
  ipcMain.handle('ai-key-delete', async (_e, provider: RemoteProvider) => deleteAiKey(provider));
  ipcMain.handle('ai-key-status', async () => aiKeyStatus());
  ipcMain.handle('ai-remote-generate', async (_e, args: RemoteGenerateArgs) => remoteGenerate(args));

  // --- Servidor MCP embebido (HTTP, opt-in desde Ajustes) ---
  ipcMain.handle('mcp-server-start', async (_e, port?: number) => startMcpHttp(port));
  ipcMain.handle('mcp-server-stop', async () => stopMcpHttp());
  ipcMain.handle('mcp-server-status', async () => mcpHttpStatus());
  // Organizaciones del workspace del MCP: el header las necesita para marcar con
  // «·MCP» la que ve el agente. Sin esa marca, la divergencia entre lo que filtra
  // el humano y lo que escribe el agente es invisible.
  // Menú de la app desde la barra de título propia (Windows/Linux, donde el marco
  // que lo llevaba está oculto).
  ipcMain.on('window-menu-popup', (e, x?: number, y?: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) popupAppMenu(win, x, y);
  });
  ipcMain.handle('mcp-orgs-status', async () => mcpOrgsStatus());
  // CRUD de organizaciones desde el header. Eliminar SUELTA los diagramas a la
  // carpeta plana: quitar una etiqueta no puede costar trabajo.
  ipcMain.handle('mcp-org-create', async (_e, nombre: string) => mcpOrgCreate(nombre));
  ipcMain.handle('mcp-org-rename', async (_e, slug: string, nombre: string) => mcpOrgRename(slug, nombre));
  ipcMain.handle('mcp-org-delete', async (_e, slug: string) => mcpOrgDelete(slug));

  // Estado del lienzo publicado por el renderer: lo lee `get_app_state` para que
  // el agente externo no diseñe ni exporte a ciegas. Es `on` (fire-and-forget):
  // publicar no debe bloquear el render.
  ipcMain.on('mcp-app-state', (_e, state: AppState | null) => setAppState(state));
  // Canal de respuesta del renderer para la lectura bajo demanda (artefactos, vistas).
  initAppReadBridge();
  initAppActionBridge();

  // --- Playground MCP (guía /mcp): ejecutar herramientas por transporte en memoria ---
  ipcMain.handle('mcp-playground-list-tools', async () => playgroundListTools());
  ipcMain.handle('mcp-playground-call', async (_e, name: string, args: unknown) =>
    playgroundCallTool(name, args)
  );

  // --- Información del sistema (vista de Configuración) ---
  ipcMain.handle('system-info', async () => getSystemInfo());

  // --- Captura de una región de la página a PNG ---
  // Rasteriza lo REALMENTE pintado (incluye el foreignObject de los nodos, que
  // no se puede rasterizar de forma fiable en el renderer). El renderer encuadra
  // el diagrama y oculta los overlays antes de pedir la captura.
  ipcMain.handle(
    'capture-canvas',
    async (e: IpcMainInvokeEvent, rect: { x: number; y: number; width: number; height: number }) => {
      const img = await e.sender.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      return img.toDataURL(); // data:image/png;base64,...
    }
  );

  ipcMain.handle('copy-to-clipboard', async (_, text: string) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  });
}
