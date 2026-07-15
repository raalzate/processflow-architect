import { describe, it, expect } from "vitest";
import {
  sanitizeId,
  escapeNodeLabel,
  escapeEdgeLabel,
  getTechTag,
  diagramContext,
  diagramBigPicture,
  diagramReadModels,
  diagramTechnicalElements,
} from "@/lib/mermaid-diagram";
import type {
  BigPicture,
  GraphNode,
  ReadModel,
  TechnicalDiagram,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture helpers — built only from fields that exist on the exported types.
// ---------------------------------------------------------------------------

type BPNode = BigPicture["nodos"][number];
type BPEdge = BigPicture["aristas"][number];

function makeNode(partial: Partial<BPNode> & { id: string; tipo_elemento: BPNode["tipo_elemento"] }): BPNode {
  return {
    nombre: partial.nombre ?? partial.id,
    estado_comparativo: partial.estado_comparativo ?? "existente",
    ...partial,
  } as BPNode;
}

function makeEdge(fuente: string, destino: string, descripcion?: string): BPEdge {
  return { fuente, destino, descripcion } as BPEdge;
}

// ---------------------------------------------------------------------------
// sanitizeId
// ---------------------------------------------------------------------------
describe("sanitizeId", () => {
  it("returns 'invalid_id' for empty string", () => {
    expect(sanitizeId("")).toBe("invalid_id");
  });

  it("returns 'invalid_id' for falsy inputs (null/undefined cast)", () => {
    // @ts-expect-error testing runtime guard against null
    expect(sanitizeId(null)).toBe("invalid_id");
    // @ts-expect-error testing runtime guard against undefined
    expect(sanitizeId(undefined)).toBe("invalid_id");
  });

  it("keeps alphanumerics and underscores intact", () => {
    expect(sanitizeId("abc_123_DEF")).toBe("abc_123_DEF");
  });

  it("strips spaces, accents, punctuation and symbols", () => {
    expect(sanitizeId("Read Model (Cliente)!")).toBe("ReadModelCliente");
  });

  it("strips accented characters entirely", () => {
    expect(sanitizeId("Políticá")).toBe("Poltic");
  });

  it("returns a string with all characters removed when nothing is allowed", () => {
    expect(sanitizeId("¡¿@#$%")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeNodeLabel
// ---------------------------------------------------------------------------
describe("escapeNodeLabel", () => {
  it("replaces double quotes with #quot;", () => {
    expect(escapeNodeLabel('say "hi"')).toBe("say #quot;hi#quot;");
  });

  it("replaces newlines with <br>", () => {
    expect(escapeNodeLabel("line1\nline2")).toBe("line1<br>line2");
  });

  it("replaces hyphens with spaces", () => {
    expect(escapeNodeLabel("pre-sale")).toBe("pre sale");
  });

  it("replaces opening paren with '- ' and removes closing paren", () => {
    expect(escapeNodeLabel("Cmd (extra)")).toBe("Cmd - extra");
  });

  it("handles a combination of all replacements", () => {
    // '"' -> #quot;, '\n' -> <br>, '-' -> ' ', '(' -> '- ', ')' removed
    expect(escapeNodeLabel('A-B\n("C")')).toBe("A B<br>- #quot;C#quot;");
  });

  it("returns empty string unchanged", () => {
    expect(escapeNodeLabel("")).toBe("");
  });

  it("leaves plain text untouched", () => {
    expect(escapeNodeLabel("Plain text 123")).toBe("Plain text 123");
  });
});

// ---------------------------------------------------------------------------
// escapeEdgeLabel
// ---------------------------------------------------------------------------
describe("escapeEdgeLabel", () => {
  it("replaces double quotes with #quot;", () => {
    expect(escapeEdgeLabel('a "b" c')).toBe("a #quot;b#quot; c");
  });

  it("replaces newlines with a single space", () => {
    expect(escapeEdgeLabel("a\nb")).toBe("a b");
  });

  it("does NOT alter hyphens or parentheses (unlike node label)", () => {
    expect(escapeEdgeLabel("pre-sale (x)")).toBe("pre-sale (x)");
  });

  it("returns empty string unchanged", () => {
    expect(escapeEdgeLabel("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getTechTag
// ---------------------------------------------------------------------------
describe("getTechTag", () => {
  it("returns empty string for null", () => {
    expect(getTechTag(null)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getTechTag([])).toBe("");
  });

  it("formats a single tag", () => {
    expect(getTechTag(["Angular"])).toBe("- Angular");
  });

  it("joins multiple tags with commas", () => {
    expect(getTechTag(["Angular", "GCP", "Java"])).toBe("- Angular, GCP, Java");
  });
});

// ---------------------------------------------------------------------------
// diagramContext
// ---------------------------------------------------------------------------
describe("diagramContext", () => {
  it("always starts with the flowchart LR header", () => {
    const data: BigPicture = { descripcion: "", hotspots: [], nodos: [], aristas: [] };
    expect(diagramContext(data).startsWith("flowchart LR")).toBe(true);
  });

  it("filters out node types that are not in the allowed set", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "a", tipo_elemento: "Actor", nombre: "Cliente" }),
        makeNode({ id: "e", tipo_elemento: "Evento", nombre: "TramiteIniciado" }),
      ],
      aristas: [],
    };
    const out = diagramContext(data);
    // Actor is visible, Evento is filtered (not in allowedTypes)
    expect(out).toContain('a(["Cliente"]');
    expect(out).not.toContain("TramiteIniciado");
  });

  it("uses the correct shape delimiters per allowed type", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "sis", tipo_elemento: "Sistema Externo", nombre: "S" }),
        makeNode({ id: "cmd", tipo_elemento: "Comando", nombre: "C" }),
        makeNode({ id: "vis", tipo_elemento: "Vista", nombre: "V" }),
        makeNode({ id: "rm", tipo_elemento: "Read Model", nombre: "R" }),
      ],
      aristas: [],
    };
    const out = diagramContext(data);
    expect(out).toContain('act(["A"])');
    expect(out).toContain('sis["S"]');
    expect(out).toContain('cmd[/"C"/]');
    expect(out).toContain('vis[\\"V"\\]');
    expect(out).toContain('rm[("R")]');
  });

  it("builds a CSS class from sanitized type + estado_comparativo", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "sis", tipo_elemento: "Sistema Externo", nombre: "X", estado_comparativo: "nuevo" }),
      ],
      aristas: [],
    };
    const out = diagramContext(data);
    // "Sistema Externo" -> "SistemaExterno", estado "nuevo"
    expect(out).toContain(":::SistemaExterno_nuevo");
  });

  it("defaults estado_comparativo to 'existente' when falsy", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      // estado_comparativo intentionally empty to exercise the `|| 'existente'` branch
      nodos: [makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A", estado_comparativo: "" as any })],
      aristas: [],
    };
    expect(diagramContext(data)).toContain(":::Actor_existente");
  });

  it("escapes double quotes in labels to single quotes and newlines to spaces", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "act", tipo_elemento: "Actor", nombre: 'My "Big"\nActor' })],
      aristas: [],
    };
    const out = diagramContext(data);
    expect(out).toContain("My 'Big' Actor");
  });

  it("wraps nodes with an 'agregado' group in a subgraph and leaves 'General' ungrouped", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        // node carries an 'agregado' via cast (BigPicture omits agregado on the type,
        // but the source reads (nodo as any).agregado at runtime)
        makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A", agregado: "Ventas" } as any),
        makeNode({ id: "sis", tipo_elemento: "Sistema Externo", nombre: "S" }),
      ],
      aristas: [],
    };
    const out = diagramContext(data);
    expect(out).toContain('subgraph sg_0 ["VENTAS"]');
    expect(out).toContain("direction TB");
    expect(out).toContain("end");
    // The General node should not be in a subgraph block (declared at root level)
    expect(out).toContain('sis["S"]');
  });

  it("computes transitive edges across invisible (filtered) bridge nodes", () => {
    // Actor -> (invisible Evento) -> Comando : edge should bridge act --> cmd
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "evt", tipo_elemento: "Evento", nombre: "E" }),
        makeNode({ id: "cmd", tipo_elemento: "Comando", nombre: "C" }),
      ],
      aristas: [makeEdge("act", "evt"), makeEdge("evt", "cmd")],
    };
    const out = diagramContext(data);
    expect(out).toContain("act --> cmd");
  });

  it("creates a direct edge between two visible nodes", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "cmd", tipo_elemento: "Comando", nombre: "C" }),
      ],
      aristas: [makeEdge("act", "cmd")],
    };
    expect(diagramContext(data)).toContain("act --> cmd");
  });

  it("does not create a trivial self-loop edge", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A" })],
      aristas: [makeEdge("act", "act")],
    };
    expect(diagramContext(data)).not.toContain("act --> act");
  });

  it("dedupes multiple paths to the same visible target", () => {
    // act -> e1 -> cmd and act -> e2 -> cmd : only one act --> cmd edge
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "act", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "e1", tipo_elemento: "Evento", nombre: "E1" }),
        makeNode({ id: "e2", tipo_elemento: "Evento", nombre: "E2" }),
        makeNode({ id: "cmd", tipo_elemento: "Comando", nombre: "C" }),
      ],
      aristas: [
        makeEdge("act", "e1"),
        makeEdge("act", "e2"),
        makeEdge("e1", "cmd"),
        makeEdge("e2", "cmd"),
      ],
    };
    const out = diagramContext(data);
    const matches = out.match(/act --> cmd/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("always emits the classDef block", () => {
    const data: BigPicture = { descripcion: "", hotspots: [], nodos: [], aristas: [] };
    expect(diagramContext(data)).toContain("classDef cluster");
  });
});

// ---------------------------------------------------------------------------
// diagramBigPicture
// ---------------------------------------------------------------------------
describe("diagramBigPicture", () => {
  it("starts with flowchart LR header", () => {
    const data: BigPicture = { descripcion: "", hotspots: [], nodos: [], aristas: [] };
    expect(diagramBigPicture(data).startsWith("flowchart LR")).toBe(true);
  });

  it("renders an Actor node without surrounding quotes around the label", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "u1", tipo_elemento: "Actor", nombre: "Cliente", estado_comparativo: "nuevo" })],
      aristas: [],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain('u1("fa:fa-user <b>Cliente</b>"):::nuevo');
  });

  it("renders non-Actor nodes with a single quoted label + icon inside the shape", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "c1", tipo_elemento: "Comando", nombre: "Iniciar" })],
      aristas: [],
    };
    const out = diagramBigPicture(data);
    // El icono y la etiqueta van dentro de UN solo par de comillas (sin comillas
    // anidadas): {{"fa:fa-terminal <b>Iniciar</b>"}}.
    expect(out).toContain('c1{{"fa:fa-terminal <b>Iniciar</b>"}}:::existente');
  });

  it("uses default shape for unmapped types", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "r1", tipo_elemento: "Read Model", nombre: "RM" })],
      aristas: [],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain('r1["<b>RM</b>"]:::existente');
  });

  it("appends an italic description block when descripcion is present", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "u1", tipo_elemento: "Actor", nombre: "Cliente", descripcion: "Compra cosas" })],
      aristas: [],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain("<br><small><i>Compra cosas</i></small>");
  });

  it("omits the description block when descripcion is absent", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "u1", tipo_elemento: "Actor", nombre: "Cliente" })],
      aristas: [],
    };
    expect(diagramBigPicture(data)).not.toContain("<small><i>");
  });

  it("defaults estado to existente when missing", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "u1", tipo_elemento: "Actor", nombre: "C", estado_comparativo: "" as any })],
      aristas: [],
    };
    expect(diagramBigPicture(data)).toContain(":::existente");
  });

  it("uses --> arrow when description includes 'habilita' or 'dispara', else ---", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "a", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "b", tipo_elemento: "Comando", nombre: "B" }),
        makeNode({ id: "c", tipo_elemento: "Comando", nombre: "C" }),
      ],
      aristas: [
        makeEdge("a", "b", "dispara el comando"),
        makeEdge("b", "c", "se relaciona con"),
      ],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain('a -->|"dispara el comando"| b');
    expect(out).toContain('b ---|"se relaciona con"| c');
  });

  it("produces no edge label segment when description is empty", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        makeNode({ id: "a", tipo_elemento: "Actor", nombre: "A" }),
        makeNode({ id: "b", tipo_elemento: "Comando", nombre: "B" }),
      ],
      aristas: [makeEdge("a", "b")],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain("a --- b");
    expect(out).not.toContain("||");
  });

  it("escapes node label hyphens/quotes via escapeNodeLabel", () => {
    const data: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [makeNode({ id: "u1", tipo_elemento: "Actor", nombre: 'pre-sale "x"' })],
      aristas: [],
    };
    const out = diagramBigPicture(data);
    expect(out).toContain("pre sale #quot;x#quot;");
  });

  it("handles empty graph gracefully", () => {
    const data: BigPicture = { descripcion: "", hotspots: [], nodos: [], aristas: [] };
    const out = diagramBigPicture(data);
    expect(out).toContain("flowchart LR");
    expect(out).toContain("classDef nuevo");
  });
});

// ---------------------------------------------------------------------------
// diagramReadModels
// ---------------------------------------------------------------------------
describe("diagramReadModels", () => {
  const baseRM: ReadModel = {
    nombre: "Vista Cliente",
    descripcion: "Una vista de cliente",
    proyecta: [],
    ui_policies: [],
    tecnologias: [],
  };

  it("starts with flowchart LR header", () => {
    expect(diagramReadModels(baseRM).startsWith("flowchart LR")).toBe(true);
  });

  it("declares the read model node with a sanitized id and desktop icon", () => {
    const out = diagramReadModels(baseRM);
    // sanitizeId("Vista Cliente") -> "VistaCliente"
    expect(out).toContain("rm_VistaCliente[\"fa:fa-desktop");
    expect(out).toContain("<b>Vista Cliente</b>");
    expect(out).toContain("Una vista de cliente");
    expect(out).toContain(":::readmodel");
  });

  it("renders the Politicas and Proyecciones subgraphs", () => {
    const out = diagramReadModels(baseRM);
    expect(out).toContain('subgraph Politicas["Políticas de UI"]');
    expect(out).toContain('subgraph Proyecciones["Proyecciones"]');
  });

  it("creates a policy node and an 'aplica' edge per ui_policy", () => {
    const rm: ReadModel = { ...baseRM, ui_policies: ["Filtrar Por Region"] };
    const out = diagramReadModels(rm);
    const policyId = "pol_rm_VistaCliente_FiltrarPorRegion";
    expect(out).toContain(`${policyId}>Filtrar Por Region]:::policy`);
    expect(out).toContain(`rm_VistaCliente -. "aplica" .-> ${policyId}`);
  });

  it("creates an event node + 'consecuencia' edge per proyecta entry, stripping 'Evento' and splitting camelCase", () => {
    const rm: ReadModel = { ...baseRM, proyecta: ["EventoClienteCreado"] };
    const out = diagramReadModels(rm);
    const eventId = "evt_rm_VistaCliente_EventoClienteCreado";
    // escapeNodeLabel keeps it, .replace('Evento',' ') -> " ClienteCreado",
    // separateCamelCase -> " Cliente Creado"
    expect(out).toContain(`${eventId}{{  Cliente Creado }}:::event`);
    expect(out).toContain(`rm_VistaCliente -. "consecuencia" .-> ${eventId}`);
  });

  it("creates a tech node + 'usa' edge per tecnologia", () => {
    const rm: ReadModel = { ...baseRM, tecnologias: ["Angular"] };
    const out = diagramReadModels(rm);
    const techId = "tech_rm_VistaCliente_Angular";
    expect(out).toContain(`${techId}["Angular"]:::tech`);
    expect(out).toContain(`rm_VistaCliente -. "usa" .-> ${techId}`);
  });

  it("always emits the four classDefs", () => {
    const out = diagramReadModels(baseRM);
    expect(out).toContain("classDef event");
    expect(out).toContain("classDef readmodel");
    expect(out).toContain("classDef policy");
    expect(out).toContain("classDef tech");
  });

  it("handles a read model with empty collections", () => {
    const out = diagramReadModels(baseRM);
    // No policy/event/tech edges
    expect(out).not.toContain('"aplica"');
    expect(out).not.toContain('"consecuencia"');
    expect(out).not.toContain('"usa"');
  });
});

// ---------------------------------------------------------------------------
// diagramTechnicalElements
// ---------------------------------------------------------------------------
describe("diagramTechnicalElements", () => {
  it("starts with 'graph TD;' header", () => {
    const data: TechnicalDiagram = { nodes: [], edges: [] };
    expect(diagramTechnicalElements(data).startsWith("graph TD;")).toBe(true);
  });

  it("renders each node with an escaped label", () => {
    const data: TechnicalDiagram = {
      nodes: [{ id: "n1", label: "pre-sale" }],
      edges: [],
    };
    const out = diagramTechnicalElements(data);
    // escapeNodeLabel turns '-' into ' '
    expect(out).toContain("n1[pre sale];");
  });

  it("renders an edge with a label between nodes", () => {
    const data: TechnicalDiagram = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", label: "calls" }],
    };
    const out = diagramTechnicalElements(data);
    expect(out).toContain("a -- calls --> b;");
  });

  it("renders an edge with empty label when label is absent", () => {
    const data: TechnicalDiagram = {
      nodes: [],
      edges: [{ from: "a", to: "b" }],
    };
    const out = diagramTechnicalElements(data);
    expect(out).toContain("a --  --> b;");
  });

  it("escapes edge label newlines to spaces (escapeEdgeLabel)", () => {
    const data: TechnicalDiagram = {
      nodes: [],
      edges: [{ from: "a", to: "b", label: "line1\nline2" }],
    };
    const out = diagramTechnicalElements(data);
    expect(out).toContain("a -- line1 line2 --> b;");
  });

  it("handles empty diagram (header only)", () => {
    const data: TechnicalDiagram = { nodes: [], edges: [] };
    expect(diagramTechnicalElements(data)).toBe("graph TD;\n");
  });

  it("renders multiple nodes and edges in order", () => {
    const data: TechnicalDiagram = {
      nodes: [
        { id: "n1", label: "One" },
        { id: "n2", label: "Two" },
      ],
      edges: [{ from: "n1", to: "n2", label: "x" }],
    };
    const out = diagramTechnicalElements(data);
    expect(out).toBe("graph TD;\n  n1[One];\n  n2[Two];\n  n1 -- x --> n2;\n");
  });
});
