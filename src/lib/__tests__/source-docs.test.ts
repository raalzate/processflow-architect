/**
 * Documentos fuente (feature 012, #240).
 *
 * Lo que protegen estas pruebas: que la cita de una caja deje de ser un puntero
 * colgante —un `.md` que la app no tiene— sin romper los diagramas que ya citan
 * en prosa, y que un documento adjunto nunca haga ilegible el proyecto.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_DOCS,
  MAX_DOC_CHARS,
  attachSourceDoc,
  findSourceDoc,
  formatSourceInventory,
  parseCita,
  readSourceRange,
  removeSourceDoc,
  resolveCita,
  sanitizeSourceDocs,
  type SourceDoc,
} from "../source-docs";

const doc = (nombre: string, texto: string, origen?: string): SourceDoc => ({ nombre, texto, origen });

const contrato = () =>
  doc(
    "docs/contratos/07-pagos.md",
    [
      "# Pagos", // 1
      "", // 2
      "El cobro se hace con tarjeta.", // 3
      "", // 4
      "La pasarela valida con un cargo de 1 USD.", // 5
      "", // 6
      "El callback está sin confirmar.", // 7
    ].join("\n"),
    "PDF del cliente"
  );

describe("sanitizeSourceDocs · lo que llega de afuera no se confía", () => {
  it("descarta lo que no es documento (sin nombre, sin texto, basura)", () => {
    expect(sanitizeSourceDocs(null)).toEqual([]);
    expect(sanitizeSourceDocs([{ nombre: "x" }, { texto: "y" }, 5, null, { nombre: " ", texto: " " }])).toEqual([]);
  });

  it("no deja dos documentos con el mismo nombre", () => {
    const out = sanitizeSourceDocs([doc("a.md", "uno"), doc("A.MD", "dos")]);
    expect(out).toHaveLength(1);
  });

  it("recorta al tope y lo marca en vez de rechazar el documento", () => {
    const out = sanitizeSourceDocs([doc("a.md", "x".repeat(MAX_DOC_CHARS + 500))]);
    expect(out[0].texto).toHaveLength(MAX_DOC_CHARS);
    expect(out[0].truncado).toBe(true);
  });

  it("respeta el tope de documentos por proyecto", () => {
    const muchos = Array.from({ length: MAX_DOCS + 5 }, (_, i) => doc(`d${i}.md`, "texto"));
    expect(sanitizeSourceDocs(muchos)).toHaveLength(MAX_DOCS);
  });
});

describe("attachSourceDoc · adjuntar, reemplazar, quitar", () => {
  it("reemplaza por nombre en vez de duplicar (volver a analizar no deja dos versiones)", () => {
    const uno = attachSourceDoc([], { nombre: "a.md", texto: "v1" });
    const dos = attachSourceDoc(uno, { nombre: "a.md", texto: "v2" });
    expect(dos).toHaveLength(1);
    expect(dos[0].texto).toBe("v2");
  });

  it("un documento sin texto no se adjunta: no es una fuente", () => {
    expect(() => attachSourceDoc([], { nombre: "a.md", texto: "   " })).toThrow(/nombre y un texto/);
  });

  it("pasado el tope, el error dice qué hacer", () => {
    const llenos = Array.from({ length: MAX_DOCS }, (_, i) => doc(`d${i}.md`, "t"));
    expect(() => attachSourceDoc(llenos, { nombre: "nuevo.md", texto: "t" })).toThrow(/tope/);
    // Reemplazar uno que ya está sigue funcionando con el cupo lleno.
    expect(attachSourceDoc(llenos, { nombre: "d0.md", texto: "otro" })).toHaveLength(MAX_DOCS);
  });

  it("quitar un documento no toca los demás", () => {
    const docs = [doc("a.md", "1"), doc("b.md", "2")];
    expect(removeSourceDoc(docs, "a.md").map((d) => d.nombre)).toEqual(["b.md"]);
  });
});

describe("parseCita · las formas que produce el agente externo", () => {
  it("líneas sueltas", () => {
    expect(parseCita("docs/contratos/07-pagos.md:1,36,127")).toEqual({
      doc: "docs/contratos/07-pagos.md",
      lineas: [1, 36, 127],
    });
  });

  it("un rango", () => {
    expect(parseCita("a.md:3-6")?.lineas).toEqual([3, 4, 5, 6]);
  });

  it("el documento entero", () => {
    expect(parseCita("a.md")).toEqual({ doc: "a.md", lineas: [] });
  });

  it("una cita en prosa NO es una cita de archivo (los diagramas viejos siguen igual)", () => {
    expect(parseCita("PRD §3.2 (p. 7)")).toBeNull();
    expect(parseCita("acta del 12-mar")).toBeNull();
    expect(parseCita("")).toBeNull();
  });
});

describe("resolveCita · la cita se convierte en evidencia", () => {
  const docs = [contrato()];

  it("devuelve las líneas citadas con su contexto", () => {
    const r = resolveCita(docs, "docs/contratos/07-pagos.md:5");
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.fragmento).toContain("5: La pasarela valida con un cargo de 1 USD.");
    expect(r.fragmento).toContain("3: El cobro se hace con tarjeta.");
  });

  it("líneas separadas se devuelven en un solo fragmento, con el corte marcado", () => {
    const r = resolveCita(docs, "docs/contratos/07-pagos.md:1,7");
    if (r.estado !== "ok") throw new Error("debía resolver");
    expect(r.fragmento).toContain("…");
    expect(r.fragmento).toContain("7: El callback está sin confirmar.");
  });

  it("un documento que NO está adjunto se dice, nunca se sustituye por otro", () => {
    const r = resolveCita(docs, "docs/otro.md:3");
    expect(r).toEqual({ estado: "falta", doc: "docs/otro.md" });
  });

  it("una línea fuera del final no rompe: devuelve el documento", () => {
    const r = resolveCita(docs, "docs/contratos/07-pagos.md:900");
    expect(r.estado).toBe("ok");
  });

  it("una cita en prosa no resuelve nada (y la app la muestra tal cual)", () => {
    expect(resolveCita(docs, "acta del 12-mar")).toEqual({ estado: "sin-cita" });
  });

  it("el fragmento respeta el tope que se le pida", () => {
    const largo = [doc("a.md", Array.from({ length: 50 }, (_, i) => `linea ${i}`).join("\n"))];
    const r = resolveCita(largo, "a.md", 50);
    if (r.estado !== "ok") throw new Error("debía resolver");
    expect(r.truncado).toBe(true);
    expect(r.fragmento.length).toBeLessThanOrEqual(50 + 20);
  });

  it("la cita puede traer la ruta y el adjunto sólo el archivo", () => {
    expect(findSourceDoc([doc("07-pagos.md", "t")], "docs/contratos/07-pagos.md")?.nombre).toBe("07-pagos.md");
  });
});

describe("readSourceRange · lo que lee el agente", () => {
  const docs = [contrato()];

  it("devuelve el rango pedido", () => {
    const r = readSourceRange(docs, "docs/contratos/07-pagos.md", 3, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toContain("El cobro se hace con tarjeta.");
    expect(r.texto).not.toContain("callback");
  });

  it("un documento que no está devuelve los que sí, para el turno siguiente", () => {
    const r = readSourceRange(docs, "otro.md");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.disponibles).toEqual(["docs/contratos/07-pagos.md"]);
  });

  it("recorta al tope y lo avisa", () => {
    const r = readSourceRange(docs, "docs/contratos/07-pagos.md", 1, 99, 20);
    if (!r.ok) throw new Error("debía leer");
    expect(r.truncado).toBe(true);
  });

  it("un rango pasado el final no rompe", () => {
    const r = readSourceRange(docs, "docs/contratos/07-pagos.md", 500, 600);
    expect(r.ok).toBe(true);
  });
});

describe("formatSourceInventory · el agente sabe qué hay sin recibir el contenido", () => {
  it("una línea por documento, sin su texto", () => {
    const inv = formatSourceInventory([contrato()]);
    expect(inv).toContain("docs/contratos/07-pagos.md");
    expect(inv).toContain("PDF del cliente");
    expect(inv).not.toContain("pasarela valida");
  });

  it("sin documentos no dice nada (no gasta contexto por existir)", () => {
    expect(formatSourceInventory([])).toBe("");
  });
});
