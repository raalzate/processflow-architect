/**
 * Import de `sequenceDiagram` y ledger de fidelidad (#540, ADR 0006).
 *
 * Importar es redibujar: participantes, mensajes en orden y fragmentos llegan
 * al modelo; lo que el lienzo no dibuja (notas, activaciones) se dice en el
 * ledger, nunca se calla.
 */
import { describe, it, expect } from "vitest";
import { fromMermaid } from "../from-mermaid";
import { formatLedger } from "../import-ledger";
import { bloquesMermaid } from "../mermaid-source";
import { isLifelineContainer, isFragmentContainer } from "../../notations";

const OAUTH = [
  "sequenceDiagram",
  "  autonumber",
  "  participant C as Cliente",
  "  actor A as Auth",
  "  C->>A: pedir token",
  "  activate A",
  "  A-->>C: token",
  "  deactivate A",
  "  Note over C,A: el token dura 1h",
  "  alt token vencido",
  "    C->>A: refrescar",
  "    A-->>C: token nuevo",
  "  else token válido",
  "    C-)S: usar recurso",
  "  end",
].join("\n");

describe("fromMermaid · sequenceDiagram", () => {
  it("una línea de vida por participante (con su alias) y los mensajes en orden", () => {
    const { model, hallazgos } = fromMermaid(OAUTH, "uml", { nombre: "OAuth" });
    expect(model.meta.notation).toBe("uml");
    const lifelines = model.nodes.filter((n) => isLifelineContainer(n.tipo_elemento));
    // C, A declarados y S implícito (aparece en un mensaje sin declararse).
    expect(lifelines.map((n) => n.nombre).sort()).toEqual(["Auth", "Cliente", "S"]);
    expect(model.edges.map((e) => e.descripcion)).toEqual([
      "pedir token",
      "token",
      "refrescar",
      "token nuevo",
      "usar recurso",
    ]);
    expect(model.edges.map((e) => e.orden)).toEqual([1, 2, 3, 4, 5]);
    expect(hallazgos).toEqual([]);
  });

  it("el trazo decide la clase del mensaje: ->> llamada, -->> retorno, -) asíncrono", () => {
    const { model } = fromMermaid(OAUTH, "uml");
    expect(model.edges.map((e) => e.messageKind)).toEqual(["sync", "return", "sync", "return", "async"]);
  });

  it("alt/else se vuelve UN fragmento con sus guardas y el rango de mensajes", () => {
    const { model } = fromMermaid(OAUTH, "uml");
    const fr = model.nodes.find((n) => isFragmentContainer(n.tipo_elemento)) as any;
    expect(fr).toBeDefined();
    expect(fr.fragmentOp).toBe("alt");
    expect(fr.nombre).toContain("token vencido");
    expect(fr.nombre).toContain("token válido");
    expect(fr.fragmentParts[0]).toMatchObject({ desde: 3, hasta: 5 });
  });

  it("el ledger dice lo que no llegó al dibujo: la nota y las activaciones", () => {
    const { ledger } = fromMermaid(OAUTH, "uml");
    expect(ledger.fuente).toEqual({ elementos: 3, relaciones: 5 });
    expect(ledger.dibujados).toEqual({ elementos: 3, relaciones: 5 });
    expect(ledger.omitidos.some((o) => o.includes("nota") && o.includes("el token dura 1h"))).toBe(true);
    expect(ledger.omitidos.some((o) => o.includes("2 activación"))).toBe(true);
    expect(formatLedger(ledger)).toContain("3 elemento(s) → 3 dibujado(s)");
  });

  it("una notación sin línea de vida cae a la que sí la tiene y lo dice", () => {
    const { model, hallazgos } = fromMermaid("sequenceDiagram\n  A->>B: hola", "bpmn");
    expect(model.meta.notation).toBe("uml");
    expect(hallazgos.join(" ")).toMatch(/bpmn.*línea de vida/);
  });

  it("critical y break no existen en el lienzo: caen a alt y opt con hallazgo", () => {
    const texto = ["sequenceDiagram", "  critical conectar", "    A->>B: open", "  end", "  break si falla", "    B-->>A: error", "  end"].join("\n");
    const { model, hallazgos } = fromMermaid(texto, "uml");
    const ops = model.nodes.filter((n) => isFragmentContainer(n.tipo_elemento)).map((n: any) => n.fragmentOp);
    expect(ops).toEqual(["alt", "opt"]);
    expect(hallazgos.join(" ")).toMatch(/critical.*alt/);
    expect(hallazgos.join(" ")).toMatch(/break.*opt/);
  });

  it("un fragmento sin end no se dibuja y se dice; uno vacío va al ledger", () => {
    const { model, hallazgos, ledger } = fromMermaid(
      ["sequenceDiagram", "  opt nada", "  end", "  loop sin cierre", "    A->>B: x"].join("\n"),
      "uml"
    );
    expect(model.nodes.filter((n) => isFragmentContainer(n.tipo_elemento))).toHaveLength(0);
    expect(ledger.omitidos.join(" ")).toMatch(/opt.*vacío/);
    expect(hallazgos.join(" ")).toMatch(/loop.*sin `end`/);
  });

  it("todo nodo tiene geometría al salir (el lienzo nunca queda en blanco)", () => {
    const { model } = fromMermaid(OAUTH, "uml");
    for (const n of model.nodes) {
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
    }
  });
});

describe("fromMermaid · ledger del flowchart", () => {
  it("cuenta la fuente y lo dibujado, y lista los click y estilos descartados", () => {
    const texto = [
      "flowchart LR",
      '  a["A<br><i>Sistema</i>"]',
      '  b["B<br><i>Sistema</i>"]',
      "  a -->|llama| b",
      "  click a https://ejemplo.com",
      "  style a fill:#f00",
      "  esto no es mermaid",
    ].join("\n");
    const { ledger } = fromMermaid(texto, "c4");
    expect(ledger.fuente).toEqual({ elementos: 2, relaciones: 1 });
    expect(ledger.omitidos.some((o) => o.startsWith("enlace"))).toBe(true);
    expect(ledger.omitidos.some((o) => o.startsWith("estilo"))).toBe(true);
    expect(ledger.omitidos.some((o) => o.includes("esto no es mermaid"))).toBe(true);
  });

  it("sin nada omitido el ledger lo dice en una línea", () => {
    const { ledger } = fromMermaid('flowchart LR\n  a["A<br><i>Sistema</i>"] --> b["B<br><i>Sistema</i>"]', "c4");
    expect(ledger.omitidos).toEqual([]);
    expect(formatLedger(ledger)).toContain("Nada se omitió");
  });
});

describe("bloquesMermaid", () => {
  it("un .mmd sin fences es un bloque con su gramática", () => {
    const b = bloquesMermaid("sequenceDiagram\n  A->>B: hola");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ indice: 0, grammar: "sequenceDiagram", cabecera: "sequenceDiagram" });
  });

  it("un Markdown con varios fences devuelve uno por fence, en orden", () => {
    const md = [
      "# Doc",
      "```mermaid",
      "flowchart TD",
      "  a --> b",
      "```",
      "texto",
      "```mermaid",
      "pie",
      '  "x": 1',
      "```",
    ].join("\n");
    const b = bloquesMermaid(md);
    expect(b.map((x) => [x.indice, x.grammar, x.cabecera])).toEqual([
      [0, "flowchart", "flowchart"],
      [1, "otro", "pie"],
    ]);
    expect(b[0].codigo).toContain("a --> b");
  });

  it("frontmatter y comentarios no tapan la cabecera", () => {
    const b = bloquesMermaid("---\ntitle: x\n---\n%% comentario\ngraph LR\n  a --> b");
    expect(b[0].grammar).toBe("flowchart");
  });

  it("un texto sin Mermaid no devuelve bloques", () => {
    expect(bloquesMermaid("# Sólo un título\n\nY un párrafo.")).toEqual([]);
  });
});
