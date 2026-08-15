"use client";

import { createContext, useContext, type Dispatch, type SetStateAction, type RefObject } from "react";
import {
  type GraphData,
  type GraphNode,
  type GraphLink,
  type SavedFile,
  type ArchitectureDriversOutput,
  type ConstraintsRisksOutput,
  type RoadmapOutput,
  type TechnicalElementsOutput
} from "@/lib/types";
import type { NotationId } from "@/lib/notations";



// Define un tipo para el árbol de nodos
type NodeTree = {
  [aggregate: string]: {
    [type: string]: GraphNode[];
  };
};

// Define el tipo para el estado del contexto
// Esto es básicamente una lista de todos tus estados y funciones
export interface GraphContextType {
  // Estado de Datos
  graphData: GraphData | null;
  allNodes: GraphNode[];
  allLinks: GraphLink[];
  aggregates: string[];
  technologies: string[];
  nodeTypes: string[];
  sidebarNodeTree: NodeTree;
  
  // Estado de Filtros
  visibleAggregates: Set<string>;
  visibleNodeTypes: Set<string>;
  filteredNodes: GraphNode[];
  filteredLinks: GraphLink[];

  // Estado de Selección y Modal
  selectedNode: GraphNode | null;
  setSelectedNode: Dispatch<SetStateAction<GraphNode | null>>;
  modalHistory: string[];
  
  // Estado de la UI
  key: number;
  copiedStates: Record<string, boolean>;

  // Estado de Análisis de IA
  driversResult: ArchitectureDriversOutput | null;
  constraintsResult: ConstraintsRisksOutput | null;
  roadmapResult: RoadmapOutput | null;
  proposalResult: TechnicalElementsOutput | null;

  
  // Estado de Archivos
  savedFiles: SavedFile[];
  currentFileId: string | null;

  // Estado de Búsqueda
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchResults: GraphNode[];

  // Estado de PDF
  isGeneratingPdf: boolean;
  pdfRef: RefObject<HTMLDivElement>;
  taskListNodes: { new: GraphNode[]; modified: GraphNode[]; deleted: GraphNode[] };

  // Funciones (Callbacks)
  handleCopy: (text: string, id: string) => void;
  handleCopyAll: () => void;
  handleDownloadPdf: () => void;
  handleRunAnalysis: (type: 'drivers' | 'constraints' | 'roadmap' | 'proposal', { temperature, customPrompt }: { temperature?: number; customPrompt?: string; }) => Promise<void>;
  handleCreateProject: (nombre: string, notation?: NotationId) => void;
  handleCreateProjectFromContent: (nombre: string, content: GraphData) => string | null;
  handleDesignUpdate: (fileId: string, content: GraphData) => void;
  handleFileSelect: (id: string) => void;
  handleFileDelete: (id: string) => void;
  handleDownloadJson: () => void;
  handleFilterChange: (aggregateName: string, isVisible: boolean) => void;
  handleNodeTypeFilterChange: (nodeType: string, isVisible: boolean) => void;
  openNodeModal: (node: GraphNode | null, clearHistory?: boolean) => void;
  handleNodeSelectFromSidebar: (node: GraphNode) => void;
  handleNodeSelectById: (nodeId: string) => void;
  handleNodeSelectFromModal: (nodeId: string) => void;
  handleModalBack: () => void;
  handleNodeUpdate: (updatedNode: GraphNode) => void;
  handleSearchSelect: (node: GraphNode) => void;
}

// Crear el Contexto
export const GraphContext = createContext<GraphContextType | undefined>(undefined);

// Hook personalizado para consumir el contexto
export const useGraphContext = () => {
  const context = useContext(GraphContext);
  if (context === undefined) {
    throw new Error("useGraphContext debe usarse dentro de un GraphProvider");
  }
  return context;
};