/**
 * Skin «Plano» (spec 026, #678): la lámina técnica oscura. Cada elemento cae en
 * una de siete CATEGORÍAS por lo que el registro dice de su tipo —o por la que
 * el usuario fijó—, la arista toma el color de su origen y la leyenda lista sólo
 * lo presente. Todo puro: el lienzo pregunta.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PLANO_CATEGORIES,
  PLANO_CATEGORY_IDS,
  PLANO_CONTAINER,
  PLANO_TOKENS,
  SKIN_LIST,
  boundsConLeyenda,
  categoriaDe,
  categoriasPresentes,
  edgeTreatment,
  leerCategoria,
  leerSkin,
  nodeTreatment,
  planoEdgeCategory,
  planoLegend,
  routingParaSkin,
} from "../skin";
import { NOTATION_LIST, typesWithRole } from "../notations";

const raiz = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
const config = fs.readFileSync(path.join(raiz, "tailwind.config.ts"), "utf8");

describe("skin plano · elegible y persistible (FR-001, FR-002)", () => {
  it("es la tercera skin y se lee de un archivo; lo raro sigue siendo canónica", () => {
    expect(SKIN_LIST.map((s) => s.id)).toContain("plano");
    expect(leerSkin("plano")).toBe("plano");
    expect(leerSkin("PLANO")).toBe("canon");
  });
});

describe("categoría de un elemento (FR-003 … FR-006)", () => {
  it("hay exactamente siete categorías", () => {
    expect(PLANO_CATEGORY_IDS).toEqual([
      "frontend",
      "backend",
      "datos",
      "nube",
      "seguridad",
      "mensajeria",
      "externo",
    ]);
  });

  it("se deriva del rol y del tratamiento del registro", () => {
    expect(categoriaDe("c4", typesWithRole("c4", "datastore")[0])).toBe("datos");
    expect(categoriaDe("c4", typesWithRole("c4", "external")[0])).toBe("externo");
    expect(categoriaDe("c4", typesWithRole("c4", "actor")[0])).toBe("frontend");
    expect(categoriaDe("c4", typesWithRole("c4", "system")[0])).toBe("backend");
    expect(categoriaDe("ddd", typesWithRole("ddd", "event")[0])).toBe("mensajeria");
    expect(categoriaDe("ddd", "Regla de Negocio")).toBe("seguridad");
  });

  it("la categoría DECLARADA en el registro manda sobre el rol", () => {
    expect(categoriaDe("general", "Nube")).toBe("nube");
  });

  it("un tipo desconocido cae en Backend (FR-005)", () => {
    expect(categoriaDe("ddd", "no-existe")).toBe("backend");
  });

  it("la fijada a mano manda; una inválida se ignora (FR-006)", () => {
    expect(categoriaDe("c4", typesWithRole("c4", "system")[0], "frontend")).toBe("frontend");
    expect(categoriaDe("c4", typesWithRole("c4", "system")[0], "rara")).toBe("backend");
    expect(leerCategoria("nube")).toBe("nube");
    expect(leerCategoria("")).toBeUndefined();
    expect(leerCategoria(3)).toBeUndefined();
  });

  it("toda notación resuelve categoría para TODOS sus tipos (SC-002)", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        expect(PLANO_CATEGORY_IDS, `${n.id} · ${e.type}`).toContain(categoriaDe(n.id, e.type));
      }
    }
  });
});

describe("tratamiento de nodo y arista en plano (FR-009, FR-015)", () => {
  it("el nodo usa las clases de su categoría; el foco, un relleno más intenso", () => {
    const sis = typesWithRole("c4", "system")[0];
    const normal = nodeTreatment("plano", "c4", sis, false);
    const foco = nodeTreatment("plano", "c4", sis, true);
    expect(normal?.border).toBe(PLANO_CATEGORIES.backend.border);
    expect(foco?.border).toBe(PLANO_CATEGORIES.backend.border);
    expect(foco?.bg).not.toBe(normal?.bg);
  });

  it("la categoría fijada también decide el tratamiento", () => {
    const sis = typesWithRole("c4", "system")[0];
    expect(nodeTreatment("plano", "c4", sis, false, "datos")?.border).toBe(PLANO_CATEGORIES.datos.border);
  });

  it("la arista toma el color de su ORIGEN", () => {
    const db = typesWithRole("c4", "datastore")[0];
    const sis = typesWithRole("c4", "system")[0];
    expect(
      edgeTreatment("plano", "c4", [
        { tipo: sis, focal: false },
        { tipo: db, focal: false },
      ])
    ).toBe(PLANO_CATEGORIES.backend.edge);
    expect(planoEdgeCategory("c4", { tipo: db })).toBe("datos");
    expect(planoEdgeCategory("c4", { tipo: sis, categoria: "nube" })).toBe("nube");
  });

  it("canónica y editorial no se enteran de la categoría", () => {
    expect(nodeTreatment("canon", "c4", "Sistema", false, "datos")).toBeUndefined();
  });
});

describe("ruteo por skin (FR-011, FR-012)", () => {
  it("en plano, sin trazo propio, es ortogonal; con trazo propio manda el del enlace", () => {
    expect(routingParaSkin("plano", undefined, "straight")).toBe("orthogonal");
    expect(routingParaSkin("plano", "curved", "straight")).toBe("curved");
  });

  it("canónica y editorial siguen con el de la notación", () => {
    expect(routingParaSkin("canon", undefined, "curved")).toBe("curved");
    expect(routingParaSkin("editorial", undefined, "straight")).toBe("straight");
  });

  it("un mensaje de secuencia nunca se vuelve escalonado", () => {
    expect(routingParaSkin("plano", undefined, "straight", { secuencia: true })).toBe("straight");
  });
});

describe("leyenda (FR-013)", () => {
  const bounds = { minX: 100, minY: 50, maxX: 900, maxY: 600, width: 800, height: 550 };

  it("lista sólo las categorías presentes, en el orden canónico", () => {
    const l = planoLegend(["externo", "backend", "datos", "backend"], bounds);
    expect(l?.items.map((i) => i.id)).toEqual(["backend", "datos", "externo"]);
  });

  it("va debajo del contenido, alineada a su izquierda, sin superponerse", () => {
    const l = planoLegend(["backend"], bounds)!;
    expect(l.x).toBe(bounds.minX);
    expect(l.y).toBeGreaterThan(bounds.maxY);
    for (let i = 1; i < l.items.length; i++) {
      expect(l.items[i].x).toBeGreaterThan(l.items[i - 1].x);
    }
  });

  it("las categorías presentes salen de los elementos sueltos, no de los contenedores", () => {
    const sis = typesWithRole("c4", "system")[0];
    const db = typesWithRole("c4", "datastore")[0];
    const set = categoriasPresentes("c4", [
      { tipo: sis, contenedor: false },
      { tipo: db, contenedor: false },
      { tipo: sis, contenedor: false, categoria: "frontend" },
      { tipo: db, contenedor: true },
    ]);
    expect([...set].sort()).toEqual(["backend", "datos", "frontend"]);
  });

  it("el encuadre de la lámina incluye la leyenda; sin leyenda no cambia (FR-014)", () => {
    const l = planoLegend(["backend", "datos", "externo", "seguridad", "nube", "frontend", "mensajeria"], {
      minX: 0,
      maxY: 100,
    });
    const b = { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 };
    const conL = boundsConLeyenda(b, l)!;
    expect(conL.maxY).toBe(l!.y + l!.height);
    expect(conL.maxX).toBeGreaterThanOrEqual(l!.x + l!.width);
    expect(conL.height).toBe(conL.maxY - conL.minY);
    expect(boundsConLeyenda(b, null)).toBe(b);
    expect(boundsConLeyenda(null, l)).toBeNull();
  });

  it("sin categorías no hay leyenda", () => {
    expect(planoLegend([], bounds)).toBeNull();
    expect(planoLegend(["backend"], null)).toBeNull();
  });
});

describe("tokens de plano (FR-007, FR-016)", () => {
  it("toda clase de plano apunta a un token `pl-*` definido y mapeado en Tailwind", () => {
    const clases = [
      ...Object.values(PLANO_CATEGORIES).flatMap((c) => [c.bg, c.bgFocal, c.border, c.text, c.edge, c.fill]),
      PLANO_CONTAINER.bg,
      PLANO_CONTAINER.border,
      PLANO_CONTAINER.text,
    ];
    const i = css.indexOf(":root {");
    const bloque = css.slice(i, css.indexOf("\n  }", i));
    const definidos = new Set([...bloque.matchAll(/--pl-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const clase of clases) {
      const m = /^(?:fill|stroke|text)-pl-([a-z0-9-]+?)(?:\/.+)?$/.exec(clase);
      expect(m, `${clase} no es una clase sobre un token pl-*`).not.toBeNull();
      const token = m![1];
      expect(PLANO_TOKENS as readonly string[], `${clase}: token desconocido`).toContain(token);
      expect(definidos.has(token), `--pl-${token} no está en :root`).toBe(true);
      expect(config.includes(`var(--pl-${token})`), `--pl-${token} no está en tailwind.config.ts`).toBe(true);
    }
  });

  it("la lámina es oscura en los dos temas: el bloque oscuro repite los mismos valores (FR-007)", () => {
    const valores = (selector: string) => {
      const i = css.indexOf(selector);
      const bloque = css.slice(i, css.indexOf("\n  }", i));
      return Object.fromEntries([...bloque.matchAll(/--pl-([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    };
    const claro = valores(":root {");
    expect(Object.keys(claro).sort()).toEqual([...PLANO_TOKENS].sort());
    expect(valores(".dark {")).toEqual(claro);
  });

  it("el lienzo plano redefine el cromo y usa monoespaciada", () => {
    const i = css.indexOf('[data-skin="plano"] {');
    expect(i).toBeGreaterThan(-1);
    const bloque = css.slice(i, css.indexOf("}", i));
    for (const v of ["--canvas:", "--canvas-edge:", "--canvas-grid:", "--canvas-grid-major:", "font-family"]) {
      expect(bloque, v).toContain(v);
    }
  });
});
