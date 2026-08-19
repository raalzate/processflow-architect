/**
 * @fileOverview Modelo de datos del Agente de Arquitectura (patrón ReAct) y de los
 * artefactos que produce. Diseñado para ser escalable: un "artefacto" nuevo se añade
 * registrando una entrada en el registry (src/lib/artifacts/registry.ts) + un prompt,
 * sin tocar la UI ni el motor del agente.
 */

import { z } from "zod";
import {
  ArchitectureDriversOutputSchema,
  ConstraintsRisksOutputSchema,
  RoadmapOutputSchema,
  TechnicalElementsOutputSchema,
  UsageSchema,
} from "./types";

/**
 * Forma de render universal de un artefacto. La UI sólo necesita saber renderizar
 * estas formas; cualquier "kind" nuevo se mapea a una de ellas.
 *  - markdown / mermaid: formas genéricas → permiten añadir infinitos artefactos
 *    de arquitectura (ADR, stack, NFRs, C4, secuencia, despliegue, ...) sin nuevo código.
 *  - drivers / constraints / proposal / roadmap: formas estructuradas heredadas.
 */
export const ARTIFACT_RENDERS = [
  "markdown",
  "mermaid",
  "drivers",
  "constraints",
  "proposal",
  "roadmap",
] as const;
export type ArtifactRender = (typeof ARTIFACT_RENDERS)[number];

/** Pasos del razonamiento ReAct (Thought → Action → Observation). */
export const AgentStepSchema = z.object({
  /**
   * Los tres primeros son el ReAct clásico; el resto llegó con 005 (el agente
   * recupera el contexto por partes y consulta al humano): `read`/`search` son
   * lecturas del modelo, `plan`/`question` los dos puntos donde decide el
   * humano, `decision` su respuesta y `consolidate` el cierre con citas.
   */
  type: z.enum([
    "thought",
    "action",
    "observation",
    "read",
    "search",
    "plan",
    "question",
    "decision",
    "consolidate",
  ]),
  tool: z.string().optional().describe("Herramienta invocada en un paso 'action'."),
  /** Fuente del paso (vista/documento) cuando aplica: la traza dice de dónde salió. */
  source: z.string().optional(),
  content: z.string(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

/** Artefacto tal cual lo emite el agente (sin metadatos de cliente como id/version). */
export const AgentArtifactSchema = z.object({
  kind: z.string().describe("Clave del registry, ej. 'drivers', 'adr', 'c4-context'."),
  render: z.enum(ARTIFACT_RENDERS),
  title: z.string(),
  payload: z.any().describe("Estructura dependiente de 'render'."),
});
export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;

/** Payloads concretos según 'render' (referencia para el cliente). */
export type MarkdownPayload = { markdown: string };
export type MermaidPayload = { code: string; caption?: string };

/* -------------------------------------------------------------------------- */
/* Estado de cliente: artefactos persistidos, versiones y chat                */
/* -------------------------------------------------------------------------- */

/** Grupo de versión: los artefactos se agrupan en versiones (snapshots). */
export interface ArtifactVersion {
  id: string;
  label: string; // "v1", "v2", o nombre dado por el usuario
  createdAt: string; // ISO
}

/**
 * Historia de UN artefacto: agrupa sus revisiones. Es el eje vertical del
 * versionado; `ArtifactVersion` (snapshot) es el horizontal y ambos conviven.
 * Ver `src/lib/artifacts/versioning.ts` y specs/004-artefactos-versionados/.
 */
export interface ArtifactLineage {
  id: string;
  key: string; // clave de linaje normalizada (kind [+ título])
  kind: string;
  versionId: string; // snapshot al que pertenece: el linaje no cruza snapshots
  createdAt: string; // ISO
  archivedAt?: string; // borrar en la UI = archivar, no destruir
}

/** Artefacto persistido en el lienzo. Cada uno es UNA revisión de su linaje. */
export interface Artifact {
  id: string;
  versionId: string;
  kind: string;
  render: ArtifactRender;
  title: string;
  payload: any;
  createdAt: string; // ISO
  sourceMessageId?: string; // mensaje del chat que lo generó
  contextArtifactIds?: string[]; // artefactos inyectados como contexto al generarlo
  lineageId?: string; // opcional: el estado anterior a 004 no lo trae (migrateState lo pone)
  revision?: number; // 1, 2, 3… entero ≥ 1
  supersededBy?: string; // revisión que la reemplazó (rastro de la cadena)
  restoredFrom?: string; // revisión que se restauró para crear esta
  editedFrom?: string; // revisión que el humano editó para crear esta
}

/**
 * Nota atribuida a UNA fuente: es lo único que la corrida recuerda de una lectura.
 * Sirve tres veces: memoria externa del modelo (se re-inyecta condensada en cada
 * turno, no el TOON completo), progreso visible en el chat, y respaldo de las
 * citas del artefacto — una cita sin nota que la sostenga no se emite.
 */
export interface AgentNote {
  source: { type: "view" | "model" | "document" | "artifact"; name: string };
  facts: string[];
  /** Nodos citables de esa fuente (vacío en fuentes sin nodos, p. ej. Mermaid). */
  nodes?: string[];
}

/** Por qué la corrida se detuvo y qué se le pide al humano. */
export type AgentPause =
  | {
      kind: "plan";
      title: string;
      artifactKind: string;
      sections: { title: string; sources: string[] }[];
    }
  | { kind: "question"; id: string; text: string; options: string[] };

/** Decisión del humano ante una pregunta (o el supuesto por defecto). */
export interface AgentDecision {
  questionId: string;
  question: string;
  answer: string;
  /** true = el humano dijo "no sé" y se tomó la primera opción. */
  assumed?: boolean;
}

/** Qué alcanzó a leer la corrida. Va al artefacto: un artefacto honesto declara su cobertura. */
export interface AgentCoverage {
  readViews: string[];
  skippedViews: string[];
  reason?: string;
}

/**
 * Estado de una corrida del agente. Es SERIALIZABLE a propósito: viaja en el
 * mensaje del chat (`agent_state_<fileId>`) para que una corrida detenida
 * esperando al humano sobreviva a un reload. Lo que NO se guarda es el TOON
 * leído: sólo las notas (ver specs/005-contexto-react-hitl/plan.md D12).
 */
export interface AgentRunState {
  id: string;
  goal: string;
  turn: number;
  budgetLeft: number;
  /** Vistas ya leídas: releerlas no cuesta presupuesto. */
  read: string[];
  notes: AgentNote[];
  /** Ids de preguntas ya formuladas: una por corrida. */
  asked: string[];
  decisions: AgentDecision[];
  /** Presente ⇔ la corrida está esperando al humano. */
  pause?: AgentPause;
  plan?: Extract<AgentPause, { kind: "plan" }>;
  planApproved?: boolean;
  /** Motivo del cierre cuando la corrida se cancela. */
  cancelledReason?: string;
  /** Veces que se devolvió el plan por cobertura pobre (freno con techo). */
  planRejections?: number;
  coverage?: AgentCoverage;
}

export type ChatRole = "user" | "assistant";

/** Mensaje del chat del agente. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO
  steps?: AgentStep[]; // traza ReAct (mensajes del asistente)
  producedArtifactIds?: string[]; // artefactos generados por este turno
  contextArtifactIds?: string[]; // artefactos inyectados como contexto (opcional)
  attachments?: { name: string; contentType: string }[]; // documentos adjuntos (mensajes del usuario)
  error?: boolean;
  /**
   * Corrida del agente asociada a este mensaje. Con `pause` presente, el mensaje
   * ES la corrida esperando al humano (plan por aprobar o pregunta por
   * responder); al terminar se limpia y quedan `steps`/`producedArtifactIds`.
   */
  run?: AgentRunState;
}

/* -------------------------------------------------------------------------- */
/* Contrato IPC del flujo ReAct (reactAgent)                                  */
/* -------------------------------------------------------------------------- */

/** Artefacto comprimido que se inyecta como contexto al agente. */
export const ContextArtifactSchema = z.object({
  kind: z.string(),
  title: z.string(),
  content: z.string().describe("Resumen/markdown del artefacto para contexto."),
});
export type ContextArtifact = z.infer<typeof ContextArtifactSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

/** Documento adjuntado al chat (PDF, imagen, ...) enviado como media multimodal. */
export const AgentDocumentSchema = z.object({
  name: z.string().describe("Nombre de archivo original."),
  contentType: z.string().describe("MIME type, ej. 'application/pdf', 'image/png'."),
  url: z.string().describe("Data URL (base64) del archivo."),
});
export type AgentDocument = z.infer<typeof AgentDocumentSchema>;

export const ReactAgentInputSchema = z.object({
  message: z.string().describe("Mensaje actual del usuario."),
  history: z.array(ChatTurnSchema).optional().describe("Historial de la conversación."),
  contextArtifacts: z
    .array(ContextArtifactSchema)
    .optional()
    .describe("Artefactos previamente generados inyectados como contexto (opcional)."),
  documents: z
    .array(AgentDocumentSchema)
    .optional()
    .describe("Documentos adjuntos (PDF/imágenes) como fuente multimodal para generar artefactos."),
  availableViews: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string(),
        notation: z.string().optional().describe("Grupo de componentes: ddd, bpmn, c4, uml."),
      })
    )
    .optional()
    .describe("Vistas del diseñador disponibles (para que el agente pregunte cuál ajustar/inyectar)."),
  graphData: z.any().optional().describe("Modelo de dominio actual (DomainAnalysis) como contexto de SOLO LECTURA."),
  provider: z.enum(["local", "gemini", "openai", "anthropic"]).optional().describe("Proveedor de IA ('local' = Gemma en el equipo)."),
  apiKey: z.string().optional(),
  modelName: z.string().optional().describe("Modelo local seleccionado en Ajustes."),
  temperature: z.number().optional(),
});
export type ReactAgentInput = z.infer<typeof ReactAgentInputSchema>;

export const ReactAgentOutputSchema = z.object({
  reply: z.string().describe("Respuesta en lenguaje natural del agente."),
  steps: z.array(AgentStepSchema).describe("Traza del razonamiento ReAct."),
  artifacts: z.array(AgentArtifactSchema).describe("Artefactos generados en este turno."),
  usage: UsageSchema.optional(),
});
export type ReactAgentOutput = z.infer<typeof ReactAgentOutputSchema>;

// Re-export para conveniencia de los generadores de artefactos.
export {
  ArchitectureDriversOutputSchema,
  ConstraintsRisksOutputSchema,
  RoadmapOutputSchema,
  TechnicalElementsOutputSchema,
};
