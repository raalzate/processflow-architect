import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// -----------------------------------------------------------------------------
// El panel lateral con la barra de título propia (#188)
// -----------------------------------------------------------------------------

describe("el panel lateral no se sale de la ventana", () => {
  const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

  /** El bloque que corrige el panel lateral (`fixed inset-y-0`). */
  const regla = (): string => {
    const i = css.indexOf('body[data-titlebar="on"] .fixed.inset-y-0');
    expect(i, "falta la regla que baja el panel lateral bajo la barra de título").toBeGreaterThan(-1);
    return css.slice(i, css.indexOf("}", i));
  };

  it("baja el panel la altura de la barra", () => {
    expect(regla()).toMatch(/top:\s*var\(--titlebar-h\)/);
  });

  it("y le DESCUENTA esa altura: bajarlo sin acortarlo dejaba el pie fuera de la ventana", () => {
    // El fallo que esto frena: la ficha arrancaba en top:40 y seguía midiendo el
    // viewport entero, así que «Siguiente paso» y «Cerrar» caían bajo el borde
    // (tapados por el Dock en macOS) y no se podían pulsar.
    expect(regla()).toMatch(/height:\s*calc\(100%\s*-\s*var\(--titlebar-h\)\)/);
  });
});

// -----------------------------------------------------------------------------
// Barras de desplazamiento propias (#206)
// -----------------------------------------------------------------------------

describe("las barras de scroll no las pinta el sistema", () => {
  const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

  it("hay estilo propio para Chromium y para Firefox", () => {
    // En macOS son overlay fino y el problema es invisible; en Windows salen las
    // nativas —anchas, claras, con flechas— y rompen el tema oscuro.
    expect(css).toMatch(/::-webkit-scrollbar\s*\{/);
    expect(css).toMatch(/scrollbar-width:\s*thin/);
  });

  it("el color sale de los tokens del tema, no de un literal", () => {
    expect(css).toMatch(/::-webkit-scrollbar-thumb[\s\S]{0,200}hsl\(var\(--/);
    expect(css).toMatch(/scrollbar-color:\s*hsl\(var\(--/);
  });

  it("NO se ocultan: en un lienzo grande son la única señal de que hay más contenido", () => {
    const bloque = css.slice(css.indexOf("::-webkit-scrollbar {"));
    expect(bloque).not.toMatch(/::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });
});
