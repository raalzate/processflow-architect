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
  promptOrdenarBandas,
  withReference,
  SYSTEM_PROMPT_DESIGNER,
} from "@/lib/template-prompt";
import { getNotation, notationTypes } from "@/lib/notations";

/**
 * Tipos que puede devolver la IA para una vista: los de SU notación. Sin
 * notación (llamadas legadas) se cae a la notación por defecto, pero la UI la
 * pasa siempre: así una vista BPMN nunca recibe tipos DDD.
 */
const typesFor = (notation?: string) => notationTypes(notation);

// Recorta espacios ANTES de quitar comillas: la IA local suele devolver la
// respuesta con espacios alrededor (p. ej. `  "texto"  `). Trim → quita comillas
// de los bordes → trim final por si quedaban espacios internos al borde.
const stripQuotes = (s: string) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();

// --- Tareas LIGERAS (IA local) ---

export const describeNodeTask: AiTask<
  { tipo: string; nombre: string; descripcion?: string; referencia?: string; notation?: string },
  string
> = {
  id: "describe-node",
  tier: "light",
  maxLocalChars: 600,
  buildPrompt: (i) => ({
    prompt: withReference(promptDescribeNode(i.tipo, i.nombre, i.descripcion, i.notation), i.referencia),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw),
};

/** Clasifica el tipo del nodo; la salida se valida contra los tipos de su notación. */
export const classifyTypeTask: AiTask<
  { nombre: string; descripcion?: string; referencia?: string; notation?: string },
  string
> = {
  id: "classify-type",
  tier: "light",
  maxLocalChars: 800,
  buildPrompt: (i) => ({
    prompt: withReference(
      promptClassifyType(i.nombre, i.descripcion || "", typesFor(i.notation), i.notation),
      i.referencia
    ),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw, i) => {
    const clean = stripQuotes(raw).toLowerCase();
    const tipos = typesFor(i?.notation);
    return (
      tipos.find((t) => clean === t.toLowerCase()) ||
      tipos.find((t) => clean.includes(t.toLowerCase())) ||
      ""
    );
  },
};

/** Sugiere un nombre según el tipo y la convención de nombres de la notación. */
export const suggestNameTask: AiTask<
  { tipo: string; descripcion?: string; referencia?: string; notation?: string },
  string
> = {
  id: "suggest-name",
  tier: "light",
  maxLocalChars: 800,
  buildPrompt: (i) => ({
    prompt: withReference(promptSuggestName(i.tipo, i.descripcion || "", i.notation), i.referencia),
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

/** Sugiere el siguiente elemento del flujo de la notación {tipo, nombre, relacion}. */
export const suggestNextTask: AiTask<
  { tipo: string; nombre: string; descripcion?: string; referencia?: string; notation?: string },
  { tipo: string; nombre: string; relacion: string }
> = {
  id: "suggest-next",
  tier: "light",
  maxLocalChars: 900,
  buildPrompt: (i) => ({
    prompt: withReference(
      promptSuggestNext(i.tipo, i.nombre, i.descripcion || "", typesFor(i.notation), i.notation),
      i.referencia
    ),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw, i) => {
    const parts = stripQuotes(raw).split("|").map((s) => s.trim());
    const t = (parts[0] || "").toLowerCase();
    const tipos = typesFor(i?.notation);
    // Fallback = tipo por defecto de LA notación (antes siempre "Evento", que en
    // BPMN/C4/UML metía un elemento ajeno al diagrama).
    const tipo =
      tipos.find((x) => x.toLowerCase() === t) ||
      tipos.find((x) => t.includes(x.toLowerCase())) ||
      getNotation(i?.notation).defaultType;
    return { tipo, nombre: parts[1] || "", relacion: (parts[2] || "produce").toLowerCase() };
  },
};

export const linkLabelTask: AiTask<
  {
    sourceName: string;
    sourceType: string;
    targetName: string;
    targetType: string;
    referencia?: string;
    notation?: string;
  },
  string
> = {
  id: "link-label",
  tier: "light",
  maxLocalChars: 600,
  buildPrompt: (i) => ({
    prompt: withReference(
      promptLinkLabel(i.sourceName, i.sourceType, i.targetName, i.targetType, i.notation),
      i.referencia
    ),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw).replace(/\.$/, "").toLowerCase(),
};

/**
 * Ordena las BANDAS del diagrama (contextos, participantes, límites) para el
 * botón «Organizar → Sugerir con IA».
 *
 * Contrato deliberado: la IA devuelve NOMBRES en orden, nunca coordenadas. La
 * geometría la calcula el layout determinista, así que una respuesta mala
 * produce como mucho un orden discutible — no solapamientos ni elementos fuera
 * de su banda. `parse` descarta lo que no exista en el diagrama y completa lo
 * que falte respetando el orden original.
 */
export const orderLanesTask: AiTask<
  { bandas: string[]; resumen: string; notation?: string },
  string[]
> = {
  id: "order-lanes",
  tier: "light",
  maxLocalChars: 2000,
  buildPrompt: (i) => ({
    prompt: promptOrdenarBandas(i.bandas, i.resumen, i.notation),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw, input) => {
    const conocidas = input?.bandas ?? [];
    const normalizar = (s: string) => stripQuotes(s).toLowerCase();
    const porNombre = new Map(conocidas.map((b) => [normalizar(b), b]));
    const propuestas: string[] = [];
    for (const trozo of stripQuotes(raw).split(/\||\n/)) {
      const banda = porNombre.get(normalizar(trozo));
      // Nombre inventado o repetido → fuera. La IA no puede introducir grupos.
      if (banda && !propuestas.includes(banda)) propuestas.push(banda);
    }
    // Lo que la IA no mencionó conserva su orden original, al final.
    return [...propuestas, ...conocidas.filter((b) => !propuestas.includes(b))];
  },
};

export const bigPictureDescTask: AiTask<{ resumen: string; notation?: string }, string> = {
  id: "bigpicture-description",
  tier: "light",
  maxLocalChars: 2000,
  buildPrompt: (i) => ({
    prompt: promptBigPictureDescription(i.resumen, i.notation),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => stripQuotes(raw),
};
