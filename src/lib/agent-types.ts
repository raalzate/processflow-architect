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
  type: z.enum(["thought", "action", "observation"]),
  tool: z.string().optional().describe("Herramienta invocada en un paso 'action'."),
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

/** Artefacto persistido en el lienzo. */
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
