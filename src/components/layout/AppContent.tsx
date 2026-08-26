"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import { ORG_TODAS } from "@/lib/project-orgs";
import NodeModal from "@/components/modals/NodeModal";
import { Toaster } from "@/components/ui/toaster";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { FileJson, FileUp, Loader2, Plug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseDiagramJson, isJsonFile } from "@/lib/import-diagram";
import { readMcpPrefs } from "@/lib/mcp-settings";
import { describeAppState } from "@/lib/mcp/app-state";
import { resolveAppRead, type AppReadContext } from "@/lib/mcp/app-read";
import { mergeProjectMeta, describeMetaAgregada } from "@/lib/mcp/project-meta";
import { mergeProjectGraph, resolveViewRef } from "@/lib/mcp/project-update";
import { planAppAction, describeAccion } from "@/lib/mcp/app-actions";
import { artifactBodyMarkdown } from "@/lib/artifacts/to-markdown";
import { readStoredArtifacts } from "@/context/AgentContext";
import { readStoredCustomViews } from "@/context/ViewsContext";
import { BUILTIN_VIEWS } from "@/lib/views-types";
import { MAX_CUSTOM_VIEWS } from "@/lib/views-types";
import { cn } from "@/lib/utils";
import { useGraphContext } from "@/context/GraphContext";
import type { GraphData } from "@/lib/types";
import type { NotationId } from "@/lib/notations";
import { useViews } from "@/context/ViewsContext";
import { ComponentDesigner } from "@/components/graph/designer/ComponentDesigner";
import { ViewsTabBar } from "@/components/views/ViewsTabBar";
import { CustomViewRenderer } from "@/components/views/CustomViewRenderer";
import { MermaidViewRenderer } from "@/components/mermaid/MermaidViewRenderer";
import { webgpuAvailable } from "@/lib/ai/litert-engine";
import { CommandPalette } from "@/components/CommandPalette";

// --- 1. Wrapper para el Header ---
// Este componente solo se volverá a renderizar si las props
// de archivos cambian. Los cambios de búsqueda (manejados internamente
// en AppHeader) no afectarán al resto de la app.
const MemoizedAppHeader = React.memo(() => {
  const {
    savedFiles,
    currentFileId,
    handleFileSelect,
    handleCreateProject,
    handleCreateProjectFromContent,
    handleFileDelete,
    handleRenameProject,
    handleDownloadJson,
    handleSearchSelect,
    orgFilter,
    setOrgFilter,
    setFileOrg,
    clearOrgFromProjects,
  } = useGraphContext();

  return (
    <AppHeader
      savedFiles={savedFiles}
      currentFileId={currentFileId}
      orgFilter={orgFilter}
      onOrgFilterChange={setOrgFilter}
      onFileOrgChange={setFileOrg}
      onOrgCleared={clearOrgFromProjects}
      onFileSelect={handleFileSelect}
      onCreateProject={handleCreateProject}
      onImportJson={handleCreateProjectFromContent}
      onFileDelete={handleFileDelete}
      onRenameProject={handleRenameProject}
      onDownloadJson={handleDownloadJson}
      onSearchSelect={handleSearchSelect}
    />
  );
});

// --- Puente MCP ---
// 1) Recibe diagramas exportados por Claude Code vía el servidor MCP embebido:
//    export_to_app → proyecto nuevo; export_as_view → vista (pestaña) del
//    proyecto ACTIVO con su propia notación.
// 2) Re-arranca el servidor al abrir la app si el usuario lo dejó activado.
// 3) Publica el estado del lienzo (proyecto activo, notación, vistas) para que
//    `get_app_state` lo sirva al agente: sin esa ingesta previa, el agente
//    exporta a ciegas y duplica o pisa el trabajo del humano.
const McpImportBridge = () => {
  const {
    handleCreateProjectFromContent,
    handleDesignUpdate,
    handleFileSelect,
    currentFileId,
    graphData,
    savedFiles,
    allNodes,
    orgFilter,
  } = useGraphContext();
  const { createView, views, updateViewGraph, setViewNotation, setActiveView, deleteView, renameView } =
    useViews();
  const { toast } = useToast();

  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.mcpPublishAppState) return;
    electron.mcpPublishAppState(
      describeAppState({
        graph: graphData,
        views,
        savedFiles,
        viewsLimit: MAX_CUSTOM_VIEWS,
        now: new Date().toISOString(),
        // El agente ve lo mismo que el humano tiene filtrado: si el header está en
        // una organización, `get_app_state` no debe ofrecerle proyectos de otra.
        org: orgFilter === ORG_TODAS ? undefined : orgFilter,
      })
    );
  }, [graphData, views, savedFiles, orgFilter]);

  // Lectura bajo demanda (`list_artifacts`, `get_artifact`, `list_views`,
  // `get_view`): el main pregunta y este efecto contesta. El proyecto activo sale
  // de los contextos; los demás, de localStorage — leerlos NO cambia el lienzo.
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.onMcpAppRead) return;

    const proyectos = savedFiles.map((f) => ({ id: f.id, name: f.name }));
    const activo =
      currentFileId && graphData
        ? { id: currentFileId, name: graphData.nombre_proyecto ?? "sin nombre" }
        : null;

    const ctx: AppReadContext = {
      active: activo,
      projects: proyectos,
      viewsOf: (projectId) => {
        // El proyecto activo ya tiene sus vistas resueltas en el contexto (con el
        // grafo vivo del lienzo, que puede diferir de lo persistido).
        if (projectId === currentFileId) {
          return views.map((v) => ({
            name: v.name,
            kind: v.kind,
            notation: v.notation,
            builtin: v.builtin,
            description: v.description,
            graph: v.kind === "design" ? graphData ?? undefined : v.graph,
            mermaidCode: v.mermaidCode,
          }));
        }
        const archivo = savedFiles.find((f) => f.id === projectId);
        const builtin = BUILTIN_VIEWS.map((v) => ({
          name: v.name,
          kind: v.kind,
          notation: archivo?.content?.notation ?? v.notation,
          builtin: true,
          graph: archivo?.content,
        }));
        const custom = readStoredCustomViews(projectId).map((v) => ({
          name: v.name,
          kind: v.kind,
          notation: v.notation,
          description: v.description,
          graph: v.graph,
          mermaidCode: v.mermaidCode,
        }));
        return [...builtin, ...custom];
      },
      artifactsOf: (projectId) =>
        readStoredArtifacts(projectId).map((a) => ({
          title: a.title,
          kind: a.kind,
          render: a.render,
          revision: a.revision,
          createdAt: a.createdAt,
          lineageId: a.lineageId,
          // `allNodes` sólo aplica al proyecto abierto: en otro proyecto las citas
          // de nodos no se resuelven y el cuerpo llega sin ellas (mejor que nada).
          markdown: artifactBodyMarkdown(a, projectId === currentFileId ? allNodes : []),
        })),
    };

    const off = electron.onMcpAppRead(({ id, request }) => {
      try {
        electron.mcpAppReadReply?.(id, resolveAppRead(request, ctx));
      } catch (e: any) {
        electron.mcpAppReadReply?.(id, {
          ok: false,
          error: `La app no pudo leer eso: ${String(e?.message ?? e)}`,
        });
      }
    });
    return off;
  }, [currentFileId, graphData, savedFiles, views, allNodes]);

  // Acciones del agente sobre las pestañas del proyecto (borrar, renombrar). La
  // regla —qué vista toca y cuándo NO se hace nada— es pura y vive en
  // `app-actions.ts`; acá sólo se aplica y se contesta si ocurrió.
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.onMcpAppAction) return;

    const off = electron.onMcpAppAction(({ id, request }) => {
      try {
        if (!currentFileId) {
          electron.mcpAppActionReply?.(id, {
            ok: false,
            error: "No hay un proyecto abierto en la app: abrí uno y volvé a intentar.",
          });
          return;
        }
        const plan = planAppAction(request, views);
        if (!plan.ok) {
          electron.mcpAppActionReply?.(id, { ok: false, error: plan.error });
          return;
        }
        if (request.kind === "delete-view") deleteView(plan.id);
        else renameView(plan.id, request.newName);

        const propias = views.filter((v) => !v.builtin).length;
        const restantes = request.kind === "delete-view" ? propias - 1 : propias;
        electron.mcpAppActionReply?.(id, {
          ok: true,
          message: describeAccion(request, plan.name, restantes, MAX_CUSTOM_VIEWS),
        });
      } catch (e: any) {
        electron.mcpAppActionReply?.(id, {
          ok: false,
          error: `La app no pudo hacer eso: ${String(e?.message ?? e)}`,
        });
      }
    });
    return off;
  }, [currentFileId, views, deleteView, renameView]);

  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.onMcpImportDiagram) return;

    const off = electron.onMcpImportDiagram(({ name, content, view, mermaid, target }) => {
      try {
        if (mermaid) {
          // Vista Mermaid: content es el código. Requiere proyecto activo.
          if (!currentFileId) {
            toast({
              variant: "destructive",
              title: "Sin proyecto activo",
              description: `Abre o crea un proyecto antes de recibir la vista Mermaid "${name}".`,
            });
            return;
          }
          const id = createView({
            name,
            kind: "mermaid",
            mermaidCode: content as string,
            activate: true,
          });
          if (!id) throw new Error("Se alcanzó el límite de vistas del proyecto.");
          toast({
            title: "Diagrama Mermaid recibido por MCP",
            description: `"${name}" se añadió como pestaña del proyecto activo.`,
          });
          return;
        }
        if (view) {
          // Vista del proyecto activo. Sin proyecto abierto no hay dónde
          // colgarla: cae a proyecto nuevo (y se avisa) en vez de perderse.
          if (!currentFileId) {
            handleCreateProjectFromContent(name, content as GraphData);
            toast({
              title: "Vista recibida sin proyecto activo",
              description: `"${name}" se cargó como proyecto nuevo porque no había ninguno abierto.`,
            });
            return;
          }
          // `replace` ⇒ actualizar la pestaña que ya se llama así: entregar dos
          // veces el mismo rediseño dejaba dos pestañas iguales y, cerca del
          // cupo, la segunda ni siquiera entraba. No consume cupo.
          const ref = view.replace ? resolveViewRef(name, views) : null;
          const objetivo =
            ref?.existe ? views.find((v) => !v.builtin && v.name === ref.name) : undefined;
          if (view.replace && !objetivo) {
            toast({
              variant: "destructive",
              title: `No encontré la vista "${name}"`,
              description: "Se renombró o se borró: entregá sin `replace` para crearla.",
            });
            return;
          }
          let id: string | null;
          if (objetivo) {
            // Igual que al actualizar un proyecto: la estructura la trae el
            // diseño nuevo, la geometría de lo que ya estaba la conserva la vista.
            const { graph } = mergeProjectGraph(objetivo.graph ?? (content as GraphData), content as GraphData);
            updateViewGraph(objetivo.id, graph);
            if (view.notation) setViewNotation(objetivo.id, view.notation as NotationId);
            setActiveView(objetivo.id);
            id = objetivo.id;
          } else {
            id = createView({
              name,
              graph: content as GraphData,
              notation: view.notation as NotationId | undefined,
              activate: true,
            });
          }
          if (!id) throw new Error("Se alcanzó el límite de vistas del proyecto.");
          // Una vista no tiene notas, hotspots ni responsables: son del PROYECTO.
          // Sin esto, las ambigüedades que el agente registró se quedaban en su
          // chat y el humano revisaba el diagrama sin saber qué quedó abierto.
          let extra = "";
          if (graphData) {
            const fusion = mergeProjectMeta(graphData, content as GraphData);
            if (fusion.cambio) {
              handleDesignUpdate(currentFileId, fusion.graph);
              extra = ` Se sumaron al proyecto: ${describeMetaAgregada(fusion.agregado)}.`;
            }
          }
          toast({
            title: objetivo ? "Vista actualizada por MCP" : "Vista recibida por MCP",
            description: objetivo
              ? `"${name}" se actualizó conservando la posición de los elementos que ya estaban.${extra}`
              : `"${name}" se añadió como pestaña del proyecto activo.${extra}`,
          });
          return;
        }
        if (target?.project) {
          // Actualizar EN EL SITIO: el proyecto conserva su id, su historial y la
          // posición que el humano les dio a las cajas. Crear otro proyecto en
          // cada entrega es lo que dejaba tres copias y ninguna vigente.
          const destino =
            savedFiles.find((f) => f.content?.nombre_proyecto === target.project) ??
            (graphData?.nombre_proyecto === target.project && currentFileId
              ? savedFiles.find((f) => f.id === currentFileId)
              : undefined);
          if (destino) {
            const base = destino.id === currentFileId ? graphData ?? destino.content : destino.content;
            const { graph, resumen } = mergeProjectGraph(base, content as GraphData);
            handleDesignUpdate(destino.id, graph);
            if (destino.id !== currentFileId) handleFileSelect(destino.id);
            toast({
              title: `Proyecto "${target.project}" actualizado por MCP`,
              description: `${resumen.agregados} nuevos · ${resumen.conservados} conservados · ${resumen.quitados} que ya no están en el diseño.`,
            });
            return;
          }
          // El proyecto se renombró o se borró entre la resolución y la entrega.
          handleCreateProjectFromContent(name, content as GraphData);
          toast({
            variant: "destructive",
            title: `No encontré el proyecto "${target.project}"`,
            description: `"${name}" se cargó como proyecto nuevo para no perder el diseño.`,
          });
          return;
        }
        handleCreateProjectFromContent(name, content as GraphData);
        toast({
          title: "Diagrama recibido por MCP",
          description: `"${name}" llegó desde tu agente (Claude Code) y se cargó en el lienzo.`,
        });
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "No se pudo cargar el diagrama del MCP",
          description: e?.message,
        });
      }
    });

    // Auto-arranque: respeta la preferencia persistida en Ajustes.
    const { enabled, port } = readMcpPrefs(localStorage);
    if (enabled) electron.mcpServerStart?.(port).catch(() => {});

    return off;
  }, [
    handleCreateProjectFromContent,
    handleDesignUpdate,
    handleFileSelect,
    createView,
    views,
    updateViewGraph,
    setViewNotation,
    setActiveView,
    currentFileId,
    graphData,
    savedFiles,
    toast,
  ]);

  return null;
};

// --- Pantalla de bienvenida (sin proyecto activo) ---
// Accionable: acepta arrastrar un .json (GraphData) exportado por el MCP o por
// la propia app, tiene botón de importar y enlaza la guía MCP.
const WelcomeScreen = () => {
  const { handleCreateProjectFromContent } = useGraphContext();
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    try {
      if (!isJsonFile(file)) throw new Error("Arrastra un archivo .json (GraphData).");
      const { name, content } = parseDiagramJson(await file.text(), file.name);
      handleCreateProjectFromContent(name, content);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "No se pudo importar el diagrama",
        description: err?.message || "El archivo no es un JSON válido.",
      });
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-center p-4 transition-colors",
        dragging && "bg-primary/5"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) importFile(file);
      }}
    >
      <FileJson className={cn("w-16 h-16 mb-4 text-primary", dragging && "animate-bounce")} />
      <h2 className="text-2xl font-semibold text-foreground">
        Bienvenido a ProcessFlow Architect
      </h2>
      <p className="mt-2 text-lg max-w-xl">
        Crea un nuevo proyecto desde la barra superior y diséñalo en la pestaña{" "}
        <span className="font-medium text-primary">Modelo</span>, o{" "}
        <span className="font-medium text-foreground">arrastra aquí un .json</span>{" "}
        exportado (p. ej. por Claude Code vía MCP).
      </p>

      <div className="mt-6 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importFile(f);
          }}
        />
        <Button onClick={() => inputRef.current?.click()}>
          <FileUp className="w-4 h-4 mr-2" /> Importar diagrama
        </Button>
        <Button asChild variant="outline">
          <Link href="/mcp">
            <Plug className="w-4 h-4 mr-2" /> Guía MCP
          </Link>
        </Button>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-4 rounded-xl border-2 border-dashed border-primary/60" />
      )}
    </div>
  );
};

// --- 2. Wrapper para el Área del Grafo ---
// Este componente SÍ se volverá a renderizar en las búsquedas,
// porque depende de `filteredNodes`. Esto es correcto y deseado.
const GraphArea = React.memo(() => {
  const { currentFileId, graphData, handleDesignUpdate } = useGraphContext();
  const { activeView } = useViews();

  // Sin proyecto activo: pantalla de bienvenida. Con un proyecto activo
  // (aunque esté vacío) se muestran las pestañas para poder diseñar en "Design".
  if (!currentFileId) {
    return <WelcomeScreen />;
  }

  const kind = activeView?.kind ?? "design";

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Área de la vista activa */}
      <div className="relative flex-1 overflow-hidden">
        {kind === "design" && (
          // overflow-hidden (no -auto): el scroll debe vivir SOLO dentro del canvas
          // (canvasWrapperRef en ComponentDesigner). Si el wrapper externo scrollea,
          // arrastra header/toolbar/zoom fuera de vista.
          <div className="absolute inset-0 overflow-hidden">
            {/* La vista "Modelo" usa la notación del documento (no el "ddd" fijo):
                un proyecto BPMN se dibuja con paleta/simbología BPMN aquí mismo. */}
            <ComponentDesigner
              notation={activeView?.notation}
              onNotationChange={
                currentFileId && graphData
                  ? (n) => handleDesignUpdate(currentFileId, { ...graphData, notation: n })
                  : undefined
              }
            />
          </div>
        )}
        {kind === "graph" && activeView && <CustomViewRenderer view={activeView} />}
        {kind === "mermaid" && activeView && <MermaidViewRenderer view={activeView} />}
      </div>

      {/* Barra de vistas (tabs) abajo */}
      <ViewsTabBar />
    </div>
  );
});

// --- 3. Wrapper para el Modal ---
// Este componente NO se volverá a renderizar durante una búsqueda,
// ya que no consume `filteredNodes`. Solo lo hará si `selectedNode` cambia.
const MemoizedNodeModal = React.memo(() => {
  const {
    selectedNode,
    allNodes,
    allLinks,
    modalHistory,
    graphData,
    setSelectedNode,
    handleNodeUpdate,
    handleNodeSelectFromModal,
    handleModalBack,
  } = useGraphContext();

  return (
    <NodeModal
      node={selectedNode}
      allNodes={allNodes}
      allLinks={allLinks}
      historyCount={modalHistory.length}
      notation={graphData?.notation}
      onClose={() => setSelectedNode(null)}
      onNodeUpdate={handleNodeUpdate}
      onNodeSelect={handleNodeSelectFromModal}
      onBack={handleModalBack}
    />
  );
});


export function AppContent() {
  // La IA local corre en el renderer con LiteRT-LM (WebGPU). El modelo se carga de
  // forma perezosa en el primer uso del chat (no bloqueamos el arranque). Solo
  // verificamos que WebGPU exista; si no, avisamos.
  const [isModelReady, setIsModelReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Iniciando…");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await webgpuAvailable();
      if (!mounted) return;
      if (ok) {
        setIsModelReady(true);
      } else {
        setLoadingStatus(
          "Tu equipo no tiene WebGPU disponible; la IA local (LiteRT-LM) no puede ejecutarse."
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Renderizado Condicional: Pantalla de Carga
  if (!isModelReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-background font-body gap-4">
        <div className="flex items-center gap-2 text-primary">
           {/* Animación de giro */}
           <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm animate-pulse">
            {loadingStatus}
        </p>
      </div>
    );
  }
    
  return (
    // `min-w-0`: sin esto la columna de la app no puede encogerse (es un ítem flex
    // al lado del panel), el header la empuja más ancha que la pantalla y aparece
    // un scroll horizontal de TODA la app. `overflow-x-hidden` es el cinturón:
    // ningún hijo puede volver a arrastrar la pantalla entera.
    <SidebarInset className="min-w-0 overflow-x-hidden">
      <div className="flex h-screen min-w-0 flex-col overflow-x-hidden bg-background font-body">
        <McpImportBridge />
        <CommandPalette />
        <MemoizedAppHeader />

        <main className="flex-grow relative graph-visualization-container">
          <GraphArea />
        </main>

        <MemoizedNodeModal />

        <Toaster />
      </div>
    </SidebarInset>
  );
}
