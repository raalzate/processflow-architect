"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MermaidDiagram } from "@/components/canvas/MermaidDiagram";
import { ReadOnlyDiagramDashboard } from "@/components/collaboration/ReadOnlyDiagramDashboard";
import { Button } from "@/components/ui/button";
import { computeGraphDiff } from "@/lib/collaboration/graph-diff";
import { scopeOptions } from "@/lib/collaboration/history";
import type { SharedProject } from "@/lib/collaboration/types";
import type { GraphData } from "@/lib/types";
import type { DesignView as CustomView } from "@/lib/views-types";
import { cn } from "@/lib/utils";

function scopeSnapshot(project: SharedProject, scopeId: string): unknown {
  if (scopeId === "design") return project.content;
  if (scopeId === "project") {
    return [project.name, project.references, project.agent, project.analysis];
  }
  return project.customViews.find(v => `view:${v.id}` === scopeId) ?? null;
}

function MermaidReadOnlyPane({
  view,
  sideLabel,
  statusBadge,
}: {
  view: CustomView | undefined;
  sideLabel: string;
  statusBadge?: { text: string; className: string } | null;
}) {
  return (
    <div className="relative flex h-full min-h-[260px] flex-col overflow-hidden rounded-lg border bg-canvas">
      <div className="flex items-center justify-between gap-2 border-b bg-card/90 px-3 py-1.5">
        <span className="text-xs font-semibold text-foreground">{sideLabel}</span>
        {statusBadge ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", statusBadge.className)}>
            {statusBadge.text}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {view ? (
          <MermaidDiagram code={view.mermaidCode ?? ""} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-md border border-dashed bg-card px-4 py-2 text-xs text-muted-foreground">
              Esta vista no existe en {sideLabel.toLowerCase()}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCommonPane({
  project,
  other,
  side,
}: {
  project: SharedProject;
  other: SharedProject;
  side: "before" | "after";
}) {
  const sideLabel = side === "before" ? "Antes" : "Después";
  const otherRefIds = new Set(other.references.map(r => r.id));
  const otherArtIds = new Set(other.agent.artifacts.map(a => a.id));
  const nameChanged = project.name !== other.name;
  const analysisKeys = Object.entries(project.analysis).filter(([, v]) => Boolean(v));

  return (
    <div className="flex h-full min-h-[260px] flex-col overflow-hidden rounded-lg border bg-canvas">
      <div className="flex items-center justify-between border-b bg-card/90 px-3 py-1.5">
        <span className="text-xs font-semibold text-foreground">{sideLabel}</span>
        <span className="text-2xs text-muted-foreground">Datos generales del proyecto</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div className="rounded-md border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              Nombre del proyecto
            </span>
            {nameChanged ? (
              <span className="rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                ~ Modificado
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-semibold text-foreground">{project.name}</p>
        </div>

        <div className="rounded-md border bg-card p-2.5">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Documentos de referencia ({project.references.length})
          </p>
          {project.references.length === 0 ? (
            <p className="mt-1 text-muted-foreground">Sin documentos adjuntos.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {project.references.map(ref => {
                const uniqueHere = !otherRefIds.has(ref.id);
                return (
                  <li key={ref.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{ref.name}</span>
                    {uniqueHere ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold",
                          side === "after"
                            ? "border-success-border bg-success-surface text-success-foreground"
                            : "border-destructive bg-destructive text-destructive-foreground",
                        )}
                      >
                        {side === "after" ? "+ Nuevo" : "− Borrado"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-md border bg-card p-2.5">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Artefactos ({project.agent.artifacts.length}) · Análisis ({analysisKeys.length})
          </p>
          {project.agent.artifacts.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {project.agent.artifacts.map(art => {
                const uniqueHere = !otherArtIds.has(art.id);
                return (
                  <li key={art.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{art.title}</span>
                    {uniqueHere ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold",
                          side === "after"
                            ? "border-success-border bg-success-surface text-success-foreground"
                            : "border-destructive bg-destructive text-destructive-foreground",
                        )}
                      >
                        {side === "after" ? "+ Nuevo" : "− Borrado"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">Sin artefactos registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingViewPane({
  sideLabel,
  kind,
  viewName,
}: {
  sideLabel: string;
  kind: "added" | "removed";
  viewName: string;
}) {
  return (
    <div className="relative flex h-full min-h-[260px] items-center justify-center overflow-hidden rounded-lg border bg-canvas p-4">
      <div className="absolute top-2.5 left-2.5 rounded-md border bg-card/95 px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-xs">
        {sideLabel}
      </div>
      <div className="max-w-xs rounded-lg border border-dashed bg-card/95 px-4 py-3 text-center shadow-xs">
        <span
          className={cn(
            "inline-block rounded-full border px-2.5 py-0.5 text-2xs font-semibold",
            kind === "added"
              ? "border-success-border bg-success-surface text-success-foreground"
              : "border-destructive bg-destructive text-destructive-foreground",
          )}
        >
          {kind === "added" ? "No existía antes" : "− Vista borrada"}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          {kind === "added"
            ? `«${viewName}» se crea como vista nueva en Después.`
            : `«${viewName}» se elimina en Después.`}
        </p>
      </div>
    </div>
  );
}

export function ChangesBeforeAfter({
  before,
  after,
  activeScopes,
}: {
  before: SharedProject;
  after: SharedProject;
  activeScopes?: string[];
}) {
  const allOptions = useMemo(() => {
    const raw = scopeOptions(before, after);
    const filtered = activeScopes?.length ? raw.filter(o => activeScopes.includes(o.id)) : raw;
    const baseList = filtered.length > 0 ? filtered : raw;
    return baseList.map(o => ({
      ...o,
      changed:
        JSON.stringify(scopeSnapshot(before, o.id)) !== JSON.stringify(scopeSnapshot(after, o.id)),
    }));
  }, [before, after, activeScopes]);

  const changedOptions = useMemo(() => allOptions.filter(o => o.changed), [allOptions]);
  const [showAllViews, setShowAllViews] = useState(false);

  const viewsToShow = useMemo(() => {
    if (changedOptions.length === 0) {
      const diagramOnly = allOptions.filter(o => o.id !== "project");
      return diagramOnly.length > 0 ? diagramOnly : allOptions;
    }
    return showAllViews ? allOptions : changedOptions;
  }, [allOptions, changedOptions, showAllViews]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(prev => (prev >= viewsToShow.length ? 0 : prev));
  }, [viewsToShow.length]);

  const safeIndex = viewsToShow.length > 0 ? Math.min(activeIndex, viewsToShow.length - 1) : 0;
  const activeScope = viewsToShow[safeIndex];

  const beforeView = useMemo(
    () =>
      activeScope?.id.startsWith("view:")
        ? before.customViews.find(v => `view:${v.id}` === activeScope.id)
        : undefined,
    [activeScope, before.customViews],
  );
  const afterView = useMemo(
    () =>
      activeScope?.id.startsWith("view:")
        ? after.customViews.find(v => `view:${v.id}` === activeScope.id)
        : undefined,
    [activeScope, after.customViews],
  );

  const beforeGraph: GraphData | undefined =
    activeScope?.id === "design" ? before.content : beforeView?.graph;
  const afterGraph: GraphData | undefined =
    activeScope?.id === "design" ? after.content : afterView?.graph;

  const graphDiff = useMemo(
    () => (beforeGraph || afterGraph ? computeGraphDiff(beforeGraph, afterGraph) : null),
    [beforeGraph, afterGraph],
  );

  if (!activeScope) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">
        No hay diferencias de contenido
      </div>
    );
  }

  const hasMultipleViews = viewsToShow.length > 1;
  const isNewView = Boolean(activeScope.id.startsWith("view:") && !beforeView && afterView);
  const isRemovedView = Boolean(activeScope.id.startsWith("view:") && beforeView && !afterView);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Barra superior: navegación < Título de vista > y leyenda de cambios */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {changedOptions.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {changedOptions.length === 1
                ? "1 vista con cambios"
                : `${changedOptions.length} vistas con cambios`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No hay diferencias de contenido</span>
          )}
          {changedOptions.length > 0 && allOptions.length > changedOptions.length ? (
            <button
              type="button"
              onClick={() => {
                setShowAllViews(prev => !prev);
                setActiveIndex(0);
              }}
              className="rounded border bg-muted/50 px-2 py-0.5 text-2xs font-medium text-foreground hover:bg-muted"
            >
              {showAllViews ? "Ver solo cambios" : `Ver todas (${allOptions.length})`}
            </button>
          ) : null}
        </div>

        {/* Título centrado con flechas izquierda/derecha cuando hay más de una vista */}
        <div className="flex items-center gap-2">
          {hasMultipleViews ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Vista anterior"
              title="Vista anterior"
              onClick={() =>
                setActiveIndex(i => (i - 1 + viewsToShow.length) % viewsToShow.length)
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}

          <div className="flex items-center gap-1.5 px-1">
            <span className="text-sm font-semibold text-foreground" data-active-review-view="">
              {activeScope.name}
            </span>
            {hasMultipleViews ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground">
                {safeIndex + 1} / {viewsToShow.length}
              </span>
            ) : null}
          </div>

          {hasMultipleViews ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Vista siguiente"
              title="Vista siguiente"
              onClick={() => setActiveIndex(i => (i + 1) % viewsToShow.length)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {/* Píldoras que diferencian nuevos, borrados, modificados y movidos */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isNewView ? (
            <span className="rounded-full border border-success-border bg-success-surface px-2 py-0.5 text-2xs font-semibold text-success-foreground">
              + Vista nueva
            </span>
          ) : null}
          {isRemovedView ? (
            <span className="rounded-full border border-destructive bg-destructive px-2 py-0.5 text-2xs font-semibold text-destructive-foreground">
              − Vista borrada
            </span>
          ) : null}
          {graphDiff && graphDiff.counts.added > 0 ? (
            <span className="rounded-full border border-success-border bg-success-surface px-2 py-0.5 text-2xs font-semibold text-success-foreground">
              + {graphDiff.counts.added} {graphDiff.counts.added === 1 ? "nuevo" : "nuevos"}
            </span>
          ) : null}
          {graphDiff && graphDiff.counts.removed > 0 ? (
            <span className="rounded-full border border-destructive bg-destructive px-2 py-0.5 text-2xs font-semibold text-destructive-foreground">
              − {graphDiff.counts.removed} {graphDiff.counts.removed === 1 ? "borrado" : "borrados"}
            </span>
          ) : null}
          {graphDiff && graphDiff.counts.modified > 0 ? (
            <span className="rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
              ~ {graphDiff.counts.modified}{" "}
              {graphDiff.counts.modified === 1 ? "modificado" : "modificados"}
            </span>
          ) : null}
          {graphDiff && graphDiff.counts.moved > 0 ? (
            <span className="rounded-full border border-info-border bg-info-surface px-2 py-0.5 text-2xs font-semibold text-info-foreground">
              ⇄ {graphDiff.counts.moved} {graphDiff.counts.moved === 1 ? "movido" : "movidos"}
            </span>
          ) : null}
          {!activeScope.changed ? (
            <span className="rounded-full border bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              Sin cambios en esta vista
            </span>
          ) : null}
        </div>
      </div>

      {/* Dos paneles de solo lectura lado a lado: Antes y Después ocupando todo el alto */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-2">
        {activeScope.id === "project" ? (
          <>
            <ProjectCommonPane project={before} other={after} side="before" />
            <ProjectCommonPane project={after} other={before} side="after" />
          </>
        ) : beforeView?.kind === "mermaid" || afterView?.kind === "mermaid" ? (
          <>
            <MermaidReadOnlyPane
              view={beforeView}
              sideLabel="Antes"
              statusBadge={
                isRemovedView
                  ? {
                      text: "− Borrada",
                      className: "border-destructive bg-destructive text-destructive-foreground",
                    }
                  : beforeView && afterView && beforeView.mermaidCode !== afterView.mermaidCode
                    ? {
                        text: "~ Modificada",
                        className:
                          "border-warning-border bg-warning-surface text-warning-foreground",
                      }
                    : null
              }
            />
            <MermaidReadOnlyPane
              view={afterView}
              sideLabel="Después"
              statusBadge={
                isNewView
                  ? {
                      text: "+ Nueva",
                      className: "border-success-border bg-success-surface text-success-foreground",
                    }
                  : beforeView && afterView && beforeView.mermaidCode !== afterView.mermaidCode
                    ? {
                        text: "~ Modificada",
                        className:
                          "border-warning-border bg-warning-surface text-warning-foreground",
                      }
                    : null
              }
            />
          </>
        ) : (
          <>
            {beforeGraph ? (
              <ReadOnlyDiagramDashboard
                graph={beforeGraph}
                sideLabel="Antes"
                label={`Antes: ${activeScope.name}`}
                nodeDiffs={graphDiff?.beforeNodes}
                linkDiffs={graphDiff?.beforeLinks}
              />
            ) : (
              <MissingViewPane sideLabel="Antes" kind="added" viewName={activeScope.name} />
            )}

            {afterGraph ? (
              <ReadOnlyDiagramDashboard
                graph={afterGraph}
                sideLabel="Después"
                label={`Después: ${activeScope.name}`}
                nodeDiffs={graphDiff?.afterNodes}
                linkDiffs={graphDiff?.afterLinks}
              />
            ) : (
              <MissingViewPane sideLabel="Después" kind="removed" viewName={activeScope.name} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
