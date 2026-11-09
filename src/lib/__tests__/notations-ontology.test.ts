import { describe, expect, it } from "vitest";
import {
  CLASE_GENERAL_LIST,
  ELEMENT_ROLE_LIST,
  NOTATION_LIST,
  NOTATION_PREDICATES,
  ROLE_GENERAL,
  ROLE_LABELS,
  UNIVERSAL_PREDICATES,
  notationPredicates,
  roleOfType,
  roleOfTypeDeep,
  typesWithRole,
} from "@/lib/notations";
import { EDGE_RELATION_LIST } from "@/lib/edge-relations";

// Spec 027 · T5: el catálogo de predicados vive en el registro y se declara
// sobre ROLES. Estas pruebas barren el registro entero para que una notación o
// un predicado nuevo no pueda entrar roto (dominio inexistente, padre fantasma,
// relación UML/MER sin lectura).

const TERMINOS = new Set<string>([...ELEMENT_ROLE_LIST, ...CLASE_GENERAL_LIST]);

describe("roles y clases generales", () => {
  it("todo rol tiene clase general y etiqueta", () => {
    for (const r of ELEMENT_ROLE_LIST) {
      expect(CLASE_GENERAL_LIST).toContain(ROLE_GENERAL[r]);
      expect(ROLE_LABELS[r].length).toBeGreaterThan(1);
    }
  });
});

describe("catálogo de predicados por notación", () => {
  it("toda notación del registro tiene catálogo (aunque sea vacío)", () => {
    for (const n of NOTATION_LIST) expect(Array.isArray(NOTATION_PREDICATES[n.id])).toBe(true);
  });

  it("ids únicos dentro de cada notación (universales + propios)", () => {
    for (const n of NOTATION_LIST) {
      const ids = notationPredicates(n.id).map((p) => p.id);
      expect(new Set(ids).size, n.id).toBe(ids.length);
    }
  });

  it("dominio y rango sólo nombran roles o clases generales que existen", () => {
    for (const n of NOTATION_LIST) {
      for (const p of notationPredicates(n.id)) {
        for (const t of [...(p.dominio ?? []), ...(p.rango ?? [])]) {
          expect(TERMINOS.has(t), `${n.id}/${p.id}: «${t}»`).toBe(true);
        }
      }
    }
  });

  it("un predicado propio nombra roles que la notación declara (si no, nunca aplicaría)", () => {
    for (const n of NOTATION_LIST) {
      for (const p of NOTATION_PREDICATES[n.id]) {
        for (const t of [...(p.dominio ?? []), ...(p.rango ?? [])]) {
          if ((CLASE_GENERAL_LIST as string[]).includes(t)) continue;
          expect(typesWithRole(n.id, t as never).length, `${n.id}/${p.id}: rol «${t}»`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("cada relación UML/MER se lee como un predicado (FR-005)", () => {
    const relaciones = new Set(
      NOTATION_LIST.flatMap((n) => notationPredicates(n.id)).map((p) => p.relacion).filter(Boolean)
    );
    for (const k of EDGE_RELATION_LIST) expect(relaciones.has(k), k).toBe(true);
  });

  it("los universales incluyen los de FR-004 y el genérico no tiene dominio ni rango", () => {
    const ids = UNIVERSAL_PREDICATES.map((p) => p.id);
    for (const id of ["pertenece_a", "es_mismo_que", "realiza", "depende_de", "relacionado_con"]) {
      expect(ids).toContain(id);
    }
    const generico = UNIVERSAL_PREDICATES.find((p) => p.id === "relacionado_con")!;
    expect(generico.dominio).toBeUndefined();
    expect(generico.rango).toBeUndefined();
  });

  it("la notación de dibujo libre sólo tiene los universales", () => {
    expect(notationPredicates("general")).toEqual(UNIVERSAL_PREDICATES);
  });
});

describe("jerarquía de tipos (parent)", () => {
  it("todo padre existe en SU notación y no es él mismo", () => {
    for (const n of NOTATION_LIST) {
      const tipos = new Set(n.elements.map((e) => e.type));
      for (const e of n.elements) {
        if (!e.parent) continue;
        expect(tipos.has(e.parent), `${n.id}: ${e.type} → ${e.parent}`).toBe(true);
        expect(e.parent).not.toBe(e.type);
      }
    }
  });

  it("roleOfTypeDeep hereda el rol del padre y respeta el propio", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        const propio = roleOfType(n.id, e.type);
        if (propio) expect(roleOfTypeDeep(n.id, e.type)).toBe(propio);
        else if (e.parent) expect(roleOfTypeDeep(n.id, e.type)).toBe(roleOfType(n.id, e.parent));
      }
    }
    expect(roleOfTypeDeep("ddd", "no-existe")).toBeUndefined();
  });
});
