"use client";

import React from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
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
  Sparkles as SparklesIcon,
  PanelLeftOpen,
} from "lucide-react";
import { useGraphContext } from "@/context/GraphContext";
import { useViews } from "@/context/ViewsContext";
import { useAgent } from "@/context/AgentContext";
import type { Artifact } from "@/lib/agent-types";
import { getNotation, DEFAULT_NOTATION_ID, notationBadgeClass } from "@/lib/notations";
import { collectGraphNodes } from "@/lib/view-nodes";
import { nodeTypeColor } from "@/lib/graph-constants";
import {
  formatNodeTreeToMarkdown,
  formatTaskListToMarkdown,
} from "@/lib/markdown-utils";
import { AiAgentsPanel } from "@/components/ai-panel/AiAgentsPanel"; 
import { ArtifactViewerDialog } from "@/components/ai-panel/ArtifactViewerDialog";
import { iconForArtifact, iconForArtifactKind } from "@/components/ai-panel/artifact-icon";
import { AppCredits } from "@/components/layout/AppCredits";
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
              Menú principal con navegación y paneles de análisis de IA y del
              modelo del proyecto.
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
                  {/* Colapsado, el mismo botón sirve para volver a abrir: dos
                      botones de plegado en la barra eran redundancia. */}
                  {open ? (
                    <PanelLeftClose className="w-5 h-5 z-100" />
                  ) : (
                    <PanelLeftOpen className="w-5 h-5 z-100" />
                  )}
                  <span className="sr-only">{open ? "Ocultar menú" : "Mostrar menú"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side={open ? "left" : "right"} className="z-100">
                <p>{open ? "Ocultar menú" : "Mostrar menú"}</p>
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
  const { views, setActiveView, revealNode } = useViews();

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
            nodeTypeColor(e.node.tipo_elemento)
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
        <Badge variant="outline" className="shrink-0 text-2xs px-1 py-0 max-w-[80px] truncate">
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
                <Sparkles className="w-4 h-4 text-primary" />
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
                <CopyCheck className="w-4 h-4 text-success" />
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
              <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain py-1 pl-4 pr-1 text-xs">
                {taskListNodes.new.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => { revealNode(node.agregado, node.tipo_elemento); handleNodeSelectFromSidebar(node); }}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColor(node.tipo_elemento)
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
              <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain py-1 pl-4 pr-1 text-xs">
                {taskListNodes.modified.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => { revealNode(node.agregado, node.tipo_elemento); handleNodeSelectFromSidebar(node); }}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColor(node.tipo_elemento)
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
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md text-destructive">
              Eliminados ({taskListNodes.deleted.length + viewDeleted.length})
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain py-1 pl-4 pr-1 text-xs">
                {taskListNodes.deleted.map((node) => (
                  <li key={node.id}>
                    <div
                      onClick={() => { revealNode(node.agregado, node.tipo_elemento); handleNodeSelectFromSidebar(node); }}
                      className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          nodeTypeColor(node.tipo_elemento)
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
 * Renderiza el panel del modelo (contenedores y tipos). El título y el rótulo de
 * los grupos vienen de la NOTACIÓN del documento: ante un BPMN dice "Modelo de
 * Procesos" y "Pools", no "Modelo de Dominio" y "Agregados".
 */
function DomainModelPanel() {
  const {
    sidebarNodeTree,
    handleCopy,
    copiedStates,
    graphData,
    handleNodeSelectFromSidebar,
  } = useGraphContext();
  const { revealNode } = useViews();

  if (Object.keys(sidebarNodeTree).length === 0 || !graphData) {
    return null; // No renderizar si el árbol está vacío o no hay datos
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5" /> {getNotation(graphData.notation).modelLabel}
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
            <CopyCheck className="w-4 h-4 text-success" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      
      </SidebarGroupLabel>
      <p className="text-xs italic px-2 mb-2 text-muted-foreground">
         {graphData?.big_picture.descripcion}
      </p>
      <Accordion type="multiple" className="w-full">
        {Object.entries(sidebarNodeTree).map(([agg, grupo]) => (
          <AccordionItem value={agg} key={agg}>
            <AccordionTrigger className="text-sm font-medium px-2 py-1.5 hover:bg-muted rounded-md">
              {grupo.nombre}
            </AccordionTrigger>
            <AccordionContent className="pt-1">
              <p className="text-xs italic px-2 mb-2 text-muted-foreground">
                {grupo.descripcion || "Sin descripción"}
              </p>
              <div className="pl-4 border-l">
                {Object.entries(grupo.tipos).map(([type, nodes]) => (
                  <div key={`${agg}-${type}`} className="mb-1">
                    <h4 className="text-xs px-2 py-1 font-semibold">
                      {type} ({nodes.length})
                    </h4>
                    <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain py-1 pl-4 pr-1 text-xs">
                      {nodes.map((node) => (
                        <li
                          key={node.id}
                          onDoubleClick={() => { revealNode(node.agregado, node.tipo_elemento); handleNodeSelectFromSidebar(node); }}
                          className="flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-muted"
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full",
                              nodeTypeColor(node.tipo_elemento)
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
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto overscroll-contain p-2">
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
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto overscroll-contain p-2">
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
  nuevo: "bg-success",
  modificado: "bg-warning",
  eliminado: "bg-destructive",
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
                      "shrink-0 border-transparent px-1 py-0 text-2xs",
                      notationBadgeClass(v.notation)
                    )}
                  >
                    {notationLabel}
                  </Badge>
                  <span className="shrink-0 text-2xs tabular-nums opacity-70">
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
                  <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain py-1 pl-4 pr-1 text-xs">
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
                              nodeTypeColor(node.tipo_elemento)
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
// --- Riel de artefactos (panel colapsado) ---
// ====================================================================
/**
 * Con el panel colapsado la barra quedaba VACÍA. Ahora lista los ARTEFACTOS
 * generados —uno por linaje, la revisión vigente— como iconos, con el nombre en
 * el tooltip. El clic abre el artefacto ahí mismo: expandir el panel para leerlo
 * era un paso de más.
 *
 * El botón de expandir no se repite acá: ya está en la cabecera del panel.
 */
function SidebarArtifactRail() {
  const { visibleArtifacts } = useAgent();
  const { setOpen } = useSidebar();
  // El artefacto se lee SIN expandir el panel: la modal es la misma que usa
  // `ArtifactsPanel` (componente compartido, una sola implementación).
  const [selected, setSelected] = useState<Artifact | null>(null);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col items-center gap-1 py-1">
        {visibleArtifacts.length === 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={() => setOpen(true)}
              >
                <SparklesIcon className="h-5 w-5" />
                <span className="sr-only">Artefactos</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Sin artefactos todavía — pedíselos al agente
            </TooltipContent>
          </Tooltip>
        ) : (
          visibleArtifacts.map((a) => {
            const Icon = iconForArtifact(a);
            const rev = a.revision && a.revision > 1 ? ` · v${a.revision}` : "";
            return (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(a)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="sr-only">{a.title}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {a.title}
                  {rev}
                </TooltipContent>
              </Tooltip>
            );
          })
        )}
      </div>
      <ArtifactViewerDialog artifact={selected} onClose={() => setSelected(null)} />
    </TooltipProvider>
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
      {/* UN solo scroll: el de `SidebarContent`. Antes había además un ScrollArea
          envolviendo todo, y con el chat (que ya scrollea por dentro) quedaban
          tres contenedores anidados: mover la rueda en cualquier lado corría el
          panel entero y el diseño se descuadraba. Ahora cada lista larga scrollea
          en su propia caja (ver `max-h-64` en las listas de cada sección). */}
      <SidebarContent>
        <TooltipProvider>
          {/* Decide qué conjunto de componentes mostrar */}
          {!open ? (
            // Colapsado: riel de iconos (antes: una barra vacía).
            <SidebarArtifactRail />
          ) : graphData ? (
            <div className="space-y-4 p-1">
              <AiAgentsPanel />
              <DomainModelPanel />
              <DesignViewsPanel />
              <TaskListPanel />
              <TechnologiesPanel />
              <ResponsablesPanel />
            </div>
          ) : (
            <EmptyGraphState />
          )}
        </TooltipProvider>
      </SidebarContent>
      {/* Crédito al pie: sólo con el panel abierto (colapsado no hay ancho para
          el nombre ni los enlaces). */}
      {open && (
        <SidebarFooter className="border-t">
          <AppCredits />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}