import { describe, expect, it } from "vitest";
import { activacionesDe, type MensajeParaActivar } from "@/lib/sequence/activations";
import type { SequenceMessageKind } from "@/lib/sequence/messages";

const msg = (
  orden: number,
  fuente: string,
  destino: string,
  messageKind?: SequenceMessageKind
): MensajeParaActivar => ({ id: `m${orden}`, orden, fuente, destino, messageKind });

describe("activaciones derivadas (T9 · #272)", () => {
  it("un pedido con su retorno produce UNA activación en quien atiende (H4.1)", () => {
    const out = activacionesDe([msg(1, "a", "b", "sync"), msg(2, "b", "a", "return")]);
    expect(out).toEqual([{ participante: "b", desde: 1, hasta: 2 }]);
  });

  it("no se persisten: la misma entrada da siempre lo mismo", () => {
    const ms = [msg(1, "a", "b", "sync"), msg(2, "b", "a", "return")];
    expect(activacionesDe(ms)).toEqual(activacionesDe(ms));
  });

  it("reordenar recalcula sin intervención (H4.2)", () => {
    // Los mismos mensajes en otro orden dan otras activaciones: es el punto.
    const antes = activacionesDe([msg(1, "a", "b", "sync"), msg(4, "b", "a", "return")]);
    const despues = activacionesDe([msg(1, "a", "b", "sync"), msg(2, "b", "a", "return")]);
    expect(antes[0].hasta).toBe(4);
    expect(despues[0].hasta).toBe(2);
  });

  it("llamadas ANIDADAS: el retorno cierra la suya, no la de más afuera", () => {
    // a→b, b→c, c devuelve, b devuelve. Sin pila, el primer retorno cerraba
    // la activación equivocada.
    const out = activacionesDe([
      msg(1, "a", "b", "sync"),
      msg(2, "b", "c", "sync"),
      msg(3, "c", "b", "return"),
      msg(4, "b", "a", "return"),
    ]);
    expect(out).toEqual([
      { participante: "b", desde: 1, hasta: 4 },
      { participante: "c", desde: 2, hasta: 3 },
    ]);
  });

  it("una llamada asíncrona NO abre activación", () => {
    // Quien la manda no espera: no hay tramo de atención que dibujar.
    expect(activacionesDe([msg(1, "a", "b", "async")])).toEqual([]);
  });

  it("un mensaje sin tipo se trata como llamada, que es la caída", () => {
    expect(activacionesDe([msg(1, "a", "b")])).toHaveLength(1);
  });

  it("un retorno huérfano NO inventa una activación", () => {
    // Dibujar una barra de la nada haría creer que el modelo dice algo que no.
    expect(activacionesDe([msg(1, "b", "a", "return")])).toEqual([]);
  });

  it("una activación sin cerrar llega hasta el último mensaje", () => {
    // El participante quedó atendiendo: es lo que el diagrama dice.
    const out = activacionesDe([msg(1, "a", "b", "sync"), msg(2, "a", "c", "sync")]);
    expect(out.find((x) => x.participante === "b")).toEqual({
      participante: "b",
      desde: 1,
      hasta: 2,
    });
  });

  it("una auto-llamada activa al propio participante", () => {
    const out = activacionesDe([msg(1, "a", "a", "sync"), msg(2, "a", "a", "return")]);
    expect(out).toEqual([{ participante: "a", desde: 1, hasta: 2 }]);
  });

  it("sin mensajes no hay activaciones", () => {
    expect(activacionesDe([])).toEqual([]);
  });

  it("los mensajes desordenados se resuelven igual: manda el orden, no el array", () => {
    const out = activacionesDe([msg(2, "b", "a", "return"), msg(1, "a", "b", "sync")]);
    expect(out).toEqual([{ participante: "b", desde: 1, hasta: 2 }]);
  });
});
