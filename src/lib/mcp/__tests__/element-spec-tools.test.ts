import { describe, expect, it } from "vitest";
import {
  getElementSpec,
  setElementSpec,
  specMarkdown,
  specReport,
} from "@/lib/mcp/element-spec-tools";
import type { DiagramModel } from "@/lib/mcp/diagram-builder";

const modelo = (): DiagramModel => ({
  meta: { nombre_proyecto: "Pólizas", notation: "c4", fecha_analisis: "2026-08-27" } as never,
  nodes: [
    { id: "api", nombre: "Enrollment API", tipo_elemento: "Contenedor" },
    { id: "db", nombre: "Policies DB", tipo_elemento: "Base de Datos" },
  ],
  edges: [],
});

/** Spec como la mandaría un agente: sin ids, con lo justo. */
const specDeAgente = () => ({
  featureName: "Alta de póliza",
  status: "borrador",
  input: "el asesor da de alta sin soporte",
  stories: [
    {
      titulo: "Dar de alta",
      prioridad: "P1",
      porQue: "es el único camino",
      pruebaIndependiente: "con un asesor",
      escenarios: [{ given: "asesor con sesión", when: "envía el alta", then: "queda vigente" }],
    },
  ],
  requirements: [{ texto: "El sistema MUST registrar el alta" }],
  criteria: [{ texto: "99 % en un intento" }],
});

describe("setElementSpec", () => {
  it("escribe la spec del elemento y completa lo que el agente no manda", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    const spec = out.nodes[0].spec!;
    expect(spec.featureName).toBe("Alta de póliza");
    expect(spec.stories[0].id).toBeTruthy();
    expect(spec.stories[0].escenarios[0].given).toBe("asesor con sesión");
  });

  it("no toca los demás elementos ni muta el modelo de entrada", () => {
    const m = modelo();
    const out = setElementSpec(m, "api", specDeAgente());
    expect(out.nodes[1].spec).toBeUndefined();
    expect(m.nodes[0].spec).toBeUndefined();
  });

  it("una spec vacía BORRA la que había: es cómo se dice «ya no aplica»", () => {
    const con = setElementSpec(modelo(), "api", specDeAgente());
    const sin = setElementSpec(con, "api", { featureName: "", stories: [] });
    expect(sin.nodes[0].spec).toBeUndefined();
  });

  it("basura no revienta el diagrama: se normaliza como lo que llega de un archivo", () => {
    const out = setElementSpec(modelo(), "api", {
      featureName: "x",
      status: "publicada",
      stories: ["basura", null, { titulo: "vale" }],
      requirements: "no es una lista",
    });
    expect(out.nodes[0].spec!.status).toBe("borrador");
    expect(out.nodes[0].spec!.stories).toHaveLength(1);
    expect(out.nodes[0].spec!.requirements).toEqual([]);
  });

  it("un id que no existe falla nombrando los que hay", () => {
    expect(() => setElementSpec(modelo(), "nope", specDeAgente())).toThrow(/nope[\s\S]*api[\s\S]*db/);
  });
});

describe("getElementSpec", () => {
  it("devuelve la spec escrita", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    expect(getElementSpec(out, "api")!.featureName).toBe("Alta de póliza");
  });

  it("un elemento sin spec devuelve undefined (no un objeto vacío)", () => {
    expect(getElementSpec(modelo(), "db")).toBeUndefined();
  });

  it("un id inexistente falla", () => {
    expect(() => getElementSpec(modelo(), "nope")).toThrow(/nope/);
  });
});

describe("specMarkdown", () => {
  it("de un elemento devuelve la plantilla", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    const md = specMarkdown(out, "api");
    expect(md).toContain("# Feature Specification: Alta de póliza");
    expect(md).toContain("**Given** asesor con sesión");
    expect(md).toContain("- **FR-001**: El sistema MUST registrar el alta");
    expect(md).toContain("- **SC-001**: 99 % en un intento");
  });

  it("del diagrama entero: una sección por elemento CON spec", () => {
    let out = setElementSpec(modelo(), "api", specDeAgente());
    out = setElementSpec(out, "db", { featureName: "Persistencia", requirements: [{ texto: "MUST guardar" }] });
    const md = specMarkdown(out);
    expect(md).toContain("Enrollment API (api)");
    expect(md).toContain("Policies DB (db)");
    expect(md).toContain("Persistencia");
  });

  it("sin especificaciones devuelve vacío, no un documento fantasma", () => {
    expect(specMarkdown(modelo())).toBe("");
    expect(specMarkdown(modelo(), "api")).toBe("");
  });
});

describe("specReport", () => {
  it("dice quién no tiene spec", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    const r = specReport(out);
    expect(r.sinSpec).toEqual(["Policies DB"]);
    expect(r.markdown).toContain("1 de 2");
  });

  it("caza requisitos sin ningún criterio de éxito", () => {
    const out = setElementSpec(modelo(), "api", {
      featureName: "x",
      requirements: [{ texto: "MUST algo" }],
    });
    const estado = specReport(out).estados.find((e) => e.id === "api")!;
    expect(estado.requisitosSinCriterios).toBe(true);
    expect(specReport(out).markdown).toMatch(/ningún criterio de éxito/);
  });

  it("no se queja si los requisitos tienen criterios", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    expect(specReport(out).estados.find((e) => e.id === "api")!.requisitosSinCriterios).toBe(false);
  });

  it("lista lo marcado «necesita aclaración»", () => {
    const out = setElementSpec(modelo(), "api", {
      featureName: "x",
      requirements: [{ texto: "MUST autenticar", needsClarification: true }],
      criteria: [{ texto: "algo medible" }],
    });
    expect(specReport(out).estados.find((e) => e.id === "api")!.porAclarar).toEqual(["MUST autenticar"]);
    expect(specReport(out).markdown).toContain("por aclarar");
  });

  it("caza historias sin escenarios: no se pueden verificar", () => {
    const out = setElementSpec(modelo(), "api", {
      featureName: "x",
      stories: [{ titulo: "Dar de alta", prioridad: "P1" }],
    });
    expect(specReport(out).estados.find((e) => e.id === "api")!.historiasSinEscenarios).toEqual([
      "Dar de alta",
    ]);
  });

  it("un diagrama con todo completo lo dice", () => {
    const out = setElementSpec(modelo(), "api", specDeAgente());
    const soloApi = { ...out, nodes: [out.nodes[0]] };
    expect(specReport(soloApi).markdown).toContain("están completas");
  });

  it("un diagrama sin elementos no revienta", () => {
    expect(specReport({ ...modelo(), nodes: [] }).sinSpec).toEqual([]);
  });
});
