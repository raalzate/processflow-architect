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
 * Es `heavy`: el constructor escribe sobre el modelo del humano y lo que publica
 * no se deshace solo, así que en híbrido nunca cae al motor local (#666). Los
 * modos `local`/`cli` no llegan acá con el local: `motorDelConstructor` los pasa
 * al CLI o bloquea la corrida.
 */
export const builderTurnTask: AiTask<{ prompt: string; system?: string }, string> = {
  id: "builder-turn",
  tier: "heavy",
  buildPrompt: (i) => ({ prompt: i.prompt, system: i.system }),
  parse: (raw) => raw.trim(),
};

// --- Chat sobre UNA caja con la IA de la app (#459) ---

/** Turnos previos que entran al prompt: más es ruido y tamaño para el motor local. */
export const ELEMENT_CHAT_MAX_TURNOS = 6;

/**
 * El tab «Agente» de la ficha cuando no hay Claude Code ni Codex (o se elige la
 * IA de la app): conversación sobre la caja abierta con el motor de Ajustes.
 * No tiene tools: la app le pasa la ficha (tipo, descripción, spec, vecinos) y
 * el agente contesta; lo que proponga lo aplica el humano. `light` con techo:
 * en local corre local y en híbrido una conversación larga sale a la nube.
 */
export const elementChatTask: AiTask<
  {
    nombre: string;
    tipo: string;
    vista: string;
    notation?: string;
    descripcion?: string;
    /** La spec actual en markdown (vacío si no tiene). */
    spec?: string;
    entrantes?: string[];
    salientes?: string[];
    historial?: { role: "user" | "assistant"; text: string }[];
    mensaje: string;
  },
  string
> = {
  id: "element-chat",
  tier: "light",
  maxLocalChars: BUILDER_LOCAL_MAX_CHARS,
  buildPrompt: (i) => {
    const lista = (v?: string[]) => (v?.length ? v.map((x) => `"${x}"`).join(", ") : "ninguno");
    const previos = (i.historial ?? []).slice(-ELEMENT_CHAT_MAX_TURNOS);
    return {
      system: [
        `Sos un arquitecto que ayuda a pulir UNA caja de un diagrama ${i.notation ?? ""} en Processflow Architect.`.replace("  ", " "),
        "Respondé en español, corto y concreto, en Markdown. No inventes lo que la ficha no dice: marcalo como pendiente de aclarar.",
        "No podés modificar el diagrama: si proponés una especificación, escribila para que el humano la aplique desde el tab Spec.",
      ].join("\n"),
      prompt: [
        `CAJA: "${i.nombre}" (${i.tipo}) en la vista "${i.vista}".`,
        `DESCRIPCIÓN: ${i.descripcion?.trim() || "(sin descripción)"}`,
        `LA LLAMAN: ${lista(i.entrantes)}`,
        `LLAMA A: ${lista(i.salientes)}`,
        `SPEC ACTUAL:\n${i.spec?.trim() || "(sin spec)"}`,
        ...(previos.length
          ? ["", "CONVERSACIÓN PREVIA:", ...previos.map((t) => `${t.role === "user" ? "HUMANO" : "VOS"}: ${t.text}`)]
          : []),
        "",
        `HUMANO: ${i.mensaje}`,
      ].join("\n"),
    };
  },
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
 * `heavy` y `structured`: la propuesta respeta una convención exacta y pisa la
 * vista del humano, así que nunca la resuelve el motor local (#666): en híbrido
 * va a la nube y en `local`/`cli` la corrida usa el CLI o no arranca
 * (`motorDelConstructor`).
 *
 * (La tarea de marca, `brandFromSiteTask`, va al final del archivo.)
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
  tier: "heavy",
  structured: true,
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

/**
 * Mapeo de marca desde un sitio (spec 023). Recibe los COLORES CANDIDATOS que
 * la heurística ya encontró en la página (con su frecuencia y contexto) y las
 * familias tipográficas, y devuelve qué candidato es papel, tinta, atenuado,
 * acento y enlace. `parse` sólo acepta colores que estaban entre los
 * candidatos: la IA mejora el mapeo, nunca inventa un color que la página no
 * tenga. Estructurada: en híbrido va a la nube; en local corre local.
 */
export const brandFromSiteTask: AiTask<
  {
    url: string;
    /** `color · veces · contextos` por línea. */
    candidatos: { color: string; veces: number; contextos: string[] }[];
    familias: string[];
  },
  { paper?: string; ink?: string; muted?: string; accent?: string; link?: string; fuente?: string; razones?: string } | null
> = {
  id: "brand-from-site",
  tier: "heavy",
  structured: true,
  maxLocalChars: 6000,
  buildPrompt: (i) => ({
    prompt: [
      `Sitio: ${i.url}`,
      "COLORES ENCONTRADOS EN SU CSS (color HSL · veces · dónde):",
      ...i.candidatos.slice(0, 24).map((c) => `- "${c.color}" · ${c.veces} · ${c.contextos.slice(0, 2).join("; ")}`),
      i.familias.length ? `FAMILIAS TIPOGRÁFICAS: ${i.familias.join(", ")}` : "",
      [
        "TAREA: elegí, SÓLO entre esos colores (copiá el string HSL tal cual), cuál es:",
        "- paper: el fondo de la página (claro en un sitio claro, oscuro en uno oscuro).",
        "- ink: el color del texto principal.",
        "- muted: el texto secundario (captions, pie, menús).",
        "- accent: el color de marca que usan los botones y llamadas a la acción. UNO solo.",
        "- link: el color de los enlaces (si es el mismo que accent, repetilo).",
        "- fuente: la familia del cuerpo, si está entre las familias.",
        'Respondé SÓLO un JSON: {"paper":"…","ink":"…","muted":"…","accent":"…","link":"…","fuente":"…","razones":"una frase"}. Omití la clave que no puedas decidir.',
      ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
    system: "Sos un diseñador que lee el CSS de un sitio y nombra su paleta por rol. Respondés sólo JSON.",
  }),
  parse: (raw, input) => {
    const bloque = /\{[\s\S]*\}/.exec(raw);
    if (!bloque) return null;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(bloque[0]);
    } catch {
      return null;
    }
    const validos = new Set((input?.candidatos ?? []).map((c) => c.color));
    const color = (k: string) => (typeof data[k] === "string" && validos.has(data[k] as string) ? (data[k] as string) : undefined);
    const familias = new Set(input?.familias ?? []);
    const fuente = typeof data.fuente === "string" && familias.has(data.fuente) ? data.fuente : undefined;
    const out = {
      paper: color("paper"),
      ink: color("ink"),
      muted: color("muted"),
      accent: color("accent"),
      link: color("link"),
      fuente,
      razones: typeof data.razones === "string" ? data.razones.slice(0, 200) : undefined,
    };
    return Object.values(out).some((v) => v !== undefined) ? out : null;
  },
};
