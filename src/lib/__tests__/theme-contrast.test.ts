/**
 * Contraste REAL de los tokens del tema (WCAG 2.1), no «se ve bien».
 *
 * La app se muestra siempre en oscuro. Cada color que se usa como TEXTO tiene
 * que separarse del fondo lo suficiente para leerse, y la única forma de saberlo
 * sin mirar la pantalla es calcular la razón de contraste. Fue el problema que
 * se coló: los tokens de estado estaban a media luminosidad y, sobre el fondo
 * oscuro, no se distinguían; el chip de la paleta llevaba letra oscura sobre
 * relleno oscuro.
 *
 * Umbrales de la norma: 4,5:1 para texto normal · 3:1 para texto grande y para
 * elementos no textuales (bordes, indicadores).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(
  path.join(path.resolve(__dirname, "../../.."), "src/app/globals.css"),
  "utf8",
);

/** Valores del bloque `.dark`, que es el tema que la app muestra. */
const tokens: Record<string, string> = (() => {
  const i = css.indexOf(".dark {");
  const bloque = css.slice(i, css.indexOf("\n  }", i));
  return Object.fromEntries(
    [...bloque.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
})();

/** `H S% L%` → canales RGB 0..1. */
function hslToRgb(valor: string): [number, number, number] {
  const [h, s, l] = valor.split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Luminancia relativa (WCAG 2.1). */
function luminancia(valor: string): number {
  const [r, g, b] = hslToRgb(valor).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste entre dos tokens del tema. */
function contraste(a: string, b: string): number {
  const la = luminancia(tokens[a]);
  const lb = luminancia(tokens[b]);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Pares que la app dibuja de verdad: [texto, fondo, mínimo, para qué]. */
const TEXTO_NORMAL: Array<[string, string, string]> = [
  ["foreground", "background", "texto principal"],
  ["muted-foreground", "background", "texto secundario (155 usos)"],
  ["card-foreground", "card", "texto de tarjeta"],
  ["popover-foreground", "popover", "texto de menú"],
  ["secondary-foreground", "secondary", "texto de botón secundario"],
  ["accent-foreground", "accent", "texto de opción resaltada"],
  ["primary-foreground", "primary", "texto de botón primario"],
  ["destructive-foreground", "destructive", "texto de botón destructivo"],
  ["success-foreground", "success-surface", "texto sobre superficie de éxito"],
  ["warning-foreground", "warning-surface", "texto sobre superficie de aviso"],
  ["info-foreground", "info-surface", "texto sobre superficie informativa"],
  ["code-foreground", "code", "código"],
  ["sidebar-foreground", "sidebar-background", "texto de la barra lateral"],
];

/** Colores de acento usados como texto o icono sobre el fondo de la app. */
const ACENTO_COMO_TEXTO: Array<[string, string, string]> = [
  ["success", "background", "«correcto» en texto e iconos"],
  ["warning", "background", "«aviso» en texto e iconos"],
  ["info", "background", "«información» en texto e iconos"],
  ["destructive", "background", "«error» en texto e iconos"],
  ["primary", "background", "enlaces y acentos"],
];

describe("contraste WCAG del tema", () => {
  it.each(TEXTO_NORMAL)("%s sobre %s (%s) ≥ 4,5:1", (fg, bg) => {
    expect(Number(contraste(fg, bg).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACENTO_COMO_TEXTO)("%s sobre %s (%s) ≥ 4,5:1", (fg, bg) => {
    expect(Number(contraste(fg, bg).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it("los bordes se separan del fondo lo suficiente para verse", () => {
    // Elemento no textual: la norma pide 3:1. Un borde que no se ve deja de
    // delimitar y los paneles se funden entre sí.
    for (const borde of ["border", "input"]) {
      expect(
        Number(contraste(borde, "background").toFixed(2)),
        `${borde} sobre background`,
      ).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("el lienzo se distingue del fondo de la app sin ser otro color", () => {
    // Es un escalón, no un contraste: si fueran iguales el lienzo no se leería
    // como superficie propia, y si fueran muy distintos parecerían dos apps.
    const salto = contraste("canvas", "background");
    expect(salto).toBeGreaterThan(1);
    expect(salto).toBeLessThan(1.5);
  });
});
