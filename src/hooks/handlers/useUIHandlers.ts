import { useCallback } from "react";
import type { GraphNode, GraphData, SavedFile, ArchitectureDriversOutput, ConstraintsRisksOutput, RoadmapOutput, TechnicalElementsOutput } from "@/lib/types";
import {
    formatDriversToMarkdown,
    formatConstraintsToMarkdown,
    formatRoadmapToMarkdown,
    formatNodeTreeToMarkdown,
    formatTaskListToMarkdown,
    formatProposalToMarkdown,
} from "@/lib/markdown-utils";

type UIHandlersDeps = {
    toast: (opts: any) => void;
    graphData: GraphData | null;
    allNodes: GraphNode[];
    driversResult: ArchitectureDriversOutput | null;
    constraintsResult: ConstraintsRisksOutput | null;
    roadmapResult: RoadmapOutput | null;
    proposalResult: TechnicalElementsOutput | null;
    taskListNodes: { new: GraphNode[]; modified: GraphNode[] };
    setVisibleAggregates: (s: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setVisibleNodeTypes: (s: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    openNodeModalExternal: (node: GraphNode | null, clearHistory?: boolean) => void;
    setSelectedNode: (n: GraphNode | null) => void;
    currentFileId: string | null;
    savedFiles: SavedFile[];
    setSavedFiles: (files: SavedFile[]) => void;
    loadFile: (file: SavedFile) => any;
};

export function useUIHandlers(deps: UIHandlersDeps) {
    const {
        toast,
        graphData,
        allNodes,
        driversResult,
        constraintsResult,
        roadmapResult,
        proposalResult,
        taskListNodes,
        setVisibleAggregates,
        setVisibleNodeTypes,
        openNodeModalExternal,
        setSelectedNode,
        currentFileId,
        savedFiles,
        setSavedFiles,
        loadFile,
    } = deps;

    const handleCopy = useCallback(async (text: string, id: string) => {
        if (!text) {
            toast({ variant: "destructive", title: "Nada para copiar", description: "No hay contenido para copiar." });
            return;
        }

        if (window.electronAPI && window.electronAPI.copyToClipboard) {
            const success = await window.electronAPI.copyToClipboard(text);
            if (success) {
                toast({ title: "Copiado al portapapeles" });
            } else {
                toast({ variant: "destructive", title: "Error al copiar", description: "No se pudo copiar el texto." });
            }
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado al portapapeles" });
        }, (err) => {
            toast({ variant: "destructive", title: "Error al copiar", description: "No se pudo copiar el texto." });
            console.error('Error al copiar: ', err);
        });
    }, [toast]);

    const handleCopyAll = useCallback(async () => {
        let fullMarkdown = "# Análisis de ProcessFlow Architect\n\n";
        if (graphData) fullMarkdown += formatNodeTreeToMarkdown(graphData);
        if (driversResult) fullMarkdown += formatDriversToMarkdown(driversResult, allNodes);
        if (constraintsResult) fullMarkdown += formatConstraintsToMarkdown(constraintsResult, allNodes);
        if (proposalResult) fullMarkdown += formatProposalToMarkdown(proposalResult);
        if (roadmapResult) fullMarkdown += formatRoadmapToMarkdown(roadmapResult, allNodes);
        if (taskListNodes) fullMarkdown += await formatTaskListToMarkdown(taskListNodes, graphData?.notas);
        handleCopy(fullMarkdown, 'all');
    }, [graphData, driversResult, constraintsResult, proposalResult, roadmapResult, taskListNodes, allNodes, handleCopy]);

    const handleFilterChange = useCallback((aggregateName: string, isVisible: boolean) => {
        setVisibleAggregates((prev) => {
            const newSet = new Set(prev);
            if (isVisible) newSet.add(aggregateName); else newSet.delete(aggregateName);
            return newSet;
        });
    }, [setVisibleAggregates]);

    const handleNodeTypeFilterChange = useCallback((nodeType: string, isVisible: boolean) => {
        setVisibleNodeTypes(prev => {
            const newSet = new Set(prev);
            if (isVisible) newSet.add(nodeType); else newSet.delete(nodeType);
            return newSet;
        });
    }, [setVisibleNodeTypes]);

    const openNodeModal = useCallback((node: GraphNode | null, clearHistory: boolean = false) => {
        openNodeModalExternal(node, clearHistory);
    }, [openNodeModalExternal]);

    const handleNodeSelectFromSidebar = useCallback((node: GraphNode) => {
        openNodeModal(node, true);
        if (node.agregado) setVisibleAggregates(prev => new Set(prev).add(node.agregado!));
        setVisibleNodeTypes(prev => new Set(prev).add(node.tipo_elemento));
    }, [openNodeModal, setVisibleAggregates, setVisibleNodeTypes]);

    const handleNodeSelectById = useCallback((nodeId: string) => {
        const node = allNodes.find(n => n.id === nodeId);
        if (node) {
            openNodeModal(node, false);
        }
    }, [allNodes, openNodeModal]);

    const handleNodeSelectFromModal = useCallback((nodeId: string) => {
        const nodeToSelect = allNodes.find(n => n.id === nodeId);
        if (nodeToSelect) {
            setSelectedNode(nodeToSelect);
        }
    }, [allNodes, setSelectedNode]);

    const handleModalBack = useCallback(() => {
        // page manages modal history; this is a no-op placeholder if called from handler manager
    }, []);

    const handleNodeUpdate = useCallback((updatedNode: GraphNode) => {
        if (!currentFileId || !graphData) return;
        const newGraphData: any = JSON.parse(JSON.stringify(graphData));
        let found = false;

        if (updatedNode.nivel === 'process_level') {
            for (const agregado of newGraphData.agregados) {
                const nodeIndex = agregado.nodos.findIndex((n: any) => n.id === updatedNode.id);
                if (nodeIndex !== -1) {
                    const { agregado: _, ...nodeToSave } = updatedNode as any;
                    agregado.nodos[nodeIndex] = nodeToSave;
                    found = true; break;
                }
            }
        }

        if (updatedNode.nivel === 'big_picture') {
            const big_picture = newGraphData.big_picture;
            const nodeIndex = big_picture.nodos.findIndex((n: any) => n.id === updatedNode.id);
            if (nodeIndex !== -1) {
                const { ...nodeToSave } = updatedNode as any;
                big_picture.nodos[nodeIndex] = nodeToSave;
                found = true;
            }
        }
        if (updatedNode.nivel === 'read_model') {
            const read_models = newGraphData.read_models;
            const nodeIndex = parseInt(updatedNode.id.split("-")[0] || '-1');

            if (nodeIndex !== -1) {
                if (updatedNode.tipo_elemento === "Vista") {
                    const techUpdate = updatedNode.tags_tecnologia || [];
                    read_models[nodeIndex] = {
                        ...read_models[nodeIndex],
                        nombre: updatedNode.nombre,
                        descripcion: updatedNode.descripcion,
                        tecnologias: techUpdate,
                    };
                }
                if (updatedNode.tipo_elemento === "Política") {
                    const nodeIndex2 = parseInt(updatedNode.id.split("-")[1] || '-1');
                    read_models[nodeIndex].ui_policies[nodeIndex2] = updatedNode.nombre;
                }

                if (updatedNode.tipo_elemento === "Evento") {
                    const nodeIndex2 = parseInt(updatedNode.id.split("-")[1] || '-1');
                    read_models[nodeIndex].proyecta[nodeIndex2] = updatedNode.nombre;
                }
                found = true;
            }
        }

        if (!found) { toast({ variant: "destructive", title: "Error al actualizar", description: "No se pudo encontrar el nodo para actualizar." }); return; }
        const updatedFiles = savedFiles.map(file => file.id === currentFileId ? { ...file, content: newGraphData } : file);
        setSavedFiles(updatedFiles);
        const updatedFile = updatedFiles.find(f => f.id === currentFileId);
        if (updatedFile) loadFile(updatedFile);
        toast({ title: "Nodo actualizado", description: `Se guardaron los cambios para "${updatedNode.nombre}".` });
    }, [currentFileId, graphData, savedFiles, loadFile, setSavedFiles, toast]);

    const handleSearchSelect = useCallback((node: GraphNode) => {
        openNodeModal(node, true);
    }, [openNodeModal]);

    return {
        handleCopy,
        handleCopyAll,
        handleFilterChange,
        handleNodeTypeFilterChange,
        openNodeModal,
        handleNodeSelectFromSidebar,
        handleNodeSelectById,
        handleNodeSelectFromModal,
        handleModalBack,
        handleNodeUpdate,
        handleSearchSelect,
    };
}
