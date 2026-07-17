import { describe, it, expect } from "vitest";
import { emptyDiagram, addNode, addEdge } from "../diagram-builder";
import { toMermaid } from "../to-mermaid";

describe("toMermaid — formas por notación y aristas", () => {
  it("aplica cada delimitador de forma (ellipse/diamond/cylinder/rect)", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "uml" });
    // Nodos sueltos (sin contenedor) para forzar la declaración de cada forma.
    m = addNode(m, { nombre: "Caso", tipo_elemento: "Caso de Uso" }).model; // ellipse
    m = addNode(m, { nombre: "Comp", tipo_elemento: "Componente" }).model; // rect
    const bpmn = addNode(m, { nombre: "Gate", tipo_elemento: "Compuerta" }); // diamond
    m = bpmn.model;
    m = addNode(m, { nombre: "Store", tipo_elemento: "Almacén de Datos" }).model; // cylinder

    const out = toMermaid(m);
    expect(out).toContain("((\"Caso"); // ellipse ((
    expect(out).toContain("[\"Comp"); // rect [
    expect(out).toContain("{\"Gate"); // diamond {
    expect(out).toContain("[(\"Store"); // cylinder [(
  });

  it("arista sin descripción y con arrow 'none' usa ---", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    const a = addNode(m, { nombre: "A", tipo_elemento: "Comando" });
    m = a.model;
    const b = addNode(m, { nombre: "B", tipo_elemento: "Evento" });
    m = b.model;
    m = addEdge(m, { fuente: a.id, destino: b.id, arrow: "none" });
    const out = toMermaid(m);
    expect(out).toContain("---");
    expect(out).not.toContain("|\"");
  });

  it("con dos contenedores, un hijo solo entra en su propio subgraph", () => {
    const model: any = {
      nombre_proyecto: "P",
      notation: "ddd",
      nodes: [
        { id: "A", nombre: "", tipo_elemento: "Agregado" }, // contenedor con nombre vacío
        { id: "B", nombre: "B", tipo_elemento: "Agregado" },
        { id: "n1", nombre: "N1", tipo_elemento: "Comando", container: "B" }, // hijo de B
      ],
      edges: [],
    };
    const out = toMermaid(model);
    // Dos subgraphs; N1 aparece una sola vez.
    expect(out.match(/N1/g)!).toHaveLength(1);
    expect(out).toContain("subgraph");
  });

  it("prefija n_ a ids que empiezan por caracter no válido", () => {
    // Modelo construido a mano para forzar un id que empieza por dígito.
    const model: any = {
      nombre_proyecto: "P",
      notation: "ddd",
      nodes: [{ id: "123", nombre: "Raro", tipo_elemento: "Comando" }],
      edges: [],
    };
    const out = toMermaid(model);
    expect(out).toContain("n_123");
  });
});
