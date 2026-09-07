import { describe, expect, it } from "vitest";
import {
  moverMensaje,
  normalizarOrden,
  ordenSiguiente,
  quitarMensajes,
  type MensajeOrdenable,
} from "@/lib/sequence/order";

/** Un mensaje sólo necesita id y su lugar; el resto de la arista no importa acá. */
const m = (id: string, orden?: number): MensajeOrdenable =>
  orden === undefined ? { id } : { id, orden };

const ordenes = (ms: MensajeOrdenable[]) => ms.map((x) => `${x.id}:${x.orden}`);
const ids = (ms: MensajeOrdenable[]) => ms.map((x) => x.id);

describe("normalizar el orden (T1 · #264)", () => {
  it("deja el orden denso desde 1, sin huecos", () => {
    // Un hueco obliga a todo lector a preguntarse si significa algo.
    expect(ordenes(normalizarOrden([m("a", 5), m("b", 9), m("c", 20)]))).toEqual([
      "a:1",
      "b:2",
      "c:3",
    ]);
  });

  it("ordena por el número, no por la posición en el array", () => {
    expect(ids(normalizarOrden([m("c", 3), m("a", 1), m("b", 2)]))).toEqual(["a", "b", "c"]);
  });

  it("los mensajes SIN orden van al final, conservando su orden de llegada", () => {
    // Es el caso de una arista recién creada: todavía no tiene lugar.
    const out = normalizarOrden([m("x"), m("a", 1), m("y")]);
    expect(ids(out)).toEqual(["a", "x", "y"]);
    expect(ordenes(out)).toEqual(["a:1", "x:2", "y:3"]);
  });

  it("un duplicado se resuelve de forma DETERMINISTA, no al azar", () => {
    // Dos mensajes con el mismo número no pueden dejar el lienzo sin dibujar
    // (SC-008). Desempata la posición en el array, que es estable.
    const entrada = [m("a", 2), m("b", 2), m("c", 1)];
    const primera = ids(normalizarOrden(entrada));
    const segunda = ids(normalizarOrden(entrada));
    expect(primera).toEqual(["c", "a", "b"]);
    expect(primera).toEqual(segunda);
  });

  it("números rotos —negativos, cero, no finitos— no vacían la vista", () => {
    // SC-008: normalizar al leer, nunca confiar en lo guardado.
    const out = normalizarOrden([
      m("a", -3),
      m("b", 0),
      m("c", Number.NaN),
      m("d", Number.POSITIVE_INFINITY),
      m("e", 1.5),
    ]);
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.orden)).toEqual([1, 2, 3, 4, 5]);
  });

  it("una lista vacía sigue vacía, sin explotar", () => {
    expect(normalizarOrden([])).toEqual([]);
  });

  it("no muta la lista que recibe", () => {
    const entrada = [m("a", 7)];
    normalizarOrden(entrada);
    expect(entrada[0].orden).toBe(7);
  });
});

describe("mover un mensaje", () => {
  const tres = [m("a", 1), m("b", 2), m("c", 3)];

  it("mover al frente empuja al resto SIN alterar su orden entre sí (H1.2)", () => {
    const out = moverMensaje(tres, "c", 1);
    expect(ids(out)).toEqual(["c", "a", "b"]);
    expect(out.map((x) => x.orden)).toEqual([1, 2, 3]);
  });

  it("mover al final deja al resto corrido hacia arriba", () => {
    expect(ids(moverMensaje(tres, "a", 3))).toEqual(["b", "c", "a"]);
  });

  it("mover al mismo lugar no cambia nada", () => {
    expect(ids(moverMensaje(tres, "b", 2))).toEqual(["a", "b", "c"]);
  });

  it("un destino fuera de rango se recorta en vez de romper", () => {
    expect(ids(moverMensaje(tres, "a", 99))).toEqual(["b", "c", "a"]);
    expect(ids(moverMensaje(tres, "c", -5))).toEqual(["c", "a", "b"]);
  });

  it("un id que no existe deja la lista igual", () => {
    expect(ids(moverMensaje(tres, "zz", 1))).toEqual(["a", "b", "c"]);
  });
});

describe("quitar mensajes (FR-017)", () => {
  it("borrar del medio deja el orden denso, sin saltos", () => {
    // Es lo que pasa al eliminar un participante: se van sus mensajes.
    const out = quitarMensajes([m("a", 1), m("b", 2), m("c", 3), m("d", 4)], ["b", "c"]);
    expect(ordenes(out)).toEqual(["a:1", "d:2"]);
  });

  it("quitar todo deja una lista vacía, no una con huecos", () => {
    expect(quitarMensajes([m("a", 1), m("b", 2)], ["a", "b"])).toEqual([]);
  });

  it("quitar algo que no está no altera el orden", () => {
    expect(ordenes(quitarMensajes([m("a", 1), m("b", 2)], ["zz"]))).toEqual(["a:1", "b:2"]);
  });
});

describe("el lugar de un mensaje nuevo", () => {
  it("un mensaje nuevo va al final", () => {
    expect(ordenSiguiente([m("a", 1), m("b", 2)])).toBe(3);
  });

  it("el primer mensaje de un diagrama vacío es el 1", () => {
    // Arrancar en 0 haría que «el primero» no coincida con lo que se lee.
    expect(ordenSiguiente([])).toBe(1);
  });

  it("con la lista sucia igual da el siguiente correcto", () => {
    expect(ordenSiguiente([m("a", 9), m("b")])).toBe(3);
  });
});
