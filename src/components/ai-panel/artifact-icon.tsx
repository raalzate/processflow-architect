"use client";

/**
 * NOMBRE de icono → componente lucide, para los artefactos.
 *
 * El registro (`src/lib/artifacts/registry.ts`) es puro y por eso nombra su icono
 * con un string; la UI lo resuelve acá. Antes la lista y el riel pintaban SIEMPRE
 * `FileText`/`Workflow`, así que drivers, riesgos, roadmap y ADR se veían iguales
 * y el icono no informaba nada.
 *
 * Añadir un `kind` con un icono que no esté en este mapa hace fallar
 * `__tests__/artifact-icon.test.ts`: el freno que obliga a crearlo.
 */
import React from "react";
import {
  Activity,
  ArrowLeftRight,
  BookMarked,
  Boxes,
  ClipboardList,
  Component,
  Container,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  Map,
  Milestone,
  Network,
  Server,
  ShieldAlert,
  Target,
  Webhook,
  Workflow,
} from "lucide-react";
import { getDefinition, type ToolFamily } from "@/lib/artifacts/registry";

export const ARTIFACT_ICON_MAP: Record<string, React.ElementType> = {
  Activity,
  ArrowLeftRight,
  BookMarked,
  Boxes,
  ClipboardList,
  Component,
  Container,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  Map,
  Milestone,
  Network,
  Server,
  ShieldAlert,
  Target,
  Webhook,
  Workflow,
};

/** Icono del `kind`. Un kind inventado por el agente cae al de su familia. */
export function iconForArtifactKind(
  kind: string,
  family: ToolFamily = "document"
): React.ElementType {
  const def = getDefinition(kind, family);
  return ARTIFACT_ICON_MAP[def.icon] ?? (def.family === "diagram" ? Workflow : FileText);
}

/** Icono de un artefacto ya generado: la familia sale de cómo se renderiza. */
export function iconForArtifact(a: { kind: string; render?: string }): React.ElementType {
  return iconForArtifactKind(a.kind, a.render === "mermaid" ? "diagram" : "document");
}
