/**
 * Toda silueta declarada se DIBUJA.
 *
 * `NodeShape` resuelve la forma con un `switch` que termina en `default:` →
 * rectángulo redondeado. Es lo correcto para un tipo desconocido que llega de un
 * archivo viejo, pero deja un hueco: agregar un `ShapeKind` al registro y
 * olvidarse del `case` no falla nada — el nodo se dibuja como una caja y sólo se
 * descubre mirando la pantalla, que es justo lo que estas pruebas existen para
 * no tener que hacer.
 *
 * Se lee el TEXTO de los dos archivos porque lo que se verifica es una relación
 * entre un tipo (que no existe en tiempo de ejecución) y un `switch`. Misma
 * técnica que `notations-registry`, que compara el registro contra el mapa de
 * iconos del lienzo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const registro = leer("src/lib/notations.ts");
const lienzo = leer("src/components/graph/designer/DesignerCanvas.tsx");

/**
 * Siluetas declaradas en `ShapeKind`. Se sacan del fuente y no de un array
 * paralelo: un array que hay que acordarse de actualizar es exactamente el
 * descuido que esta prueba busca.
 */
const SHAPE_KINDS: string[] = (() => {
  const i = registro.indexOf("export type ShapeKind");
  expect(i, "no se encontró la declaración de ShapeKind").toBeGreaterThan(-1);
  const decl = registro.slice(i, registro.indexOf(";", i));
  return [...decl.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
})();

/**
 * La que el `default` cubre A PROPÓSITO: es la forma de caída de todo tipo
 * desconocido, así que su `case` sería código muerto.
 */
const POR_DEFECTO = new Set(["rounded"]);

describe("cobertura de siluetas", () => {
  it("el registro declara varias siluetas (la lectura del fuente funciona)", () => {
    expect(SHAPE_KINDS.length).toBeGreaterThan(5);
    for (const esperada of ["rect", "ellipse", "diamond", "cylinder"]) {
      expect(SHAPE_KINDS, esperada).toContain(esperada);
    }
  });

  it("cada silueta tiene su `case` en NodeShape", () => {
    for (const kind of SHAPE_KINDS) {
      if (POR_DEFECTO.has(kind)) continue;
      expect(
        lienzo.includes(`case "${kind}"`),
        `la silueta "${kind}" no tiene \`case\` en NodeShape: se dibujaría como el default (caja redondeada) sin que nada falle`,
      ).toBe(true);
    }
  });

  it("no hay `case` de una silueta que el registro ya no declara", () => {
    const enElLienzo = [...lienzo.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
    // El `switch` del lienzo tiene otros `case` (anillos, estilos): sólo se
    // miran los que parecen siluetas huérfanas del registro.
    const huerfanas = enElLienzo.filter(
      (c) => !SHAPE_KINDS.includes(c) && /^(hexagon|parallelogram|cloud|cube|document|step|note|callout|callout-oval|semicircle|dshape|process|frame|list|person|text|triangle|cylinder|diamond|ellipse|rect|rounded)$/.test(c),
    );
    expect(huerfanas, "siluetas dibujadas que el registro ya no declara").toEqual([]);
  });
});
