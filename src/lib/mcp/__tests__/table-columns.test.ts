/**
 * Columnas de tabla por el camino del MCP: entran por `add_node`, se validan y
 * sobreviven el ida y vuelta a `GraphData`.
 *
 * Es donde se rompe en silencio: si `toGraphData` no las lleva, el agente
 * construye el modelo, lo exporta y la app dibuja cajas vacías sin que nada
 * falle. Y si `validate` no las mira, una FK sin destino llega al lienzo.
 */
import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addNode,
  addEdge,
  fromGraphData,
  toGraphData,
  updateNode,
  validate,
} from "@/lib/mcp/diagram-builder";
import type { TableColumn } from "@/lib/mer/table-box";

const COLUMNAS: TableColumn[] = [
  { nombre: "id", tipo: "integer", pk: true },
  { nombre: "servicio_id", tipo: "integer", fk: true, referencia: "servicio.id" },
];

/** Un MER con dos tablas conectadas (sin aristas el lienzo descarta los nodos). */
function merConDosTablas(columnas: TableColumn[] = COLUMNAS) {
  let m = emptyDiagram({ notation: "mer", nombre_proyecto: "Reservas" });
  m = addNode(m, { nombre: "Reserva", tipo_elemento: "Tabla Relacional", columnas }).model;
  m = addNode(m, {
    nombre: "Servicio",
    tipo_elemento: "Tabla Relacional",
    columnas: [{ nombre: "id", tipo: "integer", pk: true }],
  }).model;
  return addEdge(m, {
    fuente: "reserva",
    destino: "servicio",
    descripcion: "reserva",
  });
}

describe("add_node con columnas", () => {
  it("las guarda normalizadas en el nodo", () => {
    const m = merConDosTablas();
    const reserva = m.nodes.find((n) => n.nombre === "Reserva")!;
    expect(reserva.columnas).toEqual(COLUMNAS);
  });

  it("update_element reemplaza la lista completa (el orden es parte del modelo)", () => {
    const m = updateNode(merConDosTablas(), "reserva", {
      columnas: [{ nombre: "id", tipo: "bigint", pk: true }],
    });
    expect(m.nodes.find((n) => n.id === "reserva")!.columnas).toEqual([
      { nombre: "id", tipo: "bigint", pk: true },
    ]);
  });
});

describe("validate", () => {
  it("una FK sin referencia es ERROR: no se sabe a qué tabla apunta", () => {
    const r = validate(merConDosTablas([{ nombre: "servicio_id", tipo: "integer", fk: true }]));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/apunta/);
  });

  it("una tabla sin clave primaria es AVISO, no error", () => {
    const r = validate(merConDosTablas([{ nombre: "nombre", tipo: "text" }]));
    expect(r.errors.filter((e) => e.includes("clave primaria"))).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/clave primaria/);
  });

  it("una tabla sin columnas avisa que la caja se dibuja vacía", () => {
    const r = validate(merConDosTablas([]));
    expect(r.warnings.join(" ")).toMatch(/sin columnas/);
  });

  it("columnas en un tipo que NO es caja de tabla avisan que no se van a ver", () => {
    let m = emptyDiagram({ notation: "mer", nombre_proyecto: "X" });
    m = addNode(m, {
      nombre: "Cliente",
      tipo_elemento: "Entidad Fuerte",
      columnas: [{ nombre: "id" }],
    }).model;
    m = addNode(m, { nombre: "Reserva", tipo_elemento: "Entidad Fuerte" }).model;
    m = addEdge(m, { fuente: "cliente", destino: "reserva" });
    expect(validate(m).warnings.join(" ")).toMatch(/no se dibuja como caja de tabla/);
  });
});

describe("ida y vuelta por GraphData", () => {
  it("las columnas viajan al proyecto y vuelven iguales", () => {
    const data = toGraphData(merConDosTablas());
    const nodos = [...data.big_picture.nodos, ...data.agregados.flatMap((a) => a.nodos)];
    const reserva = nodos.find((n) => n.nombre === "Reserva")!;
    expect(reserva.columnas).toEqual(COLUMNAS);
    const volvio = fromGraphData(data).nodes.find((n) => n.nombre === "Reserva")!;
    expect(volvio.columnas).toEqual(COLUMNAS);
  });

  it("un diagrama sin tablas no gana el campo (los proyectos viejos no cambian)", () => {
    let m = emptyDiagram({ notation: "c4", nombre_proyecto: "Paisaje" });
    m = addNode(m, { nombre: "API", tipo_elemento: "Contenedor" }).model;
    m = addNode(m, { nombre: "Web", tipo_elemento: "Contenedor" }).model;
    m = addEdge(m, { fuente: "web", destino: "api" });
    const data = toGraphData(m);
    for (const n of data.big_picture.nodos) expect(n.columnas).toBeUndefined();
  });

  it("la caja de una tabla con muchas columnas mide más que la celda por defecto", () => {
    const muchas: TableColumn[] = Array.from({ length: 12 }, (_, i) => ({
      nombre: `campo_${i}`,
      tipo: "varchar(50)",
    }));
    const data = toGraphData(merConDosTablas(muchas));
    const nodos = [...data.big_picture.nodos, ...data.agregados.flatMap((a) => a.nodos)];
    const [a, b] = nodos.filter((n) => n.tipo_elemento === "Tabla Relacional");
    // El layout reparte con celdas del tamaño de la tabla más grande: dos cajas
    // altas no pueden quedar en la misma coordenada.
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });
});
