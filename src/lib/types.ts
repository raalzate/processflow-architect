
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";
import type { EdgeRelationKind } from "./edge-relations";
import type { ElementMetadata } from "./element-metadata";
import type { NotationId } from "./notations";
import { z } from "zod";

export type { ElementMetadata };

export const UsageSchema = z.object({
  totalTokens: z.number(),
});

/**
 * Tipos del Event Storming/DDD original. NO es la lista de tipos válidos del
 * modelo: la fuente de verdad es el registro de notaciones (`notations.ts`), que
 * cubre DDD/BPMN/C4/UML. Esta constante sobrevive para las tareas de análisis
 * heredadas (merger, clasificación DDD) y como semilla de filtros.
 */
export const NODE_TYPES = [
  "Actor",
  "Sistema Externo",
  "Hotspot",
  "Comando",
  "Evento",
  "Política",
  "Entidad Raíz",
  "Agregado",
  "Read Model",
  "Vista",
  "Proyección",
  "Regla de Negocio",
  "Política de UI",
  // --- Diseño Táctico DDD (nodos que viven dentro de un Agregado) ---
  "Raíz de Agregado",
  "Entidad",
  "Objeto de Valor",
  "Servicio de Dominio",
  "Repositorio",
  "Fábrica",
] as const;



// Tipos contenedor del lienzo (se convierten en agregados, no en nodos).
// El Subdominio agrupa Contextos Delimitados (visión estratégica DDD).
export const CONTAINER_ELEMENT_TYPES = ["Agregado", "Contexto Delimitado", "Subdominio"] as const;



// Base Graph Schemas
export interface GraphNode extends SimulationNodeDatum {
  id: string;
  nombre: string;
  nivel?: string;
  agregado?: string;
  /**
   * Tipo del elemento SEGÚN SU NOTACIÓN (`Tarea` en BPMN, `Contenedor` en C4,
   * `Comando` en DDD…). Es `string` a propósito: atarlo a los tipos DDD obligaba
   * a castear en cada notación y dejaba el modelo mintiendo sobre lo que acepta.
   */
  tipo_elemento: string;
  descripcion?: string;
  estado_comparativo: "nuevo" | "modificado" | "sin_cambios" | "existente" | "eliminado";
  tags_tecnologia?: string[] | null;
  /** Color de fondo personalizado (hex). Si falta, usa el color de la notación. */
  color?: string;
  /** Color de borde/contorno personalizado (hex). Si falta, usa el de la notación. */
  borderColor?: string;
  /**
   * Referencias y datos externos de la caja: dónde vive de verdad (repositorio,
   * wiki, tablero, dueño). Es lo que conecta el diagrama con los artefactos
   * reales; distinto de la cita de la fuente (`source` del MCP), que justifica
   * el modelado y viaja dentro de la descripción. Ver `element-metadata.ts`.
   */
  metadata?: ElementMetadata[];
  /**
   * Id de la vista embebida (subproceso). Si está presente, el nodo actúa como
   * un "call activity" BPMN: al abrirlo se entra a esa vista para dar profundidad.
   */
  viewRef?: string;
  // Propiedades adicionales utilizadas por la visualización (opcional)
  isGroup?: boolean;
  _initialDragX?: number;
  _initialDragY?: number;
  // Geometría del lienzo del diseñador (x/y heredados de SimulationNodeDatum).
  // Persistida en el content para reconstruir el diseño al recargar.
  width?: number;
  height?: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  fuente: string;
  destino: string;
  descripcion?: string;
  tipo: string;
  source: string | GraphNode;
  target: string | GraphNode;
  estado_comparativo?: "nuevo" | "modificado" | "sin_cambios" | "existente" | "eliminado";
  /** Color de línea personalizado (hex). Si falta, usa el gris por defecto. */
  color?: string;
  /** true → línea discontinua (punteada); por defecto continua. */
  dashed?: boolean;
  /** Enrutado del trazo: recta (por defecto), curva o escalonada (ortogonal). */
  routing?: "straight" | "curved" | "orthogonal";
  /** Dirección de la(s) flecha(s): al destino (por defecto), ambos extremos, o ninguna. */
  arrow?: "end" | "both" | "none";
  /**
   * Relación que representa la arista (UML: herencia, realización, composición,
   * agregación, dependencia). Decide la MARCA de cada punta y si el trazo va
   * punteado — ver `src/lib/edge-relations.ts`. Si falta, es una asociación.
   */
  relation?: EdgeRelationKind;
  /** Ancla de la punta en el nodo ORIGEN (x/y normalizados 0..1 de su caja). Si falta, se ancla automático al borde. */
  sourceAnchor?: { x: number; y: number };
  /** Ancla de la punta en el nodo DESTINO (x/y normalizados 0..1 de su caja). */
  targetAnchor?: { x: number; y: number };
  /** Punto de doblez (esquina) del enrutado escalonado, en coords del lienzo. @deprecated usar midpoints */
  midpoint?: { x: number; y: number };
  /** Puntos de quiebre (esquinas) del enrutado escalonado, en orden, coords del lienzo. */
  midpoints?: { x: number; y: number }[];
  /** Desplazamiento de la etiqueta respecto de su sitio sobre el trazo (px del lienzo). */
  labelOffset?: { x: number; y: number };
}

export interface Agregado {
  nombre_agregado: string;
  entidad_raiz: string;
  descripcion: string;
  nodos: Omit<GraphNode, "agregado">[];
  aristas: Omit<GraphLink, "tipo" | "source" | "target">[];
  // Geometría y tipo del contenedor en el lienzo del diseñador (opcional,
  // sólo para reconstruir el diseño; el procesador del grafo las ignora).
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Tipo de contenedor en el lienzo. DDD usa Agregado/Contexto Delimitado/Subdominio;
  // otras notaciones (BPMN/C4/UML) guardan aquí su propio tipo (Pool, Límite de Sistema, ...).
  tipo_contenedor?: string;
  /** Color de fondo personalizado del contenedor (hex). */
  color?: string;
  /** Color de borde/contorno personalizado del contenedor (hex). */
  borderColor?: string;
  /** Referencias y datos externos del contenedor (ver `GraphNode.metadata`). */
  metadata?: ElementMetadata[];
}

export interface BigPicture {
  descripcion: string;
  hotspots: string[];
  nodos: Omit<GraphNode, "agregado">[];
  aristas: Omit<GraphLink, "tipo" | "source" | "target">[];
}

export interface ReadModel {
  nombre: string;
  descripcion: string;
  proyecta: string[];
  ui_policies: string[];
  tecnologias: string[];
}
export interface GraphData {
  nombre_proyecto: string;
  version: string;
  /**
   * Notación del documento (DDD, BPMN, C4, UML). Viaja CON el modelo para que la
   * vista "Modelo" del proyecto use la paleta/simbología correcta al importar,
   * sin depender del canal de export. Si falta, la app cae a la notación por
   * defecto (ddd).
   */
  notation?: NotationId;
  fecha_analisis: string;
  big_picture: BigPicture;
  agregados: Agregado[];
  read_models: ReadModel[];
  politicas_inter_agregados?: Omit<GraphLink, "tipo" | "source" | "target">[];
  responsables: string[];
  notas: string;
  transcript: string
}

// Schema for file handling in the UI
export interface SavedFile {
  id: string;
  name: string;
  content: GraphData;
  proposalResult?: TechnicalElementsOutput;
  driversResult?: ArchitectureDriversOutput;
  constraintsResult?: ConstraintsRisksOutput;
  roadmapResult?: RoadmapOutput;
}

// Zod Schemas for AI Agents

// Roadmap Agent Schemas
export const PhaseSchema = z.object({
  phaseName: z.string().describe("El nombre de la fase del roadmap."),
  duration: z.string().describe("Una estimación de la duración de la fase, ej. '2-3 semanas'."),
  epics: z.array(z.string()).describe("Una lista de las épicas o funcionalidades clave a desarrollar en esta fase."),
  requiredRoles: z.array(z.string()).describe("Una lista de los roles necesarios para ejecutar la fase.").optional(),
  taskIds: z.array(z.string()).describe("Lista de IDs de los nodos (tareas) de la lista de tareas que se abordarán en esta fase.").optional(),
});

export const RoadmapOutputSchema = z.object({
  phases: z.array(PhaseSchema).describe("Una lista de las fases del proyecto que componen el roadmap."),
  usage: UsageSchema.optional(),
});
export type RoadmapOutput = z.infer<typeof RoadmapOutputSchema>;


// Process Flow Analysis Agent Schemas
const ArchitecturalDriverSchema = z.object({
  nombre: z.string().describe("El nombre del driver de arquitectura. Por ejemplo: 'Escalabilidad', 'Seguridad', 'Rendimiento'."),
  descripcion: z.string().describe("Una explicación detallada de por qué este es un driver de arquitectura clave, basado en los datos proporcionados."),
  nodos_relacionados: z.array(z.string()).describe("Una lista de los IDs de los nodos que son más relevantes para este driver."),
});

export const ArchitectureDriversOutputSchema = z.object({
  drivers: z.array(ArchitecturalDriverSchema).describe("Una lista de los drivers de arquitectura identificados."),
  usage: UsageSchema.optional(),
});
export type ArchitectureDriversOutput = z.infer<typeof ArchitectureDriversOutputSchema>;

const ConstraintOrRiskSchema = z.object({
  nombre: z.string().describe("Un título corto y descriptivo para la restricción o riesgo."),
  descripcion: z.string().describe("Una explicación detallada de la restricción o riesgo, explicando su impacto potencial en el proyecto."),
  tipo: z.enum(["Restricción", "Riesgo"]).describe("Clasifica si el ítem es una 'Restricción' (una limitación fija) o un 'Riesgo' (un problema potencial que podría ocurrir)."),
  nodos_relacionados: z.array(z.string()).describe("Una lista de los IDs de los nodos que están directamente relacionados con esta restricción o riesgo."),
});

export const ConstraintsRisksOutputSchema = z.object({
  constraintsAndRisks: z.array(ConstraintOrRiskSchema).describe("Una lista de las restricciones y riesgos técnicos y de negocio identificados."),
  usage: UsageSchema.optional(),
});
export type ConstraintsRisksOutput = z.infer<typeof ConstraintsRisksOutputSchema>;


export type TechnicalDiagram = z.infer<typeof TechnicalElementsOutputSchema.shape.diagrama>;

export const TechnicalElementsOutputSchema = z.object({
  baseDeDatos: z.array(z.string()).describe('Bases de datos o motores identificados'),
  backend: z.array(z.string()).describe('Lenguajes, frameworks o plataformas de backend'),
  infraestructura: z.array(z.string()).describe('Servidores, middleware, arquitecturas o componentes de despliegue'),
  herramientas: z.array(z.string()).describe('Herramientas de desarrollo, módulos, visores, librerías'),
  restricciones: z.array(z.string()).describe('Limitaciones o condiciones técnicas mencionadas'),
  observaciones: z.string().describe('Notas o inferencias adicionales sobre la solución'),
  diagrama: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string() })),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      })
    ),
  }).describe('JSON estructurado solicitado por el esquema del diagrama con nodos y aristas'),
  usage: z
    .object({
      totalTokens: z.number().optional(),
    })
    .optional(),
});

export type TechnicalElementsOutput = z.infer<typeof TechnicalElementsOutputSchema>;


