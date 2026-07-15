// =============================================================================
// Catálogo declarativo de tareas de IA.
//
// Cada entrada describe UNA capacidad de IA y su tier. El router elige el motor.
// Para añadir una función de IA nueva: agrega aquí una entrada — nada más.
//
//   light  → IA local (Qwen): sugerencias cortas y frecuentes en el diseñador.
//   heavy  → IA remota (Gemini): análisis estructurado del panel de agentes.
// =============================================================================

import type { AiTask } from "./router";
import {
  promptDescribeNode,
  promptLinkLabel,
  promptBigPictureDescription,
  promptClassifyType,
  promptSuggestName,
  promptSuggestTags,
  promptSuggestNext,
  withReference,
  SYSTEM_PROMPT_DESIGNER,
} from "@/lib/template-prompt";
import { NODE_TYPES } from "@/lib/types";

// Recorta espacios ANTES de quitar comillas: la IA local suele devolver la
// respuesta con espacios alrededor (p. ej. `  "texto"  `). Trim → quita comillas
// de los bordes → trim final por si quedaban espacios internos al borde.
const stripQuotes = (s: string) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();

// --- Tareas LIGERAS (IA local) ---

export const describeNodeTask: AiTask<{ tipo: string; nombre: string; descripcion?: string; referencia?: string }, string> = {
  id: "describe-node",
  tier: "light",
  maxLocalChars: 600,
  buildPrompt: (i) => ({
    prompt: withReference(promptDescribeNode(i.tipo, i.nombre, i.descripcion), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw),
};

/** Clasifica el tipo DDD del nodo; la salida se valida contra NODE_TYPES. */
export const classifyTypeTask: AiTask<{ nombre: string; descripcion?: string; referencia?: string }, string> = {
  id: "classify-type",
  tier: "light",
  maxLocalChars: 800,
  buildPrompt: (i) => ({
    prompt: withReference(promptClassifyType(i.nombre, i.descripcion || "", NODE_TYPES), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => {
    const clean = stripQuotes(raw).toLowerCase();
    return (
      NODE_TYPES.find((t) => clean === t.toLowerCase()) ||
      NODE_TYPES.find((t) => clean.includes(t.toLowerCase())) ||
      ""
    );
  },
};

/** Sugiere un nombre en Lenguaje Ubicuo según el tipo. */
export const suggestNameTask: AiTask<{ tipo: string; descripcion?: string; referencia?: string }, string> = {
  id: "suggest-name",
  tier: "light",
  maxLocalChars: 800,
  buildPrompt: (i) => ({
    prompt: withReference(promptSuggestName(i.tipo, i.descripcion || ""), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw).replace(/\.$/, "").trim(),
};

/** Sugiere tecnologías/etiquetas (devuelve un array). */
export const suggestTagsTask: AiTask<{ tipo: string; nombre: string; descripcion?: string; referencia?: string }, string[]> = {
  id: "suggest-tags",
  tier: "light",
  maxLocalChars: 800,
  buildPrompt: (i) => ({
    prompt: withReference(promptSuggestTags(i.tipo, i.nombre, i.descripcion || ""), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) =>
    stripQuotes(raw)
      .split(/[,\n;]+/)
      .map((t) => t.trim())
      .filter((t) => t && t.length < 30)
      .slice(0, 6),
};

/** Event Storming: sugiere el siguiente elemento del flujo {tipo, nombre, relacion}. */
export const suggestNextTask: AiTask<
  { tipo: string; nombre: string; descripcion?: string; referencia?: string },
  { tipo: string; nombre: string; relacion: string }
> = {
  id: "suggest-next",
  tier: "light",
  maxLocalChars: 900,
  buildPrompt: (i) => ({
    prompt: withReference(promptSuggestNext(i.tipo, i.nombre, i.descripcion || "", NODE_TYPES), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => {
    const parts = stripQuotes(raw).split("|").map((s) => s.trim());
    const t = (parts[0] || "").toLowerCase();
    const tipo =
      NODE_TYPES.find((x) => x.toLowerCase() === t) ||
      NODE_TYPES.find((x) => t.includes(x.toLowerCase())) ||
      "Evento";
    return { tipo, nombre: parts[1] || "", relacion: (parts[2] || "produce").toLowerCase() };
  },
};

export const linkLabelTask: AiTask<
  { sourceName: string; sourceType: string; targetName: string; targetType: string; referencia?: string },
  string
> = {
  id: "link-label",
  tier: "light",
  maxLocalChars: 600,
  buildPrompt: (i) => ({
    prompt: withReference(promptLinkLabel(i.sourceName, i.sourceType, i.targetName, i.targetType), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw).replace(/\.$/, "").toLowerCase(),
};

export const bigPictureDescTask: AiTask<{ resumen: string }, string> = {
  id: "bigpicture-description",
  tier: "light",
  maxLocalChars: 2000,
  buildPrompt: (i) => ({ prompt: promptBigPictureDescription(i.resumen), system: SYSTEM_PROMPT_DESIGNER }),
  parse: (raw) => stripQuotes(raw),
};
