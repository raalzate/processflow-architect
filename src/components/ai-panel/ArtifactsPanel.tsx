"use client";

import React, { useState } from "react";
import { useAgent } from "@/context/AgentContext";
import { useGraphContext } from "@/context/GraphContext";
import { getDefinition } from "@/lib/artifacts/registry";
import { artifactBodyMarkdown } from "@/lib/artifacts/to-markdown";
import { Markdown } from "./Markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, FileText, Workflow, Trash2 } from "lucide-react";
import type { Artifact } from "@/lib/agent-types";

/**
 * Lista de artefactos generados por la IA, DEBAJO del chat del agente.
 * Al hacer clic en uno se abre una modal con su contenido.
 */
export function ArtifactsPanel() {
  const { versionArtifacts, deleteArtifact } = useAgent();
  const { allNodes } = useGraphContext();
  const [selected, setSelected] = useState<Artifact | null>(null);

  if (!versionArtifacts.length) {
    return (
      <div className="border-t px-2 py-3 text-[11px] text-muted-foreground">
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
        <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
          {versionArtifacts.length}
        </span>
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
        {versionArtifacts.map((a) => {
          const def = getDefinition(a.kind, a.render === "mermaid" ? "diagram" : "document");
          const Icon = a.render === "mermaid" ? Workflow : FileText;
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
                    <span className="block truncate text-xs font-medium">{a.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{def.label}</span>
                  </span>
                </button>
                <button
                  onClick={() => deleteArtifact(a.id)}
                  title="Eliminar artefacto"
                  className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Modal con el contenido del artefacto */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0 gap-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {selected?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto p-4">
            {selected && <Markdown content={artifactBodyMarkdown(selected, allNodes)} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
