import { describe, expect, it } from "vitest";
import {
  SECUENCIA_LAYOUT,
  alturaDeMensaje,
  altoNecesario,
  columnaDeParticipante,
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
