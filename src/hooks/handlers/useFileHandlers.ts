import { useCallback } from "react";
import type { SavedFile, GraphData, ArchitectureDriversOutput, ConstraintsRisksOutput, RoadmapOutput, TechnicalElementsOutput } from "@/lib/types";
import { emptyGraphData } from "@/components/graph/designer/serialize";
import type { NotationId } from "@/lib/notations";

type FileHandlersDeps = {
    savedFiles: SavedFile[];
    setSavedFiles: (files: SavedFile[]) => void;
    currentFileId: string | null;
    setCurrentFileId: (id: string | null) => void;
    addFile: (file: SavedFile) => void;
    deleteFileHook: (id: string) => void;
    loadFile: (file: SavedFile) => any;
    graphData: GraphData | null; // graphData can be null initially
    toast: (opts: any) => void;
    setDriversResult: (r: ArchitectureDriversOutput | null) => void;
    setConstraintsResult: (r: ConstraintsRisksOutput | null) => void;
    setRoadmapResult: (r: RoadmapOutput | null) => void;
    setProposalResult: (r: TechnicalElementsOutput | null) => void;
};

export function useFileHandlers(deps: FileHandlersDeps) {
    const {
        savedFiles,
        setSavedFiles,
        currentFileId,
        setCurrentFileId,
        addFile,
        deleteFileHook,
        loadFile,
        graphData,
        toast,
        setDriversResult,
        setConstraintsResult,
        setRoadmapResult,
        setProposalResult,
    } = deps;

    // Crea un proyecto nuevo y vacío (reemplaza la importación de JSON).
    // El diseñador gráfico genera el contenido a partir de aquí.
    // La notación se elige AL CREAR el proyecto y viaja en el documento: así el
    // lienzo abre con la paleta correcta en vez de arrancar siempre en DDD.
    const handleCreateProject = useCallback((nombre: string, notation?: NotationId) => {
        const name = (nombre || "").trim() || "Proyecto sin nombre";
        try {
            const fecha = new Date().toISOString().slice(0, 10);
            const content = emptyGraphData(name, fecha, notation);
            const newFile: SavedFile = { id: `${name}-${new Date().getTime()}`, name: `${name}.json`, content };
            const res = loadFile(newFile);
            addFile(newFile);
            setDriversResult(null); setConstraintsResult(null); setRoadmapResult(null); setProposalResult(null);
            toast({ title: "Proyecto creado", description: `"${name}" está listo. Diséñalo en la pestaña Design.` });
        } catch (error: any) {
            console.error("Error creating project:", error);
            toast({ variant: "destructive", title: "No se pudo crear el proyecto", description: error.message || "Error inesperado." });
        }
    }, [addFile, loadFile, toast, setDriversResult, setConstraintsResult, setRoadmapResult, setProposalResult]);

    // Crea un proyecto NUEVO a partir de contenido ya generado (ej. el modelo de
    // dominio que produce la IA desde documentos) y lo carga en el lienzo.
    const handleCreateProjectFromContent = useCallback((nombre: string, content: GraphData) => {
        const name = (nombre || "").trim() || "Diseño IA";
        // El modelo de la IA (DomainAnalysis) no trae los campos escalares de proyecto;
        // los rellenamos con defaults para obtener un GraphData válido y renderizable.
        const raw: any = content || {};
        const fullContent: GraphData = {
            nombre_proyecto: raw.nombre_proyecto || name,
            version: raw.version || "1.0.0",
            // Preserva la notación del modelo importado para que la vista "Modelo"
            // del proyecto use la paleta correcta (BPMN/C4/UML) y no caiga a DDD.
            notation: raw.notation,
            fecha_analisis: raw.fecha_analisis || new Date().toISOString().slice(0, 10),
            big_picture: {
                descripcion: raw.big_picture?.descripcion || "",
                hotspots: raw.big_picture?.hotspots || [],
                nodos: raw.big_picture?.nodos || [],
                aristas: raw.big_picture?.aristas || [],
            } as any,
            agregados: raw.agregados || [],
            read_models: raw.read_models || [],
            politicas_inter_agregados: raw.politicas_inter_agregados || [],
            responsables: raw.responsables || [],
            notas: raw.notas || "",
            transcript: raw.transcript || "",
        };
        const newFile: SavedFile = { id: `${name}-${new Date().getTime()}`, name: `${name}.json`, content: fullContent };
        try {
            const res = loadFile(newFile);
            addFile(newFile);
            setCurrentFileId(newFile.id);
            setDriversResult(null); setConstraintsResult(null); setRoadmapResult(null); setProposalResult(null);
            toast({ title: "Modelo generado", description: `"${name}" se creó desde tus documentos y se cargó en el lienzo.` });
            return newFile.id;
        } catch (error: any) {
            console.error("Error creating project from content:", error);
            toast({ variant: "destructive", title: "No se pudo cargar el modelo generado", description: error.message || "Formato inválido." });
            return null;
        }
    }, [addFile, loadFile, setCurrentFileId, toast, setDriversResult, setConstraintsResult, setRoadmapResult, setProposalResult]);

    // Persiste el GraphData generado por el diseñador en el SavedFile actual
    // y refresca las vistas derivadas (Big Picture, Read Model, Data Flow).
    const handleDesignUpdate = useCallback((fileId: string, content: GraphData) => {
        const updated = savedFiles.map((f) => (f.id === fileId ? { ...f, content } : f));
        setSavedFiles(updated);
        const target = updated.find((f) => f.id === fileId);
        if (target) {
            try {
                const res = loadFile(target);
            } catch (e) {
                console.error("Error refreshing views from design:", e);
            }
        }
    }, [savedFiles, setSavedFiles, loadFile]);

    const handleFileSelect = useCallback((id: string) => {
        const file = savedFiles.find(f => f.id === id);
        if (!file) return;
        try {
            const res = loadFile(file);
            setCurrentFileId(id);
            // restore persisted results if any
            const saved = file as any;
            const contentSaved = saved?.content ?? {};
            setDriversResult(saved.driversResult ?? contentSaved.driversResult ?? null);
            setConstraintsResult(saved.constraintsResult ?? contentSaved.constraintsResult ?? null);
            setRoadmapResult(saved.roadmapResult ?? contentSaved.roadmapResult ?? null);
            setProposalResult(saved.proposalResult ?? contentSaved.proposalResult ?? null);
        } catch (error) {
            console.error("Error loading selected file:", error);
            toast({ variant: "destructive", title: "Error al Cargar Archivo", description: "El archivo guardado parece estar corrupto o tener un formato inválido." });
        }
    }, [savedFiles, loadFile, setCurrentFileId, toast, setDriversResult, setConstraintsResult, setRoadmapResult, setProposalResult]);

    const handleFileDelete = useCallback((id: string) => {
        const fileToDel = savedFiles.find(f => f.id === id);
        if (!fileToDel) return;
        deleteFileHook(id);
        if (currentFileId === id) {
            setCurrentFileId(null);
            setDriversResult(null); setConstraintsResult(null); setRoadmapResult(null); setProposalResult(null);
        }
        toast({ title: "Archivo eliminado", description: `"${fileToDel.name}" ha sido eliminado.` });
    }, [savedFiles, currentFileId, deleteFileHook, setCurrentFileId, toast, setDriversResult, setConstraintsResult, setRoadmapResult, setProposalResult]);

    const handleDownloadJson = useCallback(() => {
        if (!graphData || !currentFileId) { toast({ variant: "destructive", title: "No hay archivo para descargar", description: "Carga o selecciona un archivo primero." }); return; }
        const currentFile = savedFiles.find(f => f.id === currentFileId); if (!currentFile) return;
        const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = currentFile.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        toast({ title: "Descarga Iniciada", description: `Se está descargando "${currentFile.name}".` });
    }, [graphData, currentFileId, savedFiles, toast]);

    return {
        handleCreateProject,
        handleCreateProjectFromContent,
        handleDesignUpdate,
        handleFileSelect,
        handleFileDelete,
        handleDownloadJson,
    };
}
