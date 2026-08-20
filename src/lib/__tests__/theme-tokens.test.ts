/**
 * El tema no tiene variables colgadas.
 *
 * `tailwind.config.ts` mapea clases a `hsl(var(--x))`. Si `--x` no existe en el
 * CSS, la clase resuelve a un color inválido y el elemento se pinta transparente
 * o hereda: no falla, se degrada en silencio. Fue el caso de `--sidebar-*`, que
 * estaba mapeado desde siempre y no lo definía nadie (spec 003, FR-005).
 *
 * Se lee el CSS y la config como TEXTO a propósito: importar la config de
 * Tailwind traería su cadena de dependencias a `src/lib`, que es puro (P3).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
const config = fs.readFileSync(path.join(raiz, "tailwind.config.ts"), "utf8");

/**
 * Variables que la config pide vía `var(--x)`, sin las que legítimamente no
 * viven en el tema: `--radius` se define una vez en la raíz porque no cambia con
 * el tema, y las `--radix-*` las inyecta Radix en runtime sobre el elemento.
 */
const pedidas = [...config.matchAll(/var\(--([a-z0-9-]+)\)/g)]
  .map((m) => m[1])
  .filter((v) => v !== "radius" && !v.startsWith("radix-"));
/** Variables definidas en el CSS, por bloque. */
const definidasEn = (selector: string): Set<string> => {
  const i = css.indexOf(selector);
  if (i === -1) return new Set();
  const bloque = css.slice(i, css.indexOf("\n  }", i));
  return new Set([...bloque.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
};

describe("tokens del tema", () => {
  it("toda variable mapeada en Tailwind está definida en el tema", () => {
    const oscuro = definidasEn(".dark {");
    const faltan = [...new Set(pedidas)].filter((v) => !oscuro.has(v));
    expect(faltan, `sin definir en .dark: ${faltan.join(", ")}`).toEqual([]);
  });

  it("el tema claro define las mismas variables que el oscuro", () => {
    // Aunque la app se muestre oscura, dejar la mitad sin definir volvería a
    // producir colores inválidos si algo se renderiza fuera de `.dark`.
    const claro = definidasEn(":root {");
    const oscuro = definidasEn(".dark {");
    const faltan = [...oscuro].filter((v) => !claro.has(v));
    expect(faltan, `sólo en .dark: ${faltan.join(", ")}`).toEqual([]);
  });

  it("no quedan variables definidas que nadie use", () => {
    const oscuro = [...definidasEn(".dark {")];
    const huerfanas = oscuro.filter((v) => !pedidas.includes(v));
    expect(huerfanas, `definidas y sin uso: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("existen los tokens de estado y de código que exige la spec", () => {
    for (const t of ["success", "warning", "info", "code", "destructive", "ai"]) {
      expect(pedidas, `falta el token ${t}`).toContain(t);
    }
  });
});
