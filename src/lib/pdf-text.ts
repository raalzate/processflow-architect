// =============================================================================
// Extracción de texto de archivos para el contexto de referencia.
//
// No es lógica pura (usa APIs del navegador y pdfjs), por eso vive fuera de los
// módulos con cobertura. pdfjs se importa de forma perezosa para no cargar el
// worker salvo que el usuario suba un PDF.
// =============================================================================

/** Extensiones aceptadas como referencia. */
export const ACCEPTED_REFERENCE_TYPES = ".txt,.md,.markdown,.csv,.json,.pdf";

const isPdf = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Extrae el texto de un PDF (todas sus páginas) en el renderer con pdfjs. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // Worker empaquetado por Next (webpack resuelve new URL(...) a un asset local).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ")
    );
  }
  return pages.join("\n\n");
}

/**
 * Devuelve el texto plano de un archivo aceptado. Para PDF extrae por páginas;
 * para el resto usa su contenido como texto. Lanza si el tipo no es legible.
 */
export async function extractFileText(file: File): Promise<string> {
  if (isPdf(file)) return extractPdfText(file);
  // txt/md/csv/json y cualquier texto plano.
  return file.text();
}
