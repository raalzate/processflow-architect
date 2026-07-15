"use client";

import React, { useCallback } from "react";
import { MermaidEditor } from "@/components/mermaid/MermaidEditor";
import { useViews } from "@/context/ViewsContext";
import type { DesignView } from "@/lib/views-types";
import { DEFAULT_MERMAID_CODE } from "@/lib/mermaid/templates";

/**
 * Renderiza una vista Mermaid (kind === 'mermaid'): editor de código + vista
 * previa en vivo. Los cambios se autoguardan en la vista.
 */
export function MermaidViewRenderer({ view }: { view: DesignView }) {
  const { updateViewMermaid } = useViews();
  const handleChange = useCallback(
    (code: string) => updateViewMermaid(view.id, code),
    [updateViewMermaid, view.id]
  );
  return (
    <div className="absolute inset-0">
      {/* key por vista: re-siembra el editor al cambiar de pestaña. */}
      <MermaidEditor key={view.id} value={view.mermaidCode ?? DEFAULT_MERMAID_CODE} onChange={handleChange} />
    </div>
  );
}
