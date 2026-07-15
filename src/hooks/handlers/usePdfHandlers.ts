import { useCallback } from "react";
import type { GraphData, GraphNode, ArchitectureDriversOutput, ConstraintsRisksOutput, RoadmapOutput, TechnicalElementsOutput } from "@/lib/types";
import {
    formatDriversToMarkdown,
    formatConstraintsToMarkdown,
    formatRoadmapToMarkdown,
    formatNodeTreeToMarkdown,
    formatTaskListToMarkdown,
    formatProposalToMarkdown,
} from "@/lib/markdown-utils";

type PdfHandlersDeps = {
    graphData: GraphData | null;
    allNodes: GraphNode[];
    driversResult: ArchitectureDriversOutput | null;
    constraintsResult: ConstraintsRisksOutput | null;
    roadmapResult: RoadmapOutput | null;
    proposalResult: TechnicalElementsOutput | null;
    taskListNodes: { new: GraphNode[]; modified: GraphNode[] };
    setIsGeneratingPdf: (v: boolean) => void;
    toast: (opts: any) => void;
};

export function usePdfHandlers(deps: PdfHandlersDeps) {
    const {
        graphData,
        allNodes,
        driversResult,
        constraintsResult,
        roadmapResult,
        proposalResult,
        taskListNodes,
        setIsGeneratingPdf,
        toast,
    } = deps;

    const handleDownloadPdf = useCallback(async () => {
        const graphDataLocal = graphData;
        if (!graphDataLocal) {
            toast({ variant: "destructive", title: "No hay datos para generar el PDF" });
            return;
        }
        setIsGeneratingPdf(true);
        toast({ title: "Generando PDF...", description: "Esto puede tardar unos segundos." });


        let fullMarkdown = "# Análisis de ProcessFlow Architect\n\n";
        if (graphData) fullMarkdown += formatNodeTreeToMarkdown(graphData);
        if (driversResult) fullMarkdown += formatDriversToMarkdown(driversResult, allNodes);
        if (constraintsResult) fullMarkdown += formatConstraintsToMarkdown(constraintsResult, allNodes);
        if (proposalResult) fullMarkdown += formatProposalToMarkdown(proposalResult);
        if (roadmapResult) fullMarkdown += formatRoadmapToMarkdown(roadmapResult, allNodes);
        if (taskListNodes) fullMarkdown += await formatTaskListToMarkdown(taskListNodes, graphData?.notas);

        const runGeneratePdf = (window as any).electronAPI?.generatePdf as ((fullMarkdown: string) => Promise<string>) | undefined;
        if (!runGeneratePdf) {
            toast({ variant: "destructive", title: "Función no disponible", description: "Los agentes AI sólo están disponibles en la app de escritorio." });
            return;
        }
        runGeneratePdf(fullMarkdown).then((pdfContent: string) => {
            toast({ title: "PDF Descargado", description: `Se ha guardado como "${pdfContent}".` });
            setIsGeneratingPdf(false);
        }).catch((error: any) => {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Error al generar PDF", description: "Ocurrió un error al generar el PDF." });
            setIsGeneratingPdf(false);
        });

    }, [graphData, setIsGeneratingPdf, toast, allNodes, driversResult, constraintsResult, roadmapResult, proposalResult, taskListNodes]);

    return {
        handleDownloadPdf,
    };
}
