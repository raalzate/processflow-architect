/**
 * Integridad del registro de notaciones: lo que el registro declara tiene que
 * LLEGAR a la pantalla.
 *
 * Los huecos de este tipo no fallan nada: un tipo declarado y ausente de la
 * paleta no se puede arrastrar (existe pero no se ve), un tipo en la paleta sin
 * elemento se dibuja con el color y el icono de caída, y un icono que no está en
 * el mapa de la UI cae a `FilePlus` sin avisar. Todo eso sólo se descubre
 * mirando la pantalla — que fue justo cómo se descubrió que a UML le faltaban
 * elementos (secuencia, despliegue, tipos del diagrama de clases).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NOTATION_LIST } from "@/lib/notations";
import { NOTATION_HELP } from "@/lib/notation-help";

/** El mapa de iconos vive en la capa de UI; se lee como TEXTO (src/lib es puro). */
const canvasSrc = fs.readFileSync(
  path.join(
    path.resolve(__dirname, "../../.."),
    "src/components/graph/designer/DesignerCanvas.tsx",
  ),
  "utf8",
);
const iconMap: Set<string> = (() => {
  const i = canvasSrc.indexOf("const ICON_MAP");
  const bloque = canvasSrc.slice(i, canvasSrc.indexOf("\n};", i));
  return new Set([...bloque.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]));
})();

describe("registro de notaciones", () => {
  it("todo tipo de la PALETA existe como elemento de su notación", () => {
    for (const n of NOTATION_LIST) {
      const declarados = new Set(n.elements.map((e) => e.type));
      for (const g of n.paletteGroups) {
        for (const t of g.types) {
          expect(declarados.has(t), `${n.id} · paleta "${g.label}" ofrece "${t}", que no existe`).toBe(true);
        }
      }
    }
  });

  it("todo elemento declarado APARECE en la paleta (si no, no se puede usar)", () => {
    for (const n of NOTATION_LIST) {
      const enPaleta = n.paletteGroups.flatMap((g) => g.types);
      for (const e of n.elements) {
        expect(enPaleta.includes(e.type), `${n.id} · "${e.type}" no está en ningún grupo de la paleta`).toBe(true);
      }
    }
  });

  it("ningún tipo se repite en dos grupos de la misma paleta", () => {
    for (const n of NOTATION_LIST) {
      const enPaleta = n.paletteGroups.flatMap((g) => g.types);
      expect(new Set(enPaleta).size, `${n.id}: tipos repetidos en la paleta`).toBe(enPaleta.length);
    }
  });

  it("el icono de cada elemento está en el mapa de la UI", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        expect(iconMap.has(e.icon), `${n.id} · "${e.type}" pide el icono ${e.icon}, que no está en ICON_MAP`).toBe(true);
      }
    }
  });

  it("cada tipo trae su ayuda (el «?» de la paleta explica qué es)", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        expect(NOTATION_HELP[e.type], `${n.id} · "${e.type}" sin ayuda`).toBeTruthy();
      }
    }
  });
});
