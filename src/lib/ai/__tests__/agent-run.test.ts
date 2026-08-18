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
    const { state, observation } = registerPlan(nueva(), plan, cat);
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
    const s = approvePlan(registerPlan(nueva(), plan, cat).state);
    expect(s.pause).toBeUndefined();
    expect(needsPlan(s)).toBe(false);
  });

  it("ajustar conserva notas y presupuesto, y devuelve el feedback al modelo", () => {
    const leido = applyToolCall(nueva(10_000), { tool: "read_view", name: "Pagos" }, cat).state;
    const conPlan = registerPlan(leido, plan, cat).state;
    const { state, observation } = adjustPlan(conPlan, "faltan las restricciones de negocio");
    expect(state.notes).toHaveLength(1); // no se pierde lo leído
    expect(state.budgetLeft).toBe(leido.budgetLeft);
    expect(state.pause).toBeUndefined();
    expect(state.planApproved).toBe(false);
    expect(observation).toContain("restricciones de negocio");
    expect(observation).toMatch(/no vuelvas a leer/);
  });

  it("cancelar termina la corrida con motivo y sin artefactos", () => {
    const s = cancelRun(registerPlan(nueva(), plan, cat).state, "el humano canceló");
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
    expect(p).toContain("Elementos citables: Cobrar prima, Prima cobrada.");
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
    const conPdf = registerPlan(nueva(), plan(["Pagos", "PCI.pdf"]), cat);
    expect(conPdf.observation).toBeUndefined();
    expect(conPdf.state.pause?.kind).toBe("plan");
  });
});
