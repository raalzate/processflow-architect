/**
 * @fileOverview Agente ReAct LOCAL en el RENDERER, sobre LiteRT-LM (WebGPU).
 *
 * Reemplaza al flujo genkit `reactAgent` (que corría en main sobre ONNX). Aquí el
 * modelo vive en el renderer (litert-engine) y el bucle Razonamiento→Acción se
 * ejecuta en JS: el modelo emite UNA acción JSON por turno; ejecutamos la
 * herramienta (generar documento/diagrama como artefacto) y le devolvemos la
 * observación, hasta que responde con {"final": "..."}.
 *
 * NO edita el lienzo: solo lee contexto (graphData/vistas/artefactos) y produce
 * artefactos (markdown / mermaid).
 */

import { litertGenerate, createLitertConversation } from "./litert-engine";
import { safeGraphToToon, TOON_LEGEND } from "./graph-toon";
import { sanitizeId } from "@/lib/mermaid-diagram";
import { getNotation, DEFAULT_NOTATION_ID } from "@/lib/notations";
import {
  getDefinition,
  documentDefinitions,
  diagramDefinitions,
} from "@/lib/artifacts/registry";
import type { AgentRunState, AgentStep } from "@/lib/agent-types";
import { formatInventory, listViews, type Catalog } from "./agent-retrieval";
import {
  applyToolCall,
  approvePlan,
  adjustPlan,
  answerQuestion,
  cancelRun,
  consolidationPrompt,
  coverageOf,
  isCancelled,
  mustConsolidate,
  needsPlan,
  registerPlan,
  registerQuestion,
  startRun,
  stripInvalidCitations,
  validateCitations,
  READ_TOOLS,
  RUN_BUDGET,
  type ToolCall,
} from "./agent-run";

export interface AgentArtifactOut {
  kind: string;
  render: "markdown" | "mermaid";
  title: string;
  payload: { markdown: string } | { code: string };
}
/** Paso de la traza. Los tipos los declara `AgentStepSchema` (agent-types). */
export type AgentStepOut = AgentStep;
export interface LitertAgentResult {
  reply: string;
  artifacts: AgentArtifactOut[];
  steps: AgentStepOut[];
  /**
   * Corrida del agente. Con `pause` presente, el turno quedó ESPERANDO al humano
   * (plan por aprobar o pregunta por responder) y se reanuda con
   * `resumeLitertAgent`. Ausente = el turno cerró como siempre.
   */
  run?: AgentRunState;
}

export interface LitertAgentInput {
  modelFile: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  graphData?: any;
  views?: { name: string; kind: string; notation?: string }[];
  /**
   * Notaciones (ddd/bpmn/c4/uml) relevantes al turno — típicamente las de las
   * vistas inyectadas en el chat. Determinan el MARCO de razonamiento: se inyecta
   * la `aiGuidance` de cada una en la persona. Vacío/ausente → DDD por defecto.
   */
  notations?: string[];
  contextArtifacts?: { kind: string; title: string; content: string }[];
  /** Texto extraído de adjuntos (PDF/imagen/texto) como fuente de contexto. */
  documents?: { name: string; text: string }[];
  /** System/persona base (de Configuraciones). */
  systemPrompt?: string;
  /**
   * Catálogo de vistas para las herramientas de LECTURA. Con catálogo, el agente
   * recupera el contexto por partes (explorar → plan → consolidar); sin catálogo
   * se comporta como antes (un solo paquete de contexto), que es lo que necesitan
   * los llamadores viejos y las pruebas del bucle clásico.
   */
  catalog?: Catalog;
  /** Corrida en curso (reanudación tras una decisión del humano). */
  run?: AgentRunState;
  /** Presupuesto de contexto de la corrida, en caracteres. */
  budget?: number;
  /**
   * Callback de streaming: recibe fragmentos del texto de la respuesta FINAL a
   * medida que el modelo la genera (ya desenvuelto del JSON `{"final":"..."}`).
   * Los turnos de herramienta (sin `final`) no emiten nada aquí.
   */
  onReplyToken?: (chunk: string) => void;
}

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function stripFence(raw: string): string {
  const m = raw.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : raw).trim();
}

/** Quita comas colgantes (",}" / ",]") que los LLM suelen producir. */
function stripTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, "$1");
}

/** Extrae un objeto JSON de un texto (tolerante a prosa, fences y comas colgantes). */
function parseJson(text: string): any {
  if (!text) return null;
  const candidates = [text, text.match(/[[{][\s\S]*[\]}]/)?.[0] ?? ""];
  for (const c of candidates) {
    if (!c) continue;
    for (const variant of [c, stripTrailingCommas(c)]) {
      try {
        return JSON.parse(variant);
      } catch {
        /* prueba la siguiente variante */
      }
    }
  }
  return null;
}

/**
 * Claves con las que un modelo local nombra su respuesta cuando ignora el
 * contrato `{"thought","final"}`. Gemma devuelve seguido `{"response":"…"}`, y
 * sin esta lista el turno caía al crudo: el usuario veía el JSON envuelto (una
 * caja de código con `{ "response": "…" }`) en vez de la respuesta.
 */
export const CLAVES_DE_RESPUESTA = [
  "final",
  "respuesta",
  "response",
  "answer",
  "reply",
  "message",
  "text",
  "content",
  "output",
] as const;

/** Primer valor de texto útil del objeto, probando las claves conocidas en orden. */
function campoDeRespuesta(parsed: Record<string, unknown>): string | null {
  for (const clave of CLAVES_DE_RESPUESTA) {
    const v = parsed[clave];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Prosa que el modelo escribió FUERA del objeto JSON (antes o después). Cuando el
 * turno viene off-contract suele traer la mitad de la explicación acá; tirarla
 * dejaba respuestas mutiladas.
 */
function prosaFueraDelJson(raw: string): string {
  const m = raw.match(/[[{][\s\S]*[\]}]/);
  if (!m || m.index === undefined) return "";
  const fuera = (raw.slice(0, m.index) + "\n" + raw.slice(m.index + m[0].length))
    // Restos de un fence que envolvía el JSON: no son prosa.
    .replace(/```(?:json)?/gi, "")
    .trim();
  return fuera;
}

/**
 * Respuesta a mostrar cuando el turno NO respeta el contrato: se toma el campo de
 * texto que traiga el objeto (`response`, `answer`, …) y se le une la prosa que
 * quedó fuera del JSON. Sólo si no hay nada de eso se cae al crudo — que es lo
 * que el usuario veía siempre antes.
 */
export function salvageReply(raw: string, parsed: unknown): string {
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const campo = obj ? campoDeRespuesta(obj) : null;
  const fuera = prosaFueraDelJson(raw);
  const partes = [campo, fuera && fuera !== campo ? fuera : ""].filter(Boolean) as string[];
  // Nada rescatable (JSON sin texto y sin prosa): el crudo es mejor que el vacío.
  return partes.join("\n\n").trim() || raw.trim();
}

/** Claves del protocolo: si el crudo trae una, es un turno de protocolo, no prosa. */
const CLAVES_PROTOCOLO = ["action", "plan", "question", "final"] as const;

/**
 * ¿El turno intentaba hablar el protocolo? Se decide por la presencia de sus
 * claves, no por si el JSON parsea: un turno de protocolo roto NUNCA se le muestra
 * al usuario (era el bug: el chat imprimía `{"thought":…,"action":"read_view"…}`).
 */
export function looksLikeProtocol(raw: string): boolean {
  return CLAVES_PROTOCOLO.some((k) => new RegExp(`"${k}"\\s*:`).test(raw));
}

/**
 * Rescata un turno de protocolo cuyo JSON no parsea. El fallo real y repetido del
 * modelo local es escribir COMILLAS SIN ESCAPAR dentro de un string:
 * `{"thought":"… (ej. "Publica productos", "Busca") …","action":"read_view",…}`.
 * `JSON.parse` muere y antes se caía a mostrar el crudo, con dos consecuencias:
 * el usuario veía el protocolo y la corrida se cortaba en seco.
 *
 * No intenta arreglar el JSON (eso es adivinar): extrae los campos que importan
 * con límites que no dependen del contenido de los strings.
 */
export function repairProtocolJson(raw: string): Record<string, unknown> | null {
  if (!raw || !looksLikeProtocol(raw)) return null;
  const out: Record<string, unknown> = {};

  // `thought`: hasta la próxima clave del protocolo (el contenido puede traer
  // comillas sueltas, así que el corte lo marca la clave siguiente).
  const th = raw.match(/"thought"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:action|plan|question|final)"\s*:/);
  if (th) out.thought = th[1].replace(/\\n/g, "\n").trim();

  const act = raw.match(/"action"\s*:\s*"([^"]+)"/);
  if (act) out.action = act[1];

  // `args`: el objeto balanceado que sigue a la clave.
  const argsIdx = raw.search(/"args"\s*:\s*\{/);
  if (argsIdx >= 0) {
    const start = raw.indexOf("{", raw.indexOf(":", argsIdx));
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          const bloque = raw.slice(start, i + 1);
          try {
            out.args = JSON.parse(bloque);
          } catch {
            // Args con comillas sueltas: se rescatan los pares simples.
            const pares: Record<string, string> = {};
            for (const m of bloque.matchAll(/"(\w+)"\s*:\s*"([^"]*)"/g)) pares[m[1]] = m[2];
            out.args = pares;
          }
          break;
        }
      }
    }
  }

  const fin = extractField(raw, "final");
  if (fin != null) out.final = fin;

  return Object.keys(out).some((k) => k !== "thought") ? out : null;
}

/**
 * Fallback robusto: extrae el valor de "final" (o "thought") aunque el JSON esté
 * malformado (p.ej. coma colgante + `"}`). Devuelve la cadena desescapada o null.
 */
function extractField(raw: string, field: "final" | "thought"): string | null {
  const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`); // desescapa \n, \" , etc.
  } catch {
    return m[1];
  }
}

/**
 * Extractor incremental del campo `final` sobre un stream de tokens crudos.
 *
 * El modelo emite JSON envuelto (`{"thought":"...","final":"<texto>"}`), así que
 * los tokens crudos no sirven para mostrar al usuario. Este extractor acumula el
 * buffer y, en cuanto ve la apertura `"final":"`, va emitiendo SOLO los caracteres
 * nuevos del valor (desescapados) por `emit`. Si el turno no trae `final` (es una
 * acción de herramienta), nunca emite. Es stateful pero puro (sin IO): se crea uno
 * por turno. Devuelve la función que consume cada chunk.
 */
export function makeFinalStreamer(emit: (chunk: string) => void): (chunk: string) => void {
  let buf = "";
  let start = -1; // índice en buf del primer char del valor (tras la comilla de apertura)
  let emitted = 0; // nº de chars ya emitidos del valor desescapado
  return (chunk: string) => {
    buf += chunk;
    if (start < 0) {
      // También las claves off-contract con las que el modelo nombra su respuesta
      // (`response`, `answer`…): sin esto el turno no streameaba nada y la
      // respuesta aparecía de golpe al final. Se excluyen las genéricas
      // (`text`, `content`, `message`) porque pueden ser argumentos de una
      // herramienta y arrancarían un streaming que no es la respuesta.
      const m = buf.match(/"(?:final|respuesta|response|answer|reply)"\s*:\s*"/);
      if (!m) return;
      start = m.index! + m[0].length;
    }
    // Recorta el valor hasta la primera comilla NO escapada (fin del string JSON).
    const rest = buf.slice(start);
    let end = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '"' && rest[i - 1] !== "\\") {
        end = i;
        break;
      }
    }
    const rawVal = end < 0 ? rest : rest.slice(0, end);
    // Desescapa (\n, \", \\…). Un escape a medias al final rompe JSON.parse →
    // esperamos al próximo chunk (no emitimos parcial roto).
    let decoded: string;
    try {
      decoded = JSON.parse('"' + rawVal + '"');
    } catch {
      return;
    }
    if (decoded.length > emitted) {
      emit(decoded.slice(emitted));
      emitted = decoded.length;
    }
  };
}

/**
 * ¿El mensaje pide GENERAR un artefacto (documento/diagrama)? El modelo local es
 * demasiado ansioso con las herramientas y produce artefactos aunque el usuario
 * solo pregunte. Este gate determinista decide la ruta: si NO hay intención de
 * generar, se conversa (prosa) sin exponer herramientas → no hay artefactos por
 * accidente y el prefill es menor. Sesga a conversar: exige un SUSTANTIVO de
 * artefacto o un verbo de "dibujar/modelar"; los verbos conversacionales
 * (habla/cuenta/explica/describe/resume/analiza) NO disparan.
 */
const GEN_NOUN =
  /(diagram\w*|document\w*|mermaid|artefact\w*|artifact\w*|roadmap|propuesta|drivers|boceto)|\b(adr|c4|uml|bpmn)\b|mapa de contexto|context map/i;
const GEN_VERB = /(dibuj\w*|grafic\w*|modela\w*|modelar|esquematiz\w*|exporta\w*|exportar)/i;

export function hasGenerationIntent(message: string): boolean {
  const m = message || "";
  return GEN_NOUN.test(m) || GEN_VERB.test(m);
}

/**
 * Sanea Mermaid generado por la IA. El modelo pequeño escribe títulos de
 * `subgraph` con espacios/paréntesis (`subgraph Canal Web (Supporting)`) que el
 * parser rechaza. Reescribe cada `subgraph <título>` a la forma válida
 * `subgraph <id>["<título>"]`, salvo que ya venga con id+corchetes. Puro.
 */
export function sanitizeMermaid(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*)subgraph\s+(.+?)\s*$/);
      if (!m) return line;
      const [, indent, rest] = m;
      // Ya está en forma válida: `id["..."]` o `id[...]` (sin espacios antes del corchete).
      if (/^[A-Za-z0-9_]+\s*\[.*\]$/.test(rest)) return line;
      // Título "limpio" (un solo token válido de id) → dejar tal cual.
      if (/^[A-Za-z0-9_]+$/.test(rest)) return line;
      const title = rest.replace(/^["']|["']$/g, "").trim();
      const id = sanitizeId(title) || "sg";
      return `${indent}subgraph ${id}["${title}"]`;
    })
    .join("\n");
}

/**
 * Notaciones relevantes al turno, en orden de prioridad. La notación NO es una
 * propiedad del chat sino del modelo que se está mirando: si solo se mira (sin
 * pinear vistas) hay que tomar la de la vista activa / del documento, o el
 * agente razona siempre en la notación por defecto (sesgo DDD).
 */
export function resolveNotations(opts: {
  injected?: string[];
  activeNotation?: string;
  graphNotation?: string;
}): string[] {
  const injected = Array.from(new Set((opts.injected ?? []).filter(Boolean)));
  if (injected.length) return injected;
  const fallback = opts.activeNotation || opts.graphNotation;
  return fallback ? [fallback] : [];
}

/** Notación dominante del turno (la primera de `resolveNotations`). */
const primaryNotation = (input: LitertAgentInput) =>
  getNotation(input.notations?.[0] ?? input.graphData?.notation ?? DEFAULT_NOTATION_ID);

export function buildContext(input: LitertAgentInput): string {
  let ctx = "";
  const n = primaryNotation(input);
  if (input.graphData) {
    // TOON en vez de JSON: poda geometría/colores del lienzo y tabula los nodos
    // y aristas para gastar menos tokens de contexto (ver graph-toon.ts). La
    // leyenda va una sola vez para que el modelo sepa leer el formato tabular.
    // El encabezado y los ejemplos de contenedor salen del REGISTRO de notaciones:
    // hablar de "modelo de dominio"/"Agregado" ante un C4 o un BPMN es lo que
    // arrastraba al modelo a reetiquetar todo en DDD.
    const contenedores = n.elements
      .filter((e) => e.container)
      .map((e) => e.type)
      .slice(0, 3)
      .join(", ");
    ctx += `\n\n### ${n.modelLabel} actual (notación ${n.label} · SOLO LECTURA · formato TOON)\n${TOON_LEGEND}\nUsa el vocabulario EXACTO del modelo: refiérete a cada contenedor por su \`tipo_contenedor\`${
      contenedores ? ` (p.ej. ${contenedores})` : ""
    } sin reetiquetarlo, y a cada nodo por su \`tipo_elemento\`.\n${clamp(
      safeGraphToToon(input.graphData),
      8000
    )}`;
  }
  if (input.views?.length) {
    ctx +=
      `\n\n### Vistas del diseñador\n` +
      input.views
        .map((v) => `- ${v.name} (${v.kind}, ${v.notation ?? DEFAULT_NOTATION_ID})`)
        .join("\n");
  }
  if (input.contextArtifacts?.length) {
    ctx +=
      `\n\n### Artefactos en contexto\n` +
      input.contextArtifacts.map((a) => `#### ${a.title} (${a.kind})\n${clamp(a.content, 3000)}`).join("\n\n");
  }
  const docs = (input.documents ?? []).filter((d) => d.text.trim());
  if (docs.length) {
    ctx +=
      `\n\n### Documentos adjuntos (fuente principal — léelos y básate en su contenido)\n` +
      docs.map((d) => `#### ${d.name}\n${clamp(d.text, 12000)}`).join("\n\n");
  }
  return ctx;
}

/**
 * Genera un DOCUMENTO markdown. Usa la guía (`promptHint`) del registro de
 * artefactos para el `kind` dado → la salida sigue el formato esperado por preset.
 */
async function genDocument(
  modelFile: string,
  kind: string,
  title: string,
  instructions: string,
  ctx: string,
  notation?: string
): Promise<string> {
  const def = getDefinition(kind, "document");
  const n = getNotation(notation);
  const sys =
    // El rol sale del registro de notaciones: un documento sobre un C4 no lo
    // escribe un modelador DDD (eso metía Bounded Contexts donde no hay).
    `Eres ${n.analystRole}. Generas documentos claros, en español, en Markdown. Usa el vocabulario y los nombres REALES del modelo (${n.modelLabel}, notación ${n.label}). Responde SÓLO con el Markdown del documento, sin preámbulos.` +
    (def.promptHint ? `\nGuía de formato (${def.label}): ${def.promptHint}` : "");
  return litertGenerate(modelFile, [
    { role: "system", content: sys },
    { role: "user", content: `Documento: "${title}" (tipo: ${kind}).\nInstrucciones: ${instructions}${ctx}` },
  ]);
}

/** Genera un DIAGRAMA mermaid usando el tipo y la guía del registro para el `kind`. */
async function genDiagram(
  modelFile: string,
  kind: string,
  title: string,
  instructions: string,
  ctx: string,
  notation?: string
): Promise<string> {
  const def = getDefinition(kind, "diagram");
  const n = getNotation(notation);
  const sys =
    `Notación activa: ${n.label}. ${n.aiGuidance}\n` +
    "Eres experto en Mermaid. Generas diagramas VÁLIDOS en sintaxis Mermaid. Responde SÓLO con el código Mermaid, sin explicación ni fences." +
    // Reglas para evitar los errores típicos del modelo pequeño (paréntesis/espacios
    // en títulos rompen el parser). El sanitizer cubre subgraph; esto ayuda al resto.
    "\nREGLAS: (1) Todo `subgraph` DEBE ser `subgraph id[\"Título con espacios\"]` — nunca `subgraph Título con espacios`. (2) Los ids de nodo son alfanuméricos sin espacios ni paréntesis; el texto visible va entre corchetes: `id[\"Texto (con paréntesis) ok\"]`. (3) Etiquetas de arista entre comillas: `A -- \"texto\" --> B`." +
    (def.mermaidKind ? `\nUsa un diagrama de tipo: ${def.mermaidKind}.` : "") +
    (def.promptHint ? `\nGuía (${def.label}): ${def.promptHint}` : "");
  const raw = await litertGenerate(modelFile, [
    { role: "system", content: sys },
    { role: "user", content: `Diagrama: "${title}" (tipo: ${kind}).\nInstrucciones: ${instructions}${ctx}` },
  ]);
  return sanitizeMermaid(stripFence(raw));
}

/** Menú de "kinds" disponibles (del registro) para que el agente elija. */
function toolMenu(): string {
  const docs = documentDefinitions()
    .map((d) => `  • ${d.kind} — ${d.description}`)
    .join("\n");
  const diags = diagramDefinitions()
    .map((d) => `  • ${d.kind} — ${d.description}`)
    .join("\n");
  return (
    `\n\nKinds para generate_document (Markdown):\n${docs}` +
    `\n\nKinds para generate_diagram (Mermaid):\n${diags}` +
    `\n(Puedes inventar un kind kebab-case nuevo si ninguno encaja.)`
  );
}

const MAX_TURNS = 5;

/**
 * Marco de razonamiento del agente según la(s) notación(es) activas. Puro y
 * testeable: mapea las notaciones inyectadas a la `aiGuidance` correspondiente
 * (DDD/BPMN/C4/UML) e indica si DDD está activo (para el addendum de vocabulario).
 * Sin notaciones → DDD por defecto.
 */
export function buildReasoningFrame(opts: {
  notations?: string[];
  hasGraph: boolean;
  systemPrompt?: string;
}): { persona: string; vocabRule: string; dddActive: boolean } {
  const notationIds = Array.from(new Set((opts.notations ?? []).filter(Boolean)));
  // Sin notaciones a la vista se asume la por defecto del registro; dar por
  // sentado DDD dejaba el addendum de dominio activo en modelos que no lo son.
  const activas = notationIds.length ? notationIds : [DEFAULT_NOTATION_ID];
  const dddActive = activas.includes("ddd");
  const guidance = activas
    .map((id) => {
      const n = getNotation(id);
      return `Notación ${n.label}: ${n.aiGuidance}`;
    })
    .join("\n\n");

  const personaBase = opts.systemPrompt?.trim()
    ? opts.systemPrompt.trim()
    : "Eres un Arquitecto de Software Principal que asiste por chat.";
  const persona = `${personaBase}\n${guidance}`;

  // Genérico (nombra por `tipo_contenedor`/`tipo_elemento`, no inventes) para
  // cualquier notación; addendum DDD (Agregado ≠ Bounded Context) solo con DDD
  // activo, para no desinformar en BPMN/C4/UML.
  const vocabRule = opts.hasGraph
    ? `\n\nREGLA de vocabulario (prioritaria): nombra cada contenedor por su \`tipo_contenedor\` literal y cada nodo por su \`tipo_elemento\`; no inventes elementos que no estén en los datos.` +
      (dddActive
        ? ` En DDD un "Agregado" NO es un "Bounded Context": no reetiquetes contenedores ni inventes un "Mapa de Contexto" que no exista en los datos.`
        : "")
    : "";

  return { persona, vocabRule, dddActive };
}

export async function runLitertAgent(input: LitertAgentInput): Promise<LitertAgentResult> {
  const ctx = buildContext(input);
  // Notación dominante: rige la persona de los artefactos que se generen.
  const notationId = primaryNotation(input).id;
  const artifacts: AgentArtifactOut[] = [];
  const steps: AgentStepOut[] = [];

  // Marco de razonamiento según las notaciones de las vistas inyectadas: sin ellas
  // se asume DDD; con ellas se inyecta la guía de cada notación para que el modelo
  // NO razone siempre en DDD (ver buildReasoningFrame).
  const { persona, vocabRule } = buildReasoningFrame({
    // Sin vistas pineadas se cae a la notación del documento (no a DDD).
    notations: resolveNotations({
      injected: input.notations,
      graphNotation: input.graphData?.notation,
    }),
    hasGraph: !!input.graphData,
    systemPrompt: input.systemPrompt,
  });

  // Gate de intención: si el usuario NO pide generar un artefacto, se conversa en
  // prosa directa (sin exponer herramientas ni protocolo ReAct). Esto evita que el
  // modelo produzca artefactos por su cuenta, reduce el prefill (más rápido) y hace
  // el streaming limpio (no hay que desenvolver `{"final":...}`, es texto crudo).
  if (!hasGenerationIntent(input.message)) {
    const chatSystem = `${persona}${vocabRule}\n\nResponde de forma directa, clara y en español. NO generes documentos ni diagramas ni ningún artefacto; solo conversa, responde y explica.${ctx}`;
    const convo = await createLitertConversation(input.modelFile, chatSystem);
    const reply = (await convo.send(input.message, input.onReplyToken)).trim();
    return { reply: reply || "Listo.", artifacts, steps };
  }

  // Con catálogo de vistas, el agente RECUPERA el contexto por partes (explorar →
  // plan → consolidar) en vez de recibir un paquete armado antes de saber qué
  // necesita (spec 005). Sin catálogo se sigue el bucle clásico: es lo que usan
  // los llamadores viejos.
  if (input.catalog) {
    return exploreLoop(input, input.catalog, {
      ctx,
      notationId,
      persona,
      vocabRule,
      state: input.run ?? startRun({ uid: newRunId }, input.message, input.budget ?? RUN_BUDGET),
      steps,
      artifacts,
    });
  }

  const system = `${persona}${vocabRule}

Trabajas en un bucle Razonamiento→Acción. En CADA turno respondes con UN ÚNICO objeto JSON, sin texto fuera de él y sin fences:
- Para usar una herramienta: {"thought":"por qué","action":"<nombre>","args":{...}}
- Para terminar o si solo conversas: {"thought":"...","final":"<respuesta en lenguaje natural>"}

Herramientas (action / args):
- "generate_document" {"kind":"<kind>","title":"...","instructions":"qué contener"} — documento Markdown.
- "generate_diagram" {"kind":"<kind>","title":"...","instructions":"qué representar"} — diagrama Mermaid.
Elige el "kind" del menú según lo que pida el usuario (drivers, propuesta, roadmap, ADR, mapa de contexto, C4, etc.).
${toolMenu()}

Dentro de los textos del JSON NO uses comillas dobles (usá 'simples'): una comilla sin escapar rompe el turno.
Si el usuario solo pregunta o conversa, responde directamente con {"final":"..."} SIN herramientas. Tras cada acción recibirás una "Observación"; encadena lo necesario y cierra con {"final":"..."}.${ctx}`;

  // Una sola conversación para todo el bucle: el system+contexto se prefilla UNA
  // vez (queda en el KV-cache) y cada turno sólo agrega la observación nueva. Antes
  // se recreaba la conversación y se reenviaba el transcript entero por turno, lo
  // que re-procesaba el grafo/contexto en cada iteración (el mayor costo local).
  const convo = await createLitertConversation(input.modelFile, system);
  const NEXT = `\n\nResponde con el JSON de la próxima acción, o {"final":"..."} si ya puedes responder.`;
  let nextUser = input.message + NEXT;
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Streamer por turno: emite el texto de `final` en vivo (si el turno lo trae).
    const onToken = input.onReplyToken ? makeFinalStreamer(input.onReplyToken) : undefined;
    const raw = await convo.send(nextUser, onToken);

    const parsed = parseJson(raw) ?? repairProtocolJson(raw);

    // JSON ilegible: si era un turno de PROTOCOLO no se muestra —el JSON del bucle
    // no es una respuesta— y se le pide repetirlo; si era prosa, se muestra.
    if (!parsed || typeof parsed !== "object") {
      if (looksLikeProtocol(raw)) {
        nextUser = `Observación: tu respuesta no era un JSON válido (escapá las comillas dentro de los textos: \\"). Repetí el paso con UN objeto JSON válido.${NEXT}`;
        continue;
      }
      reply = extractField(raw, "final") ?? raw.trim();
      break;
    }
    if (parsed.thought) steps.push({ type: "thought", content: String(parsed.thought) });
    if (parsed.final != null || !parsed.action) {
      reply =
        String(parsed.final ?? "").trim() ||
        extractField(raw, "final") ||
        salvageReply(raw, parsed);
      break;
    }

    const action = String(parsed.action);
    const a = parsed.args || {};
    const kind = (a.kind && String(a.kind)) || (action === "generate_diagram" ? "diagram" : "document");
    const title = a.title || getDefinition(kind, action === "generate_diagram" ? "diagram" : "document").label;
    steps.push({ type: "action", tool: action, content: `${title} (${kind})` });
    try {
      if (action === "generate_document") {
        const md = await genDocument(input.modelFile, kind, title, a.instructions || "", ctx, notationId);
        artifacts.push({ kind, render: "markdown", title, payload: { markdown: md } });
        nextUser = `Observación: documento "${title}" (${kind}) generado.${NEXT}`;
        steps.push({ type: "observation", content: `Documento "${title}" generado.` });
      } else if (action === "generate_diagram") {
        const code = await genDiagram(input.modelFile, kind, title, a.instructions || "", ctx, notationId);
        artifacts.push({ kind, render: "mermaid", title, payload: { code } });
        nextUser = `Observación: diagrama "${title}" (${kind}) generado.${NEXT}`;
        steps.push({ type: "observation", content: `Diagrama "${title}" generado.` });
      } else {
        nextUser = `Observación: acción inválida "${action}". Usa generate_document/generate_diagram o {"final":"..."}.${NEXT}`;
      }
    } catch (e: any) {
      nextUser = `Observación: ERROR en ${action}: ${String(e?.message ?? e)}${NEXT}`;
      steps.push({ type: "observation", content: `Error en ${action}: ${String(e?.message ?? e)}` });
    }
  }

  if (!reply) {
    reply = artifacts.length ? `Generé ${artifacts.length} artefacto(s).` : "Listo.";
  }
  return { reply, artifacts, steps };
}

/* -------------------------------------------------------------------------- */
/* Bucle con recuperación por partes y human-in-the-loop (spec 005)            */
/* -------------------------------------------------------------------------- */

/** Turnos del bucle explorador: alcanza para explorar, planificar y consolidar. */
const MAX_EXPLORE_TURNS = 12;
/** Turnos que puede gastar LEYENDO antes de que se le exija consolidar. */
const MAX_TOOL_TURNS = 8;

const newRunId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `run-${Math.random().toString(36).slice(2)}`;

interface LoopDeps {
  ctx: string;
  notationId: string;
  persona: string;
  vocabRule: string;
  state: AgentRunState;
  steps: AgentStepOut[];
  artifacts: AgentArtifactOut[];
  /** Observación con la que arranca el turno (reanudación tras decidir el humano). */
  seed?: string;
}

/** Decisión del humano que reanuda una corrida detenida. */
export type ResumeDecision =
  | { kind: "approve" }
  | { kind: "adjust"; feedback: string }
  | { kind: "answer"; answer: string }
  | { kind: "cancel"; reason?: string };

/**
 * Reanuda una corrida que estaba esperando al humano. La conversación con el
 * modelo NO se conserva (no es serializable y el usuario pudo recargar): se abre
 * una nueva y la memoria son las NOTAS de la corrida, que es exactamente para lo
 * que existen.
 */
export async function resumeLitertAgent(
  input: LitertAgentInput & { run: AgentRunState; resume: ResumeDecision }
): Promise<LitertAgentResult> {
  const cat = input.catalog ?? { views: [] };
  const artifacts: AgentArtifactOut[] = [];
  const steps: AgentStepOut[] = [];
  const notationId = primaryNotation(input).id;
  const { persona, vocabRule } = buildReasoningFrame({
    notations: resolveNotations({
      injected: input.notations,
      graphNotation: input.graphData?.notation,
    }),
    hasGraph: !!input.graphData,
    systemPrompt: input.systemPrompt,
  });

  let state = input.run;
  let seed: string;
  switch (input.resume.kind) {
    case "approve": {
      state = approvePlan(state);
      steps.push({ type: "decision", content: "El humano aprobó el plan." });
      seed = "Observación: el humano APROBÓ el plan. Generá el artefacto con la herramienta correspondiente.";
      break;
    }
    case "adjust": {
      const r = adjustPlan(state, input.resume.feedback);
      state = r.state;
      steps.push({ type: "decision", content: `Ajuste del plan: ${input.resume.feedback}` });
      seed = `Observación: ${r.observation}`;
      break;
    }
    case "answer": {
      state = answerQuestion(state, input.resume.answer);
      const d = state.decisions[state.decisions.length - 1];
      steps.push({
        type: "decision",
        content: d ? `${d.question} → ${d.answer}${d.assumed ? " (supuesto)" : ""}` : "Respuesta registrada.",
      });
      seed = `Observación: el humano respondió "${d?.answer ?? ""}"${
        d?.assumed ? " (era un supuesto por defecto, declaralo en el artefacto)" : ""
      }. Seguí.`;
      break;
    }
    case "cancel": {
      state = cancelRun(state, input.resume.reason ?? "cancelado por el humano");
      return {
        reply: `Cancelado: ${state.cancelledReason}. No generé ningún artefacto.`,
        artifacts,
        steps: [...steps, { type: "decision", content: "El humano canceló la corrida." }],
        run: state,
      };
    }
  }

  return exploreLoop(input, cat, {
    ctx: buildContext(input),
    notationId,
    persona,
    vocabRule,
    state,
    steps,
    artifacts,
    seed,
  });
}

/** Menú de herramientas del bucle explorador (lectura + generación). */
function exploreToolMenu(cat: Catalog): string {
  return `Herramientas de LECTURA (usalas antes de generar; el contexto NO viene dado):
- "list_views" {} — qué vistas hay, con su notación y cuántos elementos tiene cada una.
- "read_view" {"name":"<nombre exacto de la vista>"} — el grafo de esa vista.
- "search_model" {"term":"<palabra>"} — dónde aparece un concepto (dice en qué vista vive).

Herramientas de GENERACIÓN (sólo con el plan aprobado):
- "generate_document" {"kind":"<kind>","title":"...","instructions":"qué contener"}
- "generate_diagram" {"kind":"<kind>","title":"...","instructions":"qué representar"}
${toolMenu()}

Inventario inicial:
${formatInventory(listViews(cat))}`;
}

function planFromJson(raw: any): { kind: "plan"; title: string; artifactKind: string; sections: { title: string; sources: string[] }[] } | null {
  const p = raw?.plan ?? raw;
  if (!p || typeof p !== "object") return null;
  const secciones = Array.isArray(p.sections) ? p.sections : [];
  return {
    kind: "plan",
    title: String(p.title ?? "Artefacto"),
    artifactKind: String(p.artifactKind ?? p.kind ?? "markdown"),
    sections: secciones.map((s: any) => ({
      title: String(s?.title ?? ""),
      sources: (Array.isArray(s?.sources) ? s.sources : [s?.sources])
        .filter(Boolean)
        .map((x: any) => String(x)),
    })),
  };
}

function questionFromJson(raw: any): { kind: "question"; id: string; text: string; options: string[] } | null {
  const q = raw?.question ?? raw;
  if (!q || typeof q !== "object" || !q.text) return null;
  return {
    kind: "question",
    id: String(q.id ?? slugishId(String(q.text))),
    text: String(q.text),
    options: (Array.isArray(q.options) ? q.options : []).map((o: any) => String(o)),
  };
}

const slugishId = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);

/** Pie de cobertura: el artefacto DECLARA qué se leyó y qué no (FR-011). */
function withCoverageFooter(markdown: string, state: AgentRunState): string {
  if (/##\s*Cobertura/i.test(markdown)) return markdown;
  const cob = state.coverage;
  if (!cob) return markdown;
  const lineas = [
    "",
    "## Cobertura",
    `- Revisado: ${cob.readViews.length ? cob.readViews.join(", ") : "sólo el modelo principal"}.`,
    cob.skippedViews.length
      ? `- Sin revisar: ${cob.skippedViews.join(", ")}${cob.reason ? ` (${cob.reason})` : ""}.`
      : "- Sin vistas pendientes.",
  ];
  const supuestos = state.decisions.filter((d) => d.assumed);
  if (supuestos.length) {
    lineas.push(
      ...supuestos.map((d) => `- Supuesto: ${d.question} → ${d.answer} (el humano no decidió).`)
    );
  }
  return `${markdown.trimEnd()}\n${lineas.join("\n")}\n`;
}

/**
 * El bucle: explora con las herramientas de lectura, se detiene para que el
 * humano apruebe el plan o responda una duda, y consolida citando lo leído.
 */
async function exploreLoop(
  input: LitertAgentInput,
  cat: Catalog,
  deps: LoopDeps
): Promise<LitertAgentResult> {
  const { ctx, notationId, persona, vocabRule, steps, artifacts } = deps;
  let state = deps.state;

  const system = `${persona}${vocabRule}

Trabajas en un bucle Razonamiento→Acción sobre un proyecto cuyo contenido NO conocés todavía: lo LEÉS con herramientas.
En CADA turno respondés con UN ÚNICO objeto JSON, sin texto fuera de él y sin fences:
- Leer o generar: {"thought":"por qué","action":"<nombre>","args":{...}}
- Proponer el plan (obligatorio antes de generar): {"thought":"...","plan":{"title":"...","artifactKind":"<kind>","sections":[{"title":"...","sources":["<vista o documento>"]}]}}
- Preguntar al humano SÓLO si la respuesta cambia el resultado: {"thought":"...","question":{"id":"<corto>","text":"...","options":["opción por defecto","alternativa"]}}
- Cerrar conversando: {"thought":"...","final":"<respuesta>"}

Reglas: leé lo que necesites antes de planificar; no inventes nombres de vistas (usá los del inventario); no repitas una pregunta ya respondida; cuando te digan que no hay presupuesto, consolidá con lo anotado.
IMPORTANTE sobre el JSON: dentro de los textos NO uses comillas dobles (usá 'simples' si necesitás citar). Una comilla sin escapar rompe el turno.

${exploreToolMenu(cat)}${ctx}`;

  const convo = await createLitertConversation(input.modelFile, system);
  const NEXT = `\n\nResponde con el JSON del próximo paso.`;
  let nextUser = deps.seed ? `${deps.seed}${NEXT}` : `${input.message}${NEXT}`;
  let reply = "";
  /** Turnos con JSON inválido: a la tercera se corta con un mensaje humano. */
  let malformados = 0;

  const generar = async (action: string, a: any): Promise<void> => {
    const tipo = action === "generate_diagram" ? "diagram" : "document";
    const kind = (a?.kind && String(a.kind)) || state.plan?.artifactKind || tipo;
    const title = a?.title || state.plan?.title || getDefinition(kind, tipo).label;
    const instrucciones = String(a?.instructions ?? "");
    state = { ...state, coverage: coverageOf(state, cat) };
    steps.push({ type: "consolidate", content: `Consolidando "${title}" con ${state.notes.length} nota(s).` });
    const consolidado = `\n\n${consolidationPrompt(state)}`;

    if (action === "generate_diagram") {
      const code = await genDiagram(input.modelFile, kind, title, instrucciones, consolidado, notationId);
      artifacts.push({ kind, render: "mermaid", title, payload: { code } });
      return;
    }
    let md = await genDocument(input.modelFile, kind, title, instrucciones, consolidado, notationId);
    let v = validateCitations(md, state);
    if (!v.ok) {
      // Un intento de corrección: citar una fuente que no se leyó hace que la
      // trazabilidad MIENTA, y eso es peor que no tenerla.
      const aviso = `${instrucciones}\n\nCORREGÍ: estas citas no corresponden a nada leído: ${v.invalid.join(
        ", "
      )}. Usá sólo las fuentes y elementos listados.`;
      md = await genDocument(input.modelFile, kind, title, aviso, consolidado, notationId);
      v = validateCitations(md, state);
      if (!v.ok) md = stripInvalidCitations(md, v.invalid);
    }
    artifacts.push({ kind, render: "markdown", title, payload: { markdown: withCoverageFooter(md, state) } });
  };

  for (let turn = 0; turn < MAX_EXPLORE_TURNS; turn++) {
    state = { ...state, turn: state.turn + 1 };
    const onToken = input.onReplyToken ? makeFinalStreamer(input.onReplyToken) : undefined;
    const raw = await convo.send(nextUser, onToken);
    const parsed = parseJson(raw) ?? repairProtocolJson(raw);

    if (!parsed || typeof parsed !== "object") {
      // Turno de protocolo irrecuperable: se le pide de nuevo en vez de mostrarle
      // al usuario el JSON del bucle (que no es una respuesta).
      if (looksLikeProtocol(raw)) {
        malformados++;
        if (malformados <= 2) {
          nextUser = `Observación: tu respuesta no era un JSON válido (revisá las comillas dentro de los textos: se escriben \\"). Repetí el paso con UN objeto JSON válido.${NEXT}`;
          continue;
        }
        reply = "No pude seguir: el modelo devolvió un formato inválido tres veces. Probá de nuevo o con un modelo más grande.";
        break;
      }
      reply = extractField(raw, "final") ?? raw.trim();
      break;
    }
    if (parsed.thought) steps.push({ type: "thought", content: String(parsed.thought) });

    // --- Plan: el primer punto donde decide el humano ---
    if (parsed.plan) {
      const plan = planFromJson(parsed);
      const r = plan ? registerPlan(state, plan, cat) : { state, observation: "Plan ilegible." };
      state = r.state;
      if (r.observation) {
        nextUser = `Observación: ${r.observation}${NEXT}`;
        continue;
      }
      steps.push({
        type: "plan",
        content: state.plan!.sections.map((sec) => `${sec.title} ← ${sec.sources.join(", ")}`).join(" · "),
      });
      return {
        reply: `Antes de generar «${state.plan!.title}», revisá el plan.`,
        artifacts,
        steps,
        run: state,
      };
    }

    // --- Pregunta al humano ---
    if (parsed.question) {
      const q = questionFromJson(parsed);
      const r = q ? registerQuestion(state, q) : { state, observation: "Pregunta ilegible." };
      state = r.state;
      if (r.observation) {
        nextUser = `Observación: ${r.observation}${NEXT}`;
        continue;
      }
      steps.push({ type: "question", content: q!.text });
      return { reply: q!.text, artifacts, steps, run: state };
    }

    if (parsed.final != null || !parsed.action) {
      reply = String(parsed.final ?? "").trim() || extractField(raw, "final") || salvageReply(raw, parsed);
      break;
    }

    const action = String(parsed.action);
    const a = parsed.args || {};

    // --- Lecturas ---
    if ((READ_TOOLS as readonly string[]).includes(action)) {
      const call =
        action === "read_view"
          ? ({ tool: "read_view", name: String(a.name ?? a.view ?? "") } as ToolCall)
          : action === "search_model"
            ? ({ tool: "search_model", term: String(a.term ?? a.query ?? "") } as ToolCall)
            : ({ tool: "list_views" } as ToolCall);
      const r = applyToolCall(state, call, cat);
      state = r.state;
      steps.push({
        type: action === "search_model" ? "search" : "read",
        tool: action,
        source: call.tool === "read_view" ? call.name : call.tool === "search_model" ? call.term : undefined,
        content: r.note ? r.note.facts.join(" ") : clamp(r.observation, 200),
      });
      nextUser = mustConsolidate(state, { maxToolTurns: MAX_TOOL_TURNS })
        ? `Observación: ${r.observation}\n\nYa no hay margen para leer más: proponé el plan (o generá si ya está aprobado) con lo anotado.${NEXT}`
        : `Observación: ${r.observation}${NEXT}`;
      continue;
    }

    // --- Generación: exige plan aprobado ---
    if (action === "generate_document" || action === "generate_diagram") {
      if (needsPlan(state)) {
        nextUser = `Observación: antes de generar tenés que proponer el plan (secciones y de qué vista sale cada una) y esperar la aprobación del humano.${NEXT}`;
        continue;
      }
      const title = a?.title || state.plan?.title || "artefacto";
      steps.push({ type: "action", tool: action, content: String(title) });
      try {
        await generar(action, a);
        nextUser = `Observación: "${title}" generado y puesto en el lienzo. Cerrá con {"final":"..."} resumiendo qué hiciste.${NEXT}`;
        steps.push({ type: "observation", content: `"${title}" generado.` });
      } catch (e: any) {
        nextUser = `Observación: ERROR generando: ${String(e?.message ?? e)}${NEXT}`;
        steps.push({ type: "observation", content: `Error generando: ${String(e?.message ?? e)}` });
      }
      continue;
    }

    nextUser = `Observación: acción inválida "${action}". Disponibles: ${READ_TOOLS.join(
      ", "
    )}, generate_document, generate_diagram.${NEXT}`;
  }

  // Red de seguridad: se agotaron los turnos con el plan aprobado y sin artefacto
  // ⇒ se consolida con lo leído en vez de cerrar con las manos vacías (FR-013).
  if (!artifacts.length && !needsPlan(state) && !isCancelled(state)) {
    try {
      await generar("generate_document", { kind: state.plan?.artifactKind, title: state.plan?.title });
    } catch {
      /* si tampoco se puede generar, el reply de abajo lo dice */
    }
  }

  if (!reply) {
    reply = artifacts.length
      ? `Generé ${artifacts.length} artefacto(s) con lo leído en ${state.read.length} vista(s).`
      : "No llegué a generar nada: probá pidiéndolo de nuevo con más detalle.";
  }
  return { reply, artifacts, steps, run: { ...state, pause: undefined } };
}
