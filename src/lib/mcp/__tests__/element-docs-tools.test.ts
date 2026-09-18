/**
 * Adjuntos por MCP (#364). La regla que se prueba una y otra vez acá: el índice
 * sale siempre, el contenido sólo cuando se pide por nombre.
 */
import { describe, expect, it } from "vitest";
import {
  attachDocToElement,
  docsIndex,
  formatHits,
  readDocOfElement,
  removeDocFromElement,
  resolverElemento,
  searchDocsInModel,
} from "@/lib/mcp/element-docs-tools";
import type { DiagramModel } from "@/lib/mcp/diagram-builder";

const modelo = (): DiagramModel => ({
  meta: { nombre_proyecto: "Pagos", notation: "c4", fecha_analisis: "2026-09-18" } as never,
  nodes: [
    { id: "api", nombre: "Enrollment API", tipo_elemento: "Contenedor" },
    { id: "ui", nombre: "HTML/JS", tipo_elemento: "Contenedor" },
  ],
  edges: [],
});

describe("resolverElemento", () => {
  it("resuelve por id y por nombre (el agente copia el nombre del Mermaid)", () => {
    const m = modelo();
    expect(resolverElemento(m, "api").id).toBe("api");
    expect(resolverElemento(m, "html/js").id).toBe("ui");
  });

  it("una referencia que no existe falla NOMBRANDO lo que hay", () => {
    expect(() => resolverElemento(modelo(), "inventado")).toThrow(/Enrollment API/);
    expect(() => resolverElemento(modelo(), "  ")).toThrow(/Falta el elemento/);
  });

  it("dos elementos con el mismo nombre piden el id en vez de elegir uno", () => {
    const m = modelo();
    m.nodes.push({ id: "ui2", nombre: "HTML/JS", tipo_elemento: "Contenedor" } as never);
    expect(() => resolverElemento(m, "HTML/JS")).toThrow(/usá el id/);
  });
});

describe("attachDocToElement / removeDocFromElement", () => {
  it("adjunta al elemento y deja el resto del diagrama intacto", () => {
    const { model, doc } = attachDocToElement(modelo(), "api", {
      nombre: "pagos.yaml",
      texto: "openapi: 3.0.0\npaths: {}",
    });
    expect(doc.tipo).toBe("openapi");
    expect(model.nodes.find((n) => n.id === "api")!.adjuntos).toHaveLength(1);
    expect(model.nodes.find((n) => n.id === "ui")!.adjuntos).toBeUndefined();
  });

  it("el recorte se puede AVISAR: el adjunto devuelto lo dice", () => {
    const { doc } = attachDocToElement(modelo(), "api", {
      nombre: "gordo.md",
      texto: "a".repeat(70_000),
    });
    expect(doc.truncado).toBe(true);
  });

  it("quitar un adjunto que no está falla nombrando los que tiene", () => {
    const { model } = attachDocToElement(modelo(), "api", { nombre: "a.md", texto: "x" });
    expect(() => removeDocFromElement(model, "api", "b.md")).toThrow(/a\.md/);
  });

  it("quitar el último deja el campo AUSENTE, no un array vacío", () => {
    const { model } = attachDocToElement(modelo(), "api", { nombre: "a.md", texto: "x" });
    const out = removeDocFromElement(model, "api", "a.md");
    expect(out.quedan).toBe(0);
    expect(out.model.nodes.find((n) => n.id === "api")!.adjuntos).toBeUndefined();
  });
});

describe("docsIndex — índice sí, contenido NO", () => {
  it("el índice de un elemento nombra el adjunto y no su texto", () => {
    const { model } = attachDocToElement(modelo(), "api", {
      nombre: "pagos.yaml",
      texto: "openapi: 3.0.0\nsecreto-del-contrato",
    });
    const idx = docsIndex(model, "api");
    expect(idx).toContain("pagos.yaml");
    expect(idx).not.toContain("secreto-del-contrato");
  });

  it("un elemento sin material lo dice en vez de devolver vacío", () => {
    expect(docsIndex(modelo(), "ui")).toMatch(/no tiene material/i);
  });

  it("sin elemento devuelve el índice del diagrama entero", () => {
    let m = attachDocToElement(modelo(), "api", { nombre: "a.yaml", texto: "x" }).model;
    m = attachDocToElement(m, "ui", { nombre: "b.md", texto: "y" }).model;
    const idx = docsIndex(m);
    expect(idx).toContain("Enrollment API");
    expect(idx).toContain("HTML/JS");
  });

  it("un diagrama sin nada adjunto dice la consecuencia", () => {
    expect(docsIndex(modelo())).toMatch(/no tiene contra qué/i);
  });
});

describe("readDocOfElement y searchDocsInModel", () => {
  it("lee el rango pedido del adjunto de esa caja", () => {
    const { model } = attachDocToElement(modelo(), "api", {
      nombre: "c.yaml",
      texto: "uno\ndos\ntres\ncuatro",
    });
    const r = readDocOfElement(model, "api", "c.yaml", 2, 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toContain("dos");
      expect(r.texto).not.toContain("cuatro");
    }
  });

  it("un adjunto de OTRA caja no se lee desde ésta", () => {
    const { model } = attachDocToElement(modelo(), "api", { nombre: "c.yaml", texto: "x" });
    const r = readDocOfElement(model, "ui", "c.yaml");
    expect(r.ok).toBe(false);
  });

  it("la búsqueda dice caja, adjunto y línea", () => {
    let m = attachDocToElement(modelo(), "api", { nombre: "a.yaml", texto: "nada\nidempotencia acá" }).model;
    m = attachDocToElement(m, "ui", { nombre: "b.md", texto: "sin nada" }).model;
    const hits = searchDocsInModel(m, "idempotencia");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ elemento: "Enrollment API", doc: "a.yaml", linea: 2 });
    expect(formatHits(hits)).toContain('"a.yaml":2');
    expect(formatHits([])).toBe("");
  });
});
