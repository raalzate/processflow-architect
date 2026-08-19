import { describe, it, expect } from "vitest";
import {
  applyMarkdownAction,
  artifactFileName,
  editedArtifactPayload,
  insertAtSelection,
  mermaidOnly,
} from "../editing";

describe("applyMarkdownAction — envolturas en línea", () => {
  it("envuelve la selección en negrita y la deja seleccionada", () => {
    const r = applyMarkdownAction("hola mundo", { start: 5, end: 10 }, "bold");
    expect(r.text).toBe("hola **mundo**");
    expect(r.text.slice(r.start, r.end)).toBe("mundo");
  });

  it("sin selección inserta un placeholder editable", () => {
    const r = applyMarkdownAction("", { start: 0, end: 0 }, "italic");
    expect(r.text).toBe("*texto*");
    expect(r.text.slice(r.start, r.end)).toBe("texto");
  });

  it("el mismo botón desenvuelve (ida y vuelta)", () => {
    const r = applyMarkdownAction("**x**", { start: 0, end: 5 }, "bold");
    expect(r.text).toBe("x");
  });

  it("código en línea usa comillas simples invertidas", () => {
    expect(applyMarkdownAction("id", { start: 0, end: 2 }, "code").text).toBe("`id`");
  });
});

describe("applyMarkdownAction — prefijos de línea", () => {
  it("marca todas las líneas de la selección como lista", () => {
    const r = applyMarkdownAction("uno\ndos", { start: 1, end: 5 }, "bullet");
    expect(r.text).toBe("- uno\n- dos");
  });

  it("desmarca si todas ya son lista", () => {
    const r = applyMarkdownAction("- uno\n- dos", { start: 0, end: 11 }, "bullet");
    expect(r.text).toBe("uno\ndos");
  });

  it("numera respetando el orden y desnumera al repetir", () => {
    const marcado = applyMarkdownAction("a\nb\nc", { start: 0, end: 5 }, "numbered");
    expect(marcado.text).toBe("1. a\n2. b\n3. c");
    const vuelta = applyMarkdownAction(marcado.text, { start: 0, end: marcado.text.length }, "numbered");
    expect(vuelta.text).toBe("a\nb\nc");
  });

  it("no prefija líneas vacías (no ensucia el bloque)", () => {
    expect(applyMarkdownAction("a\n\nb", { start: 0, end: 4 }, "quote").text).toBe("> a\n\n> b");
  });

  it("encabezado toma la línea entera aunque el cursor esté en el medio", () => {
    expect(applyMarkdownAction("titulo", { start: 3, end: 3 }, "heading").text).toBe("## titulo");
  });
});

describe("applyMarkdownAction — enlace y tabla", () => {
  it("el enlace deja el texto seleccionado y la URL por escribir", () => {
    const r = applyMarkdownAction("Sofka", { start: 0, end: 5 }, "link");
    expect(r.text).toBe("[Sofka](https://)");
    expect(r.text.slice(r.start, r.end)).toBe("Sofka");
  });

  it("la tabla se inserta con separación cuando cae a mitad de línea", () => {
    const r = applyMarkdownAction("texto", { start: 5, end: 5 }, "table");
    expect(r.text).toContain("texto\n\n| Columna | Columna |");
    expect(r.text).toContain("| --- | --- |");
  });
});

describe("insertAtSelection", () => {
  it("pega en el cursor y lo deja al final de lo pegado", () => {
    const r = insertAtSelection("ab", { start: 1, end: 1 }, "XY");
    expect(r.text).toBe("aXYb");
    expect(r.start).toBe(3);
    expect(r.end).toBe(3);
  });

  it("pegar con selección la reemplaza", () => {
    expect(insertAtSelection("abc", { start: 0, end: 3 }, "z").text).toBe("z");
  });

  it("una selección fuera de rango no rompe ni pierde texto", () => {
    expect(insertAtSelection("ab", { start: 99, end: 120 }, "!").text).toBe("ab!");
  });
});

describe("artifactFileName", () => {
  it("kebab-case sin diacríticos y con extensión .md", () => {
    expect(artifactFileName({ title: "Drivers de Arquitectura · Ventas" })).toBe(
      "drivers-de-arquitectura-ventas.md"
    );
  });

  it("la revisión entra en el nombre para no pisar la descarga anterior", () => {
    expect(artifactFileName({ title: "ADR 1", revision: 3 })).toBe("adr-1-v3.md");
    expect(artifactFileName({ title: "ADR 1", revision: 1 })).toBe("adr-1.md");
  });

  it("un título impronunciable no deja el archivo sin nombre", () => {
    expect(artifactFileName({ title: "***" })).toBe("artefacto.md");
  });
});

describe("mermaidOnly", () => {
  it("reconoce una valla mermaid sola", () => {
    expect(mermaidOnly("```mermaid\nflowchart LR\nA-->B\n```")).toBe("flowchart LR\nA-->B");
  });

  it("con prosa alrededor NO es sólo diagrama", () => {
    expect(mermaidOnly("intro\n```mermaid\nA-->B\n```")).toBeNull();
  });

  it("una valla vacía no cuenta", () => {
    expect(mermaidOnly("```mermaid\n\n```")).toBeNull();
  });
});

describe("editedArtifactPayload", () => {
  it("un diagrama editado que sigue siendo valla mermaid conserva el render", () => {
    const r = editedArtifactPayload(
      { render: "mermaid", payload: { code: "A-->B", caption: "flujo" } },
      "```mermaid\nA-->C\n```"
    );
    expect(r).toEqual({ render: "mermaid", payload: { code: "A-->C", caption: "flujo" } });
  });

  it("si el humano escribió prosa alrededor, pasa a markdown (no rompe el lienzo)", () => {
    const r = editedArtifactPayload({ render: "mermaid", payload: { code: "A-->B" } }, "nota\n\n```mermaid\nA-->B\n```");
    expect(r.render).toBe("markdown");
    expect(r.payload.markdown).toContain("```mermaid");
  });

  it("un artefacto estructurado editado a mano se congela como markdown", () => {
    const r = editedArtifactPayload({ render: "drivers", payload: { drivers: [] } }, "## Drivers\n- uno");
    expect(r).toEqual({ render: "markdown", payload: { markdown: "## Drivers\n- uno" } });
  });
});
