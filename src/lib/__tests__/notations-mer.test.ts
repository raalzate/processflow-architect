/**
 * MER — Modelo Entidad-Relación: lo que hace que un MER se lea COMO un MER.
 *
 * El registro de notaciones ya tiene pruebas genéricas (paleta ↔ elementos,
 * iconos, ayuda, contraste). Acá va lo que es propio de esta notación y que
 * ninguna regla genérica ve: que la simbología de Chen esté declarada (rombo
 * para la relación, elipse para el atributo, línea doble para lo débil,
 * punteada para lo derivado) y que la CARDINALIDAD tenga marca en cada punta.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_ELEMENTS,
  NOTATION_IDS,
  NOTATION_LIST,
  getNotation,
  isTableType,
  notationTypes,
  roleOfType,
  typesWithRole,
} from "@/lib/notations";
import { EDGE_RELATION_LIST, markerShape, relationStyle } from "@/lib/edge-relations";
import { NOTATION_HELP } from "@/lib/notation-help";

const MER = getNotation("mer");

describe("la notación MER existe y es elegible", () => {
  it("está en el registro, en la lista de ids y en la de los SELECT", () => {
    expect(MER.id).toBe("mer");
    expect(NOTATION_IDS).toContain("mer");
    expect(NOTATION_LIST.map((n) => n.id)).toContain("mer");
  });

  it("arranca por la entidad fuerte y la ofrece como tipo de nodo", () => {
    expect(MER.defaultType).toBe("Entidad Fuerte");
    expect(notationTypes("mer")).toContain("Entidad Fuerte");
    // El Esquema es contenedor: se crea arrastrando un marco, no como nodo.
    expect(notationTypes("mer")).not.toContain("Esquema");
    expect(notationTypes("mer", { includeContainers: true })).toContain("Esquema");
  });

  it("no arrastra tipos de otras notaciones (ni al revés)", () => {
    expect(notationTypes("mer")).not.toContain("Clase");
    expect(notationTypes("uml")).not.toContain("Entidad Fuerte");
  });
});

describe("simbología de Chen", () => {
  it("la entidad es rectángulo, la relación rombo y el atributo elipse", () => {
    expect(ALL_ELEMENTS["Entidad Fuerte"].shape).toBe("rect");
    expect(ALL_ELEMENTS["Relación"].shape).toBe("diamond");
    expect(ALL_ELEMENTS["Atributo"].shape).toBe("ellipse");
  });

  it("lo DÉBIL y lo MULTIVALUADO llevan línea doble", () => {
    for (const t of ["Entidad Débil", "Relación Identificadora", "Atributo Multivaluado"]) {
      expect(ALL_ELEMENTS[t].outline, t).toBe("double");
    }
    // Su contraparte simple no la lleva: si no, la doble no diría nada.
    expect(ALL_ELEMENTS["Entidad Fuerte"].outline).toBeUndefined();
    expect(ALL_ELEMENTS["Relación"].outline).toBeUndefined();
  });

  it("el atributo DERIVADO es punteado (se calcula, no se almacena)", () => {
    expect(ALL_ELEMENTS["Atributo Derivado"].outline).toBe("dashed");
  });

  it("la jerarquía ISA es un triángulo", () => {
    expect(ALL_ELEMENTS["Jerarquía (ISA)"].shape).toBe("triangle");
  });
});

describe("el modelo completo está cubierto", () => {
  const tipos = MER.elements.map((e) => e.type);

  it("declara entidades, relaciones, atributos y bajada a tablas", () => {
    for (const t of [
      "Entidad Fuerte",
      "Entidad Débil",
      "Entidad Asociativa",
      "Relación",
      "Relación Identificadora",
      "Jerarquía (ISA)",
      "Categoría (Unión)",
      "Atributo",
      "Atributo Clave",
      "Clave Parcial",
      "Atributo Compuesto",
      "Atributo Multivaluado",
      "Atributo Derivado",
      "Tabla Relacional",
      "Clave Primaria (PK)",
      "Clave Foránea (FK)",
      "Restricción",
      "Índice",
      "Esquema",
    ]) {
      expect(tipos, t).toContain(t);
    }
  });

  it("cada tipo del MER explica qué es (el «?» de la paleta)", () => {
    for (const t of tipos) expect(NOTATION_HELP[t], t).toBeTruthy();
  });

  it("sus tipos no pisan los de otra notación (el índice global es por tipo)", () => {
    for (const n of NOTATION_LIST) {
      if (n.id === "mer") continue;
      const ajenos = new Set(n.elements.map((e) => e.type));
      for (const t of tipos) expect(ajenos.has(t), `${t} también está en ${n.id}`).toBe(false);
    }
  });
});

describe("roles semánticos del MER", () => {
  it("clasifica entidad, relación y atributo (no hay flujo que clasificar)", () => {
    expect(typesWithRole("mer", "entity")).toContain("Entidad Fuerte");
    expect(typesWithRole("mer", "relationship")).toContain("Relación");
    expect(typesWithRole("mer", "attribute")).toContain("Atributo Clave");
    expect(roleOfType("mer", "Esquema")).toBe("boundary");
    expect(typesWithRole("mer", "start")).toEqual([]);
  });
});

describe("cardinalidad en la arista", () => {
  it("el SELECT ofrece las cinco cardinalidades del MER", () => {
    for (const k of [
      "cardinalidad_1_1",
      "cardinalidad_1_n",
      "cardinalidad_0_1",
      "cardinalidad_0_n",
      "cardinalidad_n_m",
    ]) {
      expect(EDGE_RELATION_LIST, k).toContain(k);
    }
  });

  it("cada cardinalidad marca LAS DOS puntas y no puntea la línea", () => {
    for (const k of EDGE_RELATION_LIST.filter((r) => r.startsWith("cardinalidad_"))) {
      const r = relationStyle(k);
      expect(r.start, k).not.toBe("none");
      expect(r.end, k).not.toBe("none");
      expect(r.dashed, k).toBe(false);
    }
  });

  it("1:N pone uno en el origen y pata de gallo en el destino", () => {
    expect(relationStyle("cardinalidad_1_n").start).toBe("one");
    expect(relationStyle("cardinalidad_1_n").end).toBe("many");
    expect(relationStyle("cardinalidad_n_m").start).toBe("many");
  });

  it("lo OPCIONAL lleva el círculo del cero; lo obligatorio no", () => {
    expect(markerShape("zero-one")!.circle).toBeTruthy();
    expect(markerShape("zero-many")!.circle).toBeTruthy();
    expect(markerShape("one")!.circle).toBeUndefined();
    expect(markerShape("many")!.circle).toBeUndefined();
  });

  it("toda marca declarada trae geometría dibujable en las dos puntas", () => {
    for (const k of EDGE_RELATION_LIST) {
      const r = relationStyle(k);
      for (const m of [r.start, r.end]) {
        if (m === "none" || m === "arrow") continue;
        const g = markerShape(m);
        expect(g, `${k} · ${m}`).toBeTruthy();
        expect(g!.paths.length, `${k} · ${m}`).toBeGreaterThan(0);
        expect(g!.size).toBeGreaterThan(0);
        expect(g!.refX).toBeGreaterThanOrEqual(0);
        expect(g!.refXStart).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("la flecha de siempre NO tiene geometría de tabla (la dibuja el lienzo)", () => {
    expect(markerShape("arrow")).toBeUndefined();
    expect(markerShape("none")).toBeUndefined();
  });
});

describe("caja de tabla (MER físico)", () => {
  it("sólo la Tabla Relacional se dibuja como caja de tabla", () => {
    expect(isTableType("Tabla Relacional")).toBe(true);
    // La burbuja de Chen y todo lo demás siguen siendo figuras: la caja con
    // compartimentos es el modelo FÍSICO, no el conceptual.
    for (const t of ["Entidad Fuerte", "Relación", "Atributo", "Clase", "Tarea"]) {
      expect(isTableType(t), t).toBe(false);
    }
  });
});
