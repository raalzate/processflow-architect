import { app, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { htmlParaPdf, PDF_LISTO, PDF_OPCIONES } from './pdf-html';

// `marked` llega con `md-to-pdf` y no trae tipos: se declara lo único que se usa.
// Es el mismo conversor que usaba md-to-pdf, así el documento se ve igual.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { marked } = require('marked') as { marked: { parse: (md: string) => string } };

/** Tope de espera a que mermaid dibuje: un diagrama roto no debe colgar el PDF. */
const ESPERA_MS = 15000;

/** El bundle de mermaid para dibujar dentro de la página; sin él, el PDF sale igual. */
async function leerMermaid(): Promise<string | null> {
  try {
    return await fs.promises.readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf-8');
  } catch (e) {
    console.error('PDF: no se encontró el bundle de mermaid:', e);
    return null;
  }
}

/**
 * Markdown → PDF con el Chromium de Electron (ver `pdf-html.ts` por qué no
 * Puppeteer). La ventana es oculta, aislada y sin Node: el markdown trae texto
 * del usuario y no se le da más que dibujar.
 */
export async function handleMdToPdf(event: Electron.IpcMainInvokeEvent, markdownContent: string) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('Ventana no encontrada');

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Guardar PDF como...',
    defaultPath: path.join(app.getPath('downloads'), 'documento_arquitectura.pdf'),
    filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;

  const html = htmlParaPdf(marked.parse(markdownContent), await leerMermaid());
  const tmp = path.join(app.getPath('temp'), `processflow-pdf-${process.pid}-${Date.now()}.html`);
  const hoja = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
  });
  // La página no navega ni abre ventanas: sólo se imprime.
  hoja.webContents.on('will-navigate', (e) => e.preventDefault());
  hoja.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  try {
    await fs.promises.writeFile(tmp, html, 'utf-8');
    await hoja.loadFile(tmp);
    const limite = Date.now() + ESPERA_MS;
    while (Date.now() < limite) {
      if (await hoja.webContents.executeJavaScript(`window.${PDF_LISTO} === true`)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const pdf = await hoja.webContents.printToPDF(PDF_OPCIONES);
    await fs.promises.writeFile(filePath, pdf);
    return filePath;
  } catch (error) {
    console.error('Error MD a PDF:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  } finally {
    if (!hoja.isDestroyed()) hoja.destroy();
    fs.promises.unlink(tmp).catch(() => {});
  }
}
