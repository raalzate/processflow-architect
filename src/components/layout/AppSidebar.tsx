"use client";

import React from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Copy,
  CopyCheck,
  PanelLeftClose,
  ClipboardList,
  Cpu,
  Workflow,
  Component,
  Layers,
} from "lucide-react";
import { useGraphContext } from "@/context/GraphContext";
import { useViews } from "@/context/ViewsContext";
import { getNotation, DEFAULT_NOTATION_ID, notationBadgeClass } from "@/lib/notations";
import { collectGraphNodes } from "@/lib/view-nodes";
import { nodeTypeColors } from "@/lib/graph-constants";
import {
  formatNodeTreeToMarkdown,
  formatTaskListToMarkdown,
} from "@/lib/markdown-utils";
import { AiAgentsPanel } from "@/components/ai-panel/AiAgentsPanel"; 
import { AiGenerationModal } from "@/components/modals/AiGenerationModal";
import { Sparkles, Loader2 } from "lucide-react";
import { useState } from "react"; 

// ====================================================================
// --- 1. NUEVO COMPONENTE: AppSidebarHeader ---
// ====================================================================
/**
 * Renderiza la cabecera del sidebar, manejando el título
 * y el botón de colapsar (desktop) o el título (móvil).
 */
function AppSidebarHeader() {
  const { isMobile, open, toggleSidebar } = useSidebar();

  return (
    <SidebarHeader>
      <div className="flex items-center justify-between">
        {isMobile ? (
          <div>
            <SheetTitle className="text-lg font-semibold">
              Análisis de Flujo 1
            </SheetTitle>
            <SheetDescription className="sr-only">
              Menú principal con navegación y paneles de análisis de IA y modelo
              de dominio.
            </SheetDescription>
          </div>
        ) : (
          open && (
            <h2 className="text-lg font-semibold ">Análisis de Flujo</h2>
          )
        )}

        {!isMobile && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleSidebar}
                >
                  <PanelLeftClose className="w-5 h-5 z-100" />
                  <span className="sr-only">Ocultar menú</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="z-100">
                <p>Ocultar menú</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </SidebarHeader>
  );
}

// ====================================================================
// --- 3. NUEVO COMPONENTE: TaskListPanel ---
// ====================================================================
/**
 * Renderiza el panel "Lista de Elementos" (Nuevos y Modificados).
 * Obtiene sus propios datos del GraphContext.
 */
// ... inside TaskListPanel

function TaskListPanel() {
  const {
    taskListNodes,
    handleCopy,
    graphData,
    copiedStates,
    handleNodeSelectFromSidebar,
  } = useGraphContext();
  const { views, setActiveView } = useViews();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Elementos diseñados en las VISTAS custom (BPMN/C4/UML): el modelo del
  // proyecto no los contiene, pero también son trabajo por hacer. Cada entrada
  // recuerda su vista de origen para poder saltar a ella al hacer clic.
  const viewEntries = React.useMemo(() => {
    const relevant = (t: string) => t !== "Actor" && t !== "Sistema Externo";
    return views
      .filter((v) => v.kind === "graph" && v.graph)
      .flatMap((v) =>
        collectGraphNodes(v.graph)
          .filter((n) => relevant(n.tipo_elemento))
          .map((node) => ({ node, viewId: v.id, viewName: v.name }))
      );
  }, [views]);
  const viewsByEstado = (estados: string[]) =>
    viewEntries.filter((e) => estados.includes(e.node.estado_comparativo));
  const viewNew = viewsByEstado(["nuevo"]);
  const viewModified = viewsByEstado(["modificado", "existente"]);
  const viewDeleted = viewsByEstado(["eliminado"]);

  const hasNew = taskListNodes.new.length + viewNew.length > 0;
  const hasModified = taskListNodes.modified.length + viewModified.length > 0;
  const hasDeleted = taskListNodes.deleted.length + viewDeleted.length > 0;

  if (!hasNew && !hasModified && !hasDeleted) {
    return null; // No renderizar nada si no hay tareas
  }

  // Modelo + vistas juntos para copiar/generar el markdown.
  const mergedTasks = {
    new: [...taskListNodes.new, ...viewNew.map((e) => e.node)],
    modified: [...taskListNodes.modified, ...viewModified.map((e) => e.node)],
    deleted: [...taskListNodes.deleted, ...viewDeleted.map((e) => e.node)],
  };

  const handleGenerateAi = async () => {
    setIsGenerating(true);
    try {
        const markdown = await formatTaskListToMarkdown(mergedTasks, graphData?.notas, true);
        setAiContent(markdown);
        setIsAiModalOpen(true);
    } catch (error) {
        console.error("Error generating AI tasks:", error);
    } finally {
        setIsGenerating(false);
    }
  };

  // Fila de un elemento que vive en una vista: clic → activa esa vista.
  const ViewNodeRow = ({ e }: { e: (typeof viewEntries)[number] }) => (
    <li key={`${e.viewId}-${e.node.id}`}>
      <div
        onClick={() => setActiveView(e.viewId)}
        className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
        title={`${e.node.nombre} — vista «${e.viewName}»`}
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            nodeTypeColors[e.node.tipo_elemento] || "bg-gray-400"
          )}
        ></span>
        <span
          className={cn(
            "flex-1 truncate block max-w-[180px]",
            e.node.estado_comparativo === "eliminado" && "line-through text-muted-foreground"
          )}
        >
          {e.node.nombre}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 max-w-[80px] truncate">
          {e.viewName}
        </Badge>
      </div>
    </li>
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> Elementos Principales
        </div>
        <div className="flex items-center gap-1">
            <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleGenerateAi}
            disabled={isGenerating}
            title="Generar lista con IA"
            >
            {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Sparkles className="w-4 h-4 text-purple-500" />
            )}
            </Button>
            <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={async () =>
                handleCopy(await formatTaskListToMarkdown(mergedTasks, graphData?.notas, false), "tasklist")
            }
            title="Copiar lista de elementos"
            >
            {copiedStates["tasklist"] ? (
                <CopyCheck className="w-4 h-4 text-green-500" />
            ) : (
                <Copy className="w-4 h-4" />
            )}
            </Button>
        </div>
      </SidebarGroupLabel>
        <p className="text-xs italic px-2 mb-2 text-muted-foreground">
         {graphData?.notas}
      </p>
      <Accordion
        type="multiple"
        className="w-full"
        defaultValue={["nuevos", "modificados", "eliminados"]}
      >
        {/* ... Accordion Items ... */}
        {hasNew && (
          <AccordionItem value="nuevos">
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md">
              Cambios nuevos ({taskListNodes.new.length + viewNew.length})
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <ul className="pl-4 py-1 text-xs space-y-1">
                {taskListNodes.new.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => handleNodeSelectFromSidebar(node)}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColors[node.tipo_elemento] || "bg-gray-400"
                        )}
                      ></span>
                      <span   className="flex-1 truncate block max-w-[250px]" title={node.nombre}>
                        {node.nombre}
                      </span>
                    </div>
                  </li>
                ))}
                {viewNew.map((e) => (
                  <ViewNodeRow key={`${e.viewId}-${e.node.id}`} e={e} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
        {hasModified && (
          <AccordionItem value="modificados">
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md">
              Modificados ({taskListNodes.modified.length + viewModified.length})
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <ul className="pl-4 py-1 text-xs space-y-1">
                {taskListNodes.modified.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => handleNodeSelectFromSidebar(node)}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColors[node.tipo_elemento] || "bg-gray-400"
                        )}
                      ></span>
                      <span   className="flex-1 truncate block max-w-[250px]" title={node.nombre}>
                        {node.nombre}
                      </span>
                    </div>
                  </li>
                ))}
                {viewModified.map((e) => (
                  <ViewNodeRow key={`${e.viewId}-${e.node.id}`} e={e} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
        {hasDeleted && (
          <AccordionItem value="eliminados">
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md text-red-700">
              Eliminados ({taskListNodes.deleted.length + viewDeleted.length})
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <ul className="pl-4 py-1 text-xs space-y-1">
                {taskListNodes.deleted.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => handleNodeSelectFromSidebar(node)}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColors[node.tipo_elemento] || "bg-gray-400"
                        )}
                      ></span>
                      <span
                        className="flex-1 truncate block max-w-[250px] line-through text-muted-foreground"
                        title={node.nombre}
                      >
                        {node.nombre}
                      </span>
                    </div>
                  </li>
                ))}
                {viewDeleted.map((e) => (
                  <ViewNodeRow key={`${e.viewId}-${e.node.id}`} e={e} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
      
      <AiGenerationModal 
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        title="Lista de Tareas Generada con IA"
        content={aiContent}
      />
    </SidebarGroup>
  );
}

// ====================================================================
// --- 4. NUEVO COMPONENTE: DomainModelPanel ---
// ====================================================================
/**
 * Renderiza el panel "Modelo de Dominio" (Agregados y Tipos).
 * Obtiene sus propios datos del GraphContext.
 */
function DomainModelPanel() {
  const {
    sidebarNodeTree,
    handleCopy,
    copiedStates,
    graphData,
    handleNodeSelectFromSidebar,
  } = useGraphContext();

  if (Object.keys(sidebarNodeTree).length === 0 || !graphData) {
    return null; // No renderizar si el árbol está vacío o no hay datos
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5" /> Modelo de Dominio
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            handleCopy(formatNodeTreeToMarkdown(graphData!), "nodetree")
          }
          title="Copiar flujo de elementos"
        >
          {copiedStates["nodetree"] ? (
            <CopyCheck className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      
      </SidebarGroupLabel>
      <p className="text-xs italic px-2 mb-2 text-muted-foreground">
         {graphData?.big_picture.descripcion}
      </p>
      <Accordion type="multiple" className="w-full">
        {Object.entries(sidebarNodeTree).map(([agg, types]) => (
          <AccordionItem value={agg} key={agg}>
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md">
              {agg.split(" - ")[0]} 
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <p className="text-xs italic px-2 mb-2 text-muted-foreground">
                {agg.split(" - ")[1] || "Sin descripción"}
              </p>
              <div className="pl-4 border-l">
                {Object.entries(types).map(([type, nodes]) => (
                  <div key={`${agg}-${type}`} className="mb-1">
                    <h4 className="text-xs px-2 py-1 font-semibold">
                      {type} ({nodes.length})
                    </h4>
                    <ul className="pl-4 py-1 text-xs space-y-1">
                      {nodes.map((node) => (
                        <li
                          key={node.id}
                          onDoubleClick={() => handleNodeSelectFromSidebar(node)}
                          className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full",
                              nodeTypeColors[node.tipo_elemento] || "bg-gray-400"
                            )}
                          ></span>
                          <span>{node.nombre}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </SidebarGroup>
  );
}

// ====================================================================
// --- 5. NUEVO COMPONENTE: TechnologiesPanel ---
// ====================================================================
/**
 * Renderiza el panel "Tecnologías".
 * Obtiene sus propios datos del GraphContext.
 */
function TechnologiesPanel() {
  const { technologies } = useGraphContext();

  if (technologies.length === 0) {
    return null; // No renderizar si no hay tecnologías
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <Cpu className="w-5 h-5" /> Tecnologías
      </SidebarGroupLabel>
      <div className="p-2 flex flex-wrap gap-2">
        {technologies.map((tech) => (
          <Badge key={tech} variant="secondary">
            {tech}
          </Badge>
        ))}
      </div>
    </SidebarGroup>
  );
}

// ====================================================================
// --- 5. NUEVO COMPONENTE: TechnologiesPanel ---
// ====================================================================
/**
 * Renderiza el panel "Responsables".
 * Obtiene sus propios datos del GraphContext.
 */
function ResponsablesPanel() {
  const { graphData } = useGraphContext();

  if (!graphData?.responsables || graphData.responsables.length === 0) {
    return null; // No renderizar si no hay responsables
  }
  const responsables = graphData.responsables;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <Component className="w-5 h-5" /> Responsables
      </SidebarGroupLabel>
      <div className="p-2 flex flex-wrap gap-2">
        {responsables.map((resp) => (
          <Badge key={resp} variant="secondary">
            {resp}
          </Badge>
        ))}
      </div>
    </SidebarGroup>
  );
}

// ====================================================================
// --- 6. NUEVO COMPONENTE: EmptyGraphState ---
// ====================================================================
/**
 * Renderiza el estado vacío cuando no hay datos del grafo.
 */
function EmptyGraphState() {
  return (
    <div className="p-4 text-sm text-muted-foreground">
      Cargue o seleccione un archivo para ver el análisis.
    </div>
  );
}



// ====================================================================
// --- COMPONENTE PRINCIPAL (REFACTORIZADO): AppSidebar ---
// ====================================================================
// --- Panel: Vistas del Diseñador ---
// ====================================================================
/** Punto de color del estado del cambio (nuevo/modificado/eliminado). */
const ESTADO_DOT: Record<string, string> = {
  nuevo: "bg-emerald-500",
  modificado: "bg-amber-500",
  eliminado: "bg-red-500",
};

/**
 * Lista las vistas del proyecto activo (la built-in «Modelo» + las creadas por
 * el usuario o recibidas por MCP). Cada vista es un acordeón: al expandirla se
 * ven SUS elementos (con su estado del cambio); el clic en la vista la activa
 * en el lienzo y el clic en un elemento también salta a su vista.
 */
function DesignViewsPanel() {
  const { views, activeViewId, setActiveView } = useViews();
  const { graphData } = useGraphContext();

  if (views.length <= 1) return null; // solo «Modelo»: la barra inferior basta

  // Elementos por vista: la built-in «Modelo» muestra el modelo del proyecto;
  // las custom, su propio grafo.
  const nodesOf = (v: (typeof views)[number]) =>
    v.kind === "design" ? collectGraphNodes(graphData) : collectGraphNodes(v.graph);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <Layers className="w-5 h-5" /> Vistas
      </SidebarGroupLabel>
      <Accordion type="multiple" className="w-full px-1" defaultValue={[activeViewId]}>
        {views.map((v) => {
          const isActive = v.id === activeViewId;
          const notationLabel = getNotation(v.notation ?? DEFAULT_NOTATION_ID).id.toUpperCase();
          const nodes = nodesOf(v);
          return (
            <AccordionItem value={v.id} key={v.id} className="border-none">
              <AccordionTrigger
                onClick={() => setActiveView(v.id)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm hover:bg-muted hover:no-underline",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                )}
                title={v.description || v.name}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-left">{v.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 border-transparent px-1 py-0 text-[10px]",
                      notationBadgeClass(v.notation)
                    )}
                  >
                    {notationLabel}
                  </Badge>
                  <span className="shrink-0 text-[10px] tabular-nums opacity-70">
                    {nodes.length}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-1">
                {nodes.length === 0 ? (
                  <p className="pl-4 py-1 text-xs italic text-muted-foreground">
                    Sin elementos todavía.
                  </p>
                ) : (
                  <ul className="pl-4 py-1 text-xs space-y-1">
                    {nodes.map((node) => (
                      <li key={`${v.id}-${node.id}`}>
                        <div
                          onClick={() => setActiveView(v.id)}
                          className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                          title={`${node.tipo_elemento} · ${node.nombre}`}
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              nodeTypeColors[node.tipo_elemento] || "bg-gray-400"
                            )}
                          ></span>
                          <span
                            className={cn(
                              "flex-1 truncate block max-w-[220px]",
                              node.estado_comparativo === "eliminado" &&
                                "line-through text-muted-foreground"
                            )}
                          >
                            {node.nombre}
                          </span>
                          {ESTADO_DOT[node.estado_comparativo] && (
                            <span
                              title={node.estado_comparativo}
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                ESTADO_DOT[node.estado_comparativo]
                              )}
                            ></span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </SidebarGroup>
  );
}

// ====================================================================
/**
 * Componente principal del Sidebar.
 * Ahora solo se encarga de organizar los sub-componentes.
 */
export function AppSidebar() {
  const { graphData } = useGraphContext();
  const { open } = useSidebar();

  return (
    <Sidebar>
      <AppSidebarHeader /> 
      <SidebarContent>
        <TooltipProvider>
          <ScrollArea className="h-full">
            {/* Decide qué conjunto de componentes mostrar */}
            {open && graphData ? (
              <div className="p-1 space-y-4">
                <AiAgentsPanel />
                <DomainModelPanel />
                <DesignViewsPanel />
                <TaskListPanel />
                <TechnologiesPanel />
                <ResponsablesPanel />
              </div>
            ) : (
              open && <EmptyGraphState /> 
            )}
          </ScrollArea>
        </TooltipProvider>
      </SidebarContent>
    </Sidebar>
  );
}