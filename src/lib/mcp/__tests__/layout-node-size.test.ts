/**
 * El layout respeta el tamaño de nodo de la notación.
 *
 * Antes, todos los pasos de rejilla salían de una caja de 160×60: con las fichas
 * de C4 (220×104) las columnas se pisaban y el `width` del modelo mentía respecto
 * de lo que dibuja el lienzo.
 */
import { describe, it, expect } from "vitest";
import { emptyDiagram, addNode, addContainer, addEdge, relayout } from "../diagram-builder";
import { nodeSizeForNotation, typesWithRole, DEFAULT_NODE_SIZE } from "../../notations";

const t = (notation: string, role: Parameters<typeof typesWithRole>[1]) =>
  typesWithRole(notation, role)[0];

/** Paisaje C4 con un límite, tres sistemas dentro y dos actores. */
function paisaje() {
  let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
  m = addContainer(m, { nombre: "Plataforma", tipo_elemento: t("c4", "boundary") }).model;
  for (let i = 0; i < 3; i++) {
    m = addNode(m, {
      id: `sis-${i}`,
      nombre: `Servicio ${i}`,
      tipo_elemento: t("c4", "system"),
      container: "Plataforma",
    }).model;
  }
  m = addNode(m, { id: "user", nombre: "Cliente", tipo_elemento: t("c4", "actor") }).model;
  m = addEdge(m, { fuente: "user", destino: "sis-0", descripcion: "usa [HTTPS]" });
  return m;
}

describe("tamaño de nodo por notación en el layout", () => {
  it("escribe en el modelo la ficha de C4, no la caja de 160×60", () => {
    const out = relayout(paisaje());
    const esperado = nodeSizeForNotation("c4");
    for (const n of out.nodes.filter((x) => x.id.startsWith("sis-") || x.id === "user")) {
      expect({ w: n.width, h: n.height }).toEqual({ w: esperado.w, h: esperado.h });
    }
  });

  it("los nodos de una misma fila no se pisan con la ficha grande", () => {
    const out = relayout(paisaje());
    const dentro = out.nodes
      .filter((n) => n.container === "Plataforma")
      .sort((a, b) => a.x! - b.x!);
    for (let i = 1; i < dentro.length; i++) {
      const anterior = dentro[i - 1];
      const actual = dentro[i];
      // Misma fila → el siguiente arranca después del borde derecho del anterior.
      if (anterior.y === actual.y) {
        expect(actual.x!).toBeGreaterThanOrEqual(anterior.x! + anterior.width!);
      }
    }
  });

  it("una notación sin ficha propia sigue con la caja de siempre", () => {
    let m = emptyDiagram({ nombre_proyecto: "Proceso", notation: "bpmn" as const });
    m = addNode(m, { id: "a", nombre: "Validar", tipo_elemento: t("bpmn", "task") }).model;
    const out = relayout(m);
    const n = out.nodes.find((x) => x.id === "a")!;
    expect({ w: n.width, h: n.height }).toEqual({ w: DEFAULT_NODE_SIZE.w, h: DEFAULT_NODE_SIZE.h });
  });
});
