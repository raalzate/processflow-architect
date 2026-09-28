import { describe, it, expect } from "vitest";
import {
  MAX_PASOS,
  MAX_ITEMS_LISTA,
  emptySpec,
  isSpecEmpty,
  specWithSeededDate,
  etiqueta,
  moveItem,
  nuevoPaso,
  nuevoEscenario,
  nuevoRequisito,
  nuevaEntidad,
  nuevoCriterio,
  sanitizeSpec,
  specFromLines,
  mergeSpec,
  patchSpec,
  specToMarkdown,
  specFileName,
  type ElementSpec,
} from "../element-spec";

/** Spec mínima con datos, para no repetir el armado en cada prueba. */
const conDatos = (): ElementSpec => ({
  ...emptySpec(),
  featureName: "Cobro recurrente",
  stories: [{ ...nuevoPaso("salida"), ref: "n-bus", hace: "publica CuotaCobrada" }],
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

  it("un paso recién agregado (sin nodo ni datos) no cuenta como dato", () => {
    // El `+` agrega un paso vacío: no debe persistir spec hasta que se llene.
    expect(isSpecEmpty({ ...emptySpec(), stories: [nuevoPaso()] })).toBe(true);
  });

  it("un paso cuenta apenas tiene nodo, o qué hace, o detalle, o escenarios", () => {
    expect(isSpecEmpty({ ...emptySpec(), stories: [{ ...nuevoPaso("entrada"), ref: "n-checkout" }] })).toBe(false);
    expect(isSpecEmpty({ ...emptySpec(), stories: [{ ...nuevoPaso(), hace: "algo" }] })).toBe(false);
    expect(isSpecEmpty({ ...emptySpec(), stories: [{ ...nuevoPaso(), detalle: ["valida stock"] }] })).toBe(false);
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

describe("ids y forma de las piezas nuevas", () => {
  it("cada pieza nace con un id único (sirve de key de React)", () => {
    const ids = [nuevoPaso().id, nuevoPaso().id, nuevoEscenario().id, nuevoRequisito().id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("un paso nuevo es una entrada por defecto, sin nodo ni escenarios", () => {
    expect(nuevoPaso()).toMatchObject({ tipo: "entrada", ref: "", hace: "", detalle: [], escenarios: [] });
    expect(nuevoPaso("salida").tipo).toBe("salida");
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
      stories: [{ tipo: "salida", ref: "n-bus", hace: "publica" }, "basura", null],
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

  it("un paso es {tipo, ref, hace, detalle, escenarios}: acepta nodeId, tipo raro cae en entrada", () => {
    const s = sanitizeSpec({
      featureName: "x",
      stories: [
        { tipo: "inventado", ref: "n-a", hace: "envía el pedido", detalle: ["valida", "  ", 7] },
        { nodeId: "n-b", hace: "publica" }, // acepta nodeId como ref; sin tipo → entrada
      ],
    });
    expect(s?.stories[0]).toMatchObject({ tipo: "entrada", ref: "n-a", hace: "envía el pedido", detalle: ["valida"] });
    expect(s?.stories[1]).toMatchObject({ tipo: "entrada", ref: "n-b", hace: "publica" });
  });

  it("un paso que sólo tiene nodo (sin hace ni escenarios) se conserva", () => {
    const s = sanitizeSpec({ featureName: "x", stories: [{ tipo: "salida", ref: "n-bus" }] });
    expect(s?.stories).toHaveLength(1);
    expect(s?.stories[0]).toMatchObject({ tipo: "salida", ref: "n-bus" });
  });

  it("un archivo viejo conserva los escenarios e IGNORA título/prioridad/porQue/prueba", () => {
    const s = sanitizeSpec({
      featureName: "x",
      stories: [
        {
          titulo: "Cobrar",
          prioridad: "P1",
          porQue: "sin cobro no hay negocio",
          pruebaIndependiente: "con una cuota vencida",
          escenarios: [{ given: "a", when: "b", then: "c" }],
        },
      ],
    });
    expect(s?.stories[0]).toMatchObject({ tipo: "entrada", ref: "", hace: "", detalle: [] });
    expect(s?.stories[0].escenarios[0]).toMatchObject({ given: "a", when: "b", then: "c" });
    for (const viejo of ["titulo", "prioridad", "porQue", "pruebaIndependiente"]) {
      expect(s?.stories[0]).not.toHaveProperty(viejo);
    }
  });

  it("un estado inventado cae en borrador", () => {
    expect(sanitizeSpec({ featureName: "x", status: "publicada" })?.status).toBe("borrador");
  });

  it("recorta a los topes en vez de dejar crecer la caja sin límite", () => {
    const s = sanitizeSpec({
      featureName: "x",
      stories: Array.from({ length: MAX_PASOS + 5 }, (_, i) => ({ tipo: "salida", ref: `n${i}`, hace: "x" })),
      requirements: Array.from({ length: MAX_ITEMS_LISTA + 5 }, (_, i) => ({ texto: `r${i}` })),
    });
    expect(s?.stories).toHaveLength(MAX_PASOS);
    expect(s?.requirements).toHaveLength(MAX_ITEMS_LISTA);
  });

  it("preserva la marca de «necesita aclaración» y los escenarios del paso", () => {
    const s = sanitizeSpec({
      featureName: "x",
      requirements: [{ texto: "algo", needsClarification: true }],
      stories: [{ tipo: "entrada", ref: "n-a", escenarios: [{ given: "a", when: "b", then: "c" }] }],
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
        ...nuevoPaso("entrada"),
        ref: "n-checkout",
        hace: "dispara el cobro",
        detalle: ["valida el saldo", "reserva el cupo"],
        escenarios: [
          { ...nuevoEscenario(), given: "una cuota vencida", when: "corre el cobro", then: "se marca pagada" },
        ],
      },
      { ...nuevoPaso("salida"), ref: "n-bus", hace: "publica CuotaCobrada" },
    ],
    edgeCases: ["¿y si no hay saldo?"],
    requirements: [
      { ...nuevoRequisito(), texto: "El sistema MUST cobrar la cuota" },
      { ...nuevoRequisito(), texto: "El sistema MUST avisar el fallo", needsClarification: true },
    ],
    entities: [{ ...nuevaEntidad(), nombre: "Cuota", descripcion: "lo que se cobra cada mes" }],
    criteria: [{ ...nuevoCriterio(), texto: "El 99 % de los cobros se resuelve en un intento" }],
  });

  // Resolutor de nombres del diagrama: id → nombre de la caja.
  const nombre = (id: string): string =>
    ({ "n-checkout": "Checkout", "n-bus": "Bus de eventos" })[id] ?? id;

  it("arma la plantilla en orden, con cada paso tipado y su detalle", () => {
    const md = specToMarkdown(completa(), "Enrollment API", nombre);
    const secciones = [
      "# Feature Specification: Cobro recurrente",
      "**Created**: 2026-08-27",
      "**Status**: Borrador",
      '**Input**: User description: "quiero cobrar la cuota todos los meses"',
      "## Flow Steps *(mandatory)*",
      "### Step 1 — Input: Checkout",
      "**Does**: dispara el cobro",
      "**Detail**:",
      "- valida el saldo",
      "- reserva el cupo",
      "**Acceptance Scenarios**:",
      "1. **Given** una cuota vencida, **When** corre el cobro, **Then** se marca pagada",
      "### Step 2 — Output: Bus de eventos",
      "**Does**: publica CuotaCobrada",
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

  it("sin resolutor, el paso cae al id del nodo", () => {
    const md = specToMarkdown(completa(), "x");
    expect(md).toContain("### Step 1 — Input: n-checkout");
    expect(md).toContain("### Step 2 — Output: n-bus");
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
    expect(md).toContain("## Flow Steps *(mandatory)*");
  });

  it("un paso sin qué hace ni detalle omite esas líneas", () => {
    const md = specToMarkdown(
      { ...emptySpec(), featureName: "x", stories: [{ ...nuevoPaso("salida"), ref: "n-bus" }] },
      "x",
      (id) => (id === "n-bus" ? "Bus" : id)
    );
    expect(md).toContain("### Step 1 — Output: Bus");
    expect(md).not.toContain("**Does**");
    expect(md).not.toContain("**Detail**");
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
    "CASO | ¿y si no hay saldo?",
    "REQUISITO | El sistema MUST cobrar la cuota",
    "ENTIDAD | Cuota | lo que se cobra cada mes",
    "CRITERIO | 99 % de los cobros en un intento",
  ].join("\n");

  it("lee lo que la IA sí puede redactar e ignora la prosa del modelo", () => {
    const spec = specFromLines(salida)!;
    expect(spec.featureName).toBe("Cobro recurrente");
    expect(spec.edgeCases).toEqual(["¿y si no hay saldo?"]);
    expect(spec.requirements[0].texto).toBe("El sistema MUST cobrar la cuota");
    expect(spec.entities[0]).toMatchObject({ nombre: "Cuota", descripcion: "lo que se cobra cada mes" });
    expect(spec.criteria[0].texto).toBe("99 % de los cobros en un intento");
  });

  it("el FLUJO no lo arma la IA: los pasos los conecta la persona en el lienzo", () => {
    // Un `PASO`/`ESCENARIO` viejo no tiene id de nodo, así que no genera flujo.
    const spec = specFromLines(
      ["FEATURE | X", "PASO | Cobrar la cuota", "ESCENARIO | a | b | c"].join("\n")
    )!;
    expect(spec.stories).toEqual([]);
    expect(spec.featureName).toBe("X");
  });

  it("una respuesta que no dice nada no produce spec", () => {
    expect(specFromLines("No puedo ayudarte con eso.")).toBeUndefined();
    expect(specFromLines("")).toBeUndefined();
    expect(specFromLines("REQUISITO |")).toBeUndefined();
  });
});


describe("patchSpec · completar sin reenviar el contrato entero (#239)", () => {
  const base = (): ElementSpec => ({
    ...emptySpec(),
    featureName: "Cobro recurrente",
    requirements: [{ ...nuevoRequisito(), texto: "El sistema MUST reintentar 3 veces" }],
    criteria: [{ ...nuevoCriterio(), texto: "99 % en un intento" }],
  });

  it("agrega un requisito conservando el resto de la spec", () => {
    const r = patchSpec(base(), { requirements: [{ texto: "El sistema MUST avisar al usuario" }] });
    expect(r?.requirements.map((x) => x.texto)).toEqual([
      "El sistema MUST reintentar 3 veces",
      "El sistema MUST avisar al usuario",
    ]);
    expect(r?.featureName).toBe("Cobro recurrente");
    expect(r?.criteria).toHaveLength(1);
  });

  it("reintentar el mismo parche no duplica ni renumera", () => {
    const parche = { requirements: [{ texto: "El sistema MUST avisar al usuario" }] };
    const una = patchSpec(base(), parche);
    const dos = patchSpec(una, parche);
    expect(dos?.requirements.map((x) => x.texto)).toEqual(una?.requirements.map((x) => x.texto));
  });

  it("un paso con el mismo tipo+nodo se reemplaza EN SU SITIO (actualizarlo no reordena)", () => {
    const con = patchSpec(base(), { stories: [{ tipo: "salida", ref: "n-bus", hace: "publica" }] });
    const act = patchSpec(con, {
      stories: [{ tipo: "salida", ref: "n-bus", hace: "publica", detalle: ["ahora con detalle"] }],
    });
    expect(act?.stories).toHaveLength(1);
    expect(act?.stories[0]).toMatchObject({ tipo: "salida", ref: "n-bus", detalle: ["ahora con detalle"] });
  });

  it("mismo nodo pero distinto tipo son pasos distintos (entrada y salida a la misma caja)", () => {
    const r = patchSpec(base(), {
      stories: [
        { tipo: "entrada", ref: "n-x", hace: "me llama" },
        { tipo: "salida", ref: "n-x", hace: "lo llamo" },
      ],
    });
    expect(r?.stories).toHaveLength(2);
  });

  it("un ítem con el mismo texto se reemplaza EN SU SITIO (quitar «por aclarar» no reordena)", () => {
    const conDuda = patchSpec(base(), {
      requirements: [{ texto: "El sistema MUST reintentar 3 veces", needsClarification: true }],
    });
    expect(conDuda?.requirements[0].needsClarification).toBe(true);
    expect(conDuda?.requirements).toHaveLength(1);
  });

  it("los escalares que vienen pisan y los que no vienen se conservan", () => {
    const r = patchSpec(base(), { status: "revision" });
    expect(r?.status).toBe("revision");
    expect(r?.featureName).toBe("Cobro recurrente");
  });

  it("un parche vacío no borra la spec (a diferencia del reemplazo)", () => {
    expect(patchSpec(base(), {})?.featureName).toBe("Cobro recurrente");
    expect(patchSpec(base(), null)?.featureName).toBe("Cobro recurrente");
  });

  it("parchear sobre una caja sin spec la crea", () => {
    const r = patchSpec(undefined, { criteria: [{ texto: "el 95 % en menos de 2 s" }] });
    expect(r?.criteria.map((c) => c.texto)).toEqual(["el 95 % en menos de 2 s"]);
  });
});
