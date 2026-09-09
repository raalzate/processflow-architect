/**
 * @fileOverview Perfiles del panel «Agentes de IA» (PURO). Feature 014 (#308).
 *
 * Hasta acá el panel tenía UN agente y por eso no hacía falta nombrarlo: el
 * analista sólo lee el modelo. Con el constructor entra un agente que ESCRIBE
 * (crea vistas, agrega cajas, borra), y quién puede escribir no es una decisión
 * de un componente: vive acá, con test.
 *
 * `tools` es una ALLOWLIST de ids del registro MCP (`main/services/mcp-tools.ts`),
 * no una copia de las herramientas: el nombre, la descripción y el schema que ve
 * el modelo salen del registro en tiempo de ejecución (ver `builder-tools.ts`).
 * Así una herramienta renombrada rompe un test, no la corrida del usuario.
 */

export type AgentId = "analista" | "constructor";

/** Tarjeta que ve el humano con el chat vacío: quién atiende y qué pedirle. */
export interface AgentWelcome {
  titulo: string;
  invitacion: string;
  /** Ejemplos clicables: pedidos que ESTE agente puede cumplir. */
  ejemplos: string[];
}

export interface AgentProfile {
  id: AgentId;
  nombre: string;
  /** Una línea: es lo que se lee en el selector. */
  descripcion: string;
  /** ¿Puede cambiar el modelo? Gobierna el aviso del panel y el repertorio. */
  escribe: boolean;
  /** Ids de herramientas MCP que se le ofrecen al modelo. Vacío = sólo lectura. */
  tools: string[];
  /** ¿Produce artefactos de texto (menú «+»)? El constructor cambia el modelo, no redacta. */
  artefactos: boolean;
  bienvenida: AgentWelcome;
}

/**
 * Repertorio del constructor, agrupado por el momento de la corrida en que sirve.
 * Es corto a propósito: el motor local no sostiene un menú de 52 herramientas, y
 * cada id de más es una forma nueva de que el modelo se pierda.
 */
export const BUILDER_TOOLS = {
  /** Orientarse: qué proyecto hay, qué vistas, con qué notación. */
  orientar: ["get_app_state", "list_views", "get_view", "list_notations", "describe_notation"],
  /** Construir: el diagrama en curso y sus elementos. */
  construir: [
    "create_diagram",
    "use_diagram",
    "get_diagram",
    "add_container",
    "add_node",
    "add_edge",
    "update_element",
    "update_edge",
    "relayout_diagram",
  ],
  /** Limpiar: lo que quita trabajo hecho. Todo esto pasa por confirmación humana. */
  limpiar: ["remove_element", "remove_edge", "delete_view", "rename_view"],
  /** Cerrar: validar y dejarlo en el lienzo. */
  cerrar: ["validate_diagram", "export_as_view"],
} as const;

const REPERTORIO_CONSTRUCTOR: string[] = [
  ...BUILDER_TOOLS.orientar,
  ...BUILDER_TOOLS.construir,
  ...BUILDER_TOOLS.limpiar,
  ...BUILDER_TOOLS.cerrar,
];

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "analista",
    nombre: "Analista",
    descripcion: "Lee el modelo y redacta documentos. No cambia nada.",
    escribe: false,
    tools: [],
    artefactos: true,
    bienvenida: {
      titulo: "Agente de Arquitectura",
      invitacion:
        "Pídeme que diseñe o analice tu sistema. Generaré artefactos (drivers, riesgos, propuesta, roadmap, ADRs, diagramas...) en el lienzo principal.",
      ejemplos: [
        "Extrae los drivers de arquitectura",
        "Identifica riesgos y restricciones",
        "Genera una propuesta técnica completa",
        "Crea un diagrama C4 de contenedores",
        "Redacta un ADR para la persistencia",
      ],
    },
  },
  {
    id: "constructor",
    nombre: "Constructor",
    descripcion: "Crea, edita y elimina vistas y elementos con las herramientas del MCP.",
    escribe: true,
    tools: REPERTORIO_CONSTRUCTOR,
    artefactos: false,
    bienvenida: {
      titulo: "Agente Constructor",
      invitacion:
        "Pedime que construya y modifico el modelo con las herramientas del MCP: vistas, cajas y relaciones. Antes de borrar o sobrescribir algo te muestro qué se pierde y espero que lo confirmes.",
      ejemplos: [
        "Creá una vista BPMN del proceso de alta",
        "Agregá el evento Orden creada a la vista Pagos",
        "Conectá los nodos Checkout y Cobro",
        "Renombrá la vista Pagos a Cobranzas",
      ],
    },
  },
];

/** El default no escribe: el permiso de cambiar el modelo se elige a mano. */
export const DEFAULT_AGENT_ID: AgentId = "analista";

export function isAgentId(valor: unknown): valor is AgentId {
  return AGENT_PROFILES.some((p) => p.id === valor);
}

export function getAgentProfile(id: AgentId): AgentProfile {
  const perfil = AGENT_PROFILES.find((p) => p.id === id);
  // No hay fallback silencioso a un perfil que escribe: si el id no existe, analista.
  return perfil ?? AGENT_PROFILES[0];
}

/** Clave por proyecto: el agente elegido en uno no se hereda en otro. */
export const agentStorageKey = (fileId: string) => `agent_profile:${fileId}`;

export function readAgentId(storage: Pick<Storage, "getItem">, fileId: string): AgentId {
  try {
    const guardado = storage.getItem(agentStorageKey(fileId));
    return isAgentId(guardado) ? guardado : DEFAULT_AGENT_ID;
  } catch {
    return DEFAULT_AGENT_ID;
  }
}

export function saveAgentId(
  storage: Pick<Storage, "setItem">,
  fileId: string,
  id: AgentId
): void {
  try {
    storage.setItem(agentStorageKey(fileId), id);
  } catch {
    /* sin storage: la elección vive sólo en esta sesión */
  }
}

/**
 * ¿El pedido es de CONSTRUCCIÓN? El analista no escribe, y decirle "borrá la
 * vista Pagos" hoy termina en un documento que describe el borrado: peor que
 * negarse, porque parece que pasó algo. Es heurística de verbos a propósito —
 * ante la duda contesta el analista, que no puede romper nada.
 */
// Los bordes NO son `\b`: en JS una vocal acentuada no es carácter de palabra, así
// que `\b` después de "creá" nunca casa. Se usan lookarounds sobre el alfabeto real.
const LETRA = "a-záéíóúüñ";
const borde = (alternativas: string) =>
  new RegExp(`(?<![${LETRA}])(?:${alternativas})(?![${LETRA}])`, "i");

const VERBOS_ESCRITURA = borde(
  "cre[aá]|crear|agreg[aá]|agregar|añad[ií]|añadir|borr[aá]|borrar|elimin[aá]|eliminar|" +
    "renombr[aá]|renombrar|modific[aá]|modificar|edit[aá]|editar|conect[aá]|conectar|" +
    "mov[eé]|mover|quit[aá]|quitar"
);
const OBJETOS_DEL_MODELO = borde(
  "vistas?|pesta[ñn]as?|elementos?|cajas?|nodos?|relaci[oó]n|relaciones|aristas?|" +
    "diagramas?|contenedores?"
);

export function pideEscritura(mensaje: string): boolean {
  return VERBOS_ESCRITURA.test(mensaje) && OBJETOS_DEL_MODELO.test(mensaje);
}

/** Lo que contesta el analista cuando le piden cambiar el modelo. */
export function avisoAgenteEquivocado(): string {
  return (
    "Soy el agente Analista: leo el modelo y redacto, pero no lo cambio. " +
    "Cambiá a **Constructor** en el selector del panel y repetime el pedido."
  );
}
