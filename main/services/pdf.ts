import { app, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { mdToPdf } from 'md-to-pdf';
import { runMermaid } from './mermaid';

export async function handleMdToPdf(event: Electron.IpcMainInvokeEvent, markdownContent: string) {
  console.log('Recibido markdown. Pre-procesando con mmdc...');
  
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('Ventana no encontrada');

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Guardar PDF como...',
    defaultPath: path.join(app.getPath('downloads'), 'documento_arquitectura.pdf'),
    filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return null;

  const tempFiles: string[] = [];
  
  try {
    const mermaidRegex = /(```mermaid\n[\s\S]*?\n```)/g;
    const parts = markdownContent.split(mermaidRegex);

    const processedParts = await Promise.all(parts.map(async (part, index) => {
      if (!part.startsWith('```mermaid')) return part;

      try {
        const code = part.replace(/^```mermaid\n/g, '').replace(/\n```$/g, '');
        const tempInputPath = path.join(app.getPath('temp'), `mermaid_input_${index}.mmd`);
        const tempOutputPath = path.join(app.getPath('temp'), `mermaid_output_${index}.svg`);
        
        tempFiles.push(tempInputPath, tempOutputPath);
        await fs.promises.writeFile(tempInputPath, code, 'utf-8');
        
        await runMermaid(tempInputPath, tempOutputPath); // Usamos el servicio de mermaid
        
        const svgFileBuffer = await fs.promises.readFile(tempOutputPath);
        return `\n<img src="data:image/svg+xml;base64,${svgFileBuffer.toString('base64')}" alt="Mermaid Diagram" style="display:block; margin:0 auto;max-height:300px;max-width:100%;">\n`;
      } catch (error) {
        console.error('Error Mermaid:', error);
        return `\n <pre style="color:red">Error generando diagrama: ${(error as Error).message}</pre>\n`;
      }
    }));

    const modifiedMarkdown = processedParts.join('');
    
    await mdToPdf({ content: modifiedMarkdown }, {
      dest: filePath,
      launch_options: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
      css: `body { text-align: justify; }`,
      pdf_options: { format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } }
    });

    return filePath;
  } catch (error) {
    console.error('Error MD a PDF:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  } finally {
    tempFiles.forEach(f => { if(fs.existsSync(f)) fs.unlinkSync(f); });
  }
}