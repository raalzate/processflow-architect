import { describe, it, expect, vi, beforeEach } from "vitest";

// pdfjs-dist se importa perezosamente; lo mockeamos para el path PDF.
const getDocument = vi.fn();
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

import { extractFileText, ACCEPTED_REFERENCE_TYPES } from "@/lib/pdf-text";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ACCEPTED_REFERENCE_TYPES", () => {
  it("incluye los formatos soportados", () => {
    for (const ext of [".txt", ".md", ".csv", ".json", ".pdf"]) {
      expect(ACCEPTED_REFERENCE_TYPES).toContain(ext);
    }
  });
});

describe("extractFileText", () => {
  it("lee texto plano vía File.text()", async () => {
    const file = new File(["contenido de referencia"], "notas.txt", { type: "text/plain" });
    expect(await extractFileText(file)).toBe("contenido de referencia");
  });

  it("extrae páginas de un PDF (por tipo application/pdf)", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (i: number) => ({
          getTextContent: async () => ({ items: [{ str: `página ${i}` }] }),
        }),
      }),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "doc.pdf", { type: "application/pdf" });
    const out = await extractFileText(file);
    expect(out).toContain("página 1");
    expect(out).toContain("página 2");
  });

  it("detecta PDF por extensión aunque el tipo esté vacío", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "solo" }] }) }),
      }),
    });
    const file = new File([new Uint8Array([1])], "sin-tipo.PDF", { type: "" });
    expect(await extractFileText(file)).toContain("solo");
  });
});
