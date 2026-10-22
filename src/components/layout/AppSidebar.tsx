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
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { cn } from "@/lib/utils";
import {
  Copy,
  CopyCheck,
  Bot,
  ClipboardList,
  Cpu,
  Workflow,
  Component,
  Layers,
  Maximize2,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { useGraphContext } from "@/context/GraphContext";
import { useViews } from "@/context/ViewsContext";
import { useAgent } from "@/context/AgentContext";
import type { Artifact } from "@/lib/agent-types";
import { getNotation, DEFAULT_NOTATION_ID, notationBadgeClass } from "@/lib/notations";
import { collectGraphNodes } from "@/lib/view-nodes";
import type { EntradaDeElemento } from "@/lib/element-browser";
import type { GraphNode } from "@/lib/types";
import { ElementsBrowserDialog } from "@/components/layout/ElementsBrowserDialog";
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
                  {/* Un solo icono en los dos estados: lo que el botón abre es el
                      agente, y eso no cambia según esté plegado o no. Un icono de
                      «panel» decía dónde está, no qué hay adentro (#254). */}
                  <Bot className="w-5 h-5 z-100" />
                  <span className="sr-only">
                    {open ? "Ocultar el agente de IA" : "Mostrar el agente de IA"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side={open ? "left" : "right"} className="z-100">
                <p>{open ? "Ocultar el agente de IA" : "Mostrar el agente de IA"}</p>
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
  const [listaAbierta, setListaAbierta] = useState<string | null>(null);

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

  // Cada lista abre la modal de consulta: el sidebar no daba ni para el nombre
  // entero y para ver qué ERA un elemento había que saltar al lienzo.
  const modelo = views.find((v) => v.kind === "design");
  const entradasDe = (
    modeloNodes: GraphNode[],
    deVistas: typeof viewEntries
  ): EntradaDeElemento[] => [
    ...modeloNodes.map((node) => ({
      node,
      viewId: modelo?.id ?? "",
      viewName: modelo?.name ?? "Modelo",
      grafo: graphData ?? undefined,
    })),
    ...deVistas.map((e) => ({
      ...e,
      grafo: views.find((v) => v.id === e.viewId)?.graph ?? undefined,
    })),
  ];
  const listas = [
    { id: "nuevos", titulo: "Cambios nuevos", entradas: entradasDe(taskListNodes.new, viewNew), clase: "" },
    { id: "modificados", titulo: "Modificados", entradas: entradasDe(taskListNodes.modified, viewModified), clase: "" },
    {
      id: "eliminados",
      titulo: "Eliminados",
      entradas: entradasDe(taskListNodes.deleted, viewDeleted),
      clase: "text-destructive",
    },
  ].filter((l) => l.entradas.length > 0);
  const abierta = listas.find((l) => l.id === listaAbierta);

  const irAlLienzo = (e: EntradaDeElemento) => {
    setListaAbierta(null);
    if (e.viewId === modelo?.id) {
      revealNode(e.node.agregado, e.node.tipo_elemento);
      handleNodeSelectFromSidebar(e.node);
    } else setActiveView(e.viewId);
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> Elementos Principales
        </div>
        <div className="flex items-center gap-1">
            <IconAction
              variant="ghost"
              className="h-7 w-7"
              onClick={handleGenerateAi}
              disabled={isGenerating}
              label={accion("sugerir", "la lista")}
              icon={
                isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )
              }
            />
            <IconAction
              variant="ghost"
              className="h-7 w-7"
              onClick={async () =>
                handleCopy(await formatTaskListToMarkdown(mergedTasks, graphData?.notas, false), "tasklist")
              }
              label={accion("copiar", "la lista de elementos")}
              icon={
                copiedStates["tasklist"] ? (
                  <CopyCheck className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )
              }
            />
        </div>
      </SidebarGroupLabel>
        <p className="text-xs italic px-2 mb-2 text-muted-foreground">
         {graphData?.notas}
      </p>
      <ul className="space-y-0.5 px-1">
        {listas.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => setListaAbierta(l.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted",
                l.clase
              )}
              title={`Ver ${l.titulo.toLowerCase()}`}
            >
              <span className="flex-1">{l.titulo}</span>
              <span className="text-2xs tabular-nums opacity-70">{l.entradas.length}</span>
              <Maximize2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          </li>
        ))}
      </ul>
      <ElementsBrowserDialog
        open={!!abierta}
        onOpenChange={(o) => !o && setListaAbierta(null)}
        titulo={abierta?.titulo ?? ""}
        subtitulo={abierta ? `${abierta.entradas.length} elementos del modelo y de las vistas` : undefined}
        entradas={abierta?.entradas ?? []}
        mostrarVista
        onIrAlLienzo={irAlLienzo}
      />
      
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
        <IconAction
          variant="ghost"
          className="h-7 w-7"
          onClick={() => handleCopy(formatNodeTreeToMarkdown(graphData!), "nodetree")}
          label={accion("copiar", "el flujo de elementos")}
          icon={
            copiedStates["nodetree"] ? (
              <CopyCheck className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )
          }
        />
      
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
/**
 * Lista las vistas del proyecto activo (la built-in «Modelo» + las creadas por
 * el usuario o recibidas por MCP). El clic en la vista la activa en el lienzo;
 * sus elementos se consultan en una modal (buscable, con la ficha de cada uno)
 * en vez de desplegarse en el sidebar, donde los nombres no cabían.
 */
function DesignViewsPanel() {
  const { views, activeViewId, setActiveView } = useViews();
  const { graphData } = useGraphContext();
  const [vistaAbierta, setVistaAbierta] = useState<string | null>(null);

  if (views.length <= 1) return null; // solo «Modelo»: la barra inferior basta

  // Elementos por vista: la built-in «Modelo» muestra el modelo del proyecto;
  // las custom, su propio grafo.
  const nodesOf = (v: (typeof views)[number]) =>
    v.kind === "design" ? collectGraphNodes(graphData) : collectGraphNodes(v.graph);
  const abierta = views.find((v) => v.id === vistaAbierta);
  const entradasAbiertas: EntradaDeElemento[] = abierta
    ? nodesOf(abierta).map((node) => ({
        node,
        viewId: abierta.id,
        viewName: abierta.name,
        grafo: (abierta.kind === "design" ? graphData : abierta.graph) ?? undefined,
      }))
    : [];

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <Layers className="w-5 h-5" /> Vistas
      </SidebarGroupLabel>
      <ul className="space-y-0.5 px-1">
        {views.map((v) => {
          const isActive = v.id === activeViewId;
          const notationLabel = getNotation(v.notation ?? DEFAULT_NOTATION_ID).id.toUpperCase();
          const nodes = nodesOf(v);
          return (
            <li key={v.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveView(v.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                )}
                title={v.description || v.name}
              >
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 border-transparent px-1 py-0 text-2xs", notationBadgeClass(v.notation))}
                >
                  {notationLabel}
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => setVistaAbierta(v.id)}
                disabled={nodes.length === 0}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1.5 text-2xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                title={nodes.length ? `Ver los ${nodes.length} elementos de «${v.name}»` : "Sin elementos todavía"}
                aria-label={`Ver elementos de ${v.name}`}
              >
                {nodes.length}
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <ElementsBrowserDialog
        open={!!abierta}
        onOpenChange={(o) => !o && setVistaAbierta(null)}
        titulo={abierta ? `Elementos de «${abierta.name}»` : ""}
        entradas={entradasAbiertas}
        onIrAlLienzo={(e) => {
          setVistaAbierta(null);
          setActiveView(e.viewId);
        }}
      />
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