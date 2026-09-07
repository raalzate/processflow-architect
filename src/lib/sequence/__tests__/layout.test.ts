import { describe, expect, it } from "vitest";
import {
  SECUENCIA_LAYOUT,
  alturaDeMensaje,
  altoNecesario,
  columnaDeParticipante,
  ordenarParticipantes,
} from "@/lib/sequence/layout";

describe("la altura sale del ORDEN, no del arrastre (T2 · #265)", () => {
  it("dos mensajes consecutivos no comparten altura", () => {
    expect(alturaDeMensaje(1)).not.toBe(alturaDeMensaje(2));
  });

  it("el orden mayor va MÁS ABAJO: el tiempo baja", () => {
    expect(alturaDeMensaje(2)).toBeGreaterThan(alturaDeMensaje(1));
    expect(alturaDeMensaje(9)).toBeGreaterThan(alturaDeMensaje(8));
  });

  it("el paso entre mensajes es constante: la separación no depende de dónde estés", () => {
    const paso = alturaDeMensaje(2) - alturaDeMensaje(1);
    expect(alturaDeMensaje(5) - alturaDeMensaje(4)).toBe(paso);
    expect(paso).toBe(SECUENCIA_LAYOUT.pasoMensaje);
  });

  it("el primer mensaje nace POR DEBAJO de la cabecera del participante", () => {
    // Un mensaje sobre la cabecera taparía el nombre.
    expect(alturaDeMensaje(1)).toBeGreaterThan(SECUENCIA_LAYOUT.altoCabecera);
  });

  it("misma entrada, misma altura: es una función, no un estado", () => {
    expect(alturaDeMensaje(3)).toBe(alturaDeMensaje(3));
  });

  it("un orden roto cae al primero en vez de mandar el mensaje al infinito", () => {
    // SC-008: ninguna altura puede sacar la caja del lienzo.
    for (const roto of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(alturaDeMensaje(roto)).toBe(alturaDeMensaje(1));
    }
  });

  it("el alto del diagrama crece con la cantidad de mensajes", () => {
    expect(altoNecesario(5)).toBeGreaterThan(altoNecesario(2));
    // Y siempre deja aire por debajo del último, o el pie queda pegado.
    expect(altoNecesario(3)).toBeGreaterThan(alturaDeMensaje(3));
  });

  it("sin mensajes el diagrama igual tiene alto: el participante se ve", () => {
    expect(altoNecesario(0)).toBeGreaterThan(SECUENCIA_LAYOUT.altoCabecera);
  });
});

describe("los participantes van en fila (T12 apoya acá)", () => {
  it("cada participante ocupa su columna, de izquierda a derecha", () => {
    expect(columnaDeParticipante(1)).toBeGreaterThan(columnaDeParticipante(0));
  });

  it("el paso entre participantes es constante", () => {
    const paso = columnaDeParticipante(1) - columnaDeParticipante(0);
    expect(columnaDeParticipante(4) - columnaDeParticipante(3)).toBe(paso);
  });

  it("un índice roto cae al primero, no a una coordenada absurda", () => {
    for (const roto of [-2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(columnaDeParticipante(roto)).toBe(columnaDeParticipante(0));
    }
  });
});

describe("preset de secuencia (T12 · #275)", () => {
  it("los participantes quedan en fila, sin cruzarse", () => {
    const out = ordenarParticipantes(["a", "b", "c"], 4);
    expect(out.map((p) => p.x)).toEqual([
      columnaDeParticipante(0),
      columnaDeParticipante(1),
      columnaDeParticipante(2),
    ]);
  });

  it("todos arrancan a la MISMA altura: el tiempo es uno solo", () => {
    // A distinta altura parecería que empiezan en momentos distintos.
    const out = ordenarParticipantes(["a", "b"], 3);
    expect(new Set(out.map((p) => p.y)).size).toBe(1);
  });

  it("el alto lo decide la cantidad de mensajes, y es el mismo para todos", () => {
    const pocos = ordenarParticipantes(["a", "b"], 2);
    const muchos = ordenarParticipantes(["a", "b"], 9);
    expect(muchos[0].height).toBeGreaterThan(pocos[0].height);
    expect(new Set(muchos.map((p) => p.height)).size).toBe(1);
  });

  it("el preset y el lienzo NO pueden discrepar: comparten la misma función", () => {
    // Con dos cálculos distintos, el desacuerdo no lo vería nadie.
    const out = ordenarParticipantes(["a"], 5);
    expect(out[0].height).toBe(altoNecesario(5));
  });

  it("sin participantes devuelve una lista vacía, no explota", () => {
    expect(ordenarParticipantes([], 3)).toEqual([]);
  });
});
