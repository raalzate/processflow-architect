/**
 * Contraste de los TOKENS de la interfaz, en los dos temas.
 *
 * Lee `globals.css` de verdad y no una copia en TypeScript: una copia se
 * desincroniza el día que alguien retoca el CSS, y entonces el test aprueba
 * colores que ya no existen.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UMBRAL_NO_TEXTO, UMBRAL_TEXTO, medirContraste } from "@/lib/a11y/contrast";

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Los tokens de un bloque (`:root` = claro, `.dark` = oscuro). */
function tokensDe(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector);
  if (i < 0) throw new Error(`No encontré el bloque \`${selector}\` en globals.css`);
  const abre = CSS.indexOf("{", i);
  // El bloque termina en la primera llave de cierre a su nivel; adentro sólo hay
  // declaraciones, así que alcanza con buscar el cierre siguiente.
  const cierra = CSS.indexOf("}", abre);
  const cuerpo = CSS.slice(abre + 1, cierra);
  const out: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const TEMAS = [
  { nombre: "claro", tokens: tokensDe(":root") },
  { nombre: "oscuro", tokens: tokensDe(".dark") },
];

/**
 * Los pares que de verdad se pintan juntos. No es «todos contra todos»: medir
 * pares que nunca coinciden en pantalla produce fallas falsas y termina con
 * alguien bajando el umbral.
 */
const PARES_TEXTO: [string, string, string][] = [
  ["texto principal sobre el fondo", "foreground", "background"],
  ["texto de una tarjeta", "card-foreground", "card"],
  ["texto de un popover", "popover-foreground", "popover"],
  ["texto atenuado sobre el fondo", "muted-foreground", "background"],
  ["texto atenuado sobre su superficie", "muted-foreground", "muted"],
  ["texto sobre el color primario", "primary-foreground", "primary"],
  ["texto sobre el secundario", "secondary-foreground", "secondary"],
  ["texto sobre el acento", "accent-foreground", "accent"],
  ["texto sobre el destructivo", "destructive-foreground", "destructive"],
  ["mensaje de error sobre el fondo", "destructive", "background"],
  ["texto de código sobre su superficie", "code-foreground", "code"],
  ["texto de la barra lateral", "sidebar-foreground", "sidebar-background"],
  ["texto sobre el primario de la barra lateral", "sidebar-primary-foreground", "sidebar-primary"],
  ["texto sobre el acento de la barra lateral", "sidebar-accent-foreground", "sidebar-accent"],
  ["«salió bien» sobre su superficie", "success-foreground", "success-surface"],
  ["«ojo con esto» sobre su superficie", "warning-foreground", "warning-surface"],
  ["«para saber» sobre su superficie", "info-foreground", "info-surface"],
  ["acento de IA sobre su superficie", "ai-foreground", "ai-surface"],
  // Los acentos también se usan como TEXTO e icono sobre el fondo de la app
  // («Sugerir», los mensajes de estado): ahí el umbral es el de texto, no el de
  // adorno. Venía del test que este barrido reemplaza.
  ["«salió bien» en texto e iconos", "success", "background"],
  ["«ojo con esto» en texto e iconos", "warning", "background"],
  ["«para saber» en texto e iconos", "info", "background"],
  ["enlaces y acentos", "primary", "background"],
  ["acciones asistidas por IA", "ai", "background"],
  ["«Sugerir» dentro del inspector, que es una tarjeta", "ai", "card"],
];

/**
 * Pares NO textuales, con umbral 3:1 (WCAG 1.4.11). La lista es corta a
 * propósito: 1.4.11 pide 3:1 para lo que **identifica un componente o su
 * estado**, no para todo trazo de la pantalla.
 *
 *  - El **borde de un campo** entra: el relleno del campo es el del fondo, así
 *    que el borde es lo único que dice dónde empieza.
 *  - El **anillo de foco** entra: es la indicación de un estado.
 *  - El separador `--border` y los bordes de las superficies de estado NO
 *    entran: son decoración sobre una superficie que ya se distingue por su
 *    relleno. Exigirles 3:1 obligaría a un trazo duro en cada tarjeta sin que
 *    nadie entienda mejor la pantalla. Si algún día un componente depende sólo
 *    de ese trazo, el par se agrega acá.
 */
const PARES_NO_TEXTO: [string, string, string][] = [
  ["borde de un campo sobre el fondo", "input", "background"],
  ["anillo de foco sobre el fondo", "ring", "background"],
];

describe.each(TEMAS)("tokens de interfaz · tema $nombre", ({ nombre, tokens }) => {
  it("el bloque define todos los tokens que la app pinta", () => {
    const usados = new Set([
      ...PARES_TEXTO.flatMap(([, a, b]) => [a, b]),
      ...PARES_NO_TEXTO.flatMap(([, a, b]) => [a, b]),
    ]);
    const faltan = [...usados].filter((t) => !tokens[t]);
    expect(faltan, `sin definir en el tema ${nombre}`).toEqual([]);
  });

  it.each(PARES_TEXTO)("texto · %s", (que, frente, fondo) => {
    const m = medirContraste(tokens[frente], tokens[fondo], UMBRAL_TEXTO);
    expect(
      m.ok,
      `tema ${nombre} · ${que}: --${frente} (${tokens[frente]}) sobre --${fondo} (${tokens[fondo]}) da ${m.detalle}`
    ).toBe(true);
  });

  it.each(PARES_NO_TEXTO)("no textual · %s", (que, frente, fondo) => {
    const m = medirContraste(tokens[frente], tokens[fondo], UMBRAL_NO_TEXTO);
    expect(
      m.ok,
      `tema ${nombre} · ${que}: --${frente} (${tokens[frente]}) sobre --${fondo} (${tokens[fondo]}) da ${m.detalle}`
    ).toBe(true);
  });
});

describe.each(TEMAS)("escalón del lienzo · tema $nombre", ({ tokens }) => {
  it("el lienzo se distingue del fondo de la app sin parecer otra app", () => {
    // Es un escalón, no un contraste: iguales, el lienzo no se lee como
    // superficie propia; muy distintos, parecen dos aplicaciones pegadas.
    const m = medirContraste(tokens["canvas"], tokens["background"], 1);
    expect(m.ratio).not.toBeNull();
    expect(m.ratio!).toBeGreaterThan(1);
    expect(m.ratio!).toBeLessThan(1.5);
  });
});
