import { describe, it, expect } from "vitest";
import {
  buildReferenceText,
  normalizeText,
  makeReferenceDoc,
  MAX_REFERENCE_CHARS,
  type ReferenceDoc,
} from "@/lib/reference-context";

function doc(over: Partial<ReferenceDoc> & { id: string; text: string }): ReferenceDoc {
  return {
    name: over.name ?? over.id,
    kind: over.kind ?? "text",
    chars: over.text.length,
    addedAt: "2026-01-01",
    ...over,
  };
}

describe("normalizeText", () => {
  it("collapses excess blank lines and trims", () => {
    expect(normalizeText("a\n\n\n\nb\n\n")).toBe("a\n\nb");
  });
  it("normalizes CRLF to LF", () => {
    expect(normalizeText("a\r\nb")).toBe("a\nb");
  });
});

describe("buildReferenceText", () => {
  it("returns empty string when there are no docs", () => {
    expect(buildReferenceText([])).toBe("");
  });

  it("returns empty string when docs have only whitespace", () => {
    expect(buildReferenceText([doc({ id: "a", text: "   " })])).toBe("");
  });

  it("joins docs with a titled block per document", () => {
    const out = buildReferenceText([
      doc({ id: "a", name: "Glosario", text: "Reembolso: devolución" }),
      doc({ id: "b", name: "Reglas", text: "Todo pago se audita" }),
    ]);
    expect(out).toContain("### Glosario");
    expect(out).toContain("Reembolso: devolución");
    expect(out).toContain("### Reglas");
    expect(out).toContain("Todo pago se audita");
  });

  it("truncates to maxChars with a marker", () => {
    const big = "x".repeat(50);
    const out = buildReferenceText([doc({ id: "a", name: "D", text: big })], 20);
    expect(out.length).toBeLessThanOrEqual(20 + "\n…(referencia truncada)".length);
    expect(out).toContain("…(referencia truncada)");
  });

  it("uses MAX_REFERENCE_CHARS by default", () => {
    const big = "y".repeat(MAX_REFERENCE_CHARS + 500);
    const out = buildReferenceText([doc({ id: "a", name: "D", text: big })]);
    expect(out).toContain("…(referencia truncada)");
  });
});

describe("makeReferenceDoc", () => {
  it("normalizes text and computes chars", () => {
    const d = makeReferenceDoc("Notas", "file", "a\r\n\n\n\nb", "2026-01-01", "id1");
    expect(d.text).toBe("a\n\nb");
    expect(d.chars).toBe(4);
    expect(d.kind).toBe("file");
    expect(d.id).toBe("id1");
  });
});
