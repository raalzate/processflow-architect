import { useCallback } from "react";
import type { SavedFile, GraphData, ArchitectureDriversOutput, ConstraintsRisksOutput, RoadmapOutput, TechnicalElementsOutput } from "@/lib/types";

type AnalysisHandlersDeps = {
    graphData: GraphData | null;
    currentFileId: string | null;
    apiKey: string;
    modelName: string;
    toast: (opts: any) => void;
    router: any;
    savedFiles: SavedFile[];
    setSavedFiles: (files: SavedFile[]) => void;
    updateTokenUsage: (tokens: number) => void;
    driversResult: ArchitectureDriversOutput | null;
    constraintsResult: ConstraintsRisksOutput | null;
    proposalResult: TechnicalElementsOutput | null;
    setDriversResult: (r: ArchitectureDriversOutput | null) => void;
    setConstraintsResult: (r: ConstraintsRisksOutput | null) => void;
    setRoadmapResult: (r: RoadmapOutput | null) => void;
    setProposalResult: (r: TechnicalElementsOutput | null) => void;
};

export function useAnalysisHandlers(deps: AnalysisHandlersDeps) {
    const {
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
    } = deps;

    const handleRunAnalysis = useCallback(async (type: 'drivers' | 'constraints' | 'roadmap' | 'proposal', { temperature, customPrompt }: { temperature?: number; customPrompt?: string; }) => {
        if (!graphData || !currentFileId) {
            toast({ variant: "destructive", title: "No hay datos para analizar", description: "Por favor, primero carga un archivo JSON." });
            return;
        }
        if (!apiKey) {
            toast({ variant: "destructive", title: "Falta la Clave de API", description: "Serás redirigido a la página de configuración para agregarla." });
            router.push('/settings');
            return;
        }

        const tokenLimit = parseInt(localStorage.getItem('token_limit') || "0", 10);
        const currentUsage = parseInt(localStorage.getItem('token_usage') || "0", 10);
        if (tokenLimit > 0 && currentUsage >= tokenLimit) {
            toast({ variant: "destructive", title: "Límite de Tokens Excedido", description: "Has alcanzado tu límite de tokens." });
            return;
        }

        let usage: any;
        let resultToSave: Partial<SavedFile> = {};

        try {
            const runGenkit = (window as any).electronAPI?.runGenkit as ((flow: string, input: any) => Promise<any>) | undefined;
            if (!runGenkit) {
                toast({ variant: "destructive", title: "Función no disponible", description: "Los agentes AI sólo están disponibles en la app de escritorio." });
                return;
            }

            switch (type) {
                case 'drivers': {
                    setDriversResult(null);
                    const result = await runGenkit('extractArchitectureDrivers', { graphData, apiKey, modelName, temperature, customPrompt });
                    if (!result || result.success === false) {
                        toast({ variant: "destructive", title: `Falló el Análisis de ${type}`, description: "El agente de IA no pudo completar el análisis." });
                        return;
                    }
                    usage = result.usage;
                    setDriversResult(result.data ?? null);
                    resultToSave.driversResult = result.data ?? null;
                    break;
                }
                case 'constraints': {
                    setConstraintsResult(null);
                    const result = await runGenkit('extractConstraintsAndRisks', { graphData, apiKey, modelName, temperature, customPrompt });
                    if (!result || result.success === false) {
                        toast({ variant: "destructive", title: `Falló el Análisis de ${type}`, description: "El agente de IA no pudo completar el análisis." });
                        return;
                    } usage = result.usage;
                    setConstraintsResult(result.data ?? null);
                    resultToSave.constraintsResult = result.data ?? null;
                    break;
                }
                case 'roadmap': {
                    setRoadmapResult(null);
                    const result = await runGenkit('generateRoadmap', { graphData, apiKey, modelName, proposal: proposalResult, temperature, customPrompt });
                    if (!result || result.success === false) {
                        toast({ variant: "destructive", title: `Falló el Análisis de ${type}`, description: "El agente de IA no pudo completar el análisis." });
                        return;
                    }
                    usage = result.usage;
                    setRoadmapResult(result.data ?? null);
                    resultToSave.roadmapResult = result.data ?? null;
                    break;
                }
                case 'proposal': {
                    const drivers = driversResult;
                    const constraintsRisks = constraintsResult;
                    if (!constraintsRisks) { toast({ variant: "destructive", title: "Falta el Riesgos", description: "Genera los riesgos primero." }); return; }
                    if (!drivers) { toast({ variant: "destructive", title: "Faltan los Drivers", description: "Analiza los drivers primero." }); return; }
                    setProposalResult(null);
                    const result = await runGenkit('extractTechnicalElements', { constraintsRisks, drivers, graphData, apiKey, modelName, temperature, customPrompt });
                    if (!result || result.success === false) {
                        toast({ variant: "destructive", title: `Falló el Análisis de ${type}`, description: "El agente de IA no pudo completar el análisis." });
                        return;
                    }
                    usage = result.usage;
                    setProposalResult(result.data ?? null);
                    resultToSave.proposalResult = result.data ?? null;
                    break;
                }
            }

            if (usage?.totalTokens) updateTokenUsage(usage.totalTokens);

            const updatedFiles = savedFiles.map(file => file.id === currentFileId ? { ...file, ...resultToSave } : file);
            setSavedFiles(updatedFiles);

            const savedKeys = Object.keys(resultToSave).filter(k => (resultToSave as any)[k] != null);
            if (savedKeys.length > 0) {
                //Gemini 2.5 Flash
                const pricePerTokenFlash = 0.8 * 0.0000003 + 0.2 * 0.0000025; // promedio ponderado
                //const pricePerTokenPro =  0.8 * 0.00000250 + 0.2 * 0.00001500; // promedio ponderado

                const price = usage?.totalTokens ? (usage.totalTokens * pricePerTokenFlash).toFixed(6) : "0";
                toast({ title: "Costo total", description: `$${price} USD (${usage?.totalTokens || "0"} tokens)` });
            } else {
                toast({ title: "Análisis completado", description: "El análisis terminó pero no se generaron resultados para guardar." });
            }
        } catch (error: any) {
            console.error(`Error al analizar ${type}:`, error);
            toast({ variant: "destructive", title: `Falló el Análisis de ${type}`, description: error.message || "El agente de IA no pudo completar el análisis." });
        }
    }, [graphData, currentFileId, apiKey, modelName, toast, router, savedFiles, updateTokenUsage, setSavedFiles, driversResult, constraintsResult, proposalResult, setDriversResult, setConstraintsResult, setRoadmapResult, setProposalResult]);

    return {
        handleRunAnalysis,
    };
}
