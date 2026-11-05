/**
 * Contraste de la skin «Plano» (spec 026, FR-016). La skin es SIEMPRE oscura,
 * así que se mide una sola vez, contra su propio fondo: cada color de categoría
 * es borde, trazo y texto de la píldora, y se pide como TEXTO (4,5:1); la tinta
 * y el atenuado también. Los valores se leen del CSS, que es donde viven.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { medirContraste, UMBRAL_NO_TEXTO, UMBRAL_TEXTO } from "../a11y/contrast";
import { PLANO_CATEGORY_IDS } from "../skin";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");

function token(nombre: string): string {
  const i = css.indexOf(":root {");
  const bloque = css.slice(i, css.indexOf("\n  }", i));
  const m = new RegExp(`--pl-${nombre}\\s*:\\s*([^;]+);`).exec(bloque);
  if (!m) throw new Error(`--pl-${nombre} no está en :root`);
  return m[1].trim();
}

describe("skin plano · contraste sobre su fondo", () => {
  const fondo = token("bg");

  it.each(["ink", "muted"])("%s como TEXTO ≥ 4,5:1", (t) => {
    const m = medirContraste(token(t), fondo, UMBRAL_TEXTO);
    expect(m.ok, `${t}: ${m.detalle}`).toBe(true);
  });

  it.each([...PLANO_CATEGORY_IDS])("categoría %s como TEXTO ≥ 4,5:1", (c) => {
    const m = medirContraste(token(c), fondo, UMBRAL_TEXTO);
    expect(m.ok, `${c}: ${m.detalle}`).toBe(true);
  });

  it("la grilla es decoración: se distingue del fondo pero no compite (< 3:1)", () => {
    const m = medirContraste(token("grid"), fondo, UMBRAL_NO_TEXTO);
    expect(m.ok, m.detalle).toBe(false);
  });
});
