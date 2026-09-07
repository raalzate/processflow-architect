import { describe, expect, it } from "vitest";
import { migrarMensajes, necesitaMigracion, type MensajeGuardado } from "@/lib/sequence/migrate";

const ids = (ms: { id: string }[]) => ms.map((m) => m.id);

describe("diagramas guardados antes del orden (T3 · #266)", () => {
  it("el orden sale de la `y`, de arriba abajo (H2.3)", () => {
    // Es el criterio con el que el usuario venía colocando los mensajes.
    const viejos: MensajeGuardado[] = [
      { id: "abajo", y: 400 },
      { id: "arriba", y: 100 },
      { id: "medio", y: 250 },
    ];
    const out = migrarMensajes(viejos);
    expect(ids(out)).toEqual(["arriba", "medio", "abajo"]);
    expect(out.map((m) => m.orden)).toEqual([1, 2, 3]);
  });

  it("no pierde ningún mensaje: el 100 % abre (SC-004)", () => {
    const viejos: MensajeGuardado[] = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      y: (12 - i) * 30,
    }));
    expect(migrarMensajes(viejos)).toHaveLength(12);
  });

  it("un punteado se lee como RETORNO: era la convención documentada", () => {
    const out = migrarMensajes([
      { id: "pide", y: 100 },
      { id: "devuelve", y: 200, dashed: true },
    ]);
    expect(out.find((m) => m.id === "pide")!.messageKind).toBe("sync");
    expect(out.find((m) => m.id === "devuelve")!.messageKind).toBe("return");
  });

  it("el tipo ya declarado MANDA sobre el punteado", () => {
    // Un diagrama nuevo puede tener un `create`, que también es punteado.
    const out = migrarMensajes([{ id: "a", y: 1, dashed: true, messageKind: "create" }]);
    expect(out[0].messageKind).toBe("create");
  });

  it("si YA hay orden guardado, la `y` no lo reescribe", () => {
    // Reordenar el diagrama de alguien al abrirlo sería peor que no migrar.
    const out = migrarMensajes([
      { id: "a", orden: 1, y: 900 },
      { id: "b", orden: 2, y: 10 },
    ]);
    expect(ids(out)).toEqual(["a", "b"]);
  });

  it("mensajes sin `y` van al final, en el orden en que estaban", () => {
    const out = migrarMensajes([{ id: "sinY" }, { id: "conY", y: 50 }, { id: "otroSinY" }]);
    expect(ids(out)).toEqual(["conY", "sinY", "otroSinY"]);
  });

  it("una `y` rota no manda el mensaje al principio ni rompe", () => {
    const out = migrarMensajes([
      { id: "roto", y: Number.NaN },
      { id: "sano", y: 10 },
    ]);
    expect(ids(out)).toEqual(["sano", "roto"]);
  });

  it("un diagrama vacío migra a vacío", () => {
    expect(migrarMensajes([])).toEqual([]);
  });

  it("sabe cuándo NO hay nada que migrar", () => {
    expect(necesitaMigracion([{ id: "a", orden: 1, messageKind: "sync" }])).toBe(false);
    expect(necesitaMigracion([{ id: "a", y: 10 }])).toBe(true);
    expect(necesitaMigracion([{ id: "a", orden: 1 }])).toBe(true);
  });

  it("migrar dos veces da lo mismo que migrar una", () => {
    // Se corre al ABRIR, así que se va a correr muchas veces sobre lo mismo.
    const una = migrarMensajes([{ id: "b", y: 200, dashed: true }, { id: "a", y: 100 }]);
    const dos = migrarMensajes(una);
    expect(dos).toEqual(una);
  });
});
