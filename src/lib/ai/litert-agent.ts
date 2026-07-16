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

import { litertGenerate } from "./litert-engine";
import { safeGraphToToon, TOON_LEGEND } from "./graph-toon";
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
  contextArtifacts?: { kind: string; title: string; content: string }[];
  /** Texto extraído de adjuntos (PDF/imagen/texto) como fuente de contexto. */
  documents?: { name: string; text: string }[];
  /** System/persona base (de Configuraciones). */
  systemPrompt?: string;
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

function buildContext(input: LitertAgentInput): string {
  let ctx = "";
  if (input.graphData) {
    // TOON en vez de JSON: poda geometría/colores del lienzo y tabula los nodos
    // y aristas para gastar menos tokens de contexto (ver graph-toon.ts). La
    // leyenda va una sola vez para que el modelo sepa leer el formato tabular.
    ctx += `\n\n### Modelo de dominio actual (SOLO LECTURA · formato TOON)\n${TOON_LEGEND}\n${clamp(
      safeGraphToToon(input.graphData),
      8000
    )}`;
  }
  if (input.views?.length) {
    ctx +=
      `\n\n### Vistas del diseñador\n` +
      input.views.map((v) => `- ${v.name} (${v.kind}, ${v.notation ?? "ddd"})`).join("\n");
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
  ctx: string
): Promise<string> {
  const def = getDefinition(kind, "document");
  const sys =
    "Eres un Arquitecto de Software Senior. Generas documentos de arquitectura claros, en español, en Markdown. Aplicas DDD y Lenguaje Ubicuo (usa los nombres reales del modelo). Responde SÓLO con el Markdown del documento, sin preámbulos." +
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
  ctx: string
): Promise<string> {
  const def = getDefinition(kind, "diagram");
  const sys =
    "Eres experto en Mermaid. Generas diagramas VÁLIDOS en sintaxis Mermaid. Responde SÓLO con el código Mermaid, sin explicación ni fences." +
    (def.mermaidKind ? `\nUsa un diagrama de tipo: ${def.mermaidKind}.` : "") +
    (def.promptHint ? `\nGuía (${def.label}): ${def.promptHint}` : "");
  const raw = await litertGenerate(modelFile, [
    { role: "system", content: sys },
    { role: "user", content: `Diagrama: "${title}" (tipo: ${kind}).\nInstrucciones: ${instructions}${ctx}` },
  ]);
  return stripFence(raw);
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

export async function runLitertAgent(input: LitertAgentInput): Promise<LitertAgentResult> {
  const ctx = buildContext(input);
  const artifacts: AgentArtifactOut[] = [];
  const steps: AgentStepOut[] = [];

  const persona = input.systemPrompt?.trim()
    ? input.systemPrompt.trim()
    : "Eres un Arquitecto de Software Principal que asiste por chat. Aplicas DDD y Lenguaje Ubicuo.";

  const system = `${persona}

Trabajas en un bucle Razonamiento→Acción. En CADA turno respondes con UN ÚNICO objeto JSON, sin texto fuera de él y sin fences:
- Para usar una herramienta: {"thought":"por qué","action":"<nombre>","args":{...}}
- Para terminar o si solo conversas: {"thought":"...","final":"<respuesta en lenguaje natural>"}

Herramientas (action / args):
- "generate_document" {"kind":"<kind>","title":"...","instructions":"qué contener"} — documento Markdown.
- "generate_diagram" {"kind":"<kind>","title":"...","instructions":"qué representar"} — diagrama Mermaid.
Elige el "kind" del menú según lo que pida el usuario (drivers, propuesta, roadmap, ADR, mapa de contexto, C4, etc.).
${toolMenu()}

Si el usuario solo pregunta o conversa, responde directamente con {"final":"..."} SIN herramientas. Tras cada acción recibirás una "Observación"; encadena lo necesario y cierra con {"final":"..."}.${ctx}`;

  const transcript: string[] = [];
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const prompt =
      input.message +
      (transcript.length ? `\n\n### Acciones y observaciones previas\n${transcript.join("\n")}` : "") +
      `\n\nResponde con el JSON de la próxima acción, o {"final":"..."} si ya puedes responder.`;

    const raw = await litertGenerate(input.modelFile, [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ]);

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
        const md = await genDocument(input.modelFile, kind, title, a.instructions || "", ctx);
        artifacts.push({ kind, render: "markdown", title, payload: { markdown: md } });
        transcript.push(`Acción: generate_document ${kind} (${title})\nObservación: documento generado.`);
        steps.push({ type: "observation", content: `Documento "${title}" generado.` });
      } else if (action === "generate_diagram") {
        const code = await genDiagram(input.modelFile, kind, title, a.instructions || "", ctx);
        artifacts.push({ kind, render: "mermaid", title, payload: { code } });
        transcript.push(`Acción: generate_diagram ${kind} (${title})\nObservación: diagrama generado.`);
        steps.push({ type: "observation", content: `Diagrama "${title}" generado.` });
      } else {
        transcript.push(`Acción inválida "${action}". Usa generate_document/generate_diagram o {"final":"..."}.`);
      }
    } catch (e: any) {
      transcript.push(`Acción: ${action}\nObservación: ERROR: ${String(e?.message ?? e)}`);
      steps.push({ type: "observation", content: `Error en ${action}: ${String(e?.message ?? e)}` });
    }
  }

  if (!reply) {
    reply = artifacts.length ? `Generé ${artifacts.length} artefacto(s).` : "Listo.";
  }
  return { reply, artifacts, steps };
}
