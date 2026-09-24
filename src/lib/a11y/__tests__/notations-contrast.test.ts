/**
 * Contraste del LIENZO: cada tipo de cada notación, en los dos temas.
 *
 * Barre el registro entero (`NOTATIONS`), así que **un tipo nuevo entra solo**:
 * nadie tiene que acordarse de agregarlo a una lista, que es exactamente como
 * estas verificaciones se vuelven mentira.
 *
 * Lo que se mide es lo que se ve: el texto contra su relleno, y el relleno —si
 * es translúcido— compuesto sobre el lienzo del tema.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UMBRAL_NO_TEXTO, UMBRAL_TEXTO, medirContraste } from "@/lib/a11y/contrast";
import { NOTATIONS, labelOutsideOf } from "@/lib/notations";
import { CROMO_CON_CONTRASTE, TOKEN_DE_CROMO } from "@/lib/canvas-chrome";

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** El valor de un token dentro de un bloque del CSS (`:root` o `.dark`). */
function tokenDe(selector: string, token: string): string {
  const desde = CSS.indexOf(selector);
  const hasta = CSS.indexOf("}", CSS.indexOf("{", desde));
  const m = CSS.slice(desde, hasta).match(new RegExp(`--${token}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`\`--${token}\` no está definido en ${selector}`);
  return m[1].trim();
}

/** Lo que hay DEBAJO de todo lo que se dibuja en el lienzo. */
const canvasDe = (selector: string): string => tokenDe(selector, "canvas");

const TEMAS = [
  { nombre: "claro", indice: 0, selector: ":root", canvas: canvasDe(":root") },
  { nombre: "oscuro", indice: 1, selector: ".dark", canvas: canvasDe(".dark") },
] as const;

/**
 * La clase del tema pedido dentro de una declaración de dos temas
 * (`"fill-zinc-100 dark:fill-zinc-700"`). Una declaración de UN solo valor vale
 * para los dos: es lo que pasa con `transparent`, que no tiene tema.
 */
function claseDelTema(declaracion: string | undefined, indice: 0 | 1): string {
  const partes = (declaracion ?? "").trim().split(/\s+/).filter(Boolean);
  const claras = partes.filter((c) => !c.startsWith("dark:"));
  const oscuras = partes.filter((c) => c.startsWith("dark:")).map((c) => c.slice(5));
  if (indice === 0) return claras[0] ?? oscuras[0] ?? "";
  return oscuras[0] ?? claras[0] ?? "";
}

/** Todos los elementos del registro, con su notación al lado. */
const ELEMENTOS = Object.entries(NOTATIONS).flatMap(([id, notacion]) =>
  notacion.elements.map((e) => ({ notacion: id, ...e }))
);

describe("el barrido cubre el registro entero", () => {
  it("hay elementos y ninguno se queda sin apariencia declarada", () => {
    expect(ELEMENTOS.length).toBeGreaterThan(100);
    const sinApariencia = ELEMENTOS.filter((e) => !e.bg || !e.text);
    expect(sinApariencia.map((e) => `${e.notacion}/${e.type}`)).toEqual([]);
  });

  it("toda apariencia declara los dos temas (o un valor que sirve para los dos)", () => {
    const soloUno = ELEMENTOS.filter((e) => {
      for (const campo of [e.bg, e.text, e.border, e.stroke]) {
        if (!campo) continue;
        const tieneOscuro = campo.includes("dark:");
        const tieneClaro = campo.split(/\s+/).some((c) => c && !c.startsWith("dark:"));
        // Un valor sin tema (`fill-transparent`) vale para los dos; lo que no
        // puede pasar es declarar uno solo de los dos y que el otro se invente.
        if (tieneOscuro !== tieneClaro && !campo.includes("transparent")) return true;
      }
      return false;
    });
    expect(soloUno.map((e) => `${e.notacion}/${e.type}`)).toEqual([]);
  });
});

describe.each(TEMAS)("lienzo · tema $nombre", ({ nombre, indice, canvas }) => {
  const casos = ELEMENTOS.map((e) => [`${e.notacion} · ${e.type}`, e] as const);

  it.each(casos)("texto sobre su relleno · %s", (_, e) => {
    const relleno = claseDelTema(e.bg, indice);
    const texto = claseDelTema(e.text, indice);
    // Dónde cae el nombre decide contra qué se mide: el rótulo de un símbolo
    // compacto (y el de un contenedor transparente) se lee sobre el LIENZO, no
    // sobre el relleno de la silueta.
    const fondo =
      relleno.includes("transparent") || labelOutsideOf(e) ? canvas : relleno;
    const m = medirContraste(texto, fondo, UMBRAL_TEXTO, canvas);
    expect(
      m.ok,
      `tema ${nombre} · ${e.notacion}/${e.type}: "${texto}" sobre "${fondo}" da ${m.detalle}`
    ).toBe(true);
  });

  it.each(casos)("contorno sobre el lienzo · %s", (_, e) => {
    const contorno = claseDelTema(e.stroke, indice);
    // Sin contorno declarado la silueta se dibuja con el borde del tipo; no hay
    // nada que medir acá y lo cubre el caso del texto.
    if (!contorno || contorno.includes("transparent")) return;
    const m = medirContraste(contorno, canvas, UMBRAL_NO_TEXTO, canvas);
    expect(
      m.ok,
      `tema ${nombre} · ${e.notacion}/${e.type}: contorno "${contorno}" sobre el lienzo da ${m.detalle}`
    ).toBe(true);
  });
});

describe.each(TEMAS)("cromo del lienzo · tema $nombre", ({ nombre, selector, canvas }) => {
  // Una ARISTA es contenido: si no se ve, el diagrama dice otra cosa. La
  // cuadrícula no entra —es decoración— y por eso `CROMO_CON_CONTRASTE` es más
  // corta que `CANVAS_CHROME`.
  it.each(CROMO_CON_CONTRASTE.map((c) => [c] as const))("%s sobre el lienzo", (cromo) => {
    const valor = tokenDe(selector, TOKEN_DE_CROMO[cromo]);
    const m = medirContraste(valor, canvas, UMBRAL_NO_TEXTO, canvas);
    expect(
      m.ok,
      `tema ${nombre} · ${cromo}: --${TOKEN_DE_CROMO[cromo]} (${valor}) sobre el lienzo (${canvas}) da ${m.detalle}`
    ).toBe(true);
  });
});
