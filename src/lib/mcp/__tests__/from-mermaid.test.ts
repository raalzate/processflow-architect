import { describe, it, expect } from "vitest";
import { fromMermaid } from "../from-mermaid";
import { toMermaid } from "../to-mermaid";
import { emptyDiagram, addContainer, addNode, addEdge } from "../diagram-builder";

describe("fromMermaid — tipos del registro", () => {
  it("lee el tipo de la etiqueta y arma contenedor, nodos y aristas", () => {
    const texto = [
      "flowchart LR",
      '  subgraph sistema["Tienda<br><i>Límite de Sistema</i>"]',
      '    web["Web<br><i>Contenedor</i>"]',
      '    api["API<br><i>Componente</i>"]',
      "  end",
      '  cliente("Cliente<br><i>Persona</i>")',
      '  cliente -->|"usa"| web',
      "  web -.-> api",
    ].join("\n");

    const { model, hallazgos } = fromMermaid(texto, "c4", { nombre: "Tienda" });

    expect(hallazgos).toEqual([]);
    expect(model.meta.notation).toBe("c4");
    expect(model.nodes.map((n) => [n.nombre, n.tipo_elemento])).toEqual(
      expect.arrayContaining([
        ["Tienda", "Límite de Sistema"],
        ["Web", "Contenedor"],
        ["API", "Componente"],
        ["Cliente", "Persona"],
      ])
    );
    // Los hijos del subgraph quedan dentro del contenedor, por NOMBRE.
    expect(model.nodes.find((n) => n.nombre === "Web")?.container).toBe("Tienda");
    expect(model.nodes.find((n) => n.nombre === "Cliente")?.container).toBe("");

    expect(model.edges).toHaveLength(2);
    const usa = model.edges.find((e) => e.descripcion === "usa");
    expect(usa).toMatchObject({ fuente: "cliente", destino: "web" });
    expect(model.edges.find((e) => e.fuente === "web")).toMatchObject({ dashed: true });
  });

  it("acepta el tipo por clase `:::slug` además de la etiqueta", () => {
    const texto = ['flowchart TD', 'a["Pago"]:::base-de-datos'].join("\n");
    const { model, hallazgos } = fromMermaid(texto, "c4");
    expect(model.nodes[0].tipo_elemento).toBe("Base de Datos");
    expect(hallazgos).toEqual([]);
  });

  it("ignora comentarios, direcciones y declaraciones de estilo", () => {
    const texto = [
      "%% esto es un comentario",
      "flowchart LR",
      "  direction TB",
      "  classDef persona fill:#fff",
      '  a["Cliente<br><i>Persona</i>"]',
      "  linkStyle 0 stroke:#000",
    ].join("\n");
    const { model } = fromMermaid(texto, "c4");
    expect(model.nodes).toHaveLength(1);
  });
});

describe("fromMermaid — un tipo distinto se corrige, uno inexistente no se adivina", () => {
  it("corrige mayúsculas, acentos e idioma contra el registro", () => {
    const texto = ['flowchart LR', 'a["Web<br><i>container</i>"]', 'b["Ana<br><i>persona</i>"]'].join("\n");
    const { model, hallazgos } = fromMermaid(texto, "c4");
    const tipoDe = (nombre: string) => model.nodes.find((n) => n.nombre === nombre)?.tipo_elemento;
    expect(tipoDe("Web")).toBe("Contenedor");
    expect(tipoDe("Ana")).toBe("Persona");
    // «container» no es el tipo tal cual: se corrigió, y eso se dice.
    expect(hallazgos.join(" ")).toContain("container");
  });

  it("un tipo que no existe en la notación se reporta y NO se deduce de la silueta", () => {
    const texto = ['flowchart LR', 'a[("Mongo<br><i>Colección Documental</i>")]'].join("\n");
    const { model, hallazgos } = fromMermaid(texto, "c4");
    expect(hallazgos.join(" ")).toContain("Colección Documental");
    // El cilindro es la silueta de «Base de Datos»: deducirlo de ahí es justo lo prohibido.
    expect(model.nodes[0].tipo_elemento).not.toBe("Base de Datos");
  });

  it("una caja sin tipo declarado es un hallazgo, no una adivinanza", () => {
    const { model, hallazgos } = fromMermaid('flowchart LR\n  a["Cosa"]', "c4");
    expect(hallazgos.join(" ")).toContain("Cosa");
    expect(model.nodes[0].nombre).toBe("Cosa");
  });

  it("un nodo citado por una arista y nunca declarado entra con hallazgo", () => {
    const { model, hallazgos } = fromMermaid('flowchart LR\n  a["Web<br><i>Contenedor</i>"] --> b', "c4");
    expect(model.nodes).toHaveLength(2);
    expect(hallazgos.join(" ")).toContain("b");
  });
});

describe("fromMermaid — la geometría la pone el código", () => {
  it("todo nodo sale con posición y tamaño aunque el Mermaid no diga nada", () => {
    const texto = [
      "flowchart LR",
      '  subgraph s["Tienda<br><i>Límite de Sistema</i>"]',
      '    a["Web<br><i>Contenedor</i>"]',
      "  end",
      '  b["Cliente<br><i>Persona</i>"]',
      "  b --> a",
    ].join("\n");
    const { model } = fromMermaid(texto, "c4");
    for (const n of model.nodes) {
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
      expect(n.width).toBeGreaterThan(0);
      expect(n.height).toBeGreaterThan(0);
    }
  });
});

describe("ida y vuelta toMermaid → fromMermaid", () => {
  it("devuelve los mismos tipos y las mismas relaciones (SC-005)", () => {
    let m = emptyDiagram({ nombre_proyecto: "Tienda", notation: "c4" });
    m = addContainer(m, { nombre: "Tienda", tipo_elemento: "Límite de Sistema" }).model;
    const web = addNode(m, { nombre: "Web", tipo_elemento: "Contenedor", container: "Tienda" });
    m = web.model;
    const api = addNode(m, { nombre: "API", tipo_elemento: "Componente", container: "Tienda" });
    m = api.model;
    const ana = addNode(m, { nombre: "Ana", tipo_elemento: "Persona" });
    m = ana.model;
    m = addEdge(m, { fuente: ana.id, destino: web.id, descripcion: "usa" });
    m = addEdge(m, { fuente: web.id, destino: api.id });

    const { model, hallazgos } = fromMermaid(toMermaid(m), "c4", { nombre: "Tienda" });

    expect(hallazgos).toEqual([]);
    const tipos = (x: typeof m) =>
      x.nodes.map((n) => `${n.nombre}:${n.tipo_elemento}:${n.container ?? ""}`).sort();
    expect(tipos(model)).toEqual(tipos(m));

    const rel = (x: typeof m) => {
      const nombre = (id: string) => x.nodes.find((n) => n.id === id)?.nombre ?? id;
      return x.edges.map((e) => `${nombre(e.fuente)}→${nombre(e.destino)}:${e.descripcion ?? ""}`).sort();
    };
    expect(rel(model)).toEqual(rel(m));
  });
});
