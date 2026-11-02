import type { GraphData, GraphNode, GraphLink, Agregado, BigPicture } from "../types";
import type { SharedProject } from "./types";

interface NodeRecord {
  id: string;
  parent: string | null;
  value: GraphNode;
}
interface GraphRecord {
  meta: Omit<GraphData, "agregados" | "big_picture" | "politicas_inter_agregados">;
  bigMeta: Omit<BigPicture, "nodos" | "aristas">;
  containers: Omit<Agregado, "nodos" | "aristas">[];
  nodes: NodeRecord[];
  edges: (GraphLink & { id: string })[];
}

/** Normalize graph membership separately from component fields and edge identity. */
export function encodeGraph(graph: GraphData): GraphRecord {
  const { agregados, big_picture, politicas_inter_agregados, ...meta } = graph;
  const { nodos: bigNodes, aristas: bigEdges, ...bigMeta } = big_picture;
  const nodes: NodeRecord[] = (bigNodes ?? []).map(value => ({ id: value.id, parent: null, value }));
  const edges = [...(bigEdges ?? []), ...(politicas_inter_agregados ?? [])];
  const containers = (agregados ?? []).map(({ nodos, aristas, ...container }) => {
    for (const value of nodos ?? []) {
      // Membership lives in parent. A container rename must not overwrite node edits.
      const { agregado: _membership, ...rest } = value as GraphNode;
      nodes.push({ id: value.id, parent: container.id!, value: rest as GraphNode });
    }
    edges.push(...(aristas ?? []));
    return container;
  });
  return { meta, bigMeta, containers, nodes, edges: edges as GraphRecord["edges"] };
}

export function decodeGraph(record: GraphRecord): { graph: GraphData; pending: number } {
  const containers = new Map(
    (record.containers ?? []).map(c => [
      c.id!,
      { ...c, nodos: [] as GraphNode[], aristas: [] as GraphLink[] },
    ]),
  );
  const bigNodes: GraphNode[] = [],
    bigEdges: GraphLink[] = [],
    cross: GraphLink[] = [];
  const parents = new Map<string, string | null>();
  for (const [id] of containers) parents.set(id, id);
  for (const n of record.nodes ?? []) {
    parents.set(n.id, n.parent);
    const parent = n.parent && containers.get(n.parent);
    if (parent) parent.nodos.push({ ...n.value, agregado: parent.nombre_agregado });
    else bigNodes.push({ ...n.value });
  }
  let pending = 0;
  for (const edge of record.edges ?? []) {
    if (!parents.has(edge.fuente) || !parents.has(edge.destino)) {
      pending++;
      continue;
    }
    const from = parents.get(edge.fuente),
      to = parents.get(edge.destino);
    if (!from || !to) bigEdges.push(edge);
    else if (from === to && containers.has(from)) containers.get(from)!.aristas.push(edge);
    else cross.push(edge);
  }
  return {
    graph: {
      ...record.meta,
      agregados: [...containers.values()],
      big_picture: { ...record.bigMeta, nodos: bigNodes, aristas: bigEdges },
      politicas_inter_agregados: cross,
    } as GraphData,
    pending,
  };
}

export function encodeProject(project: SharedProject) {
  return {
    ...project,
    content: encodeGraph(project.content),
    customViews: project.customViews.map(view => ({
      ...view,
      ...(view.graph ? { graph: encodeGraph(view.graph) } : {}),
    })),
  };
}
export function decodeProject(encoded: ReturnType<typeof encodeProject>): {
  project: SharedProject;
  pending: number;
} {
  const model = decodeGraph(encoded.content);
  let pending = model.pending;
  const customViews = (encoded.customViews ?? []).map(view => {
    if (!view.graph) return view;
    const decoded = decodeGraph(view.graph as unknown as GraphRecord);
    pending += decoded.pending;
    return { ...view, graph: decoded.graph };
  });
  return { project: { ...encoded, content: model.graph, customViews } as SharedProject, pending };
}
