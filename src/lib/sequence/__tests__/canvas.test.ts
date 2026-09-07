import { describe, expect, it } from "vitest";
import {
  esMensajeDeSecuencia,
  mensajesDe,
  ordenParaNuevo,
  renumerar,
  type EnlaceDeLienzo,
} from "@/lib/sequence/canvas";

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
