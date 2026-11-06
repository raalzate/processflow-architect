/**
 * La superficie de hover (`--accent`) tiene que dejar leer TODO texto que puede
 * quedar encima (#693). Muchos hovers pintan `bg-accent` y conservan el color de
 * texto propio —el del cuerpo, el atenuado, un ícono—; con un acento medio pensado
 * para texto blanco, esos textos desaparecían en el tema claro. Se mide contra los
 * tres colores de texto posibles, en los dos temas. Los valores se leen del CSS
 * como texto: ahí están de verdad.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { medirContraste, UMBRAL_TEXTO } from "../a11y/contrast";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");

/** Valor de un token del tema (`--x: h s% l%;`) dentro del bloque de un selector. */
function token(selector: string, nombre: string): string {
  const i = css.indexOf(selector);
  const bloque = css.slice(i, css.indexOf("\n  }", i));
  const m = new RegExp(`\\n\\s*--${nombre}\\s*:\\s*([^;]+);`).exec(bloque);
  if (!m) throw new Error(`--${nombre} no está en ${selector}`);
  return m[1].trim();
}

const TEMAS = [
  ["claro", ":root {"],
  ["oscuro", ".dark {"],
] as const;

describe.each(TEMAS)("hover · tema %s", (_nombre, selector) => {
  const hover = token(selector, "accent");

  it.each(["accent-foreground", "foreground", "muted-foreground"])(
    "%s se lee sobre la superficie de hover ≥ 4,5:1",
    (texto) => {
      const m = medirContraste(`hsl(${token(selector, texto)})`, `hsl(${hover})`, UMBRAL_TEXTO);
      expect(m.ok, `${texto} sobre accent: ${m.detalle}`).toBe(true);
    }
  );
});
