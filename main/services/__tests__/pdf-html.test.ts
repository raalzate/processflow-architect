import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { htmlParaPdf, PDF_LISTO, PDF_OPCIONES, scriptInline } from "../pdf-html";

/**
 * «Descargar PDF» fallaba en el binario instalado: `md-to-pdf` usa Puppeteer, que
 * busca un Chrome en `~/.cache/puppeteer` —presente en la máquina de desarrollo,
 * ausente en la del cliente—. Ahora imprime el Chromium de Electron.
 */
describe("main/services/pdf.ts no vuelve a depender de un Chrome externo", () => {
  const fuente = fs.readFileSync(path.join(__dirname, "..", "pdf.ts"), "utf8");

  it("no usa md-to-pdf, puppeteer ni mmdc", () => {
    expect(fuente).not.toMatch(/from ['"]md-to-pdf['"]/);
    expect(fuente).not.toMatch(/puppeteer/);
    expect(fuente).not.toMatch(/runMermaid|mermaid-cli/);
  });

  it("imprime con Electron, en una ventana oculta sin Node", () => {
    expect(fuente).toMatch(/printToPDF\(/);
    expect(fuente).toMatch(/show:\s*false/);
    expect(fuente).toMatch(/nodeIntegration:\s*false/);
    expect(fuente).toMatch(/contextIsolation:\s*true/);
  });
});

describe("htmlParaPdf", () => {
  it("envuelve el cuerpo y deja la señal de listo", () => {
    const html = htmlParaPdf("<h1>Hola</h1>", null);
    expect(html).toContain("<h1>Hola</h1>");
    expect(html).toContain(`window.${PDF_LISTO} = true`);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("convierte los bloques mermaid y carga el bundle cuando llega", () => {
    const html = htmlParaPdf('<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>', "window.mermaid={};");
    expect(html).toContain("<script>window.mermaid={};</script>");
    expect(html).toContain('code.language-mermaid');
    expect(html).toContain("mermaid.run");
  });

  it("sin bundle de mermaid el PDF sale igual (la señal de listo se levanta siempre)", () => {
    const html = htmlParaPdf("<p>x</p>", null);
    expect(html).not.toContain("window.mermaid={}");
    expect(html).toMatch(/finally\s*\{\s*window\.__pdfListo = true/);
  });

  it("un `</script>` dentro del bundle no corta la etiqueta", () => {
    const js = 'var s="</script><p>roto</p>";';
    expect(scriptInline(js)).not.toContain("</script");
    const html = htmlParaPdf("<p>x</p>", js);
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });

  it("A4 con fondos y márgenes de 20/15 mm", () => {
    expect(PDF_OPCIONES.pageSize).toBe("A4");
    expect(PDF_OPCIONES.printBackground).toBe(true);
    expect(PDF_OPCIONES.margins.top).toBeCloseTo(0.787, 2);
    expect(PDF_OPCIONES.margins.left).toBeCloseTo(0.59, 2);
  });
});
