import { describe, expect, it } from "vitest";
import {
  BOTON_CENTRAL,
  BOTON_PRINCIPAL,
  LINEA_PX,
  esTeclaDePaneo,
  iniciaPaneo,
  ruedaHorizontal,
  scrollTrasArrastre,
} from "../canvas-pan";

const rueda = (o: Partial<Parameters<typeof ruedaHorizontal>[0]> = {}) =>
  ruedaHorizontal({ deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, metaKey: false, ...o });

describe("iniciaPaneo (#763)", () => {
  it("el clic central (la rueda) arrastra el tablero siempre", () => {
    expect(iniciaPaneo(BOTON_CENTRAL, false)).toBe(true);
  });

  it("el clic izquierdo arrastra sólo con Espacio pulsado", () => {
    expect(iniciaPaneo(BOTON_PRINCIPAL, true)).toBe(true);
    // Sin Espacio sigue siendo el marco de selección: no se le roba al usuario.
    expect(iniciaPaneo(BOTON_PRINCIPAL, false)).toBe(false);
  });

  it("el clic derecho nunca arrastra: abre el menú contextual", () => {
    expect(iniciaPaneo(2, true)).toBe(false);
  });
});

describe("scrollTrasArrastre", () => {
  it("el tablero sigue a la mano: mover el mouse a la derecha descubre lo de la izquierda", () => {
    const inicio = { x: 100, y: 100, left: 500, top: 300 };
    expect(scrollTrasArrastre(inicio, { x: 160, y: 70 })).toEqual({ left: 440, top: 330 });
  });

  it("sin movimiento, el scroll no cambia", () => {
    const inicio = { x: 10, y: 20, left: 7, top: 9 };
    expect(scrollTrasArrastre(inicio, { x: 10, y: 20 })).toEqual({ left: 7, top: 9 });
  });
});

describe("ruedaHorizontal", () => {
  it("Shift + rueda vertical se convierte en desplazamiento horizontal", () => {
    expect(rueda({ shiftKey: true, deltaY: 120 })).toBe(120);
    expect(rueda({ shiftKey: true, deltaY: -40 })).toBe(-40);
  });

  it("en modo línea, el delta se pasa a píxeles", () => {
    expect(rueda({ shiftKey: true, deltaY: 3, deltaMode: 1 })).toBe(3 * LINEA_PX);
  });

  it("sin Shift se deja al navegador: la rueda vertical scrollea en vertical", () => {
    expect(rueda({ deltaY: 120 })).toBeNull();
  });

  it("si el sistema ya convirtió Shift+rueda en deltaX (macOS) o es un touchpad, no se duplica", () => {
    expect(rueda({ shiftKey: true, deltaX: 120 })).toBeNull();
    expect(rueda({ deltaX: 30, deltaY: 10 })).toBeNull();
  });

  it("con Ctrl/⌘ la rueda es zoom, no desplazamiento", () => {
    expect(rueda({ shiftKey: true, ctrlKey: true, deltaY: 120 })).toBeNull();
    expect(rueda({ shiftKey: true, metaKey: true, deltaY: 120 })).toBeNull();
  });
});

describe("esTeclaDePaneo", () => {
  it("Espacio activa el modo arrastre fuera de un campo de texto", () => {
    expect(esTeclaDePaneo("Space", false)).toBe(true);
  });

  it("escribiendo, Espacio es un espacio", () => {
    expect(esTeclaDePaneo("Space", true)).toBe(false);
  });

  it("otra tecla no arrastra", () => {
    expect(esTeclaDePaneo("KeyA", false)).toBe(false);
  });
});
