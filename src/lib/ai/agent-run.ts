/**
 * @fileOverview Ciclo de vida de una corrida del agente (PURO).
 *
 * Antes `runLitertAgent` empezaba y terminaba en una llamada: no había dónde
 * meter al humano, así que una suposición del modelo viajaba muda hasta el
 * artefacto. Acá vive TODA la transición de estado —presupuesto, notas, plan por
 * aprobar, preguntas, consolidación y validación de citas— y el adaptador del
 * modelo queda como lo único no probable sin GPU: llamar, aplicar, seguir.
 *
 * Sin React ni Electron. El estado es serializable (viaja en el mensaje del chat)
 * y ninguna función muta su entrada: cada una devuelve un estado nuevo.
 */

import type {
  AgentCoverage,
  AgentDecision,
  AgentNote,
  AgentPause,
  AgentRunState,
} from "../agent-types";
import {
  formatInventory,
  listViews,
  normalizeName,
  readView,
  searchModel,
  type Catalog,
} from "./agent-retrieval";

/**
 * Presupuesto de contexto por corrida, en CARACTERES. No en tokens: sin
 * tokenizador en el renderer, una cuenta de tokens sería una mentira precisa.
 * Es la misma unidad que ya usan los recortes del contexto.
 */
export const RUN_BUDGET = 24_000;

/** Herramientas de lectura que el agente puede pedir. */
export type ToolCall =
  | { tool: "list_views" }
  | { tool: "read_view"; name: string }
  | { tool: "search_model"; term: string };

export const READ_TOOLS = ["list_views", "read_view", "search_model"] as const;

export interface RunDeps {
  uid: () => string;
}

/** Respuesta especial de una pregunta: «no sé» ⇒ se toma el supuesto por defecto. */
export const UNKNOWN_ANSWER = "__no-se__";

export function startRun(deps: RunDeps, goal: string, budget = RUN_BUDGET): AgentRunState {
  return {
    id: deps.uid(),
    goal,
    turn: 0,
    budgetLeft: budget,
    read: [],
    notes: [],
    asked: [],
    decisions: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

const yaLeida = (state: AgentRunState, name: string): boolean =>
  state.read.some((r) => normalizeName(r) === normalizeName(name));

/**
 * Aplica una llamada a herramienta: devuelve el estado nuevo y la OBSERVACIÓN que
 * el modelo recibirá. Releer una vista no cuesta presupuesto (y se lo dice), una
 * herramienta inexistente no rompe la corrida y sin presupuesto la respuesta
 * empuja a consolidar en vez de insistir.
 */
export function applyToolCall(
  state: AgentRunState,
  call: ToolCall,
  cat: Catalog
): { state: AgentRunState; observation: string; note?: AgentNote } {
  if (call.tool === "list_views") {
    const inv = listViews(cat);
    return { state, observation: `Vistas del proyecto:\n${formatInventory(inv)}` };
  }

  if (call.tool === "read_view") {
    if (yaLeida(state, call.name)) {
      return {
        state,
        observation: `Ya leíste "${call.name}" en esta corrida: usá lo que anotaste en vez de volver a pedirla.`,
      };
    }
    const pineada = cat.views.find(
      (v) => v.pinned && normalizeName(v.name) === normalizeName(call.name)
    );
    if (pineada) {
      return {
        state: { ...state, read: [...state.read, pineada.name] },
        observation: `"${pineada.name}" ya está en el contexto del turno (la inyectó el humano): no hace falta leerla.`,
      };
    }
    const r = readView(cat, call.name, state.budgetLeft);
    if (!r.ok) {
      const cerca = r.suggestions?.length ? ` Vistas parecidas: ${r.suggestions.join(", ")}.` : "";
      return { state, observation: `${r.error}${cerca}` };
    }
    const next: AgentRunState = {
      ...state,
      budgetLeft: Math.max(0, state.budgetLeft - r.cost),
      read: [...state.read, r.note.source.name],
      notes: [...state.notes, r.note],
    };
    return {
      state: next,
      observation: `Vista "${r.note.source.name}":\n${r.text}`,
      note: r.note,
    };
  }

  if (call.tool === "search_model") {
    const r = searchModel(cat, call.term);
    if (!r.ok) return { state, observation: r.error };
    const next: AgentRunState = {
      ...state,
      budgetLeft: Math.max(0, state.budgetLeft - r.cost),
      notes: [...state.notes, r.note],
    };
    return { state: next, observation: `Búsqueda "${call.term}":\n${r.text}`, note: r.note };
  }

  const desconocida = (call as { tool: string }).tool;
  return {
    state,
    observation: `No existe la herramienta "${desconocida}". Disponibles: ${READ_TOOLS.join(", ")}, generate_document, generate_diagram.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Plan aprobable                                                              */
/* -------------------------------------------------------------------------- */

export type PlanPause = Extract<AgentPause, { kind: "plan" }>;

/** ¿Hay que pedir aprobación antes de generar? Sólo la primera vez de la corrida. */
export function needsPlan(state: AgentRunState): boolean {
  return state.planApproved !== true;
}

/** Fuentes genéricas que un plan puede citar sin ser una vista del catálogo. */
const FUENTES_GENERICAS = new Set([
  "modelo",
  "documento",
  "documentos",
  "adjunto",
  "adjuntos",
  "chat",
  "conversacion",
]);

/**
 * Fuentes del plan que NO existen. Es la ÚNICA definición de "fuente válida":
 * la usa `registerPlan` al proponer el plan y el contexto al revalidar una
 * corrida que sobrevivió a un reload. Con dos validaciones distintas, un plan
 * legítimo (que citaba un PDF adjunto) se cancelaba solo al recargar.
 */
export function unknownPlanSources(plan: PlanPause, cat: Catalog): string[] {
  const conocidas = new Set(cat.views.map((v) => normalizeName(v.name)));
  return plan.sections
    .flatMap((s) => s.sources)
    .filter((f) => {
      const n = normalizeName(f);
      if (!n) return true;
      if (FUENTES_GENERICAS.has(n)) return false;
      // Un documento adjunto se cita por su nombre de archivo.
      if (/\.(pdf|docx?|md|txt|png|jpe?g)$/i.test(f.trim())) return false;
      return !conocidas.has(n) && ![...conocidas].some((k) => k.includes(n) || n.includes(k));
    });
}

/**
 * Registra el plan propuesto y deja la corrida esperando al humano. Las fuentes
 * se validan contra el catálogo ANTES de molestar a nadie: un plan que cita una
 * vista inexistente es un error del modelo, no una decisión del humano.
 */
export function registerPlan(
  state: AgentRunState,
  plan: PlanPause,
  cat: Catalog
): { state: AgentRunState; observation?: string } {
  const invalidas = unknownPlanSources(plan, cat);

  if (invalidas.length) {
    return {
      state,
      observation: `El plan cita fuentes que no existen: ${invalidas.join(", ")}. Fuentes válidas: ${cat.views
        .map((v) => `"${v.name}"`)
        .join(", ")}. Corregí el plan.`,
    };
  }
  if (!plan.sections.length) {
    return { state, observation: "El plan no tiene secciones: proponé al menos una." };
  }
  return { state: { ...state, plan, pause: plan } };
}

export function approvePlan(state: AgentRunState): AgentRunState {
  const { pause, ...rest } = state;
  void pause;
  return { ...rest, planApproved: true };
}

/**
 * El humano pide cambios: se quita la pausa y su indicación vuelve al modelo como
 * observación. Lo leído NO se pierde (notas y presupuesto intactos): re-explorar
 * por un ajuste de redacción es lo que hace inusable un control de calidad.
 */
export function adjustPlan(
  state: AgentRunState,
  feedback: string
): { state: AgentRunState; observation: string } {
  const { pause, ...rest } = state;
  void pause;
  return {
    state: { ...rest, planApproved: false },
    observation: `El humano pidió ajustar el plan: ${feedback.trim()}. Proponé un plan nuevo (no vuelvas a leer lo que ya anotaste).`,
  };
}

export function cancelRun(state: AgentRunState, reason: string): AgentRunState {
  const { pause, ...rest } = state;
  void pause;
  return { ...rest, cancelledReason: reason };
}

export const isCancelled = (state: AgentRunState): boolean => !!state.cancelledReason;

/* -------------------------------------------------------------------------- */
/* Preguntas al humano                                                         */
/* -------------------------------------------------------------------------- */

export type QuestionPause = Extract<AgentPause, { kind: "question" }>;

/**
 * Formula una pregunta al humano, UNA sola vez por corrida (misma `id`): si ya se
 * respondió, la corrida no se detiene y el modelo recibe la decisión anterior.
 * Sin esto, un modelo local pregunta lo mismo en cada turno y el flujo se vuelve
 * inusable.
 */
export function registerQuestion(
  state: AgentRunState,
  q: QuestionPause
): { state: AgentRunState; observation?: string } {
  const previa = state.decisions.find((d) => d.questionId === q.id);
  if (previa) {
    return {
      state,
      observation: `Ya preguntaste eso en esta corrida y la respuesta fue: "${previa.answer}"${
        previa.assumed ? " (supuesto por defecto)" : ""
      }. Seguí con eso.`,
    };
  }
  if (!q.options.length) {
    return { state, observation: "Una pregunta al humano necesita al menos una opción." };
  }
  return { state: { ...state, asked: [...state.asked, q.id], pause: q } };
}

/**
 * Respuesta del humano. `UNKNOWN_ANSWER` («no sé») toma la PRIMERA opción y la
 * marca como supuesto: el flujo nunca se traba por una duda, pero el supuesto
 * queda declarado en el artefacto.
 */
export function answerQuestion(state: AgentRunState, answer: string): AgentRunState {
  const q = state.pause?.kind === "question" ? state.pause : null;
  if (!q) return state;
  const assumed = answer === UNKNOWN_ANSWER || !answer.trim();
  const decision: AgentDecision = {
    questionId: q.id,
    question: q.text,
    answer: assumed ? q.options[0] : answer,
    ...(assumed ? { assumed: true } : {}),
  };
  const { pause, ...rest } = state;
  void pause;
  return { ...rest, decisions: [...state.decisions, decision] };
}

/* -------------------------------------------------------------------------- */
/* Consolidación                                                               */
/* -------------------------------------------------------------------------- */

/** ¿Se agotó el margen para seguir explorando? Entonces se consolida con lo que hay. */
export function mustConsolidate(
  state: AgentRunState,
  opts: { maxToolTurns: number }
): boolean {
  return state.budgetLeft <= 0 || state.turn >= opts.maxToolTurns;
}

/** Qué se leyó y qué quedó afuera. Un artefacto honesto declara su cobertura. */
export function coverageOf(state: AgentRunState, cat: Catalog): AgentCoverage {
  const leidas = state.read.slice();
  const norm = new Set(leidas.map(normalizeName));
  const omitidas = cat.views
    .filter((v) => !norm.has(normalizeName(v.name)))
    .filter((v) => {
      const inv = listViews({ views: [v] })[0];
      return !inv.empty; // una vista vacía no es cobertura perdida
    })
    .map((v) => v.name);
  const reason =
    state.budgetLeft <= 0
      ? "se agotó el presupuesto de contexto"
      : omitidas.length
        ? "el agente no las consideró necesarias"
        : undefined;
  return { readViews: leidas, skippedViews: omitidas, ...(reason ? { reason } : {}) };
}

/**
 * Prompt del turno final: objetivo + notas agrupadas por fuente + decisiones +
 * cobertura. Nunca el TOON crudo: la memoria de la corrida son las notas, y
 * re-inyectar los grafos completos es justo lo que hacía perder el hilo al modelo.
 */
export function consolidationPrompt(state: AgentRunState): string {
  const porFuente = new Map<string, AgentNote[]>();
  for (const n of state.notes) {
    const k = `${n.source.type}:${n.source.name}`;
    porFuente.set(k, [...(porFuente.get(k) ?? []), n]);
  }
  const bloques = [...porFuente.entries()].map(([k, notas]) => {
    const nombre = k.slice(k.indexOf(":") + 1);
    const hechos = notas.flatMap((n) => n.facts).map((f) => `  - ${f}`);
    const nodos = Array.from(new Set(notas.flatMap((n) => n.nodes ?? [])));
    return [
      `### ${nombre}`,
      ...hechos,
      nodos.length ? `  - Elementos citables: ${nodos.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const decisiones = state.decisions.length
    ? [
        "",
        "## Decisiones del humano (respetalas y declará los supuestos)",
        ...state.decisions.map(
          (d) => `- ${d.question} → ${d.answer}${d.assumed ? " (SUPUESTO, declarálo)" : ""}`
        ),
      ]
    : [];

  const cob = state.coverage;
  const cobertura = cob
    ? [
        "",
        "## Cobertura (va al final del artefacto)",
        `- Leído: ${cob.readViews.length ? cob.readViews.join(", ") : "nada"}.`,
        cob.skippedViews.length
          ? `- Sin revisar: ${cob.skippedViews.join(", ")}${cob.reason ? ` (${cob.reason})` : ""}.`
          : "- Sin vistas pendientes.",
      ]
    : [];

  const plan = state.plan
    ? ["", "## Plan aprobado", ...state.plan.sections.map((s) => `- ${s.title} ← ${s.sources.join(", ")}`)]
    : [];

  return [
    `## Objetivo\n${state.goal}`,
    ...plan,
    "",
    "## Notas de lo leído (única fuente permitida)",
    ...bloques,
    ...decisiones,
    ...cobertura,
    "",
    'Cita cada afirmación con una línea "  ↳ Fuente › Elemento1, Elemento2" usando SOLO las fuentes y elementos de arriba. Un hecho que aparece en varias fuentes va UNA vez, con todas sus fuentes.',
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Validación de citas                                                         */
/* -------------------------------------------------------------------------- */

const CITA = /↳\s*([^›\n]+?)(?:\s*›\s*([^\n]+))?$/gm;

/**
 * Comprueba que cada cita del artefacto tenga una nota que la respalde. El
 * riesgo real no es que el agente cite poco: es que cite una vista que nunca
 * leyó, y entonces la trazabilidad miente y es peor que no tenerla.
 */
export function validateCitations(
  markdown: string,
  state: AgentRunState
): { ok: boolean; invalid: string[] } {
  const fuentes = new Map<string, Set<string>>();
  for (const n of state.notes) {
    const k = normalizeName(n.source.name);
    const set = fuentes.get(k) ?? new Set<string>();
    for (const nodo of n.nodes ?? []) set.add(normalizeName(nodo));
    fuentes.set(k, set);
  }
  const invalid: string[] = [];
  for (const m of markdown.matchAll(CITA)) {
    const fuente = (m[1] ?? "").trim();
    const nodos = (m[2] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const k = normalizeName(fuente);
    if (!fuentes.has(k)) {
      invalid.push(fuente);
      continue;
    }
    const conocidos = fuentes.get(k)!;
    // Una fuente sin nodos registrados (Mermaid, documento) admite cita sin nodo.
    for (const nodo of nodos) {
      if (conocidos.size && !conocidos.has(normalizeName(nodo))) invalid.push(`${fuente} › ${nodo}`);
    }
  }
  return { ok: invalid.length === 0, invalid };
}

/** Quita las citas que no se pudieron respaldar (último recurso, ver plan D8). */
export function stripInvalidCitations(markdown: string, invalid: string[]): string {
  if (!invalid.length) return markdown;
  const malas = new Set(invalid.map(normalizeName));
  return markdown
    .split("\n")
    .filter((line) => {
      const m = /↳\s*([^›\n]+?)(?:\s*›\s*([^\n]+))?$/.exec(line);
      if (!m) return true;
      const fuente = normalizeName((m[1] ?? "").trim());
      if (malas.has(fuente)) return false;
      const nodos = (m[2] ?? "").split(",").map((s) => normalizeName(s.trim()));
      return !nodos.some((n) => malas.has(normalizeName(`${(m[1] ?? "").trim()} › ${n}`)) || malas.has(n));
    })
    .join("\n");
}
