"use client";

import React, { useState, useRef, useEffect } from "react";
import { useViews } from "@/context/ViewsContext";
import { cn } from "@/lib/utils";
import { MAX_CUSTOM_VIEWS, type DesignView } from "@/lib/views-types";
import { NOTATION_LIST, getNotation, notationBadgeClass } from "@/lib/notations";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  } = useViews();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DesignView | null>(null);
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
    <div className="flex items-center gap-2 border-t bg-card/80 px-2 py-1.5 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {views.map((v) => {
          const active = v.id === activeViewId;
          const editing = editingId === v.id;
          return (
            <div
              key={v.id}
              draggable={!v.builtin && !editing}
              onDragStart={() => !v.builtin && setDragId(v.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropTargetId(null);
              }}
              onDragOver={(e) => {
                if (dragId && !v.builtin && dragId !== v.id) {
                  e.preventDefault();
                  setDropTargetId(v.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && !v.builtin && dragId !== v.id) moveCustomView(dragId, v.id);
                setDragId(null);
                setDropTargetId(null);
              }}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded-lg border py-1 pl-2.5 pr-1 text-xs transition-colors",
                !v.builtin && "cursor-grab active:cursor-grabbing",
                dropTargetId === v.id && "ring-2 ring-primary/50",
                dragId === v.id && "opacity-50",
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
                    className="w-24 rounded bg-background px-1 text-xs outline-none ring-1 ring-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="max-w-[120px] truncate font-medium">{v.name}</span>
                    {/* La badge de notación aplica a toda vista de grafo (DDD/BPMN/C4/UML),
                        incluida la del MODELO del proyecto: es la que fija la paleta de todo
                        y, sin badge, un proyecto C4 parecía no tener su diagrama. Una vista
                        Mermaid es código libre y no tiene notación. */}
                    {v.kind !== "mermaid" && (
                      <span
                        className={cn(
                          "rounded px-1 text-[9px] font-bold uppercase tracking-wide",
                          notationBadgeClass(v.notation)
                        )}
                        title={`Grupo: ${getNotation(v.notation).label}`}
                      >
                        {(v.notation ?? "ddd").toUpperCase()}
                      </span>
                    )}
                  </span>
                )}
              </button>

              {/* Menú de la vista: duplicar (custom + "Modelo"), renombrar/eliminar (sólo custom) */}
              {!editing && (!v.builtin || v.id === "design") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Opciones de la vista"
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
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
            <button
              disabled={!canCreate}
              title={canCreate ? "Nueva vista (elige el grupo)" : `Máximo ${MAX_CUSTOM_VIEWS} vistas`}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva vista
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {NOTATION_LIST.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => createView({ notation: n.id })}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="font-medium">{n.label}</span>
                <span className="text-[10px] text-muted-foreground">{n.description}</span>
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
              <span className="text-[10px] text-muted-foreground">
                Código + vista previa: secuencia, flujo, clases, estados, ER, gantt.
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="shrink-0 border-l pl-2 text-[11px] text-muted-foreground">
        Incluye vistas en el chat con <kbd className="rounded border bg-muted px-1">@</kbd>
      </span>

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
