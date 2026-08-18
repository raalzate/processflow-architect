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

export interface AgentArtifactOut {
  kind: string;
  render: "markdown" | "mermaid";
  title: string;
  payload: { markdown: string } | { code: string };
}
export interface AgentStepOut {
  type: "thought" | "action" | "observation";
  tool?: string;
  content: string;
}
export interface LitertAgentResult {
  reply: string;
  artifacts: AgentArtifactOut[];
  steps: AgentStepOut[];
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
      const m = buf.match(/"final"\s*:\s*"/);
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

  const system = `${persona}${vocabRule}

Trabajas en un bucle Razonamiento→Acción. En CADA turno respondes con UN ÚNICO objeto JSON, sin texto fuera de él y sin fences:
- Para usar una herramienta: {"thought":"por qué","action":"<nombre>","args":{...}}
- Para terminar o si solo conversas: {"thought":"...","final":"<respuesta en lenguaje natural>"}

Herramientas (action / args):
- "generate_document" {"kind":"<kind>","title":"...","instructions":"qué contener"} — documento Markdown.
- "generate_diagram" {"kind":"<kind>","title":"...","instructions":"qué representar"} — diagrama Mermaid.
Elige el "kind" del menú según lo que pida el usuario (drivers, propuesta, roadmap, ADR, mapa de contexto, C4, etc.).
${toolMenu()}

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

    const parsed = parseJson(raw);

    // JSON ilegible: intenta rescatar "final" (JSON malformado) o muestra el texto plano.
    if (!parsed || typeof parsed !== "object") {
      reply = extractField(raw, "final") ?? raw.trim();
      break;
    }
    if (parsed.thought) steps.push({ type: "thought", content: String(parsed.thought) });
    if (parsed.final != null || !parsed.action) {
      reply =
        String(parsed.final ?? "").trim() ||
        extractField(raw, "final") ||
        raw.trim();
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
