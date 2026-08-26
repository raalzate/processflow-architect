/**
 * Ocultar la barra nativa es el cambio con más riesgo de la app: los controles de
 * ventana son la única forma de cerrarla. Lo que se prueba acá es que NINGUNA
 * plataforma quede sin controles y que las reservas de espacio existan donde el
 * sistema pinta encima.
 */

import { describe, it, expect } from "vitest";
import {
  titleBarOptions,
  reservaControlesDerecha,
  necesitaBotonDeMenu,
  reservaIzquierda,
  TITLEBAR_HEIGHT,
} from "../window-chrome";

describe("titleBarOptions", () => {
  it("macOS conserva los semáforos nativos y los centra en la franja", () => {
    const o = titleBarOptions("darwin");
    expect(o.titleBarStyle).toBe("hiddenInset");
    expect(o.trafficLightPosition?.y).toBeGreaterThan(0);
    expect(o.trafficLightPosition!.y).toBeLessThan(TITLEBAR_HEIGHT);
    // Sin overlay: en macOS los controles ya son del sistema.
    expect(o.titleBarOverlay).toBeUndefined();
  });

  it("Windows y Linux delegan los controles al SISTEMA, no a la app", () => {
    for (const p of ["win32", "linux"]) {
      const o = titleBarOptions(p);
      expect(o.titleBarStyle, p).toBe("hidden");
      // Esto es lo que evita la ventana atrapada: si nuestro código falla, cerrar
      // sigue siendo un botón del sistema operativo.
      expect(o.titleBarOverlay, p).toBeDefined();
      expect(o.titleBarOverlay!.height, p).toBe(TITLEBAR_HEIGHT);
    }
  });

  it("una plataforma desconocida cae al camino con controles del sistema", () => {
    expect(titleBarOptions("freebsd").titleBarOverlay).toBeDefined();
  });
});

describe("reservas de espacio", () => {
  it("Windows/Linux dejan libre la derecha, donde el sistema pinta los controles", () => {
    expect(reservaControlesDerecha("win32")).toBe(true);
    expect(reservaControlesDerecha("linux")).toBe(true);
    expect(reservaControlesDerecha("darwin")).toBe(false);
  });

  it("macOS deja libre la izquierda, donde están los semáforos", () => {
    expect(reservaIzquierda("darwin")).toBeGreaterThan(0);
    expect(reservaIzquierda("win32")).toBe(0);
  });

  it("el botón de menú sólo hace falta donde el menú vivía en el marco oculto", () => {
    expect(necesitaBotonDeMenu("win32")).toBe(true);
    expect(necesitaBotonDeMenu("linux")).toBe(true);
    expect(necesitaBotonDeMenu("darwin")).toBe(false);
  });
});
