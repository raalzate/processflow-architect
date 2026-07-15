"use client";

import React, { useCallback } from "react";
import { ComponentDesigner } from "@/components/graph/designer/ComponentDesigner";
import { useViews } from "@/context/ViewsContext";
import type { DesignView } from "@/lib/views-types";
import type { GraphData } from "@/lib/types";
import type { NotationId } from "@/lib/notations";

/**
 * Renderiza una vista custom como un GRAFO DISEÑABLE DDD (mismo lienzo que Design),
 * enlazado al grafo propio de la vista. Los cambios se autoguardan en la vista.
 */
export function CustomViewRenderer({ view }: { view: DesignView }) {
  const { updateViewGraph, setViewNotation } = useViews();

  const handleChange = useCallback(
    (g: GraphData) => updateViewGraph(view.id, g),
    [updateViewGraph, view.id]
  );
  const handleNotation = useCallback(
    (n: NotationId) => setViewNotation(view.id, n),
    [setViewNotation, view.id]
  );

  return (
    <div className="absolute inset-0">
      <ComponentDesigner
        value={view.graph}
        onChange={handleChange}
        sourceId={view.id}
        notation={view.notation}
        onNotationChange={handleNotation}
      />
    </div>
  );
}
