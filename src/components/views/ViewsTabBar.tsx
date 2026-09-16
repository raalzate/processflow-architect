"use client";

import React, { useState, useRef, useEffect } from "react";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { useViews } from "@/context/ViewsContext";
import { cn } from "@/lib/utils";
import { MAX_CUSTOM_VIEWS, type DesignView } from "@/lib/views-types";
import { NOTATION_LIST, getNotation, notationBadgeClass } from "@/lib/notations";
import {
  childrenOf,
  originsOf,
  rootAncestorOf,
  rootViewIds,
  type EmbedView,
} from "@/lib/view-embeds";
import { Input } from "@/components/ui/input";
import {
  Image as ImageIcon,
  Projector,
  ChartNetwork,
  Workflow,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  GitGraph,
  Layers,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ViewIcon({ view, className }: { view: DesignView; className?: string }) {
  const map = {
    design: ImageIcon,
    readmodel: Projector,
    dataflow: ChartNetwork,
    graph: Workflow,
    mermaid: GitGraph,
  } as const;
  const Icon = (map as any)[view.kind] ?? Workflow;
  return <Icon className={className} />;
}

/** Badge de notación: misma señal en la pestaña y en la lista de subprocesos. */
function NotationBadge({ view }: { view: DesignView }) {
  if (view.kind === "mermaid") return null;
  return (
    <span
      className={cn(
        "rounded-md px-1 text-2xs font-bold uppercase tracking-wide",
        notationBadgeClass(view.notation)
      )}
      title={`Grupo: ${getNotation(view.notation).label}`}
    >
      {getNotation(view.notation).id.toUpperCase()}
    </span>
  );
}

/**
 * Lista de subprocesos de `parentId`. Un subproceso con subprocesos propios abre
 * un submenú (un nivel por nivel del árbol). `path` es la ruta desde la pestaña
 * raíz; sirve para cortar ciclos al bajar de nivel (`seen`): sin eso, A↔B abriría
 * submenús infinitos. Abrir un subproceso le da su propia pestaña virtual.
 */
function SubViewItems({
  views,
  embedViews,
  path,
  seen,
  onOpen,
  onRename,
  onDelete,
}: {
  views: DesignView[];
  embedViews: EmbedView[];
  path: string[];
  seen: string[];
  onOpen: (id: string) => void;
  onRename: (v: DesignView) => void;
  onDelete: (v: DesignView) => void;
}) {
  const parentId = path[path.length - 1];
  const hijos = childrenOf(embedViews, parentId).filter((id) => !seen.includes(id));
  return (
    <>
      {hijos.map((id) => {
        const v = views.find((x) => x.id === id);
        if (!v) return null;
        const ruta = [...path, id];
        // De qué nodo del padre cuelga: dice POR DÓNDE se entra al subproceso.
        const origen = originsOf(embedViews, id).find((o) => o.parentViewId === parentId);
        const etiqueta = (
          <span className="flex min-w-0 items-center gap-1.5">
            <ViewIcon view={v} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{v.name}</span>
            <NotationBadge view={v} />
            {origen?.nodeName && (
              <span className="truncate text-2xs text-muted-foreground">· {origen.nodeName}</span>
            )}
          </span>
        );
        const nietos = childrenOf(embedViews, id).filter((x) => !ruta.includes(x));
        // Submenú SIEMPRE: un subproceso ya no tiene pestaña, así que renombrarlo
        // o borrarlo sólo es posible desde aquí. Sus propios subprocesos cuelgan
        // al final, un nivel por nivel.
        return (
          <DropdownMenuSub key={id}>
            <DropdownMenuSubTrigger>{etiqueta}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60">
              <DropdownMenuItem onClick={() => onOpen(id)}>
                <Workflow className="mr-2 h-3.5 w-3.5" /> Abrir
              </DropdownMenuItem>
              {!v.builtin && (
                <>
                  <DropdownMenuItem onClick={() => onRename(v)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Renombrar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(v)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                  </DropdownMenuItem>
                </>
              )}
              {nietos.length > 0 && (
                <div className="mt-1 border-t pt-1">
                  <SubViewItems
                    views={views}
                    embedViews={embedViews}
                    path={ruta}
                    seen={[...seen, id]}
                    onOpen={onOpen}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}

export function ViewsTabBar() {
  const {
    views,
    activeViewId,
    setActiveView,
    createView,
    cloneView,
    renameView,
    deleteView,
    moveCustomView,
    canCreate,
    drillStack,
    embedViews,
    openViewIds,
    openViewTab,
    closeViewTab,
  } = useViews();

  // La tira muestra sólo vistas RAÍZ: un subproceso (vista embebida por `viewRef`)
  // no gasta pestaña, se llega a él desde el badge de su padre. Todo se deriva del
  // grafo, sin formato persistido nuevo.
  // La tira: primero las raíces, después los subprocesos abiertos como pestaña
  // virtual (los que el usuario abrió y puede cerrar con la ✕).
  const pestanas = React.useMemo(() => {
    const ids = new Set(rootViewIds(embedViews));
    const raices = views.filter((v) => ids.has(v.id)).map((v) => ({ view: v, virtual: false }));
    const virtuales = openViewIds
      .map((id) => views.find((v) => v.id === id))
      .filter((v): v is DesignView => !!v)
      .map((v) => ({ view: v, virtual: true }));
    return [...raices, ...virtuales];
  }, [views, embedViews, openViewIds]);

  // En drill-down la vista activa ya no está en la tira: se resalta la pestaña por
  // la que se entró. `drillStack[0]` es el camino REAL navegado y manda; el ancestro
  // calculado es sólo el respaldo (vista activada sin pasar por la tira).
  const raizActiva = React.useMemo(() => {
    if (drillStack.length) return drillStack[0];
    if (pestanas.some((p) => p.view.id === activeViewId)) return activeViewId;
    return rootAncestorOf(embedViews, activeViewId) ?? activeViewId;
  }, [drillStack, pestanas, embedViews, activeViewId]);

  // La pestaña activa siempre visible: al cambiar de vista (o al abrir el
  // proyecto) la tira se desplaza sola en vez de dejarla fuera de cuadro.
  const tiraRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const activa = tiraRef.current?.querySelector<HTMLElement>('[data-activa="true"]');
    activa?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeViewId, raizActiva, views.length]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DesignView | null>(null);
  // Renombrar un subproceso no puede usar el input inline: no tiene pestaña donde vivir.
  const [pendingRename, setPendingRename] = useState<DesignView | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const startRename = (v: DesignView) => {
    setEditingId(v.id);
    setDraftName(v.name);
  };
  const commitRename = () => {
    if (editingId) renameView(editingId, draftName);
    setEditingId(null);
  };

  return (
    <div className="relative flex items-center gap-2 border-t bg-card/80 px-2 py-1.5 backdrop-blur">
      {/* Degradados: dicen que la tira sigue, sin mostrar un corte seco. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-card to-transparent" />
      {/* La tira scrollea, pero sin cortar pestañas a la mitad: `snap` alinea la
          pestaña al borde y los degradados laterales avisan que hay más. Antes,
          con muchas vistas, se veía una pestaña partida («…elo») pegada al panel
          y parecía un error de layout. */}
      <div
        ref={tiraRef}
        className="flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pestanas.map(({ view: v, virtual }) => {
          const active = v.id === raizActiva;
          const hijos = childrenOf(embedViews, v.id);
          const editing = editingId === v.id;
          return (
            <div
              key={v.id}
              data-activa={active ? "true" : undefined}
              draggable={!v.builtin && !virtual && !editing}
              onDragStart={() => !v.builtin && !virtual && setDragId(v.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropTargetId(null);
              }}
              onDragOver={(e) => {
                if (dragId && !v.builtin && !virtual && dragId !== v.id) {
                  e.preventDefault();
                  setDropTargetId(v.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && !v.builtin && !virtual && dragId !== v.id) moveCustomView(dragId, v.id);
                setDragId(null);
                setDropTargetId(null);
              }}
              // `snap-start`: la pestaña queda alineada, nunca cortada.
              className={cn(
                "snap-start",
                "group flex shrink-0 items-center gap-1 rounded-lg border py-1 pl-2.5 pr-1 text-xs transition-colors",
                !v.builtin && !virtual && "cursor-grab active:cursor-grabbing",
                dropTargetId === v.id && "ring-2 ring-primary/50",
                dragId === v.id && "opacity-50",
                // La virtual se lee como abierta-temporal: borde punteado, no es raíz.
                virtual && !active && "border-dashed border-border/60",
                virtual && active && "border-dashed",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <button
                className="flex items-center gap-1.5 pr-1"
                onClick={() => setActiveView(v.id)}
                onDoubleClick={() => !v.builtin && startRename(v)}
                title={v.builtin ? v.name : "Doble clic para renombrar"}
              >
                <ViewIcon view={v} className={cn("h-3.5 w-3.5", active && "text-primary")} />
                {editing ? (
                  <input
                    ref={editRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-24 rounded-md bg-background px-1 text-xs outline-none ring-1 ring-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="max-w-[120px] truncate font-medium">{v.name}</span>
                    {/* La badge de notación aplica a toda vista de grafo (DDD/BPMN/C4/UML),
                        incluida la del MODELO del proyecto: es la que fija la paleta de todo
                        y, sin badge, un proyecto C4 parecía no tener su diagrama. Una vista
                        Mermaid es código libre y no tiene notación. */}
                    <NotationBadge view={v} />
                  </span>
                )}
              </button>

              {/* Cerrar la pestaña virtual: la vista NO se borra, sigue embebida en su
                  padre y se vuelve a abrir desde el badge de subprocesos. */}
              {virtual && !editing && (
                <button
                  title={`Cerrar la pestaña de ${v.name}`}
                  aria-label={`Cerrar ${v.name}`}
                  className="rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeViewTab(v.id);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Subprocesos: cuántas vistas embebe esta, y a cuál entrar. */}
              {!editing && hijos.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title={`${hijos.length} subproceso${hijos.length === 1 ? "" : "s"}`}
                      aria-label={`Subprocesos de ${v.name}`}
                      className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-2xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Layers className="h-3 w-3" />
                      {hijos.length}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <SubViewItems
                      views={views}
                      embedViews={embedViews}
                      path={[v.id]}
                      seen={[v.id]}
                      onOpen={openViewTab}
                      onRename={(hijo) => {
                        setRenameDraft(hijo.name);
                        setPendingRename(hijo);
                      }}
                      onDelete={(hijo) => setPendingDelete(hijo)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Menú de la vista: duplicar (custom + "Modelo"), renombrar/eliminar (sólo custom) */}
              {!editing && (!v.builtin || v.id === "design") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Opciones de la vista"
                      className="rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => cloneView(v.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                    </DropdownMenuItem>
                    {!v.builtin && (
                      <>
                        <DropdownMenuItem onClick={() => startRename(v)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Renombrar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setPendingDelete(v)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}

        {/* Crear vista: elige el grupo de componentes (DDD, BPMN, C4, UML) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconAction
              variant="ghost"
              disabled={!canCreate}
              label={canCreate ? accion("agregar", "vista") : `Máximo ${MAX_CUSTOM_VIEWS} vistas`}
              icon={<Plus className="h-3.5 w-3.5" />}
              className="h-7 w-7 shrink-0 rounded-lg border border-dashed text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {NOTATION_LIST.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => createView({ notation: n.id })}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="font-medium">{n.label}</span>
                <span className="text-2xs text-muted-foreground">{n.description}</span>
              </DropdownMenuItem>
            ))}
            {/* Editor Mermaid genérico: código + vista previa (no es lienzo de nodos). */}
            <DropdownMenuItem
              onClick={() => createView({ kind: "mermaid", name: "Diagrama Mermaid" })}
              className="mt-1 flex flex-col items-start gap-0.5 border-t"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <GitGraph className="h-3.5 w-3.5" /> Diagrama Mermaid
              </span>
              <span className="text-2xs text-muted-foreground">
                Código + vista previa: secuencia, flujo, clases, estados, ER, gantt.
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="shrink-0 border-l pl-2 text-2xs text-muted-foreground">
        Incluye vistas en el chat con <kbd className="rounded-md border bg-muted px-1">@</kbd>
      </span>

      {/* Renombrar un subproceso (sin pestaña, sin input inline) */}
      <AlertDialog
        open={!!pendingRename}
        onOpenChange={(o) => {
          if (!o) setPendingRename(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renombrar “{pendingRename?.name}”</AlertDialogTitle>
            <AlertDialogDescription>
              Es un subproceso: se llega a él desde la pestaña que lo embebe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder={pendingRename?.name}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRename && renameDraft.trim()) renameView(pendingRename.id, renameDraft);
                setPendingRename(null);
              }}
            >
              Renombrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la vista “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el grafo de esta vista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteView(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
