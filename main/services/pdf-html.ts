/**
 * @fileOverview Página HTML que se imprime a PDF (PURO: sin Electron).
 *
 * El PDF se genera con el Chromium que YA trae Electron (`printToPDF` sobre una
 * ventana oculta). Antes lo hacía `md-to-pdf` con Puppeteer, que busca un Chrome
 * descargado en `~/.cache/puppeteer`: existe en la máquina de quien desarrolla y
 * NO en la del cliente, así que en el binario instalado «Descargar PDF» fallaba
 * siempre. Los diagramas mermaid corrían por `mmdc`, que tiene el mismo problema;
 * ahora se dibujan dentro de la misma página con el bundle de `mermaid`.
 */

/** Opciones de impresión: A4, con fondos y los márgenes de siempre (en pulgadas). */
export const PDF_OPCIONES = {
  pageSize: "A4" as const,
  printBackground: true,
  margins: { top: 20 / 25.4, bottom: 20 / 25.4, left: 15 / 25.4, right: 15 / 25.4 },
};

/** Señal que la página levanta cuando terminó de dibujar los diagramas. */
export const PDF_LISTO = "__pdfListo";

/**
 * Un script inline no puede contener `</script`: el parser HTML cerraría la
 * etiqueta ahí y el resto del bundle saldría como texto en el PDF.
 */
export function scriptInline(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

/**
 * Página completa: el cuerpo (markdown ya convertido a HTML) y, si llega el
 * bundle de mermaid, el script que convierte cada bloque ```mermaid en su
 * diagrama. Sin bundle, los bloques quedan como código: el PDF sale igual.
 */
export function htmlParaPdf(cuerpo: string, mermaidJs: string | null): string {
  const dibujar = `
(async () => {
  try {
    document.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
      const div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
    });
    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
      await window.mermaid.run({ querySelector: ".mermaid", suppressErrors: true });
    }
  } catch (e) {
    console.error("mermaid en PDF:", e);
  } finally {
    window.${PDF_LISTO} = true;
  }
})();`;
  return [
    "<!doctype html>",
    '<html lang="es"><head><meta charset="utf-8">',
    "<style>",
    "body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1f2328;text-align:justify}",
    "h1,h2,h3{text-align:left;line-height:1.25}",
    "table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top}",
    "pre{background:#f6f8fa;padding:8px;white-space:pre-wrap;word-break:break-word}",
    ".mermaid{display:flex;justify-content:center;margin:12px 0}.mermaid svg{max-width:100%;max-height:300px}",
    "img{max-width:100%}",
    "</style></head><body>",
    cuerpo,
    mermaidJs ? `<script>${scriptInline(mermaidJs)}</script>` : "",
    `<script>${dibujar}</script>`,
    "</body></html>",
  ].join("\n");
}
