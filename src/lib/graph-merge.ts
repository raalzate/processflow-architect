/**
 * @fileOverview Fusión/edición de nodos de un GraphData (Agrupador de Nodos).
 *
 * Lógica PURA extraída de `app/merger` para poder testearla. Refleja la
 * realidad actual del modelo: los nodos viven en `agregados[].nodos` Y en
 * `big_picture.nodos` (el diseñador y el MCP dejan ahí los nodos sueltos), y
 * las aristas en TRES listas: `agregados[].aristas`, `big_picture.aristas` y
 * `politicas_inter_agregados`. El merger anterior ignoraba el big_picture y
 * dejaba nodos invisibles y aristas colgantes.
 *
 * Caso de uso típico: un modelo importado (generado por IA local o por Claude
 * Code vía MCP) trae el mismo concepto con nombres distintos ("Cliente",
 * "Usuario Cliente"); aquí se fusionan en uno conservando descripciones,
 * tags y re-apuntando aristas.
 */

import type { GraphData, GraphNode, GraphLink } from "./types";

type Edge = Omit<GraphLink, "source" | "target" | "tipo">;

/** Etiqueta del grupo para nodos sueltos (sin agregado) en la UI del merger. */
export const BIG_PICTURE_GROUP = "Big Picture";

// =============================================================================
// Aristas (antes en app/merger/components/helpers.ts)
// =============================================================================

/** Re-apunta al nodo principal las aristas que tocaban nodos fusionados. Muta. */
export const updateEdgesForMerge = (
  edges: Edge[] | undefined,
  primaryId: string,
  secondaryIds: Set<string>
) => {
  if (!edges) return;
  edges.forEach((edge) => {
    if (secondaryIds.has(edge.fuente)) edge.fuente = primaryId;
    if (secondaryIds.has(edge.destino)) edge.destino = primaryId;
  });
};

/** Quita self-loops y duplicados (misma fuente+destino+descripción). */
export const cleanupDuplicateEdges = (edges: Edge[] | undefined): Edge[] => {
  if (!edges) return [];
  const uniqueEdges = new Map<string, Edge>();
  edges.forEach((edge) => {
    if (edge.fuente === edge.destino) return;
    const key = `${edge.fuente}-${edge.destino}-${edge.descripcion || ""}`;
    if (!uniqueEdges.has(key)) uniqueEdges.set(key, edge);
  });
  return Array.from(uniqueEdges.values());
};

// =============================================================================
// Recolección
// =============================================================================

/**
 * Todos los nodos del grafo (agregados + big_picture) con su `agregado`
 * resuelto para agrupar en la UI. Los sueltos van al grupo "Big Picture".
 */
export function collectMergeNodes(graph: GraphData): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  (graph.agregados || []).forEach((agg) => {
    (agg.nodos || []).forEach((n) => {
      map.set(n.id, { ...(n as GraphNode), agregado: agg.nombre_agregado });
    });
  });
  (graph.big_picture?.nodos || []).forEach((n) => {
    if (!map.has(n.id)) {
      map.set(n.id, { ...(n as GraphNode), agregado: BIG_PICTURE_GROUP });
    }
  });
  return map;
}

// =============================================================================
// Mutaciones (devuelven un GraphData NUEVO)
// =============================================================================

/** Aplica `fn` a cada lista de aristas del grafo (agregados, big_picture, políticas). */
function forEachEdgeList(graph: GraphData, fn: (edges: Edge[]) => Edge[]) {
  (graph.agregados || []).forEach((agg) => {
    agg.aristas = fn(agg.aristas || []);
  });
  if (graph.big_picture) {
    graph.big_picture.aristas = fn(graph.big_picture.aristas || []);
  }
  graph.politicas_inter_agregados = fn(graph.politicas_inter_agregados || []);
}

/** Busca un nodo por id en agregados o big_picture (referencia viva del clon). */
function findNodeAnywhere(graph: GraphData, id: string): GraphNode | null {
  for (const agg of graph.agregados || []) {
    const n = (agg.nodos || []).find((x) => x.id === id);
    if (n) return n as GraphNode;
  }
  const n = (graph.big_picture?.nodos || []).find((x) => x.id === id);
  return (n as GraphNode) || null;
}

/**
 * Fusiona `secondaryIds` en `primaryId`:
 *  - combina descripciones únicas (separador `\n---\n`) y une tags_tecnologia,
 *  - re-apunta aristas de las TRES listas y limpia duplicados/self-loops,
 *  - elimina los nodos fusionados de agregados y big_picture.
 * @throws si el nodo principal no existe.
 */
export function mergeNodesInGraph(
  graph: GraphData,
  primaryId: string,
  secondaryIds: string[],
  newName?: string
): GraphData {
  const next: GraphData = structuredClone(graph);
  const secondarySet = new Set(secondaryIds);
  secondarySet.delete(primaryId);

  const primary = findNodeAnywhere(next, primaryId);
  if (!primary) throw new Error("No se encontró el nodo principal para la fusión.");

  // Recolecta los secundarios (para heredar descripciones/tags antes de borrarlos).
  const secondaries: GraphNode[] = [];
  secondarySet.forEach((id) => {
    const n = findNodeAnywhere(next, id);
    if (n) secondaries.push(n);
  });

  if (newName && newName.trim()) primary.nombre = newName.trim();

  // Descripciones únicas.
  const descriptions = new Set<string>();
  const addDescs = (d?: string) =>
    (d || "").split("\n---\n").forEach((x) => x.trim() && descriptions.add(x.trim()));
  addDescs(primary.descripcion);
  secondaries.forEach((s) => addDescs(s.descripcion));
  primary.descripcion = Array.from(descriptions).join("\n---\n");

  // Unión de tags de tecnología.
  const tags = new Set<string>(primary.tags_tecnologia || []);
  secondaries.forEach((s) => (s.tags_tecnologia || []).forEach((t) => tags.add(t)));
  primary.tags_tecnologia = tags.size ? Array.from(tags).sort() : primary.tags_tecnologia ?? null;

  // Aristas: re-apuntar y deduplicar en TODAS las listas.
  forEachEdgeList(next, (edges) => {
    updateEdgesForMerge(edges, primaryId, secondarySet);
    return cleanupDuplicateEdges(edges);
  });

  // Eliminar los nodos fusionados de ambos lugares.
  (next.agregados || []).forEach((agg) => {
    agg.nodos = (agg.nodos || []).filter((n) => !secondarySet.has(n.id));
  });
  if (next.big_picture) {
    next.big_picture.nodos = (next.big_picture.nodos || []).filter(
      (n) => !secondarySet.has(n.id)
    );
  }

  return next;
}

/** Elimina un nodo (de agregados o big_picture) y toda arista que lo toque. */
export function deleteNodeFromGraph(graph: GraphData, nodeId: string): GraphData {
  const next: GraphData = structuredClone(graph);
  (next.agregados || []).forEach((agg) => {
    agg.nodos = (agg.nodos || []).filter((n) => n.id !== nodeId);
  });
  if (next.big_picture) {
    next.big_picture.nodos = (next.big_picture.nodos || []).filter((n) => n.id !== nodeId);
  }
  forEachEdgeList(next, (edges) =>
    edges.filter((e) => e.fuente !== nodeId && e.destino !== nodeId)
  );
  return next;
}

/**
 * Actualiza campos de un nodo esté donde esté.
 * @returns el grafo nuevo, o `null` si el nodo no existe.
 */
export function updateNodeInGraph(
  graph: GraphData,
  nodeId: string,
  patch: Partial<GraphNode>
): GraphData | null {
  const next: GraphData = structuredClone(graph);
  const node = findNodeAnywhere(next, nodeId);
  if (!node) return null;
  Object.assign(node, patch);
  return next;
}

// =============================================================================
// Multi-grafo: el proyecto real tiene el grafo del "Modelo" (SavedFile.content)
// MÁS hasta 50 vistas custom, cada una con su propio GraphData. El merger debe
// verlas y depurarlas todas.
// =============================================================================

/** Un grafo con identidad para la UI (Modelo o una vista custom). */
export interface NamedGraph {
  /** Clave estable ("design" o el id de la vista). */
  key: string;
  /** Nombre visible ("Modelo", "Vista Pagos", …). */
  label: string;
  graph: GraphData;
}

/**
 * Nodos de VARIOS grafos, con `agregado` prefijado con el nombre del grafo para
 * distinguir de dónde viene cada nodo en la UI. Ante ids repetidos gana la
 * primera aparición (el orden de `graphs` define prioridad: Modelo primero).
 */
export function collectMergeNodesMulti(graphs: NamedGraph[]): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  for (const g of graphs) {
    for (const [id, node] of collectMergeNodes(g.graph)) {
      if (!map.has(id)) {
        map.set(id, { ...node, agregado: `${g.label} · ${node.agregado}` });
      }
    }
  }
  return map;
}

/**
 * Fusiona a través de todos los grafos:
 *  - en los grafos donde EXISTE el principal: fusión completa (hereda
 *    descripciones/tags de los duplicados presentes ahí),
 *  - en los demás: los duplicados simplemente se eliminan (con sus aristas),
 *    porque re-apuntar a un nodo que no existe en ese grafo dejaría aristas rotas.
 * @throws si el principal no existe en NINGÚN grafo.
 */
export function mergeNodesAcrossGraphs(
  graphs: NamedGraph[],
  primaryId: string,
  secondaryIds: string[],
  newName?: string
): NamedGraph[] {
  const anyHasPrimary = graphs.some((g) => collectMergeNodes(g.graph).has(primaryId));
  if (!anyHasPrimary) throw new Error("No se encontró el nodo principal para la fusión.");

  return graphs.map((g) => {
    const ids = collectMergeNodes(g.graph);
    if (ids.has(primaryId)) {
      return { ...g, graph: mergeNodesInGraph(g.graph, primaryId, secondaryIds, newName) };
    }
    let graph = g.graph;
    for (const id of secondaryIds) {
      if (ids.has(id)) graph = deleteNodeFromGraph(graph, id);
    }
    return graph === g.graph ? g : { ...g, graph };
  });
}

/** Elimina un nodo en TODOS los grafos donde aparezca. */
export function deleteNodeAcrossGraphs(graphs: NamedGraph[], nodeId: string): NamedGraph[] {
  return graphs.map((g) =>
    collectMergeNodes(g.graph).has(nodeId)
      ? { ...g, graph: deleteNodeFromGraph(g.graph, nodeId) }
      : g
  );
}

/**
 * Actualiza un nodo en TODOS los grafos donde aparezca.
 * @returns los grafos nuevos, o `null` si el nodo no existe en ninguno.
 */
export function updateNodeAcrossGraphs(
  graphs: NamedGraph[],
  nodeId: string,
  patch: Partial<GraphNode>
): NamedGraph[] | null {
  let found = false;
  const next = graphs.map((g) => {
    const updated = updateNodeInGraph(g.graph, nodeId, patch);
    if (!updated) return g;
    found = true;
    return { ...g, graph: updated };
  });
  return found ? next : null;
}
