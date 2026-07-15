import { describe, it, expect } from "vitest";
import { emptyDiagram, addContainer, addNode, addEdge } from "../diagram-builder";
import { toMermaid } from "../to-mermaid";

describe("toMermaid", () => {
  it("genera un flowchart con subgraph para el contenedor y sus aristas", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addContainer(m, { nombre: "Pedidos", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { nombre: "Crear Pedido", tipo_elemento: "Comando", container: "Pedidos" });
    m = a.model;
    const b = addNode(m, { nombre: "Pedido Creado", tipo_elemento: "Evento", container: "Pedidos" });
    m = b.model;
    m = addEdge(m, { fuente: a.id, destino: b.id, descripcion: "dispara" });

    const out = toMermaid(m);
    expect(out).toContain("flowchart LR");
    expect(out).toContain("subgraph");
    expect(out).toContain('|"dispara"|');
    expect(out).toContain("-->");
  });

  it("escapa comillas y saltos de línea en las etiquetas", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { nombre: 'Con "comillas"\nsalto', tipo_elemento: "Actor" }).model;
    const out = toMermaid(m);
    expect(out).toContain("#quot;comillas#quot;"); // comillas del nombre escapadas
    expect(out).toContain("salto"); // el <br> del salto de línea se conserva el texto
  });

});
