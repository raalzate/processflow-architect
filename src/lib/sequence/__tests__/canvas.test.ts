import { describe, expect, it } from "vitest";
import {
  esMensajeDeSecuencia,
  mensajesDe,
  ordenParaNuevo,
  renumerar,
  ordenParaAltura,
  reordenarPorArrastre,
  type EnlaceDeLienzo,
} from "@/lib/sequence/canvas";
import { alturaDeMensaje } from "@/lib/sequence/layout";

// «a» y «b» son líneas de vida; «x» no lo es.
const esLineaDeVida = (id: string) => id === "a" || id === "b";
const e = (id: string, sourceId: string, targetId: string, orden?: number): EnlaceDeLienzo =>
  orden === undefined ? { id, sourceId, targetId } : { id, sourceId, targetId, orden };

describe("qué enlace es un mensaje (T4 · #267)", () => {
  it("lo es cuando une dos líneas de vida", () => {
    expect(esMensajeDeSecuencia(e("1", "a", "b"), esLineaDeVida)).toBe(true);
  });

  it("NO lo es si una punta no es línea de vida", () => {
    // En UML conviven clases, estados y secuencia: no alcanza con «la vista es
    // UML», hay que mirar los extremos.
    expect(esMensajeDeSecuencia(e("1", "a", "x"), esLineaDeVida)).toBe(false);
    expect(esMensajeDeSecuencia(e("1", "x", "x"), esLineaDeVida)).toBe(false);
  });

  it("una auto-llamada sí lo es", () => {
    expect(esMensajeDeSecuencia(e("1", "a", "a"), esLineaDeVida)).toBe(true);
  });
});

describe("el orden de un mensaje recién creado", () => {
  it("el primero es 1, y cada nuevo va al final", () => {
    // Éste es el agujero que dejaba la feature inerte: sin esto el enlace nacía
    // sin orden y el tiempo no existía.
    expect(ordenParaNuevo(e("n", "a", "b"), [], esLineaDeVida)).toBe(1);
    expect(ordenParaNuevo(e("n", "a", "b"), [e("1", "a", "b", 1)], esLineaDeVida)).toBe(2);
  });

  it("un enlace que NO es mensaje no recibe orden", () => {
    // En las demás notaciones el campo no significa nada; escribirlo igual
    // ensuciaría todos los diagramas del repo con un dato muerto.
    expect(ordenParaNuevo(e("n", "a", "x"), [], esLineaDeVida)).toBeUndefined();
  });

  it("los enlaces que no son mensajes no ocupan lugar en la secuencia", () => {
    const existentes = [e("1", "a", "b", 1), e("2", "a", "x"), e("3", "x", "x")];
    expect(ordenParaNuevo(e("n", "a", "b"), existentes, esLineaDeVida)).toBe(2);
  });

  it("con órdenes corruptos igual da el siguiente correcto", () => {
    const existentes = [e("1", "a", "b", 7), e("2", "a", "b")];
    expect(ordenParaNuevo(e("n", "a", "b"), existentes, esLineaDeVida)).toBe(3);
  });
});

describe("renumerar después de borrar (FR-017)", () => {
  it("devuelve SÓLO los que cambian", () => {
    // Un parche mínimo evita marcar como modificado medio diagrama.
    const quedan = [e("1", "a", "b", 1), e("3", "a", "b", 3)];
    expect(renumerar(quedan, esLineaDeVida)).toEqual([{ id: "3", orden: 2 }]);
  });

  it("si no cambia nada, no devuelve nada", () => {
    const quedan = [e("1", "a", "b", 1), e("2", "a", "b", 2)];
    expect(renumerar(quedan, esLineaDeVida)).toEqual([]);
  });

  it("no toca los enlaces que no son mensajes", () => {
    const quedan = [e("1", "a", "b", 5), e("2", "a", "x", 9)];
    expect(renumerar(quedan, esLineaDeVida)).toEqual([{ id: "1", orden: 1 }]);
  });

  it("sin mensajes no hay nada que renumerar", () => {
    expect(renumerar([e("1", "x", "x")], esLineaDeVida)).toEqual([]);
  });
});

describe("listar los mensajes", () => {
  it("los devuelve en orden y densos, ignorando lo que no es mensaje", () => {
    const todos = [e("3", "a", "b", 9), e("x", "a", "x"), e("1", "a", "b", 2)];
    expect(mensajesDe(todos, esLineaDeVida).map((m) => [m.id, m.orden])).toEqual([
      ["1", 1],
      ["3", 2],
    ]);
  });
});

describe("arrastrar un mensaje lo REORDENA (T18 · #287)", () => {
  const tres = [e("1", "a", "b", 1), e("2", "a", "b", 2), e("3", "a", "b", 3)];

  it("la altura soltada se traduce al lugar más cercano", () => {
    expect(ordenParaAltura(alturaDeMensaje(1), 3)).toBe(1);
    expect(ordenParaAltura(alturaDeMensaje(2), 3)).toBe(2);
    // A mitad de camino entre dos: cae al más cercano, no a un intermedio.
    expect(ordenParaAltura(alturaDeMensaje(2) + 5, 3)).toBe(2);
  });

  it("soltar por ENCIMA del primero manda al primer lugar", () => {
    // Recortar es mejor que rechazar: el gesto ya expresó la intención.
    expect(ordenParaAltura(alturaDeMensaje(1) - 500, 3)).toBe(1);
  });

  it("soltar por DEBAJO del último manda al último", () => {
    expect(ordenParaAltura(alturaDeMensaje(3) + 500, 3)).toBe(3);
  });

  it("una altura rota no manda el mensaje a ninguna parte absurda", () => {
    expect(ordenParaAltura(Number.NaN, 3)).toBe(1);
    expect(ordenParaAltura(Number.POSITIVE_INFINITY, 3)).toBe(1);
  });

  it("arrastrar el tercero arriba del primero lo pone primero", () => {
    // El gesto que el usuario intentó y no existía.
    const cambios = reordenarPorArrastre(tres, "3", alturaDeMensaje(1), esLineaDeVida);
    const nuevo = new Map(cambios.map((c) => [c.id, c.orden]));
    expect(nuevo.get("3")).toBe(1);
    expect(nuevo.get("1")).toBe(2);
    expect(nuevo.get("2")).toBe(3);
  });

  it("el resto conserva su orden ENTRE SÍ", () => {
    const cambios = reordenarPorArrastre(tres, "1", alturaDeMensaje(3), esLineaDeVida);
    const nuevo = new Map(cambios.map((c) => [c.id, c.orden]));
    expect(nuevo.get("2")!).toBeLessThan(nuevo.get("3") ?? 99);
  });

  it("soltarlo donde ya estaba no cambia nada", () => {
    expect(reordenarPorArrastre(tres, "2", alturaDeMensaje(2), esLineaDeVida)).toEqual([]);
  });

  it("arrastrar algo que no es un mensaje no toca la secuencia", () => {
    expect(reordenarPorArrastre(tres, "zz", alturaDeMensaje(1), esLineaDeVida)).toEqual([]);
  });

  it("nunca deja dos mensajes en el mismo lugar", () => {
    const cambios = reordenarPorArrastre(tres, "3", alturaDeMensaje(1), esLineaDeVida);
    const ordenes = cambios.map((c) => c.orden);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });
});
