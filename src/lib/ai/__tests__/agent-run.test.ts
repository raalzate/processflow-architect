/**
 * Ciclo de vida de la corrida (spec 005, escenarios E13–E28 de testify).
 *
 * Lo que estas pruebas protegen: que el humano decida en los dos puntos
 * acordados, que una duda no trabe el flujo, que el presupuesto se respete y —lo
 * más importante— que el artefacto no cite una fuente que el agente nunca leyó.
 */
import { describe, it, expect } from "vitest";
import {
  startRun,
  applyToolCall,
  needsPlan,
  registerPlan,
  fallbackPlan,
  approvePlan,
  adjustPlan,
  cancelRun,
  isCancelled,
  registerQuestion,
  answerQuestion,
  mustConsolidate,
  coverageOf,
  consolidationPrompt,
  validateCitations,
  stripInvalidCitations,
  UNKNOWN_ANSWER,
  RUN_BUDGET,
  unknownPlanSources,
  unreadViews,
  readTarget,
  MAX_RECHAZOS_POR_COBERTURA,
  describeStep,
  memoryBlock,
  unreadPlanSources,
  MAX_LECTURAS_POR_LOTE,
  hasCitations,
  looksLikeNodeDump,
} from "../agent-run";
import type { Catalog, ViewEntry } from "../agent-retrieval";
import type { AgentRunState } from "@/lib/agent-types";
import type { GraphData } from "@/lib/types";

const nodo = (nombre: string, tipo = "Evento", descripcion = "") => ({
  id: nombre.toLowerCase().replace(/\s+/g, "-"),
  nombre,
  tipo_elemento: tipo,
  descripcion,
  estado_comparativo: "nuevo" as const,
});

const grafo = (nodos: ReturnType<typeof nodo>[]): GraphData =>
  ({
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-08-18",
    big_picture: { descripcion: "d", hotspots: [], nodos, aristas: [] },
    agregados: [],
  }) as unknown as GraphData;

const vista = (over: Partial<ViewEntry> & { name: string }): ViewEntry => ({
  notation: "ddd",
  kind: "graph",
  ...over,
});

const cat: Catalog = {
  views: [
    vista({ name: "Pagos", graph: grafo([nodo("Cobrar prima", "Comando"), nodo("Prima cobrada")]) }),
    vista({ name: "Pedidos", graph: grafo([nodo("Crear pedido", "Comando")]) }),
    vista({ name: "Vacía", graph: grafo([]) }),
  ],
};

let n = 0;
const deps = { uid: () => `run-${++n}` };
const nueva = (budget = RUN_BUDGET) => startRun(deps, "generá los drivers", budget);
/**
 * Corrida que ya miró las dos vistas con contenido. Se usa donde lo que se prueba
 * NO es la cobertura: desde que existe el freno de cobertura, registrar un plan
 * sin haber leído nada se devuelve (y eso tiene su propia suite).
 */
const cubierta = (budget = RUN_BUDGET) => {
  let s = applyToolCall(nueva(budget), { tool: "read_view", name: "Pagos" }, cat).state;
  s = applyToolCall(s, { tool: "read_view", name: "Pedidos" }, cat).state;
  return s;
};

describe("applyToolCall · lecturas y presupuesto", () => {
  it("list_views no consume presupuesto y describe el inventario", () => {
    const s0 = nueva();
    const { state, observation } = applyToolCall(s0, { tool: "list_views" }, cat);
    expect(state.budgetLeft).toBe(s0.budgetLeft);
    expect(observation).toContain('"Pagos"');
    expect(observation).toContain("vacía");
  });

  it("descuenta el costo de cada lectura nueva y guarda su nota", () => {
    const s0 = nueva(10_000);
    const r1 = applyToolCall(s0, { tool: "read_view", name: "Pagos" }, cat);
    const r2 = applyToolCall(r1.state, { tool: "read_view", name: "Pedidos" }, cat);
    expect(r1.state.budgetLeft).toBeLessThan(s0.budgetLeft);
    expect(r2.state.budgetLeft).toBeLessThan(r1.state.budgetLeft);
    expect(r2.state.read).toEqual(["Pagos", "Pedidos"]);
    expect(r2.state.notes.map((x) => x.source.name)).toEqual(["Pagos", "Pedidos"]);
    expect(r1.observation).toContain("Cobrar prima");
  });

  it("releer una vista cuesta 0 y avisa", () => {
    const s1 = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    const r = applyToolCall(s1, { tool: "read_view", name: "pagos" }, cat);
    expect(r.state.budgetLeft).toBe(s1.budgetLeft);
    expect(r.state.notes).toHaveLength(1);
    expect(r.observation).toMatch(/Ya leíste/);
  });

  it("una vista pineada no se relee: ya está en el contexto del turno", () => {
    const conPin: Catalog = { views: [vista({ name: "Pagos", pinned: true, graph: grafo([nodo("X")]) })] };
    const s0 = nueva(10_000);
    const r = applyToolCall(s0, { tool: "read_view", name: "Pagos" }, conPin);
    expect(r.state.budgetLeft).toBe(s0.budgetLeft);
    expect(r.observation).toMatch(/ya está en el contexto/);
    expect(r.state.read).toContain("Pagos");
  });

  it("sin presupuesto la observación empuja a consolidar", () => {
    const s0 = nueva(0);
    const r = applyToolCall(s0, { tool: "read_view", name: "Pedidos" }, cat);
    expect(r.observation).toMatch(/presupuesto/i);
    expect(r.observation).toMatch(/[Cc]onsolid/);
    expect(r.state.notes).toHaveLength(0);
  });

  it("vista inexistente devuelve sugerencias, no un muro", () => {
    const r = applyToolCall(nueva(), { tool: "read_view", name: "Ventas" }, cat);
    expect(r.observation).toMatch(/No existe la vista/);
    expect(r.observation).toMatch(/parecidas/);
  });

  it("search_model anota dónde vive cada hallazgo", () => {
    const r = applyToolCall(nueva(), { tool: "search_model", term: "prima" }, cat);
    expect(r.observation).toContain('vista "Pagos"');
    expect(r.state.notes[0].source.type).toBe("model");
  });

  it("herramienta desconocida devuelve observación accionable y no rompe la corrida", () => {
    const s0 = nueva();
    const r = applyToolCall(s0, { tool: "borrar_todo" } as never, cat);
    expect(r.observation).toMatch(/No existe la herramienta/);
    expect(r.observation).toContain("list_views");
    expect(r.state).toBe(s0);
  });
});

describe("plan aprobable", () => {
  const plan = {
    kind: "plan" as const,
    title: "Drivers de arquitectura",
    artifactKind: "drivers",
    sections: [
      { title: "Rendimiento", sources: ["Pagos"] },
      { title: "Cumplimiento", sources: ["Pagos", "PCI.pdf"] },
    ],
  };

  it("sin plan aprobado, generar exige plan", () => {
    expect(needsPlan(nueva())).toBe(true);
  });

  it("registrar el plan deja la corrida esperando al humano", () => {
    const { state, observation } = registerPlan(cubierta(), plan, cat);
    expect(observation).toBeUndefined();
    expect(state.pause).toEqual(plan);
    expect(state.planApproved).toBeUndefined();
  });

  it("rechaza fuentes que no están en el catálogo sin molestar al humano", () => {
    const malo = { ...plan, sections: [{ title: "X", sources: ["Ventas"] }] };
    const { state, observation } = registerPlan(nueva(), malo, cat);
    expect(state.pause).toBeUndefined();
    expect(observation).toMatch(/no existen/);
    expect(observation).toContain('"Pagos"');
  });

  it("un plan sin secciones se rechaza", () => {
    const { observation } = registerPlan(nueva(), { ...plan, sections: [] }, cat);
    expect(observation).toMatch(/al menos una/);
  });

  it("aprobar quita la pausa y habilita la generación", () => {
    const s = approvePlan(registerPlan(cubierta(), plan, cat).state);
    expect(s.pause).toBeUndefined();
    expect(needsPlan(s)).toBe(false);
  });

  it("ajustar conserva notas y presupuesto, y devuelve el feedback al modelo", () => {
    const leido = cubierta(10_000);
    const conPlan = registerPlan(leido, plan, cat).state;
    const { state, observation } = adjustPlan(conPlan, "faltan las restricciones de negocio");
    expect(state.notes).toHaveLength(2); // no se pierde lo leído
    expect(state.budgetLeft).toBe(leido.budgetLeft);
    expect(state.pause).toBeUndefined();
    expect(state.planApproved).toBe(false);
    expect(observation).toContain("restricciones de negocio");
    expect(observation).toMatch(/no vuelvas a leer/);
  });

  it("cancelar termina la corrida con motivo y sin artefactos", () => {
    const s = cancelRun(registerPlan(cubierta(), plan, cat).state, "el humano canceló");
    expect(isCancelled(s)).toBe(true);
    expect(s.cancelledReason).toBe("el humano canceló");
    expect(s.pause).toBeUndefined();
  });
});

describe("preguntas al humano", () => {
  const q = {
    kind: "question" as const,
    id: "dup-cobro",
    text: "¿«Cobro» y «Pago» son el mismo concepto?",
    options: ["Sí, el mismo", "No, distintos"],
  };

  it("deja la corrida esperando con opciones", () => {
    const { state } = registerQuestion(nueva(), q);
    expect(state.pause).toEqual(q);
    expect(state.asked).toEqual(["dup-cobro"]);
  });

  it("una pregunta por id y por corrida: la segunda vez devuelve la decisión previa", () => {
    const esperando = registerQuestion(nueva(), q).state;
    const respondida = answerQuestion(esperando, "No, distintos");
    const otra = registerQuestion(respondida, q);
    expect(otra.state.pause).toBeUndefined();
    expect(otra.observation).toContain("No, distintos");
  });

  it("una pregunta sin opciones se rechaza", () => {
    const { observation } = registerQuestion(nueva(), { ...q, options: [] });
    expect(observation).toMatch(/al menos una opción/);
  });

  it("responder registra la decisión y quita la pausa", () => {
    const s = answerQuestion(registerQuestion(nueva(), q).state, "No, distintos");
    expect(s.pause).toBeUndefined();
    expect(s.decisions).toEqual([
      { questionId: "dup-cobro", question: q.text, answer: "No, distintos" },
    ]);
  });

  it("«no sé» toma la primera opción y la marca como supuesto", () => {
    const s = answerQuestion(registerQuestion(nueva(), q).state, UNKNOWN_ANSWER);
    expect(s.decisions[0]).toEqual({
      questionId: "dup-cobro",
      question: q.text,
      answer: "Sí, el mismo",
      assumed: true,
    });
  });

  it("responder sin pausa no cambia nada", () => {
    const s0 = nueva();
    expect(answerQuestion(s0, "algo")).toBe(s0);
  });
});

describe("agotamiento y cobertura", () => {
  it("sin presupuesto hay que consolidar", () => {
    expect(mustConsolidate(nueva(0), { maxToolTurns: 8 })).toBe(true);
  });

  it("con los turnos agotados hay que consolidar", () => {
    expect(mustConsolidate({ ...nueva(), turn: 8 }, { maxToolTurns: 8 })).toBe(true);
  });

  it("declara vistas leídas y omitidas, y por qué", () => {
    const leido = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    const cob = coverageOf(leido, cat);
    expect(cob.readViews).toEqual(["Pagos"]);
    expect(cob.skippedViews).toEqual(["Pedidos"]); // «Vacía» no es cobertura perdida
    expect(cob.reason).toMatch(/no las consideró/);
  });

  it("si se agotó el presupuesto, el motivo lo dice", () => {
    const s = { ...nueva(0), read: ["Pagos"] };
    expect(coverageOf(s, cat).reason).toMatch(/presupuesto/);
  });

  it("todo leído no deja pendientes ni motivo", () => {
    const s = { ...nueva(), read: ["Pagos", "Pedidos"] };
    const cob = coverageOf(s, cat);
    expect(cob.skippedViews).toEqual([]);
    expect(cob.reason).toBeUndefined();
  });
});

describe("consolidación", () => {
  const conNotas = (): AgentRunState => {
    let s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = applyToolCall(s, { tool: "read_view", name: "Pedidos" }, cat).state;
    s = answerQuestion(
      registerQuestion(s, {
        kind: "question",
        id: "dup",
        text: "¿mismo concepto?",
        options: ["Sí", "No"],
      }).state,
      UNKNOWN_ANSWER
    );
    return { ...s, coverage: coverageOf(s, cat) };
  };

  it("agrupa notas por fuente, no reinyecta el TOON y pide el formato de cita", () => {
    const p = consolidationPrompt(conNotas());
    expect(p).toContain("### Pagos");
    expect(p).toContain("### Pedidos");
    // La evidencia se ofrece PARA CITAR, nunca como una lista para copiar como
    // viñetas: ese matiz es lo que evitaba el volcado de nodos.
    expect(p).toContain("Evidencia disponible para citar");
    expect(p).toContain("Cobrar prima, Prima cobrada");
    expect(p).toContain("↳");
    // El TOON tiene la leyenda tabular; el prompt de consolidación NO debe traerla.
    expect(p).not.toContain("#nodos");
  });

  it("arrastra las decisiones y marca los supuestos", () => {
    const p = consolidationPrompt(conNotas());
    expect(p).toContain("¿mismo concepto? → Sí");
    expect(p).toContain("SUPUESTO");
  });

  it("declara la cobertura para que vaya al artefacto", () => {
    const p = consolidationPrompt(conNotas());
    expect(p).toContain("## Cobertura");
    expect(p).toContain("Pagos, Pedidos");
  });

  it("incluye el plan aprobado cuando existe", () => {
    const plan = {
      kind: "plan" as const,
      title: "Drivers",
      artifactKind: "drivers",
      sections: [{ title: "Rendimiento", sources: ["Pagos"] }],
    };
    const s = approvePlan(registerPlan(conNotas(), plan, cat).state);
    expect(consolidationPrompt(s)).toContain("Rendimiento ← Pagos");
  });
});

describe("validateCitations · la trazabilidad no puede mentir", () => {
  const conLectura = () => applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;

  it("acepta citas respaldadas por una nota", () => {
    const md = "Latencia ≤ 200 ms.\n  ↳ Pagos › Cobrar prima, Prima cobrada";
    expect(validateCitations(md, conLectura())).toEqual({ ok: true, invalid: [] });
  });

  it("acepta la cita a la fuente sin nombrar elementos", () => {
    expect(validateCitations("X\n  ↳ Pagos", conLectura()).ok).toBe(true);
  });

  it("detecta una fuente que nunca se leyó", () => {
    const r = validateCitations("X\n  ↳ Ventas › Facturar", conLectura());
    expect(r.ok).toBe(false);
    expect(r.invalid).toEqual(["Ventas"]);
  });

  it("detecta un elemento inventado dentro de una fuente real", () => {
    const r = validateCitations("X\n  ↳ Pagos › Anular prima", conLectura());
    expect(r.ok).toBe(false);
    expect(r.invalid).toEqual(["Pagos › Anular prima"]);
  });

  it("un markdown sin citas no es inválido (lo cubre la cobertura)", () => {
    expect(validateCitations("Sólo prosa.", conLectura())).toEqual({ ok: true, invalid: [] });
  });

  it("stripInvalidCitations quita sólo las líneas de cita inválidas", () => {
    const md = ["A", "  ↳ Pagos › Cobrar prima", "B", "  ↳ Ventas › Facturar"].join("\n");
    const out = stripInvalidCitations(md, ["Ventas"]);
    expect(out).toContain("↳ Pagos › Cobrar prima");
    expect(out).not.toContain("Ventas");
    expect(out).toContain("B");
  });

  it("sin inválidas devuelve el markdown intacto", () => {
    expect(stripInvalidCitations("A\n  ↳ Pagos", [])).toBe("A\n  ↳ Pagos");
  });
});

describe("AgentRunState · sobrevive el ida y vuelta a JSON", () => {
  it("se serializa y se recupera equivalente", () => {
    let s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = registerQuestion(s, {
      kind: "question",
      id: "q1",
      text: "¿y?",
      options: ["a", "b"],
    }).state;
    const ida = JSON.parse(JSON.stringify(s)) as AgentRunState;
    expect(ida).toEqual(s);
    expect(ida.pause?.kind).toBe("question");
  });
});

/**
 * Incidente de la verificación manual (M4): el contexto revalidaba las fuentes del
 * plan al recargar con SU PROPIA regla, más estricta que la de `registerPlan`. Un
 * plan legítimo que citaba un PDF adjunto se cancelaba solo. Una regla, un lugar.
 */
describe("unknownPlanSources · una sola definición de fuente válida", () => {
  const plan = (sources: string[]) => ({
    kind: "plan" as const,
    title: "T",
    artifactKind: "drivers",
    sections: [{ title: "S", sources }],
  });

  it("una vista del catálogo es válida (con acentos o abreviada)", () => {
    expect(unknownPlanSources(plan(["Pagos"]), cat)).toEqual([]);
    expect(unknownPlanSources(plan(["pagos"]), cat)).toEqual([]);
  });

  it("un documento adjunto es válido: se cita por nombre de archivo", () => {
    expect(unknownPlanSources(plan(["PCI.pdf", "acta.md", "notas.txt"]), cat)).toEqual([]);
  });

  it("las fuentes genéricas del proyecto son válidas", () => {
    expect(unknownPlanSources(plan(["Modelo", "documentos", "chat"]), cat)).toEqual([]);
  });

  it("una vista inexistente no lo es", () => {
    expect(unknownPlanSources(plan(["Ventas"]), cat)).toEqual(["Ventas"]);
  });

  it("una fuente vacía no lo es", () => {
    expect(unknownPlanSources(plan([" "]), cat)).toEqual([" "]);
  });

  it("es la misma regla que usa registerPlan", () => {
    const conPdf = registerPlan(cubierta(), plan(["Pagos", "PCI.pdf"]), cat);
    expect(conPdf.observation).toBeUndefined();
    expect(conPdf.state.pause?.kind).toBe("plan");
  });
});

/**
 * Incidente (la app, proyecto «Catálogo de productos» con vistas DDD + C4 + BPMN):
 * las TRES secciones del plan salían de la misma vista DDD y las demás quedaban
 * sin abrir. No era el modelo siendo perezoso: con la ventana en 4 096 el
 * presupuesto alcanzaba para una lectura y el bucle ya pedía el plan. El plan
 * salía monofuente por construcción y nadie lo veía.
 */
describe("cobertura antes de planificar", () => {
  const plan = {
    kind: "plan" as const,
    title: "Drivers",
    artifactKind: "drivers",
    sections: [{ title: "Rendimiento", sources: ["Pagos"] }],
  };

  it("dice qué vistas con contenido quedaron sin abrir", () => {
    const leido = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    expect(unreadViews(leido, cat)).toEqual(["Pedidos"]); // «Vacía» no cuenta
  });

  it("las pineadas no cuentan como pendientes: ya están en el contexto", () => {
    const conPin: Catalog = {
      views: [
        vista({ name: "Pagos", graph: grafo([nodo("X")]) }),
        vista({ name: "Pineada", pinned: true, graph: grafo([nodo("Y")]) }),
      ],
    };
    expect(unreadViews(nueva(), conPin)).toEqual(["Pagos"]);
  });

  it("el objetivo es mirar hasta 3 vistas, o las que haya", () => {
    expect(readTarget(cat)).toBe(2); // Pagos y Pedidos (Vacía no cuenta)
    expect(readTarget({ views: [vista({ name: "Sola", graph: grafo([nodo("A")]) })] })).toBe(1);
  });

  it("un plan con una sola lectura y vistas sin abrir se devuelve, no se muestra", () => {
    const leido = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    const { state, observation } = registerPlan(leido, plan, cat);
    expect(state.pause).toBeUndefined(); // el humano NO es interrumpido con un plan sesgado
    expect(observation).toContain("Pedidos");
    expect(state.planRejections).toBe(1);
  });

  it("con la cobertura hecha, el plan pasa", () => {
    let s = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = applyToolCall(s, { tool: "read_view", name: "Pedidos" }, cat).state;
    expect(registerPlan(s, plan, cat).state.pause).toEqual(plan);
  });

  it("no se insiste para siempre: al tercer intento el plan pasa igual", () => {
    let s = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = registerPlan(s, plan, cat).state;
    s = registerPlan(s, plan, cat).state;
    expect(s.planRejections).toBe(MAX_RECHAZOS_POR_COBERTURA);
    const tercero = registerPlan(s, plan, cat);
    expect(tercero.state.pause).toEqual(plan); // decide el humano, con la cobertura a la vista
  });

  it("sin presupuesto no se le exige leer más", () => {
    const s = { ...nueva(0), read: ["Pagos"] };
    expect(registerPlan(s, plan, cat).state.pause).toEqual(plan);
  });

  it("un proyecto de una sola vista no dispara el freno", () => {
    const solo: Catalog = { views: [vista({ name: "Pagos", graph: grafo([nodo("X")]) })] };
    const s = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, solo).state;
    expect(registerPlan(s, plan, solo).state.pause).toEqual(plan);
  });
});

/**
 * Incidente (la app): durante la exploración el chat mostraba una burbuja vacía y
 * «El agente está razonando…» por minutos — no se distinguía leyendo de colgado.
 * Los pasos ya existían; lo que faltaba era decirlos en vivo y en castellano.
 */
describe("describeStep · qué está haciendo, en una línea", () => {
  it("distingue el inventario de la lectura de una vista", () => {
    expect(describeStep({ type: "read", tool: "list_views", content: "" })).toMatch(/qué vistas/);
    expect(describeStep({ type: "read", tool: "read_view", source: "Pagos", content: "" })).toBe(
      "Leyendo «Pagos»…"
    );
  });

  it("nombra el término buscado", () => {
    expect(describeStep({ type: "search", tool: "search_model", source: "cobro", content: "" })).toBe(
      "Buscando «cobro» en el modelo…"
    );
  });

  it("anuncia plan, pregunta y consolidación", () => {
    expect(describeStep({ type: "plan", content: "x" })).toMatch(/plan/i);
    expect(describeStep({ type: "question", content: "x" })).toMatch(/duda/i);
    expect(describeStep({ type: "consolidate", content: "x" })).toMatch(/[Cc]onsolidando/);
  });

  it("la decisión del humano se muestra tal cual (ya es una frase)", () => {
    expect(describeStep({ type: "decision", content: "El humano aprobó el plan." })).toBe(
      "El humano aprobó el plan."
    );
  });

  it("generar se dice en castellano, no con el nombre de la herramienta", () => {
    expect(describeStep({ type: "action", tool: "generate_document", content: "Drivers" })).toMatch(
      /Escribiendo/
    );
  });

  it("un tipo desconocido cae al contenido, nunca a una cadena vacía", () => {
    expect(describeStep({ type: "loquesea", content: "algo pasa" })).toBe("algo pasa");
    expect(describeStep({ type: "loquesea", content: "" })).toBe("Trabajando…");
  });
});

/**
 * Incidente (corrida real, tras «Ajustar…»): el modelo escribió «Dado que no
 * tengo el plan anterior ni el contexto de la revisión…» y volvió a leer vistas
 * que ya había leído. Reanudar abre una conversación nueva; la memoria son las
 * notas, y no se las estábamos devolviendo.
 */
describe("memoryBlock · la memoria de la corrida al reanudar", () => {
  const conHistoria = () => {
    let s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = applyToolCall(s, { tool: "read_view", name: "Pedidos" }, cat).state;
    s = registerPlan(s, {
      kind: "plan",
      title: "Drivers",
      artifactKind: "drivers",
      sections: [{ title: "Rendimiento", sources: ["Pagos"] }],
    }, cat).state;
    return answerQuestion(
      registerQuestion(s, { kind: "question", id: "q", text: "¿mismo concepto?", options: ["Sí", "No"] }).state,
      UNKNOWN_ANSWER
    );
  };

  it("una corrida nueva no arrastra memoria", () => {
    expect(memoryBlock(nueva())).toBe("");
  });

  it("dice qué vistas ya leyó y con qué se quedó de cada una", () => {
    const b = memoryBlock(conHistoria());
    expect(b).toMatch(/no lo repitas/i);
    expect(b).toContain('"Pagos", "Pedidos"');
    expect(b).toContain("Cobrar prima");
  });

  it("devuelve el plan propuesto y las decisiones del humano", () => {
    const b = memoryBlock(conHistoria());
    expect(b).toContain("Plan propuesto: «Drivers»");
    expect(b).toContain("Rendimiento ← Pagos");
    expect(b).toContain("¿mismo concepto? → Sí (supuesto)");
  });

  it("se acota: la memoria no puede comerse la ventana que quería ahorrar", () => {
    const b = memoryBlock(conHistoria(), 120);
    expect(b.length).toBeLessThanOrEqual(120 + 30);
    expect(b).toMatch(/memoria recortada/);
  });
});

/**
 * Incidente (la app, captura del humano): el plan prometía «Drivers (C4) ← C4 N2 ·
 * Contenedores» y «Drivers (BPMN) ← BPMN · Gestión», y la cobertura decía que sólo
 * se había leído la vista DDD. Citar una fuente sin haberla abierto no es un plan:
 * al consolidar, esas secciones se escribirían de memoria.
 */
describe("un plan no puede citar lo que no leyó", () => {
  const planC4 = {
    kind: "plan" as const,
    title: "Drivers",
    artifactKind: "drivers",
    sections: [
      { title: "Rendimiento", sources: ["Pagos"] },
      { title: "Procesos", sources: ["Pedidos"] },
    ],
  };

  it("detecta las vistas citadas que nunca se abrieron", () => {
    const s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    expect(unreadPlanSources(planC4, s, cat)).toEqual(["Pedidos"]);
  });

  it("las pineadas no hace falta abrirlas: ya están en el contexto", () => {
    const conPin: Catalog = {
      views: [
        vista({ name: "Pagos", graph: grafo([nodo("X")]) }),
        vista({ name: "Pedidos", pinned: true, graph: grafo([nodo("Y")]) }),
      ],
    };
    const s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, conPin).state;
    expect(unreadPlanSources(planC4, s, conPin)).toEqual([]);
  });

  it("un documento adjunto o «Modelo» genérico no exigen lectura", () => {
    const plan = {
      ...planC4,
      sections: [{ title: "Cumplimiento", sources: ["PCI.pdf", "documentos"] }],
    };
    expect(unreadPlanSources(plan, nueva(), cat)).toEqual([]);
  });

  it("registerPlan lo devuelve con la instrucción concreta, sin molestar al humano", () => {
    const s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    const { state, observation } = registerPlan(s, planC4, cat);
    expect(state.pause).toBeUndefined();
    expect(observation).toContain('"Pedidos"');
    expect(observation).toMatch(/read_view/);
  });

  it("leídas todas las fuentes citadas, el plan pasa", () => {
    let s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    s = applyToolCall(s, { tool: "read_view", name: "Pedidos" }, cat).state;
    expect(registerPlan(s, planC4, cat).state.pause).toEqual(planC4);
  });

  it("sin presupuesto no se le exige lo imposible", () => {
    const s = { ...nueva(0), read: ["Pagos"] };
    expect(registerPlan(s, planC4, cat).state.pause).toEqual(planC4);
  });
});

/**
 * Medición real en la app: ~35 s por turno del modelo local, 8 pasos en 5 minutos.
 * El costo está en la CANTIDAD de turnos, no en el contexto — así que leer tres
 * vistas de a una cuesta dos minutos de reloj que un lote ahorra.
 */
describe("read_views · leer en lote para gastar menos turnos", () => {
  it("lee varias vistas en una sola llamada y anota cada una", () => {
    const r = applyToolCall(nueva(20_000), { tool: "read_views", names: ["Pagos", "Pedidos"] }, cat);
    expect(r.state.read).toEqual(["Pagos", "Pedidos"]);
    expect(r.state.notes).toHaveLength(2);
    expect(r.observation).toContain("Cobrar prima");
    expect(r.observation).toContain("Crear pedido");
  });

  it("cuesta lo mismo que leerlas de a una (el ahorro es de tiempo, no de presupuesto)", () => {
    const lote = applyToolCall(nueva(20_000), { tool: "read_views", names: ["Pagos", "Pedidos"] }, cat).state;
    let unaAuna = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    unaAuna = applyToolCall(unaAuna, { tool: "read_view", name: "Pedidos" }, cat).state;
    expect(lote.budgetLeft).toBe(unaAuna.budgetLeft);
  });

  it("respeta el tope del lote", () => {
    const muchas: Catalog = {
      views: ["A", "B", "C", "D"].map((n) => vista({ name: n, graph: grafo([nodo(`n${n}`)]) })),
    };
    const r = applyToolCall(nueva(20_000), { tool: "read_views", names: ["A", "B", "C", "D"] }, muchas);
    expect(r.state.read).toHaveLength(MAX_LECTURAS_POR_LOTE);
  });

  it("una vista inexistente dentro del lote no tumba las demás", () => {
    const r = applyToolCall(nueva(20_000), { tool: "read_views", names: ["Pagos", "Ventas"] }, cat);
    expect(r.state.read).toEqual(["Pagos"]);
    expect(r.observation).toMatch(/No existe la vista/);
  });

  it("sin nombres lo dice en vez de no hacer nada", () => {
    expect(applyToolCall(nueva(), { tool: "read_views", names: [] }, cat).observation).toMatch(/al menos un nombre/);
  });

  it("el progreso anuncia el lote, no una vista suelta", () => {
    expect(describeStep({ type: "read", tool: "read_views", source: "Pagos, Pedidos", content: "" })).toBe(
      "Leyendo 2 vistas: Pagos, Pedidos…"
    );
  });
});

/**
 * Incidente (la app): el artefacto salió correcto pero POBRE — bullets de manual
 * («el sistema debe ser escalable») y sin una sola cita, aunque el agente había
 * leído tres vistas. El prompt pedía citas sin mostrar cómo.
 */
describe("consolidación · exigir el origen de cada punto", () => {
  const conNotas = () => {
    const s = applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;
    return { ...s, coverage: coverageOf(s, cat) };
  };

  it("el prompt muestra la forma exacta de la cita, con ejemplo", () => {
    const p = consolidationPrompt(conNotas());
    expect(p).toContain("↳ Pagos › Cobrar prima, Prima cobrada");
    expect(p).toMatch(/en su propia línea/);
  });

  it("prohíbe el relleno sin respaldo", () => {
    const p = consolidationPrompt(conNotas());
    expect(p).toMatch(/no es un punto: borralo/i);
    expect(p).toMatch(/generalidades de manual/i);
  });

  it("hasCitations distingue un documento auditable de uno que no lo es", () => {
    expect(hasCitations("- Punto\n  ↳ Pagos › Cobrar prima")).toBe(true);
    expect(hasCitations("- El sistema debe ser escalable.")).toBe(false);
    expect(hasCitations("")).toBe(false);
  });
});

/**
 * Incidente (la app, palabras del humano: «esto no es profesional, da pena»): el
 * artefacto salió como veinte viñetas que eran los NODOS del diagrama —«Registrar
 * producto», «Ajustar precio», «Retirar producto»— sin una sola afirmación. El
 * humano ya los ve en el lienzo; repetirlos parece serio y no dice nada.
 */
describe("looksLikeNodeDump · el documento no puede ser el índice del lienzo", () => {
  const conNodos = () => applyToolCall(nueva(20_000), { tool: "read_view", name: "Pagos" }, cat).state;

  it("detecta el volcado real que salió en la app", () => {
    const s = { ...nueva(), notes: [{ source: { type: "view" as const, name: "Cat" }, facts: [], nodes: ["Registrar producto", "Ajustar precio", "Retirar producto", "Buscar producto", "Ver precio y stock"] }] };
    const md = [
      "## Requisitos funcionales clave",
      "- **Registrar producto**",
      "- **Ajustar precio**",
      "- **Retirar producto**",
      "- **Buscar producto**",
      "- **Ver precio y stock**",
    ].join("\n");
    expect(looksLikeNodeDump(md, s)).toBe(true);
  });

  it("un documento con afirmaciones y citas NO es un volcado", () => {
    const s = conNodos();
    const md = [
      "- **La latencia del cobro decide la venta** — el cargo es sincrónico contra la pasarela.",
      "  ↳ Pagos › Cobrar prima, Prima cobrada",
      "- **El rechazo necesita una salida de negocio** — hoy termina el flujo sin alternativa.",
      "  ↳ Pagos › Prima rechazada",
      "- **La confirmación tiene dos nombres distintos** — riesgo de duplicar el concepto.",
      "  ↳ Pagos › Prima cobrada",
    ].join("\n");
    expect(looksLikeNodeDump(md, s)).toBe(false);
  });

  it("sin evidencia registrada no se acusa a nadie", () => {
    expect(looksLikeNodeDump("- Cualquier cosa\n- Otra", nueva())).toBe(false);
  });

  it("un documento corto no se juzga por dos viñetas", () => {
    const s = conNodos();
    expect(looksLikeNodeDump("- Cobrar prima\n- Prima cobrada", s)).toBe(false);
  });

  it("el prompt prohíbe listar elementos y lo dice con el ejemplo del incidente", () => {
    const p = consolidationPrompt({ ...conNodos(), coverage: coverageOf(conNodos(), cat) });
    expect(p).toMatch(/PROHIBIDO listar los elementos/);
    expect(p).toMatch(/Registrar producto/);
    expect(p).toMatch(/NO son hallazgos/);
  });
});

/**
 * Plan de rescate: lo usa el bucle cuando el modelo no logra ESCRIBIR un plan
 * válido. Cita sólo lo leído — un plan que cita lo que no se leyó miente.
 */
describe("fallbackPlan", () => {
  it("arma una sección por vista leída, sin repetir", () => {
    const base = startRun(deps, "propuesta técnica");
    const state = { ...base, read: ["Pagos", "Pedidos", "Pagos"] };
    const plan = fallbackPlan(state, { artifactKind: "proposal" })!;
    expect(plan.artifactKind).toBe("proposal");
    expect(plan.sections.map((s) => s.sources[0])).toEqual(["Pagos", "Pedidos"]);
    expect(plan.title).toBe("propuesta técnica"); // el objetivo de la corrida
  });

  it("sin nada leído no hay plan honesto posible", () => {
    const state = startRun(deps, "propuesta técnica");
    expect(fallbackPlan(state)).toBeNull();
  });

  it("el título y el kind del plan en curso ganan al objetivo", () => {
    const base = startRun(deps, "objetivo");
    const state = {
      ...base,
      read: ["Pagos"],
      plan: { kind: "plan" as const, title: "Drivers", artifactKind: "drivers", sections: [] },
    };
    const plan = fallbackPlan(state)!;
    expect(plan.title).toBe("Drivers");
    expect(plan.artifactKind).toBe("drivers");
  });
});
