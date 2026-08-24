import { describe, it, expect } from "vitest";
import { containerOf, overlapArea, reassignContainers, MIN_COBERTURA } from "../containment";
import type { DesignerNode } from "../serialize";

/** Nodo de dominio con caja explícita. */
const nodo = (id: string, x: number, y: number, extra: Partial<DesignerNode> = {}): DesignerNode => ({
  id,
  nombre: id,
  tipo_elemento: "Sistema",
  agregado: "",
  estado_comparativo: "nuevo",
  descripcion: "",
  x,
  y,
  width: 220,
  height: 104,
  ...extra,
} as DesignerNode);

/** Contenedor (C4: Límite de Sistema). */
const banda = (
  nombre: string,
  x: number,
  y: number,
  width: number,
  height: number
): DesignerNode =>
  ({
    id: `agg-${nombre}`,
    nombre,
    tipo_elemento: "Límite de Sistema",
    agregado: nombre,
    estado_comparativo: "nuevo",
    descripcion: "",
    x,
    y,
    width,
    height,
  } as DesignerNode);

const mapa = (...ns: DesignerNode[]) => new Map(ns.map((n) => [n.id, n]));

describe("overlapArea", () => {
  it("es 0 cuando no se tocan, y el área común cuando sí", () => {
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    // Bordes que se besan no son solape.
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
  });
});

describe("containerOf · la geometría manda", () => {
  it("adopta al nodo que está dentro de la banda", () => {
    const b = banda("Middleware BUPA", 60, 832, 1273, 500);
    const n = nodo("bff", 132, 898);
    expect(containerOf(n, mapa(b, n).values(), "c4")?.nombre).toBe("Middleware BUPA");
  });

  it("NO adopta por la esquina: un nodo casi todo afuera queda fuera", () => {
    // La esquina superior izquierda cae dentro (la regla vieja lo adoptaba),
    // pero sólo un 10 % de la caja está cubierta.
    const b = banda("Banda", 0, 0, 500, 122);
    const n = nodo("apenas", 480, 100);
    expect(containerOf(n, mapa(b, n).values(), "c4")).toBeNull();
  });

  it("NO deja fuera un nodo cuya esquina se sale pero está mayormente dentro", () => {
    const b = banda("Banda", 100, 100, 600, 400);
    const n = nodo("colgado", 60, 150); // 40 px afuera de 220 de ancho
    expect(containerOf(n, mapa(b, n).values(), "c4")?.nombre).toBe("Banda");
  });

  it("un contenedor sin ancho/alto declarados no se traga todo el lienzo", () => {
    const sinCaja = { ...banda("Fantasma", 0, 0, 0, 0), width: undefined, height: undefined } as DesignerNode;
    const n = nodo("suelto", 5000, 5000);
    expect(containerOf(n, mapa(sinCaja, n).values(), "c4")).toBeNull();
  });

  it("con cajas anidadas gana la más chica (el padre es el fondo)", () => {
    const padre = banda("Padre", 0, 0, 2000, 2000);
    const hijo = banda("Hijo", 100, 100, 400, 300);
    const n = nodo("dentro", 150, 150);
    expect(containerOf(n, mapa(padre, hijo, n).values(), "c4")?.nombre).toBe("Hijo");
  });

  it("entre dos bandas que se solapan gana la que cubre más del nodo", () => {
    const arriba = banda("Arriba", 0, 0, 1000, 250);
    const abajo = banda("Abajo", 0, 200, 1000, 250);
    const n = nodo("bajo", 100, 230); // 20 px en Arriba, 84 en Abajo
    expect(containerOf(n, mapa(arriba, abajo, n).values(), "c4")?.nombre).toBe("Abajo");
  });

  it("un contenedor no se mete dentro de otro (no se anidan en el modelo)", () => {
    const padre = banda("Padre", 0, 0, 2000, 2000);
    const hijo = banda("Hijo", 100, 100, 400, 300);
    expect(containerOf(hijo, mapa(padre, hijo).values(), "c4")).toBeNull();
  });

  it(`el umbral es ${MIN_COBERTURA * 100} % de la caja del nodo`, () => {
    const b = banda("Banda", 0, 0, 1000, 52); // media altura del nodo
    const justo = nodo("mitad", 0, 0); // 52 de 104 = 50 %
    expect(containerOf(justo, mapa(b, justo).values(), "c4")?.nombre).toBe("Banda");
    const menos = nodo("menos", 0, 1); // 51 de 104 < 50 %
    expect(containerOf(menos, mapa(b, menos).values(), "c4")).toBeNull();
  });
});

describe("reassignContainers · lo que se ve es lo que se lista", () => {
  it("asigna TODOS los nodos, no sólo el que se movió (issue del árbol incoherente)", () => {
    const b = banda("Middleware BUPA", 60, 832, 1273, 500);
    const dentro = [
      nodo("bff", 132, 898),
      nodo("evicertia", 1043, 1109),
      nodo("ekit", 1012, 968),
      nodo("proxy-nova", 455, 1151),
      nodo("quote", 133, 1152),
      nodo("payment", 748, 1136),
    ];
    const fuera = nodo("persona", 172, 79);
    const { nodes, cambios } = reassignContainers(mapa(b, ...dentro, fuera), "c4");
    expect(cambios).toBe(6);
    for (const n of dentro) expect(nodes.get(n.id)!.agregado).toBe("Middleware BUPA");
    expect(nodes.get("persona")!.agregado).toBe("");
  });

  it("suelta al nodo que quedó fuera de su contenedor", () => {
    const b = banda("Banda", 0, 0, 300, 300);
    const salido = nodo("salido", 900, 900, { agregado: "Banda" });
    const { nodes, cambios } = reassignContainers(mapa(b, salido), "c4");
    expect(cambios).toBe(1);
    expect(nodes.get("salido")!.agregado).toBe("");
  });

  it("el contenedor conserva su propio nombre y es idempotente", () => {
    const b = banda("Banda", 0, 0, 600, 400);
    const n = nodo("dentro", 50, 50);
    const uno = reassignContainers(mapa(b, n), "c4");
    expect(uno.nodes.get(b.id)!.agregado).toBe("Banda");
    const dos = reassignContainers(uno.nodes, "c4");
    expect(dos.cambios).toBe(0);
    // Sin cambios devuelve el MISMO mapa: quien llama puede evitar el re-render.
    expect(dos.nodes).toBe(uno.nodes);
  });
});
