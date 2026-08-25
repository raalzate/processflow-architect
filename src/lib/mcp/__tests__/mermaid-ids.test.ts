import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addNode,
  addEdge,
  updateNode,
  removeNode,
  removeEdge,
  updateEdge,
} from "../diagram-builder";
import { toMermaid, idsQueCambian } from "../to-mermaid";
import { mermaidSafeId } from "../mermaid-id";

/**
 * Issue #149 — el Mermaid de `get_diagram` es de donde el agente saca los ids, y
 * ahí los guiones se vuelven guiones bajos. Con ids tipo UUID no coincidía
 * ninguno, y `remove_element` contestaba «eliminado» igual.
 */
const UUID_A = "a1b2c3d4-e5f6-4711-8899-aabbccddeeff";
const UUID_B = "b2c3d4e5-f6a7-4811-9900-bbccddeeff00";

function conUuids() {
  let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
  m = addNode(m, { id: UUID_A, nombre: "Cobrar", tipo_elemento: "Comando" }).model;
  m = addNode(m, { id: UUID_B, nombre: "Cobrado", tipo_elemento: "Evento" }).model;
  return m;
}

describe("ids del Mermaid vs ids llamables (#149)", () => {
  it("el dibujo cambia el id y el modelo declara la equivalencia", () => {
    const m = conUuids();
    expect(toMermaid(m)).toContain(mermaidSafeId(UUID_A));
    expect(toMermaid(m)).not.toContain(UUID_A);
    expect(idsQueCambian(m)).toEqual([
      { real: UUID_A, mermaid: mermaidSafeId(UUID_A) },
      { real: UUID_B, mermaid: mermaidSafeId(UUID_B) },
    ]);
  });

  it("un id copiado del dibujo sirve para conectar, y la arista guarda el REAL", () => {
    const m = addEdge(conUuids(), {
      fuente: mermaidSafeId(UUID_A),
      destino: mermaidSafeId(UUID_B),
    });
    expect(m.edges[0]).toMatchObject({ fuente: UUID_A, destino: UUID_B });
  });

  it("también sirve para corregir, borrar una relación y borrar un elemento", () => {
    let m = addEdge(conUuids(), { fuente: UUID_A, destino: UUID_B });
    m = updateEdge(m, mermaidSafeId(UUID_A), mermaidSafeId(UUID_B), { descripcion: "dispara" });
    expect(m.edges[0].descripcion).toBe("dispara");

    m = updateNode(m, mermaidSafeId(UUID_A), { nombre: "Cobrar prima" });
    expect(m.nodes.find((n) => n.id === UUID_A)!.nombre).toBe("Cobrar prima");

    m = removeEdge(m, mermaidSafeId(UUID_A), mermaidSafeId(UUID_B));
    expect(m.edges).toHaveLength(0);

    m = removeNode(m, mermaidSafeId(UUID_A));
    expect(m.nodes.map((n) => n.id)).toEqual([UUID_B]);
  });

  it("si el id dibujado corresponde a VARIOS elementos, no adivina", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "pago-uno", nombre: "A", tipo_elemento: "Comando" }).model;
    m = addNode(m, { id: "pago_uno", nombre: "B", tipo_elemento: "Comando" }).model;
    // "pago_uno" existe de verdad: gana el exacto, no hay ambigüedad.
    expect(removeNode(m, "pago_uno").nodes.map((n) => n.id)).toEqual(["pago-uno"]);

    let dos = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    dos = addNode(dos, { id: "pago-uno", nombre: "A", tipo_elemento: "Comando" }).model;
    dos = addNode(dos, { id: "pago.uno", nombre: "B", tipo_elemento: "Comando" }).model;
    expect(() => removeNode(dos, "pago_uno")).toThrow(/más de un elemento/);
  });
});

describe("borrar lo que no existe (#149)", () => {
  it("removeNode lanza con las opciones en vez de decir que borró", () => {
    const m = conUuids();
    expect(() => removeNode(m, "fantasma")).toThrow(/No existe el elemento "fantasma"/);
    expect(() => removeNode(m, "fantasma")).toThrow(UUID_A);
  });

  it("el modelo no cambia cuando el borrado falla", () => {
    const m = conUuids();
    try {
      removeNode(m, "fantasma");
    } catch {
      /* esperado */
    }
    expect(m.nodes).toHaveLength(2);
  });

  it("updateNode con un id inexistente también dice qué hay", () => {
    expect(() => updateNode(conUuids(), "fantasma", { nombre: "X" })).toThrow(UUID_B);
  });
});
