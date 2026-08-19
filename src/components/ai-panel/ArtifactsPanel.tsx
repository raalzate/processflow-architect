"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAgent } from "@/context/AgentContext";
import { useGraphContext } from "@/context/GraphContext";
import { getDefinition } from "@/lib/artifacts/registry";
import { artifactBodyMarkdown } from "@/lib/artifacts/to-markdown";
import { Markdown } from "./Markdown";
import { ArtifactViewerDialog, revisionLabel } from "./ArtifactViewerDialog";
import { iconForArtifact } from "./artifact-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, FileText, Workflow, Trash2, History, RotateCcw } from "lucide-react";
import type { Artifact } from "@/lib/agent-types";

/**
 * Lista de artefactos generados por la IA, DEBAJO del chat del agente.
 * Muestra UNA entrada por linaje —la revisión vigente— con su badge `vN`; el
 * histórico se abre aparte y es append-only (specs/004-artefactos-versionados).
 * Al hacer clic en uno se abre una modal con su contenido.
 */
export function ArtifactsPanel() {
  const {
    artifacts,
    visibleArtifacts,
    deleteArtifact,
    historyOf,
    restoreArtifactRevision,
    purgeArtifact,
  } = useAgent();
  const { allNodes } = useGraphContext();
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [purging, setPurging] = useState<Artifact | null>(null);

  // La paleta de acciones (⌘K) también abre artefactos: es la vía para llegar a
  // ellos con el panel colapsado. Busca en TODOS —incluidas las revisiones
  // viejas— porque desde la paleta se elige uno por su nombre.
  useEffect(() => {
    const abrir = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const encontrado = artifacts.find((a) => a.id === id);
      if (encontrado) setSelected(encontrado);
    };
    window.addEventListener("open-artifact", abrir);
    return () => window.removeEventListener("open-artifact", abrir);
  }, [artifacts]);

  const history = useMemo(
    () => (historyFor ? historyOf(historyFor) : []),
    [historyFor, historyOf]
  );

  if (!visibleArtifacts.length && !selected) {
    return (
      <div className="border-t px-2 py-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground/70">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Artefactos
        </span>
        <p className="mt-1">Pídele al agente drivers, riesgos, propuesta, roadmap, ADRs o diagramas. Aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="border-t">
      <div className="flex items-center gap-1.5 px-2 pt-2 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Artefactos
        <span className="rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
          {visibleArtifacts.length}
        </span>
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
        {visibleArtifacts.map((a) => {
          const def = getDefinition(a.kind, a.render === "mermaid" ? "diagram" : "document");
          // Icono del propio tipo (drivers ≠ riesgos ≠ roadmap), no el genérico.
          const Icon = iconForArtifact(a);
          const rev = revisionLabel(a);
          return (
            <li key={a.id}>
              <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setSelected(a)}
                  title="Ver contenido"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.title}</span>
                      {rev && (
                        <span className="shrink-0 rounded bg-primary/15 px-1 text-2xs font-semibold text-primary">
                          {rev}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-2xs text-muted-foreground">{def.label}</span>
                  </span>
                </button>
                {rev && (
                  <button
                    onClick={() => setHistoryFor(a.id)}
                    title="Ver histórico de versiones"
                    className="shrink-0 rounded-md p-1 text-muted-foreground/50 opacity-0 transition hover:text-primary group-hover:opacity-100"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteArtifact(a.id)}
                  title="Quitar del panel (el histórico se conserva)"
                  className="shrink-0 rounded-md p-1 text-muted-foreground/50 opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Modal con el contenido del artefacto */}
      <ArtifactViewerDialog artifact={selected} onClose={() => setSelected(null)} />

      {/* Histórico del linaje: append-only. Restaurar crea una revisión nueva. */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" /> Histórico de versiones
            </DialogTitle>
          </DialogHeader>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain">
            {[...history].reverse().map((rev, i) => (
              <li key={rev.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="w-8 shrink-0 text-xs font-semibold text-primary">v{rev.revision ?? 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{rev.title}</span>
                  <span className="block text-2xs text-muted-foreground">
                    {new Date(rev.createdAt).toLocaleString()}
                    {rev.restoredFrom ? " · restaurada" : ""}
                    {i === 0 ? " · vigente" : ""}
                  </span>
                </span>
                <button
                  onClick={() => setSelected(rev)}
                  className="shrink-0 rounded-md px-2 py-1 text-2xs hover:bg-muted"
                  title="Ver esta versión"
                >
                  Ver
                </button>
                {i > 0 && (
                  <button
                    onClick={() => {
                      restoreArtifactRevision(rev.id);
                      setHistoryFor(null);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-2xs text-primary hover:bg-muted"
                    title="Restaurar: crea una versión nueva con este contenido"
                  >
                    <RotateCcw className="h-3 w-3" /> Restaurar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
            <span className="text-2xs text-muted-foreground">
              El histórico no se sobrescribe: restaurar crea una versión nueva.
            </span>
            <button
              onClick={() => {
                const vigente = history[history.length - 1];
                if (vigente) setPurging(vigente);
                setHistoryFor(null);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-2xs text-destructive hover:bg-destructive/10"
            >
              Eliminar definitivamente
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Borrado definitivo: lo único que destruye el histórico. */}
      <Dialog open={!!purging} onOpenChange={(o) => !o && setPurging(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Eliminar definitivamente</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Se borran <strong>todas</strong> las versiones de «{purging?.title}». Esto no se puede
            deshacer. Si sólo querés sacarlo del panel, usá el ícono de basura de la lista: el
            histórico se conserva.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setPurging(null)}
              className="rounded-md px-3 py-1.5 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (purging) purgeArtifact(purging.id);
                setPurging(null);
              }}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar todo
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
