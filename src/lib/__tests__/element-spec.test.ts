import { describe, it, expect } from "vitest";
import {
  MAX_HISTORIAS,
  MAX_ITEMS_LISTA,
  emptySpec,
  isSpecEmpty,
  specWithSeededDate,
  nextPriority,
  etiqueta,
  moveItem,
  nuevaHistoria,
  nuevoEscenario,
  nuevoRequisito,
  nuevaEntidad,
  nuevoCriterio,
  sanitizeSpec,
  specFromLines,
  mergeSpec,
  specToMarkdown,
  specFileName,
  type ElementSpec,
} from "../element-spec";

/** Spec mínima con datos, para no repetir el armado en cada prueba. */
const conDatos = (): ElementSpec => ({
  ...emptySpec(),
  featureName: "Cobro recurrente",
  stories: [{ ...nuevaHistoria("P1"), titulo: "Cobrar la cuota" }],
});

describe("emptySpec / isSpecEmpty", () => {
  it("nace en borrador, sin fecha y sin listas", () => {
    const s = emptySpec();
    expect(s.status).toBe("borrador");
    expect(s.createdAt).toBeUndefined();
    expect(s.stories).toEqual([]);
    expect(s.requirements).toEqual([]);
  });

  it("una spec recién creada está vacía (no se persiste)", () => {
    expect(isSpecEmpty(emptySpec())).toBe(true);
    expect(isSpecEmpty(undefined)).toBe(true);
  });

  it("el estado por defecto NO cuenta como dato", () => {
    // Si contara, todo elemento abierto una vez quedaría con spec en el archivo.
    expect(isSpecEmpty({ ...emptySpec(), status: "borrador" })).toBe(true);
  });

  it("cambiar el estado sí cuenta como dato", () => {
    expect(isSpecEmpty({ ...emptySpec(), status: "aprobada" })).toBe(false);
  });

  it("una historia con todos sus campos vacíos no cuenta como dato", () => {
    expect(isSpecEmpty({ ...emptySpec(), stories: [nuevaHistoria("P1")] })).toBe(true);
  });

  it("una historia con título cuenta como dato", () => {
    expect(isSpecEmpty(conDatos())).toBe(false);
  });

  it("un caso límite escrito cuenta; uno en blanco no", () => {
    expect(isSpecEmpty({ ...emptySpec(), edgeCases: ["   "] })).toBe(true);
    expect(isSpecEmpty({ ...emptySpec(), edgeCases: ["¿y si no hay saldo?"] })).toBe(false);
  });
});

describe("specWithSeededDate", () => {
  it("siembra la fecha la primera vez que hay datos", () => {
    expect(specWithSeededDate(conDatos(), "2026-08-27").createdAt).toBe("2026-08-27");
  });

  it("no siembra nada si la spec sigue vacía", () => {
    expect(specWithSeededDate(emptySpec(), "2026-08-27").createdAt).toBeUndefined();
  });

  it("no pisa la fecha que el usuario corrigió a mano", () => {
    const s = { ...conDatos(), createdAt: "2020-01-01" };
    expect(specWithSeededDate(s, "2026-08-27").createdAt).toBe("2020-01-01");
  });
});

describe("nextPriority", () => {
  it("la primera historia es P1", () => {
    expect(nextPriority([])).toBe("P1");
  });

  it("propone la siguiente libre", () => {
    expect(nextPriority([nuevaHistoria("P1"), nuevaHistoria("P2")])).toBe("P3");
  });

  it("rellena el hueco que dejó una historia borrada", () => {
    expect(nextPriority([nuevaHistoria("P1"), nuevaHistoria("P3")])).toBe("P2");
  });

  it("una prioridad repetida no rompe la propuesta", () => {
    expect(nextPriority([nuevaHistoria("P1"), nuevaHistoria("P1")])).toBe("P2");
  });

  it("una prioridad escrita a mano y rara no rompe nada", () => {
    expect(nextPriority([{ ...nuevaHistoria("P1"), prioridad: "urgente" }])).toBe("P1");
  });
});

describe("etiqueta", () => {
  it("numera desde 1 con tres dígitos", () => {
    expect(etiqueta("FR", 0)).toBe("FR-001");
    expect(etiqueta("SC", 9)).toBe("SC-010");
  });

  it("pasado el 999 no recorta: sigue creciendo", () => {
    expect(etiqueta("FR", 999)).toBe("FR-1000");
  });

  it("borrar el del medio deja los visibles sin huecos", () => {
    const reqs = [nuevoRequisito(), nuevoRequisito(), nuevoRequisito()];
    const quedan = reqs.filter((_, i) => i !== 1);
    expect(quedan.map((_, i) => etiqueta("FR", i))).toEqual(["FR-001", "FR-002"]);
  });
});

describe("moveItem", () => {
  it("mueve y conserva el resto en orden", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("fuera de rango devuelve la lista tal cual", () => {
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("no muta la lista original", () => {
    const original = ["a", "b"];
    moveItem(original, 0, 1);
    expect(original).toEqual(["a", "b"]);
  });
});

describe("ids de las piezas nuevas", () => {
  it("cada pieza nace con un id único (sirve de key de React)", () => {
    const ids = [nuevaHistoria("P1").id, nuevaHistoria("P2").id, nuevoEscenario().id, nuevoRequisito().id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("una historia nueva trae la prioridad pedida y ningún escenario", () => {
    const h = nuevaHistoria("P2");
    expect(h.prioridad).toBe("P2");
    expect(h.escenarios).toEqual([]);
  });
});

describe("sanitizeSpec", () => {
  it("lo que no es objeto no es una spec", () => {
    expect(sanitizeSpec(null)).toBeUndefined();
    expect(sanitizeSpec("# spec")).toBeUndefined();
    expect(sanitizeSpec(42)).toBeUndefined();
  });

  it("una spec vacía que llega de afuera se descarta (no ensucia el modelo)", () => {
    expect(sanitizeSpec(emptySpec())).toBeUndefined();
  });

  it("completa lo que falta y descarta lo que no sirve", () => {
    const s = sanitizeSpec({
      featureName: "Cobro",
      stories: [{ titulo: "Cobrar" }, "basura", null],
      requirements: [{ texto: "El sistema DEBE cobrar" }, { texto: "" }],
      edgeCases: ["sin saldo", 7],
    });
    expect(s?.status).toBe("borrador");
    expect(s?.stories).toHaveLength(1);
    expect(s?.stories[0].id).toBeTruthy();
    expect(s?.stories[0].escenarios).toEqual([]);
    expect(s?.requirements).toHaveLength(1);
    expect(s?.edgeCases).toEqual(["sin saldo"]);
  });

  it("un estado inventado cae en borrador", () => {
    expect(sanitizeSpec({ featureName: "x", status: "publicada" })?.status).toBe("borrador");
  });

  it("recorta a los topes en vez de dejar crecer la caja sin límite", () => {
    const s = sanitizeSpec({
      featureName: "x",
      stories: Array.from({ length: MAX_HISTORIAS + 5 }, (_, i) => ({ titulo: `h${i}` })),
      requirements: Array.from({ length: MAX_ITEMS_LISTA + 5 }, (_, i) => ({ texto: `r${i}` })),
    });
    expect(s?.stories).toHaveLength(MAX_HISTORIAS);
    expect(s?.requirements).toHaveLength(MAX_ITEMS_LISTA);
  });

  it("preserva la marca de «necesita aclaración» y los escenarios", () => {
    const s = sanitizeSpec({
      featureName: "x",
      requirements: [{ texto: "algo", needsClarification: true }],
      stories: [{ titulo: "h", escenarios: [{ given: "a", when: "b", then: "c" }] }],
    });
    expect(s?.requirements[0].needsClarification).toBe(true);
    expect(s?.stories[0].escenarios[0]).toMatchObject({ given: "a", when: "b", then: "c" });
  });
});

describe("mergeSpec", () => {
  it("una spec con datos no la gana una vacía", () => {
    const a = conDatos();
    expect(mergeSpec(a, [undefined])).toEqual(a);
    expect(mergeSpec(undefined, [a])).toEqual(a);
    expect(mergeSpec(a, [emptySpec()])).toEqual(a);
    expect(mergeSpec(emptySpec(), [a])).toEqual(a);
  });

  it("sin datos por ningún lado no hay spec", () => {
    expect(mergeSpec(undefined, [undefined])).toBeUndefined();
    expect(mergeSpec(emptySpec(), [emptySpec()])).toBeUndefined();
    expect(mergeSpec(undefined)).toBeUndefined();
  });

  it("con datos en las dos manda el PRINCIPAL (es la caja que sobrevive)", () => {
    const principal = conDatos();
    const otra = { ...conDatos(), featureName: "Cobro heredado" };
    expect(mergeSpec(principal, [otra])?.featureName).toBe("Cobro recurrente");
  });

  it("hereda la PRIMERA secundaria con datos", () => {
    const primera = { ...conDatos(), featureName: "primera" };
    const segunda = { ...conDatos(), featureName: "segunda" };
    expect(mergeSpec(emptySpec(), [undefined, primera, segunda])?.featureName).toBe("primera");
  });
});

describe("specToMarkdown", () => {
  const completa = (): ElementSpec => ({
    featureName: "Cobro recurrente",
    createdAt: "2026-08-27",
    status: "borrador",
    input: "quiero cobrar la cuota todos los meses",
    stories: [
      {
        ...nuevaHistoria("P1"),
        titulo: "Cobrar la cuota",
        porQue: "sin cobro no hay negocio",
        pruebaIndependiente: "se prueba con una cuota vencida",
        escenarios: [{ ...nuevoEscenario(), given: "una cuota vencida", when: "corre el cobro", then: "se marca pagada" }],
      },
    ],
    edgeCases: ["¿y si no hay saldo?"],
    requirements: [
      { ...nuevoRequisito(), texto: "El sistema MUST cobrar la cuota" },
      { ...nuevoRequisito(), texto: "El sistema MUST avisar el fallo", needsClarification: true },
    ],
    entities: [{ ...nuevaEntidad(), nombre: "Cuota", descripcion: "lo que se cobra cada mes" }],
    criteria: [{ ...nuevoCriterio(), texto: "El 99 % de los cobros se resuelve en un intento" }],
  });

  it("arma la plantilla en orden", () => {
    const md = specToMarkdown(completa(), "Enrollment API");
    const secciones = [
      "# Feature Specification: Cobro recurrente",
      "**Created**: 2026-08-27",
      "**Status**: Borrador",
      '**Input**: User description: "quiero cobrar la cuota todos los meses"',
      "## User Stories *(mandatory)*",
      "### User Story 1 - Cobrar la cuota (Priority: P1)",
      "**Why this priority**: sin cobro no hay negocio",
      "**Independent Test**: se prueba con una cuota vencida",
      "**Acceptance Scenarios**:",
      "1. **Given** una cuota vencida, **When** corre el cobro, **Then** se marca pagada",
      "### Edge Cases",
      "- ¿y si no hay saldo?",
      "## Requirements *(mandatory)*",
      "### Functional Requirements",
      "- **FR-001**: El sistema MUST cobrar la cuota",
      "### Key Entities",
      "- **Cuota**: lo que se cobra cada mes",
      "## Success Criteria *(mandatory)*",
      "### Measurable Outcomes",
      "- **SC-001**: El 99 % de los cobros se resuelve en un intento",
    ];
    let desde = 0;
    for (const s of secciones) {
      const pos = md.indexOf(s, desde);
      expect(pos, `falta o está fuera de orden: ${s}`).toBeGreaterThanOrEqual(0);
      desde = pos;
    }
  });

  it("marca los requisitos que necesitan aclaración", () => {
    const md = specToMarkdown(completa(), "x");
    expect(md).toContain("- **FR-002**: El sistema MUST avisar el fallo [NEEDS CLARIFICATION]");
  });

  it("sin nombre de feature usa el nombre del elemento", () => {
    const md = specToMarkdown({ ...conDatos(), featureName: "  " }, "Enrollment API");
    expect(md).toContain("# Feature Specification: Enrollment API");
  });

  it("omite las secciones sin datos y sigue siendo markdown válido", () => {
    const md = specToMarkdown(conDatos(), "x");
    expect(md).not.toContain("### Edge Cases");
    expect(md).not.toContain("### Key Entities");
    expect(md).toContain("## User Stories *(mandatory)*");
  });

  it("el texto del usuario viaja literal (pipes, almohadillas, asteriscos)", () => {
    const raro = "a | b # c *d* \\ e";
    const md = specToMarkdown({ ...emptySpec(), featureName: "x", edgeCases: [raro] }, "x");
    expect(md).toContain(`- ${raro}`);
  });

  it("un caso límite multilínea se sangra sin partir la lista", () => {
    const md = specToMarkdown({ ...emptySpec(), featureName: "x", edgeCases: ["primera\nsegunda"] }, "x");
    expect(md).toContain("- primera\n  segunda");
  });

  it("una spec vacía no produce un documento fantasma", () => {
    expect(specToMarkdown(emptySpec(), "Enrollment API")).toBe("");
  });
});

describe("specFileName", () => {
  it("deriva del nombre de la feature", () => {
    expect(specFileName(conDatos(), "Enrollment API")).toBe("cobro-recurrente-spec.md");
  });

  it("sin nombre de feature usa el del elemento", () => {
    expect(specFileName({ ...conDatos(), featureName: "" }, "Enrollment API v3")).toBe(
      "enrollment-api-v3-spec.md"
    );
  });

  it("sin nombre por ningún lado igual devuelve un archivo abrible", () => {
    expect(specFileName(emptySpec(), "   ")).toBe("spec.md");
  });

  it("los acentos y los caracteres de ruta no llegan al nombre", () => {
    expect(specFileName({ ...conDatos(), featureName: "Gestión/Pagos: v2" }, "x")).toBe(
      "gestion-pagos-v2-spec.md"
    );
  });
});

describe("specFromLines (borrador de la IA)", () => {
  const salida = [
    "Claro, aquí tienes la especificación:",
    "FEATURE | Cobro recurrente",
    "HISTORIA | Cobrar la cuota | P1 | sin cobro no hay negocio | con una cuota vencida",
    "ESCENARIO | una cuota vencida | corre el cobro | queda pagada",
    "HISTORIA | Avisar el fallo | P2 | el usuario tiene que saber | con la tarjeta rechazada",
    "CASO | ¿y si no hay saldo?",
    "REQUISITO | El sistema MUST cobrar la cuota",
    "ENTIDAD | Cuota | lo que se cobra cada mes",
    "CRITERIO | 99 % de los cobros en un intento",
  ].join("\n");

  it("lee el borrador entero e ignora la prosa del modelo", () => {
    const spec = specFromLines(salida)!;
    expect(spec.featureName).toBe("Cobro recurrente");
    expect(spec.stories.map((h) => h.prioridad)).toEqual(["P1", "P2"]);
    expect(spec.stories[0].escenarios).toHaveLength(1);
    expect(spec.edgeCases).toEqual(["¿y si no hay saldo?"]);
    expect(spec.requirements[0].texto).toBe("El sistema MUST cobrar la cuota");
    expect(spec.entities[0]).toMatchObject({ nombre: "Cuota", descripcion: "lo que se cobra cada mes" });
    expect(spec.criteria[0].texto).toBe("99 % de los cobros en un intento");
  });

  it("un escenario colgado antes de cualquier historia se descarta", () => {
    const spec = specFromLines("ESCENARIO | a | b | c\nREQUISITO | algo")!;
    expect(spec.stories).toEqual([]);
    expect(spec.requirements).toHaveLength(1);
  });

  it("una historia sin prioridad recibe la siguiente libre", () => {
    const spec = specFromLines("HISTORIA | Cobrar\nHISTORIA | Avisar")!;
    expect(spec.stories.map((h) => h.prioridad)).toEqual(["P1", "P2"]);
  });

  it("una respuesta que no dice nada no produce spec", () => {
    expect(specFromLines("No puedo ayudarte con eso.")).toBeUndefined();
    expect(specFromLines("")).toBeUndefined();
    expect(specFromLines("REQUISITO |")).toBeUndefined();
  });

  it("los escenarios se cuelgan de la ÚLTIMA historia leída", () => {
    const spec = specFromLines(
      ["HISTORIA | A | P1", "HISTORIA | B | P2", "ESCENARIO | x | y | z"].join("\n")
    )!;
    expect(spec.stories[0].escenarios).toHaveLength(0);
    expect(spec.stories[1].escenarios).toHaveLength(1);
  });
});
