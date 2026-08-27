import { GraphNode } from "./types";
import { getNotation, type NotationId } from "./notations";
import { NOTATION_HELP } from "./notation-help";

export const promptSummarize = (node: GraphNode) => {
    return `Actúa como un Analista Funcional. Describe el siguiente requerimiento para medición COSMIC.
    
    Elemento:
    - Tipo: ${node.tipo_elemento}
    - Nombre: ${node.nombre}
    - Descripción: ${node.descripcion || "(sin descripción)"}
    
    Instrucciones:
    1. Describe brevemente la funcionalidad técnica/negocio.
    2. Identifica movimientos de datos (Entrada, Salida, Lectura, Escritura).
    3. NO inventes procesos de "entrenamiento" ni definas qué es COSMIC.
    4. Si falta información, asume una funcionalidad estándar (ej: Guardar = Escritura).`;
};

export const SYSTEM_PROMPT_COSMIC = "Eres un asistente técnico conciso. Tu trabajo es describir funcionalidades de software de forma directa y objetiva.";

// =============================================================================
// Prompts para la IA LOCAL (Qwen) — sugerencias cortas y frecuentes en el
// diseñador. Salidas breves y editables; lo complejo se delega a Gemini.
// =============================================================================

export const SYSTEM_PROMPT_DESIGNER =
  "Eres un analista de software conciso. Respondes en español, breve y directo, sin preámbulos, sin comillas y sin explicar tu razonamiento.";

/**
 * Antepone el MATERIAL DE REFERENCIA del proyecto (documentos subidos por el
 * usuario) a un prompt de sugerencia, para que la IA local lo use como fuente de
 * dominio. Si no hay referencia, devuelve el prompt intacto.
 */
export const withReference = (prompt: string, referencia?: string) =>
  referencia && referencia.trim()
    ? `MATERIAL DE REFERENCIA del proyecto (úsalo como fuente de dominio: respeta su terminología y nombres; si aporta datos relevantes, priorízalos sobre suposiciones):
"""
${referencia.trim()}
"""

${prompt}`
    : prompt;

/**
 * Guía por tipo de elemento para tipos que NO están en `NOTATION_HELP` (legado
 * del Event Storming original). Un modelo pequeño se sesga a "componente de
 * software" si no se le ancla el tipo, así que ningún tipo debe quedar sin pista.
 */
const LEGACY_TYPE_HINT: Record<string, string> = {
  Hotspot: "un punto de duda, riesgo o decisión pendiente por resolver",
  "Política de UI": "una regla de comportamiento o presentación en la interfaz",
  "Entidad Raíz": "un objeto con identidad propia que es la entrada al agregado",
  "Read Model": "una vista de lectura optimizada para una consulta",
  "Proyección": "una proyección de eventos que alimenta una vista de lectura",
};

/**
 * Pista de UNA frase sobre qué es un tipo, sea de la notación que sea. La fuente
 * es `NOTATION_HELP` (ya cubre DDD/BPMN/C4/UML), así que la pista del prompt y la
 * ayuda "?" de la paleta no se desincronizan.
 */
export const elementHint = (tipo: string): string => {
  const help = NOTATION_HELP[tipo]?.description;
  if (help) return help.split(". ")[0].replace(/\.$/, "");
  return LEGACY_TYPE_HINT[tipo] || "un elemento del modelo";
};

/**
 * Marco de la notación para los prompts del diseñador: rol, encadenamiento y
 * regla de nombres. Sin notación NO se asume DDD (sería sesgo): se usa un marco
 * neutro, y quien conoce la notación (el lienzo) la pasa siempre.
 */
const NEUTRAL_FRAME = {
  analystRole: "analista de modelado de software",
  flowRules: "- El siguiente elemento es el que continúa el flujo o la estructura del diagrama",
  namingRule: "nombre corto y descriptivo del dominio del negocio",
  defaultType: "",
};

const frameOf = (notation?: NotationId | string) => {
  if (!notation) return NEUTRAL_FRAME;
  const n = getNotation(notation);
  return {
    analystRole: n.analystRole,
    flowRules: n.flowRules,
    namingRule: n.namingRule,
    defaultType: n.defaultType,
  };
};

/** Descripción de un nodo: dirigida por su TIPO; refina la del usuario si existe. */
export const promptDescribeNode = (
  tipo: string,
  nombre: string,
  descripcion?: string,
  notation?: NotationId | string
) => {
  const hint = elementHint(tipo);
  const actual = (descripcion || "").trim();
  const tarea = actual
    ? `Mejora y aclara esta descripción del usuario SIN cambiar su intención: "${actual}".`
    : `Escribe una descripción nueva.`;
  return `Eres ${frameOf(notation).analystRole}. ${tarea}
El elemento es de tipo "${tipo}" (es decir, ${hint}). Descríbelo SEGÚN ESE TIPO y su rol en el negocio.
Nombre: ${nombre}
Reglas ESTRICTAS:
- UNA sola frase, máximo 22 palabras, en español.
- NO digas "componente del modelo de dominio de software" ni hables de software genérico.
- Mantén el contexto de negocio del nombre y del texto del usuario.
- Sin comillas, sin preámbulos. Responde solo la frase.`;
};

/**
 * Clasifica el tipo de un elemento entre los tipos de SU notación. Las "pistas"
 * ya no son la chuleta DDD cableada: se derivan de los tipos ofrecidos, así que
 * en BPMN habla de Tareas y Compuertas, y en C4 de Contenedores.
 */
export const promptClassifyType = (
  nombre: string,
  descripcion: string,
  tipos: readonly string[],
  notation?: NotationId | string
) =>
  `Eres ${frameOf(notation).analystRole}. Clasifica este elemento eligiendo UNO de estos tipos:
${tipos.join(", ")}
Nombre: ${nombre}
Descripción: ${descripcion || "(sin descripción)"}
Pistas (qué es cada tipo):
${tipos.map((t) => `- ${t}: ${elementHint(t)}`).join("\n")}
Responde SOLO con el nombre EXACTO del tipo, sin nada más.`;

/** Propone un nombre acorde al tipo y a la convención de nombres de la notación. */
export const promptSuggestName = (
  tipo: string,
  descripcion: string,
  notation?: NotationId | string
) => {
  const { namingRule } = frameOf(notation);
  return `Propón un ${namingRule} para este elemento.
Tipo: ${tipo} (es decir, ${elementHint(tipo)}).
Descripción: ${descripcion || "(sin descripción)"}
Reglas: 2 a 5 palabras; sin comillas ni punto final. Responde solo el nombre.`;
};

/** Sugiere tecnologías/etiquetas para un elemento. */
export const promptSuggestTags = (tipo: string, nombre: string, descripcion: string) =>
  `Lista de 2 a 5 tecnologías o etiquetas técnicas relevantes para este elemento (ej. Angular, PostgreSQL, Kafka, REST, GCP).
Tipo: ${tipo}
Nombre: ${nombre}
Descripción: ${descripcion || "(sin descripción)"}
Responde SOLO las etiquetas separadas por comas, sin explicación ni texto extra.`;

/** Sugiere el SIGUIENTE elemento y la relación, según el flujo de la notación. */
export const promptSuggestNext = (
  tipo: string,
  nombre: string,
  descripcion: string,
  tipos: readonly string[],
  notation?: NotationId | string
) => {
  const { analystRole, flowRules, namingRule } = frameOf(notation);
  return `Eres ${analystRole}. Dado el elemento actual, propón el SIGUIENTE elemento natural del diagrama y la relación entre ambos.
Encadenamiento típico de esta notación:
${flowRules}
Elemento actual:
- Tipo: ${tipo}
- Nombre: ${nombre}
- Descripción: ${descripcion || "(sin descripción)"}
Responde EXACTAMENTE en una sola línea con este formato:
TIPO | NOMBRE | RELACION
Donde TIPO es uno EXACTO de: ${tipos.join(", ")}. El NOMBRE es un ${namingRule}. Sin texto adicional ni comillas.`;
};

/** Etiqueta (verbo de relación) para un enlace entre dos elementos. */
export const promptLinkLabel = (
  sourceName: string,
  sourceType: string,
  targetName: string,
  targetType: string,
  notation?: NotationId | string
) =>
  `Eres ${frameOf(notation).analystRole}. Indica en 1 a 3 palabras la relación o acción entre estos dos elementos del diagrama (ejemplos: "invoca", "publica evento", "valida", "actualiza").
Origen: ${sourceName} (${sourceType})
Destino: ${targetName} (${targetType})
Responde solo la etiqueta en minúsculas, sin punto final.`;

/**
 * Orden de lectura de las BANDAS de un diagrama (contextos, participantes,
 * límites). La IA ordena; las coordenadas las calcula el layout determinista, así
 * que lo peor que puede pasar con una mala respuesta es un orden discutible, no
 * un diagrama roto.
 */
export const promptOrdenarBandas = (
  bandas: string[],
  resumen: string,
  notation?: NotationId | string
) =>
  `Eres ${frameOf(notation).analystRole}. Ordena estos grupos del diagrama según su orden natural de lectura (de arriba abajo): primero quien inicia o consume, después el núcleo del proceso, al final los sistemas de apoyo.
Grupos: ${bandas.join(" | ")}
Contenido:
${resumen}
Responde SOLO los nombres separados por " | ", exactamente como están escritos arriba, sin añadir ni inventar ninguno.`;

/** Descripción general del diagrama a partir de un resumen de sus elementos. */
export const promptBigPictureDescription = (resumen: string, notation?: NotationId | string) =>
  `Eres ${frameOf(notation).analystRole}. Resume en 2 o 3 frases el propósito general de este diagrama.
Elementos del diagrama:
${resumen}
Responde solo el resumen.`;
/**
 * Borrador de la ESPECIFICACIÓN de un elemento (tab «Spec» de la ficha).
 *
 * El formato de salida es de líneas etiquetadas, no JSON: el motor local es un
 * modelo pequeño y un JSON largo se rompe casi siempre, mientras que una línea
 * mal formada sólo se descarta (ver `specFromLines` en `element-spec.ts`).
 */
export const promptSuggestSpec = (
  tipo: string,
  nombre: string,
  descripcion: string,
  notation?: NotationId | string
) =>
  `Eres ${frameOf(notation).analystRole}. Escribe la especificación funcional del siguiente elemento del diagrama.
Elemento:
- Tipo: ${tipo}
- Nombre: ${nombre}
- Descripción: ${descripcion || "(sin descripción)"}
Reglas: habla de QUÉ debe hacer y CÓMO se verifica, nunca de cómo se implementa; no nombres tecnologías, frameworks ni bases de datos; los criterios de éxito llevan un número medible.
Responde SOLO líneas con este formato, una por línea, sin numerar y sin texto adicional:
FEATURE | nombre corto de la funcionalidad
HISTORIA | título | P1 | por qué esa prioridad | cómo se prueba sola
ESCENARIO | estado inicial | acción | resultado esperado
CASO | qué pasa en un caso límite
REQUISITO | El sistema MUST …
ENTIDAD | nombre | qué representa
CRITERIO | medida verificable con número
Escribe entre 2 y 3 HISTORIA (cada una con 1 o 2 ESCENARIO justo debajo), 2 CASO, entre 3 y 5 REQUISITO, hasta 3 ENTIDAD y 2 CRITERIO.`;
