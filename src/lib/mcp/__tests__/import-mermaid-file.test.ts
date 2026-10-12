import { describe, it, expect } from "vitest";
import { importarMermaid, nombreDeArchivo } from "../import-mermaid-file";

const FLOW = ['flowchart LR', '  a["Web<br><i>Contenedor</i>"] -->|usa| b["API<br><i>Componente</i>"]'].join("\n");

describe("importarMermaid (#540)", () => {
  it("un .mmd entra como proyecto con GraphData, nombre del archivo y ledger", () => {
    const r = importarMermaid(FLOW, "paisaje.mmd", { notation: "c4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nombre).toBe("paisaje");
    expect(r.graph.nombre_proyecto).toBe("paisaje");
    expect(r.graph.notation).toBe("c4");
    expect(r.model.nodes).toHaveLength(2);
    expect(r.ledger.dibujados).toEqual({ elementos: 2, relaciones: 1 });
    // Redibujado: todo nodo con posición.
    for (const n of r.model.nodes) expect(typeof n.x).toBe("number");
  });

  it("de un Markdown elige el bloque pedido", () => {
    const md = ["```mermaid", "pie", '  "a": 1', "```", "", "```mermaid", "sequenceDiagram", "  A->>B: hola", "```"].join("\n");
    const sinIndice = importarMermaid(md, "README.md");
    expect(sinIndice.ok).toBe(false);
    if (!sinIndice.ok) expect(sinIndice.error).toMatch(/pie.*no se importa/);
    const r = importarMermaid(md, "README.md", { bloque: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graph.notation).toBe("uml");
  });

  it("sin Mermaid, con un índice que no existe o sin elementos: error que dice qué esperaba", () => {
    expect(importarMermaid("# nada", "x.md")).toMatchObject({ ok: false, error: expect.stringMatching(/ningún bloque/) });
    expect(importarMermaid(FLOW, "x.mmd", { bloque: 3 })).toMatchObject({ ok: false, error: expect.stringMatching(/no existe el 3/) });
    expect(importarMermaid("flowchart LR\n  %% vacío", "x.mmd")).toMatchObject({ ok: false, error: expect.stringMatching(/ningún elemento/) });
  });

  it("nombreDeArchivo quita la extensión y la ruta", () => {
    expect(nombreDeArchivo("docs/flujos/alta.mermaid")).toBe("alta");
    expect(nombreDeArchivo("C:\\x\\README.md")).toBe("README");
  });
});
