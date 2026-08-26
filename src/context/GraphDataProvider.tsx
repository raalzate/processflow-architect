"use client";

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// Hooks
import { useToast } from "@/hooks/use-toast";
import { useSavedFiles } from "@/hooks/useSavedFiles";
import { useGraphData } from "@/hooks/useGraphData";
import { useFileHandlers } from "@/hooks/handlers/useFileHandlers";
import { useAnalysisHandlers } from "@/hooks/handlers/useAnalysisHandlers";
import { usePdfHandlers } from "@/hooks/handlers/usePdfHandlers";
import { useUIHandlers } from "@/hooks/handlers/useUIHandlers";

// Types
import {
  type GraphNode,
  type SavedFile,
  type ArchitectureDriversOutput,
  type ConstraintsRisksOutput,
  type RoadmapOutput,
  type TechnicalElementsOutput,
} from "@/lib/types";

// Context
import { GraphContext, type GraphContextType } from "@/context/GraphContext";
import { ALL_NODE_TYPES } from "@/lib/notations";

// Constants
import {
  STORAGE_API_KEY,
  STORAGE_MODEL,
  STORAGE_SAVED_FILES,
  STORAGE_LAST_FILE_ID,
  STORAGE_TOKEN_USAGE,
} from "@/lib/graph-constants";

interface GraphDataProviderProps {
  children: ReactNode;
}

export function GraphDataProvider({ children }: GraphDataProviderProps) {
  // --- Core Hooks & Refs ---
  const { toast } = useToast();
  const router = useRouter();
  const pdfRef = useRef<HTMLDivElement>(null);

  // --- Custom Data Hooks ---
  // Gestiona el estado de los archivos guardados y el archivo actual
  const {
    savedFiles,
    setSavedFiles,
    currentFileId,
    setCurrentFileId,
    addFile,
    deleteFile,
    orgFilter,
    setOrgFilter,
    setFileOrg,
    clearOrgFromProjects,
  } = useSavedFiles();

  // Gestiona el parsing del JSON y deriva datos base (nodos, links, etc.)
  const {
    graphData: hookGraphData,
    allNodes: hookAllNodes,
    allLinks: hookAllLinks,
    aggregates: hookAggregates,
    technologies: hookTechnologies,
    nodeTypes: hookNodeTypes,
    sidebarNodeTree: hookNodeTree,
    loadFile,
  } = useGraphData();

  // --- State Management ---

  // Estado de Análisis de IA
  const [driversResult, setDriversResult] =
    useState<ArchitectureDriversOutput | null>(null);
  const [constraintsResult, setConstraintsResult] =
    useState<ConstraintsRisksOutput | null>(null);
  const [roadmapResult, setRoadmapResult] = useState<RoadmapOutput | null>(null);
  const [proposalResult, setProposalResult] =
    useState<TechnicalElementsOutput | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Estado de UI (Selección, Modal)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [modalHistory, setModalHistory] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);

  // Estado de Configuración
  const [apiKey, setApiKey] = useState<string>("");
  const [modelName, setModelName] = useState<string>("gemini-2.5-flash");

  // Estado Misceláneo
  const [key] = useState(0); // Posiblemente para forzar re-render, aunque no se usa
  const [copiedStates] = useState<Record<string, boolean>>({}); // El estado de 'copiado'

  // --- Data Aliases ---
  // Proporciona valores de fallback para los datos de los hooks
  const graphData = hookGraphData;
  const allNodes = hookAllNodes || [];
  const allLinks = hookAllLinks || [];
  const aggregates = hookAggregates || [];
  const technologies = hookTechnologies || [];
  const nodeTypes = hookNodeTypes || [];
  const sidebarNodeTree = hookNodeTree || {};

  // --- Derived State (useMemo) ---
  // Calcula datos derivados solo cuando sus dependencias cambian

  // Nodos filtrados para la "Lista de Tareas"
  const taskListNodes = useMemo(() => {
    const relevant = (node: GraphNode) =>
      node.tipo_elemento !== "Actor" && node.tipo_elemento !== "Sistema Externo";
    const newNodes = allNodes.filter(
      (node) => node.estado_comparativo === "nuevo" && relevant(node)
    );
    const modifiedNodes = allNodes.filter(
      (node) =>
        (node.estado_comparativo === "modificado" ||
          node.estado_comparativo === "existente") &&
        relevant(node)
    );
    // Los eliminados van en su propia sección: mezclarlos con "modificados"
    // ocultaba la intención de borrado.
    const deletedNodes = allNodes.filter(
      (node) => node.estado_comparativo === "eliminado" && relevant(node)
    );
    return { new: newNodes, modified: modifiedNodes, deleted: deletedNodes };
  }, [allNodes]);

  // Los filtros del lienzo NO viven acá: son de la VISTA activa y se aplican al
  // dibujar (`ViewsContext` + `src/lib/graph-filters.ts`). Antes este provider
  // calculaba `filteredNodes`/`filteredLinks` que NADIE consumía: el menú de
  // filtros parecía funcionar y el lienzo nunca cambiaba.

  // --- Core Callbacks (useCallback) ---
  // Callbacks definidos en este componente

  // Actualiza el contador de tokens en localStorage
  const updateTokenUsage = useCallback(
    (tokens: number) => {
      const currentUsage = parseInt(
        localStorage.getItem(STORAGE_TOKEN_USAGE) || "0",
        10
      );
      const newUsage = currentUsage + tokens;
      const estimation = (tokens / 1000000) * 0.3; // Asumiendo un costo
      toast({
        variant: "default",
        title: "Estimación de consumo de tokens",
        description: `Se han consumido ${tokens} tokens. Costo estimado: $${estimation.toFixed(
          4
        )}`,
      });
      localStorage.setItem(STORAGE_TOKEN_USAGE, newUsage.toString());
    },
    [toast]
  );

  // Función externa para abrir el modal (pasada a `usePageHandlers`)
  const openNodeModalExternal = (
    node: GraphNode | null,
    clearHistory: boolean = false
  ) => {
    if (node && clearHistory) setModalHistory([]);
    setSelectedNode(node);
  };

  // --- Handlers Hooks ---
  const fileHandlers = useFileHandlers({
    savedFiles,
    setSavedFiles,
    currentFileId,
    setCurrentFileId,
    addFile,
    deleteFileHook: deleteFile,
    loadFile,
    graphData,
    toast,
    setDriversResult,
    setConstraintsResult,
    setRoadmapResult,
    setProposalResult,
  });

  const analysisHandlers = useAnalysisHandlers({
    graphData,
    currentFileId,
    apiKey,
    modelName,
    toast,
    router,
    savedFiles,
    setSavedFiles,
    updateTokenUsage,
    driversResult,
    constraintsResult,
    proposalResult,
    setDriversResult,
    setConstraintsResult,
    setRoadmapResult,
    setProposalResult,
  });

  const pdfHandlers = usePdfHandlers({
    graphData,
    allNodes,
    driversResult,
    constraintsResult,
    roadmapResult,
    proposalResult,
    taskListNodes,
    setIsGeneratingPdf,
    toast,
  });

  const uiHandlers = useUIHandlers({
    toast,
    graphData,
    allNodes,
    driversResult,
    constraintsResult,
    roadmapResult,
    proposalResult,
    taskListNodes,
    openNodeModalExternal,
    setSelectedNode,
    currentFileId,
    savedFiles,
    setSavedFiles,
    loadFile,
  });

  // --- Effects (useEffect) ---

  // Efecto para actualizar los resultados de búsqueda
  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      const results = allNodes.filter(
        (node) =>
          node.nombre.toLowerCase().includes(lowerCaseQuery) ||
          (node.descripcion &&
            node.descripcion.toLowerCase().includes(lowerCaseQuery)) ||
          node.tipo_elemento.toLowerCase().includes(lowerCaseQuery) ||
          (node.agregado &&
            node.agregado.toLowerCase().includes(lowerCaseQuery))
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, allNodes]);

  // Efecto de carga inicial: Lee de localStorage
  useEffect(() => {
    try {
      // Cargar config
      const storedApiKey = localStorage.getItem(STORAGE_API_KEY);
      if (storedApiKey) setApiKey(storedApiKey);
      const storedModel = localStorage.getItem(STORAGE_MODEL);
      if (storedModel) setModelName(storedModel);

      // Cargar archivos
      const storedFiles = localStorage.getItem(STORAGE_SAVED_FILES);
      if (storedFiles) {
        let filesParsed: any;
        try {
          const parsed = JSON.parse(storedFiles);
          filesParsed = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          filesParsed = null;
        }

        if (filesParsed && filesParsed.length > 0) {
          const files: SavedFile[] = filesParsed;
          setSavedFiles(files);

          const lastFileId = localStorage.getItem(STORAGE_LAST_FILE_ID);
          let fileToLoad: SavedFile | undefined = lastFileId
            ? files.find((f) => f.id === lastFileId)
            : files[0]; // Carga el último o el primero

          if (fileToLoad) {
            setCurrentFileId(fileToLoad.id);
            const res = loadFile(fileToLoad);

            // Restaurar resultados de IA
            const saved = fileToLoad as any;
            const contentSaved = saved?.content ?? {};
            setDriversResult(
              saved.driversResult ?? contentSaved.driversResult ?? null
            );
            setConstraintsResult(
              saved.constraintsResult ?? contentSaved.constraintsResult ?? null
            );
            setRoadmapResult(
              saved.roadmapResult ?? contentSaved.roadmapResult ?? null
            );
            setProposalResult(
              saved.proposalResult ?? contentSaved.proposalResult ?? null
            );

          }
        }
      }
    } catch (error) {
      console.error("Error loading data from localStorage:", error);
      toast({
        variant: "destructive",
        title: "Error al cargar datos locales",
        description: "No se pudieron cargar los archivos guardados.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, loadFile]);

  // Efecto para recargar datos si `currentFileId` cambia y `graphData` se pierde
  useEffect(() => {
    try {
      if (
        !graphData &&
        currentFileId &&
        savedFiles &&
        savedFiles.length > 0
      ) {
        const f = savedFiles.find((f) => f.id === currentFileId);
        if (f) {
          const res = loadFile(f);
          // Restaurar resultados
          const saved = f as any;
          const contentSaved = saved?.content ?? {};
          setDriversResult(
            saved.driversResult ?? contentSaved.driversResult ?? null
          );
          setConstraintsResult(
            saved.constraintsResult ?? contentSaved.constraintsResult ?? null
          );
          setRoadmapResult(
            saved.roadmapResult ?? contentSaved.roadmapResult ?? null
          );
          setProposalResult(
            saved.proposalResult ?? contentSaved.proposalResult ?? null
          );
        }
      }
    } catch (e) {
      console.error("Error reloading file from savedFiles:", e);
    }
  }, [currentFileId, savedFiles, graphData, loadFile]);

  useEffect(() => {
    if (window.electronAPI && (window.electronAPI as any).navigate) {
      (window.electronAPI as any).navigate((_event: any, route: string) => {
        router.push(route);
      });
    }
  }, [router]);

  // --- Context Provider Value ---
  // Ensambla el valor final para el GraphContext.Provider
  const contextValue: GraphContextType = {
    // Datos del Grafo
    graphData,
    allNodes,
    allLinks,
    aggregates,
    technologies,
    nodeTypes,
    sidebarNodeTree,
    taskListNodes,

    // Estado de Filtros

    // Estado de UI
    selectedNode,
    setSelectedNode,
    modalHistory,
    key,
    copiedStates,

    // Estado de IA
    driversResult,
    constraintsResult,
    roadmapResult,
    proposalResult,

    // Estado de Archivos
    savedFiles,
    currentFileId,
    // Organizaciones: agrupan los proyectos; el filtro es de VISTA (no mueve nada).
    orgFilter,
    setOrgFilter,
    setFileOrg,
    clearOrgFromProjects,

    // Estado de Búsqueda
    searchQuery,
    setSearchQuery,
    searchResults,

    // Estado de PDF
    isGeneratingPdf,
    pdfRef,

    // Handlers (todos vienen de los hooks especializados)
    ...fileHandlers,
    ...analysisHandlers,
    ...pdfHandlers,
    ...uiHandlers,
  };

  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
}
