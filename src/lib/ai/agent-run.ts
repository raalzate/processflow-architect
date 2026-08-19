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
export const RUN_BUDGET = 6_000;

/** Caracteres por token que se asumen al traducir la ventana del modelo (español ≈ 3,5). */
const CHARS_POR_TOKEN = 3.5;
/**
 * Parte de la ventana que puede gastarse LEYENDO. El resto queda para el system,
 * el protocolo, las observaciones y la respuesta: si se reparte todo a lecturas,
 * el motor corta con «Too many tokens requested» a la segunda vista.
 */
const FRACCION_LECTURA = 0.35;

/**
 * Presupuesto derivado de la ventana REAL del modelo (Ajustes → maxTokens, 4 096
 * por defecto). Antes era un número fijo de 24 000 caracteres —cómodo para la
 * nube, imposible para el motor local— y la corrida moría a mitad de camino.
 */
export function budgetFromWindow(maxTokens: number | undefined): number {
  const ventana = Math.max(512, maxTokens || 4096);
  return Math.max(1500, Math.round(ventana * CHARS_POR_TOKEN * FRACCION_LECTURA));
}

/** Herramientas de lectura que el agente puede pedir. */
export type ToolCall =
  | { tool: "list_views" }
  | { tool: "read_view"; name: string }
  /** Varias vistas en UN turno: cada turno del modelo local cuesta ~35 s. */
  | { tool: "read_views"; names: string[] }
  | { tool: "search_model"; term: string };

export const READ_TOOLS = ["list_views", "read_view", "read_views", "search_model"] as const;

/** Vistas que se pueden leer de una sola vez (más no entra en la ventana). */
export const MAX_LECTURAS_POR_LOTE = 3;

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

  if (call.tool === "read_views") {
    // Lote: mismo efecto que N `read_view` seguidos, pero en UN turno del modelo.
    // Con ~35 s por turno, leer tres vistas de a una cuesta dos minutos de reloj.
    const nombres = call.names.slice(0, MAX_LECTURAS_POR_LOTE);
    if (!nombres.length) {
      return { state, observation: "read_views necesita al menos un nombre en `names`." };
    }
    let acc = state;
    const partes: string[] = [];
    for (const nombre of nombres) {
      const r = applyToolCall(acc, { tool: "read_view", name: nombre }, cat);
      acc = r.state;
      partes.push(r.observation);
    }
    return { state: acc, observation: partes.join("\n\n") };
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
 * Vistas con contenido que la corrida todavía NO miró (ni leyó ni tenía pineadas).
 * Es la medida del sesgo: un plan cuyas secciones salen todas de una vista cuando
 * había otras cinco sin abrir no es un plan, es lo primero que encontró.
 */
export function unreadViews(state: AgentRunState, cat: Catalog): string[] {
  const vistos = new Set(state.read.map(normalizeName));
  return listViews(cat)
    .filter((v) => !v.empty && !v.pinned && !vistos.has(normalizeName(v.name)))
    .map((v) => v.name);
}

/**
 * Cuántas vistas conviene haber mirado antes de planificar: hasta 3, o las que
 * haya si son menos. Más que eso es tiranía sobre proyectos chicos; menos, el
 * sesgo de la primera vista.
 */
export function readTarget(cat: Catalog): number {
  const conContenido = listViews(cat).filter((v) => !v.empty).length;
  return Math.min(3, conContenido);
}

/** Veces que se le puede devolver el plan por cobertura antes de aceptarlo igual. */
export const MAX_RECHAZOS_POR_COBERTURA = 2;

/**
 * Vistas que el plan CITA pero la corrida nunca abrió. Es la contradicción que
 * vio el humano en la app: el plan prometía «C4 · Contenedores» y «BPMN · Gestión»
 * como fuentes de dos secciones, y la cobertura decía que sólo se había leído la
 * vista DDD. Una fuente sin nota detrás no se puede citar: al consolidar, esa
 * sección se escribiría de memoria (o sea, inventada).
 *
 * Las pineadas no cuentan: ya están en el contexto del turno.
 */
export function unreadPlanSources(
  plan: PlanPause,
  state: AgentRunState,
  cat: Catalog
): string[] {
  const leidas = new Set(state.read.map(normalizeName));
  const pineadas = new Set(
    cat.views.filter((v) => v.pinned).map((v) => normalizeName(v.name))
  );
  const vistas = new Map(cat.views.map((v) => [normalizeName(v.name), v.name]));
  const citadas = new Set(plan.sections.flatMap((sec) => sec.sources));
  const faltan: string[] = [];
  for (const fuente of citadas) {
    const n = normalizeName(fuente);
    // Sólo se exige para VISTAS: un documento adjunto o «Modelo» genérico no se
    // lee con `read_view`.
    const real = vistas.get(n) ?? [...vistas.keys()].find((k) => k.includes(n) || n.includes(k));
    if (!real) continue;
    const clave = normalizeName(vistas.get(real as string) ?? (real as string));
    if (!leidas.has(clave) && !pineadas.has(clave)) {
      faltan.push(vistas.get(clave) ?? fuente);
    }
  }
  return Array.from(new Set(faltan));
}

/**
 * Registra el plan propuesto y deja la corrida esperando al humano. Dos
 * validaciones ANTES de molestar a nadie: que las fuentes existan (un plan que
 * cita una vista inexistente es un error del modelo) y que el agente haya mirado
 * lo suficiente — si queda presupuesto y hay vistas sin abrir, se le devuelve el
 * plan una vez o dos con la lista de lo que se está perdiendo. Después se acepta:
 * el humano decide, y para eso la tarjeta le muestra la cobertura.
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

  const rechazos = state.planRejections ?? 0;

  // 1) El plan no puede citar lo que no leyó: eso no es un plan, es una promesa.
  const citadasSinLeer = unreadPlanSources(plan, state, cat);
  if (citadasSinLeer.length && state.budgetLeft > 0 && rechazos < MAX_RECHAZOS_POR_COBERTURA) {
    return {
      state: { ...state, planRejections: rechazos + 1 },
      observation: `El plan cita ${citadasSinLeer
        .map((v) => `"${v}"`)
        .join(", ")} pero no las leíste. Leelas con read_view y después proponé el plan (o sacá esas secciones).`,
    };
  }

  // 2) Y no se planifica con la primera vista que se abrió habiendo otras.
  const sinLeer = unreadViews(state, cat);
  const faltaMirar =
    state.read.length < readTarget(cat) &&
    sinLeer.length > 0 &&
    state.budgetLeft > 0 &&
    rechazos < MAX_RECHAZOS_POR_COBERTURA;
  if (faltaMirar) {
    return {
      state: { ...state, planRejections: rechazos + 1 },
      observation: `Todavía no miraste ${sinLeer.slice(0, 5).map((v) => `"${v}"`).join(", ")}${
        sinLeer.length > 5 ? ` y ${sinLeer.length - 5} más` : ""
      }. Leé al menos una de esas antes de planificar, o proponé el plan de nuevo diciendo en una sección por qué no aplican.`,
    };
  }
  return { state: { ...state, plan, pause: plan } };
}

/**
 * Plan de rescate cuando el modelo NO logra escribir un plan válido (turnos con
 * JSON roto). Se arma con lo que la corrida YA leyó —nunca con vistas sin abrir:
 * un plan que cita lo que no se leyó miente— una sección por fuente. Devuelve
 * null si no hay nada leído: ahí no hay plan honesto posible y se corta.
 *
 * No se auto-aprueba: sigue pasando por el humano (spec 005). Lo que evita es la
 * calle sin salida «formato inválido tres veces» sin ofrecer nada.
 */
export function fallbackPlan(
  state: AgentRunState,
  opts?: { title?: string; artifactKind?: string }
): PlanPause | null {
  const fuentes = Array.from(new Set(state.read)).filter(Boolean);
  if (!fuentes.length) return null;
  return {
    kind: "plan",
    title: opts?.title?.trim() || state.plan?.title || state.goal || "Artefacto",
    artifactKind: opts?.artifactKind || state.plan?.artifactKind || "markdown",
    sections: fuentes.map((f) => ({ title: `Qué aporta ${f}`, sources: [f] })),
  };
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
      nodos.length ? `  - Evidencia disponible para citar (NO son hallazgos, no los copies como viñetas): ${nodos.join(", ")}.` : "",
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
    "REGLAS DE ESCRITURA (esto es lo que separa un documento útil de un volcado):",
    "1. PROHIBIDO listar los elementos del modelo. 'Registrar producto', 'Ajustar precio' son NODOS del diagrama, no hallazgos: el humano ya los ve en el lienzo. Copiarlos como viñetas convierte el documento en basura.",
    "2. Cada punto es una AFIRMACIÓN sobre el sistema —una exigencia, un riesgo, una restricción, una decisión— redactada en una frase completa, con su consecuencia. Los elementos son la EVIDENCIA que la sostiene, y van en la cita.",
    "3. Forma exacta de cada punto (viñeta + cita en su propia línea):",
    "   - **Latencia de cobro ≤ 200 ms** — el cobro es sincrónico contra la pasarela, así que el usuario espera en pantalla; por encima de ese umbral se pierde la venta.",
    "     ↳ Pagos › Cobrar prima, Prima cobrada",
    "4. Si un punto se puede reemplazar por el nombre de un nodo sin perder información, NO es un punto: borralo.",
    "5. Usá SOLO las fuentes y los elementos listados arriba; nombralos igual (con sus tildes).",
    "6. Un hecho que aparece en varias fuentes va UNA vez, con todas sus fuentes en la misma cita.",
    "7. Nada de generalidades de manual ('el sistema debe ser escalable') sin evidencia que las sostenga.",
    "8. Mejor 5 puntos con sustancia que 20 nombres sueltos.",
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

/**
 * Memoria de la corrida para el system de un turno REANUDADO: qué leyó, qué anotó,
 * qué plan propuso y qué decidió el humano.
 *
 * Reanudar abre una conversación nueva (la del modelo no es serializable y el
 * usuario pudo recargar). Sin este bloque el modelo arrancaba en blanco —«no
 * tengo el plan anterior ni el contexto de la revisión», dijo en una corrida
 * real— y volvía a leer lo que ya había leído, gastando el presupuesto dos veces.
 */
export function memoryBlock(state: AgentRunState, limit = 2500): string {
  if (!state.notes.length && !state.plan && !state.decisions.length) return "";
  const bloques: string[] = ["\n\n### Lo que YA hiciste en esta corrida (no lo repitas)"];

  if (state.read.length) {
    bloques.push(`Vistas ya leídas: ${state.read.map((v) => `"${v}"`).join(", ")}.`);
  }
  for (const n of state.notes) {
    const nodos = n.nodes?.length ? ` Elementos: ${n.nodes.slice(0, 25).join(", ")}.` : "";
    bloques.push(`- ${n.source.name}: ${n.facts.join(" ")}${nodos}`);
  }
  if (state.plan) {
    bloques.push(
      `Plan propuesto: «${state.plan.title}» — ${state.plan.sections
        .map((sec) => `${sec.title} ← ${sec.sources.join(", ")}`)
        .join(" · ")}.`
    );
  }
  for (const d of state.decisions) {
    bloques.push(`Decisión del humano: ${d.question} → ${d.answer}${d.assumed ? " (supuesto)" : ""}.`);
  }
  const texto = bloques.join("\n");
  return texto.length > limit ? `${texto.slice(0, limit)}\n…(memoria recortada)` : texto;
}

/* -------------------------------------------------------------------------- */
/* Progreso legible                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Una línea humana para un paso de la corrida. Existe porque con el modelo local
 * cada turno tarda y el chat mostraba una burbuja vacía con «El agente está
 * razonando…» durante minutos: el usuario no sabía si estaba leyendo, planificando
 * o colgado. El mismo dato que alimenta la traza sirve para decirlo en vivo.
 */
export function describeStep(step: { type: string; tool?: string; source?: string; content: string }): string {
  switch (step.type) {
    case "read":
      if (step.tool === "list_views") return "Mirando qué vistas tiene el proyecto…";
      if (step.tool === "read_views" && step.source) {
        const n = step.source.split(",").length;
        return `Leyendo ${n} vistas: ${step.source}…`;
      }
      return step.source ? `Leyendo «${step.source}»…` : "Leyendo una vista…";
    case "search":
      return step.source ? `Buscando «${step.source}» en el modelo…` : "Buscando en el modelo…";
    case "plan":
      return "Preparando el plan del artefacto…";
    case "question":
      return "Tiene una duda para vos…";
    case "decision":
      return step.content;
    case "consolidate":
      return "Consolidando lo leído y citando fuentes…";
    case "action":
      return step.tool?.startsWith("generate") ? "Escribiendo el artefacto…" : `Ejecutando ${step.tool ?? "una acción"}…`;
    case "thought":
      return "Pensando…";
    default:
      return step.content || "Trabajando…";
  }
}

/**
 * ¿El artefacto trae citas? Si el modelo no emitió ninguna, el documento no es
 * auditable — y eso se DICE, no se disimula: inventar las citas desde el código
 * sería peor que no tenerlas (parecerían verificadas sin serlo).
 */
export function hasCitations(markdown: string): boolean {
  return /↳\s*\S/.test(markdown || "");
}

/**
 * ¿El artefacto es un volcado de nombres del modelo? Pasó en la app: «Registrar
 * producto», «Ajustar precio», «Retirar producto»… veinte viñetas que son los
 * nodos del diagrama, no hallazgos. El humano ya los ve en el lienzo; repetirlos
 * en un documento no aporta nada y lo hace parecer serio sin serlo.
 *
 * Heurística deliberadamente conservadora: sólo grita cuando la mayoría de las
 * viñetas cortas coinciden con nombres de elementos ya conocidos.
 */
export function looksLikeNodeDump(markdown: string, state: AgentRunState): boolean {
  const nombres = new Set(
    state.notes.flatMap((n) => (n.nodes ?? []).map((x) => normalizeName(x))).filter(Boolean)
  );
  if (nombres.size < 3) return false;
  const vinetas = (markdown.match(/^\s*[-*]\s+.+$/gm) ?? []).map((l) =>
    normalizeName(l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").split(/[—:.]/)[0])
  );
  if (vinetas.length < 4) return false;
  const copiadas = vinetas.filter((v) => v && nombres.has(v)).length;
  return copiadas / vinetas.length > 0.5;
}
