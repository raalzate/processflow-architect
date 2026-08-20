import { describe, expect, it } from "vitest";
import {
  EDGE_RELATIONS,
  EDGE_RELATION_LIST,
  edgeIsDashed,
  relationStyle,
} from "@/lib/edge-relations";

describe("relaciones de arista", () => {
  it("la asociación es la caída: relación ausente o desconocida", () => {
    expect(relationStyle(undefined)).toBe(EDGE_RELATIONS.asociacion);
    expect(relationStyle("chachareo")).toBe(EDGE_RELATIONS.asociacion);
  });

  it("la herencia lleva triángulo hueco al destino y trazo continuo", () => {
    const h = relationStyle("herencia");
    expect(h.end).toBe("triangle");
    expect(h.start).toBe("none");
    expect(h.dashed).toBe(false);
  });

  it("la realización es la herencia PUNTEADA (implementa una interfaz)", () => {
    expect(relationStyle("realizacion").end).toBe("triangle");
    expect(relationStyle("realizacion").dashed).toBe(true);
  });

  it("composición y agregación ponen el rombo del lado del TODO (el origen)", () => {
    expect(relationStyle("composicion").start).toBe("diamond");
    expect(relationStyle("agregacion").start).toBe("diamond-open");
    // Con rombo no va flecha en el otro extremo: sería doble lectura.
    expect(relationStyle("composicion").end).toBe("none");
    expect(relationStyle("agregacion").end).toBe("none");
  });

  it("la lista del SELECT cubre la tabla y arranca por la asociación", () => {
    expect(EDGE_RELATION_LIST[0]).toBe("asociacion");
    expect([...EDGE_RELATION_LIST].sort()).toEqual(Object.keys(EDGE_RELATIONS).sort());
  });

  it("toda relación declara etiqueta y pista para la ficha", () => {
    for (const [k, v] of Object.entries(EDGE_RELATIONS)) {
      expect(v.label.length, k).toBeGreaterThan(3);
      expect(v.hint.length, k).toBeGreaterThan(10);
    }
  });

  describe("edgeIsDashed", () => {
    it("la relación decide el trazo", () => {
      expect(edgeIsDashed({ relation: "dependencia" })).toBe(true);
      expect(edgeIsDashed({ relation: "herencia" })).toBe(false);
    });

    it("`dashed` a mano gana: el retorno de secuencia es punteado sin relación UML", () => {
      expect(edgeIsDashed({ dashed: true })).toBe(true);
      expect(edgeIsDashed({ relation: "herencia", dashed: true })).toBe(true);
    });

    it("una arista sin nada es continua", () => {
      expect(edgeIsDashed({})).toBe(false);
    });
  });
});
