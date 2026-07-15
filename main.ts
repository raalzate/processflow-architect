import 'dotenv/config'; // Carga .env en el proceso main (los flujos de IA leen process.env aquí).
import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { setupProdLogger } from './main/logger';
import { registerPrivilegedSchemes } from './main/schemes';
import { createMainWindow } from './main/window';
import { registerIpcHandlers } from './main/ipc';

// Schemes privilegiados: registrar AQUÍ (tras los imports, antes de ready) para
// pisar el registro parcial que hace electron-serve al importarse. Ver main/schemes.ts.
registerPrivilegedSchemes();

// 1. Configuración Inicial
// NOTA: NO desactivar la aceleración por hardware — LiteRT-LM (inferencia local)
// corre en WebGPU, que requiere GPU. Antes estaba `app.disableHardwareAcceleration()`,
// lo que dejaba sin adapter a navigator.gpu.
// WebGPU venía 'disabled_off' en Electron → lo habilitamos explícitamente.
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'WebGPU,WebGPUDeveloperFeatures');
setupProdLogger();

// 2. Lifecycle de Electron
app.whenReady().then(() => {
  // Sirve userData/models/litert/<archivo>.litertlm vía litert-model://m/<archivo>.
  const litertDir = path.join(app.getPath('userData'), 'models', 'litert');
  protocol.handle('litert-model', (request) => {
    const url = new URL(request.url);
    const file = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    // Evita path traversal: solo el basename dentro de litertDir.
    const safe = path.join(litertDir, path.basename(file));
    return net.fetch(pathToFileURL(safe).toString(), {
      headers: request.headers,
      method: request.method,
    });
  });

  registerIpcHandlers();
  createMainWindow();

  // Arranque directo del servidor MCP embebido vía env (dev/headless/pruebas).
  // El flujo normal del usuario es el botón de Ajustes → Servidor MCP.
  const mcpPort = Number(process.env.PROCESSFLOW_MCP_PORT);
  if (Number.isFinite(mcpPort) && mcpPort > 0) {
    import('./main/services/mcp-http.js').then(({ startMcpHttp }) => startMcpHttp(mcpPort));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});