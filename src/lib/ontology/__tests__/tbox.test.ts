import { describe, expect, it } from "vitest";
import { NOTATION_IDS, type PredicadoDecl } from "@/lib/notations";
import {
  admite,
  arbolDeClases,
  checkTbox,
  claseDeTipo,
  construirTbox,
  predicadoDe,
  superclases,
  tboxDe,
  tboxMarkdown,
} from "../tbox";
import { ELEMENTO } from "../iri";

// T6 · US1: el reglamento existe, es coherente y se deriva SÓLO del registro.
describe("tboxDe", () => {
  it("Q1 · las seis notaciones son coherentes", () => {
    for (const id of NOTATION_IDS) expect(checkTbox(tboxDe(id)), id).toEqual([]);
  });

  it("US1-AC1 · DDD: «dispara» va de Comando a Evento, y ambos son clases con su rol", () => {
    const t = tboxDe("ddd");
    expect(superclases(t, claseDeTipo(t, "Comando"))).toEqual(
      expect.arrayContaining(["pf:rol/command", "pf:NodoDeFlujo", ELEMENTO])
    );
    expect(superclases(t, claseDeTipo(t, "Evento"))).toContain("pf:rol/event");
    expect(superclases(t, claseDeTipo(t, "Política"))).toContain("pf:rol/policy");
    const dispara = predicadoDe(t, "dispara")!;
    expect(dispara.dominio).toEqual(["command"]);
    expect(dispara.rango).toEqual(["event"]);
    expect(admite(t, dispara, "Comando", "dominio")).toBe(true);
    expect(admite(t, dispara, "Evento", "rango")).toBe(true);
    expect(admite(t, dispara, "Actor", "dominio")).toBe(false);
  });

  it("US1-AC2 · BPMN: Compuerta Exclusiva ⊂ Compuerta ⊂ bifurcación ⊂ nodo de flujo", () => {
    const t = tboxDe("bpmn");
    const exclusiva = claseDeTipo(t, "Compuerta Exclusiva");
    const compuerta = claseDeTipo(t, "Compuerta");
    expect(t.clases.find((c) => c.id === exclusiva)?.padres).toEqual([compuerta]);
    expect(superclases(t, exclusiva)).toEqual([compuerta, "pf:rol/gateway", "pf:NodoDeFlujo", ELEMENTO]);
  });

  it("tipo desconocido cae a la clase raíz (nunca se descarta)", () => {
    expect(claseDeTipo(tboxDe("ddd"), "Tipo que ya no existe")).toBe(ELEMENTO);
  });

  it("las clases generales son disjuntas de a pares", () => {
    const t = tboxDe("c4");
    expect(t.disjuntas).toContainEqual(["pf:NodoDeFlujo", "pf:Agente"]);
    expect(t.disjuntas).toHaveLength(10);
  });

  it("la notación de dibujo libre sólo tiene la raíz, las generales y los universales", () => {
    const t = tboxDe("general");
    expect(t.clases.filter((c) => c.nivel === "rol")).toHaveLength(0);
    expect(t.clases.filter((c) => c.nivel === "tipo").every((c) => c.padres[0] === ELEMENTO)).toBe(true);
    expect(t.predicados.find((p) => p.id === "relacionado_con")).toBeTruthy();
  });
});

describe("SC-009 · una notación nueva hereda sin tocar ontology/", () => {
  it("declarando roles obtiene jerarquía y predicados universales", () => {
    const t = construirTbox({
      notation: {
        id: "sintetica" as never,
        elements: [
          { type: "Orden", icon: "x", bg: "", border: "", text: "" },
          { type: "Hecho", icon: "x", bg: "", border: "", text: "" },
        ],
      },
      roles: { command: ["Orden"], event: ["Hecho"] },
      predicados: [],
    });
    expect(checkTbox(t)).toEqual([]);
    expect(superclases(t, claseDeTipo(t, "Orden"))).toContain("pf:NodoDeFlujo");
    expect(t.predicados.map((p) => p.id)).toContain("provoca");
  });
});

describe("US1-AC4 · checkTbox detecta un reglamento roto", () => {
  const roto = (predicados: PredicadoDecl[], parent?: string) =>
    construirTbox({
      notation: {
        id: "rota" as never,
        elements: [
          { type: "A", icon: "x", bg: "", border: "", text: "", parent: parent ?? "B" },
          { type: "B", icon: "x", bg: "", border: "", text: "", parent: "A" },
        ],
      },
      roles: {},
      predicados,
    });

  it("ciclo de subclase, padre inexistente, dominio inexistente, inversa no recíproca, duplicado, funcional+transitiva", () => {
    const errores = checkTbox(
      roto([
        { id: "x", etiqueta: "x", sinonimos: [], dominio: ["volador" as never], inversa: "y" },
        { id: "y", etiqueta: "y", sinonimos: [] },
        { id: "z", etiqueta: "z", sinonimos: [], funcional: true, transitiva: true, subDe: ["nada"] },
        { id: "z", etiqueta: "z2", sinonimos: [] },
      ])
    ).join("\n");
    expect(errores).toMatch(/ciclo/i);
    expect(errores).toMatch(/volador/);
    expect(errores).toMatch(/recíproca/);
    expect(errores).toMatch(/duplicado.*z/);
    expect(errores).toMatch(/funcional.*transitiva/);
    expect(errores).toMatch(/nada/);
    // El padre se nombra por su IRI (slug del tipo).
    expect(checkTbox(roto([], "Fantasma")).join("\n")).toMatch(/padre inexistente: pf:rota\/fantasma/);
  });
});

describe("FR-007 · el reglamento se puede leer", () => {
  it("árbol de clases desde la raíz y markdown con predicados, dominio y rango", () => {
    const t = tboxDe("ddd");
    const raiz = arbolDeClases(t);
    expect(raiz.id).toBe(ELEMENTO);
    const flujo = raiz.hijos.find((h) => h.id === "pf:NodoDeFlujo")!;
    expect(flujo.hijos.map((h) => h.id)).toContain("pf:rol/command");
    const md = tboxMarkdown(t);
    expect(md).toContain("## Jerarquía de clases");
    expect(md).toContain("Comando");
    expect(md).toMatch(/\*\*dispara\*\*.*Comando.*Evento/);
    expect(md).toContain("transitiva");
  });
});

describe("revisión de F1", () => {
  it("dos tipos con el mismo slug son un error, no una fusión silenciosa", () => {
    const t = construirTbox({
      notation: {
        id: "slug" as never,
        elements: [
          { type: "Read Model", icon: "x", bg: "", border: "", text: "" },
          { type: "Read-Model", icon: "x", bg: "", border: "", text: "" },
        ],
      },
      roles: {},
      predicados: [],
    });
    expect(checkTbox(t).join("\n")).toMatch(/Clase duplicada pf:slug\/read-model/);
    expect(checkTbox({ ...t, clases: t.clases.slice(0, 1) }).join("\n")).toMatch(/Disjunción con una clase inexistente/);
  });

  it("el memo de superclases no se puede corromper desde afuera", () => {
    const t = tboxDe("bpmn");
    const s = superclases(t, claseDeTipo(t, "Tarea"));
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("los universales entran una vez y los propios vienen del registro", () => {
    const ids = tboxDe("ddd").predicados.map((p) => p.id);
    expect(ids.filter((x) => x === "relacionado_con")).toHaveLength(1);
    expect(ids).toContain("dispara");
  });
});
