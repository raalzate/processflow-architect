/**
 * Skin del lienzo (spec 022): la editorial dibuja por ROL y el lienzo pregunta,
 * no decide. La canónica no devuelve nada: ahí nada cambia.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CONTAINER_TREATMENT,
  EDGE_TREATMENT,
  EDITORIAL_TOKENS,
  MAX_FOCAL,
  SKIN_DEFAULT,
  SKIN_LIST,
  TREATMENTS,
  edgeTreatment,
  leerSkin,
  nodeTreatment,
  treatmentOf,
} from "../skin";
import { NOTATION_LIST, typesWithRole } from "../notations";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
const config = fs.readFileSync(path.join(raiz, "tailwind.config.ts"), "utf8");

describe("skin", () => {
  it("la skin por defecto es la canónica y cualquier valor raro cae a ella", () => {
    expect(SKIN_DEFAULT).toBe("canon");
    expect(leerSkin(undefined)).toBe("canon");
    expect(leerSkin("rara")).toBe("canon");
    expect(leerSkin("editorial")).toBe("editorial");
    expect(SKIN_LIST.map((s) => s.id)).toEqual(["canon", "editorial"]);
  });

  it("el tratamiento se deduce del rol: datos → store, externo → external, actor → input, resto → backend", () => {
    expect(treatmentOf("c4", typesWithRole("c4", "datastore")[0])).toBe("store");
    expect(treatmentOf("c4", typesWithRole("c4", "external")[0])).toBe("external");
    expect(treatmentOf("c4", typesWithRole("c4", "actor")[0])).toBe("input");
    expect(treatmentOf("c4", typesWithRole("c4", "system")[0])).toBe("backend");
    expect(treatmentOf("mer", typesWithRole("mer", "entity")[0])).toBe("store");
  });

  it("el tratamiento DECLARADO en el registro manda sobre el rol", () => {
    expect(treatmentOf("ddd", "Regla de Negocio")).toBe("security");
    expect(treatmentOf("ddd", "Objeto de Valor")).toBe("optional");
  });

  it("un tipo desconocido o de dibujo libre es un servicio: la caja neutra", () => {
    expect(treatmentOf("general", "Rectángulo")).toBe("backend");
    expect(treatmentOf("ddd", "no-existe")).toBe("backend");
  });

  it("toda notación semántica resuelve tratamiento para TODOS sus tipos (SC-003)", () => {
    for (const n of NOTATION_LIST) {
      if (n.freeform) continue;
      for (const e of n.elements) {
        expect(Object.keys(TREATMENTS), `${n.id} · ${e.type}`).toContain(treatmentOf(n.id, e.type));
      }
    }
  });

  it("en la canónica el nodo y la arista no reciben tratamiento (nada cambia)", () => {
    expect(nodeTreatment("canon", "c4", "Sistema", false)).toBeUndefined();
    expect(nodeTreatment("canon", "c4", "Sistema", true)).toBeUndefined();
    expect(edgeTreatment("canon", "c4", [])).toBeUndefined();
  });

  it("en editorial el hotspot es el ÚNICO focal; el resto va por su rol", () => {
    expect(nodeTreatment("editorial", "c4", "Sistema", true)).toBe(TREATMENTS.focal);
    expect(nodeTreatment("editorial", "c4", "Sistema", false)).toBe(TREATMENTS.backend);
    expect(nodeTreatment("editorial", "c4", typesWithRole("c4", "datastore")[0], false)).toBe(TREATMENTS.store);
  });

  it("la arista: atenuada por defecto, enlace si un extremo es externo, acento entre dos focos", () => {
    const ext = typesWithRole("c4", "external")[0];
    expect(edgeTreatment("editorial", "c4", [{ tipo: "Sistema", focal: false }, { tipo: "Sistema", focal: false }])).toBe(EDGE_TREATMENT.base);
    expect(edgeTreatment("editorial", "c4", [{ tipo: "Sistema", focal: false }, { tipo: ext, focal: false }])).toBe(EDGE_TREATMENT.link);
    expect(edgeTreatment("editorial", "c4", [{ tipo: "Sistema", focal: true }, { tipo: ext, focal: true }])).toBe(EDGE_TREATMENT.focal);
    // Un solo foco no es «entre focos».
    expect(edgeTreatment("editorial", "c4", [{ tipo: "Sistema", focal: true }, { tipo: "Sistema", focal: false }])).toBe(EDGE_TREATMENT.base);
  });

  it("el acento admite dos focos", () => {
    expect(MAX_FOCAL).toBe(2);
  });

  // Tailwind sólo emite las clases que VE, y una clase sobre un token que el
  // tema no define pinta transparente sin fallar. Las dos cosas se verifican
  // leyendo CSS y config como texto (src/lib es puro).
  it("toda clase de tratamiento apunta a un token `ed-*` mapeado en Tailwind y definido en ambos temas", () => {
    const clases = [
      ...Object.values(TREATMENTS).flatMap((t) => [t.bg, t.border, t.text]),
      CONTAINER_TREATMENT.bg,
      CONTAINER_TREATMENT.border,
      CONTAINER_TREATMENT.text,
      ...Object.values(EDGE_TREATMENT),
    ];
    const definidasEn = (selector: string): Set<string> => {
      const i = css.indexOf(selector);
      const bloque = css.slice(i, css.indexOf("\n  }", i));
      return new Set([...bloque.matchAll(/--ed-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    };
    const claro = definidasEn(":root {");
    const oscuro = definidasEn(".dark {");
    for (const clase of clases) {
      const m = /^(?:fill|stroke|text)-ed-([a-z0-9-]+?)(?:\/.+)?$/.exec(clase);
      expect(m, `${clase} no es una clase sobre un token ed-*`).not.toBeNull();
      const token = m![1];
      expect(EDITORIAL_TOKENS as readonly string[], `${clase}: token desconocido`).toContain(token);
      expect(claro.has(token), `--ed-${token} no está en :root`).toBe(true);
      expect(oscuro.has(token), `--ed-${token} no está en .dark`).toBe(true);
      expect(config.includes(`var(--ed-${token})`), `--ed-${token} no está mapeado en tailwind.config.ts`).toBe(true);
    }
  });
});
