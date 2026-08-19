import { describe, it, expect } from "vitest";
import {
  documentOutline,
  documentStats,
  findMatches,
  lineOffsets,
  nextMatchIndex,
  replaceAllMatches,
  replaceMatch,
} from "../outline";

const DOC = [
  "# Drivers de Arquitectura",
  "",
  "Intro del documento.",
  "",
  "## Contexto",
  "",
  "Texto con **negrita** y `codigo`.",
  "",
  "```mermaid",
  "flowchart LR",
  "# esto NO es un encabezado",
  "A-->B",
  "```",
  "",
  "### Detalle",
  "",
  "Cierre.",
].join("\n");

describe("lineOffsets", () => {
  it("da el offset del inicio de cada línea", () => {
    expect(lineOffsets("ab\ncd\n")).toEqual([0, 3, 6]);
  });

  it("un texto vacío tiene una línea que arranca en 0", () => {
    expect(lineOffsets("")).toEqual([0]);
  });
});

describe("documentOutline", () => {
  it("lista los encabezados con nivel, texto y línea", () => {
    const o = documentOutline(DOC);
    expect(o.map((h) => [h.level, h.text])).toEqual([
      [1, "Drivers de Arquitectura"],
      [2, "Contexto"],
      [3, "Detalle"],
    ]);
    expect(o[1].line).toBe(4);
  });

  it("el offset apunta al inicio de la línea del encabezado", () => {
    const o = documentOutline(DOC);
    expect(DOC.slice(o[1].offset, o[1].offset + 11)).toBe("## Contexto");
  });

  it("un '#' dentro de una valla de código NO es encabezado", () => {
    expect(documentOutline(DOC).some((h) => h.text.includes("NO es"))).toBe(false);
  });

  it("una valla con ~~~ también protege su contenido", () => {
    expect(documentOutline("~~~\n# adentro\n~~~\n# afuera")).toHaveLength(1);
  });

  it("no confunde un '#' sin espacio ni un encabezado vacío", () => {
    expect(documentOutline("#sinespacio\n#   \n# real")).toEqual([
      { level: 1, text: "real", line: 2, offset: "#sinespacio\n#   \n".length },
    ]);
  });

  it("hasta seis niveles; siete '#' no es encabezado", () => {
    expect(documentOutline("####### nope\n###### seis")).toEqual([
      { level: 6, text: "seis", line: 1, offset: 13 },
    ]);
  });
});

describe("documentStats", () => {
  it("cuenta líneas, caracteres, encabezados y palabras de PROSA", () => {
    const s = documentStats(DOC);
    expect(s.lines).toBe(17);
    expect(s.chars).toBe(DOC.length);
    expect(s.headings).toBe(3);
    // "flowchart LR", "A-->B" y el # de adentro no cuentan: están en la valla.
    expect(s.words).toBe(13);
  });

  it("estima minutos de lectura (200 ppm, mínimo 1)", () => {
    expect(documentStats("una palabra").readingMinutes).toBe(1);
    expect(documentStats(Array.from({ length: 600 }, () => "palabra").join(" ")).readingMinutes).toBe(3);
  });

  it("un token sin letras no cuenta como palabra", () => {
    expect(documentStats("hola . mundo").words).toBe(2);
  });

  it("un documento vacío no inventa tiempo de lectura", () => {
    expect(documentStats("")).toEqual({ words: 0, chars: 0, lines: 0, headings: 0, readingMinutes: 0 });
  });
});

describe("findMatches", () => {
  it("encuentra todas las coincidencias, sin distinguir mayúsculas por defecto", () => {
    expect(findMatches("Pago pago PAGO", "pago")).toHaveLength(3);
  });

  it("con caseSensitive respeta las mayúsculas", () => {
    expect(findMatches("Pago pago", "pago", { caseSensitive: true })).toEqual([{ start: 5, end: 9 }]);
  });

  it("la búsqueda es LITERAL: un paréntesis no rompe nada", () => {
    expect(findMatches("f(x) y f(y)", "f(")).toHaveLength(2);
  });

  it("no solapa coincidencias", () => {
    expect(findMatches("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("una consulta vacía no coincide con todo", () => {
    expect(findMatches("texto", "")).toEqual([]);
  });
});

describe("nextMatchIndex", () => {
  const m = [
    { start: 5, end: 8 },
    { start: 20, end: 23 },
  ];

  it("hacia adelante toma la primera desde el cursor", () => {
    expect(nextMatchIndex(m, 0)).toBe(0);
    expect(nextMatchIndex(m, 9)).toBe(1);
  });

  it("hacia adelante es cíclico", () => {
    expect(nextMatchIndex(m, 30)).toBe(0);
  });

  it("hacia atrás toma la anterior al cursor, y también es cíclico", () => {
    // Cursor 21 cae DENTRO de la segunda (20-23): «anterior» es la primera.
    expect(nextMatchIndex(m, 21, true)).toBe(0);
    expect(nextMatchIndex(m, 0, true)).toBe(1);
  });

  it("sin coincidencias devuelve -1", () => {
    expect(nextMatchIndex([], 0)).toBe(-1);
  });
});

describe("reemplazo", () => {
  it("replaceMatch cambia sólo ese rango", () => {
    expect(replaceMatch("uno dos tres", { start: 4, end: 7 }, "DOS")).toBe("uno DOS tres");
  });

  it("replaceAllMatches cambia todas y dice cuántas", () => {
    const r = replaceAllMatches("SLA 99,9 % y SLA 99,9 %", "99,9", "99,95");
    expect(r.text).toBe("SLA 99,95 % y SLA 99,95 %");
    expect(r.count).toBe(2);
  });

  it("reemplazar por algo más largo no corrompe las siguientes posiciones", () => {
    const r = replaceAllMatches("a a a", "a", "AAAA");
    expect(r.text).toBe("AAAA AAAA AAAA");
    expect(r.count).toBe(3);
  });

  it("sin coincidencias devuelve el texto igual y cuenta 0", () => {
    const r = replaceAllMatches("texto", "zzz", "x");
    expect(r).toEqual({ text: "texto", count: 0 });
  });
});
