/**
 * Simbología declarada por notación: tamaño de nodo, rotulado y trazo.
 *
 * El registro es la única fuente de verdad (P6), así que lo que se prueba es que
 * el registro RESPONDA por notación —no que un tipo concreto mida tanto—: el día
 * que se agregue una notación con ficha propia, estas pruebas la cubren sola.
 */
import { describe, it, expect } from "vitest";
import {
  defaultRoutingFor,
  labelLayoutOfType,
  nodeSizeForNotation,
  sizeOfType,
  DEFAULT_NODE_SIZE,
  DEFAULT_NOTATION_ID,
  INITIAL_NOTATION_ID,
  getNotation,
  NOTATION_LIST,
} from "../notations";

describe("simbología por notación", () => {
  it("la FICHA es el rotulado de todas las notaciones, no una rareza de C4", () => {
    for (const id of ["ddd", "bpmn", "c4", "uml"] as const) {
      expect(nodeSizeForNotation(id)).toEqual(DEFAULT_NODE_SIZE);
    }
    for (const [tipo, notacion] of [
      ["Comando", "ddd"],
      ["Tarea", "bpmn"],
      ["Contenedor", "c4"],
      ["Clase", "uml"],
    ] as const) {
      expect(labelLayoutOfType(tipo, notacion), tipo).toBe("detail");
    }
  });

  it("los símbolos COMPACTOS conservan su tamaño: su figura es el significado", () => {
    // Un evento BPMN con la caja de la ficha sería un plato; se dibuja pequeño
    // y con el nombre debajo.
    const compacto = sizeOfType("Evento de Inicio", "bpmn");
    expect(compacto.w).toBeLessThan(DEFAULT_NODE_SIZE.w);
    expect(compacto.h).toBeLessThan(DEFAULT_NODE_SIZE.h);
  });

  it("C4 conserva su trazo curvo; el resto, recto", () => {
    expect(defaultRoutingFor("c4")).toBe("curved");
    for (const id of ["ddd", "bpmn", "uml"] as const) {
      expect(defaultRoutingFor(id)).toBe("straight");
    }
  });

  it("un tipo AMBIGUO se resuelve por la notación de la vista", () => {
    // "Sistema Externo" existe en DDD y en C4: sin contexto no se puede elegir
    // (elegir mal dibuja el nodo con la simbología de la otra notación).
    const enDosNotaciones = NOTATION_LIST.filter((n) =>
      n.elements.some((e) => e.type === "Sistema Externo")
    );
    expect(enDosNotaciones.map((n) => n.id).sort()).toEqual(["c4", "ddd"]);

    expect(sizeOfType("Sistema Externo", "c4")).toEqual(nodeSizeForNotation("c4"));
    expect(sizeOfType("Sistema Externo", "ddd")).toEqual(DEFAULT_NODE_SIZE);
    expect(sizeOfType("Sistema Externo")).toEqual(DEFAULT_NODE_SIZE);
  });

  it("la paleta C4 es NEUTRA: la caja no codifica el nivel", () => {
    const c4 = NOTATION_LIST.find((n) => n.id === "c4")!;
    const propios = c4.elements.filter(
      (e) => !e.container && e.type !== "Sistema Externo"
    );
    // Persona, Sistema, Contenedor, Componente y Base de Datos comparten relleno:
    // lo que distingue el nivel es el `[Tipo]` de la ficha, no el color.
    expect(new Set(propios.map((e) => e.bg)).size).toBe(1);
    // Lo de terceros sí se atenúa: es la única jerarquía que se lee de un vistazo.
    const externo = c4.elements.find((e) => e.type === "Sistema Externo")!;
    expect(externo.bg).not.toBe(propios[0].bg);
  });

  it("todo contenedor TRANSPARENTE declara color de texto para tema oscuro", () => {
    // Su nombre se dibuja sobre el lienzo, no sobre un relleno propio: sin
    // variante `dark:`, en tema oscuro el título quedaba invisible.
    for (const n of NOTATION_LIST) {
      for (const e of n.elements.filter((x) => x.container && x.transparent)) {
        expect(e.text, `${n.id} · ${e.type}`).toMatch(/dark:/);
      }
    }
  });

  it("la notación de ARRANQUE y la de COMPATIBILIDAD son cosas distintas", () => {
    // Lo nuevo arranca en C4; un modelo guardado SIN notación se sigue leyendo
    // como DDD, porque la app nació siendo sólo DDD y cambiar esa caída
    // reinterpretaría datos viejos (un Comando pasaría a leerse como otra cosa).
    expect(INITIAL_NOTATION_ID).toBe("c4");
    expect(DEFAULT_NOTATION_ID).toBe("ddd");
    expect(getNotation(undefined).id).toBe(DEFAULT_NOTATION_ID);
    expect(getNotation("inventada").id).toBe(DEFAULT_NOTATION_ID);
  });

  it("un tipo desconocido cae al tamaño por defecto, no a NaN", () => {
    expect(sizeOfType("Chachareo")).toEqual(DEFAULT_NODE_SIZE);
    expect(labelLayoutOfType("Chachareo")).toBe("detail");
    expect(defaultRoutingFor("no-existe")).toBe(defaultRoutingFor(DEFAULT_NOTATION_ID));
  });
});
