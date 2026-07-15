/**
 * @fileOverview Extracción de texto de adjuntos (PDF / imagen / texto) en el
 * RENDERER, para inyectar su contenido como contexto al chat del agente.
 *
 * Adaptado de notecast-ai (pdf-parse + tesseract.js). Aquí todo corre en el
 * navegador del renderer:
 *  - Texto (txt/md/csv/json): se decodifica.
 *  - PDF nativo (con capa de texto): pdfjs-dist extrae el texto.
 *  - PDF escaneado (<100 chars) o IMAGEN: OCR con tesseract.js (spa+eng),
 *    rasterizando cada página del PDF a canvas.
 *
 * pdfjs y tesseract se importan por CDN (webpackIgnore) para evitar la
 * configuración de workers/WASM en el bundler, igual que `@litert-lm/core`.
 */

const PDFJS_VERSION = "6.0.227";
const TESSERACT_VERSION = "7.0.0";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/+esm`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const TESSERACT_CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/+esm`;

const OCR_LANGS = "spa+eng";
/** Menos de estos chars (sin espacios) en un PDF ⇒ escaneado ⇒ OCR. */
const SCANNED_TEXT_FLOOR = 100;
/** Tope de páginas a procesar (evita OCR eterno en PDFs enormes). */
const MAX_PAGES = 30;

export type ExtractProgress = (info: { stage: string; page?: number; pages?: number; percent?: number }) => void;

const isText = (ct: string) =>
  ct.startsWith("text/") || ct === "application/json" || ct.includes("csv");
const isImage = (ct: string) => ct.startsWith("image/");
const isPdf = (ct: string) => ct === "application/pdf";

function dataUrlToUint8(url: string): Uint8Array {
  const i = url.indexOf(",");
  const b64 = i >= 0 ? url.slice(i + 1) : url;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j);
  return out;
}

function decodeDataUrlText(url: string): string {
  try {
    const i = url.indexOf(",");
    const b64 = i >= 0 ? url.slice(i + 1) : url;
    return decodeURIComponent(escape(atob(b64))).slice(0, 60000);
  } catch {
    return "";
  }
}

let pdfjsPromise: Promise<any> | null = null;
async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // @ts-ignore — módulo remoto (CDN) sin tipos; webpackIgnore evita el bundling.
      const m = await import(/* webpackIgnore: true */ PDFJS_CDN);
      try {
        m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      } catch {
        /* algunos builds exponen GlobalWorkerOptions en default */
      }
      return m;
    })();
  }
  return pdfjsPromise;
}

let tesseractPromise: Promise<any> | null = null;
async function loadTesseract(): Promise<any> {
  if (!tesseractPromise) {
    // @ts-ignore — módulo remoto (CDN) sin tipos.
    tesseractPromise = import(/* webpackIgnore: true */ TESSERACT_CDN);
  }
  return tesseractPromise;
}

/** OCR de una imagen (data URL) con tesseract.js. Worker efímero por llamada. */
async function ocrImage(dataUrl: string): Promise<string> {
  const T = await loadTesseract();
  const worker = await T.createWorker(OCR_LANGS);
  try {
    const { data } = await worker.recognize(dataUrl);
    return (data?.text ?? "").trim();
  } finally {
    await worker.terminate?.().catch(() => {});
  }
}

/** Extrae texto de un PDF; si parece escaneado, hace OCR página a página. */
async function pdfToText(url: string, onProgress?: ExtractProgress): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: dataUrlToUint8(url) }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);

  // 1) Intento por capa de texto (PDF nativo).
  let text = "";
  for (let p = 1; p <= pages; p++) {
    onProgress?.({ stage: "texto", page: p, pages });
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str ?? "").join(" ") + "\n";
  }
  if (text.replace(/\s/g, "").length >= SCANNED_TEXT_FLOOR) {
    return text.trim();
  }

  // 2) Escaneado → rasteriza cada página y aplica OCR.
  let ocr = "";
  for (let p = 1; p <= pages; p++) {
    onProgress?.({ stage: "ocr", page: p, pages, percent: Math.round((p / pages) * 100) });
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    ocr += (await ocrImage(canvas.toDataURL("image/png"))) + "\n";
  }
  return ocr.trim();
}

/**
 * Extrae el texto legible de un adjunto. Devuelve "" si el formato no se soporta
 * o no se pudo leer (el llamador decide cómo avisar).
 */
export async function extractDocumentText(
  doc: { name: string; contentType: string; url: string },
  onProgress?: ExtractProgress
): Promise<string> {
  const ct = doc.contentType || "";
  try {
    if (isText(ct)) return decodeDataUrlText(doc.url);
    if (isImage(ct)) {
      onProgress?.({ stage: "ocr", percent: 0 });
      return await ocrImage(doc.url);
    }
    if (isPdf(ct)) return await pdfToText(doc.url, onProgress);
  } catch (e) {
    console.error("[document-extract] fallo leyendo", doc.name, e);
  }
  return "";
}

/** ¿El adjunto es de un tipo que sabemos extraer (texto/imagen/PDF)? */
export function isExtractable(contentType: string): boolean {
  return isText(contentType) || isImage(contentType) || isPdf(contentType);
}
