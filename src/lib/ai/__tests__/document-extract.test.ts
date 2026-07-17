import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// pdfjs y tesseract se importan por CDN (webpackIgnore). Vitest intercepta por
// especificador; los mockeamos para ejercitar la extracción sin red ni WASM.
const getDocument = vi.fn();
vi.mock("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.0.227/+esm", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

const recognize = vi.fn();
const terminate = vi.fn(async () => {});
const createWorker = vi.fn(async () => ({ recognize, terminate }));
vi.mock("https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/+esm", () => ({ createWorker }));

import { extractDocumentText, isExtractable } from "@/lib/ai/document-extract";

/** data URL base64 desde texto plano. */
function textDataUrl(text: string, ct = "text/plain") {
  return `data:${ct};base64,${btoa(text)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete (globalThis as any).document;
});

describe("isExtractable", () => {
  it("acepta texto/imagen/pdf y rechaza el resto", () => {
    expect(isExtractable("text/plain")).toBe(true);
    expect(isExtractable("application/json")).toBe(true);
    expect(isExtractable("text/csv")).toBe(true);
    expect(isExtractable("image/png")).toBe(true);
    expect(isExtractable("application/pdf")).toBe(true);
    expect(isExtractable("application/zip")).toBe(false);
    expect(isExtractable("")).toBe(false);
  });
});

describe("extractDocumentText", () => {
  it("decodifica adjuntos de texto", async () => {
    const out = await extractDocumentText({
      name: "a.txt",
      contentType: "text/plain",
      url: textDataUrl("hola mundo"),
    });
    expect(out).toBe("hola mundo");
  });

  it("devuelve '' para tipos no soportados", async () => {
    expect(
      await extractDocumentText({ name: "a.zip", contentType: "application/zip", url: "data:x," })
    ).toBe("");
  });

  it("PDF nativo con capa de texto (≥100 chars) → devuelve el texto", async () => {
    const longText = "palabra ".repeat(30); // >100 chars sin espacios
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: longText }] }),
        }),
      }),
    });
    const progress: string[] = [];
    const out = await extractDocumentText(
      { name: "doc.pdf", contentType: "application/pdf", url: textDataUrl("%PDF-1.4 fake") },
      (p) => progress.push(p.stage)
    );
    expect(out).toContain("palabra");
    expect(progress).toContain("texto");
  });

  it("imagen → OCR con tesseract", async () => {
    recognize.mockResolvedValue({ data: { text: "  texto ocr  " } });
    const out = await extractDocumentText({
      name: "scan.png",
      contentType: "image/png",
      url: "data:image/png;base64,AAAA",
    });
    expect(out).toBe("texto ocr");
    expect(createWorker).toHaveBeenCalledWith("spa+eng");
    expect(terminate).toHaveBeenCalled();
  });

  it("texto con base64 inválido → '' (decode tolerante)", async () => {
    const out = await extractDocumentText({
      name: "a.txt",
      contentType: "text/plain",
      url: "data:text/plain;base64,!!!no-base64!!!",
    });
    expect(out).toBe("");
  });

  it("PDF escaneado (<100 chars) → rasteriza y hace OCR página a página", async () => {
    // Capa de texto vacía → cae al OCR. Simulamos canvas del renderer.
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({})),
      toDataURL: vi.fn(() => "data:image/png;base64,ZZZZ"),
    };
    (globalThis as any).document = { createElement: vi.fn(() => canvas) };
    recognize.mockResolvedValue({ data: { text: "texto escaneado" } });
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "x" }] }), // <100 chars
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    });
    const stages: string[] = [];
    const out = await extractDocumentText(
      { name: "scan.pdf", contentType: "application/pdf", url: textDataUrl("x") },
      (p) => stages.push(p.stage)
    );
    expect(out).toBe("texto escaneado");
    expect(stages).toContain("ocr");
  });

  it("PDF escaneado salta páginas sin contexto 2D de canvas", async () => {
    (globalThis as any).document = {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => null), // sin contexto → continue
        toDataURL: vi.fn(),
      })),
    };
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "x" }] }),
          getViewport: () => ({ width: 10, height: 10 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    });
    const out = await extractDocumentText({
      name: "s.pdf",
      contentType: "application/pdf",
      url: textDataUrl("x"),
    });
    expect(out).toBe(""); // ninguna página OCReada
  });

  it("captura errores de lectura y devuelve ''", async () => {
    getDocument.mockImplementation(() => {
      throw new Error("pdf roto");
    });
    const out = await extractDocumentText({
      name: "bad.pdf",
      contentType: "application/pdf",
      url: textDataUrl("x"),
    });
    expect(out).toBe("");
  });
});
