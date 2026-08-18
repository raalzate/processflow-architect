/**
 * Convierte un artefacto a Markdown enriquecido (reutiliza los formatters existentes
 * para los tipos estructurados). Usado por el card del lienzo y por el export a PDF.
 */

import type { Artifact } from "@/lib/agent-types";
import type { GraphNode } from "@/lib/types";
import {
  formatDriversToMarkdown,
  formatConstraintsToMarkdown,
  formatProposalToMarkdown,
  formatRoadmapToMarkdown,
} from "@/lib/markdown-utils";

/** Cuerpo Markdown del artefacto (sin encabezado de título). */
export function artifactBodyMarkdown(a: Artifact, allNodes: GraphNode[]): string {
  switch (a.render) {
    case "markdown":
      return a.payload?.markdown ?? "";
    case "mermaid":
      return "```mermaid\n" + (a.payload?.code ?? "") + "\n```";
    case "drivers":
      return formatDriversToMarkdown(a.payload, allNodes);
    case "constraints":
      return formatConstraintsToMarkdown(a.payload, allNodes);
    case "proposal":
      return formatProposalToMarkdown(a.payload);
    case "roadmap":
      return formatRoadmapToMarkdown(a.payload, allNodes);
    default:
      return "";
  }
}

/**
 * Markdown del artefacto con encabezado de título (para documentos/PDF).
 * La revisión viaja en el encabezado cuando es > 1: un export sin número
 * esconde que el documento tuvo historia (004-artefactos-versionados, FR-012).
 */
export function artifactToMarkdown(a: Artifact, allNodes: GraphNode[]): string {
  const rev = a.revision && a.revision > 1 ? ` · v${a.revision}` : "";
  return `## ${a.title}${rev}\n\n${artifactBodyMarkdown(a, allNodes)}\n`;
}
