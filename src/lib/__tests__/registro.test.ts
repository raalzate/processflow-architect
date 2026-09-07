import { describe, expect, it } from "vitest";
import { clavesDe, deRegistro, enRegistro } from "../registro";

const REGISTRO = { alfa: 1, beta: 2 } as const;

/** Las claves que `in` regala y que ningún registro declaró. */
const DEL_PROTOTIPO = ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"];

describe("enRegistro", () => {
  it("acepta una clave propia", () => {
    expect(enRegistro(REGISTRO, "alfa")).toBe(true);
  });

  it("rechaza una clave que no está", () => {
    expect(enRegistro(REGISTRO, "gamma")).toBe(false);
  });

  it("rechaza las claves del prototipo (el bug de #282)", () => {
    for (const clave of DEL_PROTOTIPO) {
      expect(enRegistro(REGISTRO, clave), clave).toBe(false);
      // Y la comprobación ingenua es la que fallaba: se deja como contraste.
      if (clave !== "__proto__") expect(clave in REGISTRO).toBe(true);
    }
  });

  it("rechaza lo que no es texto sin explotar", () => {
    for (const valor of [undefined, null, 3, {}, [], Symbol("x")]) {
      expect(enRegistro(REGISTRO, valor)).toBe(false);
    }
  });
});

describe("deRegistro", () => {
  it("devuelve el valor de una clave propia", () => {
    expect(deRegistro(REGISTRO, "beta")).toBe(2);
  });

  it("devuelve undefined —no una función del prototipo— para «toString»", () => {
    expect(deRegistro(REGISTRO, "toString")).toBeUndefined();
  });

  it("devuelve undefined para una clave ausente o mal tipada", () => {
    expect(deRegistro(REGISTRO, "gamma")).toBeUndefined();
    expect(deRegistro(REGISTRO, 7)).toBeUndefined();
  });

  it("distingue un valor `undefined` guardado a propósito de una clave ausente", () => {
    const conHueco: Record<string, number | undefined> = { hueco: undefined };
    expect(enRegistro(conHueco, "hueco")).toBe(true);
    expect(deRegistro(conHueco, "hueco")).toBeUndefined();
  });
});

describe("clavesDe", () => {
  it("devuelve sólo las claves propias", () => {
    expect(clavesDe(REGISTRO)).toEqual(["alfa", "beta"]);
  });
});
