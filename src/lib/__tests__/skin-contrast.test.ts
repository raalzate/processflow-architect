/**
 * Contraste de la skin editorial (spec 022, FR-011): cada token se mide contra
 * el papel de SU tema. Texto (tinta, atenuado, suave, acento, enlace) a 4,5:1;
 * marcas esenciales (regla fuerte, acento como contorno) a 3:1. Es el mismo
 * contrato de diagram-design (`verify-contrast.py`), escrito con el medidor de
 * la spec 018. Los valores se leen del CSS como texto: ahí están de verdad.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { medirContraste, UMBRAL_NO_TEXTO, UMBRAL_TEXTO } from "../a11y/contrast";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");

/** Valor de un token `--ed-*` dentro del bloque de un tema. */
function token(selector: string, nombre: string): string {
  const i = css.indexOf(selector);
  const bloque = css.slice(i, css.indexOf("\n  }", i));
  const m = new RegExp(`--ed-${nombre}\\s*:\\s*([^;]+);`).exec(bloque);
  if (!m) throw new Error(`--ed-${nombre} no está en ${selector}`);
  return m[1].trim();
}

const TEMAS = [
  ["claro", ":root {"],
  ["oscuro", ".dark {"],
] as const;

describe.each(TEMAS)("skin editorial · tema %s", (_nombre, selector) => {
  const papel = token(selector, "paper");

  it.each(["ink", "muted", "soft", "accent", "link"])("%s como TEXTO sobre papel ≥ 4,5:1", (t) => {
    const m = medirContraste(token(selector, t), papel, UMBRAL_TEXTO);
    expect(m.ok, `${t}: ${m.detalle}`).toBe(true);
  });

  it.each(["rule-solid", "accent", "link"])("%s como MARCA sobre papel ≥ 3:1", (t) => {
    const m = medirContraste(token(selector, t), papel, UMBRAL_NO_TEXTO);
    expect(m.ok, `${t}: ${m.detalle}`).toBe(true);
  });

  it("la tinta sigue leyéndose sobre papel-2 (el relleno del contenedor)", () => {
    const m = medirContraste(token(selector, "ink"), token(selector, "paper-2"), UMBRAL_TEXTO);
    expect(m.ok, m.detalle).toBe(true);
  });
});
