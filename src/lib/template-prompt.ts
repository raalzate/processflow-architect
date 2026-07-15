import { GraphNode } from "./types";

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
 * Guía por tipo de elemento (Event Storming / DDD) para dirigir al modelo local.
 * Un modelo pequeño se sesga a "componente de software" si no se le ancla el tipo.
 */
const NODE_TYPE_HINT: Record<string, string> = {
  Actor: "una persona, rol o sistema externo que USA el sistema o inicia acciones",
  "Sistema Externo": "un sistema de terceros con el que el sistema se integra",
  Hotspot: "un punto de duda, riesgo o decisión pendiente por resolver",
  Comando: "una acción o intención que alguien solicita ejecutar (imperativo)",
  Evento: "un hecho de negocio relevante que YA ocurrió (tiempo pasado)",
  "Política": "una regla que, ante un evento, dispara una acción o decisión",
  "Regla de Negocio": "una restricción o regla del negocio que debe cumplirse",
  "Política de UI": "una regla de comportamiento o presentación en la interfaz",
  "Entidad Raíz": "un objeto con identidad propia que es la entrada al agregado",
  "Raíz de Agregado": "el objeto que controla y da consistencia a un agregado",
  Agregado: "un grupo cohesivo de objetos tratado como una sola unidad transaccional",
  Entidad: "un objeto de dominio con identidad propia y ciclo de vida",
  "Objeto de Valor": "un valor inmutable sin identidad, definido por sus atributos",
  "Servicio de Dominio": "lógica de dominio que coordina objetos y no pertenece a uno solo",
  Repositorio: "la abstracción que persiste y recupera un agregado",
  "Fábrica": "lo que crea agregados o entidades complejas en estado válido",
  "Read Model": "una vista de lectura optimizada para una consulta",
  Vista: "una pantalla o vista que muestra información al usuario",
  "Proyección": "una proyección de eventos que alimenta una vista de lectura",
};

/** Descripción de un nodo: dirigida por su TIPO; refina la del usuario si existe. */
export const promptDescribeNode = (tipo: string, nombre: string, descripcion?: string) => {
  const hint = NODE_TYPE_HINT[tipo] || "un elemento del modelo de dominio";
  const actual = (descripcion || "").trim();
  const tarea = actual
    ? `Mejora y aclara esta descripción del usuario SIN cambiar su intención: "${actual}".`
    : `Escribe una descripción nueva.`;
  return `Eres analista DDD/Event Storming. ${tarea}
El elemento es de tipo "${tipo}" (es decir, ${hint}). Descríbelo SEGÚN ESE TIPO y su rol en el negocio.
Nombre: ${nombre}
Reglas ESTRICTAS:
- UNA sola frase, máximo 22 palabras, en español.
- NO digas "componente del modelo de dominio de software" ni hables de software genérico.
- Mantén el contexto de negocio del nombre y del texto del usuario.
- Sin comillas, sin preámbulos. Responde solo la frase.`;
};

/** Clasifica el tipo DDD/Event Storming de un elemento a partir de su nombre/descripción. */
export const promptClassifyType = (nombre: string, descripcion: string, tipos: readonly string[]) =>
  `Eres analista DDD/Event Storming. Clasifica este elemento eligiendo UNO de estos tipos:
${tipos.join(", ")}
Nombre: ${nombre}
Descripción: ${descripcion || "(sin descripción)"}
Pistas: un Comando es una acción/intención; un Evento es un hecho ya ocurrido; un Actor usa el sistema; un Agregado agrupa objetos; un Read Model/Vista muestra datos.
Responde SOLO con el nombre EXACTO del tipo, sin nada más.`;

/** Propone un nombre en Lenguaje Ubicuo acorde al tipo. */
export const promptSuggestName = (tipo: string, descripcion: string) => {
  const hint = NODE_TYPE_HINT[tipo] || "un elemento del modelo de dominio";
  return `Propón un nombre corto en Lenguaje Ubicuo (de negocio) para este elemento DDD.
Tipo: ${tipo} (es decir, ${hint}).
Descripción: ${descripcion || "(sin descripción)"}
Reglas: 2 a 5 palabras; Comando en imperativo (ej. "Registrar Reembolso"); Evento en pasado (ej. "Reembolso Aprobado"); sin comillas ni punto final. Responde solo el nombre.`;
};

/** Sugiere tecnologías/etiquetas para un elemento. */
export const promptSuggestTags = (tipo: string, nombre: string, descripcion: string) =>
  `Lista de 2 a 5 tecnologías o etiquetas técnicas relevantes para este elemento (ej. Angular, PostgreSQL, Kafka, REST, GCP).
Tipo: ${tipo}
Nombre: ${nombre}
Descripción: ${descripcion || "(sin descripción)"}
Responde SOLO las etiquetas separadas por comas, sin explicación ni texto extra.`;

/** Event Storming: sugiere el SIGUIENTE elemento del flujo y la relación. */
export const promptSuggestNext = (
  tipo: string,
  nombre: string,
  descripcion: string,
  tipos: readonly string[]
) =>
  `Eres facilitador de Event Storming. Dado el elemento actual, propón el SIGUIENTE elemento natural del flujo del negocio y la relación entre ambos.
Reglas de flujo típicas:
- Actor → Comando (relación "ejecuta")
- Comando → Evento (relación "produce")
- Evento → Política o Read Model (relación "dispara")
- Política → Comando (relación "dispara")
Elemento actual:
- Tipo: ${tipo}
- Nombre: ${nombre}
- Descripción: ${descripcion || "(sin descripción)"}
Responde EXACTAMENTE en una sola línea con este formato:
TIPO | NOMBRE | RELACION
Donde TIPO es uno EXACTO de: ${tipos.join(", ")}. El NOMBRE en Lenguaje Ubicuo (Comando en imperativo, Evento en pasado). Sin texto adicional ni comillas.`;

/** Etiqueta (verbo de relación) para un enlace entre dos elementos. */
export const promptLinkLabel = (
  sourceName: string,
  sourceType: string,
  targetName: string,
  targetType: string
) =>
  `Indica en 1 a 3 palabras la relación o acción entre dos elementos de un modelo de dominio (ejemplos: "invoca", "publica evento", "valida", "actualiza").
Origen: ${sourceName} (${sourceType})
Destino: ${targetName} (${targetType})
Responde solo la etiqueta en minúsculas, sin punto final.`;

/** Descripción general (Big Picture) a partir de un resumen del diseño. */
export const promptBigPictureDescription = (resumen: string) =>
  `Resume en 2 o 3 frases el propósito general de este diseño de dominio.
Elementos del diseño:
${resumen}
Responde solo el resumen.`;