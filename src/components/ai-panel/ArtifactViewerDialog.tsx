"use client";

import React from "react";
import { useGraphContext } from "@/context/GraphContext";
import { artifactBodyMarkdown } from "@/lib/artifacts/to-markdown";
import { Markdown } from "./Markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { iconForArtifact } from "./artifact-icon";
import type { Artifact } from "@/lib/agent-types";

/** Sufijo de revisión: la v1 no lo lleva (ruido para el caso normal). */
export function revisionLabel(a: Artifact): string {
  return a.revision && a.revision > 1 ? `v${a.revision}` : "";
}

/**
 * Visor de UN artefacto. Vive aparte de `ArtifactsPanel` porque también lo usa
 * el riel del sidebar colapsado: desde ahí se abre el artefacto SIN expandir el
 * panel, y duplicar la modal era pedirle que se desincronice.
 */
export function ArtifactViewerDialog({
  artifact,
  onClose,
}: {
  artifact: Artifact | null;
  onClose: () => void;
}) {
  const { allNodes } = useGraphContext();
  const Icon = artifact ? iconForArtifact(artifact) : null;
  return (
    <Dialog open={!!artifact} onOpenChange={(o) => !o && onClose()}>
      {/* `flex flex-col` + `min-h-0` en el cuerpo: el DialogContent es un grid,
          así que sin esto el hijo con `overflow-auto` no recibe altura acotada,
          se recorta y el artefacto largo no se puede scrollear. */}
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="h-4 w-4 text-primary" />} {artifact?.title}
            {artifact && revisionLabel(artifact) && (
              <span className="rounded bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                {revisionLabel(artifact)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {artifact && <Markdown content={artifactBodyMarkdown(artifact, allNodes)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
