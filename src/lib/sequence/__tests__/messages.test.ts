import { describe, expect, it } from "vitest";
import {
  SEQUENCE_MESSAGES,
  SEQUENCE_MESSAGE_DEFAULT,
  SEQUENCE_MESSAGE_KINDS,
  esTipoDeMensaje,
  estiloDeMensaje,
} from "@/lib/sequence/messages";
import { EDGE_RELATIONS } from "@/lib/edge-relations";

describe("tipos de mensaje (T5 · #268)", () => {
  it("cubre los cinco tipos que pide el spec", () => {
    expect([...SEQUENCE_MESSAGE_KINDS].sort()).toEqual(
      ["async", "create", "destroy", "return", "sync"].sort()
    );
  });

  it("NO hay dos tipos con la misma combinación de punta y trazo (FR-006)", () => {
    // Es el criterio de «distinguible a simple vista»: si dos coinciden, hay que
    // abrir la ficha para saber cuál es cuál, y entonces el dibujo no informa.
    const firmas = SEQUENCE_MESSAGE_KINDS.map((k) => {
      const s = SEQUENCE_MESSAGES[k];
      return `${s.end}|${s.dashed}`;
    });
    expect(new Set(firmas).size).toBe(firmas.length);
  });

  it("el retorno es punteado, como manda UML (H2.2)", () => {
    expect(SEQUENCE_MESSAGES.return.dashed).toBe(true);
    expect(SEQUENCE_MESSAGES.sync.dashed).toBe(false);
  });

  it("la llamada que espera y la que no espera se distinguen por la punta", () => {
    expect(SEQUENCE_MESSAGES.sync.end).not.toBe(SEQUENCE_MESSAGES.async.end);
  });

  it("todos declaran etiqueta y ayuda: el selector no puede tener opciones mudas", () => {
    for (const k of SEQUENCE_MESSAGE_KINDS) {
      expect(SEQUENCE_MESSAGES[k].label.length).toBeGreaterThan(0);
      expect(SEQUENCE_MESSAGES[k].hint.length).toBeGreaterThan(0);
    }
  });

  it("no se mete en el registro de relaciones de clases", () => {
    // Mezclarlos dejaría al usuario eligiendo «composición» para un mensaje.
    for (const k of SEQUENCE_MESSAGE_KINDS) {
      expect(k in EDGE_RELATIONS).toBe(false);
    }
  });

  it("un tipo válido devuelve SU estilo, no el de por defecto", () => {
    // El camino feliz: sin esto sólo estaba probada la caída, y la caída podría
    // estar tapando que la tabla nunca se consulta.
    for (const k of SEQUENCE_MESSAGE_KINDS) {
      expect(estiloDeMensaje(k)).toBe(SEQUENCE_MESSAGES[k]);
    }
    expect(estiloDeMensaje("return")).not.toBe(SEQUENCE_MESSAGES.sync);
  });

  it("lo desconocido cae a la llamada de siempre, no rompe el dibujo", () => {
    expect(esTipoDeMensaje("loop")).toBe(false);
    expect(esTipoDeMensaje(undefined)).toBe(false);
    expect(esTipoDeMensaje("toString")).toBe(false);
    expect(estiloDeMensaje(undefined)).toBe(SEQUENCE_MESSAGES[SEQUENCE_MESSAGE_DEFAULT]);
    expect(estiloDeMensaje("nada" as never)).toBe(SEQUENCE_MESSAGES.sync);
  });
});
