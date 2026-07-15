import { describe, it, expect } from "vitest";
import {
  ARTIFACT_REGISTRY,
  getDefinition,
  documentDefinitions,
  diagramDefinitions,
  type ArtifactDefinition,
  type ToolFamily,
} from "@/lib/artifacts/registry";
import { ARTIFACT_RENDERS } from "@/lib/agent-types";

const VALID_RENDERS = new Set<string>(ARTIFACT_RENDERS as readonly string[]);
const VALID_FAMILIES = new Set<ToolFamily>(["document", "diagram"]);

describe("ARTIFACT_REGISTRY", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(ARTIFACT_REGISTRY)).toBe(true);
    expect(ARTIFACT_REGISTRY.length).toBeGreaterThan(0);
  });

  it("has unique kinds (no duplicates)", () => {
    const kinds = ARTIFACT_REGISTRY.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("every entry has the required non-empty string fields", () => {
    for (const d of ARTIFACT_REGISTRY) {
      expect(typeof d.kind).toBe("string");
      expect(d.kind.length).toBeGreaterThan(0);
      expect(typeof d.label).toBe("string");
      expect(d.label.length).toBeGreaterThan(0);
      expect(typeof d.icon).toBe("string");
      expect(d.icon.length).toBeGreaterThan(0);
      expect(typeof d.accent).toBe("string");
      expect(d.accent.length).toBeGreaterThan(0);
      expect(typeof d.description).toBe("string");
      expect(d.description.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a valid render shape", () => {
    for (const d of ARTIFACT_REGISTRY) {
      expect(VALID_RENDERS.has(d.render)).toBe(true);
    }
  });

  it("every entry has a valid family", () => {
    for (const d of ARTIFACT_REGISTRY) {
      expect(VALID_FAMILIES.has(d.family)).toBe(true);
    }
  });

  it("diagram entries declare a mermaidKind and render as mermaid", () => {
    for (const d of ARTIFACT_REGISTRY.filter((x) => x.family === "diagram")) {
      expect(typeof d.mermaidKind).toBe("string");
      expect((d.mermaidKind as string).length).toBeGreaterThan(0);
      expect(d.render).toBe("mermaid");
    }
  });

  it("document entries render as markdown", () => {
    for (const d of ARTIFACT_REGISTRY.filter((x) => x.family === "document")) {
      expect(d.render).toBe("markdown");
    }
  });

  it("contains the known seed kinds", () => {
    const kinds = ARTIFACT_REGISTRY.map((d) => d.kind);
    for (const k of ["drivers", "constraints", "proposal", "roadmap", "adr", "context-map", "data-model"]) {
      expect(kinds).toContain(k);
    }
  });

  it("los antiguos estructurados (drivers/constraints/proposal/roadmap) ahora son documentos markdown", () => {
    const byKind = new Map(ARTIFACT_REGISTRY.map((d) => [d.kind, d]));
    for (const k of ["drivers", "constraints", "proposal", "roadmap"]) {
      expect(byKind.get(k)?.family).toBe("document");
      expect(byKind.get(k)?.render).toBe("markdown");
    }
  });
});

describe("getDefinition", () => {
  it("returns the exact registry entry for a known kind (reference equality)", () => {
    const def = getDefinition("drivers");
    const original = ARTIFACT_REGISTRY.find((d) => d.kind === "drivers");
    expect(def).toBe(original);
  });

  it("returns the known entry regardless of the family argument", () => {
    // 'context-map' is a diagram; asking with family 'document' must still resolve the real entry.
    const def = getDefinition("context-map", "document");
    expect(def.family).toBe("diagram");
    expect(def.render).toBe("mermaid");
  });

  it("synthesizes a definition for an unknown kind (default family = document)", () => {
    const def = getDefinition("my-custom-thing");
    expect(def.kind).toBe("my-custom-thing");
    expect(def.family).toBe("document");
    expect(def.render).toBe("markdown");
    expect(def.icon).toBe("FileText");
    expect(def.accent).toBe("text-slate-600");
    expect(def.description).toContain("my-custom-thing");
  });

  it("synthesizes a diagram fallback (mermaid render, Workflow icon)", () => {
    const def = getDefinition("weird-diagram", "diagram");
    expect(def.render).toBe("mermaid");
    expect(def.icon).toBe("Workflow");
    expect(def.family).toBe("diagram");
  });

  it("synthesizes a document fallback rendering as markdown", () => {
    const def = getDefinition("ghost-doc", "document");
    expect(def.family).toBe("document");
    expect(def.render).toBe("markdown");
    expect(def.icon).toBe("FileText");
  });

  it("title-cases the kind into a label, replacing hyphens and underscores", () => {
    expect(getDefinition("foo-bar").label).toBe("Foo Bar");
    expect(getDefinition("foo_bar_baz").label).toBe("Foo Bar Baz");
    expect(getDefinition("mixed-sep_two").label).toBe("Mixed Sep Two");
  });

  it("title-cases a single token", () => {
    expect(getDefinition("singleton").label).toBe("Singleton");
  });

  it("does not set mermaidKind/promptHint on a synthetic definition", () => {
    const def = getDefinition("brand-new");
    expect(def.mermaidKind).toBeUndefined();
    expect(def.promptHint).toBeUndefined();
  });

  it("handles an empty-string kind without throwing", () => {
    const def = getDefinition("");
    expect(def.kind).toBe("");
    expect(def.label).toBe("");
    expect(def.render).toBe("markdown");
    expect(def.description).toBe("Artefacto generado dinámicamente: ");
  });

  it("returns a fresh synthetic object on each call for an unknown kind", () => {
    const a = getDefinition("not-registered");
    const b = getDefinition("not-registered");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("known kinds win over the family default (does not fabricate)", () => {
    // 'adr' is a registered document; passing 'diagram' must not change its render.
    const def = getDefinition("adr", "diagram");
    expect(def.render).toBe("markdown");
    expect(def.promptHint).toBeDefined();
  });
});

describe("family selector helpers", () => {
  it("documentDefinitions returns only document entries", () => {
    const defs = documentDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.every((d) => d.family === "document")).toBe(true);
  });

  it("diagramDefinitions returns only diagram entries", () => {
    const defs = diagramDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.every((d) => d.family === "diagram")).toBe(true);
  });

  it("los selectores particionan todo el registro", () => {
    const total = documentDefinitions().length + diagramDefinitions().length;
    expect(total).toBe(ARTIFACT_REGISTRY.length);
  });

  it("getDefinition resuelve cada kind de cada selector a sí mismo", () => {
    const all: ArtifactDefinition[] = [...documentDefinitions(), ...diagramDefinitions()];
    for (const d of all) {
      expect(getDefinition(d.kind, d.family)).toBe(d);
    }
  });
});
