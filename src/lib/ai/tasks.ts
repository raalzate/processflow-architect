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
  promptSuggestSpec,
  promptOrdenarBandas,
  withReference,
  SYSTEM_PROMPT_DESIGNER,
} from "@/lib/template-prompt";
import { getNotation, notationTypes } from "@/lib/notations";
import { specFromLines, type ElementSpec } from "@/lib/element-spec";
import { BUILDER_LOCAL_MAX_CHARS } from "./agent-engine";

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

/**
 * Borrador de la ESPECIFICACIÓN de un elemento (tab «Spec» de la ficha).
 *
 * `tier: "heavy"` **con** `buildPrompt` y sin `structured`: es una tarea larga,
 * así que en modo híbrido sube a la nube, pero en el modo por defecto (`local`)
 * la atiende LiteRT-LM y el botón funciona sin llave ni conexión (P4). Marcarla
 * `structured` la habría dejado muerta sin API key, que es justo lo contrario de
 * "la IA es local por defecto".
 *
 * `parse` NUNCA lanza: una respuesta que no dice nada devuelve `undefined` y la
 * ficha conserva intacto lo que el usuario escribió a mano.
 */
export const suggestSpecTask: AiTask<
  { tipo: string; nombre: string; descripcion?: string; referencia?: string; notation?: string },
  ElementSpec | undefined
> = {
  id: "suggest-spec",
  tier: "heavy",
  buildPrompt: (i) => ({
    prompt: withReference(
      promptSuggestSpec(i.tipo, i.nombre, i.descripcion ?? "", i.notation),
      i.referencia
    ),
    system: SYSTEM_PROMPT_DESIGNER,
  }),
  parse: (raw) => specFromLines(raw),
};

// --- Turno del agente CONSTRUCTOR (014, #308) ---

/**
 * Un turno del bucle del agente constructor: el prompt ya viene armado (menú de
 * herramientas + estado de la corrida) y la salida es la acción en texto, que
 * `builder-tools.parseBuilderAction` interpreta.
 *
 * Es `light` con techo de entrada a propósito: en modo local corre local, y en
 * híbrido el propio router lo manda a la nube cuando el pedido crece. Así el
 * constructor respeta el modo vigente sin una segunda política de ruteo.
 */
export const builderTurnTask: AiTask<{ prompt: string; system?: string }, string> = {
  id: "builder-turn",
  tier: "light",
  maxLocalChars: BUILDER_LOCAL_MAX_CHARS,
  buildPrompt: (i) => ({ prompt: i.prompt, system: i.system }),
  parse: (raw) => raw.trim(),
};

// --- Diagrama COMPLETO en una inferencia (015, #337) ---

/**
 * El modo CREATIVO del constructor: una sola inferencia devuelve el diagrama
 * entero en Mermaid, y el arnés lo convierte a grafo (`fromMermaid`).
 *
 * Por qué Mermaid y no el grafo: el modelo local conoce Mermaid de su
 * entrenamiento; encadenar quince llamadas MCP no lo conoce —63 pasos y el
 * lienzo vacío, medido (#332)—. Y por qué el tipo va EXPLÍCITO en cada caja: la
 * silueta no identifica el tipo (doce tipos DDD son elipses), así que sin el
 * `<i>Tipo</i>` la vuelta tendría que adivinar, que es justo lo que §P6 prohíbe.
 *
 * `structured`: la propuesta tiene que respetar una convención exacta. En modo
 * local corre local igual (§P4); en híbrido el router la manda a la nube.
 */
export const creativeDiagramTask: AiTask<
  {
    pedido: string;
    /** Lo que ya existe en la vista, en Mermaid (vacío si la vista está vacía). */
    existente?: string;
    notation?: string;
    /** Hallazgos del intento anterior, para el ÚNICO reintento. */
    hallazgos?: string[];
  },
  string
> = {
  id: "creative-diagram",
  tier: "light",
  structured: true,
  maxLocalChars: BUILDER_LOCAL_MAX_CHARS,
  buildPrompt: (i) => {
    const tipos = notationTypes(i.notation, { includeContainers: true });
    const contenedores = notationTypes(i.notation, { includeContainers: true }).filter(
      (t) => !notationTypes(i.notation).includes(t)
    );
    return {
      prompt: [
        `PEDIDO: ${i.pedido}`,
        i.existente
          ? `LO QUE YA HAY EN LA VISTA (Mermaid):\n\`\`\`mermaid\n${i.existente}\n\`\`\`\nConservá lo que siga teniendo sentido: lo que repitas con el mismo nombre se reconoce como el mismo elemento.`
          : "La vista está vacía.",
        `TIPOS VÁLIDOS de la notación ${getNotation(i.notation).label}: ${tipos.join(", ")}.`,
        contenedores.length ? `De esos, agrupan a otros (van como subgraph): ${contenedores.join(", ")}.` : "",
        [
          "CONVENCIÓN (obligatoria):",
          "- Respondé UN bloque ```mermaid con un `flowchart LR`, y nada más.",
          '- Cada caja lleva su tipo en la etiqueta: id["Nombre<br><i>Tipo</i>"].',
          '- Un contenedor es un subgraph con la misma etiqueta: subgraph id["Nombre<br><i>Tipo</i>"] … end.',
          "- El tipo tiene que ser UNO de la lista de arriba, escrito igual.",
          "- Las relaciones van con --> y su etiqueta: a -->|\"hace algo\"| b.",
          "- No pongas posiciones, colores ni classDef: la geometría la pone la app.",
        ].join("\n"),
        i.hallazgos?.length
          ? `EL INTENTO ANTERIOR TUVO ESTOS PROBLEMAS (corregilos):\n${i.hallazgos.map((h) => `- ${h}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      system:
        "Sos un arquitecto que dibuja diagramas en Mermaid. Respondés SÓLO con el bloque ```mermaid pedido, sin explicaciones.",
    };
  },
  // El modelo local suele envolver el bloque en prosa; lo que importa es el
  // flowchart. Sin bloque marcado, se busca el `flowchart` a secas antes de
  // darse por vencido: tirar una respuesta útil por la envoltura sería absurdo.
  parse: (raw) => {
    const bloque = /```(?:mermaid)?\s*([\s\S]*?)```/i.exec(raw);
    const texto = (bloque?.[1] ?? raw).trim();
    const inicio = texto.search(/^\s*(flowchart|graph)\b/im);
    return inicio >= 0 ? texto.slice(inicio).trim() : "";
  },
};
