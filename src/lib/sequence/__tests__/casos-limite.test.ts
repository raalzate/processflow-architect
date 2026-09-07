/**
 * Casos límite de la secuencia (T13 · #276).
 *
 * Un caso límite escrito en el spec y sin prueba es una intención. Éstos son
 * los del spec de #263, más los que salieron de los riesgos del plan. El hilo
 * que los une es SC-008: nada de lo que aquí se prueba puede dejar el lienzo
 * sin dibujar.
 */
import { describe, expect, it } from "vitest";
import { moverMensaje, normalizarOrden, quitarMensajes } from "@/lib/sequence/order";
import { activacionesDe } from "@/lib/sequence/activations";
import { normalizarOperandos, contieneOrden } from "@/lib/sequence/fragments";
import { migrarMensajes } from "@/lib/sequence/migrate";
import { alturaDeMensaje } from "@/lib/sequence/layout";

describe("auto-llamada: un participante se habla a sí mismo", () => {
  it("ocupa su lugar en el orden como cualquier otro mensaje", () => {
    const out = normalizarOrden([
      { id: "auto", orden: 1 },
      { id: "otro", orden: 2 },
    ]);
    expect(out.map((m) => m.orden)).toEqual([1, 2]);
  });

  it("abre y cierra su propia activación", () => {
    const out = activacionesDe([
      { id: "m1", orden: 1, fuente: "a", destino: "a", messageKind: "sync" },
      { id: "m2", orden: 2, fuente: "a", destino: "a", messageKind: "return" },
    ]);
    expect(out).toEqual([{ participante: "a", desde: 1, hasta: 2 }]);
  });
});

describe("borrar un participante (FR-017)", () => {
  it("se van sus mensajes y el orden queda denso, sin huecos", () => {
    // Un hueco parece que significa algo.
    const todos = [
      { id: "a1", orden: 1 },
      { id: "b1", orden: 2 },
      { id: "a2", orden: 3 },
      { id: "b2", orden: 4 },
    ];
    const out = quitarMensajes(todos, ["b1", "b2"]);
    expect(out.map((m) => m.orden)).toEqual([1, 2]);
  });

  it("borrar TODOS deja vacío, no una lista con huecos", () => {
    expect(quitarMensajes([{ id: "a", orden: 1 }], ["a"])).toEqual([]);
  });

  it("las activaciones del que se fue desaparecen con él", () => {
    const quedan = quitarMensajes(
      [
        { id: "m1", orden: 1 },
        { id: "m2", orden: 2 },
      ],
      ["m1", "m2"]
    );
    expect(activacionesDe(quedan.map((m) => ({ ...m, fuente: "x", destino: "y" })))).toEqual([]);
  });
});

describe("fragmentos en los bordes", () => {
  it("un fragmento vacío no rompe ni desaparece en silencio", () => {
    expect(normalizarOperandos([], "loop", 5)).toEqual([]);
    expect(contieneOrden([], 1)).toBe(false);
  });

  it("un fragmento de UN solo mensaje es válido", () => {
    const out = normalizarOperandos([{ guarda: "x", desde: 2, hasta: 2 }], "opt", 5);
    expect(out).toHaveLength(1);
    expect(contieneOrden(out, 2)).toBe(true);
  });

  it("un rango imposible se normaliza en vez de vaciar la vista (SC-008)", () => {
    const out = normalizarOperandos([{ guarda: "x", desde: 9, hasta: 1 }], "loop", 4);
    expect(out[0].desde).toBeLessThanOrEqual(out[0].hasta);
  });
});

describe("orden corrupto: nunca deja el lienzo en blanco (SC-008)", () => {
  it("duplicados, huecos, negativos y NaN a la vez", () => {
    const roto = [
      { id: "a", orden: 3 },
      { id: "b", orden: 3 },
      { id: "c", orden: -1 },
      { id: "d", orden: Number.NaN },
      { id: "e" },
      { id: "f", orden: 900 },
    ];
    const out = normalizarOrden(roto);
    expect(out).toHaveLength(6);
    expect(out.map((m) => m.orden)).toEqual([1, 2, 3, 4, 5, 6]);
    // Y cada uno cae a una altura dibujable.
    for (const m of out) expect(Number.isFinite(alturaDeMensaje(m.orden))).toBe(true);
  });

  it("mover dentro de una lista corrupta sigue dando un orden denso", () => {
    const out = moverMensaje(
      [
        { id: "a", orden: 5 },
        { id: "b" },
        { id: "c", orden: 5 },
      ],
      "c",
      1
    );
    expect(out.map((m) => m.orden)).toEqual([1, 2, 3]);
    expect(out[0].id).toBe("c");
  });

  it("un diagrama viejo con todo roto igual abre", () => {
    // SC-004: el 100 % de los guardados antes de la feature se abren.
    const out = migrarMensajes([
      { id: "a", y: Number.NaN, dashed: true },
      { id: "b" },
      { id: "c", y: 10 },
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.orden)).toEqual([1, 2, 3]);
  });
});
