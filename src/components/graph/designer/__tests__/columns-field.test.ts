/**
 * La `key` de una fila del editor de columnas no puede depender de lo que se
 * está escribiendo.
 *
 * Incidente: la primera versión usaba `key={`${i}-${c.nombre}`}`. Cada tecla
 * cambiaba la clave, React remontaba la fila y el input perdía el foco: se
 * podía escribir UNA letra por clic, y desde afuera parecía que la ficha «no
 * dejaba editar». No hay entorno de DOM en esta suite (vitest corre en node y no
 * hay React Testing Library), así que la red se tiende sobre el TEXTO del
 * componente — misma técnica que `notations-registry`, que lee el mapa de
 * iconos del lienzo.
 *
 * Vale para cualquier editor de lista de la ficha: si mañana el campo de
 * metadatos o el de columnas vuelve a poner el valor en la clave, esto se pone
 * rojo antes de que alguien lo descubra tecleando.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../../../..");

/** Componentes de ficha que renderizan una lista EDITABLE fila por fila. */
const EDITORES = ["src/components/graph/designer/ColumnsField.tsx"];

/**
 * Todas las `key={…}` del archivo, tal como están escritas. Cuenta llaves en
 * vez de cortar en la primera: la clave del incidente era
 * `key={`${i}-${c.nombre}`}` y una expresión hasta el primer `}` sólo veía
 * `` `${i ``, justo la mitad que NO tiene el problema.
 */
const keysDe = (src: string): string[] => {
  const salida: string[] = [];
  const marca = "key={";
  for (let i = src.indexOf(marca); i !== -1; i = src.indexOf(marca, i + 1)) {
    let nivel = 1;
    let j = i + marca.length;
    while (j < src.length && nivel > 0) {
      if (src[j] === "{") nivel++;
      else if (src[j] === "}") nivel--;
      j++;
    }
    salida.push(src.slice(i + marca.length, j - 1).trim());
  }
  return salida;
};

describe("keys de las filas editables", () => {
  it("ninguna key incluye un campo que el usuario teclea", () => {
    for (const rel of EDITORES) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const key of keysDe(src)) {
        // `c.nombre`, `m.clave`, `columna.tipo`…: el valor editable en la clave
        // es lo que remonta la fila en cada tecla.
        expect(
          /\.(nombre|tipo|clave|valor|referencia|texto|titulo)\b/.test(key),
          `${rel}: la key \`${key}\` depende de un valor editable`,
        ).toBe(false);
      }
    }
  });

  it("el editor de columnas identifica la fila por su POSICIÓN", () => {
    const src = fs.readFileSync(path.join(RAIZ, EDITORES[0]), "utf8");
    expect(keysDe(src)).toContain("i");
  });
});
