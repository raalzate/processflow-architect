"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MergeTypeSection from "./components/MergeTypeSection";
import DeleteConfirmationDialog from "./components/DeleteConfirmationDialog";
import EditNodeDialog from "./components/EditNodeDialog";
import {
  collectMergeNodesMulti,
  mergeNodesAcrossGraphs,
  deleteNodeAcrossGraphs,
  updateNodeAcrossGraphs,
  type NamedGraph,
} from "@/lib/graph-merge";
import { STORAGE_SAVED_FILES, STORAGE_LAST_FILE_ID } from "@/lib/graph-constants";
import type { SavedFile, GraphData, GraphNode } from "@/lib/types";
import type { DesignView } from "@/lib/views-types";

interface MergeSelection {
  primary: string | null;
  secondary: Set<string>;
}
type AllMergeSelections = Record<string, MergeSelection>;

/** Vistas custom persistidas por ViewsContext (localStorage `views_<fileId>`). */
interface PersistedViews {
  customViews: DesignView[];
  activeViewId: string;
  injectedViewIds: string[];
}

export default function MergerPage() {
  const [currentFile, setCurrentFile] = useState<SavedFile | null>(null);
  // Grafos del proyecto: el Modelo (SavedFile.content) + cada vista custom.
  const [namedGraphs, setNamedGraphs] = useState<NamedGraph[]>([]);
  const { toast } = useToast();

  const [selections, setSelections] = useState<AllMergeSelections>({});
  // Tipos libres: el grafo puede traer tipos de cualquier notación (DDD/BPMN/C4/UML).
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedAgregado, setSelectedAgregado] = useState<string>("all");

  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; name: string } | null>(null);

  const [editModalState, setEditModalState] = useState<{ node: any | null; isReadOnly: boolean }>({ node: null, isReadOnly: false });

  useEffect(() => {
    try {
      const lastFileId = localStorage.getItem(STORAGE_LAST_FILE_ID);
      if (lastFileId) {
        const storedFiles = localStorage.getItem(STORAGE_SAVED_FILES);
        if (storedFiles) {
          const files: SavedFile[] = JSON.parse(storedFiles);
          const file = files.find((f) => f.id === lastFileId);
          if (file) {
            setCurrentFile(file);
            // Además del Modelo, cargar las vistas custom del proyecto: ahí
            // también viven diagramas (el diseñador guarda cada vista aparte).
            const graphs: NamedGraph[] = [
              { key: "design", label: "Modelo", graph: file.content },
            ];
            try {
              const rawViews = localStorage.getItem(`views_${file.id}`);
              if (rawViews) {
                const views = JSON.parse(rawViews) as PersistedViews;
                for (const v of views.customViews || []) {
                  if (v.graph) graphs.push({ key: v.id, label: v.name, graph: v.graph });
                }
              }
            } catch {
              /* vistas corruptas: seguimos sólo con el Modelo */
            }
            setNamedGraphs(graphs);
          } else
            toast({
              variant: "destructive",
              title: "No se encontró el último archivo abierto.",
            });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Ningún archivo seleccionado",
          description: "Por favor, carga y selecciona un archivo en la página del analizador primero.",
        });
      }
    } catch (error) {
      console.error("Error loading data from localStorage:", error);
      toast({ variant: "destructive", title: "Error al cargar datos locales" });
    }
  }, [toast]);

  // Nodos del Modelo + todas las vistas (los sueltos del diseñador/MCP van al big_picture).
  const allNodesMap = useMemo(() => {
    if (!namedGraphs.length) return new Map<string, GraphNode>();
    return collectMergeNodesMulti(namedGraphs);
  }, [namedGraphs]);

  const nodeTypes = useMemo<string[]>(() => {
    return Array.from(new Set(Array.from(allNodesMap.values()).map((n) => n.tipo_elemento as string))).sort();
  }, [allNodesMap]);

  /**
   * Persiste los grafos actualizados: el "design" vuelve a SavedFile.content
   * (saved_json_files) y las vistas custom a views_<fileId>. Devuelve el
   * SavedFile actualizado para refrescar el estado local.
   */
  const persistGraphs = (graphs: NamedGraph[]): SavedFile => {
    if (!currentFile) throw new Error("No hay proyecto activo.");
    const design = graphs.find((g) => g.key === "design");
    if (!design) throw new Error("Falta el grafo del Modelo.");

    const storedFiles = localStorage.getItem(STORAGE_SAVED_FILES);
    if (!storedFiles) throw new Error("No se encontraron archivos guardados.");
    const files: SavedFile[] = JSON.parse(storedFiles);
    const updatedFile: SavedFile = { ...currentFile, content: design.graph };
    localStorage.setItem(
      STORAGE_SAVED_FILES,
      JSON.stringify(files.map((f) => (f.id === currentFile.id ? updatedFile : f)))
    );

    // Vistas: sólo si el proyecto tiene persistencia de vistas.
    const viewsKey = `views_${currentFile.id}`;
    const rawViews = localStorage.getItem(viewsKey);
    if (rawViews) {
      try {
        const views = JSON.parse(rawViews) as PersistedViews;
        const byKey = new Map(graphs.map((g) => [g.key, g.graph]));
        views.customViews = (views.customViews || []).map((v) =>
          byKey.has(v.id) ? { ...v, graph: byKey.get(v.id)! } : v
        );
        localStorage.setItem(viewsKey, JSON.stringify(views));
      } catch {
        /* si las vistas no parsean, no bloqueamos el guardado del Modelo */
      }
    }
    return updatedFile;
  };

  useEffect(() => {
    if (nodeTypes.length > 0) {
      const initialSelections: AllMergeSelections = {};
      nodeTypes.forEach((type) => {
        initialSelections[type] = { primary: null, secondary: new Set() };
      });
      setSelections(initialSelections);
    }
  }, [nodeTypes]);

  useEffect(() => {
    if (nodeTypes.length > 0) {
      if (!selectedType || !nodeTypes.includes(selectedType)) {
        setSelectedType(nodeTypes[0]);
      }
    }
  }, [nodeTypes, selectedType]);

  useEffect(() => {
    if (selectedType) setSelectedAgregado("all");
  }, [selectedType]);

  const handlePrimarySelect = (type: string, nodeId: string) => {
    const newPrimary = nodeId || null;
    if (newPrimary) {
      const selectedNode = allNodesMap.get(newPrimary);
      if (selectedNode && selectedNode.agregado) setSelectedAgregado(selectedNode.agregado);
      else setSelectedAgregado("all");
    } else setSelectedAgregado("all");

    setSelections((prev) => {
      const current = prev[type] || { primary: null, secondary: new Set() };
      const newSecondary = new Set(current.secondary);
      if (newPrimary) newSecondary.delete(newPrimary);
      return { ...prev, [type]: { primary: newPrimary, secondary: newSecondary } };
    });
  };

  const handleSecondaryToggle = (type: string, nodeId: string) => {
    setSelections((prev) => {
      const current = prev[type] || { primary: null, secondary: new Set() };
      if (current.primary === nodeId) return prev;
      const newSecondary = new Set(current.secondary);
      if (newSecondary.has(nodeId)) newSecondary.delete(nodeId);
      else newSecondary.add(nodeId);
      return { ...prev, [type]: { ...current, secondary: newSecondary } };
    });
  };

  const handleMerge = (type: string, newName: string) => {
    if (!currentFile) return;
    const typeSelection = selections[type];
    if (!typeSelection) return;
    const primaryNodeId = typeSelection.primary;
    const secondaryNodeIds = Array.from(typeSelection.secondary);
    if (!primaryNodeId || secondaryNodeIds.length === 0) {
      toast({ variant: "destructive", title: "Selección inválida", description: "Debes seleccionar un nodo 'Principal' y al menos uno 'A Fusionar'." });
      return;
    }
    try {
      // Fusión pura a través del Modelo y TODAS las vistas: ver src/lib/graph-merge.ts.
      const updatedGraphs = mergeNodesAcrossGraphs(
        namedGraphs,
        primaryNodeId,
        secondaryNodeIds,
        newName
      );
      persistGraphs(updatedGraphs);
      toast({ title: "Fusión completada", description: `${secondaryNodeIds.length} nodo(s) se han fusionado. Serás redirigido.` });
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (error) {
      console.error("Error al guardar la fusión:", error);
      toast({ variant: "destructive", title: "Error al guardar", description: "No se pudo guardar el archivo fusionado." });
    }
  };

  const handleRequestDelete = (nodeId: string, nodeName: string) => setNodeToDelete({ id: nodeId, name: nodeName });

  const handleConfirmDelete = () => {
    if (!nodeToDelete || !currentFile) return;
    const { id: nodeId, name: nodeName } = nodeToDelete;
    try {
      // Borrado puro en el Modelo y todas las vistas donde aparezca.
      const updatedGraphs = deleteNodeAcrossGraphs(namedGraphs, nodeId);
      const updatedFile = persistGraphs(updatedGraphs);
      setCurrentFile(updatedFile);
      setNamedGraphs(updatedGraphs);
      setSelections((prev) => {
        const newSelections = structuredClone(prev);
        Object.keys(newSelections).forEach((type) => {
          if (newSelections[type].primary === nodeId) newSelections[type].primary = null;
          newSelections[type].secondary.delete(nodeId);
        });
        return newSelections;
      });
      setNodeToDelete(null);
      toast({ title: "Nodo eliminado", description: `El nodo "${nodeName}" ha sido eliminado permanentemente.` });
    } catch (error) {
      console.error("Error al eliminar el nodo:", error);
      toast({ variant: "destructive", title: "Error al eliminar", description: "No se pudo guardar el archivo actualizado." });
    }
  };

  const handleRequestEdit = (node: any) => setEditModalState({ node, isReadOnly: false });
  const handleRequestView = (node: any) => setEditModalState({ node, isReadOnly: true });

  const handleConfirmEdit = (nodeId: string, updatedData: Partial<GraphNode>) => {
    if (!currentFile) return;
    // Edición pura: encuentra el nodo en el Modelo o en cualquier vista.
    const updatedGraphs = updateNodeAcrossGraphs(namedGraphs, nodeId, updatedData);
    if (!updatedGraphs) {
      toast({ variant: "destructive", title: "Error al editar", description: "No se pudo encontrar el nodo para actualizar." });
      return;
    }
    try {
      const updatedFile = persistGraphs(updatedGraphs);
      setCurrentFile(updatedFile);
      setNamedGraphs(updatedGraphs);
      setEditModalState({ node: null, isReadOnly: false });
      toast({ title: "Nodo actualizado", description: `El nodo "${updatedData.nombre}" ha sido guardado.` });
    } catch (error) {
      console.error("Error al guardar edición del nodo:", error);
      toast({ variant: "destructive", title: "Error al guardar", description: "No se pudo guardar el archivo actualizado." });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50">
      <header className="bg-card border-b shadow-sm w-full p-4 z-10 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground font-headline">Agrupador de Nodos</h1>
            <p className="text-sm text-muted-foreground">
              Depura duplicados del proyecto activo: fusiona nodos que representan lo mismo con nombres distintos.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Analizador
            </a>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-y-auto p-8">
        {!currentFile ? (
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle>No hay ningún archivo cargado</CardTitle>
              <CardDescription>Carga un archivo JSON en la página del analizador para usar esta herramienta.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href="/">Ir al Analizador</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6 flex flex-col flex-1 w-full min-h-0">
            <Card className="bg-blue-50 border-blue-200 flex-shrink-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-blue-900"><Info /> ¿Cómo funciona la fusión?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-800 space-y-2">
                <p>
                  Los modelos generados desde documentos (por la IA local o importados desde Claude Code
                  vía MCP) suelen traer el mismo concepto con nombres distintos — p. ej. “Cliente”,
                  “Usuario Cliente”. Aquí los unificas sin perder información.
                </p>
                <p>
                  Primero, selecciona el tipo de nodo que deseas agrupar (de cualquier notación: DDD, BPMN,
                  C4, UML). Luego, elige el <b>Nodo Principal</b> — el que permanece; puedes renombrarlo.
                  Finalmente, marca los <b>Nodos a Fusionar</b>: sus descripciones y tecnologías se combinan
                  en el principal, sus conexiones se re-apuntan (incluidas las del Big Picture y las
                  políticas entre agregados) y luego se eliminan.
                </p>
                <p className="font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Esta acción modifica el proyecto guardado y no tiene deshacer. Si quieres respaldo,
                  descarga antes el JSON con el botón de descarga del Analizador.
                </p>
              </CardContent>
            </Card>

            {allNodesMap.size === 0 && (
              <Card className="max-w-xl mx-auto">
                <CardHeader>
                  <CardTitle>El proyecto no tiene nodos todavía</CardTitle>
                  <CardDescription>
                    Se revisó el Modelo y las {Math.max(namedGraphs.length - 1, 0)} vista(s) del proyecto
                    «{currentFile.content?.nombre_proyecto || currentFile.name}» y no se encontraron nodos.
                    Dibuja elementos en la pestaña Modelo (o en una vista) del Analizador, o importa un
                    diagrama JSON, y vuelve aquí.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <a href="/">Ir al Analizador</a>
                  </Button>
                </CardContent>
              </Card>
            )}

            {nodeTypes.map((type) => (
              <MergeTypeSection
                key={type}
                type={type}
                allNodesMap={allNodesMap as any}
                selections={selections}
                nodeTypes={nodeTypes}
                selectedType={selectedType}
                setSelectedType={(t: string) => setSelectedType(t as any)}
                selectedAgregado={selectedAgregado}
                setSelectedAgregado={setSelectedAgregado}
                handlePrimarySelect={handlePrimarySelect}
                handleSecondaryToggle={handleSecondaryToggle}
                onConfirmMerge={handleMerge}
                onRequestDelete={handleRequestDelete}
                onRequestPrimaryEdit={handleRequestEdit}
                onRequestView={handleRequestView}
              />
            ))}
          </div>
        )}
      </main>
      <Toaster />

      <DeleteConfirmationDialog isOpen={!!nodeToDelete} onOpenChange={(open) => { if (!open) setNodeToDelete(null); }} nodeName={nodeToDelete?.name || null} onConfirmDelete={handleConfirmDelete} />

      <EditNodeDialog isOpen={!!editModalState.node} onOpenChange={(open) => { if (!open) setEditModalState({ node: null, isReadOnly: false }); }} node={editModalState.node} isReadOnly={editModalState.isReadOnly} onConfirmEdit={handleConfirmEdit} />
    </div>
  );
}