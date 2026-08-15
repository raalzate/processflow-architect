import {
  type GraphNode,
  type ArchitectureDriversOutput,
  type ConstraintsRisksOutput,
  type RoadmapOutput,
  type TechnicalElementsOutput,
  GraphData,
} from "@/lib/types";
import { separateCamelCase } from "./utils";
import { diagramBigPicture, diagramContext, diagramReadModels, diagramTechnicalElements } from "./mermaid-diagram";
import { getNotation, notationContainerLabel } from "./notations";

// Tipado para el árbol de nodos, ya que lo movimos
type NodeTree = {
  [aggregate: string]: {
    [type: string]: GraphNode[];
  };
};

export const formatDriversToMarkdown = (drivers: ArchitectureDriversOutput, allNodes: GraphNode[]) => {
  if (!drivers || !drivers.drivers) return "";
  let md = "## Drivers de Arquitectura\n\n";
  drivers.drivers.forEach(driver => {
    md += `### ${driver.nombre}\n`;
    md += `${driver.descripcion}\n`;
    if (driver.nodos_relacionados.length > 0) {
      md += "**Elementos claves:** " + driver.nodos_relacionados.map(nodeId => `\`${separateCamelCase(allNodes.find(n => n.id === nodeId)?.nombre || nodeId)}\``).join(", ") + "\n";
    }
    md += "\n---\n\n";
  });
  return md;
}

export const formatConstraintsToMarkdown = (constraints: ConstraintsRisksOutput, allNodes: GraphNode[]) => {
  if (!constraints || !constraints.constraintsAndRisks) return "";
  let md = "## Restricciones y Riesgos\n\n";
  constraints.constraintsAndRisks.forEach(item => {
    md += `### ${item.tipo}: ${item.nombre}\n`;
    md += `${item.descripcion}\n`;
    if (item.nodos_relacionados.length > 0) {
      md += "**Elementos claves:** " + item.nodos_relacionados.map(nodeId => `\`${separateCamelCase(allNodes.find(n => n.id === nodeId)?.nombre || nodeId)}\``).join(", ") + "\n";
    }
    md += "\n---\n\n";
  });
  return md;
}

export const formatRoadmapToMarkdown = (roadmap: RoadmapOutput, allNodes: GraphNode[]) => {
  if (!roadmap || !roadmap.phases) return "";
  let md = "## Roadmap de Implementación (Propuesta)\n\n";
  roadmap.phases.forEach(phase => {
    md += `### ${phase.phaseName} (${phase.duration})\n\n`;
    md += "**Épicas Clave:**\n";
    phase.epics.forEach(epic => {
      md += `- ${epic}\n`;
    });
    if (phase.requiredRoles && phase.requiredRoles.length > 0) {
      md += "\n**Roles Requeridos:**\n";
      md += phase.requiredRoles.join(", ") + "\n\n";
    }
    if (phase.taskIds && phase.taskIds.length > 0) {
      md += "**Elementos Vinculadas:**\n";
      phase.taskIds.forEach(taskId => {
        const taskNode = allNodes.find(n => n.id === taskId);
        md += `- ${taskNode ? taskNode.nombre : taskId}\n`;
      });
      md += "\n";
    }
    md += "---\n\n";
  });
  return md;
}



export const formatProposalToMarkdown = (proposal: TechnicalElementsOutput) => {
  if (!proposal) return "";


  const addSection = (title: string, items: string[]) => {
    // Si no hay items, no se agrega la sección
    if (!items || items.length === 0) {
      return "";
    }

    let sectionMd = `### ${title}\n\n`; // Título de la sección
    items.forEach(name => {
      sectionMd += `- ${name}\n`; // Cada item como una viñeta
    });
    sectionMd += "\n"; // Espacio extra para la siguiente sección
    return sectionMd;
  };

  let md = "## Propuesta de Implementación\n\n";

  if (proposal.observaciones) {
    md += `${proposal.observaciones}\n\n`;
  }

  md += addSection("Base de datos", proposal.baseDeDatos);
  md += addSection("Backend", proposal.backend);
  md += addSection("Infraestructura", proposal.infraestructura);
  md += addSection("Herramientas", proposal.herramientas);

  md += addSection("Consideraciones", proposal.restricciones);

  // Sólo emitimos el diagrama si tiene nodos: un ```mermaid``` vacío rompe el
  // render (y el encabezado quedaría colgando sin contenido).
  if (proposal.diagrama?.nodes?.length) {
    md += "### Planteamiento de la solución\n\n";
    md += "```mermaid\n" + diagramTechnicalElements(proposal.diagrama) + "```\n\n\n";
  }

  return md; // .trim() para limpiar cualquier espacio en blanco al final
};

/**
 * Markdown del modelo para copiar/pegar. Los encabezados siguen la NOTACIÓN del
 * documento (`Modelo de Procesos` + `Análisis de pool` ante un BPMN): antes todo
 * el reporte hablaba de dominio y agregados aunque el diagrama fuera otro.
 */
export const formatNodeTreeToMarkdown = (graph: GraphData) => {
  if (graph.agregados.length === 0) return "";
  const notation = graph.notation;
  const contenedor = notationContainerLabel(notation);
  let md = `## ${getNotation(notation).modelLabel}\n`;
  md += graph.big_picture.descripcion + "\n\n";

  if (graph.big_picture.hotspots && graph.big_picture.hotspots.length > 0) {
    md += `### Áreas poco claras del modelo que requieren más atención y discusión:\n`;
    for (const agg in graph.big_picture.hotspots) {
      md += `- ***${graph.big_picture.hotspots[agg]}***\n`;
    }
  }
  md += "\n\n";
  md += "### Contexto\n";
  md += "```mermaid\n" + diagramContext(graph.big_picture, notation) + "```\n\n";

  md += `## Análisis por ${contenedor} ##\n`;
  for (const agg in graph.agregados) {
    md += `### ${separateCamelCase(graph.agregados[agg].nombre_agregado)}\n`;
    for (const n in graph.agregados[agg].nodos) {
      md += `- **[${graph.agregados[agg].nodos[n].tipo_elemento}] ${graph.agregados[agg].nodos[n].nombre}:** `;
      md += `${graph.agregados[agg].nodos[n].descripcion}\n`;
    }
    md += "\n";
  }
  md += "\n";
  md += "### Big Picture\n";
  md += "\n";
  md += "```mermaid\n" + diagramBigPicture(graph.big_picture) + "```\n";
  md += `\n\n`;
  md += `## Vista de Datos ##\n`;
  if (graph.read_models && graph.read_models.length > 0) {
    for (const agg in graph.read_models) {
      md += `### Modelo de lectura: ${graph.read_models[agg].nombre}\n`;
      md += `${graph.read_models[agg].descripcion}\n`;

      md += `#### Proyecta\n`;
      for (const n in graph.read_models[agg].proyecta) {
        md += `-${separateCamelCase(graph.read_models[agg].proyecta[n]).replace('Evento', '')}\n`;
      }

      md += `#### Tecnologías Involucrar\n`;
      for (const n in graph.read_models[agg].tecnologias) {
        md += `- ***${graph.read_models[agg].tecnologias[n]}***\n`;
      }
      md += "\n";

      md += `#### Diagrama del Read Model\n`;
      md += "```mermaid\n" + diagramReadModels(graph.read_models[agg]) + "```\n\n\n";
    }
  }


  return md;
}

import { promptSummarize, SYSTEM_PROMPT_COSMIC } from "./template-prompt";
import { runLocal } from "./ai/providers";

export const formatTaskListToMarkdown = async (
  tasks: { new: GraphNode[]; modified: GraphNode[]; deleted?: GraphNode[] },
  nota?: string,
  useAI: boolean = false
) => {
  const deleted = tasks.deleted ?? [];
  if (tasks.new.length === 0 && tasks.modified.length === 0 && deleted.length === 0) return "";
  let md = "## Elementos Principales (Nuevos/Modificados)\n";
  if (nota)
    md += nota + "\n\n";

  if (tasks.new.length > 0) {
    md += `### Cambios nuevos (${tasks.new.length})\n`;
    for (const node of tasks.new) {
      let instruction = node.nombre;
      try {
        if (useAI && typeof window !== 'undefined' && window.electronAPI) {
          const prompt = promptSummarize(node);
          const paraphrased = await runLocal(prompt, SYSTEM_PROMPT_COSMIC);
          if (paraphrased) instruction = paraphrased.trim();
        }
      } catch (e) {
        console.error("Error paraphrasing task:", e);
      }
      md += `- **[${node.tipo_elemento}]** ${instruction} \n`;
    }
    md += "\n";
  }

  if (tasks.modified.length > 0) {
    md += `### Modificados (${tasks.modified.length})\n`;
    for (const node of tasks.modified) {
      let instruction = node.nombre;
      try {
        if (useAI && typeof window !== 'undefined' && window.electronAPI) {
          const prompt = promptSummarize(node);
          const paraphrased = await runLocal(prompt, SYSTEM_PROMPT_COSMIC);
          if (paraphrased) instruction = paraphrased.trim();
        }
      } catch (e) {
        console.error("Error paraphrasing task:", e);
      }
      md += `- **[${node.tipo_elemento}]** ${instruction} \n`;
    }
    md += "\n";
  }

  // Eliminados: sin paráfrasis de IA — el nombre literal identifica qué borrar.
  if (deleted.length > 0) {
    md += `### Eliminados (${deleted.length})\n`;
    for (const node of deleted) {
      md += `- **[${node.tipo_elemento}]** ${node.nombre} \n`;
    }
    md += "\n";
  }
  return md;
};