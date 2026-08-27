import 'dotenv/config'; // Carga .env en el proceso main (los flujos de IA leen process.env aquí).
import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { setupProdLogger } from './main/logger';
import { registerPrivilegedSchemes } from './main/schemes';
import { createMainWindow } from './main/window';
import { registerIpcHandlers } from './main/ipc';
import { resumenGpu } from './src/lib/gpu-status';

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

  // Estado de la GPU EN EL LOG del arranque. Sin esto, un reporte de «la IA local
  // no funciona» no se puede diagnosticar sin la máquina delante (#203): acá queda
  // escrito lo mismo que muestra `chrome://gpu`.
  try {
    console.log(resumenGpu({
      features: app.getGPUFeatureStatus() as unknown as Record<string, string>,
      adaptador: null, // el adaptador lo ve el renderer, no el main
      vendorId: null,
    }));
  } catch {
    // Un fallo leyendo el estado de la GPU no puede impedir que la app arranque.
  }

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